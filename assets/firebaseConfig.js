/**
 * firebaseConfig.js - Firebase 初期化
 * * Firebase SDK の初期化を行います。
 * 設定値は constants.js (SSOT) から参照します。
 */

import { FIREBASE_CONFIG } from "./constants.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Firebase 初期化（SSOT参照）
const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 設定をエクスポート（他モジュールで必要な場合）
export { FIREBASE_CONFIG };
