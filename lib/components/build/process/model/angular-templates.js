var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  Kutil = require('../../../../util/util');
var Interface = require('../../_interface');
/*
* This is the angular sub-process task called Angular.templates. Its only purpose
* is to parse the HTML file, the path and content being served by the parent process.
* */

var template = function CruxBuildAngularTemplates(config) {
  Interface.call(this, config.extension);
  this.config = config; // This configuration is the config situated under angular.templates config in the parent process
  this.name = 'angular:templates'
  this.CACHE = {};  // a hash of viewPath:content to cache.
  this.config.output = this.config.output.replace('$module', this.config.module).replace('$environment', global['NODE_ENV']);
  this.config.path = this.__fullPath(this.config.path);
};
util.inherits(template, Interface)

template.default = {
  extension: 'html',
  path: 'front/app/views',
  output: 'public/js/build/$module.templates.js',  // The js output file, where $name is the module name
  module: 'app',
  viewExtension: false,     // Should we include or not the .html extension in the $angular view template js
  viewPath: '/',            // The path from wich we start when we output the view content to the template js file
  viewDelimiter: '/',     // This is the delimiter we want to use when creating the view path.
  compile: null     // If specified, we will use this function when compiling the js output with compile(viewPath, viewContent). Returns string
};

template.prototype.watch = function WatchTemplate(done) {
  if(!this.config.path) return done();
  // We first check for the view path.
  var self = this;
  this.__watch(this.config.path, this.config.extension, function onChange(viewPath, content) {
    self.cache(viewPath, content);
    self.compile();
  }, done);
};

/*
* Runs the template, implying that it will read the full directory caching it.
* */
template.prototype.run = function RunTemplates(done) {
  if(!this.config.path) return done();
  try {
    var files = Kutil.readDirectory(this.config.path, this.config.extension);
  } catch(e) {
    return done(e);
  }
  try {
    for(var i=0; i < files.length; i++) {
      var viewPath = files[i],
        viewContent = fs.readFileSync(viewPath, { encoding: 'utf8' });
      this.cache(viewPath, viewContent);
    }
  } catch(e) {
    return done(e);
  }
  this.compile(done);
};

/*
* Caches the given path/content and places it under CACHE.
* */
template.prototype.cache = function CacheView(_path, content) {
  _path = _path.replace(this.config.path, '');
  var basePath = this.config.viewPath;
  if(this.config.viewExtension === false && _path.indexOf(this.config.extension) !== -1) {
    _path = _path.substr(0, _path.indexOf(this.config.extension)-1);
  }
  if(basePath !== '' && basePath.charAt(basePath.length-1) !== '/' && basePath.charAt(basePath.length-1) !== '\\') {
    basePath += '/';
  }
  _path = path.normalize(basePath + _path);
  _path = (_path.indexOf('/') !== -1 ? _path.split('/') : _path.split('\\'));
  var viewPath = _path.join(this.config.viewDelimiter);
  if(content === null && typeof this.CACHE[viewPath] !== 'undefined') {
    this.CACHE[viewPath] = undefined;
    return;
  }

  // We now setup the viewContent by replacing every \n char with space
  var viewContent = content.replace(/(\r\n|\n|\r|\t)/gm," ");
  // We replace more than one space with one.
  viewContent = viewContent.replace(/\s{2,}/g, ' ');
  this.CACHE[viewPath] = viewContent;
};

/*
* Ths will retrieve everything that we have in cache and compile it, generating the javascript
* output and writing the js code to the output file.
* */
template.prototype.compile = function CompileViews(done) {
  var JS_CONTENT = "(function(angular) {\n";
  JS_CONTENT += 'var m = angular.module("'+ this.config.module +'", []);\n';
  for(var viewPath in this.CACHE) {
    var viewContent = this.CACHE[viewPath],
      viewJs;
    if(typeof this.config.compile === 'function') {// Custom compilation javascript
      viewJs = this.config.compile(viewPath, viewContent);
      if(typeof viewJs !== 'string' || viewJs == '') {
        var err = new Error('Crux.build.angular:templates config.compile() does not return a string.');
        this.emit('error', err);
        return done && done(err);
      }
    } else {
      viewJs = 'm.run(["$templateCache", function(t) {';
      viewJs += 't.put('+JSON.stringify(viewPath)+', '+ JSON.stringify(viewContent) +');';
      viewJs += '}]);\n';
    }
    JS_CONTENT += viewJs;
  }
  JS_CONTENT = JS_CONTENT.substr(0, JS_CONTENT.length-1);
  JS_CONTENT += "\n})(window['angular']);";
  this.output(JS_CONTENT, done);
};

module.exports = template;