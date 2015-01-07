var uuid = require('node-uuid');
/*
* This is the request model. When a HTTP request is initiated, it will
* receive its context.
* */
var SERVER = null;
var Request = function KruxServerRequest(req, res, path, serverInstance) {
  SERVER = serverInstance;
  this.req = req;
  this.res = res;
  this.path = path; // this is the full HTTP path
  this.session = req.session;
  this.name = null; // set in the route object
  this.description = null;//set in the route object
  this.namespace = null;//set in the route obj.
};

/*
* Generates and returns uuid
* */
Request.prototype.uuid = function GenerateUUID() {
  return uuid.v4();
};

Request.prototype.isAjax = function IsAjaxRequest() {
  return this.req.xhr;
};

/*
* This will render the given template, adding some helper functions in twig.
* */
Request.prototype.render = function RenderTemplate(name, options) {
  var _opt = {
    session: this.session,
    namespace: this.namespace,
    route: this.name
  };
  if(typeof options === 'object' && options !== null) {
    for(var k in options) {
      _opt[k] = options[k];
    }
  }
  if(name.indexOf(".swig") === -1) name += '.swig';
  this.res.render(name, _opt);
};

Request.prototype.param = function GetParam(name) {
  var p = this.req.param(name);
  if(typeof p === 'undefined') return null;
  return p;
};

/*
* Returns a given key from the querystring or the given default if not found.
* Default defaults to null.
* */
Request.prototype.query = function GetQuery(name, _default) {
  if(typeof name !== 'string') return this.req.query;
  if(typeof this.req.query[name] !== 'undefined') {
    return this.req.query[name];
  }
  return (typeof _default === 'undefined' ? null : _default);
};

/*
* Does the exact same thing as the query() function, but for POST data.
* */
Request.prototype.body = function GetBody(name, _default) {
  if(typeof name !== 'string') return this.req.body;
  if(typeof this.req.body === 'object' && typeof  this.req.body[name] !== 'undefined') {
    return this.req.body[name];
  }
  return (typeof _default === 'undefined' ? null : _default);
};

/*
* Does the exact same thing as body() but searches in HEADER data
* */
Request.prototype.header = function GetHeader(name) {
  if(typeof name !== 'string') return this.req.headers;
  if(typeof this.req.headers === 'object' && typeof this.req.headers[name] !== 'undefined') {
    return this.req.headers[name];
  }
  return null;
};

/*
 * Proxy request over this.service('db').Model()
 * */
Request.prototype.model = function GetModel(name) {
  return this.service('db').Model(name);
};

/*
* Proxy request over this.service('mongo').Schema()
* */
Request.prototype.schema = function GetSchema(name) {
  if(this.service('mongo') === null) return null;
  return this.service('mongo').Schema(name);
}

/*
* Returns an AJAX Error JSON.
* Arguments
*   @code - Error code, defaults to SERVER_ERROR
*   @message - Error message, optional. If message is an object, it will be set as the data.
*   @data - optional, the data we want to attach to the browser.
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
  this.res.setHeader('Content-Type', 'application/json');
  this.res.end(JSON.stringify(resp));
  SERVER.requestEnd(this);
  return this;
};

/*
* Returns an AJAX Success JSON
* Arguments
*   @message - the message we want to return, optional. If message is an object, it will be seen as the data.
*   @data - the data we want to attach on the response. Optional.
* */
Request.prototype.success = function AjaxSuccess(message, data) {
  var resp = {
    type: 'success'
  };
  if(_.isString(message)) {
    resp['message'] = message;
  }
  if(typeof message === 'object' && message !== null) {
    resp['data'] = message;
  } else if(typeof data === 'object' && data !== null) {
    resp['data'] = data;
  }
  this.res.setHeader('Content-Type', 'application/json');
  this.res.end(JSON.stringify(resp));
  SERVER.requestEnd(this);
  return this;
};

/*
* Wrapper for redirect()
* */
Request.prototype.redirect = function Redirect(path, opt) {
  this.req.redirect(path, opt);
  SERVER.requestEnd(this);
  return this;
};

/*
* Function will run a previously-defined security checkpoint. Defined in route.js
* */
Request.prototype.checkpoint = function CheckSecurity(){};



module.exports = Request;