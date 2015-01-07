var fs = require('fs'),
  yaml = require('js-yaml'),
  KUtil = require('../util/util.js');

/*
* This is a configuration parser class. It will load up the given file name and, based on
*  its extension, it will parse it accordingly.
*
*  Current extensions supported:
*   .js -> we will look in module.exports
*   .json -> we will JSON.parse it
*   .yml -> we will use yaml to parse it.
* */

var parser = function ConfigurationParser(_path) {
  this.data = {};
  this.loaded = false;
  this.path = _path;
};

/*
* This will try and read the file, returning the result. If we have a callback in the arguments,
* we will use asynchronous reading, otherwise we will use sync.
* */
parser.prototype.read = function ReadConfig(_callback) {
  var isAsync = (typeof _callback === 'function' ? true : false),
    self = this;
  var doParse = function(content) {
    var ext = self.path.split('.');
    ext = ext[ext.length-1].toLowerCase();

    switch(ext) {
      case 'yml':
        return self.yml(content);
      case 'js':
        return self.js(content);
      case 'json':
        return self.json(content);
      default:
        return new Error('Unsupported extension: "' + ext + '"');
    }
  };
  if(!isAsync) {
    try {
      var content = fs.readFileSync(this.path, {'encoding': 'utf8'});
      return doParse(content);
    } catch(e) {
      return e;
    };
  }
  fs.readFile(this.path, {'encoding': 'utf8'}, function(err, content) {
    if(err) return _callback(err);
    var parsed = doParse(content);
    return callback(null, parsed);
  });
};

/*
* Parses the given content as yml-content.
* */
parser.prototype.yml = function ParseYml(content) {
  try {
    var config = yaml.safeLoad(content);
    return config;
  } catch(e) {
    var err = new Error(e.message);
    return err;
  }
};

/*
* Parses the given content as JSON
* */
parser.prototype.json = function ParseJson(content) {
  content = KUtil.minify(content);
  try {
    var config = JSON.parse(content);
    return config;
  } catch(e) {
    e.message = 'JSON Parser: ' + e.message;
    return e;
  }
};

/*
* Parses the given content as a js file with eval().
* */
parser.prototype.js = function ParseJs(content) {
  var config;
  (function() {
    var module = {
      exports: null
    };
    try {
      eval(content);
      if(module.exports === null) {
        config = new Error('JS Module.exports parser: missing configuration exports in module');
      } else {
        config = module.exports;
      }
    } catch(e) {
      e.message = 'JS Module.exports parser: ' + e.message;
      config = e;
    }
  })();
  return config;
};

module.exports = parser;