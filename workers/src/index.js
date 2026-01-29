// workers/src/index.js

export default {
  async fetch(request, env, ctx) {
    // CORS対応
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const pathParam = url.searchParams.get("path");
      const body = await request.json();
      const { idToken, ...data } = body;

      // 簡易認証チェック (UIDの抽出)
      if (!idToken) return errorResponse("Missing ID Token", 401);
      const uid = getUidFromToken(idToken);
      if (!uid) return errorResponse("Invalid Token Format", 400);

      // D1バインディングの確認
      if (!env.DB) return errorResponse("Server Config Error: DB Not Bound", 500);

      let result;
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
          return errorResponse("Unknown Path", 404);
      }

      return jsonResponse({ data: result });

    } catch (err) {
      return errorResponse(err.message, 500);
    }
  },
};

// ==========================================
// D1 操作ロジック
// ==========================================

// 書籍状態の取得
async function pullStateD1(db, uid, bookId) {
  const result = await db.prepare(`
    SELECT data FROM book_states WHERE user_id = ? AND book_id = ?
  `).bind(uid, bookId).first();

  if (!result) return {};
  return JSON.parse(result.data);
}

// 書籍状態の保存 (Upsert)
async function pushStateD1(db, uid, bookId, state, updatedAt) {
  const json = JSON.stringify(state);
  await db.prepare(`
    INSERT INTO book_states (user_id, book_id, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, book_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).bind(uid, bookId, json, updatedAt).run();

  return { status: "success", source: "d1" };
}

// インデックスの取得 (差分同期対応)
async function pullIndexD1(db, uid, since = null) {
  const result = await db.prepare(`
    SELECT data, updated_at FROM user_indexes WHERE user_id = ?
  `).bind(uid).first();

  if (!result || !result.data) return { index: {}, updatedAt: 0 };

  const dbUpdatedAt = result.updated_at;
  
  // クライアントが持っているデータが最新なら中身を返さない
  if (since && dbUpdatedAt <= since) {
    return { unchanged: true, updatedAt: dbUpdatedAt };
  }

  try {
    const payload = JSON.parse(result.data);
    return {
      index: payload?.index || payload || {},
      updatedAt: dbUpdatedAt,
    };
  } catch (e) {
    return { index: {}, updatedAt: dbUpdatedAt };
  }
}

// インデックスの保存 (マージして保存)
async function pushIndexD1(db, uid, indexDelta, updatedAt) {
  // 1. 現在のデータを取得
  const current = await pullIndexD1(db, uid);
  const currentIndex = current.index || {};

  // 2. マージ (deltaを上書き)
  const newIndex = { ...currentIndex, ...indexDelta };
  
  // 3. 保存するオブジェクト全体を構築
  const payload = { index: newIndex, updatedAt };
  const json = JSON.stringify(payload);

  // 4. D1に保存
  await db.prepare(`
    INSERT INTO user_indexes (user_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).bind(uid, json, updatedAt).run();

  return { status: "success", source: "d1" };
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

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*" 
    }
  });
}

function errorResponse(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 
      "Content-Type": "application/json", 
      "Access-Control-Allow-Origin": "*" 
    }
  });
}
