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

import { verifyIdToken } from './auth.js';
import { mergeCloudStates } from '../../assets/js/core/cloud-state-merge.js';
const API_LIMITS = Object.freeze({ maxBodyBytes: 1048576, casRetries: 5 });

/** Optimistic compare-and-swap prevents concurrent JSON updates from dropping another device's edits. */
async function updateJsonRecord(db, table, column, keys, merge) {
  const names = Object.keys(keys);
  const values = Object.values(keys);
  const where = names.map(name => `${name} = ?`).join(' AND ');
  for (let attempt = 0; attempt < API_LIMITS.casRetries; attempt++) {
    const existing = await db.prepare(`SELECT ${column}, updated_at FROM ${table} WHERE ${where}`).bind(...values).first();
    const previous = existing?.[column] ?? null;
    const data = merge(previous ? JSON.parse(previous) : {});
    const updatedAt = Math.max(Date.now(), (existing?.updated_at ?? 0) + 1);
    const serialized = JSON.stringify(data);
    const result = existing
      ? await db.prepare(`UPDATE ${table} SET ${column} = ?, updated_at = ? WHERE ${where} AND ${column} IS ?`)
          .bind(serialized, updatedAt, ...values, previous).run()
      : await db.prepare(`INSERT OR IGNORE INTO ${table} (${names.join(', ')}, ${column}, updated_at) VALUES (${[...values, serialized, updatedAt].map(() => '?').join(', ')})`)
          .bind(...values, serialized, updatedAt).run();
    if (result.meta?.changes > 0) return { data, updatedAt };
  }
  throw new Error('Concurrent update; retry request');
}

/**
 * リクエスト body から idToken を検証し uid を返す。
 * 検証失敗時は { uid: null, error: Response } を返す。
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

    // ===================================================================
    // 0. CORSプロキシ  GET /proxy?url=<target>
    //    Web小説（なろう・カクヨム）のHTML取得に使用。
    //    悪用防止のため、許可ドメインのみに限定する。
    //    ※ 認証不要（未ログインユーザーでもWeb小説機能は利用可能とする）
    // ===================================================================
    if (path === '/proxy' && method === 'GET') {
      const targetUrl = url.searchParams.get('url');

      // パラメータ検証
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ error: 'url パラメータが必要です' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // URLの妥当性チェック
      let parsedTarget;
      try {
        parsedTarget = new URL(targetUrl);
      } catch (_) {
        return new Response(
          JSON.stringify({ error: '不正なURLです' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // 許可ドメインの制限（オープンプロキシ化を防止）
      const ALLOWED_DOMAINS = [
        'ncode.syosetu.com',   // 小説家になろう（目次・本文）
        'yomou.syosetu.com',   // 小説家になろう（検索）
        'kakuyomu.jp',         // カクヨム（検索・目次・本文）
      ];
      const isAllowed = ALLOWED_DOMAINS.some(
        domain => parsedTarget.hostname === domain || parsedTarget.hostname.endsWith('.' + domain)
      );
      if (!isAllowed || parsedTarget.protocol !== 'https:') {
        return new Response(
          JSON.stringify({ error: `許可されていないドメインです: ${parsedTarget.hostname}` }),
          { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // ターゲットへのfetch（User-Agent偽装でボット対策を回避）
      try {
        const proxyResponse = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en;q=0.5',
          },
          redirect: 'error',
        });

        // レスポンスヘッダーにCORSを付与して返す
        const responseHeaders = new Headers(proxyResponse.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        // キャッシュ制御（短時間キャッシュを許可して負荷軽減）
        responseHeaders.set('Cache-Control', 'public, max-age=300');

        return new Response(proxyResponse.body, {
          status: proxyResponse.status,
          headers: responseHeaders,
        });
      } catch (proxyErr) {
        console.error('[Worker] Proxy fetch error:', proxyErr.message);
        return new Response(
          JSON.stringify({ error: `プロキシ取得に失敗しました: ${proxyErr.message}` }),
          { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    try {
      // POST body を1回だけ安全に読み取る
      let body = {};
      if (method === 'POST') {
        try {
          // Bound streamed bodies as well as Content-Length; anonymous diagnostics share this limit.
          const reader = request.body?.getReader();
          const chunks = [];
          let size = 0;
          if (reader) while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > API_LIMITS.maxBodyBytes) {
              await reader.cancel();
              return new Response('Request too large', { status: 413, headers: corsHeaders });
            }
            chunks.push(value);
          }
          body = JSON.parse(await new Blob(chunks).text());
          if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid body');
        } catch (e) {
          return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
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

        // Full indexes avoid client-clock cursors hiding edits from another device.
        const result = await env.DB.prepare(
          'SELECT index_data FROM user_indexes WHERE user_id = ?'
        ).bind(uid).first();

        let data = {};
        if (result?.index_data) {
          try {
            data = JSON.parse(result.index_data);
          } catch (_) {
            data = result.index_data;
          }
        }

        // State versions use server commit time, independent of client clocks and metadata edits.
        const versions = await env.DB.prepare('SELECT book_id, updated_at FROM book_states WHERE user_id = ?').bind(uid).all();
        for (const row of versions.results ?? []) {
          if (data[row.book_id]) data[row.book_id].stateUpdatedAt = row.updated_at;
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
        const { uid, error } = await authenticate(body, env, corsHeaders);
        if (error) return error;

        const { indexDelta, updatedAt } = body;
        if (!indexDelta) {
          return new Response(
            JSON.stringify({ error: 'indexDelta is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        const delta = typeof indexDelta === 'string' ? JSON.parse(indexDelta) : indexDelta;
        if (!delta || Array.isArray(delta) || typeof delta !== 'object') {
          return new Response('Invalid index', { status: 400, headers: corsHeaders });
        }
        const result = await updateJsonRecord(env.DB, 'user_indexes', 'index_data', { user_id: uid }, existing => {
          const merged = { ...existing };
          for (const [id, meta] of Object.entries(delta)) {
            if (!meta || typeof meta !== 'object') continue;
            if (!merged[id] || (meta.updatedAt ?? 0) >= (merged[id].updatedAt ?? 0)) {
              merged[id] = { ...merged[id], ...meta, cloudBookId: id };
            }
          }
          return merged;
        });
        const ts = result.updatedAt;

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
      //    response: { data: { success: true, updatedAt } }
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

        const incoming = typeof state === 'string' ? JSON.parse(state) : state;
        if (!incoming || Array.isArray(incoming) || typeof incoming !== 'object' ||
            (incoming.bookmarks != null && !Array.isArray(incoming.bookmarks))) {
          return new Response('Invalid state', { status: 400, headers: corsHeaders });
        }
        incoming.updatedAt = Number(updatedAt ?? incoming.updatedAt) || 0;
        const result = await updateJsonRecord(env.DB, 'book_states', 'state_data',
          { user_id: uid, book_id: cloudBookId }, existing => mergeCloudStates(existing, incoming));
        return new Response(JSON.stringify({ data: { success: true, state: result.data, updatedAt: result.data.updatedAt } }), {
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
        JSON.stringify({ error: 'Request failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  },
};
