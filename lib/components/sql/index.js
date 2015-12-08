var async = require('async'),
  fs = require('fs'),
  _ = require('underscore'),
  path = require('path'),
  spawn = require('child_process').spawn,
  Sequelize,
  DbModel = require('./model.js'),
  isSyncFinished = true,
  MODELS = {},        // map of models
  RELATIONSHIPS = [], // array of relationships.
  modelCount = 0;
/*
 * Crux Database Component (Sequelize wrapper)
 * */
var Crux = require('../../../index'),
  Component = Crux.Component;
Component.require('log');

Component.default({
  debug: true,
  sync: false,
  setup: false,
  host: 'localhost',
  timezone: false,  //if specified, the timezone we want to use with sequelize. For example, "+02:00" is GMT +2
  user: 'root',
  password: null,
  database: 'crux',
  path: {
    models: 'app/models',
    sql: 'app/models/sql'
  },
  connections: false    // maximum number of SQL connections. Defaults to Sequelize default.
});

/**
 * The SQL adapter component wraps itself over Sequelize to offer standardized model-definition as well
 * as module auto-loading and automatic relationship building.<br/>
 * For now, this component is optimized only for <b>MySQL</b> but in the future it will support all of Sequelize's engines<br>
 *   <b>Note</b>: the SQL scripts path may contain <b>$environment</b> in its path. Should this happen, the component will
 *   dynamically parse the path at runtime, replacing $environment with the current environment value.<br/>
 *   As an example, if environment=dev and path.sql=app/models/sql/$environment, when in setup mode, it wiill read all <b>.sql</b> files from app/models/sql/dev and execute their statements.<br/>
 *   <b>Note</b>: the SQL script content must contain <b>one SQL statement per line</b>
 * @class crux.Database.Sql
 * @extends crux.Component
 * @param {Object} options - default configuration for the Sql component
 * @param {Boolean} [options.debug=true] - should this component start in debug mode. Doing so, it will log every SQL command
 * @param {Boolean} [options.sync=false] - tries and synchronises the newly-added models with create if not exists statements. Should be turned off in production
 * @param {Boolean} [options.setup=false] - <b>WARNING</b> setting this to true will drop all tables in the database and re-create them. This is useful when refactoring model definitions
 * @param {String} [options.host=localhost] - MySQL hostname to connect to
 * @param {String} [options.user=root] - MySQL user to connect to
 * @param {String} [options.password] - MySQL password to connect to
 * @param {String} [options.database=crux] - MySQL database to use
 * @param {Object} [options.path]
 * @param {String} [options.path.models=app/models] - default path to use for model definition placing
 * @param {String} [options.path.sql=app/models/sql] - default path to custom SQL scripts that can be run on database setup.
 * @property {Sequelize} Seq - A reference to the sequelize module
 * @property {Boolean} __configuration=true - By defaullt, this component requires configuration
 * */
var DbService = function CruxSqlComponent(_config) {
  DbService.super_.apply(this, arguments);
  this.name = 'sql';
  this.Seq = null;
  this.initialized = false;
};

Component.inherits(DbService);
DbService.prototype.__configuration = true;

/**
* Internal function used to register newly-created crux SQL models
 *
 * @memberof crux.Database.Sql
 * @function Register
 * @instance
 * @private
 * @param {String} name - the model definition name
 * @param {String} tableName -the model's associated table name.
* */
DbService.prototype.Register = function CreateModel(name, tableName) {
  return new DbModel.model(name, tableName);
};

/**
* crux SQL component uses Sequelize1.7.8 and MySQL connector as foreign dependencies.
 * @memberof crux.Database.Sql
 * @function packages
 * @returns String[]
* */
DbService.prototype.packages = function PackageDependency() {
  return ['mysql@2.9.x', 'sequelize@2.x'];
};

