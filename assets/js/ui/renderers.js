/**
 * renderers.js - UI 描画ロジック
 * 
 * ライブラリ、履歴、しおり、目次などの HTML 生成と描画を担当します。
 * 依存する状態やコールバックは init 関数で注入されます。
 */

import { elements } from "./elements.js";
import {
    BOOK_TYPES,
    UI_CLASSES,
    UI_ICONS,
    UI_SYMBOLS,
    CSS_VARS,
    DOM_IDS,
    DOM_SELECTORS,
    ARCHIVE_WARNING_I18N_KEYS,
    IMAGE_VIEW_MODES,
    READING_DIRECTIONS,
    PROGRESS_CONFIG,
    WRITING_MODES
} from "../../constants.js";
import { t as translate, tReplace } from "../../i18n.js";

// 注入される依存関係
let _storage = null;
let _reader = null;
let _syncLogic = null;
let _ui = null;
let _state = {};
let _actions = {};

/**
 * 描画ロジックの初期化
 * @param {Object} config 
 */
export function init(config) {
    _storage = config.storage;
    _reader = config.reader;
    _syncLogic = config.syncLogic;
    _ui = config.ui;
    _state = config.state;
    _actions = config.actions;
}

// ヘルパー: 翻訳
function t(key) {
    return translate(key, _state.uiLanguage);
}

/**
 * 基本的な UI 操作ヘルパー
 */
export function setElementVisibility(element, isVisible) {
    if (!element) return;
    element.classList.toggle(UI_CLASSES.HIDDEN, !isVisible);
}

export function setStatusClass(element, statusClass) {
    if (!element) return;
    element.classList.remove(
        UI_CLASSES.STATUS_SUCCESS,
        UI_CLASSES.STATUS_ERROR,
        UI_CLASSES.STATUS_NEUTRAL
    );
    if (statusClass) {
        element.classList.add(statusClass);
    }
}

export function setMaterialIconLabel(button, iconName, labelText) {
    if (!button) return;
    const icon = document.createElement("span");
    icon.className = UI_CLASSES.MATERIAL_ICON;
    icon.textContent = iconName;
    const label = document.createTextNode(` ${labelText}`);
    button.replaceChildren(icon, label);
}

export function showArchiveWarnings(warningTypes = []) {
    if (!elements.archiveWarningBanner) return;
    const warningKeys = warningTypes
        .map((type) => ARCHIVE_WARNING_I18N_KEYS[type])
        .filter(Boolean);

    if (!warningKeys.length) {
        hideArchiveWarnings();
        return;
    }

    if (elements.archiveWarningTitle) {
        elements.archiveWarningTitle.textContent = t("archiveWarningTitle");
    }
    if (elements.archiveWarningClose) {
        elements.archiveWarningClose.textContent = t("closeButtonLabel");
        elements.archiveWarningClose.setAttribute("aria-label", t("closeButtonLabel"));
    }
    if (elements.archiveWarningList) {
        const items = warningKeys.map((key) => {
            const li = document.createElement("li");
            li.textContent = t(key);
            return li;
        });
        elements.archiveWarningList.replaceChildren(...items);
    }
    elements.archiveWarningBanner.classList.remove(UI_CLASSES.HIDDEN);
}

export function hideArchiveWarnings() {
    if (!elements.archiveWarningBanner) return;
    elements.archiveWarningBanner.classList.add(UI_CLASSES.HIDDEN);
    elements.archiveWarningTitle?.replaceChildren();
    elements.archiveWarningList?.replaceChildren();
}

/**
 * 検索ボタンの状態更新
 */
export function updateSearchButtonState() {
    if (!elements.menuSearch) return;

    const isEpubOpen = _state.currentBookId && _state.currentBookInfo?.type === BOOK_TYPES.EPUB;
    elements.menuSearch.disabled = !isEpubOpen;
    if (elements.openToc) {
        elements.openToc.disabled = !isEpubOpen;
    }
    if (elements.floatSearch) {
        elements.floatSearch.disabled = !isEpubOpen;
    }
}

/**
 * フローティングUIのボタン表示を更新
 */
