/* Development environment application configuration files */
module.exports = {
  server: {
    host: 'localhost',
    port: 3000
  },
  sql: {
    host: 'localhost',
    user: 'crux',
    password: 'crux',
    database: 'crux_example',
    sync: true
  },
  services: {
    myService: {
      location: 'http://testLocation/'
    }
  }
};