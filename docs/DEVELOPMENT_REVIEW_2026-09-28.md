# BookReader 開発情報・コード精査

調査日: 2026-09-28 / 対象: ローカル `dev` ブランチ、HEAD `f75467c` / アプリ表記: `1.1.4`

> 追記（2026-09-29）: 本資料は修正前の調査記録。D1共用はユーザー指定の意図した構成であり、分離は不要。対応結果は [同期・読み込み修正記録](./SYNC_RELIABILITY_2026-09-28.md) を参照。

## 1. 総評と調査範囲

BookReader は、静的配信できる Vanilla JavaScript の読書用PWAである。EPUB、画像書庫、Web小説、ローカル保存、読書状態同期が実装されている。機能別モジュールへの分割は進んでいるが、画面制御と描画の中心に大きなファイルが残っている。

優先課題は、同期APIの認証とオフライン起動の整合性である。構文エラーの有無だけでは検出できない不具合が確認された。

本資料は主要ソース、設定、SQL、CI、既存資料の静的調査と限定的なローカル検証に基づく。公開サイト・実APIへのアクセス、実ユーザーデータへの操作、デプロイ、Androidビルドは行っていない。ブラウザ描画・端末互換性・実際の本番設定は未検証。未追跡のAndroid関連ディレクトリ、同梱ツール、vendor全体の内部監査は対象外とした。

調査開始時点で削除・未追跡の変更が存在していた。本作業ではそれらや実装コードを変更せず、この資料のみ追加した。

## 2. 構成と責務

| 領域 | 主なファイル | 責務・変更時の注意 |
|---|---|---|
| エントリ | `index.html`, `assets/config.js` | DOM、CSS/CDNの読込、実行時設定の公開 |
| アプリ統合 | `assets/app.js` | 初期化、イベント接続、ライブラリ、履歴、設定、読書状態の保存・同期 |
| 描画制御 | `assets/reader.js` | EPUB、画像書庫、Web小説の切替、検索、ズーム、ページ移動、再レイアウト |
| EPUB組版 | `src/reader/epubPaginator.js` | 独自ページネーション。EPUB.jsだけで成立する構成ではない |
| ファイル入力 | `assets/js/core/file-picker.js`, `pickers/` | Windows、Android/iOS/iPad、Quest向け選択方式の切替 |
| ファイル識別 | `assets/js/core/file-handler.js` | ヘッダー判定、読込戦略、ハッシュ、書籍識別情報 |
| 書庫処理 | `archive-handler.js`, `streaming-zip-handler.js`, `assets/js/workers/rar-worker.js` | EPUB/ZIP/RAR、遅延・ストリーミング読込、RAR Worker |
| UI | `assets/ui.js`, `assets/js/ui/` | 進捗バー、要素参照、一覧レンダラー、オーバーレイ、Web小説UI |
| ローカル状態 | `assets/storage.js` | LocalStorage上の設定・進捗・しおり・履歴・書籍情報・クラウド対応表 |
| ファイル保存 | `assets/fileStore.js` | IndexedDB / OPFS、書庫展開の一時データ |
| 同期 | `assets/cloudSync.js`, `assets/cloudState.js`, `assets/js/core/sync-logic.js` | 通信、送信形式、クラウド書籍との対応・マージ |
| 認証 | `assets/auth.js`, `assets/firebaseConfig.js` | Firebase Googleログイン、トークン取得 |
| Web小説 | `web-novel-provider.js`, `web-novel-viewer.js` | なろう・カクヨムの検索/HTML抽出、エピソード描画 |
| バックエンド | `workers/src/index.js` | 同期API、D1保存、診断ログ、Web小説プロキシ |
| 設定・翻訳 | `assets/constants/`, `assets/i18n/` | 定数の集約と日本語/英語UI |
| PWA | `sw.js`, `manifest.json`, `assets/sw-cache-config.json` | インストール、キャッシュ、共有ファイル受信 |

`app.js` は `StorageService`、`ReaderController`、`CloudSync` とUI群を接続する。`filePicker.init`、`syncLogic.init`、`renderers.init` などの依存注入があり、分割時は初期化順序とコールバックの依存を維持する必要がある。

概略フロー:

```text
ファイル選択 / D&D / OS共有
  → ファイル識別・書籍情報照合
  → 保存（IndexedDB / OPFS）と ReaderController による読込
  → EPUB組版 / 書庫画像描画 / Web小説描画
  → 進捗・しおりを StorageService に反映
  → cloudState / sync-logic / CloudSync
  → Firebase IDトークン付き Worker API → D1
```

同期APIは書籍インデックスと読書状態を扱い、EPUB本体をD1にアップロードするAPIではない。別端末のファイル再取得・書籍照合と、読書状態同期は区別して設計する。

## 3. 実装されている機能と依存関係

- EPUB: 縦書き/横書き、ページ/スクロール、目次、検索、フォント変更、位置復元。
- 画像書庫: ZIP/CBZ、RAR/CBR、単ページ/見開き、RTL/LTR、ズーム。大容量向けのOPFS、ストリーミングZIP、RAR Worker経路がある。
- UI: ライブラリ、履歴、しおり、進捗表示、テーマ、多言語、キーバインド、全画面。
- Web小説: なろう・カクヨムのProviderと専用Viewer。HTML構造とプロキシの可用性に依存する。
- 同期: Firebase認証 + Worker/D1が中心。OneDrive、pCloud、汎用エンドポイント向けコードも残るが、今回その利用可能性は検証していない。
- Notion: READMEはOAuth連携を説明しているが、対象の主要ソースには対応するOAuth/API実装を確認できなかった。アプリ共有文言とUI参照だけを、完成した専用連携の根拠にしない。

主要外部ライブラリは EPUB.js 0.3.93、JSZip 3.10.1、Firebase SDK 10.7.1、Lottie 5.12.2、node-unrar-js 2.0.2。zip.jsのCDN URLはバージョン固定されていない。これらはコード記載の値であり、最新版や脆弱性の調査結果ではない。

## 4. API・データモデル

| API | 用途 | 保存先 |
|---|---|---|
| `POST /sync/index/pull` | ユーザー書籍一覧取得、`since` 指定対応 | `user_indexes` |
| `POST /sync/index/push` | `indexDelta` のマージ保存 | `user_indexes` |
| `POST /sync/state/pull` | `cloudBookId` 単位の状態取得 | `book_states` |
| `POST /sync/state/push` | 進捗・しおり等の状態保存 | `book_states` |
| `POST /api/diagnostics` | ファイル名・エラー・スタック等の保存、認証不要 | `archive_diagnostics` |
| `GET /proxy?url=...` | 許可ホストのHTML取得、認証不要 | 保存処理なし |

同期APIはJSON本文の `idToken` を使用する。ルートURLの `?path=` によるルーティングもある。KVバインディングは設定されているが、調査したWorker本体に `env.KV` の利用はない。

`book_states` は `(user_id, book_id)` が一意、`user_indexes` は `user_id` が一意。JSONをTEXTとして保存する。クライアント側には更新日時によるマージ処理があるが、サーバー側の更新競合制御とは別である。

## 5. 優先課題

### P0: 同期APIがJWT署名を検証していない【ローカル再現済み】

根拠: `workers/src/index.js:48` の `decodeAndVerifyIdToken`。JWT本文をデコードし、期限・audience・issuer等を確認するだけで署名を検証していない。

架空のプロジェクト・ユーザーと模擬D1を用いたローカル検証で、無署名/無効署名トークンに対し `/sync/index/pull` がHTTP 200を返し、DB処理へ進んだ。実サービスには送信していない。

第三者が任意の `sub` を指定できるため、ユーザーを識別する認証境界が成立しない。同じ認証関数を使用する読み書きAPI全体に影響する。コメントの「ペイロード偽造は事実上不可能」という説明も誤り。公開鍵による署名検証、許可アルゴリズムの固定、鍵キャッシュ、検証不能時の拒否を最優先で実装する。

### 運用方針: 本番・開発のD1共用を維持

`workers/wrangler.toml` のデフォルトと `env.dev` は同じD1を参照する。ユーザーから意図した構成との指定があり、そのまま維持する。既定の開発Worker接続先も今回変更しない。移行操作は共用データに作用するため、適用対象とバックアップの確認は必要。

### P1: オフライン起動に必要なキャッシュが揃っていない【静的確認】

