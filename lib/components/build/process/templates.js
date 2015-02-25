var util = require('util'),
  async = require('async'),
  Kutil = require('../../../util/util');

var Interface = require('../interface');

/**
 * This build process will watch for changes to html/client-side templates and transform them into JavaScript objects.
 * Each template will be set in a pre-defined object (on the client-side script).
 *
 * @memberof crux.Build
 * @class Templates
 * @extends crux.Build.Interface
 * @param {Object} config - the default process configuration object
 * @param {String} [config.extension=.html] - default template extension
 * @param {String} [config.path=front/views] - default file path to watch for changes, relative to the project's root directory
 * @param {Boolean} [config.removeExtension=true] - by default, the file's extension will be removed when creating the template cache object
 * @param {String} [config.output=public/js/build/templates.js] - the output javascript file that will contain the cached templates
 * @param {Boolean} [config.minify=false] - should the HTML content be minified, removing excessive whitespaces and comments
 * @param {Function} [config.process] - the callback function that will be called with the content of each template file once it changes. If specified, it must return the modified content (String)
 * @param {String} [config.wrap=window.VIEWS = $content;] - the javaScript template to be used when generating the template cache object. Note that $content is the json-ified object of the templates. This should reflect the location into which we place the generated template cache in the js environment of the browser
 * @property {Object} CACHE - contains the cached view content, as we only re-compile when a template changes and update the cache with its content
 * @example
 *  // example config
 *  var config = {
 *      extension: '.html',
 *      path: 'myapp/views',
 *      output: 'public/js/myapp.views.js',
 *      wrap: '(function(window, myApp){ myApp.views = $content; })(window, window.myApp);'  // this will create an object of { viewFile : viewContent } and place it under myApp.views.
 *  };                                                                    // Thus making it accessible via window.myApp.views['home/index']
 * */
var process = function CruxBuildTemplates() {
  Interface.apply(this, arguments);
  this.name = 'templates';
  this.CACHE = {};
  this.__loaded = false;  // were all the views previously loaded?
};
util.inherits(process, Interface);

process.default = {
  extension: '.html',
  path: 'front/views',
  removeExtension: true,  // By default, the output hash will not contain the .html extension.
  output: 'public/js/build/html.templates.js',
  minify: false,
  process: null,           // Function, if specified, it will be called with the content of each template, and will use the content it returns.
  wrap: "window['VIEWS'] = $content;"
};

process.prototype.packages = function Dependencies() {
  return ['node-watch@0.3.4'];
};

/**
* The html build system allows the developer to wrap the generated js object of {fileName:fileContent} to process it.
* By default, it will simply wrap them into a window['VIEWS'] hash, but we highly encourage that this option to be changed to suit your needs<br/>
 * @memberof crux.Build.Templates
 * @function wrap
 * @param {String} content - the file content of the changed template.
* */
process.prototype.wrap = function WrapResult(content) {
  var _wrapper = this.config.wrap;
  if(_wrapper.indexOf('$content') === -1) {
    this.emit('error', new Error('Crux.build.templates: invalid wrap string configuration. Must contain $content.'));
    return '';
  }
  _wrapper = _wrapper.replace('$content', content);
  return _wrapper;
};

/**
* The template build process implies updating the cache with the modified template content and
 * generating the output javascript file.
 *
 * @memberof crux.Build.Templates
 * @function build
 * @param {String} filePath - the file path that has just changed
 * @param {String} content - the file content of the template.
* */
process.prototype.build = function BuildHtml(htmlPath, htmlContent) {
  // If it's not fully loaded with all teh templates, we just execute a run first.
  if(!this.__loaded) {
    return this.run();
  }
  this.cache(htmlPath, htmlContent);
  this.save();
};

/**
* Saves the html cache output to the file. It basically JSON.stringifies the cache, wraps it the javaScript wrapper
 * and saves the output
 * @memberof crux.Build.Templates
 * @function save
 * @param {Function} cb - the callback function to be called when the save is complete.
* */
process.prototype.save = function SaveCache(cb) {
  var outputContent = this.wrap(JSON.stringify(this.CACHE));
  if(typeof outputContent !== 'string') {
    var err = new Error('Crux.build.templates: wrapper function did not return a string.');
    return this.emit('error', err);
  }
  this.output(outputContent, cb);
};

/**
* This will handle a single view file by adding it to the cache. If configured, it will also process the file content
 * and minify it before updating the cache
 * @memberof crux.Build.Templates
 * @function cache
 * @param {String} path - the template path
 * @param {String} content - the template content
* */
process.prototype.cache = function AddViewToCache(htmlPath, htmlContent) {
  htmlPath = htmlPath.replace(/\\/g, "/");
  htmlPath = htmlPath.replace(/[\n\r]/g,'');
  if(this.config.removeExtension) {
    if(this.config.extension.charAt(0) !== '.') this.config.extension = '.' + this.config.extension;
    htmlPath = htmlPath.substr(0, htmlPath.length - this.config.extension.length);
  }
  if(this.config.minify) {
    htmlContent = htmlContent.replace(/(\r\n|\n|\r|\t)/gm," ");
    // We replace more than one space with one.
    htmlContent = htmlContent.replace(/\s{2,}/g, ' ');
  }
  if(typeof  this.config.process === 'function') {
    htmlContent = this.config.process(htmlPath, htmlContent);
    if(typeof htmlContent !== 'string') {
      var err = new Error('Crux.build.templates: process function did not return a string for template ' + htmlPath);
      this.emit('error', err);
      return this;
    }
  }
  this.CACHE[htmlPath] = htmlContent;
};

/**
* Runs the template building process, building the output file.
 * @memberof crux.Build.Templates
 * @function run
 * @param {Function} done - the on complete function to be called
* */
process.prototype.run = function RunHtml(done) {
  if(typeof done !== 'function') var done = function(){};
  var allPaths = this.allPaths(),
    self = this,
    _calls = [];
  _.forEach(allPaths, function(data) {
    _.forEach(data.files, function(viewPath) {
      _calls.push(function(done) {
        self.input(viewPath, function(content) {
          var relPath = viewPath.replace(data.path, '').substr(1);
          if(!content) return done();
          self.cache(relPath, content);
          done();
        });
      });
    });
  });
  async.waterfall(_calls, function() {
    self.__loaded = true;
    self.save(done);
  });
};



module.exports = process;