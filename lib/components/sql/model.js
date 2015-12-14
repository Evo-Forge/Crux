var Seq,
  _ = require('underscore');
/**
* This is the base model used by every crux model definition to register themselves in the crux sql component
 *
 * @memberof crux.Database.Sql
 * @class Model
 * @param {String} name - the model definition's name
 * @param {String} tableName - the model's table name
 * @example
 *  // current model file: models/user.js
 *  module.exports = function(user, Seq, Db) {
 *    // At this point, the table name is "user" but we can change that
 *    user.tableName('users');
 *    // The model's name is by default its file name. We can also change that
 *    user.name('Users');
 *    user
 *      .field('id', Seq.PRIMARY) // primary int(11) auto_incremented
 *      .field('name', Seq.STRING)
 *      .field('age', Seq.INTEGER, {
 *        allowNull: true,
 *        defaultValue: null
 *      });
 *
 *   // We can also manually decare indexes.
 *   user.index('name');
 *   // Having previously declared the model application, we can create a relationship to it
 *   user
 *    .hasMany('application', {
 *      as: 'application',
 *      foreignKey: 'application_id'
*     });
*     // We can also attach a method to our model INSTANCES.
*     user
*       .method('hello', function() {
*         console.log("Hello from %s", this.get('id');
*       })
*       // We can also attach a method to the MODEL object (as a static function).
*       // At this point, we need to use the Db (crux.Database.Sql) component to get the model name.
*       .static('read', function ReadUser(id) {
*         return crux.promise(function(resolve, reject) {
*             Db.getModel('user').find(id).then(function(user) {
*               if(!user) return reject(new Error('USER_NOT_FOUND'));
*               // We can also attach custom data to the model instance
*               user.data('someKey', 'someValue');
*               // And we can later on access it
*               var a = user.data('someKey'); // => "someValue"
*               resolve(user);
*             }).error(reject);
*         });
*       });
 *  };
* */
var DbModel = function DatabaseDbModel(name, tableName) {
  this.__name = name;
  this.hasRelationships = false;
  this.hasValidations = false;
  this.hasMethods = false;
  this.hasStatics = false;
  this.hasFields = false;
  this.fields = {};
  this.__hasMany = {};
  this.__hasOne = {};
  this.__belongsTo = {};
  this.__errors = {};
  this.__jsonFields = [];
  this.hasJsonFields = false;
  this.methods = {};
  this.statics = {};
  this.validations = {};
  this.options = {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: false
  };
  if (typeof tableName === 'string') {
    this.options['tableName'] = tableName;
  } else {
    this.options['tableName'] = tableName;
  }
  this.instanceMethods();
};


/**
* This function is called when the crux model is loaded and all its relationships have been mapped.
 * By default, it does nothing, but is a good way to hook into the sequelize model instance, before it is
 * attached to the actual crux model instance.
 * @memberof crux.Database.Sql.Model
 * @function bind
 * @instance
 * @param {Sequelize.Model} seq - the sequelize model instance that will be wrapped by the crux sql model
 * @example
 *  var BaseModel = crux.Database.Sql.Model;
 *  // we will override the bind method
 *  BaseModel.prototype.bind = function(seqObj) {
 *    seqObj.hook('beforeUpdate', function(done) {
 *      console.log("Updating %s", this.get('id');
 *      done();
 *    });
 *  };
 *
* */
DbModel.prototype.bind = function BindModel() {};

/**
* Manually set the name of the model. By default, it is the name of the file it was defined in.
 *
 * @memberof crux.Database.Sql.Model
 * @function name
 * @instance
 * @param {String} name - the new model name.
* */
DbModel.prototype.name = function SetName(v) {
  this.__name = v;
  return this;
};

/**
* Manually sets the table name of the model. By default, the table name is the file name.
 * @memberof crux.Database.Sql.Model
 * @function tableName
 * @instance
 * @param {String} name - the new table name.
* */
DbModel.prototype.tableName = function SetTableName(v) {
  this.options['tableName'] = v;
  return this;
};

