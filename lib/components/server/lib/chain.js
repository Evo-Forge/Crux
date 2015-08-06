var async = require('async'),
  _ = require('underscore'),
  crux = require('../../../../index.js');

/**
 * Both Route definitions and security checkpoints make use of crux server's chain functionality.<br/>
 * Routes use them when declaring an endpoint (route.post(), route.get(), etc) to encapsulate the endpoint's data requirements.<br/>
 * Security checkpoints use them in the same matter, thus having access to query() or body() validations of the chain.<br/>
 * Note that it is only instantiated by the {@link crux.Server.Route}, thus it is not recommended manually using it in other places.
 * @class crux.Server.Chain
 * @memberof crux.Server
 * @param {String} name - the route's name
 * @param {String} path - the route's path
 * @param {String} method - the HTTP method attached to this chain.
* */
var chain = function CruxRouteChain(routeName, routePath, routeMethod) {
  this.name = routeName;
  if(typeof routePath === 'string') this.path = routePath;
  if(typeof routeMethod === 'string') this.method = routeMethod;
  this.thenChain = [];
  this.mockCallback = null;
  this.__preserveArguments = false;
  this.__trace = true;
  this.parameters = {
    query: [],
    body: [],
    url: [],
    data: [],
    headers: []
  };
  this.checkpoints = [];
  var self = this;
  // Function called by the route when an incoming request starts and passes the validations.
  this.callback = function OnChainReached() {
    var currentThen = 0,
      currentContext = this,
      chainArguments = Array.prototype.slice.call(arguments);
    function doThenCallback() {
      if(typeof self.thenChain[currentThen] !== 'function') {
        chainArguments = null;
        currentThen = null;
        return;
      }
      var thenFn = self.thenChain[currentThen];
      currentThen++;
      try {
        var thenResult = thenFn.apply(currentContext, chainArguments);
      } catch(err) {
        chainArguments = null;
        currentThen = null;
        return self.errCallback.call(currentContext, err, (currentThen+2));
      }
      if(typeof thenResult === 'object' && typeof thenResult.then === 'function' && (typeof thenResult.error === 'function' || typeof thenResult.catch === 'function')) {
        // If we have a promise returned, we get in its then callback.
        thenResult.then(function(data) {
          if(typeof data !== 'undefined' && data !== currentContext) {
            if(self.__preserveArguments) {
              chainArguments.push(data);
            } else {
              chainArguments = [data];
            }
          }
          doThenCallback();
        });
        var onError = function(err) {
          chainArguments = null;
          currentThen = null;
          return self.errCallback.call(currentContext, err, (currentThen+2));
        };
        if(typeof thenResult.error === 'function') {
          thenResult.error(onError);
        } else {
          thenResult.catch(onError);
        }
      } else {
        // Otherwise, we check the data and pass it to the next then.
        if(typeof thenResult !== 'undefined' && thenResult !== currentContext) {
          if(self.__preserveArguments) {
            chainArguments.push(thenResult);
          } else {
            chainArguments = [thenResult];
          }
          doThenCallback();
        } else {
          // Our then chain is done.
          chainArguments = null;
          currentThen = null;
        }
      }
    }
    doThenCallback();
  };
  // Function called when an error occurs in the then chain
  this.errCallback = function OnChainError(err, currentThen) {
    log.debug('Crux.server: %s caught an error in then() number %s.', this.endpoint.__namespace + ':' + this.endpoint.name, currentThen);
    if((typeof err === 'object' && err !== null) || err instanceof Error) {
      log.trace(err);
    }
    return this.error(err);
  };
};

/**
* The function acts as a setter and will tell the current route chain to preserve all arguments that are passed from one then to another.
* This is useful when a promise has to deal with previous data from other promises.
* By default, this functionality is disabled.
 *
 * @memberof crux.Server.Chain
 * @function preserveArguments
 * @instance
 * @param {Boolean} val - enable or disable this functionality
* */
chain.prototype.preserveArguments = function SetPreserveArguments(bVal) {
  this.__preserveArguments = (typeof bVal === 'boolean' ? bVal : true);
  return this;
};

chain.prototype.error = function ErrorCallback(cb) {
  this.errCallback = cb;
  return this;
};

