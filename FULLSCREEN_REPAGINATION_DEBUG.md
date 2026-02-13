# 全画面切替時のリペジネーション修正 - トラブルシューティング記録

## 問題
全画面（Fullscreen API）切替時にEPUBの文章量再計算（リペジネーション）が失敗する。

## 試行 1: fullscreenchange で debouncedResizeHandler() を呼ぶ (commit 330a5f0)

### 変更内容
```javascript
document.addEventListener('fullscreenchange', () => {
  updateFullscreenButtonLabel();
  debouncedResizeHandler();
});
```

### 結果: 失敗 — PaginationCancelledError

### 原因分析
`fullscreenchange` はビューポート変更**前**に発火する。そのため:

1. T=0ms: `fullscreenchange` 発火 → `debouncedResizeHandler()` 呼び出し（タイマー開始）
2. T=0+ε: `window.resize` 発火 → `ui.js` デバウンス開始 (250ms)
3. T=250ms: debouncedResizeHandler タイマー発火 → `handleResize(requestId=1)` 開始
4. T=250+ε: ui.js デバウンス発火 → `onResize` → `debouncedResizeHandler()` 再呼び出し（タイマーリセット）
5. T=500ms: debouncedResizeHandler タイマー発火 → `handleResize(requestId=2)` 開始 → requestId=1 をキャンセル

2重トリガーにより、先のリペジネーションが必ずキャンセルされる。

### コンソール証跡
```
// Enter fullscreen:
app.js:495 [onResize] handleResize (debounced 250ms)              ← fullscreenchange経由
reader.js:399 handleResize: リペジネーション開始 (requestId=1)
ui.js:79 Window resized: 2005x1440                                 ← window.resize発火
app.js:495 [onResize] handleResize (debounced 250ms)               ← window.resize経由
reader.js:399 handleResize: リペジネーション開始 (requestId=2)       ← requestId=1キャンセル
reader.js:444 handleResize: リペジネーション失敗 PaginationCancelledError

// Exit fullscreen:
app.js:495 [onResize] handleResize (debounced 250ms)
reader.js:399 handleResize: リペジネーション開始 (requestId=3)       ← requestId=2キャンセル
reader.js:444 handleResize: リペジネーション失敗 PaginationCancelledError
ui.js:79 Window resized: 713x578
app.js:495 [onResize] handleResize (debounced 250ms)
reader.js:399 handleResize: リペジネーション開始 (requestId=4)       ← requestId=3キャンセル
reader.js:444 handleResize: リペジネーション失敗 PaginationCancelledError
```

### 調査結果
- [x] `updateEpubTheme` は `repaginate()` を呼ばない（CSS適用のみ）
- [x] `EpubPaginator.runPagination()` が前の実行を `cancelled=true` でキャンセルする仕組み
- [x] `fullscreenchange` からの呼び出しは有害（`window.resize`と2重トリガーになる）
- [x] 解決策: `fullscreenchange`では`window.resize`未発火時のみフォールバック

---

## 試行 2: requestAnimationFrame + resize未発火フォールバック

### 変更内容
```javascript
let prevInnerWidth = window.innerWidth;
let prevInnerHeight = window.innerHeight;
document.addEventListener('fullscreenchange', () => {
  updateFullscreenButtonLabel();
  requestAnimationFrame(() => {
    const widthChanged = window.innerWidth !== prevInnerWidth;
    const heightChanged = window.innerHeight !== prevInnerHeight;
    prevInnerWidth = window.innerWidth;
    prevInnerHeight = window.innerHeight;
    if (widthChanged || heightChanged) {
      return; // window.resize が発火するはず → そちらに任せる
    }
    debouncedResizeHandler(); // resize 未発火時のフォールバック
  });
});
```

### 方針
- `window.resize` が発火する（ビューポートサイズ変更あり）場合: 既存の ui.js → onResize → debouncedResizeHandler パスに任せる
- `window.resize` が発火しない場合のみ: フォールバックとして debouncedResizeHandler を呼ぶ
- `requestAnimationFrame` でビューポート変更確定後にチェック

### 結果: (テスト待ち)

---
