# デバッグログ：長押しズーム機能の不具合修正

## 現状の不具合と原因分析

1. **EPUB挿絵画像でトグルズームモードに切り替わってしまう / ドラッグによるD&D動作とエラー**
   - **原因**:
     - ブラウザデフォルトの画像ドラッグ＆ドロップ動作（D&D）が発生することで、PointerEvent のドラッグ移動や `pointerup`（指やマウスを離したイベント）がブラウザにインターセプトされ、JS 側にイベントが到達しなくなっていた。
     - このため、長押し後にズーム解除（`endZoom`）する処理が走らず、結果的にズームされたまま（トグルズームモードと同じ）に見えていた。
     - また、画像要素からポインターが外れたり、手前にオーバーレイビューアが表示された際、iframe 側のポインターイベントの捕捉が中断していた。
   - **対策**:
     - 対象 of 画像要素（`img`）に対して `draggable="false"` を明示的に設定し、さらに `dragstart` イベントで `preventDefault()` を実行して、ブラウザ標準の画像ドラッグを完全無効化する。
     - `pointerdown` 時に `element.setPointerCapture(e.pointerId)` を実行し、画像要素の外部にポインターがはみ出したり、手前に要素が描画されたりしても、確実に `pointermove` と `pointerup` を画像要素でキャプチャし続けるようにする。
     - `pointerup` / `pointercancel` または移動による閾値オーバーで長押しが無効化された際には `element.releasePointerCapture(e.pointerId)` を実行してキャプチャを解放する。

2. **画像書庫で長押しズームも通常ズームも起動しない**
   - **原因**:
     - 単ページおよび見開きの描画関数（`renderSinglePageWithStyle` / `renderSpreadPage`）の中で、`this.type !== BOOK_TYPES.EPUB` (つまり画像書庫)のとき、画像要素（および見開きコンテナ）に対して `pointer-events = "none";` が強制設定されていた。これにより、画像要素そのものがマウスやタッチなどの全ての Pointer イベントを完全に無視する（イベントが突き抜ける）ようになっており、画像要素に付与した長押しズーム用イベントハンドラーが一切発火していなかった。
     - また、見開きモード時に新しく動的生成される `img` 要素群（`spread-left`, `spread-right`, `single-view`）に対して、`bindElementZoomHandlers` によるズームバインド処理が実行されていなかった。
   - **対策**:
     - 描画関数内の `pointer-events = "none";` 設定をすべて削除する。
     - `bindImageZoomHandlers` の対象を単一の `this.imageElement` だけでなく、`this.imageViewer.querySelectorAll("img")` で動的生成された画像も含むよう拡張し、バインド時に `img.style.pointerEvents = "auto"` を明示的に設定する。
     - `renderSinglePageWithStyle` および `renderSpreadPage` の描画完了処理の末尾で、`this.bindImageZoomHandlers()` を毎回呼び出し、常に新しく生成された画像に対しても漏れなくイベントをバインドするようにする。

3. **画像書庫およびEPUB挿絵画像の上において常にカーソルがズームルーペ（`zoom-in`）の形状になる**
   - **原因**:
     - 画像書庫の画像を表示するクラス `.image-viewer img` 、見開き画像 `.image-viewer .spread-page` 、およびEPUB挿絵画像への動的ズーム適用処理の中で、通常ホバー時のカーソルに `cursor: zoom-in;` が設定されていた。長押しによるシームレスズームを使用する場合、通常ホバー時に虫眼鏡カーソルになるのは不自然（通常のクリック・タップは「ページめくり」であるため混乱を生む）だった。
   - **対策**:
     - 画像書庫用のCSSファイルの該当箇所、および `reader.js` 内の `injectImageZoom` で動的付与されるカーソル指定を `cursor: default;` に変更。なお、ズーム開始後（`.is-zoomed` / `.is-dragging`）はすでに `cursor: grab / grabbing` に変化する挙動が定義されており、ズーム中の直感的なドラッグ操作感は維持される。

4. **長押しズーム時のドラッグによるスクロールが直感的でない（グリップドラッグ方式）**
   - **原因**:
     - 従来の長押しズームでは、指やマウスで画像を「つかんで引きずる」方式（通常のパン動作）で位置を変更していた。しかし、PerfectViewerのルーペ機能のように、「画面上でのマウス/指の相対位置に応じてズームの注視点がシームレスに追随する」挙動のほうが、ルーペのコンセプトに合致しており、操作の負荷も少ない。
   - **対策**:
     - `bindElementZoomHandlers` 内の `onPointerMove` の挙動を修正し、アクティブビューアに対するポインターの相対位置（$px, py \in [0, 1]$）を基準に、ズーム後画像の左上位置（`panX, panY`）を直接マッピングする計算式に変更。
     - `panX = (containerWidth - scaledWidth) * px` のように、絶対的な座標マッピングを行うことで、ポインターを右に移動させると画像の右側の領域にズームが当たり、左に戻すと左側に戻るという「ルーペ追随機能（絶対位置指定）」を実現。通常ズームモード（トグル拡大）時は従来の「グリップドラッグ方式」をそのまま残す。

