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
let _activeSyncPromise = null;
let _lastSyncStartedAt = 0;

const SYNC_LOGIC_CONFIG = Object.freeze({
    RECENT_STATE_PREFETCH_LIMIT: 500,
    SYNC_REENTRY_GUARD_MS: 5000,
});

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

function debugLog(...args) {
    console.debug(...args);
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
        console.warn('[isCloudSyncEnabled] Missing dependencies:', {
            checkAuthStatus: !!_checkAuthStatus,
            storage: !!_storage,
            cloudSync: !!_cloudSync
        });
        return false;
    }

    const authStatus = _checkAuthStatus();
    if (!authStatus.authenticated) {
        // 開発用デバッグログ（認証エラーの場合は頻出するため verbose レベルが望ましいが現状は log）
        debugLog('[isCloudSyncEnabled] Sync disabled: User not authenticated');
        return false;
    }

    const settings = _storage.getSettings();
    const resolvedSource = _cloudSync.resolveSource(null, settings);
    const endpoint = _cloudSync.getWorkerEndpoint(settings);

    // 同期が有効な条件の判定
    const hasEndpoint = !!endpoint;
    const isD1Source = resolvedSource === "d1";
    const isLocalSource = settings.source === "local";

    // 同期の動作状況を開発者が把握しやすくするための詳細ログ
    debugLog('[isCloudSyncEnabled] Check details:', {
        authenticated: authStatus.authenticated,
        userId: authStatus.user?.uid?.substring(0, 8),
        resolvedSource,
        userSourceSettings: settings.source,
        hasEndpoint,
        status: (isD1Source && hasEndpoint) ? "ENABLED" : "DISABLED"
    });

    if (!isD1Source) {
        if (isLocalSource) {
            debugLog('[isCloudSyncEnabled] Sync disabled: User chose "local" source');
        } else {
            debugLog('[isCloudSyncEnabled] Sync disabled: Current source is NOT d1:', resolvedSource);
        }
    }
    if (!hasEndpoint) {
        debugLog('[isCloudSyncEnabled] Sync disabled: Worker endpoint is missing in settings');
    }

    return isD1Source && hasEndpoint;
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
        if (meta.isDeleted) return;
        const normalizedMeta = { ...meta, cloudBookId: meta.cloudBookId ?? cloudBookId };
        const localBookId = localByCloudId[cloudBookId] ?? null;
        const localInfo = localBookId ? localLibrary[localBookId] : null;
        const cloudState = cloudStates[cloudBookId];
        const localProgress = localBookId ? _storage.getProgress(localBookId) : null;
        
        // SSOT: ローカルに進捗がある（クラウドからマージ済みを含む）場合はそれを優先
        // クラウドのみにしか状態がない（未ダウンロード）場合は cloudState.progress を使用
        const progressPercentage = localProgress?.percentage ?? (cloudState?.progress != null ? Number(cloudState.progress) : 0);
        
        debugLog(`[buildLibraryEntries] Book: "${normalizedMeta.title || localInfo?.title}"`, {
            cloudBookId,
            localBookId,
            hasCloudState: !!cloudState,
            cloudProgress: cloudState?.progress,
            localProgress: localProgress?.percentage,
            finalProgress: progressPercentage
        });

        if (localBookId && (localProgress?.percentage !== (cloudState?.progress != null ? Number(cloudState.progress) : undefined))) {
            debugLog(`[buildLibraryEntries] Progress mismatch for ${localBookId}: local=${localProgress?.percentage}%, cloud=${cloudState?.progress}%`);
        }

        const lastTimestamp =
            localProgress?.updatedAt ?? cloudState?.updatedAt ?? normalizedMeta.lastReadAt ?? normalizedMeta.updatedAt ?? localInfo?.lastOpened ?? 0;
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

    // タイトル + 著者での重複排除（クラウド同士、またはクラウドと未リンクローカルが重複した場合のセーフガード）
    const deduplicatedEntries = [];
    const seenMap = new Map();

    for (const entry of entries) {
        const key = `${entry.title}:::${entry.author || ""}`;
        if (!seenMap.has(key)) {
            seenMap.set(key, entry);
            deduplicatedEntries.push(entry);
        } else {
            const existing = seenMap.get(key);
            // 既存よりローカルファイルがある方を優先、または進捗率が高い／日時が新しい方を優先
            const preferNew = 
                (!existing.hasLocalFile && entry.hasLocalFile) ||
                (existing.hasLocalFile === entry.hasLocalFile && entry.progressPercentage > existing.progressPercentage) ||
                (existing.hasLocalFile === entry.hasLocalFile && entry.progressPercentage === existing.progressPercentage && (entry.lastTimestamp ?? 0) > (existing.lastTimestamp ?? 0));

            if (preferNew) {
                const idx = deduplicatedEntries.indexOf(existing);
                if (idx !== -1) {
                    deduplicatedEntries[idx] = entry;
                }
                seenMap.set(key, entry);
            }
        }
    }

    deduplicatedEntries.sort((a, b) => (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0));
    return deduplicatedEntries;
}

