-- book_states: 読書状態テーブル
-- カラム state_data は workers/src/index.js の SELECT/INSERT と一致させる
CREATE TABLE IF NOT EXISTS book_states (
  user_id   TEXT    NOT NULL,
  book_id   TEXT    NOT NULL,
  state_data TEXT,
  updated_at INTEGER,
  UNIQUE (user_id, book_id)
);

-- user_indexes: ユーザーの書籍インデックステーブル
-- カラム index_data は workers/src/index.js の SELECT/INSERT と一致させる
CREATE TABLE IF NOT EXISTS user_indexes (
  user_id    TEXT    NOT NULL UNIQUE,
  index_data TEXT,
  updated_at INTEGER
);
