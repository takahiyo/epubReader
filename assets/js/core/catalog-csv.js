/**
 * catalog-csv.js: strict CSV preview and additive import; titles never establish identity.
 * Dependencies: catalog constants, model validation and search normalization.
 * Called by catalog-ui.js; commit transforms run inside catalog-store.js transactions.
 */
import { CATALOG_CONFIG as C, CATALOG_CSV as CSV } from '../../constants.js';
import { emptyCatalog, validateCatalog, catalogRecord } from './catalog-model.js';
import { normalizeCatalogSearch, catalogRows } from './catalog-actions.js';

/**
 * Export selected volumes as filled CSV examples; one holding per row, one key per volume.
 * Only import columns are allowed: reader file IDs, progress and history are never exported.
 * @param {Object} snapshot Current catalog @param {string[]} bookIds Explicit selected identities
 * @returns {string} UTF-8 BOM CSV with CRLF records and quoted text cells
 */
export function exportCatalogCSV(snapshot, bookIds) {
  const catalog = validateCatalog(snapshot), selected = new Set(bookIds);
  const books = catalogRows(catalog).filter(row => selected.has(row.book.id));
  if (!selected.size || books.length !== selected.size || books.some(row => !row.holdings.length)) throw invalid(CSV.errors.selection);
  const records = [CSV.columns];
  for (let index = 0; index < books.length; index++) {
    const { book, series, holdings } = books[index];
    for (const holding of holdings) {
      if (records.length - 1 >= CSV.maxRows) throw invalid(CSV.errors.limit);
      const values = { title: book.title, author: book.author, series: series?.name, volume_label: book.volume_label,
        sort_order: book.sort_order, edition: book.edition, provider: holding.provider, format: holding.format,
        provider_book_id: holding.provider_book_id, external_url: holding.external_url, access_type: holding.access_type,
        availability_status: holding.availability_status, book_key: CSV.bookKeyPrefix + (index + 1) };
      records.push(CSV.columns.map(name => values[name] ?? ''));
    }
  }
  /** @param {*} value Cell @returns {string} Quoted text, neutralizing leading spreadsheet formula characters. */
  const cell = value => {
    let text = String(value);
    // Tab inside the quoted field follows OWASP's Excel mitigation. Import trims this prefix.
    // Check NFKC too, since full-width formula characters occur in Japanese titles.
    if (/^[\s]*[=+\-@]/.test(text.normalize('NFKC'))) text = CSV.spreadsheetTextPrefix + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  // Stop before accumulating many copies of a large field across holdings.
  const chunks = ['\uFEFF'], encoder = new TextEncoder(); let bytes = encoder.encode(chunks[0]).length;
  for (const row of records) {
    const text = row.map(cell).join(',') + '\r\n'; bytes += encoder.encode(text).length;
    if (bytes > CSV.maxBytes) throw invalid(CSV.errors.limit);
    chunks.push(text);
  }
  return chunks.join('');
}

/** @param {string} reason CSV diagnostic @returns {Error} Translatable input failure. */
function invalid(reason) { const error = new TypeError(reason); error.code = C.errorCodes.invalid; error.csvReason = reason; return error; }

/**
 * Parse quoted commas, doubled quotes and embedded newlines; reject malformed quoting.
 * Physical line numbers point to the beginning of a record, including multiline cells.
 * @param {string} text UTF-8 CSV @returns {Object[]} Records with cells and physical line.
 */
export function parseCatalogCSV(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > CSV.maxBytes) throw invalid(CSV.errors.limit);
  text = text.replace(/^\uFEFF/, '');
  const records = []; let cells = [], cell = '', quoted = false, closed = false, line = 1, start = 1;
  /** @returns {void} Finish a cell without trimming its quoted content. */
  const endCell = () => { cells.push(cell); cell = ''; closed = false; };
  /** @returns {void} Finish a nonempty record and enforce the import bound. */
  const endRow = () => {
    endCell();
    if (cells.some(value => value.trim())) records.push({ line: start, cells });
    cells = [];
    if (records.length > CSV.maxRows + 1) throw invalid(CSV.errors.limit);
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { cell += char; i++; } else { quoted = false; closed = true; } }
      else { cell += char; if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line++; }
    } else if (char === ',') endCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow(); line++; start = line;
    } else if (char === '"' && cell === '' && !closed) quoted = true;
    else { if (closed || char === '"') throw invalid(CSV.errors.syntax); cell += char; }
  }
  if (quoted) throw invalid(CSV.errors.syntax);
  if (cell || cells.length || closed) endRow();
  return records;
}

/** @param {Object} snapshot Catalog @returns {string} Order-independent revision/content lease. */
function signature(snapshot) {
  return JSON.stringify(Object.fromEntries(Object.keys(C.fields).map(name => [name,
    [...snapshot[name]].sort((a, b) => a.id.localeCompare(b.id))])));
}

/**
 * Build a reviewable result without persisting any row. Explicit book_key shares a volume
 * within this CSV only; existing books are never implicitly updated or merged.
 * @param {Object} snapshot Current catalog @param {string} text CSV file
 * @param {Object} options Injectable clock and UUID @returns {Object} Rows, counts and commit lease.
 */
