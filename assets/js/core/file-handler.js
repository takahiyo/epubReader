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
    IMAGE_VIEW_MODES
} from "../../constants.js";
import { createArchiveHandler } from "./archive-handler.js";
import { resolveErrorCode, t } from "../ui/i18n-utils.js";
import { showLoading, hideLoading } from "../ui/overlay-manager.js";
import { elements } from "../ui/elements.js";

/**
 * ファイルタイプを判定
 */
export function detectFileType(fileOrBuffer) {
    if (fileOrBuffer instanceof ArrayBuffer) {
        const view = new Uint8Array(fileOrBuffer);
        if (view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04) {
            // ZIP形式の場合、EPUBかどうかを判定するために mimetype ファイルを確認
            // 一般的に mimetype はZIPの先頭付近にあるが、念のため広い範囲（100バイト）をチェック
            const headerStr = String.fromCharCode(...view.slice(0, 100));
            if (headerStr.includes("mimetype") && headerStr.includes("application/epub+zip")) {
                return BOOK_TYPES.EPUB;
            }
            // EPUBと確信できない場合は null を返し、拡張子による判定へフォールバックさせる
            // これにより、マジックナンバー判定の誤爆を防ぐ
            return null;
        }
        if (view[0] === 0x52 && view[1] === 0x61 && view[2] === 0x72 && view[3] === 0x21 && view[4] === 0x1a && view[5] === 0x07) {
            return BOOK_TYPES.RAR;
        }
        if (view[0] === 0x52 && view[1] === 0x61 && view[2] === 0x72 && view[3] === 0x21 && view[4] === 0x1a && view[5] === 0x07 && view[6] === 0x01) {
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
 */
export async function hashBuffer(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    const hex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hex;
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
