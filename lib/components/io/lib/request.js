/*
* This is an event request class, encapsulating an event's context
* */

var request = function EventRequestIo(endpoint, socketObj) {
  this.requestId = UniqueId(24);
  this.clientCb = null;
  this.__socket = socketObj;
  this.event = endpoint.id;
  this.__ended = false;
};

/*
 * Proxy request over this.service('db').Model()
 * */
request.prototype.model = function GetModel(name) {
  return this.service('db').Model(name.toLowerCase());
};
/*
 * Function will return the given service name. Defined in route.js
 * */
request.prototype.service = function GetService(){};

/*
* If a client callback was attached to the request, we call it with the given data.
* */
request.prototype.success = function SendSuccess(_data) {
  if(this.__ended || typeof this.clientCb !== 'function') return this;
  var pack = {
    request_id: this.requestId,
    type: 'success'
  };
  if(typeof _data !== 'undefined') {
    pack['data'] = _data;
  }
  this.clientCb(pack);
  this.destroy();
};

/*
* Sends back an error event. If we have a client callback attached to the request,
* we use it, otherwise we send a generic error message.
* */
request.prototype.error = function SendError(_code, _message, _data) {
  if(this.__ended) return this;
  if(typeof _code === 'object' && _code !== null) {
    _message = _code.message;
    _data = _code.data;
    if(_.isString(_code.code)) {
      _code = _code.code;
    }
    if(_code instanceof Error) {
      log.debug(_code.stack);
    }
  }
  // If we have a client cb
  if(_.isFunction(this.clientCb)) {
    var pack = {
      request_id: this.requestId,
      type: 'error',
      code: (_.isString(_code) ? _code : 'SERVER_ERROR')
    };
    if(_.isString(_message)) {
      pack['message'] = _message;
    }
    if(typeof _data !== 'undefined') {
      pack['data'] = _data;
    }
    this.clientCb(pack);
  } else {
    // If we don't have a client callback, we send a generic error event.
    this.socket.sendError(this.event, _code, _message, _data);
  }
  this.destroy();
};

/*
* once we've sent a response to the user, we destroy the request object.
* */
request.prototype.destroy = function Destroy() {
  delete this.__socket;
  delete this.clientCb;
  this.__ended = true;
};


module.exports = request;