import { UI_DEFAULTS } from "./ui.js";

// ============================================
// ストレージ設定
// ============================================
export const STORAGE_CONFIG = Object.freeze({
  KEY: "epubReader:data",
  MAX_HISTORY_ENTRIES: 30,
  MAX_BOOKMARKS_PER_BOOK: 50,
});

// ============================================
// ファイルストア設定
// ============================================
export const FILESTORE_CONFIG = Object.freeze({
  DB_NAME: "epubReader-files",
  STORE: "files",
  VERSION: 1,
  STORAGE_KEY: STORAGE_CONFIG.KEY,
  ONEDRIVE_BASE_FOLDER: "epub-reader",
  DEFAULT_MIME_TYPE: "application/octet-stream",
  DEFAULT_FILE_NAME: "book.bin",
  ONEDRIVE_FALLBACK_PREFIX: "onedrive",
  PCLOUD_FALLBACK_PREFIX: "pcloud",
});

// ============================================
// デフォルトデータ構造
// ============================================
export const DEFAULT_DATA_SHAPE = Object.freeze({
  library: {},
  bookmarks: {},
  progress: {},
  history: [],
  cloudIndex: {},
  cloudStates: {},
  cloudIndexUpdatedAt: null,
  bookLinkMap: {},
  settings: {},
});

// ============================================
// ストレージソース正規化
// ============================================
export const STORAGE_SOURCE_DEFAULT = "local";
export const STORAGE_SOURCE_ALIASES = Object.freeze({
  drive: STORAGE_SOURCE_DEFAULT,
});

// ============================================
// デフォルト設定値
// ============================================
export const DEFAULT_SETTINGS = Object.freeze({
  syncEnabled: false,
  lastSyncAt: null,
  apiKey: "<必要ならキー>",
  endpoint: "",
  source: STORAGE_SOURCE_DEFAULT,
  saveDestination: STORAGE_SOURCE_DEFAULT,
  onedriveClientId: "",
  onedriveRedirectUri: "",
  onedriveFilePath: "epub-reader-data.json",
  onedriveFileId: "",
  onedriveToken: null,
  uiLanguage: UI_DEFAULTS.uiLanguage,
  fontSize: UI_DEFAULTS.fontSize,
  autoSyncEnabled: null,
  deviceId: "",
  deviceColor: "",
  // 読書環境のデフォルト設定
  defaultWritingMode: UI_DEFAULTS.writingMode,
  defaultPageDirection: UI_DEFAULTS.defaultDirection,
  defaultImageViewMode: UI_DEFAULTS.imageViewMode,
});
