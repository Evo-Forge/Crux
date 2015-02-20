var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  Kutil = require('../../../../util/util');
var Interface = require('../../_interface');
/*
* This is the angular sub-process task called Angular.index. Its only purpose
* is to watch the index.html file under app/ and copy it to the public folder.
* */

var html = function CruxAngularIndex(config) {
  Interface.call(this, config.extension);
  this.config = config; // This configuration is the config situated under angular.index config in the parent process
  this.name = 'angular:index';
  this.config.output = this.config.output.replace('$module', this.config.module).replace('$environment', global['NODE_ENV']);
  this.config.path = this.__fullPath(this.config.path);
};
util.inherits(html, Interface)

html.default = {
  path: 'front/app/index.html',
  output: 'public/index.html'
};

html.prototype.watch = function WatchTemplate(done) {
  if(!this.config.path) return done();
  // We first check for the view path.
  fs.watch(this.config.path, { persistent: false }, this.copy.bind(this, null));
  done();
};

/*
* Runs the index, copying the index.html to the public folder.
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
      log.trace('Crux.build.angular:index copied html');
      onCopied && onCopied();
    })
  });
};

module.exports = html;