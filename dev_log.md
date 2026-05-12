# 開発ログ: Quest 3 ファイルピッカー問題

---

## エントリ #1 - 2026-04-28

### 成功の境界線

- `accept="*/*"` に変更することでファイルピッカーの **UI が変わった**（Quest 3 の VR 専用ピッカーから、標準的なシステムピッカーへ遷移した）
- `showOpenFilePicker` API が有効に動作し、ピッカーが呼び出されることを確認
- Service Worker キャッシュ `bookreader-v10` に更新し、コードが確実に反映されるようになった

### 失敗の事象

- 共有フォルダ（SMB）、外部ファイラーアプリ（AnExplorer等）が依然としてピッカーに表示されない
- `showOpenFilePicker` に変えても同じ制限を受けた

### 失敗の根本原因（確定）

**OS側のサンドボックス制限であることが調査で確定した。**

調査で明らかになった事実：
1. Meta Quest ブラウザは SAF (Storage Access Framework) の Document Provider を制限している。
   Meta Horizon OS のブラウザサンドボックスは、`ACTION_GET_CONTENT` または `ACTION_OPEN_DOCUMENT` を発火させても、SMBや外部ファイラー等のDocument Providerを意図的に除外している。
2. `showOpenFilePicker` も同じ制限を受ける。
   これは `showOpenFilePicker` が内部的にも同じシステムピッカーを呼び出すため、API を変えても根本は変わらない。
3. JavaScript から Android Intent を直接操作することはできない。
   `intent://` スキームのような手法も、Meta Quest ブラウザは意図的にブロックしている。
4. これは Horizon OS のアップデートで意図的に強化された制約である。

### 次のアプローチ（候補）

A案: URL入力によるネットワーク直接アクセス（SMB/WebDAV/HTTP）- 推奨
   - アプリ内にURL入力欄（smb://, webdav://, http://）を設けて、ネットワーク上のファイルを直接 fetch する機能を実装する
   - ブラウザのサンドボックスを完全に迂回できる
   - 利用者は共有フォルダをHTTPサーバーやWebDAVで公開する必要がある

B案: Web Share Target API の活用
   - Quest 3 の他のアプリ（ファイラー）から「共有」でこのPWAに送る
   - 要調査: Quest 3 ブラウザが Web Share Target をサポートしているか

C案: ADB経由での解除（非現実的）
   - 一般ユーザーには適用不可能のため除外

### 決定事項

- A案（URLからの直接ダウンロード）を優先的に実装する
- まず B案（Web Share Target）のサポート状況を確認する

---

## エントリ #2 - 2026-04-28 (B案 Web Share Target)

### 成功の境界線

- manifest.json, sw.js, app.js の実装自体は構文エラーなく完了した

### 失敗の事象

- Quest 3 の共有シートに BookReader が表示されない
- 「アプリで開く」にも表示されない

### 失敗の根本原因

- Web Share Target Level 2（ファイル共有）は、PWAが「インストール済み」かつブラウザがサポートしている必要がある
- Quest 3 の Horizon ブラウザは Web Share Target Level 2 をサポートしていない可能性が高い
- そもそもユーザーの要求は「BookReader の『開く』ボタンで起動するファイルピッカーを変えたい」であり、B案は方向性が間違っていた

---

## エントリ #3 - 2026-04-28 (根本原因の深掘り調査)

### 調査で判明した事実

1. Android の Chromium は `<input type="file">` に対して内部的に2種類の Intent を使い分ける:
   - `ACTION_GET_CONTENT`: 広いアプリ選択（ファイラー、クラウド等が表示される）
   - `ACTION_OPEN_DOCUMENT`: SAF限定の制限付きピッカー
2. `accept` 属性の有無・値によって、どちらの Intent が発火するかが変わる可能性がある
3. **accept 属性を完全に除去する**（`*/*` でもなく、属性自体をセットしない）と、ACTION_GET_CONTENT が発火してファイラーアプリが選択肢に含まれる可能性がある
4. Quest 3 の OS アップデートで、ブラウザ側の Intent 選択ロジックが変更された可能性がある

### これまで試したこと（失敗）

| アプローチ | 結果 |
|---|---|
| `accept=".epub,.zip,..."` | 制限付きピッカー（元の状態） |
| `accept="*/*"` | ピッカーUI変化したが共有フォルダ非表示 |
| `showOpenFilePicker` API | ピッカーUI変化したが共有フォルダ非表示 |
| Web Share Target (B案) | 共有シートに表示されず |

### まだ試していないこと

1. **accept 属性を完全に除去**（属性自体をセットしない）
2. **`capture` 属性の追加**（Android で別の Intent 経路を発火させる可能性）
3. input に `webkitdirectory` を指定（フォルダ選択ダイアログ経由で別ピッカーが出る可能性）

### 次のアプローチ

- Quest 3 では `showOpenFilePicker` をスキップし、`<input type="file">` に戻す
- accept 属性を **完全に除去** して試す
- それでもダメなら「URL入力によるファイル読み込み」（A案）を実装する

---

## 変更履歴

| 日時 | 変更内容 | ファイル |
|------|---------|---------|
| 2026-04-28 | accept 属性を */* に変更 | assets/js/core/file-picker.js |
| 2026-04-28 | showOpenFilePicker を優先使用するよう変更 | assets/js/core/file-picker.js |
| 2026-04-28 | Quest 判定を Quest 3 から Quest に緩和 | assets/constants/runtime-config.js |
| 2026-04-28 | キャッシュを bookreader-v9 から bookreader-v10 に更新 | assets/sw-cache-config.json |
| 2026-04-28 | manifest.json に share_target を追加 (Web Share Target Level 2) | manifest.json |
| 2026-04-28 | sw.js に share-target POST インターセプト処理を追加 | sw.js |
| 2026-04-28 | app.js に SW からのメッセージ受信リスナーを追加 | assets/app.js |
| 2026-04-28 | キャッシュを bookreader-v10 から bookreader-v11 に更新 | assets/sw-cache-config.json |
