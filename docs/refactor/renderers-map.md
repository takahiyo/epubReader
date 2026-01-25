# renderers.js 機能マップ & 分割設計メモ

## 目的
- `assets/js/ui/renderers.js` を「共通ヘルパー」「ライブラリ」「履歴」「しおり」「目次/検索」「フローティングUI」などのセクション単位で整理し、機能カテゴリへのマッピングを明示する。
- `init(config)` で注入している依存（`storage`, `reader`, `syncLogic`, `ui`, `state`, `actions`）を JSDoc 型で整理し、各機能が参照する最小依存を明記する。
- 分割後のファイル配置案と `renderers/index.js` での再エクスポート方針を記述する。

## 依存注入の JSDoc 型定義（案）
`renderers.js` に残す前提の型メモ。将来ファイル分割しても `init(config)` の契約は共通化する想定。

```js
/**
 * @typedef {Object} RenderersStorage
 * @property {Object} data
 * @property {Object.<string, { title: string }>} data.library
 * @property {Array<{ bookId: string, openedAt: number }>} data.history
 * @property {function(string): { percentage: number }} getProgress
 * @property {function(string): Array<{ createdAt: number, percentage: number, label?: string, deviceColor?: string }>} getBookmarks
 * @property {function(string, number): void} removeBookmark
 * @property {function(string): void} removeHistory
 * @property {function(): { lastSyncAt?: number }} getSettings
 */

/**
 * @typedef {Object} RenderersReader
 * @property {string} imageViewMode
 * @property {string} imageReadingDirection
 * @property {boolean} imageZoomed
 * @property {Array<unknown>} imagePages
 * @property {boolean} usingPaginator
 * @property {function(Object): void} goTo
 * @property {function(string): void} navigateToHref
 */

/**
 * @typedef {Object} RenderersSyncLogic
 * @property {function(string): Array<Object>} buildLibraryEntries
 * @property {function({ progressPercentage: number, timestamp?: number }, string): string} formatLibraryMeta
 */

/**
 * @typedef {Object} RenderersUi
 * @property {Object} elements
 */

/**
 * @typedef {Object} RenderersState
 * @property {string} uiLanguage
 * @property {string|null} currentBookId
 * @property {Object|null} currentBookInfo
 * @property {string} theme
 * @property {string} writingMode
 * @property {string} pageDirection
 * @property {string} progressDisplayMode
 * @property {boolean} floatVisible
 * @property {Map<string, { id: string, type: string }>} pendingDeletes
 */

/**
 * @typedef {Object} RenderersActions
 * @property {function(): void} closeAllMenus
 * @property {function(string, { bookmark?: Object }=): Promise<void>} openFromLibrary
 * @property {function(string): void} openCloudOnlyBook
 * @property {function(string): void} setPendingCloudBookId
 * @property {function(): void} openFileDialog
 * @property {function(): Object} checkAuthStatus
 * @property {function(Object): void} syncAutoSyncPolicy
 * @property {function(): (number|null)} getEpubPaginationTotal
 * @property {function(): void} scheduleAutoSyncPush
 */

/**
 * @typedef {Object} RenderersConfig
 * @property {RenderersStorage} storage
 * @property {RenderersReader} reader
 * @property {RenderersSyncLogic} syncLogic
 * @property {RenderersUi} ui
 * @property {RenderersState} state
 * @property {RenderersActions} actions
 */
```

## 機能カテゴリ別マッピング
### 共通ヘルパー
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `init(config)` | 依存注入 | `storage`, `reader`, `syncLogic`, `ui`, `state`, `actions` |
| `t(key)` | 翻訳ヘルパー | `state` |
| `setElementVisibility` | DOM 表示切替 | 依存なし |
| `setStatusClass` | ステータスクラス更新 | 依存なし |
| `setMaterialIconLabel` | Material Icon + ラベル組み立て | 依存なし |

