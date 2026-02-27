/**
 * streaming-zip-handler.js
 *
 * zip.js を使用したストリーミング ZIP ハンドラ。
 * 大容量 ZIP を一括展開せず、エントリー単位で1画像分のみメモリに展開する。
 * 既存の ArchiveHandler インターフェースに準拠。
 */

import {
    BOOK_TYPES,
    CDN_URLS,
    SUPPORTED_FORMATS,
    MIME_TYPES,
} from "../../constants.js";

// ========================================
// zip.js ライブラリローダー
// ========================================

let zipJsPromise = null;

/**
 * zip.js ライブラリを CDN から動的に読み込む。
 * 2回目以降はキャッシュされた Promise を返す。
 * @returns {Promise<object>} zip.js のグローバルオブジェクト (zip)
 */
async function ensureZipJs() {
    if (zipJsPromise) return zipJsPromise;

    zipJsPromise = (async () => {
        // グローバルに既に存在するか確認
        if (typeof window !== "undefined" && window.zip?.BlobReader) {
            return window.zip;
        }
        // CDN から <script> タグで読み込む
        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = CDN_URLS.ZIPJS;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("zip.js の読み込みに失敗しました"));
            document.head.appendChild(script);
        });
        if (typeof window.zip?.BlobReader !== "function") {
            throw new Error("zip.js が正しく読み込まれませんでした");
        }
        return window.zip;
    })();

    return zipJsPromise;
}

// ========================================
// ユーティリティ（archive-handler.js 共通ロジックの軽量版）
// ========================================

const FILE_NAME_CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F-\x9F]/g;

function sanitizePath(value) {
    return String(value ?? "").replace(FILE_NAME_CONTROL_CHARS_REGEX, "").trim();
}

function extractFileName(filePath) {
    const segments = sanitizePath(filePath).split(/[\\/]/);
    return segments.pop() ?? "";
}

function isIgnoredFileName(fileName) {
    const lowerName = fileName.toLowerCase();
    return (
        fileName.startsWith(".") ||
        fileName.startsWith("._") ||
        fileName.startsWith("__") ||
        lowerName === "thumbs.db"
    );
}

/**
 * 画像ファイルかどうかを判定する。
 * @param {string} path
 * @returns {{ matched: boolean, normalizedPath: string, fileName: string }}
 */
function analyzeImagePath(path) {
    const normalizedPath = sanitizePath(path);
    const fileName = extractFileName(normalizedPath);
    if (!fileName || isIgnoredFileName(fileName)) {
        return { matched: false, normalizedPath, fileName };
    }
    const lowerName = fileName.toLowerCase();
    const extMatch = /\.([^./\s]+)\s*$/.exec(lowerName);
    const ext = extMatch ? `.${extMatch[1]}` : "";
    const matched = Boolean(ext && SUPPORTED_FORMATS.IMAGES.includes(ext));
    return { matched, normalizedPath, fileName };
}

/**
 * パスから MIME タイプを推定する。
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
    if (ext === "jpg" || ext === "jpeg" || ext === "jfif") return MIME_TYPES.JPEG;
    if (ext === "heic") return MIME_TYPES.HEIC;
    if (ext === "heif") return MIME_TYPES.HEIF;
    if (ext === "tif" || ext === "tiff") return MIME_TYPES.TIFF;
    return MIME_TYPES.JPEG;
}

// ========================================
// StreamingZipHandler
// ========================================

/**
 * zip.js ベースのストリーミング ZIP ハンドラ。
 * ArchiveHandler インターフェース (init, listImageEntries, getFileBlob, getArchiveLabel) に準拠。
 *
 * JSZip と異なり、ZIP 全体を一括メモリ展開しない。
 * エントリー一覧の取得は軽量で、画像データは getFileBlob() 時に1枚ずつ展開される。
 */
export class StreamingZipHandler {
    /**
     * @param {File|Blob} file
     */
    constructor(file) {
        this.file = file;
        this.type = BOOK_TYPES.ZIP;
        /** @type {import("@zip.js/zip.js").ZipReader|null} */
        this.zipReader = null;
        /** @type {Array<{path: string, entry: object}>} */
        this.imageEntries = [];
        /** @type {Map<string, object>} パス → zip.js Entry */
        this.entryMap = new Map();
    }

    /**
     * zip.js の ZipReader を初期化する。
     * ZIP 全体はメモリに展開されず、エントリーのメタデータのみ取得する。
     * @returns {Promise<StreamingZipHandler>}
     */
    async init() {
        const zipLib = await ensureZipJs();
        this.zipReader = new zipLib.ZipReader(new zipLib.BlobReader(this.file));
        const rawEntries = await this.zipReader.getEntries();

        // 画像エントリーをフィルタし、パス→エントリーのマップを構築
        const imageEntries = [];
        for (const entry of rawEntries) {
            if (entry.directory) continue;
            const analyzed = analyzeImagePath(entry.filename);
            if (analyzed.matched) {
                imageEntries.push({ path: analyzed.normalizedPath, entry });
                this.entryMap.set(analyzed.normalizedPath, entry);
            }
        }

        // 階層対応 + ファイル名順に統一ソート
        imageEntries.sort((a, b) => {
            const normalize = (p) => p.replace(/\\/g, "/");
            return normalize(a.path).localeCompare(normalize(b.path), undefined, {
                numeric: true,
                sensitivity: "base",
            });
        });

        this.imageEntries = imageEntries;
        console.log(`[StreamingZipHandler] Initialized: ${imageEntries.length} images (streamed)`);
        return this;
    }

    /**
     * 画像パス一覧を返す。
     * @returns {Promise<string[]>}
     */
    async listImagePaths() {
        return this.imageEntries.map(({ path }) => path);
    }

    /**
     * 画像エントリー一覧を返す（ArchiveHandler 互換）。
     * @returns {Promise<Array<{path: string, entry: object}>>}
     */
    async listImageEntries() {
        return this.imageEntries;
    }

    /**
     * 指定パスの画像を Blob として取得する。
     * zip.js は要求されたエントリーだけをストリーミング展開するため、
     * メモリ消費は「展開する1画像分」のみ。
     * @param {string} path
     * @returns {Promise<Blob>}
     */
    async getFileBlob(path) {
        const entry = this.entryMap.get(path);
        if (!entry) {
            throw new Error(`ZIP内にファイルが見つかりません: ${path}`);
        }
        const zipLib = await ensureZipJs();
        const mimeType = resolveImageMimeType(path);
        const blob = await entry.getData(new zipLib.BlobWriter(mimeType));
        return blob;
    }

    /**
     * @returns {string}
     */
    getArchiveLabel() {
        return "ZIP/CBZ (Streaming)";
    }

    /**
     * ZipReader を閉じてリソースを解放する。
     */
    async close() {
        try {
            await this.zipReader?.close();
        } catch (e) {
            console.warn("[StreamingZipHandler] close error:", e);
        }
        this.zipReader = null;
    }

    /**
     * エラー報告（ArchiveHandler 互換のスタブ）
     * @param {string} _fileName
     * @param {Error} error
     */
    async reportArchiveError(_fileName, error) {
        console.warn("[StreamingZipHandler] Archive error:", error);
    }
}
