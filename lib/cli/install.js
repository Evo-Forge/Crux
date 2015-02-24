var crux = require('../../index.js'),
  path = require('path'),
  yaml = require('js-yaml'),
  exec = require('child_process').exec,
  nodefs = require('node-fs'),
  fs = require('fs');
var INSTALL_PACKAGES = {
  'scss': 'Installs the SCSS build system and a basic web server for serving the generated static content',
  'less': 'Installs the LESS build system and a basic web server for serving the generated content',
  'angular': 'Installs the Angular build system, along with a basic web server for serving the built content',
  'cjs': 'Installs the CommonJS + Templates build system, along with a basic web server',
  'redis': 'Installs the standalone redis component. This is to be used along with at least one other component',
  'mongo': 'Installs the standalone mongodb wrapper. This is to be used along with at least one other component',
  'sql': 'Installs the standalone sql wrapper. This is to be used along with at least one other component.',
  'server': 'Installs the crux http server',
  'static': 'Installs the express static server',
  'service': 'Installs the service-layer component. This is to be used with at least one other component.'
};
/*
* These are the available commands that we can use while using crux <something>
* */
var BOILER_DIR = path.normalize(__dirname + '../../../boilerplate/'),
  TARGET_DIR = path.normalize(process.cwd() + '/');

var install = function InstallTask() {
  this.argv = [];
};

install.prototype.valid = function isValid() {
  var err = 'Usage: crux install [' + _.keys(INSTALL_PACKAGES).join(' | ') + ']';
  if(this.argv.length === 0) {
    return console.log(err);
  }
  for(var i=0; i < this.argv.length; i++) {
    if(this.argv[i].indexOf('--') !== -1) continue;
    if(typeof INSTALL_PACKAGES[this.argv[i]] === 'undefined') {
      return console.log('Install package: ' + this.argv[i] + ' is unavailable.');
    }
  }
  return true;
};

install.prototype.run = function RunTask(_config) {
  this.config = crux.util.extend({
    config: 'json'  // Values are: json,js,yaml
  }, _config, true);
  if(['js','json','yaml'].indexOf(this.config.config) === -1) {
    console.error('Configuration type specified in --config not valid. Values are: js,json,yaml');
    return;
  }
  var BOILERPLATES = [],
    shouldHaveStatic = false;
  this.components = ['log'];
  for(var i=0; i < this.argv.length; i++) {
    var type = this.argv[i];
    if(type.indexOf('--') !== -1) continue;
    switch(type) {
      case 'scss':
      case 'less':
      case 'angular':
      case 'cjs':
        shouldHaveStatic = true;
        if(this.components.indexOf('build') === -1) {
          this.components.push('build');
        }
        type = 'build-' + type;
        break;
      default:
        if(this.components.indexOf(type) === -1) {
          this.components.push(type);
        }
    }
    BOILERPLATES.push(type);
  }
  if(this.components.indexOf('static') === -1 && shouldHaveStatic && this.components.indexOf('server') === -1) {
    this.components.push('static');
    BOILERPLATES.push('static');
  }
  this.modules = BOILERPLATES;
  var DIRECTORY_STRUCTURE = this.readBoilers();
  try {
    this.createStructure(DIRECTORY_STRUCTURE);
  } catch(e) {
    console.error(e);
    return false;
  }
  // We now build up the project configuration.
  if(!this.buildConfig()) return;

  // We now build our app.js
  if(!this.buildApp()) return;

  // We now build our package.json
  if(!this.buildPackage()) return;
  this.installNpm(function(err) {
    if(err) return;
    console.info('Application created. You can now run "node app.js"');
  });
};

/*
* Installing NPM dependencies.
* */
install.prototype.installNpm = function InstallNpm(callback) {
  console.log('Installing npm dependencies');
  exec('npm install', {}, function(err, stdout, stderr) {
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
      console.warn('Crux.installer: Failed to install packages: ' + reason);
      if(!reason) {
        console.error(errMessage);
      }
      return callback(errObj);
    }
    console.info('npm packages installed.');
    setTimeout(function() {
      callback();
    }, 10);
  });

};

/*
* Builds the package.json file.
* */
install.prototype.buildPackage = function BuildPackage() {
  console.log('Creating package.json');
  var pkgConfig = {
    name: 'appName',
    version: '0.0.1',
    scripts: {
      start: 'node app.js'
    },
    dependencies: {
      'node-crux': 'latest'
    },
    main: "app.js",
    description: 'Auto-generate crux application'
  };
  try {
    fs.writeFileSync(path.normalize(TARGET_DIR + '/package.json'), JSON.stringify(pkgConfig, null, 4), { encoding: 'utf8' });
  } catch(e) {
    console.error('Failed to create package.json');
    console.error(e);
    return false;
  }
  return true;
};

/*
* Builds the app.js file that can start the project.
* */
install.prototype.buildApp = function BuildApplicationFile() {
  console.log('Creating app.js');
  var appJsContent = "\n" +
    "var crux = require('node-crux');\n" +
    "var app = crux.app; \n" +
    "crux.globalize(); \n" +
    "app\n" +
    " .path(__dirname)\n" +
    " .projectConfig('config/_project." + this.config.config + "')\n" +
    " .envConfig('config/', '"+this.config.config+"')\n" +
    " .components("+ JSON.stringify(this.components) +", true);\n\n" +
    "app.init();\n" +
    "app.run(function() {\n\n});\n";
  var appPath = path.normalize(TARGET_DIR + '/app.js');
  try {
    fs.writeFileSync(appPath, appJsContent, { encoding: 'utf8' });
  } catch(e) {
    console.error('Failed to create application entry file, in: ' +  appPath);
    console.log(e);
    return false;
  }
  return true;
};

