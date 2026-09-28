import { writeFile, readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { CDN_URLS, PWA_CONFIG, SW_CACHE_ASSETS } from "../assets/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const configPath = path.join(repoRoot, "assets", "sw-cache-config.json");

const dedupe = (items) => Array.from(new Set(items));

// Discover runtime modules so new imports cannot silently disappear offline.
async function runtimeFiles(directory) {
  const entries = await readdir(path.join(repoRoot, directory), { withFileTypes: true });
  const lists = await Promise.all(entries.map(entry => {
    const relative = directory + '/' + entry.name;
    return entry.isDirectory() ? runtimeFiles(relative)
      : /\.(js|css|wasm)$/.test(entry.name) ? ['./' + relative] : [];
  }));
  return lists.flat();
}
const discovered = [...await runtimeFiles('assets'), ...await runtimeFiles('src')];
const config = {
  cacheName: PWA_CONFIG.CACHE_NAME,
  assets: dedupe([...SW_CACHE_ASSETS, ...discovered, ...Object.values(CDN_URLS)]),
};

for (const asset of config.assets.filter(asset => asset.startsWith('./'))) {
  await access(path.join(repoRoot, asset));
}
const json = `${JSON.stringify(config, null, 2)}\n`;

await writeFile(configPath, json, "utf8");

console.log(`Generated ${path.relative(repoRoot, configPath)}`);
