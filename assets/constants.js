/**
 * constants.js - Single Source of Truth (SSOT)
 * 
 * すべての設定値・定数をここで一元管理します。
 * ハードコーディングを廃止し、変更が必要な場合はこのファイルのみを編集してください。
 */

// ============================================
// アプリケーション情報
// ============================================
export const APP_INFO = Object.freeze({
  NAME: "BookReader",
  SHORT_NAME: "BookReader",
  DESCRIPTION: "ブラウザで動く軽量なEPUB/画像リーダー",
  VERSION: "1.0.0",
  DOCUMENT_TITLE: "Epub Reader",
});

// ============================================
// Firebase 設定
// ============================================
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyD2xMk1bbez1Y2crBcgzxUhghU9bFnU1gI",
  authDomain: "bookreader-1d3a3.firebaseapp.com",
  projectId: "bookreader-1d3a3",
  storageBucket: "bookreader-1d3a3.firebasestorage.app",
  messagingSenderId: "920141070828",
  appId: "1:920141070828:web:619c658ec726be091c00c9",
  measurementId: "G-V68746259D",
});

// ============================================
// Cloudflare Workers エンドポイント
// ============================================
export const WORKERS_CONFIG = Object.freeze({
  SYNC_ENDPOINT: "https://bookreader.taka-hiyo.workers.dev",
});

// ============================================
// Google OAuth 設定
// ============================================
export const GOOGLE_AUTH_CONFIG = Object.freeze({
  CLIENT_ID: "672654349618-h1252pqs19d076dkf3uteme7upau16kp.apps.googleusercontent.com",
});

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
// 同期ソース設定
// ============================================
export const SYNC_CONFIG = Object.freeze({
  ALLOWED_SOURCES: Object.freeze([
    STORAGE_SOURCE_DEFAULT,
    "firebase",
    "onedrive",
    "pcloud",
  ]),
  LEGACY_ALIASES: Object.freeze({
    gas: "firebase",
  }),
  DEFAULT_SOURCE: STORAGE_SOURCE_DEFAULT,
});

// ============================================
// デバイスカラーパレット
// ============================================
export const DEVICE_COLOR_PALETTE = Object.freeze([
  "#ff6b6b",
  "#f7b731",
  "#4b7bec",
  "#20bf6b",
  "#a55eea",
  "#0fb9b1",
  "#eb3b5a",
  "#fa8231",
]);

// ============================================
// UI 初期設定
// ============================================
export const UI_DEFAULTS = Object.freeze({
  theme: "dark",
  uiLanguage: "en",
  fontSize: 16,
  progressDisplayMode: "page",
  defaultDirection: "rtl",
  libraryViewMode: "grid",
  writingMode: "horizontal",
  pageDirection: "ltr",
  bookmarkMenuMode: "current",
  legacyDirectionMap: Object.freeze({
    rtl: Object.freeze({
      writingMode: "vertical",
      pageDirection: "rtl",
    }),
    ltr: Object.freeze({
      writingMode: "horizontal",
      pageDirection: "ltr",
    }),
  }),
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
});

// ============================================
// PWA / Service Worker 設定
// ============================================
export const PWA_CONFIG = Object.freeze({
  CACHE_NAME: "bookreader-v4",
  THEME_COLOR: "#2c3e50",
  BACKGROUND_COLOR: "#ffffff",
});

// ============================================
// UI アイコン
// ============================================
export const UI_ICONS = Object.freeze({
  THEME_DARK: "🌙",
  THEME_LIGHT: "☀️",
  MENU_OPEN: "📂",
  MENU_LIBRARY: "📚",
  MENU_SEARCH: "🔍",
  MENU_BOOKMARKS: "🔖",
  MENU_HISTORY: "🕘",
  LANGUAGE: "🌐",
  SETTINGS: "⚙",
  CLOSE: "✕",
  ERROR_MARK: "✗",
  CHECK_MARK: "✓",
  ADD: "✚",
  DELETE: "🗑️",
  BOOK: "📖",
  ZOOM_IN: "🔍+",
  ZOOM_OUT: "🔍−",
  READING_DIRECTION_TOGGLE: "⇄",
  SPREAD_DOUBLE: "auto_stories",
  SPREAD_SINGLE: "tablet",
});

// ============================================
// UI シンボル
// ============================================
export const UI_SYMBOLS = Object.freeze({
  ELLIPSIS: "...",
  META_SEPARATOR: "•",
});

