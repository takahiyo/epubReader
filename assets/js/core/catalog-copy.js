/**
 * catalog-copy.js: explicit drafts and atomic copy registration with new book/holding IDs.
 * Dependencies: catalog model/constants. Called by catalog-ui.js in repository.update.
 * Progress, file bindings and lending/reading history are intentionally not copied.
 */
import { CATALOG_CONFIG as C, CATALOG_BULK as B, CATALOG_COPY as COPY } from '../../constants.js';
import { validateCatalog, catalogRecord } from './catalog-model.js';

/** @param {string} code Error category @returns {Error} Translatable error. */
function failure(code) { const error = new Error(code); error.code = code; return error; }
/** @param {Object} row Source @param {number} revision Observed revision @returns {void} Verify draft identity. */
function check(row, revision) { if (!row || row.deleted_at != null || row.revision !== revision) throw failure(C.errorCodes.conflict); }

/** @param {Object[]} rows Selected catalog rows @param {Map} selected Selection revisions @returns {Object[]} Independent editable drafts. */
export function createCatalogCopyDraft(rows, selected) {
  return rows.filter(row => selected.has(row.book.id)).map(({ book, holdings }) => ({
    sourceBookId: book.id, revision: selected.get(book.id),
    values: Object.fromEntries(COPY.bookFields.map(key => [key, book[key] ?? ''])),
    holdings: holdings.map(holding => ({ sourceHoldingId: holding.id, revision: holding.revision,
      values: { provider: holding.provider, format: holding.format || '', access_type: holding.access_type,
        provider_book_id: '', external_url: '', availability_status: C.availabilityStates[3] } })),
  }));
}

/**
 * Register reviewed copies as one transaction, without modifying source records.
 * @param {Object} snapshot Current catalog @param {Object[]} drafts Reviewed values/source revisions
 * @param {Object} options Injectable clock/UUID @returns {Object} Independent validated catalog
 */
export function registerCatalogCopies(snapshot, drafts, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const next = validateCatalog(snapshot);
  if (!Array.isArray(drafts) || !drafts.length || drafts.length > B.maxSelection || new Set(drafts.map(row => row.sourceBookId)).size !== drafts.length) throw failure(C.errorCodes.invalid);
  const books = new Map(next.books.map(row => [row.id, row])), holdings = new Map(next.holdings.map(row => [row.id, row]));
  const providerIds = new Set(next.holdings.filter(row => row.deleted_at == null && row.provider_book_id).map(row => JSON.stringify([row.provider, row.access_type, row.provider_book_id])));
  for (const draft of drafts) {
    check(books.get(draft.sourceBookId), draft.revision);
    const v = draft.values;
    if (!Array.isArray(draft.holdings) || !draft.holdings.length || new Set(draft.holdings.map(row => row.sourceHoldingId)).size !== draft.holdings.length) throw failure(C.errorCodes.invalid);
    if (v.series_id && !next.series.some(row => row.id === v.series_id && row.deleted_at == null)) throw failure(C.errorCodes.conflict);
    const book = { ...catalogRecord(uuid, now), title: v.title?.trim(), author: v.author || '', series_id: v.series_id || null,
      volume_label: v.volume_label || '', sort_order: v.sort_order === '' || v.sort_order == null ? null : Number(v.sort_order), edition: v.edition || '' };
    next.books.push(book);
    for (const entry of draft.holdings) {
      const source = holdings.get(entry.sourceHoldingId); check(source, entry.revision);
      if (source.book_id !== draft.sourceBookId) throw failure(C.errorCodes.invalid);
      const h = entry.values, providerId = h.provider_book_id?.trim() || null;
      const identity = JSON.stringify([h.provider, h.access_type, providerId]);
      if (providerId && providerIds.has(identity)) throw failure(C.errorCodes.conflict);
      if (h.format && (h.provider !== C.providers[0] || !C.localFormats.includes(h.format))) throw failure(C.errorCodes.invalid);
      if (providerId) providerIds.add(identity);
      next.holdings.push({ ...catalogRecord(uuid, now), book_id: book.id, provider: h.provider, format: h.format || null,
        access_type: h.access_type, availability_status: h.availability_status, provider_book_id: providerId,
        external_url: h.external_url?.trim() || null, source: C.sources.manual, availability_checked_at: null,
        legacy_book_id: null, legacy_cloud_book_id: null });
    }
  }
  return validateCatalog(next);
}
