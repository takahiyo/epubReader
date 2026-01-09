const STORAGE_KEY = "epubReader:data";

const defaultData = {
  library: {},
  bookmarks: {},
  progress: {},
  history: [],
  settings: {
    endpoint: "https://script.google.com/macros/s/AKfycbz3iYbkseBSodo8kfJXjfBIPTd9QAHBKjkgYiR5ZKHcIhDcF9RUUi21DMlEYj2sJ6wT/exec",
    apiKey: "<必要ならキー>",
    source: "local",
    saveDestination: "local",
    driveClientId: "",
    driveFileId: "",
    driveFolderId: "",
    driveFileName: "epub-reader-data.json",
    driveToken: null,
    onedriveClientId: "",
    onedriveRedirectUri: "",
    onedriveFilePath: "epub-reader-data.json",
    onedriveFileId: "",
    onedriveToken: null,
    uiLanguage: "en",
    fontSize: 16,
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
      return {
        ...defaultData,
        ...parsed,
        library: parsed.library ?? {},
        bookmarks: parsed.bookmarks ?? {},
        progress: parsed.progress ?? {},
        history: parsed.history ?? [],
        settings: {
          ...settings,
          endpoint: settings.endpoint || defaultData.settings.endpoint,
          apiKey: settings.apiKey || defaultData.settings.apiKey,
          source: settings.source || defaultData.settings.source,
          saveDestination: settings.saveDestination || settings.source || defaultData.settings.saveDestination,
          driveClientId: settings.driveClientId || defaultData.settings.driveClientId,
          driveFileId: settings.driveFileId || defaultData.settings.driveFileId,
          driveFolderId: settings.driveFolderId || defaultData.settings.driveFolderId,
          driveFileName: settings.driveFileName || defaultData.settings.driveFileName,
          driveToken: settings.driveToken || defaultData.settings.driveToken,
          onedriveClientId: settings.onedriveClientId || defaultData.settings.onedriveClientId,
          onedriveRedirectUri: settings.onedriveRedirectUri || defaultData.settings.onedriveRedirectUri,
          onedriveFilePath: settings.onedriveFilePath || defaultData.settings.onedriveFilePath,
          onedriveFileId: settings.onedriveFileId || defaultData.settings.onedriveFileId,
          onedriveToken: settings.onedriveToken || defaultData.settings.onedriveToken,
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
      this.data = {
        ...defaultData,
        ...parsed,
        library: parsed.library ?? {},
        bookmarks: parsed.bookmarks ?? {},
        progress: parsed.progress ?? {},
        history: parsed.history ?? [],
        settings: {
          ...settings,
          endpoint: settings.endpoint || defaultData.settings.endpoint,
          apiKey: settings.apiKey || defaultData.settings.apiKey,
          source: settings.source || defaultData.settings.source,
          saveDestination: settings.saveDestination || settings.source || defaultData.settings.saveDestination,
          driveClientId: settings.driveClientId || defaultData.settings.driveClientId,
          driveFileId: settings.driveFileId || defaultData.settings.driveFileId,
          driveFolderId: settings.driveFolderId || defaultData.settings.driveFolderId,
          driveFileName: settings.driveFileName || defaultData.settings.driveFileName,
          driveToken: settings.driveToken || defaultData.settings.driveToken,
          onedriveClientId: settings.onedriveClientId || defaultData.settings.onedriveClientId,
          onedriveRedirectUri: settings.onedriveRedirectUri || defaultData.settings.onedriveRedirectUri,
          onedriveFilePath: settings.onedriveFilePath || defaultData.settings.onedriveFilePath,
          onedriveFileId: settings.onedriveFileId || defaultData.settings.onedriveFileId,
          onedriveToken: settings.onedriveToken || defaultData.settings.onedriveToken,
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

    this.data = {
      ...this.data,
      library: mergedLibrary,
      bookmarks: mergedBookmarks,
      progress: mergedProgress,
      history: mergedHistory,
      settings: this.data.settings,
    };
    this.save();
  }
}
