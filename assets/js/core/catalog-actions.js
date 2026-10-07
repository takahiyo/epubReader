/** Catalog commands: synchronous, validated transforms executed within repository transactions. */
import { CATALOG_CONFIG as C } from '../../constants.js';
import { catalogRecord } from './catalog-model.js';

/** @param {string} code Error category @returns {Error} Typed, UI-translatable error. */
function failure(code) { const error = new Error(code); error.code = code; return error; }

/** @param {Object} row Record @param {number} expected Revision observed by editor @returns {void} Rejects stale editing. */
function checkRevision(row, expected) {
  if (!row || row.deleted_at != null || row.revision !== expected) throw failure(C.errorCodes.conflict);
}

/** @param {Object} row Existing record @param {Object} values Updated fields @param {number} now UTC milliseconds @returns {Object} Revised record. */
function revise(row, values, now) { Object.assign(row, values, { revision: row.revision + 1, updated_at: now }); return row; }

/**
 * Register/edit a volume and its holding; another holding shares an explicitly chosen book ID.
 * @param {Object} snapshot Transaction snapshot
 * @param {Object} command Editor values and expected revisions
 * @param {Object} dependencies UUID and clock
 * @returns {Object} Modified snapshot (validated by repository before committing)
 */
export function saveCatalogEntry(snapshot, command, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const { values: v, bookId, holdingId, bookRevision, holdingRevision } = command;
  const providerBookId = v.provider_book_id?.trim() || null;
  let book = snapshot.books.find(row => row.id === bookId);
  if (bookId) checkRevision(book, bookRevision);
  let holding = snapshot.holdings.find(row => row.id === holdingId);
  if (holdingId) checkRevision(holding, holdingRevision);
  if (holding && holding.book_id !== bookId) throw failure(C.errorCodes.conflict);
  if (providerBookId && snapshot.holdings.some(row => row.id !== holdingId && row.deleted_at == null &&
    row.provider === (holding?.provider || v.provider) && row.access_type === (holding?.access_type || v.access_type) && row.provider_book_id === providerBookId)) throw failure(C.errorCodes.conflict);
  let seriesId = v.series_id || null;
  if (v.new_series?.trim()) {
    const series = { ...catalogRecord(uuid, now), name: v.new_series.trim(), aliases: [] };
    snapshot.series.push(series); seriesId = series.id;
  }
  const bookValues = { title: v.title.trim(), author: v.author || '', series_id: seriesId,
    volume_label: v.volume_label || '', sort_order: v.sort_order === '' || v.sort_order == null ? null : Number(v.sort_order), edition: v.edition || '' };
  if (book) {
    if (Object.entries(bookValues).some(([key, value]) => book[key] !== value)) revise(book, bookValues, now);
  }
  else { book = { ...catalogRecord(uuid, now), ...bookValues }; snapshot.books.push(book); }
  const holdingValues = { provider: v.provider, format: v.format || null, provider_book_id: providerBookId,
    external_url: v.external_url?.trim() || null, access_type: v.access_type,
    availability_status: v.availability_status, source: C.sources.manual, availability_checked_at: now };
  if (holding) {
    // Changing service/ownership would reattribute the old history. Register a separate holding instead.
    holdingValues.provider = holding.provider; holdingValues.access_type = holding.access_type;
  }
  // Loan transitions are dedicated commands so editing cannot silently discard periods or history.
  if (holding && snapshot.access_periods.some(row => row.holding_id === holding.id)) {
    holdingValues.access_type = holding.access_type;
    holdingValues.availability_status = holding.availability_status;
  }
  if (holding) revise(holding, holdingValues, now);
  else { holding = { ...catalogRecord(uuid, now), book_id: book.id, ...holdingValues,
    legacy_book_id: null, legacy_cloud_book_id: null }; snapshot.holdings.push(holding); }
  const state = snapshot.manual_reading_states.find(row => row.holding_id === holding.id);
  const stateValues = { status: v.status, progress_percent: v.progress_percent === '' || v.progress_percent == null ? null : Number(v.progress_percent), reread_wanted: !!v.reread_wanted };
  if (!state || state.status !== stateValues.status || state.progress_percent !== stateValues.progress_percent || state.reread_wanted !== stateValues.reread_wanted) {
    if (state) revise(state, stateValues, now);
    else snapshot.manual_reading_states.push({ ...catalogRecord(uuid, now), holding_id: holding.id, ...stateValues });
    // Unknown old completion dates remain unknown; this event records today's explicit manual update.
    snapshot.reading_events.push({ ...catalogRecord(uuid, now), holding_id: holding.id,
      access_period_id: snapshot.access_periods.find(row => row.holding_id === holding.id && row.deleted_at == null && row.ended_at == null)?.id || null,
      event_type: v.status, occurred_at: now, recorded_at: now, progress_percent: stateValues.progress_percent, source: C.sources.manual });
  }
  return snapshot;
}

