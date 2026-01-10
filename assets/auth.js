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
  tokenExpiry: 60 * 60 * 1000,
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
// OAuth UI Control
// -------------------------
function setOAuthMode(active) {
  oauthActive = active;
  document.body.classList.toggle("google-auth-active", active);
}

// -------------------------
// GIS init
// -------------------------
export function initGoogleLogin({ prompt = false } = {}) {
  const clientId = AUTH_CONFIG.clientId;
  if (!clientId) {
    throw new Error("googleClientId が設定されていません。assets/config.js を確認してください。");
  }
  if (!window.google?.accounts?.id) {
    throw new Error("Google Identity Services が読み込まれていません。");
  }

  if (!googleLoginInitialized) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: captureGoogleToken,
      auto_select: false,
      cancel_on_tap_outside: false,
    });
    googleLoginInitialized = true;
  }
  if (prompt) startGoogleLogin();
}

// -------------------------
// Login / Logout
// -------------------------
export function startGoogleLogin() {
  onGoogleLoginStart();

  let finished = false;
  const timeout = setTimeout(() => {
    if (!finished) {
      console.warn("Google login timed out");
      onGoogleLoginEnd();
    }
  }, 8000);

  window.google.accounts.id.prompt((notification) => {
    if (
      notification.isNotDisplayed() ||
      notification.isSkippedMoment() ||
      notification.isDismissedMoment()
    ) {
      finished = true;
      clearTimeout(timeout);
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
// Token
// -------------------------
export function captureGoogleToken(credentialResponse) {
  onGoogleLoginEnd();

  const idToken = credentialResponse?.credential;
  if (!idToken) return;

  saveIdToken(idToken);
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
// Status
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
// app.js 互換フック
// -------------------------
export function onGoogleLoginStart() {
  setOAuthMode(true);
}

export function onGoogleLoginEnd() {
  setOAuthMode(false);
}
