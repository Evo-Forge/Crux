/*
 * The watcher components sets an interval and performs a HTTP call to the given endpoint,
 * to perform health checks.
 *
 * EVENTS:
 *   - offline - when we failed to ping the given url more than the specified times.
 *   - online - when the site comes back online.
 * */
var http = require('http'),
  https = require('https'),
  util = require('util'),
  EventEmitter = require('events').EventEmitter;

/*
 * Default options:
 *   - timeout - 2 (in sec)
 *   - timer - 2 (number in sec)
 *   - fails: - 4 (number of fails before we emit the fail event)
 * */
var watcher = function CruxWatcher(url, options) {
  EventEmitter.call(this);
  this.url = url;
  this.started = false;
  this.fails = null;
  this.failed = false;
  if (typeof options !== 'object' || !options) options = {};
  this.stats = {
    total: 0,
    success: 0,
    failed: 0
  };
  this.options = {
    timeout: options.timeout || 2,
    timer: options.timer || 10,
    fails: options.fails || 4,
    auto_start: options.auto_start || true
  };
  if (this.options.auto_start) {
    this.start();
  }
};
util.inherits(watcher, EventEmitter);

/*
 * Starts the watcher.
 * */
watcher.prototype.start = function StartWatcher() {
  if (this.__timer) clearTimeout(this.__timer);
  var self = this;
  this.started = true;
  this.__timer = setTimeout(function() {
    if (!self.started) return;
    self.check(function(wasOnline) {
      self.stats.total++;
      if (!wasOnline) {
        self.stats.failed++;
        self.fails++;
        if (self.options.fails <= self.fails && !self.failed) {
          self.failed = true;
          self.failTime = new Date();
          self.emit('offline', self.failTime);
        }
      } else {
        self.stats.success++;
        if (self.failed) {
          self.failed = false;
          self.fails = 0;
          var failTime = self.failTime,
            restoreTime = new Date();
          var offlineTime = parseInt(restoreTime.getTime() - failTime.getTime(), 10) / 1000;
          self.failTime = null;
          self.emit('online', restoreTime, offlineTime);
        }
      }
      self.start();
    });
  }, this.options.timer * 1000);
};

/*
* Performs a HTTP check.
* */
watcher.prototype.check = function Check(done) {
  var called = false,
    caller = http;
  if(this.url.indexOf('https') !== -1) {
    caller = https;
  }
  var req = caller.get(this.url, function(res) {
    if(called) return;
    var statusCode = res.statusCode;
    called = true;
    if(statusCode !== 200) {
      return done(false);
    }
    done(true);
  });
  req.setTimeout(this.options.timeout * 1000);
  function onError() {
    if(called) return;
    called = true;
    done(false);
  }
  function onEnd() {
    req.removeListener('error', onError);
    req.removeListener('end', onEnd);
  }
  req.on('error', onError);
  req.on('end', onEnd);
};


/*
 * Stops the watcher.
 * */
watcher.prototype.stop = function StopWatcher() {
  if (!this.started) return;
  this.started = false;
  clearTimeout(this.__timer);
};

module.exports = watcher;