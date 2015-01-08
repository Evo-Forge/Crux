var Krux = require('../../../index'),
  Component = Krux.Component,
  IoRoute = require('./lib/route.js'),
  IoSocket = require('./lib/socket.js');

var socketio;

Component.require(['server', 'log']);

Component.default({
  timeout: 5000,              // The timeout before we disconnect a socket that was not authorized.
  authorization: false,       // Turn this on when wanting to perform socket authorization.
  routes: 'app/io/routes',     // The socket.io routing path.
  delimiter: {
    file: '.',     // This is the default route splitting delimiter. Example: routes/room/home converts to room.home
    action: ':'   // The default delimiter we use when creating the routing path. Example: routes/room/home.index() converts to: room.home:index
  }
});

/*
 * This is the Socket.io server representation
 * */
var Server = function KruxIoComponent() {
  Server.super_.apply(this, arguments);
  this.name = 'io';
  this.app = null;  // this is the express.js app instance.
  this.io = null;
  this.clients = {};      // a hash of clientid:socket
  this.routes = {};   // a hash of routename:routeObject
};
Component.inherits(Server);
Server.prototype.__configuration = true;

Server.prototype.init = function Initialize() {
  socketio = require('socket.io');
};

Server.prototype.packages = function GetDependencies() {
  return 'socket.io@1.2.x';
};

Server.prototype.run = function RunIo(done) {
  var servObj = Krux.app.component('server');
  if(!servObj) {
    return done(new Error('Krux.io: Krux.Server must be run before running Krux.io'));
  }
  if(this.__binded) return done();
  loadRoutes.call(this);
  BindServer.call(this, servObj.http, done);
};

/*
* This is the socket authorization function that is executed whenever a socket is connected.
* */
Server.prototype.authorization = function SocketAuthorization() {

};


function BindServer(servObj, done) {
  this.io = new socketio();
  this.io.serveClient(false);
  this.io.use(this.authorization.bind(this));
  this.io.on('connection', onConnection.bind(this));
  this.io.attach(servObj);
  done();
}

/*
* This function is called whenever a new socket connection is created.
* */
function onConnection(socket) {
  console.log("SOCKET");
}

/*
* This function will load all the socket.io's routes from the configured path.
* */
function loadRoutes() {
  var routeCount = 0,
    self = this;
  try {
    var list = Krux.util.readDirectory(Component.appPath(this.config.routes), 'js');
    if(list.length === 0) {
      return log.warn('Krux.io: component has no routes.');
    }
  } catch(e) {
    return;
  }

  list.forEach(function(filePath) {
    var routeDefinition = require(filePath);
    var routePath = filePath.replace(Component.appPath(self.config.routes), "");
    if(typeof routeDefinition !== 'function') {
      log.warn('Krux.io: Route %s does not export a function.', routePath);
      return;
    }
    routePath = routePath.replace(/\//g, '.').replace(/\\/g, '.').replace('.js','');
    if(routePath.charAt(0) === '.') routePath = routePath.substr(1);
    if(self.config.delimiter !== '.') routePath = routePath.replace(/\./g, self.config.delimiter);

    var routeObj = new IoRoute(routePath);
    routeDefinition(routeObj);
    if(typeof self.routes[routeObj.namespace] !== 'undefined') {
      throw new Error('Route namespace "'+routeObj.namespace+'" previously registered.');
    }
    self.routes[routePath] = routeObj;
    routeCount++;
  });
  log.trace('Krux.io: %s route(s) loaded.', routeCount);
}


module.exports = Server;
