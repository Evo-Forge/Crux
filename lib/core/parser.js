var fs = require('fs'),
  yaml = require('js-yaml'),
  crux = require('../../index.js'),
  minify = require('node-json-minify');


/**
* It will load up the given file name and, based on its extension, it will parse it accordingly.<br>
*
*  Current extensions supported:<br>
*   .js -> we will look in module.exports<br>
*   .json -> we will JSON.parse it<br>
*   .yml -> we will use yaml to parse it.<br>
*    <br/>
*   <B>IMPORTANT NOTE</B>: When the parser is initializes as a configuration parser, it will search for custom settings, such as: <br/>
 *   - <b>$ENV:[environmentVariableName]</b> - this will try and fetch the setting from the environment variable specified, if not found it will output a warning and set the value to null.<br />
*   @name crux.util.Parser
*   @class
* */

var parser = function ConfigurationParser(_path, _isConfig) {
  this.data = {};
  this.loaded = false;
  this.path = _path;
  this.isConfig = _isConfig || false; // when this flag is set to true, we will try and search for $ENV: variables.
};

/**
* This will try and read the file, returning the result. If we have a callback in the arguments,
* we will use asynchronous reading, otherwise we will use sync.
* @function
* @memberof crux.util.Parser
* @param {function} [fn] - the callback function to pass when loading asynchronously. If not specified, the file will be parsed synchronously.
* */
parser.prototype.read = function ReadConfig(_callback) {
  var isAsync = (typeof _callback === 'function' ? true : false),
    self = this;
  var doParse = function(content) {
    var ext = self.path.split('.');
    ext = ext[ext.length-1].toLowerCase();
    var data;
    switch(ext) {
      case 'yml':
        data = self.yml(content);
        break;
      case 'js':
        data = self.js();
        break;
      case 'json':
        data = self.json(content);
        break;
      default:
        return new Error('Unsupported extension: "' + ext + '"');
    }
    if(!self.isConfig) {
      return data;
    }
    // If we have a configuration parser, we first look for $ENV: variables.
    function checkEnv(tmp) {
      if(typeof tmp === 'string') {
        var up = tmp.toUpperCase();
        if(up.indexOf("$ENV:") !== -1) {
          var envVariable = tmp.substr(5).trim();
          if(typeof process.env[envVariable] === 'undefined') {
            console.error('Environment variable: %s is missing, in config file: %s', envVariable, self.path);
            return;
          }
          return process.env[envVariable];
        }
        if(up.indexOf('$ARGV:') !== -1) {
          var argName = tmp.substr(6).trim(),
            argVal = crux.argv(argName);
          if(!argVal) {
            console.error('Argv variable: %s is missing, in config file: %s', argName, self.path);
            return;
          }
          return argVal;
        }
        return;
      }
      if(typeof tmp === 'object' && tmp !== null) {
        if(tmp instanceof Array) {
          for(var i= 0, len = tmp.length; i < len; i++) {
            var replacedVar = checkEnv(tmp[i]);
            if(typeof replacedVar !== 'undefined') {
              tmp[i] = replacedVar;
            }
          }
          return;
        }
        for(var key in tmp) {
          var replacedVar = checkEnv(tmp[key]);
          if(typeof replacedVar !== 'undefined') {
            tmp[key] = replacedVar;
          }
        }
      }
    }
    checkEnv(data);
    return data;
  };
  if(!isAsync) {
    try {
      var content = fs.readFileSync(this.path, {'encoding': 'utf8'});
      return doParse(content);
    } catch(e) {
      return e;
    }
  }
  fs.readFile(this.path, {'encoding': 'utf8'}, function(err, content) {
    if(err) return _callback(err);
    var parsed = doParse(content);
    return callback(null, parsed);
  });
};

/**
* Parses the given content as yml-content.
* @method
* @memberof crux.util.Parser
* @param {string} content - the yml content to be parsed
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

/**
* Parses the given content as JSON
* @method
* @memberof crux.util.Parser
* @param {string} content - the json content to be parsed.
* */
parser.prototype.json = function ParseJson(content) {
  content = minify(content);
  try {
    var config = JSON.parse(content);
    return config;
  } catch(e) {
    e.message = 'JSON Parser: ' + e.message;
    return e;
  }
};

/**
* Parses the given content as a js file.<br>
*   <b>WARNING</b> the function will use eval() to evaluate the script's module.exports variable.<br>
*   If the object is not exported via module.exports, the parse will fail.
*   @method
*   @memberof crux.util.Parser
*   @param {string} content - the javaScript content of the file to be eval'd
* */
parser.prototype.js = function ParseJs() {
  try {
    var config = require(this.path);
    if(config === null) {
      return new Error('JS Module.exports parser: missing configuration exports in module');
    }
    return config;
  } catch(e) {
    e.message = 'JS Module.exports parser: ' + e.message;
    return e;
  }
};

module.exports = parser;