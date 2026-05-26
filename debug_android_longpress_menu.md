# デバッグログ：Android長押し時の画像メニュー表示問題

## 現状の不具合と原因分析
- **不具合内容**: Androidスマホで画像を表示しているとき、ズーム表示しようとして画像を長押しすると、ブラウザ（Chrome for Androidなど）のデフォルト動作として画像のコンテキストメニュー（画像を保存・画像を共有など）が開いてしまい、ズーム操作やドラッグ操作が阻害される。
- **原因**: 
  - 画像要素に対してブラウザ標準 of 長押しメニュー（`contextmenu` イベント）がキャンセル（`preventDefault`）されていない。
  - または CSS で `-webkit-touch-callout: none` や `user-select: none` などの長押し抑制スタイルの適用が漏れている。

## 調査工程
1. `assets/reader.js` のズームハンドラー実装を確認した。
   - `bindElementZoomHandlers(element, getSrc)` (行4683〜) において、`draggable` 属性の無効化と `dragstart` イベントの `preventDefault` は設定されているが、`contextmenu` イベントに対する制御が存在しなかった。
2. 画像書庫ビューアーやEPUB挿絵画像にバインドされているズームイベントのバインド箇所を探した。
   - 画像書庫（`bindImageZoomHandlers`）およびEPUB挿絵（`injectImageZoom`）の両方で `bindElementZoomHandlers` が呼び出されているため、この共通メソッドに修正を加えれば両方の画像表示で対策が有効となる。
3. PWA/CSS側で画像長押しを抑制するCSSが適用されているか確認した。
   - `06-reader-extras.css` の `.image-viewer img` には `user-select: none` や `-webkit-user-drag: none` は設定されていたが、長押しポップアップを抑制する `-webkit-touch-callout: none` は設定されていなかった。また、EPUB内の画像（iframe内）には親CSSが適用されないため、JS側で動的に `webkitTouchCallout = "none"` を設定するのが望ましい。

## 実施した対応
- `assets/reader.js` の `bindElementZoomHandlers` 関数内に、以下の対策コードを追加：
  - 長押し時にブラウザのメニューを開かせないための `contextmenu` イベントの `preventDefault()` 設定。
  - iOS/Android向けに長押しポップアップ（吹き出しメニュー）を抑止する `element.style.webkitTouchCallout = "none"` スタイル適用。
- 変更内容を端末側に即時反映させるため、`assets/constants/pwa.js` および `assets/sw-cache-config.json` のPWAキャッシュバージョンを `bookreader-v21` から `bookreader-v22` に更新。

## ユーザーテスト結果
- (未実施、ユーザーの確認待ち)
