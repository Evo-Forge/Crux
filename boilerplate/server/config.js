module.exports = {
  project: {
    server: {
      basePath: '',
      ip: '0.0.0.0',
      request: {
        sesskey: 'sid',
        limit: 5000,
        parameters: 60
      },
      render: 'swig',
      path: {
        routes: 'app/routes',
        views: 'app/views',
        public: 'public/',
        docs: false
      },
      views: {
        extension: 'swig',
        errors: 'errors/'
      }
    }
  },
  environment: {
    server: {
      debug: true,
      host: 'localhost',
      port: 3000,
      request: {
        secret: new Date().getTime() + '' + Math.random(),
        cors: true,
        geolocation: false
      },
      views: {
        cache: false
      }
    }
  }
};