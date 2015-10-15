var crypto = require('crypto'),
  _path = require('path'),
  nodeUtil = require('util'),
  _ = require('underscore'),
  async = require('async'),
  bluebird = require('bluebird'),
  Parser = require('../core/parser.js'),
  Cache = require('./cache.js'),
  crux = require('../../index'),
  fs = require('fs');


/*
 * We attach the seriesPromise to the async functionality, that works exactly like series(),
 * but with promises.
 * So, the only argument that this has is the "calls" ARRAY of FUNCTIONS that return promises, or
 * ARRAY of PROMISES.
 * */
crux.series = function AsyncSeriesPromise(calls, ignoreErrors) {
  return crux.promise(function(resolve, reject) {
    var stack = [],
      results = [],
      cnt = 0,
      isStopped = false,
      stopErr = false;
    // The function can be called inside a promise call, that will stop the series chain.
    function stopSeries(err) {
      if(err instanceof Error || (typeof err === 'object' && (err.code || err.error))) {
        stopErr = err;
      }
      isStopped = true;
    }
    if(!(calls instanceof Array)) return resolve();
    calls.forEach(function(item) {
      cnt++;
      stack.push(function(done) {
        if(isStopped) {
          return done(new Error("STOP"));
        }
        var pObj;
        // If the item is a function, we call it and expect a promise.
        if(typeof item === 'function') {
          try {
            item = item(stopSeries, results[results.length-1] || null); // we call with the last result.
          } catch(e) {
            log.warn('Caught an error in crux.series call %s', cnt);
            done(e);
            return;
          }
        }
        if(typeof item === 'object' && item && typeof item.then === 'function') {
          pObj = item;
        }
        if(!pObj) {
          return done();
        }
        pObj.then(function(result) {
          results.push(typeof result === 'undefined' ? null : result);
          done();
        }).error(function(err) {
          if(ignoreErrors === true) {
            return done();
          }
          done(err);
        });
      });
    });
    async.series(stack, function(err) {
      calls = null;
      stack = null;
      if(err) {
        if(err.message === 'STOP') {
          if(stopErr) {
            reject(stopErr);
            results = null;
            return;
          }
          resolve(results);
          results = null;
          return;
        }
        reject(err);
        results = null;
        return;
      } else if(stopErr) {
        // we had an error in the last item of the chain
        reject(stopErr);
      } else {
        resolve(results);
      }
      results = null;
    });
  });
};


/*
* Crux general utilities found under crux.util
* */

var util = {};
util.Cache = Cache;
util.install = require('./installer');

util.Parser = Parser;

/*
* Promise wrapper over bluebird
* */
util.promise = function CreatePromise(handler) {
  var _resolve,
    _reject;
  var pObj = new bluebird(function(resolve, reject) {
    _resolve = resolve;
    _reject = reject;
    process.nextTick(function() {
      try {
        handler.call(pObj, resolve, reject);
      } catch(e) {
        log.warn('Thrown error in crux promise captured.');
        log.debug(e);
        reject(e);
      }
    });
  });
  pObj.resolve = _resolve;
  pObj.reject = _reject;
  return pObj;
};


bluebird.prototype.error = function OnError(){
  this.catch.apply(this, arguments);
  return this;
};

/**
 * Contains utility functionality that can be accessed anywhere via crux.util
 * @namespace crux.util
 * */

/**
 * Capitalizes the given string. If called with replaceUnderlines, the given string will have all its underlines removed
 * and converted to a camel-case format
 * @function capitalize
 * @memberof crux.util
 * @param {string} str - the string to which to apply the capitalization.
 * @param {boolean} [replaceUnderline] - should we remove underlines and camelCase the string
 * @returns {string}
 * @example
 *    var string = crux.util.capitalize("my_object", true); // => myObject
 * */
