/*
 * This is the HTTP Wrapper server over Express.
 * All express-related modules and functionality should be encapsulated here.
 * */

var express,
  bodyParser,
  http = require('http'),
  https = require('https'),
  fs = require('fs'),
  path = require('path'),
  swig,
  requestCounter = 0,
  routeCount = 0,
  errorViews = {
    '500': path.normalize(__dirname + '/views/500.swig'),
    '404': path.normalize(__dirname + '/views/404.swig')
  };  // hash of errorCode: templatePath


var Crux = require('../../../index'),
  Component = Crux.Component,
  ViewUtils = require('./lib/util.js'),
  HttpRoute = require('./lib/route'),
  HttpRequest = require('./lib/request'),
  HttpValidations = require('./lib/validations'),
  RequestChain = require('./lib/chain');


/*
* DEFAULT HTTP SERVER CONFIGURATION.
* */
Component.default({
  ssl: false, // Should we use http or https
  certificates: { // Used with ssl: true
    //  TODO
  },
  debug: true,
  url: null,  // this is the URL that will be set by the init() function, if not previously set
  host: 'localhost',
  port: 3000,
  basePath: '', // The default BASE http path that we're going to use.
  ip: '0.0.0.0',
  request: {
    mocking: false, // Allow or not request mocking.
    mockPath: '/mock',  // Mock request will then transform from /api/auth to /mock/api/auth
    sesskey: 'sid', // Session key id
    limit: 5000, // Request max size in chars.
    parameters: 50,  // Maximum number of parameters in request.
    secret: '2312423asdf',
    cors: false,          // Should we allow CORS requests. By default, set to false
    geolocation: false    // Should we include ip-based geolocation? The module we use is geoip-lite. If set to a string, we will use that package.
  },
  render: 'swig',               // View rendering system.
  path: {                       // Paths relative to the app's rootdir
    routes: 'app/routes/',      // Route folder location
    views: 'app/views/',        // Views folder location
    public: 'public/',          // Public folder location
    docs: 'docs'                // Doc folder location
  },
  views: {
    cache: false,
    extension: 'swig',
    errors: 'errors/'           // Error folder containing app error views.
  },
  docs: {
    template: '__DIRNAME' + __dirname + '/views/doc.swig'
  },
  express: { // Optional Express-level configurations passed directly to it via set().
    'x-powered-by': false
  }
});

Component.require('log');

// TODO: include request mocking in documentation
/**
 * The main crux.Server component class holds up all required functionality to make the HTTP Server work.<br>
 * This component uses <b>express 3</b> as its web server along with its built-in router mechanism.<br>
 * It uses <b>swig</b> as its rendering engine and <b>body-parser</b> for data processing.<br/>
 * By default, it uses express's <b>MemoryStore</b> as its session store, but can be easily changed by calling server.lib(sessionStore)<br>
 *
 * @class crux.Server.Server
 * @memberof crux.Server
 * @extends crux.Component
 * @param {Object} [config] - The server configuration object
 * @param {Boolean} [config.debug=true] - Start the server in debug mode. While in this state, all requests are logged via log.trace
 * @param {String} [config.url=null] - The full URL of the HTTP server. If not specified, it will be dynamically set when the server starts, using the hostname, port, basePath and ssl options
 * @param {String} [config.host=localhost] - the hostname of the HTTP server.
 * @param {String} [config.port=3000] - the default port to listen on
 * @param {String} [config.basePath=] - the base path to be used in the server. This is used when url is dynamically created, but also in various request helper functions
 * @param {String} [config.ip=0.0.0.0] - the IP to bind the server to
 * @param {String} [config.render=swig] - the default rendering engine for views. Currently only swig supported

 * @param {Object} [config.path] - settings related to file paths of different components the HTTP server will use.
 * @param {String} [config.path.routes=app/routes] - the default path to the folder containing the route definition files.
 * @param {String} [config.path.views=app/views] - the default path to the folder containing the application's views
 * @param {String} [config.path.public=public/] - the default path to the public folder. <b>Note</b>: files present here will be publicly accessible.
 * @param {String} [config.path.docs=docs/] - the default path for auto-generated route documentation, currently experimental.

 * @param {Object} [config.views] - settings related to the application's view engine.
 * @param {Boolean} [config.views.cache=false] - enables or disables view caching. Set this to <b>true</b> while in production for performance boosts
 * @param {String} [config.views.extension=swig] - default view extension, currently only swig supported
 * @param {String} [config.views.errors=errors/] - folder containing views tied to HTTP Status codes (404, 500, etc) relative to the server's views folder

 * @param {Object} [config.request] - HTTP Request-related settings
 * @param {String} [config.request.sesskey] - the express session key to be used
 * @param {Number} [config.request.limit=5000] - the maximum number of characters a POST or PUT request may contain in its BODY. This is to prevent DDOS
 * @param {Number} [config.request.parameters=50] - the maximum number of BODY parameters present in the request
 * @param {String} [config.request.secret] - the session secret key
 * @param {Boolean} [config.request.cors=false] - enables or disables Cross-Origin Requests, by adding or removing Access-Controll headers
 * @param {Boolean} [config.request.geolocation=false] - If set to true, it will use <b>geoip-lite</b> as a dependency to pinpoint the IP geolocation information, via getIp() in the request object.

 * @param {Object} [config.express] - other express-related options that will be passed to the express application. See {@link http://expressjs.com/3x/api.html}
* */
var Server = function CruxServerComponent() {
  Server.super_.apply(this, arguments);
  this.name = 'server';
  this.routes = {};
  this.checkpoints = {};
  this.app = null;
  this.__app_configures = [];  // the configure() callbacks.
};
Component.inherits(Server);
Server.prototype.__configuration = true;

