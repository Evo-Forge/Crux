var util = require('util'),
  async = require('async'),
  fs = require('fs'),
  path = require('path'),
  Kutil = require('../../../util/util');

var Interface = require('../interface'),
  Templates = require('./model/angular-templates'),
  Index = require('./model/angular-index'),
  Core = require('./model/angular-core');

/**
* The crux angular build process provides angular-related building process. As most angular applications tend to be stored
 * into a single javaScript file placed on a CDN, this component facilitates the process, watching and building (concatenating) all angular
 * files found under the root project directory<br/>
 * The process is divided into 3 separate sub-processes that can all or some be included:<br/>
 * - {@link crux.Build.Angular.Core} - handles javaScript concatenation<br/>
 * - {@link crux.Build.Angular.Templates} - handles html caching with angular's $templateCache service<br/>
 * - {@link crux.Build.Angular.Index} - watcher over the index.html root file and copies it into the public folder.<br/><br/>
 * <b>Note</b>: the main angular process still inherits from {@link crux.Build.Interface} but it is more of a sub-process manager over
 * all of angular's subprocesses.<br/>
   <b>Note 2</b>: This class should not be overridden or modified in any way, as it may cause unstability.<br/>
 * @namespace crux.Build.Angular
 * */

var process = function CruxBuildAngular() {
  Interface.apply(this, arguments);
  this.name = 'angular';
  this.templates = null;  // the model/angular-templates object
  this.core = null;     // the model/angular-core object
  this.index = null;   // the model/angular-index
};
util.inherits(process, Interface);

process.default = {
  extension: '.js',
  templates: Templates.default,
  core: Core.default,
  index: Index.default
};

process.prototype.packages = function Dependencies() {
  return ['node-watch@0.3.4'];
};

/**
 * Initializes the angular build process, loading any angular sub-processes<br/>
 * @memberof crux.Build.Angular
 * @function init
 * */
process.prototype.init = function Initialize() {
  if(typeof this.config['templates'] === 'object') {
    this.templates = new Templates(this.config.templates, this.name);
    this.bindEvents(this.templates);
  }
  if(typeof this.config['core'] === 'object') {
    this.core = new Core(this.config.core, this.name);
    this.bindEvents(this.core);
  }
  if(typeof this.config['index'] === 'object') {
    this.index = new Index(this.config.index, this.name);
    this.bindEvents(this.index);
  }
  this.paths.push('.'); // We only do  this so that the build component will run our watch() and run()
};


/**
* Overrides the interface's watch() function, by calling all of its sub-processes's watch() function
 *
 * @memberof crux.Build.Angular
 * @function watch
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
  if(this.index) {
    _watches.push(function(ready) {
      self.index.watch(ready);
    })
  }
  async.series(_watches, done);
};

/**
* Runs all configured angular sub-processes
 * @memberof crux.Build.Angular
 * @function run
 * @param {Function} done - the on complete callback.
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
  if(this.index) {
    _runs.push(function(ready) {
      self.index.run(ready);
    })
  }
  async.series(_runs, done);
};


process.Templates = Templates;
process.Core = Core;
process.Index = Index;
module.exports = process;