util.capitalize = function Capitalize(str, replaceUnderlines) {
  if(!_.isString(str) || str.length <= 1) return str;
  if(typeof replaceUnderlines === 'undefined') {
    return str.charAt(0).toUpperCase() + str.substr(1);
  }
  var spl = str.split('_'),
    base = spl[0];
  if(spl.length === 1) return base;
  for(var i=1; i < spl.length; i++) {
    if(spl[i].trim() === '') continue;
    base += util.capitalize(spl[i]);
  }
  return base;
};

/**
* Utility function that hashes the given text using SHA1 (128 bits)
* @function sha1
* @memberof crux.util
* @param {string} - the string to be hashed
* @returns {string}
* */
util.sha1 = function HashSHA(text) {
  var hash = crypto.createHash('sha1').update(text).digest('hex');
  return hash;
};

/**
 * Utility function that hashes the given text using SHA2 (256 bits)
 * @function sha2
 * @memberof crux.util
 * @param {string} - the string to be hashed
 * @param {number=1} - the number of times we want to perform the sha2
 * @returns {string}
 * */
util.sha2 = function HashSHA256(text, _count) {
  var hash = crypto.createHash('sha256').update(text).digest('hex');
  if(typeof _count === 'number' && _count > 1) {
    for(var i=0; i < _count; i++) {
      hash = crypto.createHash('sha256').update(hash).digest('hex');
    }
  }
  return hash;
};

/**
* Synchronously encrypts the given data with the given key, by default WITH NO INITIALIZATION VECTOR.
 * If the IV is specified and present, it will be used.
 * Returns base64-encrypted text or false, if failed.
* */
util.encrypt = function EncryptSync(data, encryptionKey, _iv) {
  try {
    var cipher;
    if(typeof _iv !== 'undefined') {
      cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, _iv);
    } else {
      cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
    }
    if(!(data instanceof Buffer) && typeof data !== 'string') {
      if(typeof data === 'object' && data != null) {
        data = JSON.stringify(data);
      } else {
        data = data.toString();
      }
    }
    var encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  } catch(err) {
    console.warn('crux.util.encrypt: Failed to synchronously encrypt data', err);
    return false;
  }
};

/**
* Synchronously tries to decrypt the given data with the given encryption key. By default,
 * it will not make use of any IV, but if specified, it will be used.
 * Returns the decrypted string, or false, if failed to decrypt.
* */
util.decrypt = function DecryptSync(data, encryptionKey, _iv) {
  if(typeof data !== 'string' || !data || typeof encryptionKey !== 'string' || !encryptionKey) {
    return false;
  }
  try {
    var decipher;
    if(typeof _iv !== 'undefined') {
      decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, _iv);
    } else {
      decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
    }
    //var cryptedData = new Buffer(data, 'base64').toString('binary');
    var decoded = decipher.update(data, 'base64', 'utf8');
    decoded += decipher.final('utf8');
    return decoded;
  } catch(e) {
    return false;
  }
};

/**
 * Wrapper over node-json-minify that strips the given JSON-string of its comments and minifies it. This is useful when parsing a json file that may contain
 * comments and returning its parsed data (object,array,string,etc). Since JSON standard does not allow comments in its parsing, this is a nice-to-have utility.
 * @function minify
 * @memberof crux.util
 * @param {string} - the JSON string that may or may not contain comments and whitespace.
 * @returns {any}
 * */
util.minify = require('node-json-minify');

/**
* Performs deep object merging by using node.extend module. It is possible to avoid pass-by-reference cloning by specifying
 * the first argument as true, to enable deep merge.
 * @function extend
 * @memberof crux.util
 * @param {boolean} [deepMerge] - if specified, the given objects will be deeply merged and avoid pass-by-reference cloning.
 * @param {object} targetObject - the target object used to copy the properties to
 * @param {object} sourceObject - the source object used to copy the properties from
* */
util.extend = require('node.extend');

/**
 * Recursively reads the contents of a given folder path and returns an array with file paths.
 * @function readDirectory
 * @memberof crux.util
 * @param {string} path - the full directory path
 * @param {string} [extension] - if specified, the function will only return files matching the given extension.
 *      If set to "directory", the function will return only the directory structure.
 * @param {array} [str] - if present, the files will be appended to this array.
 * @param {boolean} [isSingleLevel] - should it read only files from the root directory. Defaults to false
 * @returns {array}
 * */
