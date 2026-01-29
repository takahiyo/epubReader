/**
 * archive-handler.js
 *
 * ZIP/RARアーカイブを扱うハンドラとファクトリ関数を提供します。
 */

import {
  ARCHIVE_WARNING_EVENT,
  ARCHIVE_WARNING_TYPES,
  ARCHIVE_LIBRARY_ERRORS,
  ARCHIVE_PROCESSING_ERRORS,
  ARCHIVE_WORKER_MESSAGES,
  ASSET_PATHS,
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

const isWorkerSupported = () => typeof Worker !== "undefined";

function createRarWorker() {
  if (!isWorkerSupported()) return null;
  try {
    return new Worker(new URL("../workers/rar-worker.js", import.meta.url), { type: "module" });
  } catch (error) {
    console.warn(ARCHIVE_LIBRARY_ERRORS.UNRAR_WORKER_FALLBACK, error);
    return null;
  }
}

class ArchiveWorkerClient {
  constructor(worker) {
    this.worker = worker;
    this.requestId = 0;
    this.pending = new Map();

    this.worker.addEventListener("message", (event) => {
      const { id, type, payload, error } = event.data || {};
      if (!id || !this.pending.has(id)) return;
      const { resolve, reject } = this.pending.get(id);
      this.pending.delete(id);
      if (type === ARCHIVE_WORKER_MESSAGES.ERROR) {
        reject(new Error(error?.message || ARCHIVE_LIBRARY_ERRORS.UNRAR_LOAD_FAILED));
        return;
      }
      resolve(payload);
    });

    this.worker.addEventListener("error", (event) => {
      this.rejectAll(new Error(event?.message || ARCHIVE_LIBRARY_ERRORS.UNRAR_LOAD_FAILED));
    });
  }

  rejectAll(error) {
    for (const { reject } of this.pending.values()) {
      reject(error);
    }
    this.pending.clear();
  }

  request(type, payload, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload }, transfer);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.pending.clear();
  }
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

  if (!existing && typeof document === "undefined") {
    throw new Error(ARCHIVE_LIBRARY_ERRORS.JSZIP_NOT_FOUND);
  }

  if (existing && isPlaceholder(existing)) {
    console.warn("JSZip vendor file is a placeholder. Loading JSZip from CDN...");
  }

  const sources = [ASSET_PATHS.VENDOR_JSZIP, CDN_URLS.JSZIP, CDN_URLS.JSZIP_FALLBACK];
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

  throw new Error(ARCHIVE_LIBRARY_ERRORS.JSZIP_LOAD_FAILED);
}

function emitArchiveWarnings(warningTypes = []) {
  if (typeof document === "undefined" || !warningTypes.length) {
    return;
  }
  document.dispatchEvent(
    new CustomEvent(ARCHIVE_WARNING_EVENT, {
      detail: { warningTypes },
    })
  );
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

  if (typeof window === "undefined") {
    throw new Error(ARCHIVE_LIBRARY_ERRORS.UNRAR_NOT_FOUND);
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
      throw new Error(ARCHIVE_LIBRARY_ERRORS.UNRAR_NOT_FOUND);
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
    const message = error instanceof Error ? error.message : ARCHIVE_LIBRARY_ERRORS.UNRAR_LOAD_FAILED;
    throw new Error(message);
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
    this.workerClient = null;
  }

  /**
   * RAR ライブラリ制約により File/Blob から ArrayBuffer を生成して初期化します。
   * @returns {Promise<RarHandler>}
   */
  async init() {
    const buffer = await this.file.arrayBuffer();
    const worker = createRarWorker();
    if (worker) {
      const client = new ArchiveWorkerClient(worker);
      try {
        const payload = await client.request(ARCHIVE_WORKER_MESSAGES.INIT, { buffer }, [buffer]);
        this.workerClient = client;
        this.headers = payload?.headers ?? [];
      } catch (error) {
        console.warn(ARCHIVE_LIBRARY_ERRORS.UNRAR_WORKER_FALLBACK, error);
        client.terminate();
        this.workerClient = null;
      }
    }

    if (!this.workerClient) {
      const { createExtractorFromData } = await ensureUnrar();
      const extractor = await createExtractorFromData({ data: new Uint8Array(buffer) });
      const list = extractor.getFileList();
      const headers = [...(list?.fileHeaders ?? [])];
      this.extractor = extractor;
      this.headers = headers;
    }
    emitArchiveWarnings([
      ARCHIVE_WARNING_TYPES.RAR_NO_STREAM,
      ARCHIVE_WARNING_TYPES.RAR_SOLID_FULL_EXTRACT,
    ]);
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
    if (!this.extractor && !this.workerClient) {
      throw new Error(ARCHIVE_LIBRARY_ERRORS.UNRAR_NOT_FOUND);
    }
    if (this.workerClient) {
      const payload = await this.workerClient.request(ARCHIVE_WORKER_MESSAGES.EXTRACT, { path });
      const buffer = payload?.buffer;
      if (!buffer) {
        throw new Error(`${ARCHIVE_PROCESSING_ERRORS.RAR_EXTRACT_FAILED}: ${path}`);
      }
      const mimeType = resolveImageMimeType(path);
      return new Blob([buffer], { type: mimeType });
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
      throw new Error(`${ARCHIVE_PROCESSING_ERRORS.RAR_EXTRACT_FAILED}: ${path}`);
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
