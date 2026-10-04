# SSOT調査ログ

本ドキュメントはSSOT化の調査で使用したコマンドと、調査結果の整理メモです。

## 調査コマンド

- `rg -n "constants|config" src assets -S`
- `rg -n "getElementById|querySelector|querySelectorAll|\.classList|\"#|\"\." assets/app.js`
- `rg -n "getElementById|querySelector|querySelectorAll|classList|\"#|\"\." assets/ui.js`
- `rg -n -- "--[a-zA-Z0-9-]+" assets/style.css`
- `rg -n "assets/|\.png|\.svg|\.json|\.wasm|\.js" assets/app.js assets/ui.js assets/reader.js assets/storage.js`
- `rg -n "\"(zip|rar|epub|rtl|ltr|vertical|horizontal)\"|\b(zip|rar|epub)\b" assets/app.js assets/ui.js assets/reader.js`

---

## 1. SSOT化の進捗率（再調査）

**現状のSSOT率：おおよそ 88〜90%**

- 主要な設定値、URL、アセットパス、UIクラス、DOM ID/セレクタは `assets/constants.js` に統合済み。
- 一方で、**書籍タイプ・方向・書字モード・MIME判定などの状態系文字列**が複数ファイルに散在しており、これが残差の主因。

---

## 2. Gemini調査とCodex調査の統合サマリ

### Gemini調査（ユーザー提供）
- SSOT率: **約88%**
- 高優先度: DOM ID の定数化 / 状態管理文字列のEnum化
- 中優先度: z-index等のCSS値
- 低優先度: メッセージ置換タグ

### Codex調査（今回の再調査）
- DOM IDは `DOM_IDS` に集約済みで、実装側は概ね移行済み。
- 依然として以下のハードコードが広範に残存:
  - 書籍タイプ: `"epub"`, `"zip"`, `"rar"`, `"image"`
  - 書字モード: `"vertical"`, `"horizontal"`
  - 読書方向: `"rtl"`, `"ltr"`
  - MIME判定: `"application/epub+zip"` など
  - 拡張子判定: `".epub"`, `".zip"`, `".rar"`, `".cbr"`, `".cbz"`
- `assets/constants.js` 内に既存定数があるにもかかわらず、**重複ハードコード**が残る（`MIME_TYPES`, `SUPPORTED_FORMATS`）

### 統合結論
- DOM ID定数化は進展済み。
- **“状態定義（タイプ・方向・モード）”のSSOT化が最優先**。
- 次に、CSS上の数値（z-index・余白など）と、状態/分岐に直結しない表示文言を整理対象にする。

---

## 3. SSOT化の妥当性評価（残存ハードコード）

優先度は **a.概念 / b.定数 / c.使用箇所** の順で判定。

### a. 概念レベル（最優先）
1. **書籍タイプ/読み取り方式の分類**
   - `epub`, `zip`, `rar`, `image` が実質的にアプリのドメイン概念。
   - `BookType`/`ArchiveType` などの統一Enumが未整備。

2. **表示方向・書字モードの概念**
   - `writingMode` と `pageDirection` が複数ファイルで別々に解釈。
   - `WritingMode`, `ReadingDirection` の統一定義が必須。

### b. 定数レベル（高優先）
- MIME / 拡張子 / 判定文字列
  - `MIME_TYPES`, `SUPPORTED_FORMATS` があるのに直接文字列が残存。
- UIラベルキー（`areaPagePrev`, `areaMenuToggle` など）
  - i18nキーであるため、UI定数との整合が必要。

### c. 使用箇所レベル（中〜低優先）
- `style.css` の z-index / opacity 等の数値
- `console.log` や一時的なデバッグ文字列
- DOM操作の一時的な文字列（`"M3"` などのグリッドラベル）

---

## 4. SSOT優先度が低いハードコードのメモ（役割と理由）

| 対象 | 役割 | 低優先度と判断した理由 |
| --- | --- | --- |
| エリアラベル (`"M3"`, `"U3"`, `"B3"`) | クリック領域のローカル識別子 | UIロジック内で完結しており、外部参照がないため。将来変更がある場合はロジック全体で同時更新が前提。 |
| デバッグログ文言 (`console.log`) | 開発時の可視化 | 実稼働動作に影響せず、SSOT化で保守性が大きく向上しない。 |
| `setTimeout` のログ周辺文字列 | 一時メッセージ | i18n対象ではなく、ユーザー表示に影響しない。 |

---

## 5. SSOT化の優先度が高いハードコードのSSOT化計画

影響が少ない順に段階的タスクとして整理。

### フェーズ1（低影響・即時対応）
1. **状態Enumの追加**
   - `BOOK_TYPES`, `WRITING_MODES`, `READING_DIRECTIONS` を `assets/constants.js` に追加。
2. **既存の直書き文字列を置換**
   - `assets/app.js`, `assets/ui.js`, `assets/reader.js` 内の `"epub"`, `"zip"`, `"rar"` 等を `BOOK_TYPES.*` に置換。
   - `"vertical"`, `"horizontal"` を `WRITING_MODES.*` に置換。
   - `"rtl"`, `"ltr"` を `READING_DIRECTIONS.*` に置換。

### フェーズ2（中影響・分岐を整理）
1. **MIME/拡張子の集中管理**
   - `SUPPORTED_FORMATS` と `MIME_TYPES` を参照して判定ロジックを一本化。
   - `getMimeType`, `resolveBookType` のような専用ヘルパーを作成。

### フェーズ3（影響確認が必要）
1. **CSSのz-index等をCSS変数化**
   - `style.css` のz-indexを `:root { --z-modal: ... }` に移行。
2. **UIエリアラベルの定数化**
   - `AREA_LABELS` の導入を検討し、i18nキーとの整合性を検証。

---

## 6. 再精査メモ（重点チェックポイント）

- `assets/app.js`: 書籍タイプ判定と進捗表示ロジックにハードコードが集中。
- `assets/reader.js`: EPUB/画像分岐に多くの文字列が埋め込まれている。
- `assets/ui.js`: 書字モード・方向判定が直書きで存在。

次回の実装では、**フェーズ1を最小差分で実行**し、その後にフェーズ2以降を段階導入する。
