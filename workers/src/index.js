/**
 * Cloudflare Worker: 
 * クラウド同期エンドポイントおよび診断ログ保存エンドポイントの制御
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname === '/' ? url.searchParams.get('path') : url.pathname;
    const method = request.method;

    // CORS プリフライトリクエストへの対応
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // --- ルーティング ---

      // 1. 診断ログ保存エンドポイント (前回追加分)
      if (path === '/api/diagnostics' && method === 'POST') {
        const data = await request.json(); // ここでBodyを読み取る
        const { fileName, errorMessage, stackTrace } = data;
        const userAgent = request.headers.get('user-agent');

        await env.DB.prepare(
          'INSERT INTO archive_diagnostics (file_name, error_message, stack_trace, user_agent) VALUES (?, ?, ?, ?)'
        ).bind(fileName, errorMessage, stackTrace, userAgent).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // 2. 既存の同期処理 (Bodyの読み取りを各if文の中で行うように修正)
      if (path === '/sync/index/pull') {
        // GET/POSTに関わらず処理
        const userId = url.searchParams.get('userId');
        const result = await env.DB.prepare('SELECT index_data FROM book_indices WHERE user_id = ?')
          .bind(userId).first();
        return new Response(result ? result.index_data : '[]', { headers: corsHeaders });
      }

      if (path === '/sync/index/push' && method === 'POST') {
        const { userId, indexData } = await request.json(); // ここで個別に読み取る
        await env.DB.prepare('INSERT OR REPLACE INTO book_indices (user_id, index_data, updated_at) VALUES (?, ?, ?)')
          .bind(userId, JSON.stringify(indexData), Date.now()).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (path === '/sync/state/pull') {
        const userId = url.searchParams.get('userId');
        const bookId = url.searchParams.get('bookId');
        const result = await env.DB.prepare('SELECT state_data FROM book_states WHERE user_id = ? AND book_id = ?')
          .bind(userId, bookId).first();
        return new Response(result ? result.state_data : '{}', { headers: corsHeaders });
      }

      if (path === '/sync/state/push' && method === 'POST') {
        const { userId, bookId, stateData } = await request.json(); // ここで個別に読み取る
        await env.DB.prepare('INSERT OR REPLACE INTO book_states (user_id, book_id, state_data, updated_at) VALUES (?, ?, ?, ?)')
          .bind(userId, bookId, JSON.stringify(stateData), Date.now()).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};
```
eof

---

### 2. メイン業務：GitHub連携ツール（Codex等）への最終指示書

これをコピーして、実際にGit操作を行うAIに渡してください。

```markdown
# 目的
Cloudflare Workerの500エラーを解消し、画像アーカイブの読み取りエラー調査機能を完成させる。

# 修正内容
1. **Worker側 (`workers/src/index.js`)**
   - リクエストBody (`request.json()`) の読み取り処理を、各ルーティングの `if` ブロック内部に移動し、`TypeError: Body has already been read` を防止する。
   - `/api/diagnostics` エンドポイントが既存の同期リクエストを妨げないよう独立させる。
2. **クライアント側 (`assets/js/core/archive-handler.js`)**
   - `analyzeImagePath` 関数が重複定義されているため、1つに統合してSyntaxErrorを解消する。
   - `reportArchiveError` 関数でエラーを報告する際、`await` を使わず非同期で実行し、メインの読み込み処理を止めないようにする。

# 技術的背景
- Cloudflare Workersでは `request.json()` は1回しか呼べない制約があります。
- `Identifier 'analyzeImagePath' has already been declared` は、AIによる重複コード生成が原因です。これらを整理してください。
