var crypto = require('crypto'),
  _path = require('path'),
  nodeUtil = require('util'),
  bluebird = require('bluebird'),
  fs = require('fs');
/*
* Crux general utilities found under crux.util
* */

var util = {};

util.install = require('./installer');

/*
* Promise wrapper over bluebird
* */
util.promise = function CreatePromise(handler) {
  var _resolve,
    _reject;
  var pObj = new bluebird(function(resolve, reject) {
    _resolve = resolve;
    _reject = reject;
    try {
      handler(resolve, reject);
    } catch(e) {
      log.error('Crux.promise: Encountered an error.');
      log.debug(e);
      reject(e);
    }
  });
  pObj.resolve = _resolve;
  pObj.reject = _reject;
  pObj.success = pObj.done;
  return pObj;
};

/*
 * Capitalizes a string.
 * NOTE:
 * If replaceUnderlines is set to true, we will change every_name_that_looks with everyNameThatLooks
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

/*
* SHA1 hash function shortcut. on 128 bints
* */
util.sha1 = function HashSHA(text) {
  var hash = crypto.createHash('sha1').update(text).digest('hex');
  return hash;
};

/*
* SHA 256
* */
util.sha2 = function HashSHA256(text) {
  var hash = crypto.createHash('sha256').update(text).digest('hex');
  return hash;
};

/*
 * Returns the top-level of a given e-mail or domain address.
 * TODO: remove this
 */
util.getDomain = function GetDomain(dom) {
  if(typeof dom !== 'string' || dom === '') return null;
  var fullDomain = (dom.indexOf('@') === -1) ? dom : dom.split('@')[1];
  var split = fullDomain.split('.');
  if(split.length <= 2) return fullDomain;
  return (split[split.length - 2] + '.' + split[split.length - 1]).toLowerCase();
};

/*
 * Added JSON.minify() for json parsing with comment stripping.
 * */
util.minify = require('node-json-minify');

/*
* Adds the default node.extend() functionality.
* */
util.extend = require('node.extend');

/*
 * Recursively reads inside a given folder path and returns an array with files that have the specified extension.
 * Arguments:
 * <path> - the full path to the directory.
 * <extension> - the file extension we wish to read.
 * NOTE: if <extension> is set to "directory", we will only return last-level directories.
 * */
util.readDirectory = function ReadDirectory(path, extension, str, isSingleLevel) {
  var isInitialRead = false;
  if(typeof str != 'object' || !(str instanceof Array)) {
    str = [];
    isInitialRead = true;
  }
  if(typeof path !== 'string' || !path) {
    throw new Error('Crux.util.readDirectory: path is not a string');
  }
  var checkExtension = (typeof extension == 'undefined' ? false : (extension === 'directory' ? false : true)),
    checkDirectory = (extension === 'directory' ? true : false);
  if(checkExtension && extension.charAt(0) !== '.') {
    extension = '.' + extension;
  }
  var dirs = fs.readdirSync(path);
  var files = [];
  for(var i in dirs) {
    var item = dirs[i],
      subPath = _path.join(path, item);
    if(checkExtension && item.indexOf(extension) == -1) { // we have dir
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
        files.push(subPath);
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

/*
 * Does the same thing as ReadDirectory but returns an array of normalized paths.
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

/*
 * This will generate a random key based on the given length. If unspecified, defaults to 32.
 * */
util.uniqueId = function UniqueId(len, _onlyNumbers, _onlyChars, _specialChars) {
  var _p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890",
    r = "";
  if(_onlyNumbers === true) {
    _p = _p.substr(-10);
  }
  if(_onlyChars === true) {
    _p = _p.substr(0, _p.length - 10);
  }
  if(_specialChars) {
    _p += '@$^()_';
  }
  var strLen = _p.length,
    length = typeof len == "number" ? len : 16;
  if(length <=0) length = 32;
  /* Unique numbers will never have 0 at front. */
  for(var i=0; i< length; i++) {
    var cAt = _p.charAt(Math.floor(Math.random() * strLen));
    if(i === 0 && cAt == 0) {
      i--;
      continue;
    }
    r += cAt;
  }
  return r;
};

/*
* Given a full path, it will return the file name (the last string after the last /)
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

/*
* Gracefully uses the util.inspect() method on the given object.
* */
util.inspect = function InspectObject(obj) {
  console.log(nodeUtil.inspect(obj, false, 10, true));
};


module.exports = util;