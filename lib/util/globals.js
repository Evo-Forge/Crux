var fs = require('fs'),
  _path = require('path'),
  crypto = require('crypto'),
  util = require('util'),
  promise = require('bloody-promise'),
  underscore = require('underscore');
/*
 * Utility functions that can be used everywhere
 * */
global['_'] = underscore;
/*
* Check if we have a SQL error
* */
_['isSqlError'] = function IsSqlError(err) {
  if(typeof err !== 'object' || err === null) return false;
  if(typeof err['sqlState'] === 'undefined') return false;
  return true;
};

/*
* Check if we have a Krux component.
* */
_['isKruxComponent'] = function IsKruxComponent(obj) {
  if(typeof obj !== 'object') return false;
  if(obj.__type === 'KruxComponent') return true;
  return false;
};
_['isKruxService'] = function isKruxService(obj) {
  if(typeof obj !== 'object') return false;
  if(obj.__type === 'KruxService') return true;
  return false;
};

if(typeof promise.error !== 'function') {
  promise.error = promise.catch;
}
/* Small fix for our bloody-promise's create */
var _create = promise.create;
promise.create = function CreatePromise(cb) {
  if(typeof cb !== 'function') {
    return _create.call(this);
  }
  var _rejCalled = false;
  var pObj = _create.call(this, function(resolve, reject) {
    try {
      cb.apply(this, arguments);
    } catch(e) {
      _rejCalled = true;
      return reject(e);
    }
  });
  console.log("CREATED")
  console.log(pObj);
  return;
  pObj.on('error', function(e) {
    if(_rejCalled) return;
    log.warn('Encountered an error in promise.');
    log.debug(e);
    return reject(e);
  });
  return pObj;
};

/*
* We create an utility function that can allow us to clone functions.
* WARNING: this should ONLY be used in functions that are called rarely in the application, and not where speed is critical
* */
Function.prototype.cloneFunction = function() {
  var that = this;
  var temp = function () { return that.apply(this, arguments); };
  for(var key in this) {
    if (this.hasOwnProperty(key)) {
      temp[key] = this[key];
    }
  }
  return temp;
};

/*
 * Performs regular util inheritance, with the exception that it will not override old functions,
 * but it will add them a _ at the end
 * ex:
 *   init() in source, will become init_() in target. We do that by using __defineSetter__
 * */
Function.prototype.Extends = function KruxProtoInheritance(target) {
  if(!target || typeof target.prototype !== 'object') {
    throw new Error('Function.extends: target is not a function');
  }
  util.inherits(this, target);
  var self = this;
  _.forEach(target.prototype, function(a, fName) {
    if(typeof target.prototype[fName] !== 'function') return;
    var extendedFunc = target.prototype[fName];
    Object.defineProperty(self.prototype, fName, {
      enumerable: true,
      configurable: true,
      get: function Extended() {
        return extendedFunc;
      },
      set: function(fVal) {
        // We first check if we've had any previous values on the function.
        var parentFuncName = buildName(self.super_.prototype, fName);
        this[parentFuncName] = self.super_.prototype[fName];
        extendedFunc = fVal;
      }
    });
  });
};
function buildName(obj, name) {
  while(typeof obj[name] !== 'undefined') {
    name += '_';
  }
  return name;
}