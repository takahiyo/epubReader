# Quest 3 ピッカー改善 デバッグ・テスト記録

## 実装した工程 (2026/06/01)

1. **環境判定の追加**: `assets/constants/runtime-config.js` に `detectPlatform` 関数を追加
2. **ピッカーの分離**: `assets/js/core/pickers/` フォルダを作成し、以下のモジュールを作成
   - `picker-base.js`: 共通の `<input type="file">` 生成ロジック
   - `picker-android.js`: Android向け（クラウドストレージ等のピッカーが開く仕様）
   - `picker-windows.js`: Windows/PC向け（モダンAPI + フォールバック）
   - `picker-quest3.js`: Quest 3専用モーダル
   - `network-loader.js`: FetchAPIを利用した直接ダウンロード機能
3. **ルーター化**: `assets/js/core/file-picker.js` を書き換え、`detectPlatform` に応じて適切なモジュールを呼び出すよう変更
4. **UIの実装**: `index.html` に Quest 3 専用のモーダルUI (`#quest3PickerModal`) と、それに伴う `21-quest3-picker.css` を追加
5. **PWAキャッシュの更新**: `sw-cache-config.json` に新規ファイルを追加

## ユーザーテスト依頼事項

ブラウザ上でPWAを再読み込みし、以下の機能が正常に動作するか確認してください。

- **【Quest 3 実機】**
  - 「開く」ボタンを押すと、専用モーダルが表示されるか
  - ネットワーク取得（FetchAPI）によるファイルダウンロードが可能か（※CORSが許可されているサーバーで）
  - ローカルファイルからの選択（以前の動作）が可能か
  - ライブラリからの選択を押すと、既存の本棚が利用できるか
- **【Android 実機】**
  - 「開く」ボタンを押すと、OSネイティブのピッカー（SAF）が立ち上がり、pCloudやGoogle Driveなどが選択できるか
- **【Windows / PC】**
  - 「開く」ボタンで、従来のOSのファイルピッカーが立ち上がり、ファイルを選択できるか

## テスト結果記録欄

- **Android 端末でのテスト結果 (2026/06/01)**:
  - 現象: 「開く」ボタンを押した際、OSのインテント選択画面で「カメラ」「写真」「ファイル」という選択肢が表示された。
  - 原因: `accept` 属性が空（何でも許可）だったため、Android OSが画像・動画の入力に適したカメラやギャラリーを候補に挙げていた。
  - 対策: `accept` 属性にEPUB、ZIP、CBZなどの具体的な拡張子とMIMEタイプを明示的に指定する。これにより、メディアキャプチャの選択肢（カメラ等）が除外され、直接「ファイル（SAF）」が開くようになる。

## 修正工程 (2026/06/01)

1. `assets/js/core/pickers/picker-android.js` の修正:
   - optionsから `accept` 文字列を生成するロジックを実装。
   - オプション指定が無い場合のデフォルト値として、BookReader対応形式（`.epub`, `.zip`, `.cbz`, `.rar`, `.cbr` 及びMIMEタイプ）を `accept` に設定。

