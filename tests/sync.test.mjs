/** Offline regression tests for device handoff, native file selection, and Worker authorization. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { mergeCloudStates } from '../assets/js/core/cloud-state-merge.js';
import worker from '../workers/src/index.js';
import { openLegacyFilePicker } from '../assets/js/core/pickers/picker-base.js';

/** Load actual browser modules with only SDK/DOM boundaries replaced; every device gets isolated storage. */
async function device(fetchImpl = fetch) {
  const values = new Map();
  const context = vm.createContext({
    console: { log() {}, warn() {}, debug() {}, error() {} }, crypto, structuredClone,
    Date, JSON, Math, Set, Map, URL, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, AbortSignal, fetch: fetchImpl, navigator: { userAgent: 'Test' }, window: {},
    document: { getElementById: () => null, querySelector: () => null },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
  });
  const modules = new Map();
  async function get(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const code = file.endsWith(path.join('assets', 'auth.js'))
      ? 'export const getIdTokenInfo = async () => null; export const getCurrentUserId = () => "test"; export const ID_TOKEN_TYPE = {FIREBASE:"firebase"};'
      : await fs.readFile(file, 'utf8');
    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  }
  async function load(file) {
    const mod = await get(file);
    if (mod.status === 'unlinked') await mod.link((specifier, parent) => get(path.resolve(path.dirname(parent.identifier), specifier)));
    if (mod.status !== 'evaluated') await mod.evaluate();
    return mod.namespace;
  }
  const { StorageService } = await load('assets/storage.js');
  const storage = new StorageService('test');
  const sync = await load('assets/js/core/sync-logic.js');
  return { storage, sync, load };
}

test('legacy metadata acquires map ID and a new device resumes the same file', async () => {
  const { storage, sync, load } = await device();
  storage.mergeCloudIndex({ remote: { title: 'Book', fingerprints: ['hash'], updatedAt: 10 } });
  assert.equal(storage.data.cloudIndex.remote.cloudBookId, 'remote');
  storage.upsertBook({ id: 'hash', title: 'Book', contentHash: 'hash', type: 'epub' });
  const remote = { progress: 45, lastCfi: { sectionIndex: 2, offset: 8 }, updatedAt: 100,
    bookmarks: [{ location: { sectionIndex: 1, offset: 4 }, createdAt: 80 }] };
  sync.init({ storage, checkAuthStatus: () => ({ authenticated: true }), callbacks: { getCurrentBookId: () => 'hash' },
    cloudSync: { resolveSource: () => 'd1', getWorkerEndpoint: () => 'local',
      pullIndex: async () => ({ remote: storage.data.cloudIndex.remote }), pullState: async () => remote,
      pushState: async () => ({ success: true }), pushIndexDelta: async () => ({ success: true }) } });
  await sync.syncAllBooksFromCloud(true);
  assert.equal(storage.getCloudBookId('hash'), 'remote');
  const progress = await sync.resolveSyncedProgress('hash', 'ja', null);
  assert.equal(progress.percentage, 45);
  assert.equal(progress.location.sectionIndex, 2);
  assert.equal(storage.getBookmarks('hash').length, 1);
  const { buildCloudMeta } = await load('assets/js/core/file-handler.js');
  assert.equal(buildCloudMeta({ cloudBookId: 'remote', info: { title: 'Book' }, storage }).cloudBookId, 'remote');
});

test('cloud-only bookmarks are fetched even when metadata did not change', async () => {
  const { storage, sync } = await device();
  storage.mergeCloudIndex({ remote: { title: 'Book', updatedAt: 1 } });
  storage.setCloudState('remote', { progress: 20, updatedAt: 1, statePulledAt: Date.now() });
  let pulls = 0;
  sync.init({ storage, checkAuthStatus: () => ({ authenticated: true }), cloudSync: {
    resolveSource: () => 'd1', getWorkerEndpoint: () => 'local',
    pullIndex: async () => ({ remote: { title: 'Book', updatedAt: 1 } }),
    pullState: async () => { pulls++; return { progress: 60, updatedAt: 2, bookmarks: [{ location: 4, createdAt: 2 }] }; },
  } });
  await sync.syncAllBooksFromCloud(true);
  assert.equal(pulls, 1);
  assert.equal(storage.getCloudState('remote').bookmarks.length, 1);
});

test('older remote progress keeps local position AND timestamp; explicit remote choice overrides it', async () => {
  const { storage, sync } = await device();
  sync.init({ storage });
  storage.setProgress('book', { percentage: 70, location: 7, updatedAt: 200 });
  sync.applyCloudStateToLocal('book', 'remote', { progress: 20, lastCfi: 2, updatedAt: 100, bookmarks: [] });
  assert.equal(storage.getProgress('book').updatedAt, 200);
  assert.equal(storage.getProgress('book').location, 7);
  sync.applyCloudStateToLocal('book', 'remote', { progress: 20, lastCfi: 2, updatedAt: 100, bookmarks: [] }, { force: true });
  assert.equal(storage.getProgress('book').location, 2);
});

