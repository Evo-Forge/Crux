/*
* This is the Angular.js building process. It is divided into two steps:
*   1. Angular.templates -> Creates all the views for a given angular application and places them in the angular cache via angular.cache
* */
var util = require('util'),
  async = require('async'),
  fs = require('fs'),
  path = require('path'),
  Kutil = require('../../../util/util');

var Interface = require('../_interface'),
  Templates = require('./model/angular-templates'),
  Core = require('./model/angular-core');

var process = function CruxBuildSass() {
  Interface.apply(this, arguments);
  this.name = 'angular';
  this.templates = null;  // the model/angular-templates object
  this.core = null;     // the model/angular-core object
};
util.inherits(process, Interface);

process.default = {
  templates: Templates.default,
  core: Core.default
};

process.prototype.packages = function Dependencies() {
  return ['node-watch@0.3.4'];
};

process.prototype.init = function Initialize(userConfig) {
  if(userConfig) {
    if(typeof userConfig['templates'] === 'object') {
      this.templates = new Templates(this.config.templates);
      this.bindEvents(this.templates);
    }
    if(typeof userConfig['core'] === 'object') {
      this.core = new Core(this.config.core);
      this.bindEvents(this.core);
    }
  }
  this.paths.push('.'); // We only do  this so that the build component will run our watch() and run()
};


/*
* We override the watch() function because we have at least 2 paths to watch.
* */
process.prototype.watch = function WatchFiles(done) {
  var _watches = [],
    self = this;
  if(this.templates) {
    _watches.push(function(ready) {
      self.templates.watch(ready);
    });
  }
  if(this.core) {
    _watches.push(function(ready) {
      self.core.watch(ready);
    });
  }
  async.series(_watches, done);
}

/*
* Runs the angular process.
* */
process.prototype.run = function RunAngular(done) {
  var _runs = [],
    done = (typeof done === 'function' ? done : function(){}),
    self = this;
  if(this.templates) {
    _runs.push(function(ready) {
      self.templates.run(ready);
    });
  }
  if(this.core) {
    _runs.push(function(ready) {
      self.core.run(ready);
    });
  }
  async.series(_runs, done);
};


process.Templates = Templates;
process.Core = Core;
module.exports = process;
