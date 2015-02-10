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

var Interface = require('../_interface');

var process = function CruxBuildCommonjs() {
  Interface.apply(this, arguments);
  this.name = 'commonjs';
};
util.inherits(process, Interface);

var aliasify,
  browserify,
  uglify;
/*
* The commonjs module works with browserify/aliasify/uglify
* */
process.prototype.packages = function Dependencies() {
  var req = ['browserify@8.0.3', 'aliasify@1.5.1', 'node-watch@0.3.4'];
  if(this.config.uglify) {
    req.push('uglify-js@2.4.16');
  }
  return req;
};

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
  uglify: false,
  output: 'public/js/build/app.build.js'
};

/*
* Saves the output js file.
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

/*
* In our case, build() is the same with run, because we have to re-compile everything.
* */
process.prototype.build = function OnBuild() {
  this.run();
};

process.prototype.run = function CompileCommonJs(done) {
  var COMPONENT_BUILD = '/*COMPONENT_BUILD*/\n',
    self = this,
    ROOT_DIR = this.paths[0],
    ALIASIFY_ALIASES = {};
  var allFiles = Kutil.readDirectoryRelative(ROOT_DIR, 'js'),
    configEnvironment = 'config/' + NODE_ENV + '.js';
  allFiles.forEach(function(item) {
    item = item.substr(1);
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
    // We will use aliasify to make our life easier, when requiring modules in the front js.
    // This allows us to map everything to "x/y
    var aliasifyObj = aliasify.configure({
      aliases: ALIASIFY_ALIASES,
      configDir: path.normalize(ROOT_DIR)
    });
    browserifyObj.transform(aliasifyObj)
    appStream.emit('data', APP_JS);
    appStream.emit('end');
    browserifyObj.bundle(function(err, data) {
      if(err) {
        return done && done(err);
      }
      var fullJsContent = data.toString().replace(COMPONENT_BUILD, '\n');
      return self.save(fullJsContent, done);
    });
  }.bind(this), false);
};

module.exports = process;