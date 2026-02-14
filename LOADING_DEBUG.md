# EPUB読込のローディング空白問題 - 調査記録

## 症状
- ローディングアニメーション: ~3秒
- 空白画面: 10秒以上
- テキスト表示

## 対処1: hideLoadingをrAFで遅延 (commit 493836d)
**変更**: `finally { requestAnimationFrame(() => hideLoading()) }`
**結果**: 効果なし。rAFが`applyReadingSettings`内の`showLoading()`と競合

## 対処2: hideLoadingをtry/catchに変更 (commit 802e62e)
**変更**: openEpub成功時はhideLoadingを呼ばず、line 896のhideLoadingに統合
**結果**: 効果なし。空白は依然10秒以上

## 根本原因の調査

### フロー分析
```
showLoading()                           ← 860行
await openEpub()                        ← 865行 (~3秒)
  └─ buildPagination() → renderEpubPage → テキストDOMに設定
  └─ locations.generate(1600)           ← 804行 (非await、バックグラウンド)
(hideLoading なし)                      ← 修正済み
await applyReadingState(syncedProgress) ← 890行
  └─ applyReadingSettings(targetWritingMode, targetPageDirection)
       └─ showLoading()                 ← 1857行 (no-op、既に表示中)
       └─ await rAF(setTimeout)         ← 1859行
       └─ await applyReadingDirection() ← 1863行
            └─ 書字方向変更あり？→ 全ページ再計算 (10秒)
       └─ hideLoading()                 ← 1873行
hideLoading()                           ← 896行 (no-op)
```

### 問題箇所特定
`applyReadingState` (app.js:1108-1109):
```javascript
const targetWritingMode = progress?.writingMode || defaultWritingMode;   // HORIZONTAL
const targetPageDirection = progress?.pageDirection || defaultPageDirection; // RTL
```

保存済みの設定がない初回読込時:
- `targetWritingMode` = `defaultWritingMode` = **HORIZONTAL**
- `targetPageDirection` = `defaultPageDirection` = **RTL**

vs. `openEpub`で自動検出された値:
- `reader.writingMode` = 本のCSS(例: **VERTICAL**)
- `reader.pageDirection` = 本のmetadata(例: **RTL**)

**writingModeが一致しない → `applyReadingDirection`が全ページ再計算をトリガー！**

### ローディングが見えない理由(仮説)
`applyReadingSettings`内のshowLoading(1857行)はno-op(既に表示中)。
loading overlayは表示されているはずだが、ユーザーには「空白」に見える。
→ **要検証: loading overlayが実際に表示されているか、console.logで確認**

## 対処3: 不要な再パジネーションを防止 (実装中)
**方針**: `applyReadingState`で、保存済み設定がない場合は自動検出結果をfallbackに使用
**変更箇所**: app.js 1108-1109行
```javascript
// before:
const targetWritingMode = progress?.writingMode || defaultWritingMode;
const targetPageDirection = progress?.pageDirection || defaultPageDirection;

// after:
const targetWritingMode = progress?.writingMode || reader.writingMode || defaultWritingMode;
const targetPageDirection = progress?.pageDirection || reader.pageDirection || defaultPageDirection;
```
**期待効果**: 検出値と同じ → applyReadingDirection line 2357でスキップ → 再パジネーションなし

## 追加対策
- handleResize中にローディング表示 (Issue 1)
- locations.generate(1600)を描画後に遅延実行
- タイミング計測ログ追加
