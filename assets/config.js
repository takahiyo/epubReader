/**
 * config.js - グローバル設定公開
 * 
 * constants.js から設定を読み込み、window オブジェクトに公開します。
 * 非モジュール環境（Service Worker等）との互換性を維持します。
 */

// constants.js がモジュールとして読み込まれる前に実行される可能性があるため、
// 直接値を参照せず、constants.js で定義された値と同期させる
import { GOOGLE_AUTH_CONFIG, WORKERS_CONFIG, MEMORY_STRATEGY } from "./constants.js";

// 既存の設定を保持しつつ、SSOT から値を設定
window.EPUB_READER_CONFIG = window.EPUB_READER_CONFIG || {};
window.EPUB_READER_CONFIG.googleClientId =
  window.EPUB_READER_CONFIG.googleClientId || GOOGLE_AUTH_CONFIG.CLIENT_ID;
window.EPUB_READER_CONFIG.MEMORY_STRATEGY =
  window.EPUB_READER_CONFIG.MEMORY_STRATEGY || MEMORY_STRATEGY;

// アプリ共通設定（SSOT参照）
window.APP_CONFIG = {
  FIREBASE_SYNC_ENDPOINT: WORKERS_CONFIG.SYNC_ENDPOINT,
};
