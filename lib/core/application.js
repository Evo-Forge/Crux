var fs = require('fs'),
  path = require('path'),
  Component = require('./component'),
  Parser = require('./parser'),
  Logger = require('../util/log'),
  util = require('../util/util'),
  Registry = require('./registry');
/*
 * Crux application interface.
 * This will load the core component definitions, such as the global util, db, http, mongo, etc.
 * */

require('../util/globals');

global['__rootdir'] = path.normalize(process.cwd() + '/');

function createApp() {

  var initialized = false,
    started = false;

  var registryObj,
    componentConfig = {},
    appConfig = {},
    projectConfig = {
      crux: {
        extends: null,    // Folder where we place crux extended definitions
        components: null  // Additional crux components added by the developer.
      }
    };

  var app = function CruxApplication() {
    this.__components = ['log', 'service', 'server']; // Default components.
    registryObj = Registry.init(this);
  };

  /*
  * This function will set the path of a folder that will be used to extend different Crux components.
  * The extension is done with Crux.extend(). The path set here will be read and all js files will be
  * required. Relative to global['__rootdir']
  * */
  app.prototype.extends = function SetExtends(_path) {
    projectConfig.crux['extends'] = _path;
    return this;
  };

  /*
  * Manually override the default components.
  * Argument:
  *   names-  array of string components to load by default.
  *     or
  *   names - a string white-space delimited array of components to load by default.
  *   shouldReplace -should we replace the entire component list or just append.
  * */
  app.prototype.components = function SetDefaultCoreComponents(_names, _shouldReplace) {
    var names = (_names instanceof Array ? _names : _names.split(' '));
    if(_shouldReplace === true) {
      this.__components = names;
      return this;
    }
    for(var i=0; i < names.length; i++) {
      if(this.__components.indexOf(names[i].toLowerCase()) === -1) {
        this.__components.push(names[i].toLowerCase());
      }
    }
    return this;
  };

  /*
  * Manually sets the app's component path. Crux will then try and load all components found
  * in the given directory. Note: the pattern is "<directory=componentName>/index.js"
  * */
  app.prototype.componentPath = function SetComponentPath(_path) {
    projectConfig.crux['components'] = _path;
    return this;
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
    function ref(obj, str) {
      return str.split(".").reduce(function(o, x) { return o[x] }, obj);
    }
    if(config == null) {  // if it's null, we search for inner dotted configs.
      try {
        config = ref(projectConfig, name);
      } catch(e) {}
      try {
        config = util.extend(true, config || {}, ref(appConfig, name));
      } catch(e) {}
    }
    return config;
  }

  /*
  * This will register the project configuration file with the application. A project configuration
  * will set all the default configurations of the project.
  * */
  app.prototype.projectConfig = function SetProjectConfig(_path) {
    var parser = new Parser(path.normalize(__rootdir + _path));
    var result = parser.read();
    if(result instanceof Error) {
      result.message = '[Crux.projectConfig()] ' + result.message;
      throw result;
    }
    result = util.extend(true, projectConfig, result);
    projectConfig = result;
    if(typeof projectConfig['extends'] === 'string') {
      this.extends(projectConfig['extends']);
    }
    return this;
  };

  /*
  * This will set the configuration path of the Config component. Using this, will give
  * the ConfigComponent the path to the configuration file to be used in the application.
  * This is configuration available everywhere in the Crux.application
  * */
  app.prototype.appConfig = function SetApplicationConfig(_path) {
    var result;
    if(typeof _path === 'object' && _path !== null) {
      appConfig = util.extend(true, appConfig, _path);
      return this;
    }
    var parser = new Parser(path.normalize(__rootdir + _path));
    result = parser.read();
    if(result instanceof Error) {
      result.message = '[Crux.appConfig()] ' + result.message;
      throw result;
    }
    appConfig = result;
    return this;
  };

  /*
  * This will allow us to use app.config as the application's configuration object.
  * */
  app.prototype.__defineGetter__('config', function() {
    return appConfig;
  });


  /*
   * Sets the global rootpath of the crux application. If not set,
   * the application will work with global['__rootdir']'s directory
   * */
  app.prototype.path = function SetGlobalPath(_path) {
    global['__rootdir'] = path.normalize(_path + '/');
    return this;
  };

  /*
  * Returns or sets the working environment of the application. By default, it is set
  * to development.
  * */
  app.prototype.environment = function GetSetEnvironment(value) {
    if(typeof value !== 'string' || value === '') {
      if(typeof global['NODE_ENV'] !== 'string') {
        global['NODE_ENV'] = detectEnvironment();
      }
      return global['NODE_ENV'];
    }
    global['NODE_ENV'] = value;
    return this;
  };

  /*
    Private function that tries to detect the application's environment.
    The environment of an application can be set by either (with the following priority)
      1. Passing it as a command line argument.
      2. Specifying the NODE_ENV environment variable
      3. Default environment set to development
  */
  function detectEnvironment() {
    var _default = 'development';
    if(process.argv.length > 2) {
      for(var i=0; i < process.argv.length; i++) {
        var prop = process.argv[i];
        if(prop.toLowerCase().indexOf('env=') === -1) continue;
        var env = prop.split('env=')[1] || null;
        if(env) return env;
      }
    }
    if(typeof process.env.NODE_ENV === 'string' && process.env.NODE_ENV !== '') return process.env.NODE_ENV;
    return _default;
  }

  /*
  * This will initialize the application by creating all the included components.
  * Once the application is initialized, access to components is granted from
  * the app.js file.
  * */
  app.prototype.init = function InitializeApplication() {
    if(initialized) return this;
    // We first set the environment data if not previously set.
    this.environment();
    // We first check if we have any extend path. If we do, we require them first.
    if(projectConfig.crux.extends !== null) {
      var files;
      try {
        files = util.readDirectory(path.normalize(__rootdir + projectConfig.crux.extends));
      } catch(e) {
        // We have no extendings.
        console.log(e);
        console.warn('Crux.app: extend folder "%s" is not available.', projectConfig.crux.extends);
      }
      if(files instanceof Array) {
        _.forEach(files, function(extendFile) {
          require(extendFile);
        });
      }
    }
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
        e.message = "[Crux.run()] " + e.message;
        throw e;
      }
      if(typeof CompClass !== 'function' || CompClass.prototype.__type !== 'CruxComponent') {
        throw new Error('[Crux.run()] Crux component "' + compName+  '" does not extend Crux.Component');
      }
      var compConfig = getComponentConfiguration(compName);
      // We check if the component requires configuration by default before instantiating
      if(CompClass.prototype.__configuration === true) {
        if(typeof compConfig !== 'object' || compConfig == null) {
          throw new Error('[Crux.run()] Crux component "'+compName+'" requires configuration before instantiating, either with configureComponent() or in project configuration');
        }
      }
      var compObj = new CompClass(compConfig, appConfig);
      if(compObj.name === 'CruxComponent') {
        log.warn('Crux.application: Skipping component with no name', compObj);
      }
      registryObj.register(compObj);
      compObj.registry(registryObj);
    });
    // We then try and check if we have any crux components.
    initCustomComponents.call(this);

    initialized = true;
  };

  /*
  * Manually initializes the custom components given by the user in the componentPath
  * */
  function initCustomComponents() {
    if(typeof projectConfig.crux.components !== 'string') {
      return false;
    }
    var componentPath = path.normalize(global['__rootdir'] + '/' + projectConfig.crux.components + '/'),
      componentList;
    try {
      componentList = util.readDirectoryRelative(componentPath, 'directory', null, true);
    } catch(e) {
      // there are no app components.
      return false;
    }
    _.forEach(componentList, function(compName) {
      try {
        var CompClass = require(path.normalize(componentPath + '/' + compName + '/index.js'));
      } catch(e) {
        if(e.message.indexOf('Cannot find module') !== -1) {
          log.warn('Crux.application: Custom component "%s" does not have index.js. Skipping...', compName);
          return;
        }
        e.message = "[Crux.run()] " + e.message;
        throw e;
      }
      if(typeof CompClass !== 'function' || CompClass.prototype.__type !== 'CruxComponent') {
        throw new Error('[Crux.run()] Crux custom component "' + compName+  '" does not extend Crux.Component');
      }
      var compConfig = getComponentConfiguration(compName);
      var compObj = new CompClass(compConfig, appConfig);
      if(compObj.name === 'CruxComponent') {
        compObj.name = compName;
      }
      registryObj.register(compObj);
      compObj.registry(registryObj);
    });
  }

  /*
  * Once the Crux application has been initialized, it will allow access to instantiated components.
  * */
  app.prototype.component = function GetComponent(name) {
    if(!initialized) {
      throw new Error('Crux application is not initialized. Please run init() before requesting any component');
    }
    var compObj = registryObj.get(name);
    if(!compObj) {
      throw new Error('Crux.application: component "'+name+'" is not registered');
    }
    return compObj;
  };

  /*
   * This will add a component to the application.
   * Arguments:
   *   component - string -> the component definition inside lib/components/<name>
   *             - object - an instance of CruxComponent
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
        e.message = 'Component "' + component + '" is not supported by Crux.';
        throw e;
      }
      this.__components.push(component);
      if(typeof _config !== 'undefined') {
        componentConfig[component] = _config;
      }
      return this;
    }
    if(_.isCruxComponent(component)) {
      var _exists = this.__components.indexOf(component.name);
      if(_exists !== -1) {
        this.__components.splice(_exists, 1);
      }
      registryObj.register(component);
      component.registry(registryObj);
      var config = getComponentConfiguration(component.name);
      component.extendConfig(config);
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
      throw new Error('Component "' + name + '" is not registered with the Crux app.');
    }
    if(initialized) {
      var compObj = registryObj.get(name);
      if(!compObj) {
        throw new Error('Component "' + name + '" is not registered with the Crux app.');
      }
      compObj.config = util.extend(true, compObj.config || {}, config);
      return this;
    }
    if(started) {
      throw new Error('Crux.application: Component "'+name+'" can be configured with configureComponent() only before calling app.run() ');
    }
    componentConfig[name] = config;
    return this;
  };

  /*
  * This will start the application and load/run all components
  * */
  app.prototype.run = function RunApplication(callback) {
    if(started) return false;
    started = true;
    process.nextTick(function() {
      this.init();
      log.info('Crux.application: starting in "%s" mode', this.environment());
      /* After we've created all our components, we run them from the registry */
      registryObj.initialize(function(err) {
        if(err) {
          log.error('Crux component "%s": failed to initialize. Shutting down...', err.component);
          log.debug(err);
          setTimeout(function() {
            process.exit(1);
          }, 1200);
          return;
        }
        if(typeof callback === 'function') callback();
      });
    }.bind(this));
    return true;
  };

  return app;
}

module.exports = createApp;