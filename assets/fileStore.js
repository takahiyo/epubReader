import { FILESTORE_CONFIG, DEFAULT_DATA_SHAPE } from "./constants.js";
import { ensureOneDriveAccessToken, isTokenValid as isOneDriveTokenValid } from "./onedriveAuth.js";

const { DB_NAME, STORE, VERSION, STORAGE_KEY } = FILESTORE_CONFIG;
function getStoredData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DATA_SHAPE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DATA_SHAPE, ...parsed, settings: { ...(parsed.settings ?? {}) } };
  } catch (error) {
    console.warn("データの読み込みに失敗しました", error);
    return { ...DEFAULT_DATA_SHAPE };
  }
}

function getStoredSettings() {
  const data = getStoredData();
  return data.settings ?? null;
}

function persistSettings(partialSettings) {
  const data = getStoredData();
  data.settings = { ...(data.settings ?? {}), ...partialSettings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function resolveSource(source) {
  const settings = getStoredSettings();
  const selected = source || settings?.saveDestination || settings?.source || "local";
  if (["local", "onedrive", "pcloud"].includes(selected)) {
    return selected;
  }
  return "local";
}

function isPCloudConfigured(settings) {
  if (!settings?.apiKey || settings.apiKey === "<必要ならキー>") {
    return false;
  }
  return Boolean(settings?.endpoint);
}

function ensureCloudLoggedIn(source, settings) {
  if (source === "onedrive" && !isOneDriveTokenValid(settings?.onedriveToken)) {
    throw new Error("OneDrive にログインしてください。");
  }
  if (source === "pcloud" && !isPCloudConfigured(settings)) {
    throw new Error("pCloud の認証情報を設定してください。");
  }
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

  ensureCloudLoggedIn(resolvedSource, getStoredSettings());
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

  ensureCloudLoggedIn(resolvedSource, getStoredSettings());
  const handler = externalSourceHandlers[resolvedSource]?.load;
  if (!handler) {
    throw new Error(`${resolvedSource} は現在未対応のソースです`);
  }
  return handler(id, getStoredSettings());
}

export async function deleteFile(id) {
  await withStore("readwrite", (store) => store.delete(id));
}

/**
 * 指定されたbookIdをIndexedDBから削除
 * ローカルのファイルデータのみを削除（メタデータはstorage側で管理）
 * @param {string} bookId - 削除する書籍のID
 */
export async function deleteBook(bookId) {
  await deleteFile(bookId);
}

export function bufferToFile(record) {
  if (!record) return null;
  const { buffer, meta } = record;
  const mime = meta.mime || FILESTORE_CONFIG.DEFAULT_MIME_TYPE;
  const fileName = meta.fileName || FILESTORE_CONFIG.DEFAULT_FILE_NAME;
  const blob = new Blob([buffer], { type: mime });
  return new File([blob], fileName, { type: mime });
}

async function notImplemented(source) {
  throw new Error(`${source} での保存先はまだ設定されていません`);
}

function pCloudHeaders(settings) {
  const headers = {};
  if (settings?.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }
  return headers;
}

async function ensureOneDriveToken() {
  const settings = getStoredSettings();
  return await ensureOneDriveAccessToken(settings, (onedriveToken) => persistSettings({ onedriveToken }));
}

const { ONEDRIVE_BASE_FOLDER } = FILESTORE_CONFIG;

async function ensureOneDriveFolder(accessToken) {
  const baseUrl = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${ONEDRIVE_BASE_FOLDER}`;
  const exists = await fetch(baseUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (exists.status === 404) {
    const createRes = await fetch("https://graph.microsoft.com/v1.0/me/drive/special/approot/children", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: ONEDRIVE_BASE_FOLDER,
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace",
      }),
    });
    if (!createRes.ok && createRes.status !== 409) {
      throw new Error(`OneDrive フォルダの作成に失敗しました (${createRes.status})`);
    }
  } else if (!exists.ok) {
    throw new Error(`OneDrive フォルダの確認に失敗しました (${exists.status})`);
  }
}

async function findOneDriveFile(accessToken, id) {
  await ensureOneDriveFolder(accessToken);
  const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${ONEDRIVE_BASE_FOLDER}:/children?$select=id,name,file,@microsoft.graph.downloadUrl&$top=200`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`OneDrive のファイル検索に失敗しました (${response.status})`);
  }
  const json = await response.json();
  const list = json?.value ?? [];
  return list.find((item) => (item?.name || "").startsWith(`${id}-`)) ?? null;
}

async function uploadOneDriveFile(accessToken, id, buffer, meta) {
  await ensureOneDriveFolder(accessToken);
  const safeName = meta?.fileName || FILESTORE_CONFIG.DEFAULT_FILE_NAME;
  const fileName = `${id}-${safeName}`;
  const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${ONEDRIVE_BASE_FOLDER}/${encodeURIComponent(
    fileName,
  )}:/content`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": meta?.mime || FILESTORE_CONFIG.DEFAULT_MIME_TYPE,
    },
    body: buffer,
  });
  if (!response.ok) {
    throw new Error(`OneDrive への保存に失敗しました (${response.status})`);
  }
  const json = await response.json().catch(() => null);
  return json?.id ?? null;
}

async function downloadOneDriveRecord(accessToken, item) {
  const downloadUrl =
    item["@microsoft.graph.downloadUrl"] ||
    `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content`;
  const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`OneDrive からのダウンロードに失敗しました (${response.status})`);
  }
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return {
    id: item.id,
    buffer,
    meta: {
      fileName:
        item.name?.replace(/^[^-]+-/, "") ||
        item.name ||
        `${FILESTORE_CONFIG.ONEDRIVE_FALLBACK_PREFIX}-${item.id}.bin`,
      mime: blob.type || FILESTORE_CONFIG.DEFAULT_MIME_TYPE,
    },
  };
}

function buildPCloudUrl(settings, id) {
  const endpoint = (settings?.endpoint || "").replace(/\/$/, "");
  if (!endpoint) throw new Error("pCloud / カスタムエンドポイントが設定されていません");
  return `${endpoint}/files/${encodeURIComponent(id)}`;
}

const externalSourceHandlers = {
  onedrive: {
    save: async (id, buffer, meta) => {
      const accessToken = await ensureOneDriveToken();
      await uploadOneDriveFile(accessToken, id, buffer, meta);
    },
    load: async (id) => {
      const accessToken = await ensureOneDriveToken();
      const item = await findOneDriveFile(accessToken, id);
      if (!item?.id) return null;
      return downloadOneDriveRecord(accessToken, item);
    },
  },
  pcloud: {
    save: async (id, buffer, meta) => {
      const settings = getStoredSettings();
      const url = buildPCloudUrl(settings, id);
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": meta?.mime || FILESTORE_CONFIG.DEFAULT_MIME_TYPE,
          ...pCloudHeaders(settings),
        },
        body: buffer,
      });
      if (!response.ok) {
        throw new Error(`pCloud への保存に失敗しました (${response.status})`);
      }
    },
    load: async (id) => {
      const settings = getStoredSettings();
      const url = buildPCloudUrl(settings, id);
      const response = await fetch(url, { headers: pCloudHeaders(settings) });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`pCloud からの取得に失敗しました (${response.status})`);
      }
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      const fileName =
        response.headers.get("x-file-name") || `${FILESTORE_CONFIG.PCLOUD_FALLBACK_PREFIX}-${id}`;
      return {
        id,
        buffer,
        meta: { fileName, mime: blob.type || FILESTORE_CONFIG.DEFAULT_MIME_TYPE },
      };
    },
  },
};
