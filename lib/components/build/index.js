/*
* This is the building component. It is useful in development, as it provides a few
* build utilities. Current utilities support:
*   - Custom Crux frontend framework (will soon be deprecated)
*   - Angular JavaScript building and concatenation
*   - Angular Template building and exporting
*   - Scss watching and compilation
*
* The component will EMIT: the following events
*   - change(processName, relativePath)
*   - build(processName)
*   - error(processName, error)
*
* */

var path = require('path'),
  async = require('async'),
  Crux = require('../../../index'),
  Component = Crux.Component;

var Interface = require('./_interface');

var CORE_PROCESSES = [];
var CUSTOM_PROCESSES = [], // An array of {name:process, definition:processClass} added by developers.
  REQUIRED_INSTALLS = [];   // an array of installs.
Component.default({
  debug: true,
  autoRun: true, // Should we auto run all the build components when app starts. Default to true
  autoWatch: false, // Should we automatically watch all the build components. Defaults to false.
  process: {}     // This is where each process's configuration will be set. Each process is responsible for its own config.
}).require('log');

var Build = function BuildComponent() {
  Build.super_.apply(this, arguments);
  this.loaded = []; // an array of loaded processes
  this.name = 'build';
};
Component.inherits(Build);

/*
* The function will programmatic enable a core component by setting the given configuration file
* in the build component. Thus, when running, the core component will be loaded. This allows us to
* enable or disable processes dynamically.
* */
Build.prototype.process = function EnableCoreProcess(name, config) {
  if(typeof name !== 'string' || !name) {
    throw new Error('Crux.build: process() received invalid name');
  }
  if(!hasProcess(name, 'core')) {
    throw new Error('Crux.build: process() failed, "'+name+'" is not a core process.');
  }
  this.config.process[name] = config;
  return this;
};

/*
* The function will allow developers to add a custom process (implementing the process interface)
* and attach it to the build component.
* Arguments
*   - name - the process name (must NOT appear in core processes)
*   - ProccessClassDefinition - the process class definition (NOT its object, as we internally handle them)
*   - _config - Optional, specifies the configuration object of this process. This will override the component's config of the build process.
* */
Build.prototype.custom = function AddCustomProcess(name, classDefinition, _config) {
  if(typeof name !== 'string' || !name) {
    throw new Error('Crux.build: custom() received invalid name');
  }
  if(hasProcess(name, 'core')) {
    throw new Error('Crux.build: custom() failed, "'+name+'" is a core process and cannot be defined as a custom one.');
  }
  if(hasProcess(name, 'custom')) {
    throw new Error('Crux.build: custom() failed, "'+name+'" was previously added.');
  }
  if(classDefinition instanceof Interface) {
    throw new Error('Crux.build: custom() failed, "'+name+'" must be the process class definition, not class instance.');
  }
  if(classDefinition.super_ !== Interface) {
    throw new Error('Crux.build: custom() failed, "'+name+'" must extend Build.Interface');
  }
  classDefinition.prototype.name = name;
  CUSTOM_PROCESSES.push({
    name: name,
    definition: classDefinition
  });
  if(typeof _config === 'object' && _config !== null) {
    this.config.process[name] = Crux.util.extend(true, this.config.process[name] || {}, _config);
  }
  return this;
};

/*
* Initializes the build component. It will check for requirements, instantiate the build classes
* and call their requirements() function.
* */
Build.prototype.init = function Initialize() {
  // We first load core processes found under config.process.
  _.forEach(this.config.process, function(processConfig, processName) {
    if(!hasProcess(processName)) {
      log.warn('Crux.build: "%s" is not loaded or does not exist. Skipping', processName);
      return;
    }
    var procDef = getProcess(processName),
      procConfig = Crux.util.extend(true, procDef.default || {}, processConfig);
    var procObj = new procDef(procConfig.extension);
    procObj.config = procConfig;
    if(procObj.config.path) {
      procObj.path(procObj.config.path);
    }
    bindProcess.call(this, procObj);
    // We want to allow each process to bind a subprocess, so we do that by attaching
    // the bind() function to each process.
    procObj.__proto__.bindEvents = bindProcess.bind(this);
    this.loaded.push(procObj);
    var dependencies = procObj.packages();
    if(typeof dependencies === 'string') dependencies = [dependencies];
    if(dependencies instanceof Array) {
      for(var i=0; i < dependencies.length; i++) {
        if(REQUIRED_INSTALLS.indexOf(dependencies[i]) !== -1) continue;
        REQUIRED_INSTALLS.push(dependencies[i]);
      }
    }
  }.bind(this));
};

