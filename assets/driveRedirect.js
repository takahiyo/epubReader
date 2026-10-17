import { driveError, DRIVE_SCOPE } from './googleDrive.js';
import { WORKERS_CONFIG } from './constants/runtime-config.js';

const TRANSACTION_KEY = 'bookreader.drive.redirect';
const MAX_AGE = 10 * 60 * 1000;
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const endpoint = config => config.tokenEndpoint || new URL('/oauth/drive', WORKERS_CONFIG.SYNC_ENDPOINT).href;

export function usesDriveRedirect(config, platform = globalThis.navigator) {
  if (config.selectionMode) return config.selectionMode === 'redirect';
  return /iPad|iPhone|iPod/.test(platform?.userAgent || '') ||
    (/Macintosh/.test(platform?.userAgent || '') && platform?.maxTouchPoints > 1);
}

// Prepare before the final button press; navigation then needs no popup or third-party cookies.
export async function prepareDriveRedirect(config, account, signal) {
  const response = await fetch(endpoint(config) + '/config', { signal, cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw driveError('redirectConfig');
  const { redirectUri } = await response.json();
  const expected = new URL('./', location.href).href;
  if (redirectUri !== expected) throw driveError('redirectConfig');
  const verifier = random();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const transaction = { state: 'brdrive_' + random(), verifier, userId: account.userId, redirectUri, createdAt: Date.now() };
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri,
    response_type: 'code', scope: DRIVE_SCOPE, prompt: 'consent', trigger_onepick: 'true',
    include_granted_scopes: 'false', state: transaction.state,
    code_challenge: challenge, code_challenge_method: 'S256',
    ...(account.userEmail ? { login_hint: account.userEmail } : {}) }).toString();
  return () => {
    if (signal.aborted) return;
    try { sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction)); }
    catch { throw driveError('redirectStorage'); }
    location.assign(url.href);
  };
}

export function consumeDriveReturn(result = globalThis.bookReaderDriveReturn, storage, now = Date.now()) {
  if (!result) return null;
  delete globalThis.bookReaderDriveReturn;
  try {
    storage ||= globalThis.sessionStorage;
    const transaction = JSON.parse(storage.getItem(TRANSACTION_KEY));
    storage.removeItem(TRANSACTION_KEY);
    if (!transaction || result.state !== transaction.state || !Number.isFinite(transaction.createdAt) ||
        now - transaction.createdAt > MAX_AGE || now < transaction.createdAt || !transaction.userId ||
        typeof transaction.verifier !== 'string' || !/^[\w-]{43}$/.test(transaction.verifier)) throw Error();
    if (result.error) return { error: result.error === 'access_denied' ? 'cancelled' : 'permission' };
    if (!result.code || !result.scope?.split(' ').includes(DRIVE_SCOPE) || !/^[\w-]{1,256}$/.test(result.picked_file_ids || '')) throw Error();
    return { ...transaction, code: result.code, fileId: result.picked_file_ids };
  } catch { return { error: 'redirectState' }; }
}

export async function exchangeDriveReturn(config, returned, idToken, signal) {
  if (!idToken) throw driveError('permission');
  const response = await fetch(endpoint(config) + '/token', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
    cache: 'no-store', credentials: 'omit',
    body: JSON.stringify({ code: returned.code, verifier: returned.verifier, redirectUri: returned.redirectUri }) });
  if (!response.ok) throw driveError(response.status === 503 ? 'redirectConfig' : 'permission');
  const { access_token } = await response.json();
  if (!access_token) throw driveError('permission');
  return access_token;
}
