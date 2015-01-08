var async = require('async');
/*
* This is the Krux component registry, where all components end up.
* */
var ComponentModel = require('./component')(),
  KUtil = require('../util/util');

function initRegistry(appObj) {
  var LOADED_COMPONENTS = {},
    EXECUTION_QUEUE = [];

  var registry = function KruxRegistry() {
    this.__loaded = [];
  };

  /*
   * Creates an entry in the registry.
   * */
  registry.prototype.register = function RegisterComponent(compObj) {
    if(!_.isKruxComponent(compObj)) {
      throw new Error('Component is not an instance of Krux.Component in registry.create()');
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

  /*
  * Checks if the registry contains a given component
  * */
  registry.prototype.has = function HasComponent(name) {
    if(typeof LOADED_COMPONENTS[name] === 'undefined') return false;
    return true;
  }

  /*
   * Returns a given component.
   * */
  registry.prototype.get = function GetComponent(name) {
    if(typeof LOADED_COMPONENTS[name] === 'undefined') return null;
    return LOADED_COMPONENTS[name];
  }

  /*
  * This method can and should be used to attach specific functionality from one component
  * to another (if it exists). This is how we semi-enforce code injection from one component
  * to another. In current versions, this is heavily used in core components, but can also
  * be used outside of them. If a component does not exist, we will do nothing.
  *
  * Arguments:
  *     componentName - the name of the component (either as an array or as a string delimited by space)
  *     functionName - the function name we want to pass to the component's internal attach()
  *     functionCallback - the function's callback
  * */
  registry.prototype.attachTo = function AttachFunctionToComponent(componentName, functionName, functionCallback) {
    try {
      var components = (componentName instanceof Array ? componentName : componentName.split(' '));
      for(var i=0; i < components.length; i++) {
        if(typeof components[i] !== 'string') throw new Error("NOT_STRING");
      }
    } catch(e) {
      throw new Error('Krux.registry: attach() received invalid componentName (must be a string or an array of strings)');
    }
    if(typeof functionName !== 'string' || typeof functionCallback === 'undefined') {
      throw new Error('Krux.registry: attach() received invalid functionName or functionCallback');
    }
    for(var i=0; i < components.length; i++) {
      var compObj = this.get(components[i]);
      if(!compObj) continue
      compObj.attach(functionName, functionCallback);
    }
    return this;
  };

  /*
   * This will try to run a single previously registered component and call the callback when ready.
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
    // First thing we do is install its packages.
    var _installs = [],
      packages = compObj.packages() || [];
    if(typeof packages === 'string') packages = [packages];
    _.forEach(packages, function(packageName) {
      _installs.push(function(installed) {
        KUtil.install.npm(packageName, installed);
      });
    });
    async.series(_installs, function(err) {
      if(err) return _callback(err);
      this.checkDependency(compObj, function(err) {
        if(err) return _callback(err);
        try {
          compObj.init();
        } catch(e) {
          e.component = compObj.name;
          return _callback(e);
        }
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
    }.bind(this));
    return true;
  };

  /*
   * Checks the required dependency of a given component.
   * */
  registry.prototype.checkDependency = function CheckComponentDependency(compObj, _done) {
    if(compObj.requirements().length === 0) {
      return _done(null);
    }
    var _calls = [],
      self = this;
    _.forEach(compObj.requirements(), function(reqName) {
      if(typeof LOADED_COMPONENTS[reqName] === 'undefined') {
        throw new Error('[Krux.Registry] Component dependency called "' + reqName + '" of "' + compObj.name + '" is not loaded.');
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

  /*
   * This will start up the registry.
   * */
  registry.prototype.initialize = function InitializeRegistry(_callback) {
    var _calls = [],
      self = this;
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
  };

  return new registry();
}


module.exports = {
  init: initRegistry
};