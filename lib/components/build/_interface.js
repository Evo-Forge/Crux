/*
* This is the interface of every build process. Developers can extend the building process
* by extending the interface.
* */
var fs = require('fs'),
  nodeFs = require('node-fs'),
  util = require('util'),
  async = require('async'),
  watch = require('node-watch'),
  EventEmitter = require('events').EventEmitter,
  KUtil = require('../../util/util'),
  path = require('path');

var Interface = function KruxBuilInterface(extension) {
  this.extension = extension;
  if(!this.name) this.name = "KruxInterface";
  this.paths = [];
  this.config = {};     // The config of each build process will be set here by the parent component. Therefore, it will be accessible in init()
  this.__output__exists = {};
  EventEmitter.call(this.__proto__);
};
util.inherits(Interface, EventEmitter);

/*
* This function will be called after the instantiation of a build process. Useful to set various
* settings inside it.
* */
Interface.prototype.init = function InitializeBuildProcess() {  };

/*
* This function will be executed if the build component is configured to auto-build all the registered
* processes. Therefore, each process SHOULD (but not necessarily) implement this function.
* NOTE: the run() function must also emit a "run" event, with this.emit('run'), when implemented
* */
Interface.prototype.run = function RunBuild(done) {
  this.emit('run');
  return done()
};

/*
 * This function MUST be implemented by each build process that will extend it, as it will be called whenever
 * one of the watched files is changed.
 * Arguments
 *     - changedFile -> the file that has just changed RELATIVE to changedPath
 *     - changedContent -> the contents of the file that just changed.
 *     - changedPath -> the full path of the file that changed.
 * */
Interface.prototype.build = function ExecuteBuild(changedFile, changedContent, changedPath) {
  this.emit('build');
  throw new Error("Krux.build: Process " + this.name + " failed to implement build()");
};

/*
* This will start watching the configured paths for changed, and call the exec() function. It should NOT
* be extended, as it provides generic functionality for every process.
* */
Interface.prototype.watch = function WatchPaths(done) {
  var self = this,
    isComplete = false,
    _calls = [];
  _.forEach(this.paths, function(watchPath) {
    _calls.push(function(onWatchStart) {
      self.__watch(watchPath, self.extension, function onChange(changedPath, content) {
        var relPath = changedPath.replace(watchPath, '').substr(1);
        self.build(relPath, content, watchPath);
        self.emit('change', relPath);
      }, function onComplete(err) {
        onWatchStart(err);
      });
    });
    async.series(_calls, done);
  });
};

/*
* This is mostly an utility generic function that will star watching a directory for file changes.
* Our watch() file uses this.
* */
Interface.prototype.__watch = function WatchDirectory(watchPath, ext, onChange, onWatchStart) {
  var self = this;
  try {
    watch(watchPath, {
      recursive: true
    }, function(changedPath) {
      if(ext && changedPath.indexOf(ext) === -1) return;
      fs.readFile(changedPath, { encoding: 'utf8' }, function(err, content) {
        var relPath = changedPath.replace(watchPath, '');
        if(relPath.charAt(0) === "/" || relPath.charAt(0) === "\\") {
        relPath = relPath.substr(1);
        }
        if(err) {
          // If the file was deleted, we return content=null;
          if(err.code === 'ENOENT') {
            return onChange(relPath, null);
          }
          err.message = 'Krux.build.' + self.name + ': ';
          return self.emit('error', err);
        }
        onChange(relPath, content);
      });
    });
    onWatchStart && onWatchStart();
  } catch(err) {
    return onWatchStart && onWatchStart(err);
  }
};

/*
* This will try and read a given file path, calling back with its utf8 content.
* */
Interface.prototype.input = function ReadInputFile(path, callback, _shouldEmitError) {
  fs.readFile(path, { encoding: 'utf8' }, function(err, content) {
    if(err) {
      if(_shouldEmitError !== false) {
        err.message = 'Krux.build.' + this.name + ": Failed to read input file " + path + ': ' + err.message;
        this.emit('error', err);
      }
      return callback(null);
    }
    callback(content);
  }.bind(this));
};

