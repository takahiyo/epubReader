CREATE TABLE IF NOT EXISTS book_states (
  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER,
  UNIQUE (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS user_indexes (
  user_id TEXT NOT NULL UNIQUE,
  data TEXT,
  updated_at INTEGER
);
