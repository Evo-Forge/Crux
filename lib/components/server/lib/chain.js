var async = require('async'),
  crux = require('../../../../index.js');
/*
* This is a route's chaining system. It is used in route chaining with then(),body(),etc
* */

var chain = function CruxRouteChain(routeName, routePath, routeMethod) {
  this.name = routeName;
  if(typeof routePath === 'string') this.path = routePath;
  if(typeof routeMethod === 'string') this.method = routeMethod;
  this.thenChain = [];
  this.mockCallback = null;
  this.__preserveArguments = false;
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
        return self.errCallback.call(currentContext, err);
      }
      if(typeof thenResult === 'object' && typeof thenResult.then === 'function' && typeof thenResult.error === 'function') {
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
        }).error(function(err) {
          chainArguments = null;
          currentThen = null;
          return self.errCallback.call(currentContext, err);
        });
      } else {
        // Otherwise, we check the data and pass it to the next then.
        if(typeof thenResult !== 'undefined' && thenResult !== currentContext) {
          if(self.__preserveArguments) {
            chainArguments.push(thenResult);
          } else {
            chainArguments = [thenResult];
          }
        }
        doThenCallback();
      }
    }
    doThenCallback();
  };
  // Function called when an error occurs in the then chain
  this.errCallback = function OnChainError(err) {
    log.debug('Crux.server: %s caught an error.',this.endpoint.__namespace + ':' + this.endpoint.name);
    if((typeof err === 'object' && err !== null) || err instanceof Error) {
      log.trace(err);
    }
    return this.error(err);
  };
};

/*
* The function will tell the current route chain to preserve all arguments that are passed from one then to another.
* This is useful when a promise has to deal with previous data from other promises.
* By default, this functionality is disabled.
* */
chain.prototype.preserveArguments = function SetPreserveArguments(bVal) {
  this.__preserveArguments = (typeof bVal === 'boolean' ? bVal : true);
  return this;
};

chain.prototype.error = function ErrorCallback(cb) {
  this.errCallback = cb;
  return this;
};

/*
 * Lazy-registering the request callback.
 * */
chain.prototype.then = function RouteThen(callCallback) {
  if(typeof callCallback === 'function') {
    this.thenChain.push(callCallback);
  }
  return this;
};

/*
* Parameter checking in url's
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

/* Add querystring dependencies to the route. */
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

/* Adding BODY dependencies to the route. */
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

/*
* Performs verifications on incoming request headers.
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


/*
 * Call a checkpoint before everything
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

/*
* This function is executed before every request validation. It is to be run synchronously and can be overridden.
* */
chain.prototype.preValidate = function PreValidation(req, done) { return done() };

/*
* This function is executed right after all previous core validations against the request data have passed, and we're on to
* the next verification (which is checkpoints). This is considered an asynchronous request and receives the "done" callback.
* */
chain.prototype.postValidate = function OnPostValidation(req, done) { done() };


/*
* Performs validations on the previously registered route restrictions and also calls a preValidate() and postValidate() function, if defined.
* Callsback with: done(ERROR_CODE, ERROR_MESSAGE, ERROR_DATA) or done() if no error.
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
        return done('URL_PARAMETERS', 'Invalid URL parameters', { param: p.name });
      }
    }
    // Querystring check
    var missingQs = [];
    for(var i=0; i < this.parameters.query.length; i++) {
      var p = this.parameters.query[i],
        isValid = p.validate(p.name, req.query);
      if(!isValid) {
        missingQs.push(p.name);
      }
    }
    if(missingQs.length !== 0) {
      return done('QUERY_PARAMETERS', "Invalid or missing querystring parameters", missingQs);
    }
    // We now check all POST parameters.
    var missingPost = [];
    for(var i=0; i < this.parameters.body.length; i++) {
      var p = this.parameters.body[i],
        isValid = p.validate(p.name, req.body);
      if(!isValid) {
        missingPost.push(p.name);
      }
    }
    if(missingPost.length !== 0) {
      return done('BODY_PARAMETERS', "Invalid or missing body parameters", missingPost);
    }
    /* Validate header data */
    var missingHeader = [];
    for(var i=0; i < this.parameters.headers.length; i++) {
      var p = this.parameters.headers[i];
      if(!p.validate(p.name, req.headers)) {
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