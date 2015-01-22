/*
* This is the logger file that places log. under the global scope. We will be able to add centralized logging here.
* */
var log4js = require('log4js'),
  util = require('util'),
  Component = require('../core/component')();

Component.default({
  appenders: [{
    type: 'console'
  }],
  level: 'trace'
});

var logger = function CruxLogger() {
  Component.apply(this, arguments);
  this.name = 'log';
  this.type = 'console';  // default logging type.
  global['log'] = log4js.getLogger(this.type);
  log.setLevel(this.config.level.toUpperCase());
};
util.inherits(logger, Component);

logger.prototype.run = function RunLogger(cb) {
  cb(null);
}

logger.prototype.stop = function StopLogger() {};

logger.prototype.get = function GetLogger() {
  return this;
}

module.exports = logger;