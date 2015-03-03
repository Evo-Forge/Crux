var util = require('util'),
  path = require('path'),
  async = require('async'),
  Kutil = require('../../../util/util');

var Interface = require('../interface');

/**
 * This is the LESS build compiler. It will compile any .less files configured. It uses <b>less@2.2</b> npm package  to do so.
 *
 * @memberof crux.Build
 * @class Less
 * @extends crux.Build.Interface
 * @param {Object} config - the default process configuration object
 * @param {String} [config.extension=.less] - file extension of our less files.
 * @param {String} [config.path=front/less] - file path used for less sources, relative to the project's root folder
 * @param {String} [config.entry=style.less] - the main less file to be compiled
 * @param {String} [config.output=public/css/style.css] - the output file used to compile the less entry file
 * @param {Boolean} [config.compressed=false] - should the generated CSS be compressed
 * @param {Array} [config.files=[]] - allows the compilation of additional .less files. These are in format of { "fileName" : "outputFile"}. Note: fileName is relative to the [path] config and outputFile is relative to the [output] config,
 * @param {Array} [config.includes] - additional file paths to be included while compiling the less sources
 * @param {Object} [config.options] - additional less options to be passed on compile time
 * @property {Object} config - the configuration object attached to this process
 * */
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

/**
* Initializes the less process, requiring the less npm module
 * @memberof crux.Build.Less
 * @function init
* */
process.prototype.init = function Initialize() {
  if(this.paths.length > 1) {
    throw new Error('Crux.build.less: This process only supports one source directory.');
  }
  less = require('less');
};
/**
* Runs the less process, building the files.
 * @memberof crux.Build.Less
 * @function run
 * @param {Function} done - the oncomplete callback
* */
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

/**
* Returns the less process configuration object.<br/>
 * Note, as this is used internally, it should be looked as a private function
 * @memberof crux.Build.Less
 * @function __getConfig
 * @returns {Object}
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
    _opt['includePaths'] = [];
    for(var i=0; i < this.config.includes.length; i++) {
      var inc = path.normalize(global['__rootdir'] + '/' + this.config.includes[i]);
      _opt.includePaths.push(inc);
    }
  }
  return _opt;
};

/**
* Performs the less build process over all the configured additional files.<br/>
 * <b>Note</b> as most projects tend to have a single less file, this is called when the configuration object
 * has the <b>files</b> option set. This will loop over each file object and compile it.<br/>
 * @memberof crux.Build.Less
 * @function buildFiles
 * @param {Function} done - the on complete function to be called.
 * @example
 *  // example configuration
 *    var config = {
 *      "path": "front/less",
 *      "files": [{
 *        "icons.less": "public/css/icons.css",
 *        "some.less": "public/site2/css/some.css"
 *      }]
 *    };
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

/**
* Performs main entry-file compilation. This is used when we have no additional files under the configuration.
 * @memberof crux.Build.Less
 * @function buildEntry
 * @param {Function} done - the on complete function to be called
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


/**
* Starts the less building process on both the entry file and additional files (if configured)
 * @memberof crux.Build.Less
 * @function build
 * @param {String} fileName - the file name that has just changed.
* */
process.prototype.build = function BuildSass(fileName) {
  if(typeof fileName !== 'string' || this.config.entry === fileName) {
    return this.buildEntry(function() {});
  }
  this.buildFiles(function(){});
};

module.exports = process;
