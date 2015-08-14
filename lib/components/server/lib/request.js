var uuid = require('node-uuid'),
  _ = require('underscore');

/**
* When an HTTP connection is initiated, it is captured by express's router, after which it will be passed to the appropiate
 * Crux route. The route's internal functionality will check the prerequisites of the data incoming.<br>
 * If the data is as expected, the route endpoint's then() function is called. At this point, crux Server will create
 * an instance of crux.Server.Request, that will contain the information about the current request.<br>
 * Functionality present in crux.Server.Request will be available in all the route's endpoint definitions. See example.
 *
 * @class crux.Server.Request
 * @memberof crux.Server
 * @example
 *  // We have our regular route definition account.js
 *  module.exports = function(route) {
 *    route
 *      .get('/', 'Get account')
 *      // Once the route decides that the request is valid, it creates the request object and binds it to the endpoint's "then" function.
 *      .then(function() {
 *        console.log("Context?", this);  // => will output that it is an instance of crux.Server.Request
 *        console.log(this.req);  // => the express request object of crux's endpoint request
 *        console.log(this.res);  // => the express response object.
 *        console.log(this.session);  // => the express request's session
 *      })
 *      .then(function() {
 *      });
 *  };
 *
 * @example
 *  // Secondary example that will explain how to extend the request's functionality
 *  var request = crux.Server.Request;
 *  request.prototype.sayHello = function SayHello() {
 *    return this.success("Hello world from extended request!");
 *  }
 *  // Once we do this and require the file (either via config.extends or manually), this functionality is added to every request.
 *  // WARNING: before actually extending the request, it is required to initialize the crux server component first.
* */
var SERVER = null;

var Request = function CruxServerRequest(req, res, path, serverInstance) {
  if(!SERVER) {
    SERVER = serverInstance;
  }
  /**
   * The Express's request object, associated to this HTTP request.
   * @memberof crux.Server.Request
   * @type {express.Request}
   * @name crux.Server.Request.req
   * */
  this.req = req;
  /**
   * The Express's response object, associated to this HTTP request.
   * @memberof crux.Server.Request
   * @type {express.Response}
   * @name crux.Server.Request.res
   * */
  this.res = res;
  /**
   * The full HTTP path of the request.
   * @memberof crux.Server.Request
   * @type {String}
   * @name crux.Server.Request.path
   * */
  this.path = path; // this is the full HTTP path
  /**
   * The Express's session object, associated to this HTTP request.
   * @memberof crux.Server.Request
   * @type {express.Session}
   * @name crux.Server.Request.session
   * */
  this.session = req.session;
  /**
  * The route endpoint's generated name
   * @memberof crux.Server.Request
   * @tpye {String}
   * @name crux.Server.Request.name
  * */
  this.name = null; // set in the route object
  this.description = null;//set in the route object
  /**
   * The route endpoint's namespace
   * @memberof crux.Server.Request
   * @tpye {String}
   * @name crux.Server.Request.namespace
   * */
  this.namespace = null;//set in the route obj.
};

/**
* Utility function that uses node-uuid to generate an unique identifier
 * @memberof crux.Server.Request
 * @instance
 * @function uuid
 * @returns {String}
* */
Request.prototype.uuid = function GenerateUUID() {
  return uuid.v4();
};

/**
* Verifies if the HTTP request is ajax or not. By default, if its content-type header is application/json, it is set to true<br/>
 * Otherwise, it checks for express's <b>xhr</b> property of the request.
 * @memberof crux.Server.Request
 * @function isAjax
 * @instance
 * @returns {Boolean}
* */
Request.prototype.isAjax = function IsAjaxRequest() {
  try {
    if(this.req.headers && this.req.headers['content-type'].indexOf('application/json') !== -1 || this.endpoint.__isAjax) {
      return true;
    }
  } catch(e) {}
  if(typeof this._isAjax === 'boolean') return this._isAjax;
  if(!this.req) {
    return false;
  }
  if(this.req.isAjax) return this.req.isAjax;
  if(this.req.method === 'POST' || this.req.method === 'PUT') return true;
  var caller = this.header('x-requested-with');
  if(caller !== null && caller.toLowerCase().indexOf('xmlhttp') !== 0) {
    return true;
  }
  return this.req.xhr;
};

