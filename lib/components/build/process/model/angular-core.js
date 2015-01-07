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
};
util.inherits(core, Interface);

core.default = {
  extension: '.js',
  path: 'front/app',
  entry: 'app.js',
  output: 'app/public/build/$module.angular.js',
  module: 'app'
};

/*
* We start watching all the js files in the angular directory.
* */
core.prototype.watch = function WatchAngularCore(done) {
  if(!fs.existsSync(this.config.path)) return done();
  this.__watch(this.config.path, this.config.extension, function onChange(jsPath, content) {
    console.log("CHANGE")
  }, done);
};

/*
* Runs the angular core concatenation and compilation.
* */
core.prototype.run = function RunAngulareCore(done) {
  if(!this.config.path) return done();
  try {
    var files = Kutil.readDirectoryRelative(this.config.path, this.config.extension);
  } catch(e) {
    return done(e);
  }
  console.log(files);
};


module.exports = core;