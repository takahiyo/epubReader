import { ensureDriveAccessToken, isTokenValid as isDriveTokenValid } from "./driveAuth.js";
import { ensureOneDriveAccessToken, isTokenValid as isOneDriveTokenValid } from "./onedriveAuth.js";

const DB_NAME = "epubReader-files";
const STORE = "files";
const VERSION = 1;
const STORAGE_KEY = "epubReader:data";
const EMPTY_DATA = { library: {}, bookmarks: {}, progress: {}, history: [], settings: {} };

function getStoredData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_DATA };
    const parsed = JSON.parse(raw);
    return { ...EMPTY_DATA, ...parsed, settings: { ...(parsed.settings ?? {}) } };
  } catch (error) {
    console.warn("データの読み込みに失敗しました", error);
    return { ...EMPTY_DATA };
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
  if (["local", "drive", "onedrive", "pcloud"].includes(selected)) {
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
  if (source === "drive" && !isDriveTokenValid(settings?.driveToken)) {
    throw new Error("Google Drive にログインしてください。");
  }
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

export function bufferToFile(record) {
  if (!record) return null;
  const { buffer, meta } = record;
  const blob = new Blob([buffer], { type: meta.mime || "application/octet-stream" });
  return new File([blob], meta.fileName, { type: meta.mime || "application/octet-stream" });
}

async function notImplemented(source) {
  throw new Error(`${source} での保存先はまだ設定されていません`);
}

function driveHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function pCloudHeaders(settings) {
  const headers = {};
  if (settings?.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }
  return headers;
}

async function ensureDriveToken() {
  const settings = getStoredSettings();
  return await ensureDriveAccessToken(settings, (driveToken) => persistSettings({ driveToken }));
}

async function ensureOneDriveToken() {
  const settings = getStoredSettings();
  return await ensureOneDriveAccessToken(settings, (onedriveToken) => persistSettings({ onedriveToken }));
}

function buildDriveQueryForId(id) {
  return encodeURIComponent(`appProperties has { key='bookId' and value='${id}' } and trashed=false`);
}

async function findDriveFile(accessToken, id) {
  const url = `https://www.googleapis.com/drive/v3/files?q=${buildDriveQueryForId(id)}&fields=files(id,name,mimeType,appProperties)`;
  const response = await fetch(url, { headers: driveHeaders(accessToken) });
  if (!response.ok) {
    throw new Error(`Drive のファイル検索に失敗しました (${response.status})`);
  }
  const json = await response.json();
  return json?.files?.[0] ?? null;
}

async function uploadDriveFile(accessToken, id, buffer, meta, settings) {
  const existing = await findDriveFile(accessToken, id).catch(() => null);
  const boundary = `-------drive-upload-${Math.random().toString(16).slice(2)}`;
  const metadata = {
    name: `book-${id}-${meta?.fileName || "book.bin"}`,
    mimeType: meta?.mime || "application/octet-stream",
    appProperties: {
      bookId: id,
      originalName: meta?.fileName || "",
      mime: meta?.mime || "",
      updatedAt: Date.now().toString(),
    },
  };
  if (settings?.driveFolderId) {
    metadata.parents = [settings.driveFolderId];
  }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    new Uint8Array(buffer),
    `\r\n--${boundary}--`,
  ]);
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const method = existing ? "PATCH" : "POST";
  const response = await fetch(url, {
    method,
    headers: { ...driveHeaders(accessToken), "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) {
    throw new Error(`Drive への保存に失敗しました (${response.status})`);
  }
  const json = await response.json();
  return json.id;
}

async function downloadDriveRecord(accessToken, file) {
  const meta = file;
  const dataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: driveHeaders(accessToken),
  });
  if (!dataResponse.ok) {
    throw new Error(`Drive からのダウンロードに失敗しました (${dataResponse.status})`);
  }
  const buffer = await dataResponse.arrayBuffer();
  return {
    id: meta.id,
    buffer,
    meta: {
      fileName: meta?.appProperties?.originalName || meta?.name || `drive-${meta.id}.bin`,
      mime: meta?.mimeType || meta?.appProperties?.mime || "application/octet-stream",
    },
  };
}

const ONEDRIVE_BASE_FOLDER = "epub-reader";

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
  const safeName = meta?.fileName || "book.bin";
  const fileName = `${id}-${safeName}`;
  const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${ONEDRIVE_BASE_FOLDER}/${encodeURIComponent(
    fileName,
  )}:/content`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": meta?.mime || "application/octet-stream" },
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
      fileName: item.name?.replace(/^[^-]+-/, "") || item.name || `onedrive-${item.id}.bin`,
      mime: blob.type || "application/octet-stream",
    },
  };
}

function buildPCloudUrl(settings, id) {
  const endpoint = (settings?.endpoint || "").replace(/\/$/, "");
  if (!endpoint) throw new Error("pCloud / カスタムエンドポイントが設定されていません");
  return `${endpoint}/files/${encodeURIComponent(id)}`;
}

const externalSourceHandlers = {
  drive: {
    save: async (id, buffer, meta) => {
      const settings = getStoredSettings();
      const accessToken = await ensureDriveToken(settings);
      await uploadDriveFile(accessToken, id, buffer, meta, settings);
    },
    load: async (id) => {
      const settings = getStoredSettings();
      const accessToken = await ensureDriveToken(settings);
      const found = await findDriveFile(accessToken, id);
      if (!found?.id) return null;
      return downloadDriveRecord(accessToken, found);
    },
  },
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
          "Content-Type": meta?.mime || "application/octet-stream",
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
      const fileName = response.headers.get("x-file-name") || `pcloud-${id}`;
      return {
        id,
        buffer,
        meta: { fileName, mime: blob.type || "application/octet-stream" },
      };
    },
  },
};
