// Google OAuth 2.0 認証管理モジュール（正規化・app.js互換版）

let googleLoginInitialized = false;
let oauthActive = false;

// -------------------------
// Config
// -------------------------
function resolveClientId() {
  const configuredClientId = window.EPUB_READER_CONFIG?.googleClientId || "";
  const htmlClientId = document.documentElement?.dataset?.clientId || "";
  const bodyClientId = document.body?.dataset?.clientId || "";
  return (configuredClientId || htmlClientId || bodyClientId).trim();
}

const AUTH_CONFIG = {
  get clientId() {
    return resolveClientId();
  },
  tokenExpiry: 60 * 60 * 1000, // 1 hour
};

const AUTH_STORAGE_KEYS = {
  idToken: "epub_reader_google_id_token",
  tokenExpiry: "epub_reader_token_expiry",
  userId: "epub_reader_user_id",
  userEmail: "epub_reader_user_email",
  userName: "epub_reader_user_name",
  lastActivity: "epub_reader_last_activity",
};

// -------------------------
// OAuth UI Control (Z-layer fix)
// -------------------------
function setOAuthMode(active) {
  oauthActive = active;
  document.body.classList.toggle("google-auth-active", active);
}

// -------------------------
// Google Identity Services init
// -------------------------
export function initGoogleLogin({ prompt = false } = {}) {
  const clientId = AUTH_CONFIG.clientId;

  if (!clientId) {
    throw new Error(
      "Google ログインのクライアントIDが設定されていません。assets/config.js に googleClientId を設定してください。",
    );
  }

  if (!window.google?.accounts?.id) {
    throw new Error("Google Identity Services が読み込まれていません。");
  }

  if (!googleLoginInitialized) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: captureGoogleToken,
      auto_select: false,
      cancel_on_tap_outside: false, // iOS対策
    });
    googleLoginInitialized = true;
  }

  if (prompt) {
    startGoogleLogin();
  }
}

// -------------------------
// Login / Logout
// -------------------------
export function startGoogleLogin() {
  onGoogleLoginStart();
  window.google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      onGoogleLoginEnd();
    }
  });
}

export function logout() {
  clearAuth();
  onGoogleLoginEnd();
  window.location.reload();
}

// -------------------------
// Token handling
// -------------------------
export function captureGoogleToken(credentialResponse) {
  const idToken = credentialResponse?.credential;
  if (!idToken) {
    onGoogleLoginEnd();
    return;
  }

  saveIdToken(idToken);
  onGoogleLoginEnd();
  fetchUserInfo(idToken);
}

function saveIdToken(idToken) {
  const expiry = parseIdTokenExpiry(idToken);
  localStorage.setItem(AUTH_STORAGE_KEYS.idToken, idToken);
  localStorage.setItem(AUTH_STORAGE_KEYS.lastActivity, Date.now().toString());
  if (expiry) localStorage.setItem(AUTH_STORAGE_KEYS.tokenExpiry, expiry.toString());
}

function parseIdTokenExpiry(idToken) {
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1]));
    return payload?.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function fetchUserInfo(idToken) {
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1]));
    localStorage.setItem(AUTH_STORAGE_KEYS.userId, payload.sub || "");
    localStorage.setItem(AUTH_STORAGE_KEYS.userEmail, payload.email || "");
    localStorage.setItem(AUTH_STORAGE_KEYS.userName, payload.name || "");
  } catch (e) {
    console.error("Failed to parse user info:", e);
  }
}

// -------------------------
// Auth status
// -------------------------
export function checkAuthStatus() {
  const idToken = localStorage.getItem(AUTH_STORAGE_KEYS.idToken);
  if (!idToken) return { authenticated: false };

  const expiry = parseIdTokenExpiry(idToken);
  if (Date.now() > expiry) {
    clearAuth();
    return { authenticated: false };
  }

  return {
    authenticated: true,
    token: idToken,
    userId: localStorage.getItem(AUTH_STORAGE_KEYS.userId),
    userEmail: localStorage.getItem(AUTH_STORAGE_KEYS.userEmail),
    userName: localStorage.getItem(AUTH_STORAGE_KEYS.userName),
  };
}

export function clearAuth() {
  Object.values(AUTH_STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
}

export function getCurrentUserId() {
  const s = checkAuthStatus();
  return s.authenticated ? s.userId : null;
}

export function getIdToken() {
  return localStorage.getItem(AUTH_STORAGE_KEYS.idToken);
}

// -------------------------
// app.js 互換フック（必須）
// -------------------------
export function onGoogleLoginStart() {
  setOAuthMode(true);
}

export function onGoogleLoginEnd() {
  setOAuthMode(false);
}
