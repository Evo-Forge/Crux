/*
 * The base app schema
 * */
module.exports = function init(schema, Mongo) {

  schema
    .field('name', Mongo.STRING)

};