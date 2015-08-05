/*
* The Tasks component registers custom tasks that are to be run at a given time or in a period of time.
* */
var crux = require('../../../index'),
  Entry = require('./lib/entry'),
  fs = require('fs'),
  path = require('path'),
  Component = crux.Component;

var tasks = function CruxTaskScheduler(__name, __opt) {
  tasks.super_.apply(this, arguments);
  this.name = (typeof __name === 'string' ? __name : 'tasks');
  this.enabled = true;
};
var REGISTERED_TASKS = {};
/*
 * Default configurations for tasks.
 * */
Component.default({
  enabled: true,
  debug: true,
  tasks: {},  // a hashMap of task configuration.
  path: ['app/tasks'], // the default tasks location to load
  savefile: 'app/tasks/.task_dump'  // the dump file we use to save intervals between tasks.
});

Component
  .inherits(tasks)
  .require(['log']);

tasks.prototype.init = function Initialize() {
  if(!this.config.enabled) {
    this.enabled = false;
  } else {
    this.attachTo();
  }
};

/*
* Runs the tasks component, registering any tasks that are found in the configured autoload path.
* */
tasks.prototype.run = function RunTasks(done) {
  if(!this.enabled) return done();
  if(this.config.savefile) {
    this.config.savefile = Component.appPath(this.config.savefile);
  }
  loadTasks.call(this);
  var sync = loadSync.call(this, true);
  for(var taskName in REGISTERED_TASKS) {
    var bumpSeconds = sync ? sync[taskName] || 0 : 0;
    REGISTERED_TASKS[taskName].start(bumpSeconds);
  }
  done();
};

/*
* Reads the sync dumpfile, to see any previous timers.
* */
function loadSync(updateSeconds) {
  if(!this.config.savefile) return null;
  try {
    var lastSync = fs.readFileSync(this.config.savefile, { encoding: 'utf8' });
    var json = JSON.parse(lastSync);
    if(typeof json !== 'object' || !json) return null;
    // We now update the remaining seconds for each task, if set.
    if(updateSeconds === true) {
      var now = new Date().getTime();
      for(var taskName in json) {
        var lastSave = json[taskName];
        json[taskName] = Math.floor((now - lastSave) / 1000);
      }
    }
    return json;
  } catch(e) {
    // no previous dumps;
    return null;
  }
}

/*
* Saves sync information to the disk.
* */
function saveSync(taskName) {
  if(!this.config.savefile) return null;
  var json = loadSync.call(this) || {};
  json[taskName] = new Date().getTime();
  fs.writeFile(this.config.savefile, JSON.stringify(json), { encoding: 'utf8' }, function(err) {
    if(err) {
      log.warn('Crux.tasks: failed to save dumpfile.');
    }
  });
}

var CONTEXT = {}; // this is passed as the "this" context for each task, to be able to call this.service() and so.
tasks.prototype.attach = function AttachMethod(name, fn) {
  CONTEXT[name] = fn;
};

/*
* Registers the given task object.
* */
tasks.prototype.registerTask = function RegisterTask(taskObj) {
  var self = this;
  if(!(taskObj instanceof Entry)) {
    log.warn('Crux.tasks: attempted to register task that does not extend crux.Tasks.Entry');
    return false;
  }
  if(taskObj.isEmpty()) {
    log.trace('Crux.tasks: task %s has nothing scheduled. Skipping.', taskObj.name);
    return;
  }
  if(typeof REGISTERED_TASKS[taskObj.name] !== 'undefined') {
    log.error('Crux.tasks: task %s already registered. Skipping', taskObj.name);
    return;
  }
  REGISTERED_TASKS[taskObj.name] = taskObj;
  /*  We now listen for the "run" event, to update the dump task. */
  taskObj.on('run', function OnRunComplete() {
    var timer = taskObj.__options.timer;
    if(timer === 0) return; // we don't save.
    saveSync.call(self, taskObj.name);
  });
  return this;
};

/*
* Loads up all the tasks found in the given path.
* The default task name is as follows:
*[dir.subdir.subdir]:[filename]
* Ex:
* app/start/notifications.js  -> app.start:notifications
* rootTask.js -> rootTask
* */
function loadTasks() {
  Entry.setContext(CONTEXT);
  var paths = (this.config.path instanceof Array ? this.config.path : [this.config.path]);
  var valid = 0,
    self = this;
  _.forEach(paths, function(sPath) {
    var taskDir = Component.appPath(sPath);
    try {
      var list = crux.util.readDirectory(taskDir, 'js');
    } catch(e) {
      // No tasks
      log.warn('Crux.tasks: no task definitions found in: %s', sPath);
      return;
    }
    // For each task file found in the folder, we register it.
    list.forEach(function(taskPath) {
      var name = taskPath.replace(taskDir, '');
      if(name.charAt(0) === '/' || name.charAt(0) === "\\") name = name.substr(1);
      name = name.replace('.js','');
      name = name.replace(/\\/g,'.').replace(/\//g, '.');
      var split = name.split('.'),
        taskName = split.pop();
      if(split.length !== 0) {
        var ns = split.join('.');
        taskName = ns + ':' + taskName;
      }
      try {
        var taskModule = require(taskPath);
      } catch(e) {
        log.fatal('Crux.tasks: Failed to load task %s', taskName);
        log.debug(e);
        return;
      }
      var taskObj,
        taskConfig = (typeof self.config.tasks[taskName] === 'undefined' ? {} : self.config.tasks[taskName]);
      if(typeof taskModule === 'function') {
        taskObj = new Entry(taskName);
        taskModule.call(CONTEXT, taskObj, taskConfig);
      } else if(taskModule instanceof Entry) {
        taskObj = taskModule;
      }
      if(!taskObj) {
        log.trace('Crux.tasks: task %s does not implement a crux.Tasks.Entry. Skipping.', taskName);
        return;
      }
      self.registerTask(taskObj);
      valid++;
    });
  });
  if(valid !== 0) {
    log.trace('Crux.tasks: Loaded %s tasks', valid);
  }
}

/*
* Attaches itself to any available service/the crux server.
* Thus, tasks can be queued up dynamically from anywhere.
* */
tasks.prototype.attachTo = function AttachTasks() {
  var self = this;
  process.nextTick(function() {
    function runTask() {

    }
    function getTask() {

    }
    self.registry().attachTo('server service', 'runTask', runTask);
    self.registry().attachTo('server service', 'getTask', getTask);
  });
};
tasks.Entry = tasks.prototype.Entry = Entry;
module.exports = tasks;