# デバッグログ：EPUB画像の一時ズームが動作しない問題

## 現状の不具合と原因分析
- **不具合内容**: EPUBの挿絵等で長押ししてズームモード（UI上はズームスライダー等が表示される状態）になっても、実際の画像がズームされない。倍率を変更しても標準表示と変わらないまま。
- **原因の仮説**: 
  1. `assets/reader.js` の `injectImageZoom` で、画像要素からURLを取得する際 `() => img.src` を使用しているが、EPUB内の画像が SVG の `<image>` タグで囲まれている場合など、`src` プロパティが `undefined` または空になり、一時ズーム用ビューアー（`#imageViewer`）に正しい画像URLがセットされず何も表示されないため、背後の標準表示のEPUBがそのまま見えている。
  2. ズームされるべき一番手前の `imageElement` が空（透明）であり、背景に見えているEPUB全体がズームされるわけではないため、スライダーを動かしても変化がないように見える。

## 調査工程
1. `assets/reader.js` の `bindElementZoomHandlers` の呼び出し元である `injectImageZoom` および `bindImageZoomHandlers` の実装を確認した。
2. SVG 画像 (`<image>` タグ) の場合は `img.src` ではなく `href` や `xlink:href` からURLを取得する必要がある。

## 実施した対応（予定）
- `injectImageZoom` と `bindImageZoomHandlers` において、`getSrc` 関数を以下のように拡張する：
  ```javascript
  const getSrc = () => img.src || img.getAttribute("href") || img.getAttribute("xlink:href") || img.getAttribute("data-src") || "";
  ```

## ユーザーテスト結果
- (未実施)
