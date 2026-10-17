import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const KEY = 'bookreader.drive.redirect';
const URI = 'https://reader.example/dev/';
const storage = () => {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
};
async function modules(entry, extra = {}) {
  const context = vm.createContext({ URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array,
    crypto: webcrypto, btoa, atob, Request, Response, Blob, File, AbortSignal, AbortController,
    DOMException, setTimeout, clearTimeout, fetch, console, ...extra });
  const cache = new Map();
  async function load(url) {
    if (!cache.has(url.href)) cache.set(url.href, new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href }));
    return cache.get(url.href);
  }
  const module = await load(new URL(entry, ROOT));
  await module.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
  await module.evaluate();
  return { api: module.namespace, context };
}
const transaction = (overrides = {}) => ({ state: 'brdrive_state', verifier: 'a'.repeat(43), userId: 'user', redirectUri: URI, createdAt: 1000, ...overrides });
const returned = overrides => ({ state: 'brdrive_state', code: 'auth-code', scope: SCOPE, picked_file_ids: 'file_123', ...overrides });

test('book links accept only Drive file URLs and keep resource keys without accepting folder URLs', async () => {
  const { api } = await modules('assets/driveRedirect.js');
  assert.equal(api.parseDriveFileLink('  '), null);
  assert.equal(api.parseDriveFileLink('https://drive.google.com/file/d/book_123/view?usp=sharing').id, 'book_123');
  assert.equal(api.parseDriveFileLink('https://drive.google.com/open?id=book_123&resourcekey=key-123').resourceKey, 'key-123');
  for (const url of ['https://drive.google.com/drive/folders/folder_123', 'https://evil.test/file/d/book/view',
    'https://drive.google.com.evil.test/file/d/book/view', 'http://drive.google.com/file/d/book/view',
    'https://user@drive.google.com/file/d/book/view', 'javascript:alert(1)', 'not a URL']) {
    assert.throws(() => api.parseDriveFileLink(url), error => error.driveCode === 'link');
  }
});

test('a linked book restricts Google selection and a different returned file is rejected', async () => {
  const store = storage(); let target;
  const { api } = await modules('assets/driveRedirect.js', {
    sessionStorage: store, location: { href: URI, assign: url => { target = url; } },
    fetch: async () => Response.json({ redirectUri: URI }),
  });
  const navigate = await api.prepareDriveRedirect({ clientId: 'client' }, { userId: 'user' }, new AbortController().signal);
  navigate(api.parseDriveFileLink('https://drive.google.com/file/d/file_123/view?resourcekey=key-123'));
  const saved = JSON.parse(store.getItem(KEY));
  assert.equal(new URL(target).searchParams.get('file_ids'), 'file_123');
  assert.equal(new URL(target).searchParams.get('scope'), SCOPE);
  assert.equal(target.includes('key-123'), false);
  const result = returned({ state: saved.state });
  assert.equal(api.consumeDriveReturn(result, store).resourceKey, 'key-123');
  store.setItem(KEY, JSON.stringify(saved));
  assert.equal(api.consumeDriveReturn({ ...result, picked_file_ids: 'different_file' }, store).error, 'redirectState');
  navigate();
  assert.equal(new URL(target).searchParams.has('file_ids'), false);
  assert.equal(JSON.parse(store.getItem(KEY)).requestedFileId, undefined);
});

test('redirect state is single-use, bound, expires and rejects malformed file selections', async () => {
  const { api } = await modules('assets/driveRedirect.js');
  const store = storage();
  store.setItem(KEY, JSON.stringify(transaction()));
  assert.equal(api.consumeDriveReturn(returned(), store, 1100).fileId, 'file_123');
  assert.equal(api.consumeDriveReturn(returned(), store, 1100).error, 'redirectState');
  for (const [saved, result, now] of [
    [transaction(), returned({ state: 'other' }), 1100],
    [transaction(), returned(), 601001],
    [transaction(), returned(), 999],
    [transaction({ verifier: 'short' }), returned(), 1100],
    [transaction({ createdAt: undefined }), returned(), 1100],
    [transaction({ createdAt: 'invalid' }), returned(), 1100],
    [transaction(), returned({ picked_file_ids: 'one,two' }), 1100],
    [transaction(), returned({ scope: 'openid' }), 1100],
    [transaction(), returned({ code: '' }), 1100],
  ]) {
    store.setItem(KEY, JSON.stringify(saved));
    assert.equal(api.consumeDriveReturn(result, store, now).error, 'redirectState');
    assert.equal(store.getItem(KEY), null);
  }
  store.setItem(KEY, JSON.stringify(transaction()));
  assert.equal(api.consumeDriveReturn(returned({ error: 'access_denied' }), store, 1100).error, 'cancelled');
});

