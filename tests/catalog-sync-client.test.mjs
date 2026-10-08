/** Frozen requests, independent revision clocks and explicit conflict recovery. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCatalog, catalogRecord } from '../assets/js/core/catalog-model.js';
import { emptyCatalogSync, initializeCatalogAccount, trackCatalogChanges, prepareCatalogPending,
  acknowledgeCatalogPending, applyCatalogPage, resolveCatalogConflict } from '../assets/js/core/catalog-sync-client.js';
import { prepareCatalogMutation } from '../assets/js/core/catalog-sync-protocol.js';
import { catalogAccountDatabase } from '../assets/js/core/catalog-sync.js';

/** @returns {Object} Minimal device catalog with one volume. */
function fixture() { const c = emptyCatalog(); c.books.push({ ...catalogRecord(() => 'book', 1), title: 'Original', series_id: null, sort_order: null }); return c; }
/** @returns {Object} Imported account and persisted request. */
function pending() { const pair = initializeCatalogAccount(emptyCatalog(), emptyCatalogSync(), fixture()); pair.state = prepareCatalogPending(pair.snapshot, pair.state, () => 'first'); return pair; }

test('immutable retries survive later edits and acknowledgment rebases only the submitted content', () => {
  const first = pending(), packet = structuredClone(first.state.pending), local = structuredClone(first.snapshot);
  local.books[0].title = 'Edited during network IO'; local.books[0].revision++;
  const dirty = trackCatalogChanges(local, first.state);
  assert.deepEqual(prepareCatalogPending(local, dirty).pending, packet);
  const receipt = prepareCatalogMutation(emptyCatalog(), packet, 100).result;
  const ack = acknowledgeCatalogPending(local, dirty, receipt);
  assert.equal(ack.snapshot.books[0].title, local.books[0].title);
  assert.equal(ack.state.baseline.books[0].title, 'Original'); assert.equal(ack.state.outbox[0].baseRevision, 1);
  assert.equal(prepareCatalogPending(ack.snapshot, ack.state, () => 'next').pending.changes[0].payload.title, local.books[0].title);
  assert.deepEqual(first.state.pending, packet);
});

test('pull does not silently rebase unsent edits; reviewed retries use the displayed cloud revision', () => {
  const first = pending(), accepted = prepareCatalogMutation(emptyCatalog(), first.state.pending, 100);
  let pair = acknowledgeCatalogPending(first.snapshot, first.state, accepted.result);
  pair.snapshot.books[0].title = 'Local'; pair.state = trackCatalogChanges(pair.snapshot, pair.state);
  const cloud = { ...accepted.result.changes[0].record, title: 'Remote', revision: 2, updated_at: 200 };
  pair = applyCatalogPage(pair.snapshot, pair.state, { groups: [{ cursor: 2, changes: [{ entityType: 'books', entityId: 'book', record: cloud }] }], nextCursor: 2, hasMore: false });
  assert.equal(pair.snapshot.books[0].title, 'Local'); assert.equal(pair.state.outbox[0].baseRevision, 1);
  pair.state = prepareCatalogPending(pair.snapshot, pair.state, () => 'conflict');
  const conflict = prepareCatalogMutation({ ...emptyCatalog(), books: [cloud] }, pair.state.pending).result;
  pair = acknowledgeCatalogPending(pair.snapshot, pair.state, conflict);
  assert.throws(() => resolveCatalogConflict(pair.snapshot, pair.state, pair.state.version - 1, true));
  const retry = resolveCatalogConflict(pair.snapshot, pair.state, pair.state.version, false);
  assert.equal(retry.snapshot.books[0].title, 'Local'); assert.equal(retry.state.outbox[0].baseRevision, 2);
  const adopt = resolveCatalogConflict(pair.snapshot, pair.state, pair.state.version, true);
  assert.equal(adopt.snapshot.books[0].title, 'Remote'); assert.equal(adopt.state.outbox.length, 0);
  assert.ok(adopt.snapshot.books[0].revision > pair.snapshot.books[0].revision);
});

test('invalid receipts and malformed pull cursors leave input snapshots and requests intact', () => {
  const pair = pending(), original = structuredClone(pair), receipt = prepareCatalogMutation(emptyCatalog(), pair.state.pending).result;
  receipt.changes[0].record.id = 'wrong'; assert.throws(() => acknowledgeCatalogPending(pair.snapshot, pair.state, receipt));
  assert.throws(() => applyCatalogPage(pair.snapshot, pair.state, { groups: [], nextCursor: 9, hasMore: true }));
  assert.deepEqual(pair, original);
});

test('explicit initial imports page new records, ordinary atomic edits never split', () => {
  const seed = fixture(); for (let n = 1; n < 201; n++) seed.books.push({ ...seed.books[0], id: 'book-' + n });
  let pair = initializeCatalogAccount(emptyCatalog(), emptyCatalogSync(), seed), cloud = emptyCatalog(), count = 0;
  while (pair.state.outbox.length) {
    pair.state = prepareCatalogPending(pair.snapshot, pair.state, () => 'page-' + count++);
    const result = prepareCatalogMutation(cloud, pair.state.pending); cloud = result.next;
    pair = acknowledgeCatalogPending(pair.snapshot, pair.state, result.result);
  }
  assert.equal(count, 3); assert.equal(cloud.books.length, 201);
  for (const row of pair.snapshot.books) row.title = 'Atomic edit';
  pair.state = trackCatalogChanges(pair.snapshot, pair.state);
  assert.equal(prepareCatalogPending(pair.snapshot, pair.state).pending.changes.length, 201);
});

test('account database scopes include both authenticated owner and Worker endpoint', async () => {
  const context = { uid: 'user', endpoint: 'https://worker.example' }, name = await catalogAccountDatabase(context);
  assert.equal(name, await catalogAccountDatabase(context)); assert.ok(!name.includes('user'));
  assert.notEqual(name, await catalogAccountDatabase({ ...context, uid: 'another' }));
  assert.notEqual(name, await catalogAccountDatabase({ ...context, endpoint: 'https://other.example' }));
});