test('structured locations show the jump choice, and choosing remote overrides newer local data', async () => {
  const { storage, sync, load } = await device();
  const { elements } = await load('assets/js/ui/elements.js');
  elements.syncModal = {}; elements.syncUseRemote = {}; elements.syncUseLocal = {};
  storage.setProgress('book', { percentage: 70, location: { spineIndex: 7, segmentIndex: 2 }, updatedAt: 200 });
  let prompts = 0;
  sync.init({ storage, checkAuthStatus: () => ({ authenticated: true }), cloudSync: {
    resolveSource: () => 'd1', getWorkerEndpoint: () => 'local',
    pullState: async () => ({ progress: 30, lastCfi: { spineIndex: 3, segmentIndex: 1 }, updatedAt: 100, bookmarks: [] }),
  }, callbacks: { openModal() { prompts++; elements.syncUseRemote.onclick(); } } });
  const result = await sync.resolveSyncedProgress('book', 'ja', 'remote');
  assert.equal(prompts, 1); assert.equal(result.location.spineIndex, 3);
});

test('choosing local during opening sends saved book state, never the previous reader snapshot', async () => {
  const { storage, sync, load } = await device();
  const { elements } = await load('assets/js/ui/elements.js');
  elements.syncModal = {}; elements.syncUseRemote = {}; elements.syncUseLocal = {};
  storage.setProgress('book', { percentage: 20, location: 2, updatedAt: 100 });
  let sent;
  sync.init({ storage, checkAuthStatus: () => ({ authenticated: true }), cloudSync: {
    resolveSource: () => 'd1', getWorkerEndpoint: () => 'local',
    pullState: async () => ({ progress: 80, lastCfi: 8, updatedAt: 200, bookmarks: [] }),
    pushState: async (id, state) => { sent = { id, state }; return { success: true }; },
  }, callbacks: { openModal() { elements.syncUseLocal.onclick(); } } });
  await sync.resolveSyncedProgress('book', 'ja', 'remote', () => { throw new Error('Must not read previous book'); });
  assert.equal(sent.id, 'remote'); assert.equal(sent.state.lastCfi, 2);
});

test('opening one file fetches its index without pulling every remote book state', async () => {
  const { storage, sync } = await device();
  let pulls = 0;
  sync.init({ storage, checkAuthStatus: () => ({ authenticated: true }), cloudSync: {
    resolveSource: () => 'd1', getWorkerEndpoint: () => 'local',
    pullIndexFull: async () => ({ existing: { title: 'Book', fingerprints: ['hash'] } }),
    pullState: async () => { pulls++; },
  } });
  assert.equal(await sync.resolveCloudBookLink('hash', { title: 'Book', contentHash: 'hash' }), 'existing');
  assert.equal(pulls, 0);
});

test('failed metadata upload persists its retry marker and the next sync retries it', async () => {
  const { storage, sync, load } = await device();
  const { upsertCloudIndexEntry } = await load('assets/js/core/file-handler.js');
  const info = { id: 'local', title: 'Book', contentHash: 'hash' };
  storage.upsertBook(info); storage.setBookLink('local', 'remote');
  await upsertCloudIndexEntry('remote', info, 'hash', { storage, isCloudSyncEnabled: () => true,
    cloudSync: { pushIndexDelta: async () => { throw new Error('offline'); } } });
  assert.ok(storage.data.cloudIndexDirty.remote);
  let retried = 0;
  sync.init({ storage, checkAuthStatus: () => ({ authenticated: true }), cloudSync: {
    resolveSource: () => 'd1', getWorkerEndpoint: () => 'local', pullIndex: async () => ({}),
    pullState: async () => ({}), pushIndexDelta: async delta => { if (delta.remote) retried++; return { success: true }; },
  } });
  await sync.syncAllBooksFromCloud(true);
  assert.equal(retried, 1); assert.equal(storage.data.cloudIndexDirty.remote, undefined);
});

test('partial state-fetch failure does not claim a successful sync', async () => {
  const { storage, sync } = await device();
  storage.setSettings({ lastSyncAt: 123 });
  sync.init({ storage, checkAuthStatus: () => ({ authenticated: true }), cloudSync: {
    resolveSource: () => 'd1', getWorkerEndpoint: () => 'local',
    pullIndex: async () => ({ remote: { title: 'Book', updatedAt: 1 } }),
    pullState: async () => { throw new Error('offline'); },
  } });
  await sync.syncAllBooksFromCloud(true);
  assert.equal(storage.getSettings().lastSyncAt, 123);
});

