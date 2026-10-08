/** Shared catalog wire validation; excludes device-only bindings and credential-bearing URLs. */
import { CATALOG_CONFIG as C, CATALOG_SYNC as S } from '../../constants.js';
import { emptyCatalog, validateCatalog } from './catalog-model.js';

/** @param {boolean} condition Input constraint @returns {void} Fail without reflecting untrusted input. */
function requireValue(condition) { if (!condition) throw new TypeError('Invalid catalog sync payload'); }

/** @param {string} value Entity/mutation identity @returns {boolean} Bounded identifier. */
export function catalogSyncId(value) { return typeof value === 'string' && value.length > 0 && value.length <= S.maxIdLength; }

/** @param {Object} record Holding @returns {void} Permit official HTTPS links without unapproved query/fragment credentials. */
function checkURL(record) {
  if (!record.external_url) return;
  const url = new URL(record.external_url);
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
    S.providerHosts[record.provider]?.some(host => url.hostname === host || url.hostname.endsWith('.' + host)));
  requireValue([...url.searchParams.keys()].every(key => S.urlQueryKeys.includes(key.toLowerCase())));
}

/**
 * Project a local record onto the wire schema; no files, local paths, excerpts or auth data.
 * Unknown fields are rejected before projection so secrets cannot hide in ignored metadata.
 * @param {string} entityType Collection @param {Object} record Local or remote record
 * @param {boolean} wireOnly Reject even recognized device-only fields on server input
 * @returns {Object} Independent, bounded cloud record
 */
export function catalogCloudRecord(entityType, record, wireOnly = false) {
  requireValue(Object.hasOwn(C.fields, entityType) && record && typeof record === 'object' && !Array.isArray(record));
  const localFields = [...C.commonFields, ...C.fields[entityType]];
  const fields = localFields.filter(key => entityType !== 'holdings' || !S.excludedHoldingFields.includes(key));
  requireValue(Object.keys(record).every(key => (wireOnly ? fields : localFields).includes(key)));
  const output = Object.fromEntries(fields.filter(key => Object.hasOwn(record, key)).map(key => [key, structuredClone(record[key])]));
  requireValue(catalogSyncId(output.id));
  requireValue(Number.isSafeInteger(output.revision) && output.revision > 0);
  for (const [key, value] of Object.entries(output)) {
    requireValue(value == null || (C.numericFields.includes(key) ? typeof value === 'number' && Number.isFinite(value)
      : C.booleanFields.includes(key) ? typeof value === 'boolean' : key === 'aliases' ? Array.isArray(value) : typeof value === 'string'));
    if (typeof value === 'string') requireValue(value.length <= S.maxTextLength);
    if (Array.isArray(value)) requireValue(value.length <= S.maxAliases && value.every(item => typeof item === 'string' && item.length <= S.maxTextLength));
  }
  requireValue(new TextEncoder().encode(JSON.stringify(output)).byteLength <= S.maxRecordBytes);
  if (entityType === 'holdings') checkURL(output);
  return output;
}

/** @param {Object} mutation Atomic operation @returns {Object} Validated, independently copied wire command. */
export function validateCatalogMutation(mutation) {
  requireValue(mutation && typeof mutation === 'object' && !Array.isArray(mutation) &&
    Object.keys(mutation).every(key => ['mutationId', 'changes'].includes(key)) && catalogSyncId(mutation.mutationId));
  requireValue(Array.isArray(mutation.changes) && mutation.changes.length > 0 && mutation.changes.length <= S.maxChanges);
  requireValue(new TextEncoder().encode(JSON.stringify(mutation)).byteLength <= S.maxMutationBytes);
  const seen = new Set();
  return { mutationId: mutation.mutationId, changes: mutation.changes.map(change => {
    requireValue(change && typeof change === 'object' && Object.keys(change).every(key => ['entityType', 'entityId', 'baseRevision', 'payload'].includes(key)));
    requireValue(Object.hasOwn(C.fields, change.entityType) && catalogSyncId(change.entityId) &&
      Number.isSafeInteger(change.baseRevision) && change.baseRevision >= 0);
    const key = JSON.stringify([change.entityType, change.entityId]); requireValue(!seen.has(key)); seen.add(key);
    const payload = catalogCloudRecord(change.entityType, change.payload, true);
    requireValue(payload.id === change.entityId);
    return { entityType: change.entityType, entityId: change.entityId, baseRevision: change.baseRevision, payload };
  }) };
}

