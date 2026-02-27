# デバッグ：大容量ファイル読み込み失敗

## 問題
- Android端末で400MBのZIPファイルを開くと、以前と同じエラーが発生
- WindowsのConsoleに `[Strategy]` 等の新しいログが一切表示されない

## 根本原因

### Phase 1-2: コードの修正（完了済み）
- handleFile, loadFromOPFS, reader.js, archive-handler.js 等のarrayBuffer()呼び出しを排除

### Phase 3: **Service Workerのキャッシュが原因** ★今回修正★
- Service Worker (version=2026-02-20.1) が古いキャッシュ (`bookreader-v7`) を配信し続けていた
- ファイルを編集してもブラウザは**古いキャッシュ済みファイル**を使い続けていた
- → Console に新しいログが一切出ないのは**コードが反映されていなかった**ため

## 修正内容
- [x] `service-worker.js`: バージョンを `2026-02-27.1` に更新
- [x] `sw-cache-config.json`: キャッシュ名を `bookreader-v8` に更新 + 新規モジュールファイル群を追加
- [ ] テスト結果待ち
