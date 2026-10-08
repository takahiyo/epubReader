/** Pure client synchronization state; catalog commands and outbox metadata commit together. */
import { CATALOG_CONFIG as C, CATALOG_SYNC as S } from '../../constants.js';
import { emptyCatalog, validateCatalog } from './catalog-model.js';
import { catalogCloudRecord, canonicalCatalogJSON, validateCatalogMutation } from './catalog-sync-protocol.js';

/** @param {string} reason UI failure @returns {Error} Translatable error without payload data. */
export function catalogSyncError(reason) { const error = new Error('Catalog sync failed'); error.catalogSyncReason = reason; return error; }
/** @returns {Object} New account's durable sync metadata. */
export function emptyCatalogSync() { return { id: S.metaId, enabled: false, version: 0, cursor: 0, baseline: emptyCatalog(), outbox: [], pending: null, blocked: null, bootstrap: false }; }
/** @param {string} type Collection @param {Object} record Local/cloud row @returns {string} Content equality excluding independent revision clocks/bindings. */
export function catalogSyncComparable(type, record) {
  if (!record) return '';
  // Comparison must remain possible when a local URL needs correction before it can be sent.
  const fields = [...C.commonFields, ...C.fields[type]].filter(key => !S.ignoredComparisonFields.includes(key) &&
    !(type === 'holdings' && S.excludedHoldingFields.includes(key)));
  return canonicalCatalogJSON(Object.fromEntries(fields.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]])));
}
/** @param {Object} snapshot Catalog @param {string} type Collection @param {string} id Row ID @returns {Object|undefined} Identified row. */
const find = (snapshot, type, id) => snapshot[type].find(row => row.id === id);

/** @param {Object} snapshot Locally committed catalog @param {Object} metadata Sync state @returns {Object} Metadata retaining the original base revision of unsubmitted edits. */
export function trackCatalogChanges(snapshot, metadata) {
  const next = structuredClone(metadata); next.version++;
  if (!next.enabled) return next;
  const old = new Map(next.outbox.map(row => [JSON.stringify([row.entityType, row.entityId]), row]));
  // Large catalogs need linear lookup work on each committed edit and bootstrap acknowledgment.
  const baseline = Object.fromEntries(Object.keys(C.fields).map(type => [type, new Map(next.baseline[type].map(row => [row.id, row]))]));
  next.outbox = [];
  for (const type of Object.keys(C.fields)) for (const record of snapshot[type]) {
    const base = baseline[type].get(record.id), key = JSON.stringify([type, record.id]);
    if (catalogSyncComparable(type, record) !== catalogSyncComparable(type, base)) next.outbox.push(old.get(key) || { entityType: type, entityId: record.id, baseRevision: base?.revision ?? 0 });
  }
  return next;
}

/** @param {Object} snapshot Desired catalog @param {Object} metadata Durable state @param {Function} uuid UUID @returns {Object} State with one immutable request persisted before network IO. */
export function prepareCatalogPending(snapshot, metadata, uuid = () => crypto.randomUUID()) {
  if (metadata.blocked) throw catalogSyncError(S.clientErrors.blocked);
  if (metadata.pending || !metadata.outbox.length) return structuredClone(metadata);
  const next = structuredClone(metadata), changes = [];
  // Only an explicit initial import can be divided into dependency-ordered new-record groups.
  const canPage = next.bootstrap && next.outbox.every(change => change.baseRevision === 0);
  const selected = canPage ? next.outbox.slice(0, S.bootstrapPageSize) : next.outbox;
  const records = Object.fromEntries(Object.keys(C.fields).map(type => [type, new Map(snapshot[type].map(row => [row.id, row]))]));
  for (const entry of selected) {
    const record = records[entry.entityType]?.get(entry.entityId);
    if (!record) throw catalogSyncError(S.clientErrors.protocol);
    try { changes.push({ ...entry, payload: catalogCloudRecord(entry.entityType, record) }); }
    catch { throw catalogSyncError(S.clientErrors.limit); }
  }
  let command = { mutationId: uuid(), changes };
  try { command = validateCatalogMutation(command); }
  catch { throw catalogSyncError(S.clientErrors.limit); }
  next.pending = command; next.version++; return next;
}

/** @param {Object} snapshot Local catalog @param {string} type Collection @param {Object} record Cloud row @returns {void} Apply cloud content while preserving device binding and monotonic local revision. */
function replaceCloudRow(snapshot, type, record) {
  const rows = snapshot[type], index = rows.findIndex(row => row.id === record.id), previous = rows[index];
  const next = { ...record, revision: previous ? previous.revision + 1 : 1 };
  if (type === 'holdings') next.legacy_book_id = previous?.legacy_book_id ?? null;
  if (index < 0) rows.push(next); else rows[index] = next;
}

