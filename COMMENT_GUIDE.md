# コメント・ドキュメント規約

本ドキュメントは、コード内のコメントおよびドキュメントの記述規則を定める。
適切なコメントは、AIによる後続の修正においてコードの破壊を防ぐ最重要の防衛線である。

---

## コメントの目的

1. **意図の伝達**: 「何をしているか」ではなく「なぜそうするか」
2. **制約の明示**: 変更してはいけない理由を伝える
3. **依存の記録**: 他のコードとの関係を明示する
4. **将来への引き継ぎ**: 次の修正者（AI含む）への情報提供

---

## ファイルヘッダーコメント

### 必須要素

すべてのソースファイルの先頭に以下を記述する。

```javascript
/**
 * ファイル名.js - 一行での役割説明
 *
 * 詳細な説明（2-3行）
 * このモジュールが担当する責務を記述する。
 *
 * 依存: 外部モジュールへの依存を列挙
 * 参照元: このファイルを使用する側を列挙（主要なもの）
 */
```

### 例

```javascript
/**
 * sync-logic.js - 同期ロジック
 *
 * クラウド同期に関するビジネスロジックを集約する。
 * UIとの連携はコールバック経由で行い、
 * ストレージやクラウド同期インスタンスは初期化時に注入される。
 *
 * 依存: constants.js, i18n.js, elements.js, file-handler.js
 * 参照元: app.js（初期化）, renderers.js（UI描画時）
 */
```

---

## セクション区切りコメント

### 形式

関連する機能をグループ化する際に使用する。

```javascript
// ============================================
// セクション名
// ============================================
```

### 使用例

```javascript
// ============================================
// 定数定義
// ============================================
const MAX_RETRY = 3;
const TIMEOUT_MS = 5000;

// ============================================
// 初期化
// ============================================
let _storage = null;
let _cloudSync = null;

export function init(config) {
  _storage = config.storage;
  _cloudSync = config.cloudSync;
}

// ============================================
// 公開API
// ============================================
export function syncData() { ... }
export function getSyncStatus() { ... }

// ============================================
// 内部ヘルパー
// ============================================
function validateConfig(config) { ... }
function formatTimestamp(ts) { ... }
```

---

## JSDoc コメント

### 関数のドキュメント

```javascript
/**
 * 関数の目的を一行で説明
 *
 * 必要に応じて詳細な説明を追加。
 * 特殊な動作や注意点があればここに記述。
 *
 * @param {型} 引数名 - 引数の説明
 * @param {型} [省略可能な引数] - デフォルト値がある場合
 * @returns {型} 戻り値の説明
 * @throws {Error} 例外が発生する条件
 *
 * @example
 * // 使用例（複雑な関数の場合）
 * const result = functionName(arg1, arg2);
 */
function functionName(arg1, arg2) {
  // ...
}
```

### 実践例

```javascript
/**
 * ライブラリエントリを構築
 *
 * クラウドとローカルのライブラリ情報を統合し、
 * 表示用のエントリリストを生成する。
 * 最終更新日時の降順でソートされる。
 *
 * @param {string} uiLanguage - UI言語コード（"ja" | "en"）
 * @returns {Array<LibraryEntry>} ソート済みのライブラリエントリ
 *
 * @typedef {Object} LibraryEntry
 * @property {string} type - "cloud" | "local"
 * @property {string|null} cloudBookId - クラウドID
 * @property {string|null} localBookId - ローカルID
 * @property {string} title - 書籍タイトル
 * @property {number} progressPercentage - 進捗（0-100）
 */
export function buildLibraryEntries(uiLanguage) {
  // ...
}
```

---

## 警告・注意コメント

### 変更禁止の明示

```javascript
// ⚠️ WARNING: この順序を変更してはならない
// 理由: storageの初期化がcloudSyncより先である必要がある
// 参照: docs/refactor/app-js-boundaries.md
const storage = new StorageService();
const cloudSync = new CloudSync({ storage });
```

### 依存関係の明示

```javascript
// ⚠️ DEPENDENCY: この関数は ui.js の elements.modal に依存
// elements.modal が存在しない場合、早期リターンする
function showModal(content) {
  if (!elements.modal) return;
  // ...
}
```

