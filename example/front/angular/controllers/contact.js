
angular.defineState('contact', {
  url: '/contact',
  templateUrl: 'contact',
  controller: 'ContactCtrl'
});

angular.defineController('ContactCtrl', function($scope, $http) {
  $scope.time = new Date();
  $scope.form = {
    name: '',
    email: '',
    phone: '',
    message: ''
  };

  $scope.sendContact = function Send() {
    console.log($scope.form);
    if(!$scope.form.name || !$scope.form.email || !$scope.form.message) {
      return alert('Please fill in the form');
    }
    $http.post('/contact', $scope.form)
      .success(function(d) {
        if(d.type === 'error') {
          alert('Error: ' + d.code + ': ' + d.message);
        }
        alert('Sent: ' + d.message);
      })
      .error(function(err, status) {
        alert('Error occurred.');
        console.log("ERR", err);
      });
  }
});
