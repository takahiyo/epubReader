/** Explicit historical dates are independent of current progress and loan status. */
import { CATALOG_CONFIG as C, CATALOG_HISTORY as H } from '../../constants.js';
import { catalogRecord, validateCatalog } from './catalog-model.js';

/** @param {string} code Failure category @returns {Error} Translatable error. */
function failure(code = C.errorCodes.invalid) { const error = new TypeError(code); error.code = code; error.historyInvalid = code === C.errorCodes.invalid; return error; }

/** @param {number|null} value UTC timestamp @returns {string} Local datetime input including seconds. */
export function catalogLocalDate(value) {
  if (value == null) return '';
  const date = new Date(value), pad = part => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** @param {string} value Local datetime or empty unknown @returns {number|null} UTC milliseconds; rejects normalized invalid dates. */
export function parseCatalogLocalDate(value) {
  if (value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw failure();
  const date = new Date(value), result = date.getTime();
  // Reject impossible calendar dates and times lost in a daylight-saving transition.
  if (!Number.isSafeInteger(result) || result < 0 || catalogLocalDate(result) !== (value.length === 16 ? value + ':00' : value)) throw failure();
  return result;
}

/**
 * Add/correct one historical event or loan period, with revision checks and atomic validation.
 * New loan history must already be closed; live borrowing/returning uses its existing command.
 * @param {Object} snapshot Catalog @param {Object} command Holding/record revisions, kind and values
 * @param {Object} dependencies Clock and UUID @returns {Object} Independent validated candidate
 */
export function saveCatalogHistory(snapshot, command, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const next = validateCatalog(snapshot), holding = next.holdings.find(row => row.id === command.holdingId);
  if (!holding || holding.deleted_at != null || holding.revision !== command.holdingRevision) throw failure(C.errorCodes.conflict);
  const isEvent = command.kind === H.kinds.event;
  if (!isEvent && command.kind !== H.kinds.period) throw failure();
  const collection = isEvent ? next.reading_events : next.access_periods;
  let record = collection.find(row => row.id === command.id);
  if (command.id && (!record || record.deleted_at != null || record.holding_id !== holding.id || record.revision !== command.revision)) throw failure(C.errorCodes.conflict);
  const v = command.values; let values;
  // Preserve subsecond precision if the displayed second has not been edited.
  const timestamp = key => record && v[key] === catalogLocalDate(record[key]) ? record[key] ?? null : parseCatalogLocalDate(v[key]);
  if (isEvent) {
    const occurred = timestamp('occurred_at');
    const progress = v.progress_percent === '' ? null : Number(v.progress_percent);
    if (!C.readingStates.includes(v.event_type) || (occurred != null && occurred > now) ||
      (progress != null && (!Number.isFinite(progress) || progress < 0 || progress > 100))) throw failure();
    values = { event_type: v.event_type, occurred_at: occurred, progress_percent: progress };
  } else {
    if (holding.access_type !== C.accessTypes[1]) throw failure();
    const started = timestamp('started_at'), ended = timestamp('ended_at');
    const active = record && record.ended_at == null;
    // Editing dates cannot silently return a live loan or reopen a returned loan.
    if ((!active && ended == null) || (active && ended != null) || (started != null && started > now) ||
      (ended != null && ended > now) || (started != null && ended != null && started > ended)) throw failure();
    // Known intervals for one subscription holding may touch, but cannot overlap.
    for (const other of collection) if (other.id !== record?.id && other.holding_id === holding.id && other.deleted_at == null &&
      started != null && other.started_at != null && started < (other.ended_at ?? Infinity) && other.started_at < (ended ?? Infinity)) throw failure();
    values = { started_at: started, ended_at: ended };
  }
  if (record) Object.assign(record, values, { revision: record.revision + 1, updated_at: now });
  else {
    record = { ...catalogRecord(uuid, now), holding_id: holding.id, ...values };
    Object.assign(record, isEvent ? { access_period_id: null, recorded_at: now, source: C.sources.manual }
      : { end_reason: C.availabilityStates[1] });
    collection.push(record);
  }
  // recorded_at remains the original registration time when correcting a historical date.
  return validateCatalog(next);
}

/** @param {Object} snapshot Catalog @param {string} month Local YYYY-MM or blank @returns {Set<string>|null} Holdings completed in the month; unknown dates never guessed. */
export function catalogCompletedHoldings(snapshot, month) {
  if (!month) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new Set();
  const start = new Date(month + '-01T00:00:00');
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  return new Set(snapshot.reading_events.filter(row => row.deleted_at == null && row.event_type === H.completed &&
    row.occurred_at != null && row.occurred_at >= start.getTime() && row.occurred_at < end.getTime()).map(row => row.holding_id));
}
