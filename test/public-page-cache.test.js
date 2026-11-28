'use strict';

const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {test} = require('node:test');
const withPublicPageCache = require('../lib/public-page-cache');

test('only successful anonymous allowlisted HTML and XML get a Vercel cache TTL', async t => {
  let mode = 'rss';
  const server = createServer(withPublicPageCache((req, res) => {
    const html = mode === 'html' || (mode !== 'wrong-type' && req.url.endsWith('.html'));
    res.setHeader('Content-Type', html ? 'text/html' : 'text/xml; charset=utf-8');
    if (mode === 'vary-cookie') res.setHeader('Vary', 'Accept-Encoding, Cookie');
    if (mode === 'vary-encoding') res.setHeader('Vary', 'Accept-Encoding');
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
  for (const path of ['/rss.xml', '/sitemap.xml', '/opensearch.xml', '/tags.html', '/categories.html']) {
    for (const method of ['GET', 'HEAD']) {
      const headers = await getHeaders(path, {method});
      assert.equal(headers.get(header), 'public, s-maxage=120', path);
      assert.equal(headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    }
  }
  for (const path of ['/', '/your-post.html', '/post/private.html', '/page/about.html', '/api/feed.xml',
    '/admin/login.html', '/search.html', '/rss.xml?preview=1', '/tags.html?page=2', '/index.xml']) {
    assert.equal((await getHeaders(path)).get(header), null, path);
  }
  mode = 'wrong-type';
  assert.equal((await getHeaders('/tags.html')).get(header), null);
  mode = 'vary-encoding';
  assert.equal((await getHeaders('/rss.xml')).get(header), 'public, s-maxage=120');
  mode = 'rss';
  for (const options of [{method: 'POST'}, {headers: {cookie: 'session=value'}}, {headers: {authorization: 'Bearer test'}}]) {
    assert.equal((await getHeaders('/rss.xml', options)).get(header), null);
  }
  for (mode of ['html', 'vary-cookie', 'private', 'cookie', 'existing-cdn', 'redirect', 'error', 'explicit-headers']) {
    assert.equal((await getHeaders('/rss.xml')).get(header), null, mode);
  }
});
