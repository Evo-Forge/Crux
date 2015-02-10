/*
* This will compile client-side html templates into JavaScript templates.
* Each template will be set in a pre-defined object (on the client-side script).
* */
var util = require('util'),
  async = require('async'),
  Kutil = require('../../../util/util');

var Interface = require('../_interface');

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
  minify: true,
  process: null,           // Function, if specified, it will be called with the content of each template, and will use the content it returns.
  wrap: "window['VIEWS'] = $content;"
};

process.prototype.packages = function Dependencies() {
  return ['node-watch@0.3.4'];
};

/*
* The html build system allows the developer to wrap the generated js object of {fileName:fileContent} to process it.
* By default, it will simply wrap them into a window['VIEWS'] hash.
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

process.prototype.build = function BuildHtml(htmlPath, htmlContent) {
  // If it's not fully loaded with all teh templates, we just execute a run first.
  if(!this.__loaded) {
    return this.run();
  }
  this.cache(htmlPath, htmlContent);
  this.save();
};

/*
* Saves the html cache output to the file.
* */
process.prototype.save = function SaveCache(cb) {
  var outputContent = this.wrap(JSON.stringify(this.CACHE));
  if(typeof outputContent !== 'string') {
    var err = new Error('Crux.build.templates: wrapper function did not return a string.');
    return this.emit('error', err);
  }
  this.output(outputContent, cb);
};

/*
* This will handle a single view file by adding it to the cache.
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