/**
* We bind our methods that will be applied to the model instance.<br/>
 * This is an internal function that should not be overridden.
 * @memberof crux.Database.Sql.Model
 * @function instanceMethods
 * @instance
 * @private
* */
DbModel.prototype.instanceMethods = function BindInstanceMethods() {
  /* We add the update() method as shorthand */
  this.method('update', function UpdateAttributes(attr, val) {
    var _opt = {},
      options = {};
    if(_.isString(attr)) {
      _opt[attr] = (typeof val === 'undefined' ? this.get(attr) : val);
    }
    if(_.isObject(attr) && !_.isArray(attr)) {
      _opt = attr;
      options = val;
    }
    if(_.isArray(attr)) { // if first argument is array, we only update the given fields.
      for(var i=0; i < attr.length; i++) {
        _opt[attr[i]] = this.get(attr[i]);
      }
      options = val;
    }
    if(typeof options === 'undefined') options = {};
    options.fields = [];
    for(var key in _opt) {
      options.fields.push(key);
      this.set(key, _opt[key]);
    }
    this.options.isNewRecord = false;
    this.isNewRecord = false;
    return this.updateAttributes(_opt, options);
  });
  /*
  An additional utility function that allows us to attach additional data to a database model instance
  Works as a setter & getter
  */
  this.method('data', function AdditionalData(key, value) {
    if(typeof this.__ADDITIONAL_DATA === 'undefined') {
      this.__ADDITIONAL_DATA = {};
    }
    if(!_.isString(key)) {
      return this.__ADDITIONAL_DATA;
    }
    if(typeof value !== 'undefined') {
      this.__ADDITIONAL_DATA[key] = value;
      return this;
    } else {
      return (typeof this.__ADDITIONAL_DATA[key] === 'undefined' ? null : this.__ADDITIONAL_DATA[key]);
    }
    return this;
  });
  this.method('isNew', function IsNew() {
    if(this.options.isNewRecord) return true;
    return false;
  });
};

/**
 * If we define custom model-level errors, we define them in the each model's js file and we bind them here.<br/>
 * This is an internal function and should not be overridden.
 * @memberof crux.Database.Sql.Model
 * @function bindMethods
 * @instance
 * @private
 * @param {crux.Database.Sql.Model} model - the model that we are working with.
 * */
