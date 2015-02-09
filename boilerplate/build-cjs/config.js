module.exports = {
  project: {
    build: {
      commonjs: {
        path: 'front/commonjs',
        entry: 'app.js',
        output: 'public/js/build/app.build.js'
      }
    }
  },
  environment: {
    build: {
      autoRun: true,
      autoWatch: true,
      commonjs: {
        uglify: false
      }
    }
  }
};