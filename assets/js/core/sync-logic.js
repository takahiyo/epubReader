import * as cloudSync from "../../cloud-sync.js";
import * as storage from "../../storage.js";
import { t, tReplace, getUiStrings } from "../ui/i18n-utils.js";
import { elements } from "../ui/elements.js";
import { UI_CLASSES, UI_SYMBOLS } from "../../constants.js";
import { formatRelativeTime } from "../../utils.js";
import { generateCloudBookId, upsertCloudIndexEntry } from "./file-handler.js";
import * as auth from "../../auth.js";

/**
 * 同期ロジック内で呼び出すUI更新系の関数を保持するオブジェクト
 */
let uiCallbacks = {
    openModal: () => { },
    closeModal: () => { },
    renderLibrary: () => { },
    renderHistory: () => { },
    renderBookmarks: () => { },
    updateSyncStatusDisplay: () => { },
    updateFloatingUIButtons: () => { },
    updateProgressBarDisplay: () => { },
    updateAuthStatusDisplay: () => { },
    syncAutoSyncPolicy: () => { },
    openFileDialog: () => { },
    applyReadingState: async () => { },
};

/**
 * 同期ロジックの初期化
 * @param {Object} callbacks UI更新用コールバック
 */
export function init(callbacks) {
    uiCallbacks = { ...uiCallbacks, ...callbacks };
}

/**
 * クラウド同期が有効かどうかを確認
 */
export function isCloudSyncEnabled() {
    const authStatus = auth.checkAuthStatus();
    if (!authStatus.authenticated) {
        return false;
    }
    const settings = storage.getSettings();
    return cloudSync.resolveSource(null, settings) === "firebase";
}

/**
 * ライブラリのメタデータをフォーマット
 */
export function formatLibraryMeta({ progressPercentage, timestamp }, uiLanguage) {
    const clampedProgress = Math.max(0, Math.min(100, Math.round(progressPercentage ?? 0)));
    const relativeTime = formatRelativeTime(timestamp, uiLanguage);
    if (!relativeTime) {
        return `${clampedProgress}%`;
    }
    return `${clampedProgress}% / ${relativeTime}`;
}

/**
 * ライブラリエントリを構築
 */
export function buildLibraryEntries(uiLanguage) {
    const cloudIndex = storage.data.cloudIndex ?? {};
    const cloudStates = storage.data.cloudStates ?? {};
    const localLibrary = storage.data.library ?? {};
    const entries = [];
    const linkedLocalIds = new Set(Object.keys(storage.data.bookLinkMap ?? {}));
    const localByCloudId = Object.entries(storage.data.bookLinkMap ?? {}).reduce((acc, [localId, cloudId]) => {
        acc[cloudId] = localId;
        return acc;
    }, {});

    Object.entries(cloudIndex).forEach(([cloudBookId, meta]) => {
        if (!cloudBookId || !meta) return;
        const normalizedMeta = { ...meta, cloudBookId: meta.cloudBookId ?? cloudBookId };
        const localBookId = localByCloudId[cloudBookId] ?? null;
        const localInfo = localBookId ? localLibrary[localBookId] : null;
        const cloudState = cloudStates[cloudBookId];
        const localProgress = localBookId ? storage.getProgress(localBookId) : null;
        const progressPercentage = cloudState?.progress ?? localProgress?.percentage ?? 0;
        const lastTimestamp =
            cloudState?.updatedAt ?? normalizedMeta.lastReadAt ?? normalizedMeta.updatedAt ?? localInfo?.lastOpened ?? 0;
        entries.push({
            type: "cloud",
            cloudBookId,
            localBookId,
            title: normalizedMeta.title || localInfo?.title || t("untitledBook"),
            author: normalizedMeta.author || "",
            progressPercentage,
            lastTimestamp,
            hasLocalFile: Boolean(localInfo),
            fileType: localInfo?.type || normalizedMeta.fileType || null,
        });
    });

    Object.values(localLibrary).forEach((book) => {
        if (!book?.id) return;
        if (linkedLocalIds.has(book.id)) return;
        const progress = storage.getProgress(book.id);
        entries.push({
            type: "local",
            cloudBookId: null,
            localBookId: book.id,
            title: book.title,
            author: book.author || "",
            progressPercentage: progress?.percentage ?? 0,
            lastTimestamp: book.lastOpened ?? progress?.updatedAt ?? 0,
            hasLocalFile: true,
            fileType: book.type || null,
        });
    });

    entries.sort((a, b) => (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0));
    return entries;
}