test('large library requests do not exceed the browser keepalive payload budget', async () => {
  const requests = [];
  const { storage, load } = await device(async (_, options) => {
    requests.push(options); return Response.json({ data: { success: true } });
  });
  const { CloudSync } = await load('assets/cloudSync.js');
  const sync = new CloudSync(storage);
  sync.getIdToken = async () => 'test-token';
  await sync.postWorkerSync('/sync/index/push', { indexDelta: { book: { title: 'small' } } });
  await sync.postWorkerSync('/sync/index/push', { indexDelta: { book: { title: '大'.repeat(30000) } } });
  assert.equal(requests[0].keepalive, true); assert.equal(requests[1].keepalive, false);
});

test('actual sync requests omit local excerpts, secrets and platform details', async () => {
  const requests = [];
  const { storage, load } = await device(async (_, options) => {
    requests.push(JSON.parse(options.body)); return Response.json({ data: { success: true } });
  });
  const { CloudSync } = await load('assets/cloudSync.js');
  const sync = new CloudSync(storage);
  sync.getIdToken = async () => 'required-auth-token';
  const secret = 'LOCAL-PRIVATE-DATA';
  await sync.pushIndexDelta({ book: { title: 'Title', fingerprints: ['hash'], filePath: secret, extra: secret } }, 100);
  await sync.pushState('book', { location: { spineIndex: 1, segmentIndex: 200, visibleText: secret },
    deviceInfo: secret, bookmarks: [{ location: 2, visibleText: secret, label: 'Bookmark' }], extra: secret }, 100);
  storage.setSettings({ apiKey: secret, onedriveToken: { accessToken: secret } });
  await sync.pushToEndpoint(storage.getSettings());
  assert.ok(!JSON.stringify(requests).includes(secret));
  assert.equal(requests[0].idToken, 'required-auth-token');
  assert.deepEqual(requests[1].state.lastCfi, { spineIndex: 1, segmentIndex: 200 });
  assert.equal(requests[1].state.bookmarks[0].label, 'Bookmark');
});

test('state merge preserves newer progress and independent bookmarks; deletion cannot resurrect', async () => {
  const current = { progress: 70, lastCfi: 7, progressUpdatedAt: 200, updatedAt: 200,
    bookmarks: [{ location: 4, createdAt: 100 }] };
  const older = { progress: 10, lastCfi: 1, progressUpdatedAt: 50, updatedAt: 300,
    bookmarks: [{ location: 2, createdAt: 300 }] };
  const merged = mergeCloudStates(current, older);
  assert.equal(merged.progress, 70);
  assert.equal(merged.bookmarks.length, 2);
  const { storage, load } = await device();
  storage.setBookmarks('book', merged.bookmarks);
  storage.removeBookmark('book', 100);
  const { buildCloudStatePayload } = await load('assets/cloudState.js');
  const payload = buildCloudStatePayload(storage, 'book', 'remote');
  const deleted = mergeCloudStates(merged, payload.state);
  assert.equal(deleted.bookmarks.length, 1);
  assert.equal(mergeCloudStates(deleted, current).bookmarks.length, 1);
});

test('native file selection remains pending until change and supports cancellation/reselection', async () => {
  class Input extends EventTarget { value = ''; files = []; click() {} }
  const input = new Input();
  let settled = false;
  const pending = openLegacyFilePicker(input).then(files => { settled = true; return files; });
  // Returning focus, even repeatedly, is not proof the provider has completed its download.
  input.dispatchEvent(new Event('focus'));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(settled, false);
  input.files = [{ name: 'book.epub' }]; input.dispatchEvent(new Event('change'));
  assert.equal((await pending)[0].name, 'book.epub');
  const cancelled = openLegacyFilePicker(input); input.dispatchEvent(new Event('cancel'));
  assert.deepEqual(await cancelled, []);
  const again = openLegacyFilePicker(input); input.dispatchEvent(new Event('change'));
  assert.equal((await again).length, 1);
});

/** D1-compatible adapter backed by real SQLite, including compare-and-swap affected-row counts. */
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE user_indexes(user_id TEXT UNIQUE, index_data TEXT, updated_at INTEGER); CREATE TABLE book_states(user_id TEXT, book_id TEXT, state_data TEXT, updated_at INTEGER, UNIQUE(user_id,book_id));');
  return { sqlite, prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
  }; } }; } };
}

