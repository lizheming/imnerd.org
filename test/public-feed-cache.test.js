'use strict';

const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {test} = require('node:test');
const withPublicFeedCache = require('../lib/public-feed-cache');

test('only a successful anonymous RSS response gets a Vercel cache TTL', async t => {
  let mode = 'rss';
  const server = createServer(withPublicFeedCache((_req, res) => {
    res.setHeader('Content-Type', mode === 'html' ? 'text/html' : 'text/xml; charset=utf-8');
    res.setHeader('Cache-Control', mode === 'private' ? 'private, no-store' : 'public, max-age=0, must-revalidate');
    if (mode === 'cookie') res.setHeader('Set-Cookie', 'session=value');
    if (mode === 'existing-cdn') res.setHeader('CDN-Cache-Control', 'no-store');
    if (mode === 'redirect') {
      res.statusCode = 301;
      res.setHeader('Location', '/rss.xml');
    }
    if (mode === 'error') res.statusCode = 503;
    if (mode === 'explicit-headers') res.writeHead(200, {'Set-Cookie': 'session=value'});
    res.end('<rss version="2.0"></rss>');
  }));
  t.after(() => new Promise(resolve => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const getHeaders = async (path, options) => {
    const response = await fetch(origin + path, {redirect: 'manual', ...options});
    await response.text();
    return response.headers;
  };
  const header = 'vercel-cdn-cache-control';
  for (const method of ['GET', 'HEAD']) {
    const headers = await getHeaders('/rss.xml', {method});
    assert.equal(headers.get(header), 'public, s-maxage=120');
    assert.equal(headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  }
  for (const path of ['/', '/your-post.html', '/rss.xml?preview=1', '/admin', '/index.xml']) {
    assert.equal((await getHeaders(path)).get(header), null, path);
  }
  for (const options of [{method: 'POST'}, {headers: {cookie: 'session=value'}}, {headers: {authorization: 'Bearer test'}}]) {
    assert.equal((await getHeaders('/rss.xml', options)).get(header), null);
  }
  for (mode of ['html', 'private', 'cookie', 'existing-cdn', 'redirect', 'error', 'explicit-headers']) {
    assert.equal((await getHeaders('/rss.xml')).get(header), null, mode);
  }
});
