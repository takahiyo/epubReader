# デバッグ：大容量ファイル読み込み失敗

## 問題
- Android端末で400MBのファイルを開くと、以前と同じエラーが発生
- コンソールに `[Strategy]` ログが表示されない → コード未反映 or キャッシュ

## 根本原因
前回の改修では `handleFile` 内のハッシュ計算・保存で依然として `file.arrayBuffer()` を呼んでいた
→ 400MBの全バッファがメモリに載る → メモリ不足でクラッシュ

## 工程ログ

### 工程1: arrayBuffer() 完全排除
- [x] `hashFileLightweight` — 先頭1MB+末尾1MB+サイズからハッシュ（ピーク2MB）
- [x] `saveToOPFS` — File/Blobを直接ストリーム書き込み（全バッファ不要）
- [x] `saveLocalFile` — File/Blob受入対応、IndexedDB用のみarrayBuffer変換
- [x] `handleFile` — 大容量ファイル時はfile.arrayBuffer()を一切呼ばない分岐追加
- [x] リーダーに File オブジェクトをそのまま渡す（bufferからFile再構築を廃止）
- [ ] テスト結果待ち