/**
 * Defines the npm packages the crux server component will use and install at first run.
 * @memberof crux.Server.Server
 * @function packages
 * @instance
 * @override
 * @returns String[]
 * */
Server.prototype.packages = function GetPackages() {
  var list = ['swig@1.4.2', 'express@3.3.4', 'body-parser@1.11.x', 'request@2.45.x'];
  if(this.config.request.geolocation === true) {
    list.push('geoip-lite@1.1.x');
  }
  return list;
};

/**
* Initializes the server component. At this point, it will create the express application, build the server's full URL and
 * initiate express's session store.
 * @memberof crux.Server.Server
 * @function init
 * @instance
 * @override
* */
Server.prototype.init = function InitializeServer() {
  express = require('express');
  bodyParser = require('body-parser');
  swig = require('swig');
  /*
   * These are default components that the http server uses.
   * */
  Component.lib('sessionStore', express.session.MemoryStore, true);
  this.app = express();
  // We first generate the URL of the server. (protocol://hostname/<basePath>)
  if(this.config.url == null) {
    var url = (this.config.ssl ? 'https://' : 'http://') + this.config.host;
    if(this.config.port !== 80 && this.config.port !== 443) {
      url += ':' + this.config.port;
    }
    if(this.config.basePath !== '') {
      url += (this.config.basePath.charAt(0) === '/' ? '' : '/') + this.config.basePath;
    }
    if(url.charAt(url.length-1) !== '/') url += '/';
    this.config.url = url;
    this.url = this.config.url;
  }
  HttpValidations.init();
};

/**
 * At this point, the Server component will try and load all the route definition files found under the routes path,
 * it will cross-check the default error views with the ones defined in the errors folder and it will generate the route documentation, if enabled.<br>
 * After the first steps, it will proceed to bind the express application to the given port/ip, configure the express application
 * and start serving requests.<br>
 * <b>Note</b>: it is recommended that in a crux back-end application, the Server component to be included last, after all other dependencies (sql, store, etc)
 *
 * @memberof crux.Server.Server
 * @function run
 * @instance
 * @override
 * @param {Function} cb - the callback function that will be called after the server is started.
* */
Server.prototype.run = function RunServer(cb) {
  checkViews.call(this);
  loadRoutes.call(this);
  createDocs.call(this);
  this.bind(cb);
};

