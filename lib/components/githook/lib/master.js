var socketIo = require('socket.io'),
  crypto = require('crypto'),
  EventEmitter = require('events').EventEmitter,
  http = require('http'),
  util = require('util'),
  express = require('express');

var DEPLOY_ID = 1;  // incrementer

/*
* This is the Githook Master class, handling the express app that listens for incoming POST requests
* from github, as well as the socket.io server that will handle incoming runner nodes.
* NOTE: The master githooker will emit the following events:
*  - log -> emitted when a new log entry was created
*  - deploy.start -> emitted when a deploy will occur.
*  - deploy.success
*  - deploy.error
* */
const MAX_HOOK_SIZE = 10000000; // 10MB max
var master = function MasterGithook(config) {
  EventEmitter.call(this);
  this.token = config.token;
  this.config = config.master;
  this.runners = [];  // an array of runners that have repositories set.
  this.FLEETS = {};   // a hash of deployId:[pendingFleets]
  this.TIMEOUTS = {}; // hash of projectUri:true
};
util.inherits(master, EventEmitter);
master.prototype.EVENTS = ['deploy.start', 'deploy.success', 'deploy.error'];

/*
* Handles logging by emitting the "log" event.
* */
master.prototype.log = function LogEvent(severity, message) {
  this.emit('log', severity, message);
  return this;
};

/*
* Binds the server to listen for git and clients.
* */
master.prototype.bind = function BindServer(done) {
  var self = this;
  this.app = express();
  this.app.set('x-powered-by', false);
  this.app.post(this.config.path, this.onHook.bind(this));
  this.app.use(function(err, req, res, next) {
    var message = err.message || "Invalid request.",
      code = (err.code || 500);
    self.log('trace', 'sent invalid request: '+code+', ' + message);
    res.status(code)
      .end(message);
  });
  this.server = http.createServer(this.app);
  this.io = socketIo(this.server);
  this.server.listen(this.config.port, function(e) {
    if(e) return done(e);
    self.log('info', 'listening for hooks from http://' + self.config.host + ':' + self.config.port + self.config.path);
    done();
  });

  if(this.token) {
    this.io.set('authorization', function onAuth(req, done) {
      var token = req._query.token;
      if(token !== self.token) {
        return done(new Error("Invalid authorization token"), false);
      }
      return done(null, true);
    });
  }

  this.io.on('connection', this.onRunner.bind(this));
};

/*
* Called when an incoming githook is done
* */
master.prototype.onHook = function OnHookRequest(req, res, next) {
  var self = this;
  if (req.headers['content-type'] !== 'application/json') {
    return next(new Error('Format not supported.'));
  }
  if(req.host !== self.config.host) {
    return next(new Error('Invalid hostname.'));
  }
  var data = "";
  function onData(d) {
    if(data.length > MAX_HOOK_SIZE) {
      return;
    }
    data += d;
  }
  function parseRequest() {
    req.removeListener('data', onData);
    req.removeListener('end', parseRequest);
    var payload;
    try {
      var tmp = JSON.parse(data);
      if (typeof tmp.payload === 'object' && tmp.payload) {
        payload = tmp.payload;
      } else {
        payload = tmp;
      }
    } catch(e) {
      self.log('debug', 'Received invalid payload');
      return next(new Error("Invalid or corrupted payload."));
    }
    // Check the signature, if we have it
    if(self.config.secret) {
      var signature = req.headers['x-hub-signature'] || "",
        calculatedSignature;
      if (typeof signature !== 'string' || !signature) {
        return next(new Error('Invalid githook signature.'));
      }
      var hmac = crypto.createHmac('sha1', self.config.secret);
      try {
        hmac.update(JSON.stringify(payload));
        calculatedSignature = 'sha1=' + hmac.digest('hex');
        if (calculatedSignature !== signature) {
          throw 1;
        }
      } catch (e) {
        return next(new Error('Could not verify signature.'));
      }
    }
    // Read the branch information
    var branchName,
      repoName;
    try {
      branchName = (payload.ref || payload.branch);
      if (typeof branchName !== 'string' || branchName === '') {
        throw 1;
      }
    } catch(e) {
      return next(new Error('Missing branch information'));
    }
    if(branchName.indexOf('/') !== -1) {
      branchName = branchName.split("/");
      branchName = branchName[branchName.length-1]; // last one is always our branch
    }
    try {
      repoName = payload.repository.full_name || payload.repository.name;
    } catch (e) {
      self.log('warn', 'Repository name missing from hook payload');
      return next(new Error('Repository name missing'));
    }
    // We check if we already have a deploy running
    var projectUri = repoName + ':' + branchName;
    if(typeof self.TIMEOUTS[projectUri] !== 'undefined') {
      self.log('debug', 'Repo ' + projectUri + ' is still in timeout, cannot deploy yet.');
      return next(new Error('Deployment in process. Try again later.'));
    }
    if(typeof self.config.deploy_timeout === 'number' && self.config.deploy_timeout > 0) {
      self.TIMEOUTS[projectUri] = setTimeout(function() {
        delete self.TIMEOUTS[projectUri];
      }, self.config.deploy_timeout);
    }
    self.deploy(projectUri, payload);
    res.end();
  }
  req.on('data', onData);
  req.on('end', parseRequest);
};

