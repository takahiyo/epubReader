# 開発ログ: Quest 3 ファイルピッカー問題

---

## エントリ #16 - 2026-06-11（メニュー画面のログイン状態表示）

### 成功の境界線

- 原因特定: ログイン状態表示は左サイドメニュー（`#leftMenu`）にのみ実装されており、実際に利用者が操作する中央クリックのフロートメニュー（`#floatOverlay`）には未配置だった。
- フロートメニューのアプリバナー（`.float-title`）直下に `#floatAuthStatus` を追加し、既存の `.menu-auth-status` スタイルを再利用。
- `updateMenuAuthStatus()` を両メニュー対応に拡張し、`checkAuthStatus()` をフォールバックとして初期表示の取りこぼしを防止。

### 失敗の事象

- dev 環境でメニューを開いても、バナー下にログイン状態が一切表示されない。

### 失敗の根本原因

- 設計意図は「メニュー画面のバナー直下」だが、実装先が旧来の左サイドメニューのみで、現行 UI の主メニュー（フロートオーバーレイ）と乖離していた。

### 次のアプローチ

- Cloudflare Pages へプッシュ後、フロートメニュー表示時に「未ログイン」または「ログイン済み: {user}」がバナー直下に表示されることを確認する。

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

## エントリ #7 - 2026-06-02 (Quest 3 ファイルピッカーの簡略化と多機能化)

### 成功の境界線

- Quest 3環境下において、「開く」ボタンを押した際、中間モーダル（WebDAV等の選択）を挟まず、直接以前のような「多機能なOSファイルピッカー」を起動する状態。

### 失敗の事象

- 前回の改修後、Quest 3環境だけで「開く」を押してもファイルピッカーが立ち上がらなくなった（ブラーで隠れたモーダルが原因）。
- モーダルから「ローカルファイルを開く」を実行しても、他の環境と変わらない制限付きのシンプルなピッカー（ファイラーではなくメディア選択など）しか起動しなくなった。

### 失敗の根本原因

1. モーダル表示時の重ね順（z-index）設定の不備により、設定画面等のブラー背景の裏に隠れていた。
2. モーダル内のWebDAVとライブラリはそもそも不要であった。
3. `picker-android.js`（ローカル用）において、`accept` 属性に具体的な拡張子（.epub, .zip等）を詰め込み、`multiple` を有効にしていたため、Android/Quest OS側が「特定のメディア専用の入力」と判断し、Google DriveやpCloud、外部ファイルマネージャー等を選べる多機能ピッカー（ACTION_GET_CONTENT）を隠してしまっていた。

### 解決アプローチ（実施）

1. `file-picker.js` で `QUEST3` に対しても直接 `androidPicker` を呼び出すように変更し、中間モーダルを完全に廃止。
2. Quest 3 のOSアップデートにより、ブラウザ上の `<input type="file">` はOS制限を回避不可能であることが確定。そのため、`picker-android.js` のパラメータはハックコードを廃止し、通常のAndroidと同じ安全な設定に戻した。
3. 今後の本命対策として、TWA（APK）パッケージの再ビルドによる「アプリで開く」への登録（file_handlersのインテントフィルタ連携）へと舵を切る。
4. `index.html` から不要になった `#quest3PickerModal` のマークアップを削除。
5. キャッシュを `bookreader-v26` にバンプ。

---

## 変更履歴

| 日時 | 変更内容 | ファイル |
|------|---------|---------|
| 2026-06-02 | Quest 3 でも直接 androidPicker を起動するよう変更 | assets/js/core/file-picker.js |
| 2026-06-02 | OS制限の確定に伴い、Quest 3用ハックを廃止し安全な元のコードへ復帰 | assets/js/core/pickers/picker-android.js |
| 2026-06-02 | 不要な Quest 3 専用モーダルのマークアップを削除 | index.html |
| 2026-06-02 | キャッシュバンプ v23→v26 | assets/constants/pwa.js, assets/sw-cache-config.json |
| 2026-06-04 | 署名付きAPK (TWA) のビルド自動化 | android-project/app/build.gradle, .gitignore |

