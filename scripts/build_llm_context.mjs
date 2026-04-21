import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// インクルードする拡張子
const TARGET_EXTENSIONS = [".js", ".css", ".html", ".json", ".md", ".sql"];

// 除外するディレクトリ/ファイル名（部分一致）
const EXCLUDE_PATTERNS = [
  "node_modules",
  ".git",
  ".wrangler",
  ".gemini",
  "assets/vendor",
  "assets/animations",
  "temp_test_",
  "LLM_CONTEXT.md",
  "epub_file_handler_full.js",
  "epub_file_handler_head.txt"
];

/**
 * プロジェクト内の全ファイルを再帰的に取得
 */
function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    const relPath = path.relative(root, fullPath).replace(/\\/g, "/");

    // 除外パターンのチェック
    if (EXCLUDE_PATTERNS.some(p => relPath.includes(p))) {
      return;
    }

    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      // 拡張子のチェック
      if (TARGET_EXTENSIONS.includes(path.extname(file))) {
        arrayOfFiles.push(relPath);
      }
    }
  });

  return arrayOfFiles;
}

function extLang(f) {
  if (f.endsWith(".html")) return "html";
  if (f.endsWith(".css")) return "css";
  if (f.endsWith(".sql")) return "sql";
  if (f.endsWith(".json")) return "json";
  if (f.endsWith(".md")) return "markdown";
  return "javascript";
}

// ファイル探索の実行
console.log("Searching for files...");
const files = getAllFiles(root);
files.sort(); // 決定論的な順序のためにソート

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
console.log(`Aggregating ${files.length} files...`);

for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) { console.warn("Skip missing:", rel); continue; }
  const body = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  out += `### ${rel}\n\n\`\`\`${extLang(rel)}\n${body}\n\`\`\`\n\n`;
}

const outPath = path.join(root, "LLM_CONTEXT.md");
fs.writeFileSync(outPath, out, "utf8");
console.log("Success: Generated LLM_CONTEXT.md", fs.statSync(outPath).size, "bytes", `(${files.length} files)`);
