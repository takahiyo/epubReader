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
      // 共通処理: POSTリクエストのBodyを1回だけ安全に読み取る
      let body = {};
      if (method === 'POST') {
        try {
          body = await request.json();
        } catch (e) {
          console.warn('Empty or invalid JSON body');
        }
      }

      // --- ルーティング ---

      // 1. 診断ログ保存エンドポイント
      if (path === '/api/diagnostics' && method === 'POST') {
        const { fileName, errorMessage, stackTrace } = body;
        const userAgent = request.headers.get('user-agent');

        await env.DB.prepare(
          'INSERT INTO archive_diagnostics (file_name, error_message, stack_trace, user_agent) VALUES (?, ?, ?, ?)'
        ).bind(fileName, errorMessage, stackTrace, userAgent).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // 2. 同期処理: インデックスの取得 (Pull)
      if (path === '/sync/index/pull' && method === 'POST') {
        const { userId } = body;
        const result = await env.DB.prepare('SELECT index_data FROM user_indexes WHERE user_id = ?')
          .bind(userId).first();
        return new Response(result ? result.index_data : '[]', { headers: corsHeaders });
      }

      // 3. 同期処理: インデックスの保存 (Push)
      if (path === '/sync/index/push' && method === 'POST') {
        const { userId, indexData } = body;
        const dataStr = typeof indexData === 'string' ? indexData : JSON.stringify(indexData);
        await env.DB.prepare('INSERT OR REPLACE INTO user_indexes (user_id, index_data, updated_at) VALUES (?, ?, ?)')
          .bind(userId, dataStr, Date.now()).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 4. 同期処理: 読書状態の取得 (Pull)
      if (path === '/sync/state/pull' && method === 'POST') {
        const { userId, bookId } = body;
        const result = await env.DB.prepare('SELECT state_data FROM book_states WHERE user_id = ? AND book_id = ?')
          .bind(userId, bookId).first();
        return new Response(result ? result.state_data : '{}', { headers: corsHeaders });
      }

      // 5. 同期処理: 読書状態の保存 (Push)
      if (path === '/sync/state/push' && method === 'POST') {
        const { userId, bookId, stateData } = body;
        const dataStr = typeof stateData === 'string' ? stateData : JSON.stringify(stateData);
        await env.DB.prepare('INSERT OR REPLACE INTO book_states (user_id, book_id, state_data, updated_at) VALUES (?, ?, ?, ?)')
          .bind(userId, bookId, dataStr, Date.now()).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};
