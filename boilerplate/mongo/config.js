module.exports = {
  project: {
    mongo: {
      schemas: 'app/models/mongo'
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