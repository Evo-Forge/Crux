var socketIo = require('socket.io-client'),
  fs = require('fs'),
  path = require('path'),
  exec = require('child_process').exec;
/*
 * The runner class will connect to the master server and wait for events from it.
 * */
var runner = function GithookRunner(config) {
  this.token = config.token;
  this.config = config.runner;
  this.repositories = this.config.repository;
};

/*
 * Binds the runner, connecting to the master and starts listening for events.
 * NOTE: we do not "synchronously" connect to the master node, we callback asap,
 * and try to connect in the background.
 * */
runner.prototype.connect = function BindRunner(done) {
  if (typeof done !== 'function') done = function() {
  };
  var self = this;
  var url = this.config.url;
  if (this.token) {
    url += '?token=' + this.token;
  }
  this.io = socketIo(url, {
    reconnection: true,
    'force new connection': true,
    'reconnectionDelay': 1000
  });

  function onConnect() {
    log.info('Crux.githook: connected to %s', self.config.url);
    /* Once we're connected, we send the server our repositories. */
    self.listen();
    var repoList = [];
    for (var repo in self.repositories) {
      repoList.push(repo);
    }
    self.io.emit('repositories.set', repoList);
  }

  function onDisconnect() {
    log.warn('Crux.githook: disconnected from %s', self.config.url);
  }

  function onError(e) {
    if (typeof e === 'string' && e.indexOf('Invalid authorization') !== -1) {
      log.error('Crux.githook: Invalid authorization token.');
      return;
    }
    log.error('Crux.Githook: encountered an error while connecting to master');
    log.debug(e);
  }

  this.io
    .on('connect', onConnect)
    .on('disconnect', onDisconnect)
    .on('error', onError);
  done();
};

/*
 * Handles an incoming deployment.
 * */
runner.prototype.deploy = function DoDeploy(projectUri, done) {
  if (typeof this.repositories[projectUri] === 'undefined') {
    log.warn('Crux.githook: received deploy on invalid project: %s', projectUri);
    return done(new Error("Invalid deploy repository"));
  }
  // Check if the file exists.
  var execPath = this.repositories[projectUri];
  if (execPath.charAt(0) === '.') {
    execPath = path.normalize(__rootdir + execPath);
  }
  try {
    var d = fs.lstatSync(this.repositories[projectUri]);
    if (typeof d !== 'object' || !d) throw 1;
  } catch (e) {
    log.warn('Crux.githook: received deploy on [%s], script [%s] does not exist.', projectUri, this.repositories[projectUri]);
    return done(new Error("Invalid deploy script"));
  }
  // Try to chmod the file
  try {
    fs.chmodSync(execPath, '0700');
  } catch (e) {  }
  var DATA = '',
    ERROR = null;
  var proc = exec(execPath, {
    cwd: __rootdir,
    maxBuffer: 2000 * 1024
  });
  var isCompleted = false;
  function onComplete() {
    if (isCompleted) return;
    isCompleted = true;
    if (ERROR) {
      log.error('Crux.githook: Deploy encountered errors for [%s]', projectUri);
      log.debug(ERROR);
      return done(ERROR);
    }
    log.info('Crux.githook: Deploy completed for [%s]', projectUri);
    done();
  }
  proc.stdout.on('data', function(d) {
    DATA += d;
  });
  proc.on('error', function(e) {
    log.fatal('Crux.githook: Failed to perform deploy on [%s]', projectUri);
    ERROR = e;
    onComplete();
  });
  proc.on('close', function onClose() {
    if (ERROR !== null && (typeof ERROR === 'string' && ERROR.indexOf('From github') === -1)) {
      DATA += ERROR;
    }
    onComplete();
  });
};

/*
 * Starts listening for events on the socket.
 * */
runner.prototype.listen = function ListenForEvents() {
  var self = this;
  if (this._listening) return;
  this._listening = true;
  /*
   * The deploy event contains:
   * payload
   *   .id - the deploy id
   *   .repo - the full repository string
   * */
  function DoDeploy(payload) {
    self.deploy(payload.repo, function(err) {
      if (err) {
        return self.io.emit('deploy.error', payload);
      }
      self.io.emit('deploy.complete', payload);
    });
  }
  this.io.on('deploy', DoDeploy);
};

module.exports = runner;