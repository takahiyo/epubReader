// Google OAuth 2.0 認証管理モジュール

function resolveClientId() {
  const configuredClientId = window.EPUB_READER_CONFIG?.googleClientId || '';
  const htmlClientId = document.documentElement?.dataset?.clientId || '';
  const bodyClientId = document.body?.dataset?.clientId || '';

  return (configuredClientId || htmlClientId || bodyClientId).trim();
}

const AUTH_CONFIG = {
  // Google Cloud Console で取得するクライアントID
  // ビルド時または静的設定ファイル/HTML属性から読み込む
  get clientId() {
    return resolveClientId();
  },
  redirectUri: window.location.origin + '/login.html',
  scope: 'openid profile email',
  driveScope: 'https://www.googleapis.com/auth/drive.file',
  tokenExpiry: 60 * 60 * 1000, // 1時間（ミリ秒）
};

const AUTH_STORAGE_KEYS = {
  accessToken: 'epub_reader_google_token',
  idToken: 'epub_reader_google_id_token',
  tokenExpiry: 'epub_reader_token_expiry',
  userId: 'epub_reader_user_id',
  userEmail: 'epub_reader_user_email',
  userName: 'epub_reader_user_name',
  lastActivity: 'epub_reader_last_activity',
};

let googleTokenClient = null;
let googleLoginInitialized = false;
let googleButtonRendered = false;

/**
 * Google OAuth認証を開始
 */
export function initGoogleLogin() {
  const clientId = AUTH_CONFIG.clientId;
  
  if (!clientId) {
    throw new Error(
      'Google ログインのクライアントIDが設定されていません。' +
      'assets/config.js もしくは login.html の data-client-id を設定してください。'
    );
  }
  
  if (!window.google?.accounts?.id || !window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services が読み込まれていません。');
  }

  if (!googleLoginInitialized) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: captureGoogleToken,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    googleLoginInitialized = true;
  }

  const buttonContainer = document.getElementById('googleSignInButton');
  if (buttonContainer && !googleButtonRendered) {
    window.google.accounts.id.renderButton(buttonContainer, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width: 260,
    });
    googleButtonRendered = true;
  }

  window.google.accounts.id.prompt();
}

/**
 * Google Identity Services からのトークン取得
 */
export function captureGoogleToken(credentialResponse) {
  const idToken = credentialResponse?.credential;
  if (!idToken) {
    return false;
  }

  saveIdToken(idToken);
  fetchUserInfo(idToken);
  requestBasicAccessToken();
  setTimeout(() => {
    const accessToken = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
    if (!accessToken) {
      window.location.href = 'index.html';
    }
  }, 800);
  return true;
}

/**
 * 認証トークンを保存
 */
function saveAuthToken(token, expiresInSeconds) {
  const now = Date.now();
  const expiry = expiresInSeconds
    ? now + expiresInSeconds * 1000
    : now + AUTH_CONFIG.tokenExpiry;

  localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, token);
  localStorage.setItem(AUTH_STORAGE_KEYS.tokenExpiry, expiry.toString());
  localStorage.setItem(AUTH_STORAGE_KEYS.lastActivity, now.toString());
}

/**
 * IDトークンを保存
 */
function saveIdToken(idToken) {
  const now = Date.now();
  localStorage.setItem(AUTH_STORAGE_KEYS.idToken, idToken);
  localStorage.setItem(AUTH_STORAGE_KEYS.lastActivity, now.toString());

  const expiry = parseIdTokenExpiry(idToken);
  if (expiry) {
    localStorage.setItem(AUTH_STORAGE_KEYS.tokenExpiry, expiry.toString());
  }
}

function parseIdTokenExpiry(idToken) {
  if (!idToken) {
    return 0;
  }
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    return payload?.exp ? payload.exp * 1000 : 0;
  } catch (error) {
    console.error('Failed to parse id token expiry:', error);
    return 0;
  }
}

/**
 * ユーザー情報を取得して保存
 */
async function fetchUserInfo(idToken) {
  try {
    // ID トークンをデコード（簡易版）
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    
    localStorage.setItem(AUTH_STORAGE_KEYS.userId, payload.sub || '');
    localStorage.setItem(AUTH_STORAGE_KEYS.userEmail, payload.email || '');
    localStorage.setItem(AUTH_STORAGE_KEYS.userName, payload.name || '');
    
    console.log('User logged in:', payload.email);
  } catch (error) {
    console.error('Failed to parse user info:', error);
  }
}

