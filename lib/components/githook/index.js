var crux = require('../../../index'),
  Component = crux.Component,
  MasterMode,
  RunnerMode;
/*
* The Crux GIT Webhook component handles git deployments, in a clustered environment
* */
var Githook = function CruxGithookComponent(__name) {
  Githook.super_.apply(this, arguments);
  this.name = (typeof __name === 'string' ? __name : 'redis');
  this.client = {};
};

Component
  .inherits(Githook)
  .require('log');

/*
* Default configuration
* */
Component.default({
  debug: true,
  enabled: true,
  token: null,          // Access token to authenticate runners against masters
  mode: null,           // How should we start the githook? Values are: "MASTER" or "RUNNER"
  master: { // Settings used for the webserver that handles Github calls
    host: 'localhost',    // the host to listen for incoming calls
    port: 28700,          // the port to bind the server
    path: '/githook',
    secret: null,          // The github secret key, if set we will try and authenticate the incoming request.
    deploy_timeout: 1000,    // number of ms between deploys on the same repo/branch
    fleet: {
      size: '100%',         // The size of the fleet to deploy to at once. Specify a number, for exact amounts.
      timeout: 4000,         // The number of seconds till the ACK (error/success) from a runner.
      error_rate: '50%'     // The maximum allowed error rate. Set to 0% to stop the deploy on the first error.
    }
  },
  runner: {
    url: 'http://localhost:28700',  // The URL of the master github process.
    repository: {}                          // An object containing the Git repository with the following format: "{username}/{project}:{branchName}" and the script to run
  }
});
/*
* Runner repository configuration example:
* runner: {
*   repository: {
*     "PearlVentures/Crux:production": "/home/ec2-user/crux/deploy.sh"
*   }
* }
* */

/*
* The gihook component works with socket.io
* */
Githook.prototype.packages = function PackageDependency() {
  var list = [];
  if(!this.config.enabled) {
    return list;
  }
  if(typeof this.config.mode !== 'string' || ['master', 'runner'].indexOf(this.config.mode.toLowerCase()) === -1) {
    throw new Error("Crux.Githook requires mode configuration to be one of: master, runner");
  }
  this.config.mode = this.config.mode.toLowerCase();
  list.push('socket.io-client@1.3.x');
  if(this.config.mode === 'master') {
    list.push('socket.io@1.3.x');
    list.push('express@3.21.x');
  }
  return list;
};

/*
* Initialize the githook component, load the master/runner class
* */
Githook.prototype.init = function InitializeGithook() {
  if(this.config.mode === 'master') {
    MasterMode = require('./lib/master');
  }
  RunnerMode = require('./lib/runner');
  Githook.prototype.Runner = Githook.Runner = RunnerMode;
};

/*
* Starts the githook runner or master.
* */
Githook.prototype.run = function RunGithook(done) {
  if(!this.config.enabled) return done();
  if(this.config.mode === 'master') {
    this.master = new MasterMode(this.config);
    this.master.bind(done);
    if(this.config.debug) {
      this.master.on('log', function(severity, msg) {
        msg = 'Crux.githook: ' + msg;
        log[severity](msg);
      });
    }
    var self = this;
    for(var i=0; i < this.master.EVENTS.length; i++) {
      var ev = this.master.EVENTS[i];
      this.master.on(ev, function(data) {
        self.emit(ev, data);
      });
    }
  } else {
    this.runner = new RunnerMode(this.config);
    this.runner.connect(done);
  }
};

module.exports = Githook;