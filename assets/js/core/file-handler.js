/**
 * assets/js/core/file-handler.js 
 * 
 * File processing logic.
 */

import {
    BOOK_TYPES,
    FILE_EXTENSIONS,
    MIME_TYPES,
    FILESTORE_CONFIG,
    TIMING_CONFIG,
    UI_CLASSES,
    IMAGE_VIEW_MODES,
    FILE_STRATEGY
} from "../../constants.js";
import { createArchiveHandler } from "./archive-handler.js";
import { resolveErrorCode, t } from "../ui/i18n-utils.js";
import { showLoading, hideLoading } from "../ui/overlay-manager.js";
import { elements } from "../ui/elements.js";

// ========================================
// Environment Detection
// ========================================

/**
 * Detects device environment (memory, CPU, connection).
 */
export function detectEnvironment() {
    const memoryGB = navigator.deviceMemory ?? 4;
    const cpuCores = navigator.hardwareConcurrency ?? 2;
    const connectionType = navigator.connection?.effectiveType ?? null;
    const isLowEnd =
        memoryGB < FILE_STRATEGY.LOW_MEMORY_THRESHOLD_GB ||
        cpuCores <= 1 ||
        connectionType === "slow-2g" ||
        connectionType === "2g";
    return { memoryGB, cpuCores, connectionType, isLowEnd };
}

/**
 * Selects loading strategy based on file size and environment.
 */
export function selectLoadingStrategy(file, env) {
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB < FILE_STRATEGY.DIRECT_THRESHOLD_MB && !env.isLowEnd) {
        return "direct";
    }
    console.log(`[Strategy] Selecting deferred strategy: ` +
        `memory=${env.memoryGB}GB, cores=${env.cpuCores}, ` +
        `connection=${env.connectionType ?? "unknown"}, isLowEnd=${env.isLowEnd}`);
    return "deferred";
}

/**
 * Determines whether to use streaming for ZIP files.
 */
export function shouldUseStreaming(file) {
    const env = detectEnvironment();
    const fileSizeMB = file.size / (1024 * 1024);
    const estimatedPeakMB = fileSizeMB * FILE_STRATEGY.JSZIP_PEAK_MULTIPLIER;

    let safeMemoryMB;
    let memorySource;

    const jsHeapLimit = (typeof performance !== "undefined" && performance.memory)
        ? performance.memory.jsHeapSizeLimit
        : 0;

    if (jsHeapLimit > 0) {
        safeMemoryMB = (jsHeapLimit / (1024 * 1024)) * 0.30;
        memorySource = `jsHeapLimit=${(jsHeapLimit / (1024 * 1024)).toFixed(0)}MB*0.30`;
    } else {
        safeMemoryMB = env.memoryGB * 1024 * 0.10;
        memorySource = `deviceMemory=${env.memoryGB}GB*0.10`;
    }

    const needsStreaming = estimatedPeakMB > safeMemoryMB ||
        (env.isLowEnd && fileSizeMB > FILE_STRATEGY.LARGE_FILE_THRESHOLD / (1024 * 1024));

    console.log(`[Streaming] shouldUseStreaming: ${needsStreaming} - ` +
        `file=${fileSizeMB.toFixed(1)}MB, peak=${estimatedPeakMB.toFixed(0)}MB, ` +
        `safe=${safeMemoryMB.toFixed(0)}MB (${memorySource}), ` +
        `isLowEnd=${env.isLowEnd}`);
    return needsStreaming;
}

/**
 * Reads the first N bytes of a file.
 */
export async function readFileHeader(file, byteCount = FILE_STRATEGY.HEADER_BYTES) {
    const slice = file.slice(0, byteCount);
    return await slice.arrayBuffer();
}

/**
 * Retries file reading on NotReadableError.
 */
export async function readFileWithRetry(file, readFn) {
    let lastError = null;
    for (let attempt = 0; attempt <= FILE_STRATEGY.PERMISSION_RETRY_MAX; attempt++) {
        try {
            return await readFn();
        } catch (error) {
            lastError = error;
            if (error.name === "NotReadableError" && attempt < FILE_STRATEGY.PERMISSION_RETRY_MAX) {
                console.warn(
                    `[readFileWithRetry] NotReadableError on attempt ${attempt + 1}/${FILE_STRATEGY.PERMISSION_RETRY_MAX + 1}` +
                    ` for "${file.name}". Retrying in ${FILE_STRATEGY.PERMISSION_RETRY_DELAY_MS}ms...`
                );
                await new Promise(resolve => setTimeout(resolve, FILE_STRATEGY.PERMISSION_RETRY_DELAY_MS));
            } else {
                break;
            }
        }
    }
    if (lastError?.name === "NotReadableError") {
        const wrapped = new Error(
            `ファイル「${file.name}」へのアクセス権限が失われました。再度ファイルを選択してください。`
        );
        wrapped.name = "NotReadableError";
        wrapped.cause = lastError;
        throw wrapped;
    }
    throw lastError;
}

// ========================================
// File Type Detection
// ========================================

/**
 * Detects file type from magic numbers or extension.
 */