function requestBasicAccessToken() {
  if (!window.google?.accounts?.oauth2) {
    console.error('Google OAuth2 client が利用できません。');
    return;
  }

  if (!googleTokenClient) {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: AUTH_CONFIG.clientId,
      scope: AUTH_CONFIG.scope,
      callback: (tokenResponse) => {
        if (!tokenResponse?.access_token) {
          console.error('アクセストークンの取得に失敗しました。', tokenResponse);
          return;
        }
        saveAuthToken(tokenResponse.access_token, tokenResponse.expires_in);
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 500);
      },
    });
  }

  googleTokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Google Drive 用の追加スコープを要求
 */
export function requestDriveScope() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google OAuth2 client が利用できません。'));
      return;
    }

    const clientId = AUTH_CONFIG.clientId;
    if (!clientId) {
      reject(
        new Error(
          'Google ログインのクライアントIDが設定されていません。' +
            'assets/config.js もしくは login.html の data-client-id を設定してください。'
        )
      );
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: AUTH_CONFIG.driveScope,
      callback: (tokenResponse) => {
        if (!tokenResponse?.access_token) {
          reject(new Error('Google Drive の認証に失敗しました。'));
          return;
        }
        const expiresIn = tokenResponse.expires_in ? tokenResponse.expires_in * 1000 : AUTH_CONFIG.tokenExpiry;
        resolve({
          accessToken: tokenResponse.access_token,
          tokenType: tokenResponse.token_type || 'Bearer',
          expiresAt: Date.now() + expiresIn,
        });
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * 現在の認証状態をチェック
 */
export function checkAuthStatus() {
  // 開発モード: DEV_MODE=true をlocalStorageに設定すると認証をスキップ
  const devMode = localStorage.getItem('DEV_MODE') === 'true';
  if (devMode) {
    return {
      authenticated: true,
      token: 'dev-token',
      userId: 'dev-user',
      userEmail: 'dev@example.com',
      userName: 'Development User',
      devMode: true,
    };
  }
  
  const accessToken = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
  const idToken = localStorage.getItem(AUTH_STORAGE_KEYS.idToken);
  const token = accessToken || idToken;
  const expiry = accessToken
    ? parseInt(localStorage.getItem(AUTH_STORAGE_KEYS.tokenExpiry) || '0', 10)
    : parseIdTokenExpiry(idToken) || 0;
  const lastActivity = parseInt(localStorage.getItem(AUTH_STORAGE_KEYS.lastActivity) || '0', 10);
  const now = Date.now();
  
  // トークンが存在しない
  if (!token) {
    return { authenticated: false, reason: 'no_token' };
  }
  
  // トークンの有効期限切れ
  if (now > expiry) {
    clearAuth();
    return { authenticated: false, reason: 'expired' };
  }
  
  // 最終アクティビティから1時間以上経過
  if (now - lastActivity > AUTH_CONFIG.tokenExpiry) {
    clearAuth();
    return { authenticated: false, reason: 'inactive' };
  }
  
  // 最終アクティビティを更新
  localStorage.setItem(AUTH_STORAGE_KEYS.lastActivity, now.toString());
  
  return {
    authenticated: true,
    token,
    userId: localStorage.getItem(AUTH_STORAGE_KEYS.userId),
    userEmail: localStorage.getItem(AUTH_STORAGE_KEYS.userEmail),
    userName: localStorage.getItem(AUTH_STORAGE_KEYS.userName),
  };
}

/**
 * 認証情報をクリア（ログアウト）
 */
export function clearAuth() {
  Object.values(AUTH_STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}

/**
 * ログアウト処理
 */
export function logout() {
  clearAuth();
  window.location.href = 'login.html';
}

/**
 * アクティビティを記録（操作があったことを記録）
 */
export function updateActivity() {
  const authStatus = checkAuthStatus();
  if (authStatus.authenticated) {
    localStorage.setItem(AUTH_STORAGE_KEYS.lastActivity, Date.now().toString());
  }
}

/**
 * Nonce生成（セキュリティ用）
 */
function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 現在のユーザーIDを取得
 */
export function getCurrentUserId() {
  const authStatus = checkAuthStatus();
  return authStatus.authenticated ? authStatus.userId : null;
}

/**
 * 現在のアクセストークンを取得
 */
export function getAccessToken() {
  const authStatus = checkAuthStatus();
  return authStatus.authenticated ? authStatus.token : null;
}
