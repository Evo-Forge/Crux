/*
* Loading up the Crux module and starting configuration.
* */
var crux = require('../index.js');  // Turn this to require('node-crux');

var app = crux.app;

app
  .globalize()
  .path(__dirname)
  .projectConfig('config/_project.yml')
  .appConfig('config/dev.js')
  .components(['log', 'build', 'service', 'server']);


app.init();


if(NODE_ENV === 'dev') {
  app.component('build').set('autoWatch', true);
}

app.run(function() {
  log.info('Example application running. Access it on %s', app.component('server').url);
});