---

## エントリ #8 - 2026-06-04 (BubblewrapによるAndroid APKビルド自動化)

### 成功の境界線

- ローカル環境の Bubblewrap を用い、対話的なプロンプトの入力を手動で待つことなく、署名付き APK (`app-release-signed.apk`) および App Bundle (`app-release-bundle.aab`) のビルドが完全に成功した。
- 生成された APK には `manifest.json` の `file_handlers` 設定（インテントフィルタによる `.epub` / `.zip` 等のファイル関連付け）が正しく組み込まれている。

### 失敗の事象

1. **初期化時の対話プロンプトでのループ/停止**:
   - `manage_task` での `send_input` は呼び出し元の標準入力にしか届かず、Bubblewrap CLI にパイプされていなかったため、一部の鍵生成プロンプトでプロセスが待機状態（フリーズ）になった。
   - `init-automator.js` 内で一部のプロンプト名（大文字小文字の差異、例: `? Organizational Unit`）がマッチせず、自動応答が正しく行われなかった。

2. **Gradle ビルド時の build-tools 35.0.0 エラー**:
   - `npx @bubblewrap/cli build` 実行時に `Failed to install the following SDK components: build-tools;35.0.0` というエラーでビルドが失敗した。
   - SDK の `build-tools/35.0.0` ディレクトリが存在するものの、中身が `.installer` のみで不完全（破損状態）であった。

### 失敗の根本原因

1. `process.stdin.pipe(child.stdin)` が抜けていたため、外部からの入力中継が効かなかった。また、プロンプト検出の文字列が大文字小文字で異なっていた。
2. Android Gradle Plugin (AGP) が自動的に最新の build-tools バージョン（35.0.0）を要求して自動インストールしようとしたが、ライセンス承認の不足またはネットワーク制限等でインストーラーが壊れた状態で停止していた。

### 解決アプローチ

1. **自動化スクリプトの改修**:
   - `init-automator.js` に対話中継用のパイプを追加し、プロンプト判定の文字列を大文字小文字を含めて正確（かつ一度だけ応答するフラグ制御）にしたことで、完全に自動で `init` と鍵生成が終了するようになった。
2. **build.gradle でのビルドツール指定ハック**:
   - `android-project/app/build.gradle` 内の `android` ブロックに `buildToolsVersion "34.0.0"` を明示的に追加。すでに正常インストールされている 34.0.0 (実体は 36.1.0) を強制使用させることで、存在しない 35.0.0 のダウンロードを回避し、ビルドを無事通過させた。
3. **非対話ビルドの実現**:
   - ビルド時のパスワード入力を回避するため、環境変数 `BUBBLEWRAP_KEYSTORE_PASSWORD` と `BUBBLEWRAP_KEY_PASSWORD` に `"password"` をセットして `bubblewrap build` を呼び出すことで、ビルドから署名まで完全自動で完了させた。

| 2026-06-04 | 本番URLへの切り替え、Meta Quest互換設定 (isMetaQuest: true) の有効化 | android-project/twa-manifest.json, android-project/app/src/main/AndroidManifest.xml |

---

## エントリ #9 - 2026-06-04 (本番環境切り替え & Meta Quest 互換有効化)

### 成功の境界線

- 本番ドメイン `bookreader.flateight.jp` に接続し、かつ Meta Quest 互換フラグ（`isMetaQuest: true`）を有効にした署名付き APK (`app-release-signed.apk`) のビルドが成功した。
- `AndroidManifest.xml` に Meta Quest (Oculus) 向けの拡張メタデータ（ハンドトラッキング許可、VRヘッドトラッキング要件、PWA名およびスコープ定義等）が自動的に正しく組み込まれた。

### 解決アプローチ