export function updateFloatingUIButtons() {
    const isImageBook = _state.currentBookInfo && (_state.currentBookInfo.type === BOOK_TYPES.ZIP || _state.currentBookInfo.type === BOOK_TYPES.RAR);
    const isEpub = _state.currentBookInfo && _state.currentBookInfo.type === BOOK_TYPES.EPUB;
    const isBookOpen = _state.currentBookId !== null;

    if (elements.openToc) {
        elements.openToc.disabled = !isEpub;
    }

    if (elements.toggleWritingMode) {
        setElementVisibility(elements.toggleWritingMode, true);
        elements.toggleWritingMode.disabled = !isEpub;
    }

    if (elements.toggleSpreadMode) {
        setElementVisibility(elements.toggleSpreadMode, isImageBook);
        updateSpreadModeButtonLabel();
    }

    if (elements.toggleReadingDirectionEpub) {
        if (isEpub) {
            setElementVisibility(elements.toggleReadingDirectionEpub, true);
            elements.toggleReadingDirectionEpub.disabled = false;
            elements.toggleReadingDirectionEpub.style.opacity = "";
            updateReadingDirectionEpubButtonLabel();
        } else {
            setElementVisibility(elements.toggleReadingDirectionEpub, false);
        }
    }

    if (elements.toggleReadingDirectionImage) {
        if (isImageBook) {
            setElementVisibility(elements.toggleReadingDirectionImage, true);
            updateReadingDirectionButtonLabel();
        } else {
            setElementVisibility(elements.toggleReadingDirectionImage, false);
        }
    }

    if (elements.toggleZoom) {
        setElementVisibility(elements.toggleZoom, isBookOpen);
        updateZoomButtonLabel();
    }

    if (elements.progressPrev) {
        elements.progressPrev.classList.toggle(UI_CLASSES.HIDDEN, !isImageBook);
    }
    if (elements.progressNext) {
        elements.progressNext.classList.toggle(UI_CLASSES.HIDDEN, !isImageBook);
    }

    updateProgressBarDirection();
}

/**
 * フローティングオーバーレイの表示切り替え
 * @param {boolean|undefined} forceVisible - true:表示, false:非表示, undefined:トグル
 */
export function toggleFloatOverlay(forceVisible) {
    if (!elements.floatOverlay) return;
    const isVisible = elements.floatOverlay.classList.contains(UI_CLASSES.VISIBLE);

    // forceVisible が指定されている場合はそれに従う、そうでなければトグル
    const shouldShow = forceVisible !== undefined ? forceVisible : !isVisible;

    if (shouldShow) {
        elements.floatOverlay.classList.add(UI_CLASSES.VISIBLE);
        elements.floatOverlay.setAttribute("aria-hidden", "false");
        updateFloatingUIButtons();

        // プログレスバーの更新
        const progress = _storage.getProgress(_state.currentBookId);
        const percentage = progress?.percentage || 0;
        updateFloatProgressBar(percentage);
    } else {
        elements.floatOverlay.classList.remove(UI_CLASSES.VISIBLE);
        elements.floatOverlay.setAttribute("aria-hidden", "true");
    }
}

/**
 * 各種ボタンラベルの更新
 */
export function updateSpreadModeButtonLabel() {
    if (!elements.toggleSpreadMode || !_reader) return;
    const isSpread = _reader.imageViewMode === IMAGE_VIEW_MODES.SPREAD;

    if (isSpread) {
        setMaterialIconLabel(elements.toggleSpreadMode, UI_ICONS.SPREAD_DOUBLE, t("spreadModeDouble"));
        elements.toggleSpreadMode.classList.add(UI_CLASSES.ACTIVE);
    } else {
        setMaterialIconLabel(elements.toggleSpreadMode, UI_ICONS.SPREAD_SINGLE, t("spreadModeSingle"));
        elements.toggleSpreadMode.classList.remove(UI_CLASSES.ACTIVE);
    }
}

export function updateReadingDirectionButtonLabel() {
    if (!elements.toggleReadingDirectionImage || !_reader) return;
    const isRtl = _reader.imageReadingDirection === READING_DIRECTIONS.RTL;
    elements.toggleReadingDirectionImage.textContent = isRtl ? t("pageDirectionRtlButton") : t("pageDirectionLtrButton");
    elements.toggleReadingDirectionImage.title = isRtl ? t("readingDirectionRtlTitle") : t("readingDirectionLtrTitle");
}

export function updateWritingModeToggleLabel() {
    if (!elements.toggleWritingMode) return;
    const isVertical = _state.writingMode === WRITING_MODES.VERTICAL;
    elements.toggleWritingMode.textContent = isVertical
        ? t("writingModeToggleVertical")
        : t("writingModeToggleHorizontal");
    elements.toggleWritingMode.setAttribute("aria-pressed", isVertical ? "true" : "false");
}

export function updateThemeToggleIcon() {
    if (!elements.toggleTheme) return;
    elements.toggleTheme.textContent = _state.theme === "dark" ? UI_ICONS.THEME_DARK : UI_ICONS.THEME_LIGHT;
    elements.toggleTheme.setAttribute("aria-pressed", _state.theme === "dark" ? "true" : "false");
}

