# app.js 境界整理（初期領域起点）

## 1. app.js 先頭付近の棚卸し（カテゴリ別）

### 初期化
- `StorageService` / `CloudSync` / `settings` / `initialAuthStatus` の生成・取得。初期状態の読み出しがこの時点で完了する。`storage` が他のモジュール注入元になるため、以降の初期化順序が重要。【F:assets/app.js†L57-L60】
- 同期ロジックの初期化。`storage`/`cloudSync`/`checkAuthStatus` と UI コールバックを注入している。以降 `syncLogic` は注入された依存に依存する。【F:assets/app.js†L110-L129】
- `ReaderController` 生成。`onProgress`/`onReady`/`onImageZoom` をフックとして登録するため、UI更新の起点になる。生成後にテーマ・読書方向を適用。【F:assets/app.js†L199-L229】
- CSS 変数の注入 (`applyCssVariablesFromConfig`) を実行。レイアウト系の初期表示に影響する。【F:assets/app.js†L234-L247】
- `UIController` 生成とイベント用コールバックを登録し、`uiInitialized` を true にする。UIイベントの入口になる。【F:assets/app.js†L253-L308】
- `renderers.init(...)` に `storage`/`reader`/`syncLogic`/`ui` と state/action を注入して描画層の依存を確定。UI描画がこの注入前提。【F:assets/app.js†L309-L343】
- `applyUiLanguage(...)` を実行し、初期の文言・UI状態を更新。UI表示の初期化の最終段。【F:assets/app.js†L345-L345】
- `setupViewerIframeClickBridge()` を呼び出して iframe 内クリックの橋渡しを開始。UI入力の受け口として重要。【F:assets/app.js†L347-L397】
- 進捗バーのドラッグハンドラー (`ProgressBarHandler`) を作成し、進捗操作を有効化。UI操作の初期化。【F:assets/app.js†L399-L416】

### 状態変数
- 読書/同期/表示系の状態: `currentBookId`, `currentBookInfo`, `currentCloudBookId`, `pendingCloudBookId`, `theme`, `writingMode`, `pageDirection`, `uiLanguage`, `progressDisplayMode`, `fontSize`, `defaultDirection`, `autoSyncEnabled`, `libraryViewMode` など。UI/同期ロジックの基礎状態として他モジュールへ伝播する。【F:assets/app.js†L62-L85】
- タイマー/内部状態: `autoSyncInterval`, `autoSyncTimeout`, `bookmarkMenuMode`, `currentToc`, `uiInitialized`, `floatVisible`, `googleLoginReady`, `userOverrodeDirection`。UI挙動の条件分岐に利用。【F:assets/app.js†L85-L92】
- 削除待ちキュー: `pendingDeletes`（Map）。UIメニュー操作と後段削除処理の境界。【F:assets/app.js†L93-L95】

### イベントバインド
- `DOMContentLoaded` で `initLoadingAnimation()` を実行。ローディングアニメーションの起動は DOM 準備が前提。【F:assets/app.js†L100-L103】
- `ReaderController` の `onProgress`/`onReady`/`onImageZoom` を登録。読書操作やズームが UI と進捗保存へ伝播する。【F:assets/app.js†L199-L226】
- `UIController` のコールバック (`onFloatToggle`/`onResize`/`onProgressBar`/`onBookmarkMenu`/`onPagePrev`/`onPageNext`) を登録し、UIイベントをアプリ側処理にバインド。【F:assets/app.js†L253-L305】
- `setupViewerIframeClickBridge()` 内で iframe の `click`/`load` をバインドし、MutationObserver で追加 iframe を監視。読書ビューのクリックが UI の操作に繋がる。【F:assets/app.js†L347-L395】

### UI更新
- `ReaderController.onProgress` 内で `ui.updateProgress(...)` を呼び、進捗バー更新の起点になる。デバウンス保存もここから開始。【F:assets/app.js†L204-L206】
- `ReaderController.onReady` で `renderers.updateProgressBarDirection()` と `handleBookReady` を呼び、読書UI初期化を進める。タイトル更新もここで実行。【F:assets/app.js†L208-L217】
- `UIController` コールバック内で `renderers.toggleFloatOverlay()`、`renderers.renderBookmarks(...)`、`ui.updateProgress(...)` 等の UI 更新が呼ばれる。UI状態遷移に直接影響。【F:assets/app.js†L272-L294】

