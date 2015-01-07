var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  Kutil = require('../../../../util/util');

var Interface = require('../../_interface');

var core = function KruxBuildAngularCore(config) {
  Interface.call(this, config.extension || 'js');
  this.config = config; // This configuration is the config situated under angular.templates config in the parent process
  this.name = 'angular:core';
  this.config.output = this.config.output.replace('$module', this.config.module);
  this.config.path = this.__fullPath(this.config.path);
  this.CACHE = {};
  this.FILE_CACHE = [];
};
util.inherits(core, Interface);

core.default = {
  extension: '.js',
  path: 'front/app',
  entry: 'app.js',
  config: 'config.js',  // This is the configuration file that we include before the app.js file.
  minify: false,  // Should we try to minify the code or not.
  compile: null,  // As like angular-templates, this can be a function that will be called when we parse a js file.
  priority: [],   // This is an array of js files (relative to path!) that we will match and load first, before we load the entire directory structure
  output: 'app/public/build/$module.angular.js',
  module: 'app'
};

/*
* Caches the javascript file to the memory, before compiling.
* */
core.prototype.cache = function CacheFile(path, content) {
  if(content === null) {
    if(typeof this.CACHE[path] !== 'undefined') {
      delete this.CACHE[path];
    }
    return;
  }
  if(this.config.minify) {
    content = this.minify(content);
  }
  this.CACHE[path] = content;
  return this;
};

/*
* Minifies the given js code.
* */
core.prototype.minify = function MinifyJs(content) {
  // TODO
  content = content.replace(/\n{2,}/g, '\n');
  // Remove comments
  content = content.replace(/(?:\/\*(?:[\s\S]*?)\*\/)|(?:([\s;])+\/\/(?:.*)$)/gm, ' ');
  return content;
};

/*
* Compiles the javascript cache/output and saves it to the build file.
* */
core.prototype.compile = function CompileAngular(_done) {
  var sorted = [],
    done = (typeof _done !== 'function' ? function(){} : _done);
  var temp = this.FILE_CACHE.concat([]);
  // First thing we do is we add the config file in the sorted list, if present.
  for(var i=0; i < temp.length; i++) {
    if(temp[i] === this.config.config) {
      sorted.push(temp[i]);
      temp.splice(i, 1);
      break;
    }
  }
  /* Second thing we do is we add the entry point in the sorted list. */
  for(var i=0; i < temp.length; i++) {
    if(temp[i] === this.config.entry) {
      sorted.push(temp[i]);
      temp.splice(i, 1);
      break;
    }
  }
  // We first go through the priority list to add stuff.
  for(var i=0; i < this.config.priority.length; i++) {
    var prio = this.config.priority[i];
    if(prio.charAt(0) === '/' || prio.charAt(0) === '\\') prio = prio.substr(1);
    var q = 0;
    while(q < temp.length) {
      var fpath = temp[q];
      // If we have a priority match, we add it to sorted and pop it from temp.
      if(fpath.indexOf(prio) === 0) {
        sorted.push(fpath);
        temp.splice(q, 1);
      } else {
        q++;
      }
    }
  }
  // After that, we push the remaining files in
  for(var i=0; i < temp.length; i++) {
    sorted.push(temp[i]);
  }
  temp = null;
  var JS_CONTENT = "";
  // We now start creating the output;
  JS_CONTENT += "(function(window, angular, $) {\n";
  for(var i=0; i < sorted.length; i++) {
    var jsPath = sorted[i];
    var content = (typeof this.CACHE[jsPath] !== 'undefined' ? this.CACHE[jsPath] : this.__readFile(jsPath));
    if(content instanceof Error) return done(content);
    JS_CONTENT += "(function() {\n";
    if(typeof this.config.compile === 'function') {
      var _compiled = this.config.compile(jsPath, content);
      if(typeof _compiled !== 'string' || _compiled === '') {
        var err = new Error('Krux.build.angular:core config.compile() does not return a string.');
        this.emit('error', err);
        return done(err);
      }
      JS_CONTENT += _compiled;
    } else {
      if(!this.config.minify) {
        JS_CONTENT += '// File: ' + jsPath + '\n';
      }
      JS_CONTENT += content + "\n";
    }
    JS_CONTENT += "})();\n";
  }
  JS_CONTENT += "})(window, window['angular'] || {}, window['jQuery'] || window['$'] || {});";

  // We now output the final content.
  this.output(JS_CONTENT, done);
};

/*
* We start watching all the js files in the angular directory.
* */
core.prototype.watch = function WatchAngularCore(done) {
  if(!fs.existsSync(this.config.path)) return done();
  var self = this;
  this.__watch(this.config.path, this.config.extension, function onChange(jsPath, content) {
    // We check if the file is newly added, so that we can re-create the file path array
    if(typeof self.CACHE[jsPath] === 'undefined' || content === null) {
      self.__readFiles();
    }
    self.cache(jsPath, content);
    self.compile();
  }, done);
};

/*
* Reads all the project's files.
* */
core.prototype.__readFiles = function ReadFiles() {
  try {
    var files = Kutil.readDirectoryRelative(this.config.path, this.config.extension);
    this.FILE_CACHE = files;
    return files;
  } catch(e) {
    return e;
  }
};

/*
* Opens the given file and tries to read its content. If failed, returns the error.
* */
core.prototype.__readFile = function ReadJsFile(jsPath) {
  try {
    jsPath = path.normalize(this.config.path + '/' + jsPath);
    return fs.readFileSync(jsPath, { encoding: 'utf8' });
  } catch(e) {
    return e;
  }
};

/*
* Runs the angular core concatenation and compilation.
* */
core.prototype.run = function RunAngulareCore(done) {
  if(typeof done !== 'function') done = function(){};
  if(!this.config.path) return done();
  var files = this.__readFiles();
  if(files instanceof Error) return done(files);
  /*
  * We now read them up.
  * */
  try {
    for(var i=0; i < files.length; i++) {
      var jsPath = files[i],
        jsContent = this.__readFile(jsPath);
      if(jsContent instanceof Error) return done(jsContent);
      this.cache(jsPath, jsContent);
    }
  } catch(e) {
    return done(e);
  }
  this.compile(done);
};


module.exports = core;