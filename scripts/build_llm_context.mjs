import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const files = [
  "index.html",
  "sw.js",
  "assets/constants.js",
  "assets/config.js",
  "assets/storage.js",
  "assets/cloudSync.js",
  "assets/app.js",
  "assets/reader.js",
  "assets/ui.js",
  "assets/style.css",
  "docs/CORE_PRINCIPLES.md",
  "docs/SSOT_GUIDE.md",
  "docs/MODULE_GUIDE.md",
  "docs/COMMENT_GUIDE.md",
  "docs/REFACTOR_GUIDE.md",
  "docs/CSS_GUIDE.md"
];

function extLang(f) {
  if (f.endsWith(".html")) return "html";
  if (f.endsWith(".css")) return "css";
  if (f.endsWith(".sql")) return "sql";
  if (f.endsWith(".json")) return "json";
  if (f.endsWith(".md")) return "markdown";
  return "javascript";
}

const fileListMd = files.map((f) => `- \`${f}\``).join("\n");
const headerPath = path.join(__dirname, "LLM_CONTEXT_header.md");
let headerTemplate = "";
try {
  headerTemplate = fs.readFileSync(headerPath, "utf8");
} catch (e) {
  console.warn("LLM_CONTEXT_header.md missing. Using default header.");
  headerTemplate = "# LLM Context\n{{FILE_LIST}}\n---\n";
}
const header = headerTemplate.replace("{{FILE_LIST}}", fileListMd);

let out = header.replace(/\r\n/g, "\n");
for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) { console.warn("Skip missing:", rel); continue; }
  const body = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  out += `### ${rel}\n\n\`\`\`${extLang(rel)}\n${body}\n\`\`\`\n\n`;
}

const outPath = path.join(root, "LLM_CONTEXT.md");
fs.writeFileSync(outPath, out, "utf8");
console.log("Success: Generated LLM_CONTEXT.md", fs.statSync(outPath).size, "bytes");