// ============================================
// UI クラス名
// ============================================
export const UI_CLASSES = Object.freeze({
  HIDDEN: "hidden",
  STATUS_SUCCESS: "status-success",
  STATUS_ERROR: "status-error",
  STATUS_NEUTRAL: "status-neutral",
  DEBUG_GRID: "debug-grid",
  DEBUG_GRID_LINE: "debug-grid-line",
  DEBUG_GRID_LABEL: "debug-grid-label",
  MATERIAL_ICON: "material-icons",
  BOOKMARK_MARKER: "bookmark-marker",
  MODAL_BACKDROP: "modal-backdrop",
});

// ============================================
// DOM ID / Selector (SSOT)
// ============================================
export const DOM_IDS = Object.freeze({
  FULLSCREEN_READER: "fullscreenReader",
  VIEWER: "viewer",
  IMAGE_VIEWER: "imageViewer",
  PAGE_IMAGE: "pageImage",
  EMPTY_STATE_ICON: "emptyStateIcon",
  MENU_TITLE_IMAGE: "menuTitleImage",
  FLOAT_TITLE_IMAGE: "floatTitleImage",
  EMPTY_STATE: "emptyState",
  CLOUD_EMPTY_STATE: "cloudEmptyState",
  CLOUD_EMPTY_TITLE: "cloudEmptyTitle",
  CLOUD_EMPTY_META: "cloudEmptyMeta",
  CLOUD_ATTACH_BUTTON: "cloudAttachButton",
  FLOAT_OVERLAY: "floatOverlay",
  FLOAT_OPEN: "floatOpen",
  FLOAT_LIBRARY: "floatLibrary",
  FLOAT_SEARCH: "floatSearch",
  FLOAT_BOOKMARKS: "floatBookmarks",
  FLOAT_HISTORY: "floatHistory",
  FLOAT_SETTINGS: "floatSettings",
  FLOAT_PROGRESS: "floatProgress",
  FLOAT_PROGRESS_PERCENT: "floatProgressPercent",
  FLOAT_PROGRESS_TRACK: "floatProgressTrack",
  FLOAT_PROGRESS_MARKS: "floatProgressMarks",
  FLOAT_PROGRESS_FILL: "floatProgressFill",
  FLOAT_PROGRESS_THUMB: "floatProgressThumb",
  MODAL_OVERLAY: "modalOverlay",
  FONT_PLUS: "fontPlus",
  FONT_MINUS: "fontMinus",
  TOGGLE_THEME: "toggleTheme",
  TOGGLE_LANGUAGE: "toggleLanguage",
  LANG_ICON: "langIcon",
  LOADING_OVERLAY: "loadingOverlay",
  FLOAT_LANG_MENU: "floatLangMenu",
  OPEN_LANG_MENU: "openLangMenu",
  FLOAT_LANG_JA: "floatLangJa",
  FLOAT_LANG_EN: "floatLangEn",
  LEFT_MENU: "leftMenu",
  MENU_OPEN: "menuOpen",
  MENU_LIBRARY: "menuLibrary",
  MENU_SEARCH: "menuSearch",
  MENU_BOOKMARKS: "menuBookmarks",
  MENU_HISTORY: "menuHistory",
  MENU_SETTINGS: "menuSettings",
  TOC_SECTION: "tocSection",
  TOC_SECTION_TITLE: "tocSectionTitle",
  TOC_LIST: "tocList",
  LANG_JA: "langJa",
  LANG_EN: "langEn",
  TOGGLE_WRITING_MODE: "toggleWritingMode",
  OPEN_TOC: "openToc",
  TOC_MODAL: "tocModal",
  TOC_MODAL_LIST: "tocModalList",
  CLOSE_TOC_MODAL: "closeTocModal",
  SYNC_MODAL: "syncModal",
  SYNC_MODAL_TITLE: "syncModalTitle",
  SYNC_MODAL_MESSAGE: "syncModalMessage",
  SYNC_USE_REMOTE: "syncUseRemote",
  SYNC_USE_LOCAL: "syncUseLocal",
  PROGRESS_BAR_PANEL: "progressBarPanel",
  PROGRESS_BAR_BACKDROP: "progressBarBackdrop",
  PROGRESS_FILL: "progressFill",
  PROGRESS_THUMB: "progressThumb",
  CURRENT_PAGE_INPUT: "currentPageInput",
  TOTAL_PAGES: "totalPages",
  PROGRESS_PREV: "progressPrev",
  PROGRESS_NEXT: "progressNext",
  BOOKMARK_MENU: "bookmarkMenu",
  BOOKMARK_LIST: "bookmarkList",
  ADD_BOOKMARK_BTN: "addBookmarkBtn",
  CLOSE_BOOKMARK_MENU: "closeBookmarkMenu",
  OPEN_FILE_MODAL: "openFileModal",
  CLOSE_FILE_MODAL: "closeFileModal",
  FILE_INPUT: "fileInput",
  LIBRARY_GRID: "libraryGrid",
  LIBRARY_VIEW_GRID: "libraryViewGrid",
  LIBRARY_VIEW_LIST: "libraryViewList",
  HISTORY_MODAL: "historyModal",
  CLOSE_HISTORY_MODAL: "closeHistoryModal",
  HISTORY_LIST: "historyList",
  SETTINGS_MODAL: "settingsModal",
  CLOSE_SETTINGS_MODAL: "closeSettingsModal",
  THEME_SELECT: "themeSelect",
  WRITING_MODE_SELECT: "writingMode",
  PAGE_DIRECTION_SELECT: "pageDirection",
  SETTINGS_DEFAULT_DIRECTION: "settingsDefaultDirection",
  PROGRESS_DISPLAY_MODE: "progressDisplayMode",
  EXPORT_DATA_BTN: "exportDataBtn",
  IMPORT_DATA_INPUT: "importDataInput",
  IMAGE_MODAL: "imageModal",
  CLOSE_IMAGE_MODAL: "closeImageModal",
  MODAL_IMAGE: "modalImage",
  SEARCH_MODAL: "searchModal",
  CLOSE_SEARCH_MODAL: "closeSearchModal",
  SEARCH_INPUT: "searchInput",
  SEARCH_BTN: "searchBtn",
  SEARCH_RESULTS: "searchResults",
  BOOKMARK_MENU_TITLE: "bookmarkMenuTitle",
  SEARCH_MODAL_TITLE: "searchModalTitle",
  TOC_MODAL_TITLE: "tocModalTitle",
  OPEN_FILE_MODAL_TITLE: "openFileModalTitle",
  LIBRARY_SECTION_TITLE: "librarySectionTitle",
  HISTORY_MODAL_TITLE: "historyModalTitle",
  SETTINGS_MODAL_TITLE: "settingsModalTitle",
  SETTINGS_DISPLAY_TITLE: "settingsDisplayTitle",
  SETTINGS_DEVICE_TITLE: "settingsDeviceTitle",
  SETTINGS_DEFAULT_DIRECTION_LABEL: "settingsDefaultDirectionLabel",
  THEME_LABEL: "themeLabel",
  WRITING_MODE_LABEL: "writingModeLabel",
  PAGE_DIRECTION_LABEL: "pageDirectionLabel",
  PROGRESS_DISPLAY_MODE_LABEL: "progressDisplayModeLabel",
  DEVICE_ID_LABEL: "deviceIdLabel",
  DEVICE_ID_INPUT: "deviceId",
  DEVICE_COLOR_LABEL: "deviceColorLabel",
  DEVICE_COLOR_INPUT: "deviceColor",
  SETTINGS_ACCOUNT_TITLE: "settingsAccountTitle",
  GOOGLE_LOGIN_BUTTON: "googleLoginButton",
  MANUAL_SYNC_BUTTON: "manualSyncButton",
  SYNC_TOGGLE_BUTTON: "syncToggleButton",
  USER_INFO: "userInfo",
  SYNC_STATUS: "syncStatus",
  SYNC_HINT: "syncHint",
  SETTINGS_DATA_TITLE: "settingsDataTitle",
  IMPORT_DATA_LABEL: "importDataLabel",
  CANDIDATE_MODAL: "candidateModal",
  CANDIDATE_MODAL_TITLE: "candidateModalTitle",
  CANDIDATE_MODAL_MESSAGE: "candidateModalMessage",
  CANDIDATE_LIST: "candidateList",
  CANDIDATE_USE_LOCAL: "candidateUseLocal",
  CLOSE_CANDIDATE_MODAL: "closeCandidateModal",
  TOGGLE_SPREAD_MODE: "toggleSpreadMode",
  TOGGLE_READING_DIRECTION_EPUB: "toggleReadingDirectionEpub",
  TOGGLE_READING_DIRECTION_IMAGE: "toggleReadingDirectionImage",
  TOGGLE_ZOOM: "toggleZoom",
  LOADING_TEXT: "loadingText",
  LOTTIE_LOADER: "lottie-loader",
  LEFT_MENU_BACKDROP: "leftMenuBackdrop",
  CLICK_OVERLAY: "clickOverlay",
});

