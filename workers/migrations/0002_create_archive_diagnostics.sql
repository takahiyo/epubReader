-- archive_diagnostics: クライアント側の診断ログ保存テーブル
-- created_at は Worker 側で Date.now() を INSERT 時に渡すため DEFAULT を設定
CREATE TABLE IF NOT EXISTS archive_diagnostics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT,
  archive_name  TEXT,
  archive_type  TEXT,
  file_name     TEXT    NOT NULL,
  error_message TEXT    NOT NULL,
  stack_trace   TEXT,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_archive_diagnostics_created_at
  ON archive_diagnostics (created_at DESC);
