var http = require('http');
/*
 * The CRUX Cluster module allows a master-slave view of a list of applications
 * A short example would be:
 * 1. setup a cluster.Master on your nginx server
 * 2. have all your apps call cluster.register() with their IP
 * 3. have the cluster master update nginx config on node registration/unregistration
 *
 * Cluster nodes maintain an open connection
 * */
var crux = require('../../../index'),
  Component = crux.Component,
  Watcher = require('./lib/watcher');

var cluster = function CruxCluster(__name) {
  cluster.super_.apply(this, arguments);
  this.name = (typeof __name === 'string' ? __name : 'cluster');
};

Component.inherits(cluster).require(['log']);

/*
 * Default configurations for CruxCluster
 * */
Component.default({
  enabled: true,
  debug: true,
  mode: 'slave',   // what type of node is the current application? master or slave
  password: 'yourpass',  // The password to use for node authentication.
  master: { // Master configuration
    ip: '0.0.0.0',  // IP to bind the master listener.
    port: 24873,     // Port to bind the master listener.
    timeout: 3,      // Number of seconds before a node is considered dead.
    save: false           // Should we perform dump savings, to preserve client state. Defaults to false, if specified, it will be used as the dumpfile path
  },
  slave: {  // Slave configuration
    host: '127.0.0.1', // Master host or IP
    port: 24873,       // Master port or IP
    stats: {
      enabled: true,    // Specify if the slave client should send memory/cpu usage to the cluster master.
      interval: 30    // interval in seconds.
    }
  }
});

cluster.prototype.packages = function GetPackages() {
  var list = [];
  if (!this.config.enabled) {
    return list;
  }
  if (this.config.mode === 'master') {
    list.push('socket.io@1.3.x');
  }
  if (this.config.mode === 'slave') {
    list.push('socket.io-client@1.3.x');
  }
  return list;
};

var SocketIoServer;

cluster.prototype.init = function Initialize() {
  if (!this.config.enabled) return;
  if (this.config.mode === 'master') {
    SocketIoServer = require('socket.io');
  }
  if(this.config.mode === 'slave') {
    this.slaves = [];
  }
};

cluster.prototype.run = function RunCluster(done) {
  if (!this.config.enabled) return done();
  this.watchers = [];
  if (this.config.mode === 'master') {
    return this.listen(done);
  }
  done();
};

/*
 * Registers to the cluster. Note that slaves do not synchronously register, but rather do that in the background.
 * */
var SlaveNode;
cluster.prototype.register = function RegisterIntoCluster(options) {
  if(!SlaveNode) SlaveNode = require('./lib/slave');
  var slaveObj = new SlaveNode(this.config.slave, this.config.password);
  if(this.config.mode === 'slave') {
    this.slaves.push(slaveObj);
    this.bind(slaveObj, 'slave', this.slaves.length);
  }
  return slaveObj.register.apply(slaveObj, arguments);
};

/*
 * Listens to any incoming nodes.
 * */
cluster.prototype.listen = function InitiateCluster(done) {
  this.io = new SocketIoServer({
    pingTimeout: 10000,
    pingInterval: 2000
  });
  var self = this;
  this.http = http.createServer();
  this.io.attach(this.http);
  var MasterNode = require('./lib/master');
  this.master = new MasterNode(this.io, this.config.master, this.config.password);
  this.bind(this.master, 'master');
  this.http.listen(this.config.master.port, this.config.master.ip, function(err) {
    if (err) {
      log.error('Crux.cluster: failed to bind server.');
      return done(err);
    }
    if (self.config.debug) {
      log.trace('Crux.cluster: listening for slaves on %s:%s', self.config.master.ip, self.config.master.port);
    }
    done();
  });
};

/*
* Creates a custom watcher
* */
cluster.prototype.createWatcher = function CreateClusterWatcher(url, opt) {
  if(!this.watchers) this.watchers = [];
  var wObj = new Watcher(url, opt);
  this.watchers.push(wObj);
  return wObj;
};

/*
 * Listens for events on the socket.io
 * */
cluster.prototype.bind = function BindEvents(obj, type, _id) {
  var self = this;
  if (this.config.debug) {
    obj.on('log', function(d) {
      log.trace('Crux.cluster: [%s] ' + d, type + (typeof _id !== 'undefined' ? '-' + _id : ''));
    });
  }
  if (type === 'master') {
    // we proxy the following events: connect, reconnect, disconnect
    obj.nodes = []; // we manage the nodes here.
    /* We register the nodes() function. */
    self.nodes = function GetConnectedNodes(appName, withStatus) {
      var list = [];
      for(var i=0; i < obj.nodes.length; i++) {
        var node = JSON.parse(JSON.stringify(obj.nodes[i]));
        if(typeof appName === 'string' && node.name !== appName) continue;
        if(withStatus === true) {
          node.status = 'online';
        }
        list.push(node);
      }
      if(withStatus === true) {
        for(var i=0; i < obj.disconnected.length; i++) {
          var id = obj.disconnected[i],
            tmp = id.split(":"),
            name = tmp[0],
            ip = tmp[1],
            port = tmp[2] || '?';
          if(name !== appName) continue;
          var node = {
            name: name,
            ip: ip,
            port: port,
            status: 'disconnected'
          };
          list.push(node);
        }
        for(var i=0; i < obj.disconnecting.length; i++) {
          var id = obj.disconnecting[i],
            tmp = id.split(":"),
            name = tmp[0],
            ip = tmp[1],
            port = tmp[2] || '?';
          if(name !== appName) continue;
          var node = {
            name: name,
            ip: ip,
            port: port,
            status: 'disconnecting'
          };
          var found = false;
          for(var q=0; q < list.length; q++) {
            if(list[q].name == name && list[q].ip == ip && list[q].port == port) {
              list[q].status = "disconnecting"
              found = true;
            }
          }
          if(!found) {
            list.push(node);
          }
        }
      }
      return list;
    };
    function add(node) {
      var found = false;
      for(var i=0; i < obj.nodes.length; i++) {
        if(obj.nodes[i].id === node.id) {
          found = true;
          break;
        }
      }
      if(!found) {
        obj.nodes.push(node);
        self.emit('change', obj.nodes);
      }
    }
    function remove(node) {
      for(var i=0; i < obj.nodes.length; i++) {
        if(obj.nodes[i].id === node.id) {
          obj.nodes.splice(i, 1);
          self.emit('change');
          break;
        }
      }
    }
    obj
      .on('connect', function(node) {
        add(node);
        self.emit('connect', node);
      })
      .on('disconnect', function(node) {
        remove(node);
        self.emit('disconnect', node);
      })
      .on('reconnect', function(node) {
        add(node);
        self.emit('reconnect', node);
      });
  }
  if (type === 'slave') {
    obj.on('connect', function() {
      self.emit('connect');
    }).on('disconnect', function() {
      self.emit('disconnect');
    });
  }
};

cluster.Watcher = cluster.prototype.Watcher = Watcher;

module.exports = cluster;