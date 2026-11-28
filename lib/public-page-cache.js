'use strict';

const PRIVATE_CACHE = /(?:^|,)\s*(?:private|no-cache|no-store)\b/i;
const XML_TYPE = /^(?:text\/xml|application\/(?:rss\+xml|opensearchdescription\+xml|xml))(?:\s*;|$)/i;

const HTML_TYPE = /^text\/html(?:\s*;|$)/i;
// These routes do not render individual article bodies or account state.
// Do not infer cacheability from a suffix: posts can be made private.
const PUBLIC_ROUTES = new Map([
  ['/rss.xml', XML_TYPE],
  ['/sitemap.xml', XML_TYPE],
  ['/opensearch.xml', XML_TYPE],
  ['/tags.html', HTML_TYPE],
  ['/categories.html', HTML_TYPE]
]);

module.exports = function withPublicPageCache(handler) {
  return function handle(req, res) {
    const expectedType = PUBLIC_ROUTES.get(req.url);
    if (!expectedType || !['GET', 'HEAD'].includes(req.method) ||
      req.headers.cookie || req.headers.authorization) {
      return handler(req, res);
    }

    const writeHead = res.writeHead;
    res.writeHead = function writePublicPageHeaders(status, ...args) {
      // Koa sets response headers before writeHead. If a different handler
      // passes headers directly to writeHead, leave its policy untouched.
      const explicitHeaders = typeof args[0] === 'string' ? args[1] : args[0];
      if (status === 200 && !explicitHeaders &&
        expectedType.test(String(this.getHeader('Content-Type') || '')) &&
        String(this.getHeader('Vary') || '').split(',').every(name =>
          !name.trim() || name.trim().toLowerCase() === 'accept-encoding') &&
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
