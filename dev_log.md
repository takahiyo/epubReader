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
