var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  Kutil = require('../../../../util/util');

var Interface = require('../../interface');

/**
* The angular's core process performs javaScript building by concatenating all source files into a single javaScript build file<br/>
 * By default, an angular project structure is as follows: <br/>
 * <b>config/[environments].js</b> - configuration directory holding settings for various environments<br/>
 * <b>controllers/</b> - angular controllers directory<br/>
 * <b>directives/</b> - angular directives directory<br />
 * <b>services/</b> - angular service and provider directory<br/>
 * <b>views/</b> (optional) - angular view directory, holding html view files (see {@link crux.Build.Angular.Views}<br>
 * <b>index.html</b> (optional) - angular SPA index file, holding the root html (see @link crux.Build.Angular.Index}<br/><br/>
 * Note that the above structure contains the default full directory structure of an app, but in many cases, this structure may change to suite your needs.<br/>
 * @memberof crux.Build.Angular
 * @class Core
 * @param {Object} config - the default configuration of the process
 * @param {String} [config.extension=.js] - default javaScript file extension
 * @param {String} [config.path=front/app] - angular root folder path
 * @param {String} [config.entry=app.js] - main angular application file
 * @param {String} [config.include=[]] - an array of paths relative to the root directory to include when building the file. These files will be treated as a subdirectory of the angular directory project.
 * @param {String} [config.output=public/js/build/$module.angular.js] - output path for the built javaScript file. Note that <b>$module</b> may be used in the path, and is angular's module name of the process
 * @param {String} [config.module=app] - angular module name.
 * @param {String} [config.config=config/$environment.js] - configuration files to be loaded while building. Note that the <b>$environment<b/> is available in this path, representing crux's environment name
 * @param {String[]} [config.priority] - array of javaScript files that we will be used to prioritize file loading when building starts. Note that we will match each path with the files path (see example) when creating the priority list
 * @param {Boolean} [config.minify=false] - minify the javaScript output. By default, we will only replace excessive whitespaces and comments, and not full js minification (yet)
 * @param {Function} [config.compile] - callback function to be called when reading the content of each js file.
 * @property {Object} CACHE - cache object containing the cached js file contents
* */

var core = function CruxBuildAngularCore(config, name) {
  Interface.call(this, config.extension || 'js');
  this.config = config; // This configuration is the config situated under angular.templates config in the parent process
  this.name = name + ':core';
  this.config.output = this.config.output.replace('$module', this.config.module).replace('$environment', global['NODE_ENV']);
  this.config.path = this.__fullPath(this.config.path);
  this.CACHE = {};
  this.FILE_CACHE = [];
  if(this.config.config.indexOf('$environment') !== -1) {
    this.config.config = this.config.config.replace('$environment', global['NODE_ENV']);
  }
};
util.inherits(core, Interface);

core.default = {
  extension: '.js',
  path: 'front/app',
  entry: 'app.js',
  config: 'config/$environment.js',  // This is the configuration file that we include before the app.js file. We can also use $environment in this
  minify: false,  // Should we try to minify the code or not.
  compile: null,  // As like angular-templates, this can be a function that will be called when we parse a js file.
  priority: [],   // This is an array of js files (relative to path!) that we will match and load first, before we load the entire directory structure
  output: 'public/js/build/$module.angular.js',
  include: [],    // An array of paths relative to the root directory to include when compiling.
  module: 'app'
};

/**
* Caches the javascript file to the memory, before compiling. This is called when initialli running the process and when a file changes, to speed-up the compilation process
 *
 * @memberof crux.Build.Angular.Core
 * @function cache
 * @param {String} path - file path that we want to cache
 * @param {String} content - js content of the path
* */
core.prototype.cache = function CacheFile(path, content) {
  if(content === null) {
    if(typeof this.CACHE[path] !== 'undefined') {
      this.CACHE[path] = undefined;
    }
    return;
  }
  if(this.config.minify) {
    content = this.minify(content);
  }
  path = path.replace(/\\/g, '/');
  delete this.CACHE[path];
  if(path.charAt(0) !== '/') path = '/' + path;
  this.CACHE[path] = content;
  return this;
};

/**
* Performs minification on the given js content. Note that minification implies only removing multiple whitespaces and comments.
 * @memberof crux.Build.Angular.Core
 * @function minify
 * @param {String} content - js content to minify
* */
core.prototype.minify = function MinifyJs(content) {
  // TODO
  content = content.replace(/\n{2,}/g, '\n');
  // Remove comments
  content = content.replace(/(?:\/\*(?:[\s\S]*?)\*\/)|(?:([\s;])+\/\/(?:.*)$)/gm, ' ');
  return content;
};