/*
* Does the actual deploy by selecting and sending the deploy event to all the connected clients.
* */
master.prototype.deploy = function doDeploy(projectUri, info) {
  // Gather information about all the runners that are listening for that project.
  var nodes = [],
    self = this;
  for(var i=0; i < this.runners.length; i++) {
    if(this.runners[i].repositories.indexOf(projectUri) === -1) continue;
    nodes.push(this.runners[i]);
  }
  if(nodes.length === 0) {  // cannot send to anybody.
    self.log('info', 'received a deploy event for ' + projectUri + ', no runner online.');
    return;
  }
  var fleetSize = this.getFleetSize(projectUri);
  // Step one, calculate the fleet size.
  if(fleetSize.indexOf('%') === -1) { // we have a number.
    fleetSize = parseInt(fleetSize, 10);
  } else {  // we have a percentage.
    var perc = parseInt(fleetSize.replace('%',''), 10);
    fleetSize = Math.floor(perc/100 * nodes.length);
  }
  if(fleetSize <= 0) fleetSize = 1;
  fleetSize = Math.min(fleetSize, nodes.length-1);
  // Step two, elect the first {fleetSize} nodes to send the deploy.
  DEPLOY_ID++;
  var sendTo = [],
    deployId = DEPLOY_ID.toString();
  for(var i=0; i < fleetSize; i++) {
    sendTo.push(nodes.pop());
  }
  self.emit('deploy.start', {
    id: deployId,
    repo: projectUri
  });
  self.log('info', 'DEPLOY ' + deployId + ': initializing fleet 1 of ' + fleetSize + ' nodes from a pool of ' + (sendTo.length + nodes.length) + ' nodes.');
  // Step three: send to the elected nodes the event.
  for(var i=0; i < sendTo.length; i++) {
    sendTo[i].emit('deploy', {
      id: deployId,
      repo: projectUri
    });
  }

  if(nodes.length === 0) return;  // completed deploy, nothing to wait for.
  var fleet = {
    start: Date.now(),
    batch: fleetSize,
    current: 1,   // current fleet
    total: sendTo.length + nodes.length,
    runners: nodes,  // pending nodes.
    success: 0, // number of successful deploys, per batch
    success_total: 0, // number of total successful deploys
    failed: 0,   // number of failed deploys.
    failed_total: 0
  };
  // During a timeout, we will send the "deploy" event to all remaining nodes, regardless of error/success count.
  fleet._timeout = setTimeout(function() {
    if(!fleet) return;
    self.log('info', 'Deploy timeout reached for deploy ' + deployId + ' on ' + projectUri + ', will trigger deploy to ' + fleet.runners.length + ' remaining nodes.');
    for(var i=0; i < fleet.runners.length; i++) {
      fleet.runners[i].emit('deploy', {
        id: deployId,
        repo: projectUri
      });
    }
    self.emit('deploy.success', {
      id: deployId,
      repo: projectUri
    });
    delete fleet;
    delete self.FLEETS[deployId];
  }, self.getFleetTimeout(projectUri));
  this.FLEETS[deployId] = fleet;
};


/*
* Returns the fleet size of the given projectURI
* */
master.prototype.getFleetSize = function GetFleetSize(projectUri) {
  // IF we have a fleet size definition per-project, we return it.
  var size;
  if(typeof this.config.fleet.size === 'object' && this.config.fleet.size) {
    size = (typeof this.config.fleet.size[projectUri] === 'undefined' ? 1 : this.config.fleet.size[projectUri]);
  } else {
    size = this.config.fleet.size;
  }
  return size.toString();
};

/*
* Returns the fleet timeout of the given projectURI
* */
const DEFAULT_TIMEOUT = 10000;
master.prototype.getFleetTimeout = function GetFleetTimeout(projectUri) {
  if(typeof this.config.fleet.timeout === 'number') {
    return this.config.fleet.timeout;
  }
  if(typeof this.config.fleet.timeout === 'object' && this.config.fleet.timeout) {
    return this.config.fleet.timeout[projectUri] || DEFAULT_TIMEOUT;
  }
  return DEFAULT_TIMEOUT;
};

