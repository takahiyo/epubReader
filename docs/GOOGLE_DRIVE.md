# Googleドライブ直接読み込み：計画・設定・検証

## 2026-10-17：iPadのCookie制限への対応（dev）

iPad/iPhoneでは、埋め込みPickerの代わりにGoogleの認証・選択ページへ移動し、選択後にBookReaderへ戻る。Safariの「サイト越えトラッキングを防ぐ」をオンにしたまま使うことを目的とした変更。通常タブ・ホーム画面PWA双方の実機検証は必要。PC・Android・Questは従来の埋め込みPickerを維持する。

使用する公式フローは `response_type=code`、`prompt=consent`、`trigger_onepick=true`、`drive.file` 単独。OAuth stateとPKCEの一時情報だけをsessionStorageに保存する（10分有効・戻った時点で削除）。コードはページ先頭でURLから除去し、アクセストークンはメモリーだけに保持する。Firebaseでログインした同一ユーザーであることを確認し、dev Workerの専用APIでコード交換する。書籍は従来どおりブラウザーからDrive APIで直接取得する。Workerへ書籍本体を送らず、トークンやコードをDB・KV・ログへ保存しない。

### devの外部設定（必須）

1. Google Cloudの既存Drive用Web OAuthクライアントの「承認済みのリダイレクトURI」に **`https://dev.epubreader-7w6.pages.dev/`** を追加する。JavaScript生成元への登録とは別の設定。末尾の `/` を含めて一致させる。GitHub Pagesの公開情報は旧設定であり、現在のdevはCloudflare PagesのこのブランチURLを使う。
2. 同じOAuthクライアントのクライアントシークレットを、GitHubリポジトリのActions secret **`DRIVE_CLIENT_SECRET`** に登録する。devのWorkerデプロイ時にWorker secretへ反映される。あるいは管理者が `workers` で `npx wrangler secret put DRIVE_CLIENT_SECRET --env dev` を実行する。秘密値をソース・ブラウザー設定・チャットへ記載しない。
3. devへpushして「Deploy Workers to Development」とCloudflare Pagesの成功を確認する。上記devブランチURLを再読み込みし、iPadのSafari設定をオンにして認証→選択→読書開始、キャンセル、アカウント変更、PWA復帰を確認する。コミットごとの一時プレビューURLでは戻り先が一致しないため、固定のブランチURLを使う。

Workerの `DRIVE_REDIRECT_URI` と実際の公開URLが一致し、secretが登録されるまでは、iPadには「設定待ち」の案内を出す。サーバーの設定確認だけではGoogle側のURI登録までは確認できず、未登録の場合はGoogleの `redirect_uri_mismatch` が表示される。

`/oauth/drive/config` と `/oauth/drive/token` は登録した戻り先の生成元に限定したCORSと `no-store` を使う。token APIはFirebase IDトークンを要求し、固定のGoogleトークンエンドポイント・OAuthクライアント・戻り先だけを使う。

[Google公式：別画面での認証とPicker](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker)

### この改修の検証

- 既存の削除・競合状態を変更しない検証用コピーで、全回帰テスト114件成功。
- 新規の認証テスト8件でstate・期限・PKCE・CORS・コード交換・IDだけの選択からの取得を確認。
- `tests/google-drive-redirect-browser.mjs`：iPad UA、Googleへの移動、戻った直後のURL除去、Firebase復元待ちからの再開、書籍File引き渡しをChrome上の模擬通信で確認。
- 既存のWorkerバンドルとworkerd・ローカルD1の検証成功。法的ページとSWキャッシュ設定の再生成内容も一致。
- 実際のGoogle OAuthおよびiPad Safari/PWAは、上記外部設定後に利用者が確認する。

2026-10-09 / dev

## 方針

今回の依頼により、2026-10-04の「OSのファイル選択のみ」という旧方針を更新する。
Windows・iPad・Android・Quest 3のブラウザで同一の操作を提供し、Android・Quest 3のインストール済みPWAでも同じWeb実装を使う。

1. 初期画面・左メニュー・読書メニューに「Googleドライブから開く」を配置。
2. Firebase Googleログインとは独立したGIS OAuth認可で `drive.file` を要求。
3. Google Pickerでフォルダーをたどる／検索して1冊を選択。
4. Drive API `files.get?alt=media` からブラウザへ直接取得。
5. 既存の `handleFile` へFileを渡し、書籍識別・進捗同期・IndexedDB/OPFS保存・閲覧を共用。

`drive.file` は選択したファイルにアクセスするスコープで、Google側の許可には編集権限も含まれる。アプリが実行するのはGETのみ。Drive全体の読み取り権限は要求しない。Firebase IDトークンをDrive APIへ送らない。Driveアクセストークンは操作中のメモリーだけに置き、URL・ログ・LocalStorage・同期ペイロードに保存しない。ログアウト・アカウント変更・キャンセルで進行中の選択／取得を無効化する。Googleの許可画面ではDrive側のアカウントを利用者が確認する（ログイン中アカウントはhintとして渡す）。

## 実装段階

