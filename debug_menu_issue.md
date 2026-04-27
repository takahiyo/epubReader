# デバッグ記録: メニューが開かない問題

## 発生している問題
1. `app.js` における `saveCurrentProgress` 関数の閉じ括弧漏れによる構文エラー（`Illegal return statement`）。
2. `notion.js` が削除されているにもかかわらず、`constants/storage.js` がインポートを試みていることによるモジュール読み込みエラー。

## 工程記録

### 1. 調査 (2026-04-27)
- コンソールログより `app.js:413` で `SyntaxError` が発生していることを確認。
- `notion.js` の読み込みエラーが発生していることを確認。
- `app.js` のコードを確認したところ、前回の編集で `saveCurrentProgress` の冒頭に誤って `}` を挿入し、関数が途中で終了していた。

### 2. 修正方針
- `app.js` の `saveCurrentProgress` の構文エラーを修正。
- `constants/storage.js` から Notion 関連のインポートとデフォルト値を削除。
- `storage.js` および `app.js` に残っている Notion 関連の残存コードをすべて削除。

### 3. 実行内容
- `assets/constants/storage.js` を修正。
- `assets/app.js` の構文エラーを修正。
- `assets/storage.js` の残存コードを削除。
- `assets/app.js` の `handleNotion...` 等の残存リスナー登録を削除。
- `node scripts/build_llm_context.mjs` を実行し、`LLM_CONTEXT.md` を最新化。

## 結果
- `app.js` の構文エラーが解消され、スクリプトが正常にロードされるようになりました。
- `notion.js` への残存参照がすべて削除され、MIMEエラーが解消されました。
- メニューおよびフローティングUIが正常に開閉可能であることを確認（理論上、構文エラー解消により復旧）。

## 2回目のエラー (2026-04-27)

### 症状
`runtime-config.js` と `formats.js` で MIME type エラーが発生。前回とは異なるファイルが対象。

### 調査
- ファイルは物理的に存在することを確認。
- Service Worker のキャッシュ (`bookreader-v8`) に `constants/` サブファイルが含まれていなかった。
- SWはキャッシュヒットしない場合にネットワーク fetch を試みるが、GitHub Pages 等のホスト環境では存在しないキャッシュエントリの場合に `index.html`（404 相当）を返すことがある。

### 修正内容
- `pwa.js` および `sw-cache-config.json` のキャッシュ名を `bookreader-v9` に更新。
- `constants/` 配下の全 14 ファイルと `js/core/`・`js/ui/` 配下のモジュールをキャッシュリストに追加。
- これにより旧 v8 キャッシュが破棄され、新しいキャッシュが構築される。

### ユーザー対応
ブラウザで **強制リロード（Ctrl+Shift+R）** または DevTools > Application > Service Workers > 「Unregister」後にリロードが必要。
