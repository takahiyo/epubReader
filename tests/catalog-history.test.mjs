import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCatalog } from '../assets/js/core/catalog-model.js';
import { previewCatalogCSV } from '../assets/js/core/catalog-csv.js';
import { saveCatalogHistory, parseCatalogLocalDate, catalogLocalDate, catalogCompletedHoldings } from '../assets/js/core/catalog-history.js';
import { saveCatalogEntry } from '../assets/js/core/catalog-actions.js';

const now = new Date('2026-10-08T12:00:00').getTime();
/** @returns {Object} Returned KU holding and independent rereading state. */
function fixture() {
  const c = previewCatalogCSV(emptyCatalog(), 'title,provider,access_type,availability_status\nBook,kindle,subscription_loan,returned').next;
  c.manual_reading_states.push({ id: 'state', revision: 1, created_at: 1, updated_at: 1, deleted_at: null, holding_id: c.holdings[0].id, status: 'reading', progress_percent: 42, reread_wanted: true });
  return c;
}
/** @param {Object} c Catalog @param {string} kind Entry kind @param {Object} values Input @returns {Object} Revision-bound command. */
function command(c, kind, values) { return { holdingId: c.holdings[0].id, holdingRevision: c.holdings[0].revision, kind, values }; }

test('past and unknown completion dates preserve current progress, access and original input', () => {
  const c = fixture(), before = structuredClone(c);
  const next = saveCatalogHistory(c, command(c, 'event', { event_type: 'completed', occurred_at: '2026-09-30T23:59:59', progress_percent: '100' }), { now });
  assert.deepEqual(c, before); assert.deepEqual(next.holdings, c.holdings); assert.deepEqual(next.manual_reading_states, c.manual_reading_states);
  assert.equal(next.reading_events[0].recorded_at, now);
  assert.ok(catalogCompletedHoldings(next, '2026-09').has(c.holdings[0].id)); assert.equal(catalogCompletedHoldings(next, '2026-10').size, 0);
  const unknown = saveCatalogHistory(next, command(next, 'event', { event_type: 'completed', occurred_at: '', progress_percent: '' }), { now });
  assert.equal(unknown.reading_events[1].occurred_at, null); assert.equal(unknown.reading_events[1].progress_percent, null);
  assert.equal(catalogCompletedHoldings(unknown, '2026-10').size, 0);
});

test('local month boundaries use occurrence date and exclude unknown, deleted and non-completion events', () => {
  let c = fixture();
  for (const value of ['2026-09-30T23:59', '2026-10-01T00:00', '2026-10-08T00:00']) c = saveCatalogHistory(c, command(c, 'event', { event_type: 'completed', occurred_at: value, progress_percent: '' }), { now });
  assert.equal(catalogCompletedHoldings(c, '2026-10').size, 1);
  c.reading_events[1].deleted_at = now; c.reading_events[2].event_type = 'reading';
  assert.equal(catalogCompletedHoldings(c, '2026-10').size, 0); assert.equal(catalogCompletedHoldings(c, ''), null);
});

test('correction retains registration time and unchanged milliseconds; stale correction fails without mutation', () => {
  let c = fixture(); c = saveCatalogHistory(c, command(c, 'event', { event_type: 'completed', occurred_at: '2026-10-01T00:00', progress_percent: '100' }), { now });
  const e = c.reading_events[0]; e.occurred_at += 123;
  const cmd = { ...command(c, 'event', { event_type: 'completed', occurred_at: catalogLocalDate(e.occurred_at), progress_percent: '100' }), id: e.id, revision: e.revision };
  const same = saveCatalogHistory(c, cmd, { now: now + 1 }); assert.equal(same.reading_events[0].occurred_at, e.occurred_at);
  cmd.values.occurred_at = '2026-09-30T23:00'; const corrected = saveCatalogHistory(c, cmd, { now: now + 1 });
  assert.equal(corrected.reading_events[0].recorded_at, now); assert.equal(corrected.reading_events[0].revision, 2);
  const before = structuredClone(corrected); assert.throws(() => saveCatalogHistory(corrected, cmd, { now }), { code: 'conflict' }); assert.deepEqual(corrected, before);
});