/**
* This will initialize the database component, loading up all model definitions under the models/ path<br>
* It is now when the model relations are also created and parsed.
* An important convenient feature is if it finds a <b>--setup=sql</b> in the process arguments, we will automatically
 * enable the setup process, thus re-creating the entire database.
 *
 * @memberof crux.Database.Sql
 * @function init
* */
DbService.prototype.init = function InitializeDB() {
  Sequelize = require("sequelize");
  DbModel.init(Sequelize);
  var opt = {},
    self = this,
    authCalled = false;
  if(this.config.port) opt['port'] = this.config.port;
  if(process.argv.indexOf('--setup=sql') !== -1) {
    log.info('Crux.sql: Entering setup mode because of --setup=sql argument');
    this.config.setup = true;
  }
  if(this.config.setup) {
    opt['pool'] = false;
  } else {
    opt['pool'] = {
      maxIdleTime: 12000
    };
    if(typeof this.config.pool === 'object') {
      opt.pool = this.config.pool;
    } else {
      if(typeof this.config.connections === 'number') {
        opt.pool.max = this.config.connections;
      }
    }
  }
  opt['dialect'] = 'mysql'; // We currently support only mysql
  opt['host'] = this.config.host;
  if(this.config.timezone) {
    opt.timezone = this.config.timezone;
  }
  var wasLogCount = false;
  opt['logging'] = (!this.config.debug ? false : function LogSQL(msg) {
    if(!authCalled) {
      authCalled = true;
      return;
    }
    if(!isSyncFinished) return;
    if(self.config.debug === false) return;
    // If we have enabled selective debugging, we check.
    if(typeof self.config.debug === 'object') {
      if(self.config.debug.select === false && msg.indexOf(": SELECT") !== -1) return;
      if(self.config.debug.update === false && msg.indexOf(": UPDATE") !== -1) return;
      if(self.config.debug.insert === false && msg.indexOf(": INSERT") !== -1) return;
      if(self.config.debug.delete === false && msg.indexOf(": DELETE") !== -1) return;
    }
    if(!wasLogCount && msg.substr(msg.indexOf(':') + 2) === 'SELECT 1+1 AS result') {
      wasLogCount = true;
      return;
    }
    log.trace.apply(log, arguments);

  });
  this.Seq = new Sequelize(this.config.database, this.config.user, this.config.password, opt);
  this.customTypes();
  loadModels.call(this);
  this.attach();
};

/*
* Enables/disables logging.
* */
DbService.prototype.debug = function EnableDebug(v) {
  this.config.debug = (typeof v === 'boolean' ? v : true);
  return this;
};

/**
* Attaches the database component to other components. This operation consists of injecting
 * the function <b>this.model(modelName)</b> into the crux Server and crux Service componet.
 *
 * @memberof crux.Database.Sql
 * @function attach
* */
DbService.prototype.attach = function AttachDatabase() {
  process.nextTick(function() {
    function getModel(name) {
      return this.getModel(name);
    }
    var self = this;

    function startTransaction(_mode, _options) {
      var cb = (typeof _mode === 'function' ? _mode : _options);
      return Crux.promise(function(resolve, reject) {
        var options = {
          isolationLevel: (typeof _mode === 'string' ? _mode : 'READ COMMITTED')
        };

        var _error = null,
          _result = null,
          isCompleted = false;

        self.Seq.transaction(options, function(t) {
          var isCommitted = false,
            isRolledBack = false;
          return Crux.promise(function(transRes, transRej) {
            function transactionRollback(err) {
              if(isCommitted || isRolledBack) {
                log.error('Crux.transaction(): is already ' + (isCommitted ? 'committed' : 'rolled back') + '. Cannot perform multiple rollbacks.');
                return;
              }
              isRolledBack = true;
              _error = err;
              transRej(err);
            }

            function transactionCommit(result) {
              if(isCommitted || isRolledBack) {
                log.error('Crux.transaction(): is already ' + (isCommitted ? 'committed' : 'rolled back') + '. Cannot perform multiple commits.');
                return;
              }
              isCommitted = true;
              _result = result;
              transRes();
            }
            var transArg = {
              transaction: t,
              commit: transactionCommit,
              rollback: transactionRollback
            };
            try {
              var cbPromise = cb(transArg);
            } catch(e) {
              log.error('Crux.transaction(): callback function encountered an error.');
              log.error(e);
              isCompleted = true;
              return reject(e);
            }
            if(typeof cbPromise === 'object' && cbPromise && typeof cbPromise.catch === 'function') {
              cbPromise.catch(function(e) {
                if(e && !_error) _error = e;
                transRej(e);
              });
            }
          });
        }).then(function() {
          if(_error) {
            return reject(_error);
          }
          resolve(_result);
        }).catch(function(e) {
          if(_error) return reject(_error);
          reject(e);
        });
      });
    }
    this.registry().attachTo('server service tasks io', 'model', getModel.bind(this));
    this.registry().attachTo('server service tasks io', 'transaction', startTransaction.bind(this));
  }.bind(this));
};

