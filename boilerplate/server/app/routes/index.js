/*
* This is our landing route ( / )
* */

module.exports = function init(route) {

  route.root('/');  // this route's path is /

  route
    .get('/home', 'Landing')
    .query({
      name: route.type.STRING.default('John')
    })
    .then(function() {
      this.render('home', {
        title: 'Home',
        name: this.query('name')
      });
    });

};