/**
 * This function is called by {@link crux.Registry} when another component would like to inject functionality in the Server component<br/>
 * This will attach the given function to {@link crux.Server.Request} and {@link crux.Server.Route}, thus attaching it in the <b>this</b> context of routes and requests
 * @memberof crux.Server.Server
 * @function attach
 * @instance
 * @override
 * @param {String} name - the function name to be attached.
 * @param {String} fn - the function attached to the specified name.
* */
Server.prototype.attach = function AttachFunction(fName, fCallback) {
  Server.Request.prototype[fName] = fCallback;
  Server.Route.prototype[fName] = fCallback;
  return this;
};


/*
 * Checking if we have the 404 and 500 error view pages.
 * */
function checkViews() {
  var self = this;
  try {
    var errPath = Component.appPath(this.config.path.views, this.config.views.errors);
    var errorFiles = Crux.util.readDirectory(errPath, this.config.views.extension, null, true);
    _.forEach(errorFiles, function(fullPath) {
      var errCode = fullPath.replace(errPath, '').replace('.' + self.config.views.extension, '');
      var code = parseInt(errCode);
      if(!isNaN(code)) {
        errorViews[errCode] = fullPath.replace(Component.appPath(self.config.path.views), '');
      }
    });
  } catch(e) {}
  self.errorViews = errorViews;
}

/*
* This will load up all the routes in the app.
* */
function loadRoutes() {
  try {
    var list = Crux.util.readDirectory(Component.appPath(this.config.path.routes), 'js'),
      self = this;
    if(list.length === 0) {
      return log.warn('Crux.server: component has no routes.');
    }
  } catch(e) {
    return;
  }

  list.forEach(function(routePath) {
    var routeObj = require(routePath);
    if(routeObj.skip === true) return;
    var httpRouteObj = self.createHttpRoute(routePath);
    if(!_.isFunction(routeObj)) {
      log.warn('Crux.server: Route %s does not export a function.', httpRouteObj.__rootPath);
      return;
    }
    routeObj(httpRouteObj);
    if(typeof self.routes[httpRouteObj.__namespace] !== 'undefined') {
      throw new Error("Route namespace " + httpRouteObj.__namespace + " previously registered.");
    }
    self.routes[httpRouteObj.__namespace] = httpRouteObj;
    routeCount++;
  });
  log.trace('Crux.server: %s route(s) loaded.', routeCount);
}


/*
 * Tries and renders the HTML Doc template in the specified documentation folder.
 *
 * */
function createDocs() {
  if(!this.config.path.docs) return;
  try {
    var hasDocFolder = fs.existsSync(Component.appPath(this.config.path.docs)),
      hasTemplate = fs.existsSync(Component.appPath(this.config.docs.template));
    if(!hasDocFolder || !hasTemplate) throw new Error("No docs");
  } catch(e) {
    // No documentation support.
    return;
  }
  var docTwig = fs.readFileSync(Component.appPath(this.config.docs.template), { encoding: 'utf8' }).toString();
  var html = swig.render(docTwig, {
    locals: {
      routes: this.routes
    }
  });
  try {
    fs.writeFileSync(Component.appPath(this.config.path.docs, 'doc.html'), html, { flag: 'w', encoding: 'utf8' });
    log.trace('CruxServer: Documented %s routes in ' + this.config.path.docs, routeCount);
  } catch(e) {}
}


/**
 * The function is responsible of creating HttpRoute objects for all the project's routes.
 * Each HttpRoute will receive a default namespace, which is the js file's path relative to
 * the routes/ folder, delimited by a dot.
 *
 * @memberof crux.Server.Server
 * @function createHttpRoute
 * @instance
 * @private
 * @param {String} routePath - the route's file system path
 * @returns {crux.Route}
 * */
