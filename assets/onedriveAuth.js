const ONEDRIVE_SCOPE = "Files.ReadWrite.AppFolder offline_access";
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
    state: params.get("state") || "",
  };
}

function clearAuthFragment() {
  if (window?.history?.replaceState) {
    const url = window.location.origin + window.location.pathname + window.location.search;
    window.history.replaceState({}, document.title, url);
  }
}

export function captureAccessTokenFromHash(expectedState = "onedrive") {
  const parsed = parseHashParams(window.location.hash);
  if (!parsed) return null;
  if (expectedState && parsed.state && parsed.state !== expectedState) {
    return null;
  }
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

export function startOneDriveOAuth(clientId, redirectUri) {
  if (!clientId) {
    throw new Error("OneDrive クライアント ID を設定してください");
  }
  const target = redirectUri || window.location.origin + window.location.pathname;
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.searchParams.set("response_type", "token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", target);
  url.searchParams.set("scope", ONEDRIVE_SCOPE);
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", "onedrive");
  window.open(url.toString(), "_blank", "width=500,height=700");
}

export function ensureOneDriveAccessToken(settings, onTokenUpdate) {
  if (isTokenValid(settings?.onedriveToken)) {
    return settings.onedriveToken.accessToken;
  }

  const captured = captureAccessTokenFromHash("onedrive");
  if (captured) {
    onTokenUpdate?.(captured);
    return captured.accessToken;
  }

  startOneDriveOAuth(settings?.onedriveClientId, settings?.onedriveRedirectUri);
  throw new Error("OneDrive の認証を完了してください。別ウィンドウで許可後、この画面に戻って再度実行してください。");
}
