/*
 * Minimal implementation of a promise.
 * */
var promise = function Promise(cb, ctx) {
  this.context = ctx;
  this.thenChain = [];
  this.errCb = null;
  this.noErrorCb = null;
  process.nextTick(function() {
    cb();
  });
};

/*
 * Fails the promise calling the error function
 * */
promise.prototype.fail = function FailPromise(err) {
  if(typeof this.errCb === 'function') {
    this.errCb.call(this.context || this, err);
    this.errCb = null;
  } else if(typeof this.noErrorCb === 'function') {
    this.noErrorCb(err);
    this.noErrorCb = null;
  }
  delete this.context;
  delete this.thenChain;
  this.noErrorCb = null;
  return this;
};

/*
 * The fulfill function
 * */
promise.prototype.fulfill = function FulfillPromise(_arg) {
  for(var i=0; i < this.thenChain.length; i++) {
    this.thenChain[i].apply((this.context ? this.context : this), _arg);
  }
  delete this.context;
  delete this.thenChain;
  this.noErrorCb = null;
  this.errCb = null;
  return this;
};

/*
 * The then callback chain
 * */
promise.prototype.then = function Then(cb) {
  this.thenChain.push(cb);
  return this;
};
/*
 * Callback called when no error is registered
 * */
promise.prototype.noError = function NoErrorCallback(cb) {
  this.noErrorCb = cb;
  return this;
};

/*
 * The error callback
 * */
promise.prototype.error = function Error(cb) {
  this.errCb = cb;
  return this;
};

module.exports = promise;