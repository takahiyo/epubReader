# SSOT（Single Source of Truth）実践ガイド

本ドキュメントは、コード内の定数・設定値・識別子を一元管理するための具体的な実践方法を定める。

---

## SSOTとは

**「すべての情報は唯一の場所で定義され、他はそこを参照する」** という原則。

```
❌ 悪い例：同じ値が複数箇所に存在
  app.js:    const API_URL = "https://api.example.com";
  sync.js:   const API_URL = "https://api.example.com";
  config.js: const API_URL = "https://api.example.com";

✅ 良い例：一箇所で定義し、他は参照
  constants/api.js: export const API_URL = "https://api.example.com";
  app.js:    import { API_URL } from "./constants/api.js";
  sync.js:   import { API_URL } from "./constants/api.js";
```

---

## SSOT化の対象

### 必須（絶対にSSOT化する）

| カテゴリ | 例 | 理由 |
|----------|-----|------|
| URL・エンドポイント | API URL, CDN パス | 環境変更時に一括修正が必要 |
| DOM ID・セレクタ | `#viewer`, `.modal` | HTML変更時に不整合が発生 |
| 設定値・閾値 | タイムアウト秒数, 上限値 | 調整時に漏れが発生 |
| 状態を表す文字列 | `"loading"`, `"error"` | タイポによるバグの温床 |
| ファイルパス | アセットパス, 出力先 | 構成変更時に追従が必要 |

### 推奨（SSOT化が望ましい）

| カテゴリ | 例 | 判断基準 |
|----------|-----|----------|
| UI表示文字列 | ボタンラベル, メッセージ | 多言語対応の可能性があれば |
| CSSクラス名 | `.active`, `.hidden` | JS/CSSの両方で使用する場合 |
| イベント名 | カスタムイベント | 複数ファイルで発火/購読する場合 |

### 例外（SSOT化不要）

| カテゴリ | 例 | 理由 |
|----------|-----|------|
| ローカル変数 | ループカウンタ | 関数内で完結 |
| 一時的な計算値 | 中間結果 | 再利用しない |
| 標準的な値 | `true`, `false`, `0`, `1` | 変更の可能性がない |

---

## 定数ファイルの構成パターン

### パターン1：カテゴリ別ファイル + バレル（推奨）

```
constants/
├── index.js          # 再エクスポート（バレル）
├── api.js            # API関連
├── ui.js             # UI関連（DOM ID, クラス名）
├── storage.js        # ストレージ関連
├── timing.js         # タイミング関連（タイムアウト等）
└── formats.js        # フォーマット関連（MIME, 拡張子）
```

```javascript
// constants/index.js（バレルファイル）
export * from "./api.js";
export * from "./ui.js";
export * from "./storage.js";
export * from "./timing.js";
export * from "./formats.js";
```

**利点**:
- カテゴリごとに探しやすい
- 必要な定数だけインポート可能
- 既存インポートを壊さずに分割可能

### パターン2：単一ファイル（小規模プロジェクト向け）

```javascript
// constants.js
export const API_URL = "...";
export const DOM_IDS = { ... };
export const TIMEOUTS = { ... };
```

**利点**: シンプル
**欠点**: 肥大化すると管理困難

---

## 定数の命名規則

### 基本規則

```javascript
// 単一値：UPPER_SNAKE_CASE
export const API_TIMEOUT_MS = 5000;
export const MAX_RETRY_COUNT = 3;

// 関連する値のグループ：オブジェクトでまとめる
export const THEME_MODES = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
});

// DOM ID・セレクタ：用途別オブジェクト
export const DOM_IDS = Object.freeze({
  VIEWER: "viewer",
  MODAL: "modal",
});

export const DOM_SELECTORS = Object.freeze({
  ACTIVE_ITEM: ".item.active",
  ALL_BUTTONS: "button[data-action]",
});
```

### Object.freeze() の使用

オブジェクト形式の定数は `Object.freeze()` で保護する。

```javascript
// ✅ 良い：変更を防止
export const STATES = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
});

// ❌ 悪い：後から変更可能になってしまう
export const STATES = {
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
};
```

---

## 定数追加時の手順

### 1. 既存定数の確認

```bash
# 既存の定数ファイルを確認
cat constants/index.js
cat constants/*.js

# 同じ値が既に存在しないか検索
grep -r "追加したい値" src/ assets/
```

### 2. 適切なカテゴリの選択

| 追加する定数 | 配置先 |
|--------------|--------|
| API URL, エンドポイント | `constants/api.js` |
| DOM ID, CSSクラス | `constants/ui.js` |
| タイムアウト, 間隔 | `constants/timing.js` |
| MIME, 拡張子 | `constants/formats.js` |
| 新カテゴリ | 新ファイル作成 + index.js更新 |

### 3. 定数の追加

```javascript
// constants/timing.js に追加する例

// ============================================
// 自動保存タイミング（新規追加）
// ============================================
/** 自動保存のデバウンス間隔（ミリ秒） */
export const AUTO_SAVE_DEBOUNCE_MS = 2000;
```

### 4. 利用側の更新

```javascript
// 利用側ファイル
import { AUTO_SAVE_DEBOUNCE_MS } from "./constants.js";

// 使用
setTimeout(save, AUTO_SAVE_DEBOUNCE_MS);
```

---

## ハードコーディングの発見と修正

### 発見方法

```bash
# マジックナンバーの検索
grep -rn "[0-9]\{3,\}" src/ --include="*.js" | grep -v "constants"

# 文字列リテラルの検索（DOM操作）
grep -rn 'getElementById\|querySelector' src/ --include="*.js"

# 直接書かれたURLの検索
grep -rn 'http://\|https://' src/ --include="*.js" | grep -v "constants"
```

### 修正パターン

```javascript
// Before: ハードコーディング
document.getElementById("viewer").classList.add("active");
setTimeout(callback, 5000);

// After: 定数参照
import { DOM_IDS, UI_CLASSES, TIMEOUTS } from "./constants.js";
document.getElementById(DOM_IDS.VIEWER).classList.add(UI_CLASSES.ACTIVE);
setTimeout(callback, TIMEOUTS.DEFAULT_MS);
```

---

## SSOT監査チェックリスト

定期的に以下を確認すること。

### コード内のハードコーディング

- [ ] URL・エンドポイントが直接書かれていないか
- [ ] DOM ID・セレクタが文字列リテラルで書かれていないか
- [ ] タイムアウト値が数値リテラルで書かれていないか
- [ ] 状態文字列（`"loading"` 等）が直接書かれていないか

### 定数ファイルの健全性

- [ ] 同じ値が複数の定数に定義されていないか
- [ ] 未使用の定数が残っていないか
- [ ] オブジェクト定数に `Object.freeze()` が適用されているか
- [ ] 各定数にコメント（用途説明）があるか

### バレルファイルの整合性

- [ ] 新規追加したファイルが `index.js` で再エクスポートされているか
- [ ] 削除したファイルが `index.js` から除去されているか

---

## 関連ドキュメント

- [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) - 基本原則
- [COMMENT_GUIDE.md](./COMMENT_GUIDE.md) - 定数へのコメント付与規則
