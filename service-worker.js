/**
 * service-worker.js - Service Worker (代替版)
 * 
 * 注意: Service Worker は ES Modules をサポートしないため、
 * constants.js から直接 import できません。
 * 設定変更時は constants.js と同期してください。
 * 
 * SSOT 参照元: assets/constants.js
 *
 * 生成物: assets/sw-cache-config.json
 */

const CONFIG_URL = "./assets/sw-cache-config.json";
let configPromise;
let assetUrlsPromise;

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

const loadAssetUrls = () => {
  if (!assetUrlsPromise) {
    assetUrlsPromise = loadConfig().then((config) => {
      return new Set(
        config.assets.map((asset) => new URL(asset, self.location).toString())
      );
    });
  }
  return assetUrlsPromise;
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    loadConfig()
      .then((config) => caches.open(config.cacheName).then((cache) => cache.addAll(config.assets)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    loadConfig()
      .then((config) =>
        caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== config.cacheName)
              .map((key) => caches.delete(key))
          )
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    loadAssetUrls()
      .then((assetUrls) => {
        if (!assetUrls.has(event.request.url)) {
          return fetch(event.request);
        }
        return caches.match(event.request).then((cached) => cached || fetch(event.request));
      })
      .catch(() => fetch(event.request))
  );
});
