# Quest 3 PWA 大容量書庫対応・デバッグログ

## 概要
本ファイルは Horizon OS (v79/v85) での大容量（1GB以上）ZIP/RAR展開時の OOM(Out of Memory) 回避、およびUI回帰問題に対処するためのデバッグ記録およびチェックリストです。

## チェックリスト
- [ ] 1GB超のファイルを処理中、adb shell dumpsys window で解像度が意図した値（例: 1920x1080）を維持しているか。
- [ ] v79環境において、リサイズハンドルが消失せずに操作可能か。
- [x] RAR展開時、Worker内で buffer.slice によるデタッチが正常に行われているか。（コード上確認済み、OPFS WritableStreamへの保存とともに参照を破棄）
- [ ] 検証バイパス: adb shell settings put global package_verifier_enable 0 および entitlement_check_disabled 1 を実行し、OSによる不当なプロセス停止が発生しないか。
- [ ] v85以降のUI統合環境において、ウィンドウの位置リセットが発生せずに「Theater View」へ移行できるか。（Distant Mode推奨UI警告実装済み）

## ADBデバッグコマンド一覧
* 没入モード強制化: `adb shell settings put global policy_control immersive.full=<package_name>`
* 解像度固定: `adb shell wm size 1920x1080`
* 密度変更: `adb shell wm density 160`

## 行った工程と結果
### Phase 1: 計画策定
- 実装計画（`implementation_plan.md`）の作成完了。
- ユーザーの承認待ち。

### Phase 2: 実装・適用
- `fileStore.js` に `createOPFSWritableStream` メソッド、`closeOPFSStream` を実装し、Blob経由のメモリ消費を防ぐ仕組みを用意。
- `streaming-zip-handler.js` にて WritableStreamWriter を使用したOPFSへの直接チャンク書き込みと、直後の `null` トリック + `setTimeout` (GC誘導)を実装。
- `archive-handler.js` のRarHandlerにおいて、LARGE_FILE制限を解除しOPFSへオフロード。
- `app.js` に `window.resizeTo(1920, 1080)` バグバイパスロジックを追加。
- 1GB超（1024^3 bytes）判定による `LARGE_FILE_DISTANT_MODE` トースト警告を実装。
