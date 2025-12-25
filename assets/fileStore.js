const DB_NAME = "epubReader-files";
const STORE = "files";
const VERSION = 1;
const STORAGE_KEY = "epubReader:data";

function getStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.settings ?? null;
  } catch (error) {
    console.warn("設定の読み込みに失敗しました", error);
    return null;
  }
}

function resolveSource(source) {
  const settings = getStoredSettings();
  const selected = source || settings?.source || "local";
  if (["local", "drive", "onedrive", "pcloud"].includes(selected)) {
    return selected;
  }
  return "local";
}

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

async function saveLocalFile(id, buffer, meta) {
  await withStore("readwrite", (store) => {
    store.put({ id, buffer, meta, updatedAt: Date.now() });
  });
}

export async function saveFile(id, buffer, meta, source) {
  const resolvedSource = resolveSource(source);
  if (resolvedSource === "local") {
    return saveLocalFile(id, buffer, meta);
  }

  const handler = externalSourceHandlers[resolvedSource]?.save;
  if (!handler) {
    throw new Error(`${resolvedSource} は現在未対応のソースです`);
  }
  return handler(id, buffer, meta, getStoredSettings());
}

async function loadLocalFile(id) {
  return withStore("readonly", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function loadFile(id, source) {
  const resolvedSource = resolveSource(source);
  if (resolvedSource === "local") {
    return loadLocalFile(id);
  }

  const handler = externalSourceHandlers[resolvedSource]?.load;
  if (!handler) {
    throw new Error(`${resolvedSource} は現在未対応のソースです`);
  }
  return handler(id, getStoredSettings());
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

async function notImplemented(source) {
  throw new Error(`${source} での保存先はまだ設定されていません`);
}

const externalSourceHandlers = {
  drive: {
    save: (id, buffer, meta) => notImplemented("Drive"),
    load: (id) => notImplemented("Drive"),
  },
  onedrive: {
    save: (id, buffer, meta) => notImplemented("OneDrive"),
    load: (id) => notImplemented("OneDrive"),
  },
  pcloud: {
    save: (id, buffer, meta) => notImplemented("pCloud"),
    load: (id) => notImplemented("pCloud"),
  },
};
