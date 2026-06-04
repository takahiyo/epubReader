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
  SYNC_ENDPOINT: "https://bookreader-dev.taka-hiyo.workers.dev",
  PROXY_ENDPOINT: "https://bookreader-dev.taka-hiyo.workers.dev/proxy",
});

export const GOOGLE_AUTH_CONFIG = Object.freeze({
  CLIENT_ID:
    "672654349618-h1252pqs19d076dkf3uteme7upau16kp.apps.googleusercontent.com",
});

export const UA_KEYWORDS = Object.freeze({
    QUEST_3: 'Quest',
    OCULUS: 'OculusBrowser',
    VR: 'VR',
    MOBILE: 'Mobile'
});

/**
 * Quest 3 環境であるかを判定する
 * @returns {boolean}
 */
export const isQuest3 = () => {
    const ua = navigator.userAgent;
    // [BEFORE]
    // return ua.includes(UA_KEYWORDS.OCULUS) && ua.includes(UA_KEYWORDS.QUEST_3);
    // [AFTER]
    // WebXR APIが存在すれば、Quest等のVRデバイスとみなす（UA偽装対策）
    const hasXR = typeof navigator !== 'undefined' && 'xr' in navigator;
    return /Quest|Oculus|VR/i.test(ua) || hasXR;
};

export const PLATFORM_TYPES = Object.freeze({
    QUEST3: 'quest3',
    ANDROID: 'android',
    WINDOWS: 'windows',
    IOS: 'ios',
    UNKNOWN: 'unknown',
});

export const isAndroid = () => {
    const ua = navigator.userAgent;
    return /Android/i.test(ua) && !isQuest3();
};

export const isWindows = () => /Windows/i.test(navigator.userAgent);

export const detectPlatform = () => {
    if (isQuest3()) return PLATFORM_TYPES.QUEST3;
    if (isAndroid()) return PLATFORM_TYPES.ANDROID;
    if (isWindows()) return PLATFORM_TYPES.WINDOWS;
    if (/iPhone|iPad/i.test(navigator.userAgent)) return PLATFORM_TYPES.IOS;
    return PLATFORM_TYPES.UNKNOWN;
};