DbModel.prototype.bindMethods = function BindModelMethods(modelObj) {
  // Binding the NOT_FOUND error code.
  for (var errCode in this.__errors) {
    modelObj[errCode] = this.__errors[errCode];
  }
  // We also define custom NOT_FOUND errors
  if(typeof modelObj['NOT_FOUND'] === 'undefined') {
    modelObj['NOT_FOUND'] = {
      code: 'NOT_FOUND',
      message: 'The requested ' + this.__name + ' was not found.'
    };
    if(typeof modelObj.tableName === 'string') {
      modelObj['NOT_FOUND'].code = modelObj.tableName.toUpperCase() + '.' + modelObj['NOT_FOUND'].code;
    }
  }
  /* Backwards compatibility with seq 1.7 */
  var _update = modelObj.update;
  modelObj.update = function UpdateWrapper(data, where, _opt) {
    // IF we have the old version with 3 arguments, go with that.
    if(typeof _opt !== 'object' || !_opt) {
      if(typeof where === 'object' && (where.where || where.transaction)) {
        _opt = where;
      } else {
        _opt = {};
        _opt.where = where;
      }
    } else {
      _opt.where = where;
    }
    return _update.call(this, data, _opt);
  };

  function findWhereOptWrapper(where, _opt) {
    if(typeof _opt !== 'object' || !_opt) _opt = {};
    if(typeof where === 'object' && where) {
      if(typeof where.where !== 'undefined') {
        _opt = where;
      } else {
        _opt.where = where;
      }
    }
    return _opt;
  }

  var _destroy = modelObj.destroy;
  modelObj.destroy = function DestroyWrapper(where, _opt) {
    return _destroy.call(this, findWhereOptWrapper(where, _opt));
  };

  var _count = modelObj.count;
  modelObj.count = function CountWrapper(where, _opt) {
    return _count.call(this, findWhereOptWrapper(where, _opt));
  };

  function findOrWrapper(where, data, _opt) {
    // IF we have the old version with 3 arguments, go with that.
    if(typeof _opt !== 'object' || !_opt) {
      if(typeof where === 'object' && (where.where || where.transaction)) {
        _opt = where;
      } else {
        _opt = {};
        _opt.where = where;
      }
    } else {
      _opt.where = where;
    }
    if(typeof _opt.defaults !== 'object') {
      _opt.defaults = data;
    }
    return _opt;
  }

  var _findOrCreate = modelObj.findOrCreate;
  modelObj.findOrCreate = function FindOrCreateWrapper(where, data, _opt) {
    return _findOrCreate.call(this, findOrWrapper(where, data, _opt));
  };
  var _findOrUpdate = modelObj.findOrUpdate;
  modelObj.findOrUpdate = function FindOrUpdateWrapper(where, data, _opt) {
    return _findOrUpdate.call(this, findOrWrapper(where, data, _opt));
  };

  var _findOneAndUpdate = modelObj.findOneAndUpdate;
  modelObj.findOneAndUpdate = function FindOneAndUpdateWrapper(where, data, _opt) {
    return _findOneAndUpdate.call(this, findOrWrapper(where, data, _opt));
  };

  if(modelObj.options.updatedAt === false && typeof modelObj.options.createdAt === 'string') {
    var _build = modelObj.build;
    modelObj.build = function BuildWrapper() {
      var returned = _build.apply(this, arguments);
      returned.set(modelObj.options.createdAt, Date.now());
      return returned;
    };
  }

  return this;
};

/**
 * Marks the specified field as an index. If its name is not given, the index name will be generated.
 *
 * @memberof crux.Database.Sql.Model
 * @function index
 * @instance
 * @param {String[]|String} fields - the field names that we're using to build the index.
 * @param {Object} [opt=null] - additional index options
 * @param {Boolean} [opt.unique] - marks the index as unique.
 * */
DbModel.prototype.index = function AddIndex(fields, _opt) {
  if (!_.isArray(this.options['indices'])) {
    this.options['indices'] = [];
  }
  if (!_.isObject(_opt)) _opt = {};
  var idx = {
    type: (_opt.type ? _opt.type : (_opt.unique ? 'UNIQUE' : undefined)),
    name: (_opt.name ? _opt.name : undefined),
    fields: (_.isArray(fields) ? fields : [fields])
  };
  this.options['indices'].push(idx);
  return this;
};


/**
 * Registers a custom error for the model. Custom crux model errors can be used throughout the application to handle
 * predictable errors or errors generated by user input.<br/>
 *
 * @memberof crux.Database.Sql.Model
 * @function error
 * @instance
 * @param {String} code - the error code, in upper case
 * @param {String} message - additional error message.
 *
 * @example
 *  // file: account.js
 *  module.exports = function(account, Seq) {
 *    account.field('id', Seq.PRIMARY);
 *
 *    account
 *      .error('NOT_FOUND', 'The requested account was not found')
 *      .error('INACTIVE', 'This account is not active');
 *  };
 *
 *  // somewhere in a route definition
 *  route
 *    .get('/')
 *    .then(function() {
 *      var Account = this.model('account');
 *      this.error(Account.NOT_FOUND);  // the error code will be attached to the actual model instance
 *      console.log(Account.NOT_FOUND); // => { code: 'ACCOUNT.NOT_FOUND', message: 'Account not found' }
 *    });
 * */
