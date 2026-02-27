/**
 * assets/js/core/file-handler.js
 * 
 * ファイル処理と書籍の読み込みロジックを担当します。
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
// 環境検知・読み込み戦略
// ========================================

/**
 * 端末の環境プロファイルを返す。
 * navigator.deviceMemory / navigator.connection / navigator.hardwareConcurrency
 * の各APIは利用可能な場合のみ参照し、非対応環境ではデフォルト値にフォールバックする。
 * @returns {{ memoryGB: number, cpuCores: number, connectionType: string|null, isLowEnd: boolean }}
 */
export function detectEnvironment() {
    // deviceMemory: Chrome系のみ対応（GB単位、未対応時は4想定）
    const memoryGB = navigator.deviceMemory ?? 4;
    // hardwareConcurrency: 大半のブラウザで対応（CPUコア数、未対応時は2想定）
    const cpuCores = navigator.hardwareConcurrency ?? 2;
    // Network Information API: 接続種別（Chrome系のみ）
    const connectionType = navigator.connection?.effectiveType ?? null;
    // 低スペック端末の判定：メモリ不足 or シングルコア or 低速回線
    const isLowEnd =
        memoryGB < FILE_STRATEGY.LOW_MEMORY_THRESHOLD_GB ||
        cpuCores <= 1 ||
        connectionType === "slow-2g" ||
        connectionType === "2g";
    return { memoryGB, cpuCores, connectionType, isLowEnd };
}

/**
 * ファイルサイズと環境に基づき、最適な読み込み戦略を選択する。
 * - "direct"  : 10MB以下 かつ 高スペック → arrayBuffer() で一括高速読み込み
 * - "deferred": 10MB超 または 低スペック → 先頭バイト読みで判定し、バッファ取得を遅延
 * @param {File} file - 対象ファイル
 * @returns {"direct"|"deferred"}
 */
export function selectLoadStrategy(file) {
    const env = detectEnvironment();
    const size = file.size;

    if (size <= FILE_STRATEGY.DIRECT_BUFFER_LIMIT && !env.isLowEnd) {
        console.log(`[Strategy] direct mode — ${(size / 1024 / 1024).toFixed(1)}MB, ` +
            `memory=${env.memoryGB}GB, cores=${env.cpuCores}`);
        return "direct";
    }

    console.log(`[Strategy] deferred mode — ${(size / 1024 / 1024).toFixed(1)}MB, ` +
        `memory=${env.memoryGB}GB, cores=${env.cpuCores}, ` +
        `connection=${env.connectionType ?? "unknown"}, isLowEnd=${env.isLowEnd}`);
    return "deferred";
}

/**
 * Blob.slice() を用いてファイルの先頭 N バイトだけを読み込む。
 * 全バッファを生成せずにマジックナンバー判定を行うために使用。
 * @param {File|Blob} file - 対象ファイル
 * @param {number} byteCount - 読み込むバイト数
 * @returns {Promise<ArrayBuffer>} 先頭バイトの ArrayBuffer
 */
export async function readFileHeader(file, byteCount = FILE_STRATEGY.HEADER_BYTES) {
    const slice = file.slice(0, byteCount);
    return await slice.arrayBuffer();
}

/**
 * NotReadableError（権限消失）発生時に自動リトライする汎用ラッパー。
 * ユーザーがファイルを選択した直後のコンテキストでは通常成功するが、
 * モバイル端末のバックグラウンド移行等で権限が消失するケースに対応。
 * @param {File} file - 対象ファイル（ログ出力用）
 * @param {() => Promise<T>} readFn - 実行する読み込み処理
 * @returns {Promise<T>}
 * @template T
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
    // リトライ上限を超えた場合、NotReadableError にはユーザー向けメッセージを付与
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
// ファイルタイプ判定
// ========================================

/**
 * マジックナンバーまたはファイル拡張子からファイルタイプを判定する。
 * ArrayBuffer（全体/先頭ヘッダ部分のみ）または File オブジェクトを受け取れる。
 * @param {ArrayBuffer|File|{name:string}} fileOrBuffer
 * @returns {string|null} BOOK_TYPES の値、または判定不能時 null
 */
