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

// インストール時にファイルをキャッシュ（HTTPキャッシュをバイパスして最新版を取得）
self.addEventListener('install', (event) => {
    event.waitUntil(
        loadConfig().then((config) =>
            caches.open(config.cacheName).then((cache) =>
                Promise.all(
                    config.assets.map((url) =>
                        fetch(url, { cache: "no-cache" })
                            .then((response) => {
                                if (!response.ok) {
                                    throw new Error(`[SW] Network response was not ok for ${url}`);
                                }
                                // セキュリティ/堅牢性ガード: JS/CSS/JSONリクエスト時にHTMLが返ってきた場合は、
                                // サーバーがエラーページ(404等)を返している可能性が高いためキャッシュを拒否する。
                                const contentType = response.headers.get("content-type");
                                if (url.match(/\.(js|css|json)$/) && contentType && contentType.includes("text/html")) {
                                    throw new Error(`[SW] MIME type mismatch for ${url}: expected script/style but got HTML`);
                                }
                                return cache.put(url, response);
                            })
                            .catch((err) => {
                                console.warn(`[SW] Failed to cache: ${url}`, err);
                            })
                    )
                )
            )
        )
    );
    self.skipWaiting();
});

// 古いキャッシュを削除 + 即座にページを制御
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
        ).then(() => self.clients.claim())
    );
});

// ネットワーク優先（ローカルアセットはHTTPキャッシュをバイパス）
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;

    // ========================================
    // Web Share Target ハンドラー
    // ファイラー等から「共有」で送られてきた POST を処理する
    // ========================================
    if (isLocal && url.pathname.endsWith('/share-target') && event.request.method === 'POST') {
        event.respondWith((async () => {
            try {
                const formData = await event.request.formData();
                const files = formData.getAll('book');

                if (files.length > 0) {
                    // 最初のファイルをIndexedDBに保存する（PWA起動時にapp.jsが読み取る）
                    const file = files[0];
                    await new Promise((resolve, reject) => {
                        const request = indexedDB.open('ShareTargetDB', 1);
                        request.onupgradeneeded = (e) => {
                            const db = e.target.result;
                            if (!db.objectStoreNames.contains('shared_files')) {
                                db.createObjectStore('shared_files');
                            }
                        };
                        request.onsuccess = (e) => {
                            const db = e.target.result;
                            const tx = db.transaction('shared_files', 'readwrite');
                            const store = tx.objectStore('shared_files');
                            store.put(file, 'shared_book');
                            tx.oncomplete = () => resolve();
                            tx.onerror = () => reject(tx.error);
                        };
                        request.onerror = () => reject(request.error);
                    });
                    console.log('[SW] Saved shared file to IndexedDB:', file.name);
                }
            } catch (err) {
                console.error('[SW] share-target handling failed:', err);
            }

            // 処理後はアプリのメインページへリダイレクト（303 See Other）
            return Response.redirect('./', 303);
        })());
        return;
    }

    const isLocalAsset = isLocal && /\.(js|css|json|html)$/.test(url.pathname);
    const isNavigation = event.request.mode === 'navigate';

    if (isLocalAsset || isNavigation) {
        // ローカルアセット / ページナビゲーション: HTTPキャッシュバイパス + SW キャッシュフォールバック
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .catch(() => caches.match(event.request))
        );
    } else {
        // CDN等の外部リソース / 画像等: 従来のネットワーク優先
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
    }
});
