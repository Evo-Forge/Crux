/*
 * This is the logger file that places log. under the global scope. We will be able to add centralized logging here.
 * */
var log4js = require('log4js'),
  util = require('util'),
  Crux = require('./../../index'),
  http = require('http'),
  socketIo,
  socketIoClient,
  Component = require('../core/component')();

Component.default({
  colors: true,
  stream: null,  // the master logger URL, used for centralized logging.
  secret: null,  // Set the secret key for clients to authenticate before logging events. Used with stream or master.
  group: null,  // The logging group to use when streaming logs from a node. Default to none.
  master: {
    port: null   // Set the port for centralized logging
  },
  appenders: [{
    type: 'console'
  }],
  level: 'trace'
});

/**
 * Crux comes with a built-in logger component, that uses log4js to achieve its logging. By default, it is placed under
 * global['log'] and can be accessible via log.<method> anywhere in the project.
 * Its default appender is the console, having its level set to "trace". For more information, visit {@link http://stritti.github.io/log4js/}
 * @global
 * */
var log = {};

// We may want to just attach log in the global scope.
var logger = function CruxLogger(_type, _level) {
  if (this instanceof CruxLogger) {
    Component.apply(this, arguments);
    this.name = 'log';
    this.type = 'console';  // default logging type.
    this.__logger = log4js.getLogger(this.type);
    this.__logger.setLevel(this.config.level.toUpperCase());
    global['log'] = this.__logger;
  } else {  // In case we just called crux.Log(), we just want to return an instance of log4js
    this.__logger = log4js.getLogger(_type || 'default');
    if (typeof _level === 'string') {
      this.__logger.setLevel(_level);
    }
    return this.__logger;
  }
};
util.inherits(logger, Component);

logger.prototype.packages = function GetPackages() {
  var list = [];
  if (typeof this.config.master === 'object' && this.config.master && this.config.master.port != null) {
    list.push('socket.io@1.3.x');
    this.__mode = 'master';
  }
  if (typeof this.config.stream === 'string' && this.config.stream) {
    list.push('socket.io-client@1.3.x');
    this.__mode = 'stream';
  }
  return list;
};

logger.prototype.init = function() {
  if (this.__mode === 'master') {
    socketIo = require('socket.io');
  }
  if (this.__mode === 'stream') {
    socketIoClient = require('socket.io-client');
  }
};

logger.prototype.getLogger = function() {
  return log4js;
};

logger.prototype.run = function RunLogger(cb) {
  var hasColors = this.config.colors;
  delete this.config.colors;
  if (!hasColors) {
    for (var i = 0; i < this.config.appenders.length; i++) {
      this.config.appenders[i].layout = {
        type: 'basic'
      }
    }
  }
  log4js.configure(this.config);
  if (this.__mode === 'stream') {
    return this.createStream(cb);
  }
  if (this.__mode === 'master') {
    return this.createMaster(cb);
  }
  cb(null);
};

/*
 * Creates the master stream listener, that will have all other nodes connect and stream logs towards it.
 * */
logger.prototype.createMaster = function CreateStreamMaster(done) {
  function handler(req, res) {
    res.end();
  }
  var self= this;
  var app = http.createServer(handler);
  var io = socketIo.listen(app);
  if(this.config.secret) {
    io.set('authorization', function onAuth(req, done) {
      var token = req._query.token;
      if(token !== self.config.secret) {
        return done(new Error("Invalid authorization token."));
      }
      done(null, true);
    });
  }

  function onSocketConnection(socket) {
    socket.on('log', onSocketLog);
  }

  function onSocketLog(data) {
    if(typeof data !== 'object' || !data) return;
    if(typeof self.config.group === 'string' && data.group !== self.config.group) return;
    self.emit('stream', data);
  }

  io.on('connection', onSocketConnection);
  app.listen(this.config.master.port, function(e) {
    if(e) return done(e);
    self.__logger.info("Crux.log: master streamer started on: %s", self.config.master.port);
    done();
  });
};

/*
* This is the default stream processing function that is called when the logger is in stream mode.
* NOTE: This can be overridden with: crux.app.component('log').stream = function StreamProcessor();
* NOTE2: the function MUST return an object with {'data': {arrayOfStrings}}
* */
logger.prototype.stream = function LogStreamProcesser(data) {
  return {
    data: data.data
  };
};

/*
 * Creates the client stream writer, that will proxy all logs to the master.
 * */
logger.prototype.createStream = function CreateStreamSlave(done) {
  var self = this;
  var url = this.config.stream;
  if(this.config.secret) {
    url += '?token=' + this.config.secret;
  }
  var io = socketIoClient(url, {
    reconnection: true,
    reconnectionDelay: 1000
  });
  function onEventPipe(data) {
    var eventData = self.stream(data);
    if(typeof eventData !== 'object' || !eventData) {
      eventData = {
        data: eventData
      };
    }
    if(!(eventData.data instanceof Array)) eventData.data = [eventData.data];
    for(var i=0; i < eventData.data.length; i++) {
      var eItem = eventData.data[i];
      if(eItem instanceof Error) {
        var e = {};
        if(eItem.message) e.mesasge = eItem.message;
        if(eItem.code) e.code = eItem.code;
        if(eItem.data) e.data = eItem.data;
        if(eItem.stack) e.stack = eItem.stack;
        eventData.data[i] = e;
      }
    }
    eventData.level = data.level.levelStr.toLowerCase();
    eventData.ts = data.startTime.getTime();
    if(self.config.group) {
      eventData.group = self.config.group;
    }
    io.emit('log', eventData);
  }
  function onConnect() {
    self.__logger.on('log', onEventPipe);
  }
  function onDisconnect() {
    self.__logger.removeListener('log', onEventPipe);
  }
  function onError(e) {
    self.__logger.warn('Crux.log: encountered an error while connecting to master stream.');
    self.__logger.debug(e);
    onDisconnect();
  }
  io.on('connect', onConnect)
    .on('disconnect', onDisconnect)
    .on('error', onError);
  done();
};

logger.prototype.get = function GetLogger() {
  return this;
};

module.exports = logger;