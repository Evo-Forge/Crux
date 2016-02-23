/*
* This is a task entry item. The tasks component runs with an array of "things to do"
* The entry defines how a task should act.
* Emits:
*   - run - emitted whenever a task has finished running, regardless of result.
*   - failed(err) when an action fails.
*   - completed(results) when all actiosn complete.
*   -timeout(err) - when timing out.
* */
var crux = require('../../../../index'),
  EventEmitter = require('events').EventEmitter,
  util = require('util'),
  async = require('async');
var CONTEXT = {}; // the "this" context for each scheduled action. Also a singleton.
var entry = function CruxTaskEntry(name) {
  this.autorun = true;  // we can disable auto running.
  this.name = name;
  this.debug = false;
  this.type = 'serial'; // the type of this task. Can be: serial or parallel
  this.__queue = [];
  this.__actions = {};
  this.__hasActions = false;
  this.__started = false;
  this.__scheduled = false;
  this.__wait = 0;
  this.__running = false;
  this.__options = {
    delay: 10, // number of seconds to delay the run.
    timeout: 0,  // number of seconds until we consider the task failed.
    timer: 0    // number of seconds between calls. Defaults to 0(cyclic disabled)
  };
  this.__run_queue = [];  // we place any run requests while running here.
  EventEmitter.call(this);
};
util.inherits(entry, EventEmitter);

/*
* This will pause the current task (by adding the given amount of seconds) to the timer interval.
* */
entry.prototype.wait = function WaitABit(time) {
  this.__wait = getSeconds(time);
  return this;
};

/*
* Schedules an action to be done.
* NOTE: the action MUST return a crux promise, otherwise it will be considered a SYNCHRONOUS action.
* */
entry.prototype.action = function AddAction(name, fn) {
  if(typeof name !== 'string') {
    log.error('Crux.tasks: failed to register task %s action %s: name is not a string', this.name, name);
    return this;
  }
  if(typeof this.__actions[name] !== 'undefined') {
    log.error('Crux.tasks: failed to register task %s action %s, already exists.', this.name, name);
    return this;
  }
  if(typeof fn !== 'function') {
    log.error('Crux.tasks: failed to register task %s action %s, callback not a function.', this.name, name);
    return this;
  }
  if(!this.__scheduled) {
    this.__queue.push(name);
  }
  this.__actions[name] = fn;
  if(!this.__hasActions) {
    this.__hasActions = true;
  }
  return this;
};

/*
* Schedules how this task will run its actions.
* Note: if no actionList is specified, the action call will be random.
* Current options:
*   - delay - number of seconds to delay each time it wants to run. Note: if specified as "1m", "20h", "3d", we will enqueue them with day support.
*   - timeout - number of seconds until we consider it failed. Defaults to 0
* */
entry.prototype.schedule = function ScheduleActions(actionList, options) {
  actionList = (actionList instanceof Array ? actionList : []);
  options = (actionList instanceof Array) ? options || {} : (actionList || {});
  this.__options = crux.util.extend(this.__options, options);
  this.__options.delay = getSeconds(this.__options.delay);
  this.__options.timeout = getSeconds(this.__options.timeout);
  this.__options.timer = getSeconds(this.__options.timer);
  this.__queue = actionList;
  this.__scheduled = true;
  return this;
};

function getSeconds(str) {
  if(typeof str === 'number') return Math.max(0, str);
  if(typeof str === 'string') {
    var nr = 0,
      mul = 1,
      type;
    if(str.indexOf('s') !== -1) {
      type = 's';
    }
    if(str.indexOf('m') !== -1) {
      type = 'm';
      mul = 60;
    }
    if(str.indexOf('h') !== -1) {
      type = 'h';
      mul = 3600;
    }
    if(str.indexOf('d') !== -1) {
      type = 'd';
      mul = 86400;
    }
    if(!type) return 0;
    nr = parseInt(str.replace(type,''), 10);
    nr = nr * mul;
    return nr;
  }
  return 0;
}


/*
 * If the task has been marked as autorun, it will be automatically started when the app boots and the
 * module is loaded.
 * */
entry.prototype.start = function StartTask(waitSeconds) {
  if(!this.autorun) return; // we do not auto start.
  var self = this;
  if(this.isRunning()) {
    this.one('run', function() {
      self.initiateStart(waitSeconds);
    });
    return;
  }
  this.initiateStart(waitSeconds);
};

/*
 * Initiates the task entry, setting its delay in place
 * */
entry.prototype.initiateStart = function InitiateStart(oldSeconds) {
  var delay = (this.__options.delay || 0),
    timer = (this.__options.timer || 0),
    self = this;
  if(!this.__started) { // If it wasn't started, we start it.
    if(timer !== 0 && oldSeconds < timer) {
      delay = delay + Math.abs(timer - oldSeconds);
    }
    this.__started = true;
    this.__timer = setTimeout(function() {
      self.run(function() {
        self.initiateStart();
      });
    }, delay * 1000);
    return;
  }
  clearTimeout(this.__timer);
  if(timer === 0) return; // we do not run anymore.
  this.__timer = setTimeout(function() {
    self.run(function() {
      self.initiateStart();
    });
  }, (timer + self.__wait) * 1000);
  if(self.__wait !== 0) {
    self.__wait = 0;
  }
};


