/**
 * sync-logic.js - 同期ロジック
 *
 * クラウド同期に関するロジックを集約します。
 * UIとの連携はコールバック経由で行い、ストレージやクラウド同期インスタンスは
 * 初期化時に注入されます。
 */

import { UI_CLASSES, UI_SYMBOLS } from "../../constants.js";
import { formatRelativeTime, getUiStrings, tReplace, t as t_core } from "../../i18n.js";
import { buildCloudStatePayload as buildCloudStatePayloadSSOT } from "../../cloudState.js";
import { elements } from "../ui/elements.js";
import { generateCloudBookId, upsertCloudIndexEntry } from "./file-handler.js";

// 注入されるオブジェクト
let _storage = null;
let _cloudSync = null;
let _checkAuthStatus = null;

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
 * @param {Object} config 設定オブジェクト
 * @param {Object} config.storage ストレージサービスインスタンス
 * @param {Object} config.cloudSync クラウド同期インスタンス
 * @param {Function} config.checkAuthStatus 認証状態確認関数
 * @param {Object} config.callbacks UI更新用コールバック
 */
export function init(config) {
    _storage = config.storage;
    _cloudSync = config.cloudSync;
    _checkAuthStatus = config.checkAuthStatus;
    if (config.callbacks) {
        uiCallbacks = { ...uiCallbacks, ...config.callbacks };
    }
}

/**
 * 翻訳ヘルパー（uiLanguage を外部から渡す必要あり）
 */
function t(key, uiLanguage) {
    return t_core(key, uiLanguage);
}

function isEmptySyncResult(result) {
    if (result == null) return true;
    if (Array.isArray(result)) return result.length === 0;
    if (typeof result === "object") return Object.keys(result).length === 0;
    return false;
}

function hasIndexData(index) {
    if (!index || typeof index !== "object") return false;
    return Object.keys(index).length > 0;
}

/**
 * クラウド同期が有効かどうかを確認
 * SSOT: D1同期の前提条件
 * 1. 認証済みであること
 * 2. Workerエンドポイントが設定されていること
 * 3. sourceが"d1"であること（D1バックエンドを使用）
 * 
 * 注: ユーザーが明示的にsource="local"に設定している場合は無効となる
 */
