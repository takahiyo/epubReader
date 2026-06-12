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
    PREMIUM_ICONS,
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

/**
 * プレミアムアイコン（画像）を取得
 */
export function getPremiumIcon(path, size = null) {
    const img = document.createElement("img");
    img.src = path;
    img.className = "float-btn-icon";
    if (size !== null) {
        img.style.width = `${size}px`;
        img.style.height = `${size}px`;
    }
    img.alt = "";
    return img;
}

/**
 * 2枚1組のプレミアムアイコン（画像）をクロップして取得
 */
export function getPremiumIconCropped(path, isRight, size = null) {
    const container = document.createElement("div");
    container.className = "float-btn-icon-crop";
    if (size !== null) {
        container.style.width = `${size}px`;
        container.style.height = `${size}px`;
    }

    const img = document.createElement("img");
    img.src = path;
    img.alt = "";
    img.style.objectPosition = isRight ? "right" : "left";

    container.appendChild(img);
    return container;
}

/**
 * フロートボタンにアイコン＋テキストを横並びで設定（目次ボタン基準）
 */
export function setFloatInlineLabel(button, iconElement, text) {
    if (!button) return;
    const label = document.createTextNode(` ${text}`);
    button.replaceChildren(iconElement, label);
}

/**
 * 絵文字アイコン＋テキストでフロートボタンを設定
 */
export function setFloatEmojiLabel(button, emoji, text) {
    if (!button) return;
    const iconSpan = document.createElement("span");
    iconSpan.className = "float-btn-icon float-btn-icon-emoji";
    iconSpan.setAttribute("aria-hidden", "true");
    iconSpan.textContent = emoji;
    setFloatInlineLabel(button, iconSpan, text);
}

export function setMaterialIconLabel(button, iconName, labelText) {
    if (!button) return;
    
    // PREMIUM_ICONS マッピング
    const iconMap = {
        [UI_ICONS.SETTINGS]: PREMIUM_ICONS.SETTINGS,
        [UI_ICONS.MENU_OPEN]: PREMIUM_ICONS.OPEN,
        [UI_ICONS.MENU_TOC]: PREMIUM_ICONS.TOC,
        [UI_ICONS.MENU_LIBRARY]: PREMIUM_ICONS.LIBRARY,
        [UI_ICONS.MENU_SEARCH]: PREMIUM_ICONS.SEARCH,
        [UI_ICONS.MENU_BOOKMARKS]: PREMIUM_ICONS.BOOKMARKS,
        [UI_ICONS.MENU_HISTORY]: PREMIUM_ICONS.HISTORY,
        [UI_ICONS.MENU_WEB_NOVEL]: PREMIUM_ICONS.WEBNOVEL,
        [UI_ICONS.LANGUAGE]: PREMIUM_ICONS.LANGUAGE,
        [UI_ICONS.SHARE]: PREMIUM_ICONS.SHARE,
        [UI_ICONS.SPREAD_DOUBLE]: PREMIUM_ICONS.LIBRARY, // 代用
        [UI_ICONS.SPREAD_SINGLE]: PREMIUM_ICONS.OPEN, // 代用
    };

    const premiumPath = iconMap[iconName];
    let iconElement;

    if (premiumPath) {
        iconElement = getPremiumIcon(premiumPath);
    } else {
        iconElement = document.createElement("span");
        iconElement.className = `${UI_CLASSES.MATERIAL_ICON} float-btn-icon float-btn-icon-emoji`;
        iconElement.textContent = iconName;
    }

    setFloatInlineLabel(button, iconElement, labelText);
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

    const isSupportedBook = _state.currentBookId && (_state.currentBookInfo?.type === BOOK_TYPES.EPUB || _state.currentBookInfo?.type === BOOK_TYPES.WEB_NOVEL);
    elements.menuSearch.disabled = !isSupportedBook;
    if (elements.menuOpenToc) {
        elements.menuOpenToc.disabled = !isSupportedBook;
    }
    if (elements.openToc) {
        elements.openToc.disabled = !isSupportedBook;
    }
    if (elements.floatSearch) {
        elements.floatSearch.disabled = !isSupportedBook;
    }
}

/**
 * フローティングUIのボタン表示を更新
 */
