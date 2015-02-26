/*
 * Documentation generator. This is used only in development to re-generate the api doc site.
 * */
var watch = require('node-watch'),
  fs = require('fs'),
  exec = require('child_process').exec,
  path = require('path');

(function BuildDocumentation() {
  var _config, config;
  // We first load the environment json document.
  try {
    _config = fs.readFileSync(__dirname + '/env.json', { encoding: 'utf8' });
  } catch(e) {
    console.error('Failed to read jsdoc environment configuration.');
    return;
  }
  try {
    config = JSON.parse(_config);
  } catch(e) {
    console.error('Failed to parse jsdoc environment configuration.');
    return;
  } 
  
  var isDocumenting = false,
    jsdocConfigPath = path.normalize(__dirname + '/jsdoc.json');
  function runDocumentation(done) {
    isDocumenting = true;
    var cmd = "jsdoc -t " + config.template + ' -c ' + jsdocConfigPath + ' -d ' + config.output + ' -r --private';
    exec(cmd, {
      cwd: config.root
    }, function(err, stdout, stderr) {
      if(err) {
        console.log(err);
        return;
      }
      console.log('Documentation generated at ' + new Date());
      isDocumenting = false;
      done && done();
    });
  }
  // Once we have the configuration, we first create the jsdoc
  runDocumentation(function() {
    watch(path.normalize(config.root), function(fpath) {
      if(!fpath) return;
      if(fpath.charAt(0) === '.') return;
      if(fpath.indexOf('node_modules') !== -1) return;
      if(fpath.indexOf('example') !== -1) return;
      if(fpath.indexOf('boilerplate') !== -1) return;
      if(isDocumenting) return;
      if(fpath.indexOf('.js') === -1 && fpath.indexOf('.md') === -1) return;
      runDocumentation();
    });
  });  
})();