/*
* Sets a configuration key in the component's internal config.
* NOTE: this is not recursive when accessing via the key.
* */
Build.prototype.set = function SetConfigProperty(key, value) {
  if(typeof key !== 'string' || key === '') {
    throw new Error('Crux.build: invalid configuration key via set()');
  }
  if(key === 'process') {
    throw new Error('Crux.build: configuration key "process" is restricted via set()');
  }
  this.config[key] = value;
  return this;
};

/*
* This will run the actual build process.
* */
Build.prototype.run = function RunBuild(runComplete) {
  var self = this;
  installRequirements.call(this, function(err) {
    if(err) return runComplete(err);
    var _runs = [];
    _.forEach(self.loaded, function(procObj) {
      procObj.init(self.config.process[procObj.name] || {});
      _runs.push(function(onRunComplete) {
        /* If the global build.config.auto_run is set to true, we will run all building systems that have run()
         * Otherwise, we will skip the run() functionality */
        if(!self.config.autoRun) {
          return onRunComplete();
        }
        /* If we have the global run enabled, we can also disable it at a process level. */
        if(procObj.config.autoRun === false) {
          return onRunComplete();
        }
        if(procObj.paths.length === 0) return onRunComplete();
        procObj.run(function(err) {
          if(err) return onRunComplete(err);
          // After we run it, we start watching it, if we can.
          if(self.config.autoWatch === false || procObj.config.autoWatch === false) {
            return onRunComplete();
          }
          procObj.watch(onRunComplete);
        });
      });
    });
    async.series(_runs, runComplete);
  });
};

/*
* This is a private function that will capture the events from a specific process
* and proxy them to the build component.
* */
function bindProcess(procObj) {
  var self = this;
  procObj
    .on('change', function onChange(path) {
      self.emit('change', procObj.name, path);
    }).on('build', function onBuild() {
      if(self.config.debug) {
        log.trace('Crux.build.' + procObj.name + " compiled.");
      }
      self.emit('build', procObj.name);
    }).on('error', function onProcessError(err) {
      if(self.listeners('error').length !== 0) {
        return self.emit('error', err);
      }
      log.error('Crux.build: Process %s encountered an error', procObj.name);
      log.debug(err);
    });
}

/*
* This is a private function that will install missing dependencies.
* */
function installRequirements(done) {
  var _calls = [];
  _.forEach(REQUIRED_INSTALLS, function(npmName) {
    _calls.push(function(done) {
      return Crux.util.install.npm(npmName, done, false);
    });
  });
  async.waterfall(_calls, done);
}

function hasProcess(name, type) {
  if(getProcess(name, type)) return true;
  return false;
}

function getProcess(name, type) {
  if(typeof type !== 'string') {
    type = 'all';
  }
  switch(type) {
    case 'core':
      for(var i=0; i < CORE_PROCESSES.length; i++) {
        if(CORE_PROCESSES[i].name === name) return CORE_PROCESSES[i].definition;
      }
      return null;
    case 'custom':
      for(var i=0; i < CUSTOM_PROCESSES.length; i++) {
        if(CUSTOM_PROCESSES[i].name === name) return CUSTOM_PROCESSES[i].definition;
      }
      return null;
    case 'all':
      return getProcess(name, 'core') || getProcess(name, 'custom');
    default:
      return null;
  }
}

// We load and expose our build processes.
Build.Processes = {
  Interface: Interface
};
var list = Crux.util.readDirectory(__dirname + '/process', 'js', null, true);
_.forEach(list, function(coreDep) {
  var name = Crux.util.getFileName(coreDep, false);
  name = Crux.util.capitalize(name);
  Build.Processes[name] = require(coreDep);
  CORE_PROCESSES.push({
    name: name.toLowerCase(),
    definition: Build.Processes[name]
  });
});

module.exports = Build;