export function detectFileType(fileOrBuffer) {
    // ArrayBuffer からのマジックナンバー判定
    if (fileOrBuffer instanceof ArrayBuffer) {
        const view = new Uint8Array(fileOrBuffer);
        if (view.length >= 4 && view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04) {
            // ZIP形式の場合、EPUBかどうかを判定するために mimetype ファイルを確認
            // 一般的に mimetype はZIPの先頭付近にあるが、念のため広い範囲をチェック
            const checkLen = Math.min(view.length, FILE_STRATEGY.HEADER_BYTES);
            const headerStr = String.fromCharCode(...view.slice(0, checkLen));
            if (headerStr.includes("mimetype") && headerStr.includes("application/epub+zip")) {
                return BOOK_TYPES.EPUB;
            }
            // EPUBと確信できない場合は null を返し、拡張子による判定へフォールバックさせる
            // これにより、マジックナンバー判定の誤爆を防ぐ
            return null;
        }
        // RAR4シグネチャ: 52 61 72 21 1A 07 00
        if (view.length >= 6 && view[0] === 0x52 && view[1] === 0x61 && view[2] === 0x72 && view[3] === 0x21 && view[4] === 0x1a && view[5] === 0x07) {
            return BOOK_TYPES.RAR;
        }
        // RAR5シグネチャ: 52 61 72 21 1A 07 01 00
        if (view.length >= 7 && view[0] === 0x52 && view[1] === 0x61 && view[2] === 0x72 && view[3] === 0x21 && view[4] === 0x1a && view[5] === 0x07 && view[6] === 0x01) {
            return BOOK_TYPES.RAR;
        }
    }

    // ファイル名の拡張子によるフォールバック判定
    const name = fileOrBuffer.name || "";
    const ext = name.split(".").pop().toLowerCase();
    if (ext === FILE_EXTENSIONS.EPUB) return BOOK_TYPES.EPUB;
    if (ext === FILE_EXTENSIONS.RAR || ext === FILE_EXTENSIONS.CBR) return BOOK_TYPES.RAR;
    if (ext === FILE_EXTENSIONS.ZIP || ext === FILE_EXTENSIONS.CBZ) return BOOK_TYPES.ZIP;

    return null;
}

/**
 * ファイル名から拡張子を除いたタイトルを取得
 */
export function fileTitle(name) {
    return name.replace(/\.[^.]+$/, "");
}

/**
 * MIMEタイプを推測
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
 * バッファのハッシュ(SHA-256)を計算
 * @param {ArrayBuffer} buffer - ハッシュ対象のバッファ
 * @returns {Promise<string>} 16進数のハッシュ文字列
 */
export async function hashBuffer(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    const hex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hex;
}

/**
 * 大容量ファイル向けの軽量ハッシュ計算。
 * SubtleCrypto はストリーミングハッシュに非対応のため、
 * ファイル全体を読み込まず「先頭1MB + 末尾1MB + ファイルサイズ」を
 * フィンガープリントとしてSHA-256ハッシュする。
 * ピークメモリは最大約2MB。
 * @param {File|Blob} file - ハッシュ対象のファイル
 * @returns {Promise<string>} 16進数のハッシュ文字列
 */
export async function hashFileLightweight(file) {
    const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
    const fileSize = file.size;

    // 先頭チャンクを読み込み
    const headEnd = Math.min(CHUNK_SIZE, fileSize);
    const headSlice = file.slice(0, headEnd);
    const headBuffer = await headSlice.arrayBuffer();

    // 末尾チャンクを読み込み（先頭と重複する場合はスキップ）
    let tailBuffer = new ArrayBuffer(0);
    if (fileSize > CHUNK_SIZE) {
        const tailStart = Math.max(fileSize - CHUNK_SIZE, headEnd);
        const tailSlice = file.slice(tailStart, fileSize);
        tailBuffer = await tailSlice.arrayBuffer();
    }

    // ファイルサイズを8バイトのバッファに変換
    const sizeBuffer = new ArrayBuffer(8);
    const sizeView = new DataView(sizeBuffer);
    // ファイルサイズが2^32を超える可能性があるためhigh/lowに分割
    sizeView.setUint32(0, Math.floor(fileSize / 0x100000000), false);
    sizeView.setUint32(4, fileSize >>> 0, false);

    // 3つの要素を結合してハッシュ
    const combined = new Uint8Array(headBuffer.byteLength + tailBuffer.byteLength + sizeBuffer.byteLength);
    combined.set(new Uint8Array(headBuffer), 0);
    combined.set(new Uint8Array(tailBuffer), headBuffer.byteLength);
    combined.set(new Uint8Array(sizeBuffer), headBuffer.byteLength + tailBuffer.byteLength);

    console.log(`[hashFileLightweight] ${file.name}: head=${headBuffer.byteLength}B + tail=${tailBuffer.byteLength}B + size=8B → ${combined.byteLength}B`);
    return hashBuffer(combined.buffer);
}

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

