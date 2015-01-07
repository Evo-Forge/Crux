/*
* This is what we expose to the outside world.
* */
var extend = require('node.extend');
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
  Service = require('./lib/components/service/_interface'),
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
krux.Service = Service; // this is our base service.
krux.Database = {
  Sql: Sql,
  Mongo: Mongo
};