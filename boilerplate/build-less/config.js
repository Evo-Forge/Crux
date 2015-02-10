module.exports = {
  project: {
    build: {
      process: {
        less: {
          path: 'front/less',
          entry: 'main.less',
          output: 'public/css/main.css'
        }
      }
    }
  },
  environment: {
    build: {
      autoRun: true,
      autoWatch: true,
      process: {
        less: {
          compressed: false,
          includes: []
        }
      }
    }
  }
};