/**
 * Cloudflare Worker:
 * クラウド同期エンドポイントおよび診断ログ保存エンドポイントの制御
 *
 * パラメータ仕様（クライアント cloudSync.js との対応）:
 *  POST /sync/index/pull  { idToken, since? }
 *  POST /sync/index/push  { idToken, indexDelta, updatedAt }
 *  POST /sync/state/pull  { idToken, cloudBookId }
 *  POST /sync/state/push  { idToken, cloudBookId, state, updatedAt }
 *  POST /api/diagnostics  { fileName, errorMessage, stackTrace? }
 */

// -----------------------------------------------------------------------
// Firebase ID Token 検証ユーティリティ
// -----------------------------------------------------------------------

/**
 * Firebase ID Token を Google の公開鍵で検証し、uid を返す。
 * 検証に失敗した場合は null を返す（例外はスローしない）。
 */
async function verifyIdToken(idToken, firebaseProjectId) {
  try {
    // JWT の各部分を分割
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // 有効期限チェック
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.warn('[Auth] ID token expired');
      return null;
    }

    // audience (aud) チェック
    if (firebaseProjectId && payload.aud !== firebaseProjectId) {
      console.warn('[Auth] ID token audience mismatch', payload.aud, '!==', firebaseProjectId);
      return null;
    }

    // Google の公開鍵を取得して署名検証
    const keysUrl = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
    const keysResp = await fetch(keysUrl);
    if (!keysResp.ok) {
      console.warn('[Auth] Failed to fetch Google public keys');
      return null;
    }
    const keys = await keysResp.json();
    const certPem = keys[header.kid];
    if (!certPem) {
      console.warn('[Auth] No matching key for kid:', header.kid);
      return null;
    }

    // PEM から CryptoKey をインポート
    const pemBody = certPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'spki',
      derBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // 署名検証
    const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signatureBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signatureBytes, signedData);

    if (!valid) {
      console.warn('[Auth] Signature verification failed');
      return null;
    }

    return payload.sub ?? payload.user_id ?? null;
  } catch (e) {
    console.error('[Auth] verifyIdToken error:', e.message);
    return null;
  }
}

/**
 * リクエスト body から idToken を検証し uid を返す。
 * 検証失敗時は 401 Response を返す。
 */