/**
 * Registers a function to be called in the then-chain. The functionality is similar to a promise's <b>then</b> call, but it is custom built for the chain
 *
 * @memberof crux.Server.Chain
 * @function then
 * @instance
 * @param {Function} cb - the callback function
 * */
chain.prototype.then = function RouteThen(callCallback) {
  if(typeof callCallback === 'function') {
    this.thenChain.push(callCallback);
  }
  return this;
};

/**
* Programatically disable or enable any logging on the chain.
* */
chain.prototype.trace = function SetLogging(bVal) {
  var bVal = (typeof bVal === 'boolean' ? bVal : false);
  this.__trace = bVal;
  return this;
};

/**
 * Attaches parameter requirements to the chain. That means that whenever an incoming http request is initiated and matched to a chain,
 * the router will call the chain's validate() function, which in terms will validate the registered arguments (header, body, querystring or url-parameter data).<br>
 * The syntax is {keyName} : {paramValidationCallback}
 *
 * @memberof crux.Server.Chain
 * @function param
 * @instance
 * @param {Object} data - the data to be verified if it exists in the URL parameters. It has the format of { variableName : validationCallback}
 * @example
 *  var chain = route.post('/:id/:order');
 *  chain.param({
 *    id: route.type.NUMBER.invalid('ID is required'),    // route.type.NUMBER actually returns a validation callback.
 *    order: route.type.STRING.default("asc"),
 *    customId: route.type.NUMBER.invalid('CUSTOM_ID_REQUIRED', 'The custom ID is required'),
 *    someValue: route.type.BOOLEAN
 *  });
 *
* */
chain.prototype.param = function RouteParam(paramData) {
  if(typeof paramData !== 'object' || paramData === null) {
    throw new Error("Endpoint " + this.name + " has invalid param requirements.");
  }
  for(var qs in paramData) {
    for(var i=0; i < this.parameters.url.length; i++) {
      if(this.parameters.url[i].name === qs) {
        throw new Error("Endpoint " + this.name + " has duplicated url param requirements for: " + qs);
      }
    }
    if(!_.isFunction(paramData[qs])) {
      throw new Error("Endpoint " + this.name + " registered invalid validation function for url param " + qs);
    }
    this.parameters['url'].push({
      name: qs,
      validate: paramData[qs]
    });
  }
  return this;
};

/**
* Similar to the chain's {@link crux.Server.Chain#param} functionality, it adds query-string verifications
 *
 * @memberof crux.Server.Chain
 * @function query
 * @instance
 * @param {Object} data - the query verification data to verify in the request's querystring. It has the format of { queryStringKey : validationCallback }
 * @example
 *  var chain = route.post('/');
 *  chain.query({
 *    id: route.type.NUMBER,
 *    name: route.type.STRING.default("John")
 *  });
 *  // Incoming request /account?id=q will be invalid
 *  // Incoming request of /account?id=1 will be valid with the name set to John
* */
chain.prototype.query = function RouteQuery(queryData) {
  if(typeof queryData !== 'object' || queryData === null) {
    throw new Error("Endpoint " + this.name + " has invalid query requirements.");
  }
  for(var qs in queryData) {
    for(var i=0; i < this.parameters.query.length; i++) {
      if(this.parameters.query[i].name === qs) {
        throw new Error("Endpoint " + this.name + " has duplicated query requirements for: " + qs);
      }
    }
    if(!_.isFunction(queryData[qs])) {
      throw new Error("Endpoint " + this.name + " registered invalid validation function for querystring " + qs);
    }
    this.parameters['query'].push({
      name: qs,
      validate: queryData[qs]
    });
  }
  return this;
};

/**
 * Similar to the chain's {@link crux.Server.Chain#param} functionality, it adds body data verifications
 *
 * @memberof crux.Server.Chain
 * @function body
 * @instance
 * @param {Object} data - the body verification data to verify in the request's body. It has the format of { bodyField : validationCallback }
 * @example
 *  var chain = route.post('/');
 *  chain.body({
 *    id: route.type.NUMBER,
 *    name: route.type.STRING.default("John")
 *  });
 * */