/**
 * クラウドにある全書籍情報を同期
 */
export async function syncAllBooksFromCloud(uiInitialized, bookmarkMenuMode) {
    if (!isCloudSyncEnabled()) return;

    try {
        const remote = await cloudSync.pullIndex();
        const index = remote?.index ?? {};
        const updatedAt = remote?.updatedAt ?? Date.now();
        storage.mergeCloudIndex(index, updatedAt);

        const library = storage.data.library;
        Object.keys(library).forEach(localBookId => {
            if (!storage.getCloudBookId(localBookId)) {
                const book = library[localBookId];
                if (book && book.contentHash) {
                    const match = Object.values(index).find(cloudItem =>
                        cloudItem.fingerprints && cloudItem.fingerprints.includes(book.contentHash)
                    );
                    if (match && match.cloudBookId) {
                        console.log(`[Sync] Auto-linking local book "${book.title}" to cloud ID: ${match.cloudBookId}`);
                        storage.setBookLink(localBookId, match.cloudBookId);
                    }
                }
            }
        });

        const recentList = Object.values(index)
            .sort((a, b) => (b.lastReadAt ?? b.updatedAt ?? 0) - (a.lastReadAt ?? a.updatedAt ?? 0))
            .slice(0, 5);
        for (const item of recentList) {
            if (!item?.cloudBookId) continue;
            try {
                const stateResponse = await cloudSync.pullState(item.cloudBookId);
                if (stateResponse?.state) {
                    storage.setCloudState(item.cloudBookId, stateResponse.state);
                }
            } catch (error) {
                console.warn("クラウド状態の取得に失敗しました:", error);
            }
        }
    } catch (error) {
        console.warn("クラウドの同期に失敗しました:", error);
    }

    try {
        const library = storage.data.library;
        const cloudIndex = storage.data.cloudIndex ?? {};

        for (const localBook of Object.values(library)) {
            if (!localBook || !localBook.id) continue;
            let cloudBookId = storage.getCloudBookId(localBook.id);

            if (cloudBookId && !cloudIndex[cloudBookId]) {
                console.log(`Re-uploading metadata for linked book: ${localBook.title}`);
                await upsertCloudIndexEntry(cloudBookId, localBook, localBook.contentHash);
                continue;
            }

            if (!cloudBookId) {
                const matchEntry = Object.values(cloudIndex).find(
                    entry => entry.fingerprints && entry.fingerprints.includes(localBook.contentHash)
                );

                if (matchEntry && matchEntry.cloudBookId) {
                    console.log(`Linking local book "${localBook.title}" to existing cloud book`);
                    storage.setBookLink(localBook.id, matchEntry.cloudBookId);
                } else {
                    console.log(`Uploading new book to cloud: ${localBook.title}`);
                    cloudBookId = generateCloudBookId();
                    storage.setBookLink(localBook.id, cloudBookId);
                    await upsertCloudIndexEntry(cloudBookId, localBook, localBook.contentHash);
                }
            }
        }
    } catch (error) {
        console.warn("ローカル書籍のアップロードに失敗しました:", error);
    }

    storage.setSettings({ lastSyncAt: Date.now() });
    uiCallbacks.updateSyncStatusDisplay();
    if (uiInitialized) {
        uiCallbacks.renderLibrary();
        uiCallbacks.renderHistory();
        uiCallbacks.renderBookmarks(bookmarkMenuMode);
    }
}

/**
 * ログイン時の同期処理
 */
export async function handleAuthLogin() {
    uiCallbacks.updateAuthStatusDisplay();
    uiCallbacks.syncAutoSyncPolicy();
    await syncAllBooksFromCloud();
}

/**
 * 同期競合解決のプロンプト
 */