test('Worker rejects forged/expired tokens and merges concurrent two-device updates in SQLite', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=300' } });
  const db = database();
  try {
    const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    async function token(overrides = {}) {
      const input = enc({ alg: 'RS256', kid: 'test' }) + '.' + enc({ sub: 'user', aud: 'project',
        iss: 'https://securetoken.google.com/project', exp: now + 600, iat: now, auth_time: now, ...overrides });
      return input + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input))).toString('base64url');
    }
    const valid = await token();
    const send = (route, payload, idToken = valid) => worker.fetch(new Request('https://local.invalid' + route,
      { method: 'POST', body: JSON.stringify({ idToken, ...payload }) }), { DB: db, FIREBASE_PROJECT_ID: 'project' });
    assert.equal((await send('/sync/index/pull', {}, valid.slice(0, -8) + 'xxxxxxxx')).status, 401);
    for (const claims of [{ exp: now - 1 }, { aud: 'other' }, { iss: 'wrong' }, { sub: '' }]) {
      assert.equal((await send('/sync/index/pull', {}, await token(claims))).status, 401);
    }
    const replies = await Promise.all([
      send('/sync/index/push', { indexDelta: { a: { title: 'A', updatedAt: 100 } } }),
      send('/sync/index/push', { indexDelta: { b: { title: 'B', updatedAt: 200 } } }),
    ]);
    assert.deepEqual(replies.map(r => r.status), [200, 200]);
    const index = await (await send('/sync/index/pull', { since: Date.now() + 100000 })).json();
    assert.deepEqual(Object.keys(index.data).sort(), ['a', 'b']);
    await send('/sync/state/push', { cloudBookId: 'a', state: { progress: 60, lastCfi: 6, bookmarks: [{ location: 6, createdAt: 200 }] }, updatedAt: 200 });
    await send('/sync/state/push', { cloudBookId: 'a', state: { progress: 10, lastCfi: 1, bookmarks: [{ location: 1, createdAt: 100 }] }, updatedAt: 100 });
    const state = (await (await send('/sync/state/pull', { cloudBookId: 'a' })).json()).data;
    assert.equal(state.progress, 60); assert.equal(state.bookmarks.length, 2);
    await Promise.all([
      send('/sync/state/push', { cloudBookId: 'a', state: { progress: 70, lastCfi: 7, bookmarks: [{ location: 7, createdAt: 300 }] }, updatedAt: 300 }),
      send('/sync/state/push', { cloudBookId: 'a', state: { progress: 80, lastCfi: 8, bookmarks: [{ location: 8, createdAt: 400 }] }, updatedAt: 400 }),
    ]);
    const concurrent = (await (await send('/sync/state/pull', { cloudBookId: 'a' })).json()).data;
    assert.equal(concurrent.progress, 80); assert.equal(concurrent.bookmarks.length, 4);
    const versionedIndex = (await (await send('/sync/index/pull', {})).json()).data;
    assert.ok(versionedIndex.a.stateUpdatedAt > 0);
    const secret = 'LEGACY-PRIVATE-EXCERPT';
    db.sqlite.prepare('UPDATE book_states SET state_data=? WHERE book_id=?').run(JSON.stringify({
      ...concurrent, deviceInfo: secret, unknown: secret, lastCfi: { spineIndex: 1, segmentIndex: 200, visibleText: secret },
      bookmarks: [...concurrent.bookmarks, { location: { spineIndex: 1, segmentIndex: 200, visibleText: secret }, visibleText: secret, createdAt: 400 }],
    }), 'a');
    await send('/sync/state/push', { cloudBookId: 'a', state: { progress: 10, visibleText: secret }, updatedAt: 100 });
    const cleaned = (await (await send('/sync/state/pull', { cloudBookId: 'a' })).json()).data;
    assert.ok(!JSON.stringify(cleaned).includes(secret));
    assert.equal(cleaned.progress, 80);
    assert.deepEqual(cleaned.lastCfi, { spineIndex: 1, segmentIndex: 200 });
    await send('/sync/index/push', { indexDelta: { a: { title: 'A', filePath: secret, updatedAt: Date.now() } } });
    const cleanIndex = (await (await send('/sync/index/pull', {})).json()).data;
    assert.ok(!JSON.stringify(cleanIndex).includes(secret));
  } finally { globalThis.fetch = originalFetch; db.sqlite.close(); }
});

test('migration 0003 preserves existing data for both legacy and current column names', async () => {
  const migration = await fs.readFile('workers/migrations/0003_fix_column_names.sql', 'utf8');
  for (const legacy of [true, false]) {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE book_states(user_id TEXT,book_id TEXT,${legacy ? 'data' : 'state_data'} TEXT,updated_at INTEGER);
        CREATE TABLE user_indexes(user_id TEXT,${legacy ? 'data' : 'index_data'} TEXT,updated_at INTEGER);
        INSERT INTO book_states VALUES('u','b','{"progress":45}',100);
        INSERT INTO user_indexes VALUES('u','{"b":{"title":"Book"}}',100);`);
      db.exec(migration);
      assert.equal(JSON.parse(db.prepare('SELECT state_data FROM book_states').get().state_data).progress, 45);
      assert.equal(JSON.parse(db.prepare('SELECT index_data FROM user_indexes').get().index_data).b.title, 'Book');
    } finally { db.close(); }
  }
});