chain.prototype.body = function RouteBody(bodyData) {
  if(typeof bodyData !== 'object' || bodyData === null) {
    throw new Error("Endpoint " + this.name + " has invalid body requirements.");
  }
  for(var bd in bodyData) {
    for(var i=0; i < this.parameters.body.length; i++) {
      if(this.parameters.body[i].name === bd) {
        throw new Error("Endpoint " + this.name + " has duplicated body requirements for: " + bd);
      }
    }
    if(!_.isFunction(bodyData[bd])) {
      throw new Error("Endpoint " + this.name + " registered invalid validation function for body " + bd);
    }
    this.parameters['body'].push({
      name: bd,
      validate: bodyData[bd]
    });
  }
  return this;
};

/*
 * Because we may have encrypted data anywhere in the request, the route endpoint is not responsible
 * for decrypting the data, so it will just ask what type of data does it expect to have. The security
 * checkpoint will then verify the received data against it.
 * */
chain.prototype.data = function RouteData(bodyData) {
  if(typeof bodyData !== 'object' || bodyData === null) {
    throw new Error("Endpoint " + this.name + " has invalid data requirements.");
  }
  for(var bd in bodyData) {
    for(var i=0; i < this.parameters.data.length; i++) {
      if(this.parameters.data[i].name === bd) {
        throw new Error("Endpoint " + this.name + " has duplicated data requirements for: " + bd);
      }
    }
    if(!_.isFunction(bodyData[bd])) {
      throw new Error("Endpoint " + this.name + " registered invalid validation function for data " + bd);
    }
    this.parameters['data'].push({
      name: bd,
      validate: bodyData[bd]
    });
    return this;
  }
};

/**
* Similar to {@link crux.Server.Chain#param}, it verifies incoming http request's header data.
 *
 * @memberof crux.Server.Chain
 * @function header
 * @instance
 * @param {String|Object} obj - the verification data. If it is a string, we will set the validateFn function as its validation callback, otherwise it uses the same format as query()
 * @param {Function} [validateFn] - the validation callback to be attached to the given HTTP header name, only works when obj is a string
* */
chain.prototype.header = function HasHeaderParams(_obj, _validate) {
  var headerData = (_.isObject(_obj) ? _obj : {});
  if(_.isString(_obj)) {
    headerData[_obj] = _validate;
  }
  for(var hd in headerData) {
    if(!_.isFunction(headerData[hd])) {
      throw new Error('Security checkpoint ' + this.name + ' registered invalid validation for header data');
    }
    this.parameters.headers.push({
      name: hd.toLowerCase(),
      validate: headerData[hd]
    });
  }
  return this;
};


/**
 * This will register a checkpoint prior to the beginning of the chains' then execution. A chain may have
 * more than one checkpoint defined, that will be called in a waterfall-matter (the pass result of the first one is the first argument of the second one)<br>
 * <b>Note</b>: if the security checkpoint's name does not contain ":", it will be relative to the current namespace (since namespaces are delimited with a double-quote ":").
 *  Should double-quotes be present, we will use the security definition of the given namespace.
 * @memberof crux.Server.Chain
 * @function checkpoint
 * @instance
 * @param {String[]|String} name - the full name of the previously defined security checkpoint.
 * @example
 *  // We have a namespace called permissions, that contains a security checkpoint called admin
 *  // Current namespace is "account"
 *  var checkpointName = "permissions:admin"
 *
 *  // We define a local security checkpoint.
 *  route
 *    .security('loggedIn')
 *    .then(function() {
 *      this.pass({ id: 1, name: 'John' });
 *    });
 *  var chain = route.get('/');
 *  chain
 *    .checkpoint('loggedIn')
 *    .checkpoint(checkpointName)
 *    .then(function(account) {
 *      // At this point, the first checkpoint passed with the account object.
 *      console.log(account); // => { id: 1, name: 'John' };
 *      this.success();
 *    });
 * */
chain.prototype.checkpoint = function RouteCheckpoint(names) {
  if(typeof names !== 'string' || names === '') {
    throw new Error('Endpoint ' + this.name + ' requires .a valid checkpoint. Received: ' + names);
  }
  var split = names.split(' ');
  for(var i=0; i < split.length; i++) {
    if(split[i].indexOf(':') === -1) {
      split[i] = this.__namespace + ':' + split[i];
    }
    this.checkpoints.push(split[i]);
  }
  return this;
};

/*
 * Allowing the route to register a mock callback that can be executed while
 * in mock mode
 * */
