/*
* This is the logger file that places log. under the global scope. We will be able to add centralized logging here.
* */
var log4js = require('log4js'),
  util = require('util'),
  Component = require('../core/component')();

var logger = function KruxLogger() {
  Component.apply(this, arguments);
  this.name = 'log';
  this.appenders = [{
    type: 'console'
  }];
  this.type = 'console';  // default logging type.
};
util.inherits(logger, Component);

logger.prototype.run = function RunLogger(cb) {
  global['log'] = log4js.getLogger(this.type);
  cb(null);
}

logger.prototype.stop = function StopLogger() {};

logger.prototype.get = function GetLogger() {
  return this;
}

module.exports = logger;