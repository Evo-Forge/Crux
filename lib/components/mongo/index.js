var mongoose,
  async = require('async'),
  _ = require('underscore'),
  SchemaFun = require('./schema.js'),
  fs = require('fs');

var util = require('util');
/*
 * This is the MongoDB adapter component.
 * */
var Crux = require('../../../index'),
  Component = Crux.Component;

Component.default({
  debug: true,
  uri: false, // OR custom URI
  host: 'localhost',
  port: 27017,
  user: null,
  password: null,
  database: 'crux',
  schemas: 'app/models/mongo'
});

/**
 * The MongoDB adapter component wraps over Mongoose to export promisified calls over the Schema models.
 * @name crux.Database.Mongo
 * @class
 * @property {Mongoose.Connection} mongo - The Mongoose connection object
 * @property {Object} schemas - An object containing all loaded schemas
 * @extends crux.Component
 *
 * @param {Object} options Default configurations for the Mongo component
 * @param {Boolean} [options.debug=true] Specified if Mongo is running in debug mode.
 * @param {String} [options.host=localhost] MongoDB hostname
 * @param {Number} [options.port=27017] MongoDB port
 * @param {String} [options.user=null] MongoDB username
 * @param {String} [options.password=null] MongoDB password
 * @param {String} [options.database=crux] MongoDB database.
 * @param {String} [options.schemas=app/models/mongo] Default path for schema definitions
 * */
var Mongo = function CruxMongoComponent() {
  Mongo.super_.apply(this, arguments);
  this.name = 'mongo';
  this.mongo = null;
  this.schemas = {};
};

Component
  .inherits(Mongo)
  .require('log');
/**
 * The mongo component requires configuration to be passed to it, as it must read the mongodb host and credentials.
 * @memberof crux.Database.Mongo
 * @defaultValue true
 * */
Mongo.prototype.__configuration = true;

/**
 * Initializes the mongo component, by loading all the Schema models defined under config.schemas. <br>At this point, it will
 * attach itself to the core components <b>server</b> and <b>service</b>
 * @memberof crux.Database.Mongo
 * @function init
 * @instance
 * */
Mongo.prototype.init = function Initialize() {
  mongoose = require('mongoose');
  this.Schema = SchemaFun(mongoose);
  if (this.config.schemas !== false) {
    loadModels.call(this);
  }
  this.attach();
};

/**
 * This component has a single package dependencies, <b>Mongoose</b> version 3.8. This version can be overridden by overwriting this method.
 * @memberof crux.Database.Mongo
 * @function packages
 * @returns {String[]}
 * @instance
 * */
Mongo.prototype.packages = function PackageDependency() {
  var dep = ["mongoose@3.8.x"];
  return dep;
};

/**
 * The function wil load all the schema definition models from the configured path. It will then perform auto-naming for each
 * schema and register each model individually.<br>
 * For each schema file, it will create a Schema object and use it when initiating the schema model.
 * @function
 * @private
 * @memberof crux.Database.Mongo
 * */
