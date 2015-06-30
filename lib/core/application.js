var fs = require('fs'),
  path = require('path'),
  events = require('events'),
  Component = require('./component'),
  Parser = require('./parser'),
  Logger = require('../util/log'),
  util = require('../util/util'),
  sysUtil = require('util'),
  Registry = require('./registry');
/*
 * Crux application interface.
 * This will load the core component definitions, such as the global util, db, http, mongo, etc.
 * */

require('../util/globals');

/**
 * The project's root full path
 * @global
 * */
global.__rootdir = path.normalize(process.cwd() + '/');

function createApp() {

  var initialized = false,
    started = false;

  var configEnv = null, // we use this path to dynamically load configuration files based on the environment
    registryObj,
    appName = null, // Utility property that can be used to name applications
    componentConfig = {},
    appConfig = {},
    projectConfig = {
      crux: {
        extends: null,    // Folder where we place crux extended definitions
        components: null  // Additional crux components added by the developer.
      }
    };

  /**
   * The main Crux application class, tying up all the information about a crux application. Keep in mind that this is a
   * singleton instance of a crux application. Every application must start by requiring crux.app in its index.js (or app.js) file.
   * This will create a singleton instance of crux.Application and initializing the namespace required for it.<br>
   *   This is a core module and is not exposed by the framework. It only holds the representation of crux.app's member.
   * @class crux.Application
   * */
  var app = function CruxApplication() {
    this.__components = ['log', 'service', 'server']; // Default components.
    this.__instances = [];
    registryObj = Registry.init(this);
    events.EventEmitter.call(this);
  };
  sysUtil.inherits(app, events.EventEmitter);

  /**
   * We can also name our application. This is mostly useful when using the same codebase for multiple server launches to dynamically check
   * component loading. NOTE that we can only name ONCE the application.
   *  This is both a setter & a getter of the application name.
   * @function
   * @memberof crux.Application
   * */
  app.prototype.name = function AppName(_value) {
    if (typeof _value === 'string' && _value) {
      if (typeof appName !== 'string') {
        appName = _value;
      }
      return this;
    }
    return appName;
  };

  /*
   * Private utility function, checks if our app has at least one of the given names.
   * */
  app.prototype.hasName = function HasName(_arr) {
    var names = (_arr instanceof Array) ? _arr : Array.prototype.slice.call(arguments);
    if (appName == null) return false;
    for (var i = 0; i < names.length; i++) {
      if (names[i] === appName) return true;
    }
    return false;
  };

  /**
   * This function will set the path of a folder that will be used to extend different Crux components.
   * The extension is done with Crux.extend(). The path set here will be read and all js files will be
   * required. Relative to global['__rootdir']
   * @function
   * @memberof crux.Application
   * */
  app.prototype.extends = function SetExtends(_path) {
    projectConfig.crux['extends'] = _path;
    return this;
  };

  /**
   * Manually override the default components (log, service, server) of the application.
   * @function
   * @memberof crux.Applicationlication
   * @param {array|component} components - an array of core component names OR crux component instances we want to start the app with
   * @param {boolean} [shouldReplace] - if set to true, the given array of components will replace the default ones. Otherwise, they will be added to them.
   * */
  app.prototype.components = function SetDefaultCoreComponents(_names, _shouldReplace) {
    var names = (_names instanceof Array ? _names : _names.split(' '));
    if (_shouldReplace === true) {
      this.__components = names;
      return this;
    }
    for (var i = 0; i < names.length; i++) {
      if (this.__components.indexOf(names[i].toLowerCase()) === -1) {
        this.__components.push(names[i].toLowerCase());
      }
    }
    return this;
  };

  /**
   * Manually sets the app's component path. Crux will then try and load all components found
   * in the given directory. Note: the minimal pattern for a component's structure is [directory=componentName]/index.js
   * @function
   * @memberof crux.Applicationlication
   * @param {string} path - the path to the folder containing custom crux components
   * */
  app.prototype.componentPath = function SetComponentPath(_path) {
    projectConfig.crux['components'] = _path;
    return this;
  };

  /**
   * Returns the configuration object of a previously registered  component or null if either the componet was found or it has no configuration attached.
   * @function
   * @memberof crux.Applicationlication
   * @param {string} name - the component name.
   * */
  function getComponentConfiguration(name) {
    var config = {};
    if (typeof projectConfig[name] === 'object') {
      config = projectConfig[name];
    }
    if (typeof componentConfig[name] === 'object') {
      if (config == null) config = {};
      config = util.extend(true, config, componentConfig[name]);
    }
    if (typeof appConfig[name] === 'object') {
      if (config == null) config = {};
      config = util.extend(true, config, appConfig[name]);
    }
    function ref(obj, str) {
      return str.split(".").reduce(function(o, x) {
        return o[x]
      }, obj);
    }

    if (config == null) {  // if it's null, we search for inner dotted configs.
      try {
        config = ref(projectConfig, name);
      } catch (e) {
      }
      try {
        config = util.extend(true, config || {}, ref(appConfig, name));
      } catch (e) {
      }
    }
    return config;
  }

  /**
   * The function will register and set the project configuration file with the application.
   * The project configuration of a given application should contain settings that will rarely, if ever change. These settings
   * usually contain path settings, custon namings and so on. The project configuration file must have one of crux.parser's formats
   * Current supported formats: [json|js|yml]
   * @function
   * @memberof crux.Applicationlication
   * @param {string} path - path to the configuration file.
   * */
  app.prototype.projectConfig = function SetProjectConfig(_path) {
    var parser = new Parser(path.normalize(__rootdir + _path), true);
    var result = parser.read();
    if (result instanceof Error) {
      result.message = '[Crux.projectConfig()] ' + result.message;
      throw result;
    }
    result = util.extend(true, projectConfig, result);
    projectConfig = result;
    if (typeof projectConfig['extends'] === 'string') {
      this.extends(projectConfig['extends']);
    }
    return this;
  };

  /**
   * The function will set the path of environment-specific configuration files that are dynamically loaded on runtime, after
   * crux has determined the running environment. Applications that make use of multiple environment configuration files
   * will find this useful, because the main app.js file will not be polluted with if else's
   * @function
   * @memberof crux.Applicationlication
   * @param {string} dirPath - the path to the directory containing the environment configuration files. This is usually config/
   * @param {extension} [extension] - the extension to use when searching for the environment configuration file. Defaults to js
   * */
  app.prototype.envConfig = function SetEnvironmentConfig(_dirPath, extension) {
    if (_.isString(_dirPath)) {
      var tmp = _dirPath;
      configEnv = {
        path: tmp,
        ext: extension || 'js'
      }
    }
    return this;
  };

  /**
   * The function will set application specific settings that are usually declared at runtime. These
   * settings are merged with environment and project configuration at runtime.
   * @function
   * @memberof crux.Applicationlication
   * @param {string|object} config - the path to the application configuration file OR an object containing the actual configuration object.
   * */
  app.prototype.appConfig = function SetApplicationConfig(_path) {
    var result;
    if (typeof _path === 'object' && _path !== null) {
      appConfig = util.extend(true, appConfig, _path);
      return this;
    }
    var parser = new Parser(path.normalize(__rootdir + _path), true);
    result = parser.read();
    if (result instanceof Error) {
      result.message = '[Crux.appConfig()] ' + result.message;
      throw result;
    }
    appConfig = util.extend(true, appConfig, result);
    return this;
  };

  /**
   * This property contains the configuration object of the application. This is created at runtime when first requested,
   * by merging all the configuration objects together. It is also available everywhere in the application through app.config.
   * @member {object} config
   * @memberof crux.Application
   * */
  app.prototype.__defineGetter__('config', function() {
    return util.extend(true, projectConfig, appConfig);
  });


  /**
   * The function sets in place the root path of the project under global.__rootdir, and will be used
   * by all crux core components. If it is not programatically set, it will default to process.cwd()
   * @function
   * @memberof crux.Application
   * @param {string} path - the root directory path of the project.
   * */
  app.prototype.path = function SetGlobalPath(_path) {
    global['__rootdir'] = path.normalize(_path + '/');
    return this;
  };

  /**
   * The function acts as both a getter and a setter to the application's environment.
   * As a convenience, the environment variable is set under global.NODE_ENV.
   * The environment detection mechanism will look first for --env=[environmentName] in the process argv.
   * It then checks the process.env.NODE_ENV. If no information is found, it will default to development.<br>
   * NOTE: In order to programatically set the application's environment, it must be called prior to app.init() or app.run()
   * @function
   * @memberof crux.Application
   * @param {string} [value] - the environment variable to be used by the application.
   * @returns {string|app}
   * */
  app.prototype.environment = function GetSetEnvironment(value) {
    if (typeof value !== 'string' || value === '') {
      if (typeof global['NODE_ENV'] !== 'string') {
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
    if (process.argv.length > 2) {
      for (var i = 0; i < process.argv.length; i++) {
        var prop = process.argv[i];
        if (prop.toLowerCase().indexOf('env=') === -1) continue;
        var env = prop.split('env=')[1] || null;
        if (env) return env;
      }
    }
    if (typeof process.env.NODE_ENV === 'string' && process.env.NODE_ENV !== '') return process.env.NODE_ENV;
    return _default;
  }

  /**
   * This will initialize the application by instantiating all previously-registered components.<br>
   * It will also load any custom components (if componentPath was called before init())<br>
   * The lifecycle of a component is explained in detail under the component section. <br>
   * In short, it is:<br>
   *   1. new component()<br>
   *   2. componentInstance.init(componentConfiguration)<br>
   *   3. componentInstance.run(callback)<br><br>
   * Once a component is initialized, its instance is exposed and accessible via app.component([name])
   * @function
   * @memberof crux.Application
   * */
  app.prototype.init = function InitializeApplication() {
    if (initialized) return this;
    // We first set the environment data if not previously set.
    this.environment();
    // We first check if we have any extend path. If we do, we require them first.
    if (projectConfig.crux.extends !== null) {
      var files;
      try {
        files = util.readDirectory(path.normalize(__rootdir + projectConfig.crux.extends));
      } catch (e) {
        // We have no extendings.
        console.log(e);
        console.warn('Crux.app: extend folder "%s" is not available.', projectConfig.crux.extends);
      }
      if (files instanceof Array) {
        _.forEach(files, function(extendFile) {
          require(extendFile);
        });
      }
    }
    // We have a config environment set, we try to load the correct config file.
    if (configEnv) {
      var configPath = path.normalize(configEnv.path + '/' + global['NODE_ENV'] + '.' + configEnv.ext);
      try {
        this.appConfig(configPath);
      } catch (e) {
        console.warn('No environment configuration found in %s, skipping.', configPath);
        console.log(e);
      }
    }
    // We first load all our string components.
    _.forEach(this.__components, function(compName) {
      if (compName.indexOf('custom:') !== -1) return;  // we skip custom components
      if (compName === 'log') {
        var logObj = new Logger(getComponentConfiguration('log'));
        registryObj.register(logObj);
        logObj.registry(registryObj);
        return;
      }
      try {
        var CompClass = require('../components/' + compName + '/index.js');
      } catch (e) {
        e.message = "[Crux.run()] " + e.message;
        throw e;
      }
      if (typeof CompClass !== 'function' || CompClass.prototype.__type !== 'CruxComponent') {
        throw new Error('[Crux.run()] Crux component "' + compName + '" does not extend Crux.Component');
      }
      var compConfig = getComponentConfiguration(compName);
      // We check if the component requires configuration by default before instantiating
      if (CompClass.prototype.__configuration === true) {
        if (typeof compConfig !== 'object' || compConfig == null) {
          throw new Error('[Crux.run()] Crux component "' + compName + '" requires configuration before instantiating, either with configureComponent() or in project configuration');
        }
      }
      var compObj = new CompClass(compConfig, appConfig);
      if (compObj.name === 'CruxComponent') {
        log.warn('Crux.application: Skipping component with no name', compObj);
      }
      registryObj.register(compObj);
      compObj.registry(registryObj);
    });
    // Finally, for any component instances, we call their config function.
    _.forEach(this.__instances, function(compObj) {
      var compConfig = getComponentConfiguration(compObj.name);
      compObj.extendConfig(compConfig);
    });

    // We then try and check if we have any crux components.
    initCustomComponents.call(this);

    initialized = true;
  };

  /*
   * Manually initializes the custom components given by the user in the componentPath
   * */
  function initCustomComponents() {
    if (typeof projectConfig.crux.components !== 'string') {
      return false;
    }
    var componentPath = path.normalize(global['__rootdir'] + '/' + projectConfig.crux.components + '/'),
      componentList;
    try {
      componentList = util.readDirectoryRelative(componentPath, 'directory', null, true);
    } catch (e) {
      // there are no app components.
      return false;
    }
    var self = this;
    _.forEach(componentList, function(compName) {
      if (self.__components.indexOf('custom:' + compName) === -1) return;
      try {
        var CompClass = require(path.normalize(componentPath + '/' + compName + '/index.js'));
      } catch (e) {
        console.log(e);
        if (e.message.indexOf('Cannot find module') !== -1 && e.message.indexOf('index.js') !== -1) {
          log.warn('Crux.application: Custom component "%s" does not have index.js. Skipping...', compName);
          return;
        }
        e.message = "[Crux.customComponent: " + compName + "] " + e.message;
        throw e;
      }
      if (typeof CompClass !== 'function' || CompClass.prototype.__type !== 'CruxComponent') {
        throw new Error('[Crux.run()] Crux custom component "' + compName + '" does not extend Crux.Component');
      }
      var compConfig = getComponentConfiguration(compName);
      var compObj = new CompClass(compConfig, appConfig);
      if (compObj.name === 'CruxComponent') {
        compObj.name = compName;
      }
      registryObj.register(compObj);
      compObj.registry(registryObj);
    });
  }

  /**
   * Once the Crux application has been initialized, it will allow access to instantiated components. This acts as a getter for previously initialized components
   * @function
   * @memberof crux.Application
   * @param {string} name - the component's name we want to get.
   *
   * */
  app.prototype.component = function GetComponent(name) {
    if (!initialized) {
      throw new Error('Crux application is not initialized. Please run init() before requesting any component');
    }
    var compObj = registryObj.get(name);
    if (!compObj) {
      throw new Error('Crux.application: component "' + name + '" is not registered');
    }
    return compObj;
  };

  /**
   * Checks if the given component is registered in the application. This is to be called after initialization.
   * @function
   * @memberof crux.Application
   * @param {string} name - component name.
   * @returns {Boolean}
   * */
  app.prototype.hasComponent = function HasComponentRegistered(name) {
    if (!initialized) return false;
    return registryObj.has(name);
  };

  /**
   * The function will manually attach an instance of a crux component to the application. This is useful when we want
   * to perform conditional component loading, as it works with both a custom crux component or the name of a core one.
   * @function
   * @memberof crux.Application
   * @param {string|component} component - the component to be attached to the application. It is either the name of a core crux component or an instance of crux.component
   * @param {object} [config] - the configuration object to pass to the component when initializing it.
   * @example
   *    var app = crux.app();
   *    if(app.environment() === 'development') {
   *      app.addComponent('build', { watch: true });
   *    } else {
   *      var serverInstance = new crux.Server();
   *      app.addComponent(serverInstance, { port: 3000 });
   *    }
   * */
  app.prototype.addComponent = function AddComponent(component, _isCustom, _config) {
    if (typeof component === 'string') {
      component = component.toLowerCase();
      if (this.__components.indexOf(component) !== -1) {
        throw new Error('Component ' + component + ' is already required.');
      }
      // If we try to add a crux component, we do not check for its existance.
      if (typeof _isCustom === 'object') {
        _config = _isCustom;
        _isCustom = undefined;
      }
      if (typeof _isCustom !== 'boolean') {
        // we don't have a custom component, we need to check the path
        try {
          var compPath = path.normalize(__dirname + "/../components/" + component + '/index.js');
          var exists = fs.existsSync(compPath);
          if (!exists) {
            throw new Error();
          }
        } catch (e) {
          e.message = 'Component "' + component + '" is not supported by Crux.';
          throw e;
        }
      }
      if (_isCustom === true) {
        this.__components.push('custom:' + component);
      } else {
        this.__components.push(component);
      }

      if (typeof _config !== 'undefined') {
        componentConfig[component] = _config;
      }
      return this;
    }
    if (_.isCruxComponent(component)) {
      _config = _isCustom;
      var _exists = this.__components.indexOf(component.name);
      if (_exists !== -1) {
        this.__components.splice(_exists, 1);
      }
      registryObj.register(component);
      component.registry(registryObj);
      var config = getComponentConfiguration(component.name);
      config = util.extend(true, config, _config || {});
      component.extendConfig(config);
      this.__instances.push(component);
      return this;
    }
    throw new Error('Invalid component argument received.');
  };

  /**
   * The function will configure and overwrite a previously-registered component's settings. This is useful when having conditional
   * settings that may need to be attached to a component.<br>
   * The function will extend the previous configuration of a component with the given object, overwriting it
   * @function
   * @memberof crux.Application
   * @param {string} name - the previously registered component name
   * @param {object} config - the configuration object to pass.
   * */
  app.prototype.configureComponent = function ConfigureComponent(name, config) {
    if (this.__components.indexOf(name) === -1) {
      throw new Error('Component "' + name + '" is not registered with the Crux app.');
    }
    if (initialized) {
      var compObj = registryObj.get(name);
      if (!compObj) {
        throw new Error('Component "' + name + '" is not registered with the Crux app.');
      }
      compObj.config = util.extend(true, compObj.config || {}, config);
      return this;
    }
    if (started) {
      throw new Error('Crux.application: Component "' + name + '" can be configured with configureComponent() only before calling app.run() ');
    }
    componentConfig[name] = config;
    return this;
  };

  /**
   * The function will start the crux application. It does so by initializing (if init() was not previously called) and running
   * all registered components.<br>
   * The actual order of component loading is the one specified when calling app.components()
   * @function
   * @memberof crux.Application
   * @param {function} callback - the callback function to be called when all components are initialized and executed.
   * */
  app.prototype.run = function RunApplication(callback) {
    if (started) return false;
    started = true;
    process.nextTick(function() {
      this.init();
      log.info('Crux.application: %s starting in "%s" mode', (appName || ""), this.environment());
      /* After we've created all our components, we run them from the registry */
      registryObj.initialize(function(err) {
        if (err) {
          log.error('Crux component "%s": failed to initialize. Shutting down...', err.component);
          log.debug(err);
          setTimeout(function() {
            process.exit(1);
          }, 1200);
          return;
        }
        if (typeof callback === 'function') callback();
      });
    }.bind(this));
    return true;
  };

  return app;
}

module.exports = createApp;