test('closed historical loans preserve current state and reject invalid, overlapping or future periods', () => {
  const c = fixture(), values = { started_at: '2026-09-01T00:00', ended_at: '2026-09-10T00:00' };
  const next = saveCatalogHistory(c, command(c, 'period', values), { now }); assert.deepEqual(next.holdings, c.holdings); assert.deepEqual(next.manual_reading_states, c.manual_reading_states);
  for (const dates of [values, { started_at: '2026-09-05T00:00', ended_at: '2026-09-12T00:00' }, { started_at: '2026-09-12T00:00', ended_at: '2026-09-11T00:00' }, { started_at: '', ended_at: '' }, { started_at: '', ended_at: '2026-10-09T00:00' }]) {
    const before = structuredClone(next); assert.throws(() => saveCatalogHistory(next, command(next, 'period', dates), { now })); assert.deepEqual(next, before);
  }
  assert.equal(saveCatalogHistory(next, command(next, 'period', { started_at: '', ended_at: '2026-08-01T00:00' }), { now }).access_periods.length, 2);
  const purchased = structuredClone(c); purchased.holdings[0].access_type = 'purchased'; assert.throws(() => saveCatalogHistory(purchased, command(purchased, 'period', values), { now }));
});

test('active period date correction cannot close a loan or modify availability', () => {
  const c = fixture(); c.holdings[0].availability_status = 'active';
  c.access_periods.push({ id: 'loan', revision: 1, created_at: 1, updated_at: 1, deleted_at: null, holding_id: c.holdings[0].id, started_at: now - 1000, ended_at: null, end_reason: null });
  const cmd = { ...command(c, 'period', { started_at: '2026-10-01T00:00', ended_at: '' }), id: 'loan', revision: 1 };
  const next = saveCatalogHistory(c, cmd, { now }); assert.equal(next.access_periods[0].ended_at, null); assert.deepEqual(next.holdings, c.holdings);
  cmd.values.ended_at = '2026-10-07T00:00'; assert.throws(() => saveCatalogHistory(c, cmd, { now }));
});

test('invalid calendar, future date, progress and holding revision are rejected', () => {
  for (const value of ['2026-02-30T12:00', '2026-13-01T00:00', '2026-10-01T25:00', 'anything']) assert.throws(() => parseCatalogLocalDate(value));
  assert.equal(parseCatalogLocalDate(''), null);
  for (const values of [{ event_type: 'completed', occurred_at: '2026-10-09T00:00', progress_percent: '' }, { event_type: 'completed', occurred_at: '', progress_percent: '101' }, { event_type: 'oops', occurred_at: '', progress_percent: '' }]) {
    const c = fixture(); assert.throws(() => saveCatalogHistory(c, command(c, 'event', values), { now }));
  }
  const c = fixture(), cmd = command(c, 'event', { event_type: 'completed', occurred_at: '', progress_percent: '' }); cmd.holdingRevision++;
  assert.throws(() => saveCatalogHistory(c, cmd, { now }), { code: 'conflict' });
});

test('changing only reread preference does not invent a new completion date', () => {
  let c = fixture(); c.manual_reading_states[0].status = 'completed'; c.manual_reading_states[0].progress_percent = 100;
  c = saveCatalogHistory(c, command(c, 'event', { event_type: 'completed', occurred_at: '2026-09-01T12:00', progress_percent: '100' }), { now });
  const book = c.books[0], holding = c.holdings[0], events = structuredClone(c.reading_events);
  saveCatalogEntry(c, { bookId: book.id, bookRevision: book.revision, holdingId: holding.id, holdingRevision: holding.revision,
    values: { ...book, ...holding, status: 'completed', progress_percent: '100', reread_wanted: false } }, { now });
  assert.deepEqual(c.reading_events, events); assert.equal(c.manual_reading_states[0].reread_wanted, false);
  assert.equal(catalogCompletedHoldings(c, '2026-10').size, 0);
});

