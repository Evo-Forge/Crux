/*
 * This is the HTTP Wrapper server over Express.
 * All express-related modules and functionality should be encapsulated here.
 * */

var express,
  bodyParser,
  methodOverride,
  serveStatic,
  http = require('http'),
  https = require('https'),
  _ = require('underscore'),
  fs = require('fs'),
  path = require('path'),
  viewEngine,
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
  assets: null,  // the assets URL. If we
  port: 3000,
  basePath: '', // The default BASE http path that we're going to use.
  ip: '0.0.0.0',
  cookie: { // If we use cookies, these are the connect cookie settings
    maxAge: 3600000,
    path: '/',
    httpOnly: true,
    secure: false
  },
  request: {
    restful: false, // Turn this to true, to always return JSON data and not HTML views.
    cookies: true,  // By default, we will use cookies
    mocking: false, // Allow or not request mocking.
    basePath: '',   // If we want to prepend a path to each URL, we can using this. Therefore with basePath=api/, /user/add would become /api/user/add
    mockPath: '/mock',  // Mock request will then transform from /api/auth to /mock/api/auth
    sesskey: 'sid', // Session key id
    secret: '2312423asdf',
    limit: 5000, // Request max size in chars.
    parameters: 50,  // Maximum number of parameters in request.
    cors: false,          // Should we allow CORS requests. By default, set to false
    origins: [],          // An array of domains that we need to check when an incoming request hits the server. We fail if the origin is not there.
    geolocation: false    // Should we include ip-based geolocation? The module we use is geoip-lite. If set to a string, we will use that package.
  },
  path: {                       // Paths relative to the app's rootdir
    routes: 'app/routes/',      // Route folder location
    views: 'app/views/',        // Views folder location
    public: 'public/',          // Public folder location
    docs: false                // Doc folder location
  },
  views: {
    engine: 'swig',
    cache: false,
    extension: 'swig',
    errors: null           // Error folder containing app error views.
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
 * @param {String} [config.views.engine=swig] - the default rendering engine for views. Currently only swig supported

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
 * @parma {Boolean} [config.request.restful = false] - If enabled, the server will treat all incoming requests with JSON responses on errors (404 will become a this.error() and not this.render())
 * @param {String} [config.request.sesskey] - the express session key to be used
 * @param {String} [config.request.basePath] - should we want to prepend a PATH to every single root path of each request.
 * @param {Number} [config.request.limit=5000] - the maximum number of characters a POST or PUT request may contain in its BODY. This is to prevent DDOS
 * @param {Number} [config.request.parameters=50] - the maximum number of BODY parameters present in the request
 * @param {Boolean} [config.request.cookies=true] - should the server enable cookie support.
 * @param {String} [config.request.secret] - if the server has cookies enabled, this is the session secret key
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
  var list = ['express@3.21.2', 'body-parser@1.13.x', 'request@2.60.x', 'method-override@2.3.x', 'serve-static@1.10.x'];
  if(this.config.request.geolocation === true) {
    list.push('geoip-lite@1.1.x');
  }
  if(this.config.request.cookies) {
    list.push('express-session@1.11.x');
    list.push('cookie-parser@1.3.x');
  }
  if(this.config.views.engine === 'swig') {
    list.push('swig@1.4.2');
  }
  if(this.config.views.engine === "nunjucks") {
    list.push("nunjucks@1.3.x")
  }
  return list;
};

