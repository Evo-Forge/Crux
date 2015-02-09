module.exports = {
  project: {
    build: {
      sass: {
        path: 'front/sass',
        entry: 'main.scss',
        output: 'public/css/main.css'
      }
    }
  },
  environment: {
    build: {
      autoWatch: true,
      autoRun: true,
      sass: {
        compressed: false
      }
    }
  }
};