export const DOM_SELECTORS = Object.freeze({
  FLOAT_OVERLAY_BACKDROP: "#floatOverlay .float-backdrop",
  FLOAT_LANG_JA_IMG: "#floatLangJa img",
  FLOAT_LANG_EN_IMG: "#floatLangEn img",
  PROGRESS_TRACK: ".progress-track",
  PROGRESS_BAR_WRAPPER: ".progress-bar-wrapper",
  IFRAME: "iframe",
  BOOKMARK_MARKER: ".bookmark-marker",
  MENU_ICON: "span.menu-icon",
  MENU_LABEL: "span:last-child",
  MODAL_BACKDROP: ".modal-backdrop",
  EMPTY_STATE_TITLE: "h2",
  EMPTY_STATE_DESCRIPTION: "p",
  IMPORT_DATA_INPUT: "input",
});

export const CSS_VARS = Object.freeze({
  MUTED: "--muted",
});

// ============================================
// 外部ライブラリ CDN URL
// ============================================
export const CDN_URLS = Object.freeze({
  LOTTIE: "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js",
  JSZIP: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  JSZIP_FALLBACK: "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js",
  EPUBJS: "https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js",
  UNRAR_JS: "https://esm.sh/node-unrar-js@2.0.2",
  UNRAR_WASM: "https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/dist/js/unrar.wasm",
  // Firebase SDK
  FIREBASE_APP: "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js",
  FIREBASE_AUTH: "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js",
  FIREBASE_FIRESTORE: "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
});