/*
* Builds the full project configuration file for the given modules.
* */
install.prototype.buildConfig = function BuildProjectConfiguration() {
  console.log('Creating project config')
  var projectConfig = {},
    envConfig = {};

  _.forEach(this.modules, function(moduleName) {
    try {
      var moduleConfig = require(path.normalize(BOILER_DIR + '/' + moduleName + '/config.js'));
    } catch(e) {
      if(e.code === 'MODULE_NOT_FOUND') return;
      throw e;
    }
    if(typeof moduleConfig.environment === 'object') {
      envConfig = crux.util.extend(true, moduleConfig.environment, envConfig);
    }
    if(typeof moduleConfig.project === 'object') {
      projectConfig = crux.util.extend(true, moduleConfig.project, projectConfig);
    }
  });
  // Based on the configuration type, we create the _project.json file.
  var projectFile = path.normalize(TARGET_DIR + '/config/_project.' + this.config.config),
    envFile = path.normalize(TARGET_DIR + '/config/development.' + this.config.config),
    projectContent = '',
    envContent = '';

  switch(this.config.config) {
    case 'json':
      projectContent = JSON.stringify(projectConfig, null, 4);
      envContent = JSON.stringify(envConfig, null, 4);
      break;
    case 'js':
      projectContent = 'module.exports = ' + JSON.stringify(projectConfig, null, 4) + ';\n';
      envContent = 'module.exports = ' + JSON.stringify(envConfig, null, 4) + ';\n';
      break;
    case 'yaml':
      projectContent = yaml.safeDump(projectConfig);
      envContent = yaml.safeDump(envConfig);
      break;
  }
  // We're going to create the project file
  try {
    fs.writeFileSync(projectFile, projectContent, { encoding: 'utf8' });
  } catch(e) {
    console.error('Failed to create project configuration in: ' + projectFile);
    console.log(e);
    return false;
  }
  try {
    fs.writeFileSync(envFile, envContent, { encoding: 'utf8' });
  } catch(e) {
    console.error('Failed to create environment configuration in: ' + projectFile);
    console.log(e);
    return false;
  }
  return true;
};

/*
* Creates the given folder structure in the current directory.
* */
install.prototype.createStructure = function CreateStructure(structure) {
  console.log('Creating project structure');
  structure.directories.push('/config');
  _.forEach(structure.directories, function(fpath) {
    var toCreate = path.normalize(TARGET_DIR + fpath);
    nodefs.mkdirSync(toCreate, 0777, true);
  });
  // We now create the files.
  _.forEach(structure.files, function(content, fpath) {
    var toCreate = path.normalize(TARGET_DIR + fpath);
    try {
      if(fpath.indexOf('.empty') !== -1) return;
      // TODO: check for previous files.
      fs.writeFileSync(toCreate, content, { encoding: 'utf8' });
    } catch(e) {
      console.error('Failed to open file ' + fpath);
      console.error(e);
      process.exit();
    }
  });
};

/*
* Reads the boilerplate directories of the given sub-folders and creates a map for it.
* */
install.prototype.readBoilers = function ReadBoilers() {
  var MAP = {},
    TEMPLATE_CONTENT = {};
  _.forEach(this.modules, function(comp) {
    var cPath = path.normalize(BOILER_DIR + comp + '/');
    try {
      var dirs = crux.util.readDirectoryRelative(cPath, 'directory');
    } catch(e) {
      if(e.code === 'ENOENT') return; // we have no boilerplate for the given component
      throw e;
    }
    for(var i=0; i < dirs.length; i++) {
      var fPath = dirs[i];
      fPath = fPath.replace(/\\/g, "/");
      var pathSplit = fPath.split('/');
      var dir = pathSplit[0];
      if(typeof MAP[dir] === 'undefined') MAP[dir] = {};
      var tmp = MAP[dir];
      for(var j=1; j < pathSplit.length; j++) {
        var subDir = pathSplit[j];
        if(typeof tmp[subDir] === 'undefined' || tmp[subDir] == null) {
          tmp[subDir] = {};
        }
        tmp = tmp[subDir];
      }
    }
    // We now read the files in each diretory.
    var files = crux.util.readDirectory(cPath);
    _.forEach(files, function(file) {
      var filePath = file.replace(cPath, '');
      if(filePath.indexOf('.') === -1) return;
      if(filePath.indexOf('.empty') === 0) return;  // we exculde our empty files.
      if(filePath === 'config.js') return;  // we exclude the root config.js
      if(typeof TEMPLATE_CONTENT[filePath] !== 'undefined') return;
      try {
        var fileContent = fs.readFileSync(file, { encoding: 'utf8' });
      } catch(e) {
        console.error('Failed to open file ' + file);
        throw e;
      }
      TEMPLATE_CONTENT[filePath] = fileContent;
    });
  });
  var fileArray = [],
    cleanArray = [];

  function buildArray(obj, _prefix) {
    var keys = _.keys(obj).length,
      prefix = (typeof _prefix === 'string' ? _prefix : "");
    if(keys.length === 0) return;
    for(var key in obj) {
      buildArray(obj[key], prefix + '/' + key);
    }
    if(prefix === '') return;
    fileArray.push(prefix);
  }
  buildArray(MAP);
  for(var i=0; i < fileArray.length; i++) {
    var sourceName = fileArray[i],
      shouldAdd = true;
    for(var j=0; j < fileArray.length; j++) {
      var targetName = fileArray[j];
      if(targetName === sourceName) continue;
      if(targetName.indexOf(sourceName) === 0) {
        shouldAdd = false;
        break;
      }
    }
    if(shouldAdd) {
      cleanArray.push(sourceName);
    }
  }
  return {
    directories: cleanArray,
    files: TEMPLATE_CONTENT
  };
};

module.exports = new install();