async function authenticate(body, env, corsHeaders) {
  const { idToken } = body;
  if (!idToken) {
    return {
      uid: null,
      error: new Response(
        JSON.stringify({ error: 'idToken is required' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      ),
    };
  }

  const uid = await verifyIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!uid) {
    return {
      uid: null,
      error: new Response(
        JSON.stringify({ error: 'Invalid or expired idToken' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      ),
    };
  }

  return { uid, error: null };
}

// -----------------------------------------------------------------------
// Worker 本体
// -----------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // ルートパスの場合は ?path= クエリパラメータを使用
    const path = url.pathname === '/' ? url.searchParams.get('path') : url.pathname;
    const method = request.method;

    // CORS プリフライトへの対応
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // POST body を1回だけ安全に読み取る
      let body = {};
      if (method === 'POST') {
        try {
          body = await request.json();
        } catch (e) {
          console.warn('[Worker] Empty or invalid JSON body');
        }
      }

      // ===================================================================
      // 1. 診断ログ保存  POST /api/diagnostics
      //    ※ 認証不要（エラー発生時にトークンが取れない可能性があるため）
      // ===================================================================
      if (path === '/api/diagnostics' && method === 'POST') {
        const { fileName, errorMessage, stackTrace } = body;
        if (!fileName || !errorMessage) {
          return new Response(
            JSON.stringify({ error: 'fileName and errorMessage are required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
        const userAgent = request.headers.get('user-agent') ?? '';
        const createdAt = Date.now();

        await env.DB.prepare(
          'INSERT INTO archive_diagnostics (file_name, error_message, stack_trace, user_agent, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(fileName, errorMessage, stackTrace ?? null, userAgent, createdAt).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // ===================================================================
      // 2. インデックス取得  POST /sync/index/pull
      //    body: { idToken, since? }
      //    response: { data: { [cloudBookId]: { ...bookMeta } } }
      // ===================================================================
      if (path === '/sync/index/pull' && method === 'POST') {
        const { uid, error } = await authenticate(body, env, corsHeaders);
        if (error) return error;

        const { since } = body;
        let result;
        if (since) {
          // 差分取得: updated_at > since のレコードのみ返す
          result = await env.DB.prepare(
            'SELECT index_data FROM user_indexes WHERE user_id = ? AND updated_at > ?'
          ).bind(uid, since).first();
        } else {
          result = await env.DB.prepare(
            'SELECT index_data FROM user_indexes WHERE user_id = ?'
          ).bind(uid).first();
        }

        let data = {};
        if (result?.index_data) {
          try {
            data = JSON.parse(result.index_data);
          } catch (_) {
            data = result.index_data;
          }
        }

        return new Response(JSON.stringify({ data }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // ===================================================================
      // 3. インデックス保存  POST /sync/index/push
      //    body: { idToken, indexDelta, updatedAt }
      //    response: { data: { success: true } }
      // ===================================================================
      if (path === '/sync/index/push' && method === 'POST') {
        const { uid, error } = await authenticate(body, env, corsHeaders);
        if (error) return error;

        const { indexDelta, updatedAt } = body;
        if (!indexDelta) {
          return new Response(
            JSON.stringify({ error: 'indexDelta is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        // 既存データとマージ（差分更新）
        const existing = await env.DB.prepare(
          'SELECT index_data FROM user_indexes WHERE user_id = ?'
        ).bind(uid).first();

        let merged = {};
        if (existing?.index_data) {
          try { merged = JSON.parse(existing.index_data); } catch (_) {}
        }
        // indexDelta でマージ（新規追加 & 更新）
        const delta = typeof indexDelta === 'string' ? JSON.parse(indexDelta) : indexDelta;
        Object.assign(merged, delta);

        const dataStr = JSON.stringify(merged);
        const ts = updatedAt ?? Date.now();

        await env.DB.prepare(
          'INSERT OR REPLACE INTO user_indexes (user_id, index_data, updated_at) VALUES (?, ?, ?)'
        ).bind(uid, dataStr, ts).run();

        return new Response(JSON.stringify({ data: { success: true, updatedAt: ts } }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // ===================================================================
      // 4. 読書状態取得  POST /sync/state/pull
      //    body: { idToken, cloudBookId }
      //    response: { data: { ...state } }
      // ===================================================================
      if (path === '/sync/state/pull' && method === 'POST') {
        const { uid, error } = await authenticate(body, env, corsHeaders);
        if (error) return error;

        const { cloudBookId } = body;
        if (!cloudBookId) {
          return new Response(
            JSON.stringify({ error: 'cloudBookId is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        const result = await env.DB.prepare(
          'SELECT state_data FROM book_states WHERE user_id = ? AND book_id = ?'
        ).bind(uid, cloudBookId).first();

        let data = {};
        if (result?.state_data) {
          try { data = JSON.parse(result.state_data); } catch (_) { data = result.state_data; }
        }

        return new Response(JSON.stringify({ data }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // ===================================================================
      // 5. 読書状態保存  POST /sync/state/push
      //    body: { idToken, cloudBookId, state, updatedAt }
      //    response: { data: { success: true } }
      // ===================================================================
      if (path === '/sync/state/push' && method === 'POST') {
        const { uid, error } = await authenticate(body, env, corsHeaders);
        if (error) return error;

        const { cloudBookId, state, updatedAt } = body;
        if (!cloudBookId || !state) {
          return new Response(
            JSON.stringify({ error: 'cloudBookId and state are required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        const dataStr = typeof state === 'string' ? state : JSON.stringify(state);
        const ts = updatedAt ?? Date.now();

        await env.DB.prepare(
          'INSERT OR REPLACE INTO book_states (user_id, book_id, state_data, updated_at) VALUES (?, ?, ?, ?)'
        ).bind(uid, cloudBookId, dataStr, ts).run();

        return new Response(JSON.stringify({ data: { success: true, updatedAt: ts } }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // ===================================================================
      // 404 — 未定義のエンドポイント
      // ===================================================================
      return new Response(
        JSON.stringify({ error: `Not Found: ${method} ${path}` }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );

    } catch (error) {
      console.error('[Worker] Unhandled error:', error);
      return new Response(
        JSON.stringify({ error: error.message, stack: error.stack }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  },
};
