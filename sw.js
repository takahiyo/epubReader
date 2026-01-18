/**
 * sw.js - Service Worker
 * 
 * PWA オフラインサポート用 Service Worker
 * 
 * 注意: Service Worker は ES Modules をサポートしないため、
 * constants.js から直接 import できません。
 * 設定変更時は constants.js と同期してください。
 * 
 * SSOT 参照元: assets/constants.js
 * - PWA_CONFIG.CACHE_NAME
 * - CDN_URLS.*
 * - SW_CACHE_ASSETS
 */

// PWA_CONFIG.CACHE_NAME と同期 (constants.js)
const CACHE_NAME = 'bookreader-v4';

// SW_CACHE_ASSETS + CDN_URLS と同期 (constants.js)
const ASSETS_TO_CACHE = [
    // ローカルアセット (SW_CACHE_ASSETS)
    './',
    './index.html',
    './manifest.json',
    './assets/style.css',
    './assets/app.js',
    './assets/constants.js',
    './assets/i18n.js',
    './assets/config.js',
    './assets/ui.js',
    './assets/reader.js',
    './assets/storage.js',
    './assets/auth.js',
    './assets/cloudSync.js',
    './assets/fileStore.js',
    './assets/firebaseConfig.js',
    './assets/bookreader.png',
    './assets/Flag_Japan.svg',
    './assets/Flag_America.svg',
    './assets/icon_BookReader_192.png',
    './assets/icon_BookReader_512.png',
    './assets/animations/loader_book.json',
    // CDN URLs (CDN_URLS.*)
    'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'
];

// インストール時にファイルをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});

// ネットワーク優先（オフライン時はキャッシュを使用）
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});