export function previewCatalogCSV(snapshot, text, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const next = validateCatalog(snapshot), records = parseCatalogCSV(text);
  const header = records.shift()?.cells.map(value => value.trim());
  if (!header || new Set(header).size !== header.length || header.some(value => !CSV.columns.includes(value)) ||
    CSV.required.some(value => !header.includes(value))) throw invalid(CSV.errors.header);
  const series = new Map(), groups = new Map(), identifiers = new Set(), titles = new Set();
  for (const row of next.series.filter(row => row.deleted_at == null)) {
    if (!series.has(row.name)) series.set(row.name, []); series.get(row.name).push(row);
  }
  /** @param {Object} row Holding @returns {string} Service identity keeps KU and purchase separate. */
  const key = row => JSON.stringify([row.provider, row.access_type, row.provider_book_id]);
  for (const row of next.holdings.filter(row => row.deleted_at == null && row.provider_book_id)) identifiers.add(key(row));
  for (const row of next.books.filter(row => row.deleted_at == null)) titles.add(normalizeCatalogSearch(row.title));
  const counts = { add: 0, duplicate: 0, error: 0, candidates: 0, books: 0, series: 0, update: 0 };
  const rows = [];
  for (const record of records) {
    const result = { line: record.line, status: CSV.statuses.error, title: '', provider: '', series: '', volume_label: '', reason: null, candidate: false };
    try {
      if (record.cells.length !== header.length) throw invalid(CSV.errors.values);
      const v = Object.fromEntries(header.map((name, index) => [name, record.cells[index].trim()]));
      Object.assign(result, { title: v.title, provider: v.provider, series: v.series || '', volume_label: v.volume_label || '', values: v });
      const matching = v.series ? series.get(v.series) || [] : [];
      if (matching.length > 1) throw invalid(CSV.errors.series);
      const seriesRow = matching[0] || (v.series ? { ...catalogRecord(uuid, now), name: v.series, aliases: [] } : null);
      const metadata = { title: v.title, author: v.author || '', series_id: seriesRow?.id || null,
        volume_label: v.volume_label || '', sort_order: v.sort_order ? Number(v.sort_order) : null, edition: v.edition || '' };
      // Compare CSV names, not newly generated series IDs, including rows skipped as duplicates.
      const groupMetadata = JSON.stringify({ ...metadata, series_id: v.series || null });
      const group = v.book_key ? groups.get(v.book_key) : null;
      if (group && groupMetadata !== group.metadata) throw invalid(CSV.errors.group);
      const book = group?.book || { ...catalogRecord(uuid, now), ...metadata };
      const holding = { ...catalogRecord(uuid, now), book_id: book.id, provider: v.provider,
        format: v.format || null, provider_book_id: v.provider_book_id || null, external_url: v.external_url || null,
        access_type: v.access_type || C.accessTypes[0], availability_status: v.availability_status || C.availabilityStates[3],
        availability_checked_at: null, source: C.sources.manual, legacy_book_id: null, legacy_cloud_book_id: null };
      if (holding.format && (holding.provider !== C.providers[0] || !C.localFormats.includes(holding.format))) throw invalid(CSV.errors.values);
      // Validate each isolated row before duplicate detection; invalid duplicate rows must remain visible.
      validateCatalog({ ...emptyCatalog(), series: seriesRow ? [seriesRow] : [], books: [book], holdings: [holding] });
      if (holding.provider_book_id && identifiers.has(key(holding))) {
        result.status = CSV.statuses.duplicate;
        if (v.book_key && !group) groups.set(v.book_key, { book: null, metadata: groupMetadata });
      }
      else {
        result.status = CSV.statuses.add;
        result.candidate = !group?.book && titles.has(normalizeCatalogSearch(book.title));
        if (result.candidate) counts.candidates++;
        if (seriesRow && !matching.length) { next.series.push(seriesRow); series.set(v.series, [seriesRow]); counts.series++; }
        if (!group?.book) { next.books.push(book); counts.books++; }
        next.holdings.push(holding); titles.add(normalizeCatalogSearch(book.title));
        if (holding.provider_book_id) identifiers.add(key(holding));
        if (v.book_key) groups.set(v.book_key, { book, metadata: groupMetadata });
      }
    } catch (error) { result.reason = error.csvReason || CSV.errors.values; }
    counts[result.status]++; rows.push(result);
  }
  return { rows, counts, baseline: signature(snapshot), next: validateCatalog(next) };
}

/**
 * Commit exactly the reviewed additions in the repository transaction. A changed catalog
 * invalidates the preview instead of overwriting another tab's edits or lending history.
 * @param {Object} snapshot Transaction snapshot @param {Object} preview Reviewed preview
 * @returns {Object} Validated additive snapshot; errors abort the whole transaction.
 */
export function applyCatalogCSV(snapshot, preview) {
  if (preview.counts.error || !preview.counts.add) throw invalid(CSV.errors.values);
  if (signature(snapshot) !== preview.baseline) { const error = new Error(C.errorCodes.conflict); error.code = C.errorCodes.conflict; throw error; }
  return validateCatalog(preview.next);
}
