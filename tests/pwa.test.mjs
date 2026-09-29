/** Service Worker regression tests for offline fallback and cache failures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

/** Evaluate the actual worker with controlled network and CacheStorage boundaries. */
async function worker(fetch, caches) {
  const handlers = {};
  vm.runInNewContext(await readFile('sw.js', 'utf8'), {
    URL, Response, fetch, caches, console: { warn() {} },
    self: { location: { origin: 'https://local.test' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
  });
  return handlers;
}

test('offline versioned requests match canonical cached runtime modules', async () => {
  let requested;
  const handlers = await worker(async () => { throw new Error('offline'); }, {
    match: async key => { requested = key; return new Response('cached module'); },
  });
  let response;
  handlers.fetch({ request: new Request('https://local.test/assets/app.js?v=18'), respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), 'cached module');
  assert.equal(requested, 'https://local.test/assets/app.js');
});

test('cache quota failures preserve successful network responses', async () => {
  const handlers = await worker(async request => typeof request === 'string'
    ? Response.json({ cacheName: 'bookreader-test', assets: [] }) : new Response('fresh module'), {
    open: async () => ({ put: async () => { throw new Error('quota'); } }), match: async () => undefined,
  });
  let response;
  handlers.fetch({ request: new Request('https://local.test/assets/app.js'), respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), 'fresh module');
});

test('ordinary POST requests bypass the asset cache', async () => {
  const handlers = await worker(() => { throw new Error('Unexpected fetch'); }, {});
  let intercepted = false;
  handlers.fetch({ request: new Request('https://local.test/sync', { method: 'POST' }), respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});

async function requestFrom(handlers, request) {
  let response;
  handlers.fetch({ request, respondWith: value => { response = value; } });
  return response;
}

test('network and cache read failures return a reload page for navigation', async () => {
  const handlers = await worker(async () => { throw new Error('offline'); }, {
    match: async () => { throw new Error('storage unavailable'); },
  });
  const response = await requestFrom(handlers, {
    url: 'https://local.test/index.html', method: 'GET', mode: 'navigate', redirect: 'manual',
  });
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /location.reload\(\)/);
});

test('HTTP failures survive a cache read failure', async () => {
  const handlers = await worker(async () => new Response('server unavailable', { status: 502 }), {
    match: async () => { throw new Error('storage unavailable'); },
  });
  const response = await requestFrom(handlers, new Request('https://local.test/index.html'));
  assert.equal(response.status, 502);
  assert.equal(await response.text(), 'server unavailable');
});

test('redirected cached HTML is safe for manual-redirect navigation', async () => {
  const cached = new Response('<html>reader</html>', { headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(cached, 'redirected', { value: true });
  const handlers = await worker(async () => { throw new Error('offline'); }, { match: async () => cached });
  const response = await requestFrom(handlers, {
    url: 'https://local.test/index.html', method: 'GET', mode: 'navigate', redirect: 'manual',
  });
  assert.equal(response.redirected, false);
  assert.equal(response.headers.get('content-type'), 'text/html');
  assert.equal(await response.text(), '<html>reader</html>');
});

test('cached error responses cannot turn offline fallback into a network error', async () => {
  const handlers = await worker(async () => { throw new Error('offline'); }, {
    match: async () => Response.error(),
  });
  const response = await requestFrom(handlers, new Request('https://local.test/assets/app.js'));
  assert.equal(response.status, 503);
});
