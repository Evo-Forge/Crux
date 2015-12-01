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

/**
 * Wrapper and utility functionality over node-redis.
 * @example
 *  // Programatically create a redis store.
 *  var crux = require('node-crux'),
 *    app = crux.app;
 *  var redisStore = new crux.Store.Redis('mystore', { host: 'localhost' });
 *  app.addComponent(redisStore);
 *  app.run(function() {
 *    // At this point, our redis component is connected to the redis server.
 *    redisStore.exec('SET', 'key', 'value');
 *    redisStore.subscribe('myChannel', function onData(data) {
 *      log.debug('Got data', data);
 *    }, function onSubscribed() {
 *      redisStore.publish('myChannel', 'helloWorld');
 *    });
 *  });
 *
 * @class crux.Store.Redis
 * @extends crux.Component
 *
 * @property {String} [name=redis] - The redis component name.
 * @property {Redis.RedisClient} - the Redis connection client.
 * @param {String} name - the redis component's name. Crux allows the creation of multiple redis components, if they have different names.
 * @param {Object} options Default configuration for the Redis component
 * @param {Boolean} [options.enabled=true] - Enables or not the component. Disabled redis components will not connect to redis but simulate the run() method
 * @param {Boolean} [options.debug=true] - Enables or not debug mode. While in debug mode, all redis calls are logged.
 * @param {String} [options.host=localhost] - Redis hostname
 * @param {Boolean} [options.pubsub=false] - If enabled, it will not create the default regular connection on redis, but only the publish/subscribe ones.
 * @param {Number} [options.port=6379] - Redis port
 * @param {String} [options.password=null] - Redis password
 * @param {Object} [options.options] - additional Redis options.
 * */

var Redis = function CruxRedisComponent(__name) {
  Redis.super_.apply(this, arguments);
  this.name = (typeof __name === 'string' ? __name : 'redis');
  this.client = {};
};


Component
  .inherits(Redis)
  .require('log');

Component.default({
  enabled: true,
  debug: true,
  pubsub: false,
  host: 'localhost',
  port: 6379,
  password: null,
  options: {}
});
/**
 * The Redis component requires configuration to be passed to it, as it must connect to Redis
 * @memberof crux.Store.Redis
 * @defaultValue true
 * */
Redis.prototype.__configuration = true;

/**
 * The Redis component requires the node module <b>redis</b> to be installed. By default, we will always fetch the latest version.<br/>
 * Optionally, it will install <b>hiredis</b> for boosting up connection performance. Since this module is built in C, it requires heavy C++ dependencies
 * that most Windows machines do not have, therefore it is by default turned off.
 * @memberof crux.Store.Redis
 * @function packages
 * @instance
 * @override
 * @returns {String[]}
 * */
Redis.prototype.packages = function PackageDependency() {
  var dep = ['redis'];
  return dep;
};

/**
 * Initializes the redis component.
 * @memberof crud.Store.Redis
 * @function init
 * @instance
 * @override
 * */
Redis.prototype.init = function InitializeRedis() {
  redis = require('redis');
};

/**
 * Tries to connect to the redis server. Once it succeeds, it will call the callback function.
 * @memberof crux.Store.Redis
 * @function run
 * @instance
 * @override
 * @param {Function} done - the callback function called on connection
 * */
Redis.prototype.run = function RunRedis(done) {
  if (this.config.enabled === false) {
    log.warn('Crux.' + this.name + ' is disabled. Skipping.');
    return done();
  }
  if (this.config.password) {
    this.config.options['auth_pass'] = this.config.password;
  }
  redis.debug_mode = false;
  var self = this;
  if (this.config.pubsub) {  // if pubsub, we skip the db.
    return done();
  }
  connectClient.call(this, 'db', function(err) {
    if (err) return done(err);
    log.info('Crux.' + self.name + ' initialized.');
    self.connected = true;
    done();
  }, true);
  this.on('connect', function() {
    self.connected = true;
  }).on('disconnect', function() {
    self.connected = false;
  });
};

