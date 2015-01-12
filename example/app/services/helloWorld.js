
var helloWorld = function HelloWorldService() {};

helloWorld.Extends(crux.Service);

helloWorld.prototype.init = function InitializeHello(config) {
  // Initialize the service with the config.
};
helloWorld.prototype.run = function RunHello(done) {
  log.trace('HelloWorld service executed.');
  done();
};

helloWorld.prototype.sayHello = function SayHello(toName) {
  log.info('Hello %s!', toName);
};

module.exports = new helloWorld();