1. **twa-manifest.json の更新**:
   - 単一の真実のソース (SSOT) である [twa-manifest.json](file:///e:/Local_Storage/GitHub/epubReader/android-project/twa-manifest.json) を本番ドメイン (`bookreader.flateight.jp`)、マニフェストURL (`https://bookreader.flateight.jp/manifest.json`)、および `"isMetaQuest": true` に更新。
2. **Bubblewrapプロジェクトのアップデート**:
   - `npx @bubblewrap/cli update` コマンドを実行し、設定の更新内容をプロジェクトファイル全体に反映。これにより、バージョン名・バージョンコードが自動で `2` にバンプされた。
3. **build.gradle の再ハックとビルド実行**:
   - `update` コマンドにより上書きリセットされた `app/build.gradle` に対し、再度 `buildToolsVersion "34.0.0"` を挿入。
   - 環境変数経由のパスワード自動入力設定のもとで `bubblewrap build` を実行し、ビルドを無事成功させた。

---

## エントリ #10 - 2026-06-04 (パッケージの解析エラー対応)

### 成功の境界線

- `androidx.browser:browser:1.9.0-alpha04` の制約である `compileSdkVersion 36` を維持しつつ、実行時の挙動を定義する `targetSdkVersion` を `34` (Android 14) に引き下げた APK のビルドが成功した。

### 失敗の事象

- 実機へのインストール時に「パッケージの解析中に問題が発生しました」というエラーが発生した。

### 失敗の根本原因

1. **OS互換性**:
   - 以前のビルドでは `compileSdkVersion 36` に対して `targetSdkVersion 35` (Android 15) が指定されていたため、Quest 3 (Android 12Lベース) のパッケージマネージャーがサポート対象外としてインストールを拒否した可能性がある。
2. **署名鍵の不一致（最有力原因）**:
   - 以前にPWABuilder等で作成・インストールした古い「BookReader」アプリが実機に残っている場合、今回のビルドで新規作成されたローカルキーストア（`android.keystore`）の署名と異なるため、Android OSのセキュリティ制約により「同一パッケージ名での署名不一致による上書き失敗」が起き、ファイラー側で「パッケージの解析中に問題が発生しました」と表現された可能性が非常に高い。

### 解決アプローチ

1. **build.gradle での SDK レベル調整**:
   - `compileSdkVersion` を `36` (ライブラリの最低要求) に維持したまま、`targetSdkVersion` を `34` (Quest 3 との互換性確保) に引き下げて再ビルド。
2. **古いアプリの完全アンインストールの提示**:
   - 署名鍵が変わったことによる不整合を防ぐため、インストール前に実機から古い「BookReader」を完全にアンインストールする手順をユーザーへ案内する。

---

## エントリ #11 - 2026-06-04 (TWA実機でファイルピッカーがシンプルのままになる問題)

### 成功の境界線

- Quest 3の実機 (TWA/APK) にて、PWAキャッシュが `v30` に更新され、UA判定の緩和により「サードパーティのファイルピッカー」が正常に立ち上がる状態。

### 失敗の事象

- 実機でアプリを起動したが、ファイルピッカーがシンプルのままで、サードパーティ製ファイラーが選択できない。

### 失敗の根本原因

- 判定緩和とキャッシュバンプ (v30) の修正はローカルでステージング（`git add`）されていたが、Gitにコミットおよび `origin/dev` ブランチへプッシュされていなかった。
- そのため、Webサーバー側（Cloudflare Pagesなど）へデプロイされておらず、実機では依然として古いコードとキャッシュ（v29以前）が動作し続けていた。

### 次のアプローチ

- ステージング済みの修正をコミットし、`origin/dev` にプッシュする。
- デプロイ完了後、実機側でキャッシュを更新（アプリの再起動等）させて再検証を行う。

---

## エントリ #12 - 2026-06-04 (プッシュ後もファイルピッカーがシンプルのままになる問題の追跡)

### 成功の境界線

- 設定画面を開いたときに、デバッグ情報（キャッシュバージョン、判定プラットフォーム、User Agent文字列）が表示され、かつプラットフォームが `quest3` と正常認識されている状態。

### 失敗の事象

- コミット・プッシュを実行し、デプロイ完了を待ってから実機で検証したが、やはりファイルピッカーはシンプルのままだった。

### 失敗の根本原因

- 以下の可能性を切り分ける必要がある：
  1. キャッシュの更新（`v30`）が実機側でまだ適用されていない。
  2. 実機 WebView 環境の `navigator.userAgent` 文字列に `Quest`, `Oculus`, `VR` のいずれも含まれていないため、`detectPlatform()` が `quest3` を返さず `android` にフォールバックしている。
- ユーザーにPCリモートデバッグを行わせるのは不可能なため、視覚的に切り分けられる仕組みが必要。

### 次のアプローチ

- 設定画面（`settingsModal` 内のデバイス情報セクション）の最下部に、現在のキャッシュ名、判定プラットフォーム、User Agent文字列を直接表示するデバッグ情報表示領域を追加する。
- キャッシュを `v31` にバンプし、変更が確実に適用された状態（Cache: `bookreader-v31`）で表示結果を確認するようユーザーへ依頼する。

---

## エントリ #13 - 2026-06-04 (デバッグ情報確認後の高度なピッカー復活対策)

### 成功の境界線

- Quest 3の実機 (TWA/APK) にて、PWAキャッシュが `v32` に更新され、「開く」ボタンを押した際にサードパーティ製ファイラーが選択できる高度なシステムファイルピッカーが正常に起動する状態。

### 失敗の事象

- 設定画面で `Cache: bookreader-v31`, `Platform: quest3` と正常に認識され、かつ最新コードが動いていることを確認したが、依然として起動するファイルピッカーがシンプルのままであった。

### 失敗の根本原因

- 過去の正常動作時のコミット（`40a3bfc` / `d91429c`）の調査により、Quest 3の実機 WebView 環境では `<input type="file" accept="*/*">` と `accept="*/*"` を指定すると、OSがメディアピッカーを強制起動し、サードパーティ製ファイラー等の Document Provider が除外されてしまうことが判明。
- 逆に、`accept` 属性を完全に空（または削除）にすると、OSは汎用ファイルインテント（`ACTION_GET_CONTENT`）を発火させるため、サードパーティ製ファイラー等の高度なピッカーが選択肢に現れる仕様であった。
- 直近の修正で `accept="*/*"` に変更してしまったため、再びシンプルなピッカーに退化していた。

### 次のアプローチ

- `picker-android.js` において、`useBroadPicker` が `true` の場合、`acceptString` を `''` (空文字列) に設定するよう修正する（これによりインテント起動時に `accept` 属性自体が削除される）。
- キャッシュを `bookreader-v32` にバンプし、変更が確実に適用された状態で再検証を行う。

---

## エントリ #14 - 2026-06-04 (TWA起動モードの違いによるSAFピッカーの表示制限の特定)

### 成功の境界線

- Quest 3の実機 (TWA/APK) にて、「開く」ボタンを押した際に「左ペインにサードパーティ製ファイラー等の選択肢が表示される高度なシステムファイルピッカー」が正常に起動する状態。

### 失敗の事象

- キャッシュを `v32`（`acceptString = ''` の状態）に更新して最新コードを動かしたにもかかわらず、やはりファイルピッカーはシンプルのままで、サードパーティ製ファイラーが表示されなかった。

### 失敗の根本原因

- 以前サードパーティ製ファイラーが正常に選べていた環境（PWAbuilder版APK等）と、現在の環境（Meta公式版Bubblewrapで `isMetaQuest: true` を有効にしたAPK）の違いが原因であると特定。
- `"isMetaQuest": true` を設定してビルドしたAPKは、Horizon OSの「Oculus PWAランタイム（制限付きWebView）」で起動する。このランタイムはセキュリティ（サンドボックス）が極めて厳しく、左ペイン付きのシステムファイルピッカー（SAF）を起動するインテントが完全にブロックされている。
- 一方、通常のAndroid TWAとしてビルドした場合は「Custom Tabs（ブラウザの別タブプロセス）」で起動するため、Oculus Browserの標準機能として左ペイン付きの高度なSAFピッカーが正常に動作する。

### 次のアプローチ

- `twa-manifest.json` の `"isMetaQuest"` を `false` に戻し、Meta専用設定を削除してバージョンを `4` に上げる。
- `bubblewrap update` および `bubblewrap build` を実行して、通常のAndroid TWA用署名付きAPKを再ビルドし、ユーザーに入れ替えて動作確認を依頼する。

---

## エントリ #15 - 2026-06-04 (PWAbuilder版での高度なピッカー起動成功とファイル選択後の読込フリーズ対応)

### 成功の境界線

- Quest 3の実機 (PWAbuilder版APK) にて、PWAキャッシュが `v33` に更新され、Platformが `quest3` と正常に認識され、かつファイル選択後に正常に本の読み込みが開始される状態。

### 失敗の事象

- PWAbuilder版のAPKをインストールして起動したところ、高度なファイルピッカー（左ペイン付き）が正常に起動することを確認した。
- しかし、ファイルを選択してもリーダーへの読み込みが開始されなかった。また、Platformのデバッグ表記が `unknown` になっていた。

### 失敗の根本原因

1. **プラットフォーム判定のすり抜け:**
   PWAbuilder版（Custom Tabs/Oculus Browser）から起動した際、大画面モードやデスクトップ表示モードなどの影響で、`navigator.userAgent` 文字列に `Android` や `Quest`, `Oculus`, `VR` のキーワードが一切含まれず、`detectPlatform()` が `unknown` を返していた。
2. **Windowsピッカーのフォールバックにおけるタイマー誤作動:**
   `detectPlatform()` が `unknown` と判定されたため、`file-picker.js` は `windowsPicker` を呼び出した。
   `windowsPicker` はモダンAPI非対応時に `accept=""`（空）で `<input>` を作成し、これが高度なピッカーの起動に繋がったが、そのフォールバック処理に組み込まれている「キャンセル判定タイムアウト」がわずか **`300ms`** だった。
   Quest 3 OSの処理遅延およびファイラーのファイルデータ準備により、フォーカスが戻ってから `change` イベントが届くまでに0.3秒以上かかったため、`change` が発火する前にタイムアウトによる空のファイル配列が解決され（キャンセル扱い）、読み込みが開始されなかった。

### 次のアプローチ

- `picker-windows.js` のフォールバック処理において、タッチデバイス（`isTouch`）の時はキャンセル猶予タイムアウトを `3000ms` (3秒) に延長する。
- `runtime-config.js` の `isQuest3()` 判定において、UAだけでなく WebXR API の有無（`'xr' in navigator`）も条件に追加し、UAが偽装または制限されている場合でも確実に `quest3` と判定できるようにする。
- キャッシュを `bookreader-v33` にバンプする。

---

## エントリ #16 - 2026-06-04 (Platform正常認識後のファイルピッカー退化とmultiple属性の影響特定)

### 成功の境界線

- Quest 3の実機 (PWAbuilder版APK) にて、PWAキャッシュが `v34` に更新され、Platformが `quest3` と正常に認識された状態で「左ペインのある高度なシステムピッカー」が正常に起動し、ファイル選択後に本が読み込める状態。

### 失敗の事象

- キャッシュを `v33` に更新したところ、Platform判定が正常に `quest3` に改善されたことを確認した。
- しかし、ファイルピッカーが再びシンプルの状態に戻ってしまった。

### 失敗の根本原因

- `detectPlatform()` が `quest3` と正しく判定されるようになったことで、`windowsPicker` の代わりに `androidPicker` が起動するようになった。
- しかし、`picker-android.js` の既存ロジックでは、Quest 3判定時（`useBroadPicker` が `true`）に `multiple` 属性を強制的に `false` (単一選択) に変更する仕様になっていた。
- Quest 3 (Horizon OS) の WebView は、`<input type="file">` に `multiple` 属性がない場合、簡易的なメディアピッカー（シンプルなピッカー）を強制起動し、`multiple` 属性がある場合のみ、左ペイン付きの高度なシステムファイルピッカー（SAF）を起動する挙動仕様であることが判明。
- プラットフォーム判定が `unknown`（Windowsフォールバック）だった時は、`windowsPicker` で `multiple` が `true` になっていたため、偶然高度なピッカーが開いていた。

### 次のアプローチ

- `picker-android.js` において、Quest 3環境であっても `multiple` を強制的に `false` にせず、`options.multiple !== false` (通常通り `true`) のまま動作させるように修正する。
- キャッシュを `bookreader-v34` にバンプする。

---

## エントリ #17 - 2026-06-04 (V34シンプルピッカー問題への対処とデバッグ強化)

### 成功の境界線

- Quest 3の実機 (PWAbuilder版APK) にて、PWAキャッシュが `v35` に更新され、Platformが `quest3` と認識され、且つ「左ペインのある高度なシステムピッカー」が確実に起動し、ファイルの読み込みがフリーズせず開始されること。

### 失敗の事象

- キャッシュを `v34` に更新し、Platform判定が `quest3`、且つ `multiple` 制限も解除したにもかかわらず、依然として立ち上がるファイルピッカーがシンプルなままであった。

### 失敗の根本原因

- プラットフォーム判定 `detectPlatform()` が、デバッグ画面の表示上は `quest3` になっていても、`picker-android.js` 内のインポート先やキャッシュタイミングの不整合により、実行時に `android` や `unknown` を返していた可能性。
- `android` と判定された場合、`isQuest` が `false` になり、`acceptString` に具体的な拡張子（`.epub,.zip...`）がセットされてしまう。Android OS (Horizon OS含む) は、`accept` 属性に具体的なファイル形式が指定されていると、`multiple` 属性が `true` であっても簡易メディアピッカー（シンプルなピッカー）を優先して起動してしまう仕様。
- また、実機上で「どのピッカーモジュールが起動し、どのパラメータが渡されたか」を視覚的に追跡する手段がなく、問題の切り分けが困難だった。

### 次のアプローチ

- **プラットフォーム判定の二重化**: `picker-android.js` の内部で `detectPlatform()` だけでなく、`'xr' in navigator` の存在や `navigator.userAgent` を直接チェックして Quest 3 であるかを強固に判定する。
- **Android/QuestにおけるSAFの強制**: `picker-android.js` において、特定の拡張子指定によってシンプルピッカーに化けるのを防ぐため、Android環境全般において `acceptString` を常に空 `''` に上書きする。これにより左ペイン付きの高度なシステムピッカー (SAF) の起動を強制する。
- **デバッグログの画面表示**: `index.html` に `Picker Log:` 表示領域を新設し、ファイルピッカー起動時に実行されたモジュールとパラメータ（例: `android (isQuest:true, multiple:true, accept:'')`）を画面に動的表示し、実機検証を容易にする。
- キャッシュを `bookreader-v35` にバンプする。

---

## エントリ #15 - 2026-06-10（フロートメニューボタンのレイアウト統一）

### 成功の境界線

- 目次ボタンを基準に、フロート左メニュー全ボタンのアイコン・テキストを横並び（24px アイコン + 同一フォントサイズ）に統一。
- 表示グループ内の子ボタン（全画面・テーマ・言語・横書き等）の縦積みレイアウトを解消。

### 失敗の事象

- 一部ボタン（しおり・設定・表示サブメニュー等）でアイコンサイズ（32px vs 24px）、テキスト位置（`.btn-label` による縦積み小文字）、フォントウェイト（600）が不均一。

### 失敗の根本原因

- `#toggleTheme` / `#toggleFullscreen` / `#floatSettings` / `.float-lang-toggle-inline` に `flex-direction: column` と `.btn-label`（0.6rem）が個別適用されていた。
- アイコン生成が `getPremiumIcon(..., 32)` と `getPremiumIcon(..., 24)` で混在していた。

### 次のアプローチ

- CSS 変数（`--float-btn-icon-size` 等）と `.float-btn-icon` クラスで SSOT 化。
- `setFloatInlineLabel` / `setMaterialIconLabel` にラベル更新を集約。
- キャッシュバンプ: CSS v12/v15/v2、app.js v16。

