var util = require('util'),
  path = require('path'),
  Kutil = require('../../../util/util');

var Interface = require('../interface');

/**
 * This is the SASS build compiler. It will compile any .scss files configured. It uses <b>node-sass@1.0.3</b> npm package  to do so.
 *
 * @memberof crux.Build
 * @class Sass
 * @extends crux.Build.Interface
 * @param {Object} config - the default process configuration object
 * @param {String} [config.extension=.scss] - file extension of our sass files.
 * @param {String} [config.path=front/sass] - file path used for sass sources, relative to the project's root folder
 * @param {String} [config.entry=style.scss] - the main less file to be compiled
 * @param {String} [config.output=public/css/style.css] - the output file used to compile the sass entry file
 * @param {Boolean} [config.compressed=false] - should the generated CSS be compressed
 * @param {Array} [config.includes] - additional file paths to be included while compiling the less sources
 * @param {Object} [config.options] - additional sass options to be passed on compile time
 * @property {Object} config - the configuration object attached to this process
 * */

var process = function CruxBuildSass(config, _name) {
  Interface.apply(this, arguments);
  this.name = _name || 'sass';
};
util.inherits(process, Interface);

process.prototype.packages = function Dependencies() {
  return ['node-sass@1.0.3', 'node-watch@0.3.4'];
};

process.default = {
  extension: '.scss',      // The file extension of our sass files. Defaults to .scss
  path: 'front/sass',   //   The .scss directory
  includes: [],           // An array of paths to include.
  entry: 'style.scss',    //
  output: 'public/css/style.css',
  compressed: false,    // Should we compress the css.
  sass: {}  // Optional options to pass to node-sass. See https://www.npmjs.com/package/node-sass
};

var sass;

/**
 * Initializes the SASS process, requiring the node-sass npm module
 * @memberof crux.Build.Sass
 * @function init
 * */
process.prototype.init = function Initialize() {
  if(this.paths.length > 1) {
    throw new Error('Crux.build.sass: This process only supports one source directory.');
  }
  sass = require('node-sass');
};

/**
 * Runs the sass process, building the files.
 * @memberof crux.Build.Sass
 * @function run
 * @param {Function} done - the oncomplete callback
 * */
process.prototype.run = function RunSass(done) {
  var self = this;
  var _opt = {
    file: path.normalize(this.paths[0] + '/' + this.config.entry),
    outputStyle: (this.config.compressed ? 'compressed' : 'compact'),
    success: function(cssContent) {
      self.output(cssContent, done);
    },
    error: function(err) {
      if(typeof err === 'string') {
        err = err.substr(0, err.lastIndexOf('\n'));
        err = new Error(err);
      }
      self.emit('error', err);
      return done && done();
    }
  };
  if(this.config.includes.length) {
    _opt['includePaths'] = [];
    for(var i=0; i < this.config.includes.length; i++) {
      var inc = path.normalize(global['__rootdir'] + '/' + this.config.includes[i]);
      _opt.includePaths.push(inc);
    }
  }
  for(var key in this.config.sass) {
    if(typeof _opt[key] !== 'undefined') continue;
    _opt[key] = this.config.sass[key];
  }
  sass.render(_opt);
};

/**
* The build process is the same with run().
 * @memberof crux.Build.Sass
 * @function build
* */
process.prototype.build = function BuildSass() {
  this.run();
};

module.exports = process;
