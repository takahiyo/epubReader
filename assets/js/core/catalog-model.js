/** Pure catalog validation and additive migration; never reads or modifies reader storage. */
import { CATALOG_CONFIG as C, BOOK_TYPES } from '../../constants.js';

/** @returns {Object} Empty, versioned catalog backup without book contents or credentials. */
export function emptyCatalog() {
  return { schemaVersion: C.schemaVersion, ...Object.fromEntries(Object.keys(C.fields).map(name => [name, []])) };
}

/** @param {boolean} valid Condition @param {string} message Diagnostic @returns {void} Throws on invalid input. */
function requireValue(valid, message) {
  if (!valid) throw new TypeError(message);
}

/**
 * Validate all identities and references before a backup can replace persisted data.
 * Unknown fields are rejected, rather than inadvertently backing up secrets or body data.
 * @param {Object} input Versioned backup
 * @returns {Object} Independent validated copy
 */
export function validateCatalog(input) {
  requireValue(input?.schemaVersion === C.schemaVersion, 'Unsupported catalog schema');
  const output = emptyCatalog();
  const names = Object.keys(C.fields);
  requireValue(Object.keys(input).every(key => key === 'schemaVersion' || names.includes(key)), 'Unknown backup field');
  for (const name of names) {
    requireValue(Array.isArray(input[name]), `Missing catalog collection: ${name}`);
    const ids = new Set();
    const allowed = [...C.commonFields, ...C.fields[name]];
    for (const record of input[name]) {
      requireValue(record && typeof record === 'object' && !Array.isArray(record), 'Invalid record');
      requireValue(Object.keys(record).every(key => allowed.includes(key)), `Unknown ${name} field`);
      requireValue(typeof record.id === 'string' && record.id.length > 0 && !ids.has(record.id), `Duplicate or invalid ${name} ID`);
      ids.add(record.id);
      requireValue(Number.isInteger(record.revision) && record.revision > 0, 'Invalid revision');
      for (const key of ['created_at', 'updated_at', 'deleted_at', 'started_at', 'ended_at', 'occurred_at', 'recorded_at', 'availability_checked_at']) {
        if (record[key] != null) requireValue(Number.isSafeInteger(record[key]) && record[key] >= 0, `Invalid timestamp: ${key}`);
      }
      requireValue(Number.isSafeInteger(record.created_at) && Number.isSafeInteger(record.updated_at), 'Missing timestamps');
      for (const [key, value] of Object.entries(record)) {
        const valid = value == null || (C.numericFields.includes(key) ? typeof value === 'number' && Number.isFinite(value)
          : C.booleanFields.includes(key) ? typeof value === 'boolean'
          : key === 'aliases' ? Array.isArray(value) && value.every(alias => typeof alias === 'string') : typeof value === 'string');
        requireValue(valid, `Invalid field type: ${key}`);
      }
      if ('progress_percent' in record) requireValue(record.progress_percent == null || (typeof record.progress_percent === 'number' && record.progress_percent >= 0 && record.progress_percent <= 100), 'Invalid progress');
      output[name].push(structuredClone(record));
    }
  }
  const indexes = Object.fromEntries(names.map(name => [name, new Map(output[name].map(record => [record.id, record]))]));
  const has = (name, id) => indexes[name].has(id);
  for (const series of output.series) requireValue(typeof series.name === 'string' && !!series.name.trim(), 'Series name required');
  for (const book of output.books) {
    requireValue(typeof book.title === 'string' && !!book.title.trim(), 'Book title required');
    requireValue(book.series_id == null || has('series', book.series_id), 'Missing series');
    requireValue(book.sort_order == null || Number.isSafeInteger(book.sort_order), 'Invalid volume order');
    requireValue(book.volume_label == null || typeof book.volume_label === 'string', 'Volume label must be text');
  }
  for (const holding of output.holdings) {
    requireValue(has('books', holding.book_id), 'Missing book');
    requireValue(C.providers.includes(holding.provider), 'Unknown provider');
    requireValue(C.accessTypes.includes(holding.access_type), 'Unknown access type');
    requireValue(C.availabilityStates.includes(holding.availability_status), 'Unknown availability');
    if (holding.external_url) {
      let url;
      try { url = new URL(holding.external_url); } catch { throw new TypeError('Invalid reader URL'); }
      requireValue(url.protocol === 'https:' && !url.username && !url.password, 'Reader URL must use HTTPS without credentials');
    }
  }
  const activeLoans = new Set();
  for (const period of output.access_periods) {
    requireValue(has('holdings', period.holding_id), 'Missing loan holding');
    requireValue(indexes.holdings.get(period.holding_id).access_type === C.accessTypes[1], 'Loan period requires subscription holding');
    if (period.ended_at == null && period.deleted_at == null) {
      requireValue(!activeLoans.has(period.holding_id), 'Duplicate active loan'); activeLoans.add(period.holding_id);
    }
    requireValue(period.started_at == null || period.ended_at == null || period.started_at <= period.ended_at, 'Loan ends before it starts');
  }
  for (const event of output.reading_events) {
    requireValue(has('holdings', event.holding_id), 'Missing event holding');
    requireValue(typeof event.event_type === 'string' && event.event_type.length > 0, 'Missing event type');
    requireValue(event.access_period_id == null || indexes.access_periods.get(event.access_period_id)?.holding_id === event.holding_id, 'Mismatched event loan');
  }
  const stateHoldings = new Set();
  for (const state of output.manual_reading_states) {
    requireValue(has('holdings', state.holding_id) && !stateHoldings.has(state.holding_id), 'Missing or duplicate reading state');
    requireValue(C.readingStates.includes(state.status), 'Unknown reading status');
    stateHoldings.add(state.holding_id);
  }
  return output;
}