export function promptSyncResolution({ localUpdatedAt, remoteUpdatedAt }, uiLanguage) {
    return new Promise((resolve) => {
        if (!elements.syncModal || !elements.syncUseRemote || !elements.syncUseLocal) {
            resolve(remoteUpdatedAt >= localUpdatedAt ? "remote" : "local");
            return;
        }

        const strings = getUiStrings(uiLanguage);
        const preferRemote = remoteUpdatedAt >= localUpdatedAt;

        if (elements.syncModalTitle) elements.syncModalTitle.textContent = strings.syncPromptTitle;
        if (elements.syncModalMessage) {
            elements.syncModalMessage.textContent = preferRemote
                ? strings.syncPromptMessage
                : strings.syncPromptLocalMessage;
        }
        if (elements.syncUseRemote) {
            const timeText = formatRelativeTime(remoteUpdatedAt, uiLanguage);
            elements.syncUseRemote.textContent = t("syncPromptRemote").replace("{time}", timeText || "--");
        }
        if (elements.syncUseLocal) {
            elements.syncUseLocal.textContent = preferRemote
                ? strings.syncPromptLocal
                : strings.syncPromptUpload;
        }

        const cleanup = () => {
            if (elements.syncUseRemote) elements.syncUseRemote.onclick = null;
            if (elements.syncUseLocal) elements.syncUseLocal.onclick = null;
        };

        if (elements.syncUseRemote) {
            elements.syncUseRemote.onclick = () => {
                cleanup();
                uiCallbacks.closeModal(elements.syncModal);
                resolve("remote");
            };
        }

        if (elements.syncUseLocal) {
            elements.syncUseLocal.onclick = async () => {
                cleanup();
                uiCallbacks.closeModal(elements.syncModal);
                resolve("local");
            };
        }

        uiCallbacks.openModal(elements.syncModal);
    });
}

/**
 * 候補書籍のプロンプト
 */
export function promptSyncCandidate(candidates, uiLanguage) {
    return new Promise((resolve) => {
        if (!elements.candidateModal || !elements.candidateList || !elements.candidateUseLocal) {
            resolve(null);
            return;
        }

        elements.candidateList.innerHTML = "";
        candidates.forEach((candidate) => {
            const item = document.createElement("div");
            item.className = "candidate-item";
            const title = candidate.meta?.title || t("untitledBook");
            const author = candidate.meta?.author || "";
            const lastRead = candidate.meta?.lastReadAt
                ? formatRelativeTime(candidate.meta.lastReadAt, uiLanguage)
                : "";

            const titleNode = document.createElement("div");
            titleNode.className = "candidate-title";
            titleNode.textContent = title;
            const authorNode = document.createElement("div");
            authorNode.className = "candidate-author";
            authorNode.textContent = author;
            const metaNode = document.createElement("div");
            metaNode.className = "candidate-meta";
            const candidateId = `${candidate.cloudBookId.slice(0, 8)}${UI_SYMBOLS.ELLIPSIS}`;
            const baseMeta = tReplace("candidateIdLabel", { id: candidateId }, uiLanguage);
            const lastReadMeta = lastRead
                ? ` ${UI_SYMBOLS.META_SEPARATOR} ${t("syncStatusLabel").replace("{time}", lastRead)}`
                : "";
            metaNode.textContent = `${baseMeta}${lastReadMeta}`;
            item.append(titleNode, authorNode, metaNode);

            item.onclick = () => {
                cleanup();
                uiCallbacks.closeModal(elements.candidateModal);
                resolve(candidate.cloudBookId);
            };
            elements.candidateList.appendChild(item);
        });

        const cleanup = () => {
            if (elements.candidateUseLocal) elements.candidateUseLocal.onclick = null;
            if (elements.closeCandidateModal) elements.closeCandidateModal.onclick = null;
        };

        if (elements.candidateUseLocal) {
            elements.candidateUseLocal.onclick = () => {
                cleanup();
                uiCallbacks.closeModal(elements.candidateModal);
                resolve(null);
            };
        }

        if (elements.closeCandidateModal) {
            elements.closeCandidateModal.onclick = () => {
                cleanup();
                uiCallbacks.closeModal(elements.candidateModal);
                resolve(null);
            };
        }

        uiCallbacks.openModal(elements.candidateModal);
    });
}

/**
 * クラウド状態のペイロードを構築
 */
export function buildCloudStatePayload(localBookId, cloudBookId) {
    const progress = storage.getProgress(localBookId) ?? {};
    const bookmarks = storage.getBookmarks(localBookId) ?? [];
    const bookInfo = storage.data.library[localBookId];

    const updatedAt = Math.max(
        progress?.updatedAt ?? 0,
        ...bookmarks.map((bookmark) => bookmark?.updatedAt ?? bookmark?.createdAt ?? 0)
    );

    const state = {
        progress: progress?.percentage ?? 0,
        lastCfi: progress?.location ?? null,
        bookType: bookInfo?.type ?? null,
        location: progress?.location ?? null,
        bookmarks: bookmarks.map((bookmark) => ({
            ...bookmark,
            bookType: bookmark.bookType ?? bookmark.type ?? null,
            deviceId: bookmark.deviceId ?? null,
            deviceColor: bookmark.deviceColor ?? null,
            updatedAt: bookmark?.updatedAt ?? bookmark?.createdAt ?? Date.now(),
        })),
        updatedAt,
    };
    return { cloudBookId, state, updatedAt };
}

