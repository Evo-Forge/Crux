
angular.defineState('about', {
  url: '/about',
  templateUrl: 'about',
  controller: 'AboutCtrl'
});


angular.defineController('AboutCtrl', function($scope) {
   $scope.version = "0.1";

});