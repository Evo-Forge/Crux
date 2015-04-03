/*
 * Githook deploy tool
 * */
var crux = require('../../../index'),
  urlParser = require('url'),
  path = require('path'),
  fs = require('fs'),
  qsParser = require('querystring'),
  http = require('http'),
  exec = require('child_process').exec,
  Component = crux.Component;

var Githook = function CruxGitHook(__name, _opt) {
  Githook.super_.apply(this, arguments)
  this.name = (typeof __name === 'string' ? __name : 'githook');
  this.deploying = false;
};


Component.inherits(Githook)
  .require('log');

Component.default({
  enabled: true,
  host: 'localhost',
  ip: '0.0.0.0',
  path: '/deploy',
  script: null, // Deploy script that will be execed relative to the __rootdir.
  secret: [],
  port: 15878
});
/**
 * The Redis component requires configuration to be passed to it, as it must connect to Redis
 * @memberof crux.Store.Redis
 * @defaultValue true
 * */
Githook.prototype.__configuration = true;

Githook.prototype.init = function Initialize(c) {
  this.server = http.createServer(this.handle.bind(this));
};

Githook.prototype.run = function Run(done) {
  if(!this.config.enabled) {
    return done();
  }
  if(this.config.script == null) {
    log.warn('Crux.githook: deploy script is not present in config. Skipping...');
    return done();
  }
  // We setup the deploy path
  this.deployPath = path.normalize(__rootdir + '/' + this.config.script);
  if(!fs.existsSync(this.deployPath)) {
    log.warn('Crux.githook: deploy script is nowhere to be found: %s. Skipping...', this.deployPath);
    return done();
  }
  var called = false;
  this.server.listen(this.config.port, this.config.ip, function(err) {
    if(called) return;
    called = true;
    log.trace('Crux.githook: listening for deploys on %s:%s', this.config.host, this.config.port + this.config.path);
    done();
  }.bind(this));
  this.server.on('error', function(e) {
    if(called) {
      log.warn('Crux.githook encountered an error:', e);
      return;
    }
    called = true;
    done(e);
  });
};

/*
* Handles the deploy request.
* */
Githook.prototype.handle = function HandleRequest(req, res) {
  var url = req.url,
    method = req.method,
    host = (req.headers['host'] || '').split(':')[0];
  if(method.toUpperCase() !== 'GET' || host.toLowerCase() !== this.config.host) {
    return this.reject(res);
  }
  var qs = qsParser.parse(url.split('?')[1] || '');
  url = urlParser.parse(url);
  if(url.pathname !== this.config.path) {
    return this.reject(res);
  }
  // We check for secret key configuration
  if(this.config.secret.length !== 0) {
    if(typeof qs['secret'] !== 'string') return this.reject(res);
    var isValid = false;
    for(var i=0; i < this.config.secret.length; i++) {
      if(this.config.secret[i] === qs['secret']) {
        isValid = true;
        break;
      }
    }
    if(!isValid) return this.reject(res);
  }
  if(this.deploying) {
    return this.reject(500, 'Deploy already in progress');
  }
  var self = this;
  // If we're here, we should deploy.
  this.deploying = true;
  log.info('Crux.githook: deployment process started');
  exec(this.deployPath, {
    cwd: path.normalize(__rootdir),
    maxBuffer: 100 * 1024
  },function(err, stdout, stderr) {
    self.deploying = false;
    if(err) {
      log.error('Crux.githook: Deploy failed, script failed to execute.');
      log.debug(err);
      return;
    }
    log.info('Crux.githook: deploy successful.');
  });
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hook accepted.');
};

Githook.prototype.reject = function RejectCall(res, _statusCode, _msg) {
  res.writeHead(_statusCode || 404, {'Content-Type': 'text/plain'});
  res.end((_msg || 'Invalid request')+'\n');
};

module.exports = Githook;