util.readDirectory = function ReadDirectory(path, extension, str, isSingleLevel) {
  var isInitialRead = false;
  if(!(str instanceof Array)) {
    str = [];
    isInitialRead = true;
  }
  if(typeof path !== 'string' || !path) {
    throw new Error('Crux.util.readDirectory: path is not a string');
  }
  var checkExtension = (typeof extension == 'undefined' ? false : (extension === 'directory' ? false : true)),
    checkDirectory = extension === 'directory';
  if(checkExtension && extension.charAt(0) !== '.') {
    extension = '.' + extension;
  }
  var dirs = fs.readdirSync(path);
  var files = [];
  for(var i in dirs) {
    var item = dirs[i],
      subPath = _path.join(path, item);
    if(checkExtension && item.substr((0-extension.length)) !== extension) { // we have dir
      if(isSingleLevel === true) {
        continue;
      }
      try {
        str = util.readDirectory(subPath, extension, str);
      } catch(e) {} // not a dir.
    } else {
      if(checkDirectory) {
        // If we're checking directories, we need to see if the file is a directory. If it is, we go inner. If not, we return;
        try {
          fs.readdirSync(subPath);
        } catch(e) {
          continue;
        }
        files.push(subPath);
        if(isSingleLevel) continue;
        var subDirs = util.readDirectory(subPath, 'directory', []);
        if(subDirs.length !== 0) {
          files = files.concat(subDirs);
        }
      } else {
        try {
          str = util.readDirectory(subPath, extension, str);
        } catch(e) {// not a dir.
          files.push(subPath);
        }
      }
    }
  }
  for(var f = 0; f< files.length; f++) {
    str.push(files[f]);
  }
  if(checkDirectory && !isSingleLevel && isInitialRead) {
    str.sort(function(a, b) {
      return a.length < b.length;
    });
    // TODO: remove parent folders that contain children.
  }
  return str;
};

/**
 * Utility function that has the same functionality as readDirectory, but the files in the resulting array will have
 * their path relative to the directory's path.
 * @function readDirectoryRelative
 * @memberof crux.util
 * @param {string} path - the full directory path
 * @param {string} [extension] - if specified, the function will only return files matching the given extension.
 *      If set to "directory", the function will return only the directory structure.
 * @param {array} [str] - if present, the files will be appended to this array.
 * @param {boolean} [isSingleLevel] - should it read only files from the root directory. Defaults to false

 * @returns {array}
 * */
util.readDirectoryRelative = function ReadDirectoryRelative(path) {
  var list = util.readDirectory.apply(this, arguments);
  for(var i=0; i < list.length; i++) {
    var cPath = _path.normalize(list[i]).replace(/\\/g, "/"),
      rootPath = _path.normalize(path).replace(/\\/g, "/");
    var includePath = cPath.replace(rootPath, "");
    list[i] = includePath;
  }
  return list;
};

var ALPHA_NUMERIC_CHARS = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890",
  ALPHA_NUMERIC_SPECIAL = ALPHA_NUMERIC_CHARS + '@#$^&()[]+-.';

/**
 * Utility function that will generate a random key of the given length.
 * @function uniqueId
 * @memberof crux.util
 * @param {number} len - the length of the string to generate
 * @param {boolean} [onlyNumbers] - if specified, the resulting will contain only numbers and the resulting string will never start with a 0
 * @param {boolean} [onlyChars] - if specified, the resulting string will contain only alpha characters.
 * @param {boolean} [specialChars] - if specified, the resulting string may contain the following special characters: @$^()_=`!?#^&*()
 * @returns {string}
 * */
