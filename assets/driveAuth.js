const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const EXPIRY_BUFFER_MS = 60 * 1000;

function parseHashParams(hash) {
  if (!hash || !hash.startsWith("#")) return null;
  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get("access_token");
  if (!accessToken) return null;
  return {
    accessToken,
    expiresIn: Number(params.get("expires_in")) || 0,
    tokenType: params.get("token_type") || "Bearer",
  };
}

function clearAuthFragment() {
  if (window?.history?.replaceState) {
    const url = window.location.origin + window.location.pathname + window.location.search;
    window.history.replaceState({}, document.title, url);
  }
}

export function captureAccessTokenFromHash() {
  const parsed = parseHashParams(window.location.hash);
  if (!parsed) return null;
  clearAuthFragment();
  const expiresAt = Date.now() + parsed.expiresIn * 1000;
  return {
    accessToken: parsed.accessToken,
    tokenType: parsed.tokenType,
    expiresAt,
  };
}

export function isTokenValid(token) {
  if (!token?.accessToken) return false;
  if (!token.expiresAt) return true;
  return token.expiresAt - EXPIRY_BUFFER_MS > Date.now();
}

export function startDriveOAuth(clientId, redirectUri) {
  if (!clientId) {
    throw new Error("Drive クライアント ID を設定してください");
  }
  const target = redirectUri || window.location.origin + window.location.pathname;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("response_type", "token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", target);
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  window.open(url.toString(), "_blank", "width=500,height=700");
}

export function ensureDriveAccessToken(settings, onTokenUpdate) {
  if (isTokenValid(settings?.driveToken)) {
    return settings.driveToken.accessToken;
  }

  const captured = captureAccessTokenFromHash();
  if (captured) {
    onTokenUpdate?.(captured);
    return captured.accessToken;
  }

  startDriveOAuth(settings?.driveClientId, settings?.driveRedirectUri);
  throw new Error("Google Drive の認証を完了してください。別ウィンドウで許可後、この画面に戻って再度実行してください。");
}
