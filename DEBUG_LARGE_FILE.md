# デバッグ：大容量ファイル読み込み失敗

## 問題
- Android端末で400MBのファイルを開くと依然としてエラーが発生する
- 「Strategy」ログがWindowsでも出ない

## 根本原因 (Phase 2)
ログの解析により、「新規に追加した時の handleFile()」ではなく、「ライブラリから既存の本を開く openFromLibrary()」でクラッシュしていることが判明。

1. **既存本読み込み時の OOM**: `fileStore.js` の `loadFromOPFS` が依然として `file.arrayBuffer()` で全バッファをメモリに展開していた。
2. **EPUB の OOM**: `reader.js` の `openEpub` が `epubConstructor(await file.arrayBuffer())` となっており、全バッファを展開していた。
3. **RAR形式特有の確定的 OOM**: もし400MBのファイルが RAR形式(.rar / .cbr)だった場合、解凍ライブラリ(`unrar.js`とWASM)の仕様上、どうしても対象ファイルの約3倍（400MBなら1.2GB）の連続したメモリ領域が必要になり、Android端末のブラウザでは確実に強制終了（OOM）する。

## 工程ログ

### 工程2: 既存プロセスとRARからの保護
- [x] `loadFromOPFS`: `arrayBuffer()`展開をやめ、Fileオブジェクトを直接返すよう修正
- [x] `reader.js`: `openEpub`で `ArrayBuffer` を経由せず、Fileオブジェクトを直接渡すよう修正
- [x] `archive-handler.js`: RAR形式の場合、50MB以上のファイルは強制終了エラーではなく「安全なエラーメッセージ」を出してCBZへの変換を促す安全措置(フェイルセーフ)を追加
