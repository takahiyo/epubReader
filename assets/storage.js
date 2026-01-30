/**
 * storage.js - ローカルストレージ管理
 * 
 * 読書データの永続化とデータマージ機能を提供します。
 * 設定値は constants.js (SSOT) から参照します。
 */

import {
  STORAGE_CONFIG,
  STORAGE_SOURCE_ALIASES,
  STORAGE_SOURCE_DEFAULT,
  DEVICE_COLOR_PALETTE,
  DEFAULT_SETTINGS,
  DEFAULT_DATA_SHAPE,
  BOOK_TYPES,
} from "./constants.js";

const STORAGE_KEY = STORAGE_CONFIG.KEY;
const MAX_HISTORY_ENTRIES = STORAGE_CONFIG.MAX_HISTORY_ENTRIES;
const MAX_BOOKMARKS_PER_BOOK = STORAGE_CONFIG.MAX_BOOKMARKS_PER_BOOK;

const normalizeStorageSource = (source) => {
  if (!source) return null;
  return STORAGE_SOURCE_ALIASES[source] ?? source;
};

const generateDeviceId = () => {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2);
  const timePart = Date.now().toString(36);
  return `device-${timePart}-${randomPart}`;
};

/**
 * UserAgent を解析して OS/ブラウザ名を返す
 * @returns {string} "OS名 / ブラウザ名" 形式の文字列
 */
const getDeviceInfo = () => {
  if (typeof navigator === "undefined" || !navigator.userAgent) {
    return "Unknown";
  }

  const ua = navigator.userAgent;

  // OS判定
  let os = "Unknown OS";
  if (/Windows NT 10/.test(ua)) {
    os = "Windows 10/11";
  } else if (/Windows NT 6\.3/.test(ua)) {
    os = "Windows 8.1";
  } else if (/Windows NT 6\.2/.test(ua)) {
    os = "Windows 8";
  } else if (/Windows NT 6\.1/.test(ua)) {
    os = "Windows 7";
  } else if (/Windows/.test(ua)) {
    os = "Windows";
  } else if (/Mac OS X/.test(ua)) {
    os = "macOS";
  } else if (/iPhone|iPad|iPod/.test(ua)) {
    os = "iOS";
  } else if (/Android/.test(ua)) {
    os = "Android";
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  } else if (/CrOS/.test(ua)) {
    os = "Chrome OS";
  }

  // ブラウザ判定（順序重要: より特定的なものを先に）
  let browser = "Unknown Browser";
  if (/Edg\//.test(ua)) {
    browser = "Edge";
  } else if (/OPR\/|Opera/.test(ua)) {
    browser = "Opera";
  } else if (/Vivaldi/.test(ua)) {
    browser = "Vivaldi";
  } else if (/Brave/.test(ua)) {
    browser = "Brave";
  } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    browser = "Chrome";
  } else if (/Firefox\//.test(ua)) {
    browser = "Firefox";
  } else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) {
    browser = "Safari";
  } else if (/MSIE|Trident/.test(ua)) {
    browser = "Internet Explorer";
  }

  return `${os} / ${browser}`;
};

const selectDeviceColor = (deviceId) => {
  if (!deviceId) return DEVICE_COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < deviceId.length; i += 1) {
    hash = (hash * 31 + deviceId.charCodeAt(i)) % 1000000007;
  }
  const index = Math.abs(hash) % DEVICE_COLOR_PALETTE.length;
  return DEVICE_COLOR_PALETTE[index];
};

const ensureDeviceSettings = (settings) => {
  let updated = false;
  let deviceId = settings.deviceId;
  if (!deviceId) {
    deviceId = generateDeviceId();
    updated = true;
  }
  let deviceColor = settings.deviceColor;
  if (!deviceColor) {
    deviceColor = selectDeviceColor(deviceId);
    updated = true;
  }
  return {
    updated,
    settings: {
      ...settings,
      deviceId,
      deviceColor,
    },
  };
};

const getBookmarkUpdatedAt = (bookmark) => bookmark?.updatedAt ?? bookmark?.createdAt ?? 0;

const getBookmarkType = (bookmark) => bookmark?.bookType ?? bookmark?.type ?? null;

