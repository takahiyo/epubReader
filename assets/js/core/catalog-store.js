/** Dedicated IndexedDB catalog repository. No changes to files, reader bookmarks or progress. */
import { CATALOG_CONFIG as C } from '../../constants.js';
import { emptyCatalog, validateCatalog, migrateLegacyCatalog } from './catalog-model.js';

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
  async function transact(transform = null, replace = false) {
    const tx = db.transaction(names, transform ? 'readwrite' : 'readonly');
    const done = completion(tx);
    // Attach rejection handling immediately, including failures caught before awaiting completion.
    done.catch(() => {});
    try {
      const records = await Promise.all(names.map(name => result(tx.objectStore(name).getAll())));
      const snapshot = { ...emptyCatalog(), ...Object.fromEntries(names.map((name, index) => [name, records[index]])) };
      const next = transform ? validateCatalog(transform(snapshot)) : validateCatalog(snapshot);
      if (transform) {
        for (const name of names) {
          const store = tx.objectStore(name);
          if (replace) store.clear();
          const previous = new Map(snapshot[name].map(record => [record.id, JSON.stringify(record)]));
          for (const record of next[name]) {
            if (replace || previous.get(record.id) !== JSON.stringify(record)) store.put(record);
          }
        }
      }
      await done;
      return next;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted/completed. */ }
      throw error;
    }
  }

  return {
    read: () => transact(),
    exportJSON: async () => JSON.stringify(await transact()),
    // Validate before opening a write transaction so malformed imports never clear existing records.
    restoreJSON: text => { const snapshot = validateCatalog(JSON.parse(text)); return transact(() => snapshot, true); },
    // Clone before transforming, retaining the old records for changed-row detection.
    update: transform => transact(snapshot => transform(structuredClone(snapshot))),
    migrateLegacy: (legacy, options) => transact(snapshot => migrateLegacyCatalog(snapshot, legacy, options)),
    close: () => db.close(),
  };
}
