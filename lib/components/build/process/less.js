/*
* This is the LESS compiler watcher. It will compile any .less files in the configuration.
* Its settings are mostly the same with commonjs / swig's ones.
* */

var util = require('util'),
  path = require('path'),
  async = require('async'),
  Kutil = require('../../../util/util');

var Interface = require('../_interface');

var process = function CruxBuildLess() {
  Interface.apply(this, arguments);
  this.name = 'less';
};

util.inherits(process, Interface);

process.prototype.packages = function Dependencies() {
  return ['less@2.2.x', 'node-watch@0.3.4'];
};

process.default = {
  extension: '.less',      // The file extension of our sass files. Defaults to .scss
  path: 'front/less',   //   The .scss directory
  includes: [],           // An array of paths to include.
  entry: 'style.less',    //
  files: [],              // An array of files to compile and watch. optional.
  output: 'public/css/style.css',
  compressed: false,    // Should we compress the css.
  options: {}  // Optional options to pass to node-sass. See https://www.npmjs.com/package/node-sass
};

var less;

process.prototype.init = function Initialize() {
  if(this.paths.length > 1) {
    throw new Error('Crux.build.less: This process only supports one source directory.');
  }
  less = require('less');
};

process.prototype.run = function RunLess(done) {
  done = (typeof done === 'function' ? done : function(){});
  var self = this;
  this.buildEntry(function(err, wasBuilt) {
    if(err) return done(err);
    if(!wasBuilt && self.config.files.length === 0) {
      log.debug('Crux.build: less entry file %s unavailable', self.config.entry);
    }
    self.buildFiles(function(err, wereBuilt) {
      if(err) return done(err);
      done();
    });
  });
};

/*
* Returns the less configuration object.
* */
process.prototype.__getConfig = function GetLessConfiguration(file) {
  var _opt = {
    filename: file,
    compressed: this.config.compressed
  };
  for(var key in this.config.options) {
    _opt[key] = this.config.options[key];
  }
  if(this.config.includes.length) {
    _opt['paths'] = [];
    for(var i=0; i < this.config.includes.length; i++) {
      var inc = path.normalize(global['__rootdir'] + '/' + this.config.includes[i]);
      _opt.includePaths.push(inc);
    }
  }
  return _opt;
};

/**
* Performs less build over all the configured additional files
* */
process.prototype.buildFiles = function BuildFiles(done) {
  if(this.config.files.length === 0) return done();
  var calls = [],
    self = this;
  _.forEach(this.config.files, function(_out, _in) {
    calls.push(function(lessed) {
      var fin = path.normalize(self.paths[0] + '/' + _in);
      self.input(fin, function(input) {
        if(input === null) {
          log.debug('Crux.build: less file %s unavailable', _in);
          return lessed();
        }
        var opt = self.__getConfig(fin);
        less.render(input, opt, function(err, cssFile) {
          if(err) return done(err);
          self.output(cssFile.css, _out, lessed);
        });
      });
    });
  });
  if(calls.length === 0) {
    return done(null, false);
  }
  async.series(calls, function(err) {
    if(err) return done(err);
    done(null, true);
  });
};

/*
* Performs main entry-file compilation. This is used when we have no additional files under the configuration.
* */
process.prototype.buildEntry = function BuildEntryFile(done) {
  var main = path.normalize(this.paths[0] + '/' + this.config.entry),
    opt = this.__getConfig(main),
    self = this;
  this.input(main, function(input) {
    if(!input) {
      return done(null, false);
    }
    less.render(input, opt, function(err, cssContent) {
      if(err) return done(err);
      self.output(cssContent.css, function(err) {
        if(err) return done(err);
        done(null, true);
      });
    });
  })
};


/*
* The build process is the same with run.
* */
process.prototype.build = function BuildSass(fileName) {
  if(this.config.entry === fileName) {
    return this.buildEntry(function() {});
  }
  this.buildFiles(function(){});
};

module.exports = process;
