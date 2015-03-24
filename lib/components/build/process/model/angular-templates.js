var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  Kutil = require('../../../../util/util');
var Interface = require('../../interface');

/**
 * This is an utility process that watches for changes in angular's view directory and performs caching on them.<br/>
 * This will generate a javaScript function that will use angular's $templateCache service (see {@link https://docs.angularjs.org/api/ng/service/$templateCache})
 * to cache static view files for the application. Once the output js file is included in the index html, it will register an angular module,
 * using $templateCache to put all the view files under. For more details, see example.
 *
 * @memberof crux.Build.Angular
 * @class Templates
 * @param {Object} config - angular template configuration
 * @param {String} [config.extension=html] - view extensions to use
 * @param {String} [config.module=app] - the view module's name.
 * @param {String} [config.path=front/app/views] - view directory path
 * @param {String} [config.viewPath=/] - base path tho be prepended for each view file.
 * @param {Boolean} [config.viewExtension=false] - should we remove the extension of each view, when creating the build file.
 * @param {Function} [config.compile] - callback function to be called when reading the content of each view file.
 *
 * @example
 *  // Using the default configuration, we may have the following view structure:
 *  // views/home/welcome.html
 *  // views/home/contact.html
 *  // views/members.html
 *
 *  // The following javaScript template file will be created (app.views.templates.js)
 *  (function(angular) {
 *    var m = angular.module('app.views', []);
 *    m.run([$templateCache, function(t) {
 *      t.put('/home/welcome', '.... welcome html');
 *      t.put('/home/contact', '... contact');
 *      t.put('/members', ' members !');
 *    });
 *  })(window.angular);
 *
 *  // In order to use it, when we initialize our angular app, we require it.
 *  // app.js
 *  var module = angular.module('app', ['app.views']);  // we require the views to be loaded by our module.
 *  // do stuff
 *
* */
var template = function CruxBuildAngularTemplates(config, name) {
  Interface.call(this, config.extension);
  this.config = config; // This configuration is the config situated under angular.templates config in the parent process
  this.name = name + ':templates';
  this.CACHE = {};  // a hash of viewPath:content to cache.
  this.config.output = this.config.output.replace('$module', this.config.module).replace('$environment', global['NODE_ENV']);
  this.config.path = this.__fullPath(this.config.path);
};
util.inherits(template, Interface)

template.default = {
  extension: 'html',
  path: 'front/app/views',
  output: 'public/js/build/$module.templates.js',  // The js output file, where $name is the module name
  module: 'app.views',
  viewExtension: false,     // Should we include or not the .html extension in the $angular view template js
  viewPath: '/',            // The path from wich we start when we output the view content to the template js file
  viewDelimiter: '/',     // This is the delimiter we want to use when creating the view path.
  compile: null     // If specified, we will use this function when compiling the js output with compile(viewPath, viewContent). Returns string
};


/**
 * Watches for any changes in the angular view directory
 * @memberof crux.Build.Angular.Templates
 * @function watch
 * @param {Function} done - on change callback
 * */
template.prototype.watch = function WatchTemplate(done) {
  if(!this.config.path) return done();
  // We first check for the view path.
  var self = this;
  this.__watch(this.config.path, this.config.extension, function onChange(viewPath, content) {
    self.cache(viewPath, content);
    self.compile();
  }, done);
};

/**
* Runs the templates process, reading the view directory structure and caching it, after which it will compile the output js template file
 *
 * @memberof crux.Build.Angular.Templates
 * @function run
 * @param {Function} done - on complete callback
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

/**
* Caches the given path/content and places it under the CACHE property.
 * @memberof crux.Build.Angular.Templates
 * @function cache
 * @param {String} path - view path file
 * @param {String} content - view html content
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

/**
* Ths will retrieve everything that we have in cache and compile it, generating the javascript
* output and writing the js code to the output file. If a <b>compile()</b> function was configured, it will be called
 * for each individual view file (as compile(viewPath, viewContent));
 *
 * @memberof crux.Build.Angular.Templates
 * @function compile
 * @param {Function} done - on compile callback.
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