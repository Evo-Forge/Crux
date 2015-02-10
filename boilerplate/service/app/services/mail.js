/*
* The base mailer service, marked as a singleton
* */

var mailer = function MailerService() {

};

crux.extends(mailer, crux.Service);

mailer.prototype.init = function Initialize(config) {
  // we now have this.config here.
};

module.exports = new mailer();