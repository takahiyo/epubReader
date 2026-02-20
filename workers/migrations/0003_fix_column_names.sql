-- ============================================================
-- 0003_fix_column_names.sql
-- 目的: book_states / user_indexes のカラム名を正しいものに修正する
--
-- 背景:
--   migration 0001 では state_data / index_data という正しいカラム名で
--   定義しているが、それ以前に古いカラム名 (data) でテーブルが作成されて
--   いた場合、"no such column: index_data" / "no such column: state_data"
--   エラーが発生する。
--   このmigrationで古いテーブルを DROP し、正しいスキーマで再作成する。
--
-- 注意:
--   既存データは削除されます。
--   同期データはクライアント側にローカル保存されているため、
--   次回同期時に自動的に再アップロードされます。
-- ============================================================

-- ① 旧テーブルを削除（カラム名が間違っていた場合の対処）
DROP TABLE IF EXISTS book_states;
DROP TABLE IF EXISTS user_indexes;

-- ② 正しいカラム名で再作成
-- book_states: 読書状態テーブル
CREATE TABLE book_states (
  user_id    TEXT    NOT NULL,
  book_id    TEXT    NOT NULL,
  state_data TEXT,
  updated_at INTEGER,
  UNIQUE (user_id, book_id)
);

-- user_indexes: ユーザーの書籍インデックステーブル
CREATE TABLE user_indexes (
  user_id    TEXT    NOT NULL UNIQUE,
  index_data TEXT,
  updated_at INTEGER
);
