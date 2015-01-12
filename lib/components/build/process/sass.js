/*
* This is the SASS compiler watcher. It will compile any .scss files in the configuration.
* Its settings are mostly the same with commonjs / swig's ones.
* */

var util = require('util'),
  path = require('path'),
  Kutil = require('../../../util/util');

var Interface = require('../_interface');

var process = function CruxBuildSass() {
  Interface.apply(this, arguments);
  this.name = 'sass';
}
util.inherits(process, Interface);

process.prototype.packages = function Dependencies() {
  return 'node-sass@1.0.3';
};

process.default = {
  extension: '.scss',      // The file extension of our sass files. Defaults to .scss
  path: 'front/styles',   //   The .scss directory
  includes: [],           // An array of paths to include.
  entry: 'style.scss',    //
  output: 'public/css/style.css',
  compressed: false,    // Should we compress the css.
  sass: {}  // Optional options to pass to node-sass. See https://www.npmjs.com/package/node-sass
};

var sass;

process.prototype.init = function Initialize() {
  if(this.paths.length > 1) {
    throw new Error('Crux.build.sass: This process only supports one source directory.');
  }
  sass = require('node-sass');
};

process.prototype.run = function RunSass(done) {
  var self = this;
  var _opt = {
    file: path.normalize(this.paths[0] + '/' + this.config.entry),
    outputStyle: (this.config.comporessed ? 'compressed' : 'compact'),
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

/*
* The build process is the same with run.
* */
process.prototype.build = function BuildSass() {
  this.run();
};

module.exports = process;
