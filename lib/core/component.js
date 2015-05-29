var util = require('util'),
  extend = require('node.extend'),
  path = require('path'),
  EventEmitter = require('events').EventEmitter;

function ComponentClass() {

  var DEFAULTS = {},  // Default values for each component.
      REQUIREMENTS = [],
      LIBRARIES = {}, // Default libraries the component uses.
      registryObj = null;  // This is the registryObj we're using

  /**
   * This is the basic class of a Crux component. Components can be used throughout the
   * application and dependency injection can be added.
   * @namespace crux
   * @class crux.Component
   * @extends events.EventEmitter
   * */
  var component = function CruxComponent(_options) {
    this.name = "CruxComponent";
    this.extendConfig(_options);
    // We now attach the event emitter's attributes in the component, under prototype.
    EventEmitter.call(this.__proto__);
  };

  util.inherits(component, EventEmitter);
  component.prototype.__type = 'CruxComponent';

  /**
   * Extends the given options with the component's default values
   *  @method
   *  @memberof crux.Component
   *  @param {object} options - the options object that will be used to extend the component's default configuration
  * */
  component.prototype.extendConfig = function ExtendConfiguration(_options) {
    if(typeof _options !== 'object' || _options == null) _options = {};
    _options = extend(true, JSON.parse(JSON.stringify(DEFAULTS)), _options);
    this.config = _options;
  };

  /**
   * When a component would like to enforce configuration settings on the developer, the __configuration property
   * is set to true. This will not allow the initialization of the application, unless the component has a configuration object attached to it.
   * @member {boolean} __configuration
   * @memberof crux.Component
   * */
  component.prototype.__configuration = false;


  /**
   * This function is called when the component is initialized. It should be OVERRIDDEN by
   * all components that extend this component.
   * @abstract
   * @memberof crux.Component
   * @param {function} callback - the callback to be called when the component has finished loading.
   * */
  component.prototype.run = function RunComponent(_callback) {
    return _callback();
  };

  /**
  * This is the second function that is called in the creation cycle of a component.<br>
  * The cycle is:<br>
  *   -> new Component() (creates all components)<br>
  *   -> components.init() (initialize all, after creation)<br>
  *   -> components.run() ( runs all components, after init)<br>
  * @abstract
  * @memberof crux.Component
  * */
  component.prototype.init = function InitializeComponent() {};

  /**
   * This will be executed when we want to stop a component. Again, this should be overridden by
   * all components that extend it.
   * @abstract
   * @memberof crux.Component
   * */
  component.prototype.stop = function StopComponent(_callback) {
    throw new Error("Component " + this.name + " failed to implement stop()");
  };

  /**
   * This function is called whenever somebody tries to call registry.get() on a component.
   * If we want to return other than the component's this context, it can be overridden.
   * @abstract
   * @memberof crux.Component
   * @returns {crux.Component}
   * */
  component.prototype.get = function GetComponentData() {
    return this;
  };

  /**
   * A component can be configured to have other components as dependencies, to be loaded prior to the
   * current component. This acts as a getter for the component requirements.
   * @method
   * @memberof crux.Component
   * @returns {string[]}
  * */
  component.prototype.requirements = function GetRequirements() {
    return REQUIREMENTS;
  };

  /**
   * Each component can define its individual npm package requirements to be installed, before
   * the actual initialization of the component. This is required to be
   * overridden by all components that require external dependencies. <br>
   * The packages are installed BEFORE we call their init() method.<br>
   * Each individual package name must have the following format:<br>
   * <b>[name]@[version]</b> - if version is not specified, we will use <b>latest</b.
   * @abstract
   * @memberof crux.Component
   * @returns {string[]}
  * */
  component.prototype.packages = function GetPackages() {
    return [];
  };


  /**
   * Sets/gets the registry object that this component is in.
   * @method
   * @memberof crux.Component
   * @returns crux.Registry
   * @private
   * */
  component.prototype.registry = function SetRegistry(_obj) {
    if(typeof _obj === 'object' && _obj !== null) {
      registryObj = _obj;
      return this;
    }
    return registryObj;
  };

  /**
  * Because we want each component to be aware of other components, we need an injection system, capable
  * of attaching functions from one component inside another component. <br>
   * Components that allow attaching (or injecting) functionality into other components will have to implement the attach() function.
   * @abstract
   * @memberof crux.Component
   * @param {string} methodName - the method we want to attach to a component
   * @param {function} methodFn - the function that will be called after attaching.
  * */
  component.prototype.attach = function AttachComponentFunction(methodName, methodFunction) {
    // REQUIRES IMPLEMENTATION.
  };


  /*
  * Sets/Gets default component data.
  * */
  component.default = function SetDefaultValues(_data) {
    if(typeof _data === 'undefined') return DEFAULTS;
    DEFAULTS = _data;
    return this;
  };

  /*
  * Sets/Gets a given sub-dependent library that the component uses.
  * */
  component.lib = function SetLibrary(name, _object, _isDefault) {
    if(typeof name !== 'string') return null;
    if(typeof _object === 'undefined') return LIBRARIES[name] || null;
    if(_isDefault === true && typeof LIBRARIES[name] !== 'undefined') return this; // we only place the default one.
    LIBRARIES[name] = _object;
    return this;
  };

  /*
  * This will return the given path relative to the app's rootdir
  * */
  component.appPath = function GetAppPath(path1, path2) {
    var base = global['__rootdir'];
    if(typeof path1 !== 'string') {
      throw new Error('CruxComponent.appPath() argument1 is not a string.');
    }
    if(path1.indexOf('__DIRNAME') === 0) {
      base = path1.replace('__DIRNAME','');
      return path.normalize(base);
    }
    var full = path.join(base, path1);
    if(typeof path2 === 'string') {
      full = path.join(full, path2);
    }
    return full;
  };

  /*
   * Registeres a component requirement that has to be run before this.
   * */
  component.require = function RequireComponent(name) {
    if(typeof name === 'undefined') return REQUIREMENTS;
    var names = (name instanceof Array ? name : name.split(' '));
    for(var i=0; i < names.length; i++) {
      if(REQUIREMENTS.indexOf(names[i].toLowerCase()) === -1) {
        REQUIREMENTS.push(names[i].toLowerCase());
      }
    }
    return this;
  };

  /*
  * This is a wrapper function over util.inherits's function. We may or may not add
  * additional code here.
  * */
  component.inherits = function ComponentInheritance(targetPrototype) {
    util.inherits(targetPrototype, component);
    if(typeof targetPrototype.prototype.lib !== 'undefined') {
      console.warn('Warning: component %s uses function lib() which is a reserved one. It will be overridden.', targetPrototype.name);
    }
    targetPrototype.prototype.lib = component.lib;
    return this;
  };

  return component;
};

module.exports = ComponentClass;