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

// CacheStorage itself can fail (for example when browser storage is unavailable).
// Never let a fallback read reject the respondWith promise.
const readCachedResponse = async (key, request) => {
    try {
        const response = await caches.match(key);
        if (!response || !response.ok) return undefined;
        if (response.type === 'opaque' || response.type === 'opaqueredirect') return undefined;
        // A response fetched with redirect: follow during install cannot be reused
        // unchanged for a navigation request with redirect: manual.
        if (response.redirected && request.redirect !== 'follow') {
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }
        return response;
    } catch (error) {
        console.warn('[SW] Cache read unavailable:', error);
        return undefined;
    }
};

const unavailableResponse = (request) => request.mode === 'navigate'
    ? new Response(`<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BookReader を起動できません</title>
<body><h1>BookReader を起動できません</h1>
<p>通信または一時保存データを読み込めませんでした。接続を確認して、再読み込みしてください。</p>
<p>本や読書履歴は削除していません。</p><button onclick="location.reload()">再読み込み</button></body></html>`, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
    : new Response('Offline', { status: 503 });

const loadConfig = () => {
    if (!configPromise) {
        configPromise = fetch(CONFIG_URL, { cache: "no-store" }).then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to load ${CONFIG_URL}`);
            }
            return response.json();
        }).catch(async error => {
            const cached = await caches.match(CONFIG_URL);
            if (cached) return cached.json();
            configPromise = null;
            throw error;
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
                        .filter((key) => key.startsWith("bookreader-v") && key !== config.cacheName)
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
            return Response.redirect(new URL('./', event.request.url).href, 303);
        })());
        return;
    }

    // Only GET requests belong in the asset cache; never cache authenticated POST data.
    if (event.request.method !== 'GET') return;
    const cacheUrl = new URL(event.request.url);
    if (isLocal) cacheUrl.searchParams.delete('v');
    event.respondWith((async () => {
        const cacheKey = isLocal ? cacheUrl.href : event.request;
        try {
            const response = await fetch(event.request, { cache: 'no-cache' });
            if (response.ok) {
                // Persist successful runtime loads as well as install-time assets.
                try {
                    const config = await loadConfig();
                    const cache = await caches.open(config.cacheName);
                    const contentType = response.headers.get('content-type') || '';
                    const wrongMime = /\.(js|css|json)$/.test(cacheUrl.pathname) && contentType.includes('text/html');
                    if (!wrongMime && (isLocal || config.assets.includes(event.request.url))) {
                        await cache.put(cacheKey, response.clone());
                    }
                } catch (error) {
                    // Quota or cache failures must not discard a successful network response.
                    console.warn('[SW] Runtime cache unavailable:', error);
                }
                return response;
            }
            return await readCachedResponse(cacheKey, event.request) || response;
        } catch {
            return await readCachedResponse(cacheKey, event.request) || unavailableResponse(event.request);
        }
    })());
});
