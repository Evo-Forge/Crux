
angular.defineState('landing', {
  url: '/',
  templateUrl: 'home',
  controller: 'HomeCtrl'
});

angular.defineController('HomeCtrl', function($scope) {
  $scope.time = new Date();
});
