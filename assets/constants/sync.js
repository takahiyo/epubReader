import { STORAGE_SOURCE_DEFAULT } from "./storage.js";

export const SYNC_SOURCES = Object.freeze({
  LOCAL: "local", // ローカルのみ（同期無効）
  D1: "d1", // Cloudflare D1 (Workers経由)
  WORKERS: "d1", // エイリアス: Workers経由のD1
  ONEDRIVE: "onedrive",
  PCLOUD: "pcloud",
});


export const SYNC_PATHS = Object.freeze({
  STATE_PULL: "/sync/state/pull",
  STATE_PUSH: "/sync/state/push",
  INDEX_PULL: "/sync/index/pull",
  INDEX_PUSH: "/sync/index/push",
  API_DIAGNOSTICS: "/api/diagnostics",
});

// ============================================
// 同期リトライ設定
// ============================================
export const SYNC_RETRY_MAX = 3;
export const SYNC_RETRY_BASE_MS = 500;
export const SYNC_RETRY_MAX_MS = 4000;

// ============================================
// 同期ソース設定
// ============================================
export const SYNC_CONFIG = Object.freeze({
  ALLOWED_SOURCES: Object.freeze([
    SYNC_SOURCES.LOCAL,
    SYNC_SOURCES.D1,
    SYNC_SOURCES.ONEDRIVE,
    SYNC_SOURCES.PCLOUD,
  ]),
  LEGACY_ALIASES: Object.freeze({
    gas: SYNC_SOURCES.D1, // GAS(Google Apps Script)からの移行
    firebase: SYNC_SOURCES.D1, // 旧Firebase Database実装からの移行
  }),
  DEFAULT_SOURCE: SYNC_SOURCES.D1, // デフォルトはCloudflare D1
});
