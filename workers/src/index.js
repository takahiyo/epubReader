// ==========================================
// メイン処理
// ==========================================
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

      if (!idToken) return errorResponse("Missing ID Token", 401);

      const uid = getUidFromToken(idToken);
      if (!uid) return errorResponse("Invalid Token Format", 400);

      // 環境変数からプロジェクトIDを取得
      const projectId = env.FIREBASE_PROJECT_ID;
      if (!projectId) return errorResponse("Server Config Error: Missing Project ID", 500);

      // KVバインディングの確認
      if (!env.KV) return errorResponse("Server Config Error: KV Not Bound", 500);

      let result;
      switch (pathParam) {
        case "/sync/state/pull":
          // Read-through: KV -> (miss) -> Firestore -> KV
          result = await pullStateWithCache(env, ctx, projectId, uid, data.cloudBookId, idToken);
          break;
        case "/sync/state/push":
          // Write-through: Firestore -> KV Update
          result = await pushStateWithCache(env, ctx, projectId, uid, data.cloudBookId, data.state, idToken);
          break;
        case "/sync/index/pull":
          // Read-through
          result = await pullIndexWithCache(env, ctx, projectId, uid, idToken);
          break;
        case "/sync/index/push":
          // Write-through
          result = await pushIndexWithCache(env, ctx, projectId, uid, data.indexDelta, data.updatedAt, idToken);
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
// KV キャッシュ制御定数・ヘルパー
// ==========================================
const CACHE_TTL = 60; // 60秒キャッシュ

// キー生成ヘルパー
function getKvKey(uid, type, id = "") {
  return `user:${uid}:${type}${id ? ":" + id : ""}`;
}

// ==========================================
// キャッシュ制御付きロジック (KV + Firestore)
// ==========================================

async function pullStateWithCache(env, ctx, projectId, uid, bookId, token) {
  const key = getKvKey(uid, "book", bookId);
  
  // 1. KVから取得 (高速応答)
  const cached = await env.KV.get(key, { type: "json" });
  if (cached) {
    return cached;
  }

  // 2. キャッシュミス時はFirestoreから取得
  const data = await pullState(projectId, uid, bookId, token);

  // 3. KVに保存 (バックグラウンドで実行)
  if (data && Object.keys(data).length > 0) {
    ctx.waitUntil(env.KV.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL }));
  }
  
  return data;
}

async function pushStateWithCache(env, ctx, projectId, uid, bookId, state, token) {
  // 1. Firestoreに書き込み (正)
  const result = await pushState(projectId, uid, bookId, state, token);

  // 2. KVを即座に更新 (Write-through)
  const key = getKvKey(uid, "book", bookId);
  await env.KV.put(key, JSON.stringify(state), { expirationTtl: CACHE_TTL });

  return result;
}

async function pullIndexWithCache(env, ctx, projectId, uid, token) {
  const key = getKvKey(uid, "index");

  // 1. KVから取得
  const cached = await env.KV.get(key, { type: "json" });
  if (cached) {
    return cached;
  }

  // 2. キャッシュミス時はFirestoreから取得
  const data = await pullIndex(projectId, uid, token);
  
  // 3. KVに保存
  if (data) {
    ctx.waitUntil(env.KV.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL }));
  }
  return data;
}

async function pushIndexWithCache(env, ctx, projectId, uid, indexDelta, updatedAt, token) {
  // 1. 最新のインデックスを取得 (KV or Firestore)
  const current = await pullIndexWithCache(env, ctx, projectId, uid, token);
  
  // 2. マージ
  const newIndex = { ...(current.index || {}), ...indexDelta };
  const finalPayload = { index: newIndex, updatedAt };

  // 3. Firestoreに完全なデータを保存
  await pushIndexFull(projectId, uid, finalPayload, token);

  // 4. KVを更新 (完成形をセット)
  const key = getKvKey(uid, "index");
  await env.KV.put(key, JSON.stringify(finalPayload), { expirationTtl: CACHE_TTL });

  return { status: "success", source: "workers-kv" };
}

// ==========================================
// Firestore 操作ロジック
// ==========================================
function getBaseUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function pullState(projectId, uid, bookId, token) {
  const url = `${getBaseUrl(projectId)}/users/${uid}/books/${bookId}`;
  const res = await fetchFirestore(url, "GET", null, token);
  if (res.error) {
    if (res.error.code === 404) return {};
    throw new Error(res.error.message);
  }
  return convertFromFirestore(res.fields || {});
}

async function pushState(projectId, uid, bookId, state, token) {
  const url = `${getBaseUrl(projectId)}/users/${uid}/books/${bookId}`;
  const fields = convertToFirestore(state);
  const keys = Object.keys(state);
  const updateMask = keys.map(k => `updateMask.fieldPaths=${k}`).join("&");
  
  const res = await fetchFirestore(`${url}?${updateMask}`, "PATCH", { fields }, token);
  if (res.error) throw new Error(res.error.message);
  return { status: "success", source: "workers" };
}

async function pullIndex(projectId, uid, token) {
  const url = `${getBaseUrl(projectId)}/users/${uid}/appData/index`;
  const res = await fetchFirestore(url, "GET", null, token);
  if (res.error) {
    if (res.error.code === 404) return { index: {} };
    return { index: {} };
  }
  return convertFromFirestore(res.fields || {});
}

// 内部ヘルパー: 完全なIndexデータをFirestoreに保存
async function pushIndexFull(projectId, uid, fullIndexData, token) {
  const url = `${getBaseUrl(projectId)}/users/${uid}/appData/index`;
  const fields = convertToFirestore(fullIndexData);
  
  // 全フィールドを更新対象にする
  const updateMask = "updateMask.fieldPaths=index&updateMask.fieldPaths=updatedAt";
  
  const res = await fetchFirestore(`${url}?${updateMask}`, "PATCH", { fields }, token);
  if (res.error) throw new Error(res.error.message);
  return { status: "success" };
}

// ==========================================
// ユーティリティ
// ==========================================
async function fetchFirestore(url, method, body, token) {
  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) {
    return { error: json.error || { code: res.status, message: res.statusText } };
  }
  return json;
}

function getUidFromToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.user_id || payload.sub;
  } catch (e) {
    return null;
  }
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function errorResponse(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function convertToFirestore(obj) {
  if (obj === null || obj === undefined) return { nullValue: null };
  if (typeof obj === 'string') return { stringValue: obj };
  if (typeof obj === 'boolean') return { booleanValue: obj };
  if (typeof obj === 'number') {
    if (Number.isInteger(obj)) return { integerValue: obj };
    return { doubleValue: obj };
  }
  if (Array.isArray(obj)) return { arrayValue: { values: obj.map(convertToFirestore) } };
  if (typeof obj === 'object') {
    const fields = {};
    Object.keys(obj).forEach(k => fields[k] = convertToFirestore(obj[k]));
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function convertFromFirestore(fields) {
  const obj = {};
  Object.keys(fields).forEach(key => obj[key] = parseValue(fields[key]));
  return obj;
}

function parseValue(val) {
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.doubleValue !== undefined) return Number(val.doubleValue);
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.nullValue !== undefined) return null;
  if (val.arrayValue !== undefined) return (val.arrayValue.values || []).map(parseValue);
  if (val.mapValue !== undefined) return convertFromFirestore(val.mapValue.fields || {});
  return null;
}