/**
* Compiles the javascript cache/output and saves it to the build file.<br/>
 * The compilation process has the following file inclusion program:<br/>
 * 1. Read the full application structure<br/>
 * 2. Include prioritized files (if configured, files that match the priority's items)<br/>
 * 3. Include environment-specific config file (if configured)<br/>
 * 4. Include the enry application file (app.js)<br/>
 * 5. Include remaining files, alphabetically ordered.<br/><br/>
 * <b>Note</b>: each js file content will be wrapped inside a closure to disable unwanted globalization of variables. (see example)<br/>
 * <b>Note 2</b>: each js file closure has the following arguments: (<b>window</b>, <b>window.angular || {}</b>, <b>window.jQuery || $</b>, <b>undefined</b>)
 *
 * @memberof crux.Build.Angular.Core
 * @function compile
 * @param {Function} [done] - callback function to be called once compiled
* */
core.prototype.compile = function CompileAngular(_done) {
  var sorted = [],
    done = (typeof _done !== 'function' ? function(){} : _done);
  var temp = this.FILE_CACHE.concat([]);
  for(var i=0; i < temp.length; i++) {
    temp[i] = temp[i].replace(/\\/g, "/");
  }
  // We first go through the priority list to add stuff.
  for(var i=0; i < this.config.priority.length; i++) {
    var prio = this.config.priority[i];
    prio = prio.replace(/\\/g, "/");
    // We first check if it is from included paths or config path
    var isIncluded = false;
    for(var j=0; j < this.config.include.length; j++) {
      if(prio.indexOf(this.config.include[j]) === 0) {
        prio = path.normalize(__rootdir + '/' + prio);
        isIncluded = true;
      }
    }
    if(!isIncluded) {
      prio = path.normalize(this.config.path + '/' + prio);
    }
    prio = prio.replace(/\\/g,"/");
    // We have to create the file path of each item in the priority
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
    var content = (typeof this.CACHE[jsPath] === 'string' ? this.CACHE[jsPath] : this.__readFile(jsPath));
    if(content instanceof Error) return done(content);
    JS_CONTENT += "(function() {\n";
    if(typeof this.config.compile === 'function') {
      var _compiled = this.config.compile(jsPath, content);
      if(typeof _compiled !== 'string' || _compiled === '') {
        var err = new Error('Crux.build.angular:core config.compile() does not return a string.');
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
  JS_CONTENT += "})(window, window['angular'] || {}, window['jQuery'] || window['$'] || {}, undefined);";
  // We now output the final content.
  this.output(JS_CONTENT, done);
};

/**
* Starts watching for changes in the js files of the angular directory
 *
 * @memberof crux.Build.Angular.Core
 * @function watch
 * @param {Function} done - callback function to be called on file change.
* */
core.prototype.watch = function WatchAngularCore(done) {
  if(!fs.existsSync(this.config.path)) return done();
  var self = this;
  function onChange(jsPath, content) {
    // We check if the file is newly added, so that we can re-create the file path array
    if(typeof self.CACHE[jsPath] === 'undefined' || content === null) {
      self.__readFiles();
    }
    self.cache(jsPath, content);
    self.compile();
  }
  this.__watch(this.config.path, this.config.extension, onChange, done);
  // we have to do the same for the included files.
  if(this.config.include.length > 0) {
    _.forEach(this.config.include, function(includePath) {
      var watchPath = path.normalize(__rootdir + '/' + includePath);
      self.__watch(watchPath, self.config.extension, onChange, done);
    });
  }
};

/**
* Reads all the project's files and places them in the private FILE_CACHE. This should be viewed as a private method and should not be tempered with.
 *
 * @memberof crux.Build.Angular.Core
 * @function __readFiles
 * @private
* */
core.prototype.__readFiles = function ReadFiles() {
  try {
    var files = Kutil.readDirectoryRelative(this.config.path, this.config.extension),
      includes = this.config.include;
    this.FILE_CACHE = [];
    // We now exclude all other config/ stuff in the files. and add the relative path to the project app
    for(var i=0; i < files.length; i++) {
      var jsPath = path.normalize(this.config.path + '/' + files[i]);
      files[i] = jsPath;
      if(files[i].indexOf('config/') !== -1 && this.config.config !== files[i]) {
        continue;
      }
      this.FILE_CACHE.push(files[i]);
    }
    if(includes.length > 0) {
      for(var j=0; j < includes.length; j++) {
        var iPath = includes[j];
        if(iPath.charAt(iPath.length-1) === '/') {
          iPath = iPath.substr(0, iPath.length-1);
        }
        if(typeof iPath !== 'string' || iPath === '') continue;
        try {
          var iFiles = Kutil.readDirectoryRelative(iPath, this.config.extension);
          for(var k=0; k < iFiles.length; k++) {
            var iFinalPath = path.normalize(__rootdir + '/' + iPath + iFiles[k]);
            this.FILE_CACHE.push(iFinalPath);
          }
        } catch(e) {
          continue;
        }
      }
    }
    return this.FILE_CACHE;
  } catch(e) {
    return e;
  }
};

/**
* Opens the given file and tries to read its content. If failed, returns the error. <br/>
 * Note that we will synchronously open the file. This should also be considered a private function and should not be tampered with
 *
 * @memberof crux.Build.Angular.Core
 * @function __readFile
 * @param {String} path - the file path
 * @private
* */
core.prototype.__readFile = function ReadJsFile(jsPath) {
  try {
    return fs.readFileSync(jsPath, { encoding: 'utf8' });
  } catch(e) {
    return e;
  }
};

/**
* Builds up the file cache and runs the angular core concatenation and compilation process
 * @memberof crux.Build.Angular.Core
 * @function run
 * @param {Function} done - on complete callback.
* */
core.prototype.run = function RunAngularCore(done) {
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