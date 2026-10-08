/** Execute the bundled production Worker against Miniflare/workerd and local D1 only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from '../workers/node_modules/esbuild/lib/main.js';
import { Miniflare, createFetchMock } from '../workers/node_modules/miniflare/dist/src/index.js';
import { catalogRecord } from '../assets/js/core/catalog-model.js';
import { SYNC_PATHS } from '../assets/constants.js';

const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'local-worker' };
const mock = createFetchMock(); mock.disableNetConnect();
mock.get('https://www.googleapis.com').intercept({ path: '/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com' })
  .reply(200, { keys: [jwk] }, { headers: { 'cache-control': 'max-age=300' } }).persist();
const bundled = await build({ entryPoints: ['workers/src/index.js'], bundle: true, format: 'esm', write: false, platform: 'browser' });
const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2024-01-01',
  bindings: { FIREBASE_PROJECT_ID: 'project' }, d1Databases: ['DB'], fetchMock: mock });
/** @param {string} uid Fixture user @returns {Promise<string>} Valid locally signed Firebase-shaped token. */
async function token(uid) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), time = Math.floor(Date.now() / 1000);
  const message = encode({ alg: 'RS256', kid: 'local-worker' }) + '.' + encode({ sub: uid, aud: 'project', iss: 'https://securetoken.google.com/project', exp: time + 600, iat: time, auth_time: time });
  return message + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(message))).toString('base64url');
}
try {
  const db = await mf.getD1Database('DB'), user = await token('user'), other = await token('other');
  const send = (path, body, idToken = user) => mf.dispatchFetch('https://local.invalid' + path, { method: 'POST', body: JSON.stringify({ ...body, idToken }) });
  assert.equal((await send(SYNC_PATHS.CATALOG_PULL, {}, 'forged')).status, 401);
  assert.equal((await send(SYNC_PATHS.CATALOG_PULL, {})).status, 503);
  const legacy = await fs.readFile('workers/migrations/0001_create_book_states_and_user_indexes.sql', 'utf8');
  const migration = await fs.readFile('workers/migrations/0004_create_catalog_sync.sql', 'utf8');
  const sql = (legacy + '\n' + migration).replace(/--[^\n]*/g, '').split(';').map(value => value.trim()).filter(Boolean);
  await db.batch(sql.map(statement => db.prepare(statement)));
  /** @param {string} id Book ID @param {number} baseRevision Expected server revision @param {string} title Fixture title @returns {Object} Independent atomic group. */
  function mutation(id, baseRevision = 0, title = id) {
    return { mutationId: `${id}-${baseRevision}-${title}`, changes: [{ entityType: 'books', entityId: id, baseRevision,
      payload: { ...catalogRecord(() => id, 1), title, series_id: null } }] };
  }
  const add = mutation('book');
  const firstResponse = await send(SYNC_PATHS.CATALOG_PUSH, { mutations: [add] }); assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json(); assert.equal(first.data.results[0].status, 'accepted');
  assert.deepEqual(await (await send(SYNC_PATHS.CATALOG_PUSH, { mutations: [add] })).json(), first);
  const changes = await (await send(SYNC_PATHS.CATALOG_PULL, {})).json(); assert.equal(changes.data.groups.length, 1);
  assert.equal((await (await send(SYNC_PATHS.CATALOG_PULL, {}, other)).json()).data.groups.length, 0);
  const concurrent = await Promise.all(['a', 'b'].map(id => send(SYNC_PATHS.CATALOG_PUSH, { mutations: [mutation(id)] }).then(response => response.json())));
  assert.ok(concurrent.every(reply => reply.data.results[0].status === 'accepted'));
  const edits = await Promise.all(['First', 'Second'].map(title => send(SYNC_PATHS.CATALOG_PUSH, { mutations: [mutation('book', 1, title)] }).then(response => response.json())));
  assert.deepEqual(edits.map(reply => reply.data.results[0].status).sort(), ['accepted', 'conflict']);
  const bulk = { mutationId: 'bulk-500', changes: Array.from({ length: 500 }, (_, index) => mutation('bulk-' + index).changes[0]) };
  const bulkResponse = await (await send(SYNC_PATHS.CATALOG_PUSH, { mutations: [bulk] })).json();
  assert.equal(bulkResponse.data.results[0].status, 'accepted'); assert.equal(bulkResponse.data.results[0].changes.length, 500);
  const next = await (await send(SYNC_PATHS.CATALOG_PULL, { cursor: changes.data.nextCursor, limit: 1 })).json(); assert.equal(next.data.hasMore, true);
  const old = await send(SYNC_PATHS.INDEX_PUSH, { indexDelta: { legacy: { title: 'Existing Reader', updatedAt: 1 } } }); assert.equal(old.status, 200);
  assert.equal((await (await send(SYNC_PATHS.INDEX_PULL, {})).json()).data.legacy.title, 'Existing Reader');
  console.log('PASS: bundled Worker/workerd + local D1 migration, authentication, replay, concurrency, atomic 500-volume group, pagination and existing reader API');
} finally { await mf.dispose(); await mock.close(); }
