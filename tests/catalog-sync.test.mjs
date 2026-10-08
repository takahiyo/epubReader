/** Real SQLite batches exercise catalog authorization, revision races and atomic rollback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../workers/src/index.js';
import { pushCatalogMutation, pullCatalogChanges } from '../workers/src/catalog-sync.js';
import { catalogCloudRecord, validateCatalogMutation, prepareCatalogMutation, canonicalCatalogJSON } from '../assets/js/core/catalog-sync-protocol.js';
import { catalogRecord, emptyCatalog } from '../assets/js/core/catalog-model.js';
import { CATALOG_SYNC as S, SYNC_PATHS } from '../assets/constants.js';

const migration = await fs.readFile('workers/migrations/0004_create_catalog_sync.sql', 'utf8');
/** @returns {Object} D1-compatible adapter; each batch is an actual SQLite transaction. */
function database() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON'); sqlite.exec(migration);
  const db = { sqlite, failNextCommit: false, loseNextCAS: false, queries: 0, prepare(sql) {
    const statement = args => ({ sql, args,
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { db.queries++; return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
    });
    return { ...statement([]), bind: (...args) => statement(args) };
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = statements.map(({ sql, args }) => {
        db.queries++;
        if (db.loseNextCAS && sql.startsWith('UPDATE catalog_heads')) { db.loseNextCAS = false; return { results: [], meta: { changes: 0 } }; }
        if (db.failNextCommit && sql.startsWith('INSERT INTO catalog_changes')) { db.failNextCommit = false; throw new Error('Injected log failure'); }
        const prepared = sqlite.prepare(sql);
        if (sql.startsWith('SELECT')) return { results: prepared.all(...args), meta: { changes: 0 } };
        return { results: [], meta: { changes: prepared.run(...args).changes } };
      });
      sqlite.exec('COMMIT'); return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  return db;
}
/** @param {string} id Book ID @param {string} title Title @returns {Object} Minimal valid volume. */
function book(id = 'book', title = 'Title') { return { ...catalogRecord(() => id, 1), title, series_id: null, sort_order: null }; }
/** @param {string} mutationId Operation @param {Array} changes Tuples type, record, revision @returns {Object} Checked wire mutation. */
function mutation(mutationId, changes) {
  return validateCatalogMutation({ mutationId, changes: changes.map(([entityType, payload, baseRevision = 0]) => ({ entityType, entityId: payload.id, baseRevision, payload: catalogCloudRecord(entityType, payload) })) });
}
/** @param {Object} db Database @param {string} uid Owner @returns {Object[]} Persistent entities. */
function records(db, uid = 'user') { return db.sqlite.prepare('SELECT * FROM catalog_records WHERE user_id=? ORDER BY entity_id').all(uid); }

test('catalog projection omits device bindings, rejects extra secrets and restricts external reader URLs', () => {
  const h = { ...catalogRecord(() => 'holding', 1), book_id: 'book', provider: 'kindle', access_type: 'purchased', availability_status: 'active',
    legacy_book_id: 'DEVICE-ONLY', legacy_cloud_book_id: 'cloud-id', external_url: 'https://read.amazon.co.jp/?asin=B0TEST' };
  const safe = catalogCloudRecord('holdings', h); assert.equal(safe.legacy_book_id, undefined); assert.equal(safe.legacy_cloud_book_id, 'cloud-id');
  assert.throws(() => catalogCloudRecord('holdings', h, true));
  for (const extra of [{ cookie: 'secret' }, { filePath: 'C:/secret' }, { excerpt: 'body' }]) assert.throws(() => catalogCloudRecord('holdings', { ...h, ...extra }));
  for (const external_url of ['https://amazon.co.jp.evil.test/', 'https://example.test/', 'https://read.amazon.co.jp/?token=secret', 'https://read.amazon.co.jp/#token=secret', 'https://user:password@amazon.co.jp/']) assert.throws(() => catalogCloudRecord('holdings', { ...h, external_url }));
  assert.equal(canonicalCatalogJSON({ b: 2, a: 1 }), canonicalCatalogJSON({ a: 1, b: 2 }));
});

test('accepted retries return original revisions without duplicate log; reused IDs with different content are rejected', async () => {
  const db = database();
  try {
    const command = mutation('add', [['books', book()]]);
    const first = await pushCatalogMutation(db, 'user', command); assert.equal(first.status, 'accepted'); assert.equal(first.changes[0].record.revision, 1);
    assert.deepEqual(await pushCatalogMutation(db, 'user', command), first);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM catalog_changes').get().n, 1);
    const reused = await pushCatalogMutation(db, 'user', mutation('add', [['books', book('book', 'Different')]]));
    assert.equal(reused.reason, 'mutation_reused'); assert.equal(JSON.parse(records(db)[0].record_data).title, 'Title');
  } finally { db.sqlite.close(); }
});

test('different concurrent volumes survive CAS retries; same-volume race preserves winner and reports loser', async () => {
  const db = database();
  try {
    const added = await Promise.all(['a', 'b'].map(id => pushCatalogMutation(db, 'user', mutation('add-' + id, [['books', book(id)]]))));
    assert.deepEqual(added.map(row => row.status), ['accepted', 'accepted']); assert.equal(records(db).length, 2);
    const results = await Promise.all(['First', 'Second'].map(title => pushCatalogMutation(db, 'user', mutation('edit-' + title, [['books', book('a', title), 1]]))));
    assert.deepEqual(results.map(row => row.status).sort(), ['accepted', 'conflict']);
    const winner = results.find(row => row.status === 'accepted').changes[0].record;
    const loser = results.find(row => row.status === 'conflict'); assert.deepEqual(loser.conflicts[0].current, winner);
    const same = mutation(loser.mutationId, [['books', book('a', loser.mutationId.slice(5)), 1]]);
    assert.deepEqual(await pushCatalogMutation(db, 'user', same), loser);
    assert.equal(JSON.parse(records(db).find(row => row.entity_id === 'a').record_data).title, winner.title);
  } finally { db.sqlite.close(); }
});

test('loan transition, completion and return are grouped atomically; retries retain past history', async () => {
  const db = database();
  try {
    const b = book(), h = { ...catalogRecord(() => 'h', 1), book_id: b.id, provider: 'kindle', access_type: 'subscription_loan', availability_status: 'active' };
    const p = { ...catalogRecord(() => 'p', 1), holding_id: h.id, started_at: 1, ended_at: null, end_reason: null };
    assert.equal((await pushCatalogMutation(db, 'user', mutation('borrow', [['books', b], ['holdings', h], ['access_periods', p]]))).status, 'accepted');
    const e = { ...catalogRecord(() => 'e', 1), holding_id: h.id, access_period_id: p.id, event_type: 'completed', occurred_at: 5, recorded_at: 7, progress_percent: 100, source: 'manual' };
    const state = { ...catalogRecord(() => 's', 1), holding_id: h.id, status: 'completed', progress_percent: 100, reread_wanted: true };
    await pushCatalogMutation(db, 'user', mutation('finish', [['reading_events', e], ['manual_reading_states', state]]));
    const returned = mutation('return', [['holdings', { ...h, availability_status: 'returned' }, 1], ['access_periods', { ...p, ended_at: 10, end_reason: 'returned' }, 1]]);
    const result = await pushCatalogMutation(db, 'user', returned); assert.equal(result.status, 'accepted');
    assert.deepEqual(await pushCatalogMutation(db, 'user', returned), result);
    const page = await pullCatalogChanges(db, 'user', { limit: 1 }); assert.equal(page.groups[0].changes.length, 3); assert.equal(page.hasMore, true);
    const snapshot = Object.fromEntries(records(db).map(row => [row.entity_id, JSON.parse(row.record_data)]));
    assert.equal(snapshot.e.occurred_at, 5); assert.equal(snapshot.s.status, 'completed'); assert.equal(snapshot.p.ended_at, 10);
    const reborrow = { ...p, id: 'new-p', started_at: 20 };
    await pushCatalogMutation(db, 'user', mutation('again', [['holdings', h, 2], ['access_periods', reborrow]]));
    const stale = await pushCatalogMutation(db, 'user', mutation('old-return', [['holdings', { ...h, availability_status: 'returned' }, 1], ['access_periods', { ...p, ended_at: 10 }, 1]]));
    assert.equal(stale.status, 'conflict'); assert.equal(JSON.parse(records(db).find(row => row.entity_id === 'new-p').record_data).ended_at, null);
  } finally { db.sqlite.close(); }
});

test('invalid references, duplicate service IDs and failed SQL never partially commit a group', async () => {
  const db = database();
  try {
    const invalid = mutation('bad-reference', [['books', { ...book(), series_id: 'another-user-series' }]]);
    assert.equal((await pushCatalogMutation(db, 'user', invalid)).status, 'invalid'); assert.equal(records(db).length, 0);
    assert.deepEqual(await pushCatalogMutation(db, 'user', invalid), await pushCatalogMutation(db, 'user', invalid));
    db.failNextCommit = true;
    await assert.rejects(pushCatalogMutation(db, 'user', mutation('sql-failure', [['books', book()]])));
    assert.equal(records(db).length, 0); assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM catalog_mutations WHERE mutation_id='sql-failure'").get().n, 0);
    assert.equal((await pushCatalogMutation(db, 'user', mutation('sql-failure', [['books', book()]]))).status, 'accepted');
    const h = { ...catalogRecord(() => 'h', 1), book_id: 'book', provider: 'kindle', access_type: 'purchased', availability_status: 'active', provider_book_id: 'ASIN' };
    assert.equal((await pushCatalogMutation(db, 'user', mutation('duplicates', [['holdings', h], ['holdings', { ...h, id: 'other' }]]))).status, 'invalid');
    assert.equal(records(db).length, 1);
  } finally { db.sqlite.close(); }
});

test('monotonic pages include writes during initial pull, tombstones and only the verified owner', async () => {
  const db = database();
  try {
    for (const id of ['a', 'b', 'c']) await pushCatalogMutation(db, 'user', mutation(id, [['books', book(id)]]));
    await pushCatalogMutation(db, 'other', mutation('a', [['books', book('private', 'Private title')]]));
    const first = await pullCatalogChanges(db, 'user', { limit: 1 }); const cursor = first.nextCursor;
    await pushCatalogMutation(db, 'user', mutation('d', [['books', book('d')]]));
    await pushCatalogMutation(db, 'user', mutation('delete-a', [['books', { ...book('a'), deleted_at: 100 }, 1]]));
    const rest = await pullCatalogChanges(db, 'user', { cursor }); assert.deepEqual(rest.groups.map(group => group.mutationId), ['b', 'c', 'd', 'delete-a']);
    assert.equal(rest.groups.at(-1).changes[0].record.deleted_at, 100); assert.equal(rest.hasMore, false);
    assert.ok(!JSON.stringify(rest).includes('Private title'));
    await assert.rejects(pullCatalogChanges(db, 'other', { cursor: rest.nextCursor }));
    assert.equal((await pullCatalogChanges(db, 'user', { cursor: rest.nextCursor })).groups.length, 0);
  } finally { db.sqlite.close(); }
});

test('wire shape limits and missing active loan availability are rejected before storage', () => {
  for (const input of [{ mutationId: 'id', changes: [] }, { mutationId: 'id', changes: Array(S.maxChanges + 1).fill({}) },
    { mutationId: 'id', changes: [{ entityType: 'books', entityId: 'book', baseRevision: -1, payload: book() }] }]) assert.throws(() => validateCatalogMutation(input));
  const h = { ...catalogRecord(() => 'h', 1), book_id: 'book', provider: 'kindle', access_type: 'subscription_loan', availability_status: 'returned' };
  const p = { ...catalogRecord(() => 'p', 1), holding_id: 'h', started_at: 1, ended_at: null };
  assert.throws(() => prepareCatalogMutation(emptyCatalog(), mutation('bad-borrow', [['books', book()], ['holdings', h], ['access_periods', p]])));
});

test('catalog migration preserves legacy reader tables and is repeatable', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec("CREATE TABLE book_states(user_id TEXT,book_id TEXT,state_data TEXT); INSERT INTO book_states VALUES('u','b','{\"progress\":42}');");
    sqlite.exec(migration); sqlite.exec(migration); assert.equal(JSON.parse(sqlite.prepare('SELECT state_data FROM book_states').get().state_data).progress, 42);
  } finally { sqlite.close(); }
});

