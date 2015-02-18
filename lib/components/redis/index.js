/*
* Crux redis component
* */
var util = require('util'),
  os = require('os'),
  async = require('async'),
  redis;
var crux = require('../../../index'),
  Component = crux.Component;

var PING_INTERVAL = 60; // once every 50 seconds, we ping the connection to avoid timeouts

var Redis = function CruxRedisComponent(__name) {
  Redis.super_.apply(this, arguments);
  this.name = (typeof __name === 'string' ? __name : 'redis');
  this.client = {  };
};


Component
  .inherits(Redis)
  .require('log');

Component.default({
  enabled: true,
  debug: true,
  host: 'localhost',
  port: 6379,
  password: null,
  options: {}
});
Redis.prototype.__configuration = true;
Redis.prototype.packages = function PackageDependency() {
  var dep = ['redis'];
  if(os.platform().indexOf('win') === -1) {
    dep.push('hiredis');
  }
  return dep;
};

Redis.prototype.init = function InitializeRedis() {
  redis = require('redis');
};

Redis.prototype.run = function RunRedis(done) {
  if(this.config.enabled === false) {
    log.warn('Crux.' + this.name + ' is disabled. Skipping.');
    return done();
  }
  if(this.config.password) {
    this.config.options['auth_pass'] = this.config.password;
  }
  redis.debug_mode = false;
  var self = this;
  connectClient.call(this, 'db', function(err) {
    if(err) return done(err);
    log.info('Crux.' + self.name + ' initialized.');
    done();
  }, true);
};

function connectClient(type, done, shouldPing) {
  if(typeof this.client[type] === 'object') {
    return done(undefined, this.client[type]);
  }
  var clientObj = redis.createClient(this.config.port, this.config.host, this.config.options);
  this.client[type] = clientObj;
  var wasRun = false,
    self = this;
  function startPing() {
    clientObj.__pinger = setInterval(function() {
      if(type === 'publish') {
        clientObj.publish('internalPing', '.');
      } else {
        clientObj.ping();
      }
    },PING_INTERVAL * 1000);
  }
  function stopPing() {
    clearInterval(clientObj.__pinger);
  }
  clientObj.on('error', function OnError(err) {
    stopPing();
    if(!wasRun) {
      wasRun = true;
      return done(err);
    }
    if(typeof self._events['error'] === 'function') {
      return self.emit('error', err);
    }
    log.error('Crux.' + self.name +  ':' + type + ' encountered an error.');
    log.debug(err);
  });
  clientObj.on('ready', function() {
    if(shouldPing) startPing();
    log.trace('Crux.' + self.name +  ':' + type + ' connection established');
    if(!wasRun) {
      wasRun = true;
      done(undefined, clientObj);
    }
  });
}

/* Executes a redis command, in a promise-like manner */
Redis.prototype.exec = function RunCommand(name, op, val) {
  var self = this,
    _arguments = Array.prototype.slice.call(arguments);
  if(name instanceof Array) {
    var opName = name[0].toLowerCase();
    _arguments = name;
    name = opName;
  }
  _arguments.splice(0, 1);
  return crux.promise(function(resolve, reject) {
    if(this.config.enabled === false) {
      return reject(new Error('Redis ' + self.name + ' connection is not active.'));
    }
    if(typeof self.client.db[name] !== 'function') {
      return reject(new Error('Invalid redis command: ' + name));
    }
    _arguments.push(function onExecReturn(err, result) {
      if(err) {
        log.warn('Crux.' + self.name +  ': encountered an error while performing "%s"', name);
        log.debug(err);
        return reject(err);
      }
      if(self.config.debug) {
        log.trace('Crux.' + self.name +  ': executed "%s" with "%s %s"', name, op, val || "");
      }
      if(typeof result === 'string' && result !== '') {
        var firstChar = result.charAt(0);
        if(firstChar !== '"' && firstChar !== "'") {
          try {
            result = JSON.parse(result);
          } catch(e) {};
        }
      }
      resolve(result);
    });
    self.client.db[name].apply(self.client.db, _arguments);
  }.bind(this));
};

