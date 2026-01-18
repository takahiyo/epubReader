/**
 * cloudSync.js - クラウド同期
 * 
 * Firebase SDK直接通信 → Cloudflare Workers フォールバックの冗長化構成を提供します。
 */

import { CDN_URLS } from "./constants.js";
import { ensureOneDriveAccessToken, isTokenValid as isOneDriveTokenValid } from "./onedriveAuth.js";
import { getCurrentUserId, getIdTokenInfo, ID_TOKEN_TYPE } from "./auth.js";
import { db } from "./firebaseConfig.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const AUTH_REQUIRED_MESSAGE = "ログインが必要です。設定からログインしてください。";

export class CloudSync {
  constructor(storage) {
    this.storage = storage;
  }

  resolveSource(source, settings = this.storage.getSettings()) {
    const selected = source || settings.saveDestination || settings.source || "local";
    if (["local", "firebase", "onedrive", "pcloud"].includes(selected)) {
      return selected;
    }
    // "gas" などの古い設定値は firebase (default cloud) として扱う
    if (selected === "gas") return "firebase";
    return "local";
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
      throw new Error(AUTH_REQUIRED_MESSAGE);
    }
    return uid;
  }

  getFirebaseSyncEndpoint(settings = this.storage.getSettings()) {
    return (
      settings?.firebaseEndpoint ||
      settings?.firebaseSyncEndpoint ||
      (typeof window !== "undefined" && window.APP_CONFIG?.FIREBASE_SYNC_ENDPOINT) ||
      ""
    );
  }

  buildFirebaseSyncUrl(endpoint, path) {
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
    if (info.tokenType && info.tokenType !== ID_TOKEN_TYPE.FIREBASE) return null;
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
  // Failover Logic (SDK -> Workers)
  // ===============================

  async executeWithFailover(sdkTask, apiTask, label) {
    try {
      const result = await sdkTask();
      return result;
    } catch (sdkError) {
      console.warn(`[CloudSync:${label}] SDK failed, trying Workers fallback...`, sdkError);
    }

    try {
      const result = await apiTask();
      return result;
    } catch (apiError) {
      console.error(`[CloudSync:${label}] All sync methods failed.`, apiError);
      throw apiError;
    }
  }

  // ===============================
  // Workers (REST API) Methods
  // ===============================

  async postFirebaseSync(path, payload, settings = this.storage.getSettings()) {
    const endpoint = this.getFirebaseSyncEndpoint(settings);
    if (!endpoint) {
      throw new Error("No Workers endpoint configured");
    }
    const idToken = await this.getFirebaseIdToken();
    if (!idToken) {
      throw new Error("No ID Token available");
    }
    const url = this.buildFirebaseSyncUrl(endpoint, path);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, ...payload }),
    });
    if (!response.ok) {
      throw new Error(`Workers sync failed (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
  }

  // ===============================
  // Firestore Operations
  // ===============================

  async pushToFirebase(settings) {
    const uid = this.getUserIdOrThrow();
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };

    // Path: users/{uid}/appData/syncSettings
    const docRef = doc(db, "users", uid, "appData", "syncSettings");
    await setDoc(docRef, payload);

    return { source: "firebase", status: "success" };
  }

  async pullFromFirebase(settings, { merge = true } = {}) {
    const uid = this.getUserIdOrThrow();

    // Path: users/{uid}/appData/syncSettings
    const docRef = doc(db, "users", uid, "appData", "syncSettings");
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return { source: "firebase", status: "not_found" };
    }

    const json = docSnap.data();
    if (json?.data && merge) {
      this.storage.mergeData(json.data);
    }
    return json;
  }

  async pullBookDataFirestore(bookId) {
    const uid = this.getUserIdOrThrow();
    // Path: users/{uid}/books/{bookId}
    const docRef = doc(db, "users", uid, "books", bookId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {};
    }
    return docSnap.data();
  }

  async pushBookDataFirestore(bookId, payload) {
    const uid = this.getUserIdOrThrow();
    const docRef = doc(db, "users", uid, "books", bookId);

    // Flatten payload if needed, or just save as is.
    // app.js sends: { data, updatedAt } usually, or specific fields.
    // We'll merge.
    await setDoc(docRef, payload, { merge: true });

    return { status: "success", source: "sdk" };
  }

  async pullIndexFirestore() {
    const uid = this.getUserIdOrThrow();
    const docRef = doc(db, "users", uid, "appData", "index");
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return { index: {} };
    }
    return docSnap.data();
    // expected format: { index: { bookId: meta, ... } }
  }

  async pushIndexDeltaFirestore(indexDelta, updatedAt) {
    const uid = this.getUserIdOrThrow();
    const docRef = doc(db, "users", uid, "appData", "index");

    // Update index with dot notation is not easily dynamic without flattening.
    // But since indexDelta is { [bookId]: meta }, we can use merge: true with exact structure 'index'
    // Actually we want to merge deep. `setDoc` with merge:true merges top level fields.
    // If we have { index: { bookA: ... } } and we save { index: { bookB: ... } }, 
    // with merge: true, if 'index' is a Map, it should merge keys if using dot notation or Map?
    // Firestore `setDoc` with merge replaces the whole map if we just say `index: ...` unless we use dot notation `index.bookId`.

    // To be safe and simple: read, merge locally, write back? Or use specific update.
    // But indexDelta might have multiple keys.
    // Easiest robust way for now: Read, merge, Write. Index shouldn't be huge.
    // OR: Use setDoc with `merge: true`.
    // Warning: `setDoc` with nested objects merges them? Yes, setDoc({ a: { b: 1 } }, { merge: true }) 
    // against existing { a: { c: 2 } } results in { a: { b: 1, c: 2 } }.
    // So wrapping in `index` object should work.

    const payload = {
      index: indexDelta,
      updatedAt
    };
    await setDoc(docRef, payload, { merge: true });
    return { status: "success", source: "sdk" };
  }

  async matchBookFirestore(fingerprint, meta) {
    const uid = this.getUserIdOrThrow();
    // Strategy: Search in 'users/{uid}/books' collection where 'contentHash' == fingerprint
    const booksRef = collection(db, "users", uid, "books");
    const q = query(booksRef, where("contentHash", "==", fingerprint));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return { found: false };
    }

    // Return the first match
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    return { found: true, cloudBookId: doc.id, meta: data };
  }

  // ===============================
  // Public API
  // ===============================

  async push(source) {
    const { settings, resolvedSource } = this.getSettings(source);

    if (resolvedSource === "local") {
      return { source: "local", status: "skipped" };
    }

    if (resolvedSource === "firebase") {
      return this.pushToFirebase(settings);
    }

    if (resolvedSource === "onedrive") {
      if (!isOneDriveTokenValid(settings?.onedriveToken)) {
        return { source: "onedrive", status: "unauthenticated" };
      }
      return this.pushToOneDrive(settings);
    }

    if (resolvedSource === "pcloud") {
      if (!this.isPCloudConfigured(settings)) {
        return { source: "pcloud", status: "unauthenticated" };
      }
      return this.pushToPCloud(settings);
    }

    // Fallback for custom endpoints if any
    if (settings.endpoint) {
      return this.pushToEndpoint(settings);
    }

    throw new Error(`Unknown source: ${resolvedSource}`);
  }

  async pull(source) {
    const { settings, resolvedSource } = this.getSettings(source);

    if (resolvedSource === "local") {
      return { source: "local", status: "skipped" };
    }

    if (resolvedSource === "firebase") {
      return this.pullFromFirebase(settings, { merge: true });
    }

    if (resolvedSource === "onedrive") {
      if (!isOneDriveTokenValid(settings?.onedriveToken)) {
        return { source: "onedrive", status: "unauthenticated" };
      }
      return this.pullFromOneDrive(settings, { merge: true });
    }

    if (resolvedSource === "pcloud") {
      if (!this.isPCloudConfigured(settings)) {
        return { source: "pcloud", status: "unauthenticated" };
      }
      return this.pullFromPCloud(settings, { merge: true });
    }

    if (settings.endpoint) {
      return this.pullFromEndpoint(settings, { merge: true });
    }

    throw new Error(`Unknown source: ${resolvedSource}`);
  }

  async fetchRemoteSnapshot(source) {
    const { settings, resolvedSource } = this.getSettings(source);
    if (resolvedSource === "local") {
      return null;
    }

    if (resolvedSource === "firebase") {
      const result = await this.pullFromFirebase(settings, { merge: false });
      return result?.data ?? result;
    }

    if (resolvedSource === "onedrive") {
      if (!isOneDriveTokenValid(settings?.onedriveToken)) {
        throw new Error("OneDrive の認証が必要です");
      }
      const result = await this.pullFromOneDrive(settings, { merge: false });
      return result?.data ?? result;
    }

    if (resolvedSource === "pcloud") {
      if (!this.isPCloudConfigured(settings)) {
        throw new Error("pCloud の設定が必要です");
      }
      const result = await this.pullFromPCloud(settings, { merge: false });
      return result?.data ?? result;
    }

    if (settings.endpoint) {
      const result = await this.pullFromEndpoint(settings, { merge: false });
      return result?.data ?? result;
    }
    return null;
  }

  async pullBookData(bookId, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.pullBookDataFirestore(bookId);
  }

  async pushBookData(bookId, payload, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.pushBookDataFirestore(bookId, payload);
  }

  async matchBook(fingerprint, meta, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.matchBookFirestore(fingerprint, meta);
  }

  async pullIndex(settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.executeWithFailover(
      () => this.pullIndexFirestore(),
      () => this.postFirebaseSync("/sync/index/pull", {}, settings),
      "pullIndex"
    );
  }

  async pushIndexDelta(indexDelta, updatedAt, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.executeWithFailover(
      () => this.pushIndexDeltaFirestore(indexDelta, updatedAt),
      () => this.postFirebaseSync("/sync/index/push", { indexDelta, updatedAt }, settings),
      "pushIndex"
    );
  }

  async pullState(cloudBookId, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.executeWithFailover(
      () => this.pullBookDataFirestore(cloudBookId),
      () => this.postFirebaseSync("/sync/state/pull", { cloudBookId }, settings),
      "pullState"
    );
  }

  async pushState(cloudBookId, state, updatedAt, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("firebase", settings);
    if (resolvedSource !== "firebase") {
      return { source: resolvedSource, status: "skipped" };
    }
    const normalizedState = this.normalizeCloudState(state, updatedAt);
    const payload = { state: normalizedState, updatedAt: normalizedState.updatedAt };
    return this.executeWithFailover(
      () => this.pushBookDataFirestore(cloudBookId, payload),
      () => this.postFirebaseSync("/sync/state/push", { cloudBookId, ...payload }, settings),
      "pushState"
    );
  }


  // ===============================
  // Other Cloud Providers (OneDrive / pCloud / Generic Endpoint)
  // ===============================

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
      throw new Error(`同期に失敗しました (${response.status})`);
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
      throw new Error(`データ取得に失敗しました (${response.status})`);
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
      throw new Error("OneDrive 上に同期ファイルが見つかりませんでした");
    }
    const response = await fetch(this.buildOneDriveContentUrl({ ...settings, onedriveFileId: item.id }), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`OneDrive からの取得に失敗しました (${response.status})`);
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
        throw new Error(`OneDrive のファイル確認に失敗しました (${byId.status})`);
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
      throw new Error(`OneDrive のファイル検索に失敗しました (${response.status})`);
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
      throw new Error(`OneDrive への保存に失敗しました (${response.status})`);
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
      throw new Error(`pCloud への保存に失敗しました (${response.status})`);
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
      throw new Error(`pCloud からの取得に失敗しました (${response.status})`);
    }
    const json = await response.json();
    if (json?.data && merge) {
      this.storage.mergeData(json.data);
    }
    return json;
  }
}
