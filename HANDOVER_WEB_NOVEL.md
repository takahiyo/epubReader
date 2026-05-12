# Web小説機能 引き継ぎ資料 (HANDOVER)

## 現在の状況と課題
BookReaderアプリの「Web小説（小説家になろう・カクヨム）検索・閲覧機能」において、**「なろう」の検索自体はAPI経由で成功するが、目次（エピソード一覧）を取得する際に「0 episodes」となる不具合**が確認された。

### 根本原因
- なろうAPIはメタデータ（タイトルや作者等）しか返さず、目次や本文を取得するAPIが存在しないため、ブラウザから直接 `ncode.syosetu.com` をスクレイピング（`fetch`）する必要がある。
- しかし、CORS制約により直接 `fetch` できないため、無料のパブリックCORSプロキシ（`api.codetabs.com`, `corsproxy.io` など）を経由していた。
- 現在、**「小説家になろう」側のCloudflare等の強力なボット対策（Turnstile等）により、これらのパブリックプロキシからのアクセスが完全にブロック（または空の応答に置換）されている**。
- 結果として、プロキシ経由で取得したHTMLの中身が空（`length: 0`）になり、エピソードリンクが抽出できない状態に陥っている。

## 次のセッションでやること（Next Steps）
この問題を解決するためには、パブリックプロキシを捨て、**自身でコントロール可能な専用のバックエンドプロキシ（Cloudflare Worker）を構築する**必要がある。（※ユーザー様は過去に `Whereabouts` プロジェクト等で Cloudflare Worker の構築経験あり）

次回セッション開始時、以下の手順で Cloudflare Worker を用いた CORS 回避プロキシの実装に着手すること。

### 1. Cloudflare Worker の構築
- `BookReader` リポジトリ内、あるいは新規ディレクトリに Worker 用のプロジェクトを作成（`npm create cloudflare@latest` などを想定、環境による）。
- 目的は単なる「CORSヘッダーの付与と、必要に応じた `User-Agent` 偽装」。
- 以下のようなごくシンプルな Worker コードを想定:
  ```javascript
  export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const targetUrl = url.searchParams.get('url');
      
      if (!targetUrl) {
        return new Response('Missing target URL', { status: 400 });
      }

      // ヘッダーの偽装（特に User-Agent や Referer が有効な場合がある）
      const modifiedHeaders = new Headers(request.headers);
      modifiedHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      modifiedHeaders.delete('Origin'); // なろう側に怪しまれないようOriginを消すなど

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: modifiedHeaders,
        redirect: 'follow'
      });

      // CORSヘッダーを付与して返す
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      });
    }
  }
  ```

### 2. アプリ側の設定変更
- Workerがデプロイされたら、そのURL（例: `https://my-cors-proxy.xxxx.workers.dev/?url=`）をコピー。
- `web-novel-provider.js` の `proxies` 配列の**最優先（先頭）**に、構築した自身のWorker URLを追加する。

### 3. テストと調整
- デプロイ後、BookReaderの目次取得をテストする。
- もし自前のWorker経由でもCloudflareに弾かれる場合は、Workerの `fetch` オプションや送信するヘッダー（`User-Agent`, `Accept` 等）をより一般的なブラウザに似せる調整を行う。

## 完了済みのタスク（振り返り用）
- UI上での「検索対象の絞り込み（タイトル、作者名、あらすじ、キーワード等）」は実装完了。
- なろうAPIへの検索クエリの連携と、カクヨムでのクライアントサイドフィルタリングも実装完了。
- 抽出ロジックにおける正規表現バグの排除（文字列の `indexOf` 等を用いた堅牢なパースへの変更）。
- プロキシ成功判定ロジックの修正（空文字を成功と誤認しないように修正済）。
