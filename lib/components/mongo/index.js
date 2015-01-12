var mongoose = require('mongoose'),
  async = require('async'),
  Schema = require('./schema.js'),
  fs = require('fs');

var util = require('util');
/*
 * This is the MongoDB adapter component.
 * */
var Crux = require('../../../index'),
  Component = Crux.Component;

Component.default({
  debug: true,
  host: 'localhost',
  port: null,
  user: null,
  password: null,
  collection: 'crux',
  schemas: 'app/models/mongo'
});

var Mongo = function CruxMongoComponent() {
  Mongo.super_.apply(this, arguments);
  this.name = 'mongo';
  this.mongo = null;
  this.schemas = {};
}
Component
  .inherits(Mongo)
  .require('log');
Mongo.prototype.__configuration = true;
Mongo.prototype.Schema = Schema;

/*
 * Tries to load up all the schema models.
 * */
function loadModels() {
  var MODEL_LOCATION = Component.appPath(this.config.schemas),
    self = this;
  try {
    var list = Crux.util.readDirectory(MODEL_LOCATION, 'js');
  } catch(e) {
    // no schema definitions
    log.warn('Crux.mongo: no schema definitions found in %s', this.config.schemas);
    return;
  };

  list.forEach(function(modelPath) {
    var colName = modelPath.replace(MODEL_LOCATION, '').replace('.js', '');
    colName = colName.substr(1);
    colName = colName.replace(/\//g, '_').replace(/\\/g, '_');
    var schemaName = Crux.util.capitalize(colName, true);
    var modelObj = self.Register(schemaName, colName);
    var modelFunc = require(modelPath);
    if(typeof modelFunc !== 'function') {
      log.warn('Crux.mongo: failed to load schema %s, not a function', schemaName);
      return;
    }
    var modelObj = self.Register(schemaName, colName);
    modelFunc(modelObj, self.getTypes());
    if(!modelObj.hasFields) {
      log.warn('Crux.mongo: schema definition "%s" has no fields. Skipping', colName);
      return;
    }
    if(typeof self.schemas[modelObj.__name] !== 'undefined') {
      throw new Error('Crux.mongo: Schema ' + modelObj.__name + ' previously defined.');
    }
    var schemaObj = modelObj.toMongoose(mongoose);
    self.schemas[modelObj.__name] = schemaObj;
  });
};

/*
* Initializes the mongo component, loading all the models up.
* */
Mongo.prototype.init = function InitializeMongo() {
  loadModels.call(this);
  this.attach();
};

/*
* Attaches the mongo component to other services, if defined.
* */
Mongo.prototype.attach = function AttachDatabase() {
  var self = this;
  function getSchema(name) {
    return self.Schema(name);
  }
  this.registry().attachTo('server service', 'schema', getSchema);
};

/*
 * Initializes the Mongodb connection and service
 * */
Mongo.prototype.run = function InitializeMongo(done) {
  var connString = this.__connectionString(),
    self = this,
    isCalled = false,
    isConnected = false;
  function onConnect(err, res) {
    if(isCalled) return;
    isCalled = true;
    if(err) {
      if(err.code === 18) {
        log.fatal('Crux.mongo: Failed to authenticate to MongoDb. Please check configuration.');
      } else {
        log.fatal('Crux.mongo: Failed to connect to Mongodb. Please check configuration.');
        log.debug(err);
      }
      return done(err);
    }
    done();
  };
  this.mongo = mongoose.connect(connString, {
    auto_reconnect: true
  }, onConnect);
  this.mongo.connection.on('connected', function() {
    log.info('Crux.mongo: connection established.');
    if(isCalled) return;
    isConnected = true;
    isCalled = true;
    done();
  }).on('disconnected', function() {
    if(!isConnected) return;
    log.error('Crux.mongo: Connection terminated.');
  }).on('reconnected', function() {
    log.info('Crux.mongo: Connection re-established.');
  }).on('error', function(e) {
    log.error('Crux.mongo: Connection encountered an error');
    log.debug(e);
  });
};

/*
 * Returns a schema definition.
 * */
Mongo.prototype.Schema = function GetSchema(name) {
  if(typeof this.schemas[name] === 'undefined') {
    throw new Error('Crux.mongo: Invalid mongo schema for: ' + name);
  }
  return this.schemas[name];
}


/*
 * Returns the mongo connection string based on the given credentials.
 * */
Mongo.prototype.__connectionString = function GetConnectionString(config) {
  var str = 'mongodb://',
    config = this.config;
  if(_.isString(config.user)) {
    str += config.user;
    if(_.isString(config.password)) {
      str += ':' + config.password;
    }
    str += '@';
  }
  str += config.host;
  if(_.isNumber(config.port)) {
    str += ':' + config.port;
  }
  str += '/' + config.collection;
  return str;
};

/*
 * Registers a mongose schema.
 * */
Mongo.prototype.Register = function CreateSchema(name, collection) {
  return new Schema(name, collection, this.config.debug);
}

/*
 * Returns a types wrapper over mongoose's schema. It basically caps everything out.
 * */
Mongo.prototype.getTypes = function GetSchemaTypes() {
  var d = {},
    types = mongoose.Schema.Types;
  /* Base types are automatically added. */
  var base = ['String', 'Number', 'Date', 'Boolean'];
  _.forEach(base, function(name) {
    d[name.toUpperCase()] = name;
  });
  /* Array objects */
  d['ARRAY'] = function SchemaArray(ofValues) {
    var q = [];
    if(typeof ofValues !== 'undefined') {
      q.push(ofValues);
    }
    q.__proto__.__mongo_type = 'ARRAY';
    return q;
  };
  return d;
};



module.exports = Mongo;