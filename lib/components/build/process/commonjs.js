/*
* This will compile client-side javascript, using browserify and aliasify on all its require().
* It does an extensive search of require(), by requiring all the dependencies at the beginning of the
* script, and then it will start parsing/concatenating the end result. We do this because browserify
* does not support dynamic require paths.
* */
var util = require('util'),
  async = require('async'),
  stream = require('stream'),
  path = require('path'),
  Kutil = require('../../../util/util');

var Interface = require('../interface');

var process = function CruxBuildCommonjs() {
  Interface.apply(this, arguments);
  this.name = 'commonjs';
};
util.inherits(process, Interface);

var aliasify,
  browserify,
  uglify;
/**
* The Crux CommonJS build process seamlessly integrates browserify and aliasify into the frontend javascript code,
 * once again enabling the developer to focus on the actual code and not on external build dependencies.<br/>
 * The process uses browserify to perform cjs require() and aliasify to map file names, making them more accessible via require()
 *
 * @memberof crux.Build
 * @class Commonjs
 * @param {Object} config - the default configuration object
 * @param {String} [config.path=front/commonjs] - the root front-end application folder.
 * @param {String} [config.entry=app.js] - the single entry file to use when building the front-end application
 * @param {String} [config.extension=.js] - default extension of our javascrpt files
 * @param {String} [config.output=public/js/build/app.build.js] - the default output file that will contain the fully generated frontend app
 * @param {Boolean} [config.aliasify=true] - by default, aliasify is enabled when building, automatically creating the mapping of each js file in the folder.
 * @param {Boolean} [config.uglify=false] - should this process create minified content using the uglify-js npm module
 * @param {Array} [config.transform] - additional transformations to be directly passed to browserify's transform() method.
 * @example
 *  // The configuration we will use for this example.
 *  var config.js = {
 *    path: 'front/plugin',
 *    entry: 'app.js',
 *    output: 'public/js/plugin.js'
 *  };
 *
 *  // Our folder strucutre:
 *  // plugin/app.js - main app
 *  // plugin/component/one.js // mock component
 *  // plugin/sub/two.js  // mock component
 *
 *  // Our main app.js content
 *  var one = require('component/one.js'),
 *    emitter = require('events').EventEmitter; // this is the browserified version of node's event emitter
 *    function myPlugin() {
 *      // do something
 *    }
 *    myPlugin.prototype.init = function() {
 *      // do some magic
 *      require('component/one.js');
 *    }
 *    var pluginObj = new myPlugin();
 *    module.exports = pluginObj  // we want our plugin to be a singleton
 *    $(document).ready(pluginObj.bind(pluginObj));
 *
 *    // Our sub/two.js content
 *    var plugin = require('app.js'); // this will require the singleton instance of myPlugin
 *    // do some stuff here
* */
process.prototype.packages = function Dependencies() {
  var req = ['browserify@8.0.3', 'aliasify@1.5.1', 'node-watch@0.3.4'];
  if(this.config.uglify) {
    req.push('uglify-js@2.4.16');
  }
  return req;
};

/**
* Initializes the cjs build process, requiring its external module dependencies
* */
process.prototype.init = function Initialize() {
  if(this.paths.length > 1) {
    throw new Error('Crux.build.commonjs: This process only supports one source directory.');
  }
  aliasify = require('aliasify');
  browserify = require('browserify');
  if(this.config.uglify) {
    uglify = require('uglify-js');
  }
  this.config.output = this.config.output.replace('$environment', global['NODE_ENV']);
};

process.default = {
  path: 'front/commonjs',
  entry: 'app.js',    // This is the default entry file that we'll use to include all other scripts
  extension: '.js',
  aliasify : true,
  uglify: false,
  output: 'public/js/build/app.build.js',
  transform: []     // an array of transformation modules.
};

/**
* Saves the generated build file to the configured path, minifying it (with sourcemaps) if configured.
 * @memberof crux.Build.Commonjs
 * @function save
 * @param {String} content - generated js content
 * @param {Function} done - on save callback
* */
process.prototype.save = function SaveAppFile(jsContent, onSave) {
  if(typeof onSave !== 'function') onSave = function(){};
  var self = this;
  function saveMainJs() {
    self.output(jsContent, onSave);
  }
  if(this.config.uglify) {
    var result = uglify.minify(jsContent, {
      fromString: true,
      outSourceMap: Kutil.getFileName(this.config.output) + '.map'
    });
    jsContent = result.code;
    return this.output(result.map, this.config.output + '.map', saveMainJs);
  }
  saveMainJs();
};

/**
* In our case, build() is the same with run, because we have to re-compile everything.
 * @memberof crux.Build.Commonjs
 * @function build
* */
process.prototype.build = function OnBuild() {
  this.run();
};

/**
* Starts the build process. It is composed of the following steps<br/>
 * - Generate an array of all the javaScript files in the configured directory<br/>
 * - Create a virtual representation of each file to pass to aliasify <br/>
 * - Use browserify to build the main javaScript file<br/>
 *
 * @memberof crux.Build.Commonjs
 * @function run
 * @param {Function} done - the on compete function.
* */
process.prototype.run = function CompileCommonJs(done) {
  var COMPONENT_BUILD = '/*COMPONENT_BUILD*/\n',
    self = this,
    ROOT_DIR = this.paths[0],
    ALIASIFY_ALIASES = {};
  var allFiles = Kutil.readDirectoryRelative(ROOT_DIR, 'js'),
    configEnvironment = 'config/' + NODE_ENV + '.js';
  allFiles.forEach(function(item) {
    if(item.charAt(0) === '/' || item.charAt(0) === '\\') item = item.substr(1);
    // If we have a config.js requirement, we are going to proxy the require to the config/<environment>.js folder.
    if(item.indexOf('config/') === 0) {
      if(configEnvironment === item) {
        ALIASIFY_ALIASES['config'] = './' + item;
        COMPONENT_BUILD += "require('./"+item+"'); \n";
      }
      return;
    }

    ALIASIFY_ALIASES[item.replace('.js','')] = './' + item;
    if(item.indexOf("/") === -1) return;  // skip root level components.
    COMPONENT_BUILD += "require('./"+item+"'); \n";
  });
  COMPONENT_BUILD += '\n/*COMPONENT_BUILD_END*/';
  // We now try and read the main entry point.
  this.input(path.join(ROOT_DIR + '/' + this.config.entry), function(content) {
    var APP_JS = (content == null ? '' : content);
    APP_JS += "\n" + COMPONENT_BUILD;
    var appStream = new stream();
    var browserifyObj = browserify();
    browserifyObj.add(appStream, {
      basedir: path.normalize(ROOT_DIR),
      file: path.normalize(ROOT_DIR + '/' + this.config.entry)
    });
    if(self.config.aliasify) {
      // We will use aliasify to make our life easier, when requiring modules in the front js.
      // This allows us to map everything to "x/y
      var aliasifyObj = aliasify.configure({
        aliases: ALIASIFY_ALIASES,
        configDir: path.normalize(ROOT_DIR)
      });
      browserifyObj.transform(aliasifyObj);
    }
    if(self.config.transform.length) {
      for(var i=0; i < self.config.transform.length; i++) {
        browserifyObj.transform(self.config.transform[i]);
      }
    }
    appStream.emit('data', APP_JS);
    appStream.emit('end');
    browserifyObj.bundle(function(err, data) {
      if(err) {
        delete err.stream;
        return done && done(err);
      }
      var fullJsContent = data.toString().replace(COMPONENT_BUILD, '\n');
      return self.save(fullJsContent, done);
    });
  }.bind(this), false);
};

module.exports = process;