export function updateEpubScrollMode() {
    if (!elements.epubContainer) return;
    const isVerticalGroup = _state.writingMode === WRITING_MODES.VERTICAL;
    if (isVerticalGroup) {
        elements.epubContainer.classList.remove(UI_CLASSES.EPUB_SCROLL_MODE);
    } else {
        elements.epubContainer.classList.add(UI_CLASSES.EPUB_SCROLL_MODE);
    }
}

export function updateReadingDirectionEpubButtonLabel() {
    if (!elements.toggleReadingDirectionEpub) return;
    const isRtl = _state.pageDirection === READING_DIRECTIONS.RTL;
    elements.toggleReadingDirectionEpub.textContent = isRtl ? t("pageDirectionRtlButton") : t("pageDirectionLtrButton");
    elements.toggleReadingDirectionEpub.title = isRtl ? t("readingDirectionRtlTitle") : t("readingDirectionLtrTitle");
}

export function updateZoomButtonLabel() {
    if (!elements.toggleZoom || !_reader) return;
    const isZoomed = _reader.imageZoomed;
    elements.toggleZoom.textContent = isZoomed ? UI_ICONS.ZOOM_OUT : UI_ICONS.ZOOM_IN;
    elements.toggleZoom.title = isZoomed ? t("zoomOutTitle") : t("zoomInTitle");
}

/**
 * 進捗バーの方向更新
 */
export function updateProgressBarDirection() {
    const isImageBook = _state.currentBookInfo && (_state.currentBookInfo.type === BOOK_TYPES.ZIP || _state.currentBookInfo.type === BOOK_TYPES.RAR);
    let isRtl = false;

    if (isImageBook && _reader) {
        isRtl = _reader.imageReadingDirection === READING_DIRECTIONS.RTL;
    } else if (_state.currentBookInfo?.type === BOOK_TYPES.EPUB) {
        isRtl = _state.pageDirection === READING_DIRECTIONS.RTL;
    }

    const floatProgressBar = document.getElementById(DOM_IDS.FLOAT_PROGRESS);
    if (floatProgressBar) {
        if (isRtl) {
            floatProgressBar.classList.add(UI_CLASSES.RTL_PROGRESS);
        } else {
            floatProgressBar.classList.remove(UI_CLASSES.RTL_PROGRESS);
        }
    }

    const progressBarWrapper = document.querySelector(DOM_SELECTORS.PROGRESS_BAR_WRAPPER);
    if (progressBarWrapper) {
        if (isRtl) {
            progressBarWrapper.classList.add(UI_CLASSES.RTL_MODE);
        } else {
            progressBarWrapper.classList.remove(UI_CLASSES.RTL_MODE);
        }
    }

    if (elements.imageViewer) {
        if (isRtl) {
            elements.imageViewer.classList.add(UI_CLASSES.RTL_MODE);
        } else {
            elements.imageViewer.classList.remove(UI_CLASSES.RTL_MODE);
        }
    }
}

/**
 * 認証・同期状態の表示更新
 */
export function updateAuthStatusDisplay() {
    if (!elements.userInfo || !_actions.checkAuthStatus) return;
    const authStatus = _actions.checkAuthStatus();
    if (authStatus.authenticated) {
        const userLabel = authStatus.userEmail || authStatus.userName;
        elements.userInfo.textContent = userLabel
            ? t("googleLoginStatusSignedIn").replace("{user}", userLabel)
            : t("googleLoginStatusSignedInShort");
    } else {
        elements.userInfo.textContent = t("googleLoginStatusSignedOut");
    }
    if (elements.googleLoginButton) {
        elements.googleLoginButton.textContent = authStatus.authenticated
            ? t("googleLogoutLabel")
            : t("googleLoginLabel");
    }
    updateSyncStatusDisplay(authStatus);
    if (_actions.syncAutoSyncPolicy) {
        _actions.syncAutoSyncPolicy(authStatus);
    }
}

/**
 * 同期ステータス表示の更新
 * D1同期の最終同期時刻を表示します。
 * @param {Object} authStatus 認証状態
 */