DbModel.prototype.error = function DefineCustomError(code, message, _data) {
  code = code.toUpperCase();
  var tableCode = this.options.tableName.toUpperCase(),
    fullCode = (_data === false ? code : tableCode + '.' + code);
  this.__errors[code] = {
    ns: tableCode,
    code: fullCode,
    message: (_.isString(message) ? message : 'An unexpected error occurred.')
  };
  if(typeof _data !== 'undefined' && _data != null) {
    this.__errors[code].data = _data;
  }
  return this;
};

/**
* Registers a field in the model definition.
 *
 * @memberof crux.Database.Sql.Model
 * @function field
 * @instance
 * @param {String} name - the field's name. Should not contain spaces
 * @param {Sequelize.TYPE} type - the field type. {@link http://sequelizejs.com/docs/1.7.8/models#data-types}
 * @param {Object} [options] - addition options passed to sequelize when defining the field {@link http://sequelizejs.com/docs/1.7.8/models#block-1-line-0}
 * @example
 *  // account.js
 *  module.exports = function(account, Seq) {
 *    account
 *      .field('id', Seq.PRIMARY)
 *      .field('name', Seq.STRING, {
 *        defaultValue: 'John'
 *      })
 *      .field('age', Seq.NUMBER, {
*         defaultValue: null,
*         allowNull: true
 *      });
 *  };
* */
DbModel.prototype.field = function Field(name, type, _options) {
  var opt = {
    type: type
  };
  var options = (_.isObject(_options) ? _options : {});
  if (typeof options === 'object' && options !== null) {
    for (var k in options) {
      opt[k] = options[k];
    }
  }
  if(typeof type === 'undefined') {
    throw new Error("Invalid Database field type for " + name);
  }
  if (type._custom === 'primary') {
    opt['primaryKey'] = true;
    opt['autoIncrement'] = true;
  }
  // By default we do not allow null values
  if (typeof opt['allowNull'] === 'undefined') {
    opt['allowNull'] = true;
  }
  if (type._parseJson === true) {
    this.hasJsonFields = true;
    this.__jsonFields.push(name);
    if (typeof options['defaultValue'] === 'object' && options['defaultValue'] !== null) {
      if(typeof this.__jsonDefaults === 'undefined') this.__jsonDefaults = {};
      this.__jsonDefaults[name] = options['defaultValue'];
    }
    delete opt['defaultValue'];
  }
  this.hasFields = true;
  this.fields[name] = opt;
  return this;
};

/**
* Declares a Sequelize Hook, calling the given function whenever that event happens on the current Sequelize model.
 * For more information on hooks, see {@link http://docs.sequelizejs.com/en/latest/docs/hooks/}.
 * @memberof crux.Database.Sql.Model
 * @function hook
 * @instance
 * @param {String} name - the hook name
 * @param {Function} cb - the callback function
* */
DbModel.prototype.hook = function DeclareHook(hookName, onCallback) {
  if(typeof this.options['hooks'] !== 'object') {
    this.options['hooks'] = {};
  }
  this.options['hooks'][hookName] = onCallback;
  return this;
};

function getForeignKeySettings(name, options) {
  if (typeof options !== 'object' || !options) options = {};
  var canBeNull = (typeof options['allowNull'] === 'boolean' ? options['allowNull'] : true);
  if (typeof options['foreignKey'] === 'undefined') {
    var keyName = name + '_id';
    options['foreignKey'] = {
      name: keyName,
      allowNull: canBeNull
    };
  } else {
    if(typeof options.foreignKey === 'string') {
      options.foreignKey = {
        name: options.foreignKey,
        allowNull: canBeNull
      }
    }
  }
  if (typeof options['onDelete'] === 'undefined') {
    options['onDelete'] = 'CASCADE'
  }
  if (typeof options['onUpdate'] === 'undefined') {
    options['onUpdate'] = 'CASCADE'
  }
  options['constraints'] = (typeof options.constraints === 'boolean' ? options.constraints : true);
  return options;
}

