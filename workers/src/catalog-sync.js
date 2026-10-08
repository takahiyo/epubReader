/** Catalog API repository: revision-checked, idempotent mutation groups and append-only change pages. */
import { CATALOG_SYNC as S, SYNC_PATHS } from '../../assets/constants.js';
import { validateCatalogMutation, prepareCatalogMutation, canonicalCatalogJSON, catalogFromCloudRows } from '../../assets/js/core/catalog-sync-protocol.js';

/** @param {Object} value Result @param {Object} corsHeaders CORS @param {number} status HTTP status @returns {Response} JSON response without cacheable personal records. */
function response(value, corsHeaders, status = 200) {
  return Response.json(value, { status, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
}

/** @param {string} value Canonical request @returns {Promise<string>} Non-reversible retry identity. */
async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {Object|null} row Saved response @param {string} hash Request hash @param {string} mutationId Identity @returns {Object|null} Original result or misuse diagnostic. */
function replay(row, hash, mutationId) {
  if (!row) return null;
  return row.request_hash === hash ? JSON.parse(row.response_data)
    : { mutationId, status: S.statuses.invalid, reason: S.reasons.reused };
}

/**
 * Commit one group using a user-level CAS solely to protect full-schema validation.
 * Per-record base revisions decide conflicts; unrelated concurrent edits retry automatically.
 * SQL guards make a lost CAS a no-op for every record, receipt and change log in the batch.
 * @param {Object} db D1/session @param {string} uid Verified user @param {Object} mutation Validated group
 * @returns {Promise<Object>} Stable accepted/conflict/invalid result
 */
export async function pushCatalogMutation(db, uid, mutation) {
  const hash = await digest(canonicalCatalogJSON(mutation));
  await db.prepare('INSERT OR IGNORE INTO catalog_heads (user_id, revision) VALUES (?, 0)').bind(uid).run();
  let queries = 1;
  for (let attempt = 0; attempt < S.casRetries; attempt++) {
    // Stay within Free D1's invocation budget; a busy large group retries as a fresh HTTP request.
    if (queries + 3 + 5 > S.maxD1Queries) break;
    // Batch reads share a consistent view; no reference validation occurs across mixed snapshots.
    const [headResult, recordsResult, receiptResult] = await db.batch([
      db.prepare('SELECT revision FROM catalog_heads WHERE user_id = ?').bind(uid),
      db.prepare('SELECT entity_type, entity_id, revision, record_data FROM catalog_records WHERE user_id = ?').bind(uid),
      db.prepare('SELECT request_hash, response_data FROM catalog_mutations WHERE user_id = ? AND mutation_id = ?').bind(uid, mutation.mutationId),
    ]);
    queries += 3;
    const previous = replay(receiptResult.results[0], hash, mutation.mutationId);
    if (previous) return previous;
    const revision = headResult.results[0].revision;
    const snapshot = catalogFromCloudRows(recordsResult.results);
    let result;
    try { result = prepareCatalogMutation(snapshot, mutation).result; }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      result = { mutationId: mutation.mutationId, status: S.statuses.invalid, reason: S.reasons.values };
    }
    const token = crypto.randomUUID();
    const guard = 'EXISTS (SELECT 1 FROM catalog_heads WHERE user_id = ? AND commit_token = ?)';
    const statements = [db.prepare(`UPDATE catalog_heads SET revision = revision + 1, commit_token = ?
      WHERE user_id = ? AND revision = ? AND NOT EXISTS
      (SELECT 1 FROM catalog_mutations WHERE user_id = ? AND mutation_id = ?)`)
      .bind(token, uid, revision, uid, mutation.mutationId)];
    if (result.status === S.statuses.accepted) {
      // Set-based JSON insertion keeps a 500-volume edit atomic without hundreds of D1 subqueries.
      statements.push(db.prepare(`INSERT INTO catalog_records (user_id, entity_type, entity_id, revision, record_data)
        SELECT ?, json_extract(value, '$.entityType'), json_extract(value, '$.entityId'),
          json_extract(value, '$.record.revision'), json_extract(value, '$.record')
        FROM json_each(?) WHERE ${guard}
        ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET revision = excluded.revision, record_data = excluded.record_data`)
        .bind(uid, JSON.stringify(result.changes), uid, token));
    }
    statements.push(db.prepare(`INSERT INTO catalog_mutations (user_id, mutation_id, request_hash, response_data)
      SELECT ?, ?, ?, ? WHERE ${guard}`).bind(uid, mutation.mutationId, hash, JSON.stringify(result), uid, token));
    if (result.status === S.statuses.accepted) statements.push(db.prepare(`INSERT INTO catalog_changes (user_id, mutation_id, changes_data)
      SELECT ?, ?, ? WHERE ${guard}`).bind(uid, mutation.mutationId, JSON.stringify(result.changes), uid, token));
    // The receipt is read in the same transaction that attempted the write, including concurrent replay.
    statements.push(db.prepare('SELECT request_hash, response_data FROM catalog_mutations WHERE user_id = ? AND mutation_id = ?').bind(uid, mutation.mutationId));
    const committed = await db.batch(statements);
    queries += statements.length;
    const saved = replay(committed.at(-1).results[0], hash, mutation.mutationId);
    if (saved) return saved;
  }
  throw new Error('Catalog busy; retry the same mutation');
}

/** @param {Object} db D1 @param {string} uid Verified user @param {Object} body Cursor/limit @returns {Promise<Object>} Complete groups, bounded without splitting a loan transition. */
export async function pullCatalogChanges(db, uid, body) {
  const cursor = body.cursor ?? 0, limit = body.limit ?? S.defaultPageSize;
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > S.maxPageSize) throw new TypeError('Invalid catalog cursor or limit');
  const [head, page] = await db.batch([
    db.prepare('SELECT COALESCE(MAX(change_no), 0) AS latest FROM catalog_changes WHERE user_id = ?').bind(uid),
    db.prepare('SELECT change_no, mutation_id, changes_data FROM catalog_changes WHERE user_id = ? AND change_no > ? ORDER BY change_no LIMIT ?').bind(uid, cursor, limit + 1),
  ]);
  if (cursor > head.results[0].latest) throw new TypeError('Catalog cursor exceeds user history');
  const groups = []; let bytes = 0;
  for (const row of page.results.slice(0, limit)) {
    const group = { cursor: row.change_no, mutationId: row.mutation_id, changes: JSON.parse(row.changes_data) };
    const size = new TextEncoder().encode(JSON.stringify(group)).byteLength;
    if (groups.length && bytes + size > S.maxPageBytes) break;
    groups.push(group); bytes += size;
  }
  return { groups, nextCursor: groups.at(-1)?.cursor ?? cursor, hasMore: page.results.length > groups.length };
}

