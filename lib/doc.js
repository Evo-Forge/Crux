/*
* This is the documentation utility.
* */
var watch = require('node-watch'),
  exec = require('child_process').exec,
  path = require('path');

//var JSDOC_EXEC = 'jsdoc -t ./node_modules/ink-docstrap/template ./lib ./index.js ./README.md -c ./lib/jsdoc.json -r -d ./docs/';
var JSDOC_EXEC = 'jsdoc  ./lib ./index.js ./README.md -r -d ./docs/ --private';
var isDocumenting = false;
function runDoc() {
  isDocumenting = true;
  exec(JSDOC_EXEC, function(err, stdout, stderr) {
    isDocumenting = false;
    if(err) {
      console.log(err);
      return;
    }
    console.log('Doc generated at ' + new Date());
  });
}
watch(path.normalize(__dirname + '/../'), function(fpath) {
  if(fpath.indexOf('node_modules') !== -1) return;
  if(fpath.indexOf('docs') !== -1) return;
  if(fpath.indexOf('example') !== -1) return;
  if(fpath.indexOf('boilerplate') !== -1) return;
  if(fpath && fpath.indexOf('.js') !== -1 && !isDocumenting) {
    runDoc();
  }
});
console.log('Watching for documentation.');
runDoc();