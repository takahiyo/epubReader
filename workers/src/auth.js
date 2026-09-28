/** Firebase ID-token verification for Workers; only Google's fixed key endpoint is trusted. */
const AUTH_CONFIG = Object.freeze({
  keysUrl: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  algorithm: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  defaultCacheSeconds: 300,
  timeoutMs: 10000,
  maxSubjectLength: 128,
});
let keyCache = null;
let keyFetch = null;

/** Decode base64url without accepting token-supplied key URLs. */
function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

/** Cache successful public-key fetches, sharing concurrent cold-start requests. */
async function getKeys() {
  if (keyCache?.expiresAt > Date.now()) return keyCache.keys;
  if (!keyFetch) keyFetch = (async () => {
    const response = await fetch(AUTH_CONFIG.keysUrl, { signal: AbortSignal.timeout(AUTH_CONFIG.timeoutMs) });
    if (!response.ok) throw new Error('Signing keys unavailable');
    const { keys } = await response.json();
    if (!Array.isArray(keys) || !keys.length) throw new Error('Invalid signing keys');
    const ttl = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? AUTH_CONFIG.defaultCacheSeconds);
    keyCache = { keys, expiresAt: Date.now() + ttl * 1000 };
    return keys;
  })().finally(() => { keyFetch = null; });
  return keyFetch;
}

/** Verify signature and Firebase claims; fail closed on malformed tokens or unavailable keys. */
export async function verifyIdToken(token, projectId) {
  try {
    if (typeof token !== 'string' || !projectId) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const json = part => JSON.parse(new TextDecoder().decode(decode(part)));
    const header = json(parts[0]);
    const claims = json(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= now ||
        !Number.isFinite(claims.iat) || claims.iat > now ||
        !Number.isFinite(claims.auth_time) || claims.auth_time > now) return null;
    if (typeof claims.sub !== 'string' || !claims.sub.length || claims.sub.length > AUTH_CONFIG.maxSubjectLength) return null;
    const jwk = (await getKeys()).find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk,
      { name: AUTH_CONFIG.algorithm, hash: AUTH_CONFIG.hash }, false, ['verify']);
    const valid = await crypto.subtle.verify(AUTH_CONFIG.algorithm, key, decode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return valid ? claims.sub : null;
  } catch { return null; }
}
