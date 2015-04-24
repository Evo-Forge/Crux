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

/**
* Crux comes with a built-in logger component, that uses log4js to achieve its logging. By default, it is placed under
* global['log'] and can be accessible via log.<method> anywhere in the project.
* Its default appender is the console, having its level set to "trace". For more information, visit {@link http://stritti.github.io/log4js/}
* @global
* */
var log = {};

// We may want to just attach log in the global scope.
var logger = function CruxLogger(_type, _level) {
  if(this instanceof CruxLogger) {
    Component.apply(this, arguments);
    this.name = 'log';
    this.type = 'console';  // default logging type.
    var logger = log4js.getLogger(this.type);
    logger.setLevel(this.config.level.toUpperCase());
    global['log'] = logger;
  } else {  // In case we just called crux.Log(), we just want to return an instance of log4js
    var logger = log4js.getLogger(_type || 'default');
    if(typeof _level === 'string') {
      logger.setLevel(_level);
    }
    return logger;
  }
};
util.inherits(logger, Component);

logger.prototype.run = function RunLogger(cb) {
  cb(null);
};

logger.prototype.stop = function StopLogger() {};

logger.prototype.get = function GetLogger() {
  return this;
};

module.exports = logger;