export function updateFloatingUIButtons() {
    console.log('[Renderers.updateFloatingUIButtons] 呼び出し', { bookId: _state.currentBookId, bookType: _state.currentBookInfo?.type });
    const isImageBook = _state.currentBookInfo && (_state.currentBookInfo.type === BOOK_TYPES.ZIP || _state.currentBookInfo.type === BOOK_TYPES.RAR);
    const isEpub = _state.currentBookInfo && _state.currentBookInfo.type === BOOK_TYPES.EPUB;
    const isWebNovel = _state.currentBookInfo && _state.currentBookInfo.type === BOOK_TYPES.WEB_NOVEL;
    const isSupportedBook = isEpub || isWebNovel;
    const isBookOpen = _state.currentBookId !== null;

    if (elements.menuOpenToc) {
        elements.menuOpenToc.disabled = !isSupportedBook;
    }
    if (elements.openToc) {
        elements.openToc.disabled = !isSupportedBook;
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

    if (elements.shareLogButton) {
        // 読書録は目次と同様、常に表示し未オープン時のみ無効化（非表示にすると空状態で項目が消えて見える）
        setElementVisibility(elements.shareLogButton, true);
        elements.shareLogButton.disabled = !isBookOpen;
        setMaterialIconLabel(elements.shareLogButton, UI_ICONS.SHARE, t("share_reading_log"));
    }

    if (elements.menuShareLog) {
        elements.menuShareLog.disabled = !isBookOpen;
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
        updateFloatBookTitle();

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
 * フロートオーバーレイの本のタイトルを更新
 */
export function updateFloatBookTitle() {
    if (!elements.floatBookTitle) return;
    if (_state.currentBookInfo?.title) {
        elements.floatBookTitle.textContent = _state.currentBookInfo.title;
    } else {
        elements.floatBookTitle.textContent = '';
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
    const label = isRtl ? t("pageDirectionRtlButton") : t("pageDirectionLtrButton");
    setFloatEmojiLabel(elements.toggleReadingDirectionImage, UI_ICONS.READING_DIRECTION_TOGGLE, label);
    elements.toggleReadingDirectionImage.title = isRtl ? t("readingDirectionRtlTitle") : t("readingDirectionLtrTitle");
}

export function updateWritingModeToggleLabel() {
    if (!elements.toggleWritingMode) return;
    const isVertical = _state.writingMode === WRITING_MODES.VERTICAL;
    const label = isVertical
        ? t("writingModeToggleVertical")
        : t("writingModeToggleHorizontal");
    const emoji = isVertical ? "↕" : "↔";
    setFloatEmojiLabel(elements.toggleWritingMode, emoji, label);
    elements.toggleWritingMode.setAttribute("aria-pressed", isVertical ? "true" : "false");
}

export function updateThemeToggleIcon() {
    if (!elements.toggleTheme) return;
    const isDark = _state.theme === "dark";

    const iconElement = getPremiumIconCropped(PREMIUM_ICONS.THEME_DARK, isDark);
    setFloatInlineLabel(elements.toggleTheme, iconElement, t("themeButtonLabel"));
    elements.toggleTheme.setAttribute("aria-pressed", isDark ? "true" : "false");
}

export function updateEpubScrollMode() {
    if (!elements.fullscreenReader) return;
    const isEpub = _state.currentBookInfo?.type === BOOK_TYPES.EPUB;
    const isScroll = _state.epubViewMode === 'scroll';
    const isHorizontal = _state.writingMode === WRITING_MODES.HORIZONTAL;

    // EPUB購読中のみインジケーターを表示するためのクラス
    if (isEpub) {
        elements.fullscreenReader.classList.add('show-mode-indicator');
    } else {
        elements.fullscreenReader.classList.remove('show-mode-indicator');
    }

    if (isScroll) {
        elements.fullscreenReader.classList.add(UI_CLASSES.EPUB_SCROLL_MODE);
    } else {
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL_MODE);
    }
}

export function updateReadingDirectionEpubButtonLabel() {
    if (!elements.toggleReadingDirectionEpub) return;
    const isRtl = _state.pageDirection === READING_DIRECTIONS.RTL;
    const label = isRtl ? t("pageDirectionRtlButton") : t("pageDirectionLtrButton");
    setFloatEmojiLabel(elements.toggleReadingDirectionEpub, UI_ICONS.READING_DIRECTION_TOGGLE, label);
    elements.toggleReadingDirectionEpub.title = isRtl ? t("readingDirectionRtlTitle") : t("readingDirectionLtrTitle");
}

export function updateZoomButtonLabel() {
    if (!elements.toggleZoom || !_reader) return;
    const isZoomed = _reader.imageZoomed;
    
    // クロップドアイコンの生成（右側がマイナス、左側がプラス）
    const iconElement = getPremiumIconCropped(PREMIUM_ICONS.ZOOM_IN, isZoomed);
    
    elements.toggleZoom.replaceChildren(iconElement);
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
        card.append(info);
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
        const cloudBookIds = Object.keys(_storage.data.cloudIndex ?? {});

        // すでにローカル書籍と紐づいているクラウドIDの一覧を取得
        const linkedCloudIds = Object.values(_storage.data.bookLinkMap ?? {});

        // すでにリンク済みのクラウドIDは、クラウド専用しおりのリスト候補から除外する
        const unlinkedCloudBookIds = cloudBookIds.filter(id => !linkedCloudIds.includes(id));

        // ローカルと未リンククラウドのIDを統合（順序維持）
        const allPotentialIds = [...historyOrder, ...libraryOrder, ...unlinkedCloudBookIds].filter((id, index, self) => self.indexOf(id) === index);
        const entries = [];

        allPotentialIds.forEach((id) => {
            const localBook = _storage.data.library[id];

            if (localBook) {
                // ローカル書籍のしおり
                const bookmarks = _storage.getBookmarks(id);
                bookmarks.forEach((bookmark) => {
                    entries.push({ bookId: id, book: localBook, bookmark, isCloudOnly: false });
                });
            } else if (_storage.data.cloudIndex && _storage.data.cloudIndex[id]) {
                // クラウドのみ存在する（未リンク）書籍のしおり
                const cloudMeta = _storage.data.cloudIndex[id];
                const cloudState = _storage.getCloudState(id);
                const bookmarks = cloudState?.bookmarks ?? [];

                bookmarks.forEach((bookmark) => {
                    entries.push({
                        bookId: id,
                        cloudBookId: id,
                        book: {
                            title: cloudMeta.title || t("untitledBook"),
                            author: cloudMeta.author || ""
                        },
                        bookmark,
                        isCloudOnly: true
                    });
                });
            }
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

        // 最新順にソート（createdAt / updatedAt）
        entries.sort((a, b) => {
            const timeA = a.bookmark.updatedAt || a.bookmark.createdAt || 0;
            const timeB = b.bookmark.updatedAt || b.bookmark.createdAt || 0;
            return timeB - timeA;
        });

        entries.forEach(({ bookId, cloudBookId, book, bookmark, isCloudOnly }) => {
            const item = document.createElement("li");
            item.className = "bookmark-item";
            if (isCloudOnly) item.classList.add("cloud-only"); // CSSスタイル用
            if (bookmark.deviceColor) item.style.borderLeftColor = bookmark.deviceColor;

            const info = document.createElement("div");
            info.className = "bookmark-info";
            info.onclick = async () => {
                if (_actions.closeAllMenus) _actions.closeAllMenus();

                if (bookId === _state.currentBookId && _reader) {
                    _reader.goTo(bookmark);
                } else if (isCloudOnly) {
                    // クラウドのみの書籍の場合はインポートを促す
                    if (_actions.openCloudOnlyBook) await _actions.openCloudOnlyBook(cloudBookId);
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
            let displayText = `${book.title} / ${bookmark.label || t("bookmarkDefault")}`;
            if (isCloudOnly) displayText = `[${t("libraryCloudMissingBadge")}] ${displayText}`;
            labelText.textContent = displayText;

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
                    if (_actions.requestCloudSyncIfNeeded) {
                        _actions.requestCloudSyncIfNeeded({ force: true });
                    } else if (_actions.scheduleAutoSyncPush) {
                        _actions.scheduleAutoSyncPush();
                    }
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
 * ラベルが不要な数字のみの項目であるかを判定する
 * @param {string} label 
 * @returns {boolean}
 */
function isNumericLabel(label) {
    const trimmed = label.trim();
    if (!trimmed) return false;
    // 半角・全角数字、漢数字、ローマ数字、丸数字、括弧付き数字等
    const pattern = /^[0-9０-９一二三四五六七八九十百千万〇零IVXLCDMivxlcdm\u2160-\u217f\u2460-\u2473\u2474-\u247d\u3220-\u3229\s]+$/;
    return pattern.test(trimmed);
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
    const isEpubOrWebNovel = _state.currentBookInfo?.type === BOOK_TYPES.EPUB || _state.currentBookInfo?.type === BOOK_TYPES.WEB_NOVEL;

    if (!isEpubOrWebNovel || tocArray.length === 0) {
        elements.tocSection?.classList.add(UI_CLASSES.HIDDEN);
        return;
    }

    elements.tocSection?.classList.remove(UI_CLASSES.HIDDEN);

    // [追加] 目次ソース切り替えトグル
    if (_reader?.enhancedToc?.length > 0) {
        const toggleHeader = document.createElement("div");
        toggleHeader.className = "toc-toggle-header";
        toggleHeader.style.cssText = "padding: 8px 16px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; background: var(--bg-color-alt);";

        const label = document.createElement("span");
        label.textContent = _reader.useEnhancedToc ? "本文内目次を使用中" : "標準目次を使用中";
        label.style.fontWeight = "bold";
        label.style.color = "var(--primary-color)";

        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "toc-source-toggle-btn";
        toggleBtn.textContent = _reader.useEnhancedToc ? "標準に戻す" : "拡張目次に切替";
        toggleBtn.style.cssText = "padding: 4px 12px; border-radius: 20px; background: var(--primary-color); color: white; border: none; cursor: pointer; font-size: 0.75rem; transition: all 0.2s ease;";
        
        toggleBtn.onclick = async (e) => {
            e.stopPropagation();
            toggleBtn.disabled = true;
            toggleBtn.style.opacity = "0.5";
            await _reader.toggleTocSource(!_reader.useEnhancedToc);
            // reader.toggleTocSource の中で onReady -> renderToc が再度呼ばれるため、ここでは何もしない
        };

        toggleHeader.append(label, toggleBtn);
        elements.tocModalList.appendChild(toggleHeader);
    }

    // 【追加】事前にテキストを含む見出しが混在しているかをチェックする
    let hasNonNumericLabel = false;
    const checkLabels = (items) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
            const label = (item.label ?? item.title ?? "").toString().trim();
            if (label && !isNumericLabel(label)) {
                hasNonNumericLabel = true;
                return;
            }
            if (item.subitems?.length) {
                checkLabels(item.subitems);
                if (hasNonNumericLabel) return;
            }
        }
    };
    checkLabels(tocArray);

    renderTocEntries(tocArray, elements.tocModalList, 0, hasNonNumericLabel);
}

export function renderTocEntries(items, container, depth, filterNumerics = false) {
    if (!Array.isArray(items)) return;

    items.forEach((item) => {
        const label = (item.label ?? item.title ?? t("tocUntitled")).toString().trim() || t("tocUntitled");

        // 【追加】テキストと混在しており、かつ数字のみの項目の場合はスキップ
        if (filterNumerics && isNumericLabel(label)) {
            if (item.subitems?.length) {
                renderTocEntries(item.subitems, container, depth, filterNumerics);
            }
            return;
        }

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
                if (_state.currentBookInfo?.type === BOOK_TYPES.WEB_NOVEL && item._episodeIndex !== undefined) {
                    if (_reader) _reader.goTo({ location: { location: item._episodeIndex, percentage: 0 } });
                } else if (_reader?.usingPaginator && item.href) {
                    _reader.navigateToHref(item.href);
                }
            } catch (error) {
                console.warn("目次移動に失敗しました:", error);
            }
        });

        li.appendChild(button);
        container.appendChild(li);

        if (item.subitems?.length) {
            renderTocEntries(item.subitems, container, depth + 1, filterNumerics);
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
        elements.searchResults.textContent = tReplace("searchNoResults", { query }, _state.uiLanguage);
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
            if (_reader) _reader.goTo({
                location: {
                    spineIndex: result.spineIndex,
                    segmentIndex: result.segmentIndex
                },
                cfi: result.cfi,
                searchQuery: query
            });
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

/**
 * PWA インストールボタンの表示更新
 * @param {boolean} isInstallable - インストール可能（beforeinstallprompt発生済み）か
 */
export function updateInstallButton(isInstallable) {
    if (!elements.installButton || !elements.installContainer) return;

    elements.installButton.textContent = t("installApp");
    setElementVisibility(elements.installContainer, isInstallable);
}
