
var _states = {};

/* We place our defineState() function on angular. */
angular.defineState = function DefineState(stateName, stateOptions) {
  if(typeof stateName !== 'string') throw new Error('Invalid state name: ' + stateName);
  if(typeof _states[stateName] !== 'undefined') throw new Error('State already exists: ' + stateName);
  _states[stateName] = stateOptions;
  return angular;
};
angular.getStates = function GetDefinedStates() {
  return _states;
};

var _controllerModule = null,
  _controllerDependencies = [];
/* We pretty much define a custom controller registration */
angular.defineController = function DefineController(name) {
  if(_controllerModule === null) {
    _controllerModule = angular.module('app.controllers', _controllerDependencies);
  }
  return _controllerModule.controller.apply(_controllerModule, arguments);
};