const getBookmarkKey = (bookmark) => {
  const bookmarkType = getBookmarkType(bookmark);
  const cfi = bookmark?.cfi;
  if (bookmarkType === BOOK_TYPES.EPUB && cfi) return `cfi:${cfi}`;

  const location = bookmark?.location;
  if (typeof location === "number") return `location:${location}`;

  const index = bookmark?.index;
  if (typeof index === "number") return `index:${index}`;

  if (cfi) return `cfi:${cfi}`;
  return null;
};

const pickNewerBookmark = (existing, incoming) => {
  if (!existing) return incoming;
  const incomingUpdatedAt = getBookmarkUpdatedAt(incoming);
  const existingUpdatedAt = getBookmarkUpdatedAt(existing);
  if (incomingUpdatedAt > existingUpdatedAt) return incoming;
  if (incomingUpdatedAt < existingUpdatedAt) return existing;
  if (!existing.label && incoming?.label) return incoming;
  return existing;
};

// デフォルトデータ構造（設定はSSOTから参照）
const defaultData = {
  ...DEFAULT_DATA_SHAPE,
  settings: { ...DEFAULT_SETTINGS },
};

// デバイス情報取得関数をエクスポート
export { getDeviceInfo };

export class StorageService {
  constructor(key = STORAGE_KEY) {
    this.key = key;
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { ...defaultData };
      const parsed = JSON.parse(raw);
      const settings = {
        ...defaultData.settings,
        ...(parsed.settings ?? {}),
      };
      const deviceNormalized = ensureDeviceSettings(settings);
      const normalizedSettings = deviceNormalized.settings;

      const normalizedSource = normalizeStorageSource(settings.source) ?? STORAGE_SOURCE_DEFAULT;
      const normalizedDestination = normalizeStorageSource(settings.saveDestination);
      const data = {
        ...defaultData,
        ...parsed,
        library: parsed.library ?? {},
        bookmarks: parsed.bookmarks ?? {},
        progress: parsed.progress ?? {},
        history: parsed.history ?? [],
        cloudIndex: parsed.cloudIndex ?? {},
        cloudStates: parsed.cloudStates ?? {},
        cloudIndexUpdatedAt: parsed.cloudIndexUpdatedAt ?? null,
        bookLinkMap: parsed.bookLinkMap ?? {},
        settings: {
          ...normalizedSettings,
          syncEnabled: normalizedSettings.syncEnabled ?? defaultData.settings.syncEnabled,
          lastSyncAt: normalizedSettings.lastSyncAt ?? defaultData.settings.lastSyncAt,
          lastIndexSyncAt: normalizedSettings.lastIndexSyncAt ?? defaultData.settings.lastIndexSyncAt, // SSOT: D1インデックス同期時刻
          apiKey: normalizedSettings.apiKey || defaultData.settings.apiKey,
          endpoint: normalizedSettings.endpoint || defaultData.settings.endpoint,
          source: normalizedSource || defaultData.settings.source,
          saveDestination:
            normalizedDestination || normalizedSource || defaultData.settings.saveDestination,
          onedriveClientId: normalizedSettings.onedriveClientId || defaultData.settings.onedriveClientId,
          onedriveRedirectUri: normalizedSettings.onedriveRedirectUri || defaultData.settings.onedriveRedirectUri,
          onedriveFilePath: normalizedSettings.onedriveFilePath || defaultData.settings.onedriveFilePath,
          onedriveFileId: normalizedSettings.onedriveFileId || defaultData.settings.onedriveFileId,
          onedriveToken: normalizedSettings.onedriveToken || defaultData.settings.onedriveToken,

          autoSyncEnabled: normalizedSettings.autoSyncEnabled ?? defaultData.settings.autoSyncEnabled,
        },
      };
      if (deviceNormalized.updated) {
        localStorage.setItem(this.key, JSON.stringify(data));
      }
      return data;
    } catch (error) {
      console.error("ストレージの読み込みに失敗しました", error);
      return { ...defaultData };
    }
  }

  save() {
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }

  upsertBook(book) {
    const existing = this.data.library[book.id] ?? {};
    this.data.library[book.id] = {
      ...existing,
      ...book,
      contentHash: book.contentHash ?? existing.contentHash,
      updatedAt: Date.now(),
    };
    this.addHistory(book.id);
    this.save();
  }

  addHistory(bookId) {
    this.data.history = [
      { bookId, openedAt: Date.now() },
      ...this.data.history.filter((item) => item.bookId !== bookId),
    ].slice(0, MAX_HISTORY_ENTRIES);
    this.save();
  }

  addBookmark(bookId, bookmark) {
    const list = this.data.bookmarks[bookId] ?? [];
    this.data.bookmarks[bookId] = [bookmark, ...list].slice(0, MAX_BOOKMARKS_PER_BOOK);
    this.save();
  }

  setBookmarks(bookId, bookmarks) {
    this.data.bookmarks[bookId] = Array.isArray(bookmarks) ? bookmarks : [];
    this.save();
  }

  mergeBookmarks(bookId, incomingList) {
    if (!Array.isArray(incomingList)) return;

    const currentList = this.data.bookmarks[bookId] ?? [];
    const map = new Map();

    // 既存と新規をマージ（位置キーで重複排除、updatedAt を最優先で採用）
    [...currentList, ...incomingList].forEach((bookmark) => {
      const key = getBookmarkKey(bookmark);
      if (!key) return;
      const existing = map.get(key);
      map.set(key, pickNewerBookmark(existing, bookmark));
    });

    const mergedList = Array.from(map.values())
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, MAX_BOOKMARKS_PER_BOOK);

    this.data.bookmarks[bookId] = mergedList;
    this.save();
  }

  getBookmarks(bookId) {
    return this.data.bookmarks[bookId] ?? [];
  }

  setProgress(bookId, progress) {
    this.data.progress[bookId] = {
      ...(this.data.progress[bookId] ?? {}),
      ...progress,
      // 指定がなければ現在時刻を使用、あればそれを尊重（クラウド同期用）
      updatedAt: progress.updatedAt ?? Date.now(),
    };
    this.save();
  }

  getProgress(bookId) {
    return this.data.progress[bookId];
  }

  removeBookmark(bookId, createdAt) {
    const list = this.data.bookmarks[bookId] ?? [];
    this.data.bookmarks[bookId] = list.filter((b) => b.createdAt !== createdAt);
    this.save();
  }

  removeHistory(bookId) {
    this.data.history = this.data.history.filter((item) => item.bookId !== bookId);
    this.save();
  }

  /**
   * ライブラリから書籍を削除（メタデータ、進捗、しおり、履歴も削除）
   * @param {string} bookId - 削除する書籍のID
   */
  removeBook(bookId) {
    if (!bookId) return;

    // リンクされたクラウドIDを取得
    const cloudBookId = this.data.bookLinkMap[bookId];

    // ライブラリから削除
    delete this.data.library[bookId];
    // 進捗を削除
    delete this.data.progress[bookId];
    // しおりを削除
    delete this.data.bookmarks[bookId];
    // 履歴から削除
    this.data.history = this.data.history.filter((item) => item.bookId !== bookId);
    // bookLinkMapから削除
    delete this.data.bookLinkMap[bookId];

    // クラウドデータも削除
    if (cloudBookId) {
      this.removeCloudData(cloudBookId);
    }

    this.save();
  }

  /**
   * クラウドインデックスから書籍情報を削除
   * @param {string} cloudBookId 
   */
  removeCloudData(cloudBookId) {
    if (!cloudBookId) return;
    delete this.data.cloudIndex[cloudBookId];
    delete this.data.cloudStates[cloudBookId];
    this.save();
  }

  setHistoryEntries(bookId, entries) {
    const filtered = this.data.history.filter((item) => item.bookId !== bookId);
    const normalized = Array.isArray(entries)
      ? entries.map((entry) => ({ bookId, openedAt: entry?.openedAt ?? Date.now() }))
      : [];
    this.data.history = [...normalized, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
    this.save();
  }

  setSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
  }

  getSettings() {
    return this.data.settings;
  }

  exportData() {
    return JSON.stringify(this.data, null, 2);
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }

  importData(json) {
    try {
      const parsed = JSON.parse(json);
      const settings = {
        ...defaultData.settings,
        ...(parsed.settings ?? {}),
      };
      const deviceNormalized = ensureDeviceSettings(settings);
      const normalizedSettings = deviceNormalized.settings;

      const normalizedSource = settings.source === "drive" ? "local" : settings.source;
      const normalizedDestination = settings.saveDestination === "drive" ? "local" : settings.saveDestination;
      this.data = {
        ...defaultData,
        ...parsed,
        library: parsed.library ?? {},
        bookmarks: parsed.bookmarks ?? {},
        progress: parsed.progress ?? {},
        history: parsed.history ?? [],
        cloudIndex: parsed.cloudIndex ?? {},
        cloudStates: parsed.cloudStates ?? {},
        cloudIndexUpdatedAt: parsed.cloudIndexUpdatedAt ?? null,
        bookLinkMap: parsed.bookLinkMap ?? {},
        settings: {
          ...normalizedSettings,
          syncEnabled: normalizedSettings.syncEnabled ?? defaultData.settings.syncEnabled,
          lastSyncAt: normalizedSettings.lastSyncAt ?? defaultData.settings.lastSyncAt,
          lastIndexSyncAt: normalizedSettings.lastIndexSyncAt ?? defaultData.settings.lastIndexSyncAt, // SSOT: D1インデックス同期時刻
          apiKey: normalizedSettings.apiKey || defaultData.settings.apiKey,
          endpoint: normalizedSettings.endpoint || defaultData.settings.endpoint,
          source: normalizedSource || defaultData.settings.source,
          saveDestination: normalizedDestination || normalizedSource || defaultData.settings.saveDestination,
          onedriveClientId: normalizedSettings.onedriveClientId || defaultData.settings.onedriveClientId,
          onedriveRedirectUri: normalizedSettings.onedriveRedirectUri || defaultData.settings.onedriveRedirectUri,
          onedriveFilePath: normalizedSettings.onedriveFilePath || defaultData.settings.onedriveFilePath,
          onedriveFileId: normalizedSettings.onedriveFileId || defaultData.settings.onedriveFileId,
          onedriveToken: normalizedSettings.onedriveToken || defaultData.settings.onedriveToken,

          autoSyncEnabled: normalizedSettings.autoSyncEnabled ?? defaultData.settings.autoSyncEnabled,
        },
      };
      this.save();
    } catch (error) {
      throw new Error("JSON の読み込みに失敗しました");
    }
  }

  mergeData(incoming) {
    const parsed = typeof incoming === "string" ? JSON.parse(incoming) : incoming;
    const normalized = {
      ...defaultData,
      ...parsed,
      library: parsed?.library ?? {},
      bookmarks: parsed?.bookmarks ?? {},
      progress: parsed?.progress ?? {},
      history: parsed?.history ?? [],
      cloudIndex: parsed?.cloudIndex ?? {},
      cloudStates: parsed?.cloudStates ?? {},
      cloudIndexUpdatedAt: parsed?.cloudIndexUpdatedAt ?? null,
      bookLinkMap: parsed?.bookLinkMap ?? {},
    };

    const mergedLibrary = { ...this.data.library };
    Object.entries(normalized.library).forEach(([id, book]) => {
      const existing = mergedLibrary[id];
      const incomingUpdatedAt = book?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        mergedLibrary[id] = { ...existing, ...book };
      } else {
        mergedLibrary[id] = { ...book, ...existing };
      }
    });

    const mergedBookmarks = { ...this.data.bookmarks };
    Object.entries(normalized.bookmarks).forEach(([bookId, incomingList]) => {
      const currentList = mergedBookmarks[bookId] ?? [];
      const map = new Map();
      [...incomingList, ...currentList].forEach((bookmark) => {
        const key = getBookmarkKey(bookmark);
        if (!key) return;
        const existing = map.get(key);
        map.set(key, pickNewerBookmark(existing, bookmark));
      });
      const mergedList = Array.from(map.values())
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, STORAGE_CONFIG.MAX_BOOKMARKS_PER_BOOK);
      mergedBookmarks[bookId] = mergedList;
    });

    const mergedHistoryMap = new Map();
    [...(this.data.history ?? []), ...(normalized.history ?? [])].forEach((entry) => {
      if (!entry?.bookId) return;
      const existing = mergedHistoryMap.get(entry.bookId);
      if (!existing || (entry.openedAt ?? 0) > (existing.openedAt ?? 0)) {
        mergedHistoryMap.set(entry.bookId, entry);
      }
    });
    const mergedHistory = Array.from(mergedHistoryMap.values()).sort(
      (a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0),
    );

    const mergedProgress = { ...this.data.progress };
    Object.entries(normalized.progress).forEach(([bookId, incomingProgress]) => {
      const existing = mergedProgress[bookId];
      const incomingUpdatedAt = incomingProgress?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        mergedProgress[bookId] = { ...existing, ...incomingProgress };
      } else {
        mergedProgress[bookId] = { ...incomingProgress, ...existing };
      }
    });

    const mergedCloudIndex = { ...this.data.cloudIndex };
    Object.entries(normalized.cloudIndex ?? {}).forEach(([cloudBookId, incomingMeta]) => {
      const existing = mergedCloudIndex[cloudBookId];
      const incomingUpdatedAt = incomingMeta?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        mergedCloudIndex[cloudBookId] = { ...existing, ...incomingMeta };
      } else {
        mergedCloudIndex[cloudBookId] = { ...incomingMeta, ...existing };
      }
    });

    const mergedCloudStates = { ...this.data.cloudStates };
    Object.entries(normalized.cloudStates ?? {}).forEach(([cloudBookId, incomingState]) => {
      const existing = mergedCloudStates[cloudBookId];
      const incomingUpdatedAt = incomingState?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        mergedCloudStates[cloudBookId] = { ...existing, ...incomingState };
      } else {
        mergedCloudStates[cloudBookId] = { ...incomingState, ...existing };
      }
    });

    const mergedBookLinkMap = { ...this.data.bookLinkMap, ...normalized.bookLinkMap };

    this.data = {
      ...this.data,
      library: mergedLibrary,
      bookmarks: mergedBookmarks,
      progress: mergedProgress,
      history: mergedHistory,
      cloudIndex: mergedCloudIndex,
      cloudStates: mergedCloudStates,
      cloudIndexUpdatedAt: normalized.cloudIndexUpdatedAt ?? this.data.cloudIndexUpdatedAt,
      bookLinkMap: mergedBookLinkMap,
      settings: this.data.settings,
    };
    const deviceNormalized = ensureDeviceSettings(this.data.settings ?? defaultData.settings);
    if (deviceNormalized.updated) {
      this.data.settings = deviceNormalized.settings;
    }
    this.save();
  }

  getCloudBookId(localBookId) {
    return this.data.bookLinkMap?.[localBookId] ?? null;
  }

  setBookLink(localBookId, cloudBookId) {
    if (!localBookId || !cloudBookId) return;
    this.data.bookLinkMap = {
      ...(this.data.bookLinkMap ?? {}),
      [localBookId]: cloudBookId,
    };
    this.save();
  }

  mergeCloudIndex(index, updatedAt = null) {
    if (!index || typeof index !== "object") return;
    const merged = { ...(this.data.cloudIndex ?? {}) };
    Object.entries(index).forEach(([cloudBookId, meta]) => {
      const existing = merged[cloudBookId];
      const incomingUpdatedAt = meta?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        merged[cloudBookId] = { ...existing, ...meta };
      } else {
        merged[cloudBookId] = { ...meta, ...existing };
      }
    });
    this.data.cloudIndex = merged;
    if (updatedAt) {
      this.data.cloudIndexUpdatedAt = updatedAt;
    }
    this.save();
  }

  setCloudIndexUpdatedAt(updatedAt) {
    if (!updatedAt) return;
    this.data.cloudIndexUpdatedAt = updatedAt;
    this.save();
  }

  setCloudState(cloudBookId, state) {
    if (!cloudBookId || !state) return;
    const existing = this.data.cloudStates?.[cloudBookId];
    const incomingUpdatedAt = state?.updatedAt ?? 0;
    const existingUpdatedAt = existing?.updatedAt ?? 0;
    if (!existing || incomingUpdatedAt >= existingUpdatedAt) {
      this.data.cloudStates = {
        ...(this.data.cloudStates ?? {}),
        [cloudBookId]: state,
      };
      this.save();
    }
  }

  getCloudState(cloudBookId) {
    return this.data.cloudStates?.[cloudBookId] ?? null;
  }
}