/** @param {Object} snapshot Catalog @param {Object} metadata State @param {Object} result One exact server receipt @returns {Object} Catalog/state pair acknowledging only the frozen submitted request. */
export function acknowledgeCatalogPending(snapshot, metadata, result) {
  const next = validateCatalog(snapshot), state = structuredClone(metadata), pending = state.pending;
  if (!pending || result?.mutationId !== pending.mutationId || !Object.values(S.statuses).includes(result.status)) throw catalogSyncError(S.clientErrors.protocol);
  if (result.status !== S.statuses.accepted) { state.blocked = structuredClone(result); state.version++; return { snapshot: next, state }; }
  if (!Array.isArray(result.changes) || result.changes.length !== pending.changes.length) throw catalogSyncError(S.clientErrors.protocol);
  for (const submitted of pending.changes) {
    const receipt = result.changes.find(row => row.entityType === submitted.entityType && row.entityId === submitted.entityId);
    if (!receipt || receipt.record?.id !== submitted.entityId || receipt.record?.revision !== submitted.baseRevision + 1) throw catalogSyncError(S.clientErrors.protocol);
    const record = catalogCloudRecord(receipt.entityType, receipt.record, true);
    const rows = state.baseline[receipt.entityType], index = rows.findIndex(row => row.id === receipt.entityId);
    if (index < 0) rows.push(record); else rows[index] = record;
    const local = find(next, receipt.entityType, receipt.entityId);
    if (catalogSyncComparable(receipt.entityType, local) === catalogSyncComparable(receipt.entityType, submitted.payload)) replaceCloudRow(next, receipt.entityType, record);
    // Edits made during IO are based on the now-confirmed submitted record, rather than its old revision.
    const dirty = state.outbox.find(row => row.entityType === receipt.entityType && row.entityId === receipt.entityId);
    if (dirty) dirty.baseRevision = record.revision;
  }
  state.baseline = validateCatalog(state.baseline); state.pending = null; state.blocked = null;
  const tracked = trackCatalogChanges(next, state);
  if (!tracked.outbox.length) tracked.bootstrap = false;
  return { snapshot: validateCatalog(next), state: tracked };
}

/** @param {Object} snapshot Current local catalog @param {Object} metadata Durable state @param {Object} page Server groups/cursor @returns {Object} Atomic catalog/cursor update; local edits keep their original base revisions. */
export function applyCatalogPage(snapshot, metadata, page) {
  const next = validateCatalog(snapshot), state = structuredClone(metadata);
  if (!Array.isArray(page?.groups) || !Number.isSafeInteger(page.nextCursor) || page.nextCursor < state.cursor || typeof page.hasMore !== 'boolean') throw catalogSyncError(S.clientErrors.protocol);
  let cursor = state.cursor;
  for (const group of page.groups) {
    if (!Number.isSafeInteger(group.cursor) || group.cursor <= cursor || !Array.isArray(group.changes)) throw catalogSyncError(S.clientErrors.protocol);
    cursor = group.cursor;
    for (const change of group.changes) {
      const record = catalogCloudRecord(change.entityType, change.record, true);
      if (record.id !== change.entityId) throw catalogSyncError(S.clientErrors.protocol);
      const base = find(state.baseline, change.entityType, change.entityId);
      if (base && record.revision <= base.revision) continue; // Previously acknowledged writes may still be ahead of the pull cursor.
      const rows = state.baseline[change.entityType], index = rows.findIndex(row => row.id === record.id);
      if (index < 0) rows.push(record); else rows[index] = record;
      if (!state.outbox.some(row => row.entityType === change.entityType && row.entityId === change.entityId)) replaceCloudRow(next, change.entityType, record);
    }
  }
  if (cursor !== page.nextCursor || (page.hasMore && !page.groups.length)) throw catalogSyncError(S.clientErrors.protocol);
  state.baseline = validateCatalog(state.baseline); state.cursor = cursor; state.version++;
  try { return { snapshot: validateCatalog(next), state }; }
  catch {
    // Conflicting live-loan unions must not corrupt either snapshot. Stage the cloud baseline for explicit review.
    state.blocked ||= { status: S.statuses.conflict, reason: S.clientErrors.protocol };
    return { snapshot: validateCatalog(snapshot), state };
  }
}

/** @param {Object} snapshot Account catalog @param {Object} metadata State @param {Object|null} seed Explicitly approved anonymous snapshot @returns {Object} Initial account state without title-based merging. */
export function initializeCatalogAccount(snapshot, metadata, seed = null) {
  if (metadata.enabled) throw catalogSyncError(S.clientErrors.stale);
  const next = validateCatalog(snapshot);
  if (seed) for (const type of Object.keys(C.fields)) for (const row of validateCatalog(seed)[type]) {
    if (find(next, type, row.id)) throw catalogSyncError(S.clientErrors.import);
    next[type].push(row);
  }
  const state = trackCatalogChanges(validateCatalog(next), { ...metadata, enabled: true, bootstrap: !!seed });
  return { snapshot: next, state };
}

/** @param {Object} snapshot Local catalog @param {Object} metadata Reviewed state @param {number} version Review lease @param {boolean} useCloud Replace unsubmitted changes @returns {Object} Explicit resolution; caller archives before discarding local changes. */
export function resolveCatalogConflict(snapshot, metadata, version, useCloud) {
  if (metadata.version !== version || !metadata.blocked) throw catalogSyncError(S.clientErrors.stale);
  const state = structuredClone(metadata); state.pending = null; state.blocked = null; state.bootstrap = false;
  const next = useCloud ? validateCatalog(state.baseline) : validateCatalog(snapshot);
  if (useCloud) for (const type of Object.keys(C.fields)) for (const row of next[type]) {
    const previous = find(snapshot, type, row.id); row.revision = previous ? previous.revision + 1 : 1;
    if (type === 'holdings') row.legacy_book_id = previous?.legacy_book_id ?? null;
  }
  // A reviewed retry is a fresh operation based on the displayed current cloud revisions.
  state.outbox = [];
  return { snapshot: next, state: trackCatalogChanges(next, state) };
}
