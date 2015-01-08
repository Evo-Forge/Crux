var Krux = require('../../../../index'),
  KruxServer = Krux.Server;

var IoRequest = require('./request');

/*
 * This is a Socket.io route that will be used in every socket io route definition file.
 * */
var SERVER = null;

var route = function SocketRoute(namespaceName, _SERVER) {
  SERVER = _SERVER;
  this.namespace = namespaceName;
  this.__endpoints = [];
};

/*
 * This is the event binding inside a route.
 * */
route.prototype.on = function OnSocketEvent(event, description) {
  var self = this,
    chain = {};
  var endpoint = {
    id: this.namespace + ":" + event,
    name: event,
    callback: null,
    description: description || null,
    params: [],
    callbackInParams: false
  };

  for(var i=0; i < this.__endpoints.length; i++) {
    if(this.__endpoints[i].namespace === event) {
      throw new Error("Socket event " + event + ' previously registered in ' + this.namespace);
    }
  }
  this.__endpoints.push(endpoint);
  // We now create our event chain.
  /*
   * We can attach a parameter requirement to when we receive our event.
   * */
  chain.param = function ParamRequirement(data) {
    if (data === null) {
      throw new Error("Socket event " + endpoint.namespace + " has invalid param requirements.");
    }
    // If our data is a function, it means that the param is a simple variable (validation function)
    if (_.isFunction(data) && _.isFunction(data.default)) {
      endpoint.params.push(data);
      return chain;
    }
    if (_.isObject(data)) {
      for(var key in data) {
        if(!_.isFunction(data[key])) {
          throw new Error('Socket event ' + endpoint.namespace + ' has an invalid param requirement: ' + key);
        }
      }
      endpoint.params.push(data);
    }
    return chain;
  };
  /*
  * This will mark the route as requiring a callback argument from the client, thus
  * guaranteeing that when we send back data, we send it to the cb
  * */
  chain.withCallback = function CallbackRequirement() {
    endpoint.callbackInParams = true;
    return chain;
  };

  /*
  * This is the chain's main callback function
  * */
  chain.then = function EventCallback(cb) {
    if(!_.isFunction(cb)) {
      throw new Error('Socket event ' + endpoint.namespace + ' requires a function for then()');
    }
    endpoint.callback = cb;
    return chain;
  };

  return chain;
};

/*
* Given a socket object, it attaches all the registered events to it.
* */
route.prototype.attachTo = function AttachToSocket(socket) {
  for(var i=0; i < this.__endpoints.length; i++) {
    var endpoint = this.__endpoints[i];
    socket.onSocketEvent(endpoint.id, this.bindEndpoint(endpoint));
  }
};
/*
* Binds a single endpoint to the socket, returning the callback function that will be called
* by the socket callback.
* */
route.prototype.bindEndpoint = function BindEndpoint(endpoint) {
  var self = this;
  return function onEvent() {
    // We first verify the incoming parameters to match our validations.
    if(arguments.length < endpoint.params.length) {
      return this.sendError(endpoint.id, 'INVALID_ARGUMENTS', 'The request is missing arguments.');
    }
    var callbackArguments = [this];
    for(var i=0; i < endpoint.params.length; i++) {
      var incArg = arguments[i.toString()],
          localArg = endpoint.params[i];
      if(_.isFunction(localArg)) {
        if(!localArg(i.toString(), arguments)) {
          return this.sendError(endpoint.id, 'INVALID_ARGUMENT', arguments[i]);
        }
      } else if(_.isObject(localArg)) {
        if(typeof incArg !== 'object' || incArg === null) {
          return this.sendError(endpoint.id, 'INVALID_ARGUMENT', arguments[i]);
        }
        for(var key in localArg) {
          if(!localArg[key](key, arguments[i.toString()])) {
            return this.sendError(endpoint.id, 'INVALID_ARGUMENT', key);
          }
        }
      }
      callbackArguments.push(incArg);
    }
    // Data parameters are valid. We now check for any callbacks.
    if(endpoint.callbackInParams) {
      var cbArg = arguments[(arguments.length-1).toString()];
      if(typeof cbArg !== 'function') {
        return this.sendError(endpoint.id, 'INVALID_ARGUMENT', 'Callback is required.');
      }
    }
    var requestObj = new IoRequest(endpoint, this);
    if(endpoint.callbackInParams) {
      requestObj.clientCb = cbArg;
    }
    requestObj.service = function GetService(name) {
      if(typeof SERVER.services[name] === 'undefined') return null;
      return SERVER.services[name];
    };
    /* Request config, relative to server */
    requestObj.getConfig = function GetConfig(field) {
      // TODO: perform inner key checks with a.b.c
      return SERVER.config['server'][field];
    };
    endpoint.callback.apply(requestObj, callbackArguments);
  };
};

route.prototype.type = KruxServer.Validations;

module.exports = route;