test('500-volume group stays atomic within Free D1 query budget, including a lost CAS retry', async () => {
  const db = database();
  try {
    const command = mutation('large', Array.from({ length: 500 }, (_, i) => ['books', book('book-' + i)]));
    db.loseNextCAS = true;
    assert.equal((await pushCatalogMutation(db, 'user', command)).status, 'accepted');
    assert.ok(db.queries <= S.maxD1Queries); assert.equal(records(db).length, 500);
    assert.equal((await pullCatalogChanges(db, 'user', {})).groups.length, 1);
  } finally { db.sqlite.close(); }
});

test('pull byte budget retains complete groups and preserves the continuation cursor', async () => {
  const db = database();
  try {
    for (let group = 0; group < 5; group++) {
      const command = mutation('group-' + group, Array.from({ length: 40 }, (_, i) => ['books',
        { ...book(`${group}-${i}`, 'A'.repeat(1800)), author: 'B'.repeat(1800) }]));
      assert.equal((await pushCatalogMutation(db, 'user', command)).status, 'accepted');
    }
    const first = await pullCatalogChanges(db, 'user', {}); assert.equal(first.hasMore, true);
    assert.ok(new TextEncoder().encode(JSON.stringify(first.groups)).byteLength <= S.maxPageBytes);
    assert.ok(first.groups.every(group => group.changes.length === 40));
    const second = await pullCatalogChanges(db, 'user', { cursor: first.nextCursor });
    assert.equal(first.groups.length + second.groups.length, 5); assert.equal(second.hasMore, false);
  } finally { db.sqlite.close(); }
});

