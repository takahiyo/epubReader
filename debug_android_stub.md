#- [x] Debug loading loop on Android
    - [x] Fix ReferenceError in `app.js` (missing `DEFAULT_SETTINGS` import)
    - [x] Revert memory constants alignment for safety
- [ ] Verify fix [ ]

# Debug Log: Android "stubReselectMessage" Error

## 1. 現象 (Reported Issue)
- Androidで画像書庫を開くと `stubReselectMessage` が表示され、閲覧できない（Windowsでは問題なし）。
- 具体的な原因: 
    - Android Chrome の JSHeapLimit が低いため、ストリーミングモードが強制される。
    - ストリーミングモードでは本体保存がスキップされていたため、ライブラリから開く際に毎回ファイル再選択が求められる。
    - 再選択プロンプトの `focus` イベント処理が Android で race condition を起こし、キャンセル扱いになっていた可能性がある。

## 2. 修正工程 (Steps Taken)

### 2.1. ストレージ永続性の改善
- **ファイル**: `assets/fileStore.js`
    - `isOPFSAvailable` をエクスポート。
- **ファイル**: `assets/app.js`
    - ストリーミングモード（`useStreaming=true`）であっても、OPFS が利用可能な場合は `saveFile` を呼び出して本体を保存するように変更。
    - これにより、大容量ファイルでも再選択なしでライブラリから開けるようになる。

### 2.2. 再選択プロンプトの堅牢化
- **ファイル**: `assets/app.js` (`promptFileReselect`)
    - `focus` リスナーの登録を300ms遅延。
    - `onCancel` 内の判定を 1000ms 待機に延長。
    - `isResolved` フラグを導入し、`change` と `cancel` の二重発火を防止。

### 2.3. ReferenceError の修正
- **ファイル**: `assets/app.js`
    - `DEFAULT_SETTINGS` がインポートされていなかったため、`oneBookmarkPerBook` の初期化で `ReferenceError` が発生し、実行が停止（ローディングループ）していた問題を修正。

### 2.4. メモリ判定定数の戻し
- **ファイル**: `assets/js/core/file-handler.js`
    - `safeMemoryMB` の計算を以前の安定していた値（0.30/0.10）に戻しました。

## 3. テスト項目 (Verification)
- [ ] Android で 50MB 以上の ZIP を開く。
- [ ] ライブラリに登録された後、一度閉じてライブラリから再度開く。
- [ ] 再選択メッセージが表示されず、直接開けることを確認（OPFS対応環境）。
- [ ] (OPFS非対応の場合) 再選択メッセージが表示され、ファイル選択後に正常に開けることを確認。

## 4. ユーザーテスト結果 (User Feedback)
(回答待ち)
