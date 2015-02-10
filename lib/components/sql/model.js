var Seq;
/*
* This is the base model extended by every other model definition.
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

/* This function may be overridden */
DbModel.prototype.bind = function BindModel() {};

/*
* Manually sets the name of the model.
* */
DbModel.prototype.name = function SetName(v) {
  this.__name = v;
  return this;
};

/*
* Manually sets the table name of the model
* */
DbModel.prototype.tableName = function SetTableName(v) {
  this.options['tableName'] = v;
  return this;
};

/*
* We bind our methods that will be applied to the model instance.
* */
DbModel.prototype.instanceMethods = function BindInstanceMethods() {
  /* We add the update() method as shorthand */
  this.method('update', function UpdateAttributes(attr, val) {
    var _opt = {};
    if(_.isString(attr)) {
      _opt[attr] = (typeof val === 'undefined' ? this.get(attr) : val);
    }
    if(_.isObject(attr) && !_.isArray(attr)) {
      _opt = attr;
    }
    if(_.isArray(attr)) { // if first argument is array, we only update the given fields.
      for(var i=0; i < attr.length; i++) {
        _opt[attr[i]] = this.get(attr[i]);
      }
    }
    var list = [];
    for(var key in _opt) {
      list.push(key);
      this.set(key, _opt[key]);
    }
    this.options.isNewRecord = false;
    this.isNewRecord = false;
    return this.updateAttributes(_opt, list);
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

/*
 * If we define custom model-level errors, we define them in the each model's js file and we bind them here.
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
    }
  }
  return this;
};

/*
 * Adds composite indexes to the model.
 * OPTIONS:
 *  unique - boolean, equals to type=unique
 *  type - string, the type of index to add
 *  name - the index name, if not set it will be generated.
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


/*
 * Registers a custom error for the model.
 * */
DbModel.prototype.error = function DefineCustomError(code, message) {
  code = code.toUpperCase();
  this.__errors[code] = {
    code: code,
    message: (_.isString(message) ? message : 'An unexpected error occurred.')
  };
  return this;
};

/*
* Registers a field in the model definition.
* Arguments
*   @type - The type of the field. See http://sequelizejs.com/docs/1.7.8/models#data-types
*   @options - The options we want to apply to the field. See http://sequelizejs.com/docs/1.7.8/models#block-1-line-0
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
    opt['allowNull'] = false;
  }
  if (typeof type._parseJson === 'boolean' && type._parseJson === true) {
    this.hasJsonFields = true;
    this.__jsonFields.push(name);
    if (typeof options['defaultValue'] === 'object' && options['defaultValue'] !== null) {
      try {
        opt['defaultValue'] = JSON.stringify(options['defaultValue']);
      } catch (e) {
        log.fatal('Invalid JSON default value for field %s on model %s', name, this.__name);
        log.error(e);
        return this;
      }
    }
  }
  this.hasFields = true;
  this.fields[name] = opt;
  return this;
};

/*
* Registers the current model definition as belonging to the given definition name. As a default option, we include
* the foreign key, which is <name>_id. Common options can include (See http://sequelizejs.com/docs/1.7.8/associations#block-1-line-4)
 *    - "as": "<alias>" - should we want to give a different name to our relationship.
 * Example:
 * User.belongsTo("Application") will allow us to do:
 * User.findOne({id:1}).then(function(userObj){
 *    userObj.getApplication().then(function(appObj) {
 *      // We now have the application object in appObj
 *    });
 * });
* */
DbModel.prototype.belongsTo = function BelongsTo(name, options) {
  if (typeof this.__belongsTo[name] !== 'undefined') {
    throw new Error("Cannot re-declare belongsTo " + name + ' for model ' + this.__name);
  }
  if (typeof options === 'undefined') options = {};
  if (typeof options['foreignKey'] === 'undefined') {
    options['foreignKey'] = name + "_id";
  }
  if (typeof options['onDelete'] === 'undefined') {
    options['onDelete'] = 'cascade'
  }
  if (typeof options['onUpdate'] === 'undefined') {
    options['onUpdate'] = 'cascade'
  }
  // By default we do not allow null values
  if (typeof options['allowNull'] !== 'boolean') {
    options['allowNull'] = false;
  }
  options['foreignKeyConstraint'] = true;
  this.__belongsTo[name] = options;
  this.hasRelationships = true;
  return this;
};

/*
* Registers a belongs to relationship between the current model and the given one. The function will also use a default
* foreignKey which is <name>_id that is being used in the database foreign key creation.
* Example of One-To-Many relationship
* // We have a user model
* // We have a logo model
* User.hasMany('logo', { as: "Logos" })
*
* This will allow us to perform the following execution
* User.findOne({id: 1}).then(function(userObj) {
*   userObj.getLogos().then(function(logos) {
*     // We now have all the user's logos as an array of logo objects
*   });
* });
*
* NOTE: If we want to define a Many-To-Many relationship, the hasMany definition must reside in both models, and explicitly
*       include the "through" option (the link table that contains both foreign keys)
* Example of Many-To-Many relationship:
* // We have a user model
* / We have a logo model
* User.hasMany('logo', { as: "Logos", through: "users_logos"});
* Model.hasMany('user', { as: "Users", through: "users_logos"});
*   // This will generate a table called users_logos that has 2 fields: user_id and logo_id, both being the primary key
*   // We can then further continue with User.getLogos() as well as Model.getLogos()
* */
DbModel.prototype.hasMany = function HasMany(name, options) {
  if(typeof this.__belongsTo[name] !== 'undefined') {
    throw new Error("Cannot re-declare hasMany " + name + ' for model ' + this.__name);
  }
  if(typeof options === 'undefined') options = {};
  if(typeof options['foreignKey'] === 'undefined') {
    options['foreignKey'] = this.__name + "_id";
  }
  if(typeof options['onDelete'] === 'undefined') {
    options['onDelete'] = 'cascade'
  }
  if(typeof options['onUpdate'] === 'undefined') {
    options['onUpdate'] = 'cascade'
  }
  // By default we do not allow null values
  if(typeof options['allowNull'] === 'undefined') {
    options['allowNull'] = false;
  }

  options['foreignKeyConstraint'] = true;
  this.__hasMany[name] = options;

  this.hasRelationships = true;
  return this;
};

/*
 * Marks the current model definition as having a given model, so that it can be available with get<name>. This usually goes
 * hand in hand with belongsTo relationship, when we want to have bi-directional access (User.getModel() and Model.getUser())
 * NOTE: A common option is "allowNull" - which basically marks the relationship as a 0..1 one.
 *  As an example:
 *  // We have a User model
 *  // We have a Logo model
 *  User.hasOne('logo')   -> generates the "logo_id" field in the user table
 *  // We can now perform
 *  User.findOne({id: 1}).then(function(userObj) {
 *    userObj.getLogo().then(function(logoObj) {
 *      // We now have access  to the logo object.
 *    });
 *  });
 * */
DbModel.prototype.hasOne = function HasOne(name, options) {
  if(typeof this.__belongsTo[name] !== 'undefined') {
    throw new Error("Cannot re-declare hasOne " + name + ' for model ' + this.__name);
  }
  if(typeof options === 'undefined') options = {};
  if(typeof options['foreignKey'] === 'undefined') {
    options['foreignKey'] = this.__name + "_id";
  }
  if(typeof options['onDelete'] === 'undefined') {
    options['onDelete'] = 'cascade'
  }
  if(typeof options['onUpdate'] === 'undefined') {
    options['onUpdate'] = 'cascade'
  }
  options['foreignKeyConstraint'] = true;
  this.__hasOne[name] = options;
  this.hasRelationships = true;
  return this;
};

/*
* This will attach a function to the model instance whenever a model will be created from a find, or populate method
* As an example:
* // We have a User model
* User.method('getId', function() {
*   return this.get('id');
* });
* // We then read a user
* User.findOne({id: 1}).then(function(userObj) {
*   // We now have access to the getId() method.
*   userObj.getId() //--> will return 1
* });
* */
DbModel.prototype.method = function RegisterMethod(name, callback) {
  this.methods[name] = callback;
  this.hasMethods = true;
  return this;
};

/*
* This will attach a function to the class definition and not the model instance.
* Therefore we will be able to do:
* User.static('doSomething', function(){});
* this.model('user').doSomething()
* */
DbModel.prototype.static = function RegisterStatic(name, callback) {
  this.statics[name] = callback;
  this.hasStatics = true;
  return this;
};

/*
* This will attach a validation function to our model so that whenever we want to validate an instance of the model,
* all the previously registered validation methods will be executed.
* NOTE:
*     - the validation will be called as "validateName"
*     - the registered validation method will be called whenever we call userObj.validate();
*     - validations should be called on models whenever we are trying to persist changes to the database.
* */
DbModel.prototype.validate = function RegisterValidate(name, callback) {
  var vname = "validate" + name.charAt(0).toUpperCase() + name.substr(1);
  this.validations[vname] = callback;
  this.hasValidations = true;
  return this;
};

/*
* Places a custom setter method for a field.
* */
DbModel.prototype.setter = function SetSetter(field, cb) {
  if (typeof this.options['setterMethods'] === 'undefined') {
    this.options['setterMethods'] = {};
  }
  this.options['setterMethods'][field] = cb;
  return this;
};
/*
* Places a custom getter method for a field.
* */
DbModel.prototype.getter = function SetGetter(field, cb) {
  if (typeof this.options['getterMethods'] === 'undefined') {
    this.options['getterMethods'] = {};
  }
  this.options['getterMethods'][field] = cb;
  return this;
};

/*
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
      if(typeof this.getDataValue(field) === 'object') {
        return this.getDataValue(field);
      }
      if(typeof this.getDataValue(field) === 'string') {
        try {
          var json = JSON.parse(this.getDataValue(field));
          return json;
        } catch(e) {
          log.warn('Model %s could not get JSON field %s', modelName, field);
          log.debug(e, this.getDataValue(field));
          return {};
        }
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