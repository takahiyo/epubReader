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
 *
 * 生成物: assets/sw-cache-config.json
 */

const CONFIG_URL = "./assets/sw-cache-config.json";
let configPromise;

const loadConfig = () => {
    if (!configPromise) {
        configPromise = fetch(CONFIG_URL, { cache: "no-store" }).then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to load ${CONFIG_URL}`);
            }
            return response.json();
        });
    }
    return configPromise;
};

// インストール時にファイルをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        loadConfig().then((config) =>
            caches.open(config.cacheName).then((cache) => cache.addAll(config.assets))
        )
    );
    self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        loadConfig().then((config) =>
            caches.keys().then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== config.cacheName)
                        .map((key) => caches.delete(key))
                )
            )
        )
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