### 暫定実装の明示

```javascript
// TODO: 暫定実装 - APIv2リリース後に修正予定
// 現在はv1のレスポンス形式を前提としている
// 担当: API更新時に合わせて修正
function parseResponse(data) {
  return data.result; // v2では data.payload になる予定
}
```

---

## 参照元情報の付記（CSSおよびJS）

### CSS用（分割時の安全確保）

```css
/* =====================================
[REF]
- HTML: #viewer 内の img 要素に適用
- JS: reader.js で .zoomed クラスを付与
- STATE: 画像ズーム時のみ有効
- LAYER: z-index: 100（モーダルより下）
- SPLIT: GROUP（.viewer-container と同一ファイル必須）
===================================== */
.viewer-image.zoomed {
  transform: scale(2);
  z-index: 100;
}
```

### JS用（関数の依存明示）

```javascript
/**
 * 進捗バーを更新
 *
 * [REF]
 * - DOM: DOM_IDS.PROGRESS_FILL, DOM_IDS.PROGRESS_THUMB
 * - STATE: _state.pageDirection により RTL/LTR が切り替わる
 * - CALLER: app.js の onProgress コールバックから呼び出し
 */
function updateProgressBar(percentage) {
  // ...
}
```

---

## コメントの禁止事項

### 書いてはいけないコメント

```javascript
// ❌ コードをそのまま言い換えただけ
// iを1増やす
i++;

// ❌ 自明な処理の説明
// 配列をループ
for (const item of items) { ... }

// ❌ 古い情報を残したまま
// このAPIは非推奨（2023年に削除予定）← 実際は2024年で未削除
fetch(OLD_API_URL);
```

### 書くべきコメント

```javascript
// ✅ なぜその処理が必要かを説明
// Safari では passive イベントがデフォルトのため、明示的に指定
element.addEventListener("touchmove", handler, { passive: false });

// ✅ 非自明な値の根拠
// 300ms: iOS Safari のダブルタップ判定を避けるための遅延
const TAP_DELAY = 300;

// ✅ エッジケースの説明
// 空配列の場合は早期リターン（後続の reduce が例外を投げるため）
if (items.length === 0) return null;
```

---

## ドキュメントファイルの作成基準

### 作成が必要な場合

| 状況 | 作成するドキュメント |
|------|----------------------|
| 新規モジュール追加 | 機能マップ（`docs/refactor/モジュール名-map.md`） |
| 複雑な初期化順序 | 境界整理（`docs/refactor/初期化名-boundaries.md`） |
| 分割作業の実施 | 分割計画（作業前）+ 完了報告（作業後） |
| API/インターフェース変更 | 変更履歴（CHANGELOG.md または該当ドキュメント） |

### ドキュメントの基本構造

```markdown
# モジュール名 機能マップ

## 目的
このモジュールの責務を説明

## 依存関係
### 注入される依存
| 依存 | 型 | 用途 |
|------|-----|------|

### 参照するモジュール
- xxx.js: yyy関数を使用

### 参照されるモジュール
- zzz.js: このモジュールのaaa関数を呼び出し

## 公開API
| 関数 | 引数 | 戻り値 | 用途 |
|------|------|--------|------|

## 注意事項
- 変更時の注意点
- 既知の制約
```

---

## コメント更新の義務

### コード変更時のルール

1. **関数の動作を変更したら**、JSDocも更新すること
2. **依存関係を変更したら**、[REF]コメントも更新すること
3. **ファイルの責務を変更したら**、ヘッダーコメントも更新すること
4. **TODOを解消したら**、TODOコメントを削除すること

### 整合性チェック

コードとコメントの不整合は、誤った修正を誘発する最大の原因である。
コメントが古い場合は、**コメントを削除する方がまだ安全**である。

---

## 関連ドキュメント

- [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) - コメント必須の原則
- [MODULE_GUIDE.md](./MODULE_GUIDE.md) - JSDoc型定義の詳細
- [REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md) - 分割時の参照元コメント
