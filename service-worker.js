/**
 * service-worker.js - Service Worker (代替版)
 * 
 * 注意: Service Worker は ES Modules をサポートしないため、
 * constants.js から直接 import できません。
 * 設定変更時は constants.js と同期してください。
 * 
 * SSOT 参照元: assets/constants.js
 */

// PWA_CONFIG.CACHE_NAME と同期
const CACHE_NAME = "epub-reader-static-v1";

// SW_CACHE_ASSETS と同期
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/style.css",
  "./assets/login.css",
  "./assets/app.js",
  "./assets/constants.js",
  "./assets/i18n.js",
  "./assets/auth.js",
  "./assets/cloudSync.js",
  "./assets/config.js",
  "./assets/fileStore.js",
  "./assets/firebaseConfig.js",
  "./assets/reader.js",
  "./assets/storage.js",
  "./assets/ui.js",
  "./assets/bookreader.png",
  "./assets/BookReader_Titlle.png",
  "./assets/menu-title.svg",
  "./assets/Flag_America.svg",
  "./assets/Flag_Japan.svg",
  "./assets/icon_BookReader_192.png",
  "./assets/icon_BookReader_512.png",
  "./assets/vendor/jszip.min.js",
  "./assets/vendor/unrar.js",
  "./assets/vendor/unrar.wasm"
];

const ASSET_URLS = new Set(
  STATIC_ASSETS.map((asset) => new URL(asset, self.location).toString())
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = event.request.url;
  if (!ASSET_URLS.has(requestUrl)) {
    return;
  }

  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request))
  );
});
