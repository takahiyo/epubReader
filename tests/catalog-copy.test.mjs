import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCatalog, pruneUnusedCatalogSeries } from '../assets/js/core/catalog-model.js';
import { previewCatalogCSV } from '../assets/js/core/catalog-csv.js';
import { catalogRows } from '../assets/js/core/catalog-actions.js';
import { createCatalogCopyDraft, registerCatalogCopies } from '../assets/js/core/catalog-copy.js';

/** @returns {Object} Source with external IDs/link, a local binding and independent reading state. */
function fixture() {
  const c = previewCatalogCSV(emptyCatalog(), 'title,provider,series,volume_label,provider_book_id,external_url,format,book_key\nSource,kindle,Series,上,A,https://example.test/read,,one\nSource,local,Series,上,,,epub,one\nOther,unext,,下,U,,,two').next;
  c.holdings[1].legacy_book_id = 'file-id';
  c.manual_reading_states.push({ id: 'state', revision: 1, created_at: 1, updated_at: 1, deleted_at: null, holding_id: c.holdings[0].id, status: 'completed', progress_percent: 100, reread_wanted: true });
  return c;
}

test('copy draft preserves metadata and all holdings but clears book-specific identifiers and access state', () => {
  const c = fixture(), before = structuredClone(c), source = c.books[0];
  const drafts = createCatalogCopyDraft(catalogRows(c), new Map([[source.id, source.revision]]));
  assert.equal(drafts.length, 1); assert.equal(drafts[0].holdings.length, 2); assert.equal(drafts[0].values.series_id, source.series_id);
  for (const entry of drafts[0].holdings) { assert.equal(entry.values.external_url, ''); assert.equal(entry.values.provider_book_id, ''); assert.equal(entry.values.availability_status, 'unknown'); }
  drafts[0].values.title = 'New volume'; assert.deepEqual(c, before);
  const next = registerCatalogCopies(c, drafts), book = next.books.find(row => row.title === 'New volume');
  assert.notEqual(book.id, source.id); assert.equal(next.books.length, 3);
  const holdings = next.holdings.filter(row => row.book_id === book.id); assert.equal(holdings.length, 2);
  for (const row of holdings) { assert.equal(row.legacy_book_id, null); assert.equal(row.provider_book_id, null); assert.equal(row.external_url, null); }
  assert.deepEqual(next.manual_reading_states, before.manual_reading_states);
  assert.deepEqual(next.access_periods, before.access_periods); assert.deepEqual(next.reading_events, before.reading_events);
  assert.deepEqual(c, before);
});

test('bad input, stale source or duplicate service IDs reject all copies without partial registration', () => {
  for (const kind of ['title', 'source', 'provider-id']) {
    const c = fixture(), drafts = createCatalogCopyDraft(catalogRows(c), new Map(c.books.map(row => [row.id, row.revision])));
    if (kind === 'title') drafts[1].values.title = '';
    if (kind === 'source') drafts[1].revision++;
    if (kind === 'provider-id') drafts.flatMap(row => row.holdings).find(row => row.values.provider === 'kindle').values.provider_book_id = 'A';
    const before = structuredClone(c); assert.throws(() => registerCatalogCopies(c, drafts)); assert.deepEqual(c, before);
  }
});

test('multiple selected books register together with distinct new identities', () => {
  const c = fixture(), drafts = createCatalogCopyDraft(catalogRows(c), new Map(c.books.map(row => [row.id, row.revision])));
  for (const draft of drafts) draft.values.title += ' copy';
  const next = registerCatalogCopies(c, drafts);
  assert.equal(next.books.length, 4); assert.equal(next.holdings.length, 6);
  assert.equal(new Set(next.books.map(row => row.id)).size, 4); assert.equal(new Set(next.holdings.map(row => row.id)).size, 6);
  assert.deepEqual(next.manual_reading_states, c.manual_reading_states);
});

test('empty series cleanup marks only unused active series and is idempotent', () => {
  const c = fixture(), series = c.series[0];
  pruneUnusedCatalogSeries(c, 100); assert.equal(series.deleted_at, null);
  c.books[0].series_id = null; pruneUnusedCatalogSeries(c, 200);
  assert.equal(series.deleted_at, 200); assert.equal(series.revision, 2);
  pruneUnusedCatalogSeries(c, 300); assert.equal(series.revision, 2); assert.equal(series.deleted_at, 200);
  assert.equal(c.books.length, 2); assert.equal(c.holdings.length, 3); assert.equal(c.manual_reading_states.length, 1);
});
