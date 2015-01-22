var path = require('path'),
  Crux = require('../../../index'),
  async = require('async'),
  Component = Crux.Component,
  BaseService = require('./_interface');
/*
* This is the Crux Service component. It allows service registration and access
* throughout the application.
* */

Component.default({
  path: 'app/services'    // Service path location
});
Component.require('log');

var RegisteredServices = {};

var Service = function ServiceComponent() {
  Service.super_.apply(this, arguments);
  this.name = 'service';
};
Component.inherits(Service);

Service.prototype.init = function InitializeServices() {
  var self = this;
  loadServices.call(this);
  function getService(name) {
    return self.get(name);
  }
  // We attach our services to our own services and the http server, if available.
  this.registry().attachTo('service server io', 'service', getService);
  // If we have the server component, we register the render() function in each service.
  if(this.registry().has('server')) {
    var compObj = this.registry().get('server');
    function doRender(path, _vars, _cb) {
      return compObj.render(path, _vars, _cb);
    }
    this.registry().attachTo('service', 'render', doRender);
  }
};

Service.prototype.run = function RunServices(done) {
  var _calls = [];
  _.forEach(RegisteredServices, function(servObj, servName) {
    _calls.push(function(onRun) {
      servObj.run(onRun);
    })
  });
  async.series(_calls, done);
};

Service.prototype.attach = function AttachMethod(fName, fCallback) {
  _.forEach(RegisteredServices, function(serviceObj) {
    serviceObj[fName] = fCallback;
  });
  return this;
};

/*
* Loads all the services and checks that they are an instance of BaseService.
* */
function loadServices() {
  var serviceDir = Component.appPath(this.config.path);
  try {
    var list = Crux.util.readDirectory(serviceDir, 'js', null, true);
  } catch(e) {
    // No services.
    log.warn('Crux.service: No services found in: %s', this.config.path);
    return;
  }
  var valid = 0,
    self = this;
  list.forEach(function(servicePath) {
    var serviceObj = require(servicePath);
    if(typeof serviceObj === 'function') {  // If it was not an instance, we create it.
      serviceObj = new serviceObj();
    }
    if(!_.isCruxService(serviceObj)) {
      var fileName = servicePath.replace(serviceDir, '');
      fileName = fileName.substr(1, fileName.length-1);
      log.warn('Crux.service: %s does not extend Crux.Service. Skipping', fileName);
      return;
    }
    var _routes = path.normalize(serviceDir).replace(/\//g, ".").replace(/\\/g, '.'),
      _target = path.normalize(servicePath).replace(/\//g, ".").replace(/\\/g, '.');
    var serviceName;
    if(_.isString(serviceObj.__proto__['serviceName'])) {
      serviceName = serviceObj.__proto__['serviceName'];
    } else if(_.isString(serviceObj.name)) {
      serviceName = serviceObj.name;
    } else {
      serviceName = _target.replace(_routes, "").replace(".js", "");
      if(serviceName.charAt(0) === '.') {
        serviceName = serviceName.substr(1);
      }
    }
    valid++;
    RegisteredServices[serviceName] = serviceObj;
    var serviceConfig = (typeof self.config[serviceName] !== 'undefined' ? self.config[serviceName] : {});
    serviceObj.name = serviceName;
    serviceObj.init(serviceConfig);
  });
  if(valid === 0) {
    log.warn('Crux.service: No valid services found in: %s', this.config.path);
  }
}

/*
* Manually adds a given object as a service.
* */
Service.prototype.__add = function AddService(name, obj) {
  if(typeof name !== 'string') return false;
  if(typeof obj !== 'object' || obj === null) return false;
  RegisteredServices[name] = obj;
  return this;
};

Service.prototype.get = function GetService(name) {
  if(typeof RegisteredServices[name] === 'undefined') return null;
  return RegisteredServices[name];
};

Service.prototype.stop = function StopService() { };

module.exports = Service;