const STORAGE_KEY = "epubReader:data";

const defaultGasEndpoint =
  (typeof window !== "undefined" && window.APP_CONFIG?.GAS_SYNC_ENDPOINT) ||
  "https://script.google.com/macros/s/AKfycbzwS0SP00OKHnfw3WHZdBT7w9zF-thjJ7Lufr2wZJqa62FhOkDnPB492_LqWrnufx9W/exec";

const defaultData = {
  library: {},
  bookmarks: {},
  progress: {},
  history: [],
  cloudIndex: {},
  cloudStates: {},
  cloudIndexUpdatedAt: null,
  bookLinkMap: {},
  settings: {
    gasEndpoint: defaultGasEndpoint,
    syncEnabled: false,
    lastSyncAt: null,
    apiKey: "<必要ならキー>",
    endpoint: "",
    source: "local",
    saveDestination: "local",
    onedriveClientId: "",
    onedriveRedirectUri: "",
    onedriveFilePath: "epub-reader-data.json",
    onedriveFileId: "",
    onedriveToken: null,
    uiLanguage: "en",
    fontSize: 16,
    autoSyncEnabled: null,
  },
};

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
      const normalizedSource = settings.source === "drive" ? "local" : settings.source;
      const normalizedDestination = settings.saveDestination === "drive" ? "local" : settings.saveDestination;
      return {
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
          ...settings,
          gasEndpoint: settings.gasEndpoint || defaultData.settings.gasEndpoint,
          syncEnabled: settings.syncEnabled ?? defaultData.settings.syncEnabled,
          lastSyncAt: settings.lastSyncAt ?? defaultData.settings.lastSyncAt,
          apiKey: settings.apiKey || defaultData.settings.apiKey,
          endpoint: settings.endpoint || defaultData.settings.endpoint,
          source: normalizedSource || defaultData.settings.source,
          saveDestination: normalizedDestination || normalizedSource || defaultData.settings.saveDestination,
          onedriveClientId: settings.onedriveClientId || defaultData.settings.onedriveClientId,
          onedriveRedirectUri: settings.onedriveRedirectUri || defaultData.settings.onedriveRedirectUri,
          onedriveFilePath: settings.onedriveFilePath || defaultData.settings.onedriveFilePath,
          onedriveFileId: settings.onedriveFileId || defaultData.settings.onedriveFileId,
          onedriveToken: settings.onedriveToken || defaultData.settings.onedriveToken,
          autoSyncEnabled: settings.autoSyncEnabled ?? defaultData.settings.autoSyncEnabled,
        },
      };
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
    ].slice(0, 30);
    this.save();
  }

  addBookmark(bookId, bookmark) {
    const list = this.data.bookmarks[bookId] ?? [];
    this.data.bookmarks[bookId] = [bookmark, ...list].slice(0, 50);
    this.save();
  }

  setBookmarks(bookId, bookmarks) {
    this.data.bookmarks[bookId] = Array.isArray(bookmarks) ? bookmarks : [];
    this.save();
  }

  getBookmarks(bookId) {
    return this.data.bookmarks[bookId] ?? [];
  }

  setProgress(bookId, progress) {
    this.data.progress[bookId] = {
      ...progress,
      updatedAt: Date.now(),
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

  setHistoryEntries(bookId, entries) {
    const filtered = this.data.history.filter((item) => item.bookId !== bookId);
    const normalized = Array.isArray(entries)
      ? entries.map((entry) => ({ bookId, openedAt: entry?.openedAt ?? Date.now() }))
      : [];
    this.data.history = [...normalized, ...filtered].slice(0, 30);
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
          ...settings,
          gasEndpoint: settings.gasEndpoint || defaultData.settings.gasEndpoint,
          syncEnabled: settings.syncEnabled ?? defaultData.settings.syncEnabled,
          lastSyncAt: settings.lastSyncAt ?? defaultData.settings.lastSyncAt,
          apiKey: settings.apiKey || defaultData.settings.apiKey,
          endpoint: settings.endpoint || defaultData.settings.endpoint,
          source: normalizedSource || defaultData.settings.source,
          saveDestination: normalizedDestination || normalizedSource || defaultData.settings.saveDestination,
          onedriveClientId: settings.onedriveClientId || defaultData.settings.onedriveClientId,
          onedriveRedirectUri: settings.onedriveRedirectUri || defaultData.settings.onedriveRedirectUri,
          onedriveFilePath: settings.onedriveFilePath || defaultData.settings.onedriveFilePath,
          onedriveFileId: settings.onedriveFileId || defaultData.settings.onedriveFileId,
          onedriveToken: settings.onedriveToken || defaultData.settings.onedriveToken,
          autoSyncEnabled: settings.autoSyncEnabled ?? defaultData.settings.autoSyncEnabled,
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
        if (!bookmark?.createdAt) return;
        const existing = map.get(bookmark.createdAt);
        if (!existing || (!existing.label && bookmark.label)) {
          map.set(bookmark.createdAt, bookmark);
        }
      });
      const mergedList = Array.from(map.values())
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 50);
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
