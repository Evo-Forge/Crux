module.exports = {
  project: {
    build: {
      less: {
        path: 'front/less',
        entry: 'main.less',
        output: 'public/css/main.css'
      }
    }
  },
  environment: {
    build: {
      autoRun: true,
      autoWatch: true,
      less: {
        compressed: false,
        includes: []
      }
    }
  }
};