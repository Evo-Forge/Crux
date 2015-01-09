/*
* This is the base Crux service. All other services should extend this.
* */

var Interface = function KruxServiceInterface() {

};
Interface.prototype.__type = 'KruxService';

Interface.prototype.init = function InitializeService() {};
Interface.prototype.run = function RunService(done) {
  return done();
};

module.exports = Interface;