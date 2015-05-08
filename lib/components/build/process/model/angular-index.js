var util = require('util'),
  fs = require('fs'),
  path = require('path');
var Interface = require('../../interface');


/**
 * This is the angular sub-process task called Angular.index. Its only purpose
 * is to watch the index.html file under the angular's root directory and copy it to the public folder.<br/>
 * This is a convenient setting for projects that tend to have a complicated structure and want to have their entire angular app in a single directory.
 *
 * @memberof crux.Build.Angular
 * @class Index
 * @param {Object} config - default process configuration
 * @param {String} [config.path=front/app/index.html] - source path to the main html file
 * @param {String} [config.output=public/index.html] - destination path for the main html file to be copied
* */
var html = function CruxAngularIndex(config, name) {
  Interface.apply(this, arguments);
  this.name = name + ':index';
  this.config.output = this.config.output.replace('$module', this.config.module).replace('$environment', global['NODE_ENV']);
  this.config.path = this.__fullPath(this.config.path);
};
util.inherits(html, Interface)

html.default = {
  path: 'front/app/index.html',
  output: 'public/index.html'
};

/**
* Watches for changes for the index.html file Once it changes, it will simply copy its content
 * to the target file.
 * @memberof crux.Build.Angular.Index
 * @function watch
 * @param {Function} done - on change callback
* */
html.prototype.watch = function WatchTemplate(done) {
  if(!this.config.path) return done();
  // We first check for the view path.
  fs.watch(this.config.path, { persistent: false }, this.copy.bind(this, null));
  done();
};

/**
* Runs the process, copying the index.html to the public folder.
 * @memberof crux.Build.Angular.Index
 * @function run
 * @param {Function} done - on complete callback
* */
html.prototype.run = function RunTemplates(done) {
  if(!this.config.path) return done();
  try {
    var file = fs.readFileSync(this.config.path, { encoding: 'utf8' });
  } catch(e) {
    // not configured yet.
    return done();
  }
  this.copy(done);
};

/**
* Copies the source html file contents to the target file.
 * @memberof crux.Build.Angular.Index
 * @function copy
 * @param {Function} [done] - on complete callback
* */
html.prototype.copy = function CopyIndex(onCopied) {
  if(this.__active) return;
  this.__active = true;
  var self = this;
  fs.readFile(this.config.path, { encoding: 'utf8' }, function(err, fileContent) {
    if(err) {
      log.warn('Crux.build.angular:index failed to open file %s', self.config.path);
      log.debug(err);
      self.__active = false;
      onCopied && onCopied();
      return;
    }
    // we paste it.
    fs.writeFile(self.config.output, fileContent, { encoding: 'utf8' }, function(err) {
      self.__active = false;
      if(err) {
        log.warn('Crux.build.angular:index failed to write to output: %s', self.config.output);
        log.debug(err);
        onCopied && onCopied();
        return;
      }
      log.trace('Crux.build.angular:index copied %s to %s', self.config.path, self.config.output);
      onCopied && onCopied();
    })
  });
};

module.exports = html;