/** @param {Function} uuid ID generator @param {number} now UTC milliseconds @returns {Object} Common record metadata. */
export function catalogRecord(uuid, now) {
  return { id: uuid(), revision: 1, created_at: now, updated_at: now, deleted_at: null };
}

/**
 * Hide unused series after a successful catalog mutation. Tombstones retain identities
 * for future sync and references from deleted books without cluttering series choices.
 * @param {Object} catalog Mutable candidate @param {number} now UTC clock
 * @returns {Object} Candidate with only unused active series marked deleted
 */
export function pruneUnusedCatalogSeries(catalog, now = Date.now()) {
  const used = new Set(catalog.books.filter(book => book.deleted_at == null && book.series_id).map(book => book.series_id));
  for (const series of catalog.series) if (series.deleted_at == null && !used.has(series.id)) {
    series.deleted_at = now; series.updated_at = now; series.revision++;
  }
  return catalog;
}

/**
 * Add legacy local holdings once per explicit reader ID. Titles never establish identity.
 * Cloud records linked to local IDs enrich that holding; web novels remain in their existing shelf.
 * Historical progress is intentionally left in reader storage until an explicit state migration.
 * @param {Object} catalog Current catalog
 * @param {Object} legacy Existing storage.data (read only)
 * @param {Object} options Clock and UUID dependencies
 * @returns {Object} Validated additive catalog
 */
export function migrateLegacyCatalog(catalog, legacy, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const next = validateCatalog(catalog);
  const localIds = new Map(next.holdings.filter(item => item.legacy_book_id).map(item => [item.legacy_book_id, item]));
  const cloudIds = new Map(next.holdings.filter(item => item.legacy_cloud_book_id).map(item => [item.legacy_cloud_book_id, item]));
  const add = (id, meta, cloudId = null) => {
    const name = meta.fileName || meta.name || '';
    const extension = name.split('.').pop().toLowerCase();
    const format = C.localFormats.includes(extension) ? extension : meta.type === BOOK_TYPES.EPUB ? BOOK_TYPES.EPUB : null;
    if (meta.type === C.legacyExcludedType || meta.isVirtualImageBook) return;
    const local = id && localIds.get(id);
    const cloud = cloudId && cloudIds.get(cloudId);
    // Previously separate user-edited holdings need explicit reconciliation; never silently erase one.
    requireValue(!local || !cloud || local.id === cloud.id, 'Conflicting legacy catalog links');
    const existing = local || cloud;
    if (existing) {
      // A cloud link may be established after the first migration; attach it without replacing user edits.
      if (cloudId && !existing.legacy_cloud_book_id) {
        existing.legacy_cloud_book_id = cloudId; existing.updated_at = now; existing.revision++;
        cloudIds.set(cloudId, existing);
      }
      if (id && !existing.legacy_book_id) {
        existing.legacy_book_id = id; existing.updated_at = now; existing.revision++;
        localIds.set(id, existing);
      }
      return;
    }
    const book = { ...catalogRecord(uuid, now), title: meta.title || name || id || cloudId, author: meta.author || meta.creator || '',
      series_id: null, volume_label: '', sort_order: null, edition: '' };
    next.books.push(book);
    const holding = { ...catalogRecord(uuid, now), book_id: book.id, provider: C.providers[0], format,
      provider_book_id: null, external_url: null, access_type: C.accessTypes[0], availability_status: 'unknown',
      availability_checked_at: null, source: C.sources.legacy, legacy_book_id: id, legacy_cloud_book_id: cloudId };
    next.holdings.push(holding);
    if (id) localIds.set(id, holding);
    if (cloudId) cloudIds.set(cloudId, holding);
  };
  for (const [id, meta] of Object.entries(legacy.library || {})) add(id, meta, legacy.bookLinkMap?.[id] || meta.cloudBookId || null);
  for (const [id, meta] of Object.entries(legacy.cloudIndex || {})) add(null, meta, id);
  return validateCatalog(next);
}