export function updateSyncStatusDisplay(authStatus) {
    if (elements.syncStatus && _storage) {
        const status = authStatus || (_actions.checkAuthStatus ? _actions.checkAuthStatus() : { authenticated: false });
        if (!status.authenticated) {
            elements.syncStatus.textContent = t("syncNeedsLogin");
            return;
        }
        // SSOT: 同期時刻の優先順位
        // 1. lastSyncAt（ユーザーが最後に同期を実行した時刻）
        // 2. lastIndexSyncAt（インデックス同期完了時刻）
        // 3. cloudIndexUpdatedAt（サーバー側のインデックス更新時刻、フォールバック用）
        const settings = _storage.getSettings();
        const cloudIndexUpdatedAt = _storage.data.cloudIndexUpdatedAt;
        const lastIndexSyncAt = settings.lastIndexSyncAt;
        const lastSyncAt = settings.lastSyncAt;

        // ユーザーが同期ボタンを押した時刻を優先
        const syncTimestamp = lastSyncAt || lastIndexSyncAt || cloudIndexUpdatedAt;

        console.log('[updateSyncStatusDisplay] Using timestamp:', syncTimestamp, 'from:', {
            cloudIndexUpdatedAt,
            lastIndexSyncAt,
            lastSyncAt
        });

        if (!syncTimestamp) {
            elements.syncStatus.textContent = t("syncStatusNever");
            return;
        }
        const timeText = _syncLogic.formatLibraryMeta({ progressPercentage: 0, timestamp: syncTimestamp }, _state.uiLanguage).split(" / ").pop();
        elements.syncStatus.textContent = t("syncStatusLabel").replace("{time}", timeText || "--");
    }
}

/**
 * 進捗バーの表示更新
 */
export function updateProgressBarDisplay() {
    if (!_state.currentBookId || !_storage) return;

    // 注意: パネルの表示/非表示は UIController が管理する

    const progress = _storage.getProgress(_state.currentBookId);
    const percentage = progress?.percentage || 0;
    updateFloatProgressBar(percentage);

    if (elements.progressFill) {
        elements.progressFill.style.width = `${percentage}%`;
    }

    if (elements.progressThumb) {
        elements.progressThumb.style.left = `${percentage}%`;
    }

    if (elements.currentPageInput && document.activeElement !== elements.currentPageInput) {
        if (_state.progressDisplayMode === "page") {
            if (_state.currentBookInfo?.type === BOOK_TYPES.EPUB) {
                const totalPages = _actions.getEpubPaginationTotal ? _actions.getEpubPaginationTotal() : null;
                if (totalPages) {
                    const currentPage = Math.max(1, Math.round((percentage / 100) * totalPages));
                    elements.currentPageInput.value = currentPage;
                    if (elements.totalPages) {
                        elements.totalPages.textContent = totalPages.toString();
                    }
                } else {
                    // 全ページ数が未確定（逐次パジネーション中）
                    elements.currentPageInput.value = "";
                    if (elements.totalPages) {
                        elements.totalPages.textContent = "?";
                    }
                }
            } else if (_state.currentBookInfo && (_state.currentBookInfo.type === BOOK_TYPES.ZIP || _state.currentBookInfo.type === BOOK_TYPES.RAR)) {
                const totalPages = _reader.imagePages?.length || 1;
                const currentPage = Math.max(1, Math.round((percentage / 100) * totalPages));
                elements.currentPageInput.value = currentPage;
                if (elements.totalPages) {
                    elements.totalPages.textContent = totalPages.toString();
                }
            } else {
                elements.currentPageInput.value = Math.round(percentage);
                if (elements.totalPages) {
                    elements.totalPages.textContent = PROGRESS_CONFIG.MAX_PERCENT.toString();
                }
            }
        } else {
            elements.currentPageInput.value = Math.round(percentage);
            if (elements.totalPages) {
                elements.totalPages.textContent = PROGRESS_CONFIG.MAX_PERCENT.toString();
            }
        }
    }

    renderBookmarkMarkers();
}

export function updateFloatProgressBar(percentage) {
    if (!elements.floatProgress || !_state.floatVisible) return;
    const clamped = Math.min(100, Math.max(0, percentage));
    if (elements.floatProgressFill) {
        elements.floatProgressFill.style.width = `${clamped}%`;
    }
    if (elements.floatProgressThumb) {
        elements.floatProgressThumb.style.left = `${clamped}%`;
    }
    if (elements.floatProgressPercent) {
        elements.floatProgressPercent.textContent = `${Math.floor(clamped)}%`;
    }
}

/**
 * ライブラリの描画
 */
