# ズーム操作不能 デバッグ追跡記録

## 症状
- ズームボタン、ズームスライダーは正常動作
- ズーム中のメニュー非表示・無効化も正常
- ズーム中のホイール操作によるズーム倍率変更が効かない
- ズーム中のドラッグ/スワイプによるパン操作が効かない
- Consoleを見る限り、クリック自体を受け付けていない

## 試行済み修正（全て効果なし）

### 試行1: click-overlay の pointer-events 変更 (commit 544b8ec)
- `body.is-zoomed .click-overlay { pointer-events: none }` → `pointer-events: all`
- cursor: grab, touch-action: none 追加
- body.is-dragging .click-overlay { cursor: grabbing } 追加
- **結果**: 効果なし

### 試行2: imageViewer overflow 変更 (commit 544b8ec)
- `#imageViewer.zoomed { overflow: auto }` → `overflow: hidden`
- **結果**: 効果なし

### 試行3: float-backdrop の pointer-events 追加 (commit 07c1e91)
- `body.is-zoomed #floatOverlay .float-backdrop` に `pointer-events: none !important` 追加
- **結果**: 効果なし

### 試行4: isEventInReaderArea() を座標ベースに変更 (commit 07c1e91)
- `reader.contains(event.target)` → clientX/clientY による矩形判定
- **結果**: 効果なし

### 試行5: 診断ログ追加 + app.js wheelハンドラ修正 (現在)
- reader.js: wheel/mousedown/toggleZoom/applyTransform に `[ZOOM-DIAG]` ログ追加
- app.js: wheelハンドラにズーム中の早期return追加（event.preventDefault()の干渉を排除）
- **結果**: テスト待ち

## 完了済み調査

### z-index レイヤー構造（全確認済み）
```
z-index 10000: #modalOverlay (display: none, モーダル開時のみ表示)
z-index 10000: #toggleZoom, .zoom-slider-container（ズームUI, pointer-events: auto）
z-index  2000: #loadingOverlay (visibility: hidden; pointer-events: none)
z-index  1600: .float-buttons (pointer-events: none ← ベースCSS)
z-index   900: #floatOverlay (position: fixed; inset: 0)
                ├── .float-backdrop (inset: 0, pointer-events: none !important)
                ├── .float-title (pointer-events: none !important)
                ├── .float-buttons (pointer-events: none)
                │   ├── .float-main-menu (display: none !important)
                │   ├── .float-settings (display: none !important)
                │   ├── .float-top-right (display: none !important)
                │   ├── .font-buttons (display: none !important)
                │   ├── #toggleTheme (display: none !important)
                │   ├── #toggleFullscreen (opacity: 0, pointer-events: none !important)
                │   ├── #toggleZoom (pointer-events: auto !important) ← 意図的
                │   ├── .zoom-slider-container (pointer-events: auto) ← 意図的
                │   └── #openLangMenu (display: none !important)
                └── #floatProgress (display: none !important)
z-index   110: #bookmarkMenu (display: none !important in zoom)
z-index   100: #leftMenu (display: none !important in zoom)
z-index    99: #leftMenuBackdrop (.menu-backdrop, display: none !important in zoom)
z-index    90: #progressBarPanel (display: none !important in zoom)
z-index    85: #progressBarBackdrop (.menu-backdrop, display: none !important in zoom)
z-index    10: #fullscreenReader (position: fixed; inset: 0)
                ├── #viewer (.hidden = display: none !important) ← CBZモード
                ├── #clickOverlay (display: none) ← viewerがvisibleでないため
                └── #imageViewer (visible, pointer-events: auto ← デフォルト)
                    └── #pageImage (inline pointer-events: none)
```