/**
* Registers the current model definition as belonging to the given definition name. As a default option, we include
* the foreign key, which is <name>_id. <br/>
 * Common options can include (See {@link http://sequelizejs.com/docs/1.7.8/associations#block-1-line-4})
 *    - "as": "<alias>" - should we want to give a different name to our relationship.
 *
 * @memberof crux.Database.Sql.Model
 * @function belongsTo
 * @instance
 * @param {String} name - the crux model definition name
 * @param {Object} [options] - additional relationship options.
 * @example
 *  // model defitition in user.js
 *  user.belongsTo("Application") will allow us to do:
 *  // somewhere in a route
 *  this.model('user').findOne({id:1}).then(function(userObj){
 *    userObj.getApplication().then(function(appObj) {
 *      // We now have the application object in appObj
 *    });
 * });
* */
DbModel.prototype.belongsTo = function BelongsTo(name, options) {
  if (typeof this.__belongsTo[name] !== 'undefined') {
    throw new Error("Cannot re-declare belongsTo " + name + ' for model ' + this.__name);
  }
  options = getForeignKeySettings(name, options);
  this.__belongsTo[name] = options;
  this.hasRelationships = true;
  return this;
};



/**
* Registers a belongs to relationship between the current model and the given one. The function will also use a default
* foreignKey which is <name>_id that is being used in the database foreign key creation.<br/>
* Example of One-To-Many relationship<br/>
* <pre>// We have a user model
* // We have a logo model
* User.hasMany('logo', { as: "Logos" })
*
* //This will allow us to perform the following execution
* User.findOne({id: 1}).then(function(userObj) {
*   userObj.getLogos().then(function(logos) {
*     // We now have all the user's logos as an array of logo objects
*   });
* });
* </pre><br/>
 * NOTE: If we want to define a Many-To-Many relationship, the hasMany definition must reside in both models, and explicitly
 *       include the "through" option (the link table that contains both foreign keys)<br>
 * Example of Many-To-Many relationship:<br>
 *   <pre>
 * // We have a user model
 * / We have a logo model
 * User.hasMany('logo', { as: "Logos", through: "users_logos"});
 * Model.hasMany('user', { as: "Users", through: "users_logos"});
 *   // This will generate a table called users_logos that has 2 fields: user_id and logo_id, both being the primary key
 *   // We can then further continue with User.getLogos() as well as Model.getLogos()
 *  </pre>
 * @memberof crux.Database.Sql.Model
 * @function hasMany
 * @instance
 * @param {String} name - the crux model definition name
 * @param {Object} [options] - additional relationship options.
* */
DbModel.prototype.hasMany = function HasMany(name, options) {
  if(typeof this.__belongsTo[name] !== 'undefined') {
    throw new Error("Cannot re-declare hasMany " + name + ' for model ' + this.__name);
  }
  options = getForeignKeySettings(this.__name, options);
  this.__hasMany[name] = options;
  this.hasRelationships = true;
  return this;
};

/**
 * Marks the current model definition as having a given model, so that it can be available with get<name>. This usually goes
 * hand in hand with belongsTo relationship, when we want to have bi-directional access (User.getModel() and Model.getUser())<br/>
 *
 * <b>NOTE</b>: A common option is "allowNull" - which basically marks the relationship as a 0..1 one.<br/>
 *  As an example:<br>
 *    <pre>
 *  // We have a User model
 *  // We have a Logo model
 *  User.hasOne('logo')   -> generates the "logo_id" field in the user table
 *  // We can now perform
 *  User.findOne({id: 1}).then(function(userObj) {
 *    userObj.getLogo().then(function(logoObj) {
 *      // We now have access  to the logo object.
 *    });
 *  });
 *  </pre>
 *
 *  @memberof crux.Database.Sql.Model
 *  @function hasOne
 *  @instance
 * @param {String} name - the crux model definition name
 * @param {Object} [options] - additional relationship options.
 * */