/**
 * Initializes and configures the sequelize instance. At this point, it will try and connect
 * to the MySQL server with the configured credentials. Once the connection is established, it will try to synchronize the models and if it was
 * configured to perform database setup, it will drop all existing tables and re-create them based on the
 * model definition files (models + their relationships and lookup tables).<br/>
 * After the setup process has been completed, it will look into the custom sql scripts path and try execute them.
 *
 * @memberof crux.Database.Sql
 * @function run
 * @param {Function} done - function to be called on run complete
 * */
DbService.prototype.run = function Initialize(done) {
  // We create our own JSON type.
  var self = this;
  this.Seq.authenticate().then(function() {
    self.initialized = true;
    self.synchronize(done);
  }).catch(function(err) {
    log.fatal('Crux.sql: failed to connect to server. Please check db configuration.');
    log.debug(err);
    return done(err);
  });
};

/**
 * This acts as a getter and returns a previously loaded crux model definition.
 *
 * @memberof crux.Database.Sql
 * @function getModel
 * @param {String} name - the model name to lookup.
 * @returns {crux.Database.Sql.Model}
 * */
DbService.prototype.getModel = function GetModel(name) {
  if(typeof MODELS[name] === 'undefined') {
    throw new Error("Crux.sql: Invalid database model definition for: " + name);
  }
  return MODELS[name];
};

/**
 * Returns all the registered crux model definitions, as an array.
 * @memberof crux.Database.Sql
 * @function getAllModels
 * @returns [crux.Database.Sql.Model]
* */
DbService.prototype.getAllModels = function GetAllModels() {
  var list = [];
  for(var key in MODELS) {
    list.push(MODELS[key]);
  }
  return list;
};


/**
 * Custom wrapper over Sequelize's field types, adding types <b>PRIMARY<b> and <b>JSON</b><br/>
 * The PRIMARY type is of type INTEGER(11) with autoIncrement and primary flags set to true
 *
 * @memberof crux.Database.Sql
 * @function customTypes
 * @private
 * */
DbService.prototype.customTypes = function SetCustomTypes() {
  Sequelize.JSON = Sequelize.STRING.cloneFunction();
  Sequelize.JSON.toString = function toString() { return 'TEXT'; }
  Sequelize.JSON._parseJson = true;
  Sequelize.JSON._custom = 'json';
  Sequelize.PRIMARY = Sequelize.INTEGER.cloneFunction();
  Sequelize.PRIMARY._custom = 'primary';
  Sequelize.PRIMARY.toString = function toString() { return 'INT(11)'; }
};

/**
 * Runs a custom SQL query against the database. This is a wrapper function over Sequelize's query()<br/>
 * @memberof crux.Database.Sql
 * @function query
 * @instance
 * @param {String} qry - the query to execute.
 * @param {String[]|Object} where - query variable replacements.
 * @returns Promise
 * @example
 *  var sql = crux.component('sql');
 *  sql.query('SELECT * from user WHERE id=?', [1]);
 *  // OR
 *  sql.query('SELECT * from user WHERE name = :name', { name: 'John' });
 * */
DbService.prototype.query = function RunQuery(qry, where) {
  var _opt = {
    raw: true,
    replacements: where || []
  };
  return this.Seq.query(qry, _opt).then(function(res) {
    if(res instanceof Array) return res[0];
    return res;
  });
};

DbService.prototype.query2 = function RunQuery(sql, where, opt) {
  if(typeof sql !== 'string') {
    throw new Error('DbService.query() first argument must be a string with the SQL query.');
  }
  if(typeof opt !== 'object' || !opt) opt = {};
  if(where instanceof Array || typeof where === 'object' && where) {
    opt.replacements = where;
  }
  return this.Seq.query(sql, opt).then(function(results) {
    if(results instanceof Array && results[0] instanceof Array) {
      return results[0];
    }
    return results;
  });
};

