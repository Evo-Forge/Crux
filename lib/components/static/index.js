/*
 * Crux static HTTP server.
 * */
var util = require('util'),
  http = require('http'),
  express;
var crux = require('../../../index'),
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
  debug: true,
  host: 'localhost',
  port: 3200,
  ip: '0.0.0.0',
  path: 'public/',
  express: {
    'x-powered-by': false
  }
});
StaticServer.prototype.__configuration = true;
StaticServer.prototype.packages = function PackageDependency() {
  var dep = ['express@3.3.4'];
  return dep;
};

StaticServer.prototype.init = function InitializeRedis() {
  express = require('express');
  this.app = express();
};

StaticServer.prototype.run = function RunRedis(callback) {
  this.app.use(express.compress());
  if(this.config.debug) {
    this.app.use(function(req, res, next) {
      log.trace('crux.Static: %s', req.method, req.path);
      next();
    });
  }
  this.app.use(express.static(Component.appPath(this.config.path)));
  this.app.use(function AssetNotFound(req, res) {
    res.status(404);
    return res.end('Not found: ' + req.path);
  });
  this.app.use(function OnServerError(err, req, res) {
    log.warn('crux.Static: Encountered an error while in: %s', req.path);
    log.debug(err);
    res.status(500);
    return res.end('Internal Server Error');
  });
  for(var sName in this.config.express) {
    this.app.set(sName, this.config.express[sName]);
  }
  this.app.set('env', global['NODE_ENV']);
  var self = this;
  this.http = http.createServer(this.app);
  var cbCalled = false;
  this.http.on('error', function(err) {
    if(!cbCalled) {
      cbCalled = true;
      return callback(err);
    }
    if(typeof self._events['error'] === 'function') {
      return self.emit('error', err);
    }
    log.error('Crux.static: encountered an error.');
    log.debug(err);
  });
  this.http.listen(this.config.port, this.config.ip, function() {
    if(cbCalled) return;
    log.info('Crux.static server listening on %s:%s', self.config.ip, self.config.port);
    cbCalled = true;
    callback();
  });
};

StaticServer.prototype.stop = function StopServer(done) {
  this.app.stop(done);
};


module.exports = StaticServer;