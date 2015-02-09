module.exports = {
  project: {
    sql: {
      debug: false,
      sync: false,
      setup: false,
      path: {
        models: 'app/models',
        sql: 'app/models/sql'
      }
    }
  },
  environment: {
    sql: {
      debug: true,
      sync: true,
      setup: false,
      host: 'localhost',
      user: 'app',
      password: 'app',
      database: 'app'
    }
  }
};