var uuid = require('node-uuid');
/*
* This is the request model. When a HTTP request is initiated, it will
* receive its context.
* */
var SERVER = null;
var Request = function CruxServerRequest(req, res, path, serverInstance) {
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
  var viewExt = SERVER.config.views.extension;
  if(viewExt.charAt(0) !== '.') viewExt = '.' + viewExt;
  if(name.indexOf(viewExt) === -1 && name.indexOf('.html') === -1) name += viewExt;
  this.__clearClose();
  this.res.render(name, _opt);
};

/*
 * Does the exact same thing as queyr() function but for URL param data.
 * */
Request.prototype.param = function GetParam(name, _default) {
  if(typeof name !== 'string') return this.req.params;
  if(typeof this.req.params[name] === 'undefined') return (typeof _default === 'undefined' ? null : _default);
  return this.req.params[name];
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
  delete this.__onClose;
};

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
  if(typeof this.requestId === 'string') {
    resp['request_id'] = this.requestId;
  }
  if(this.isAjax()) return this.json(resp);
  var err = new Error(resp.message || resp.code);
  err.data = resp.data;
  err.code = resp.code;
  err.custom = true;
  return SERVER.serverError(err, this.req, this.res);
};

/*
* Returns a plain json object
* */
Request.prototype.json = function ReturnJson(data) {
  this.__clearClose();
  this.res.setHeader('Content-Type', 'application/json');
  this.res.end(JSON.stringify(data));
  SERVER.requestEnd(this);
  return this;
};

/*
* Returns an AJAX Success JSON
* Arguments
*   @message - the message we want to return, optional. If message is an object, it will be seen as the data.
*   @data - the data we want to attach on the response. Optional.
*  NOTE:
*   if the message is in full caps, we add a code to the response, otherwise it's the message.
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
  return this;
};

/*
* Wrapper for redirect()
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



module.exports = Request;