/**
 * 実行時/ビルド時のランタイム設定 (SSOT)
 *
 * - ビルド時: ここで定義したデフォルト値を使用します。
 * - 実行時: window.APP_CONFIG などで注入された値で上書きします。
 *   例) index.html やサーバー側テンプレートで
 *       window.APP_CONFIG = {
 *         firebase: {...},
 *         googleAuth: {...},
 *         workers: {...}
 *       };
 *   例) assets/config.js から window.APP_CONFIG に注入
 */
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyD2xMk1bbez1Y2crBcgzxUhghU9bFnU1gI",
  authDomain: "bookreader-1d3a3.firebaseapp.com",
  projectId: "bookreader-1d3a3",
  storageBucket: "bookreader-1d3a3.firebasestorage.app",
  messagingSenderId: "920141070828",
  appId: "1:920141070828:web:619c658ec726be091c00c9",
  measurementId: "G-V68746259D",
});

export const WORKERS_CONFIG = Object.freeze({
  SYNC_ENDPOINT: "https://bookreader.taka-hiyo.workers.dev",
});

export const GOOGLE_AUTH_CONFIG = Object.freeze({
  CLIENT_ID:
    "672654349618-h1252pqs19d076dkf3uteme7upau16kp.apps.googleusercontent.com",
});