/**
 * cloudIndex 内の重複（同一タイトル・同一著者）を検出し、1つに統合して不要な方を isDeleted で削除・同期する
 */
export async function deduplicateCloudIndex() {
    if (!_storage) return;
    const cloudIndex = _storage.data.cloudIndex ?? {};
    const entries = Object.entries(cloudIndex).filter(([_, meta]) => meta && !meta.isDeleted);
    if (entries.length <= 1) return;

    // タイトル + 著者 でグループ化
    const groups = new Map();
    for (const [cloudBookId, meta] of entries) {
        const title = meta.title ?? "";
        if (!title) continue;
        const key = `${title}:::${meta.author ?? ""}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push({ cloudBookId, meta });
    }

    const deltaToPush = {};
    let hasChanges = false;
    const bookLinkMap = _storage.data.bookLinkMap ?? {};
    const localByCloudId = Object.entries(bookLinkMap).reduce((acc, [localId, cloudId]) => {
        acc[cloudId] = localId;
        return acc;
    }, {});

    for (const [key, list] of groups.entries()) {
        if (list.length <= 1) continue;

        debugLog(`[Sync] Found duplicate cloud entries for "${key}":`, list.map(item => item.cloudBookId));

        // 優先度順にソート:
        // 1. ローカル本とリンクされているものを優先
        // 2. クラウド読書進捗が高い方を優先
        // 3. 更新日時が新しい方を優先
        list.sort((a, b) => {
            const hasLocalA = Boolean(localByCloudId[a.cloudBookId]);
            const hasLocalB = Boolean(localByCloudId[b.cloudBookId]);
            if (hasLocalA !== hasLocalB) return hasLocalA ? -1 : 1;

            const stateA = _storage.getCloudState(a.cloudBookId);
            const stateB = _storage.getCloudState(b.cloudBookId);
            const progA = stateA?.progress ?? 0;
            const progB = stateB?.progress ?? 0;
            if (progA !== progB) return progB - progA;

            const timeA = stateA?.updatedAt ?? a.meta.updatedAt ?? 0;
            const timeB = stateB?.updatedAt ?? b.meta.updatedAt ?? 0;
            return timeB - timeA;
        });

        const primary = list[0];
        const duplicates = list.slice(1);

        // 指紋（fingerprints）をプライマリに統合
        const mergedFingerprints = new Set(primary.meta.fingerprints ?? []);
        duplicates.forEach(d => {
            (d.meta.fingerprints ?? []).forEach(fp => mergedFingerprints.add(fp));
        });

        const primaryMeta = {
            ...primary.meta,
            fingerprints: Array.from(mergedFingerprints),
            updatedAt: Date.now()
        };

        // ローカルの cloudIndex にプライマリを保存
        _storage.data.cloudIndex[primary.cloudBookId] = primaryMeta;
        deltaToPush[primary.cloudBookId] = primaryMeta;
        hasChanges = true;

        // 重複側を削除フラグ (isDeleted: true) にし、リンクをプライマリへ付け替え
        for (const dup of duplicates) {
            const dupMeta = {
                ...dup.meta,
                isDeleted: true,
                updatedAt: Date.now()
            };
            _storage.data.cloudIndex[dup.cloudBookId] = dupMeta;
            deltaToPush[dup.cloudBookId] = dupMeta;

            // ローカルリンクの付け替え
            for (const [localId, linkedCloudId] of Object.entries(_storage.data.bookLinkMap ?? {})) {
                if (linkedCloudId === dup.cloudBookId) {
                    debugLog(`[Sync] Re-linking local book ${localId} from duplicate ${dup.cloudBookId} to primary ${primary.cloudBookId}`);
                    _storage.setBookLink(localId, primary.cloudBookId);
                }
            }

            // クラウドステータスの統合・クリーンアップ
            const dupState = _storage.getCloudState(dup.cloudBookId);
            const primaryState = _storage.getCloudState(primary.cloudBookId);
            if (dupState && (!primaryState || (dupState.progress ?? 0) > (primaryState.progress ?? 0))) {
                _storage.setCloudState(primary.cloudBookId, dupState);
            }
            _storage.removeCloudData(dup.cloudBookId);
        }
    }

    if (hasChanges) {
        _storage.save();
        if (isCloudSyncEnabled() && _cloudSync?.pushIndexDelta) {
            try {
                debugLog("[Sync] Pushing deduplication tombstone delta to D1:", deltaToPush);
                await _cloudSync.pushIndexDelta(deltaToPush, Date.now());
                debugLog("[Sync] Successfully pushed deduplication tombstone delta to D1.");
            } catch (err) {
                console.warn("[Sync] Failed to push deduplication delta to D1:", err);
            }
        }
    }
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
 * @param {Object} [options]
 * @param {boolean} [options.forcePushAll] 強制的に全データをプッシュするかどうか
 */
export async function syncAllBooksFromCloud(uiInitialized, bookmarkMenuMode, options = {}) {
    const { forcePushAll = false } = options;

    if (_activeSyncPromise) {
        debugLog('[syncAllBooksFromCloud] Reusing in-flight sync promise');
        return _activeSyncPromise;
    }

    const now = Date.now();
    if (now - _lastSyncStartedAt < SYNC_LOGIC_CONFIG.SYNC_REENTRY_GUARD_MS) {
        debugLog('[syncAllBooksFromCloud] Sync skipped by reentry guard');
        return;
    }

    if (!isCloudSyncEnabled() || !_storage || !_cloudSync) {
        debugLog('[syncAllBooksFromCloud] Sync skipped: not enabled or missing dependencies');
        return;
    }

    _lastSyncStartedAt = now;
    _activeSyncPromise = (async () => {
        debugLog('[syncAllBooksFromCloud] Starting D1 sync...');
        let didApplyIndex = false;
        let index = {}; // クラウドインデックスのデフォルト値
        try {
            debugLog('[syncAllBooksFromCloud] Pulling index from D1...');
            const remote = await _cloudSync.pullIndex();
            debugLog('[syncAllBooksFromCloud] Pull index result:', remote);

            let indexDelta = {};

            if (remote?.unchanged === true) {
                debugLog('[syncAllBooksFromCloud] Index is unchanged, data is up-to-date');
                didApplyIndex = true;
                const updatedAt = remote.updatedAt ?? Date.now();
                const safeUpdatedAt = Math.min(updatedAt, Date.now() + 60000);

                if (typeof _storage.setCloudIndexUpdatedAt === 'function') {
                    _storage.setCloudIndexUpdatedAt(safeUpdatedAt);
                } else {
                    _storage.data.cloudIndexUpdatedAt = safeUpdatedAt;
                }
                index = _storage.data.cloudIndex ?? {};
                _storage.save();
            } else if (remote) {
                const hasIndexProp = remote.index && typeof remote.index === "object";
                const rawUpdatedAt = hasIndexProp ? remote.updatedAt : null;

                if (hasIndexProp) {
                    index = remote.index;
                } else {
                    const { updatedAt: _u, unchanged: _uc, status: _s, source: _src, ...indexEntries } = remote;
                    index = indexEntries;
                }

                const updatedAt = rawUpdatedAt ?? Date.now();
                const safeUpdatedAt = Math.min(updatedAt, Date.now() + 60000);

                // 変更のあった書籍のみを抽出（差分更新）
                const oldCloudIndex = _storage.data.cloudIndex ?? {};
                const changedIds = Object.keys(index).filter(cloudBookId => {
                    const old = oldCloudIndex[cloudBookId];
                    if (!old) return true;
                    return (index[cloudBookId]?.updatedAt ?? 0) > (old?.updatedAt ?? 0);
                });
                changedIds.forEach(id => { indexDelta[id] = index[id]; });
                debugLog('[syncAllBooksFromCloud] Index received, merging...', {
                    total: Object.keys(index).length,
                    changed: changedIds.length,
                    updatedAt: safeUpdatedAt,
                    format: hasIndexProp ? 'wrapped' : 'flat'
                });

                _storage.mergeCloudIndex(index, safeUpdatedAt);
                didApplyIndex = true;

                // 重複したクラウド書籍があれば自動統合しD1へ削除同期
                await deduplicateCloudIndex();
            }

            // 未リンクのローカル書籍とクラウドインデックスの自動紐付け
            const currentLibrary = _storage.data.library || {};
            Object.keys(currentLibrary).forEach((localBookId) => {
                if (!_storage.getCloudBookId(localBookId)) {
                    const book = currentLibrary[localBookId];
                    if (book && (book.contentHash || book.title)) {
                        let match = null;
                        if (book.contentHash) {
                            match = Object.values(index).find(
                                (cloudItem) => !cloudItem.isDeleted && cloudItem.fingerprints && cloudItem.fingerprints.includes(book.contentHash)
                            );
                        }
                        if (!match && book.title) {
                            match = Object.values(index).find(
                                (cloudItem) => !cloudItem.isDeleted && cloudItem.title === book.title && (cloudItem.author || "") === (book.author || "")
                            );
                            if (match) {
                                debugLog(`[Sync] Fallback title-matching local book "${book.title}" to cloud ID: ${match.cloudBookId}`);
                            }
                        }
                        if (match && match.cloudBookId) {
                            debugLog(`[Sync] Auto-linking local book "${book.title}" to cloud ID: ${match.cloudBookId} (Pre-pull)`);
                            _storage.setBookLink(localBookId, match.cloudBookId);
                        }
                    }
                }
            });

            // インデックスに変更があった書籍についてのみ状態をプル
            if (isCloudSyncEnabled() && !isEmptySyncResult(indexDelta)) {
                await pullUpdatedBookStates(indexDelta);
            } else if (indexDelta && Object.keys(indexDelta).length === 0) {
                // インデックス変更がなくても、リンク済み書籍の状態はプルしておく
                // （前回の同期でプル漏れがあった場合のセーフガード）
                const bookLinkMap = _storage.data.bookLinkMap ?? {};
                const linkedCloudIds = Object.values(bookLinkMap);
                if (linkedCloudIds.length > 0) {
                    const remoteIndex = _storage.data.cloudIndex ?? {};
                    const linkedDelta = {};
                    linkedCloudIds.forEach(cid => {
                        if (remoteIndex[cid]) {
                            linkedDelta[cid] = remoteIndex[cid];
                        }
                    });
                    debugLog(`[syncAllBooksFromCloud] No index changes, falling back to pull states for ${Object.keys(linkedDelta).length} linked books`);
                    if (Object.keys(linkedDelta).length > 0) {
                        await pullUpdatedBookStates(linkedDelta);
                    }
                } else {
                    debugLog('[syncAllBooksFromCloud] No index changes, skipping state pull');
                }
            }
        } catch (error) {
            console.error('[syncAllBooksFromCloud] Failed to pull index:', error);
            console.warn("クラウドの同期に失敗しました:", error);
        }

        try {
            const library = _storage.data.library;
            const remoteIndex = _storage.data.cloudIndex ?? {};

            debugLog(`[syncAllBooksFromCloud] Push phase: checking ${Object.keys(library).length} local books against ${Object.keys(remoteIndex).length} cloud entries`);

            for (const localBook of Object.values(library)) {
                if (!localBook || !localBook.id) continue;
                let cloudBookId = _storage.getCloudBookId(localBook.id);

                if (cloudBookId && !remoteIndex[cloudBookId]) {
                    debugLog(`[Sync] Pushing local book to D1 (not found in cloud): "${localBook.title}" (cloudBookId: ${cloudBookId})`);
                    await upsertCloudIndexEntry(cloudBookId, localBook, localBook.contentHash, {
                        storage: _storage,
                        cloudSync: _cloudSync,
                        isCloudSyncEnabled,
                        uiLanguage: _storage.getSettings().uiLanguage,
                    });
                    continue;
                }

                if (!cloudBookId) {
                    let matchEntry = null;
                    if (localBook.contentHash) {
                        matchEntry = Object.values(remoteIndex).find(
                            (entry) => !entry.isDeleted && entry.fingerprints && entry.fingerprints.includes(localBook.contentHash)
                        );
                    }
                    if (!matchEntry && localBook.title) {
                        matchEntry = Object.values(remoteIndex).find(
                            (entry) => !entry.isDeleted && entry.title === localBook.title && (entry.author || "") === (localBook.author || "")
                        );
                        if (matchEntry) {
                            debugLog(`[Sync] Fallback title-matching local book "${localBook.title}" to cloud ID: ${matchEntry.cloudBookId}`);
                        }
                    }

                    if (matchEntry && matchEntry.cloudBookId) {
                        debugLog(`[Sync] Linking local book "${localBook.title}" to existing cloud book: ${matchEntry.cloudBookId}`);
                        _storage.setBookLink(localBook.id, matchEntry.cloudBookId);
                    } else {
                        debugLog(`[Sync] Uploading new local book to D1: "${localBook.title}"`);
                        cloudBookId = generateCloudBookId();
                        _storage.setBookLink(localBook.id, cloudBookId);
                        await upsertCloudIndexEntry(cloudBookId, localBook, localBook.contentHash, {
                            storage: _storage,
                            cloudSync: _cloudSync,
                            isCloudSyncEnabled,
                            uiLanguage: _storage.getSettings().uiLanguage,
                        });
                    }
                }
            }
            // プッシュ後にも重複チェック＆削除同期を実行
            await deduplicateCloudIndex();
        } catch (error) {
            console.error('[syncAllBooksFromCloud] Failed to upload local books:', error);
            console.warn("ローカル書籍のアップロードに失敗しました:", error);
        }

        try {
            const bookLinkMap = _storage.data.bookLinkMap ?? {};
            const linkedEntries = Object.entries(bookLinkMap);

            debugLog(`[syncAllBooksFromCloud] State push phase: bookLinkMap has ${linkedEntries.length} entries, forcePushAll=${forcePushAll}`);

            let pushCount = 0;
            let skipEmptyCount = 0;
            let skipTimestampCount = 0;

            if (linkedEntries.length > 0) {
                for (const [localBookId, cloudBookId] of linkedEntries) {
                    try {
                        const payload = buildCloudStatePayload(localBookId, cloudBookId);
                        if (isEmptyCloudState(payload.state)) {
                            skipEmptyCount++;
                            continue;
                        }

                        const localState = payload.state;
                        const cloudState = _storage.getCloudState(cloudBookId);
                        const localUpdatedAt = payload.updatedAt ?? 0;
                        const cloudUpdatedAt = cloudState?.updatedAt ?? 0;

                        const isCloudEmpty = (cloudState?.progress ?? 0) === 0 && (cloudState?.bookmarks?.length ?? 0) === 0;
                        const isLocalNotEmpty = (localState.progress ?? 0) > 0 || (localState.bookmarks?.length ?? 0) > 0;
                        const forcePushDueToEmptyCloud = (isCloudEmpty && isLocalNotEmpty) || (forcePushAll && isLocalNotEmpty);

                        if (localUpdatedAt > cloudUpdatedAt || forcePushDueToEmptyCloud) {
                            const finalUpdatedAt = forcePushDueToEmptyCloud ? Date.now() : localUpdatedAt;
                            debugLog(`[syncAllBooksFromCloud] Pushing state: ${localBookId.slice(0,8)}→${cloudBookId.slice(0,8)} (progress=${localState.progress}%, bookmarks=${localState.bookmarks?.length ?? 0})`);
                            await _cloudSync.pushState(cloudBookId, localState, finalUpdatedAt);
                            _storage.setCloudState(cloudBookId, { ...localState, updatedAt: finalUpdatedAt });
                            pushCount++;
                            
                            // State push 成功後に index の updatedAt も更新する
                            const info = _storage.data.library[localBookId];
                            if (info) {
                                const indexMeta = _storage.data.cloudIndex?.[cloudBookId];
                                const fingerprint = indexMeta?.fingerprints?.[0] || info.contentHash;
                                await upsertCloudIndexEntry(cloudBookId, info, fingerprint, {
                                    storage: _storage,
                                    cloudSync: _cloudSync,
                                    isCloudSyncEnabled,
                                    uiLanguage: _storage.getSettings().uiLanguage,
                                });
                            }
                        } else {
                            skipTimestampCount++;
                        }
                    } catch (stateError) {
                        console.warn(`[syncAllBooksFromCloud] Failed to push state for ${localBookId}:`, stateError);
                    }
                }
            }
            debugLog(`[syncAllBooksFromCloud] State push summary: pushed=${pushCount}, skipEmpty=${skipEmptyCount}, skipTimestamp=${skipTimestampCount}`);
        } catch (error) {
            console.error('[syncAllBooksFromCloud] Failed to push book states:', error);
        }

        const syncedAt = Date.now();
        debugLog('[syncAllBooksFromCloud] Sync successful, setting lastSyncAt:', syncedAt);
        const settingsUpdate = { lastSyncAt: syncedAt };
        if (didApplyIndex) {
            settingsUpdate.lastIndexSyncAt = syncedAt;
        }
        _storage.setSettings(settingsUpdate);
        _storage.save();
        uiCallbacks.updateSyncStatusDisplay();

        if (uiInitialized) {
            uiCallbacks.renderLibrary();
            uiCallbacks.renderHistory();
            uiCallbacks.renderBookmarks(bookmarkMenuMode);
        }
    })();

    try {
        await _activeSyncPromise;
    } finally {
        _activeSyncPromise = null;
    }
}


/**
 * ログイン時の同期処理
 */
export async function handleAuthLogin() {
    debugLog('[handleAuthLogin] Start...');
    uiCallbacks.updateAuthStatusDisplay();
    uiCallbacks.syncAutoSyncPolicy();
    // クラウドからインデックスをプル
    // UIが初期化されている状態で呼ばれるため true を渡し、同期後の再描画を確実に実行させる
    await syncAllBooksFromCloud(true);
}

/**
 * 同期競合解決のプロンプト
 */
export function promptSyncResolution({ localUpdatedAt, remoteUpdatedAt, remoteDeviceInfo, localPercentage, remotePercentage }, uiLanguage) {
    return new Promise((resolve) => {
        if (!elements.syncModal || !elements.syncUseRemote || !elements.syncUseLocal) {
            resolve(remoteUpdatedAt >= localUpdatedAt ? "remote" : "local");
            return;
        }

        const strings = getUiStrings(uiLanguage);
        const preferRemote = remoteUpdatedAt >= localUpdatedAt;
        const deviceLabel = remoteDeviceInfo?.trim();

        if (elements.syncModalTitle) elements.syncModalTitle.textContent = strings.syncPromptTitle;
        if (elements.syncModalMessage) {
            let message = preferRemote
                ? deviceLabel
                    ? tReplace("syncPromptMessageWithDevice", { device: deviceLabel }, uiLanguage)
                    : strings.syncPromptMessage
                : deviceLabel
                    ? tReplace("syncPromptLocalMessageWithDevice", { device: deviceLabel }, uiLanguage)
                    : strings.syncPromptLocalMessage;
            
            if (typeof localPercentage === 'number' && typeof remotePercentage === 'number') {
                 message += `\n\n【ローカル】${localPercentage.toFixed(1)}%\n【クラウド】${remotePercentage.toFixed(1)}%`;
            }
            elements.syncModalMessage.innerText = message;
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
 * 更新があった書籍の状態を一括プル
 * @param {Object} indexDelta - 同期で取得したインデックスの差分
 */
async function pullUpdatedBookStates(indexDelta) {
    const cloudBookIds = selectStatePullTargets(indexDelta);
    debugLog(`[pullUpdatedBookStates] Start pulling states for ${cloudBookIds.length} books...`);

    let pullCount = 0;
    let skipCount = 0;
    let emptyCount = 0;
    let successCount = 0;

    // 順次実行（サーバー負荷を考慮）
    for (const cloudBookId of cloudBookIds) {
        try {
            const localId = findLocalIdByCloudId(cloudBookId);
            const remoteMeta = indexDelta[cloudBookId];
            if (remoteMeta?.isDeleted) {
                _storage.removeCloudData(cloudBookId);
                continue;
            }
            const localState = _storage.getCloudState(cloudBookId);

            // cloudState が存在しない場合は無条件でプル
            // 存在する場合でも、remoteMeta の updatedAt が最後のstateプル時刻より新しければプル
            const statePulledAt = localState?.statePulledAt ?? 0;
            const needsPull = !localState
                || !localState.progress  // progress が 0 / undefined の場合もプル
                || (remoteMeta?.updatedAt && remoteMeta.updatedAt > statePulledAt);

            if (!needsPull) {
                skipCount++;
                continue;
            }

            pullCount++;
            const response = await _cloudSync.pullState(cloudBookId);
            const remoteState = response?.state ?? response?.data ?? response;

            if (remoteState && !isEmptyCloudState(remoteState)) {
                successCount++;
                remoteState.statePulledAt = Date.now();
                debugLog(`[pullUpdatedBookStates] ✓ ${remoteMeta?.title || cloudBookId}: progress=${remoteState.progress}%, bookmarks=${remoteState.bookmarks?.length ?? 0}`);
                if (localId) {
                    applyCloudStateToLocal(localId, cloudBookId, remoteState);
                } else {
                    _storage.setCloudState(cloudBookId, remoteState);
                }
            } else {
                emptyCount++;
                if (localState) {
                    localState.statePulledAt = Date.now();
                    _storage.setCloudState(cloudBookId, localState);
                }
            }
        } catch (error) {
            console.warn(`[pullUpdatedBookStates] Failed to pull state for ${cloudBookId}:`, error);
        }
    }
    debugLog(`[pullUpdatedBookStates] Finished: total=${cloudBookIds.length}, pulled=${pullCount}, success=${successCount}, empty=${emptyCount}, skipped=${skipCount}`);
}

function selectStatePullTargets(indexDelta) {
    const allCloudBookIds = Object.keys(indexDelta ?? {});
    if (allCloudBookIds.length <= SYNC_LOGIC_CONFIG.RECENT_STATE_PREFETCH_LIMIT) {
        return allCloudBookIds;
    }

    const linkedCloudBookIds = allCloudBookIds.filter((cloudBookId) => Boolean(findLocalIdByCloudId(cloudBookId)));
    const recentCloudBookIds = Object.values(indexDelta)
        .filter((meta) => meta?.cloudBookId)
        .sort((a, b) => (b.lastReadAt ?? b.updatedAt ?? 0) - (a.lastReadAt ?? a.updatedAt ?? 0))
        .slice(0, SYNC_LOGIC_CONFIG.RECENT_STATE_PREFETCH_LIMIT)
        .map((meta) => meta.cloudBookId);

    return [...new Set([...linkedCloudBookIds, ...recentCloudBookIds])];
}

/**
 * クラウドIDからローカルIDを取得
 */
function findLocalIdByCloudId(cloudBookId) {
    if (!_storage.data.bookLinkMap) return null;
    for (const [localId, cid] of Object.entries(_storage.data.bookLinkMap)) {
        if (cid === cloudBookId) return localId;
    }
    return null;
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
    const hasProgress = (typeof state.progress === "number" || typeof state.progress === "string") && Number(state.progress) > 0;
    const hasLocation = Boolean(state.lastCfi);
    return !(hasBookmarks || hasHistory || hasProgress || hasLocation);
}

/**
 * クラウド状態をローカルに適用
 */
export function applyCloudStateToLocal(localBookId, cloudBookId, state) {
    if (!state || !localBookId || !_storage) return;

    if (state.bookmarks && Array.isArray(state.bookmarks)) {
        console.log(`[applyCloudStateToLocal] Merging ${state.bookmarks.length} bookmarks for book: ${localBookId}`);
        _storage.mergeBookmarks(localBookId, state.bookmarks);
    }

    const isProgressValid = typeof state.progress === "number" || typeof state.progress === "string";
    if (state.lastCfi || isProgressValid) {
        const existing = _storage.getProgress(localBookId) ?? {};
        const isCloudProgressEmpty = !state.lastCfi && (!isProgressValid || Number(state.progress) === 0);
        
        let shouldPreservePercentage;
        if (isCloudProgressEmpty) {
            shouldPreservePercentage = true;
        } else if (existing.location === null) {
            shouldPreservePercentage = false;
        } else {
            shouldPreservePercentage = (existing.updatedAt ?? 0) >= (state.updatedAt ?? 0);
        }
        
        const nextPercentage = shouldPreservePercentage
            ? existing.percentage
            : (isProgressValid ? Number(state.progress) : existing.percentage);
        // 進捗率をローカル維持する場合、位置情報もローカルを維持する（古い位置で上書きしない）
        const nextLocation = shouldPreservePercentage
            ? existing.location
            : (state.lastCfi ?? existing.location);
        const newProgress = {
            ...existing,
            location: nextLocation,
            percentage: nextPercentage,
            // 読書環境の復元
            writingMode: state.writingMode ?? existing.writingMode,
            pageDirection: state.pageDirection ?? existing.pageDirection,
            imageViewMode: state.imageViewMode ?? existing.imageViewMode,
            fontSize: state.fontSize ?? existing.fontSize,
            updatedAt: state.updatedAt ?? Date.now(),
        };
        console.log(`[applyCloudStateToLocal] Updating progress for ${localBookId}:`, newProgress.percentage, '%');
        _storage.setProgress(localBookId, newProgress);
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
        const remoteState = response?.state ?? response?.data ?? response;
        if (isEmptyCloudState(remoteState)) {
            return localProgress;
        }

        const localUpdatedAt = localProgress?.updatedAt ?? 0;
        const remoteUpdatedAt = remoteState?.updatedAt ?? 0;
        const localLocation = localProgress?.location ?? null;
        const remoteLocation = remoteState?.lastCfi ?? null;
        const localPercentage = localProgress?.percentage ?? 0;
        const remotePercentage = remoteState?.progress ?? 0;

        const locationsAreEqual = (loc1, loc2) => {
            if (loc1 === loc2) return true;
            if (typeof loc1 === 'object' && loc1 !== null && typeof loc2 === 'object' && loc2 !== null) {
                return loc1.location === loc2.location && loc1.percentage === loc2.percentage;
            }
            return false;
        };
        const isSameLocation = locationsAreEqual(localLocation, remoteLocation);
        const progressDiff = Math.abs(localPercentage - remotePercentage);

        // 1. クラウド側のデータが新しい（または初回）が、中身が同じ（位置が同じ）場合は自動適用
        if (remoteUpdatedAt >= localUpdatedAt && isSameLocation) {
            applyCloudStateToLocal(localBookId, resolvedCloudBookId, remoteState);
            return _storage.getProgress(localBookId);
        }

        // 2. ユーザー要望：ローカルとリモートに進捗1%以上の差がある場合は（新旧関係なく）ダイアログを出す
        if (progressDiff >= 1.0) {
            console.log(`[resolveSyncedProgress] Conflict detected: diff is ${progressDiff}%. local: ${localPercentage}%, remote: ${remotePercentage}%`);
            const choice = await promptSyncResolution(
                { localUpdatedAt, remoteUpdatedAt, remoteDeviceInfo: remoteState?.deviceInfo ?? null, localPercentage, remotePercentage },
                uiLanguage
            );

            if (choice === "remote") {
                applyCloudStateToLocal(localBookId, resolvedCloudBookId, remoteState);
                _storage.setSettings({ lastSyncAt: Date.now() });
                uiCallbacks.updateSyncStatusDisplay();
            } else {
                // ローカルを選択した場合: クラウドの状態をローカルにキャッシュしつつ、
                // 次回の保存時にローカルのほうが新しければクラウドへ上書きされるようにする
                _storage.setCloudState(resolvedCloudBookId, remoteState);
                if (pushCurrentBookSync) await pushCurrentBookSync();
            }
            return _storage.getProgress(localBookId);
        }

        // 3. それ以外（1%未満の差）で、ローカルのほうが新しい（または未同期の位置データがある）場合
        if (localUpdatedAt > remoteUpdatedAt && localLocation !== null) {
            // ローカルが最新であることをクラウド側に認識させるため、最新情報をプッシュ
            _storage.setCloudState(resolvedCloudBookId, remoteState); // 一旦リモートをキャッシュ
            if (pushCurrentBookSync) {
                await pushCurrentBookSync({ force: true });
            }
            return _storage.getProgress(localBookId);
        }

        // 4. それ以外（同期済み、または安全な自動更新）
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
    if (!currentBookId || !currentCloudBookId) return false;
    if (!isCloudSyncEnabled() || !_cloudSync) return false;
        try {
        const payload = buildCloudStatePayload(currentBookId, currentCloudBookId);
        console.log(`[pushCurrentBookSync] Pushing state for ${currentBookId}...`, {
            updatedAt: payload.updatedAt,
            bookmarks: payload.state.bookmarks?.length
        });

        const result = await _cloudSync.pushState(currentCloudBookId, payload.state, payload.updatedAt);
        const didSync = Boolean(result && !isEmptySyncResult(result));

        if (didSync) {
            _storage.setSettings({ lastSyncAt: Date.now() });

            // 重要: state のプッシュ成功後、インデックスの updatedAt も更新して他端末が検知できるようにする
            const info = _storage.data.library[currentBookId];
            if (info) {
                console.log(`[pushCurrentBookSync] Updating cloud index meta for ${currentBookId}...`);
                const settings = _storage.getSettings();
                const indexMeta = _storage.data.cloudIndex?.[currentCloudBookId];
                const fingerprint = indexMeta?.fingerprints?.[0] || info.contentHash;

                await upsertCloudIndexEntry(currentCloudBookId, info, fingerprint, {
                    storage: _storage,
                    cloudSync: _cloudSync,
                    isCloudSyncEnabled: () => true,
                    uiLanguage: settings.uiLanguage,
                    overrides: { updatedAt: payload.updatedAt }
                });
            }

            _storage.save(); // すべての更新を永続化
            uiCallbacks.updateSyncStatusDisplay();
            if (typeof uiCallbacks.renderLibrary === 'function') {
                uiCallbacks.renderLibrary();
            }
        }
        return didSync;
    } catch (error) {
        console.warn("クラウド同期に失敗しました:", error);
    }
    return false;
}
