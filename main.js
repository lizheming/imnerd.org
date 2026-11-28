const Firekylin = require('firekylin');
const withPublicPageCache = require('./lib/public-page-cache');
Firekylin.config = require('./firekylin.config');

module.exports = withPublicPageCache(Firekylin);
