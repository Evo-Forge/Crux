/*
* This is the route model, responsible for allowing the project's routes to register themselves and methods of it.
* Arguments
*   @app - the Express application reference.
*   @namespace - the default route namespace relative to the routes/ folder, delimited by a dot. (ex: landing/login.js -> landing.login)
* */
var async = require('async'),
  _ = require('underscore'),
  util = require('util'),
  Validations = require('./validations'),
  HttpRequest = require('./request'),
  RouteChain = require('./chain'),
  Promise = require('./promise');

function CruxServerRoute() {
  var ENDPOINT_COUNTER = 0,
    isBinded = false,
    SERVER = null,  // A reference to our HttpServer object
    APP = null;   // A reference to our Express app object.

  /**
   * The Crux Server Route encapsulates data about a single route definition file. In crux, a route contains functionality that is similar
   * or is logically grouped by a criteria. As an example, the "Account" route contains the "update" and "create" endpoints, both of whici
   * make use of the Account model and performs actions on it.<br>
   * The route definition file is responsible of creating the HTTP endpoints and defining their structure.
   *
   * @class crux.Server.Route
   * @memberof crux.Server
   * @example
   *  // We will define a basic Account route. This is the content of routes/account.js
   *  module.exports = function(route) {
   *    // When first created, the routes's base HTTP path is /account
   *    route.namespace('account'); // this will set the routes's namespace.
   *    // If we want to change the base path, we will call root() that will change the default route HTTP path
   *    route.root('/api/account');
   *
   *    // We are going to define the Account create endpoint
   *    route
   *      .post('/', 'Creates an account')  // Calling post(), put(), get() or delete() will return an instance of {@link crux.Server.Chain}
   *      .body({ // We define the pre-requisites for this route to be called.
   *        name: route.type.STRING,
   *        age: route.type.NUMBER.default(13),
   *        theme: route.type.ENUM('light', 'dark')
   *      })
   *      .then(function() {
   *        // Calling this.body() will return the safe body data.
   *        var accountData = this.body();
   *        console.log("Hello %s", this.body("name"));
   *        this.success(); // this will end the HTTP request with a success JSON
   *      });
   *
   *      // We now define a get endpoint
   *    route
   *      .get('/:id', 'Get an account')
   *      .param({
   *        id: route.type.NUMBER
   *      })
   *      .query({
   *        sort: route.type.STRING.default("asc")
   *      })
   *      .then(function() {
   *        // do stuff with our account.
   *        // OOps, we have an error
   *        this.error('ERROR_CODE', 'Error description');
   *      });
   *  };
   * */
  var HttpRoute = function HttpRoute(httpServer, namespace, _DEBUG, _basePath) {
    APP = httpServer.app;
    SERVER = httpServer;
    this.__checkpoints = [];    // a string with space delimited of namespace-level checkpoints
    this.__namespace = namespace;
    this.__rootPath = setRootPath(this.__namespace, _basePath);
    this.__endpoints = {};  //a hash of {method, path, name, callback} for previously registered endpoints.
    this.__debug = _DEBUG;
  };

  /**
  * Each HTTP Route will be decorated with Crux's validations under type
  * @memberof crux.Server.Route
  * @name crux.Server.Route.type
  * @prop {crux.Server.Validations} type
  * */
  HttpRoute.prototype.type = Validations.types;

  /**
   * This acts as a setter and overrides the default routes' namespace.
   * NOTE:
   * We only update the rootPath when we explicitly set the namespace.
   * @memberof crux.Server.Route
   * @function namespace
   * @param {String} ns - the namespace we want to set to the route. By default, namespaces are created dynamically, based on the file path structure
   * @param {Boolean} [updateRoot=false] - should we also update the root path of the module based on this namespace.
   *
   * */
  HttpRoute.prototype.namespace = function SetNamespace(ns, shouldUpdateRoot) {
    if(typeof ns !== 'string') {
      throw new Error("Namespace is required.");
    }
    this.__namespace = ns.replace(/\//g, ".");
    if(typeof shouldUpdateRoot === 'undefined' || shouldUpdateRoot) {
      this.__rootPath = setRootPath(this.__namespace);
    }

    return this;
  };
  /**
  * Manually overrides the root path to the current route. When manually overriding the root path of
   * a given route, it will be relative to the crux Server's base path.
   *
   * @memberof crux.Server.Route
   * @function root
   * @param {String} path - the root path to set.
  * */
  HttpRoute.prototype.root = function SetRootPath(p) {
    this.__rootPath = p;
    return this;
  };

  var setRootPath = function SetRootPath(namespace, _basePath) {
    var root = namespace.replace(/\./g, "/");
    if(typeof _basePath === 'string' && _basePath !== '') {
      if(_basePath.charAt(0) === '/') _basePath = _basePath.substr(1);
      if(_basePath.charAt(_basePath.length-1) !== '/') _basePath += '/';
      if(root.charAt(0) === '/') root = root.substr(1);
      root = _basePath + root;
    }
    return root;
  };

  /**
  * Registers a security checkpoint that can be used in this or any other routes.
   * Once a security checkpoint is registered in a route, it can be accessible in any other routes
   * via [namespace].[securityName] via the checkpoint() functionality.<br/>
   * Route security functions can be viewed as middleware executed prior to the actual endpoint function and may
   * perform various checks against data and security.<br>
   *   <b>Note</b>: each security point will be decorated with two functions in their <b>this</b> context:<br/>
   *   this.<b>pass(result)</b> - passes the security checkpoint with the given data.<br/>
   *   this.<b>fail([errorCode, errorMessage] or [Error])</b> - marks this checkpoint as failed and halts the middleware chain execution.
   *   @memberof crux.Server.Route
   *   @function middleware
   *   @param {String} name - the security's name. This will be used when called by other routes via checkpoint
   *   @param {Function} [callback] - The callback that will be used when a checkpoint is called. This can also be set via the <b>then</b> function of the chain.
   *   @returns {crux.Server.Chain}
  * */
  HttpRoute.prototype.security = function RegisterSecurity(name) {
    log.warn('Crux.server: Route.security() has been deprecated, use middleware() in stead [%s]', name);
    return this.middleware.apply(this, arguments);
  };

  HttpRoute.prototype.middleware = function RegisterSecurity(name, callback) {
    // We create a chain for our checkpoint
    var self = this;
    /* Require url param data. */
    var chain = new RouteChain(name, undefined, undefined, SERVER);
    chain.preserveArguments();
    chain.__namespace = this.__namespace;
    if(typeof callback === 'function') chain.then(callback);

    var securityCallback = function SecurityChainCallback() {
      var _arg = arguments,
        _context = this;
      if(chain.callback === null) {
        return this.fail('INVALID_SECURITY_RULE', 'Failed to execute security route ' + name + ' as it has no callback attached.');
      }
      // We now validate the chain.
      chain.validate(this.req, function(errorCode, errorMessage, errorData) {
        if(errorCode) {
          return _context.fail(errorCode, errorMessage || 'Invalid arguments', (self.__debug ? errorData || null : null));
        }
        return chain.callback.apply(_context, _arg);
      });
    };
    SERVER.setCheckpoint(this.__namespace + ":" + name, securityCallback);
    return chain;
  };

  /**
  * This will register a checkpoint at the route-level. That means that the given security checkpoint will be called
   * before every single endpoint in the route. This can be useful when implementing access-controll over specific resources, rather
   * than calling checkpoint() on every endpoint, we call it once at the route level and applies to all the route's endpoints.
   * @memberof crux.Server.Route
   * @function checkpoint
   * @param {String[]} names - the security checkpoint's fully qualified name (namespace+name) or an array of these items.
   * @param {Function} inlineMiddleware - if specified, we will automatically register the checkpoint as a middleware to the chain.
  * */
  HttpRoute.prototype.checkpoint = function NamespaceCheckpoint(names, inlineMiddleware) {
    // We inline-register this and add the middleware.
    if(typeof names === 'string' && typeof inlineMiddleware === 'function') {
      this.middleware(names, inlineMiddleware);
      this.__checkpoints.push(this.__namespace + ':' + names);
      return this;
    }
    var split = names.split(' ');
    if(split.length === 0) return;
    for(var i=0; i < split.length; i++) {
      var checkpoint = split[i].trim();
      if(checkpoint.indexOf(':') === -1) {
        checkpoint = this.__namespace + ':' + checkpoint;
      }
      this.__checkpoints.push(checkpoint);
    }
    return this;
  };


  /**
  * The function will bind all the registered endpoints to the express app, thus calling app.get(path, callback), etc.<br>
   * Note that this is an internal function that should not be overridden.
   * @memberof crux.Server.Route
   * @function bind
   *
  * */
  HttpRoute.prototype.bind = function Bind() {
    var self = this;
    if(isBinded) return;
    _.forEach(this.__endpoints, function(endpoint) {
      endpoint.name = endpoint.name.replace(endpoint.method + ":", "");
      var httpPath = buildPath(self.__rootPath, endpoint.path);
      if(endpoint.name.indexOf('..') !== -1) {
        endpoint.name = endpoint.name.replace('..','');
      }
      if(endpoint.name === '.' || endpoint.name === '') {
        endpoint.name = 'index';
      } else if(endpoint.name.charAt(0) === '.') {
        endpoint.name = endpoint.name.substr(1);
      }
      endpoint.name = endpoint.name.replace(/:/g, '');  // we remove the :key and set just key
      if(!_.isFunction(endpoint.callback)) {
        throw new Error("Invalid route callback for endpoint " + endpoint);
      }
      // We build up the endpoint's ID (namespace + name.
      var endpointId = "";
      if(endpoint.__namespace !== '') {
        endpointId += endpoint.__namespace + ':';
      }
      endpointId += endpoint.name;
      endpoint.id = endpointId; // NOTE: this id is not meant to be unique, if you have POST /home and GET /home, both endpoints will have the same ID.
      APP[endpoint.method](httpPath, function(req, res) {
        self.__bindEndpoint(endpoint, req, res, httpPath);
      });
      if(SERVER.config.request.mocking !== true) return;
      /*
      * We now create the mocking endpoints for the current endpoint,
      * if it has used the mock() function.
      * */
      var mockRootPath = SERVER.config.request.mockPath;
      if(mockRootPath.indexOf("/") !== 0) {
        mockRootPath = "/" + mockRootPath;
      }
      if(mockRootPath.lastIndexOf("/") === mockRootPath.length-1) {
        mockRootPath = mockRootPath.substr(0, mockRootPath.length-1);
      }
      var httpMockPath = mockRootPath + httpPath;
      APP[endpoint.method](httpMockPath, function(req, res) {
        if(typeof endpoint['mockCallback'] !== 'function') {
          return res.json({
            type: 'error',
            code: 'MOCK_MISSING',
            message: 'This endpoint does not provide mock data.'
          });
        }
        self.__bindEndpoint(endpoint, req, res, httpMockPath, "mockCallback");
      });
    });
    isBinded = true;
  };

  /**
  * Creates a route context (using {@link crux.Server.Request} that will be accessible through this., under every route.<br>
   * This is part of the route's internal functionality.
   * @memberof crux.Server.Route
   * @function createContext
   * @param {express.Request} req - the request object
   * @param {express.Response} res - the response object
   * @param {String} path - the HTTP path to be created with.
  * */
  HttpRoute.prototype.createContext = function CreateRouteContext(req, res, path) {
    var requestObj = new HttpRequest(req, res, path, SERVER),
      self = this;
    /* Security checkpoint */
    requestObj.checkpoint = bindCheckpoint.call(self, requestObj);
    requestObj.config = this.config;

    return requestObj;
  };

  /*
  * Binds the security checkpoint on the request context.
  * */
  var bindCheckpoint = function BindSecurityCheckpoint(requestObj) {
    var self = this;
    return function SecurityCheckpoint(names, _callbackArgs, _preserveArguments) {
      var promiseObj = new Promise(function() {
        var checks = (_.isString(names) ? names.split(" ") :
                     (_.isArray(names) ? names : [])),
          checkpointCallbackArgs,
          asyncCalls = [];
        if(typeof _callbackArgs === 'undefined') {
          checkpointCallbackArgs = [];
        } else {
          if(_callbackArgs instanceof Array) {
            checkpointCallbackArgs = _callbackArgs;
          } else {
            checkpointCallbackArgs = [_callbackArgs];
          }
        }
        checks.forEach(function(checkpointName) {
          if(checkpointName.indexOf(":") === -1) {
            checkpointName = self.__namespace + ":" + checkpointName;
          }
          var checkpointCallback = SERVER.getCheckpoint(checkpointName),
            isComplete = false;
          if(!_.isFunction(checkpointCallback)) {
            //throw new Error("Security checkpoint " + checkpointName + " was not found.");
          }
          asyncCalls.push(function(asyncDone) {
            var shouldLog = false;
            requestObj.logging = function EnableDisableLog(i) {
              shouldLog =(i ? true : false);
            };
            /* We now add the FAIL function to security checks */
            requestObj.fail = function FailCheckpoint(code, message, data) {
              if(isComplete) return;
              isComplete = true;
              var err = null,
                originalErr;
              if(code instanceof Error) {
                err = code;
                originalErr = err;
              } else {
                err = new Error("SECURITY_ERROR");
                err.code = (_.isString(code) ? code : 'SECURITY_ERROR');
                err.message = message;
              }
              err.checkpoint = checkpointName;
              if(code instanceof Error && !(_.isString(code.code))) {
                err.code = 'SERVER_ERROR';
                err.message = 'An internal error occurred.';
                err.stack = code.stack;
              } else if(_.isObject(code) && _.isString(code.code) && _.isString(code.message)) {
                err.code = code.code;
                err.message = code.message;
                if(_.isObject(code.data)) {
                  err.data = data;
                }
              } else {
                err.code = (_.isString(code) ? code : 'SECURITY_ERROR');
                err.message = message;
                if(data) err.data = data;
              }
              if(self.__debug && shouldLog) {
                log.trace("Security fail for checkpoint %s: [%s] (%s:%s)", checkpointName, err.code, self.__namespace, requestObj.name);
                if(originalErr) {
                  log.debug(originalErr);
                }
              }
              asyncDone(err);
            };

            /* We now add the PASS function to security checks. */
            requestObj.pass = function PassCheckpoint() {
              if(isComplete) return;
              isComplete = true;
              var _datas = Array.prototype.slice.call(arguments);
              if(_preserveArguments === true) {
                checkpointCallbackArgs = checkpointCallbackArgs.concat(_datas);
              } else {
                checkpointCallbackArgs = _datas;
              }
              asyncDone(null);
            };
            try {
              checkpointCallback.apply(requestObj, checkpointCallbackArgs);
            } catch(e) {
              asyncDone(e);
            }
          });
        });
        async.series(asyncCalls, function(err) {
          asyncCalls = null;
          requestObj['fail'] = null;
          requestObj['pass'] = null;
          /* In case we have an error, we check if we have any checkpoint callback */
          if(err) {
            return promiseObj.fail(err);
          }
          promiseObj.fulfill(checkpointCallbackArgs);
        });
      }, requestObj);
      promiseObj.noError(function(err) {
        // If we do not have an error callback, we end the request.
        return requestObj.error(err.code, err.message, err.data);
      });
      return promiseObj;
    }
  };

  /*
   * Binds a single route callback and ataches everything to it.
   * */
  HttpRoute.prototype.__bindEndpoint = function BindHttpEndpoint(endpoint, req, res, httpPath, _routeCallbackName) {
    var routeCallbackName = (_.isString(_routeCallbackName) ? _routeCallbackName : "callback");
    // First thing we do, we validate the query/body data, if any
    // Validate query string.
    req.___routeName = this.__namespace + ":" + endpoint.path;
    var routeContext = this.createContext(req, res, httpPath, endpoint);
    routeContext.name = endpoint.name;
    routeContext.description = endpoint.description;
    routeContext.namespace = this.__namespace;
    routeContext.endpoint = endpoint;
    SERVER.requestStart(endpoint, routeContext);
    // We now perform basic endpoint validations. Note that mocked paths will not be validated.
    if(_routeCallbackName === 'mockCallback') {
      return endpoint[routeCallbackName].call(routeContext);
    }

    endpoint.validate(req, function(errorCode, errorMessage, errorData) {
      if(errorCode) {
        return routeContext.error(errorCode, errorMessage || 'Invalid arguments', (this.__debug ? errorData || null : null));
      }
      // We now place all the URL-parameters in the call arguments.
      var callArguments = [];
      _.forEach(req.params, function(paramName) {
        callArguments.push(req.params[paramName]);
      });
      var allCheckpoints = [];
      if(this.__checkpoints.length !== 0) {
        for(var i=0; i < this.__checkpoints.length; i++) {
          allCheckpoints.push(this.__checkpoints[i]);
        }
      }
      if(endpoint.checkpoints.length !== 0) {
        for(var i=0; i < endpoint.checkpoints.length; i++) {
          allCheckpoints.push(endpoint.checkpoints[i]);
        }
      }

      if(allCheckpoints.length === 0) {
        return endpoint[routeCallbackName].apply(routeContext, callArguments);
      }
      // We now take any checkpoints and execute them.
      routeContext.checkpoint(allCheckpoints, undefined, true).then(function() {
        callArguments = callArguments.concat(_.values(arguments));
        try {
          endpoint[routeCallbackName].apply(routeContext, callArguments);
        } catch(e) {
          log.warn(e);
          routeContext.error('SERVER_ERROR', 'An unexpected error occurred.');
        }
      }).error(function(err) {
        routeContext.error(err);
      });
    }.bind(this));
  };

  /*
  * Builds up the HTTP path, based on our endpoint and the given path.
  * */
  var buildPath = function BuildHttpPath(root, path) {
    var httpPath = (root + path).replace(/\/\//g, "/");
    if(httpPath[0] !== '/') {
      httpPath = "/" + httpPath;
    }
    if(httpPath !== "/" && httpPath.charAt(httpPath.length-1) === "/") {
      return httpPath.substr(0, httpPath.length-1);
    }
    // We allow a single back-level in the HTTP route creation (api/domain../domains becoms api/domains)
    if(path.indexOf('..') === 0) {
      var split = httpPath.split('/'),
        newPath = '';
      for(var i=0; i < split.length; i++) {
        if(split[i] === '') continue;
        if(split[i].indexOf('..') !== -1 && typeof split[i] === 'string') {
          split[i] = split[i+1];
          split[i+1] = '';
        }
        newPath += '/' + split[i];
      }
      httpPath = newPath;
    }
    return httpPath;
  };

  /*
   * Registers the GET/POST/PUT/DELETE methods.
   * */
  var registerEndpoint = function RegisterEndpoint(method, path, _desc, _callback) {
    if(!_.isString(path)) {
      throw new Error("Invalid path for " + path + " (" + method + ")");
    }
    var desc = (typeof _desc === 'string' ? _desc : null),
      callback = (typeof _desc === 'function' ? _desc : (typeof _callback === 'function' ? _callback : null));
    var name = method + ":" + path.replace(/\//g, '.');
    if(name.charAt(0) === '.') name = name.substr(1);
    if(typeof this.__endpoints[name] !== 'undefined') {
      throw new Error("Previously registered endpoint " + path + " in namespace "+ this.__namespace + "(" + method + ")");
    }
    ENDPOINT_COUNTER++;
    var endpointChain = new RouteChain(name, path, method, SERVER);
    endpointChain.__namespace = this.__namespace;
    if(desc) endpointChain['desc'] = desc;
    if(callback) endpointChain.then(callback);
    this.__endpoints[name] = endpointChain;
    /* We allow route chaining of utility functions. After a route endpoint has been created,
     * we can attach additional data / utility functions to it. */
    return endpointChain;
  };

  /**
  *  Registers a <b>GET</b> endpoint to the current route.
   *  @memberof crux.Server.Route
   *  @function get
   *  @param {String} path - the endpoint's path, relative to the route's rootPath
   *  @param {String} name - the endpoint's name or description, useful for self-documenting
   *  @returns {crux.Route.Chain}
  * */
  HttpRoute.prototype.get = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'get', path, _name, _callback);
  };
  /**
   *  Registers a <b>POST</b> endpoint to the current route.
   *  @memberof crux.Server.Route
   *  @function post
   *  @param {String} path - the endpoint's path, relative to the route's rootPath
   *  @param {String} name - the endpoint's name or description, useful for self-documenting
   *  @returns {crux.Route.Chain}
   * */
  HttpRoute.prototype.post = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'post', path, _name, _callback);
  };
  /**
   *  Registers a <b>PUT</b> endpoint to the current route.
   *  @memberof crux.Server.Route
   *  @function put
   *  @param {String} path - the endpoint's path, relative to the route's rootPath
   *  @param {String} name - the endpoint's name or description, useful for self-documenting
   *  @returns {crux.Route.Chain}
   * */
  HttpRoute.prototype.put = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'put', path, _name, _callback);
  };
  /**
   *  Registers a <b>DELETE</b> endpoint to the current route.
   *  @memberof crux.Server.Route
   *  @function delete
   *  @param {String} path - the endpoint's path, relative to the route's rootPath
   *  @param {String} name - the endpoint's name or description, useful for self-documenting
   *  @returns {crux.Route.Chain}
   * */
  HttpRoute.prototype.delete = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'delete', path, _name, _callback);
  };
  /**
   *  Registers a <b>HEAD</b> endpoint to the current route.
   *  @memberof crux.Server.Route
   *  @function delete
   *  @param {String} path - the endpoint's path, relative to the route's rootPath
   *  @param {String} name - the endpoint's name or description, useful for self-documenting
   *  @returns {crux.Route.Chain}
   * */
  HttpRoute.prototype.head = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'head', path, _name, _callback);
  };
  return HttpRoute;
}

var ExtendedRoute = null,
  ExtendedWith = null;

module.exports = {
  create: function CreateRoute(a,b,c,d,e,f,g) {
    var RouteModel = CruxServerRoute();
    // We now extend the functionality.
    if(ExtendedWith !== null) {
      for(var fName in ExtendedWith.prototype) {
        if(typeof RouteModel.prototype[fName] !== 'undefined') {
          RouteModel.prototype[fName + '_'] = RouteModel.prototype[fName];
        }
        RouteModel.prototype[fName] = ExtendedWith.prototype[fName];
      }
    }
    var routeObj = new RouteModel(a,b,c,d,e,f,g);
    if(ExtendedWith !== null) {
      ExtendedWith.call(routeObj);
    }
    return routeObj;
  },
  expose: function ExposeRoute() {
    // When we expose our route prototype, we need to basically create a http route prototype.
    if(ExtendedRoute === null) {
      ExtendedRoute = CruxServerRoute();
    }
    ExtendedRoute.extends = function ExtendWithOverrides(targetRoute) {
      ExtendedWith = targetRoute;
    };
    return ExtendedRoute;
  }
};
