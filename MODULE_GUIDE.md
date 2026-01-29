# モジュール化・依存注入ガイド

本ドキュメントは、コードをモジュール化し、依存関係を安全に管理するための実践方法を定める。

---

## モジュール化の目的

1. **機能の独立性**: 各モジュールが単一の責務を持つ
2. **依存関係の明示**: 何が何に依存しているかが明確
3. **安全な変更**: 一部の変更が全体に波及しない
4. **テスト容易性**: モジュール単位でテスト可能

---

## 依存注入パターン

### 基本形：init(config) パターン

モジュールは外部依存を `init()` 関数で受け取る。

```javascript
/**
 * sync-logic.js - 同期ロジック
 * 
 * 外部依存はinit()で注入される。
 * 直接importによるグローバル依存は最小限にする。
 */

// 注入されるオブジェクト（モジュールスコープ）
let _storage = null;
let _cloudSync = null;
let _callbacks = {};

/**
 * モジュールの初期化
 * @param {Object} config - 設定オブジェクト
 * @param {Object} config.storage - ストレージサービス
 * @param {Object} config.cloudSync - クラウド同期サービス
 * @param {Object} config.callbacks - UIコールバック群
 */
export function init(config) {
  _storage = config.storage;
  _cloudSync = config.cloudSync;
  _callbacks = config.callbacks ?? {};
}

/**
 * 同期実行（注入された依存を使用）
 */
export async function syncData() {
  if (!_storage || !_cloudSync) {
    throw new Error("モジュールが初期化されていません");
  }
  // _storage, _cloudSync を使用した処理
}
```

### 呼び出し側（初期化の実行）

```javascript
// app.js - アプリケーションのエントリポイント
import * as syncLogic from "./sync-logic.js";
import { StorageService } from "./storage.js";
import { CloudSync } from "./cloudSync.js";

// 依存オブジェクトの生成
const storage = new StorageService();
const cloudSync = new CloudSync();

// モジュールの初期化（依存の注入）
syncLogic.init({
  storage,
  cloudSync,
  callbacks: {
    onSyncComplete: () => updateUI(),
    onSyncError: (err) => showError(err),
  },
});
```

---

## 初期化順序の重要性

### 依存グラフの把握

初期化には順序がある。依存される側から先に初期化する。

```
storage（依存なし）
    ↓
cloudSync（storageに依存）
    ↓
syncLogic（storage, cloudSyncに依存）
    ↓
ui（syncLogicに依存）
    ↓
renderers（storage, syncLogic, uiに依存）
```

### 初期化順序の記述例

```javascript
// app.js - 初期化セクション

// ============================================
// Phase 1: 基盤サービス（依存なし）
// ============================================
const storage = new StorageService(STORAGE_KEY);
const settings = storage.getSettings();

// ============================================
// Phase 2: 外部連携（storageに依存）
// ============================================
const cloudSync = new CloudSync();
cloudSync.init({ storage });

// ============================================
// Phase 3: ビジネスロジック（複数に依存）
// ============================================
syncLogic.init({
  storage,
  cloudSync,
  checkAuthStatus,
  callbacks: { ... },
});

// ============================================
// Phase 4: UI層（全てに依存）
// ============================================
const ui = new UIController();
renderers.init({
  storage,
  syncLogic,
  ui,
  state: appState,
  actions: appActions,
});
```

---

## モジュール境界の設計

### 単一責務の原則

各モジュールは1つの責務を持つ。

```
✅ 良い分割：
storage.js      → データ永続化のみ
cloudSync.js    → クラウド通信のみ
sync-logic.js   → 同期判断ロジックのみ
renderers.js    → UI描画のみ

❌ 悪い分割：
utils.js        → 雑多な関数の集合
helpers.js      → 何でも入りのファイル
```

### 循環依存の禁止

A → B → A のような循環依存を作ってはならない。

