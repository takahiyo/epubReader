const DB_NAME = "epubReader-files";
const STORE = "files";
const VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = callback(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveFile(id, buffer, meta) {
  await withStore("readwrite", (store) => {
    store.put({ id, buffer, meta, updatedAt: Date.now() });
  });
}

export async function loadFile(id) {
  return withStore("readonly", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function deleteFile(id) {
  await withStore("readwrite", (store) => store.delete(id));
}

export function bufferToFile(record) {
  if (!record) return null;
  const { buffer, meta } = record;
  const blob = new Blob([buffer], { type: meta.mime || "application/octet-stream" });
  return new File([blob], meta.fileName, { type: meta.mime || "application/octet-stream" });
}