/*
* Returns the fleet allowed error rate.
* */
const DEFAULT_ERROR_RATE = '0%';
master.prototype.getFleetError = function GetFleetErrorRate(projectUri) {
  if(typeof this.config.fleet.error_rate === 'object' && this.config.fleet.error_rate) {
    return this.config.fleet.error_rate[projectUri] || DEFAULT_ERROR_RATE;
  }
  if(typeof this.config.fleet.error_rate === 'string') return this.config.fleet.error_rate;
  return DEFAULT_ERROR_RATE;
};

/*
* Called when a runer client connects.
* */
master.prototype.onRunner = function OnRunnerConnection(socket) {
  var self = this;
  // Check for uniqueness.
  for(var i=0; i < self.runners.length; i++) {
    if(self.runners[i].id === socket.id) {
      self.runners.splice(i, 1);
      break;
    }
  }
  socket.repositories = []; // empty at start.
  self.runners.push(socket);
  /* Set the repos that the runner is listening for */
  function onRepositorySet(repo) {
    if(repo instanceof Array) {
      socket.repositories = repo;
    }
    self.emit('connect', socket);
  }

  function createFleet(deploy) {
    var fleet = self.FLEETS[deploy.id];
    if(!fleet) return;
    if(fleet.success + fleet.failed < fleet.batch) return; // nothing to do, wait for more successes.
    fleet.current++;
    self.log('info', 'Initializing fleet ' + fleet.current + ' of ' + Math.min(fleet.batch, fleet.runners.length) + ' nodes for deploy ' + deploy.id + ' on ' + deploy.repo);
    fleet.success = 0;
    fleet.failed = 0;
    for(var i=0; i < fleet.batch; i++) {
      var runner = fleet.runners.pop();
      if(typeof runner === 'undefined') { // we've sent to everybody, stop the deploy.
        self.emit('deploy.success', deploy);
        self.log('info', 'Deploy ' + deploy.id + ' sent deploy event to ' + fleet.success_total + ' nodes out of ' + fleet.total);
        clearTimeout(fleet._timeout);
        delete self.FLEETS[deploy.id];
        return;
      }
      runner.emit('deploy', {
        id: deploy.id,
        repo: deploy.repo
      });
    }
  }

  /* Called when a deploy has been completed by a runner. */
  function onDeployCompleted(deploy) {
    if(typeof self.FLEETS[deploy.id] === 'undefined') return; //nothing else to do.
    var fleet = self.FLEETS[deploy.id];
    fleet.success++;
    fleet.success_total++;
    // Try and create a fleet.
    createFleet(deploy);
  }

  /* Called when a deploy contained errors. */
  function onDeployError(deploy) {
    if(typeof self.FLEETS[deploy.id] === 'undefined') return; //nothing else to do.
    var fleet = self.FLEETS[deploy.id];
    fleet.failed++;
    fleet.failed_total++;
    var allowedError = self.getFleetError(deploy.repo);
    if(allowedError.indexOf('%') === -1) { // we have a number.
      allowedError = parseInt(allowedError, 10);
    } else {  // we have a percentage.
      var perc = parseInt(allowedError.replace('%',''), 10);
      allowedError = Math.floor(perc/100 * fleet.total);
    }
    // IF we have a max error rate, we stop the deploy.
    if(fleet.failed_total >= allowedError) {
      self.emit('deploy.error', deploy);
      self.log('fatal', 'Error threshold ' + fleet.failed_total +' reached for deploy ' + deploy.id + ' on ' + deploy.repo);
      clearTimeout(fleet._timeout);
      delete self.FLEETS[deploy.id];
      return;
    }
    // IF we're still acceptable, we run next.
    createFleet(deploy);
  }

  /* Wipe everything from the socket. */
  function onDisconnect() {
    for(var i=0; i < self.runners.length; i++) {
      if(self.runners[i].id === socket.id) {
        self.runners.splice(i, 1);
        break;
      }
    }
    // Check any remaining fleets, remove it from em'
    for(var deployId in self.FLEETS) {
      var deleted = false;
      if(typeof self.FLEETS[deployId] !=='object' || !(self.FLEETS[deployId].runners instanceof Array)) continue;
      for(var j=0; j < self.FLEETS[deployId].runners.length; j++) {
        if(deleted) continue;
        var item = self.FLEETS[deployId].runners[j];
        if(item.id === socket.id) {
          self.FLEETS[deployId].runners.splice(j, 1);
          deleted = true;
        }
      }
    }
    socket.removeAllListeners('repositories.set');
    socket.removeAllListeners('disconnect');
    socket.removeAllListeners('deploy.complete');
    socket.removeAllListeners('deploy.error');
  }
  socket.on('deploy.complete', onDeployCompleted.bind(this));
  socket.on('deploy.error', onDeployError.bind(this));
  socket.on('repositories.set', onRepositorySet);
  socket.on('disconnect', onDisconnect);

};

module.exports = master;