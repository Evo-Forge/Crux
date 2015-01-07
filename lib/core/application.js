var fs = require('fs'),
  path = require('path'),
  Component = require('./component'),
  Parser = require('./parser'),
  Logger = require('../util/log'),
  util = require('../util/util'),
  Registry = require('./registry');
/*
 * Krux application interface.
 * This will load the core component definitions, such as the global util, db, http, mongo, etc.
 * */

require('../util/globals');

global['__rootdir'] = path.normalize(process.cwd());

function createApp() {

  var initialized = false,
    started = false;

  var registryObj,
    componentConfig = {},
    projectConfig = {},
    appConfig = {};

  var app = function KruxApplication() {
    this.__components = ['log', 'service', 'server']; // Default components.
    registryObj = Registry.init(this);
  };

  /*
  * Manually override the default components.
  * Argument:
  *   names-  array of string components to load by default.
  *     or
  *   names - a string white-space delimited array of components to load by default.
  * */
  app.prototype.components = function SetDefaultCoreComponents(_names) {
    var names = (_names instanceof Array ? _names : _names.split(' '));
  };

  /*
   * Returns the configuration object of a given component or null if not found.
   * */
  function getComponentConfiguration(name) {
    var config = null;
    if(typeof projectConfig[name] === 'object') {
      config = projectConfig[name];
    }
    if(typeof componentConfig[name] === 'object') {
      if(config == null) config = {};
      config = util.extend(true, config, componentConfig[name]);
    }
    if(typeof appConfig[name] === 'object') {
      if(config == null) config = {};
      config = util.extend(true, config, appConfig[name]);
    }
    return config;
  };

  /*
  * This will register the project configuration file with the application. A project configuration
  * will set all the default configurations of the project.
  * */
  app.prototype.projectConfig = function SetProjectConfig(_path) {
    var parser = new Parser(_path);
    var result = parser.read();
    if(result instanceof Error) {
      result.message = '[Krux.projectConfig()] ' + result.message;
      throw result;
    }
    projectConfig = result;
    return this;
  };

  /*
  * This will set the configuration path of the Config component. Using this, will give
  * the ConfigComponent the path to the configuration file to be used in the application.
  * This is configuration available everywhere in the Krux.application
  * */
  app.prototype.appConfig = function SetApplicationConfig(_path) {
    var parser = new Parser(_path);
    var result = parser.read();
    if(result instanceof Error) {
      result.message = '[Krux.appConfig()] ' + result.message;
      throw result;
    }
    appConfig = result;
    return this;
  };


  /*
   * Sets the global rootpath of the krux application. If not set,
   * the application will work with process.cwd()'s directory
   * */
  app.prototype.path = function SetGlobalPath(_path) {
    global['__rootdir'] = _path;
    return this;
  };

  /*
  * This will initialize the application by creating all the included components.
  * Once the application is initialized, access to components is granted from
  * the app.js file.
  * */
  app.prototype.init = function InitializeApplication() {
    if(initialized) return this;
    // We first load all our string components.
    _.forEach(this.__components, function(compName) {
      if(compName === 'log') {
        var logObj = new Logger(getComponentConfiguration('log'));
        registryObj.register(logObj);
        logObj.registry(registryObj);
        return;
      }
      try {
        var CompClass = require('../components/' + compName + '/index.js');
      } catch(e) {
        e.message = "[Krux.run()] " + e.message;
        throw e;
      }
      if(typeof CompClass !== 'function' || CompClass.prototype.__type !== 'KruxComponent') {
        throw new Error('[Krux.run()] Krux component "' + compName+  '" does not extend Krux.Component');
      }
      var compConfig = getComponentConfiguration(compName);
      // We check if the component requires configuration by default before instantiating
      if(CompClass.prototype.__configuration === true) {
        if(typeof compConfig !== 'object' || compConfig == null) {
          throw new Error('[Krux.run()] Krux component "'+compName+'" requires configuration before instantiating, either with configureComponent() or in project configuration');
        }
      }
      var compObj = new CompClass(compConfig, appConfig);
      if(compObj.name === 'KruxComponent') {
        log.warn('Krux.application: Skipping  component with no name', compObj);
      }
      registryObj.register(compObj);
      compObj.registry(registryObj);
    });
    initialized = true;
  };

  /*
  * Once the Krux application has been initialized, it will allow access to instantiated components.
  * */
  app.prototype.component = function GetComponent(name) {
    if(!initialized) {
      throw new Error('Krux application is not initialized. Please run init() before requesting any component');
    }
    var compObj = registryObj.get(name);
    if(!compObj) {
      throw new Error('Krux.application: component "'+name+'" is not registered');
    }
    return compObj;
  };

  /*
   * This will add a component to the application.
   * Arguments:
   *   component - string -> the component definition inside lib/components/<name>
   *             - object - an instance of KruxComponent
   *   _config - an optional configuration object to pass to the component when initialized.
   * */
  app.prototype.addComponent = function AddComponent(component, _config) {
    if(typeof component === 'string') {
      component = component.toLowerCase();
      if(this.__components.indexOf(component) !== -1) {
        throw new Error('Component ' + component + ' is already required.');
      }
      try {
        var compPath = path.normalize(__dirname + "/../components/" + component + '/index.js');
        var exists = fs.existsSync(compPath);
        if(!exists) {
          throw new Error();
        }
      } catch(e) {
        e.message = 'Component "' + component + '" is not supported by Krux.';
        throw e;
      }
      this.__components.push(component);
      if(typeof _config !== 'undefined') {
        componentConfig[component] = _config;
      }
      return this;
    }
    if(_.isKruxComponent(component)) {
      var _exists = this.__components.indexOf(component.name);
      if(_exists !== -1) {
        this.__components.splice(_exists, 1);
      }
      registryObj.register(component);
      component.registry(registryObj);
      return this;
    }
    throw new Error('Invalid component argument received.');
  };

  /*
  * This will configure a given previously registered component. It can be used to bypass the configuration
  * file of the application.
  * Arguments:
  *     - componentName - the name string of the component
  *     - componentConfig - the object to configure it with.
  * */
  app.prototype.configureComponent = function ConfigureComponent(name, config) {
    if(this.__components.indexOf(name) === -1) {
      throw new Error('Component "' + name + '" is not registered with the Krux app.');
    }
    componentConfig[name] = config;
    return this;
  }

  /*
  * This will start the application and load/run all components
  * */
  app.prototype.run = function RunApplication(callback) {
    if(started) return false;
    started = true;
    process.nextTick(function() {
      this.init();
      /* After we've created all our components, we run them from the registry */
      registryObj.initialize(function(err) {
        if(err) {
          console.log(err);
        }
        console.log("Registry initialzied")
      });
    }.bind(this));
    return true;
  };

  return app;
}

module.exports = createApp;