export function renderLibrary() {
    if (!elements.libraryGrid || !_syncLogic) return;

    elements.libraryGrid.innerHTML = "";
    const entries = _syncLogic.buildLibraryEntries(_state.uiLanguage);

    if (!entries.length) {
        const empty = document.createElement("p");
        empty.textContent = t("libraryEmpty");
        empty.style.textAlign = "center";
        empty.style.color = `var(${CSS_VARS.MUTED})`;
        empty.style.gridColumn = "1 / -1";
        elements.libraryGrid.appendChild(empty);
        return;
    }

    entries.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "library-card";
        card.dataset.title = (entry.title || "").toLowerCase();
        card.dataset.author = (entry.author || "").toLowerCase();

        const deleteId = entry.localBookId || entry.cloudBookId;
        if (deleteId) {
            const deleteType = entry.localBookId ? "local" : "cloud";
            const actionBtn = document.createElement("button");
            actionBtn.type = "button";
            actionBtn.className = "library-delete-btn";

            const isMarked = _state.pendingDeletes.has(deleteId);

            if (isMarked) {
                actionBtn.textContent = "\u21A9";
                actionBtn.title = t("undo_button");
                actionBtn.classList.add("undo-mode");
                card.classList.add("marked-for-delete");
            } else {
                actionBtn.textContent = UI_ICONS.DELETE;
                actionBtn.title = t("delete_button");
            }

            actionBtn.onclick = (event) => {
                event.stopPropagation();
                if (_state.pendingDeletes.has(deleteId)) {
                    _state.pendingDeletes.delete(deleteId);
                    card.classList.remove("marked-for-delete");
                    actionBtn.textContent = UI_ICONS.DELETE;
                    actionBtn.title = t("delete_button");
                    actionBtn.classList.remove("undo-mode");
                } else {
                    _state.pendingDeletes.set(deleteId, { id: deleteId, type: deleteType });
                    card.classList.add("marked-for-delete");
                    actionBtn.textContent = "\u21A9";
                    actionBtn.title = t("undo_button");
                    actionBtn.classList.add("undo-mode");
                }
            };
            card.appendChild(actionBtn);
        }

        card.onclick = () => {
            if (deleteId && _state.pendingDeletes.has(deleteId)) return;
            if (_actions.closeAllMenus) _actions.closeAllMenus();
            if (entry.hasLocalFile && entry.localBookId) {
                if (_actions.openFromLibrary) _actions.openFromLibrary(entry.localBookId);
            } else if (entry.cloudBookId) {
                if (_actions.openCloudOnlyBook) _actions.openCloudOnlyBook(entry.cloudBookId);
            }
        };

        const cover = document.createElement("div");
        cover.className = "library-cover";
        cover.textContent = entry.title?.slice(0, 2) || UI_ICONS.BOOK;

        const info = document.createElement("div");
        info.className = "library-info";

        const title = document.createElement("div");
        title.className = "library-title";
        const titleSpan = document.createElement("span");
        titleSpan.textContent = entry.title;
        title.appendChild(titleSpan);

        const row2 = document.createElement("div");
        row2.className = "library-row-2";

        const meta = document.createElement("div");
        meta.className = "library-meta";
        meta.textContent = _syncLogic.formatLibraryMeta({
            progressPercentage: entry.progressPercentage,
            timestamp: entry.lastTimestamp,
        }, _state.uiLanguage);
        row2.appendChild(meta);

        if (entry.fileType) {
            const typeBadge = document.createElement("span");
            typeBadge.className = "library-type-badge";
            typeBadge.textContent = `[${entry.fileType.toUpperCase()}]`;
            row2.appendChild(typeBadge);
        }

        if (!entry.hasLocalFile) {
            const cloudBadge = document.createElement("span");
            cloudBadge.className = "library-type-badge";
            cloudBadge.style.color = "var(--muted)";
            cloudBadge.textContent = "\u2601";
            cloudBadge.title = t("libraryCloudMissingBadge");
            row2.appendChild(cloudBadge);
        }

        if (!entry.hasLocalFile && entry.cloudBookId) {
            const attachButton = document.createElement("button");
            attachButton.type = "button";
            attachButton.className = "library-attach";
            attachButton.textContent = "\uD83D\uDCCE";
            attachButton.title = t("libraryAttachFile");
            attachButton.onclick = (event) => {
                event.stopPropagation();
                if (_actions.setPendingCloudBookId) _actions.setPendingCloudBookId(entry.cloudBookId);
                if (_actions.openFileDialog) _actions.openFileDialog();
            };
            row2.appendChild(attachButton);
        }

        info.append(title, row2);
        card.append(cover, info);
        elements.libraryGrid.appendChild(card);
    });
}

/**
 * ライブラリフィルタ
 */
export function filterLibraryCards(query) {
    const cards = elements.libraryGrid?.querySelectorAll(".library-card");
    if (!cards) return;
    const lowerQuery = (query || "").toLowerCase().trim();
    cards.forEach((card) => {
        const title = card.dataset.title || "";
        const author = card.dataset.author || "";
        const matches = !lowerQuery || title.includes(lowerQuery) || author.includes(lowerQuery);
        card.style.display = matches ? "" : "none";
    });
}

/**
 * 履歴の描画
 */
