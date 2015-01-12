/*
* Crux redis component
* */
var util = require('util'),
  os = require('os'),
  redis;
var crux = require('../../../index'),
  Component = crux.Component;

var Redis = function CruxRedisComponent() {
  Redis.super_.apply(this, arguments);
  this.name = 'redis';
  this.client = null;
};


Component
  .inherits(Redis)
  .require('log');

Component.default({
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
  if(this.config.password) {
    this.config.options['auth_pass'] = this.config.password;
  }
  redis.debug_mode = false;
  this.client = redis.createClient(this.config.port, this.config.host, this.config.options);
  var wasRun = false,
    self = this;
  this.client.on('error', function OnError(err) {
    if(!wasRun) {
      wasRun = true;
      return done(err);
    }
    if(typeof self._events['error'] === 'function') {
      return self.emit('error', err);
    }
    log.error('Crux.redis: encountered an error.');
    log.debug(err);
  });
  this.client.on('ready', function() {
    log.info('Crux.redis: connection established');
    if(!wasRun) {
      wasRun = true;
      done();
    }
  });
};

/* Executes a redis command, in a promise-like manner */
Redis.prototype.exec = function RunCommand(name, op, val) {
  var self = this,
    _arguments = Array.prototype.slice.call(arguments);
  _arguments.splice(0, 1);
  return crux.promise(function(resolve, reject) {
    if(typeof self.client[name] !== 'function') {
      return reject(new Error('Invalid redis command: ' + name));
    }
    _arguments.push(function onExecReturn(err, result) {
      if(err) {
        log.warn('Crux.redis: encountered an error while performing "%s"', name);
        log.debug(err);
        return reject(err);
      }
      if(self.config.debug) {
        log.trace('Crux.redis: executed "%s" with "%s:%s"', name, op, val);
      }
      resolve(result);
    });
    self.client[name].apply(self.client, _arguments);
  });
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
      var multi = self.client.multi(),
        calls = [];
      _queue = _queue.reverse();
      while(_queue.length > 0) {
        var op = _queue.pop();
        calls.push(op.name);
        multi[op.name].call(multi, op.args);
      }
      if(self.config.debug) {
        log.trace('Krux.redis: committing transaction with: %s', calls.join(','));
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
  if(!this.client) return;
  this.client.end();
  done && done();
};


module.exports = Redis;