util.uniqueId = function UniqueId(len, _onlyNumbers, _onlyChars, _specialChars) {
  var _p = ALPHA_NUMERIC_CHARS,
    r = "";
  if(_onlyNumbers === true) {
    _p = _p.substr(-10);
  }
  if(_onlyChars === true) {
    _p = _p.substr(0, _p.length - 10);
  }
  if(_specialChars) {
    _p += '@$^()_=`!?#^&*()';
  }
  var strLen = _p.length,
    length = typeof len == "number" ? len : 16;
  if(length <=0) length = 32;
  /* Unique numbers will never have 0 at front. */
  for(var i=0; i< length; i++) {
    var cAt = _p.charAt(Math.floor(Math.random() * strLen)).toString();
    if(i === 0 && cAt == '0') {
      i--;
      continue;
    }
    r += cAt;
  }
  return r;
};
/* On every startup, we generate the 255 unique alpha char string, used for randomString. */
var RANDOM_STRING = '',
  RANDOM_STRING_ALPHA = '';
for(var i=0; i <= 255; i++) {
  var q = Math.floor(Math.random() * ALPHA_NUMERIC_SPECIAL.length);
  RANDOM_STRING += ALPHA_NUMERIC_SPECIAL.charAt(q);
  var r = Math.floor(Math.random() * ALPHA_NUMERIC_CHARS.length);
  RANDOM_STRING_ALPHA += ALPHA_NUMERIC_CHARS.charAt(r);
}

/**
* This is an alternative to the uniqueId() method that uses crypto's randomBytes generator
 * We generate x random bytes, then we select based on the byte's number, a char from the ALPHA_NUMERIC strings
 * @function randomString
 * @memberof crux.util
 * @param {number} length - the length of the string to be generated.
 * @param {Function} callback - the callback to call when it's ready.
* */
util.randomString = function GenerateRandomString(length, done, _onlyAlpha) {
  if(typeof length !== 'number') {
    return done(new Error('Length is not valid.'));
  }
  var gen = Math.abs(parseInt(length)),
    onlyAlpha = (done === false ? false : _onlyAlpha !== false);
  function onGenerated(buffer) {
    var res = '';
    for(var i=0; i < gen; i++) {
      var _poz = buffer.readUInt8(i);
      if(onlyAlpha) {
        res += RANDOM_STRING_ALPHA.charAt(_poz);
      } else {
        res += RANDOM_STRING.charAt(_poz);
      }
    }
    return res;
  }
  if(typeof done === 'function') {
    crypto.randomBytes(gen, function(err, buffer) {
      if(err) return done(err, null);
      var str = onGenerated(buffer);
      done(null, str);
    });
  } else {
    try {
      var buff = crypto.randomBytes(gen);
    } catch(e) {
      return e;
    }
    return onGenerated(buff);
  }
};

/**
* Given a full path, it will return the file name, considered to be the last string after the last slash
 * @function getFileName
 * @memberof crux.util
 * @param {string} path - the full path of the file to use.
 * @param true {boolean} [withExtension] - if set to false, the file name will be stripped of its extension.
* */
util.getFileName = function GetFileName(_full, withExtension) {
  if(typeof _full !== 'string') throw new Error("Crux.util.getFileName: path not a string");
  var full = _path.normalize(_full),
    split = (full.indexOf('/') === -1 ? full.split('\\') : full.split('/'));
  var fname = split[split.length-1];
  if(withExtension === false && fname.lastIndexOf('.') !== -1) {
    fname = fname.substr(0, fname.lastIndexOf('.'));
  }
  return fname;
};

/**
* Gracefully uses the util.inspect() method on the given object to pretty output the given data
 * @function inspect
 * @memberof crux.util
 * @param {any} obj - the object to inspect.
* */
util.inspect = function InspectObject(obj) {
  console.log(nodeUtil.inspect(obj, false, 10, true));
};

/**
* Returns the UTC Timestamp of the current date.
 * @function utcTime
 * @memberof crux.util
 * @param {date} [d] - if specified, the function will use the given date to extract the UTC time.
 * @returns {timestamp}
* */
util.utcTime = function GetUTCTime(_d) {
  var now = _d || new Date();
  var now_utc = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
  return now_utc;
};


module.exports = util;