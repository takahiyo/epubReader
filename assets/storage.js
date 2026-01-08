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
    writingMode: "horizontal",
    pageDirection: "ltr",
    uiLanguage: "ja",
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
    this.data.progress[bookId] = progress;
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
}
