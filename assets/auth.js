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
  tokenExpiry: 60 * 60 * 1000, // 1時間（ミリ秒）
};

const AUTH_STORAGE_KEYS = {
  idToken: 'epub_reader_google_id_token',
  tokenExpiry: 'epub_reader_token_expiry',
  userId: 'epub_reader_user_id',
  userEmail: 'epub_reader_user_email',
  userName: 'epub_reader_user_name',
  lastActivity: 'epub_reader_last_activity',
};

let googleLoginInitialized = false;

const AUTH_EVENTS = {
  login: "auth:login",
  logout: "auth:logout",
};

function emitAuthEvent(type, detail) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

/**
 * Google OAuth認証を開始
 */
export function initGoogleLogin(options = {}) {
  const clientId = AUTH_CONFIG.clientId;
  
  if (!clientId) {
    throw new Error(
      'Google ログインのクライアントIDが設定されていません。' +
      'assets/config.js で data-client-id を設定してください。'
    );
  }
  
  if (!window.google?.accounts?.id) {
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

  if (options.prompt === true) {
    window.google.accounts.id.prompt();
  }

  removedBlurLayers = Array.from(document.querySelectorAll(BLUR_LAYER_SELECTORS))
    .map((node) => ({
      node,
      parent: node.parentNode,
      nextSibling: node.nextSibling,
    }))
    .filter((entry) => entry.parent);

  removedBlurLayers.forEach(({ node }) => {
    node.remove();
  });
}

function restoreBlurLayers() {
  removedBlurLayers.forEach(({ node, parent, nextSibling }) => {
    if (!node.isConnected) {
      parent.insertBefore(node, nextSibling);
    }
  });
  removedBlurLayers = [];
}

export function onGoogleLoginStart() {
  hideAllBlurLayers();
}

export function onGoogleLoginEnd() {
  restoreBlurLayers();
}

export function onGoogleLoginStart() {
  document.body.classList.add("oauth-active");
}

export function onGoogleLoginEnd() {
  document.body.classList.remove("oauth-active");
}

function setOAuthMode(active) {
  const layers = document.querySelectorAll(BLUR_LAYER_SELECTORS);
  layers.forEach((element) => {
    if (active) {
      element.dataset.prevDisplay = element.style.display || "";
      element.dataset.prevPointer = element.style.pointerEvents || "";
      element.style.display = "none";
      element.style.pointerEvents = "none";
    } else {
      element.style.display = element.dataset.prevDisplay || "";
      element.style.pointerEvents = element.dataset.prevPointer || "";
      delete element.dataset.prevDisplay;
      delete element.dataset.prevPointer;
    }
  });
}

export function onGoogleLoginStart() {
  document.body.classList.add("oauth-active");
  setOAuthMode(true);
}

export function onGoogleLoginEnd() {
  setOAuthMode(false);
  document.body.classList.remove("oauth-active");
}

export function onGoogleLoginStart() {
  document.body.classList.add("google-auth-active");
}

export function onGoogleLoginEnd() {
  document.body.classList.remove("google-auth-active");
}

export function onGoogleLoginStart() {
  document.body.classList.add("google-auth-active");
}

export function onGoogleLoginEnd() {
  document.body.classList.remove("google-auth-active");
}

/**
 * Google Identity Services からのトークン取得
 */
export function captureGoogleToken(credentialResponse) {
  const idToken = credentialResponse?.credential;
  if (!idToken) {
    onGoogleLoginEnd();
    return false;
  }

  saveIdToken(idToken);
  onGoogleLoginEnd();
  fetchUserInfo(idToken);
  return true;
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
    
    const userId = payload.sub || '';
    const userEmail = payload.email || '';
    const userName = payload.name || '';

    localStorage.setItem(AUTH_STORAGE_KEYS.userId, userId);
    localStorage.setItem(AUTH_STORAGE_KEYS.userEmail, userEmail);
    localStorage.setItem(AUTH_STORAGE_KEYS.userName, userName);

    emitAuthEvent(AUTH_EVENTS.login, { userId, userEmail, userName });
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
  
  const idToken = localStorage.getItem(AUTH_STORAGE_KEYS.idToken);
  const token = idToken;
  const expiry = parseIdTokenExpiry(idToken) || 0;
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
  onGoogleLoginEnd();
  clearAuth();
  window.location.href = 'index.html';
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

/**
 * 現在のIDトークンを取得
 */
export function getIdToken() {
  return localStorage.getItem(AUTH_STORAGE_KEYS.idToken);
}
