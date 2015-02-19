var async = require('async');
/*
* This is the Crux component registry, where all components end up.
* */
var ComponentModel = require('./component')(),
  KUtil = require('../util/util');

function initRegistry(appObj) {
  var LOADED_COMPONENTS = {},
    EXECUTION_QUEUE = [];

  /**
   * This is the Crux component registry. It acts as a repository for all loaded components and
   * handles dependencies between them.<br>
   *   This is a core module and is not exposed, as it should not be tempered with.
   * @name crux.Registry
   * @class crux.Registry
  * */
  var registry = function CruxRegistry() {
    this.__loaded = [];
  };

  /**
   * Registers a component with the registry. At this point, the component is only instantiated but not initialized.
   * @function
   * @memberof crux.Registry
   * @param {crux.Component} component - the component instance to add to the registry.
   * */
  registry.prototype.register = function RegisterComponent(compObj) {
    if(!_.isCruxComponent(compObj)) {
      throw new Error('Component is not an instance of Crux.Component in registry.create()');
    }
    if(typeof LOADED_COMPONENTS[compObj.name] !== 'undefined') {
      throw new Error('Component ' + compObj.name + ' was previously created in the registry');
    }
    /* Components with no dependency are placed in the top of the queue */
    if(compObj.requirements().length === 0) {
      EXECUTION_QUEUE.unshift(compObj.name);
    } else {
      EXECUTION_QUEUE.push(compObj.name);
    }
    LOADED_COMPONENTS[compObj.name] = compObj;
  };

  /**
  * Checks if the registry contains a given component
   * @function
   * @memberof crux.Registry
   * @param {string} name - the component name
   * @returns {boolean}
  * */
  registry.prototype.has = function HasComponent(name) {
    if(typeof LOADED_COMPONENTS[name] === 'undefined') return false;
    return true;
  };

  /**
   * Returns a loaded component by its name.
   * @function
   * @memberof crux.Registry
   * @param {string} name - the component name
   * @returns {crux.Component}
   * */
  registry.prototype.get = function GetComponent(name) {
    if(typeof LOADED_COMPONENTS[name] === 'undefined') return null;
    return LOADED_COMPONENTS[name];
  };

  /**
   * This method can and should be used to attach specific functionality from one component
   * to another (if it exists). <br>This is how we semi-enforce code injection from one component
   * to another. <br>In current versions, this is heavily used in core components, but can also
   * be used outside of them. If a component does not exist, we will do nothing.<br>
   * @function
   * @memberof crux.Registry
   * @param {string|crux.Component[]} component - the name of the component (either as an array or as a string delimited by space)
   * @param {string} functionName - the function name we want to pass to the component's internal attach()
   * @param {function} callback - the function callback to be attached to the component under functionName.
  * */
  registry.prototype.attachTo = function AttachFunctionToComponent(componentName, functionName, functionCallback) {
    try {
      var components = (componentName instanceof Array ? componentName : componentName.split(' '));
      for(var i=0; i < components.length; i++) {
        if(typeof components[i] !== 'string') throw new Error("NOT_STRING");
      }
    } catch(e) {
      throw new Error('Crux.registry: attach() received invalid componentName (must be a string or an array of strings)');
    }
    if(typeof functionName !== 'string' || typeof functionCallback === 'undefined') {
      throw new Error('Crux.registry: attach() received invalid functionName or functionCallback');
    }
    for(var i=0; i < components.length; i++) {
      var compObj = this.get(components[i]);
      if(!compObj) continue
      compObj.attach(functionName, functionCallback);
    }
    return this;
  };

  /**
   * This will try to run a single previously registered component and call the callback when ready.<br>
   * Before actually running the component, it will check for any dependencies.
   * @function
   * @memberof crux.Registry
   * @param {string} name - the component name to run.
   * @param {function} callback - the callback function to call after running it.
   * */
  registry.prototype.run = function RunComponentRunComponent(name, _callback) {
    if(typeof _callback !== 'function') {
      throw new Error('Registry.run requires a callback function.');
    }
    if(this.__loaded.indexOf(name) !== -1) {
      _callback(new Error('PREVIOUSLY_REGISTERED'));
      return false;
    }
    var compObj = LOADED_COMPONENTS[name];
    if(!compObj) {
      var _err = new Error('Component ' + name + ' was not previously created.');
      _err.component = name;
      _callback(_err);
      return false;
    }
    this.checkDependency(compObj, function(err) {
      if(err) return _callback(err);
      compObj.run(function(err) {
        if(err) {
          err.component = name;
          return _callback(err);
        }
        compObj.emit('run');
        this.__loaded.push(name);
        _callback();
      }.bind(this));
    }.bind(this));
    return true;
  };

  /**
   * Checks the required dependency list of a given component.
   * @function
   * @memberof crux.Registry
   * @param {crux.Component} component - the component to check the dependency against
   * @param {function} callback - the callback function to be called after checking.
   * */
  registry.prototype.checkDependency = function CheckComponentDependency(compObj, _done) {
    if(compObj.requirements().length === 0) {
      return _done(null);
    }
    var _calls = [],
      self = this;
    _.forEach(compObj.requirements(), function(reqName) {
      if(typeof LOADED_COMPONENTS[reqName] === 'undefined') {
        throw new Error('[Crux.Registry] Component dependency called "' + reqName + '" of "' + compObj.name + '" is not loaded.');
      }
      _calls.push(function(done) {
        self.run(reqName, function(err) {
          if(err && err.message === 'PREVIOUSLY_REGISTERED') return done();
          if(err) return done(err);
          return done();
        });
      });
    });
    async.series(_calls, _done);
  };

  /**
   * This will start up and initialize the registry and all its components. <br>
   * Before the initialization process of each component, the registry will try and install all the component's defined required packages
   * @function
   * @memberof crux.Registry
   * @param {function} callback - the callback function to be called after the registry has initialized all its components.
   * */
  registry.prototype.initialize = function InitializeRegistry(_callback) {
    var _calls = [],
      self = this;

    var _installs = [];
    // First thing we do is install its packages.
    var calls = [],
      packages = [];
    for(var i=0; i < EXECUTION_QUEUE.length; i++) {
      var name = EXECUTION_QUEUE[i];
      var compObj = LOADED_COMPONENTS[name];
      var installs = compObj.packages() || [];
      if(typeof installs === 'string') installs = [installs];
      packages = packages.concat(installs);
    }
    _.forEach(packages, function(packageName) {
      calls.push(function(done) {
        KUtil.install.npm(packageName, done, false);
      });
    });
    async.series(calls, function(err) {
      if(err) {
        return _callback(err);
      }
      // We now can init() the components.
      for(var i= 0; i < EXECUTION_QUEUE.length; i++) {
        var name = EXECUTION_QUEUE[i];
        var compObj = LOADED_COMPONENTS[name];
        if(typeof compObj === 'undefined') continue;
        if(typeof compObj.init !== 'function') continue;
        try {
          LOADED_COMPONENTS[name].init();
        } catch(e) {
          e.component = compObj.name;
          return _callback(e);
        }
      }
      _.forEach(EXECUTION_QUEUE, function(name) {
        _calls.push(function(done) {
          var compName = name;
          try {
            self.run(name, function(err) {
              if(err) {
                if(err.message === 'PREVIOUSLY_REGISTERED') return done();
                return done(err);
              }
              return done();
            });
          } catch(err) {
            err.component = compName;
            return done(err);
          }
        });
      });
      async.series(_calls, function(err) {
        _callback(err);
      });
    });
  };

  return new registry();
}


module.exports = {
  init: initRegistry
};