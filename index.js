/*
* This is what we expose to the outside world.
* */
var extend = require('node.extend'),
  util = require('util');
var Component = require('./lib/core/component');

var krux = {},
  kruxApp = null;

module.exports = krux;



/*
 * Custom utility function.
 * */
krux.util = require('./lib/util/util');


krux.__defineGetter__('Component', function() {
  return Component();
});
krux.__defineSetter__('Component', function() {});

/* We now expose our core components */
var Application = require('./lib/core/application'),
  Logger = require('./lib/util/log'),
  Server = require('./lib/components/server/index'),
  ServiceInterface = require('./lib/components/service/_interface'),
  Service = require('./lib/components/service'),
  Sql = require('./lib/components/sql/index'),
  Build = require('./lib/components/build/index'),
  Mongo = require('./lib/components/mongo/index');


/*
* Because the Krux framework will run as a singleton instance, the first time
* Krux.app is requested, we will create the application.
* */
krux.__defineGetter__('app', function() {
  if(kruxApp !== null) {
    return kruxApp;
  }
  var app = Application();
  kruxApp = new app();
  return kruxApp;
});
krux.__defineSetter__('app', function(){});

krux.Log = Logger;
krux.Server = Server;
krux.Build = Build.Processes;
krux.Service = ServiceInterface; // this is our base service.
krux.Database = {
  Sql: Sql,
  Mongo: Mongo
};

/*
* Utility function, globalize the krux module.
* */
krux.globalize = function PlaceKruxInGlobal() {
  if(typeof global['krux'] !== 'undefined') throw new Error('krux.globalize: krux already exists in the global scope.');
  global['krux'] = krux;
  return krux;
};

/*
* Utility function that will perform inheritance
* */
krux.inherits = krux.util.inherits;
krux.promise = krux.util.promise;

/*
* Utility function that displays all the default values of every component.
* */
krux.defaults = function GetDefaults(which) {
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
  for(var k in Build.Processes) {
    d.build[k] = Build.Processes[k].default || {};
  }
  if(typeof which === 'string') {
    return d[which] || null;
  }
  return d;
};