// ============================================
// アセットパス
// ============================================
export const ASSET_PATHS = Object.freeze({
  ICON_192: "assets/icon_BookReader_192.png",
  ICON_512: "assets/icon_BookReader_512.png",
  LOGO: "assets/bookreader.png",
  FLAG_JAPAN: "assets/Flag_Japan.svg",
  FLAG_AMERICA: "assets/Flag_America.svg",
  LOADER_ANIMATION: "./assets/animations/loader_book.json",
  VENDOR_JSZIP: "./assets/vendor/jszip.min.js",
  VENDOR_UNRAR: "./assets/vendor/unrar.js",
  VENDOR_UNRAR_WASM: "./assets/vendor/unrar.wasm",
});

// ============================================
// リーダー設定
// ============================================
export const READER_CONFIG = Object.freeze({
  viewportWidth: 800,
  viewportHeight: 600,
  fontSize: "16px",
  writingMode: "horizontal-tb",
  lineHeight: 1.6,
  margin: "0",
  padding: "16px",
  FONT_SIZE_MIN: 12,
  FONT_SIZE_MAX: 28,
  MAX_BINARY_SEARCH_ITERATIONS: 24,
  MAX_PAGES_PER_SPINE: 5000,
  FIT_TOLERANCE_PX: 3,
  MAX_FIT_ATTEMPTS: 3,
  TEXT_SEGMENT_STEP: 24,
  DEFAULT_LINE_HEIGHT: 1.8,
  LOCATIONS_CHARS_PER_PAGE: 1600,
});

// ============================================
// 操作判定設定
// ============================================
export const INTERACTION_GRID_CONFIG = Object.freeze({
  VERTICAL_BREAKPOINTS: Object.freeze({
    TOP: 30,
    MIDDLE: 60,
    BOTTOM: 90,
  }),
  PROGRESS_BAR_EXCLUDE_FROM: 90,
  HORIZONTAL_SEGMENTS: 5,
});

export const TOUCH_CONFIG = Object.freeze({
  MIN_SWIPE_DISTANCE: 40,
  AXIS_DIFFERENCE: 20,
});

export const PROGRESS_CONFIG = Object.freeze({
  MAX_PERCENT: 100,
});

export const DEBUG_GRID_CONFIG = Object.freeze({
  HORIZONTAL_LINES: Object.freeze([10, 90]),
  VERTICAL_LINES: Object.freeze([20, 40, 60, 80]),
  LINE_THICKNESS_PX: 2,
});

