// workers/src/index.js

/**
 * D1データベーステーブル定義 (SSOT)
 * @constant {Object} D1_TABLES
 * @property {string} userIndexes - ユーザーの書籍インデックステーブル
 * @property {string} bookStates - 書籍の読書状態テーブル
 */
const D1_TABLES = Object.freeze({
  userIndexes: "user_indexes",
  bookStates: "book_states",
});

// テーブル存在チェックはリクエスト毎に繰り返さないようキャッシュ
let tableCheckPromise = null;

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = buildCorsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      if (!env.DB) {
        return errorResponse("Server Config Error: DB binding not found.", 500, corsHeaders);
      }

      await ensureTables(env.DB);

      const url = new URL(request.url);
      const pathParam = url.searchParams.get("path");
      const body = await request.json();
      const { idToken, ...data } = body;

      // 簡易認証チェック (UIDの抽出)
      if (!idToken) return errorResponse("Missing ID Token", 401, corsHeaders);
      const uid = getUidFromToken(idToken);
      if (!uid) return errorResponse("Invalid Token Format", 400, corsHeaders);

      let result;
      try {
        switch (pathParam) {
          case "/sync/state/pull":
            result = await pullStateD1(env.DB, uid, data.cloudBookId);
            break;
          case "/sync/state/push":
            result = await pushStateD1(env.DB, uid, data.cloudBookId, data.state, data.updatedAt);
            break;
          case "/sync/index/pull":
            result = await pullIndexD1(env.DB, uid, data.since ?? null);
            break;
          case "/sync/index/push":
            result = await pushIndexD1(env.DB, uid, data.indexDelta, data.updatedAt);
            break;
          default:
            return errorResponse("Unknown Path", 404, corsHeaders);
        }
      } catch (dbError) {
        console.error("Database Error:", dbError.message);
        return errorResponse(`Database failed: ${dbError.message}`, 500, corsHeaders);
      }

      return jsonResponse({ data: result }, corsHeaders);
    } catch (err) {
      return errorResponse(err.message, 500, corsHeaders);
    }
  },
};

// ==========================================
// D1 操作ロジック
// ==========================================

// 書籍状態の取得
/**
 * D1から書籍の読書状態を取得します
 * @param {D1Database} db - D1データベースインスタンス
 * @param {string} uid - ユーザーID
 * @param {string} bookId - 書籍ID (cloudBookId)
 * @returns {Promise<Object>} 書籍の状態データ (なければ空オブジェクト)
 */
async function pullStateD1(db, uid, bookId) {
  console.log(`[pullStateD1] Fetching state for user: ${uid}, book: ${bookId}`);
  const result = await db.prepare(`
    SELECT data FROM ${D1_TABLES.bookStates} WHERE user_id = ? AND book_id = ?
  `)
    .bind(uid, bookId)
    .first();

  if (!result) {
    console.log(`[pullStateD1] No state found for book: ${bookId}`);
    return {};
  }
  const parsed = JSON.parse(result.data);
  console.log(`[pullStateD1] State retrieved for book: ${bookId}`, parsed);
  return parsed;
}

// 書籍状態の保存 (Upsert)
/**
 * 書籍の読書状態をD1に保存します (存在する場合は更新)
 * @param {D1Database} db - D1データベースインスタンス
 * @param {string} uid - ユーザーID
 * @param {string} bookId - 書籍ID (cloudBookId)
 * @param {Object} state - 書籍の状態データ
 * @param {number} updatedAt - 更新日時 (UNIX timestamp)
 * @returns {Promise<Object>} 処理結果
 */
async function pushStateD1(db, uid, bookId, state, updatedAt) {
  console.log(`[pushStateD1] Saving state for user: ${uid}, book: ${bookId}`);
  const json = JSON.stringify(state);
  console.log(`[pushStateD1] State data size: ${json.length} bytes, updatedAt: ${updatedAt}`);
  
  const result = await db.prepare(`
    INSERT INTO ${D1_TABLES.bookStates} (user_id, book_id, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, book_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `)
    .bind(uid, bookId, json, updatedAt)
    .run();

  console.log(`[pushStateD1] State saved successfully. Changes: ${result.changes}, LastRowId: ${result.lastRowId}`);
  return { status: "success", source: "d1", changes: result.changes };
}

// インデックスの取得 (差分同期対応)
/**
 * ユーザーの書籍インデックスをD1から取得します
 * @param {D1Database} db - D1データベースインスタンス
 * @param {string} uid - ユーザーID
 * @param {number|null} since - クライアントが持つ最終更新時刻 (差分同期用)
 * @returns {Promise<Object>} インデックスデータと更新時刻
 */