export function renderHistory() {
    if (!elements.historyList || !_storage) return;
    elements.historyList.innerHTML = "";
    const history = _storage.data.history || [];

    if (!history.length) {
        const empty = document.createElement("li");
        empty.textContent = t("history_empty");
        empty.style.textAlign = "center";
        empty.style.color = `var(${CSS_VARS.MUTED})`;
        elements.historyList.appendChild(empty);
        return;
    }

    history.forEach((entry) => {
        const book = _storage.data.library[entry.bookId];
        if (!book) return;

        const item = document.createElement("li");
        item.className = "history-item";

        const info = document.createElement("div");
        info.className = "history-info";
        info.onclick = () => {
            if (_actions.closeAllMenus) _actions.closeAllMenus();
            if (_actions.openFromLibrary) _actions.openFromLibrary(entry.bookId);
        };

        const title = document.createElement("div");
        title.className = "history-title";
        title.textContent = book.title;

        const meta = document.createElement("div");
        meta.className = "history-meta";
        const lastOpened = _syncLogic.formatLibraryMeta({ progressPercentage: 0, timestamp: entry.openedAt }, _state.uiLanguage).split(" / ").pop();
        meta.textContent = lastOpened;

        info.append(title, meta);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "history-delete";
        deleteBtn.textContent = UI_ICONS.DELETE;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(t("history_delete_confirm"))) {
                _storage.removeHistory(entry.bookId);
                renderHistory();
            }
        };

        item.append(info, deleteBtn);
        elements.historyList.appendChild(item);
    });
}

/**
 * しおりの描画
 */
export function renderBookmarks(mode = "current") {
    if (!elements.bookmarkList || !_storage) return;

    elements.bookmarkList.innerHTML = "";

    if (mode === "all") {
        const historyOrder = _storage.data.history.map((item) => item.bookId);
        const libraryOrder = Object.keys(_storage.data.library);
        const orderedBookIds = [...historyOrder, ...libraryOrder].filter((id, index, self) => self.indexOf(id) === index);
        const entries = [];

        orderedBookIds.forEach((bookId) => {
            const book = _storage.data.library[bookId];
            if (!book) return;
            const bookmarks = _storage.getBookmarks(bookId);
            bookmarks.forEach((bookmark) => {
                entries.push({ bookId, book, bookmark });
            });
        });

        if (!entries.length) {
            const empty = document.createElement("li");
            empty.textContent = t("bookmarkEmpty");
            empty.style.textAlign = "center";
            empty.style.color = `var(${CSS_VARS.MUTED})`;
            elements.bookmarkList.appendChild(empty);
            renderBookmarkMarkers();
            return;
        }

        entries.forEach(({ bookId, book, bookmark }) => {
            const item = document.createElement("li");
            item.className = "bookmark-item";
            if (bookmark.deviceColor) item.style.borderLeftColor = bookmark.deviceColor;

            const info = document.createElement("div");
            info.className = "bookmark-info";
            info.onclick = async () => {
                if (_actions.closeAllMenus) _actions.closeAllMenus();
                if (bookId === _state.currentBookId && _reader) {
                    _reader.goTo(bookmark);
                } else if (_actions.openFromLibrary) {
                    await _actions.openFromLibrary(bookId, { bookmark });
                }
            };

            const label = document.createElement("div");
            label.className = "bookmark-label";
            const colorDot = document.createElement("span");
            colorDot.className = "bookmark-color-dot";
            if (bookmark.deviceColor) colorDot.style.background = bookmark.deviceColor;
            const labelText = document.createElement("span");
            labelText.textContent = `${book.title} / ${bookmark.label || t("bookmarkDefault")}`;
            label.append(colorDot, labelText);

            const meta = document.createElement("div");
            meta.className = "bookmark-meta";
            let metaText = new Date(bookmark.createdAt).toLocaleString();
            metaText += ` / ${bookmark.percentage}%`;
            meta.textContent = metaText;

            info.append(label, meta);

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "bookmark-delete";
            deleteBtn.textContent = UI_ICONS.DELETE;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(t("bookmarkDeleteConfirm"))) {
                    _storage.removeBookmark(bookId, bookmark.createdAt);
                    renderBookmarks(mode);
                    renderBookmarkMarkers();
                    if (_actions.scheduleAutoSyncPush) _actions.scheduleAutoSyncPush();
                }
            };

            item.append(info, deleteBtn);
            elements.bookmarkList.appendChild(item);
        });

        renderBookmarkMarkers();
        return;
    }

    if (!_state.currentBookId) {
        const empty = document.createElement("li");
        empty.textContent = t("openBookPrompt");
        empty.style.textAlign = "center";
        empty.style.color = `var(${CSS_VARS.MUTED})`;
        elements.bookmarkList.appendChild(empty);
        renderBookmarkMarkers();
        return;
    }

    const bookmarks = _storage.getBookmarks(_state.currentBookId);

    if (!bookmarks.length) {
        const empty = document.createElement("li");
        empty.textContent = t("bookmarkEmpty");
        empty.style.textAlign = "center";
        empty.style.color = `var(${CSS_VARS.MUTED})`;
        elements.bookmarkList.appendChild(empty);
        renderBookmarkMarkers();
        return;
    }

    bookmarks.forEach((bookmark) => {
        const item = document.createElement("li");
        item.className = "bookmark-item";
        if (bookmark.deviceColor) item.style.borderLeftColor = bookmark.deviceColor;

        const info = document.createElement("div");
        info.className = "bookmark-info";
        info.onclick = () => {
            if (_actions.closeAllMenus) _actions.closeAllMenus();
            if (_reader) _reader.goTo(bookmark);
        };

        const label = document.createElement("div");
        label.className = "bookmark-label";
        const colorDot = document.createElement("span");
        colorDot.className = "bookmark-color-dot";
        if (bookmark.deviceColor) colorDot.style.background = bookmark.deviceColor;
        const labelText = document.createElement("span");
        labelText.textContent = bookmark.label || t("bookmarkDefault");
        label.append(colorDot, labelText);

        const meta = document.createElement("div");
        meta.className = "bookmark-meta";
        let metaText = new Date(bookmark.createdAt).toLocaleString();
        if (_state.progressDisplayMode === "page") {
            if (_state.currentBookInfo?.type === BOOK_TYPES.EPUB) {
                const totalPages = _actions.getEpubPaginationTotal ? _actions.getEpubPaginationTotal() : null;
                if (totalPages) {
                    const pageIndex = Math.max(1, Math.round((bookmark.percentage / 100) * totalPages));
                    metaText += ` / ${pageIndex}/${totalPages}`;
                } else {
                    metaText += ` / ${bookmark.percentage}%`;
                }
            } else if (_state.currentBookInfo?.type === BOOK_TYPES.IMAGE && _reader) {
                const totalPages = _reader.imagePages?.length || 1;
                const pageNumber = Math.max(1, Math.round((bookmark.percentage / 100) * totalPages));
                metaText += ` / ${pageNumber}/${totalPages}`;
            } else {
                metaText += ` / ${bookmark.percentage}%`;
            }
        } else {
            metaText += ` / ${bookmark.percentage}%`;
        }
    } else {
        metaText += ` / ${bookmark.percentage}%`;
}
meta.textContent = metaText;

info.append(label, meta);

const deleteBtn = document.createElement("button");
deleteBtn.className = "bookmark-delete";
deleteBtn.textContent = UI_ICONS.DELETE;
deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm(t("bookmarkDeleteConfirm"))) {
        _storage.removeBookmark(_state.currentBookId, bookmark.createdAt);
        renderBookmarks(mode);
        renderBookmarkMarkers();
        if (_actions.scheduleAutoSyncPush) _actions.scheduleAutoSyncPush();
    }
};

