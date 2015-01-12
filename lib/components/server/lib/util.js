/*
* These are utility functions containing additional view-level locals.
* NOTE: All objects under locals, will be placed in the "this" content of each function
* */
var util = {};

// Local variables that will be placed in every view.
util.locals = {};

/* Useful utility function for asset loading */
util.asset = function LoadAsset(_path) {
  if(this.url.charAt(this.url.length-1) === '/' && _path.charAt(0) === '/') {
    _path = _path.substr(1);
  }
  var asset = this.url + _path;
  return asset;
};

module.exports = util;