DbModel.prototype.hasOne = function HasOne(name, options) {
  if(typeof this.__belongsTo[name] !== 'undefined') {
    throw new Error("Cannot re-declare hasOne " + name + ' for model ' + this.__name);
  }
  options = getForeignKeySettings(this.__name, options);
  this.__hasOne[name] = options;
  this.hasRelationships = true;
  return this;
};

/**
* This will attach a function to the model instance whenever a model will be created from a find, or populate method<br>
 *
 * @memberof crux.Database.Sql.Model
 * @function method
 * @instance
 * @param {String} name - the method name
 * @param {Function} cb - the method's callback function.
 * @example
*   // We have a User model
*   User.method('getId', function() {
*     return this.get('id');
*   });
*   // We then read a user
*   User.findOne({id: 1}).then(function(userObj) {
*    // We now have access to the getId() method.
*    userObj.getId() //--> will return 1
*   });
* */
DbModel.prototype.method = function RegisterMethod(name, callback) {
  this.methods[name] = callback;
  this.hasMethods = true;
  return this;
};

/**
* This will attach a function to the class definition and not the model instance.
*
 * @memberof crux.Database.Sql.Model
 * @function static
 * @instance
 * @param {String} name - the static method's name
 * @param {Function} cb - the static method's callback function
 * @example
 * // user.js model file
 * module.exports = function(user,Seq) {
 *  user
 *    .field('id', Seq.PRIMARY);
 *
 *  user.static('read', function GetId(){
 *    console.log('Should read a user');
 *    // at this point, "this" references to the Sequelize model definition class.
 *    return this.find;
 *  });
 * };
 *  User.static('doSomething', function(){});
*   this.model('user').doSomething()
* */
DbModel.prototype.static = function RegisterStatic(name, callback) {
  this.statics[name] = callback;
  this.hasStatics = true;
  return this;
};

/**
* This method will attach custom static DATA to the class definition model. This is useful for when we have static data
 * that is associated with the given model and it should be contained in the same definition file.<br/>
 *  NOTE<br />
 *   The field name will always be transformed to full upper case to avoid collisions with other internal functionalities.
 *
 * @memberof crux.Database.Sql.Model
 * @function data
 * @param {String} name - the field name we will place the data in
 * @param {Any} data - the data we want to associate with the field.
 * @example
 *  var myPermissions = {
 *    'CAN_READ': 'USER_CAN_READ'
 *  }
 *  user.data('PERMISSIONS', myPermissions);
 *
 * // In a route or service
 * var myModel = this.model('user');
 * console.log(myModel.PERMISSIONS.CAN_READ); // -> { 'CAN_READ': 'USER_CAN_READ' }
* */
DbModel.prototype.data = function SetStaticData(fieldName, data) {
  if(typeof fieldName !== 'string') throw new Error('Crux.Db.Model: field name ' + fieldName + ' is not valid for static data.');
  fieldName = fieldName.toUpperCase();
  if(typeof data === 'undefined' || data == null) return this;
  this.statics[fieldName] = data;
  this.hasStatics = true;
  return this;
};

/**
* This will attach a validation function to our model so that whenever we want to validate an instance of the model,
* all the previously registered validation methods will be executed.<br>
* NOTE:<br>
*     - the validation will be called as "validateName"<br>
*     - the registered validation method will be called whenever we call userObj.validate();<br>
*     - validations should be called on models whenever we are trying to persist changes to the database.<br>
 * @memberof crux.Database.Sql.Model
 * @function validate
 * @param {String} name - the validation name
 * @param {Function} callback - the validation callback.
* */
DbModel.prototype.validate = function RegisterValidate(name, callback) {
  var vname = "validate" + name.charAt(0).toUpperCase() + name.substr(1);
  this.validations[vname] = callback;
  this.hasValidations = true;
  return this;
};