```javascript
// ❌ 循環依存（禁止）
// a.js
import { funcB } from "./b.js";
export function funcA() { funcB(); }

// b.js
import { funcA } from "./a.js";  // 循環！
export function funcB() { funcA(); }

// ✅ 解決策：共通モジュールに抽出、またはコールバックで解決
// a.js
export function funcA(callback) { callback(); }

// b.js
import { funcA } from "./a.js";
export function funcB() { ... }
funcA(funcB);  // コールバックとして渡す
```

---

## インターフェース定義

### JSDoc型定義の活用

モジュールが期待する依存の形をJSDocで明示する。

```javascript
/**
 * @typedef {Object} StorageInterface
 * @property {Object} data - 内部データ
 * @property {function(string): Object} getProgress - 進捗取得
 * @property {function(string, Object): void} setProgress - 進捗設定
 * @property {function(): Object} getSettings - 設定取得
 */

/**
 * @typedef {Object} SyncLogicConfig
 * @property {StorageInterface} storage - ストレージサービス
 * @property {Object} cloudSync - クラウド同期サービス
 * @property {function(): Object} checkAuthStatus - 認証確認関数
 */

/**
 * @param {SyncLogicConfig} config
 */
export function init(config) {
  // ...
}
```

### 最小インターフェースの原則

モジュールは必要最小限の依存だけを要求する。

```javascript
// ❌ 過剰な依存（storage全体を要求）
function formatProgress(storage) {
  return storage.getProgress(bookId).percentage + "%";
}

// ✅ 最小限の依存（必要な値だけを要求）
function formatProgress(percentage) {
  return percentage + "%";
}
```

---

## 新規モジュール追加の手順

### 1. 責務の明確化

```markdown
## 新モジュール: notification.js
- 責務: ユーザー通知の表示
- 依存: ui.js（DOM操作）, i18n.js（メッセージ）
- 公開API: show(), hide(), showError()
```

### 2. インターフェース設計

```javascript
/**
 * notification.js - 通知モジュール
 * 
 * 依存: init()で注入
 * - elements: DOM要素への参照
 * - t: 翻訳関数
 */

let _elements = null;
let _t = null;

/**
 * @param {Object} config
 * @param {Object} config.elements - DOM要素
 * @param {function(string): string} config.t - 翻訳関数
 */
export function init(config) {
  _elements = config.elements;
  _t = config.t;
}
```

### 3. 初期化順序への組み込み

```javascript
// app.js の初期化セクションに追加

// ============================================
// Phase 4: UI層
// ============================================
notification.init({
  elements: ui.elements,
  t: (key) => t(key, uiLanguage),
});
```

### 4. 依存グラフの更新

既存の依存関係ドキュメントがあれば更新する。

---

## 依存関係のドキュメント化

### 機能マップの作成

新規モジュールまたは大きな変更時は、依存関係を文書化する。

```markdown
# notification.js 機能マップ

## 依存注入（init で受け取る）
| 依存 | 型 | 用途 |
|------|-----|------|
| elements | Object | DOM要素への参照 |
| t | Function | 翻訳関数 |

## 公開API
| 関数 | 引数 | 戻り値 | 用途 |
|------|------|--------|------|
| init | config | void | 初期化 |
| show | message, type | void | 通知表示 |
| hide | - | void | 通知非表示 |

## 他モジュールからの参照
- app.js: エラー発生時に show() を呼び出し
- sync-logic.js: 同期完了時に show() を呼び出し
```

---

## トラブルシューティング

### 「undefined」エラーが発生する場合

1. `init()` が呼ばれているか確認
2. 初期化順序が正しいか確認
3. 必要な依存がすべて渡されているか確認

### モジュールの変更が反映されない場合

1. キャッシュのクリア
2. インポートパスの確認
3. バレルファイル（index.js）の再エクスポート確認

---

## 関連ドキュメント

- [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) - 基本原則
- [REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md) - モジュール分割時の安全手順
- [COMMENT_GUIDE.md](./COMMENT_GUIDE.md) - JSDoc記述規則