5. **EPUB挿絵の一時ズーム中、注視点が左上に固定されてしまい右や下を表示できない**
   - **原因**:
     - EPUBの一時ズーム（`isEpubTemporaryZoom = true`）は裏側で画像書庫用の `#imageViewer` / `this.imageElement` を流用しているが、アプリの内部状態 `this.isImageBook()` が `false` であるため、`getActiveViewer()` および `getZoomTarget()` が本来の `#imageViewer` や `this.imageElement` ではなく `#viewer` （EPUB表示用エリア）を返してしまっていた。このため、ビューアーサイズや画像の実サイズの算出が破綻し、ポインター相対位置に基づくパン計算（`panX`, `panY`）が機能せず、常に左上に固定されてしまっていた。
   - **対策**:
     - `getActiveViewer()` と `getZoomTarget()` の条件分岐に `this.isEpubTemporaryZoom` が有効である場合を追加し、一時ズーム中も画像書庫モード同様に正しい要素とサイズ情報を返却できるように修正。

6. **EPUBのページめくりモード（パジネーションモード）の時に長押しズームが起動しない**
   - **原因**:
     - ページめくりモードの時は、リーダー画面全体を覆う透明な `.click-overlay` 要素（めくりやメニュー開閉のクリックを検知する要素）が `display: block` 状態で前面に重なっている（スクロールモードの時は非表示）。このため、画像要素に登録された `pointerdown` などのポインターイベントが前面の `.click-overlay` に全て遮断され、背後にある画像に一切届いていなかった。
   - **対策**:
     - `bindZoomEvents()` において、最前面の `.click-overlay` に対する `pointerdown` リスナーを追加。
     - クリック/タッチ時に、一時的に `.click-overlay` の `pointer-events` を `none` に切り替え、`document.elementFromPoint` を使ってポインター直下にある真の要素を特定。
     - 真下の要素が `IMG` または `image` であった場合は、その要素に対して `new PointerEvent('pointerdown', e)` を作成して直接 `dispatchEvent`（イベントのフォワーディング）を行い、本来のめくり動作を `preventDefault()` でキャンセルする。
     - 画像へ転送された `pointerdown` によって画像側で `setPointerCapture` が走り、その後の `pointermove` や `pointerup` も画像側で正しくキャッチできるようになる。通常クリック（長押ししなかった場合）はフォワーディングされてもバブリングするため、通常通りページめくりやメニュー開閉として処理される。

## 修正工程と実施した対応

### 工程 1: 画像書庫へのバインダー呼び出し追加
- `reader.js` の `ReaderController` コンストラクタに `this.bindImageZoomHandlers();` を追加。

### 工程 2: ポインターキャプチャとD&D防止の適用
`bindElementZoomHandlers` の中に以下の変更を適用：
1. 画像要素に対し `draggable="false"` の付与、および `dragstart` の `preventDefault` 登録。
2. `onPointerDown` に `element.setPointerCapture(e.pointerId)` を追加。
3. `onPointerMove` の移動量チェックでの無効化時に `element.releasePointerCapture(e.pointerId)` を追加。
4. `onPointerUp` の開始時に `element.releasePointerCapture(e.pointerId)` を追加。

### 工程 3: 画像書庫における pointer-events: none の削除と動的バインドの拡張
- `renderSinglePageWithStyle` から `pointerEvents = "none"` 設定を削除し、末尾に `this.bindImageZoomHandlers()` を呼ぶように追加。
- `renderSpreadPage` の見開きコンテナ、ワイド画像、左右 of 画像、単一画像それぞれに適用されていた `pointerEvents = "none"` 設定をすべて削除。
- `renderSpreadPage` の末尾に `this.bindImageZoomHandlers()` を呼ぶように追加.
- `bindImageZoomHandlers` メソッドを拡張し、`this.imageViewer` 内のすべての `img` 要素に対して `pointerEvents = "auto"` の適用とズームハンドラーの自動バインドを実行するように変更。

### 工程 4: 画像書庫通常時のカーソル形状の修正
- `06-reader-extras.css` において、`.image-viewer img` および `.image-viewer .spread-page` の `cursor: zoom-in;` 設定を `cursor: default;` に変更。

### 工程 5: EPUB挿絵のカーソル形状の修正とルーペ追随機能の追加
- `reader.js` の `injectImageZoom()` 内で、EPUB挿絵画像に付与される `img.style.cursor = "zoom-in";` を `img.style.cursor = "default";` に変更。
- `bindElementZoomHandlers` 内の `onPointerMove` の一時ズーム中の処理を、つかんで引きずる挙動から、ポインターのコンテナ相対位置に基づいた絶対座標マッピング方式（ルーペ追随方式）に変更。

### 工程 6: EPUB挿絵一時ズーム時の座標算出修正とパジネーションモード時のイベント転送追加
- `getActiveViewer()` および `getZoomTarget()` が一時ズーム中（`this.isEpubTemporaryZoom`）に正しい画像ビューアー関連要素を返すよう修正。
- `bindZoomEvents()` 内で、`.click-overlay` を透過して真下の画像要素へ `pointerdown` をフォワーディングする仕組みを追加。ページめくりモード時の画像長押しズームを可能にした。

### 工程 7: PWAキャッシュバージョンの更新
- `sw-cache-config.json` および `constants/pwa.js` のキャッシュバージョンを `bookreader-v20` にバンプ。

## ユーザーテスト結果（次回記述用）
- Epub: ページめくりモード動作、および一時ズーム時の追随不具合 修正済み。確認待ち。
- 画像書庫: 対応完了（確認済み）。