async function pullIndexD1(db, uid, since = null) {
  console.log(`[pullIndexD1] Fetching index for user: ${uid}, since: ${since}`);
  const result = await db.prepare(`
    SELECT data, updated_at FROM ${D1_TABLES.userIndexes} WHERE user_id = ?
  `)
    .bind(uid)
    .first();

  if (!result || !result.data) {
    console.log(`[pullIndexD1] No index found for user: ${uid}`);
    return { index: {}, updatedAt: 0 };
  }

  const dbUpdatedAt = result.updated_at;
  console.log(`[pullIndexD1] Index found, dbUpdatedAt: ${dbUpdatedAt}, clientSince: ${since}`);
  
  // クライアントが持っているデータが最新なら中身を返さない
  if (since && dbUpdatedAt <= since) {
    console.log(`[pullIndexD1] Client data is up-to-date, returning unchanged flag`);
    return { unchanged: true, updatedAt: dbUpdatedAt };
  }

  try {
    const payload = JSON.parse(result.data);
    const indexKeys = Object.keys(payload?.index || payload || {});
    console.log(`[pullIndexD1] Returning index with ${indexKeys.length} entries, updatedAt: ${dbUpdatedAt}`);
    return {
      index: payload?.index || payload || {},
      updatedAt: dbUpdatedAt,
    };
  } catch (e) {
    console.error(`[pullIndexD1] Failed to parse index data:`, e);
    return { index: {}, updatedAt: dbUpdatedAt };
  }
}

// インデックスの保存 (マージして保存)
/**
 * ユーザーの書籍インデックスをD1に保存します (既存データとマージ)
 * @param {D1Database} db - D1データベースインスタンス
 * @param {string} uid - ユーザーID
 * @param {Object} indexDelta - 追加/更新するインデックスデータ
 * @param {number} updatedAt - 更新日時 (UNIX timestamp)
 * @returns {Promise<Object>} 処理結果
 */
async function pushIndexD1(db, uid, indexDelta, updatedAt) {
  console.log(`[pushIndexD1] Saving index for user: ${uid}, updatedAt: ${updatedAt}`);
  console.log(`[pushIndexD1] Index delta contains ${Object.keys(indexDelta || {}).length} entries`);
  
  // 1. 現在のデータを取得
  const current = await pullIndexD1(db, uid);
  const currentIndex = current.index || {};
  console.log(`[pushIndexD1] Current index has ${Object.keys(currentIndex).length} entries`);

  // 2. マージ (deltaを上書き)
  const newIndex = { ...currentIndex, ...indexDelta };
  console.log(`[pushIndexD1] Merged index has ${Object.keys(newIndex).length} entries`);
  
  // 3. 保存するオブジェクト全体を構築
  const payload = { index: newIndex, updatedAt };
  const json = JSON.stringify(payload);
  console.log(`[pushIndexD1] Saving index data: ${json.length} bytes`);

  // 4. D1に保存
  const result = await db.prepare(`
    INSERT INTO ${D1_TABLES.userIndexes} (user_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `)
    .bind(uid, json, updatedAt)
    .run();

  console.log(`[pushIndexD1] Index saved successfully. Changes: ${result.changes}, LastRowId: ${result.lastRowId}`);
  return { status: "success", source: "d1", changes: result.changes, entryCount: Object.keys(newIndex).length };
}

// ==========================================
// ユーティリティ
// ==========================================

function getUidFromToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // 開発用: 署名検証なしでペイロードからUIDを取り出す
    const payload = JSON.parse(atob(parts[1]));
    return payload.user_id || payload.sub;
  } catch (e) {
    return null;
  }
}

function jsonResponse(data, headers = buildCorsHeaders()) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function errorResponse(msg, status = 500, headers = buildCorsHeaders()) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function buildCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function ensureTables(db) {
  if (!tableCheckPromise) {
    tableCheckPromise = (async () => {
      const required = Object.values(D1_TABLES);
      const placeholders = required.map(() => "?").join(", ");
      const result = await db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
        )
        .bind(...required)
        .all();
      const existing = new Set((result?.results ?? []).map((row) => row.name));
      const missing = required.filter((name) => !existing.has(name));
      if (missing.length > 0) {
        throw new Error(`Missing D1 tables: ${missing.join(", ")}`);
      }
    })();
  }
  return tableCheckPromise;
}
