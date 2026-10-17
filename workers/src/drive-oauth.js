import { GOOGLE_DRIVE_CONFIG } from '../../assets/constants/google-drive.js';
import { verifyIdToken } from './auth.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Isolated from sync's wildcard CORS. No authorization codes, secrets or tokens are logged or stored. */
export async function handleDriveOAuth(request, env, { fetchImpl = fetch, verify = verifyIdToken } = {}) {
  const url = new URL(request.url);
  const redirectUri = env.DRIVE_REDIRECT_URI;
  let origin;
  try { origin = new URL(redirectUri).origin; } catch { /* disabled until configured */ }
  const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache', Vary: 'Origin',
    'Content-Type': 'application/json', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  const reply = (status, data) => Response.json(data, { status, headers });
  if (!origin || request.headers.get('Origin') !== origin) return reply(403, { error: 'origin' });
  headers['Access-Control-Allow-Origin'] = origin;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!env.DRIVE_CLIENT_SECRET) return reply(503, { error: 'not_configured' });
  if (url.pathname === '/oauth/drive/config' && request.method === 'GET') return reply(200, { redirectUri });
  if (url.pathname !== '/oauth/drive/token' || request.method !== 'POST') return reply(404, { error: 'not_found' });
  const idToken = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!idToken || !await verify(idToken, env.FIREBASE_PROJECT_ID)) return reply(401, { error: 'unauthorized' });
  try {
    // Bound streamed bodies too. Do not let requests cause large allocations or arbitrary token exchanges.
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { error: 'invalid_request' });
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return reply(413, { error: 'too_large' }); }
      chunks.push(value);
    }
    const body = JSON.parse(await new Blob(chunks).text());
    if (body.redirectUri !== redirectUri || typeof body.code !== 'string' || !body.code || body.code.length > 4096 ||
        !/^[\w-]{43}$/.test(body.verifier || '')) return reply(400, { error: 'invalid_request' });
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: body.code,
        client_id: GOOGLE_DRIVE_CONFIG.clientId, client_secret: env.DRIVE_CLIENT_SECRET,
        redirect_uri: redirectUri, code_verifier: body.verifier }),
      signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    if (!response.ok) return reply(400, { error: 'authorization_failed' });
    const token = await response.json();
    if (!token.access_token || !token.scope?.split(' ').includes(SCOPE) ||
        token.token_type?.toLowerCase() !== 'bearer') return reply(403, { error: 'scope' });
    return reply(200, { access_token: token.access_token });
  } catch { return reply(400, { error: 'authorization_failed' }); }
}
