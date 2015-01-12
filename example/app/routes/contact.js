/*
* This is the contact page processing.
* */

module.exports = function InitRoute(Route) {

  Route.namespace('contact').root('/');

  /* We define a custom security point in the contact namespace.
  * After it has been defined, it can be executed from any route through "contact:verifyEmail"
  * */
  Route
    .security('verifyEmail',' Verifies the given email.')
    .body({
      email: Route.type.EMAIL
    })
    .then(function() {
      if(this.body('email') === 'admin@crux.com') {
        return this.fail('NOT_ADMIN', 'You cannot be the admin! Really now?');
      }
      this.pass('notAdmin');
    });

  Route
    .post('/contact', 'Contact processing page')
    .body({
      name: Route.type.STRING,
      email: Route.type.EMAIL,
      phone: Route.type.STRING.default(null),
      message: Route.type.STRING
    })
    .checkpoint('contact:verifyEmail')
    .then(function(userType) {
      log.info('Got a contact request from a %s', userType);
      this.service('helloWorld').sayHello(this.body('name'));
      log.info(this.body());
      this.success('Message will be sent shortly!');
    });
};