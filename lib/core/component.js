var util = require('util'),
  extend = require('node.extend'),
  path = require('path'),
  EventEmitter = require('events').EventEmitter;

function ComponentClass() {

  var DEFAULTS = {},  // Default values for each component.
      REQUIREMENTS = [],
      LIBRARIES = {}, // Default libraries the component uses.
      registryObj = null;  // This is the registryObj we're using

  /*
   * This is the basic class of a Krux component. Components can be used throughout the
   * application and dependency injection can be added.
   * */
  var component = function KruxComponent(_options) {
    this.name = "KruxComponent";
    if(typeof _options !== 'object' || _options == null) _options = {};
    _options = extend(true, JSON.parse(JSON.stringify(DEFAULTS)), _options);
    this.config = _options;
    // We now attach the event emitter's attributes in the component, under prototype.
    EventEmitter.call(this.__proto__);
  };


  util.inherits(component, EventEmitter);
  component.prototype.__type = 'KruxComponent';

  /*
   * Should the component require configuration in order to run, we set this to true. This usually
   * only applies to core components
   * */
  component.prototype.__configuration = false;


  /*
   * This function is called when the component is initialized. It should be OVERRIDDEN by
   * all components that extend this component.
   * */
  component.prototype.run = function RunComponent(_callback) {
    return _callback();
  }

  /*
  * This is the second function that is called in the creation cycle of a component.
  * The cycle is:
  *   -> new Component() (creates all components)
  *   -> components.init() (initialize all, after creation)
  *   -> components.run() ( runs all components, after init)
  * */
  component.prototype.init = function InitializeComponent() {};

  /*
   * This will be executed when we want to stop a component. Again, this should be overridden by
   * all components that extend it.
   * */
  component.prototype.stop = function StopComponent(_callback) {
    throw new Error("Component " + this.name + " failed to implement stop()");
  };

  /*
   * This function is called whenever somebody tries to call registry.get() on a component.
   * Should it return other than this, it must be overridden.
   * */
  component.prototype.get = function GetComponentData() {
    return this;
  };
  /*
  * Returns any previously inserted requirements.
  * */
  component.prototype.requirements = function GetRequirements() {
    return REQUIREMENTS;
  };

  /*
   * Sets/gets the registry object that this component is in.
   * */
  component.prototype.registry = function SetRegistry(_obj) {
    if(typeof _obj === 'object' && _obj !== null) {
      registryObj = _obj;
      return this;
    }
    return registryObj;
  };

  /*
  * Because we want each component to be aware of other components, we need an injection system, capable
  * of attaching functions from one component inside another component. Those that allow attaching will have to
  * implement the attach() function.
  * Arguments:
  *   methodName - the method's name we want to attach to the component.
  *   methodFunction - the callback function that will be called after attaching.
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
  component.lib = function SetLibrary(name, _object) {
    if(typeof name !== 'string') return null;
    if(typeof _object === 'undefined') return LIBRARIES[name] || null;
    LIBRARIES[name] = _object;
    return this;
  };

  /*
  * This will return the given path relative to the app's rootdir
  * */
  component.appPath = function GetAppPath(path1, path2) {
    var base = global['__rootdir'];
    if(typeof path1 !== 'string') {
      throw new Error('KruxComponent.appPath() argument1 is not a string.');
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
    var names = name.split(' ');
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
    return this;
  };

  return component;
};

module.exports = ComponentClass;