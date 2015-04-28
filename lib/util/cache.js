/*
* A simple class of an im-memory cache implementation.
* */

var cache = function CruxCache() {
  this.__keys = {};
  this.__timeouts = {};
  this.length = 0;
};

/*
* Adds a single key with its value to the inner cache keys.
* If _expire is specified, it represents the number of seconds until we invalidate the key entry.
* */
cache.prototype.add = function AddValue(key, value, _expireSeconds) {
  if(typeof key !== 'string') return false;
  if(typeof value === 'undefined') value = true;
  this.length++;
  this.__keys[key] = value;
  if(typeof _expireSeconds !== 'number' || _expireSeconds <= 0) return true;
  return this.expire(key, _expireSeconds);
};

/*
* Manually sets just the value of the given key.
* NOTE: if the key does not exist, we return and set nothing.
* */
cache.prototype.set = function SetValue(key, value) {
  if(typeof key !== 'string') return false;
  if(typeof this.__keys[key] === 'undefined') return false;
  this.__keys[key] = value;
  return true;
};


/*
* This will start a timeout to expire the given key.
* */
cache.prototype.expire = function ExpireKey(key, seconds) {
  if(typeof this.__keys[key] === 'undefined' || typeof seconds !== 'number') return false;
  var self = this;
  function onCacheExpire() {
    self.remove(key);
  }
  if(typeof this.__timeouts[key] !== 'undefined') {
    clearTimeout(this.__timeouts[key]);
  }
  this.__timeouts[key] = setTimeout(onCacheExpire, seconds * 1000);
};

/*
* Removes the given key from the cache, invalidating it.
* */
cache.prototype.remove = function RemoveKey(key) {
  if(typeof key !== 'string') return false;
  if(typeof this.__keys[key] === 'undefined') return false;
  delete this.__keys[key];
  this.length--;
  if(typeof this.__timeouts[key] !== 'undefined') {
    clearTimeout(this.__timeouts[key]);
    delete this.__timeouts[key];
  }
  return true;
};

/*
* Checks if the given key exists in cache.
* */
cache.prototype.has = function HasKey(key) {
  return (typeof this.__keys[key] !== 'undefined');
};

/*
* Returns the key value from the cache.
* */
cache.prototype.get = function GetKeyValue(key){
if(typeof this.__keys[key] === 'undefined') return null;
  return this.__keys[key];
};

/*
* Returns an array of all the active keys.
* */
cache.prototype.keys = function GetKeys() {
  var keys = [];
  _.forEach(this.__keys, function(val, key) {
    keys.push(key);
  });
  return keys;
};


/*
* Custom functions that relate to numbers.
* */
cache.prototype.incr = function IncrementKeyValue(key, _incremental) {
  var val = (typeof _incremental === 'number' ? _incremental : 1);
  var oldValue = this.get(key),
    isNew = false;
  if(oldValue == null) {
    isNew = true;
    oldValue = 0;
  } else if(typeof oldValue !== 'number') {
    oldValue = parseInt(oldValue);
  }
  if(isNaN(oldValue)) return false;
  oldValue += val;
  if(isNew) this.length++;
  this.__keys[key] = oldValue;
  return true;
};

/*
* Decreases the given key's value, and if it is 0, it will remove it.
* */
cache.prototype.decr = function DecreaseKeyValue(key, _decremental) {
  var val = (typeof _decremental === 'number' ? _decremental : 1);
  var oldValue = this.get(key);
  if(oldValue == null) return false;  // we have nothing to decrease.
  if(typeof oldValue !== 'number') {
    oldValue = parseInt(oldValue);
  }
  if(isNaN(oldValue)) return false;
  oldValue -= val;
  if(oldValue <= 0) {
    return this.remove(key);
  }
  this.__keys[key] = oldValue;
  return true;
};

module.exports = cache;