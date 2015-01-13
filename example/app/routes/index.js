/*
* This is the landing index page.
* */
module.exports = function InitRoute(Route) {

  Route.namespace('landing').root('/')



  Route
    .get('/', 'Landing page with angular.js mini app')
    .query({
      name: Route.type.STRING.default('John')
    })
    .then(function() {
      this.render('landing', {
        name: this.query('name')
      });
    });

};