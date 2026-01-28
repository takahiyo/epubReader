/**
 * cloudSync.js - クラウド同期 (D1版)
 * * Cloudflare Workers (D1) を正(SSOT)として利用します。
 * Firestore SDKへの直接アクセスは廃止されました。
 */

import { SYNC_CONFIG, WORKERS_CONFIG } from "./constants.js";
import { ensureOneDriveAccessToken, isTokenValid as isOneDriveTokenValid } from "./onedriveAuth.js";
import { getCurrentUserId, getIdTokenInfo, ID_TOKEN_TYPE } from "./auth.js";
import { t, tReplace } from "./i18n.js";

export class CloudSync {
  constructor(storage) {
    this.storage = storage;
  }

  resolveSource(source, settings = this.storage.getSettings()) {
    const selected =
      source ||
      settings.saveDestination ||
      settings.source ||
      SYNC_CONFIG.DEFAULT_SOURCE;
    const normalized = SYNC_CONFIG.LEGACY_ALIASES[selected] ?? selected;
    if (SYNC_CONFIG.ALLOWED_SOURCES.includes(normalized)) {
      return normalized;
    }
    return SYNC_CONFIG.DEFAULT_SOURCE;
  }

  isPCloudConfigured(settings) {
    if (!settings?.apiKey || settings.apiKey === "<必要ならキー>") {
      return false;
    }
    return Boolean(settings?.endpoint);
  }

  getSettings(source) {
    const settings = this.storage.getSettings();
    const resolvedSource = this.resolveSource(source, settings);
    return { settings, resolvedSource };
  }

  getUserIdOrThrow() {
    const uid = getCurrentUserId();
    if (!uid) {
      throw new Error(t("cloudSyncAuthRequired"));
    }
    return uid;
  }

  // Workerのエンドポイント取得 (設定名はfirebaseEndpointのまま互換維持)
  getWorkerEndpoint(settings = this.storage.getSettings()) {
    return (
      settings?.firebaseEndpoint ||
      settings?.firebaseSyncEndpoint ||
      (typeof window !== "undefined" && window.APP_CONFIG?.FIREBASE_SYNC_ENDPOINT) ||
      WORKERS_CONFIG.SYNC_ENDPOINT ||
      ""
    );
  }

