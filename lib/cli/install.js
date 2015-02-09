var crux = require('../../index.js'),
  path = require('path'),
  yaml = require('js-yaml'),
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
  'server': 'Installs the express server',
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
  var BOILERPLATES = [];
  this.components = [];
  for(var i=0; i < this.argv.length; i++) {
    var type = this.argv[i];
    if(type.indexOf('--') !== -1) continue;
    switch(type) {
      case 'scss':
      case 'less':
      case 'angular':
      case 'cjs':
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
};

/*
* Builds the package.json file.
* */
install.prototype.buildPackage = function BuildPackage() {
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
};

/*
* Builds the app.js file that can start the project.
* */
install.prototype.buildApp = function BuildApplicationFile() {
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
    "app.runt(function() {\n});\n";
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
      envConfig = crux.util.extend(moduleConfig.environment, envConfig, true);
    }
    if(typeof moduleConfig.project === 'object') {
      projectConfig = crux.util.extend(moduleConfig.project, projectConfig, true);
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
install.prototype.createStructure = function CreateStructure(dirArray) {
  dirArray.push('/config');
  _.forEach(dirArray, function(fpath) {
    var toCreate = path.normalize(TARGET_DIR + fpath);
    nodefs.mkdirSync(toCreate, 0777, true);
  });

};

/*
* Reads the boilerplate directories of the given sub-folders and creates a map for it.
* */
install.prototype.readBoilers = function ReadBoilers() {
  var MAP = {};
  _.forEach(this.modules, function(comp) {
    var cPath = BOILER_DIR + comp + '/';
    try {
      var files = crux.util.readDirectoryRelative(cPath, 'directory');
    } catch(e) {
      if(e.code === 'ENOENT') return; // we have no boilerplate for the given component
      throw e;
    }
    for(var i=0; i < files.length; i++) {
      var fPath = files[i];
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
      if(targetName.indexOf(sourceName) !== -1) {
        shouldAdd = false;
        break;
      }
    }
    if(shouldAdd) {
      cleanArray.push(sourceName);
    }
  }
  return cleanArray;
};

module.exports = new install();