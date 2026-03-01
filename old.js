/**
 * assets/js/core/file-handler.js
 * 
 * 繝輔ぃ繧､繝ｫ蜃ｦ逅・→譖ｸ邀阪・隱ｭ縺ｿ霎ｼ縺ｿ繝ｭ繧ｸ繝・け繧呈球蠖薙＠縺ｾ縺吶・ */

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
 * 繝輔ぃ繧､繝ｫ繧ｿ繧､繝励ｒ蛻､螳・ */
export function detectFileType(fileOrBuffer) {
    if (fileOrBuffer instanceof ArrayBuffer) {
        const view = new Uint8Array(fileOrBuffer);
        if (view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04) {
            // ZIP蠖｢蠑上・蝣ｴ蜷医・PUB縺九←縺・°繧貞愛螳壹☆繧九◆繧√↓ mimetype 繝輔ぃ繧､繝ｫ繧堤｢ｺ隱・            // 荳闊ｬ逧・↓ mimetype 縺ｯZIP縺ｮ蜈磯ｭ莉倩ｿ代↓縺ゅｋ縺後∝ｿｵ縺ｮ縺溘ａ蠎・＞遽・峇・・00繝舌う繝茨ｼ峨ｒ繝√ぉ繝・け
            const headerStr = String.fromCharCode(...view.slice(0, 100));
            if (headerStr.includes("mimetype") && headerStr.includes("application/epub+zip")) {
                return BOOK_TYPES.EPUB;
            }
            // EPUB縺ｨ遒ｺ菫｡縺ｧ縺阪↑縺・ｴ蜷医・ null 繧定ｿ斐＠縲∵僑蠑ｵ蟄舌↓繧医ｋ蛻､螳壹∈繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ縺輔○繧・            // 縺薙ｌ縺ｫ繧医ｊ縲√・繧ｸ繝・け繝翫Φ繝舌・蛻､螳壹・隱､辷・ｒ髦ｲ縺・            return null;
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
 * 繝輔ぃ繧､繝ｫ蜷阪°繧画僑蠑ｵ蟄舌ｒ髯､縺・◆繧ｿ繧､繝医Ν繧貞叙蠕・ */
export function fileTitle(name) {
    return name.replace(/\.[^.]+$/, "");
}

/**
 * MIME繧ｿ繧､繝励ｒ謗ｨ貂ｬ
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
 * 繝舌ャ繝輔ぃ縺ｮ繝上ャ繧ｷ繝･(SHA-256)繧定ｨ育ｮ・ */
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
 * 繝上ャ繧ｷ繝･縺九ｉ繝ｩ繧､繝悶Λ繝ｪ蜀・・譖ｸ邀阪ｒ讀懃ｴ｢
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
 * 繧ｯ繝ｩ繧ｦ繝画嶌邀巧D繧堤函謌・ */
export function generateCloudBookId() {
    if (crypto?.randomUUID) {
        return crypto.randomUUID();
    }
    return `cloud-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 繧ｯ繝ｩ繧ｦ繝峨Γ繧ｿ繝・・繧ｿ繧呈ｧ狗ｯ・ */
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
 * 繧ｯ繝ｩ繧ｦ繝峨う繝ｳ繝・ャ繧ｯ繧ｹ繧呈峩譁ｰ
 */
export async function upsertCloudIndexEntry(cloudBookId, info, fingerprint, { storage, cloudSync, isCloudSyncEnabled, uiLanguage, overrides = {} }) {
    if (!cloudBookId) return null;
    const meta = buildCloudMeta({ cloudBookId, info, fingerprint, storage, overrides, uiLanguage });

    if (isCloudSyncEnabled()) {
        try {
            await cloudSync.pushIndexDelta({ [cloudBookId]: meta }, meta.updatedAt);
            // 繝励ャ繧ｷ繝･謌仙粥蠕後↓縺ｮ縺ｿ繝ｭ繝ｼ繧ｫ繝ｫ縺ｮ繧ｯ繝ｩ繧ｦ繝峨う繝ｳ繝・ャ繧ｯ繧ｹ繧呈峩譁ｰ
            storage.mergeCloudIndex({ [cloudBookId]: meta }, meta.updatedAt);
        } catch (error) {
            console.warn("繧ｯ繝ｩ繧ｦ繝峨う繝ｳ繝・ャ繧ｯ繧ｹ縺ｮ譖ｴ譁ｰ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲よｬ｡蝗槭・蜷梧悄縺ｧ蜀崎ｩｦ陦後＆繧後∪縺・", error);
            // 螟ｱ謨玲凾縺ｯ繝ｭ繝ｼ繧ｫ繝ｫ縺ｮ繧ｯ繝ｩ繧ｦ繝峨う繝ｳ繝・ャ繧ｯ繧ｹ繧呈峩譁ｰ縺励↑縺・％縺ｨ縺ｧ縲・            // 谺｡蝗槭・ syncAllBooksFromCloud 縺ｮ繧｢繝・・繝ｭ繝ｼ繝峨Ν繝ｼ繝励〒蜀崎ｩｦ陦悟ｯｾ雎｡縺ｫ縺ｪ繧九ｈ縺・↓縺吶ｋ
        }
    } else {
        // 蜷梧悄縺檎┌蜉ｹ縺ｪ蝣ｴ蜷医・繝ｭ繝ｼ繧ｫ繝ｫ縺ｮ縺ｿ譖ｴ譁ｰ
        storage.mergeCloudIndex({ [cloudBookId]: meta }, meta.updatedAt);
    }
    return meta;
}

/**
 * 辣ｧ蜷育畑繝｡繧ｿ繝・・繧ｿ繧呈ｧ狗ｯ・ */
export function buildMatchMeta(info) {
    return {
        title: info?.title ?? "",
        author: info?.author ?? "",
        identifiers: info?.identifiers ?? [],
    };
}