  buildWorkerSyncUrl(endpoint, path) {
    if (!endpoint) return null;
    if (endpoint.includes("{path}")) {
      return endpoint.replace("{path}", encodeURIComponent(path));
    }
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}path=${encodeURIComponent(path)}`;
  }

  async getFirebaseIdToken() {
    const info = await getIdTokenInfo();
    if (!info?.idToken) return null;
    // GISトークンでもFirebaseトークンでも、Worker側で検証するためそのまま返す
    return info.idToken;
  }

  normalizeCloudState(state, updatedAt) {
    const safeState = state ?? {};
    const safeBookmarks = Array.isArray(safeState.bookmarks) ? safeState.bookmarks : [];
    return {
      ...safeState,
      progress: typeof safeState.progress === "number" ? safeState.progress : 0,
      lastCfi: safeState.lastCfi ?? null,
      location: safeState.location ?? safeState.lastCfi ?? null,
      bookmarks: safeBookmarks,
      updatedAt: safeState.updatedAt ?? updatedAt ?? Date.now(),
    };
  }

  // ===============================
  // Worker (D1) Access Methods
  // ===============================

  async postWorkerSync(path, payload, settings = this.storage.getSettings()) {
    const endpoint = this.getWorkerEndpoint(settings);
    if (!endpoint) {
      throw new Error(t("cloudSyncNoEndpoint"));
    }
    const idToken = await this.getFirebaseIdToken();
    if (!idToken) {
      throw new Error(t("cloudSyncNoIdToken"));
    }
    const url = this.buildWorkerSyncUrl(endpoint, path);
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, ...payload }),
    });

    if (!response.ok) {
      throw new Error(tReplace("cloudSyncWorkersFailed", { status: response.status }));
    }
    const json = await response.json();
    
    // エラーレスポンスのハンドリング
    if (json.error) {
      throw new Error(json.error);
    }

    return json?.data ?? json;
  }

  // ===============================
  // D1 Operations (via Worker)
  // ===============================

  async pullBookDataD1(bookId, settings = this.storage.getSettings()) {
    // D1移行後は個別のBookData取得もWorker経由で行う
    // (現在の実装ではpullStateがその役割を担うため、ここは互換性維持または未使用)
    return {}; 
  }

  async matchBook(fingerprint, meta, settings = this.storage.getSettings()) {
    // マッチング機能はWorker側で未実装の場合があるため、インデックス同期で代用するか、
    // 必要に応じてWorkerに実装を追加する。
    // 現状のWorker実装には matchBook 用のエンドポイントがないため、
    // ここでは「見つからない」として返し、新規作成フローに倒すのが安全。
    // ※必要であればWorkerに /sync/match エンドポイントを追加実装してください。
    return { found: false };
  }

  async pullIndex(settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    // 差分同期: 最後の同期時刻以降の更新のみ取得
    const since = this.storage.data.cloudIndexUpdatedAt ?? null;
    return this.postWorkerSync("/sync/index/pull", { since }, settings);
  }

  async pushIndexDelta(indexDelta, updatedAt, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.postWorkerSync("/sync/index/push", { indexDelta, updatedAt }, settings);
  }

  async pullState(cloudBookId, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.postWorkerSync("/sync/state/pull", { cloudBookId }, settings);
  }

  async pushState(cloudBookId, state, updatedAt, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    const normalizedState = this.normalizeCloudState(state, updatedAt);
    const payload = { state: normalizedState, updatedAt: normalizedState.updatedAt };
    return this.postWorkerSync("/sync/state/push", { cloudBookId, ...payload }, settings);
  }

  // ===============================
  // Other Cloud Providers (OneDrive / pCloud / Generic Endpoint)
  // ===============================
  // ※ ここから下は既存コードと同じですが、CloudSyncクラス全体を置き換えるため含めます

  buildHeaders(apiKey) {
    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
  }

  buildAuthHeader(apiKey) {
    if (!apiKey) return {};
    return { Authorization: `Bearer ${apiKey}` };
  }

  async pushToEndpoint(settings) {
    const { endpoint, apiKey } = settings;
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({ action: "save", payload }),
    });

    if (!response.ok) {
      throw new Error(tReplace("cloudSyncEndpointSaveFailed", { status: response.status }));
    }

    return response.json().catch(() => ({}));
  }

  async pullFromEndpoint(settings, { merge = true } = {}) {
    const { endpoint, apiKey } = settings;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({ action: "load" }),
    });

    if (!response.ok) {
      throw new Error(tReplace("cloudSyncEndpointLoadFailed", { status: response.status }));
    }

    const json = await response.json();
    if (json?.data && merge) {
      this.storage.mergeData(json.data);
    }
    return json;
  }

  async pushToOneDrive(settings) {
    const accessToken = this.ensureOneDriveToken(settings);
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };
    const fileId = await this.uploadToOneDrive(accessToken, payload, settings);
    if (fileId && fileId !== settings.onedriveFileId) {
      this.storage.setSettings({ onedriveFileId: fileId });
    }
    return { source: "onedrive", fileId };
  }

  async pullFromOneDrive(settings, { merge = true } = {}) {
    const accessToken = this.ensureOneDriveToken(settings);
    const item = await this.resolveOneDriveItem(accessToken, settings);
    if (!item?.id) {
      throw new Error(t("cloudSyncOneDriveFileMissing"));
    }
    const response = await fetch(this.buildOneDriveContentUrl({ ...settings, onedriveFileId: item.id }), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncOneDriveFetchFailed", { status: response.status }));
    }
    const json = await response.json();
    if (json?.data && merge) {
      this.storage.mergeData(json.data);
    }
    if (item.id && item.id !== settings.onedriveFileId) {
      this.storage.setSettings({ onedriveFileId: item.id });
    }
    return json;
  }

  ensureOneDriveToken(settings) {
    const token = ensureOneDriveAccessToken(settings, (onedriveToken) => {
      this.storage.setSettings({ onedriveToken });
    });
    return token;
  }

  encodeOneDrivePath(path) {
    return path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
  }

  buildOneDrivePath(settings) {
    const fallback = "epub-reader-data.json";
    const rawPath = settings.onedriveFilePath || fallback;
    const normalized = rawPath.replace(/^\/+/, "");
    return normalized || fallback;
  }

  buildOneDriveContentUrl(settings) {
    if (settings.onedriveFileId) {
      return `https://graph.microsoft.com/v1.0/me/drive/items/${settings.onedriveFileId}/content`;
    }
    const path = this.buildOneDrivePath(settings);
    const encodedPath = this.encodeOneDrivePath(path);
    return `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodedPath}:/content`;
  }

  async resolveOneDriveItem(accessToken, settings) {
    if (settings.onedriveFileId) {
      const byId = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${settings.onedriveFileId}?select=id,name,lastModifiedDateTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (byId.ok) {
        return byId.json();
      }
      if (byId.status !== 404) {
        throw new Error(tReplace("cloudSyncOneDriveCheckFailed", { status: byId.status }));
      }
    }

    const path = this.buildOneDrivePath(settings);
    const encodedPath = this.encodeOneDrivePath(path);
    const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodedPath}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncOneDriveSearchFailed", { status: response.status }));
    }
    const result = await response.json();
    return result ?? null;
  }

  async uploadToOneDrive(accessToken, payload, settings) {
    const url = this.buildOneDriveContentUrl(settings);
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncOneDriveUploadFailed", { status: response.status }));
    }
    const meta = await response.json().catch(() => null);
    return meta?.id ?? null;
  }

  async pushToPCloud(settings) {
    const { endpoint, apiKey } = settings;
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...this.buildAuthHeader(apiKey),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncPCloudSaveFailed", { status: response.status }));
    }
    return response.json().catch(() => ({ source: "pcloud" }));
  }

  async pullFromPCloud(settings, { merge = true } = {}) {
    const { endpoint, apiKey } = settings;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: this.buildAuthHeader(apiKey),
    });
    if (response.status === 404) {
      return { source: "pcloud", status: "not_found" };
    }
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncPCloudFetchFailed", { status: response.status }));
    }
    const json = await response.json();
    if (json?.data && merge) {
      this.storage.mergeData(json.data);
    }
    return json;
  }

  // ===============================
  // Public API Wrappers (Backward Compatibility)
  // ===============================

  async push(source) {
    const { settings, resolvedSource } = this.getSettings(source);

    if (resolvedSource === "local") return { source: "local", status: "skipped" };
    // "firebase" means Worker(D1) in this new implementation
    if (resolvedSource === "firebase") {
        // Full snapshot push to Firebase/Worker is NOT supported in the new D1 logic yet.
        // D1 logic focuses on per-book 'pushState' and index 'pushIndex'.
        // If 'push' is called for full backup, we might need a separate endpoint or just skip it.
        // For now, we skip full backup sync for D1 to encourage granular sync.
        console.warn("Full backup push is not implemented for D1 backend yet.");
        return { source: "firebase", status: "skipped_full_backup" };
    }
    if (resolvedSource === "onedrive") {
      if (!isOneDriveTokenValid(settings?.onedriveToken)) return { source: "onedrive", status: "unauthenticated" };
      return this.pushToOneDrive(settings);
    }
    if (resolvedSource === "pcloud") {
      if (!this.isPCloudConfigured(settings)) return { source: "pcloud", status: "unauthenticated" };
      return this.pushToPCloud(settings);
    }
    if (settings.endpoint) return this.pushToEndpoint(settings);

    throw new Error(tReplace("cloudSyncUnknownSource", { source: resolvedSource }));
  }

  async pull(source) {
    const { settings, resolvedSource } = this.getSettings(source);

    if (resolvedSource === "local") return { source: "local", status: "skipped" };
    if (resolvedSource === "firebase") {
        // Similarly, full restore from D1 is not implemented in granular logic.
        // We use syncAllBooksFromCloud (pullIndex) instead.
        console.warn("Full backup pull is not implemented for D1 backend yet.");
        return { source: "firebase", status: "skipped_full_restore" };
    }
    if (resolvedSource === "onedrive") {
      if (!isOneDriveTokenValid(settings?.onedriveToken)) return { source: "onedrive", status: "unauthenticated" };
      return this.pullFromOneDrive(settings, { merge: true });
    }
    if (resolvedSource === "pcloud") {
      if (!this.isPCloudConfigured(settings)) return { source: "pcloud", status: "unauthenticated" };
      return this.pullFromPCloud(settings, { merge: true });
    }
    if (settings.endpoint) return this.pullFromEndpoint(settings, { merge: true });

    throw new Error(tReplace("cloudSyncUnknownSource", { source: resolvedSource }));
  }
}
