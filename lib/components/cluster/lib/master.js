var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  EventEmitter = require('events').EventEmitter;
/*
* The master node class handles incoming node connections.
* */
var master = function MasterNode(io, config, pass) {
  EventEmitter.call(this);
  this.connected = [];  // array of connected clients.
  this.disconnected = []; // an array of disconnected and removed clients.
  this.disconnecting = [];  //array of disconnecting clients (didn't reconnect within 10sec)
  this.io = io;
  this.config = config;
  this.config.password = crux.util.sha2(pass);
  this.__loadDump();
  this.bind();
};
util.inherits(master, EventEmitter);

/*
* Listens for any incoming requests.
* */
master.prototype.bind = function BindEvents() {
  var self = this;
  this.io.on('connection', function(socket) {
    socket.on('auth', self.auth.bind(self, socket));
    socket.on('register', function(options) {
      if(!socket.IS_AUTHENTICATED) return; //not authenticated.
      if(typeof options !== 'object' || !options) return; //invalid options.
      self.register(socket, options);
    });
  });
};

/*
* Authenticates an incoming connection
* */
master.prototype.auth = function AuthNode(socket, shaPass, done) {
  if(shaPass !== this.config.password) {
    socket.IS_AUTHENTICATED = false;
    if(typeof done === 'function') done(false);
    socket.disconnect();
    return;
  }
  socket.IS_AUTHENTICATED = true;
  if(typeof done === 'function') done(true);
};

/*
* Registers the given node information to the cluster.
* When a node registers:
* 1. if it was previously disconnected, we mark it as reconnected, and emit "reconnect" event
* 2. If it was in the process of being disconnected, we remove it from disconnecting and silently do nothing.
* 3. If it never joined, we emit "connect" event.
* */
master.prototype.register = function RegisterNode(socket, data) {
  data.ip = data.ip || socket.handshake.address;
  var event = 'connect',
    id = data.name + ":" + data.ip;
  if(data.port) {
    id += ':' + data.port;
  }
  for(var i=0; i < this.disconnected.length; i++) {
    if(this.disconnected[i] === id) {
      // item was disconnected, we remove it from here and emit the reconnect event.
      this.disconnected.splice(i,1);
      event = 'reconnect';
      break;
    }
  }
  for(var i=0; i < this.disconnecting.length; i++) {
    if(this.disconnecting[i] === id) {
      this.disconnecting.splice(i, 1);
      event = null;
      break;
    }
  }
  for(var i=0; i < this.connected.length; i++) {
    if(this.connected[i].id === id) {
      this.connected.splice(i, 1);
      break;
    }
  }
  data.id = id;
  this.connected.push(data);
  socket.emit('registered');
  socket._NODE_ID = id;
  socket._NODE_DATA = data;
  socket.on('disconnect', this.disconnect.bind(this, socket));
  if(event != null) {
    this.emit(event, data);
    this.dump();
  }
};

/*
* Dumps the data to the file system.
* */
master.prototype.dump = function CreateDump() {
  if(this.config.save === false) return;  //nothing to dump.
  var d = {
    c: this.connected,
    d: this.disconnected,
    di: this.disconnecting
  };
  var textData = JSON.stringify(d),
    dumpFile = path.normalize(__rootdir + '/' + this.config.save);
  try {
    fs.writeFileSync(dumpFile, textData, { encoding: 'utf8' });
  } catch(e) {
    this.emit('log', 'Failed to write to savefile.');
  }
};
/*
* Loads all the data in the dumpfile. This happens once on boot
* */
master.prototype.__loadDump = function LoadDataDump() {
  if(this.config.save === false) return;  //nothing to read.
  var dumpFile = path.normalize(__rootdir + '/' + this.config.save);
  try {
    var dumpData = fs.readFileSync(dumpFile, { encoding: 'utf8' });
    var json = JSON.parse(dumpData);
    this.connected = json.c;
    this.disconnected = json.d;
    this.disconnecting = json.di;
  } catch(e) {} // no data or invalid data. Skip
};

/*
* Called when a node disconnects from us.
* */
master.prototype.disconnect = function OnSocketDisconnect(socket) {
  if(typeof socket._NODE_ID !== 'string') return;
  var id = socket._NODE_ID,
    data = socket._NODE_DATA;
  if(this.disconnecting.indexOf(id) === -1) {
    this.disconnecting.push(id);
  }
  var self = this;
  // we remove it from connected
  for(var i=0; i < this.connected.length; i++) {
    if(this.connected[i].id === id) {
      this.connected.splice(i, 1);
      break;
    }
  }
  setTimeout(function() {
    var i = self.disconnecting.indexOf(id);
    if(i !== -1) {
      self.disconnecting.splice(i, 1);
    }
    // We check if he reconnected in the meanwhile.
    for(var i=0; i < self.connected.length; i++) {
      if(self.connected[i].id === id) {
        // reconnected in the meanwhile, nothing to do
        return;
      }
    }
    // we emit the 'disconnect' event and add it in the disconnected list.
    if(self.disconnected.indexOf(id) === -1) {
      self.disconnected.push(id);
    }
    self.emit('disconnect', data);
    self.dump();
  }, this.config.timeout * 1000);
};

module.exports = master;