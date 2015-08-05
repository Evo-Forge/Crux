/**
* These are utility functions containing additional view-level locals.
 * NOTE: All objects under locals, will be placed in the "this" content of each function.
 * This can be extended by attaching functionality to crux.Server.Utils, after which it will then be visible in the view level.
 *
 * @memberof crux.Server
 * @class crux.Server.Utils
 * @static
* */
var util = {};

/**
 * Local variables that will be placed in every view.
 *
 * @memberof crux.Server.Utils
 * @name locals
 * @prop {Object}
 * */
util.locals = {};

/**
* Utility function for asset loading. This will dynamically create the asset's full URL based on the server's calculated URL, relative to the public folder.
 * @memberof crux.Server.Utils
 * @function asset
 * @static
 * @prop {String} path - the asset path
 * @returns {String} - the full URL of the asset's location
 * @example
 *  // Our CSS folder is under public/css and our public folder is set to public/
 *  // The server's URL is http://example.com/
 *  // The current request's location is http://example.com/inner/route/path
 *  var full = crux.Server.Utils.asset('css/main.css'); // => http://example.com/css/main.css
* */
util.asset = function LoadAsset(_path) {
  if(this.assets.charAt(this.assets.length-1) === '/') {
    if(_path.charAt(0) === '/') {
      _path = _path.substr(1);
    }
  } else {
    this.assets += '/';
  }
  var asset = this.assets + _path;
  return asset;
};

module.exports = util;