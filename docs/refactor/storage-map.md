# StorageService 機能マップ / 分割設計メモ

本ドキュメントは `assets/storage.js` の `StorageService` を機能単位で分類し、
分割時の前提条件（`this.data` の共有）とデバイス識別ユーティリティの切り出し方針を整理する。

## 1. StorageService メソッド分類

### 1.1 永続化IO
- `constructor(key)`
  - インスタンス生成時に `load()` を呼び、`this.data` を初期化する。
- `load()`
- `save()`
- `exportData()`
- `snapshot()`
- `importData(json)`
- `mergeData(incoming)`

> 目的: 永続化の入出力とスナップショット/マージを担う。

### 1.2 library / bookmark / progress / history 管理
- `upsertBook(book)`
- `addHistory(bookId)`
- `addBookmark(bookId, bookmark)`
- `setBookmarks(bookId, bookmarks)`
- `mergeBookmarks(bookId, incomingList)`
- `getBookmarks(bookId)`
- `setProgress(bookId, progress)`
- `getProgress(bookId)`
- `removeBookmark(bookId, createdAt)`
- `removeHistory(bookId)`
- `removeBook(bookId)`
  - ライブラリ削除と履歴・進捗・しおりの削除に加え、リンク済みクラウドデータも削除する。
- `setHistoryEntries(bookId, entries)`

> 目的: ライブラリ/しおり/進捗/履歴の CRUD と上限管理を担う。

### 1.3 クラウド関連
- `removeCloudData(cloudBookId)`
- `getCloudBookId(localBookId)`
- `setBookLink(localBookId, cloudBookId)`
- `mergeCloudIndex(index, updatedAt)`
- `setCloudState(cloudBookId, state)`
- `getCloudState(cloudBookId)`

> 目的: クラウドインデックス・状態・ローカルIDリンクの管理を担う。

### 1.4 設定管理
- `setSettings(settings)`
- `getSettings()`

> 目的: UI/同期/デバイス設定などの永続化設定の更新・参照を担う。

## 2. デバイス識別ユーティリティ（切り出し候補）と利用箇所

### 2.1 対象ユーティリティ（デバイス識別カテゴリ）
- `generateDeviceId()`
- `getDeviceInfo()`
- `selectDeviceColor(deviceId)`
- `ensureDeviceSettings(settings)`

### 2.2 現在の利用箇所
- `generateDeviceId()`
  - `ensureDeviceSettings()` が `deviceId` 未設定時に呼び出す。
- `selectDeviceColor()`
  - `ensureDeviceSettings()` が `deviceColor` 未設定時に呼び出す。
- `ensureDeviceSettings()`
  - `load()` / `importData()` / `mergeData()` のデバイス設定正規化で呼び出す。
- `getDeviceInfo()`
  - `assets/app.js` の設定画面初期化でデバイス名入力に反映する。

> 切り出し時は `device-utils.js`（仮）などにまとめ、
> `storage.js` と `app.js` の双方から参照できる構成にする。

## 3. `this.data` 共有前提（シングルトン性）と分割設計メモ

### 3.1 前提条件（シングルトン性）
- `StorageService` は **1インスタンスのみ** 生成される前提で、
  `this.data` をアプリ全体で共有している。
- これにより、`storage.getSettings()` / `storage.setProgress()` などは
  **同一メモリ上の `this.data`** を参照し、同期処理や UI での状態整合性を保っている。

### 3.2 分割後の参照先を維持する設計メモ
- 分割後も **単一の `data` 参照** を共有し、
  既存の `StorageService` 呼び出しが `this.data` を通じて同じ状態を見続けることが必須。
- 実装候補（例）
  1. `StorageService` に `dataStore` を注入し、
     `libraryStore` / `cloudStore` / `settingsStore` などが同一 `dataStore` を共有する。
  2. `createStorageContext()` で `data` と `save()` をまとめて持つコンテキストを生成し、
     分割モジュールはコンテキスト参照で読み書きを行う。
- 既存 API を維持する場合、`StorageService` はファサードとして残し、
  内部で分割モジュールのメソッドを委譲する。

### 3.3 分割タスク（影響が少ない順）
1. **ドキュメント整備**: 本マップに基づき分類を固定する。
2. **デバイス識別ユーティリティの切り出し**: `getDeviceInfo` などの関数のみを分離し、
   呼び出し側はインポート先を差し替える。
3. **設定管理の分割**: `getSettings` / `setSettings` を `settings-store` へ移動し、
   `StorageService` から委譲する。
4. **library/bookmark/progress/history 管理の分割**: CRUD 系メソッドを移動し、
   共有 `data` 参照を維持する。
5. **クラウド関連の分割**: `cloudIndex` / `cloudStates` / `bookLinkMap` を扱う部分を分離する。

> すべての段階で「単一の `this.data` を共有する」前提を崩さないこと。