chain.prototype.mock = function MockRequest(mockCallback) {
  if(typeof this.mockCallback === 'function') {
    throw new Error("Endpoint " + this.name + ' has already a registered mock callback.');
  }
  this.mockCallback = mockCallback;
  return this;
};

/**
* This function is executed before every request validation. It is to be run asynchronously and can be overridden.
 *
 * @memberof crux.Server.Chain
 * @function preValidate
 * @instance
 * @param {express.Request} req - the incoming express request object
 * @param {Function} onComplete(err|null) - the callback function to be called once pre-validation is complete
 *
* */
chain.prototype.preValidate = function PreValidation(req, done) { return done() };

/**
* This function is executed right after all previous core validations against the request data have passed, and we're on to
* the next verification (which is checkpoints). This is considered an asynchronous request and receives the "done" callback.
 *
 * @memberof crux.Server.Chain
 * @function postValidate
 * @instance
 * @param {express.Request} req - the incoming express request object
 * @param {Function} onComplete(err|null) - the callback function to be called once post-validation is complete.
* */
chain.prototype.postValidate = function OnPostValidation(req, done) { done() };


/**
* Performs validations on the previously registered route restrictions and also calls a preValidate() and postValidate() function, if defined.<br>
* Calls back with: done(ERROR_CODE, ERROR_MESSAGE, ERROR_DATA) or done() if no error.<br>
* <b>Note</b>: The request verification and validation cycle is as follows:<br/>
 * 1. Verify incoming data previously-defined as requested in the chain (query, body, post, url data)<br/>
 * 2. Once data validation is complete, we proceed to perform checkpoint validation.<br/>
 *  2.1. Call all the route-level checkpoints in the order of their definition<br/>
 *  2.2. Call all the chain-level checkpoints in the order of their definition<br/>
 * 3. Start the chain's <b>then</b> callback cycle.<br/>
 *
 * @memberof crux.Server.Chain
 * @function validate
 * @instance
 * @param {express.Request} req - the incoming express request object
 * @param {Function} done - the callback function to be called once validation is complete.
* */
chain.prototype.validate = function ValidateRequirements(req, done) {
  this.preValidate(req, function(err) {
    if(err) return done(err);
    // URL param check
    for(var i=0; i < this.parameters.url.length; i++) {
      var p = this.parameters.url[i],
        check = {};
      check[p.name] = req.param(p.name);
      if(!p.validate(p.name, check)) {
        var customErr = p.validate.error;
        if(customErr) {
          return done(customErr.code, customErr.message)
        }
        return done('URL_PARAMETERS', 'Invalid URL parameters', { param: p.name });
      }
      req.params[p.name] = check[p.name];
    }
    // Querystring check
    var missingQs = [];
    for(var i=0; i < this.parameters.query.length; i++) {
      var p = this.parameters.query[i],
        isValid = p.validate(p.name, req.query);
      if(!isValid) {
        var customErr = p.validate.error;
        if(customErr) {
          return done(customErr.code, customErr.message)
        }
        missingQs.push(p.name);
      }
    }
    if(missingQs.length !== 0) {
      return done('QUERY_PARAMETERS', "Invalid or missing querystring parameters", missingQs);
    }
    // Post data check
    var missingPost = [];
    for(var i=0; i < this.parameters.body.length; i++) {
      var p = this.parameters.body[i],
        isValid = p.validate(p.name, req.body);
      if(!isValid) {
        var customErr = p.validate.error;
        if(customErr) {
          return done(customErr.code, customErr.message)
        }
        missingPost.push(p.name)
      }
    }
    if(missingPost.length !== 0) {
      return done('BODY_PARAMETERS', "Invalid or missing body parameters", missingPost);
    }

    // Headers check
    var missingHeader = [];
    for(var i=0; i < this.parameters.headers.length; i++) {
      var p = this.parameters.headers[i];
      if(!p.validate(p.name.toLowerCase(), req.headers)) {
        var customErr = p.validate.error;
        if(customErr) {
          return done(customErr.code, customErr.message)
        }
        missingHeader.push(p.name);
      }
    }
    if(missingHeader.length !== 0) {
      return done('HEADER_PARAMETERS', 'Invalid or missing header parameters', missingHeader);
    }
    this.postValidate(req, done);
  }.bind(this));
};

module.exports = chain;