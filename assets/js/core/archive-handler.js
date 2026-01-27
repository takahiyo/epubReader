/**
 * archive-handler.js
 *
 * ZIP/RARアーカイブを扱うハンドラとファクトリ関数を提供します。
 */

import {
  BOOK_TYPES,
  CDN_URLS,
  DATA_ATTRS,
  FILE_EXTENSIONS,
  MIME_TYPES,
  SUPPORTED_FORMATS,
} from "../../constants.js";

const IMAGE_EXTENSIONS = new Set(
  SUPPORTED_FORMATS.IMAGES.map((ext) => ext.replace(".", "").toLowerCase())
);

/**
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
  return path.replace(/\\/g, "/");
}

/**
 * @param {string} fileName
 * @returns {boolean}
 */
function isIgnoredFileName(fileName) {
  const lower = fileName.toLowerCase();
  return fileName.startsWith(".") || fileName.startsWith("__") || lower === "thumbs.db";
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isImagePath(path) {
  const normalized = normalizePath(path);
  const fileName = normalized.split("/").pop() ?? normalized;
  if (!fileName || isIgnoredFileName(fileName)) return false;
  const ext = fileName.split(".").pop()?.toLowerCase();
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
}

/**
 * @param {string} path
 * @returns {string}
 */
function resolveImageMimeType(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return MIME_TYPES.PNG;
  if (ext === "gif") return MIME_TYPES.GIF;
  if (ext === "webp") return MIME_TYPES.WEBP;
  if (ext === "avif") return MIME_TYPES.AVIF;
  if (ext === "bmp") return MIME_TYPES.BMP;
  if (ext === "jpg" || ext === "jpeg") return MIME_TYPES.JPEG;
  return MIME_TYPES.JPEG;
}

/**
 * Blob から ArrayBuffer を生成して先頭バイトを取得します。
 * @param {Blob} file
 * @param {number} length
 * @returns {Promise<Uint8Array>}
 */
async function readHeaderBytes(file, length) {
  const slice = file.slice(0, length);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * @param {Blob} file
 * @returns {Promise<string>}
 */
async function detectArchiveType(file) {
  const header = await readHeaderBytes(file, 8);
  const isZip = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  const isRar =
    header[0] === 0x52 &&
    header[1] === 0x61 &&
    header[2] === 0x72 &&
    header[3] === 0x21 &&
    header[4] === 0x1a &&
    header[5] === 0x07;

  if (isRar) return BOOK_TYPES.RAR;
  if (isZip) return BOOK_TYPES.ZIP;

  const name = file.name ?? "";
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === FILE_EXTENSIONS.RAR || ext === FILE_EXTENSIONS.CBR) return BOOK_TYPES.RAR;
  if (ext === FILE_EXTENSIONS.ZIP || ext === FILE_EXTENSIONS.CBZ) return BOOK_TYPES.ZIP;

  const mime = file.type;
  if (mime === MIME_TYPES.RAR || mime === MIME_TYPES.RAR_LEGACY || mime === MIME_TYPES.CBR) {
    return BOOK_TYPES.RAR;
  }

  return BOOK_TYPES.ZIP;
}

/**
 * @param {string} src
 * @returns {Promise<void>}
 */
async function loadScript(src) {
  if (typeof document === "undefined") {
    throw new Error(`Script load requires document: ${src}`);
  }
  const existing = document.querySelector(`script[${DATA_ATTRS.READER_SRC}="${src}"]`);
  if (existing) {
    if (existing.dataset.loaded === "true") return;
    await new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
    });
    return;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.readerSrc = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * @returns {Promise<Object>}
 */
async function ensureJSZip() {
  const isPlaceholder = (lib) =>
    typeof lib?.loadAsync === "function" && lib.loadAsync.name === "missing";

  const globalZip = typeof JSZip !== "undefined" ? JSZip : null;
  const windowZip = typeof window !== "undefined" ? window.JSZip : null;
  const existing = globalZip || windowZip;

  if (existing && !isPlaceholder(existing)) {
    return existing;
  }

  if (existing && isPlaceholder(existing)) {
    console.warn("JSZip vendor file is a placeholder. Loading JSZip from CDN...");
  }

  const sources = [CDN_URLS.JSZIP, CDN_URLS.JSZIP_FALLBACK];
  for (const src of sources) {
    try {
      await loadScript(src);
      const loaded = typeof window !== "undefined" ? window.JSZip : null;
      if (loaded && !isPlaceholder(loaded)) {
        return loaded;
      }
    } catch (error) {
      console.warn(`Failed to load JSZip from CDN: ${src}`, error);
    }
  }

  throw new Error("JSZipの読み込みに失敗しました。公式JSZipを配置するかCDNにアクセスできる環境で再試行してください。");
}

/**
 * @returns {Promise<Object>}
 */
async function ensureUnrar() {
  if (typeof window !== "undefined") {
    const existing = window.unrar || window.Unrar || window.UnRAR;
    const isPlaceholder = (lib) =>
      typeof lib?.createExtractorFromData === "function" && lib.createExtractorFromData.name === "missing";

    if (existing && !isPlaceholder(existing)) {
      return existing;
    }
  }

  try {
    console.log("Loading node-unrar-js from CDN...");

    const JS_URL = CDN_URLS.UNRAR_JS;
    const WASM_URL = CDN_URLS.UNRAR_WASM;

    console.log(`Fetching WASM from: ${WASM_URL}`);
    const wasmPromise = fetch(WASM_URL).then((res) => {
      if (!res.ok) throw new Error(`Failed to load WASM: ${res.status} ${res.statusText}`);
      return res.arrayBuffer();
    });

    console.log(`Importing JS from: ${JS_URL}`);
    const modulePromise = import(JS_URL);

    const [wasmBinary, module] = await Promise.all([wasmPromise, modulePromise]);
    const createExtractor = module.createExtractorFromData || module.default?.createExtractorFromData;

    if (!createExtractor) {
      console.error("Loaded module exports:", module);
      throw new Error("createExtractorFromData がモジュール内に見つかりません。");
    }

    console.log("node-unrar-js loaded successfully.");

    return {
      createExtractorFromData: async (options) =>
        createExtractor({
          ...options,
          wasmBinary,
        }),
    };
  } catch (error) {
    console.error("RAR Library Load Error:", error);
    throw new Error(`RARライブラリの読み込みに失敗しました: ${error.message}`);
  }
}

export class ArchiveHandler {
  /**
   * @param {File|Blob} file
   */
  constructor(file) {
    this.file = file;
    this.type = null;
  }

  /**
   * @returns {Promise<ArchiveHandler>}
   */
  async init() {
    return this;
  }

  /**
   * @returns {Promise<string[]>}
   */
  async listImagePaths() {
    return [];
  }

  /**
   * @returns {Promise<Array<{ path: string, entry: any }>>}
   */
  async listImageEntries() {
    return [];
  }

  /**
   * @param {string} path
   * @returns {Promise<Blob>}
   */
  async getFileBlob(path) {
    throw new Error(`getFileBlob not implemented for ${path}`);
  }

  /**
   * @returns {string}
   */
  getArchiveLabel() {
    return "ARCHIVE";
  }
}

export class ZipHandler extends ArchiveHandler {
  /**
   * @param {File|Blob} file
   */
  constructor(file) {
    super(file);
    this.type = BOOK_TYPES.ZIP;
    this.zip = null;
    this.entries = [];
  }

  /**
   * File/Blob を JSZip.loadAsync に渡して初期化します（ArrayBuffer 変換は行いません）。
   * @returns {Promise<ZipHandler>}
   */
  async init() {
    const JSZipLib = await ensureJSZip();
    // JSZip.loadAsync は File/Blob を直接扱えるため ArrayBuffer 変換は禁止（メモリ増加と誤用を防ぐ）。
    this.zip = await JSZipLib.loadAsync(this.file);
    const entries = [];
    this.zip.forEach((path, entry) => {
      if (!entry.dir) {
        entries.push({ path, entry });
      }
    });
    this.entries = entries;
    return this;
  }

  /**
   * @returns {Promise<string[]>}
   */
  async listImagePaths() {
    const entries = await this.listImageEntries();
    return entries.map(({ path }) => path);
  }

  /**
   * @returns {Promise<Array<{ path: string, entry: any }>>}
   */
  async listImageEntries() {
    return this.entries.filter(({ path }) => isImagePath(path));
  }

  /**
   * @param {string} path
   * @returns {Promise<Blob>}
   */
  async getFileBlob(path) {
    if (!this.zip) {
      throw new Error("ZIPが初期化されていません。");
    }
    const entry = this.zip.file(path);
    if (!entry) {
      throw new Error(`ZIP内にファイルが見つかりません: ${path}`);
    }
    return entry.async("blob");
  }

  /**
   * @returns {string}
   */
  getArchiveLabel() {
    return "ZIP/CBZ";
  }
}

export class RarHandler extends ArchiveHandler {
  /**
   * @param {File|Blob} file
   */
  constructor(file) {
    super(file);
    this.type = BOOK_TYPES.RAR;
    this.extractor = null;
    this.headers = [];
  }

  /**
   * RAR ライブラリ制約により File/Blob から ArrayBuffer を生成して初期化します。
   * @returns {Promise<RarHandler>}
   */
  async init() {
    const { createExtractorFromData } = await ensureUnrar();
    const buffer = await this.file.arrayBuffer();
    const extractor = await createExtractorFromData({ data: new Uint8Array(buffer) });
    const list = extractor.getFileList();
    const headers = [...(list?.fileHeaders ?? [])];
    this.extractor = extractor;
    this.headers = headers;
    return this;
  }

  /**
   * @returns {Promise<string[]>}
   */
  async listImagePaths() {
    const entries = await this.listImageEntries();
    return entries.map(({ path }) => path);
  }

  /**
   * @returns {Promise<Array<{ path: string, entry: any }>>}
   */
  async listImageEntries() {
    return this.headers
      .map((header) => {
        const name = header?.name ?? header?.fileName ?? header?.filename ?? header?.path ?? "";
        const isDir = header?.flags?.directory ?? header?.isDirectory ?? header?.directory ?? false;
        if (!name || isDir || !isImagePath(name)) {
          return null;
        }
        return { path: name, entry: header };
      })
      .filter(Boolean);
  }

  /**
   * @param {string} path
   * @returns {Promise<Blob>}
   */
  async getFileBlob(path) {
    if (!this.extractor) {
      throw new Error("RARが初期化されていません。");
    }
    const extracted = this.extractor.extract({ files: [path] });
    const files = [...(extracted?.files ?? [])];
    const item = files.find((entry) => {
      const header = entry?.fileHeader ?? entry?.header ?? entry;
      const name = header?.name ?? header?.fileName ?? header?.filename ?? entry?.name ?? "";
      return name === path;
    });

    const data = item?.extraction?.data ?? item?.extraction ?? item?.data ?? null;
    if (!data || data.length === 0) {
      throw new Error(`RAR内にファイルが見つからないか抽出に失敗しました: ${path}`);
    }

    const mimeType = resolveImageMimeType(path);
    return new Blob([data], { type: mimeType });
  }

  /**
   * @returns {string}
   */
  getArchiveLabel() {
    return "RAR/CBR";
  }
}

/**
 * @param {File|Blob} file
 * @returns {Promise<ArchiveHandler>}
 */
export async function createArchiveHandler(file) {
  const type = await detectArchiveType(file);
  const handler = type === BOOK_TYPES.RAR ? new RarHandler(file) : new ZipHandler(file);
  await handler.init();
  return handler;
}
