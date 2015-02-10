module.exports = {
  project: {
    build: {
      process: {
        sass: {
          path: 'front/sass',
          entry: 'main.scss',
          output: 'public/css/main.css'
        }
      }
    }
  },
  environment: {
    build: {
      autoWatch: true,
      autoRun: true,
      process: {
        sass: {
          compressed: false
        }
      }
    }
  }
};