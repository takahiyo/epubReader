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
 * Quest 3 (VR環境) であるかを判定する
 * WebXRの有無だけではPCブラウザ等で誤検知するため、UAに含まれるQuest/OculusBrowserで厳格に判定する
 * @returns {boolean}
 */
export const isQuest3 = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Quest|OculusBrowser/i.test(ua);
};

export const PLATFORM_TYPES = Object.freeze({
    QUEST3: 'quest3',
    ANDROID: 'android',
    WINDOWS: 'windows',
    IPAD: 'ipad',
    IOS: 'ios',
    UNKNOWN: 'unknown',
});

/**
 * iPadであるかを判定する (iPadOS 13以降のデスクトップ表示モード対応)
 * @returns {boolean}
 */
export const isIPad = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
};

/**
 * iPhone / iPod であるかを判定する
 * @returns {boolean}
 */
export const isIPhone = () => {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPod/i.test(navigator.userAgent);
};

/**
 * Android環境であるかを判定する (Quest3は除く)
 * @returns {boolean}
 */
export const isAndroid = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Android/i.test(ua) && !isQuest3();
};

/**
 * Windows環境であるかを判定する
 * @returns {boolean}
 */
export const isWindows = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Windows|Win32|Win64/i.test(ua);
};

/**
 * 動作環境を判定して PLATFORM_TYPES のいずれかを返す
 * @returns {string}
 */
export const detectPlatform = () => {
    if (isQuest3()) return PLATFORM_TYPES.QUEST3;
    if (isAndroid()) return PLATFORM_TYPES.ANDROID;
    if (isIPad()) return PLATFORM_TYPES.IPAD;
    if (isIPhone()) return PLATFORM_TYPES.IOS;
    if (isWindows()) return PLATFORM_TYPES.WINDOWS;
    return PLATFORM_TYPES.UNKNOWN;
};