/*
* Creates a redis transaction.
* */
Redis.prototype.transaction = function RedisTransaction() {
  var _queue = [],
    self = this,
    chain = {};
  chain.queue = function QueueExec(opName) {
    var _arg = Array.prototype.slice.call(arguments),
      name = _arg[0];
    _arg.splice(0, 1);
    _queue.push({
      name: name,
      args: _arg
    });
    return chain;
  };
  chain.commit = function CommitQueue() {
    return crux.promise(function(resolve, reject) {
      // If our queue is empty, we resolve.
      if(_queue.length === 0) return resolve();
      var multi = self.client.db.multi(),
        calls = [];
      _queue = _queue.reverse();
      while(_queue.length > 0) {
        var op = _queue.pop();
        calls.push(op.name);
        multi[op.name].call(multi, op.args);
      }
      if(self.config.debug) {
        log.trace('Crux.' + self.name +  ': committing transaction with: %s', calls.join(','));
      }
      multi.exec(function(err, data) {
        if(err) return reject(err);
        resolve(data);
      });
    }.bind(self));
  };

  return chain;
};

Redis.prototype.stop = function StopRedis(done) {
  for(var type in this.client) {
    try {
      this.client[type].end();
    } catch(e) {}
  }
  done && done();
};

/*
* Publishes the given object data to the given channel through the publisher connection.
* It will try and use a new connection, and not the store one. This is to avoid packet collisions and for performance issues.
* */
Redis.prototype.publish = function PublishToChannel(channelName, data) {
  return crux.promise(function(resolve, reject) {
    var self = this;
    try {
      var jsonData = JSON.stringify(data);
    } catch(e) {
      return reject(e);
    }
    connectClient.call(self, 'publish', function(err, clientObj) {
      if(err) return reject(err);
      clientObj.publish(channelName, jsonData, function(err) {
        if(err) return reject(err);
        resolve();
      });
    }, true);
  }.bind(this));
};

/*
* Subscribes to a given channel name with a callback.
* This will create a new redis connection and place it under subscribed mode. The connection
* will be kept alive by the publishers that will publish to the "internalPing" channel.
* Arguments:
*   channelName - the channel to which we want to subscribe.
*   callback - the function that will be called when a message comes on that channel.
*   onSubscribed - the callback that will be called once we've successfully subscribed. Optional
*
* */
Redis.prototype.subscribe = function SubscribeToChannel(channelName, callback, _onSubscribed) {
  var self = this;
  var onSubscribed = (typeof _onSubscribed === 'function' ? _onSubscribed : function(err) {
    if(err) {
      log.warn('Crux.redis.subscribe: failed to subscribe to channel %s', channelName);
    }
  });
  if(typeof channelName !== 'string' || typeof callback !== 'function') {
    throw new Error('Crux.redis: subscribe() requires a string channel name and a callback function.');
  }
  connectClient.call(self, 'subscribe', function(err, clientObj) {
    if(err) {
      return onSubscribed(err);
    }
    if(typeof self.__channels === 'undefined') {  // these are the subscription channels.
      initiateSubscribe.call(self, clientObj);
    }
    if(typeof self.__channels[channelName] === 'undefined') {
      self.__channels[channelName] = [];
    }
    var cbIdx = self.__channels[channelName].push(callback) - 1;
    clientObj.subscribe(channelName, function(err) {
      if(err) {
        self.__channels[channelName].splice(cbIdx, 1);
        return onSubscribed(err);
      }
      onSubscribed();
    });
  });
  return this;
};

/*
* Initiates the subscription mechanism and starts listening to messages.
* */
function initiateSubscribe(clientObj) {
  this.__channels = {};
  var self = this;
  clientObj.subscribe('internalPing');
  clientObj.on('message', function(channelName, message) {
    if(channelName === 'internalPing') return;  // this is our internal channel for ping
    if(typeof self.__channels[channelName] === 'undefined') return; // we have no channel.
    try {
      var data = JSON.parse(message);
    } catch(e) {
      data = message;
    }
    for(var i=0; i < self.__channels[channelName].length; i++) {
      self.__channels[channelName][i](data);
    }
  });
}

module.exports = Redis;