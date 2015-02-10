/*
* This is the LESS compiler watcher. It will compile any .less files in the configuration.
* Its settings are mostly the same with commonjs / swig's ones.
* */

var util = require('util'),
  path = require('path'),
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
  output: 'public/css/style.css',
  compressed: false,    // Should we compress the css.
  less: {}  // Optional options to pass to node-sass. See https://www.npmjs.com/package/node-sass
};

var less;

process.prototype.init = function Initialize() {
  if(this.paths.length > 1) {
    throw new Error('Crux.build.less: This process only supports one source directory.');
  }
  less = require('less');
};

process.prototype.run = function RunSass(_done) {
  var done = (typeof _done === 'function' ? _done : function(){}),
    main = path.normalize(this.paths[0] + '/' + this.config.entry),
    self = this;
  this.input(main, function(input) {
    if(input === null) {
      log.warn('Crux.build: less entry file deleted.');
      return done();
    }
    var _opt = {
      filename: main,
      compressed: this.config.compressed
    };
    for(var key in this.config.less) {
      _opt[key] = this.config.less[key];
    }
    if(this.config.includes.length) {
      _opt['paths'] = [];
      for(var i=0; i < this.config.includes.length; i++) {
        var inc = path.normalize(global['__rootdir'] + '/' + this.config.includes[i]);
        _opt.includePaths.push(inc);
      }
    }
    less.render(input, _opt, function(err, cssContent) {
      if(err) return done(err);
      self.output(cssContent.css, done);
    });
  });
};

/*
* The build process is the same with run.
* */
process.prototype.build = function BuildSass(done) {
  this.run(done);
};

module.exports = process;
