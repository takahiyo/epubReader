# 目録同期APIの基盤（Ver1.2.B）

段階Eのサーバー側を追加した。目録画面は引き続きこの端末のIndexedDBを使う。APIとの接続、端末側の送信待ち保存、アカウントごとの目録分離、競合解決画面は未実装。この版だけでWindowsとAndroidの目録が共有されるわけではない。

## API

既存WorkerのFirebase IDトークン検証を利用する。ユーザーIDは検証済みトークンから決定し、bodyのuser_idを採用しない。旧読書位置・しおり・本棚のAPIとDBは維持する。応答はCache-Control: no-store。

`POST /sync/catalog/push`

```json
{
  "idToken": "Firebase ID token",
  "mutations": [{
    "mutationId": "persistent-operation-uuid",
    "changes": [{
      "entityType": "books",
      "entityId": "book-uuid",
      "baseRevision": 0,
      "payload": {
        "id": "book-uuid", "revision": 1,
        "created_at": 1791334800000, "updated_at": 1791334800000,
        "deleted_at": null, "title": "Book", "series_id": null
      }
    }]
  }]
}
```

一要求は一操作グループ。シリーズ変更と空シリーズの削除、借用・返却と所蔵状態の変更等を同じchangesへ含める。最大5,000レコードかつ512KiB、各レコード4KiB以内。単位ごとに分割する初期移行と、分割できない通常操作を端末側で区別する必要がある。大きすぎる操作を黙って部分保存しない。

新規はbaseRevision=0。既存は最後に確認したサーバーrevisionを指定する。端末の編集回数とサーバーrevisionは独立して管理する必要がある。サーバーはrevisionをbaseRevision+1、updated_atをサーバー時刻にし、既存created_atを維持する。読了日時等のoccurred_atは変更しない。

結果は`data.results[0]`。acceptedは確定changes、conflictは競合対象と現在のサーバーレコード、invalidは入力・参照等の不正を返す。どれも操作単位であり、一件競合した操作は全件を反映しない。同じmutationIdと同じ内容の再送は元の結果を返し、履歴やrevisionを増やさない。同じIDを違う内容に使うとmutation_reused。競合解決後の再送は新しいmutationIdと確認済みbaseRevisionを使う。property順は同一扱いだがchangesの配列順は維持する。

`POST /sync/catalog/pull`

```json
{ "idToken": "Firebase ID token", "cursor": 0, "limit": 10 }
```

`data.groups`はcursor順の確定操作、`nextCursor`が次回取得位置、`hasMore`が続きの有無。初回もcursor=0から変更ログを取得する。ページング中の追加・更新も単調増加する番号で後続ページへ含める。操作はページ境界で分割せず、件数と512KiBでページを制限する。削除はdeleted_atを持つレコードとして配信し、ログ・削除記録・再送結果を初期版では期限削除しない。cursorはアカウント・接続先ごとに保持し、別アカウントへ流用しない。

## 保存・検証

0004はcatalog_heads / catalog_records / catalog_mutations / catalog_changesを追加する。六種類のエンティティをuser_id＋entity_type＋entity_idで区別し、record_dataを共有schemaで検証する。ユーザーを含む参照の正当性、サービスIDの重複、未終了貸出の一意性も同一スナップショットで確認する。既存所蔵のprovider/access_type変更で過去履歴を別サービスへ移すことは拒否する。削除済み親へ利用中レコードを新たに接続しない。

読み取りと書き込みの間の競合はユーザー単位のCASで検出し、無関係な書籍の変更は再取得して適用する。同じレコードの競合を端末時刻で上書きしない。CASに勝った操作だけが、レコード・再送結果・変更ログをD1 batch内で書く。レコードはjson_eachを使う一括SQLで書くため、500巻を個別SQLに分けない。SQL途中失敗は全体をロールバックする。最大5回のCAS再試行も含めFree D1の50クエリ上限以内に抑える。競合の多い要求は503として同じ操作IDの再送を促す。

共有フィールドだけを送受信し、端末固有のlegacy_book_idを除外する。本文・抜粋・ローカルパス・Cookie等の未知フィールドは拒否する。legacy_cloud_book_idは本体同期との明示リンクとして保持する。HTTPS、Amazon（amazon.co.jp / amazon.com）・U-NEXT（unext.jp）の許可ホストと限定したqueryキーのみ同期でき、userinfo・fragment・認証用queryは許可しない。他ドメインの登録URLを持つ目録はローカルで維持し、将来の同期画面でエラーを提示して利用者が修正できるようにする。外部サービスの認証情報やFirebaseトークンをD1へ保存しない。

この構成は[Cloudflare D1のbatch仕様](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)と[クエリ・サイズ上限](https://developers.cloudflare.com/d1/platform/limits/)を確認して実装した。

## 適用と残る工程

リモートDBへ0004は未適用。既存設定ではdevと本番が同じdatabase_idを参照しているため、データ領域と運用環境を整理した上で適用する。GitHub ActionsはWorkerコードのdevデプロイを行うが、D1 migrationを自動適用しない。未適用の場合、目録APIだけが503を返し、旧Reader APIは動く。

次は、アカウント・接続先別の端末領域、初回結び付けの件数確認、変更と同時に保存するoutbox、差分取得とcursorの同時保存、競合画面、サービスURLのエラー表示を実装する。その後にdev DBへ適用し、Windows/Android二端末・ログアウト・オフライン復帰を実測する。現状は目録同期MVPの完成扱いにしない。

検証: Node 79件成功。SQLiteの実トランザクションで再送・競合・失敗時ロールバック・KU履歴維持・削除配信・取得中の更新・別ユーザー分離・500巻の原子的変更・ページのサイズ制限を確認。Miniflare/workerdのローカルD1でも、署名付きテスト認証・migration未適用時の503・同時編集・再送・500巻一括保存・ページング・既存Reader APIを確認した。既存の固定lockfileから実行環境を導入し、バージョン更新はしていない。