test('Worker catalog routes verify Firebase identity and fail safely before migration', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'catalog-test' };
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=300' } });
  const db = database();
  try {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const time = Math.floor(Date.now() / 1000);
    async function token(uid) {
      const input = encode({ alg: 'RS256', kid: 'catalog-test' }) + '.' + encode({ sub: uid, aud: 'project', iss: 'https://securetoken.google.com/project', exp: time + 600, iat: time, auth_time: time });
      return input + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input))).toString('base64url');
    }
    const user = await token('user'), other = await token('other');
    const send = (path, data, idToken = user, DB = db) => worker.fetch(new Request('https://local.invalid/?path=' + encodeURIComponent(path), { method: 'POST', body: JSON.stringify({ ...data, idToken }) }), { DB, FIREBASE_PROJECT_ID: 'project' });
    assert.equal((await send(SYNC_PATHS.CATALOG_PULL, {}, 'forged')).status, 401);
    assert.equal((await send(SYNC_PATHS.CATALOG_PUSH, { mutations: [mutation('first', [['books', book()]])], user_id: 'other' })).status, 200);
    assert.equal((await (await send(SYNC_PATHS.CATALOG_PULL, {}, other)).json()).data.groups.length, 0);
    assert.equal((await send(SYNC_PATHS.CATALOG_PUSH, { mutations: [{ mutationId: 'bad', changes: [] }] })).status, 400);
    const missing = { prepare() { throw new Error('no such table'); } };
    assert.equal((await send(SYNC_PATHS.CATALOG_PULL, {}, user, missing)).status, 503);
    assert.equal((await send(SYNC_PATHS.CATALOG_PULL, {})).headers.get('cache-control'), 'no-store');
  } finally { globalThis.fetch = originalFetch; db.sqlite.close(); }
});