// ============================================
// タイミング設定 (ミリ秒)
// ============================================
export const TIMING_CONFIG = Object.freeze({
  AUTO_SYNC_INTERVAL_MS: 30000,        // 自動同期間隔 (30秒)
  AUTO_SYNC_DEBOUNCE_MS: 1500,         // 自動同期デバウンス (1.5秒)
  RESIZE_DEBOUNCE_MS: 250,             // リサイズデバウンス
  SCROLL_MODE_UPDATE_DELAY_MS: 100,    // スクロールモード更新遅延
  LOCATIONS_CHECK_INTERVAL_MS: 500,    // ロケーション確認間隔
  LOCATIONS_CHECK_TIMEOUT_MS: 10000,   // ロケーション確認タイムアウト (10秒)
  DOM_RENDER_DELAY_MS: 50,             // DOM描画待機
  ANIMATION_FRAME_DELAY_MS: 20,        // アニメーションフレーム遅延
  MODAL_CLOSE_DELAY_MS: 300,           // モーダルクローズ遅延
  STATUS_MESSAGE_DISPLAY_MS: 3000,     // ステータスメッセージ表示時間 (3秒)
  CLICK_PROCESS_RESET_MS: 100,         // クリック連続防止リセット
  DEBUG_GRID_AUTO_HIDE_MS: 10000,      // デバッググリッド自動非表示
});

// ============================================
// エラーハンドリング設定
// ============================================
export const ERROR_CODES = Object.freeze({
  JSZIP_WARNING: "jszip_warning",
  NO_IMAGES_FOUND: "no_images_found",
  IMAGE_LOAD_FAILED: "image_load_failed",
});

export const ERROR_MESSAGE_MATCHERS = Object.freeze({
  [ERROR_CODES.JSZIP_WARNING]: Object.freeze([
    "JSZip",
    "not defined",
  ]),
  [ERROR_CODES.NO_IMAGES_FOUND]: Object.freeze([
    "画像が見つかりませんでした",
    "No images found",
  ]),
  [ERROR_CODES.IMAGE_LOAD_FAILED]: Object.freeze([
    "画像の読み込みに失敗",
    "Failed to load image",
  ]),
});

// ============================================
// サポートファイル形式
// ============================================
export const SUPPORTED_FORMATS = Object.freeze({
  EPUB: [".epub"],
  IMAGE_ARCHIVE: [".cbz", ".zip", ".rar", ".cbr"],
  IMAGES: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"],
});

// ============================================
// MIME タイプ
// ============================================
export const MIME_TYPES = Object.freeze({
  EPUB: "application/epub+zip",
  ZIP: "application/zip",
  CBZ: "application/vnd.comicbook+zip",
  RAR: "application/vnd.rar",
  CBR: "application/x-cbr",
  PNG: "image/png",
  JPEG: "image/jpeg",
  GIF: "image/gif",
  WEBP: "image/webp",
  AVIF: "image/avif",
  BMP: "image/bmp",
});

// ============================================
// Service Worker キャッシュ対象アセット
// ============================================
export const SW_CACHE_ASSETS = Object.freeze([
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/style.css",
  "./assets/app.js",
  "./assets/constants.js",
  "./assets/i18n.js",
  "./assets/config.js",
  "./assets/ui.js",
  "./assets/reader.js",
  "./assets/storage.js",
  "./assets/auth.js",
  "./assets/cloudSync.js",
  "./assets/fileStore.js",
  "./assets/firebaseConfig.js",
  "./assets/bookreader.png",
  "./assets/Flag_Japan.svg",
  "./assets/Flag_America.svg",
  "./assets/icon_BookReader_192.png",
  "./assets/icon_BookReader_512.png",
  "./assets/animations/loader_book.json",
]);

// ============================================
// グローバル変数設定（非モジュール環境用）
// ============================================
if (typeof window !== "undefined") {
  window.BOOK_READER_CONSTANTS = {
    APP_INFO,
    FIREBASE_CONFIG,
    WORKERS_CONFIG,
    GOOGLE_AUTH_CONFIG,
    STORAGE_CONFIG,
    FILESTORE_CONFIG,
    DEFAULT_DATA_SHAPE,
    DEVICE_COLOR_PALETTE,
    DEFAULT_SETTINGS,
    PWA_CONFIG,
    CDN_URLS,
    ASSET_PATHS,
    READER_CONFIG,
    SUPPORTED_FORMATS,
    MIME_TYPES,
    SW_CACHE_ASSETS,
    ERROR_CODES,
    ERROR_MESSAGE_MATCHERS,
    UI_ICONS,
    UI_SYMBOLS,
    UI_CLASSES,
    DOM_IDS,
    DOM_SELECTORS,
    CSS_VARS,
    INTERACTION_GRID_CONFIG,
    TOUCH_CONFIG,
    PROGRESS_CONFIG,
    DEBUG_GRID_CONFIG,
    TIMING_CONFIG,
  };
}