/**
* Manually overrides the setup configuration and re-creates the database.<br/>
* <b>WARNING</b> using this will reset the database. It is unwise to do so in a production environment.
 *
 * @memberof crux.Database.Sql
 * @function setup
 * @instance
 * @param {Function} [done] - on complete callback.
* */
DbService.prototype.setup = function PerformSetup(rightNowCb) {
  this.config.setup = true;
  if(typeof rightNowCb !== 'function') return this;
  this.synchronize(rightNowCb);
  return this;
};

/**
 * Synchronizes all the database models with the SQL database. If setup is enabled, it will re-create the tables.
 * @memberof crux.Database.Sql
 * @function synchronize
 * @param {Function} done - on complete callback
 * */
DbService.prototype.synchronize = function Synchronize(onComplete) {
  var self = this;
  if(this.config.sync === false) {
    isSyncFinished = true;
    log.info('Crux.sql: connection established.');
    return onComplete();
  }
  // If we're performing a database reset, we need to do the following steps.
  if(self.config.setup) {
    log.info('Crux.sql: Setting up database structure');
    var opt = {
      force: true
    };
    isSyncFinished = false;
    self.Seq.query('SET FOREIGN_KEY_CHECKS = 0')
      .then(function() {
        return self.Seq.sync(opt);
      })
      .then(function() {
        return self.Seq.query('SET FOREIGN_KEY_CHECKS = 1');
      })
      // We now manually create the indexes of each model.
      .then(function() {
        return createIndexes.call(self);
      })
      .then(function() {
        if(self.config.path.sql == false) return onComplete();
        // We need to manually create the indexes on our tables.
        // After we've created the database structure, we try and read the sql/setup.sql file that contains any additional INSERTS
        if(self.config.path.sql.indexOf("$environment") !== -1) {
          self.config.path.sql = self.config.path.sql.replace('$environment', global['NODE_ENV']);
        }
        try {
          var sqlFiles = Crux.util.readDirectory(Component.appPath(self.config.path.sql), 'sql');
        } catch(e) {
          isSyncFinished = true;
          log.debug('Crux.sql: Database setup complete');
          return onComplete();
        }
        var _calls = [],
          basePath = Component.appPath(self.config.path.sql + '/');
        sqlFiles = sqlFiles.reverse();
        _.forEach(sqlFiles, function(filePath) {
          var relativePath = filePath.replace(basePath, '');
          // We do not run SQL files under subdirectories, unless the directory name is the environment name.
          if(relativePath.indexOf('/') !== -1 || relativePath.indexOf('\\') !== -1) {
            if(relativePath.indexOf(global['NODE_ENV']) !== 0) return;
          }
          _calls.push(function(_done) {
            self.runSql(filePath, _done);
          });
        });
        async.series(_calls, function() {
          log.trace('Crux.sql: SQL synchronization complete.');
          isSyncFinished = true;
          return onComplete();
        });
      }, function(err) {
        log.warn('Crux.sql: SQL file queries encountered an error.');
        log.error(err);
        return onComplete();
      });
    return;
  }
  isSyncFinished = false;
  // Otherwise, we just create newly added models.
  this.Seq.sync().then(function() {
    log.info('Crux.sql: database synchronization complete.');
    isSyncFinished = true;
    onComplete();
  }).error(function(err) {
    log.warn('Crux.sql: Database synchronization encountered an error.');
    log.error(err);
    isSyncFinished = true;
    return onComplete();
  });
};

/**
 * The function will generate the MySQL Dumpfile and resolve the promise with the result.<br/>
 * <b>NOTE:</b> this function will execute <b>mysqldump</b>, so be sure that MySQL is installed on the machine, or the mysqldump binary file is in your path.<br/>
 * <b>NOTE 2:</b> For options, see http://dev.mysql.com/doc/refman/5.1/en/mysqldump.html
 * @memberof crux.Database.Sql
 * @function dump
 * @param {Object} saveOpt - default dump options.
 * @param {String} [options.path] - optional file path to create the dump sql file. If no extension is included, it will auto-generate the dump file name.
 * @param {Object} dumpOptions - additional mysql dump parameters. See MySQL docs on mysqldump.
 * */
