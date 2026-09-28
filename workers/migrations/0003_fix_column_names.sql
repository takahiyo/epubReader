-- Normalize legacy data/state_data/index_data names without discarding rows.
-- Both supported schemas have the same column order as migration 0001.
-- Keep backups: an unexpected column count fails the copy instead of erasing data.
-- Already-applied migrations are not replayed; this protects future installations.
ALTER TABLE book_states RENAME TO book_states_before_0003;
ALTER TABLE user_indexes RENAME TO user_indexes_before_0003;

CREATE TABLE book_states (
  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  state_data TEXT,
  updated_at INTEGER,
  UNIQUE (user_id, book_id)
);
CREATE TABLE user_indexes (
  user_id TEXT NOT NULL UNIQUE,
  index_data TEXT,
  updated_at INTEGER
);
INSERT INTO book_states (user_id, book_id, state_data, updated_at)
  SELECT * FROM book_states_before_0003;
INSERT INTO user_indexes (user_id, index_data, updated_at)
  SELECT * FROM user_indexes_before_0003;
