/*
 * The Caching component enables developers to cache specific sql-models,
 * inside redis, for fast access.
 * This should be used when we want to store our data in a relational fashion, but still have
 * extremely fast READ operations on (some) of the data.
 * NOTE: This component works without knowing the actual model definition of the dbObject.
 * Therefore, it is suitable in a microservice architecture.
 * The mechanism works as follows:
 *
 * 1. Do we have the given entry in the cache? Yes - return it, No -
 * 2. Query the SQL database for the entry with the implied restrictions.
 * 3. We don't have the entry in the db? sorry, return nothing, Or -
 * 4. Parse the SQL object data, attach it to the entry, and return the data, and
 * 5. Cache the data to redis, so any subsequent reads will be done on the cache, not on SQL
 * */
var crux = require('../../../index'),
  Entry = require('./lib/entry'),
  Component = crux.Component;

var cache = function CruxSqlCache(__name, _opt) {
  cache.super_.apply(this, arguments)
  this.name = (typeof __name === 'string' ? __name : 'cache');
  this.enabled = true;
  this.store = null;
  this.sql = null;
};

var KEY_HASH = 'redis:cache';

Component.inherits(cache)
  .require(['log', 'sql']);

Component.default({
  enabled: true,
  ttl: false,       // By default, we do not expire the cache entries. Set this to a number (seconds) to enable this feature.
  redis: 'redis',  // the redis component name.
  sql: 'sql',
  key: 'redis:cache'  // the prefix of the cache key.
});


cache.prototype.init = function Initialize() {
  if(!this.config.enabled) {
    this.enabled = false;
  } else {
    this.enabled = true;
    KEY_HASH = this.config.key;
  }
  this.attach();
};

cache.prototype.run = function RunCache(done) {
  try {
    this.sql = crux.app.component(this.config.sql).get();
  } catch(e) {
    log.fatal('Crux.cache: SQL component %s is not loaded, cache cannot start.', this.config.sql);
    return done(e);
  }
  if(!this.enabled) return done();
  try {
    this.store = crux.app.component(this.config.redis).get();
  } catch(e) {
    log.fatal('Crux.cache: Redis component %s is not loaded, cache cannot start.', this.config.redis);
    return done(e);
  }
  done();
};


/*
 * Attaches the cache component to other components. This operation consists of injecting
 * the function <b>this.cache(modelName)</b> into the crux Server and crux Service components.
 * */
cache.prototype.attach = function AttachCache() {
  var self = this;
  process.nextTick(function() {
    var attachments = {
      Entry: Entry,
      get: self.get.bind(self),
      set: self.save.bind(self),
      expire: self.expire.bind(self)
    };
    self.registry().attachTo('server service tasks', 'cache', attachments);
  });
};


function getEntryKey(entryObj) {
  return KEY_HASH + '.' + entryObj.table + '.' + entryObj.key + ":" + entryObj.id;
}


/*
* Expires the given cache entry from redis.
* ARGUMENTS:
*   entryObj - the entry object we want to expire
*   done      -- done callback
*     OR
*   tableName - the table of the entry
*   tableKey  - the key of the entry
*   id        - the id of the entry.
*   done    -- done callback
* */
cache.prototype.expire = function ExpireEntry(entryObj, _tableKey, _id, _done) {
  var tableName, tableKey, id, done;
  if(entryObj instanceof Entry) {
    tableName = entryObj.table;
    tableKey = entryObj.key;
    id = entryObj.id;
    done = _tableKey;
  } else {
    tableName = entryObj;
    tableKey = _tableKey;
    id = _id;
    done = _done;
  }
  if(!this.enabled) {
    return done && done(new Error('Crux.cache is disabled'));
  }
  if(typeof tableName !== 'string' || typeof tableKey !== 'string' || typeof id === 'undefined') {
    log.warn('Crux.cache: expire called with invalid arguments: %s, %s, %s', tableName, tableKey, id);
    return done && done(new Error('Invalid cache expire arguments'));
  }
  var key = getEntryKey({
    table: tableName,
    key: tableKey,
    id: id
  });
  var promise = this.store.exec('DEL', key);
  promise.error(function(err) {
    log.error('Crux.cache: failed to invalidate cache entry: %s, %s:%s', tableName, tableKey, id);
    log.debug(err);
    return done && done(err);
  });
  if(done) {
    promise.then(done);
  }
  return this;
};