Server.prototype.createHttpRoute = function CreateHttpRoute(routePath) {
  var _routes = Component.appPath(this.config.path.routes).replace(/\//g, ".").replace(/\\/g, '.'),
    _target = path.normalize(routePath).replace(/\//g, ".").replace(/\\/g, '.');
  var namespace = _target.replace(_routes, "").replace(".js", "");
  if(namespace.charAt(0) === ".") {
    namespace = namespace.substr(1);
  }
  var httpObj = HttpRoute.create(this, namespace, this.config.debug);
  httpObj.config = this.config;
  return httpObj;
};

/**
 * If we ever want to enable logging of http access, we can set debuging mode to true in the config
 * and override this function.
 * @memberof crux.Server.Server
 * @function requestStart
 * @instance
 * @param {Object} endpoint - the endpoint definition of the route.
 * @param {crux.Request} request - the request instance that just started processing.
 * */
Server.prototype.requestStart = function HttpRequestStart(endpoint, reqObj) {
  reqObj.__method = endpoint.method;
  if(this.config.debug) {
    reqObj.___id = requestCounter;
    reqObj.__start_time = new Date().getTime();
    requestCounter++;
  } else {
    log.trace("%s %s (%s:%s)", reqObj.__method.toUpperCase(), reqObj.path, reqObj.namespace, reqObj.name);
  }
};

/**
 * This function is called by the RequestContext object whenever a request has completed. This can also be overridden.
 *
 * @memberof crux.Server.Server
 * @function requestEnd
 * @instance
 * @param {crux.Request} request - the request instance that has just finshed.
 * */
Server.prototype.requestEnd = function HttpRequestEnd(reqObj) {
  if(!this.config.debug) {
    return;
  }
  var took = (new Date().getTime() - reqObj.__start_time);
  log.trace("%s %s (%s:%s) " + took + "ms", reqObj.__method.toUpperCase(), reqObj.path, reqObj.namespace, reqObj.name);
};

/*
* Returns the rendering callback. By default, it is swig
* */
Server.prototype.__render = function GetRenderCallback(path, vars, cb) {
  var locals = Crux.util.extend(true, this.app.locals, {});
  if(typeof vars === 'object' && vars !== null) {
    for(var key in vars) {
      if(typeof vars[key] === 'function') continue;
      locals[key] = vars[key];
    }
  }
  return swig.renderFile(path, locals, cb);
};

/**
* Utility function, it will use the render engine to render the given file with its vars.
* This is a wrapper over __render() by adding the fullpath of the view file.
 *
 * @memberof crux.Server.Server
 * @function render
 * @instance
 * @param {String} viewPath - the view path relative to the views/ folder
 * @param {Object} locals - the locals object passed to the view context. This contains variables accessible in the view
 * @param {Function} cb - the callback function that is called once the view has finished rendering.
* */
Server.prototype.render = function RenderContent(viewPath, _locals, cb) {
  var fullPath = path.normalize(Component.appPath(this.config.path.views) + '/' + viewPath);
  if(fullPath.indexOf(this.config.views.extension) === -1) {
    var _ext = (this.config.views.extension.charAt(0) === '.' ? '' : '.') + this.config.views.extension;
    fullPath += _ext;
  }
  return this.__render(fullPath, _locals, cb);
};

/**
 * Configures the Express application, attaches request security, initializes the static folder (public/) and initializes the session store.<br>
 * <b>Note</b>: It is highly recommended that you make use of crux.Server.configure(middleware) in stead of overriding the default configuration function<br/>
 * <b>Note 2</b>: If this function is to be overridden, we recommend calling it prior its replacement function, more details in the example.
 * @memberof crux.Server.Server
 * @function configureDefaults
 * @instance
 * @example
 *  // If we want to override the functionality..
 *  var _defaults = crux.Server.configureDefaults;
 *  crux.Server.configureDefaults = function () {
 *    this.app.use(function(req,res,next) { next(); });
 *    // our custom code, calling the configuration prior to our middleware
 *    _defaults.call(this);
 *    // After the default function is called, keep in mind that any other middleware here will not be executed, because
 *    // the default configuration includes the 404 and 500 error handling.
 *  }
 *
 * */
Server.prototype.configureDefaults = function Configure() {
  /* We now configure the Viewing engine */
  this.app.engine(this.config.render, this.__render.bind(this));
  var _locals = Crux.util.extend(true, ViewUtils.locals, {
    baseUrl: this.url,
    environment: global['NODE_ENV']
  });
  delete ViewUtils.locals;
  for(var fName in ViewUtils) {
    if(typeof ViewUtils[fName] !== 'function') continue;
    _locals[fName] = ViewUtils[fName].bind(_locals);
  }
  this.app.locals = _locals;
  this.app.set('view engine', this.config.render);
  this.app.set('views', Component.appPath(this.config.path.views));
  this.app.set('view cache', false);
  swig.setDefaults({
    cache: this.config.views.cache,
    root: Component.appPath(this.config.path.views)
  });
  this.app.use(express.compress());
  /* We obviously set limits to our requests */
  this.app.use(bodyParser.urlencoded({
    extended: true,
    limit: 2000,
    parameterLimit: this.config.request.parameters
  }));
  var REQUEST_MAX_SIZE = this.config.request.limit;  // 5000 max chars allowed in request post
  // We use this to extract encrypted application/json
  // The raw encrypted text is in req.rawBody
  this.app.use(function(req, res, next) {
    if(req.method !== 'POST') return next();
    var contentType = req.header('content-type') || '';
    if(contentType.indexOf('form') !== -1) return next();
    req.rawBody = '';
    var isError = false;
    req.on('data', function(chunk) {
      req.rawBody += chunk;
      if(req.rawBody.length > REQUEST_MAX_SIZE) {
        isError = true;
        return next(new Error('Request body is too high.'));
      }
    }).on('end', function() {
      if(isError) return;
      var contentType = (req.header('content-type') || "").toLowerCase();
      /* We check for any JSON body data. */
      if(contentType.indexOf('json') !== -1 || contentType.indexOf('form') !== -1) {
        try {
          var json = JSON.parse(req.rawBody);
        } catch(e) {
          return next(new Error('Request data is not valid.'));
        }
        req.body = json;
      }
      next();
    });
  });
  var COOKIE_SECRET = this.config.request.secret;
  this.app.use(express.methodOverride());
  this.app.use(express.cookieParser(COOKIE_SECRET));
  if(this.config.request.cors) {
    this.app.use(function CORSRequest(req, res, next) {
      res.header('Access-Control-Allow-Origin', req.headers['origin'] || '*');
      res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
      if(req.method === 'OPTIONS') {
        res.statusCode = 200;
        return res.end();
      }
      return next();
    });
  }
  var SessionStore = Component.lib('sessionStore');
  var sessionStoreObj = new SessionStore();
  this.app.use(express.session({
    store: sessionStoreObj,
    secret: COOKIE_SECRET,
    key: this.config.request.sesskey
  }));
  try {
    var hasPublic = fs.existsSync(Component.appPath(this.config.path.public));
    if(hasPublic) {
      this.app.use(express.static(Component.appPath(this.config.path.public)));
    }
  } catch(e) {
    // No public folder.
  }
};

/**
* This will register a configure() callback for when the express application will be fired up.
* The first argument will be the express app object. <br>This is useful when we have various middlewares that
 * we require to be executed before any of crux's middleware functionality.
 *
 * @memberof crux.Server.Server
 * @function configure
 * @instance
 * @param {Function} middleware - the middleware function to be called right after binding the express app.
 * @example
 *    crux.Server.configure(function(app) {
 *      app.use(function(req, res, next) {
 *        console.log("My functionality here");
 *        next();
 *      });
 *    });
* */
Server.prototype.configure = function ConfigureExpress(_cb) {
  if(typeof _cb !== 'function') return this;
  this.__app_configures.push(_cb);
};

/**
 * Binds the HTTP Server and starts listening. But before that, we bind each previously
 * registered route. This is not to be overridden.
 *
 * @memberof crux.Server.Server
 * @function bind
 * @instance
 * @param {Function} callback - callback called once server is binded.
 * */
Server.prototype.bind = function Bind(callback) {
  var self = this;
  this.configureDefaults();
  if(typeof this.configure === 'function') {
    this.configure();
  }
  for(var ns in this.routes) {
    this.routes[ns].bind();
  }
  this.app.use(this.pageNotFound.bind(this));
  this.app.use(this.serverError.bind(this));
  if(this.config.ssl) {
    // TODO:
  } else {
    this.http = http.createServer(this.app);
  }
  for(var sName in this.config.express) {
    this.app.set(sName, this.config.express[sName]);
  }
  // We then proceed to set the app env from global.NODE_ENV
  this.app.set('env', global['NODE_ENV']);
  // We now additionally call any configure() methods.
  for(var i=0; i < this.__app_configures.length; i++) {
    this.__app_configures[i](this.app);
  }
  var cbCalled = false;
  this.http.on('error', function(err) {
    if(!cbCalled) {
      cbCalled = true;
      return callback(err);
    }
    if(typeof self._events['error'] === 'function') {
      return self.emit('error', err);
    }
    log.error('Crux.server: encountered an error.');
    log.debug(err);
  });
  this.http.listen(this.config.port, this.config.ip, function() {
    if(cbCalled) return;
    log.info('CruxServer started on %s:%s', self.config.ip, self.config.port);
    cbCalled = true;
    callback();
  });
};

/**
* Gracefully closes the HTTP server and denies any other incoming connections
 * @memberof crux.Server.Server
 * @function close
 * @instance
 * @param {Function} callback - the callback function that is called once the server was closed.
* */
Server.prototype.close = function CloseServer(done) {
  this.http.close(done);
  return this;
};


/**
 * The function is called after all routes were binded, and is called whenever an incoming request is not defined
 * in any of the routes or public folder. By default it will render the 404 template, or return an error json. Overridable
 *
 * @memberof crux.Server.Server
 * @function pageNotFound
 * @instance
 * @param {express.Request} req - the express request object
 * @param {express.Response} res - the express response object
 * */
Server.prototype.pageNotFound = function PageNotFound(req, res) {
  if(!req.accepts('html') || req.xhr) {
    return res.json({
      type: 'error',
      code: 'NOT_FOUND',
      message: 'The requested URL was not found.'
    });
  }
  res.status(404);
  if(typeof errorViews['404'] === 'undefined') {
    return res.end('Not Found');
  }
  return res.render(errorViews['404'], {
    url: req.url
  });
};

/**
 * Similar to pageNotFound, it listens for any unhandled error event in the middleware call chain. If the error is
 * not handled, this callback will capture it and handle it. By default, it will render the 500 error template or an error json. Overridable
 *
 * @memberof crux.Server.Server
 * @function serverError
 * @instance
 * @param {Error} err - the error tha just occurred
 * @param {express.Request} req - the express request object
 * @param {express.Response} res - the express response object
 * */
Server.prototype.serverError = function ServerError(err, req, res) {
  if(err instanceof SyntaxError && typeof err.body !== 'undefined') {
    res.status(500);
    return res.json({
      type: 'error',
      code: 'INVALID_JSON'
    });
  }
  var errId = "IDERR" + new Date().getTime() + (Math.random() * 1000).toFixed(0);
  if(!err.custom) {
    log.warn('CruxServer Encountered an error in [%s %s]' , req.method, req.___routeName);
  } else {
    log.trace('CruxServer: request "%s" failed because of "%s"', req.path, err.code);
  }
  err.message += " (Id: " + errId + ")";
  // we manipulate a bit the error stack.
  if(err instanceof Error && err.stack) {
    err.stack = err.stack.substr(err.stack.indexOf("\n") + 1);
  }
  if(this.config.debug && !err.custom) {
    log.debug(err);
  }
  if(!req.accepts('html') || req.xhr) {
    return res.json({
      type: 'error',
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred (' + errId + ').'
    });
  }
  res.status(500);
  if(typeof errorViews['500'] === 'undefined') {
    return res.end('Internal Server Error');
  }
  return res.render(errorViews['500'], {
    url: req.url,
    error: err
  });
};


/*
 * Returns a checkpoint callback or null if not found.
 * */
Server.prototype.getCheckpoint = function GetCheckpoint(name) {
  return (typeof this.checkpoints[name] === 'undefined' ? null : this.checkpoints[name]);
};

/*
 * Registeres a checkpoint in the server.
 * */
Server.prototype.setCheckpoint = function SetCheckpoint(name, callback) {
  if(typeof this.checkpoints[name] !== 'undefined') {
    throw new Error("Checkpoint " + name + " already exists.");
  }
  this.checkpoints[name] = callback;
  return this;
};


// We expose our server components.
Server.Route = Server.prototype.Route = HttpRoute.expose();
Server.Request = Server.prototype.Request = HttpRequest;
Server.Validations = Server.prototype.Validations = HttpValidations.types;
Server.Utils = ViewUtils;
Server.Chain = Server.prototype.Chain = RequestChain;
module.exports = Server;
