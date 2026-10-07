# CSVで所蔵を一括登録する（Ver1.2.6）

統合電子書庫の「CSVひな形」を保存し、UTF-8のCSVに記入して「CSV一括登録」から選択する。確認画面では行番号・書名・所蔵先・シリーズ・巻・その他の入力・処理結果と件数を表示する。「確認した所蔵を追加」で初めて保存する。キャンセルでは変更しない。

最大1MB・5,000データ行。列名は半角英字で、必須列は`title,provider`。所蔵先は`local / kindle / unext`。任意列は画面から保存するひな形に記載される。引用符で囲んだカンマ・改行・二重引用符、UTF-8 BOM、CRLFに対応する。未知の列・不正な引用符は拒否する。

例：同じシリーズを複数サービスで持っている場合。

```csv
title,provider,series,volume_label,sort_order,format,provider_book_id,access_type,availability_status,book_key
サンプル 上,local,サンプル,上,1,epub,,,active,vol1
サンプル 上,kindle,サンプル,上,1,,ASIN_EXAMPLE,purchased,active,vol1
サンプル 下,unext,サンプル,下,2,,UNEXT_EXAMPLE,,unknown,vol2
サンプル 上,kindle,サンプル,上,1,,ASIN_EXAMPLE,subscription_loan,returned,vol1
```

`book_key`はこのCSV内で新しく追加する巻・版を明示的に共有する任意キー。同じキーの行は書名・著者・シリーズ・巻表示・並び順・版が一致しなければエラー。同じシリーズ名は既存の完全一致するシリーズへ所属し、同名シリーズが複数存在する場合は整理後の再取り込みを求める。書名だけの一致は別書籍として追加し、同名候補を表示する。既存巻へ所蔵先を追加する場合は、その巻の「所蔵先を追加」を使う。CSVのbook_keyは既存巻のIDではなく、スキップされた所蔵を根拠に既存巻へ自動接続しない。

`access_type`の既定は`purchased`、KUは`subscription_loan`。`availability_status`の既定は`unknown`、利用中・返却済み・利用終了は`active / returned / expired`。空の日時を現在の借用・返却・読了日時に置き換えない。CSVは現在の所蔵登録だけを追加し、借用期間や読書履歴を作らない。Localの本体・Reader IDは取り込まず、登録後にファイルを選択する。

同じprovider・provider_book_id・access_typeが既存目録またはCSV内で登録済みならスキップし、タイトル・進捗・KU履歴を上書きしない。購入とKU借用は別所蔵。サービス内IDがない行は再取り込みで重複し得るため、プレビューの同名候補を確認する。既存レコードの更新件数は0である。完全バックアップ・復元にはJSONを使う。

行エラーが一つでもある場合は全体の登録を止め、元CSVを修正して読み直す。確認後に別タブが目録を変更した場合は競合として拒否し、プレビューを作り直す。登録は単一IndexedDBトランザクションで保存するので部分登録しない。確認画面は50行ずつ表示する。

実装：`catalog-csv.js`（解析・検証・追加案・競合検出）、`catalog-ui.js`（ファイル選択・プレビュー・確定）。設定・列名・上限・画面IDは`CATALOG_CSV`へ集約。Nodeで引用符、行番号、複数所蔵、同名、重複、KU履歴保護、エラー、上限、競合を検証し、Chromeの実IndexedDB・DOMで登録・キャンセル・再取り込み・狭い画面を確認する。
