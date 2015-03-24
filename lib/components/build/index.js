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

var Interface = require('./interface');
/**
 * The Crux build system is a core component designed to perform automatic building of code, thus enabling the developer to
 * focus on development rather than build tools, systems and configurations.<br/>
 * The build component makes use of build processes that implement the build process interface. In short, a build process
 * will watch (if configured) for changes on given file patterns/directories and run the build function on the modified changes.<br/>
 * It also provides various environment-specific configuration loading, useful for when building for development and other (production) environments.<br/><br/>
 *
 * <b>Note</b>: for a better documentation view, we've documented the build core component <b>{@link crux.Build.Build} class</b>.
 * Although its definition is not exposed through Crux's API, it is still accessible via <b>app.component('build')</b>, once the crux app has started.<br/>
 * <b>Note 2</b>: the crux.Build namespace contains each core process definition along with {@link crux.Build.Interface}.
 * @namespace crux.Build
 * */

var CORE_PROCESSES = [];
var CUSTOM_PROCESSES = [], // An array of {name:process, definition:processClass} added by developers.
  REQUIRED_INSTALLS = [];   // an array of installs.
Component.default({
  debug: true,
  autoRun: true, // Should we auto run all the build components when app starts. Default to true
  autoWatch: false, // Should we automatically watch all the build components. Defaults to false.
  process: {}     // This is where each process's configuration will be set. Each process is responsible for its own config.
}).require('log');

/**
 * The crux build core-component manages all registered build processes. It stands as an intermediator between the crux app
 * and the actual process.
 *
 * @class crux.Build.Build
 * @extends crux.Component
 * @property {Array} loaded - an array of loaded processes
 * @property {Object} config - the build component configuration object
 * @param {Object} config - Default configurations for the build component
 * @param {Boolean} config.debug - Enables or disables debug logging to the console
 * @param {Boolean} config.autoRun - Runs each build process on application run, thus re-compiling the specified sources. This overrides the autoRun property of each process
 * @param {Boolean} config.autoWatch - Automatically calls the watch function of each registered process. This should be used in development and overrides the autoWatch property of each process
 * @param {Object} config.process - A key-value object that holds the configuration for each individual process. This configuration is passed to the build process, for more information visit the processes documentation
 * */
var Build = function BuildComponent() {
  Build.super_.apply(this, arguments);
  this.name = 'build';
  this.loaded = []; // an array of loaded processes
};
Component.inherits(Build);

/**
* The function will manually enable a build component by setting the given configuration file
* in the build component. Thus, when running, the core component will be loaded. This allows us to
* enable or disable processes dynamically.
 *
 * @memberof crux.Build.Build
 * @function process
 * @param {String} name - The crux core process name
 * @param {Object} config - The configuration object assigned to the process.
 * @instance
 *
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

/**
* The function will allow developers to register a custom build process (implementing the process interface)
 * and attach it to the build component. As a restriction, the process name cannot be one of the core processes.<br/>
 * For a developer to define a custom crux build process, it must extend the build interface {@link crux.Build.Interface}.
 *
 * @memberof crux.Build.Build
 * @function custom
 * @param {String} name - the name of the custom process to be attached
 * @param {Function} processDefinition - the function prototype of the build component (extending crux.Build.Interface)
 * @param {Object} [config] - additional configuration object to be passed to the process
 * @instance
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
  CUSTOM_PROCESSES.push({
    name: name,
    definition: classDefinition
  });
  if(typeof _config === 'object' && _config !== null) {
    this.config.process[name] = Crux.util.extend(true, this.config.process[name] || {}, _config);
  }
  return this;
};

/**
 * Initializes the build component. The function will loop over all the registered build processes and check their crux
 * component dependencies, then itt will instantiate all registered processes (core + custom).
 * @memberof crux.Build.Build
 * @function init
 * @instance
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
    procObj.name = processName;
  }.bind(this));
};

/**
 * Manually set the given configuration object to the build component's internal configuration
 * Sets a configuration key in the component's internal config.<br/>
 * <b>Note</b>: this will not perform deep merge with the configuration and the <b>process</b> key is reserved and cannot be set
 *
 * @memberof crux.Build.Build
 * @function set
 * @instance
 * @param {String} name - the property in the config object to set
 * @param {Any} value - the value to set.
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

/**
* This will run the build component. In terms, it will loop over all registered build processes and install their external package requirements.<br/>
 * Once external packages are installed, each component will have its <b>init()</b> function called and their configuration attached to each process's <b>this.config</b><br/>
 * Finally, it wil asynchronously call their <b>run()</b> function, and if configured, their watch() function.
 *
 * @memberof crux.Build.Build
 * @function run
 * @instance
 * @param {Function} done - the on complete callback to be called after each process has started.
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

/**
* This is a private function that will capture the events from a specific process
* and proxy them to the build component.<br/>
 * <b>Note</b>: the build process interface extends node's EventEmitter, and should emit <b>at least</b> the following events:<br/>
 * - <b>change</b> - change to a watched file occurs<br/>
 * - <b>build</b> - the build process has been completed and output has been generated<br />
 * - <b>error</b> - the build process encounteres an error.
 * @memberof crux.Build.Build
 * @function bindProcess
 * @instance
 * @param {Process} procObj - the process object to listen to events from.
 * @private
* */
function bindProcess(procObj) {
  var self = this;
  procObj
    .on('change', function onChange(path) {
      self.emit('change', procObj.name, path);
    }).on('build', function onBuild(fileName) {
      if(self.config.debug) {
        var fname = '';
        if(typeof fileName === 'string') {
          fname = fileName.replace(path.normalize(global['__rootdir'] + '/'),'');
        }
        log.trace('Crux.build.' + procObj.name + " compiled %s.", fname);
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


// We load and expose our build processes. Note that these are exposed DIRECTLY under crux.Build (they are attached to crux in the main index.js file)
Build.Process = {
  Interface: Interface
};
var list = Crux.util.readDirectory(__dirname + '/process', 'js', null, true);
_.forEach(list, function(coreDep) {
  var name = Crux.util.getFileName(coreDep, false);
  name = Crux.util.capitalize(name);
  Build.Process[name] = require(coreDep);
  CORE_PROCESSES.push({
    name: name.toLowerCase(),
    definition: Build.Process[name]
  });
});

module.exports = Build;