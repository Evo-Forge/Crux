/*
* The cache entry defines what we want to get/set/store from the cache.
* This is a one-on-one definition between the redis cache of an item and the mysql cache.
* */
var entry = function CacheEntry(table, key, id) {
  if(!(this instanceof entry)) {
    return new entry(table, key, id);
  }
  this.table = table;   // This is the table that we're going to search to in the db
  this.key = key;       // This is the primary key we'll use for SELECT WHERE key=
  this.id = id;       // This is the id value of the entry.
  this.data = null;     // The data field is populated right after it was read from the db.
  this.where = {};
  this._filter = null;
  this._fields = null;
  this.where[key] = id;
};

/*
* Manually appends keys in the "WHERE" condition of the entry.
* */
entry.prototype.filter = function SetFilter(filter) {
  if(typeof filter !== 'object' || !filter) return this;
  for(var key in filter) {
    this.where[key] = filter[key];
  }
  this._filter = filter;
  return this;
};

/*
* In case the entry does not exist, we will include these fields in the search.
* */
entry.prototype.fields = function setDbModelFields(fields) {
  if(fields instanceof Array && fields.length !== 0) {
    this._fields = [];
    for(var i=0; i < fields.length; i++) {
      this._fields.push('`' + fields[i] + '`');
    }
    return this;
  }
  fields = Array.prototype.slice.call(arguments);;
  if(fields.length !== 0) {
    this._fields = [];
    for(var i=0; i < fields.length; i++) {
      this._fields.push('`' + fields[i] + '`');
    }
  }
  return this;
};

/*
* Verifies that our data contains ALL the fields (if applicable). If not, we need to re-read it.
* */
entry.prototype.hasFields = function HasAllFields() {
  if(this._fields == null) return true;
  if(!this.data) return true;
  for(var i=0; i < this._fields.length; i++) {
    var f = this._fields[i].replace(/`/g,'');
    if(typeof this.data[f] === 'undefined') return false;
  }
  return true;
};

/*
* Reads the data from the database object, and updates the internal data (as JSON)
* */
entry.prototype.read = function ReadFromDbModel(dbData) {
  if(typeof this.data !== 'object' || this.data == null) {
    this.data = {};
  }
  if(this._fields != null) {
    for(var i=0; i < this._fields.length; i++) {
      var f = this._fields[i].replace(/`/g,'');
      if(typeof dbData[f] !== 'undefined') {
        this.data[f] = dbData[f];
      }
    }
  } else {
    this.data = dbData;
  }
  return this;
};

/*
* If the entry has additional filters in place, we need to read them and see if they're OK.
* */
entry.prototype.isValid = function isEntryValid() {
  if(!this.data) return false;
  if(!this._filter) return true;
  if(typeof this._filter === 'object' && this._filter != null) {
    for(var key in this._filter) {
      if(this.data[key] === 1 && this._filter[key] === true) continue;
      if(this.data[key] === 0 && this._filter[key] === false) continue;
      if(this.data[key] !== this._filter[key]) {
        return false;
      }
    }
  }
  return true;
};

module.exports = entry;