/*
* Caches the given entry to redis. Note that the entry MUST have data in it.
* */
cache.prototype.save = function CacheEntry(entryObj, done) {
  var self = this;
  if(!this.enabled) {
    return done && done(new Error('Crux.cache is disabled'));
  }
  if(entryObj.data == null) {
    return done && done(new Error('Data is missing from the cache entry.'));
  }
  try {
    var data = JSON.stringify(entryObj.data);
  } catch(e) {
    log.warn('Crux.cache: Failed to stringify data of entry %s:%s', entryObj.table, entryObj.id);
    return done && done(new Error('Failed to parse cache entry data.'));
  }
  var promise;
  if(self.config.ttl !== false) {
    promise = this.store.exec('SETEX', getEntryKey(entryObj), this.config.ttl, data);
  } else {
    promise = this.store.exec('SET', getEntryKey(entryObj), data);
  }
  if(done) {
    promise.then(done);
  }
  promise.error(function(err) {
    log.warn('Crux.cache: Failed to save entry %s:%s', entryObj.table, entryObj.id);
    log.debug(err);
    done && done(err);
  });
  return this;
};

/*
* Tries to read the given cache entry from the cache. If it fails, it will read it from the db. If it succeeds,
* it will write it to the cache.
*   NOTE:
*     We will use callbacks for the caching mechanism, as it will rarely fail.
* Arguments:
*   entryObj - the entry object we want to use for the get.
* */
cache.prototype.get = function GetEntry(entryObj, done) {
  var self = this;
  if(!this.enabled) {
    return this.query(entryObj, done);
  }
  this.store.exec('GET', getEntryKey(entryObj)).then(function(data) {
    // If we had data in redis, we check how much of it and its integrity.
    if(data) {
      entryObj.data = data;
      var dbModel = self.sql.getModel(entryObj.table);
      if(entryObj.hasFields() && entryObj.isValid()) {
        return done(null, dbModel.build(data));
      }
    }
    self.query(entryObj, done);
  }).error(function(err) {
    log.error('Crux.cache: failed to query redis for entry %s (%s)', entryObj.table, entryObj.id);
    log.debug(err);
    return self.query(entryObj, done);
  });
  return this;
};

/*
* Manually queries the database for the given item.
* */
cache.prototype.query = function QueryForItem(entryObj, done) {
  var self = this;
  // If we don't have the data, we query for it.
  var dbModel = self.sql.getModel(entryObj.table);
  var query = "SELECT ";
  if(entryObj._fields) {
    query += entryObj._fields.join(", ");
  } else {
    query += '*';
  }
  query += ' FROM `' + dbModel.options.tableName + '` WHERE';
  var wheres = [];
  for(var key in entryObj.where) {
    query += " `" + key + "`= ? AND";
    wheres.push(entryObj.where[key]);
  }
  query = query.substr(0, query.length-4);
  query += ' LIMIT 1';
  if(wheres.length === 0) {
    log.warn('Crux.cache: cannot get entry %s, no "where" arguments to query the db', entryObj.table);
    return done(new Error('Invalid "WHERE" clause in SQL query.'));
  }
  self.sql.query(query, wheres).then(function(entries) {
    if(entries.length === 0) {
      // TODO: create a protection mechanism to block multiple queries of the same model.
      return done(null, null);
    }
    var dbData = entries[0];
    // If we got the object, we make the entry read it, and finish.
    entryObj.read(dbData);
    // We check if the entry is valid, and if it has additional filters to it.
    if(!entryObj.isValid()) {
      return done(null, null);
    }
    done(null, dbModel.build(entryObj.data));
    // Bonus step, we cache it.
    if(!self.enabled) return;
    self.save(entryObj);
  }).error(function(err) {
    log.error('Crux.cache: failed to query sql for entry %s (%s)', entryObj.table, entryObj.id);
    log.debug(err);
    return done(err, null);
  });
};



cache.Entry = cache.prototype.Entry = Entry;
module.exports = cache;