/**
 * クラウド状態が空かどうかを確認
 */
export function isEmptyCloudState(state) {
    if (!state) return true;
    const hasBookmarks = Array.isArray(state.bookmarks) && state.bookmarks.length > 0;
    const hasHistory = Array.isArray(state.history) && state.history.length > 0;
    const hasProgress = typeof state.progress === "number" && state.progress > 0;
    const hasLocation = Boolean(state.lastCfi);
    const hasUpdatedAt = (state.updatedAt ?? 0) > 0;
    return !(hasBookmarks || hasHistory || hasProgress || hasLocation || hasUpdatedAt);
}

/**
 * クラウド状態をローカルに適用
 */
export function applyCloudStateToLocal(localBookId, cloudBookId, state) {
    if (!state || !localBookId) return;

    if (state.bookmarks && Array.isArray(state.bookmarks)) {
        storage.mergeBookmarks(localBookId, state.bookmarks);
    }

    if (state.lastCfi || typeof state.progress === "number") {
        const existing = storage.getProgress(localBookId) ?? {};
        storage.setProgress(localBookId, {
            ...existing,
            location: state.lastCfi ?? existing.location,
            percentage: typeof state.progress === "number" ? state.progress : existing.percentage,
            updatedAt: state.updatedAt ?? Date.now(),
        });
    }

    if (cloudBookId) {
        storage.setCloudState(cloudBookId, state);
    }
}

/**
 * 同期された進捗を解決
 */
export async function resolveSyncedProgress(localBookId, uiLanguage, cloudBookId = storage.getCloudBookId(localBookId), pushCurrentBookSync) {
    const localProgress = storage.getProgress(localBookId);
    if (!isCloudSyncEnabled() || !cloudBookId) {
        return localProgress;
    }

    try {
        const response = await cloudSync.pullState(cloudBookId);
        const remoteState = response?.state ?? response;
        if (isEmptyCloudState(remoteState)) {
            return localProgress;
        }

        const localUpdatedAt = localProgress?.updatedAt ?? 0;
        const remoteUpdatedAt = remoteState?.updatedAt ?? 0;
        const localLocation = localProgress?.location ?? null;
        const remoteLocation = remoteState?.lastCfi ?? null;

        if (
            localUpdatedAt !== remoteUpdatedAt &&
            localLocation !== null &&
            remoteLocation !== null &&
            localLocation !== remoteLocation
        ) {
            const choice = await promptSyncResolution({ localUpdatedAt, remoteUpdatedAt }, uiLanguage);
            if (choice === "remote") {
                applyCloudStateToLocal(localBookId, cloudBookId, remoteState);
                storage.setSettings({ lastSyncAt: Date.now() });
                uiCallbacks.updateSyncStatusDisplay();
            } else {
                storage.setCloudState(cloudBookId, remoteState);
                if (localUpdatedAt > remoteUpdatedAt) {
                    if (pushCurrentBookSync) await pushCurrentBookSync();
                }
            }
            return storage.getProgress(localBookId);
        }

        applyCloudStateToLocal(localBookId, cloudBookId, remoteState);
        storage.setSettings({ lastSyncAt: Date.now() });
        uiCallbacks.updateSyncStatusDisplay();
        return storage.getProgress(localBookId);
    } catch (error) {
        console.warn("同期情報の取得に失敗しました:", error);
    }

    return localProgress;
}

/**
 * 現在の書籍の進捗をクラウドにプッシュ
 */
export async function pushCurrentBookSync(currentBookId, currentCloudBookId) {
    if (!currentBookId || !currentCloudBookId) return;
    if (!isCloudSyncEnabled()) return;
    const payload = buildCloudStatePayload(currentBookId, currentCloudBookId);
    const result = await cloudSync.pushState(
        currentCloudBookId,
        payload.state,
        payload.updatedAt
    );
    if (result) {
        storage.setSettings({ lastSyncAt: Date.now() });
        uiCallbacks.updateSyncStatusDisplay();
    }
}
