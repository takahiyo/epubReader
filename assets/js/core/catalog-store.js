/** Dedicated IndexedDB catalog repository. No changes to files, reader bookmarks or progress. */
import { CATALOG_CONFIG as C, CATALOG_SYNC as S } from '../../constants.js';
import { emptyCatalog, validateCatalog, migrateLegacyCatalog, pruneUnusedCatalogSeries } from './catalog-model.js';
import { emptyCatalogSync, trackCatalogChanges, prepareCatalogPending, acknowledgeCatalogPending, applyCatalogPage,
  initializeCatalogAccount, resolveCatalogConflict, catalogSyncError } from './catalog-sync-client.js';

/** @param {IDBRequest} request IndexedDB request @returns {Promise<*>} Request result. */
const result = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/** @param {IDBTransaction} transaction Active transaction @returns {Promise<void>} Durable transaction completion. */
const completion = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error || new Error('Catalog transaction aborted'));
  transaction.onerror = () => {}; // Abort is the final outcome; request success alone is insufficient.
});

/** @param {Object} options Injectable IndexedDB and database name @returns {Promise<Object>} Repository API. */
export async function openCatalog({ indexedDB = globalThis.indexedDB, databaseName = C.databaseName } = {}) {
  const request = indexedDB.open(databaseName, C.databaseVersion);
  request.onupgradeneeded = () => {
    for (const name of Object.keys(C.fields)) {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    }
    for (const name of [S.metaStore, S.recoveryStore]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
  };
  const db = await result(request);
  db.onversionchange = () => db.close();
  const names = Object.keys(C.fields);

  /**
   * Read and optionally mutate all related records within one transaction.
   * The transform is synchronous: waiting on network/UI would expire an IndexedDB transaction.
   * @param {Function|null} transform Pure catalog transform, null for reads
   * @param {boolean} replace Replace all rows only for explicit JSON restoration
   * @returns {Promise<Object>} Committed snapshot, or rejected without partial changes
   */
  async function transact(transform = null, replace = false, syncTransform = null) {
    const write = !!transform || !!syncTransform;
    const tx = db.transaction([...names, S.metaStore, S.recoveryStore], write ? 'readwrite' : 'readonly');
    const done = completion(tx);
    // Attach rejection handling immediately, including failures caught before awaiting completion.
    done.catch(() => {});
    try {
      const [records, savedState] = await Promise.all([
        Promise.all(names.map(name => result(tx.objectStore(name).getAll()))), result(tx.objectStore(S.metaStore).get(S.metaId)),
      ]);
      let state = savedState || emptyCatalogSync();
      const snapshot = { ...emptyCatalog(), ...Object.fromEntries(names.map((name, index) => [name, records[index]])) };
      // Empty series are cleaned only within successful writes, including import/migration.
      let next;
      if (syncTransform) {
        const outcome = syncTransform(validateCatalog(snapshot), structuredClone(state)); next = validateCatalog(outcome.snapshot); state = outcome.state;
        if (outcome.recovery) {
          state.lastRecoveryAt = Math.max(Date.now(), (state.lastRecoveryAt || 0) + 1);
          tx.objectStore(S.recoveryStore).put({ id: crypto.randomUUID(), created_at: state.lastRecoveryAt, snapshot: validateCatalog(outcome.recovery) });
        }
      } else if (transform) {
        next = validateCatalog(pruneUnusedCatalogSeries(transform(snapshot)));
        // Restoring an older backup must invalidate editors holding pre-restore revision leases.
        if (replace && state.enabled) for (const name of names) for (const row of next[name]) {
          const previous = snapshot[name].find(record => record.id === row.id);
          if (previous) row.revision = previous.revision + 1;
        }
        // Account restores represent removals as tombstones rather than erasing cloud identities.
        if (replace && state.enabled) for (const name of names) for (const record of snapshot[name]) if (!next[name].some(row => row.id === record.id)) {
          next[name].push({ ...record, deleted_at: record.deleted_at ?? Date.now(), updated_at: Date.now(), revision: record.revision + 1 });
        }
        next = validateCatalog(next); state = trackCatalogChanges(next, state);
      } else next = validateCatalog(snapshot);
      if (write) {
        for (const name of names) {
          const store = tx.objectStore(name);
          if (replace || syncTransform) store.clear();
          const previous = new Map(snapshot[name].map(record => [record.id, JSON.stringify(record)]));
          for (const record of next[name]) {
            if (replace || syncTransform || previous.get(record.id) !== JSON.stringify(record)) store.put(record);
          }
        }
        tx.objectStore(S.metaStore).put(state);
      }
      await done;
      return { snapshot: next, state };
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted/completed. */ }
      throw error;
    }
  }

  return {
    read: async () => (await transact()).snapshot,
    readBundle: () => transact(),
    syncState: async () => (await transact()).state,
    exportJSON: async () => JSON.stringify((await transact()).snapshot),
    // Validate before opening a write transaction so malformed imports never clear existing records.
    restoreJSON: async text => { const snapshot = validateCatalog(JSON.parse(text)); return (await transact(() => snapshot, true)).snapshot; },
    // Clone before transforming, retaining the old records for changed-row detection.
    update: async transform => (await transact(snapshot => transform(structuredClone(snapshot)))).snapshot,
    migrateLegacy: async (legacy, options) => (await transact(snapshot => migrateLegacyCatalog(snapshot, legacy, options))).snapshot,
    initializeAccount: seed => transact(null, false, (snapshot, state) => initializeCatalogAccount(snapshot, state, seed)),
    preparePending: async () => (await transact(null, false, (snapshot, state) => ({ snapshot, state: prepareCatalogPending(snapshot, state) }))).state,
    acknowledge: (receipt, expectedId) => transact(null, false, (snapshot, state) => {
      if (receipt?.mutationId !== expectedId) throw catalogSyncError(S.clientErrors.protocol);
      // Another tab may already have acknowledged this exact immutable request.
      return state.pending?.mutationId === expectedId ? acknowledgeCatalogPending(snapshot, state, receipt) : { snapshot, state };
    }),
    applyPage: page => transact(null, false, (snapshot, state) => applyCatalogPage(snapshot, state, page)),
    resolveSync: (version, useCloud) => transact(null, false, (snapshot, state) => ({
      ...resolveCatalogConflict(snapshot, state, version, useCloud), recovery: useCloud ? snapshot : null,
    })),
    recoveryJSON: async () => {
      const tx = db.transaction(S.recoveryStore, 'readonly'), rows = await result(tx.objectStore(S.recoveryStore).getAll());
      return rows.length ? JSON.stringify(rows.sort((a, b) => b.created_at - a.created_at)[0].snapshot) : null;
    },
    close: () => db.close(),
  };
}