Server.prototype.getRenderEngine = function GetRenderEngine() {
  if(typeof viewEngine.__ENVIRONMENT !== 'undefined') {
    return viewEngine.__ENVIRONMENT;  // nunjucks
  }
  return viewEngine;
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
  methodOverride = require('method-override');
  bodyParser = require('body-parser');
  serveStatic = require('serve-static');
  viewEngine = require(this.config.views.engine);

  /*
   * These are default components that the http server uses.
   * */
  Component.lib('sessionStore', express.session.MemoryStore, true);
  this.app = express();
  if(this.config.views.engine === 'nunjucks') {
    var viewPath = path.normalize(global['__rootdir'] + "/" + this.config.path.views + '/');
    var env = viewEngine.configure(viewPath, {
      express: this.app,
      watch: !this.config.views.cache
    });
    var tmp = viewEngine;
    viewEngine = env;
    viewEngine.__NUNJUCKS = tmp;
    if(typeof viewEngine.setFilter !== 'function') {
      viewEngine.setFilter = viewEngine.addFilter;
    }
  }

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
  // Nunjucks have 404 not found disabled by default
  if(this.config.views.engine === 'nunjucks' && typeof this.config.views.errors !== 'string') {
    self.errorViews = errorViews = {};
    return;
  }
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
  var html = viewEngine.render(docTwig, {
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
  var httpObj = HttpRoute.create(this, namespace, this.config.debug, this.config.request.basePath);
  httpObj.config = this.config;
  return httpObj;
};

/**
 * When CORS is enabled, this middleware is registered before any request to check against the OPTIONS request.
 * @memberof crux.Server.Server
 * @function corsRequest
 * @instance
 * */
Server.prototype.corsRequest = function HandleCorsRequest() {
  var config = this.config.request.cors,
    methods;
  if(config === true) {
    methods = 'GET, POST, PUT, DELETE, OPTIONS';
  } else if(typeof config === 'string') {
    methods = config;
  } else if(config instanceof Array) {
    methods = config.join(', ');
  } else {
    methods = 'GET, OPTIONS';
  }

  return function CORSRequest(req, res, next) {
    var headers = (typeof req.headers === 'object' && req.headers ? req.headers : {});
    res.header('Access-Control-Allow-Origin', headers['origin'] || '*');
    res.header('Access-Control-Allow-Headers', headers['access-control-request-headers'] || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', methods);
    if(req.method === 'OPTIONS') {
      res.statusCode = 200;
      return res.end();
    }
    return next();
  }
};

/**
 * When domain origin filtering is enabled, this middleware is registered to check the Origin header. Note that in order to ensure
 * backward-compatibility with older browsers, we only restrict requests that provide the header.
 * @memberof crux.Server.Server
 * @function originVerification
 * @instance
 * */
Server.prototype.originVerification = function HandleOriginRequest() {
  var domains = this.config.request.origins;
  // We only use domain information with no path.
  for(var i=0; i < domains.length; i++) {
    var tmp = domains[i].split('://'),
      protocol = (tmp.length === 1 ? 'http' : tmp[0]),
      domainName = (tmp.length === 1 ? tmp[0] : tmp[1]);
    domainName = domainName.split('/')[0];
    domainName = (protocol !== '' ? protocol + '://' : '') + domainName;
    domains[i] = domainName.toLowerCase();
  }
  return function OriginVerificationRequest(req, res, next) {
    var origin = req.headers['origin'] || req.headers['referer'] || null;
    if(typeof origin !== 'string' || origin === '') return next();
    origin = origin.toLowerCase().replace(/ /g,'');
    var isValid = false;
    for(var i=0; i < domains.length; i++) {
      if(origin.indexOf(domains[i]) === 0) {
        isValid = true;
        break;
      }
    }
    if(isValid) return next();
    if(req.xhr) {
      return res.json(403, {
        type: 'error',
        code: 'INVALID_ORIGIN'
      });
    }
    res.send(403, 'Invalid origin domain.');
  };
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
  if(!reqObj || !reqObj.endpoint || !reqObj.endpoint.__trace) {
    try {
      reqObj.destroy();
    } catch(e){}
    return;
  } else {
    if(!this.config.debug) {
      try {
        reqObj.destroy();
      } catch(e){}
      return;
    }
  }
  var took = (new Date().getTime() - reqObj.__start_time);
  log.trace("%s %s (%s:%s) " + took + "ms", reqObj.__method.toUpperCase(), reqObj.path, reqObj.namespace, reqObj.name);
  try {
    reqObj.destroy();
  } catch(e){}
};

/*
* Returns the rendering callback. By default, it is swig
* */
Server.prototype.__render = function GetRenderCallback(path, vars, cb) {
  var locals = this.app.locals;
  if(typeof vars === 'object' && vars) {
    if(typeof locals === 'object' && locals) {
      for(var key in locals) {
        vars[key] = locals[key];
      }
    }
  }
  if(this.config.views.engine === 'swig') {
    return viewEngine.renderFile(path, vars, cb);
  }
  return viewEngine.render(path, vars, cb);
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
 * <b>Note 2</b>: If this function is to be overridden, we recommend calling it prior its replacement function, more details in the example.<br/>
 * <b>Note 3</b>: The function will emit "server:configure" in crux.app. when it starts inserting middleware into express, so this is a good time to hook into its system.
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
  this.app.engine(this.config.views.engine, this.__render.bind(this));
  var _locals = Crux.util.extend(true, ViewUtils.locals, {
    baseUrl: this.url,
    assets: this.config.assets,
    environment: global['NODE_ENV']
  });
  if(typeof _locals.assets !== 'string') {
    _locals.assets = _locals.baseUrl;
  }
  delete ViewUtils.locals;
  for(var fName in ViewUtils) {
    if(typeof ViewUtils[fName] !== 'function') continue;
    _locals[fName] = ViewUtils[fName].bind(_locals);
  }
  this.app.locals = _locals;
  this.app.set('view engine', this.config.views.engine);
  this.app.set('views', Component.appPath(this.config.path.views));
  this.app.set('view cache', this.config.views.cache);
  if(this.config.views.engine === 'swig') {
    viewEngine.setDefaults({
      cache: (this.config.views.cache ? 'memory' : this.config.views.cache),
      root: Component.appPath(this.config.path.views)
    });
  }
  /* Emits the "configure" event, so that we can hook into the app middleware chain  */
  crux.app.emit('server:configure', this.app);
  this.app.use(express.compress());
  // Origin check
  if(this.config.request.origins.length !== 0) {
    this.app.use(this.originVerification());
  }
  // CORS handling
  if(this.config.request.cors) {
    this.app.use(this.corsRequest());
  }

  /* We obviously set limits to our requests */
  this.app.use(bodyParser.urlencoded({
    extended: true,
    limit: this.config.request.limit,
    parameterLimit: this.config.request.parameters
  }));
  var REQUEST_MAX_SIZE = this.config.request.limit;  // 5000 max chars allowed in request post
  // We use this to extract encrypted application/json

  this.app.use(function(req, res, next) {
    if(req.method !== 'POST') return next();
    var contentType = req.header('content-type') || '';
    if(contentType.indexOf('form') !== -1) return next();
    req.rawBody = '';
    var isError = false;
    function onRequestData(chunk) {
      req.rawBody += chunk;
      if(req.rawBody.length > REQUEST_MAX_SIZE) {
        isError = true;
        return next(new Error('Request body is too high.'));
      }
    }
    function onEnd() {
      req.removeListener('data', onRequestData);
      req.removeListener('end', onEnd);
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
    }
    req
      .on('data', onRequestData)
      .on('end', onEnd);
  });

  this.app.use(methodOverride());
  try {
    var hasPublic = fs.existsSync(Component.appPath(this.config.path.public));
    if(hasPublic) {
      this.app.use(serveStatic(Component.appPath(this.config.path.public)));
    }
  } catch(e) {
    // No public folder.
  }
  // If the server has disabled cookies, we will not load these middlewares.
  if(this.config.request.cookies) {
    var COOKIE_SECRET = this.config.request.secret;
    var cookieParser = require('cookie-parser');
    var expressSession = require('express-session');
    this.app.use(cookieParser(COOKIE_SECRET));
    var SessionStore = Component.lib('sessionStore'),
      sessionStoreObj;
    if(typeof SessionStore.instance === 'function') {
      sessionStoreObj = SessionStore.instance(expressSession.Store, expressSession.Session);
    } else {
      // If the store is an instance of a session store, we leave it so.
      if(typeof SessionStore === 'object') {
        sessionStoreObj = SessionStore;
      } else {
        sessionStoreObj = new SessionStore(expressSession.Store, expressSession.Session);
      }
      if(Crux.app.environment() === "production" && sessionStoreObj instanceof expressSession.MemoryStore) {
        function noop(){};
        function sessionCleanup() {
          sessionStoreObj.all(function(err, sessions) {
            for (var i = 0; i < sessions.length; i++) {
              sessionStoreObj.get(sessions[i], noop);
            }
          });
        }
        setInterval(sessionCleanup, 10000);
      }
    }
    this.app.use(expressSession({
      store: sessionStoreObj,
      secret: COOKIE_SECRET,
      key: this.config.request.sesskey,
      cookie: this.config.cookie,
      resave: true,
      saveUninitialized: false
    }));
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
      if(err.code === 'EADDRINUSE') {
        err.message += ': ' + self.config.port;
      }
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
  res.status(404);
  var hasHtml = this.config.request.restful || (req.accepts('json') && (!req.accepts('html') || req.xhr));
  if(hasHtml) {
    return res.json({
      type: 'error',
      code: 'NOT_FOUND',
      message: 'The requested URL was not found.'
    });
  }
  if(typeof errorViews['404'] === 'undefined') {
    return res.end('Not Found');
  }
  var isAjax = false;
  if(req.headers && req.headers['x-requested-with']) {
    isAjax = true;
  }
  return res.render(errorViews['404'], {
    url: req.url,
    isAjax: isAjax,
    session: req.session
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
Server.prototype.serverError = function ServerError(err, req, res, next) {
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
  try {
    err.message = err.message.split(global["__rootdir"]).join("");
  } catch(e) {}


  // we manipulate a bit the error stack.
  if(err instanceof Error && err.stack) {
    err.stack = err.stack.substr(err.stack.indexOf("\n") + 1);
  }
  if(this.config.debug && !err.custom) {
    log.debug(err);
  }
  var isAjax = false;
  try {
    isAjax = this.__ajax || !req.accepts('html') || req.xhr || this.config.request.restful;
  } catch(e) {}
  if(isAjax) {
    return res.json({
      type: 'error',
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred (' + errId + ').'
    });
  }
  if(err && err.message.indexOf("in file") !== -1) {
    // we do not want to expose our file system.
    err.message = 'An unexpected error occurred.';
  }
  res.status(500);
  if(typeof errorViews['500'] === 'undefined') {
    return res.end('Internal Server Error');
  }
  return res.render(errorViews['500'], {
    url: req.url,
    code: err.code,
    message: err.message
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
