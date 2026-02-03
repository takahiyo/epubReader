import { PROGRESS_PRECISION } from "./sync.js";

// ============================================
// タイミング設定 (ミリ秒)
// ============================================
export const TIMING_CONFIG = Object.freeze({
  // --- クラウド同期関連 ---
  BACKGROUND_SYNC_INTERVAL_MS: 1800000, // バックグラウンド定期同期 (30分)
  PERIODIC_SYNC_MS: 1200000, // フォアグラウンド定期同期 (20分)

  // --- ローカル保存関連 ---
  LOCAL_SAVE_THRESHOLD_PERCENT: PROGRESS_PRECISION, // ローカル保存を実行する進捗差分 (%)

  // --- UI/その他 (維持) ---
  RESIZE_DEBOUNCE_MS: 250,
  SCROLL_MODE_UPDATE_DELAY_MS: 100,
  LOCATIONS_CHECK_INTERVAL_MS: 500,
  LOCATIONS_CHECK_TIMEOUT_MS: 10000,
  DOM_RENDER_DELAY_MS: 50,
  ANIMATION_FRAME_DELAY_MS: 20,
  STATUS_MESSAGE_DISPLAY_MS: 3000,
});
