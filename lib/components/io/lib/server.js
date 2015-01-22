var IoServer = require('socket.io'),
    IoRoute = require('./route.js'),
    IoSocket = require('./socket.js');

ROUTE_PATH = global.PROJECT_CONFIG.server.path.socket;

var SERVER = null,
    KEY_AVAILABILITY = 30000, // authorization keys are available 30 seconds
    SOCKET_TIMEOUT = 5000;   // The timeout before we disconnect a socket that was not authorized.

/*
 * This is the Socket.io server representation
 * */
var server = function SocketIoServer(config, httpServerObj) {
  SERVER = httpServerObj;
  this.io = null;
  this.config = config;
  this.clients = {};      // a hash of clientid:socket
  this.authorizationKeys = {};  // a hash of connection keys generated to be used by clients.
  this.__routes = [];   // a hash of routename:routeObject
  this.__binded = false;
  LoadRoutes.call(this);
};

/*
* Generates an authorization key for a user to use to connect to socket.io
* keyData - contains additional information attached to the key. Object
* */
server.prototype.key = function GenerateKey(keyData) {
  var key = UniqueId(32);
  while(typeof this.authorizationKeys[key] !== 'undefined') {
    key = UniqueId(32);
  }
  this.authorizationKeys[key] = {
    ts: new Date().getTime(),
    data: (typeof keyData === 'object' ? keyData : null)
  };
  return key;
};

server.prototype.bind = function Bind(done) {
  if(this.__binded) {
    return done();
  }
  return BindServer.apply(this, arguments);
};

/*
 * Binds an incomming socket and captures all our registered events.
 * */
server.prototype.bindSocket = function BindSocket(socket) {
  var socketObj = IoSocket(socket);
  this.clients[socket.id] = socketObj;
  for(var i=0; i < this.__routes.length; i++) {
    this.__routes[i].attachTo(socketObj);
  }
};

/*
* Returns a socket.io client on the current server.
* */
server.prototype.getClient = function GetSocketIoClient(socketId) {
  if(typeof this.clients[socketId] === 'undefined') return null;
  return this.clients[socketId];
};

/*
* Authorization checks / timeouts for sockets.
* */
server.prototype.onConnect = function OnSocketConnect(socket) {
  var self = this,
      isAuthorized = false,
      disconnectTimeout = setTimeout(function() {
        socket.disconnect();
      }, SOCKET_TIMEOUT);
  socket.on('auth', function(key, authCallback) {
    clearTimeout(disconnectTimeout);
    if(!_.isString(key) || key === '' || !_.isFunction(authCallback)) {
      return socket.disconnect();
    }
    isAuthorized = self.authorizeSocket(socket, key);
    if(!isAuthorized) {
      authCallback('AUTHORIZATION_ERROR');
      return socket.disconnect();
    }
    self.bindSocket(socket);
    authCallback();
  }).on('disconnect', function() {
    if(!isAuthorized) {
      return clearTimeout(disconnectTimeout);
    }
    return self.onDisconnect(socket);
  });
};

/*
* The function is called whenever a previously authorized socket gets disconnected.
* */
server.prototype.onDisconnect = function OnDisconnect(socket) {
  if(typeof this.clients[socket.id] === 'undefined') return;
  this.clients[socket.id].destroy();
  delete this.clients[socket.id];
};

/*
* The function tries to authorize the socket by comparing the key it received.
* Returns true/false
* */
server.prototype.authorizeSocket = function AuthorizeSocket(socket, key) {
  if(typeof this.authorizationKeys[key] === 'undefined') return false;
  if(this.authorizationKeys[key].data !== null) {
    socket.PRIVATE_DATA = {};
    for(var keyData in this.authorizationKeys[key].data) {
      socket.PRIVATE_DATA[keyData] = this.authorizationKeys[key].data[keyData];
    }
  }
  return true;
};

/*
* Returns a client socket.
* */


/*
 * Starts loading all our routes and binds the socket request object to them.
 * */
function LoadRoutes() {
  var routes = ReadDirectory(ROUTE_PATH, "js"),
      convertedRoutePath = ROUTE_PATH.replace(/\//g, '.').replace(/\\/g, '.'),
      self = this;
  _.forEach(routes, function(path) {
    var routeModelFn = require(path);
    var routePath = path.replace(/\//g, '.').replace(/\\/g, '.');
    routePath = routePath.replace(convertedRoutePath, '');
    routePath = routePath.substr(1).replace('.js', '');
    var routeObj = new IoRoute(routePath, SERVER);
    routeModelFn(routeObj);
    self.__routes.push(routeObj);
  });
}


module.exports = server;