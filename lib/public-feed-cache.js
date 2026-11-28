'use strict';

const PRIVATE_CACHE = /(?:^|,)\s*(?:private|no-cache|no-store)\b/i;
const XML_TYPE = /^(?:text\/xml|application\/(?:rss\+xml|xml))(?:\s*;|$)/i;

module.exports = function withPublicFeedCache(handler) {
  return function handle(req, res) {
    if (req.url !== '/rss.xml' || !['GET', 'HEAD'].includes(req.method) ||
      req.headers.cookie || req.headers.authorization) {
      return handler(req, res);
    }

    const writeHead = res.writeHead;
    res.writeHead = function writeFeedHeaders(status, ...args) {
      // Koa sets response headers before writeHead. If a different handler
      // passes headers directly to writeHead, leave its policy untouched.
      const explicitHeaders = typeof args[0] === 'string' ? args[1] : args[0];
      if (status === 200 && !explicitHeaders &&
        XML_TYPE.test(String(this.getHeader('Content-Type') || '')) &&
        !this.hasHeader('Set-Cookie') &&
        !this.hasHeader('CDN-Cache-Control') &&
        !this.hasHeader('Vercel-CDN-Cache-Control') &&
        !PRIVATE_CACHE.test(String(this.getHeader('Cache-Control') || ''))) {
        this.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=120');
      }
      return writeHead.call(this, status, ...args);
    };
    return handler(req, res);
  };
};
