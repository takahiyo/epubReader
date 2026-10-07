import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCatalog, validateCatalog, migrateLegacyCatalog, catalogRecord } from '../assets/js/core/catalog-model.js';

const options = () => { let id = 0; return { now: 100, uuid: () => `id-${++id}` }; };

test('legacy migration preserves source data, explicit cloud links and distinct same-title books', () => {
  const legacy = { library: { a: { title: 'Same', type: 'epub' }, b: { title: 'Same', fileName: 'comic.CBZ' },
    novel: { title: 'Web', type: 'web_novel' } }, bookLinkMap: { a: 'cloud-a' }, cloudIndex: {
    'cloud-a': { title: 'Remote title' }, 'cloud-only': { title: 'Only remote' } }, progress: { a: { percentage: 42 } } };
  const original = structuredClone(legacy);
  const imported = migrateLegacyCatalog(emptyCatalog(), legacy, options());
  assert.equal(imported.books.length, 3);
  assert.equal(imported.holdings.length, 3);
  assert.equal(imported.holdings[1].format, 'cbz');
  assert.equal(imported.holdings[2].format, null);
  assert.deepEqual(legacy, original);
  assert.deepEqual(migrateLegacyCatalog(imported, legacy, options()), imported);
});

test('a later explicit cloud link enriches the holding without overwriting catalog edits', () => {
  const legacy = { library: { a: { title: 'Old', type: 'epub' } } };
  const imported = migrateLegacyCatalog(emptyCatalog(), legacy, options());
  imported.books[0].title = 'Edited';
  legacy.bookLinkMap = { a: 'linked' }; legacy.cloudIndex = { linked: { title: 'Remote' } };
  const linked = migrateLegacyCatalog(imported, legacy, options());
  assert.equal(linked.holdings.length, 1);
  assert.equal(linked.holdings[0].legacy_cloud_book_id, 'linked');
  assert.equal(linked.books[0].title, 'Edited');
});

test('linking previously separate catalog holdings requires reconciliation and preserves input', () => {
  const legacy = { library: { a: { title: 'Local', type: 'epub' } }, cloudIndex: { remote: { title: 'Remote' } } };
  const imported = migrateLegacyCatalog(emptyCatalog(), legacy, options());
  const original = structuredClone(imported);
  legacy.bookLinkMap = { a: 'remote' };
  assert.throws(() => migrateLegacyCatalog(imported, legacy, options()), /Conflicting legacy catalog links/);
  assert.deepEqual(imported, original);
});

/** @returns {Object} KU return/reborrow history plus purchased copy sharing a book identity. */
export function kuFixture() {
  const make = id => ({ ...catalogRecord(() => id, 100) });
  const snapshot = emptyCatalog();
  snapshot.series.push({ ...make('series'), name: 'Series', aliases: [] });
  snapshot.books.push({ ...make('book'), title: 'Volume', series_id: 'series', volume_label: '上', sort_order: 1 });
  const holding = { book_id: 'book', provider: 'kindle', provider_book_id: 'ASIN', external_url: null };
  snapshot.holdings.push({ ...make('ku'), ...holding, access_type: 'subscription_loan', availability_status: 'returned' },
    { ...make('purchase'), ...holding, access_type: 'purchased', availability_status: 'active' });
  snapshot.access_periods.push({ ...make('loan1'), holding_id: 'ku', started_at: 100, ended_at: 400, end_reason: 'returned' },
    { ...make('loan2'), holding_id: 'ku', started_at: 500, ended_at: 600, end_reason: 'returned' });
  snapshot.reading_events.push({ ...make('finished'), holding_id: 'ku', access_period_id: 'loan1', event_type: 'completed', occurred_at: 300, recorded_at: 300, progress_percent: 100, source: 'manual' });
  snapshot.manual_reading_states.push({ ...make('state'), holding_id: 'ku', status: 'reading', progress_percent: 42, reread_wanted: true });
  return snapshot;
}

test('JSON round trip preserves KU loan periods, past completion, reread progress and purchased copy', () => {
  const fixture = kuFixture();
  assert.deepEqual(validateCatalog(JSON.parse(JSON.stringify(fixture))), fixture);
});

test('invalid schema, references, progress and secret fields fail before replacement', () => {
  for (const mutate of [
    s => { s.schemaVersion = 99; }, s => { s.books[0].series_id = 'missing'; },
    s => { s.reading_events[0].access_period_id = 'missing'; },
    s => { s.manual_reading_states[0].progress_percent = 101; },
    s => { s.holdings[0].cookie = 'secret'; }, s => { s.holdings[0].external_url = 'javascript:alert(1)'; },
    s => { s.books.push(s.books[0]); },
    s => { s.books[0].volume_label = 1; }, s => { s.manual_reading_states[0].reread_wanted = 'yes'; },
  ]) {
    const fixture = kuFixture(); mutate(fixture);
    assert.throws(() => validateCatalog(fixture), TypeError);
  }
});
