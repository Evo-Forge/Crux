/*
* This is our landing route ( / )
* */

module.exports = function init(route) {

  route.root('/');  // this route's path is /

  route
    .get('/', 'Landing')
    .query({
      name: route.type.STRING.default('John')
    })
    .then(function() {
      this.render('views/index', {
        title: 'Landing',
        name: this.query('name')
      });
    });

};