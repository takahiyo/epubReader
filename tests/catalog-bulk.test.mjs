/** Bulk organization protects explicit identities and rejects partial/stale changes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_BULK as B } from '../assets/constants.js';
import { emptyCatalog, validateCatalog } from '../assets/js/core/catalog-model.js';
import { organizeCatalogBooks } from '../assets/js/core/catalog-bulk.js';

/** @returns {Object} Mixed holdings, separate same-title editions and an old KU completion. */
function fixture() {
  const c = emptyCatalog(), common = { revision: 1, created_at: 1, updated_at: 1, deleted_at: null };
  c.series.push({ ...common, id: 'old', name: 'Old series', aliases: ['Alias'] });
  c.books = Array.from({ length: 3 }, (_, i) => ({ ...common, id: 'b' + i, title: 'Same title', author: 'Author', series_id: 'old', volume_label: i === 2 ? '外伝' : '', sort_order: null, edition: i === 2 ? '新装版' : '' }));
  c.holdings = [
    { ...common, id: 'local', book_id: 'b0', provider: 'local', access_type: 'purchased', availability_status: 'active', legacy_book_id: 'reader-file' },
    { ...common, id: 'ku', book_id: 'b1', provider: 'kindle', provider_book_id: 'ASIN', access_type: 'subscription_loan', availability_status: 'returned' },
    { ...common, id: 'purchase', book_id: 'b1', provider: 'kindle', provider_book_id: 'ASIN', access_type: 'purchased', availability_status: 'active' },
    { ...common, id: 'unext', book_id: 'b2', provider: 'unext', access_type: 'purchased', availability_status: 'unknown' },
  ];
  c.access_periods.push({ ...common, id: 'period', holding_id: 'ku', started_at: 1, ended_at: 20, end_reason: 'returned' });
  c.manual_reading_states.push({ ...common, id: 'state', holding_id: 'ku', status: 'reading', progress_percent: 42, reread_wanted: true });
  c.reading_events.push({ ...common, id: 'completion', holding_id: 'ku', access_period_id: 'period', event_type: 'completed', occurred_at: 10, recorded_at: 10, progress_percent: 100, source: 'manual' });
  return validateCatalog(c);
}
/** @returns {Object} Explicit two-book draft (leaves the alternate edition unselected). */
function command() { return { seriesMode: B.modes.create, seriesName: 'New series', books: [
  { bookId: 'b0', revision: 1, volume_label: '上', sort_order: '1' }, { bookId: 'b1', revision: 1, volume_label: '10.5', sort_order: '2' },
] }; }

test('bulk organization assigns selected volumes while preserving identities, unselected editions and KU history', () => {
  const source = fixture(), before = structuredClone(source);
  const next = organizeCatalogBooks(source, command(), { now: 100, uuid: () => 'new-series' });
  assert.deepEqual(source, before); assert.equal(next.series.length, 2);
  assert.deepEqual(next.books.map(row => row.series_id), ['new-series', 'new-series', 'old']);
  assert.equal(next.books[0].volume_label, '上'); assert.equal(next.books[1].volume_label, '10.5');
  assert.deepEqual(next.books.map(row => row.revision), [2, 2, 1]);
  assert.deepEqual(next.books[2], before.books[2]);
  for (const name of ['holdings', 'manual_reading_states', 'access_periods', 'reading_events']) assert.deepEqual(next[name], before[name]);
  assert.equal(new Set(next.books.map(row => row.id)).size, 3);
});

test('keep, existing-series assignment, clearing membership and no-op saves have explicit semantics', () => {
  const source = fixture(), draft = command(); draft.books = [{ bookId: 'b2', revision: 1, volume_label: '外伝', sort_order: '' }]; draft.seriesMode = B.modes.keep;
  assert.deepEqual(organizeCatalogBooks(source, draft), source);
  draft.seriesMode = B.modes.set; draft.seriesId = 'old'; draft.seriesRevision = 1;
  assert.deepEqual(organizeCatalogBooks(source, draft), source);
  draft.seriesMode = B.modes.clear;
  const next = organizeCatalogBooks(source, draft, { now: 100 });
  assert.equal(next.books[2].series_id, null); assert.equal(next.books[2].sort_order, null);
  assert.equal(next.books[2].edition, '新装版'); assert.equal(next.books[2].revision, 2);
});

test('one stale or deleted volume rejects the entire draft and creates no series', () => {
  for (const deleted of [false, true]) {
    const source = fixture(); if (deleted) source.books[1].deleted_at = 50; else source.books[1].revision++;
    const before = structuredClone(source);
    assert.throws(() => organizeCatalogBooks(source, command()), error => error.code === 'conflict');
    assert.deepEqual(source, before);
  }
});

test('series lease and duplicate series-name checks protect destination selection', () => {
  const source = fixture(), draft = command(); draft.seriesMode = B.modes.set; draft.seriesId = 'old'; draft.seriesRevision = 2;
  assert.throws(() => organizeCatalogBooks(source, draft), error => error.code === 'conflict');
  draft.seriesMode = B.modes.create; draft.seriesName = ' Old series ';
  assert.throws(() => organizeCatalogBooks(source, draft), error => error.bulkReason === B.errors.series);
  draft.seriesName = ' ';
  assert.throws(() => organizeCatalogBooks(source, draft));
  assert.equal(source.series.length, 1);
});

test('bad order, empty/duplicate/oversized selection and unknown target never change the original catalog', () => {
  const source = fixture(), before = structuredClone(source);
  for (const bad of ['1.5', 'Infinity', 'invalid']) { const draft = command(); draft.books[1].sort_order = bad; assert.throws(() => organizeCatalogBooks(source, draft)); }
  for (const books of [[], [command().books[0], command().books[0]], Array.from({ length: B.maxSelection + 1 }, (_, i) => ({ bookId: 'id' + i }))]) assert.throws(() => organizeCatalogBooks(source, { ...command(), books }));
  assert.throws(() => organizeCatalogBooks(source, { ...command(), seriesMode: 'guess' }));
  assert.deepEqual(source, before);
});
