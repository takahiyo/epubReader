const CACHE_NAME = 'bookreader-v1'; // アップデート時はここを v2, v3 と書き換える
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './assets/style.css',
    './assets/app.js',
    './assets/config.js',
    './assets/ui.js',
    './assets/reader.js',
    './assets/storage.js',
    './assets/icon_BookReader_512.png'
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