import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { CDN_URLS, PWA_CONFIG, SW_CACHE_ASSETS } from "../assets/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const configPath = path.join(repoRoot, "assets", "sw-cache-config.json");

const dedupe = (items) => Array.from(new Set(items));

const config = {
  cacheName: PWA_CONFIG.CACHE_NAME,
  assets: dedupe([...SW_CACHE_ASSETS, ...Object.values(CDN_URLS)]),
};

const json = `${JSON.stringify(config, null, 2)}\n`;

await writeFile(configPath, json, "utf8");

console.log(`Generated ${path.relative(repoRoot, configPath)}`);