/**
 * This will render the given template and return it to the client, closing the HTTP connection.
 * The view path is relative to the crux server's view path.
 * @memberof crux.Server.Request
 * @function render
 * @instance
 * @param {String} name - the view file's name, relative to the views folder
 * @param {Object} [options] - additional data that will be available at the view level
* */
Request.prototype.render = function RenderTemplate(name, options) {
  var _opt = {
    session: this.session,
    namespace: this.namespace,
    route: this.name,
    isAjax: this.isAjax(),
    now: Date.now(),
    endpoint: this.endpoint
  };
  if(typeof options === 'object' && options !== null) {
    for(var k in options) {
      _opt[k] = options[k];
    }
  }
  var viewExt = SERVER.config.views.extension;
  if(viewExt.charAt(0) !== '.') viewExt = '.' + viewExt;
  if(name.indexOf(viewExt) === -1 && name.indexOf('.html') === -1) name += viewExt;
  this.__clearClose();
  this.res.render(name, _opt);
  delete _opt;
  SERVER.requestEnd(this);
};

/**
 * Utility function that returns the given url parameter from the request, or a default value
 * @memberof crux.Server.Request
 * @function param
 * @instance
 * @param {String} name - the parameter's name
 * @param {Any} [default=null[ - the default value to be returned, if it is not present.
 * */
Request.prototype.param = function GetParam(name, _default) {
  if(typeof name !== 'string') return this.req.params;
  if(typeof this.req.params[name] === 'undefined') return (typeof _default === 'undefined' ? null : _default);
  return this.req.params[name];
};

/**
 * Utility function that returns the given query parameter from the request, or a default value
 * @memberof crux.Server.Request
 * @function query
 * @instance
 * @param {String} name - the query key's name
 * @param {Any} [default=null[ - the default value to be returned, if it is not present.
 * */
Request.prototype.query = function GetQuery(name, _default) {
  if(typeof name !== 'string') return this.req.query;
  if(typeof this.req.query[name] !== 'undefined') {
    return this.req.query[name];
  }
  return (typeof _default === 'undefined' ? null : _default);
};

/**
 * Utility function that returns the given body parameter from the request, or a default value
 * @memberof crux.Server.Request
 * @function body
 * @instance
 * @param {String} name - the body key's name
 * @param {Any} [default=null[ - the default value to be returned, if it is not present.
 * */
Request.prototype.body = function GetBody(name, _default) {
  if(typeof name !== 'string') {
    // We will try and perform a cleaned-up version of the request body parameters. If we find any body params previously set by the route chain, we return only them.
    if(this.endpoint.parameters.body.length === 0) {
      return this.req.body;
    }
    var _body = {};
    for(var i= 0, len = this.endpoint.parameters.body.length; i < len; i++) {
      var pName = this.endpoint.parameters.body[i].name;
      _body[pName] = this.req.body[pName];
    }
    return _body;
  }
  if(typeof this.req.body === 'object' && typeof  this.req.body[name] !== 'undefined') {
    return this.req.body[name];
  }
  return (typeof _default === 'undefined' ? null : _default);
};

/**
 * Utility function that returns the given header parameter from the request, or a default value
 * @memberof crux.Server.Request
 * @function header
 * @instance
 * @param {String} name - the header's name
 * @param {Any} [default=null[ - the default value to be returned, if it is not present.
 * */
Request.prototype.header = function GetHeader(name) {
  if(typeof name !== 'string') return this.req.headers;
  if(typeof this.req.headers !== 'object') {
    return null;
  }
  var _header = (this.req.headers[name] || this.req.headers[name.toLowerCase()]) || null;
  if(!_header) return null;
  return _header;
};

/*
 * Registers an on Close event on the request. So, whenever the request is closed by the client
 * we fire the cb.
 * */
Request.prototype.onClose = function OnClose(cb) {
  this.__onClose = cb;
  this.req.once('close', this.__onClose);
};
/*
 * If we had a previous onClose callback, we clear it.
 * */
Request.prototype.__clearClose = function ClearCloseEvent() {
  if(typeof this.__onClose !== 'function') return;
  this.req.removeListener('close', this.__onClose);
  this.__onClose = null;
};

