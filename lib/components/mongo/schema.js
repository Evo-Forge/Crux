var crux = require('../../../index');
var _ = require('underscore');
function init(mongoose) {
  /**
   * @classdesc This is a schema file that is used by mongo schemas to register themselves to mongo.
   * @memberof crux.Database.Mongo
   * @class Schema
   * @param {String} name - the schema definition's name
   * @param {String} collection - the mongodb collection name
   * @param {Boolean} [debug] - Enables or disables debug mode for the Mongo component
   * @example
   *    // current schema file: schemas/user.js
   *    module.exports = function(userSchema, Mongo) {
   *      userSchema.collection('users'); // this will set the mongodb collection name from user to users
   *      userSchema
   *        .field('name', Mongo.STRING, {
   *          defaultValue: 'John'
   *        })
   *        .field('is_active', Mongo.BOOLEAN, {
   *          defaultValue: true
   *        })
   *        .field('created_at', Mongo.DATE, {
   *          defaultValue: Date.now
   *        });
   *
   *        userSchema
   *          .index('name')
   *          .belongsTo('application');  // this generates the mongo property application_id of type ObjectId
   *    };
   * */
  var schema = function MongoSchema(name, _collection, _DEBUG) {
    this.__name = name;
    this.collection_name = (_.isString(_collection) ? _collection : name);
    this.fields = {};
    this.methods = {};
    this.statics = {};
    this.indexes = [];
    this.virtuals = {};
    this.hasFields = false;
    this.__hasMany = {};  // schemaTarget:options has many (array of objectId)
    this.__belongsTo = {}// schemaTarget:options belongs to (objectId reference)
    this.__debug = _DEBUG;
  };

  /**
   * This acts as a setter for the collection's name
   * @function collection
   * @instance
   * @memberof crux.Database.Mongo.Schema
   * @param {String} name - the MongoDB collection's name
   * */
  schema.prototype.collection = function SetCollection(name) {
    if(typeof name !== 'string' || !name) {
      throw new Error('Crux.mongo: failed to set collection name to ' + this.collection_name);
    }
    this.collection_name = name;
    return this;
  };

  /**
   * This acts as a setter for the schema's name
   * @function name
   * @instance
   * @memberof crux.Database.Mongo.Schema
   * @param {String} name - the Mongo Schema's name
   * */
  schema.prototype.name = function SetName(name) {
    if(typeof name !== 'string' || !name) {
      throw new Error('Crux.mongo: failed to set schema name to ' + this.name);
    }
    this.__name = name;
    return this;
  };

  /**
   * Registers a schema field. Schema fields are basically Mongo properties, similar to MySQL's columns.
   * @function field
   * @instance
   * @memberof crux.Database.Mongo.Schema
   * @param {String} name - the field's name
   * @param {Mongoose.Schema.Types} type - the field's type from Mongoose's type definition.
   * @param {Object} options - additional options to be passed to Mongo's schema model.
   * @see {@link http://mongoosejs.com/docs/schematypes.html}
   * @see {@link http://mongoosejs.com/docs/guide.html#options}
   * */
  schema.prototype.field = function SetField(name, type, _opt) {
    if(!_.isString(name)) {
      throw new Error('Field name ' + name + ' is invalid.');
    }
    var opt = (typeof _opt === 'object' && _opt !== null ? _opt : {});
    if(typeof this.fields[name] !== 'undefined') {
      throw new Error('Field ' + name + ' already exists.');
    }
    this.fields[name] = {
      type: (_.isFunction(type) ? type() : type),
      defaultValue: null
    };
    if(typeof opt.defaultValue !== 'undefined') {
      this.fields[name].defaultValue = opt.defaultValue;
      opt.defaultValue = undefined;
    }
    this.hasFields = true;
    this.fields[name].options = opt;
    return this;
  };

  /**
   * Creates a relationship of type (1-to-n) between the current schema and the given schema. The method actually creates
   * a field of type Mongoose.Types.ObjectId.
   * @function hasMany
   * @instance
   * @memberof crux.Database.Mongo.Schema
   * @param {String} schemaName - the target schema that we want to apply the relationship
   * @param {Object} options - additional relationship options.
   * @see {@link http://mongoosejs.com/docs/api.html#schema-objectid-js}
   * */
  schema.prototype.hasMany = function HasMany(schemaName, _opt) {
    var opt = (_.isObject(_opt) ? _opt : {});
    var targetName;
    if(_.isString(opt['as'])) {
      targetName = opt['as'];
      opt['as'] = undefined;
    } else {
      targetName = schemaName;
      var lastChar = targetName.charAt(targetName.length-1);
      if(lastChar !== 's') {
        if(lastChar in ['a','e','i','o','u','h']) {
          targetName += 's'
        }
        if(lastChar === 'y') {
          targetName += 's';
        }
        if(lastChar === 'h') {
          targetName += 'es';
        }
      }
    }
    opt['type'] = mongoose.Schema.Types.ObjectId;
    opt['ref'] = schemaName;
    this.__hasMany[targetName] = opt;
    return this;
  };

  /**
   * Creates a relationship of type (n-to-1) between the current schema and the given schema. The method actually creates
   * a field of type Mongoose.Types.ObjectId.
   * @function belongsTo
   * @instance
   * @memberof crux.Database.Mongo.Schema
   * @param {String} schemaName - the target schema that we want to apply the relationship
   * @param {Object} options - additional relationship options.
   * @see {@link http://mongoosejs.com/docs/api.html#schema-objectid-js}
   * */
  schema.prototype.belongsTo = function BelongsTo(schemaName, _opt) {
    var opt = (_.isObject(_opt) ? _opt : {});
    opt['type'] = mongoose.Schema.Types.ObjectId;
    opt['ref'] = schemaName;
    this.__belongsTo[schemaName] = opt;
    return this;
  };

  /**
   * Attaches the given method to every instance of this schema. This is a wrapper over Mongoose.Schema.method
   *
   * @function method
   * @instance
   * @memberof crux.Database.Mongo.Schema
   * @param {String} name - the method's name
   * @param {Function} fn - the method's callback function
   * @see {@link http://mongoosejs.com/docs/api.html#schema_Schema-method}
   * */
  schema.prototype.method = function RegisterMethod(name, callback) {
    this.methods[name] = callback;
    return this;
  };

  /**
   * Attaches the given function to the Schema definition object. The function will thus be available under the schema definition
   * but not under every schema instance.
   * @function static
   * @instance
   * @memberof crux.Database.Mongo.Schema
   * @param {String} name - the static method's name
   * @param {Function} fn - the static method's callback function
   * @see {@link http://mongoosejs.com/docs/api.html#schema_Schema-static}
   * */
  schema.prototype.static = function RegisterStatic(name, callback) {
    this.statics[name] = callback;
    return this;
  };

  /*
   * Registers a virtual data field.
   * */
  schema.prototype.data = function VirtualDataField(name, obj) {
    // TODO
    return this;
  };

  /*
   * ToJSON override method.
   * */
  schema.prototype.json = function ToJsonOverride(cb) {
    // TODO
    return this;
  };

  /**
   * Marks the given fields as indexes. This is a wrapper over Mongoose.Schema's index options
   * @function index
   * @memberof crux.Database.Mongo.Schema
   * @instance
   * @param {String[]} indexes - an array of indexes
   * @see {@link http://mongoosejs.com/docs/api.html#schematype_SchemaType-index}
   * */
  schema.prototype.index = function SetIndexes(a) {
    var arr = (a instanceof Array ? a : Array.prototype.slice.call(arguments));
    _.forEach(arr, function(idxName) {
      this.indexes.push(idxName);
    }.bind(this));
    return this;
  };

  /*
   * Checks if the schema has an index.
   * */
  schema.prototype.isIndex = function IsFieldIndex(name) {
    return (this.indexes.indexOf(name) !== -1);
  };

  /*
   * This is where we call mongoose.model().
   * */
  schema.prototype.toMongoose = function ToMongoose(mongoose) {
    var data = this.getSchema(),
      _schema = this;
    var schemaObj = mongoose.Schema(data);

    _.forEach(this.methods, function(cb, name) {
      schemaObj.methods[name] = cb;
    });
    _.forEach(this.statics, function(cb, name) {
      schemaObj.statics[name] = cb;
    });
    schemaObj.statics['build'] = function CreateInstance(data) {
      var bObj = new modelObj(data);
      _schema.promisify(bObj, modelObj);
      _schema.wrapJson(bObj);
      return bObj;
    };

    var modelObj = mongoose.model(this.__name, schemaObj, this.collection_name);
    // Promisify over the find() method
    var self = this,
      _find = modelObj.find,
      _findOne = modelObj.findOne;
    modelObj.find = function FindWithPromise(query) {
      return crux.promise(function(resolve, reject) {
        if(typeof query !== 'object' || query === null) {
          return reject(new Error('Invalid mongodb query for ' + self.__name));
        }
        var queryCb = _findOne;
        if(typeof query === 'object' && query && typeof query['where'] === 'object') {
          queryCb = _find;
        }
        var qryObj = queryCb.call(this);
        if(typeof query === 'object' && query) {
          for(var key in query) {
            if(typeof qryObj[key] !== 'function') continue;
            qryObj[key](query[key]);
          }
        }
        if(_schema.__debug) {
          if(queryCb == _find) {
            log.trace('Mongo select `%s` where: %s', _schema.__name, JSON.stringify(query));
          } else {
            log.trace('Mongo find `%s` by: %s', _schema.__name, JSON.stringify(query));
          }
        }
        qryObj.exec(function onResult(err, result) {
          if(err) {
            if(err.name === 'CastError') {
              return resolve(null);
            }
            return reject(err);
          }
          if(result !== null) {
            if(result instanceof Array) {
              for(var q=0; q < result.length; q++) {
                _schema.promisify(result[q], modelObj);
                _schema.wrapJson(result[q]);
              }
            } else {
              _schema.promisify(result, modelObj);
              _schema.wrapJson(result);
            }
          }
          return resolve(result);
        });
      }.bind(this));
    };

    /* Promisified wrapper over the schema.update */
    var _update = modelObj.update;
    modelObj.update = function UpdateSchema(where, attributes, _options) {
      var options = (typeof _options === 'object' && _options !== null ? _options : {});
      return crux.promise(function(resolve, reject) {
        _update.call(this, where, attributes, options, function(err, updateCount) {
          if(err) return reject(err);
          resolve(updateCount);
        });
      }.bind(this));
    };

    /* Promisified exec() */
    var _exec = modelObj.exec;
    modelObj.exec = function Exec() {
      return crux.promise(function(resolve, reject) {
        _exec.call(this, function(err, results) {
          if(err) return reject(err);
          resolve(results);
        });
      }.bind(this));
    };

    /* Promisified destroy */
    var _remove = modelObj.remove;
    modelObj.destroy = function Destroy(_where) {
      return crux.promise(function(resolve, reject) {
        _remove.call(this, _where, function(err, _count) {
          if(err) return reject(err);
          resolve(_count);
        });
      }.bind(this));
    };

    return modelObj;
  };

  /**
  *  Promisifies the given schema object, wrapping the calls with crux.promise
   *
   *  @memberof crux.Database.Mongo.Schema
   *  @function promisify
   *  @instance
   *  @private
  * */
  schema.prototype.promisify = function PromisifyObject(bObj, modelObj) {
    var _save = bObj.save,
      _schema = this;
    bObj.save = function SaveInstance() {
      return crux.promise(function(resolve, reject) {
        if(_schema.__debug) {
          log.trace('Mongo save %s with: ', _schema.__name, JSON.stringify(this.toJSON()));
        }
        _save.call(this, function(err, res) {
          if(err) {
            return reject(err);
          }
          resolve(res);
        });
      }.bind(this));
    };
    // We add the update() field.
    bObj.update = function UpdateWithPromise(_attributes, _opt) {
      return crux.promise(function(resolve, reject) {
        modelObj.update({
          _id: this.get('id')
        }, _attributes, _opt || {}).then(function(_count) {
          if(_count === 0) {
            var e = new Error('The requested ' + _schema.name + ' id '+ this.get('id') +' was not found.');
            e.code = 'NOT_FOUND';
            return reject(e);
          }
          for(var key in _attributes) {
            this.set(key, _attributes[key]);
          }
          resolve();
        }.bind(this)).error(reject);
      }.bind(this));
    };
  };

  /**
   * Wraps the toJSON method over the given object. We do this so that <b>_id</b> is automatically converted to <b>id</b> and <b>_v</b> is removed.
   *
   * @function wrapJson
   * @memberof crux.Database.Mongo.Schema
   * @instance
   * @private
   * @param {Object} obj - the schema object to be json-ified
   * */
  schema.prototype.wrapJson = function WrapJSON(obj) {
    var _json = obj.toJSON;
    obj.toJSON = function ToJsonWrapper() {
      var data = _json.apply(this, arguments);
      if(typeof data['_id'] !== 'undefined') {
        data['id'] = data['_id'].toString();
        data['_id'] = undefined;
      }
      if(typeof data['__v'] !== 'undefined') {
        data['__v'] = undefined;
      }
      return data;
    };
  };


  /*
   * Returns the mongoose-parsed schema.
   * */
  schema.prototype.getSchema = function GetSchema() {
    var d = {};
    _.forEach(this.fields, function(data, name) {
      var mongoOpt = {
        type: data.type,
        default: data.defaultValue
      };
      if(typeof data.type === 'object' && data.type !== null) {
        mongoOpt = data.type;
      }
      if(this.isIndex(name)) {
        mongoOpt['index'] = true;
      }
      d[name] = mongoOpt;
    }.bind(this));
    /* We set our HasMany relationships */
    _.forEach(this.__hasMany, function(data, name) {
      d[name] = [data];
    });
    /* We set our BelongsTo relationship */
    _.forEach(this.__belongsTo, function(data, name) {
      d[name] = data;
    });
    return d;
  };

  return schema;
}

module.exports = init;