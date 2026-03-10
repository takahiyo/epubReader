# 開発ログ (dev_log.md)

## [2026-03-10] EPUB 3 ナビゲーションおよびパス解決の修正

### 作業概要

特定の EPUB（特に KADOKAWA 系など `item/` フォルダ構成を持つもの）において、目次が機能せず全章が連結表示される問題を修正する。

- **ステータス**: 完了（第2回修正: 初回テストで判明した3つの追加問題も解決）
- **成功の境界線**: `0468.epub` のような階層構造を持つ EPUB で、目次が正しく表示され、各章が個別にロードされ、画像が正常に表示されること。
- **失敗の事象（初回テスト時）**:
  1. `this.archiveHandler` が `ReaderController` で未設定のため、全ての `archiveHandler` ベースのロジックが動作しなかった。
  2. EPUB.js が不完全ながら2件の目次を返したため、補完条件 `toc.length === 0` が成立せず、`EpubArchiveHandler` の完全な目次が使用されなかった。
  3. EPUB 3 Nav の XHTML を `text/html` でパースしていたため、名前空間付き属性 `epub:type="toc"` が認識されなかった。
- **失敗の根本原因**: (1) `openEpub` 内で `EpubArchiveHandler` を初期化する処理がなかった (2) 補完条件が「0件時のみ」と限定的だった (3) XML 名前空間の扱いを考慮していなかった。
- **実装内容（第2回修正）**:
    1. `openEpub` 内で `new EpubArchiveHandler(file)` を直接初期化し、`this.archiveHandler` にセット。
    2. 目次補完条件を `archiveToc.length > toc.length` に変更（より多い方を使用）。
    3. EPUB 3 Nav 解析を `application/xhtml+xml` パーサーに変更し、`getAttributeNS` で名前空間付き属性を正しく取得。
    4. `buildPagination` の `resourceLoader` 先頭に `archiveHandler.getFileBlob` による高精度リソース取得を追加。
- **次のアプローチ**: ユーザーによる実機再検証。

### セルフチェックリスト

- [x] 新たなハードコーディング（直書き）を追加していないか？
- [x] 既存のモジュールやCSSクラスを無視して、似たものを新設していないか？
- [x] SSOTの原則に反して、同じような定義を複数箇所に作っていないか？
- [x] 【重要】 直近の開発ログ（失敗記録）を確認し、過去に失敗したアプローチを繰り返していないか？