function connectClient(type, done, shouldPing) {
  if (typeof this.client[type] === 'object') {
    return done(undefined, this.client[type]);
  }
  var clientObj = redis.createClient(this.config.port, this.config.host, this.config.options);
  this.client[type] = clientObj;
  var wasRun = false,
    isDisc = false,
    self = this;

  function startPing() {
    clientObj.__pinger = setInterval(function() {
      if (type === 'publish') {
        clientObj.publish('internalPing', '.');
      } else {
        clientObj.ping();
      }
    }, PING_INTERVAL * 1000);
  }

  function stopPing() {
    clearInterval(clientObj.__pinger);
  }

  var isReconnecting = false;
  clientObj.on('error', function OnError(err) {
    stopPing();
    if (!wasRun) {
      wasRun = true;
      return done(err);
    }
    if (typeof self._events['error'] === 'function') {
      return self.emit('error', err);
    }
    if (!isDisc) {
      isDisc = true;
      if (type === 'db') {
        self.emit('disconnect');
      }
    }
    if(!isReconnecting) {
      isReconnecting = true;
      log.error('Crux.' + self.name + ':' + type + ' disconnected.');
      if (self.config.debug) {
        log.debug(err);
      }
    }
  });
  clientObj.on('ready', function() {
    if(isReconnecting) {
      isReconnecting = false;
      if(self.config.debug) {
        log.trace('Crux.' + self.name + ':' + type + ' connection established');
      }
    }
    if (shouldPing) startPing();
    if (self.config.debug) {
      log.trace('Crux.' + self.name + ':' + type + ' connection established');
    }
    if (!wasRun) {
      wasRun = true;
      done(undefined, clientObj);
    }
    if (isDisc) {
      isDisc = false;
      if (type === 'db') {
        self.connected = true;
        self.emit('connect');
      }
    }
  });
}

/**
 * The function will send the given command to Redis and return a promise.
 *
 * @memberof crux.Store.Redis
 * @function exec
 * @instance
 * @param {String} name - command name
 * @param {Any[]} values - command arguments.
 * @see {@link http://redis.io}
 * @returns {crux.Promise}
 * */
Redis.prototype.exec = function RunCommand(name, op, val) {
  var self = this,
    _arguments = Array.prototype.slice.call(arguments);
  if (name instanceof Array) {
    var opName = name[0].toLowerCase();
    _arguments = name;
    name = opName;
  }
  _arguments.splice(0, 1);
  return crux.promise(function(resolve, reject) {
    if (this.config.pubsub) {
      return reject(new Error('Redis ' + self.name + ' is in pubsub mode, database connection is not created.'));
    }
    if (this.config.enabled === false) {
      return reject(new Error('Redis ' + self.name + ' connection is not active.'));
    }
    if (typeof self.client.db[name] !== 'function') {
      return reject(new Error('Invalid redis command: ' + name));
    }
    _arguments.push(function onExecReturn(err, result) {
      if (err) {
        log.warn('Crux.' + self.name + ': encountered an error while performing "%s"', name);
        log.debug(err);
        return reject(err);
      }
      if (self.config.debug) {
        log.trace('Crux.' + self.name + ': executed "%s" with "%s %s"', name, op, val || "");
      }
      if (typeof result === 'string' && result !== '') {
        var firstChar = result.charAt(0);
        if (firstChar !== '"' && firstChar !== "'") {
          try {
            result = JSON.parse(result);
          } catch (e) {
          }
          ;
        }
      }
      resolve(result);
    });
    self.client.db[name].apply(self.client.db, _arguments);
  }.bind(this));
};
/**
 @typedef {Object} RedisTransaction
 @property {function} queue() - Queues the given operation. Same arguments as exec()
 @property {function} commit() - Commits the transaction, returning a promise.
 */