function loadModels() {
  var MODEL_LOCATION = Component.appPath(this.config.schemas),
    self = this;
  try {
    var list = Crux.util.readDirectory(MODEL_LOCATION, 'js');
  } catch (e) {
    // no schema definitions
    return;
  }

  list.forEach(function(modelPath) {
    var colName = modelPath.replace(MODEL_LOCATION, '').replace('.js', '');
    colName = colName.substr(1);
    colName = colName.replace(/\//g, '_').replace(/\\/g, '_');
    var schemaName = Crux.util.capitalize(colName, true);
    var modelFunc = require(modelPath);
    if (typeof modelFunc !== 'function') {
      log.warn('Crux.mongo: failed to load schema %s, not a function', schemaName);
      return;
    }
    var modelObj = self.Register(schemaName, colName);
    modelFunc(modelObj, self.getTypes());
    if (!modelObj.hasFields) {
      log.warn('Crux.mongo: schema definition "%s" has no fields. Skipping', colName);
      return;
    }
    if (typeof self.schemas[modelObj.__name] !== 'undefined') {
      throw new Error('Crux.mongo: Schema ' + modelObj.__name + ' previously defined.');
    }
    var schemaObj = modelObj.toMongoose(mongoose);
    self.schemas[modelObj.__name] = schemaObj;
  });
};


/**
 * The mongo component will attach the "schema" method to the following crux components:<br>
 * <b>server</b> and <b>service</b><br>
 * As a result, we will be able to perform <b>this.schema(schemaName)</b> in any service file or in any route definition.
 * @function attach
 * @memberof crux.Database.Mongo
 * @instance
 * @override
 * */
Mongo.prototype.attach = function AttachDatabase() {
  var self = this;
  process.nextTick(function() {
    function getSchema(name) {
      return self.getSchema(name);
    }

    /*
     * Simple collection find for mongo
     * Arguments:
     * find(collectionName, whereQuery, optionQuery)
     * */
    function collectionFind(name, qry, opts) {
      return Crux.promise(function(resolve, reject) {
        var exec = self.mongo.connection.db.collection(name).find(qry);
        if (typeof opts === 'object' && opts) {
          for (var k in opts) {
            if (typeof exec[k] === 'function') {
              try {
                exec[k](opts[k]);
              } catch (e) {
                return reject(e);
              }
            }
          }
        }
        exec.toArray(function(err, items) {
          if (err) {
            return reject(err);
          }
          resolve(items);
        });
      });
    }

    /*
    * Simple collection count for mongo
    * */
    function collectionCount(name, qry, opts) {
      return Crux.promise(function(resolve, reject) {
        var col = self.mongo.connection.db.collection(name);
        col.count(qry, opts || {}, function(err, count) {
          if(err) {
            return reject(err);
          }
          resolve(count);
        });
      });
    }
    self.registry().attachTo('server service tasks io', 'collectionFind', collectionFind);
    self.registry().attachTo('server service tasks io', 'collectionCount', collectionCount);
    self.registry().attachTo('server service', 'schema', getSchema);
  });
};

/**
 * Initializes the Mongodb connection and calls back once it has been established.
 * @function run
 * @memberof crux.Database.Mongo
 * @instance
 * @override
 * */
Mongo.prototype.run = function InitializeMongo(done) {
  var connString = this.__connectionString(),
    self = this,
    isCalled = false,
    isConnected = false;

  function onConnect(err, res) {
    if (isCalled) return;
    isCalled = true;
    if (err) {
      if (err.code === 18) {
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
    if (isCalled) return;
    isConnected = true;
    isCalled = true;
    done();
  }).on('disconnected', function() {
    if (!isConnected) return;
    log.error('Crux.mongo: Connection terminated.');
  }).on('reconnected', function() {
    log.info('Crux.mongo: Connection re-established.');
  }).on('error', function(e) {
    log.error('Crux.mongo: Connection encountered an error');
    log.debug(e);
  });
};

/**
 * Returns a schema definition object by the given name. This function is used when the Mongo component is attached
 * to other components, to inject this.schema() into their context.
 * @memberof crux.Database.Mongo
 * @function getSchema
 * @instance
 * @param {string} name - the schema's name
 * */
Mongo.prototype.getSchema = function GetSchema(name) {
  if (typeof this.schemas[name] === 'undefined') {
    throw new Error('Crux.mongo: Invalid mongo schema for: ' + name);
  }
  return this.schemas[name];
}


/**
 * Returns the mongo connection string based on Mongo's configuration object.
 * @memberof crux.Database.Mongo
 * @function __connectionString
 * @instance
 * @private
 * */
Mongo.prototype.__connectionString = function GetConnectionString() {
  var str = 'mongodb://',
    config = this.config;
  if(typeof config.uri === 'string' && config.uri) {
    return config.uri;
  }
  if (_.isString(config.user)) {
    str += config.user;
    if (_.isString(config.password)) {
      str += ':' + config.password;
    }
    str += '@';
  }
  str += config.host;
  if (_.isNumber(config.port)) {
    str += ':' + config.port;
  }
  str += '/' + config.database;
  return str;
};

/**
 * Registers a mongoose schema. This is used internally and should not be mangled.
 * @memberof crux.Database.Mongo
 * @function Register
 * @instance
 * @private
 * @param {string} name - the schema's name
 * @param {string} collection - the collection name.
 * */
Mongo.prototype.Register = function CreateSchema(name, collection) {
  return new this.Schema(name, collection, this.config.debug);
};

/**
 * Returns a types wrapper over mongoose's schema. It basically caps everything out.
 * @memberof crux.Database.Mongo
 * @function getTypes
 * @instance
 * @private
 * */
Mongo.prototype.getTypes = function GetSchemaTypes() {
  var d = {},
    types = mongoose.Schema.Types;
  /* Base types are automatically added. */
  var base = ['String', 'Number', 'Date', 'Boolean'];
  _.forEach(base, function(name) {
    d[name.toUpperCase()] = name;
  });
  for(var key in types) {
    var upper = key.toUpperCase();
    if(typeof d[upper] !== 'undefined') continue;
    d[upper] = key;
  }
  /* Array objects */
  d['ARRAY'] = function SchemaArray(ofValues) {
    var q = [];
    if (typeof ofValues !== 'undefined') {
      q.push(ofValues);
    }
    q.__proto__.__mongo_type = 'ARRAY';
    return q;
  };
  return d;
};


module.exports = Mongo;