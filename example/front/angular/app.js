/*
* Demo angular app
* */
var dependencies = ['ui.router', 'app.controllers'];
var app = angular.module('app', dependencies);

app.config(function($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.otherwise("/");
  var _states = angular.getStates();
  for(var stateName in _states) {
    $stateProvider.state(stateName, _states[stateName]);
  }
});


app.run(function($rootScope) {

});