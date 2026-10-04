# プラットフォーム判定改善 デバッグ・作業ログ

このファイルは、プラットフォーム判定（Windows, Android, iPad, Quest3など）の条件見直しと誤判定防止に関する変更履歴とテスト結果を記録するためのものです。
ユーザーが「解決した」と宣言した際に削除されます。

## 行った工程と変更箇所

- [x] プラットフォーム判定ロジックの見直し
  - Windows Chrome/Vivaldi で WebXR API (`'xr' in navigator`) が存在することにより Quest 3 と誤判定されていた不具合を修正。
  - iPadOS 13以降でMacデスクトップ表示されるiPadの判定 (`navigator.maxTouchPoints > 1`) を追加。
- [x] PWAキャッシュバージョンのバンプ（v38からv39へ）
  - ブラウザのService Workerキャッシュ更新をトリガーし、画像D&D除外対応コードを確実に反映させるため。
    - `assets/constants/pwa.js` の `CACHE_NAME` を `bookreader-v39` に更新。
    - `assets/sw-cache-config.json` の `cacheName` を `bookreader-v39` に更新。
- [x] ドラッグ＆ドロップによる画像ファイル・フォルダのライブラリ・履歴・しおり除外対応
  - 仮想ZIPで生成された `File` オブジェクトに `isVirtualImageBook: true` フラグを付与。
  - `handleFile()` での IndexedDB / OPFS へのファイル本体の永続化保存（`saveFile`）をスキップ。
  - `storage.upsertBook()` の実行をスキップし、ライブラリ（本棚）および閲覧履歴への自動登録を完全に防止。
  - `saveCurrentProgress()` をスキップし、閲覧中の進捗パーセンテージがローカルストレージやクラウドに保存・同期されないように制御。
  - `addBookmark()` をスキップし、仮想画像書籍に対するしおりの追加を不可にするようにブロック処理を追加。
- [x] ドラッグ＆ドロップによる単一画像ファイル・画像入りフォルダ対応
  - D&Dハンドラーで `webkitGetAsEntry()` を利用し、ドロップされたファイルやフォルダを再帰的に走査。
  - 対応する画像拡張子（`.png, .jpg, .jpeg, .gif, .webp, .bmp, .avif, .jfif, .heic, .heif, .tiff, .tif`）を自動抽出し、ファイルパス順で自然順ソート。
  - JSZip を用いて無圧縮（`compression: "STORE"`）でオンザフライで仮想ZIPを生成し、既存の電子書籍/画像書庫リーダーの全処理（IndexedDB/OPFS保存、進捗追跡、ライブラリ管理）に透過的に受け渡すように実装。
- [x] Android / iOS / iPad でのファイル選択時におけるカメラ（写真/動画）選択肢の非表示化
  - Quest 3環境のみ `accept` 属性を空（`''`）のままに保ち、高度なシステムピッカーを強制起動。
  - 通常の Android, iPad, iPhone 環境では、`accept` 属性に電子書籍/画像書庫用の拡張子（`.epub,.zip,.cbz,.rar,.cbr`）を指定し、カメラやビデオ録画などの不要な選択肢を自動的に除外。
- [x] `assets/constants/runtime-config.js` のプラットフォーム判定処理の改善
  - iPad判定 (`isIPad`)、iPhone判定 (`isIPhone`) を個別に追加。
  - `PLATFORM_TYPES` に `IPAD` を追加。
  - `detectPlatform()` を見直し、各プラットフォームを正しく判別可能に。
- [x] `assets/js/core/file-picker.js` の `PICKER_MAP` に `IPAD` を追加
- [x] `assets/js/core/pickers/picker-android.js` の `isQuest` 判定から Windows 11 Chrome/Vivaldi 等で誤検知する `hasXR` 等のフォールバックを削除し、`detectPlatform()` の結果のみに依存するようクリーンアップ。
- [x] テストコードの作成と実行による判定精度の確認
  - `scratch/test_platform.js` を作成し、Windows 11 Vivaldi/Chrome、Quest 3、Android、iPad、iPhone、macOS の各 UserAgent とタッチ設定でテストを実行し、すべて合格することを確認。

## テスト結果記録

### 2026-06-08 (プラットフォーム判定精度の検証)
- **テストケースと結果**:
  - Windows 11 Vivaldi UA: `windows` として正しく判定。
  - Quest 3 Oculus Browser UA: `quest3` として正しく判定。
  - Android Chrome UA: `android` として正しく判定。
  - iPad Safari (iPadOS 16) UA + Touch: `ipad` として正しく判定。
  - iPhone Safari UA: `ios` として正しく判定。
  - macOS Desktop Safari UA: `unknown` として正しく判定。
- **結論**: 判定ロジックの改善により、Windows 11 Vivaldi において Quest 3 と誤認識される問題が完全に解消され、iPad等を含む各プラットフォームが確実に判定できるようになった。
