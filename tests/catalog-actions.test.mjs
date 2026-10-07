import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCatalog, validateCatalog } from '../assets/js/core/catalog-model.js';
import { saveCatalogEntry, changeCatalogLoan, bindCatalogFile, catalogRows } from '../assets/js/core/catalog-actions.js';

const values = { title: 'Book １', author: 'Author', new_series: 'Series', volume_label: '上', sort_order: '1', edition: '',
  provider: 'kindle', format: '', provider_book_id: 'ASIN', external_url: 'https://example.com/book', access_type: 'subscription_loan',
  availability_status: 'unknown', status: 'unread', progress_percent: '', reread_wanted: false };
const dependencies = () => { let id = 0; return { now: 100, uuid: () => `id-${++id}` }; };

test('explicit same-volume holdings retain book identity while same-title registrations stay separate', () => {
  const options = dependencies();
  let catalog = saveCatalogEntry(emptyCatalog(), { values }, options);
  const book = catalog.books[0];
  catalog = saveCatalogEntry(catalog, { bookId: book.id, bookRevision: book.revision,
    values: { ...values, new_series: '', series_id: book.series_id, provider: 'unext', access_type: 'purchased' } }, options);
  assert.equal(catalog.books.length, 1); assert.equal(catalog.holdings.length, 2);
  assert.equal(catalog.holdings[1].book_id, book.id);
  catalog = saveCatalogEntry(catalog, { values: { ...values, new_series: '', provider_book_id: '' } }, options);
  assert.equal(validateCatalog(catalog).books.length, 2);
  assert.ok(catalogRows(catalog)[0].search.includes('book 1'));
});

test('KU borrow, completion, return, reborrow and reread preserve earlier history and purchase identity', () => {
  const options = dependencies(); let catalog = saveCatalogEntry(emptyCatalog(), { values }, options);
  const holding = catalog.holdings[0], book = catalog.books[0];
  catalog = changeCatalogLoan(catalog, { holdingId: holding.id, revision: holding.revision, action: 'borrow' }, { ...options, now: 200 });
  const period = catalog.access_periods[0];
  catalog = saveCatalogEntry(catalog, { bookId: book.id, bookRevision: book.revision, holdingId: holding.id, holdingRevision: holding.revision,
    values: { ...values, new_series: '', series_id: book.series_id, status: 'completed', progress_percent: '100' } }, { ...options, now: 300 });
  catalog = changeCatalogLoan(catalog, { holdingId: holding.id, revision: holding.revision, action: 'return', periodId: period.id }, { ...options, now: 400 });
  assert.equal(catalog.manual_reading_states[0].status, 'completed');
  assert.equal(catalog.reading_events.find(row => row.event_type === 'completed').occurred_at, 300);
  assert.equal(period.ended_at, 400);
  catalog = changeCatalogLoan(catalog, { holdingId: holding.id, revision: holding.revision, action: 'borrow' }, { ...options, now: 500 });
  catalog = saveCatalogEntry(catalog, { bookId: book.id, bookRevision: book.revision, holdingId: holding.id, holdingRevision: holding.revision,
    values: { ...values, new_series: '', series_id: book.series_id, status: 'reading', progress_percent: '42', reread_wanted: true } }, { ...options, now: 600 });
  assert.equal(catalog.access_periods.length, 2);
  assert.equal(catalog.reading_events.find(row => row.event_type === 'completed').access_period_id, period.id);
  assert.equal(catalog.manual_reading_states[0].progress_percent, 42);
  assert.equal(validateCatalog(catalog).holdings[0].availability_status, 'active');
});

test('stale editor and wrong loan identity cannot overwrite a newer operation', () => {
  const options = dependencies(); const catalog = saveCatalogEntry(emptyCatalog(), { values }, options);
  const holding = catalog.holdings[0], originalRevision = holding.revision;
  changeCatalogLoan(catalog, { holdingId: holding.id, revision: originalRevision, action: 'borrow' }, options);
  assert.throws(() => changeCatalogLoan(catalog, { holdingId: holding.id, revision: originalRevision, action: 'return' }, options), /conflict/);
  assert.throws(() => changeCatalogLoan(catalog, { holdingId: holding.id, revision: holding.revision, action: 'return', periodId: 'wrong' }, options), /conflict/);
  assert.equal(catalog.access_periods[0].ended_at, null);
});

test('same provider ID rejects duplicate borrowing but permits a purchased holding', () => {
  const options = dependencies(); const catalog = saveCatalogEntry(emptyCatalog(), { values }, options);
  assert.throws(() => saveCatalogEntry(structuredClone(catalog), { values: { ...values, provider_book_id: ' ASIN ' } }, options), /conflict/);
  const book = catalog.books[0];
  const purchased = saveCatalogEntry(catalog, { bookId: book.id, bookRevision: book.revision,
    values: { ...values, series_id: book.series_id, new_series: '', access_type: 'purchased' } }, options);
  assert.equal(purchased.holdings.length, 2);
});

test('Local file binding uses explicit identity and rejects a file already linked elsewhere', () => {
  const options = dependencies(); const catalog = saveCatalogEntry(emptyCatalog(), { values: { ...values, provider: 'local', provider_book_id: '', access_type: 'purchased' } }, options);
  const holding = catalog.holdings[0];
  bindCatalogFile(catalog, { holdingId: holding.id, revision: holding.revision, bookId: 'reader-id', format: 'cbz' }, 200);
  assert.equal(validateCatalog(catalog).holdings[0].legacy_book_id, 'reader-id');
  const book = catalog.books[0];
  saveCatalogEntry(catalog, { bookId: book.id, bookRevision: book.revision,
    values: { ...values, series_id: book.series_id, new_series: '', provider: 'local', provider_book_id: '', access_type: 'purchased' } }, options);
  const other = catalog.holdings[1];
  assert.throws(() => bindCatalogFile(catalog, { holdingId: other.id, revision: other.revision, bookId: 'reader-id' }, 300), /conflict/);
});
