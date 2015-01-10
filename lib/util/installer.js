var exec = require('child_process').exec,
  path = require('path');
/*
* This is the Krux Installer. It is capable of installing with --save npm packages,
* as well as installing the entire krux example app.
* */
var SAVE_PACKAGES = false;
var Installer = function KruxInstaller() {};

/*
* Installs the given npm module and callsback with success or not.
* By default, we will NOT --save the packages.
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
      throw e;
    }
  }
  if(moduleExists) return callback();
  var packageName = name.split('@')[0],
    packageVersion = name.split('@')[1] || 'latest';
  console.info('Krux.installer: Installing npm package "%s" version %s', packageName, packageVersion);
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
      console.warn('Krux.installer: Failed to install npm package "%s": ' + reason, packageName);
      if(!reason) {
        console.error(errMessage);
      }
      return callback(errObj);
    }
    console.info('Krux.installer: npm package "%s" installed.', packageName);
    setTimeout(function() {
      callback();
    }, 10);
  });
};

module.exports = new Installer();