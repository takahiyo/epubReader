// assets/auth.js
import { auth, googleProvider } from "./firebaseConfig.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
