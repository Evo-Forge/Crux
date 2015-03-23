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

/**
 * The Crux Service component allows the definition of services under a separate folder, and auto-loading them at runtime.<br>
 * Usually, services defined by the developer should be considered as singleton instances (instantiated once, at require time).
 * Note that this is the base service interface that is exposed to the developer via crux.Service. All user-defined services
 * must extend the base service class.<br>
 * This interface can be extended by adding functionality to it. Once a function is attached to it, it will be available to all
 * user-defined services.<br>
 * <b>Note</b>: Crux service component's only configuration is the path to the service folder. When initialized, it will proceed
 * to require all files under the specified directory, and include those that extend crux.Service.<br>
 * The lifecycle of a service is similar to the one of a crux component:<br>
 *   1. service class is being instantiated (new service())<br>
 *   2. call init() of service instance (if overridden)<br>
 *   3. call run(callback) of service instance (if overridden)<br>
 *   Component configuration:
 *   <pre>
 *    {
 *      "service": {
 *        "path": "app/services", // the file path to the services directory
 *        "myService": {    // When crux loads myService, it looks for its configuration under the "service" config key
 *          "myConfig": 12
 *        },
 *        "myOtherService": false
 *      }
 *    }
 *   </pre>
 * @class crux.Service
 * @extends crux.Component
 * @interface
 * @example
 *  // The service folder path is set to app/services
 *  // Current file: upload.js
 *  var uploadService = function UploadService() {
 *    this.connection = null;
 *  }
 *  crux.extends(upload, crux.Service);
 *  // Function called after crux service component's run() function was called.
 *  uploadService.prototype.init = function Initialize() {
 *  // initialize connection and such.
 *  }
 *  // Other functionality
 *  // We then proceed to export the singleton instance of this service.
 *  module.exports = new uploadService();
* */
var Service = function ServiceComponent() {
  Service.super_.apply(this, arguments);
  this.name = 'service';
};
Component.inherits(Service);

/**
* If a service has special functionality that has to be executed along with the service's configuration,
* it is recommended that it overrides the init() function, as it will be called with the service's configuration<br>
* <b>Note</b>: Service configuration should be placed under "service"."serviceName" in any of the application's configuration files.<br>
* @memberof crux.Service
 * @function init
 * @override
 * @instance
 * @param {Object} config - the service configuration object or an empty object
 * @example
 *  // This is a configuration example for our upload service, using the .js format
 *  module.exports = {
 *    service: {
 *      path: "app/services",
 *      upload: { // this object is passed to the service's init() function.
 *          host: 'localhost'
 *      }
 *    }
 *  };
* */
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

/**
* If a function needs to perform asynchronous tasks before it is fully functional, it should override this function,
 * as it is called <b>after</b> its init() function.<br>
 * At this point, run() will be called with the first argument as the on complete callback.<br>
 * Should it experience any problems, it can call <b>done</b> with an instance of Error as the first argument, at which point
 * the application will be halted.
 *
 * @memberof crux.Service
 * @function run
 * @instance
 * @override
 * @param {Function} done - the on complete callback, to resume the application's execution flow.
* */
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
  this.__proto__[fName] = fCallback;
  return this;
};

/*
* Loads all the services and checks that they are an instance of BaseService.
* */
function loadServices() {
  var paths = (this.config.path instanceof Array) ? this.config.path : [this.config.path];
  var valid = 0,
    self = this;
  _.forEach(paths, function(sPath) {
    var serviceDir = Component.appPath(sPath);
    try {
      var list = Crux.util.readDirectory(serviceDir, 'js', null, true);
    } catch(e) {
      // No services.
      log.warn('Crux.service: No services found in: %s', this.config.path);
      return;
    }
    list.forEach(function(servicePath) {
      var serviceObj = require(servicePath);
      if(serviceObj == null) {
        return;       // We are silently skipping null services.
      }
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
  });
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