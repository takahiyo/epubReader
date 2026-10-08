/** Manual catalog coordinator. Network IO never runs inside an IndexedDB transaction. */
import { CATALOG_CONFIG as C, CATALOG_SYNC as S, SYNC_PATHS } from '../../constants.js';
import { catalogSyncError } from './catalog-sync-client.js';

/** @param {Object} context Verified current UI account/endpoint @returns {Promise<string>} Stable private database name without raw account ID in the name. */
export async function catalogAccountDatabase(context) {
  if (!context?.uid || !context.endpoint) throw catalogSyncError(S.clientErrors.account);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([context.uid, context.endpoint])));
  return C.databaseName + S.scopePrefix + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Send exact persisted requests, then pull complete groups. Failed/blocked work remains durable.
 * @param {Object} repository One immutable account database @param {Object} context Account/endpoint
 * @param {Function} transport Injected authenticated API @param {Function} assertContext Guard current account/endpoint
 * @param {boolean} pullOnly Initial cloud preview before explicit account linking
 * @returns {Promise<Object>} Current durable sync status
 */
export async function synchronizeCatalog(repository, context, transport, assertContext, pullOnly = false) {
  /** @param {string} path API route @param {Object} payload Body without credentials @returns {Promise<Object>} Checked response boundary. */
  async function request(path, payload) {
    assertContext();
    try { const response = await transport(path, payload, context); assertContext(); return response; }
    catch (error) { if (error.catalogSyncReason) throw error; throw catalogSyncError(S.clientErrors.transport); }
  }
  if (!pullOnly) {
    while (true) {
      assertContext();
      let state = await repository.syncState();
      if (state.blocked || (!state.pending && !state.outbox.length)) break;
      state = await repository.preparePending();
      const packet = state.pending;
      if (!packet) break;
      const response = await request(SYNC_PATHS.CATALOG_PUSH, { mutations: [packet] });
      if (!Array.isArray(response?.results) || response.results.length !== 1) throw catalogSyncError(S.clientErrors.protocol);
      await repository.acknowledge(response.results[0], packet.mutationId);
      if (response.results[0].status !== S.statuses.accepted) break;
    }
  }
  while (true) {
    assertContext(); const state = await repository.syncState();
    const page = await request(SYNC_PATHS.CATALOG_PULL, { cursor: state.cursor, limit: S.defaultPageSize });
    await repository.applyPage(page);
    if (!page.hasMore) break;
  }
  return repository.syncState();
}