- 第1段階（この変更）：直接選択・取得、通信量表示、キャンセル、日英表示、未設定／オフライン／認可失敗／期限切れ／対象消失の案内、PWAのモジュールキャッシュ、認証付き通信のSWキャッシュ除外。
- 第2段階（公開前の確認）：下記のCloud設定を適用し、各実機でOAuthとPicker、保存後のオフライン再読を確認。認証ポップアップが制限される環境は許可後再試行する。Quest Browser/PWAで動作するとは実機確認前に断定しない。
- 第3段階（改善候補）：OPFSへのストリーム取得でメモリー負荷を軽減、Driveの再オープン参照と統合電子書庫の紐付け、通信中断後の再開。第1段階はファイルIDを同期せず、別端末では同じファイルをDriveから選び直す。

2026-10-14に1冊256 MiBの固定上限を撤廃。メタデータにサイズがある場合は、取得したサイズとの一致を検査する。取得データはメモリー上でFileにまとめ、既存の読み込み・保存処理へ渡す。読み込める容量は端末のメモリー・ブラウザ・保存領域と書籍の展開内容に依存する。OSへのダウンロード操作は不要だが、実データのネットワーク取得とアプリ内保存は行う。

## Google Cloudでの設定（管理者）

1. 使用するCloudプロジェクトで **Google Drive API** と **Google Picker API** を有効化。
2. OAuth同意画面にアプリ名・公開するプライバシー方針等を設定し、`https://www.googleapis.com/auth/drive.file` を追加。テスト公開中は使用するGoogleアカウントをテストユーザーに登録。公開時はGoogleが要求する確認を完了する。
3. **ウェブアプリケーション**のOAuthクライアントを作成。承認済みJavaScript生成元にdevサイト、本番サイト、開発用 `http://localhost:ポート` を個別登録する。ブラウザPWAなのでクライアントシークレットを配布しない。
4. 同一プロジェクトのブラウザ用APIキーを作成。API制限はPicker API等の必要なAPIに限定し、HTTP参照元は使用サイトを許可。Googleの現行Pickerガイドに従い `https://docs.google.com` の参照元も許可する。
5. `assets/constants/google-drive.js` の `clientId`（Web OAuth ID）、`apiKey`（公開ブラウザキー）、`appId`（数字のCloud **プロジェクト番号**）を設定する。ビルド／ホスト側でHTMLのアプリモジュールより前に `window.APP_CONFIG.googleDrive` に同じフィールドを注入してもよい。
6. `node scripts/generate-sw-cache-config.mjs` を実行し、devへ配置して実機検証。

リポジトリにはFirebaseと従来GISで異なるプロジェクト番号がある。Pickerに必要な3項目が同一プロジェクトでそろうことを管理画面で確認する。2026-10-09にユーザーが提供したDrive用OAuthクライアントID・ブラウザAPIキー・プロジェクト番号 `920141070828` をdevの設定へ反映済み。Google Cloud側のAPI有効化・参照元制限・テストユーザー設定の最終確認と、実サービスでの認証・読み込みは別途行う。

## 検証項目

| 環境 | 公開前に実施する項目 |
|---|---|
| Windows Chrome / Edge | ログイン、初回同意、検索、フォルダー、EPUB/CBZ、再読 |
| iPad Safari | ポップアップ、縦横画面、タッチ、キャンセル、保存と再読 |
| Android Chrome + PWA | ブラウザとstandalone双方の認可、Picker復帰、オフライン再読 |
| Quest 3 Browser + PWA | コントローラーで48pxボタン、OAuth窓の復帰、Picker内操作、読み込み取消、大きな書籍 |

共通：拒否、ポップアップブロック、401/403/404、回線断、大容量ファイル、取得サイズの不一致、対応外ファイル、アカウント変更、キャンセル後の遅延応答を確認する。アカウント情報・トークン・書籍本体を同期サーバーやSWキャッシュへ送らないことも確認する。実Googleアカウントと実機による確認は、このコード変更だけでは完了しない。

## この作業での検証結果

`node --experimental-vm-modules --test tests/google-drive.test.mjs tests/pwa.test.mjs tests/sync.test.mjs tests/cloud-payload.test.mjs tests/reading-log.test.mjs`：46件成功。
JavaScript構文チェック・`git diff --check` も実施。
`tests/google-drive-browser.mjs` はSDKをモックし、画面幅390px、未設定案内、ユーザー操作内の認可、Pickerとdialogの重なり、File引き渡し、アカウント切替・遅延応答・フォーカスを検査するために追加。ただしこの環境のChrome/EdgeがPuppeteerへの接続に失敗するため、既存browser-smokeとともに未完了。Google OAuth/Picker実サービス、各実機、PWAでの確認も未実施。

実行例（ブラウザのパスは環境に合わせる）：

```powershell
$env:BROWSER_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/google-drive-browser.mjs
node tests/browser-smoke.mjs
```

## 公式資料

- [Web Pickerの統合](https://developers.google.com/workspace/drive/picker/guides/web-picker)
- [Driveスコープ](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [ファイル取得](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
