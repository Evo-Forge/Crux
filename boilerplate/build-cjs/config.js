module.exports = {
  project: {
    build: {
      process: {
        commonjs: {
          path: 'front/commonjs',
          entry: 'app.js',
          output: 'public/js/build/app.build.js'
        }
      }
    }
  },
  environment: {
    build: {
      autoRun: true,
      autoWatch: true,
      process: {
        commonjs: {
          uglify: false
        }
      }
    }
  }
};