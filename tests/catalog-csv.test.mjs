import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CSV as CSV } from '../assets/constants.js';
import { emptyCatalog } from '../assets/js/core/catalog-model.js';
import { parseCatalogCSV, previewCatalogCSV, applyCatalogCSV, exportCatalogCSV } from '../assets/js/core/catalog-csv.js';

/** @returns {Object} Stable identities and timestamps for precise preservation assertions. */
function deps() { let id = 0; return { now: 1000, uuid: () => 'csv-' + ++id }; }

test('selected CSV exports all holdings, shared volume keys and exact import columns without reader IDs/history', () => {
  const source = previewCatalogCSV(emptyCatalog(), 'title,provider,series,volume_label,sort_order,provider_book_id,book_key\nA,kindle,Series,上,0,A,one\nA,unext,Series,上,0,U,one\nB,kindle,Series,下,2,B,two', deps()).next;
  source.holdings[0].legacy_book_id = 'private-reader-id';
  const before = structuredClone(source), text = exportCatalogCSV(source, [source.books[0].id]);
  const rows = parseCatalogCSV(text), index = name => rows[0].cells.indexOf(name);
  assert.deepEqual(rows[0].cells, [...CSV.columns]); assert.equal(rows.length, 3);
  assert.deepEqual(rows.slice(1).map(row => row.cells[index('provider')]), ['kindle', 'unext']);
  assert.equal(rows[1].cells[index('book_key')], rows[2].cells[index('book_key')]);
  assert.equal(rows[1].cells[index('sort_order')], '0'); assert.equal(text.startsWith('\uFEFF'), true); assert.equal(text.endsWith('\r\n'), true);
  assert.equal(text.includes('private-reader-id'), false); assert.equal(text.includes('progress_percent'), false);
  assert.equal(previewCatalogCSV(source, text).counts.duplicate, 2);
  assert.deepEqual(source, before);
});

test('filled CSV examples quote punctuation, neutralize spreadsheet formulas and import the intended values', () => {
  const source = previewCatalogCSV(emptyCatalog(), 'title,provider,format\nA,local,epub', deps()).next;
  source.books[0].title = '=1+2,"quote"\nnext'; source.books[0].author = '＠author'; source.books[0].sort_order = -1;
  const text = exportCatalogCSV(source, [source.books[0].id]);
  assert.ok(text.includes('"\t=1+2,""quote""\nnext"')); assert.ok(text.includes('"\t＠author"')); assert.ok(text.includes('"\t-1"'));
  const p = previewCatalogCSV(emptyCatalog(), text);
  assert.equal(p.counts.error, 0); assert.equal(p.next.books[0].title, source.books[0].title); assert.equal(p.next.books[0].author, source.books[0].author); assert.equal(p.next.books[0].sort_order, -1);
});

test('CSV export rejects empty/stale selections and oversized output; deleted holdings are excluded', () => {
  const source = previewCatalogCSV(emptyCatalog(), 'title,provider,book_key\nA,kindle,one\nA,unext,one', deps()).next, id = source.books[0].id;
  assert.throws(() => exportCatalogCSV(source, [])); assert.throws(() => exportCatalogCSV(source, ['missing']));
  source.holdings[1].deleted_at = 20; assert.equal(parseCatalogCSV(exportCatalogCSV(source, [id])).length, 2);
  source.books[0].title = 'x'.repeat(CSV.maxBytes); assert.throws(() => exportCatalogCSV(source, [id]), error => error.csvReason === CSV.errors.limit);
  source.books[0].deleted_at = 20; assert.throws(() => exportCatalogCSV(source, [id]), error => error.csvReason === CSV.errors.selection);
});

test('CSV parses BOM, CRLF, commas, escaped quotes and multiline physical line numbers', () => {
  const rows = parseCatalogCSV('\uFEFFtitle,provider\r\n"a, ""quote""\r\nb",kindle\r\nnext,unext\r\n');
  assert.equal(rows[1].cells[0], 'a, "quote"\r\nb'); assert.equal(rows[2].line, 4);
  for (const text of ['"a', 'a"b,c', '"a"b,c']) assert.throws(() => parseCatalogCSV(text));
});

test('mixed series CSV adds explicit multi-provider volumes, keeps unknown dates and local file unbound', () => {
  const source = emptyCatalog(), before = structuredClone(source);
  const csv = 'title,provider,series,volume_label,sort_order,format,provider_book_id,access_type,availability_status,book_key\n' +
    'Series 1,local,Series,上,1,epub,,,active,one\n' +
    'Series 1,kindle,Series,上,1,,ASIN1,purchased,active,one\n' +
    'Series 2,unext,Series,10.5,2,,U2,,unknown,two\n' +
    'Series 1,kindle,Series,上,1,,ASIN1,subscription_loan,returned,one\n';
  const preview = previewCatalogCSV(source, csv, deps());
  assert.deepEqual(source, before); assert.equal(preview.counts.add, 4); assert.equal(preview.counts.error, 0);
  assert.equal(preview.counts.books, 2); assert.equal(preview.counts.series, 1);
  const next = applyCatalogCSV(source, preview);
  assert.equal(new Set(next.holdings.filter(row => row.provider === 'kindle').map(row => row.book_id)).size, 1);
  assert.equal(next.holdings[0].legacy_book_id, null);
  assert.equal(next.manual_reading_states.length, 0); assert.equal(next.access_periods.length, 0); assert.equal(next.reading_events.length, 0);
  const again = previewCatalogCSV(next, csv, { now: 2000, uuid: () => crypto.randomUUID() });
  assert.equal(again.counts.duplicate, 3); assert.equal(again.counts.add, 1); // Local without ID cannot establish identity.
});

