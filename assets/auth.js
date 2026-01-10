// auth.js
// app.js と完全互換な Google OAuth 2.0 管理レイヤー
// Google Identity Services (GIS) 使用

let googleInitialized = false;
let oauthUiActive = false;

// ===============================
// Config
// ===============================
function resolveClientId() {
  return (
    window.EPUB_READER_CONFIG?.googleClientId ||
    document.documentElement?.dataset?.clientId ||
    document.body?.dataset?.clientId ||
    ""
  ).trim();
}

const STORAGE = {
  idToken: "epub_reader_google_id_token",
  expiry: "epub_reader_token_expiry",
  userId: "epub_reader_user_id",
  userEmail: "epub_reader_user_email",
  userName: "epub_reader_user_name",
  lastActivity: "epub_reader_last_activity",
};

// ===============================
// UI Layer Hook (used by app.js)
// ===============================
export function onGoogleLoginStart() {
  oauthUiActive = true;
  document.body.classList.add("google-auth-active");
}

export function onGoogleLoginEnd() {
  oauthUiActive = false;
  document.body.classList.remove("google-auth-active");
}

// ===============================
// Auth State
// ===============================
export function checkAuthStatus() {
  const token = localStorage.getItem(STORAGE.idToken);
  if (!token) return { authenticated: false };

  const exp = parseExpiry(token);
  if (!exp || Date.now() > exp) {
    clearAuth();
    return { authenticated: false };
  }

  return {
    authenticated: true,
    token,
    userId: localStorage.getItem(STORAGE.userId),
    userEmail: localStorage.getItem(STORAGE.userEmail),
    userName: localStorage.getItem(STORAGE.userName),
  };
}

export function getIdToken() {
  return localStorage.getItem(STORAGE.idToken);
}

export function getCurrentUserId() {
  const s = checkAuthStatus();
  return s.authenticated ? s.userId : null;
}

// ===============================
// Google Identity Services
// ===============================
export function initGoogleLogin() {
  const clientId = resolveClientId();
  if (!clientId) {
    throw new Error("Google Client ID が設定されていません");
  }

  if (!window.google?.accounts?.id) {
    throw new Error("Google Identity Services が読み込まれていません");
  }

  if (googleInitialized) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: onGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: false,
  });

  googleInitialized = true;
}

// ===============================
// Login / Logout
// ===============================
export function startGoogleLogin() {
  onGoogleLoginStart();
  window.google.accounts.id.prompt((n) => {
    if (
      n.isNotDisplayed?.() ||
      n.isSkippedMoment?.() ||
      n.isDismissedMoment?.()
    ) {
      onGoogleLoginEnd();
    }
  });
}

export function logout() {
  clearAuth();
  onGoogleLoginEnd();
  window.location.reload();
}

// ===============================
// Credential handler
// ===============================
function onGoogleCredential(response) {
  const idToken = response?.credential;
  if (!idToken) {
    onGoogleLoginEnd();
    return;
  }

  saveToken(idToken);
  onGoogleLoginEnd();

  // ★ app.js が待っているイベント
  window.dispatchEvent(new Event("auth:login"));
}

// ===============================
// Token storage
// ===============================
function saveToken(idToken) {
  const payload = parseJwt(idToken);

  localStorage.setItem(STORAGE.idToken, idToken);
  localStorage.setItem(STORAGE.lastActivity, Date.now().toString());

  if (payload?.exp) {
    localStorage.setItem(STORAGE.expiry, String(payload.exp * 1000));
  }
  if (payload?.sub) localStorage.setItem(STORAGE.userId, payload.sub);
  if (payload?.email) localStorage.setItem(STORAGE.userEmail, payload.email);
  if (payload?.name) localStorage.setItem(STORAGE.userName, payload.name);
}

function clearAuth() {
  Object.values(STORAGE).forEach((k) => localStorage.removeItem(k));
}

function parseExpiry(token) {
  try {
    const payload = parseJwt(token);
    return payload?.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

// ===============================
// Activity ping (app.js imports this)
// ===============================
export function updateActivity() {
  localStorage.setItem(STORAGE.lastActivity, Date.now().toString());
}
