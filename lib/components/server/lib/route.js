/*
* This is the route model, responsible for allowing the project's routes to register themselves and methods of it.
* Arguments
*   @app - the Express application reference.
*   @namespace - the default route namespace relative to the routes/ folder, delimited by a dot. (ex: landing/login.js -> landing.login)
* */
var async = require('async'),
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

  var HttpRoute = function HttpRoute(httpServer, namespace, _DEBUG) {
    APP = httpServer.app;
    SERVER = httpServer;
    this.__checkpoints = [];    // a string with space delimited of namespace-level checkpoints
    this.__namespace = namespace;
    this.__rootPath = setRootPath(this.__namespace);
    this.__endpoints = {};  //a hash of {method, path, name, callback} for previously registered endpoints.
    this.__debug = _DEBUG;
  };

  HttpRoute.prototype.type = Validations.types;

  /*
   * Overrides the default routes' namespace.
   * NOTE:
   * We only update the rootPath when we explicitly set the namespace.
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
  /*
  * Manually overrides the root path to the current route.
  * */
  HttpRoute.prototype.root = function SetRootPath(p) {
    this.__rootPath = p;
    return this;
  };

  var setRootPath = function SetRootPath(namespace) {
    return namespace.replace(/\./g, "/");
  };

  /*
  * Registers a security checkpoint that can be used in this or any other routes.
  * */
  HttpRoute.prototype.security = function RegisterSecurity(name, callback) {
    // We create a chain for our checkpoint
    var self = this;
    /* Require url param data. */

    var chain = new RouteChain(name);
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

  /*
  * Registers a checkpoint to the route namespace level
  * */
  HttpRoute.prototype.checkpoint = function NamespaceCheckpoint(names) {
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


  /*
  * The function will bind all the previously registered endpoints to the express app.
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
        endpoint.name = '/';
      } else if(endpoint.name.charAt(0) === '.') {
        endpoint.name = endpoint.name.substr(1);
      }
      if(!_.isFunction(endpoint.callback)) {
        throw new Error("Invalid route callback for endpoint " + endpoint);
      }
      APP[endpoint.method](httpPath, function(req, res) {
        bindEndpoint.call(self, endpoint, req, res, httpPath);
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
        bindEndpoint.call(self, endpoint, req, res, httpMockPath, "mockCallback");
      });
    });
    isBinded = true;
  };

  /*
  * Creates a route context that will be accessible through this., under every route
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
    return function SecurityCheckpoint(names) {
      var promiseObj = new Promise(function() {
        var checks = (_.isString(names) ? names.split(" ") :
                     (_.isArray(names) ? names : [])),
          checkpointCallbackArgs = [],
          asyncCalls = [];

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
            /* We now add the FAIL function to security checks */
            requestObj.fail = function FailCheckpoint(code, message, data) {
              if(isComplete) return;
              isComplete = true;
              if(self.__debug) {
                log.trace("Security fail for checkpoint %s (%s:%s)", checkpointName, self.__namespace, requestObj.name);
              }
              var err;
              if(code instanceof Error) {
                err = code;
              } else {
                err = new Error("SECURITY_ERROR");
                err.code = (_.isString(code) ? code : 'SECURITY_ERROR');
                err.message = message;
              }
              err.checkpoint = checkpointName;
              // If we have an error by any chance, it means it is a server error.
              if(_.isSqlError(code)) {
                log.debug(code.stack);
              }
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
              asyncDone(err);
            };

            /* We now add the PASS function to security checks. */
            requestObj.pass = function PassCheckpoint() {
              if(isComplete) return;
              isComplete = true;
              var _datas = Array.prototype.slice.call(arguments);
              checkpointCallbackArgs = checkpointCallbackArgs.concat(_datas);
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
          delete requestObj['fail'];
          delete requestObj['pass'];
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
  var bindEndpoint = function BindHttpEndpoint(endpoint, req, res, httpPath, _routeCallbackName) {
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
    // We now perform basic endpoint validations.

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
      routeContext.checkpoint(allCheckpoints).then(function() {
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
    var endpointChain = new RouteChain(name, path, method);
    endpointChain.__namespace = this.__namespace;
    if(desc) endpointChain['desc'] = desc;
    if(callback) endpointChain.then(callback);
    this.__endpoints[name] = endpointChain;
    /* We allow route chaining of utility functions. After a route endpoint has been created,
     * we can attach additional data / utility functions to it. */
    return endpointChain;
  };

  HttpRoute.prototype.get = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'get', path, _name, _callback);
  };
  HttpRoute.prototype.post = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'post', path, _name, _callback);
  };
  HttpRoute.prototype.put = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'put', path, _name, _callback);
  };
  HttpRoute.prototype.delete = function RegisterGet(path, _name, _callback) {
    return registerEndpoint.call(this, 'delete', path, _name, _callback);
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