test('duplicate provider IDs never update existing metadata, KU progress, events or periods', () => {
  const p = previewCatalogCSV(emptyCatalog(), 'title,provider,provider_book_id,access_type\nOriginal,kindle,A,subscription_loan', deps());
  const source = p.next, h = source.holdings[0];
  source.access_periods.push({ id: 'period', revision: 1, created_at: 1, updated_at: 1, deleted_at: null, holding_id: h.id, started_at: 1, ended_at: 20, end_reason: 'returned' });
  source.reading_events.push({ id: 'event', revision: 1, created_at: 1, updated_at: 1, deleted_at: null, holding_id: h.id, access_period_id: 'period', event_type: 'completed', occurred_at: 10, recorded_at: 10, progress_percent: 100, source: 'manual' });
  const before = structuredClone(source);
  const result = previewCatalogCSV(source, 'title,provider,provider_book_id,access_type\nChanged,kindle,A,subscription_loan\nNew,unext,U,purchased');
  assert.equal(result.counts.duplicate, 1); assert.equal(result.counts.add, 1); assert.equal(result.counts.update, 0);
  const next = applyCatalogCSV(source, result);
  for (const name of Object.keys(before).filter(name => Array.isArray(before[name]))) for (const row of before[name]) assert.deepEqual(next[name].find(value => value.id === row.id), row);
});

test('same-title candidates remain separate; repeated IDs skip within the file', () => {
  const p = previewCatalogCSV(emptyCatalog(), 'title,provider,provider_book_id\nSame,kindle,A\nSame,unext,U\nOther,kindle,A', deps());
  assert.equal(p.counts.books, 2); assert.equal(p.counts.candidates, 1); assert.equal(p.counts.duplicate, 1);
  assert.notEqual(p.next.holdings[0].book_id, p.next.holdings[1].book_id);
});

test('book_key consistency includes skipped rows without linking additions to existing volumes', () => {
  const original = previewCatalogCSV(emptyCatalog(), 'title,provider,provider_book_id\nA,kindle,ID', deps()).next;
  const p = previewCatalogCSV(original, 'title,provider,provider_book_id,series,book_key\nA,kindle,ID,NewSeries,k\nA,unext,U,NewSeries,k');
  assert.equal(p.counts.error, 0); assert.equal(p.counts.duplicate, 1); assert.equal(p.counts.add, 1);
  assert.notEqual(p.next.holdings[0].book_id, p.next.holdings[1].book_id);
  const bad = previewCatalogCSV(original, 'title,provider,provider_book_id,book_key\nA,kindle,ID,k\nDifferent,unext,U,k');
  assert.equal(bad.rows[1].reason, CSV.errors.group);
});

test('row errors block all writes; validation cannot be bypassed by duplicate detection', () => {
  const csv = 'title,provider,sort_order,external_url,format,book_key\n' +
    'Valid,kindle,,,,key\nDifferent,unext,,,,key\nBad,kindle,1.5,,,\nBad,kindle,,http://example.test,,\nBad,local,,,pdf,\n,kindle,,,,\nShort,unext';
  const source = emptyCatalog(), p = previewCatalogCSV(source, csv, deps());
  assert.equal(p.counts.add, 1); assert.equal(p.counts.error, 6);
  assert.equal(p.rows[1].reason, CSV.errors.group); assert.throws(() => applyCatalogCSV(source, p));
  assert.deepEqual(source, emptyCatalog());
  const duplicateBad = previewCatalogCSV(emptyCatalog(), 'title,provider,provider_book_id,external_url\nA,kindle,A,\nA,kindle,A,javascript:alert(1)', deps());
  assert.equal(duplicateBad.counts.error, 1); assert.equal(duplicateBad.counts.duplicate, 0);
});

test('header errors, limits and concurrent catalog changes reject without persistence', () => {
  for (const csv of ['title\nA', 'title,provider,provider\nA,kindle,kindle', 'title,provider,cookie\nA,kindle,secret']) assert.throws(() => previewCatalogCSV(emptyCatalog(), csv));
  assert.throws(() => parseCatalogCSV('x'.repeat(CSV.maxBytes + 1)));
  assert.throws(() => parseCatalogCSV('title,provider\n' + 'A,kindle\n'.repeat(CSV.maxRows + 1)));
  const source = emptyCatalog(), p = previewCatalogCSV(source, 'title,provider\nA,kindle', deps());
  source.series.push({ id: 'another', revision: 1, created_at: 1, updated_at: 1, deleted_at: null, name: 'Changed', aliases: [] });
  assert.throws(() => applyCatalogCSV(source, p), error => error.code === 'conflict');
});