/** @param {Object} value JSON value @returns {string} Stable serialization for idempotent retries regardless of property order. */
export function canonicalCatalogJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalCatalogJSON).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalCatalogJSON(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

/**
 * Apply a group against one consistent server snapshot. All revisions/references validate together.
 * @param {Object} snapshot Current wire catalog @param {Object} mutation Validated command
 * @param {number} now Server clock @returns {Object} Accepted candidate/changes or conflict result
 */
export function prepareCatalogMutation(snapshot, mutation, now = Date.now()) {
  const next = validateCatalog(snapshot), conflicts = [];
  for (const change of mutation.changes) {
    const current = next[change.entityType].find(row => row.id === change.entityId);
    if ((current?.revision ?? 0) !== change.baseRevision) conflicts.push({ entityType: change.entityType, entityId: change.entityId, current: current || null });
  }
  if (conflicts.length) return { result: { mutationId: mutation.mutationId, status: S.statuses.conflict, reason: S.reasons.revision, conflicts } };
  const changes = [];
  for (const change of mutation.changes) {
    const rows = next[change.entityType], index = rows.findIndex(row => row.id === change.entityId), previous = rows[index];
    // Existing history must never be reattributed to a different service or ownership type.
    if (change.entityType === 'holdings' && previous) requireValue(previous.provider === change.payload.provider && previous.access_type === change.payload.access_type);
    const record = catalogCloudRecord(change.entityType,
      { ...change.payload, revision: change.baseRevision + 1, created_at: previous?.created_at ?? change.payload.created_at, updated_at: now }, true);
    if (index < 0) rows.push(record); else rows[index] = record;
    changes.push({ entityType: change.entityType, entityId: change.entityId, record });
  }
  validateCatalog(next);
  // Active references cannot target tombstones; shared/deleted history still retains its IDs.
  const indexes = Object.fromEntries(Object.keys(C.fields).map(type => [type, new Map(next[type].map(row => [row.id, row]))]));
  const alive = (type, id) => indexes[type].get(id)?.deleted_at == null && indexes[type].has(id);
  for (const row of next.books) if (row.deleted_at == null && row.series_id) requireValue(alive('series', row.series_id));
  const holdingIds = new Set();
  for (const row of next.holdings) if (row.deleted_at == null) {
    requireValue(alive('books', row.book_id));
    if (row.provider_book_id) {
      const key = JSON.stringify([row.provider, row.access_type, row.provider_book_id]); requireValue(!holdingIds.has(key)); holdingIds.add(key);
    }
  }
  for (const type of ['access_periods', 'reading_events', 'manual_reading_states']) for (const row of next[type]) if (row.deleted_at == null) requireValue(alive('holdings', row.holding_id));
  for (const row of next.access_periods) if (row.deleted_at == null && row.ended_at == null) requireValue(indexes.holdings.get(row.holding_id).availability_status === C.availabilityStates[0]);
  requireValue(new TextEncoder().encode(JSON.stringify(changes)).byteLength <= S.maxPageBytes);
  return { next, result: { mutationId: mutation.mutationId, status: S.statuses.accepted, changes } };
}

/** @param {Object[]} records D1 rows @returns {Object} Validated wire snapshot. */
export function catalogFromCloudRows(records) {
  const snapshot = emptyCatalog();
  for (const row of records) {
    const record = catalogCloudRecord(row.entity_type, JSON.parse(row.record_data), true);
    requireValue(row.entity_id === record.id && row.revision === record.revision); snapshot[row.entity_type].push(record);
  }
  return validateCatalog(snapshot);
}
