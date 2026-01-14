// assets/auth.js
import { auth, googleProvider } from "./firebaseConfig.js";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const GIS_ID_TOKEN_KEY = "google_id_token";
const AUTH_TOKEN_MODE_KEY = "auth_token_mode";

export const AUTH_TOKEN_MODE = Object.freeze({
  GIS_TO_FIREBASE: "gis-to-firebase",
  FIREBASE_FIRST: "firebase-first",
});

export const ID_TOKEN_TYPE = Object.freeze({
  FIREBASE: "firebase",
  GIS: "gis",
});

const DEFAULT_AUTH_TOKEN_MODE = AUTH_TOKEN_MODE.FIREBASE_FIRST;

export function setAuthTokenMode(mode) {
  if (!Object.values(AUTH_TOKEN_MODE).includes(mode)) {
    throw new Error(`Unknown auth token mode: ${mode}`);
  }
  localStorage.setItem(AUTH_TOKEN_MODE_KEY, mode);
}

export function getAuthTokenMode() {
  const mode = localStorage.getItem(AUTH_TOKEN_MODE_KEY);
  if (Object.values(AUTH_TOKEN_MODE).includes(mode)) {
    return mode;
  }
  return DEFAULT_AUTH_TOKEN_MODE;
}

function getLegacyGisIdToken() {
  return localStorage.getItem(GIS_ID_TOKEN_KEY);
}

async function signInWithGisIdToken(idToken) {
  if (!idToken) return null;
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

// ▼ UI操作用（必要に応じて export）
export function onGoogleLoginStart() {
  const btn = document.getElementById("googleLoginButton");
  if (btn) btn.disabled = true;
  document.body.style.cursor = "wait";
}

export function onGoogleLoginEnd() {
  const btn = document.getElementById("googleLoginButton");
  if (btn) btn.disabled = false;
  document.body.style.cursor = "default";
}

// ▼ ここが重要：export を忘れずに
export async function startGoogleLogin() {
  console.log("Starting Google Login..."); // デバッグ用ログ
  onGoogleLoginStart();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("Login Success:", result.user);
    // ログイン成功後の処理は onAuthStateChanged で拾うのでここでは何もしなくてOK
  } catch (error) {
    console.error("Login failed:", error);
    alert("ログインに失敗しました: " + error.message);
  } finally {
    onGoogleLoginEnd();
  }
}

export function logout() {
  signOut(auth).then(() => window.location.reload());
}

// アプリ起動時に監視を開始する関数
export function initGoogleLogin() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("User state changed: Logged in");
      window.dispatchEvent(new Event("auth:login"));
    } else {
      console.log("User state changed: Logged out");
    }
  });
}

// 既存のコードとの互換性用
export function checkAuthStatus() {
  const user = auth.currentUser;
  if (!user) return { authenticated: false };
  return {
    authenticated: true,
    userId: user.uid,
    userName: user.displayName,
    userEmail: user.email
  };
}

export function getCurrentUserId() {
  return auth.currentUser?.uid || null;
}

export async function getIdTokenInfo({ forceRefresh = false } = {}) {
  const mode = getAuthTokenMode();

  if (mode === AUTH_TOKEN_MODE.GIS_TO_FIREBASE) {
    const gisIdToken = getLegacyGisIdToken();
    if (!auth.currentUser && gisIdToken) {
      try {
        await signInWithGisIdToken(gisIdToken);
      } catch (error) {
        console.warn("GIS idToken の Firebase 連携に失敗しました:", error);
      }
    }

    if (!auth.currentUser) {
      return null;
    }

    try {
      const idToken = await auth.currentUser.getIdToken(forceRefresh);
      return { idToken, tokenType: ID_TOKEN_TYPE.FIREBASE, mode };
    } catch (error) {
      console.warn("Firebase idToken の取得に失敗しました:", error);
      return null;
    }
  }

  if (auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken(forceRefresh);
      return { idToken, tokenType: ID_TOKEN_TYPE.FIREBASE, mode };
    } catch (error) {
      console.warn("Firebase idToken の取得に失敗しました:", error);
      return null;
    }
  }

  const gisIdToken = getLegacyGisIdToken();
  if (gisIdToken) {
    return { idToken: gisIdToken, tokenType: ID_TOKEN_TYPE.GIS, mode };
  }

  return null;
}
