/*
* This is what we expose to the outside world.
* */
var extend = require('node.extend'),
  util = require('util');
var Component = require('./lib/core/component');

var crux = {},
  cruxApp = null;

module.exports = crux;



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


/*
* Because the Crux framework will run as a singleton instance, the first time
* Crux.app is requested, we will create the application.
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
crux.Server = Server;
crux.Build = Build.Processes;
crux.Service = ServiceInterface; // this is our base service.
crux.Database = {
  Sql: Sql,
  Mongo: Mongo
};
crux.Redis = Redis;

/*
* Utility function, globalize the crux module.
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
crux.promise = crux.util.promise;

/*
* Utility function that displays all the default values of every component.
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
  for(var k in Build.Processes) {
    d.build[k] = Build.Processes[k].default || {};
  }
  if(typeof which === 'string') {
    return d[which] || null;
  }
  return d;
};