DbService.prototype.dump = function CreateSqlDump(saveOpt, dumpOptions) {
  var self = this;
  if(typeof dumpOptions !== 'object' || dumpOptions == null) dumpOptions = {};
  if(typeof saveOpt !== 'object' || saveOpt == null) saveOpt = {};
  return crux.promise(function(resolve, reject) {
    var args = [];
    // We set the connection "string"
    args.push('-h' + this.config.host);
    args.push('-u' + this.config.user);
    if(this.config.password) {
      args.push('-p' + this.config.password);
    }
    for(var key in dumpOptions) {
      args.push('--' + key + ' ' + dumpOptions[key]);
    }
    args.push(this.config.database);
    var proc = spawn('mysqldump', args);
    proc.on('error', function(e) {
      if(e.code === 'ENOENT') {
        log.warn('Crux.SQL: mysqldump is missing from PATH or not found.');
        ERROR = e;
      }
    });
    var RESULT = "";
    var ERROR = "";
    proc.stdout.on('data', function(d) {
      RESULT += d;
    });
    proc.stderr.on('data', function(d) {
      ERROR += d;
    });
    proc.on('close', function() {
      if(ERROR instanceof Error) {
        return reject(ERROR);
      }
      if(ERROR !== '') {
        var e = new Error('MySQL Dump error');
        e.data = ERROR;
        return reject(e)
      }
      // Check if we need to write to disk.
      if(typeof saveOpt.path === 'string' && saveOpt.path !== '') {
        var fileName = Crux.util.getFileName(saveOpt.path);
        // If we have a directory, we set the file name as the current date.
        if(fileName.indexOf('.') === -1) {
          var now = new Date().toString();
          var tmp = now.split(' ');
          var m = tmp[1].toLowerCase();
          tmp.splice(0, 2);
          tmp = tmp.slice(0, 3);
          var time = tmp.pop();
          time = time.replace(/:/g,'.');
          tmp = tmp.reverse(); tmp.push(m); tmp.reverse();
          fileName = tmp.join('-');
          fileName += '_' + time;
          saveOpt.path += '/' + fileName + '.sql';
        }
        saveOpt.path = path.normalize(saveOpt.path);
        // We now save to the disk.
        return fs.writeFile(saveOpt.path, RESULT, {
          encoding: 'utf8'
        }, function(err) {
          if(err) {
            log.warn('Crux.SQL: Failed to export dump to file: %s', saveOpt.path);
            return reject(err);
          }
          resolve(RESULT);
        });
      }
      // If we don't need to write it, we just return the string
      resolve(RESULT);
    });
  }.bind(this));
};

/**
* Runs the SQL content of a given file path from the SQL scripts path previously configured, against Sequelize via Seq.query()<br/>
* The queries in the file MUST be delimited by a new line.
 * @memberof crux.Database.Sql
 * @function runSql
 * @param {String} path - the SQL file path, relative to the configured sql script path
 * @param {Function} done - on complete function to be called.
* */
DbService.prototype.runSql = function RunSqlFromFile(_path, _done) {
  var fileName = _path,
    self = this;
  fileName = _path.replace(Component.appPath(self.config.path.sql + '/'), '');
  try {
    var setupSql = fs.readFileSync(_path, { encoding: 'utf8' }),
      asyncCalls = [];
  } catch(e) {
    log.warn('Crux.sql: failed to run SQL from file: %s, cannot read from it.', fileName);
    log.debug(e);
    return _done();
  }
  setupSql = setupSql.replace(/\r?\n/g, "\n");
  if(setupSql.indexOf('\r\n') === -1) {
    setupSql = setupSql.split('\n');
  } else {
    setupSql = setupSql.split('\r\n');
  }
  _.forEach(setupSql, function(sqlStatement) {
    if(sqlStatement.trim().indexOf('//') === 0) return;  // we have commentaries.
    sqlStatement += ';';
    if(sqlStatement.trim().length <= 10 || sqlStatement === '') return;
    asyncCalls.push(function(done) {
      self.Seq.query(sqlStatement).then(function() {
        done();
      }, function(err) {
        log.warn('Crux.sql: Failed to run SQL query from file: %s', fileName);
        log.debug('Crux.sql: SQL Query: ' + sqlStatement);
        log.debug(err);
        done();
      });
    });
  });
  async.series(asyncCalls, function(err) {
    if(err) return _done(err);
    log.debug('Crux.sql: Executed SQL queries from file: %s', fileName);
    _done();
  });
};


