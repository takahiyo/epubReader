// Google OAuth 2.0 認証管理モジュール

const AUTH_CONFIG = {
  // Google Cloud Console で取得するクライアントID
  // 現在は開発用にlocalStorageから取得（設定画面で入力可能）
  get clientId() {
    return localStorage.getItem('googleClientId') || '';
  },
  redirectUri: window.location.origin + '/login.html',
  scope: 'openid profile email https://www.googleapis.com/auth/drive.file',
  tokenExpiry: 60 * 60 * 1000, // 1時間（ミリ秒）
};

const AUTH_STORAGE_KEYS = {
  accessToken: 'epub_reader_google_token',
  tokenExpiry: 'epub_reader_token_expiry',
  userId: 'epub_reader_user_id',
  userEmail: 'epub_reader_user_email',
  userName: 'epub_reader_user_name',
  lastActivity: 'epub_reader_last_activity',
};

/**
 * Google OAuth認証を開始
 */
export function initGoogleLogin() {
  const clientId = AUTH_CONFIG.clientId;
  
  if (!clientId) {
    // クライアントIDが未設定の場合、プロンプトで入力
    const inputClientId = prompt(
      'Google Cloud Console で取得したクライアントIDを入力してください:\n\n' +
      '1. https://console.cloud.google.com/ にアクセス\n' +
      '2. プロジェクトを作成または選択\n' +
      '3. 「APIとサービス」→「認証情報」\n' +
      '4. 「OAuth 2.0 クライアント ID」を作成\n' +
      '5. 承認済みのリダイレクトURIに以下を追加:\n' +
      `   ${AUTH_CONFIG.redirectUri}\n\n` +
      'クライアントIDを入力:'
    );
    
    if (!inputClientId) {
      throw new Error('クライアントIDが必要です');
    }
    
    localStorage.setItem('googleClientId', inputClientId.trim());
  }
  
  const params = new URLSearchParams({
    client_id: AUTH_CONFIG.clientId,
    redirect_uri: AUTH_CONFIG.redirectUri,
    response_type: 'token id_token',
    scope: AUTH_CONFIG.scope,
    nonce: generateNonce(),
  });
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  window.location.href = authUrl;
}

/**
 * OAuth リダイレクト後のトークン取得
 */
export function captureGoogleToken() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');
  
  if (accessToken && idToken) {
    // トークンを保存
    saveAuthToken(accessToken);
    
    // ユーザー情報を取得
    fetchUserInfo(accessToken, idToken);
    
    // ハッシュをクリア
    window.history.replaceState(null, null, ' ');
    
    // メインページにリダイレクト
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);
    
    return true;
  }
  
  return false;
}

/**
 * 認証トークンを保存
 */
function saveAuthToken(token) {
  const now = Date.now();
  const expiry = now + AUTH_CONFIG.tokenExpiry;
  
  localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, token);
  localStorage.setItem(AUTH_STORAGE_KEYS.tokenExpiry, expiry.toString());
  localStorage.setItem(AUTH_STORAGE_KEYS.lastActivity, now.toString());
}

/**
 * ユーザー情報を取得して保存
 */
async function fetchUserInfo(accessToken, idToken) {
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
  
  const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
  const expiry = parseInt(localStorage.getItem(AUTH_STORAGE_KEYS.tokenExpiry) || '0', 10);
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

// ページ読み込み時にトークンをキャプチャ（login.html用）
if (window.location.pathname.includes('login.html')) {
  window.addEventListener('load', () => {
    captureGoogleToken();
  });
}