/** @param {string} path Route @param {Object} body Parsed request @param {Object} env Bindings @param {string} uid Verified user @param {Object} corsHeaders CORS @returns {Promise<Response>} Dedicated catalog response. */
export async function handleCatalogSync(path, body, env, uid, corsHeaders) {
  // When read replication is configured, subsequent CAS retries must observe primary writes.
  const db = env.DB.withSession?.('first-primary') || env.DB;
  try {
    if (path === SYNC_PATHS.CATALOG_PULL) return response({ data: await pullCatalogChanges(db, uid, body) }, corsHeaders);
    if (!Array.isArray(body.mutations) || !body.mutations.length || body.mutations.length > S.maxMutations) throw new TypeError('Invalid catalog mutations');
    // Check the whole request shape before committing any group; groups themselves are independent operations.
    const mutations = body.mutations.map(validateCatalogMutation), results = [];
    for (const mutation of mutations) results.push(await pushCatalogMutation(db, uid, mutation));
    return response({ data: { results } }, corsHeaders);
  } catch (error) {
    if (error instanceof TypeError) return response({ error: 'Invalid catalog request' }, corsHeaders, 400);
    // A newer Worker may be deployed before the additive D1 migration; old reader APIs still work.
    return response({ error: 'Catalog sync unavailable; local catalog is unchanged' }, corsHeaders, 503);
  }
}
