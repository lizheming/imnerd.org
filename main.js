const Firekylin = require('firekylin');
const withPublicFeedCache = require('./lib/public-feed-cache');
Firekylin.config = require('./firekylin.config');

module.exports = withPublicFeedCache(Firekylin);