### CSS pointer-events（全確認済み）
- [x] #floatOverlay: `pointer-events: none !important` (body.is-zoomed)
- [x] .float-backdrop: `pointer-events: none !important` (body.is-zoomed)
- [x] .float-title: `pointer-events: none !important` (body.is-zoomed)
- [x] .float-buttons コンテナ: `pointer-events: none` (ベースCSS)
- [x] .float-buttons > *:not(#toggleZoom): `pointer-events: none` + 個別display:none
- [x] #floatProgress: `display: none !important` (body.is-zoomed)
- [x] .click-overlay: `pointer-events: all !important` (body.is-zoomed) ← ただしdisplay:none
- [x] #imageViewer: `pointer-events: auto` (デフォルト) ← イベントターゲットになるべき
- [x] #pageImage: `pointer-events: none` (inline) ← イベントは#imageViewerへ
- [x] #loadingOverlay: `pointer-events: none` (ベースCSS) ← 影響なし
- [x] #modalOverlay: `display: none` (ベースCSS) ← モーダル閉時は非表示

### JS イベントハンドラ構造（全確認済み）
- [x] bindPanEvents(): reader.js — **document** レベルにmousedown/mousemove/mouseup
- [x] bindZoomEvents(): reader.js — **document** レベルにwheel
- [x] app.js: **#fullscreenReader** レベルにwheel（ページ送り用）
  - ⚠️ ズーム中でもevent.preventDefault()を呼んでいた（修正済み: 早期return追加）
- [x] ui.js click handler: document レベル、ズーム中は早期return（正常）
- [x] ui.js setupZoomExitHandlers: capture:true click、特定ボタンのみ対象
- [x] toggleZoom(): imageZoomed=true, body.is-zoomed追加, syncZoomedClass呼び出し
- [x] isEventInReaderArea(): 座標ベース（fullscreenReaderの矩形判定）
- [x] setZoomLevel(): zoomScale更新 → updateTransform() → applyTransform()
- [x] applyTransform(): target.style.transform設定（getZoomTarget()が返す要素）

### inline style 設定箇所（全確認済み）
- [x] reader.js: imageElement.style.pointerEvents = "none" (pageImage)
- [x] reader.js: container.style.pointerEvents = "none" (spread container)
- [x] ui.js: overlay.style.pointerEvents (clickOverlay操作、display:none要素)

### キャプチャフェーズハンドラ（全確認済み）
- [x] ui.js:97-109: capture:true click on document → ズーム中のみ、特定セレクタのみ
  → wheel/mousedownには影響なし

## 診断ログの読み方

### ズーム切替時
```
[ZOOM-DIAG] toggleZoom called, current imageZoomed: false
[ZOOM-DIAG] toggleZoom: turning ON
[ZOOM-DIAG] toggleZoom ON complete: { imageZoomed: true, bodyIsZoomed: true, zoomScale: 1 }
```

### ホイール操作時（期待される出力）
```
[ZOOM-DIAG] app.js wheel on fullscreenReader: { target: "...", imageZoomed: true }
[ZOOM-DIAG] wheel event on document: { target: "...", imageZoomed: true, inReaderArea: true, ... }
[ZOOM-DIAG] wheel: processing zoom { direction: 1, nextScale: 1.1, step: 0.1 }
[ZOOM-DIAG] applyTransform: { targetTag: "IMG#pageImage", transform: "translate(...)scale(1.1)", ... }
```

### マウスドラッグ時（期待される出力）
```
[ZOOM-DIAG] mousedown: { target: "...", imageZoomed: true, inReaderArea: true, isDragging: false }
```

## 仮説
1. **イベントがdocumentに到達していない**: 何かがstopPropagationしている → ログで確認
2. **isEventInReaderAreaがfalseを返す**: fullscreenReaderの矩形外 → ログで確認
3. **imageZoomedがfalse**: toggleZoomが正しく動作していない → ログで確認
4. **applyTransformが呼ばれない**: pendingTransformが固着 → ログで確認
5. **app.jsのevent.preventDefault()が干渉**: ← 修正済み（早期return追加）
6. **ブラウザのpassive制約**: document wheelがpassive扱い → preventDefaultが無効化される場合がある

## 次のステップ
- [ ] ユーザーにデプロイしてもらい、Consoleの[ZOOM-DIAG]ログを確認
- [ ] ログの結果に基づいて、イベントチェーンのどこで途切れているか特定
- [ ] 特定した原因に対するピンポイント修正を実施
