/*
* This encapsulates parameter validation. It is included in the Route class,
*  and can be used when declaring a route.
* */
var validation = {};

/*
* NUMBER validation.
* */
validation.NUMBER = function ValidateNumber(name, source) {
  if(typeof source[name] === 'undefined') return false;
  if(typeof source[name] === 'number') return true;

  if(typeof source[name] === 'string') {
    var alphaReg = /^\d+$/;
    if(!alphaReg.test(source[name])) return false;
    var tmp = parseInt(source[name]);
    if(isNaN(tmp)) return false;
    source[name] = tmp;
    return true;
  }
  return false;
};

/*
* ARRAY validation
*   (comma-delimited or json)
* */
validation.ARRAY = function ValidateArray(name, source) {
  if(typeof source[name] === 'undefined') return false;
  var val = source[name];
  if(typeof val === 'string') {
    if(val.trim() === '') return false;
    if(val.indexOf('[') === 0) {
      try {
        var arr = JSON.parse(val);
        source[name] = arr;
        return true;
      } catch(e) {
        return false;
      }
    }
    var arr = val.split(',');
    source[name] = arr;
    return true;
  }
  if(val instanceof Array) {
    return true;
  }
  return false;
};

/*
* String validation (empty string is invalid)
* */
validation.STRING = function ValidateString(name, source) {
  if(typeof source[name] !== 'string' || source[name].trim().length === 0) return false;
  source[name] = source[name].trim();
  return true;
};


/*
 * ENUM validations.
 * Note: ENUM validations are always upperCase.
 * NOTE2: all values in the arguments are enum strings.
 * */
validation.ENUM = function BuildEnumValidation(arra) {
  var enums = [],
    enumArray = (_.isArray(arra) ? arra : arguments);
  _.forEach(enumArray, function(val) {
    if(!_.isString(val)) return;
    enums.push(val);
  });
  return function ValidateEnum(name, source) {
    if(!validation.STRING(name, source)) return false;
    if(enums.indexOf(source[name].toUpperCase()) === -1) return false;
    source[name] = source[name].toUpperCase();
    return true;
  };
};
/*
* Boolean validation
* TRUE values: 1, true
* FALSE values: 0, false
* */
validation.BOOLEAN = function ValidateBoolean(name, source) {
  if(typeof source[name] === 'undefined') return false;
  if(typeof source[name] === 'number') {
    if(source[name] === 1) {
      source[name] = true;
      return true;
    }
    if(source[name] === 0) {
      source[name] = false;
      return true;
    }
    return false;
  }
  if(typeof source[name] === 'string') {
    if(source[name] === '1' || source[name] === 'true') {
      source[name] = true;
      return true;
    }
    if(source[name] === '0' || source[name] === 'false') {
      source[name] = false;
      return true;
    }
  }
  if(typeof source[name] === 'boolean') {
    return true;
  }
  return false;
};

/*
* JSON validator
* */
validation.JSON = function ValidateJson(name, source) {
  if(typeof source[name] !== 'string' || source[name].trim().length < 2) return false;
  if(typeof source[name] === 'object' && source[name] !== null) return true;
  try {
    source[name] = JSON.parse(source[name]);
    return true;
  } catch(e) {
    return false;
  }
};

/*
* EMAIL validator
* */
validation.EMAIL = function ValidateEmail(name, source) {
  if(!validation.STRING(name, source)) return false;
  if(source[name].length < 5) return false;
  var regex = /\S+@\S+\.\S+/;
  if(!regex.test(source[name])) {
    return false;
  }
  source[name] = source[name].trim().toLowerCase();
  return true;
};

function _init() {
// We now bind the "default" call to each validation type, and their type
  _.forEach(validation, function(validateFunc, key) {
    validateFunc['type'] = key.toUpperCase();
    // We add a wrapper over the validation callback, ONLY when we do not find anything in the source.
    validateFunc['default'] = function DefaultValue(_default) {
      return function(name, source) {
        var isValid = validateFunc.apply(this, arguments);
        if(!isValid) {
          source[name] = _default;
          isValid = true;
        }
        return isValid;
      }
    };
  });
}

module.exports = {
  types: validation,
  init: _init
};