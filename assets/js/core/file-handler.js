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
            const str = String.fromCharCode(...view.slice(30, 60));
            if (str.includes("mimetypeapplication/epub+zip")) {
                return BOOK_TYPES.EPUB;
            }
            return BOOK_TYPES.ZIP;
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
    storage.mergeCloudIndex({ [cloudBookId]: meta }, meta.updatedAt);
    if (isCloudSyncEnabled()) {
        try {
            await cloudSync.pushIndexDelta({ [cloudBookId]: meta }, meta.updatedAt);
        } catch (error) {
            console.warn("クラウドインデックスの更新に失敗しました:", error);
        }
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
