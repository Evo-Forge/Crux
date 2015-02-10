module.exports = {
  project: {
    mongo: {
      schemas: 'app/schemas'
    }
  },
  environment: {
    mongo: {
      debug: true,
      host: 'localhost',
      user: 'mongo',
      password: 'mongo',
      database: 'app'
    }
  }
};