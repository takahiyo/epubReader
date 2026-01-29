import { STORAGE_SOURCE_DEFAULT } from "./storage.js";

export const SYNC_SOURCES = Object.freeze({
  LOCAL: STORAGE_SOURCE_DEFAULT,
  D1: "d1", // Cloudflare D1 (Workers経由)
  ONEDRIVE: "onedrive",
  PCLOUD: "pcloud",
});

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
