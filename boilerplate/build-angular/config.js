/*
* Configuration for the angular module.
* */
module.exports = {
  project: {  // Project-specific configurations
    build: {
      process: {
        angular: {
          templates: {
            module: 'app',
            extension: 'html',
            path: 'front/app/views',
            output: 'public/js/build/app.templates.js'
          },
          core: {
            module: 'app',
            path: 'front/app',
            entry: 'app.js',
            config: 'config/$environment.js',
            output: 'public/js/build/app.angular.js'
          }
        }
      }
    }
  },
  environment: {  // Environment-specific configurations
    build: {
      autoWatch: true,
      autoRun: true
    }
  }
};