function buildArchiveFingerprintPayload(entries) {
    const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true, sensitivity: "base" }));
    return {
        count: sorted.length,
        files: sorted.map(({ path, entry }) => ({
            path,
            size: resolveArchiveEntrySize(entry),
        })),
    };
}

export async function buildArchiveFingerprint(file) {
    const handler = await createArchiveHandler(file);
    const entries = await handler.listImageEntries();
    const payload = buildArchiveFingerprintPayload(entries);
    const json = JSON.stringify(payload);
    const buffer = new TextEncoder().encode(json).buffer;
    return hashBuffer(buffer);
}

/**
 * ハッシュからライブラリ内の書籍を検索
 */
export function findBookByContentHash(library, contentHash) {
    const shortHash = contentHash.slice(0, 12);
    for (const book of Object.values(library)) {
        if (book?.contentHash === contentHash) {
            return book;
        }
    }
    for (const book of Object.values(library)) {
        if (book?.id?.endsWith(`-${shortHash}`)) {
            return book;
        }
    }
    return null;
}

/**
 * クラウド書籍IDを生成
 */
export function generateCloudBookId() {
    if (crypto?.randomUUID) {
        return crypto.randomUUID();
    }
    return `cloud-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * クラウドメタデータを構築
 */
export function buildCloudMeta({ cloudBookId, info, fingerprint, storage, overrides = {}, uiLanguage }) {
    const existing = storage.data.cloudIndex?.[cloudBookId] ?? {};
    const fingerprints = new Set([
        ...(existing.fingerprints ?? []),
        ...(overrides.fingerprints ?? []),
    ]);
    if (fingerprint) fingerprints.add(fingerprint);
    return {
        cloudBookId,
        title: overrides.title ?? info?.title ?? existing.title ?? t("untitledBook", uiLanguage),
        author: overrides.author ?? info?.author ?? existing.author ?? "",
        identifiers: overrides.identifiers ?? existing.identifiers ?? [],
        fingerprints: Array.from(fingerprints),
        fileType: overrides.fileType ?? info?.type ?? existing.fileType ?? null,
        lastReadAt: overrides.lastReadAt ?? Date.now(),
        updatedAt: Date.now(),
        createdAt: existing.createdAt ?? overrides.createdAt ?? Date.now(),
    };
}

/**
 * クラウドインデックスを更新
 */
export async function upsertCloudIndexEntry(cloudBookId, info, fingerprint, { storage, cloudSync, isCloudSyncEnabled, uiLanguage, overrides = {} }) {
    if (!cloudBookId) return null;
    const meta = buildCloudMeta({ cloudBookId, info, fingerprint, storage, overrides, uiLanguage });

    if (isCloudSyncEnabled()) {
        try {
            await cloudSync.pushIndexDelta({ [cloudBookId]: meta }, meta.updatedAt);
            // プッシュ成功後にのみローカルのクラウドインデックスを更新
            storage.mergeCloudIndex({ [cloudBookId]: meta }, meta.updatedAt);
        } catch (error) {
            console.warn("クラウドインデックスの更新に失敗しました。次回の同期で再試行されます:", error);
            // 失敗時はローカルのクラウドインデックスを更新しないことで、
            // 次回の syncAllBooksFromCloud のアップロードループで再試行対象になるようにする
        }
    } else {
        // 同期が無効な場合はローカルのみ更新
        storage.mergeCloudIndex({ [cloudBookId]: meta }, meta.updatedAt);
    }
    return meta;
}

/**
 * 照合用メタデータを構築
 */
export function buildMatchMeta(info) {
    return {
        title: info?.title ?? "",
        author: info?.author ?? "",
        identifiers: info?.identifiers ?? [],
    };
}
