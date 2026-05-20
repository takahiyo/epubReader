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
| 2026-05-12 | Web小説読込後・クラウドのみ表示切替後にフロートUIボタン状態を更新 | assets/app.js |
| 2026-05-12 | 読書録を常時表示＋未オープン時 disabled、キャッシュバンプ v12 | assets/js/ui/renderers.js, assets/css/05-float-ui.css, index.html |
| 2026-05-13 | 既存Workerに /proxy CORSプロキシエンドポイント追加（許可ドメイン制限付き） | workers/src/index.js |
| 2026-05-13 | WORKERS_CONFIG に PROXY_ENDPOINT 追加（SSOT） | assets/constants/runtime-config.js |
| 2026-05-13 | 自前Workerプロキシを最優先に変更、パブリックプロキシはフォールバックに降格 | assets/js/core/web-novel-provider.js |
| 2026-05-13 | キャッシュバンプ v12→v13 | assets/sw-cache-config.json |

---

## エントリ #4 - 2026-05-12（読書録ボタンが表示されない）

### 成功の境界線

- EPUB／ライブラリから開いた書籍では、`handleFile` / `openFromLibrary` 完了時に `renderers.updateFloatingUIButtons()` が呼ばれ、フロートの読書録の有効／無効が更新される。

### 失敗の事象

- Web小説を `loadWebNovel` で開いたあと、画面中央のフロートメニューに「読書録」ボタンが出ない（`.hidden` のまま）。
- クラウドのみ表示（`openCloudOnlyBook`）に切り替えたあと、フロートの読書録が前の状態のまま残る可能性。

### 失敗の根本原因

- 起動時 `applyReadingSettings` 内で `updateFloatingUIButtons` が走り、書籍未オープン時は読書録ボタンに `hidden` が付く（後続エントリ #5 で仕様変更）。
- `loadWebNovel` は `currentBookId` を設定するが **`updateFloatingUIButtons` を呼んでいない**ため、フロート側の表示状態が更新されず `hidden` が残る。
- `openCloudOnlyBook` は `currentBookId` を `null` にするが **`updateFloatingUIButtons` を呼んでいない**ため、フロートの表示が状態とずれる可能性がある。

### 次のアプローチ（実施）

- `loadWebNovel` の成功パスで `renderers.updateFloatingUIButtons()` を呼ぶ。
- `openCloudOnlyBook` の末尾でも `renderers.updateFloatingUIButtons()` を呼び、フロート／左メニューの読書録の有効状態を同期する。

---

## エントリ #5 - 2026-05-12（本未選択でも読書録を見せる）

### 失敗の事象

- 空の状態（`bookId: null`）でフロートメニューを開くと、読書録ボタンが DOM 上 `display: none` のため一覧に現れず、7項目しか見えない。

### 失敗の根本原因

- `updateFloatingUIButtons` が `setElementVisibility(shareLogButton, isBookOpen)` とし、本未オープン時は `.hidden` で完全非表示にしていた。

### 次のアプローチ（実施）

- フロートの読書録は常に表示し、`disabled = !isBookOpen` とする（左メニューの `menuShareLog` も同様に無効化を同期）。
- 無効時の見た目は `.float-buttons button:disabled` で左メニューと同程度の `opacity: 0.4` に統一。

---

## エントリ #6 - 2026-05-13（Web小説CORSプロキシ問題の解決）

### 成功の境界線

- なろうAPIによる検索は正常動作していた。
- カクヨムの検索UIも正常動作していた。
- エピソード抽出ロジック（正規表現→文字列ベース）の修正は完了済み。

### 失敗の事象

- パブリックCORSプロキシ（codetabs, corsproxy.io, allorigins等）経由でなろうの目次ページを取得すると、HTMLが空文字（0文字）または403 Forbiddenが返り、エピソード一覧が取得できない。

### 失敗の根本原因

- 「小説家になろう」がCloudflare Turnstile等の強力なボット対策を導入しており、パブリックCORSプロキシからのアクセスを完全にブロックしている。
- パブリックプロキシは多数のユーザーが共有するIPアドレスを使用するため、集中的にブロック対象になりやすい。

### 解決アプローチ（実施）

- 既存のCloudflare Worker（`bookreader-dev.taka-hiyo.workers.dev`）に `/proxy` エンドポイントを追加。
- 許可ドメイン制限（`ncode.syosetu.com`, `kakuyomu.jp` のみ）でオープンプロキシ化を防止。
- User-Agentをデスクトップブラウザに偽装してボット判定を回避。
- `runtime-config.js`（SSOT）にURLを追加し、`web-novel-provider.js`で最優先プロキシとして設定。
- **結果**: なろうの目次ページ74,711文字を正常取得、検索→目次→本文の一連フローがブラウザで動作確認済み。

### 残課題

- 本文読込時に `TypeError: Cannot read properties of undefined (reading 'metadata') at ReaderController.onReady` が発生（表示には影響なし、Web小説固有のメタデータ未定義が原因）。

---

## エントリ #4 - 2026-05-13 (Web小説機能の安定化)

### 成功の境界線

- **ナビゲーションの安定化**: Web小説閲覧画面の上下に「前の話」「次の話」ボタンを実装し、スクロールによる意図しない章遷移を廃止した。
- **目次 (TOC) の修正**: `reader.js` 内で `this.toc` を正しく保持するようにし、目次メニューからのジャンプ機能を復旧させた。
- **同期コンフリクトの解消**: Web小説固有の `location` オブジェクト（インデックスとスクロール率）を正しく比較できるよう `locationsAreEqual` ヘルパーを導入。これにより、同一地点で開いた際に「別の端末での進捗があります」というモーダルがループする問題を解決。
- **タイトルのフォールバック**: エピソードタイトルが取得できない場合、本文の冒頭をタイトルとして採用するロジックをプロバイダーに追加。

### 失敗の事象

- **目次クリック時のエラー**: `renderers.js` から `reader.goTo` に渡す引数のネスト構造が誤っており、目次からの遷移が動作していなかった（修正済み）。
- **大規模連載の目次取得**: 数千話ある作品の目次を一括で取得・表示するとメモリ負荷が高い。

### 失敗の根本原因

- `reader.goTo` はしおり互換性のために `{ location: { location: index, percentage: scroll } }` という二重の location 構造を期待していたが、UI側からは一重のオブジェクトを渡していた。

### 次のアプローチ

- **テキスト範囲検索**: 作品全体、あるいは指定した章範囲での全文検索機能の実装。
- **目次の遅延読み込み/ページネーション**: TOCモーダル内での表示最適化。

---
