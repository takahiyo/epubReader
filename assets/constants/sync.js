import { STORAGE_SOURCE_DEFAULT } from "./storage.js";

export const SYNC_SOURCES = Object.freeze({
  LOCAL: STORAGE_SOURCE_DEFAULT,
  WORKERS: "firebase",
  ONEDRIVE: "onedrive",
  PCLOUD: "pcloud",
});

// ============================================
// 同期ソース設定
// ============================================
export const SYNC_CONFIG = Object.freeze({
  ALLOWED_SOURCES: Object.freeze([
    SYNC_SOURCES.LOCAL,
    SYNC_SOURCES.WORKERS,
    SYNC_SOURCES.ONEDRIVE,
    SYNC_SOURCES.PCLOUD,
  ]),
  LEGACY_ALIASES: Object.freeze({
    gas: SYNC_SOURCES.WORKERS,
  }),
  DEFAULT_SOURCE: SYNC_SOURCES.WORKERS,
});
