-- Additive catalog storage: existing reader state/index tables remain untouched.
CREATE TABLE IF NOT EXISTS catalog_heads (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  commit_token TEXT
);

CREATE TABLE IF NOT EXISTS catalog_records (
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('series','books','holdings','access_periods','reading_events','manual_reading_states')),
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  record_data TEXT NOT NULL CHECK(json_valid(record_data)),
  PRIMARY KEY(user_id, entity_type, entity_id),
  FOREIGN KEY(user_id) REFERENCES catalog_heads(user_id)
);

CREATE TABLE IF NOT EXISTS catalog_mutations (
  user_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_data TEXT NOT NULL CHECK(json_valid(response_data)),
  PRIMARY KEY(user_id, mutation_id),
  FOREIGN KEY(user_id) REFERENCES catalog_heads(user_id)
);

-- Never expire change history or tombstones in the first protocol version.
CREATE TABLE IF NOT EXISTS catalog_changes (
  change_no INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  changes_data TEXT NOT NULL CHECK(json_valid(changes_data)),
  UNIQUE(user_id, mutation_id),
  FOREIGN KEY(user_id, mutation_id) REFERENCES catalog_mutations(user_id, mutation_id)
);
CREATE INDEX IF NOT EXISTS catalog_changes_user_cursor ON catalog_changes(user_id, change_no);
