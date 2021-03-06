var exec = require('child_process').exec,
  path = require('path');
/*
* This is the Crux Installer. It is capable of installing with --save npm packages,
* as well as installing the entire crux example app.
* */
var SAVE_PACKAGES = false;

/**
 * Custom installer that will install the given npm module and calls back with success or not.
 * By default, it will NOT --save the packages.<br>
 * This is a <b>singleton</b> class intantiated at runtime
 * @name crux.util.install
 * @static
 * @class
 * */
var Installer = function CruxInstaller() {};

/**
 * Installs the given npm module name.
 * @name crux.util.install.npm
 * @memberof crux.util.install
 * @function
 * @param {string} name - the npm module name
 * @param {function} fn - the callback function to call after the module is installed
 * @param {boolean} isRootPath - if specified, we will use the project's root path in stead of crux's path
 * */
Installer.prototype.npm = function InstallNpmModule(name, callback, isRootPath) {
  var moduleExists = false;
  try {
    var moduleName = name.split('@')[0];
    // We have the dependency, we continue.
    var depPackage = require(moduleName);
    moduleExists = true;
  } catch(e) {
    if(e.code !== 'MODULE_NOT_FOUND') {
      return callback(e);
    }
  }
  if(moduleExists) return callback();
  var packageName = name.split('@')[0],
    packageVersion = name.split('@')[1] || 'latest';
  console.info('Crux.installer: Installing npm package "%s" version %s', packageName, packageVersion);
  var cmd = 'npm install ' + packageName + '@' + packageVersion,
    _opt = {
      cwd: global['__rootdir']
    };
  if(isRootPath === false) {
    _opt['cwd'] = path.normalize(__dirname + '/../../');
  }
  if(SAVE_PACKAGES) {
    cmd += ' --save';
  }
  exec(cmd, _opt, function(err, stdout, stderr) {
    var errMessage = null;
    if(err) {
      errMessage = err.message;
    } else {
      if(typeof stderr === 'string' && stderr.indexOf('npm ERR') !== -1) {
        errMessage = stderr;
      }
    }
    if(errMessage) {
      var reason = "",
        errObj = new Error('NPM_ERROR');
      if(errMessage.indexOf('404 Not Found')) {
        reason = 'Package not found.';
        errObj.message = 'PACKAGE_NOT_FOUND';
      }
      console.warn('Crux.installer: Failed to install npm package "%s": ' + reason, packageName);
      if(!reason) {
        console.error(errMessage);
      }
      return callback(errObj);
    }
    console.info('Crux.installer: npm package "%s" installed.', packageName);
    setTimeout(function() {
      callback();
    }, 10);
  });

};

module.exports = new Installer();