### フローティングUI
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `updateSearchButtonState` | 検索ボタンの有効/無効更新 | `state` |
| `updateFloatingUIButtons` | フローティングUIのボタン表示更新 | `state`, `reader` |
| `toggleFloatOverlay` | フローティングオーバーレイ表示切替 | `state`, `storage` |
| `updateSpreadModeButtonLabel` | 画像ビューの見開き切替ラベル | `reader`, `state` |
| `updateReadingDirectionButtonLabel` | 画像の読み方向ラベル | `reader`, `state` |
| `updateWritingModeToggleLabel` | 縦書き/横書きのトグル | `state` |
| `updateThemeToggleIcon` | テーマ切替アイコン更新 | `state` |
| `updateEpubScrollMode` | EPUB スクロールモード制御 | `state` |
| `updateReadingDirectionEpubButtonLabel` | EPUB の読み方向ラベル | `state` |
| `updateZoomButtonLabel` | 画像ズームボタン更新 | `reader`, `state` |
| `updateProgressBarDirection` | 進捗バーの RTL/LTR 切替 | `state`, `reader` |
| `updateFloatProgressBar` | フロート進捗バーの描画 | `state` |

### 認証 / 同期
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `updateAuthStatusDisplay` | 認証状態の表示更新 | `actions`, `state` |
| `updateSyncStatusDisplay` | 同期状態の表示更新 | `actions`, `storage`, `syncLogic`, `state` |

### 進捗 / しおりマーカー
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `updateProgressBarDisplay` | 進捗バー更新と UI 反映 | `state`, `storage`, `reader`, `actions` |
| `renderBookmarkMarkers` | 進捗バー上のしおり描画 | `state`, `storage`, `reader`, `actions` |

### ライブラリ
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `renderLibrary` | ライブラリ一覧描画 | `syncLogic`, `state`, `actions` |
| `filterLibraryCards` | ライブラリの絞り込み | 依存なし |

### 履歴
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `renderHistory` | 履歴描画 | `storage`, `syncLogic`, `state`, `actions` |

### しおり
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `renderBookmarks` | しおり一覧描画 | `storage`, `reader`, `state`, `actions` |

### 目次 / 検索
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `renderToc` | 目次描画 | `state` |
| `renderTocEntries` | 目次の再帰描画 | `reader`, `actions`, `state` |
| `renderSearchResults` | 検索結果描画 | `reader`, `actions` |

### クラウド単独書籍 UI
| 関数 | 役割 | 最小依存 |
| --- | --- | --- |
| `showCloudEmptyState` | クラウドのみ書籍の待機画面表示 | `syncLogic`, `state`, `actions` |
| `hideCloudEmptyState` | 待機画面非表示 | 依存なし |

## 分割後のファイル配置案
依存の最小化と責務分離を優先し、段階的に切り出す前提。

```
assets/js/ui/renderers/
  common.js          // 共通ヘルパー、init、t
  floating-ui.js     // フローティングUI関連
  auth-sync.js       // 認証/同期表示
  progress.js        // 進捗バー・しおりマーカー
  library.js         // ライブラリ描画/フィルタ
  history.js         // 履歴描画
  bookmarks.js       // しおり描画
  toc-search.js      // 目次/検索
  cloud-empty.js     // クラウドのみ書籍 UI
  index.js           // 再エクスポート
```

### `renderers/index.js` の再エクスポート方針
- 各ファイルで `export` した関数を `index.js` で集約する。
- 既存の import 先は `renderers.js` → `renderers/index.js` に置き換える。
- 将来のリファクタ時にツリーシェイクしやすい構成を維持する。

```js
export * from "./common.js";
export * from "./floating-ui.js";
export * from "./auth-sync.js";
export * from "./progress.js";
export * from "./library.js";
export * from "./history.js";
export * from "./bookmarks.js";
export * from "./toc-search.js";
export * from "./cloud-empty.js";
```

## 段階的な分割手順（影響が少ない順）
1. `common.js` へ共通ヘルパー（副作用なし）を切り出す。
2. UI 表示系（`floating-ui.js` / `progress.js`）を切り出し、`index.js` で再エクスポートする。
3. データ参照の強い領域（`library.js` / `history.js` / `bookmarks.js`）を切り出す。
4. 目次/検索とクラウド待機画面を切り出す。
