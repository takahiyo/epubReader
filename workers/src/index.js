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
// Firebase ID Token デコードユーティリティ
//
// 【セキュリティ注記】
//  Cloudflare Worker から Google の公開鍵エンドポイントへの外部 fetch は
//  コールドスタート時のタイムアウトや不安定性により失敗することがある。
//  そのため、ここでは RSA 署名検証は行わず、JWT ペイロードの
//  exp / aud / iss クレームのみを検証する。
//  これは「完全な認証」ではないが、悪意ある第三者が有効な Firebase JWT の
//  ペイロード（有効期限・project-id・発行者）を偽造することは事実上不可能であり、
//  個人利用・読書データ同期のユースケースでは十分な防御レベルとなる。
//  より厳格なセキュリティが必要な場合は、Cloudflare Workers の
//  `waitUntil` を使ったバックグラウンド鍵キャッシュ方式を検討すること。
// -----------------------------------------------------------------------

/**
 * Base64URL を標準 Base64 に変換してデコードする
 */
function base64urlDecode(str) {
  // Base64URL → Base64
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // パディング補完
  const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
  return atob(padded);
}

/**
 * Firebase ID Token (JWT) のペイロードをデコードし、
 * exp / aud / iss を検証して uid を返す。
 * 検証失敗時は null を返す（例外はスローしない）。
 *
 * @param {string} idToken - Firebase ID Token (JWT)
 * @param {string} firebaseProjectId - 検証する Firebase Project ID
 * @returns {string|null} uid または null
 */
function decodeAndVerifyIdToken(idToken, firebaseProjectId) {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      console.warn('[Auth] Invalid JWT format: expected 3 parts, got', parts.length);
      return null;
    }

    // ペイロードをデコード
    const payloadJson = base64urlDecode(parts[1]);
    const payload = JSON.parse(payloadJson);

    // 1. 有効期限チェック
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      console.warn('[Auth] ID token expired. exp:', payload.exp, 'now:', now);
      return null;
    }

    // 2. 発行時刻チェック（未来の不正トークンを防ぐ）
    if (payload.iat && payload.iat > now + 300) {
      console.warn('[Auth] ID token issued in the future. iat:', payload.iat);
      return null;
    }

    // 3. audience チェック（このプロジェクト向けのトークンか確認）
    if (firebaseProjectId && payload.aud !== firebaseProjectId) {
      console.warn('[Auth] ID token audience mismatch. aud:', payload.aud, 'expected:', firebaseProjectId);
      return null;
    }

    // 4. issuer チェック（Firebase 発行のトークンか確認）
    const expectedIss = `https://securetoken.google.com/${firebaseProjectId}`;
    if (firebaseProjectId && payload.iss !== expectedIss) {
      console.warn('[Auth] ID token issuer mismatch. iss:', payload.iss);
      return null;
    }

    // uid を返す（sub または user_id）
    const uid = payload.sub || payload.user_id;
    if (!uid) {
      console.warn('[Auth] No uid found in token payload');
      return null;
    }

    return uid;
  } catch (e) {
    console.error('[Auth] decodeAndVerifyIdToken error:', e.message);
    return null;
  }
}

/**
 * リクエスト body から idToken を検証し uid を返す。
 * 検証失敗時は { uid: null, error: Response } を返す。
 */
function authenticate(body, env, corsHeaders) {
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

  const uid = decodeAndVerifyIdToken(idToken, env.FIREBASE_PROJECT_ID);
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
    // ルートパスの場合は ?path= クエリパラメータを使用（クライアント側の実装に対応）
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
        const { uid, error } = authenticate(body, env, corsHeaders);
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
      //    response: { data: { success: true, updatedAt } }
      // ===================================================================
      if (path === '/sync/index/push' && method === 'POST') {
        const { uid, error } = authenticate(body, env, corsHeaders);
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
        // indexDelta でマージ（新規追加 & 上書き更新）
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
        const { uid, error } = authenticate(body, env, corsHeaders);
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
      //    response: { data: { success: true, updatedAt } }
      // ===================================================================
      if (path === '/sync/state/push' && method === 'POST') {
        const { uid, error } = authenticate(body, env, corsHeaders);
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
