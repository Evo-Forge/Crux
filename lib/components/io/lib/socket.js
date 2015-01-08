//var geoip = require('geoip-lite');
var EventEmitter = require('events').EventEmitter,
    util = require('util');
/*
* This is an additional layer over the socket.io socket
* */

module.exports = function(SOCKET) {
  /*
  * Proxy wrapper over the socket.
  * */
  var socket = function IoSocket() {
    this.id = SOCKET.id;
    EventEmitter.call(this);
  };
  util.inherits(socket, EventEmitter);

  /*
  * Returns a field in the private data section set by the authorization key issuer.
  * */
  socket.prototype.get = function GetField(name) {
    if(typeof name !== 'string') return SOCKET.PRIVATE_DATA;
    if(typeof SOCKET.PRIVATE_DATA[name] === 'undefined') return null;
    return SOCKET.PRIVATE_DATA[name];
  };
  /*
  * Sets a field in the private data field.
  * */
  socket.prototype.set = function SetField(name, value) {
    if(typeof name !== 'string') return;
    if(typeof value === 'undefined' && typeof SOCKET.PRIVATE_DATA[name] !== 'undefined') {
      delete SOCKET.PRIVATE_DATA[name];
      return this;
    }
    SOCKET.PRIVATE_DATA[name] = value;
    return this;
  };

  /*
  * Sends an error event back to the client.
  * */
  socket.prototype.sendError = function SendErrorEvent(event, code, message, data) {
    var err = {
      event: (_.isString(event) ? event : 'global'),
      code: (_.isString(code) ? code : "SERVER_ERROR")
    };
    if(_.isString(message)) {
      err['message'] = message;
    }
    if(_.isObject(message)) {
      err['data'] = message;
    } else if(_.isObject(data)) {
      err['data'] = data;
    }
    return this.emitSocketEvent('error', err);
  };

  socket.prototype.onSocketEvent = function OnEvent(event, cb) {
    var self = this;
    SOCKET.on(event, function() {
      if(ENV === 'dev') {
        log.trace('Socket event: [%s] from (%s)', event, this.id);
      }
      cb.apply(self, arguments);
    });
    return this;
  };

  socket.prototype.disconnect = function DisconnectSocket() {
    if(ENV === 'dev') {
      log.trace('Disconnecting socket (%s)', this.id);
    }
    SOCKET.disconnect();
    return this;
  };

  socket.prototype.emitSocketEvent = function EmitEvent(event) {
    if(arguments['0'] === 'error') {
      arguments['0'] = 'errorEvent';
    }
    if(ENV === 'dev') {
      log.trace('Sending event: [%s] to (%s)', event, this.id);
    }
    SOCKET.emit.apply(SOCKET, arguments);
    return this;
  };

  /* Returns the socket's ip */
  socket.prototype.getIp = function GetIp() {
    return SOCKET.request.connection.remoteAddress;
  };
  /*
  * Returns the user's country
  * */
  socket.prototype.getCountry = function GetCountry() {
    var geo = geoip.lookup(this.getIp());
    if(typeof geo !== 'object' || geo === null) return null;
    if(typeof geo['country'] !== 'string') return null;
    return geo['country'].toUpperCase();
  };

  socket.prototype.destroy = function Destroy() {
    SOCKET = null;
    this.emit('destroy');
  };


  return new socket();
};