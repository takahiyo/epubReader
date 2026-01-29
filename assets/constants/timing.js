// ============================================
// タイミング設定 (ミリ秒)
// ============================================
export const TIMING_CONFIG = Object.freeze({
  AUTO_SYNC_INTERVAL_MS: 30000, // 自動同期間隔 (30秒)
  AUTO_SYNC_DEBOUNCE_MS: 1500, // 自動同期デバウンス (1.5秒)
  SYNC_PROGRESS_DELTA_PERCENT: 4.0, // 進捗差分で即時同期する閾値 (%)
  SYNC_IDLE_MS: 60000, // 進捗更新が止まった時の同期アイドル時間
  RESIZE_DEBOUNCE_MS: 250, // リサイズデバウンス
  SCROLL_MODE_UPDATE_DELAY_MS: 100, // スクロールモード更新遅延
  LOCATIONS_CHECK_INTERVAL_MS: 500, // ロケーション確認間隔
  LOCATIONS_CHECK_TIMEOUT_MS: 10000, // ロケーション確認タイムアウト (10秒)
  DOM_RENDER_DELAY_MS: 50, // DOM描画待機
  ANIMATION_FRAME_DELAY_MS: 20, // アニメーションフレーム遅延
  MODAL_CLOSE_DELAY_MS: 300, // モーダルクローズ遅延
  STATUS_MESSAGE_DISPLAY_MS: 3000, // ステータスメッセージ表示時間 (3秒)
  CLICK_PROCESS_RESET_MS: 100, // クリック連続防止リセット
  DEBUG_GRID_AUTO_HIDE_MS: 10000, // デバッググリッド自動非表示
});