/**
* Places a custom setter method for a field.
 *
 * @memberof crux.Database.Sql.Model
 * @function setter
 * @instance
 * @param {String} field - the field's name
 * @param {Function} cb - the callback to be called when set is called.
 * @example
 *  // user.js
 *  module.exports = function(user, Seq) {
 *    user.field('id', Seq.PRIMARY)
 *      .field('name', Seq.STRING);
 *
 *    user.setter('name', function OnNameSet(v) {
 *      console.log("Seting name: %s", v);
 *      this.dataValues.name = v;
 *      return this;
 *    });
 *  };
* */
DbModel.prototype.setter = function SetSetter(field, cb) {
  if (typeof this.options['setterMethods'] === 'undefined') {
    this.options['setterMethods'] = {};
  }
  this.options['setterMethods'][field] = cb;
  return this;
};
/**
* Places a custom getter method for a field.
 * @memberof crux.Database.Sql.Model
 * @function getter
 * @instance
 * @param {String} field - the field's name
 * @param {Function} cb - the callback to be called when get is called.
 * @example
 *  // user.js
 *  module.exports = function(user, Seq) {
 *    user.field('id', Seq.PRIMARY)
 *      .field('name', Seq.STRING);
 *
 *    user.getter('name', function OnNameSet() {
 *      console.log("Returning name: %s", this.dataValues.name);
 *      return 'Mr. ' + this.dataValues.name;
 *    });
 *  };

 * */
DbModel.prototype.getter = function SetGetter(field, cb) {
  if (typeof this.options['getterMethods'] === 'undefined') {
    this.options['getterMethods'] = {};
  }
  this.options['getterMethods'][field] = cb;
  return this;
};

/**
* Because we can now define the type Seq.JSON (which is manually created by our db service),
* models that contain a JSON-type field must have their toJSON function overridden.
* */
DbModel.prototype.markJsonFields = function BindJSON () {
  if(typeof this.options['getterMethods'] === 'undefined') {
    this.options['getterMethods'] = {};
  }
  if(typeof this.options['setterMethods'] === 'undefined') {
    this.options['setterMethods'] = {};
  }
  var modelName = this.__name,
    self = this;
  _.each(this.__jsonFields, function(field) {
    // Setting up the setter method for our jsons
    self.fields[field].set = function Set(val) {
      if(typeof val === 'object') {
        try {
          this.setDataValue(field, JSON.stringify(val));
        } catch(e) {
          log.warn('Model %s could not stringify JSON field %s', modelName, field);
          log.debug(e, val);
          this.setDataValue(field, "{}");
        }
      }
      if(typeof val === 'string' && val !== '') {
        try {
          var json = JSON.parse(val);
          this.setDataValue(field, val);
        } catch(e) {
          log.warn('Model %s could not parse JSON field %s', modelName, field);
          log.debug(e, val);
          this.setDataValue(field, "{}");
        }
      }
    };
    // Setting up the getter method for our jsons
    self.fields[field].get = function Get() {
      var _dataValue = this.getDataValue(field);
      if(_dataValue == "null") _dataValue = null;
      if(typeof _dataValue === 'object' && _dataValue !== null) {
        return _dataValue;
      }
      if(typeof _dataValue === 'string' && _dataValue.trim() !== '') {
        try {
          var json = JSON.parse(_dataValue);
          return json;
        } catch(e) {
          log.warn('Model %s could not get JSON field %s', modelName, field);
          log.debug(e, _dataValue);
          return {};
        }
      }
      if(typeof self.__jsonDefaults === 'object' && typeof self.__jsonDefaults[field] !== 'undefined') {
        return self.__jsonDefaults[field];
      }
      return {};
    };
  });
};

module.exports = {
  model: DbModel,
  init: function(seq) {
    Seq = seq;
  }
};