/**
 * This function is used to signal the client that an error has occurred. It will perform an isAjax check before sending.<br>
 * If it is an ajax request, it will return a JSON object, otherwise, it will render the appropriate error template (404, 500,etc)
 *
 * @memberof crux.Server.Request
 * @function error
 * @instance
 * @param {String|Error} code - the error code (upper-case) or an error object.
 * @param {String} [message] - the error message, used with code=string
 * @param {Any} [data] - additional error information to be sent.
 * @example
 *  // The error JSON object has the following structure
 *  this.error("ERROR_CODE", "An error occurred", { additional: "data" });
 *  // => converts to
 *  var json = {
 *    type: 'error',
 *    code: 'ERROR_CODE',
 *    message: 'An error occurred',
 *    data: {
 *      additional: "data"
 *    }
 *  }
 *
* */
Request.prototype.error = function AjaxError(_code, message, data) {
  var code = 'SERVER_ERROR';
  if(_.isObject(_code)) {
    if(_.isString(_code.code)) {
      code = _code.code;
    }
    if(_.isString(_code.message)) {
      message = _code.message;
    }
    if(typeof _code.data !== 'undefined') {
      data = _code.data;
    }
    if(_code instanceof TypeError) {
      log.debug(_code);
    }
  } else {
    code = _code;
  }
  if(_code instanceof TypeError || _code instanceof RangeError) {
    code = 'SERVER_ERROR';
    message = 'An unexpected error occurred.';
  } else {
    if(_code instanceof Error) {
      if(typeof _code.code === 'string') {
        code = _code.code;
        message = _code.message;
      } else {
        code = _code.message;
      }
    }
  }
  var resp = {
    type: 'error',
    code: code
  };
  if(_.isString(message)) {
    resp['message'] = message;
  }
  if(typeof message === 'object' && message !== null) {
    resp['data'] = message;
  } else if(typeof data === 'object' && data !== null) {
    resp['data'] = data;
  }
  if(typeof this.requestId === 'string') {
    resp['request_id'] = this.requestId;
  }
  if(this.isAjax()) {
    return this.json(resp);
  }
  var err = new Error(resp.message || resp.code);
  err.data = resp.data;
  err.code = resp.code;
  err.custom = true;
  SERVER.serverError(err, this.req, this.res);
  return;
};

/**
* The function will stringify the given object and set the response's content type to application/json.
* This is an utility function to send unconventional data to the client.<br/>
 * Note: once this function is called, the HTTP request will be terminated.
 * @memberof crux.Server.Request
 * @function json
 * @instance
 * @param {Any} data - the  data to be sent.
* */
Request.prototype.json = function ReturnJson(data) {
  this.__clearClose();
  if(!this.res._headerSent) {
    this.res.setHeader('Content-Type', 'application/json');
  }
  this.res.end((typeof data === 'string' ? data : JSON.stringify(data)));
  SERVER.requestEnd(this);
  return this;
};

/**
* This function will simply output the given HTML content to the client by placing the content-type to text/html.
 * This is a wrapper function over this.res.send(), as it clears the internal route processing system.
 * @memberof crux.Server.Request
 * @function send
 * @instance
 * @param {String} html - the html to be sent to the client.
* */
Request.prototype.send = function SendHtml(html) {
  this.__clearClose();
  if(!this.res._headerSent) {
    this.res.setHeader('Content-Type', 'text/html');
  }
  this.res.end(html);
  SERVER.requestEnd(this);
  return this;
};

/**
 * This function is used to signal the client that an operation or the request has successfully terminated.
 * Note: if the message argument is in full caps, we add a code to the response, otherwise it is treated as a message.
 *
 * @memberof crux.Server.Request
 * @function success
 * @instance
 * @param {String} message - additional response message, or the success code if full upper-case
 * @param {Any} [data] - additional information to be sent.
 * @example
 *  // The success JSON object has the following structure
 *  var accounts = [{
 *    id: "1",
 *    name: "John"
 *  }];
 *  this.success("Operation terminated", accounts);
 *  // => converts to
 *  var json = {
 *    type: 'success',
 *    message: 'An error occurred',
 *    data: [{
 *      id: "1",
 *      name: "John"
 *    }]
 *  }
 *
 * */
Request.prototype.success = function AjaxSuccess(message, data) {
  var resp = {
    type: 'success'
  };
  if(typeof this.requestId === 'string') {
    resp['request_id'] = this.requestId;
  }
  if(_.isString(message)) {
    if(message.toUpperCase() === message) {
      resp['code'] = message;
      if(_.isString(data)) {
        resp['message'] = data;
      }
    } else {
      resp['message'] = message;
    }
  }
  if(typeof message === 'object' && message !== null) {
    resp['data'] = message;
  } else if((typeof data === 'object' && data !== null) || (typeof data === 'string' && data !== '')) {
    resp['data'] = data;
  }
  this.json(resp);
};

/**
* Utility wrapper over express's request.redirect
 *
 * @memberof crux.Server.Request
 * @function redirect
 * @instnace
 * @param {String} path - the HTTP url or path to redirect the client to.
* */
Request.prototype.redirect = function Redirect(path) {
  this.res.redirect(path);
  this.__clearClose();
  SERVER.requestEnd(this);
  return this;
};


/*
* Function will run a previously-defined security checkpoint. Defined in route.js
* */
Request.prototype.checkpoint = function CheckSecurity(){};

/*
* Destroys the request object.
* */
Request.prototype.destroy = function DestroyRequest() {
  var self = this;
  function doDestroy() {
    delete self.req;
    delete self.res;
    delete self.session;
    delete self.namespace;
    _t = null;
    doDestroy = null;
  }
  var _t = setTimeout(doDestroy, 2000);
};

module.exports = Request;