/**
 * Start/close one identified KU loan without deleting reading state or earlier periods.
 * @param {Object} snapshot Catalog snapshot @param {Object} command Holding, revision, action and target period
 * @param {Object} dependencies Clock/UUID @returns {Object} Updated snapshot
 */
export function changeCatalogLoan(snapshot, { holdingId, revision, action, periodId }, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const holding = snapshot.holdings.find(row => row.id === holdingId);
  checkRevision(holding, revision);
  if (holding.access_type !== C.accessTypes[1]) throw failure(C.errorCodes.invalid);
  const active = snapshot.access_periods.find(row => row.holding_id === holdingId && row.deleted_at == null && row.ended_at == null);
  if (action === C.loanActions.borrow) {
    if (active) throw failure(C.errorCodes.conflict);
    snapshot.access_periods.push({ ...catalogRecord(uuid, now), holding_id: holdingId, started_at: now, ended_at: null, end_reason: null });
    revise(holding, { availability_status: C.availabilityStates[0], availability_checked_at: now, source: C.sources.manual }, now);
  } else if (action === C.loanActions.return) {
    if (!active || active.id !== periodId) throw failure(C.errorCodes.conflict);
    revise(active, { ended_at: now, end_reason: C.availabilityStates[1] }, now);
    revise(holding, { availability_status: C.availabilityStates[1], availability_checked_at: now, source: C.sources.manual }, now);
  } else throw failure(C.errorCodes.invalid);
  return snapshot;
}

/** @param {string} value Search/display text @returns {string} Search normalization without altering stored labels. */
export function normalizeCatalogSearch(value) { return String(value || '').normalize('NFKC').toLocaleLowerCase().trim(); }

/** @param {Object} snapshot Catalog @param {Object} command Explicit file identity and observed holding revision @param {number} now Clock @returns {Object} Bound holding without title-based merging. */
export function bindCatalogFile(snapshot, { holdingId, revision, bookId, cloudBookId = null, format = null }, now = Date.now()) {
  const holding = snapshot.holdings.find(row => row.id === holdingId);
  checkRevision(holding, revision);
  if (holding.provider !== C.providers[0] || !bookId) throw failure(C.errorCodes.invalid);
  if (snapshot.holdings.some(row => row.id !== holdingId && (row.legacy_book_id === bookId || (cloudBookId && row.legacy_cloud_book_id === cloudBookId)))) throw failure(C.errorCodes.conflict);
  revise(holding, { legacy_book_id: bookId, legacy_cloud_book_id: cloudBookId, format }, now);
  return snapshot;
}

/** @param {Object} snapshot Catalog @returns {Object[]} Searchable books with explicit series/holdings; no title-based merge. */
export function catalogRows(snapshot) {
  const series = new Map(snapshot.series.filter(row => row.deleted_at == null).map(row => [row.id, row]));
  const holdings = new Map();
  for (const row of snapshot.holdings) {
    if (row.deleted_at != null) continue;
    if (!holdings.has(row.book_id)) holdings.set(row.book_id, []);
    holdings.get(row.book_id).push(row);
  }
  // IndexedDB's UUID key order is random; keep provider choices in a stable order across reopening.
  for (const group of holdings.values()) group.sort((a, b) => C.providers.indexOf(a.provider) - C.providers.indexOf(b.provider) || C.accessTypes.indexOf(a.access_type) - C.accessTypes.indexOf(b.access_type));
  return snapshot.books.filter(row => row.deleted_at == null).map(book => {
    const group = series.get(book.series_id);
    return { book, series: group, holdings: holdings.get(book.id) || [],
      search: normalizeCatalogSearch([book.title, book.author, book.volume_label, book.edition, group?.name, ...(group?.aliases || [])].join(' ')) };
  }).sort((a, b) => (a.series?.name || '').localeCompare(b.series?.name || '') ||
    (a.book.sort_order ?? Infinity) - (b.book.sort_order ?? Infinity) || a.book.title.localeCompare(b.book.title, undefined, { numeric: true }));
}