item.append(info, deleteBtn);
elements.bookmarkList.appendChild(item);
    });

renderBookmarkMarkers();
}

/**
 * プログレスバー上のしおりマーカー描画
 */
export function renderBookmarkMarkers() {
    // 全ての進捗トラック（メインとフローティング）を対象にする
    const tracks = document.querySelectorAll(DOM_SELECTORS.PROGRESS_TRACK);
    if (!tracks.length) return;

    // 既存のマーカーを削除
    tracks.forEach(track => {
        track.querySelectorAll(DOM_SELECTORS.BOOKMARK_MARKER).forEach((node) => node.remove());
    });

    if (!_state.currentBookId || !_storage) return;

    const bookmarks = _storage.getBookmarks(_state.currentBookId);
    if (!bookmarks.length) return;

    bookmarks.forEach((bookmark) => {
        const percentage = Math.min(100, Math.max(0, bookmark.percentage ?? 0));

        // 各トラックに対してマーカーを生成
        tracks.forEach(track => {
            const marker = document.createElement("button");
            marker.type = "button";
            marker.className = UI_CLASSES.BOOKMARK_MARKER;
            marker.style.left = `${percentage}%`;
            if (bookmark.deviceColor) marker.style.background = bookmark.deviceColor;

            let tooltipText = bookmark.label || t("bookmarkDefault");
            if (_state.progressDisplayMode === "page") {
                if (_state.currentBookInfo?.type === BOOK_TYPES.EPUB) {
                    const totalPages = _actions.getEpubPaginationTotal ? _actions.getEpubPaginationTotal() : null;
                    if (totalPages) {
                        const pageIndex = Math.max(1, Math.round((percentage / 100) * totalPages));
                        tooltipText += ` (${pageIndex}/${totalPages})`;
                    }
                } else if (_state.currentBookInfo && (_state.currentBookInfo.type === BOOK_TYPES.ZIP || _state.currentBookInfo.type === BOOK_TYPES.RAR)) {
                    const totalPages = _reader.imagePages?.length || 1;
                    const pageNumber = Math.max(1, Math.round((percentage / 100) * totalPages));
                    tooltipText += ` (${pageNumber}/${totalPages})`;
                }
            } else {
                tooltipText += ` (${Math.round(percentage)}%)`;
            }
            marker.title = tooltipText;

            marker.onclick = (e) => {
                e.stopPropagation();
                if (_actions.closeAllMenus) _actions.closeAllMenus();
                if (_reader) _reader.goTo(bookmark);
            };

            track.appendChild(marker);
        });
    });
}