/*
* Loads up all the models in the model definition location.
* */
function loadModels() {
  if(this.config.path.models == false) return;
  var MODEL_LOCATION = Component.appPath(this.config.path.models),
    self = this;
  try {
    var list = Crux.util.readDirectory(MODEL_LOCATION, 'js');
  } catch(e) {
    // Component has no models.
    log.warn('Crux.sql: no model definitions found in %s', this.config.path.models);
    return;
  }
  list.forEach(function(modelPath) {
    var fileName = Crux.util.getFileName(modelPath);
    var tableName = fileName.replace('.js', '');
    tableName = tableName.replace(/\//g, '_').replace(/\\/g, '_');
    var modelName = Crux.util.capitalize(tableName, true);
    var modelObj = self.Register(modelName, tableName);
    var modelFunc = require(modelPath);
    if(typeof modelFunc !== 'function') {
      log.warn('Crux.sql: failed to load model definition "%s", not a function', modelName);
      return;
    }
    modelFunc(modelObj, Sequelize, self);
    if(!modelObj.hasFields) {
      log.warn('Crux.sql: Model definition "%s" has no fields. Skipping', modelName);
      return;
    }
    var _opt = modelObj.options;
    if(modelObj.hasValidations) {
      _opt['validate'] = {};
      _.forEach(modelObj.validations, function(callback, name) {
        _opt['validate'][name] = callback;
      });
    }
    if(modelObj.hasMethods) {
      _opt['instanceMethods'] = {};
      _.forEach(modelObj.methods, function(callback, name) {
        _opt['instanceMethods'][name] = callback;
      });
    }
    if(modelObj.hasStatics) {
      _opt['classMethods'] = {};
      _.forEach(modelObj.statics, function(callback, name) {
        if(typeof callback === 'function') {
          _opt['classMethods'][name] = callback;
        }
      });
    }
    if(modelObj.hasJsonFields) {
      modelObj.markJsonFields();
    }
    _opt['syncOnAssociation'] = false;
    try {
      MODELS[modelObj.__name] = self.Seq.define(modelObj.__name, modelObj.fields, _opt);
    } catch(e) {
      log.error('crux.sql: Failed to load SQL model definition: %s', modelObj.__name);
      throw e;
    }
    modelObj.bindMethods(MODELS[modelObj.__name]);
    modelObj.bind(MODELS[modelObj.__name]);
    if(modelObj.hasRelationships) {
      RELATIONSHIPS.push(modelObj);
    }
    if(modelObj.hasStatics) {
      _.forEach(modelObj.statics, function(data, fieldName) {
        if(typeof data !== 'function') {
          MODELS[modelObj.__name][fieldName] = data;
        }
      });
    }
  });
  RELATIONSHIPS.forEach(function(modelObj) {
    var sourceModel = MODELS[modelObj.__name];
    /* Has many */
    _.forEach(modelObj.__hasMany, function(depOpt, depName) {
      var targetModel = MODELS[depName];
      if(typeof depOpt['through'] === 'string') {
        depOpt['through'] = MODELS[depOpt['through']];
      }
      try {
        sourceModel.hasMany(targetModel, depOpt);
      } catch(e) {
        log.fatal('Failed to do hasMany on %s-%s',depName, modelObj.__name);
        log.debug(e);
      }
    });
    /* Has one */
    _.forEach(modelObj.__hasOne, function(depOpt, depName) {
      var targetModel = MODELS[depName];
      try {
        sourceModel.hasOne(targetModel, depOpt);
      } catch(e) {
        log.fatal('Failed to do hasOne on %s-%s', depName, modelObj.__name);
        log.debug(e);
      }
    });
    /* Belongs to */
    _.forEach(modelObj.__belongsTo, function(depOpt, depName) {
      var targetModel = MODELS[depName];
      try {
        sourceModel.belongsTo(targetModel, depOpt);
      } catch(e) {
        log.fatal('Failed to do belongsTo on %s-%s', depName, modelObj.__name);
        log.debug(e);
      }
    });
  });
  /*
   * We now bind the mock() function for all our loaded models.
   * */
  _.forEach(MODELS, function(modelObj, name) {
    /*
     * The mock function will be attached on all our models and will return a object model with generated data.
     * */
    modelObj.mock = function MockJsonModel(data) {
      if(typeof data !== 'object' || data === null) data = {};
      var mockData = {};
      // We bind the raw attributes
      for(var attr in modelObj.rawAttributes) {
        if(typeof data[attr] !== 'undefined') {
          mockData[attr] = data[attr];
          continue;
        }
        // If by any change, we have set some default values, we take one of them.
        if(modelObj.rawAttributes[attr].type.values instanceof Array) {
          var idx = Math.floor(Math.random() * modelObj.rawAttributes[attr].type.values.length);
          mockData[attr] = modelObj.rawAttributes[attr].type.values[idx];
          continue;
        }
        // We now generate a random value.
        var rawAttr = modelObj.rawAttributes[attr],
          aName = _.isString(rawAttr.type.type) ? rawAttr.type.type :
            (_.isString(rawAttr.type._typeName) ? rawAttr.type._typeName : rawAttr.type);
        /* If by any chance we have a rawAttribute that is used in foreign keys, we skip it */
        if(typeof rawAttr['references'] !== 'undefined') {
          continue;
        }
        if(aName.indexOf("VARCHAR") !== -1 && (typeof rawAttr.type._parseJson === 'undefined')) {
          mockData[attr] = Crux.util.uniqueId(5);
        }
        if(aName.indexOf("INTEGER") !== -1) {
          mockData[attr] = Math.floor(Math.random() * 100);
        }
        if(aName.indexOf("FLOAT") !== -1) {
          mockData[attr] = parseFloat(Math.random().toFixed(3));
        }
        if(aName.indexOf("DATE") !== -1) {
          mockData[attr] = new Date();
        }
        if(aName.indexOf("BOOLEAN") !== -1) {
          var now = new Date().getTime();
          mockData[attr] = (now % 2 === 0 ? true : false);
        }
      }
      var buildedMockObj = modelObj.build(mockData);
      // We now go through the model's associations.
      // We only create the association if the user explicitly states it
      for(var assocName in modelObj.associations) {
        var assocObj = modelObj.associations[assocName];
        if(typeof data[assocName] === 'undefined') continue;
        if(assocObj.associationType === 'HasMany' && data[assocName] instanceof Array) {
          //buildedMockObj.setDataValue(assocObj.associationAccessor, []);
          var _mocks = [];
          for(var i=0; i < data[assocName].length; i++) {
            var targetMock = assocObj.target.mock(data[assocName][i]);
            _mocks.push(targetMock);
          }
          if(_mocks.length !== 0) {
            buildedMockObj.setDataValue(assocName, _mocks);
          }
          continue;
        }
        if((assocObj.associationType === 'BelongsTo' || assocObj.associationType === 'HasOne') && typeof data[assocName] === 'object') {
          var targetMock = assocObj.target.mock(data[assocName]).toJSON();
          buildedMockObj.setDataValue(assocName, targetMock);
          continue;
        }
      }
      return buildedMockObj;
    };
  });
}

function createIndexes() {
  return Crux.promise(function(resolve, reject) {
    var calls = [],
      self = this;
    _.forEach(MODELS, function(modelObj) {
      if(!modelObj.options.indices instanceof Array) return;
      _.forEach(modelObj.options.indices, function(index) {
        calls.push(function(done) {
          var idxName = index.name || index.fields.join('_');
          self.Seq.getQueryInterface().addIndex(modelObj.tableName, index.fields, {
            indicesType: index.type,
            indexName: idxName
          }).then(function() {
            done();
          }).catch(done);
        });
      });
    });
    async.series(calls, function(err) {
      if(err) return reject(err);
      resolve();
    });
  }.bind(this));
}

DbService.prototype.Model = DbService.Model = DbModel.model;

module.exports = DbService;