- `index.html` のJS/CSS参照は `?v=` 付きだが、キャッシュ一覧はクエリなし。`sw.js` は `caches.match(event.request)` を使用し、クエリ差を無視していない。
- 実行時依存の `src/reader/epubPaginator.js`、`assets/cloudState.js`、`assets/constants/keybindings.js` が一覧にない。RAR Workerと `22-float-menu-toggle.css` も未登録。
- `21-quest3-picker.css` はHTMLとキャッシュ一覧にあるが、実ファイルが存在しない。
- `assets/constants/pwa.js` は `bookreader-v51`、生成済みJSONは `bookreader-v52`。一覧にも差分があり、生成元と生成物が不一致。
- ネットワーク取得成功時にキャッシュを追加更新する処理がないため、オンラインで一度読めば不足が解消する構成ではない。

URL規則とキャッシュ生成元を統一し、実行時依存の網羅チェックを追加する。生成スクリプトを現状のまま実行すると、手修正されたJSONの一部登録が失われるため、まず生成元を修正する。実ブラウザで初回オンライン起動→完全オフライン→再起動を検証する。

### P1: マイグレーション0003が既存データを削除する【SQL確認】

`workers/migrations/0003_fix_column_names.sql` は、旧カラムの存在判定なしに `book_states` と `user_indexes` をDROPして再作成する。初めてこのマイグレーションを適用する既存DBでは同期データが消える。新規の空DBと既存DBでリスクを分け、既存DBではバックアップ・スキーマ確認・データを保持する移行が必要。クライアントからの再送だけで全ユーザーの復元を保証しない。

### P1: 外部HTMLの安全化が不足する可能性【コード経路確認、ブラウザ未再現】

`web-novel-provider.js` で抽出した本文が `web-novel-viewer.js:74` の `innerHTML` に入る。script要素の除去は見られるが、イベント属性や危険なURL等の包括的な無害化は確認できない。外部プロキシ経由の応答も同じ経路に入る。許可要素・属性を限定したサニタイズを導入し、イベント属性を含む入力で検証する。

### P1: Android署名パスワードの直接記載【確認済み】

追跡対象の `scripts/build-pwa.ps1` に署名用パスワードがリテラルで記載されている。本資料には値を転載しない。環境変数や秘密情報ストアへ移し、Git履歴・公開範囲と署名鍵ファイルの露出を確認して、必要な変更を判断する。パスワードの存在だけで署名鍵の流出まで断定はできない。

### P2: 同期の古い更新・同時更新への保護不足【コード確認】

`/sync/state/push` は受信 `updatedAt` の新旧比較なしで `INSERT OR REPLACE` する。古い端末から後着した状態が新しい状態を上書きし得る。`/sync/index/push` は読取→JSでマージ→書戻しのため、同時更新で一方の差分が失われ得る。サーバー側の条件付き更新、版番号または競合検知を設計する。

### P2: OS共有後のリダイレクト【Nodeで例外再現、端末未検証】

`sw.js` は `Response.redirect('./', 303)` を呼ぶ。Node v24.19.0では相対URLの解析に失敗した。アプリの配信サブパスを保つ絶対URLを構築し、Android/Questの共有ターゲットから検証する。

### P2: 運用・品質基盤

- `.github/workflows/deploy-worker.yml` と `deploy-workers-prod.yml` が同じmainへのWorker変更で本番デプロイする。二重実行を解消する。
- 確認したCIはデプロイ中心。ルートpackage.jsonや通常の自動テスト設定はなく、`test.html` は手動のimport確認ページ。57ファイルの構文正常は機能の正常性を保証しない。
- 診断APIにコード上の認証・サイズ上限・レート制限がない。プラットフォーム側設定は未確認。ログ肥大化と保存内容の取扱いを整理する。
- プロキシは初期ホストを制限するが、`redirect: 'follow'` の遷移先を再検証していない。リダイレクト先の検証も必要。
- SWの旧キャッシュ削除はアプリ固有プレフィックスで絞っていない。同一オリジンに他アプリがある構成で影響を確認する。

## 6. 保守性と資料の整合性

読取時の改行分割による規模は `app.js` 4,691行、`reader.js` 5,884行、`ui.js` 860行、`cloudSync.js` 575行、`storage.js` 661行、`epubPaginator.js` 862行。

