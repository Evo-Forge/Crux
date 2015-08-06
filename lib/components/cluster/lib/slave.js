var util = require('util'),
  EventEmitter = require('events').EventEmitter,
  client = require('socket.io-client'),
  os = require('os');

var slave = function SlaveNode(config, pass) {
  this.client = null; //socket.io connection.
  this.config = config;
  this.config.password = crux.util.sha2(pass);
  EventEmitter.call(this);
};
util.inherits(slave, EventEmitter);

/*
 * Registers the node in the cluster. Returnx a promise
 * Options:
 *   - stats[boolean] - If stats are globally enabled, the current slave can bypass it. This is useful when having multiple slaves.
 *   - name - the application name, defaults to crux.app()
 *   - ip - the IP the application has, we will try to get the ip if not specified.
 *   - port - the application port, defaults to the crux.server's port.
 *        - NOTE: if ip is 10.x.x.x, we will return the first IP in the ifconfig that matches the pattern.
 * */
slave.prototype.register = function RegisterNode(options) {
  var self = this;

  if (typeof options !== 'object' || !options) options = {};
  if (!options.name) {
    options.name = crux.app.name();
  }

  if (!options.port) {
    try {
      var servObj = crux.app.component('server');
      options.port = servObj.config.port;
    } catch (e) {
      options.port = process.env.PORT || process.env.NODE_PORT || 3000;
    }
  }
  if (typeof options.ip === 'string') {
    if (options.ip.indexOf('x') !== -1) {
      options.ip = this.getIp(options.ip);
    }
  } else {
    options.ip = this.getIp();
  }
  this.options = options;
  if(this.config.stats.enabled && options.stats !== false) {
    this.bindStatSending();
  }
  return crux.promise(function(resolve, reject) {
    self.client = client('http://' + self.config.host + ':' + self.config.port, {
      'force new connection': true,
      'reconnectionDelayMax': 1200
    });
    self.client
      .on('connect', self.auth.bind(self))
      .on('registered', function OnRegistered() {
        self.emit('log',self.options.name + ' registered into the cluster.');
        self.emit('connect');
      })
      .on('disconnect', function() {
        self.config.connected = false;
        self.emit('log','disconnected from the cluster.');
        self.emit('disconnect');
      });
  });
};

/* Returns the memory and cpu stats. */
function getStats() {
  var procMem = process.memoryUsage();
  var stats = {
    mem: {
      total: os.totalmem(),
      free: os.freemem(),
      heap: procMem.rss
    },
    cpu: os.loadavg()
  };
  for(var i=0; i < stats.cpu.length; i++) {
    stats.cpu[i] = stats.cpu[i].toFixed(3);
  }
  stats.cpu = stats.cpu.join(",");
  // We convert from bytes to mb
  stats.mem.total = Math.ceil(stats.mem.total / 1000000) + "MB";
  stats.mem.free = Math.ceil(stats.mem.free / 1000000) + "MB";
  stats.mem.heap = (stats.mem.heap / 1000000).toFixed(3) + "MB";
  return stats;
}

/*
* Any slave can send memory and CPU usage to the cluster master
* NOTE: Memory is represented in MB
* */
slave.prototype.bindStatSending = function BindStatSending() {
  var _timer = null,
    self = this;
  function sendStats() {
    if(_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    var stats = getStats();
    self.client.emit('stats', stats);
    _timer = setTimeout(sendStats, self.config.stats.interval * 1000);
  }
  this.on('connect', function onConnect() {
    sendStats();
  });
  this.on('disconnect', function onDisconnect() {
    if(_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
  });
};

/*
* Authenticates with the master node.
* */
slave.prototype.auth = function Authenticate() {
  var self = this;
  var pass = self.config.password;
  self.client.emit('auth', pass, function(isOk) {
    if(!isOk) {
      self.emit('log', 'Failed to authenticate with the cluster master. Retrying...');
      self.client.disconnect();
      setTimeout(function(){
        self.client.connect();
      }, 5000);
      return;
    }
    /* We are going to send our information. */
    self.sendNodeData();
  });
};

/*
* Sends the current node's information to the master.
* */
slave.prototype.sendNodeData = function SendNodeData() {
  if(!this.options) {
    this.emit('log', 'Failed to send node information to master, options not set.');
    return;
  }
  this.client.emit('register', this.options);
};

/*
 * Returns an array of IPs.
 * NOTE:
 * if pattern is specified, we will return the items that match the pattern.
 * Eg::
 * 10.x.x.x -> matches first 10-class IP
 * 10.10.x.x -> matches the first 10.10 class IP
 * Empty: returns first IP
 * */
slave.prototype.getIp = function GetNodeIps(pattern) {
  var ifaces = os.networkInterfaces(),
    ips = [];
  Object.keys(ifaces).forEach(function(ifname) {
    var alias = 0;
    ifaces[ifname].forEach(function(iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) return;
      if (alias >= 1) {
        ips.push(iface.address);
      } else {
        ips.push(iface.address);
      }
    });
  });
  if (ips.length <= 1 || typeof pattern !== 'string') return ips[0] || '127.0.0.1';
  var patternSplit = pattern.toLowerCase().split(".");
  for (var i = 0; i < ips.length; i++) {
    var ip = ips[i],
      split = ip.split('.');
    if (split.length !== patternSplit.length) continue;
    var valid = true;
    for (var j = 0; j < split.length; j++) {
      if (patternSplit[j] !== split[j] && patternSplit[j] !== 'x') {
        valid = false;
      }
    }
    if (valid) {
      return ip;
    }
  }
  return null;
};


module.exports = slave;