/*
* This is what we expose to the outside world.
* */
var extend = require('node.extend'),
  util = require('util');
var Component = require('./lib/core/component');

var crux = {},
  processConfig = {},
  cruxApp = null;

/**
 * Crux framework comes packaged into a single namespace. All its functionality and classes are found here, and can be
 * accessible once crux is required. The framework is build with extensibility in mind, exposing all its base classes,
 * allowing developers to attach custom functionality in a matter of seconds.
 * @namespace crux
 * */
module.exports = crux;

/* Reads the process.argv to place items in processConfig  */
(function setProjectConfig() {
  var argv = process.argv.slice(2);
  // We skip the first 2 arguments, as it is node.exe and app.js
  for(var i=0; i < argv.length; i++) {
    var key = argv[i].split('=')[0],
      value = argv[i].split('=')[1] || null;
    key = key.replace(/-/g, '').toLowerCase();
    processConfig[key] = value;
  }
})();

/**
* Useful to retrieve command line arguments settings. These settings are of --something=value or something=value.
* NOTE: all settings keys will be lower case.
* @function argv
* @memberof crux
* @param {string} [key] - key name that can be found under the process configuration, excluding double dash
* @param {any} [defaultValue] - the default value to return if the key is not found.
* */
crux.argv = function GetProcessConfig(key, defaultValue) {
  if(typeof key !== 'string') return null;
  key = key.toLowerCase();
  if(typeof processConfig[key] === 'undefined') {
    return (typeof defaultValue === 'undefined' ? null : defaultValue);
  }
  return processConfig[key];
};


/*
 * Custom utility function.
 * */
crux.util = require('./lib/util/util');

crux.__defineGetter__('Component', function() {
  return Component();
});
crux.__defineSetter__('Component', function() {});

/* We now expose our core components */
var Application = require('./lib/core/application'),
  Logger = require('./lib/util/log'),
  Server = require('./lib/components/server/index'),
  ServiceInterface = require('./lib/components/service/_interface'),
  Service = require('./lib/components/service'),
  Sql = require('./lib/components/sql/index'),
  Build = require('./lib/components/build/index'),
  Mongo = require('./lib/components/mongo/index'),
  Redis = require('./lib/components/redis/index');


/**
* Because the Crux framework will run as a singleton instance, the first time
* Crux.app is requested, we will create the application.
* @namespace crux
* @member {crux.Application} crux.app
 * @example
 *    var crux = require('crux'),
 *      app = crux.app;   // at this point, the application has been instantiated and prepared.
 *    app.components(['log', 'server'])
 *      .appConfig('config/app.js');  // most methods return the reference to the instance, to enable call chaining
 *
 *    app.init();   // initializes all the application components and the internal registry
 *    app.run(function(){
 *        // At this point, all components are loaded and started without any error.
 *    });
* */
crux.__defineGetter__('app', function() {
  if(cruxApp !== null) {
    return cruxApp;
  }
  var app = Application();
  cruxApp = new app();
  return cruxApp;
});
crux.__defineSetter__('app', function(){});

crux.Log = Logger;
/**
 * The namespace exposes all the http-related components used by the crux Server component. Although a large component, it exposes
 * most of its functionality so that developers have control over it.<Br>
 * <b>Note</b>: for a better documentation view, we've created crux.Server as a namespace, but <b>it is actually the {@link crux.Server.Server} class
 *@namespace crux.Server
* */
crux.Server = Server;
crux.Build = Build.Process;
crux.Service = ServiceInterface; // this is our base service.
/**
 * The namespace contains all database-related components. Currently, we only support MySQL and MongoDB components.
 * @namespace crux.Database
 * */
crux.Database = {
  Sql: Sql,
  Mongo: Mongo
};
/**
* The namespace contains all data-store related components. Currently, we only support Redis.
 * @namespace crux.Store
* */
crux.Store = {
  Redis: Redis
};

/**
* Utility function that globalizes the crux module, placing it under global['crux'] and making it
 * accessible from anywhere in the application. This is a convenient method over require('crux').
 * @function globalize
 * @memberof crux
* */
crux.globalize = function PlaceCruxInGlobal() {
  if(typeof global['crux'] !== 'undefined') throw new Error('crux.globalize: crux already exists in the global scope.');
  global['crux'] = crux;
  return crux;
};

/*
* Utility function that will perform inheritance
* */
crux.inherits = crux.util.inherits;

/**
* Utility function that is a wrapper over bluebird's promise functionality. It wraps the caller function, delaying its
 * execution until the next process tick and calls it with resolve() and reject() callbacks.
 * @function promise
 * @memberof crux
 * @param {function} fn - The promise handler function
 * @example
 *    var promise = crux.promise(function(resolve, reject) {
 *      // do stuff...
 *      reject(new Error('INVALID_VALUE'));
 *    });
 *    // Or, we could have a service function that directly returns a promise.
 *    myService.myMethod = function() {
 *      return crux.promise(function(resolve, reject) {
 *        // do other stuff..
 *        resolve();
 *      }.bind(this));
 *    }
* */
crux.promise = crux.util.promise;

/**
* Utility function that displays all the default values of every component. These values can be easily overwritten in
 * either the project configuration, the application configuration or via environment-specific configuration (files or
 * environment variables). For more information, visit the configuration section.
 * TODO: add the configuration section.
 * @function defaults
 * @memberof crux
 * @param {string} [whichComponent] - the component name that we want to fetch the configuration for. If not specified, returns the configuration for all components.
 * @returns {object}
* */
crux.defaults = function GetDefaults(which) {
  var d = {
    log: Logger.super_.default(),
    server: Server.super_.default(),
    build: {},
    service: Service.super_.default(),
    database: {
      sql: Sql.super_.default(),
      mongo: Mongo.super_.default()
    }
  };
  for(var k in Build.Process) {
    d.build[k] = Build.Process[k].default || {};
  }
  if(typeof which === 'string') {
    return d[which] || null;
  }
  return d;
};