### 同期トリガー
- `saveCurrentProgress()` が `storage.setProgress(...)` の後、クラウド同期が有効なら `triggerAutoSync()` を呼び出す。進捗保存→同期の連携点。【F:assets/app.js†L185-L191】
- `syncLogic.init(...)` に同期関連 UI コールバック（`syncAutoSyncPolicy`/`applyReadingState` など）を注入し、同期処理が UI/ローカル状態へ波及する入口を構成。【F:assets/app.js†L110-L128】

### ファイル操作
- `handleFile(file)` が `saveFile` や `fileHandler` を使ってファイルを保存・登録し、必要に応じてクラウドインデックス更新も行う。アプリ内ファイル処理の中核。【F:assets/app.js†L470-L541】
- `openFromLibrary(bookId)` が `loadFile` と `bufferToFile` を利用して保存済みファイルを復元し、読書ビューを再構成する。ライブラリ起点の読み込み処理。【F:assets/app.js†L685-L777】

## 2. 依存順序が重要な呼び出し（時系列）

1. `storage` / `cloudSync` / `settings` / `initialAuthStatus` を生成・取得し、以降の注入対象を確定。【F:assets/app.js†L57-L60】
2. `syncLogic.init(...)` に `storage`/`cloudSync`/`checkAuthStatus` と UI コールバックを注入。同期ロジックが依存を保持するため、この時点が必須。【F:assets/app.js†L110-L129】
3. `ReaderController` を生成し、`onProgress`/`onReady`/`onImageZoom` で UI 更新を紐づける。`reader` は UI/描画/同期から参照される。【F:assets/app.js†L199-L226】
4. `reader.applyTheme(...)` / `reader.applyReadingDirection(...)` で読み込み前の表示状態を確定。【F:assets/app.js†L228-L229】
5. `applyCssVariablesFromConfig()` を実行し、レイアウト CSS を初期注入。UIController 初期化前に適用される。【F:assets/app.js†L234-L247】
6. `UIController` を生成し、UIイベントのコールバックを登録。`ui` が `renderers.init` の依存になる。【F:assets/app.js†L253-L305】
7. `uiInitialized = true` を設定し、UIの初期化完了フラグを更新。【F:assets/app.js†L307-L307】
8. `renderers.init(...)` で `storage`/`reader`/`syncLogic`/`ui` と state/action を注入し、描画層の参照先を確定。【F:assets/app.js†L309-L343】
9. `applyUiLanguage(uiLanguage)` を実行し、文言と UI 状態を更新。【F:assets/app.js†L345-L345】
10. `setupViewerIframeClickBridge()` で iframe クリックの橋渡しを開始し、UI入力イベントを有効化。【F:assets/app.js†L347-L397】
11. `ProgressBarHandler` を生成し、進捗バーのドラッグ入力を受け付ける状態にする。【F:assets/app.js†L399-L416】

## 3. 依存モジュールの入出力整理（分割時の注意点）

| モジュール | 注入される依存（入力） | 出力/副作用 | 分割時の壊れやすいポイント |
| --- | --- | --- | --- |
| `storage.js` | `constants.js` の設定値（SSOT）。`localStorage` へのアクセス前提。 | `StorageService` が `localStorage` からデータロード・保存、`getDeviceInfo` で UA を解析。 | `localStorage` 前提のため、実行環境が変わると初期化で例外/空データに。`DEFAULT_*` を参照するため分割先でも constants を維持する必要。【F:assets/storage.js†L8-L203】 |
| `cloudSync.js` | `storage` インスタンス注入、`auth`/`firebaseConfig`/`onedriveAuth`/`i18n` 依存。 | `CloudSync` がクラウド同期の push/pull、認証/エンドポイント解決、Firestore 読み書き。 | `storage` が未注入だと `getSettings()` を含む多くのメソッドが破綻。`getCurrentUserId()` と Firebase SDK が前提なので、認証・SDK 初期化順序に依存。【F:assets/cloudSync.js†L7-L204】 |
| `sync-logic.js` | `init` で `storage`/`cloudSync`/`checkAuthStatus`/UIコールバックを注入。 | 同期可否判定、ライブラリエントリ組み立て、クラウド同期呼び出し。 | `init` を行わないと `_storage` 等が `null` のまま。`uiCallbacks` を期待しているため、呼び出し元での注入漏れが破綻ポイント。【F:assets/js/core/sync-logic.js†L14-L72】 |
| `renderers.js` | `init` で `storage`/`reader`/`syncLogic`/`ui`/`state`/`actions` を注入。 | UI描画・DOM更新（表示切り替え・ラベル更新・進捗表示など）。 | `init` 未実行だと `_state`/`_reader` が空で描画が壊れる。`_state.uiLanguage` が翻訳関数のキーになるため、注入の順序依存が強い。【F:assets/js/ui/renderers.js†L24-L176】 |

