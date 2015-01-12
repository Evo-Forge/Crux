/*
* This is the base Crux service. All other services should extend this.
* */

var Interface = function CruxServiceInterface() {

};
Interface.prototype.__type = 'CruxService';

Interface.prototype.init = function InitializeService() {};
Interface.prototype.run = function RunService(done) {
  return done();
};

module.exports = Interface;