import { PROGRESS_SAVE_THRESHOLD_PERCENT } from "./progress.js";

// ============================================
// タイミング設定 (ミリ秒)
// ============================================
export const TIMING_CONFIG = Object.freeze({
  // --- クラウド同期関連 ---
  BACKGROUND_SYNC_INTERVAL_MS: 600000, // バックグラウンド定期同期 (10分)
  PERIODIC_SYNC_MS: 300000, // フォアグラウンド定期同期 (5分)
  FOREGROUND_SYNC_DELAY_MS: 2000, // アプリ復帰後の同期。現在の表示位置は維持する

  // --- ローカル保存関連 ---
  LOCAL_SAVE_THRESHOLD_PERCENT: PROGRESS_SAVE_THRESHOLD_PERCENT, // ローカル保存を実行する進捗差分 (%)
  SCROLL_PROGRESS_INTERVAL_MS: 200, // スクロール中の有効位置捕捉
  SCROLL_PROGRESS_SETTLE_MS: 300, // 停止後の最終位置捕捉

  // --- UI/その他 (維持) ---
  RESIZE_DEBOUNCE_MS: 250,
  SCROLL_MODE_UPDATE_DELAY_MS: 100,
  LOCATIONS_CHECK_INTERVAL_MS: 500,
  LOCATIONS_CHECK_TIMEOUT_MS: 10000,
  DOM_RENDER_DELAY_MS: 50,
  ANIMATION_FRAME_DELAY_MS: 20,
  STATUS_MESSAGE_DISPLAY_MS: 3000,
});
