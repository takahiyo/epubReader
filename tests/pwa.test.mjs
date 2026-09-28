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