/**
 * The function will create a transaction, by using redis's multi() command.
 * @memberof crux.Store.Redis
 * @function transaction
 * @instance
 * @returns {RedisTransaction} transaction
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
      if (this.config.pubsub) {
        return reject(new Error('Redis ' + self.name + ' is in pubsub mode, database connection is not created.'));
      }
      // If our queue is empty, we resolve.
      if (_queue.length === 0) return resolve();
      var multi = self.client.db.multi(),
        calls = [];
      _queue = _queue.reverse();
      while (_queue.length > 0) {
        var op = _queue.pop();
        calls.push(op.name);
        multi[op.name].call(multi, op.args);
      }
      if (self.config.debug) {
        log.trace('Crux.' + self.name + ': committing transaction with: %s', calls.join(','));
      }
      multi.exec(function(err, data) {
        if (err) return reject(err);
        resolve(data);
      });
    }.bind(self));
  };

  return chain;
};

/**
 * Closes all active connections to redis servers.
 * @memberof crux.Store.Redis
 * @function stop
 * @instance
 * @override
 * @param {function} done - callback function to be called on complete
 * */
Redis.prototype.stop = function StopRedis(done) {
  for (var type in this.client) {
    try {
      this.client[type].end();
    } catch (e) {
    }
  }
  done && done();
};

/**
 * Publishes the given object data to the given channel through the publisher connection.<br>
 * It will try and create a new Redis connection to use for publish actions. This is to avoid packet collisions and for performance issues.
 *
 * @memberof crux.Store.Redis
 * @function publish
 * @instance
 * @param {String} channelName - the channel where we want to publish
 * @param {Any} data - the data we want to publish in the channel.
 * */
Redis.prototype.publish = function PublishToChannel(channelName, data) {
  return crux.promise(function(resolve, reject) {
    var self = this;
    try {
      var jsonData = JSON.stringify(data);
    } catch (e) {
      return reject(e);
    }
    connectClient.call(self, 'publish', function(err, clientObj) {
      if (err) return reject(err);
      clientObj.publish(channelName, jsonData, function(err) {
        if (err) return reject(err);
        resolve();
      });
    }, true);
  }.bind(this));
};

/**
 * Subscribes to a given channel name with a callback. This will create a new redis connection and place it under subscribed mode. <br>
 * There have been reports for connection time outs on subscribers, therefore the connection will be kept alive by the publishers that will
 * publish to the "internalPing" channel.<br>
 * @memberof crux.Store.Redis
 * @function subscribe
 * @instance
 * @param {String} channelName - the name of the channel we wish to subscribe to
 * @param {Function} callback - the function that is called whenever a new data packet is received in the channel
 * @param {Function} [onSubscribed} - the function that is called once subscribed to the channel.
 * */
Redis.prototype.subscribe = function SubscribeToChannel(channelName, callback, _onSubscribed) {
  var self = this;
  var onSubscribed = (typeof _onSubscribed === 'function' ? _onSubscribed : function(err) {
    if (err) {
      log.warn('Crux.redis.subscribe: failed to subscribe to channel %s', channelName);
    }
  });
  if (typeof channelName !== 'string' || typeof callback !== 'function') {
    throw new Error('Crux.redis: subscribe() requires a string channel name and a callback function.');
  }
  connectClient.call(self, 'subscribe', function(err, clientObj) {
    if (err) {
      return onSubscribed(err);
    }
    if (typeof self.__channels === 'undefined') {  // these are the subscription channels.
      initiateSubscribe.call(self, clientObj);
    }
    if (typeof self.__channels[channelName] === 'undefined') {
      self.__channels[channelName] = [];
    }
    var cbIdx = self.__channels[channelName].push(callback) - 1;
    clientObj.subscribe(channelName, function(err) {
      if (err) {
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
    if (channelName === 'internalPing') return;  // this is our internal channel for ping
    if (typeof self.__channels[channelName] === 'undefined') return; // we have no channel.
    try {
      var data = JSON.parse(message);
    } catch (e) {
      data = message;
    }
    for (var i = 0; i < self.__channels[channelName].length; i++) {
      self.__channels[channelName][i](data);
    }
  });
}

module.exports = Redis;