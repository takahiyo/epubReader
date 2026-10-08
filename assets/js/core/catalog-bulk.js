/**
 * catalog-bulk.js: atomic organization of explicitly selected volumes and editions.
 * Dependencies: catalog constants and model validation. Called by catalog-ui.js inside
 * repository.update; never changes holdings, loan history or reader storage.
 */
import { CATALOG_CONFIG as C, CATALOG_BULK as B } from '../../constants.js';
import { validateCatalog, catalogRecord } from './catalog-model.js';

/** @param {string} reason Input problem @returns {Error} Translatable bulk diagnostic. */
function invalid(reason) { const error = new TypeError(reason); error.code = C.errorCodes.invalid; error.bulkReason = reason; return error; }
/** @param {Object} row Observed record @param {number} revision Expected revision @returns {void} Reject stale edits. */
function check(row, revision) {
  if (!row || row.deleted_at != null || row.revision !== revision) { const error = new Error(C.errorCodes.conflict); error.code = C.errorCodes.conflict; throw error; }
}

/**
 * Change series membership and per-volume labels/orders as one validated transaction.
 * @param {Object} snapshot Current snapshot @param {Object} command Frozen selected IDs/revisions and draft
 * @param {Object} options Injectable UUID and clock @returns {Object} Independent validated catalog
 */
export function organizeCatalogBooks(snapshot, command, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const next = validateCatalog(snapshot), { books, seriesMode } = command;
  if (!Array.isArray(books) || !books.length || books.length > B.maxSelection || new Set(books.map(row => row.bookId)).size !== books.length) throw invalid(B.errors.selection);
  if (!Object.values(B.modes).includes(seriesMode)) throw invalid(B.errors.series);
  const byId = new Map(next.books.map(row => [row.id, row]));
  let seriesId = null;
  if (seriesMode === B.modes.set) {
    const series = next.series.find(row => row.id === command.seriesId); check(series, command.seriesRevision); seriesId = series.id;
  } else if (seriesMode === B.modes.create) {
    const name = typeof command.seriesName === 'string' ? command.seriesName.trim() : '';
    if (!name || next.series.some(row => row.deleted_at == null && row.name === name)) throw invalid(B.errors.series);
    const series = { ...catalogRecord(uuid, now), name, aliases: [] }; next.series.push(series); seriesId = series.id;
  }
  for (const entry of books) {
    const book = byId.get(entry.bookId); check(book, entry.revision);
    if (typeof entry.volume_label !== 'string') throw invalid(B.errors.selection);
    const sortOrder = entry.sort_order === '' || entry.sort_order == null ? null : Number(entry.sort_order);
    if (sortOrder != null && !Number.isSafeInteger(sortOrder)) throw invalid(B.errors.order);
    const values = { volume_label: entry.volume_label, sort_order: sortOrder,
      series_id: seriesMode === B.modes.keep ? book.series_id : seriesId };
    if (Object.entries(values).some(([key, value]) => book[key] !== value)) Object.assign(book, values, { revision: book.revision + 1, updated_at: now });
  }
  return validateCatalog(next);
}
