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
// デフォルト設定値
// ============================================
export const DEFAULT_SETTINGS = Object.freeze({
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
// UI カラー設定
// ============================================
export const UI_COLORS = Object.freeze({
  // ステータス色
  SUCCESS: "#4caf50",
  ERROR: "#f44336",
  NEUTRAL: "#666",
  
  // ブックマークマーカー
  BOOKMARK_MARKER_BORDER: "rgba(255, 255, 255, 0.9)",
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
  VENDOR_JSZIP: "./assets/vendor/jszip.min.js",
  VENDOR_UNRAR: "./assets/vendor/unrar.js",
  VENDOR_UNRAR_WASM: "./assets/vendor/unrar.wasm",
});

// ============================================
// リーダー設定
// ============================================
export const READER_CONFIG = Object.freeze({
  TEXT_SEGMENT_STEP: 24,
  DEFAULT_LINE_HEIGHT: 1.8,
  LOCATIONS_CHARS_PER_PAGE: 1600,
});

// ============================================
// タイミング設定 (ミリ秒)
// ============================================
export const TIMING_CONFIG = Object.freeze({
  AUTO_SYNC_INTERVAL_MS: 30000,        // 自動同期間隔 (30秒)
  AUTO_SYNC_DEBOUNCE_MS: 1500,         // 自動同期デバウンス (1.5秒)
  SCROLL_MODE_UPDATE_DELAY_MS: 100,    // スクロールモード更新遅延
  LOCATIONS_CHECK_INTERVAL_MS: 500,    // ロケーション確認間隔
  LOCATIONS_CHECK_TIMEOUT_MS: 10000,   // ロケーション確認タイムアウト (10秒)
  DOM_RENDER_DELAY_MS: 50,             // DOM描画待機
  ANIMATION_FRAME_DELAY_MS: 20,        // アニメーションフレーム遅延
  MODAL_CLOSE_DELAY_MS: 300,           // モーダルクローズ遅延
  STATUS_MESSAGE_DISPLAY_MS: 3000,     // ステータスメッセージ表示時間 (3秒)
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
    DEVICE_COLOR_PALETTE,
    DEFAULT_SETTINGS,
    PWA_CONFIG,
    CDN_URLS,
    ASSET_PATHS,
    READER_CONFIG,
    SUPPORTED_FORMATS,
    MIME_TYPES,
    SW_CACHE_ASSETS,
  };
}
