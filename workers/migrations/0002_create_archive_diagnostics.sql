CREATE TABLE IF NOT EXISTS archive_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  archive_name TEXT NOT NULL,
  archive_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archive_diagnostics_user_created
  ON archive_diagnostics(user_id, created_at DESC);