export function detectFileType(fileOrBuffer) {
    if (fileOrBuffer instanceof ArrayBuffer) {
        const view = new Uint8Array(fileOrBuffer);
        if (view.length >= 4 && view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04) {
            const checkLen = Math.min(view.length, FILE_STRATEGY.HEADER_BYTES);
            const headerStr = String.fromCharCode(...view.slice(0, checkLen));
            if (headerStr.includes("mimetype") && headerStr.includes("application/epub+zip")) {
                return BOOK_TYPES.EPUB;
            }
            return null;
        }
        if (view.length >= 6 && view[0] === 0x52 && view[1] === 0x61 && view[2] === 0x72 && view[3] === 0x21 && view[4] === 0x1a && view[5] === 0x07) {
            return BOOK_TYPES.RAR;
        }
        if (view.length >= 7 && view[0] === 0x52 && view[1] === 0x61 && view[2] === 0x72 && view[3] === 0x21 && view[4] === 0x1a && view[5] === 0x07 && view[6] === 0x01) {
            return BOOK_TYPES.RAR;
        }
    }

    const name = fileOrBuffer.name || "";
    const ext = name.split(".").pop().toLowerCase();
    if (ext === FILE_EXTENSIONS.EPUB) return BOOK_TYPES.EPUB;
    if (ext === FILE_EXTENSIONS.RAR || ext === FILE_EXTENSIONS.CBR) return BOOK_TYPES.RAR;
    if (ext === FILE_EXTENSIONS.ZIP || ext === FILE_EXTENSIONS.CBZ) return BOOK_TYPES.ZIP;

    return null;
}

/**
 * Returns file title without extension.
 */
export function fileTitle(name) {
    return name.replace(/\.[^.]+$/, "");
}

/**
 * Guesses MIME type.
 */
export function guessMime(type, file) {
    if (type === BOOK_TYPES.EPUB) return MIME_TYPES.EPUB;
    if (type === BOOK_TYPES.IMAGE) {
        return FILESTORE_CONFIG.DEFAULT_MIME_TYPE;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === FILE_EXTENSIONS.CBR) return MIME_TYPES.CBR;
    if (ext === FILE_EXTENSIONS.CBZ) return MIME_TYPES.CBZ;
    if (ext === FILE_EXTENSIONS.RAR) return MIME_TYPES.RAR;

    return file.type || FILESTORE_CONFIG.DEFAULT_MIME_TYPE;
}

/**
 * Calculates SHA-256 hash of a buffer.
 */
export async function hashBuffer(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    const hex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hex;
}

/**
 * Calculates lightweight hash by reading first and last 1MB.
 */
export async function hashFileLightweight(file) {
    const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
    const fileSize = file.size;

    const headEnd = Math.min(CHUNK_SIZE, fileSize);
    const headSlice = file.slice(0, headEnd);
    const headBuffer = await headSlice.arrayBuffer();

    let tailBuffer = new ArrayBuffer(0);
    if (fileSize > CHUNK_SIZE) {
        const tailStart = Math.max(fileSize - CHUNK_SIZE, headEnd);
        const tailSlice = file.slice(tailStart, fileSize);
        tailBuffer = await tailSlice.arrayBuffer();
    }

    const sizeBuffer = new ArrayBuffer(8);
    const sizeView = new DataView(sizeBuffer);
    sizeView.setUint32(0, Math.floor(fileSize / 0x100000000), false);
    sizeView.setUint32(4, fileSize >>> 0, false);

    const combined = new Uint8Array(headBuffer.byteLength + tailBuffer.byteLength + sizeBuffer.byteLength);
    combined.set(new Uint8Array(headBuffer), 0);
    combined.set(new Uint8Array(tailBuffer), headBuffer.byteLength);
    combined.set(new Uint8Array(sizeBuffer), headBuffer.byteLength + tailBuffer.byteLength);

    console.log(`[hashFileLightweight] ${file.name}: head=${headBuffer.byteLength}B + tail=${tailBuffer.byteLength}B + size=8B -> ${combined.byteLength}B`);
    return hashBuffer(combined.buffer);
}

/**
 * Resolves entry size from various archive formats.
 */
function resolveArchiveEntrySize(entry) {
    const sizeCandidates = [
        entry?.uncompressedSize,
        entry?.size,
        entry?.packedSize,
        entry?.fileSize,
        entry?.unpackedSize,
        entry?.compressedSize,
        entry?._data?.uncompressedSize,
        entry?._data?.compressedSize,
        entry?.data?.length,
    ];
    const size = sizeCandidates.find((candidate) => Number.isFinite(candidate));
    return Number.isFinite(size) ? size : 0;
}

/**
 * Finds book in library by content hash.
 */
export function findBookByContentHash(library, contentHash) {
    const shortHash = contentHash.slice(0, 12);
    for (const book of Object.values(library)) {
        if (book?.contentHash === contentHash) {
            return book;
        }
    }
    for (const book of Object.values(library)) {
        if (book?.id?.endsWith(`- ${shortHash}`)) {
            return book;
        }
    }
    return null;
}

/**
 * Generates cloud book ID.
 */
export function generateCloudBookId() {
    if (crypto?.randomUUID) {
        return crypto.randomUUID();
    }
    return `cloud-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Builds cloud metadata.
 */
export function buildCloudMeta({ cloudBookId, info, fingerprint, storage, overrides = {}, uiLanguage }) {
    const existing = storage.data.cloudIndex?.[cloudBookId] ?? {};
    const fingerprints = new Set([
        ...(existing.fingerprints ?? []),
        ...(overrides.fingerprints ?? []),
    ]);
    if (fingerprint) fingerprints.add(fingerprint);

    const meta = {
        ...existing,
        ...overrides,
        title: info.title,
        author: info.author,
        fingerprints: Array.from(fingerprints),
        updatedAt: Date.now(),
    };
    return meta;
}

/**
 * Builds matching metadata.
 */
export function buildMatchMeta(info) {
    return {
        title: info?.title ?? "",
        author: info?.author ?? "",
        identifiers: info?.identifiers ?? [],
    };
}