最初に挙動を守る回帰検証を用意し、その後 `app.js` の入力イベント・ライブラリ操作・設定画面、`reader.js` のEPUB表示・画像表示・検索・ズームを責務ごとに分割するとよい。一括書換えではなく、既存の依存注入とイベント接続を保持して段階的に進める。

READMEとの差分:

- 開発ガイドへのリンクがルート相対になっているが、実ファイルは `docs/` 配下。
- 「全アセットキャッシュ」「オフライン対応」は現状のキャッシュ定義と一致しない。
- Notion OAuth連携は主要ソースで確認できない。
- CSSはREADMEの20層説明に対してHTMLは22番まで参照し、21番は実体欠落。
- KV/D1という説明に対し、現在の同期Worker実装はD1を利用する。

`LLM_CONTEXT*.md`、デバッグ記録、`old*.js`、差分ファイル等は参考資料として扱い、現行エントリから辿れる実装を優先する。未追跡の生成物やSDK関連ディレクトリを含めた一括コミットは避ける。

## 7. 開発開始手順

1. `docs/CORE_PRINCIPLES.md` を読み、変更対象に応じて `MODULE_GUIDE.md`、`SSOT_GUIDE.md`、`COMMENT_GUIDE.md`、`REFACTOR_GUIDE.md` を確認する。
2. `git status --short` で既存変更を把握する。
3. フロントはビルド不要の静的HTTPサーバーで起動する。READMEの例は `npx serve .` またはPython導入環境で `python -m http.server 8000`。表示されたローカルURLを使用する。`file://` 直開きは避ける。
4. バックエンドは `workers/` で `npm ci`、`npx wrangler dev --env dev`。ローカル開発時も接続先を明示し、ブラウザのAPI_BASE_URL/D1_SYNC_ENDPOINTを確認する。
5. D1は共用を維持し、マイグレーション内容を確認する。既存DBへ0003を無条件で適用しない。本調査では適用していない。
6. SWの変更時は `assets/constants/pwa.js` と依存一覧を整合させてから `node scripts/generate-sw-cache-config.mjs` で生成する。登録状態とキャッシュを確認する。
7. デプロイはフロントとWorkerで別管理。Workerはmainが本番、devが開発のCI設定。フロントの実ホスティング設定は今回未確認。

Android用 `scripts/build-pwa.ps1` はGradleビルド・署名・adbインストールまで含む。通常のWeb開発には不要。固定JDK/SDKパス、署名情報、既定の端末インストール動作を理解してから使用する。

## 8. 検証結果と次の開発順序

実施済み:

| 検証 | 結果 |
|---|---|
| assets（vendor除外）、src、workers/src、scripts、sw.js のJS構文 | Node v24.19.0、57ファイル通過 |
| キャッシュ登録先のローカル実体 | `21-quest3-picker.css` 欠落 |
| 主要実行時依存とキャッシュ一覧の照合 | ページネータ・同期payload・キー設定等の不足を確認 |
| 相対importの簡易抽出 | 欠落候補2件はJSDocとコメント内の旧コード。実行時import不良としては扱わない |
| Worker認証の模擬リクエスト | 無効署名トークンがHTTP 200、模擬DBへ到達 |
| 相対URLのResponse.redirect | Nodeで例外。ブラウザ/端末での再検証が必要 |

次の順序を推奨する:

1. JWT署名検証の実装と、正常・無効署名・期限切れ・aud/iss不一致の回帰テスト。
2. D1共用を維持し、既存DB移行方針と署名情報の管理を是正。
3. PWAキャッシュ生成とURL照合の修正、オンライン→オフライン再起動のブラウザ検証。
4. 外部HTMLの無害化、共有ターゲット、同期競合制御を修正。
5. デプロイ重複解消とCI検証の導入、その後に大きなモジュールを段階分割。

機能回帰はEPUB縦/横・ページ/スクロール・検索/目次/位置復元、ZIP/RARの単/見開き・大容量・画像欠落、2端末の進捗/しおり競合、Windows/Android/iPad/Questの入力・共有を軸にする。Web小説は外部HTMLを保存したfixtureで抽出ロジックを検証し、実サイト確認を別に扱う。

実装変更・修正・デプロイは本調査には含まれていない。
