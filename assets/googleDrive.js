import { SUPPORTED_FORMATS } from './constants/formats.js';
import { GOOGLE_DRIVE_CONFIG } from './constants/google-drive.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_MAX_BYTES = 256 * 1024 * 1024;
export const driveError = code => Object.assign(new Error(code), { driveCode: code });
export function driveConfig() {
  // These three public identifiers must belong to the SAME Google Cloud project.
  return { ...GOOGLE_DRIVE_CONFIG, ...globalThis.APP_CONFIG?.googleDrive };
}
export function isDriveConfigured(config) {
  return Boolean(config.clientId && config.apiKey && /^\d+$/.test(config.appId || ''));
}
export function isDriveBook(name) {
  return typeof name === 'string' && [...SUPPORTED_FORMATS.EPUB, ...SUPPORTED_FORMATS.IMAGE_ARCHIVE]
    .some(extension => name.toLowerCase().endsWith(extension));
}

let sdkPromise;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(driveError('sdk')), 20000);
    function finish(error) {
      clearTimeout(timer); script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    }
    script.src = src; script.async = true;
    script.onload = () => finish(); script.onerror = () => finish(driveError('sdk'));
    document.head.append(script);
  });
}
export function prepareDrive() {
  return sdkPromise ||= Promise.all([
    globalThis.google?.accounts?.oauth2 ? null : loadScript('https://accounts.google.com/gsi/client'),
    globalThis.gapi ? null : loadScript('https://apis.google.com/js/api.js'),
  ]).then(() => new Promise((resolve, reject) => {
    gapi.load('picker', { callback: resolve, onerror: () => reject(driveError('sdk')),
      timeout: 20000, ontimeout: () => reject(driveError('sdk')) });
  })).catch(error => { sdkPromise = null; throw error; });
}

// Called synchronously from a button gesture AFTER SDK preparation, for popup compatibility.
// OAuth tokens live only inside this request and never enter settings, logs or cloud sync.
export function authorizeDrive(config, email, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, token) => {
      if (settled) return; settled = true;
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve(token);
    };
    const abort = () => finish(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      google.accounts.oauth2.initTokenClient({ client_id: config.clientId, scope: DRIVE_SCOPE,
        include_granted_scopes: false, hint: email || undefined,
        callback: response => {
          if (response.error || !response.access_token || !google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
            finish(driveError('permission'));
          } else finish(null, response.access_token);
        },
        error_callback: response => finish(driveError(response.type === 'popup_closed' ? 'cancelled' : 'popup')),
      }).requestAccessToken({ prompt: '' });
    } catch { finish(driveError('popup')); }
  });
}

export function selectDriveBook(config, token, language, signal) {
  return new Promise((resolve, reject) => {
    let picker, settled = false;
    const finish = (error, document) => {
      if (settled) return; settled = true;
      signal.removeEventListener('abort', abort); picker?.dispose();
      error ? reject(error) : resolve(document);
    };
    const abort = () => finish(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      // Do not MIME-filter: many uploaded EPUB/CBZ/CBR files are octet-stream.
      const view = new google.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false);
      picker = new google.picker.PickerBuilder().addView(view)
        .setDeveloperKey(config.apiKey).setAppId(config.appId).setOAuthToken(token)
        .setOrigin(location.origin).setLocale(language === 'ja' ? 'ja' : 'en')
        .setSize(Math.max(280, Math.min(960, innerWidth - 24)), Math.max(320, innerHeight - 40))
        .setCallback(data => {
          if (data.action === google.picker.Action.CANCEL) finish(null, null);
          if (data.action === google.picker.Action.PICKED) finish(null, data.docs?.[0]);
          if (data.action === 'error') finish(driveError('permission'));
        }).build();
      picker.setVisible(true);
    } catch { finish(driveError('sdk')); }
  });
}

/** Download only from the fixed Drive endpoint; never use Picker-supplied download URLs. */
export async function downloadDriveBook(selected, token, { signal, onProgress = () => {}, fetchImpl = fetch } = {}) {
  if (!selected?.id || !isDriveBook(selected.name)) throw driveError('format');
  const endpoint = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(selected.id);
  const headers = { Authorization: 'Bearer ' + token };
  if (selected.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = selected.id + '/' + selected.resourceKey;
  const request = async suffix => {
    const response = await fetchImpl(endpoint + suffix, { headers, signal, cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw driveError(response.status === 401 ? 'expired' : response.status === 403 ? 'permission' : response.status === 404 ? 'missing' : 'network');
    return response;
  };
  const metadata = await (await request('?fields=id,name,size,mimeType,capabilities(canDownload)&supportsAllDrives=true')).json();
  if (!isDriveBook(metadata.name) || metadata.mimeType?.startsWith('application/vnd.google-apps.')) throw driveError('format');
  if (metadata.capabilities?.canDownload === false) throw driveError('permission');
  const size = Number(metadata.size) || 0;
  if (size > DRIVE_MAX_BYTES) throw driveError('size');
  const response = await request('?alt=media&supportsAllDrives=true');
  if (!response.body) throw driveError('network');
  const reader = response.body.getReader(), chunks = [];
  let received = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > DRIVE_MAX_BYTES) throw driveError('size');
      chunks.push(value); onProgress(received, size);
    }
    if (!received || (size && received !== size)) throw driveError('network');
    return new File(chunks, metadata.name, { type: metadata.mimeType || 'application/octet-stream', lastModified: 0 });
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
