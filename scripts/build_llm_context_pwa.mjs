import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// PWAに関係する重要なファイルを厳選
const PWA_FILES = [
  "manifest.json",
  "sw.js",
  "index.html",
  "assets/sw-cache-config.json",
  "assets/constants.js",
  "assets/config.js",
  "assets/constants/pwa.js",
  "assets/constants/app-info.js",
  "assets/constants/runtime-config.js",
  "assets/app.js",
  "assets/ui.js",
  "assets/storage.js",
  "docs/CORE_PRINCIPLES.md",
  "FULLSCREEN_REPAGINATION_DEBUG.md"
];

function extLang(f) {
  if (f.endsWith(".html")) return "html";
  if (f.endsWith(".css")) return "css";
  if (f.endsWith(".sql")) return "sql";
  if (f.endsWith(".json")) return "json";
  if (f.endsWith(".md")) return "markdown";
  return "javascript";
}

const fileListMd = PWA_FILES.map((f) => `- \`${f}\``).join("\n");
const headerPath = path.join(__dirname, "LLM_CONTEXT_header.md");
let headerTemplate = "";
try {
  headerTemplate = fs.readFileSync(headerPath, "utf8");
} catch (e) {
  headerTemplate = "# LLM向け PWA・コンテキスト\n{{FILE_LIST}}\n---\n";
}

const header = headerTemplate
  .replace("# LLM向けプロジェクト・コンテキスト", "# LLM向け PWA・コンテキスト")
  .replace("{{FILE_LIST}}", fileListMd);

let out = header.replace(/\r\n/g, "\n");
out += "\n> [!NOTE]\n> このファイルはPWAおよび画面制御（リサイズ/全画面）に関連するコードのみを抽出した軽量版です。\n\n---\n\n";

for (const rel of PWA_FILES) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) { console.warn("Skip missing:", rel); continue; }
  const body = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  out += `### ${rel}\n\n\`\`\`${extLang(rel)}\n${body}\n\`\`\`\n\n`;
}

const outPath = path.join(root, "LLM_CONTEXT_PWA.md");
fs.writeFileSync(outPath, out, "utf8");
console.log("Success: Generated LLM_CONTEXT_PWA.md", fs.statSync(outPath).size, "bytes", `(${PWA_FILES.length} files)`);
