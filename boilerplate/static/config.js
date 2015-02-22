module.exports = {
  project: {
    static: {
      files: ['public/**/*', 'public/*'],
      server: {
        baseDir: './public',
        index: 'index.html'
      }
    }
  },
  environment: {
    static: {
      open: true,
      host: 'localhost',
      port: 3200
    }
  }
};