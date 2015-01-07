/*
* This will compile client-side swig templates into JavaScript templates.
* Each template will be set in a pre-defined object (on the client-side script).
* */
var util = require('util'),
  async = require('async'),
  Kutil = require('../../../util/util');

var Interface = require('../_interface');

var process = function KruxBuildSwig() {
  Interface.apply(this, arguments);
  this.name = 'swig';
  this.CACHE = {};
  this.__loaded = false;  // were all the views previously loaded?
};
util.inherits(process, Interface);

process.default = {
  extension: '.swig',
  path: 'front/views',
  removeExtension: true,  // By default, the output hash will not contain the .swig extension.
  output: 'app/public/build/swig.templates.js'
};

/*
* The swig build system allows the developer to wrap the generated js object of {fileName:fileContent} to process it.
* By default, it will simply wrap them into a window['VIEWS'] hash.
* */
process.prototype.wrap = function WrapResult(content) {
  var wrapper = 'window["VIEWS"] = ' + content + ";";
  return wrapper;
};

process.prototype.build = function BuildSwig(swigPath, swigContent) {
  // If it's not fully loaded with all teh templates, we just execute a run first.
  if(!this.__loaded) {
    return this.run();
  }
  this.cache(swigPath, swigContent);
  this.save();
};

/*
* Saves the swig cache output to the file.
* */
process.prototype.save = function SaveCache(cb) {
  var outputContent = this.wrap(JSON.stringify(this.CACHE));
  if(typeof outputContent !== 'string') {
    var err = new Error('Krux.build.swig: wrapper function did not return a string.');
    return this.emit('error', err);
  }
  this.output(outputContent, cb);
};

/*
* This will handle a single view file by adding it to the cache.
* */
process.prototype.cache = function AddViewToCache(swigPath, swigContent) {
  swigPath = swigPath.replace(/\\/g, "/");
  swigPath = swigPath.replace(/[\n\r]/g,'');
  if(this.config.removeExtension) {
    swigPath = swigPath.substr(0, swigPath.length - this.config.extension.length - 1);
  }
  this.CACHE[swigPath] = swigContent;
};

process.prototype.run = function RunSwig(done) {
  if(typeof done !== 'function') var done = function(){};
  var allPaths = this.allPaths(),
    self = this,
    _calls = [];
  _.forEach(allPaths, function(data) {
    _.forEach(data.files, function(viewPath) {
      _calls.push(function(done) {
        self.input(viewPath, function(content) {
          var relPath = viewPath.replace(data.path, '').substr(1);
          if(!content) return done();
          self.cache(relPath, content);
          done();
        });
      });
    });
  });
  async.waterfall(_calls, function() {
    self.__loaded = true;
    self.save(done);
  });
};



module.exports = process;