/*
* This will write the given content to the output file set in the process's configuration.
* Arguments:
*     - content - the content we want to output to the file.
*     - onSuccess - if specified, the callback function that we will call after it was successfully outputted.
*
* */
Interface.prototype.output = function GenerateOutput(content, _outputPath, _onSuccess) {
  var _arg = arguments;
  var outputPath = path.normalize(process.cwd() + '/' + (typeof _outputPath === 'string' ? _outputPath : this.config.output)),
    onSuccess = (typeof _outputPath === 'function' ? _outputPath : _onSuccess);
  if(!outputPath) throw new Error('Krux.build.' + this.name + ': output path must be configured.');
  if(this.__output__exists[outputPath]) {
    fs.writeFile(outputPath, content, { encoding: 'utf8' }, function(err) {
      if(err) {
        err.message = 'Krux.build.' + this.name + ': Failed to write to output file: ' + err.message;
        this.__output__exists[outputPath] = false;
        return this.emit('error', err);
      }
      this.emit('build', outputPath);
      if(typeof onSuccess === 'function') onSuccess();
    }.bind(this));
    return;
  }
  var directories = (outputPath.indexOf('/') !== -1 ? outputPath.split('/') : outputPath.split('\\'));
  directories.pop();
  var directory = path.normalize(directories.join('/') + '/'),
    isOk = false;
  try {
    var stats = fs.lstatSync(directory);
    if(stats.isDirectory()) {
      isOk = true;
    }
  } catch(e) {
    if(e.code !== 'ENOENT') {
      err.message = 'Krux.build.' + this.name + ': Failed to check output file: ' + err.message;
      this.__output__exists[outputPath] = false;
      return this.emit('error', err);
    }
  }
  if(isOk) {
    this.__output__exists[outputPath] = true;
    return this.output.apply(this, _arg);
  }
  nodeFs.mkdir(directory, 0777, true, function(err) {
    if(err) {
      err.message = 'Krux.build.' + this.name + ': Failed to create output directory: ' + err.message;
      return this.emit('error', err);
    }
    this.__output__exists[outputPath] = true;
    return this.output.apply(this, _arg);
  }.bind(this));
};

/*
* This will check if the building process is supported and has all its dependencies installed.
* By default, we assume that the dependencies are up-to-date and there.
* RETURNS:
*   - falsy value when no dependencies are required, or all dependencies are installed.
*   - ARRAY of dependencies, when at least one dependency is missing. This will be used afterwards to install dependencies.
* NOTE:
*   a dependency has the following format:
*     "<node_module_name>:<node_module_version>"
*     where
*       node_module_name - the name of the npm module we want to install
*       node_module_version - the specific version we want to install. By default it will be set to "lastest"
* */
Interface.prototype.packages = function HasBuildingDependencies() {
  return null;
};

/*
* The function will set the given paths in the arguments as the default process's paths. Because this
* process only occurs once at load, we will use synchronous calls.
* Note that this will also check the existance of the path before setting it.
* NOTE: The path will always be relative to process.cwd()
* Arguments:
*   _paths - an array of path strings, or a single path as string.
* */
Interface.prototype.path = function SetProcessPath(_paths) {
  var paths = (_paths instanceof Array ? _paths : [_paths]);
  for(var i=0; i < paths.length; i++) {
    try {
      var _path = path.normalize(process.cwd() + "/" + paths[i]);
      if(!fs.existsSync(_path)) continue;
      this.paths.push(_path);
    } catch(e){}
  }
  return this;
};

/*
* Manually verify if the given path exists in the system. If it does exist,
* it will return the FULL path, relative to the process's directory. Otherwise,
* it will return null; This should be used in custom build processes that one
* may implement.
* */
Interface.prototype.__fullPath = function GetFullPath(_path) {
  if(typeof _path !== 'string' || _path === '') return null;
  try {
    _path = path.normalize(process.cwd() + '/' + _path);
    if(!fs.existsSync(_path)) return null;
    if(_path.charAt(_path.length-1) !== '/' && _path.charAt(_path.length-1) !== '\\') {
      _path = path.normalize(_path + '/');
    }
    return _path;
  } catch(e) {
    return null;
  }
};

/*
* Tries to read all the path's sub directories and returns them inside an array.
* Returns:
* array of {
*   path: the source path from config,
*   files: array of files in that dir.
* }
* */
Interface.prototype.allPaths = function GetAllPaths() {
  var dirs = [];
  for(var i=0; i < this.paths.length; i++) {
    try {
      var list = KUtil.readDirectory(this.paths[i], this.config.extension || undefined);
      dirs.push({
        path: this.paths[i],
        files: list
      });
    } catch(e) {
      e.message = 'Krux.build.' + this.name + ': Failed to read all source paths: ' + e.message;
      this.emit('error', e);
      return [];
    }
    return dirs;
  }
};

/*
* Each process that will place configuration in default, we will merge it with the received configurations.
* */
Interface.default = {};

module.exports = Interface;