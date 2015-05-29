/*
 * Crux static HTTP server.
 * */
var util = require('util'),
  http = require('http');
var crux = require('../../../index'),
  browsersync,
  Component = crux.Component;

var StaticServer = function CruxStaticServer() {
  StaticServer.super_.apply(this, arguments);
  this.name = 'static';
  this.app = null;
};

Component
  .inherits(StaticServer)
  .require('log');

Component.default({
  debug: false,
  open: false,
  cors: true,
  logLevel: 'silent',
  host: 'localhost',
  port: 3200,
  files: ['public/**/*', 'public/*'],
  server: {
    baseDir: './public',
    index: 'index.html'
  }
});

StaticServer.prototype.packages = function PackageDependency() {
  var dep = ['browser-sync@2.2.x'];
  return dep;
};

StaticServer.prototype.init = function InitializeRedis() {
  browsersync = require('browser-sync');
};

StaticServer.prototype.run = function RunRedis(callback) {
  if(this.config.debug === true) {
    delete this.config.logLevel;
  }
  if(this.config.cors) {
    delete this.config.cors;
    this.config.server.middleware = function(req, res, next) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    };
  }
  browsersync(this.config, function(err) {
    if(err) {
      log.warn('Crux.static server failed to start.');
      log.debug(err);
      return callback(err);
    }
    log.info('Crux.static server listening on %s:%s', this.config.host, this.config.port);
    callback();
  }.bind(this));
};

module.exports = StaticServer;