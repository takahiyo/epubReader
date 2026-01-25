import { STORAGE_SOURCE_DEFAULT } from "./storage.js";

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
