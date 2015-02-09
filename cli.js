#!/usr/bin/env node
var COMMANDS = ['install'],
  arg = process.argv.slice(2);

(function() {
  var task = arg[0];
  arg = arg.slice(1);
  if(COMMANDS.indexOf(task) === -1) {
    console.log("Usage: crux ["+COMMANDS.join(', ')+"]");
    return;
  }
  var task = require('./lib/cli/' + task);
  task.argv = arg;
  if(!task.valid()) {
    return;
  }
  var config = {};
  for(var i=0; i < arg.length; i++) {
    if(arg[i].indexOf('--') === -1) continue;
    var cfg = arg[i].replace('--',''),
      key = cfg.split('=')[0],
      val = cfg.split('=')[1] || null;
    config[key] = val;
  }
  task.run(config);
})();