test('client refuses unexpected callback configuration and unauthenticated exchanges', async () => {
  let fetches = 0;
  const { api } = await modules('assets/driveRedirect.js', {
    location: { href: URI }, fetch: async () => { fetches++; return Response.json({ redirectUri: 'https://evil.example/' }); },
  });
  await assert.rejects(api.prepareDriveRedirect({ clientId: 'client' }, { userId: 'user' }, new AbortController().signal),
    error => error.driveCode === 'redirectConfig');
  await assert.rejects(api.exchangeDriveReturn({}, transaction(), null, new AbortController().signal),
    error => error.driveCode === 'permission');
  assert.equal(fetches, 1);
});

test('prepared navigation uses S256 PKCE, one scope and top-level Picker, and persists only at navigation', async () => {
  const store = storage(); let target;
  const { api } = await modules('assets/driveRedirect.js', {
    sessionStorage: store, location: { href: URI + '?setting=1', assign: url => { target = url; } },
    fetch: async () => Response.json({ redirectUri: URI }),
  });
  const controller = new AbortController();
  const navigate = await api.prepareDriveRedirect({ clientId: 'client' }, { userId: 'user' }, controller.signal);
  assert.equal(store.getItem(KEY), null);
  navigate();
  const saved = JSON.parse(store.getItem(KEY)); const url = new URL(target);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'), SCOPE);
  assert.equal(url.searchParams.get('trigger_onepick'), 'true');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('include_granted_scopes'), 'false');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), URI);
  assert.equal(url.searchParams.get('state'), saved.state);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(saved.verifier));
  assert.equal(url.searchParams.get('code_challenge'), Buffer.from(digest).toString('base64url'));
  assert.equal(url.searchParams.has('client_secret'), false);
  store.removeItem(KEY); controller.abort(); navigate();
  assert.equal(store.getItem(KEY), null);
});

test('callback capture scrubs credentials before later scripts and preserves unrelated URL state', async () => {
  let replaced; const window = {};
  const context = vm.createContext({ URL, window,
    location: { href: URI + '?setting=dark&state=brdrive_state&code=private&picked_file_ids=file_123&scope=drive&error_description=private#page' },
    history: { replaceState: (_, __, value) => { replaced = value; } },
  });
  vm.runInContext(await readFile(new URL('assets/drive-return.js', ROOT), 'utf8'), context);
  assert.equal(replaced, '/dev/?setting=dark#page');
  assert.equal(window.bookReaderDriveReturn.code, 'private');
});

const env = { DRIVE_REDIRECT_URI: URI, DRIVE_CLIENT_SECRET: 'server-only-test-secret', FIREBASE_PROJECT_ID: 'test-project' };
function request(path = 'token', { origin = new URL(URI).origin, method = 'POST', body, auth = 'Bearer firebase-token' } = {}) {
  const headers = { Origin: origin };
  if (auth) headers.Authorization = auth;
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  return new Request('https://worker.example/oauth/drive/' + path, { method, headers,
    ...(method === 'POST' ? { body: body ?? JSON.stringify({ code: 'code', verifier: 'a'.repeat(43), redirectUri: URI }) } : {}) });
}

