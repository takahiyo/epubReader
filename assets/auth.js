// auth.js
// Firebase Auth (v10) wrapper
import { auth, googleProvider } from "./firebaseConfig.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;

// ===============================
// UI Layer Hook (used by app.js)
// ===============================
export function onGoogleLoginStart() {
  document.body.classList.add("google-auth-active");
}

export function onGoogleLoginEnd() {
  document.body.classList.remove("google-auth-active");
}

// ===============================
// Auth State
// ===============================
export function checkAuthStatus() {
  if (!currentUser) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    token: currentUser.accessToken, // For compatibility, though mostly handled by SDK
    userId: currentUser.uid,
    userEmail: currentUser.email,
    userName: currentUser.displayName,
  };
}

export async function getIdToken() {
  if (!currentUser) return null;
  try {
    return await currentUser.getIdToken();
  } catch (e) {
    console.error("Failed to get ID token", e);
    return null;
  }
}

export function getCurrentUserId() {
  return currentUser ? currentUser.uid : null;
}

// ===============================
// Initialization
// ===============================
export function initGoogleLogin() {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      window.dispatchEvent(new Event("auth:login"));
    }
  });
}

// ===============================
// Login / Logout
// ===============================
export async function startGoogleLogin() {
  onGoogleLoginStart();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    currentUser = result.user;
    onGoogleLoginEnd();
  } catch (error) {
    console.error("Google login error:", error);
    onGoogleLoginEnd();
    alert(`ログインに失敗しました: ${error.message}`);
  }
}

export async function logout() {
  try {
    await signOut(auth);
    window.location.reload();
  } catch (error) {
    console.error("Logout error:", error);
  }
}

// ===============================
// Activity ping (app.js imports this)
// ===============================
export function updateActivity() {
  // Firebase Auth manages session refresh automatically.
  // We keep this function for interface compatibility.
}