export function isCloudSyncEnabled() {
    if (!_checkAuthStatus || !_storage || !_cloudSync) {
        console.log('[isCloudSyncEnabled] Missing dependencies:', {
            checkAuthStatus: !!_checkAuthStatus,
            storage: !!_storage,
            cloudSync: !!_cloudSync
        });
        return false;
    }
    
    const authStatus = _checkAuthStatus();
    if (!authStatus.authenticated) {
        console.log('[isCloudSyncEnabled] Not authenticated');
        return false;
    }
    
    const settings = _storage.getSettings();
    const resolvedSource = _cloudSync.resolveSource(null, settings);
    const endpoint = _cloudSync.getWorkerEndpoint(settings);
    
    console.log('[isCloudSyncEnabled] Check:', {
        resolvedSource,
        hasEndpoint: !!endpoint,
        endpoint: endpoint ? endpoint.substring(0, 50) + '...' : 'none',
        userSource: settings.source,
        userDestination: settings.saveDestination
    });
    
    // D1同期が有効な条件:
    // - resolvedSourceが"d1"（Cloudflare D1バックエンド）
    // - Workerエンドポイントが設定されている
    const isEnabled = resolvedSource === "d1" && !!endpoint;
    console.log('[isCloudSyncEnabled] Result:', isEnabled);
    return isEnabled;
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
    if (!_storage) return [];
    const cloudIndex = _storage.data.cloudIndex ?? {};
    const cloudStates = _storage.data.cloudStates ?? {};
    const localLibrary = _storage.data.library ?? {};
    const entries = [];
    const linkedLocalIds = new Set(Object.keys(_storage.data.bookLinkMap ?? {}));
    const localByCloudId = Object.entries(_storage.data.bookLinkMap ?? {}).reduce((acc, [localId, cloudId]) => {
        acc[cloudId] = localId;
        return acc;
    }, {});

    Object.entries(cloudIndex).forEach(([cloudBookId, meta]) => {
        if (!cloudBookId || !meta) return;
        const normalizedMeta = { ...meta, cloudBookId: meta.cloudBookId ?? cloudBookId };
        const localBookId = localByCloudId[cloudBookId] ?? null;
        const localInfo = localBookId ? localLibrary[localBookId] : null;
        const cloudState = cloudStates[cloudBookId];
        const localProgress = localBookId ? _storage.getProgress(localBookId) : null;
        const progressPercentage = cloudState?.progress ?? localProgress?.percentage ?? 0;
        const lastTimestamp =
            cloudState?.updatedAt ?? normalizedMeta.lastReadAt ?? normalizedMeta.updatedAt ?? localInfo?.lastOpened ?? 0;
        entries.push({
            type: "cloud",
            cloudBookId,
            localBookId,
            title: normalizedMeta.title || localInfo?.title || t("untitledBook", uiLanguage),
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
        const progress = _storage.getProgress(book.id);
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
 * D1データベースからインデックスを取得し、ローカルデータとマージします。
 * 
 * SSOT: D1差分同期の正しい処理
 * - unchangedフラグが返された場合も同期成功として扱い、同期時刻を更新する
 * - これにより「同期完了」→「リロード後に未実施に戻る」問題を防ぐ
 * 
 * @param {boolean} uiInitialized UIが初期化済みかどうか
 * @param {string} bookmarkMenuMode ブックマークメニューモード
 */
export async function syncAllBooksFromCloud(uiInitialized, bookmarkMenuMode) {
    if (!isCloudSyncEnabled() || !_storage || !_cloudSync) {
        console.log('[syncAllBooksFromCloud] Sync skipped: not enabled or missing dependencies');
        return;
    }

    console.log('[syncAllBooksFromCloud] Starting D1 sync...');
    let didApplyIndex = false;
    try {
        console.log('[syncAllBooksFromCloud] Pulling index from D1...');
        const remote = await _cloudSync.pullIndex();
        console.log('[syncAllBooksFromCloud] Pull index result:', remote);
        
        // SSOT: unchangedフラグを正しく処理する
        // D1からのレスポンスが { unchanged: true, updatedAt: timestamp } の場合、
        // データは最新であり、同期時刻のみ更新する必要がある
        let index = {}; // デフォルト値を設定
        if (remote?.unchanged === true) {
            console.log('[syncAllBooksFromCloud] Index is unchanged, data is up-to-date');
            didApplyIndex = true;
            const updatedAt = remote.updatedAt ?? Date.now();
            // 同期時刻を更新（インデックス自体は変更なし）
            if (typeof _storage.setCloudIndexUpdatedAt === 'function') {
                _storage.setCloudIndexUpdatedAt(updatedAt);
            } else {
                _storage.data.cloudIndexUpdatedAt = updatedAt;
            }
            // unchangedの場合、既存のcloudIndexを使用
            index = _storage.data.cloudIndex ?? {};
        } else {
            // データが返された場合は通常のマージ処理
            index = remote?.index ?? {};
            const updatedAt = remote?.updatedAt ?? Date.now();
            const hasRemoteIndex = hasIndexData(index);
            console.log('[syncAllBooksFromCloud] Index has data:', hasRemoteIndex, 'updatedAt:', updatedAt);
            _storage.mergeCloudIndex(index, updatedAt);
            if (hasRemoteIndex && !isEmptySyncResult(remote)) {
                didApplyIndex = true;
                console.log('[syncAllBooksFromCloud] Index successfully applied');
            }
        }

        const library = _storage.data.library;
        Object.keys(library).forEach((localBookId) => {
            if (!_storage.getCloudBookId(localBookId)) {
                const book = library[localBookId];
                if (book && book.contentHash) {
                    const match = Object.values(index).find(
                        (cloudItem) => cloudItem.fingerprints && cloudItem.fingerprints.includes(book.contentHash)
                    );
                    if (match && match.cloudBookId) {
                        console.log(`[Sync] Auto-linking local book "${book.title}" to cloud ID: ${match.cloudBookId}`);
                        _storage.setBookLink(localBookId, match.cloudBookId);
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
                const stateResponse = await _cloudSync.pullState(item.cloudBookId);
                if (stateResponse?.state) {
                    _storage.setCloudState(item.cloudBookId, stateResponse.state);
                }
            } catch (error) {
                console.warn("クラウド状態の取得に失敗しました:", error);
            }
        }
    } catch (error) {
        console.error('[syncAllBooksFromCloud] Failed to pull index:', error);
        console.warn("クラウドの同期に失敗しました:", error);
    }

    try {
        const library = _storage.data.library;
        const cloudIndex = _storage.data.cloudIndex ?? {};

        for (const localBook of Object.values(library)) {
            if (!localBook || !localBook.id) continue;
            let cloudBookId = _storage.getCloudBookId(localBook.id);

            if (cloudBookId && !cloudIndex[cloudBookId]) {
                console.log(`Re-uploading metadata for linked book: ${localBook.title}`);
                await upsertCloudIndexEntry(cloudBookId, localBook, localBook.contentHash, {
                    storage: _storage,
                    cloudSync: _cloudSync,
                    isCloudSyncEnabled,
                });
                continue;
            }

            if (!cloudBookId) {
                const matchEntry = Object.values(cloudIndex).find(
                    (entry) => entry.fingerprints && entry.fingerprints.includes(localBook.contentHash)
                );

                if (matchEntry && matchEntry.cloudBookId) {
                    console.log(`Linking local book "${localBook.title}" to existing cloud book`);
                    _storage.setBookLink(localBook.id, matchEntry.cloudBookId);
                } else {
                    console.log(`Uploading new book to cloud: ${localBook.title}`);
                    cloudBookId = generateCloudBookId();
                    _storage.setBookLink(localBook.id, cloudBookId);
                    await upsertCloudIndexEntry(cloudBookId, localBook, localBook.contentHash, {
                        storage: _storage,
                        cloudSync: _cloudSync,
                        isCloudSyncEnabled,
                    });
                }
            }
        }
    } catch (error) {
        console.error('[syncAllBooksFromCloud] Failed to upload local books:', error);
        console.warn("ローカル書籍のアップロードに失敗しました:", error);
    }

    if (didApplyIndex) {
        const now = Date.now();
        console.log('[syncAllBooksFromCloud] Sync successful, setting lastIndexSyncAt:', now);
        // SSOT: 同期時刻を複数のフィールドに設定して一貫性を保つ
        _storage.setSettings({
            lastSyncAt: now,
            lastIndexSyncAt: now,
        });
        // cloudIndexUpdatedAtはmergeCloudIndexまたはunchanged処理で既に更新されている
        // 念のため明示的に設定
        if (!_storage.data.cloudIndexUpdatedAt || _storage.data.cloudIndexUpdatedAt < now) {
            if (typeof _storage.setCloudIndexUpdatedAt === 'function') {
                _storage.setCloudIndexUpdatedAt(now);
            } else {
                _storage.data.cloudIndexUpdatedAt = now;
                _storage.save();
            }
        }
        console.log('[syncAllBooksFromCloud] Storage state after sync:', {
            lastSyncAt: _storage.getSettings().lastSyncAt,
            lastIndexSyncAt: _storage.getSettings().lastIndexSyncAt,
            cloudIndexUpdatedAt: _storage.data.cloudIndexUpdatedAt
        });
        uiCallbacks.updateSyncStatusDisplay();
    } else {
        console.log('[syncAllBooksFromCloud] No index was applied, sync status not updated');
    }
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
            elements.syncModalMessage.textContent = preferRemote ? strings.syncPromptMessage : strings.syncPromptLocalMessage;
        }
        if (elements.syncUseRemote) {
            const timeText = formatRelativeTime(remoteUpdatedAt, uiLanguage);
            elements.syncUseRemote.textContent = t("syncPromptRemote", uiLanguage).replace("{time}", timeText || "--");
        }
        if (elements.syncUseLocal) {
            elements.syncUseLocal.textContent = preferRemote ? strings.syncPromptLocal : strings.syncPromptUpload;
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
            const title = candidate.meta?.title || t("untitledBook", uiLanguage);
            const author = candidate.meta?.author || "";
            const lastRead = candidate.meta?.lastReadAt ? formatRelativeTime(candidate.meta.lastReadAt, uiLanguage) : "";

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
                ? ` ${UI_SYMBOLS.META_SEPARATOR} ${t("syncStatusLabel", uiLanguage).replace("{time}", lastRead)}`
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
    // SSOT: cloudState.js に集約し、同期仕様のブレを防ぐ
    return buildCloudStatePayloadSSOT(_storage, localBookId, cloudBookId);
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
    if (!state || !localBookId || !_storage) return;

    if (state.bookmarks && Array.isArray(state.bookmarks)) {
        _storage.mergeBookmarks(localBookId, state.bookmarks);
    }

    if (state.lastCfi || typeof state.progress === "number") {
        const existing = _storage.getProgress(localBookId) ?? {};
        _storage.setProgress(localBookId, {
            ...existing,
            location: state.lastCfi ?? existing.location,
            percentage: typeof state.progress === "number" ? state.progress : existing.percentage,
            // 読書環境の復元
            writingMode: state.writingMode ?? existing.writingMode,
            pageDirection: state.pageDirection ?? existing.pageDirection,
            imageViewMode: state.imageViewMode ?? existing.imageViewMode,
            updatedAt: state.updatedAt ?? Date.now(),
        });
    }

    if (cloudBookId) {
        _storage.setCloudState(cloudBookId, state);
    }
}

/**
 * 同期された進捗を解決
 */
export async function resolveSyncedProgress(
    localBookId,
    uiLanguage,
    cloudBookId,
    pushCurrentBookSync
) {
    if (!_storage) return null;
    const resolvedCloudBookId = cloudBookId ?? _storage.getCloudBookId(localBookId);
    const localProgress = _storage.getProgress(localBookId);
    if (!isCloudSyncEnabled() || !resolvedCloudBookId) {
        return localProgress;
    }

    try {
        const response = await _cloudSync.pullState(resolvedCloudBookId);
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
                applyCloudStateToLocal(localBookId, resolvedCloudBookId, remoteState);
                _storage.setSettings({ lastSyncAt: Date.now() });
                uiCallbacks.updateSyncStatusDisplay();
            } else {
                _storage.setCloudState(resolvedCloudBookId, remoteState);
                if (localUpdatedAt > remoteUpdatedAt) {
                    if (pushCurrentBookSync) await pushCurrentBookSync();
                }
            }
            return _storage.getProgress(localBookId);
        }

        applyCloudStateToLocal(localBookId, resolvedCloudBookId, remoteState);
        _storage.setSettings({ lastSyncAt: Date.now() });
        uiCallbacks.updateSyncStatusDisplay();
        return _storage.getProgress(localBookId);
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
    if (!isCloudSyncEnabled() || !_cloudSync) return;
    const payload = buildCloudStatePayload(currentBookId, currentCloudBookId);
    const result = await _cloudSync.pushState(currentCloudBookId, payload.state, payload.updatedAt);
    if (result && !isEmptySyncResult(result)) {
        _storage.setSettings({ lastSyncAt: Date.now() });
        uiCallbacks.updateSyncStatusDisplay();
    }
}