test('Worker requires exact origin/config/auth and never reflects an untrusted origin', async () => {
  const { api } = await modules('workers/src/drive-oauth.js');
  let exchanged = 0;
  const deps = { verify: async () => true, fetchImpl: async () => { exchanged++; throw Error(); } };
  for (const origin of ['https://evil.example', 'https://reader.example.evil.test', 'null']) {
    const response = await api.handleDriveOAuth(request('token', { origin }), env, deps);
    assert.equal(response.status, 403);
    assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
  }
  assert.equal((await api.handleDriveOAuth(request(), { ...env, DRIVE_REDIRECT_URI: undefined }, deps)).status, 403);
  assert.equal((await api.handleDriveOAuth(request(), { ...env, DRIVE_CLIENT_SECRET: undefined }, deps)).status, 503);
  assert.equal((await api.handleDriveOAuth(request('token', { auth: null }), env, deps)).status, 401);
  assert.equal((await api.handleDriveOAuth(request(), env, { ...deps, verify: async () => null })).status, 401);
  const preflight = await api.handleDriveOAuth(request('token', { method: 'OPTIONS' }), env, deps);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), new URL(URI).origin);
  assert.equal(preflight.headers.get('Cache-Control'), 'no-store');
  const configured = await api.handleDriveOAuth(request('config', { method: 'GET' }), env, deps);
  assert.deepEqual(await configured.json(), { redirectUri: URI });
  assert.equal(exchanged, 0);
});

test('Worker bounds bodies and fixes redirect/client/token endpoint before exchange', async () => {
  const { api } = await modules('workers/src/drive-oauth.js'); let calls = 0;
  const deps = { verify: async () => true, fetchImpl: async () => { calls++; throw Error(); } };
  for (const body of [JSON.stringify({ code: 'code', verifier: 'a'.repeat(43), redirectUri: 'https://evil.example/' }),
    JSON.stringify({ code: 'code', verifier: 'short', redirectUri: URI }), '{', 'null']) {
    assert.equal((await api.handleDriveOAuth(request('token', { body }), env, deps)).status, 400);
  }
  assert.equal((await api.handleDriveOAuth(request('token', { body: ' '.repeat(8193) }), env, deps)).status, 413);
  assert.equal(calls, 0);
  const response = await api.handleDriveOAuth(request(), env, { verify: async (token, project) => {
    assert.equal(token, 'firebase-token'); assert.equal(project, 'test-project'); return 'user';
  }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token'); assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('redirect_uri'), URI);
    assert.equal(options.body.get('client_secret'), env.DRIVE_CLIENT_SECRET);
    assert.equal(options.body.get('code_verifier'), 'a'.repeat(43));
    return Response.json({ access_token: 'short-lived', refresh_token: 'never-return', token_type: 'Bearer', scope: SCOPE });
  } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { access_token: 'short-lived' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('Worker sanitizes upstream errors and rejects unusable token grants', async () => {
  const { api } = await modules('workers/src/drive-oauth.js');
  for (const token of [{ access_token: 'secret', scope: 'openid', token_type: 'Bearer' },
    { access_token: 'secret', scope: SCOPE, token_type: 'Basic' }, { scope: SCOPE, token_type: 'Bearer' }]) {
    const response = await api.handleDriveOAuth(request(), env, { verify: async () => true, fetchImpl: async () => Response.json(token) });
    assert.equal(response.status, 403); assert.equal((await response.text()).includes('secret'), false);
  }
  const response = await api.handleDriveOAuth(request(), env, { verify: async () => true,
    fetchImpl: async () => Response.json({ error_description: 'private-code-and-secret' }, { status: 400 }) });
  assert.deepEqual(await response.json(), { error: 'authorization_failed' });
});

test('ID-only selection validates actual metadata before downloading and never follows supplied URLs', async () => {
  const { api } = await modules('assets/googleDrive.js');
  for (const metadata of [{ name: 'notes.txt' }, { name: 'book.epub', mimeType: 'application/vnd.google-apps.document' },
    { name: 'book.epub', capabilities: { canDownload: false } }]) {
    let calls = 0;
    await assert.rejects(api.downloadDriveBook({ id: 'file_123' }, 'token', { fetchImpl: async () => { calls++; return Response.json(metadata); } }),
      error => ['format', 'permission'].includes(error.driveCode));
    assert.equal(calls, 1);
  }
  const calls = [];
  const file = await api.downloadDriveBook({ id: 'file_123', downloadUrl: 'https://evil.example/' }, 'token', { fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, 'Bearer token');
    return calls.length === 1 ? Response.json({ name: 'book.epub', size: '3', mimeType: 'application/epub+zip' }) : new Response('abc');
  } });
  assert.equal(file.name, 'book.epub'); assert.equal(file.size, 3);
  assert.equal(calls.length, 2); assert.ok(calls.every(url => url.startsWith('https://www.googleapis.com/drive/v3/files/file_123?')));
});