/*
* Tries and runs the task. Note that if the task is already running, it will wait
* until it finished running, and then run it again. The delay option does not apply here.
* */
function doRun(onDone) {
  var acts = [],
    self = this;
  this.__running = true;
  for(var i=0; i < this.__queue.length; i++) {
    var key = this.__queue[i];
    acts.push({name: key, fn: this.__actions[key]});
  }
  var interval = null,
    currentAction = null;
  if(this.__options.timeout > 0) {
    interval = setTimeout(function() {
      hasTimedout = true;
      var err = new Error('Task action has timed out.');
      err.action = currentAction;
      err.code = 'TIMEOUT';
      interval = null;
      onActionComplete(err);
    }, this.__options.timeout * 1000);
  }

  var calls = [],
    hasTimedout = false,
    results = [];
  var taskCtx = {};
  for(var key in CONTEXT) {
    taskCtx[key] = CONTEXT[key];
  }
  _.forEach(acts, function(action) {
    if(typeof action.fn !== 'function') {
      log.warn('Crux.tasks: [%s] Action %s was scheduled but not defined. Skipping.', self.name, action.name);
      return;
    }
    calls.push(function AsyncAction(done) {
      currentAction = action.name;
      if(hasTimedout) return done();
      if(self.debug) {
        log.info('Crux.tasks: [%s] running: %s', self.name, action.name);
      }
      try {
        var pObj = action.fn.apply(taskCtx, results);
      } catch(e) {
        log.warn('Crux.tasks: [%s] Action %s threw an exception.', self.name, action.name);
        log.debug(e);
        return done(e);
      }
      if(typeof pObj !== 'object' || !pObj || typeof pObj.then !== 'function') {
        // Not a promise, synchronous call.
        results.push(pObj);
        return done();
      }
      pObj.then(function(res) {
        results.push(typeof res === 'undefined' ? null : res);
        done();
      }).catch(function(err) {
        if(typeof err !== 'object' || !err) err = new Error('Task action failed');
        err.action = action.name;
        done(err);
      });
    });
  });

  function onActionComplete(err) {

    self.__running = false;
    if(err) {
      if(err.code === 'TIMEOUT') {
        self.emit('timeout', err, taskCtx);
      } else {
        self.emit('failed', err, taskCtx);
      }
      onDone && onDone(err);
    } else {
      self.emit('completed', results, taskCtx);
      onDone && onDone(null, results);
    }
    results = null;
    taskCtx = null;
    self.emit('run'); // the run event
    if(self.__run_queue.length === 0) return;
    var fn = self.__run_queue[0];
    self.__run_queue.splice(0,1);
    doRun.call(self, fn);
  }
  var asyncCall = (self.type === 'serial' ? 'series' : 'parallel');
  async[asyncCall](calls, function(err) {
    clearTimeout(interval);
    if(hasTimedout) return;
    onActionComplete(err);
  });
}

/*
* Tries to run the given task action.
* Returns a promise.
* */
entry.prototype.runAction = function RunAction(actionName, args) {
  var self = this,
    _args = Array.prototype.splice.call(arguments, 1);
  return crux.promise(function(resolve, reject) {
    if(typeof self.__actions[actionName] !== 'function') {
      return reject(new Error("Task action " + actionName + " does not exist."));
    }
    var pObj = self.__actions[actionName].apply(self, _args);
    if(typeof pObj === 'object' && pObj.then && pObj.catch) {
      pObj.then(resolve).catch(reject);
      return;
    }
    resolve();
  });
};

entry.prototype.run = function RunTask(asPromise) {
  var self = this;
  if(asPromise !== false && typeof asPromise !== 'function') {
    return crux.promise(function(resolve, reject) {
      function onDone(err, res) {
        if(err) return reject(err);
        resolve(res);
      }
      if(self.isRunning()) {
        self.__run_queue.push(onDone);
        return;
      }
      doRun.call(self, onDone);
    });
  }
  // if not, we just call the doRun.
  if(this.isRunning()) {
    this.__run_queue.push(true);  // we push an empty request.
  }
  doRun.call(this, asPromise);
};

/*
* Check if we have anything scheduled.
* */
entry.prototype.isEmpty = function IsTaskEmpty() {
  return (this.__queue.length === 0 && !this.__hasActions);
};

/* Checks if the task is still running */
entry.prototype.isRunning = function IsTaskRunning() {
  return this.__running;
};

module.exports = entry;
entry.setContext = function SetThisContext(ctx) {
  CONTEXT = ctx;
};