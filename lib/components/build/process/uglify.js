var util = require('util'),
  path = require('path');

var Interface = require('../interface');

/**
 * This is the UglifyJS process, where it can watch for changes on a JS file, and minify it.
 *
 * @memberof crux.Build
 * @class Uglify
 * @extends crux.Build.Interface
 * @param {Object} config - the default process configuration object
 * @param {String} [config.input] - input javascript file.
 * @param {String} [config.output] - minified/uglified output file.
 * @param {Object} [config.options] - additional uglify options to be passed on compile time
 * @property {Object} config - the configuration object attached to this process
 * */
var process = function CruxBuildUglify(config, _name) {
  Interface.apply(this, arguments);
  this.name = _name || 'uglify';
};

util.inherits(process, Interface);

process.prototype.packages = function Dependencies() {
  return ['uglify-js@2.4.x', 'node-watch@0.3.4'];
};

process.default = {
  input: null,    // input file to watch
  output: null,   // output file to watch
  options: null   // uglifyjs options
};

var uglifyjs;

/**
* Performs requires.
 * @memberof crux.Build.Uglify
 * @function init
* */
process.prototype.init = function Initialize() {
  if(this.config.input == null || this.config.output == null) {
    throw new Error('Crux.build.uglify: input and output files must be specified.');
  }
  uglifyjs = require('uglify-js');
  this.paths = [path.normalize(__rootdir + '/' + this.config.input)];
};
/**
* Runs the uglify.js process, building the files.
 * @memberof crux.Build.Uglify
 * @function run
 * @param {Function} done - the oncomplete callback
* */
process.prototype.run = function RunLess(done) {
  return this.build(done);
};


/**
* Starts the less building process on both the entry file and additional files (if configured)
 * @memberof crux.Build.Less
 * @function build
 * @param {String} fileName - the file name that has just changed.
* */
process.prototype.build = function BuildSass(fileName, _cb) {
  var cb = (typeof fileName === 'function' ? fileName : _cb),
    self = this;
  this.input(this.paths[0], function(content) {
    if(!content) return cb && cb();
    var opt = (self.config.options != null ? self.config.options : {});
    if(typeof opt !== 'object' || !opt) opt = {};
    opt.fromString = true;
    var result = uglifyjs.minify(content, opt);
    if(typeof result.code !== 'string') {
      return cb && cb(new Error('Crux.build.uglify: failed to compile with uglifyjs.'));
    }
    self.output(result.code, null, cb);
  });
};

module.exports = process;