/**
 * 目次の描画
 */
export function renderToc(tocItems = []) {
    if (!elements.tocModalList) return;

    const normalizedToc = tocItems?.toc ?? tocItems?.items ?? tocItems;
    const tocArray = Array.isArray(normalizedToc) ? normalizedToc : Object.values(normalizedToc || {});

    if (elements.tocList) elements.tocList.innerHTML = "";
    elements.tocModalList.innerHTML = "";
    const isEpub = _state.currentBookInfo?.type === BOOK_TYPES.EPUB;

    if (!isEpub || tocArray.length === 0) {
        elements.tocSection?.classList.add(UI_CLASSES.HIDDEN);
        return;
    }

    elements.tocSection?.classList.remove(UI_CLASSES.HIDDEN);
    renderTocEntries(tocArray, elements.tocModalList, 0);
}

export function renderTocEntries(items, container, depth) {
    if (!Array.isArray(items)) return;

    items.forEach((item) => {
        const label = (item.label ?? item.title ?? t("tocUntitled")).toString().trim() || t("tocUntitled");
        const li = document.createElement("li");
        li.className = "toc-item";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "toc-link";
        button.textContent = label;
        button.style.paddingLeft = `${Math.min(depth, 6) * 12}px`;

        button.addEventListener("click", async () => {
            try {
                if (_actions.closeAllMenus) _actions.closeAllMenus();
                if (_reader?.usingPaginator && item.href) {
                    _reader.navigateToHref(item.href);
                }
            } catch (error) {
                console.warn("目次移動に失敗しました:", error);
            }
        });

        li.appendChild(button);
        container.appendChild(li);

        if (item.subitems?.length) {
            renderTocEntries(item.subitems, container, depth + 1);
        }
    });
}

/**
 * 検索結果の描画
 */
export function renderSearchResults(results, query) {
    if (!elements.searchResults) return;
    elements.searchResults.innerHTML = "";

    if (!results.length) {
        elements.searchResults.textContent = tReplace("searchNoResults", { query });
        return;
    }

    results.forEach((result) => {
        const item = document.createElement("div");
        item.className = "search-result-item";

        const text = document.createElement("div");
        text.className = "search-result-text";
        text.innerHTML = result.excerpt;

        item.onclick = () => {
            if (_actions.closeAllMenus) _actions.closeAllMenus();
            if (_reader) _reader.goTo(result.cfi);
        };

        item.appendChild(text);
        elements.searchResults.appendChild(item);
    });
}

/**
 * クラウドのみ書籍の読み込み待機画面の表示
 */
export function showCloudEmptyState({ cloudBookId, title, progressPercentage, lastTimestamp }) {
    if (elements.cloudEmptyState) {
        elements.cloudEmptyState.classList.remove(UI_CLASSES.HIDDEN);
    }
    if (elements.cloudEmptyTitle) {
        elements.cloudEmptyTitle.textContent = `${t("cloudOnlyTitle")}\uFF1A${title ?? ""}`;
    }
    if (elements.cloudEmptyMeta) {
        const metaText = _syncLogic.formatLibraryMeta({
            progressPercentage,
            timestamp: lastTimestamp,
        }, _state.uiLanguage);
        elements.cloudEmptyMeta.textContent = `${t("cloudOnlyDescription")} (${metaText})`;
    }
    if (elements.cloudAttachButton) {
        elements.cloudAttachButton.textContent = t("libraryAttachFile");
        elements.cloudAttachButton.onclick = () => {
            if (_actions.setPendingCloudBookId) _actions.setPendingCloudBookId(cloudBookId);
            if (_actions.openFileDialog) _actions.openFileDialog();
        };
    }
}

export function hideCloudEmptyState() {
    if (elements.cloudEmptyState) {
        elements.cloudEmptyState.classList.add(UI_CLASSES.HIDDEN);
    }
}
