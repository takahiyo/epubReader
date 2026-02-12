/**
 * app.js - メインアプリケーション
 * 
 * EPUB/画像書庫リーダーのメインエントリーポイント
 */

import { StorageService, getDeviceInfo } from "./storage.js";
import { ReaderController } from "./reader.js";
import { CloudSync } from "./cloudSync.js";
import { UIController, ProgressBarHandler } from "./ui.js";
import {
  checkAuthStatus,
  initGoogleLogin,
  logout,
  startGoogleLogin,
  onGoogleLoginStart as startGoogleLoginUi,
  onGoogleLoginEnd as endGoogleLoginUi,
} from "./auth.js";
import { auth } from "./firebaseConfig.js";
import { saveFile, loadFile, bufferToFile, deleteBook } from "./fileStore.js";
import { elements } from "./js/ui/elements.js";
import { initLoadingAnimation, showLoading, hideLoading } from "./js/ui/overlay-manager.js";
import { resolveErrorCode } from "./js/ui/i18n-utils.js";
import * as fileHandler from "./js/core/file-handler.js";
import { calculateProgressPercentage, normalizePageIndex, roundProgressPercentage } from "./js/core/progress-utils.js";
import * as syncLogic from "./js/core/sync-logic.js";
import * as renderers from "./js/ui/renderers.js";
import { UI_STRINGS, getUiStrings, t as translate, tReplace, DEFAULT_LANGUAGE, formatRelativeTime } from "./i18n.js";
import {
  APP_INFO,
  ERROR_CODES,
  ERROR_MESSAGE_MATCHERS,
  MIME_TYPES,
  SUPPORTED_FORMATS,
  TIMING_CONFIG,
  UI_CLASSES,
  UI_ICONS,
  UI_SYMBOLS,
  UI_DEFAULTS,
  BOOK_TYPES,
  WRITING_MODES,
  READING_DIRECTIONS,
  IMAGE_VIEW_MODES,
  FILESTORE_CONFIG,
  FILE_EXTENSIONS,
  ARCHIVE_WARNING_EVENT,
  ARCHIVE_WARNING_CONFIG,
  DOM_IDS,
  DOM_SELECTORS,
  CSS_VARS,
  ASSET_PATHS,
  READER_CONFIG,
  SYNC_SOURCES,
  CLOUD_SYNC_PAGE_THRESHOLD,
  NOTION_INTEGRATION_STATUS,
  NOTION_DEFAULT_SETTINGS,
  NOTION_CONFIG,
} from "./constants.js";

// ========================================
// 初期化
// ========================================

const storage = new StorageService();
const cloudSync = new CloudSync(storage);
const settings = storage.getSettings();
const initialAuthStatus = checkAuthStatus();

let currentBookId = null;
let currentBookInfo = null;
let currentCloudBookId = null;
let pendingCloudBookId = null;
let theme = settings.theme ?? UI_DEFAULTS.theme;
let writingMode = settings.writingMode;
let pageDirection = settings.pageDirection;
let uiLanguage = settings.uiLanguage ?? UI_DEFAULTS.uiLanguage;
let progressDisplayMode = settings.progressDisplayMode ?? UI_DEFAULTS.progressDisplayMode;
let fontSize = Number.isFinite(settings.fontSize) ? settings.fontSize : null;
let archiveWarningTimeoutId = null;
const legacyDirection = settings.readingDirection;
if (!writingMode || !pageDirection) {
  const legacyConfig = UI_DEFAULTS.legacyDirectionMap[legacyDirection];
  if (legacyConfig) {
    writingMode = legacyConfig.writingMode;
    pageDirection = legacyConfig.pageDirection;
  }
}
if (!writingMode) writingMode = UI_DEFAULTS.writingMode;
if (!pageDirection) pageDirection = UI_DEFAULTS.pageDirection;
let defaultWritingMode = settings.defaultWritingMode ?? UI_DEFAULTS.writingMode;
let defaultPageDirection = settings.defaultPageDirection ?? UI_DEFAULTS.defaultDirection;
let defaultImageViewMode = settings.defaultImageViewMode ?? UI_DEFAULTS.imageViewMode;
let autoSyncEnabled = false;
let libraryViewMode = settings.libraryViewMode ?? UI_DEFAULTS.libraryViewMode;
let autoSyncInterval = null;
let lastSavedPercentage = null;
let bookmarkMenuMode = UI_DEFAULTS.bookmarkMenuMode;
let currentToc = [];
let uiInitialized = false;
let floatVisible = false;
let googleLoginReady = false;
let userOverrodeDirection = false;
let archiveWarningTypes = [];
// ライブラリで削除マークが付いた書籍のID（メニューを閉じた時に実際に削除）
// Map<string, { id: string, type: 'local' | 'cloud' }>
let pendingDeletes = new Map();
const NOTION_STATUS_LABEL_KEYS = Object.freeze({
  [NOTION_INTEGRATION_STATUS.DISCONNECTED]: "notionStatusDisconnected",
  [NOTION_INTEGRATION_STATUS.CONNECTED]: "notionStatusConnected",
  [NOTION_INTEGRATION_STATUS.PENDING]: "notionStatusPending",
  [NOTION_INTEGRATION_STATUS.ERROR]: "notionStatusError",
});

// UI_STRINGS は i18n.js からインポート済み


// 初期化実行（非同期Lottie読み込み対応）
document.addEventListener('DOMContentLoaded', async () => {
  await initLoadingAnimation();
});


function t(key) {
  return translate(key, uiLanguage);
}

function getNotionSettingsSnapshot() {
  const currentSettings = storage.getSettings();
  return {
    ...NOTION_DEFAULT_SETTINGS,
    ...(currentSettings.notionIntegration ?? {}),
  };
}

function getNotionUrlSample() {
  return NOTION_CONFIG.OAUTH_URL_SAMPLE || NOTION_CONFIG.OAUTH_URL;
}

function getNotionOAuthUrl() {
  const notionSettings = getNotionSettingsSnapshot();
  return notionSettings.oauthUrl || NOTION_CONFIG.OAUTH_URL;
}

function normalizeEpubLocation(location) {
  if (!location) return null;
  if (
    typeof location === "object" &&
    Number.isFinite(location.spineIndex) &&
    Number.isFinite(location.segmentIndex)
  ) {
    return {
      spineIndex: location.spineIndex,
      segmentIndex: location.segmentIndex,
    };
  }
  if (typeof location === "string") {
    const match = location.match(/^(\d+):(\d+)$/);
    if (match) {
      return {
        spineIndex: Number(match[1]),
        segmentIndex: Number(match[2]),
      };
    }
  }
  return null;
}

function normalizeProgressSnapshot(progress, bookType) {
  if (!progress || bookType !== BOOK_TYPES.EPUB) return progress;
  const normalizedLocation = normalizeEpubLocation(progress.location);
  if (!normalizedLocation) return progress;
  return {
    ...progress,
    location: normalizedLocation,
  };
}

function renderNotionSettingsStatus() {
  const notionSettings = getNotionSettingsSnapshot();
  const statusKey = NOTION_STATUS_LABEL_KEYS[notionSettings.status] ?? "notionStatusDisconnected";
  if (elements.notionStatus) {
    elements.notionStatus.textContent = t(statusKey);
  }
  if (elements.notionWorkspaceInput) {
    elements.notionWorkspaceInput.value = notionSettings.workspaceName || t("notionValueEmpty");
  }
  if (elements.notionParentPageInput) {
    elements.notionParentPageInput.value = notionSettings.parentPageId || t("notionValueEmpty");
  }
  if (elements.notionDatabaseInput) {
    elements.notionDatabaseInput.value = notionSettings.databaseId || t("notionValueEmpty");
  }
  if (elements.notionOauthUrlInput) {
    elements.notionOauthUrlInput.value = notionSettings.oauthUrl || "";
    elements.notionOauthUrlInput.placeholder = tReplace(
      "notionOauthUrlPlaceholder",
      { url: getNotionUrlSample() },
      uiLanguage,
    );
  }
  const isConnected = notionSettings.status === NOTION_INTEGRATION_STATUS.CONNECTED;
  if (elements.notionConnectButton) {
    elements.notionConnectButton.disabled = isConnected;
  }
  if (elements.notionDisconnectButton) {
    elements.notionDisconnectButton.disabled = !isConnected;
  }
}

function handleNotionConnectClick() {
  const notionUrl = getNotionOAuthUrl();
  if (!notionUrl) {
    alert(tReplace("notionConnectUnavailable", { url: getNotionUrlSample() }, uiLanguage));
    return;
  }
  window.location.href = notionUrl;
}

function handleNotionDisconnectClick() {
  if (!confirm(t("notionDisconnectConfirm"))) return;
  storage.setSettings({ notionIntegration: { ...NOTION_DEFAULT_SETTINGS } });
  renderNotionSettingsStatus();
  alert(t("notionDisconnected"));
}

// 同期ロジックの初期化
syncLogic.init({
  storage,
  cloudSync,
  checkAuthStatus,
  callbacks: {
    openModal,
    closeModal,
    renderLibrary: () => renderers.renderLibrary(),
    renderHistory: () => renderers.renderHistory(),
    renderBookmarks: (mode) => renderers.renderBookmarks(mode),
    updateSyncStatusDisplay: (auth) => renderers.updateSyncStatusDisplay(auth),
    updateFloatingUIButtons: () => renderers.updateFloatingUIButtons(),
    updateProgressBarDisplay: () => renderers.updateProgressBarDisplay(),
    updateAuthStatusDisplay: () => renderers.updateAuthStatusDisplay(),
    syncAutoSyncPolicy,
    openFileDialog,
    applyReadingState,
  },
});

function setArchiveWarnings(warningTypes = []) {
  const uniqueTypes = [...new Set(warningTypes)];
  archiveWarningTypes = uniqueTypes;
  renderers.showArchiveWarnings(uniqueTypes);
  if (archiveWarningTimeoutId) {
    clearTimeout(archiveWarningTimeoutId);
    archiveWarningTimeoutId = null;
  }
  if (uniqueTypes.length > 0 && ARCHIVE_WARNING_CONFIG.AUTO_CLOSE_MS > 0) {
    archiveWarningTimeoutId = setTimeout(() => {
      clearArchiveWarnings();
    }, ARCHIVE_WARNING_CONFIG.AUTO_CLOSE_MS);
  }
}

function clearArchiveWarnings() {
  archiveWarningTypes = [];
  renderers.hideArchiveWarnings();
  if (archiveWarningTimeoutId) {
    clearTimeout(archiveWarningTimeoutId);
    archiveWarningTimeoutId = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener(ARCHIVE_WARNING_EVENT, (event) => {
    const warningTypes = event?.detail?.warningTypes ?? [];
    if (Array.isArray(warningTypes) && warningTypes.length > 0) {
      setArchiveWarnings(warningTypes);
    }
  });
}




// ========================================



// ========================================
// 進捗保存
// ========================================
function getCurrentTotalPages() {
  if (!reader) return 0;
  return reader.type === BOOK_TYPES.EPUB
    ? (reader.pagination?.pages?.length || 0)
    : (reader.imagePages?.length || 0);
}

function getCurrentPageIndex() {
  if (!reader) return 0;
  const rawIndex = reader.type === BOOK_TYPES.EPUB ? reader.currentPageIndex : reader.imageIndex;
  return normalizePageIndex(rawIndex);
}

function getProgressSnapshot(progressOverride = {}) {
  const totalPages = getCurrentTotalPages();
  const pageIndex = getCurrentPageIndex();
  const fallbackPercentage = calculateProgressPercentage(pageIndex, totalPages) ?? 0;
  const percentage = Number.isFinite(progressOverride.percentage)
    ? progressOverride.percentage
    : fallbackPercentage;
  return {
    pageIndex,
    totalPages,
    percentage,
    location: progressOverride.location ?? null,
  };
}

function shouldPersistLocalProgress(percentage) {
  if (!Number.isFinite(percentage)) return false;
  if (!Number.isFinite(lastSavedPercentage)) return true;
  return Math.abs(percentage - lastSavedPercentage) >= TIMING_CONFIG.LOCAL_SAVE_THRESHOLD_PERCENT;
}

function saveCurrentProgress(progressSnapshot = getProgressSnapshot()) {
  if (!currentBookId) return;

  let progressData = null;

  if (reader.type === BOOK_TYPES.EPUB) {
    const pageIndex = progressSnapshot.pageIndex;
    const total = progressSnapshot.totalPages;
    const locatorFromSnapshot = normalizeEpubLocation(progressSnapshot.location);
    const fallbackLocator =
      typeof reader.getPageLocator === "function" ? reader.getPageLocator(pageIndex) : null;
    const location = locatorFromSnapshot ?? fallbackLocator;
    const percentage = progressSnapshot.percentage;

    progressData = {
      percentage,
      location,
      // 読書環境も保存（EPUB用）
      writingMode,
      pageDirection,
      updatedAt: Date.now()
    };
  } else {
    // 画像書庫
    const index = progressSnapshot.pageIndex;
    const percentage = progressSnapshot.percentage;

    progressData = {
      percentage,
      location: index,
      // 画像書庫用の表示設定も保存
      imageViewMode: reader.imageViewMode,
      pageDirection: reader.imageReadingDirection,
      updatedAt: Date.now()
    };
  }

  if (!progressData || !shouldPersistLocalProgress(progressData.percentage)) return progressSnapshot;

  storage.setProgress(currentBookId, progressData);
  lastSavedPercentage = progressData.percentage;
  return progressSnapshot;
}

function shouldSyncCloudProgress(progressSnapshot) {
  if (!progressSnapshot || !currentBookId || !currentCloudBookId) return false;
  if (!syncLogic.isCloudSyncEnabled()) return false;
  const progress = storage.getProgress(currentBookId) ?? {};
  const lastSyncedPageIndex = Number.isFinite(progress.cloudSyncPageIndex) ? progress.cloudSyncPageIndex : null;
  const lastSyncedAt = progress.cloudSyncAt ?? 0;
  const pageDelta = lastSyncedPageIndex === null
    ? Number.POSITIVE_INFINITY
    : Math.abs(progressSnapshot.pageIndex - lastSyncedPageIndex);
  const timeDelta = Date.now() - lastSyncedAt;
  return pageDelta >= CLOUD_SYNC_PAGE_THRESHOLD || timeDelta >= getAutoSyncIntervalMs();
}

function updateCloudSyncSnapshot(progressSnapshot) {
  if (!progressSnapshot || !currentBookId) return;
  const existing = storage.getProgress(currentBookId) ?? {};
  storage.setProgress(currentBookId, {
    cloudSyncAt: Date.now(),
    cloudSyncPageIndex: progressSnapshot.pageIndex,
    cloudSyncPercentage: progressSnapshot.percentage,
    updatedAt: existing.updatedAt,
  });
}

async function requestCloudSyncIfNeeded(progressSnapshot) {
  if (!shouldSyncCloudProgress(progressSnapshot)) return;
  const authStatus = checkAuthStatus();
  if (!authStatus.authenticated) {
    syncAutoSyncPolicy(authStatus);
    return;
  }
  await pushCurrentBookSync();
}

// ========================================
// リーダーコントローラー初期化
// ========================================

const reader = new ReaderController({
  viewerId: "viewer",
  imageViewerId: "imageViewer",
  imageElementId: "pageImage",
  pageIndicatorId: "pageIndicator",
  onProgress: ({ location, percentage }) => {
    // reader.js は { location, percentage } を渡す。readerから現在値を取得して更新
    const progressSnapshot = getProgressSnapshot({ location, percentage });

    ui.updateProgress(progressSnapshot.pageIndex, progressSnapshot.totalPages);
    const savedSnapshot = saveCurrentProgress(progressSnapshot);
    requestCloudSyncIfNeeded(savedSnapshot);
  },
  onLoadingUpdate: (loadingInfo) => {
    // ローディング状態の更新をコンソールに記録
    // 将来的にUIに表示する場合はここで処理
    console.log('[ReaderController] Loading update:', loadingInfo);
  },
  onReady: (data) => {
    // 起動時の初期化関連
    if (data.metadata) {
      document.title = data.metadata.title
        ? `${data.metadata.title} - ${APP_INFO.NAME}`
        : APP_INFO.NAME;
    }
    // 進捗バーの向きを更新
    renderers.updateProgressBarDirection();
    handleBookReady(data);
  },
  onImageZoom: (isZoomed) => {
    if (isZoomed) {
      document.body.classList.add(UI_CLASSES.IS_ZOOMED);
    } else {
      document.body.classList.remove(UI_CLASSES.IS_ZOOMED);
    }
  },
});

reader.applyTheme(theme);
reader.applyReadingDirection(writingMode, pageDirection);

// ========================================
// CSS変数の注入 (SSOT)
// ========================================
function applyCssVariablesFromConfig() {
  const root = document.documentElement;
  const layout = READER_CONFIG.layout;

  if (layout) {
    if (layout.maxWidth) root.style.setProperty('--reader-max-width', layout.maxWidth);
    if (layout.textAlign) root.style.setProperty('--reader-text-align', layout.textAlign);
    if (layout.lineBreak) root.style.setProperty('--reader-line-break', layout.lineBreak);
    if (layout.wordBreak) root.style.setProperty('--reader-word-break', layout.wordBreak);
  }

  // SSOT: READER_CONFIG に合わせて表示用タイポグラフィを統一
  root.style.setProperty('--reader-line-height', `${READER_CONFIG.lineHeight}`);
  root.style.setProperty(
    '--reader-paragraph-margin',
    typeof READER_CONFIG.paragraphMarginEm === "number"
      ? `${READER_CONFIG.paragraphMarginEm}em`
      : READER_CONFIG.paragraphMarginEm
  );
  root.style.setProperty('--reader-orphans', `${READER_CONFIG.orphans}`);
  root.style.setProperty('--reader-widows', `${READER_CONFIG.widows}`);
}

// 初期化時に実行
applyCssVariablesFromConfig();

// ========================================
// UIコントローラー初期化
// ========================================

const createDebouncedHandler = (callback, delayMs) => {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      callback(...args);
    }, delayMs);
  };
};

const debouncedResizeHandler = createDebouncedHandler(() => {
  if (!reader.handleResize) return;
  console.log(`[onResize] handleResize (debounced ${TIMING_CONFIG.RESIZE_DEBOUNCE_MS}ms)`);
  reader.handleResize();
}, TIMING_CONFIG.RESIZE_DEBOUNCE_MS);

const ui = new UIController({
  isBookOpen: () => reader.book !== null || reader.imagePages.length > 0,
  isPageNavigationEnabled: () => true, // 常に有効（必要なら調整）
  isProgressBarAvailable: () => reader.type === BOOK_TYPES.EPUB || reader.type === BOOK_TYPES.ZIP || reader.type === BOOK_TYPES.RAR,
  isFloatVisible: () => elements.floatOverlay.classList.contains(UI_CLASSES.VISIBLE),

  // 追加: 画像/見開き判定用
  isImageBook: () => reader.type !== BOOK_TYPES.EPUB,
  isSpreadMode: () => reader.imageViewMode === IMAGE_VIEW_MODES.SPREAD,

  getReadingDirection: () => {
    // EPUBの場合は pageDirection (ltr/rtl)
    if (reader.type === BOOK_TYPES.EPUB) {
      return pageDirection;
    }
    // 画像書庫の場合は reader.imageReadingDirection
    return reader.imageReadingDirection;
  },

  onFloatToggle: () => {
    renderers.toggleFloatOverlay();
  },
  onResize: () => {
    // リサイズ時のリペジネーション (EPUBのみ)
    debouncedResizeHandler();
  },
  onLeftMenu: (action) => {
    if (action === 'show') {

    }
  },
  onProgressBar: (action) => {
    if (action === 'show') {
      const total = reader.pagination ? reader.pagination.pages.length : 0;
      ui.updateProgress(reader.currentPageIndex, total);
    }
  },
  onBookmarkMenu: (action) => {
    if (action === 'show') {

      renderers.renderBookmarks(bookmarkMenuMode);
      bookmarkMenuMode = UI_DEFAULTS.bookmarkMenuMode;
    }
  },
  onPagePrev: (step) => {

    reader.prev(step);
  },
  onPageNext: (step) => {

    reader.next(step);
  },
});

uiInitialized = true;

renderers.init({
  storage,
  reader,
  syncLogic,
  ui,
  state: {
    get currentBookId() { return currentBookId; },
    get currentBookInfo() { return currentBookInfo; },
    get currentCloudBookId() { return currentCloudBookId; },
    get pendingCloudBookId() { return pendingCloudBookId; },
    get uiLanguage() { return uiLanguage; },
    get progressDisplayMode() { return progressDisplayMode; },
    get floatVisible() { return floatVisible; },
    get pageDirection() { return pageDirection; },
    get bookmarkMenuMode() { return bookmarkMenuMode; },
    get pendingDeletes() { return pendingDeletes; },
    get writingMode() { return writingMode; },
    get theme() { return theme; },
  },
  actions: {
    checkAuthStatus,
    syncAutoSyncPolicy,
    openFromLibrary,
    openCloudOnlyBook,
    openFileDialog,
    closeModal,
    closeAllMenus: () => {
      if (ui) ui.closeAllMenus();
      closeExclusiveMenus();
    },
    scheduleAutoSyncPush,
    getEpubPaginationTotal: () => {
      if (reader.type !== BOOK_TYPES.EPUB || !reader.paginator) return null;
      return reader.paginator.isComplete ? reader.pagination?.pages?.length : null;
    },
    setPendingCloudBookId: (id) => { pendingCloudBookId = id; }
  }
});

applyUiLanguage(uiLanguage);

function setupViewerIframeClickBridge() {
  if (!elements.viewer || !elements.fullscreenReader) return;

  const handleIframeClick = (iframe, event) => {
    const rect = iframe.getBoundingClientRect();
    const x = rect.left + event.clientX;
    const y = rect.top + event.clientY;
    const area = ui.getClickArea(x, y, elements.fullscreenReader);
    ui.handleAreaClick(area, event);
  };

  const bindIframe = (iframe) => {
    if (!iframe || iframe.dataset.clickBridgeBound === "true") return;
    iframe.dataset.clickBridgeBound = "true";

    const attachClickListener = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        doc.addEventListener("click", (event) => handleIframeClick(iframe, event));
      } catch (error) {
        console.warn("Failed to attach iframe click bridge:", error);
      }
    };

    if (iframe.contentDocument?.readyState === "complete") {
      attachClickListener();
    } else {
      iframe.addEventListener("load", attachClickListener, { once: true });
    }
  };

  elements.viewer.querySelectorAll(DOM_SELECTORS.IFRAME).forEach(bindIframe);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.tagName === "IFRAME") {
          bindIframe(node);
          return;
        }
        node.querySelectorAll?.(DOM_SELECTORS.IFRAME).forEach(bindIframe);
      });
    });
  });

  observer.observe(elements.viewer, { childList: true, subtree: true });
}

setupViewerIframeClickBridge();

// 進捗バーのドラッグハンドラー
const progressBarHandler = new ProgressBarHandler({
  container: elements.progressBarPanel?.querySelector(DOM_SELECTORS.PROGRESS_TRACK),
  thumb: elements.progressThumb,
  getIsRtl: () => {
    if (currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR)) {
      return reader.imageReadingDirection === READING_DIRECTIONS.RTL;
    }
    if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
      return pageDirection === READING_DIRECTIONS.RTL;
    }
    return false;
  },
  onSeek: (percentage) => {
    // パーセンテージからページ位置を計算してジャンプ
    seekToPercentage(percentage);
  },
});

const floatProgressHandler = new ProgressBarHandler({
  container: elements.floatProgressTrack,
  thumb: elements.floatProgressThumb,
  getIsRtl: () => {
    if (currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR)) {
      return reader.imageReadingDirection === READING_DIRECTIONS.RTL;
    }
    if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
      return pageDirection === READING_DIRECTIONS.RTL;
    }
    return false;
  },
  onSeek: (percentage) => {
    seekToPercentage(percentage);
  },
});

// UI表示ロジックは renderers.js に移行済み

function handleToggleZoom() {
  // ズーム切替（toggleZoom()内部でbodyクラスも制御済み）
  reader.toggleZoom();
  renderers.updateZoomButtonLabel();
}

// ========================================
// 全画面切替
// ========================================

/**
 * ブラウザの全画面表示を切り替える
 * Fullscreen API を使用（F11相当）
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    // 全画面にする
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn('[toggleFullscreen] 全画面への切替に失敗しました:', err);
    });
  } else {
    // 全画面を解除する
    document.exitFullscreen().catch((err) => {
      console.warn('[toggleFullscreen] 全画面の解除に失敗しました:', err);
    });
  }
}

/**
 * 全画面ボタンのラベルを現在の全画面状態に合わせて更新する
 */
function updateFullscreenButtonLabel() {
  if (!elements.toggleFullscreen) return;
  const isFullscreen = !!document.fullscreenElement;
  elements.toggleFullscreen.textContent = isFullscreen
    ? UI_ICONS.FULLSCREEN_EXIT
    : UI_ICONS.FULLSCREEN_ENTER;
  elements.toggleFullscreen.title = isFullscreen
    ? t('fullscreenExitTitle')
    : t('fullscreenEnterTitle');
}

// 移行済み: updateSpreadModeButtonLabel, updateReadingDirectionButtonLabel, updateReadingDirectionEpubButtonLabel, updateZoomButtonLabel, updateProgressBarDirection

// 移行済み: updateAuthStatusDisplay, updateSyncStatusDisplay, updateFloatProgressBar

// ========================================
// ローディングオーバーレイ
// ========================================



// syncLogic.js に移行済み

// 移行済み: showCloudEmptyState, hideCloudEmptyState


// ========================================
// ファイル処理
// ========================================

async function handleFile(file) {
  clearArchiveWarnings();
  await pushCurrentBookSyncOnAction();
  showLoading();
  userOverrodeDirection = false;
  try {
    console.log(`Opening file: ${file.name}, type: ${file.type}, size: ${file.size}`);

    const buffer = await file.arrayBuffer();
    console.log(`File buffer loaded: ${buffer.byteLength} bytes`);

    // ファイルタイプを自動判別 (マジックナンバー優先)
    const type = fileHandler.detectFileType(buffer) || fileHandler.detectFileType(file);
    if (!type) {
      hideLoading();
      alert(t ? t('errorFileLoadFailed') : "対応していないファイル形式です。");
      return;
    }
    console.log(`Detected file type: ${type}`);

    const isArchiveBook = type === BOOK_TYPES.ZIP || type === BOOK_TYPES.RAR;
    const contentHash = isArchiveBook
      ? await fileHandler.buildArchiveFingerprint(file)
      : await fileHandler.hashBuffer(buffer); // EPUBは従来のコンテンツハッシュを継続使用
    // 移行方針: 既存のcontentHash一致を優先し、旧ID(短縮ハッシュ)一致なら旧IDを再利用して重複登録を防ぐ
    const existingRecord = fileHandler.findBookByContentHash(storage.data.library, contentHash);
    const id = existingRecord?.id ?? contentHash;
    const mime = fileHandler.guessMime(type, file);
    const source = storage.getSettings().source || 'local';

    console.log(`Saving file to storage with ID: ${id.substring(0, 12)}...`);
    await saveFile(id, buffer, { fileName: file.name, mime }, source);

    // type: "epub" | "zip" | "rar" として正式に保存
    const info = {
      id,
      title: fileHandler.fileTitle(file.name),
      type: type, // "epub" | "zip" | "rar"
      fileName: file.name,
      size: file.size,
      contentHash,
      lastOpened: Date.now(),
    };

    storage.upsertBook(info);
    currentBookId = id;
    currentBookInfo = info;
    resetLocalSaveTracking();

    let cloudBookId = pendingCloudBookId ?? storage.getCloudBookId(id);
    if (cloudBookId) {
      // 紐付け時（pendingCloudBookId がある場合）の照合チェック
      if (pendingCloudBookId && syncLogic.isCloudSyncEnabled()) {
        const cloudMeta = storage.data.cloudIndex?.[cloudBookId];
        if (cloudMeta && cloudMeta.fingerprints && !cloudMeta.fingerprints.includes(contentHash)) {
          const proceed = confirm(translate('linkMismatchWarning'));
          if (!proceed) {
            hideLoading();
            pendingCloudBookId = null;
            return;
          }
        }
      }
      storage.setBookLink(id, cloudBookId);
    }
    if (syncLogic.isCloudSyncEnabled()) {
      if (!cloudBookId) {
        try {
          const matchResult = await cloudSync.matchBook(contentHash, fileHandler.buildMatchMeta(info));
          if (matchResult?.cloudBookId) {
            cloudBookId = matchResult.cloudBookId;
          } else if (matchResult?.candidates?.length > 0) {
            cloudBookId = await syncLogic.promptSyncCandidate(matchResult.candidates);
          }
        } catch (error) {
          console.warn("クラウドの照合に失敗しました:", error);
        }
      }
      if (!cloudBookId) {
        cloudBookId = fileHandler.generateCloudBookId();
      }
      if (cloudBookId) {
        storage.setBookLink(id, cloudBookId);
        await fileHandler.upsertCloudIndexEntry(cloudBookId, info, contentHash, {
          storage,
          cloudSync,
          isCloudSyncEnabled: syncLogic.isCloudSyncEnabled,
          uiLanguage
        });
      }
    }
    pendingCloudBookId = null;
    currentCloudBookId = cloudBookId;

    const syncedProgress = await syncLogic.resolveSyncedProgress(id, uiLanguage, cloudBookId, pushCurrentBookSync);
    const startLocation = syncedProgress?.location;
    const startProgress = syncedProgress?.percentage;

    renderers.hideCloudEmptyState();

    // 1. ビューアの切り替えと初期表示設定
    if (!isArchiveBook) {
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.remove(UI_CLASSES.HIDDEN);
        elements.viewer.classList.add(UI_CLASSES.VISIBLE);
      }
      if (elements.fullscreenReader) {
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL);
      }
      showLoading();
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

      try {
        const fileToOpen = new File([new Uint8Array(buffer)], file.name, { type: mime });
        await reader.openEpub(fileToOpen, {
          location: startLocation,
          percentage: startProgress,
        });
      } finally {
        hideLoading();
      }
    } else {
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      await reader.openImageBook(
        new File([new Uint8Array(buffer)], file.name, { type: mime }),
        typeof startLocation === "number" ? startLocation : 0,
        type
      );
    }

    // 2. 状態の適用（オープン後に実行することで初期化による上書きを防ぐ）
    await applyReadingState(syncedProgress);

    // 同期されたしおりをUIに反映
    renderers.renderBookmarks(bookmarkMenuMode);

    console.log("Book opened successfully");
    hideLoading();
    renderers.renderLibrary();
    renderers.renderBookmarkMarkers();
    renderers.updateProgressBarDisplay();
    renderers.updateSearchButtonState();
    renderers.updateFloatingUIButtons();
    closeModal(elements.openFileModal);
    if (floatVisible) {
      toggleFloatOverlay(false);
    }
  } catch (error) {
    console.error("Error in handleFile:", error);
    console.error("Error stack:", error.stack);
    const resolvedCode = resolveErrorCode(error);
    if (resolvedCode) {
      error.code = error.code ?? resolvedCode;
    }

    // JSZipエラーは警告のみ（ファイルは正常に開ける可能性が高い）
    if (error.code === ERROR_CODES.JSZIP_WARNING) {
      console.warn("JSZip warning detected, but file may have opened successfully");
      // エラーダイアログを表示しない（ファイルが開けているため）
      hideLoading();
      return;
    }

    // より詳細なエラーメッセージ
    let userMessage = `${t('errorFileLoadFailed')}\n\n${t('errorFileName')}: ${file.name}\n${t('errorFileSize')}: ${(file.size / 1024 / 1024).toFixed(2)} MB\n\n`;

    if (error.code === ERROR_CODES.NO_IMAGES_FOUND) {
      userMessage += t('errorNoImagesFound');
    } else if (error.code === ERROR_CODES.IMAGE_LOAD_FAILED) {
      userMessage += t('errorImageLoadFailed');
    } else {
      userMessage += `${t('errorDetail')}: ${error.message}`;
    }

    hideLoading();
    alert(userMessage);
  }
}

function openCloudOnlyBook(cloudBookId) {
  const meta = storage.data.cloudIndex?.[cloudBookId];
  const state = storage.getCloudState(cloudBookId);
  currentBookId = null;
  currentBookInfo = null;
  currentCloudBookId = cloudBookId;
  resetLocalSaveTracking();

  if (elements.viewer) {
    elements.viewer.classList.add(UI_CLASSES.HIDDEN);
    elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
  }
  if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
  if (elements.emptyState) elements.emptyState.classList.remove(UI_CLASSES.HIDDEN);
  if (elements.progressBarPanel) elements.progressBarPanel.classList.add(UI_CLASSES.HIDDEN);
  if (elements.progressBarBackdrop) elements.progressBarBackdrop.classList.add(UI_CLASSES.HIDDEN);
  renderers.showCloudEmptyState({
    cloudBookId,
    title: meta?.title ?? t("cloudOnlyTitle"),
    progressPercentage: state?.progress ?? 0,
    lastTimestamp: state?.updatedAt ?? meta?.lastReadAt ?? meta?.updatedAt ?? 0,
  });
  renderers.updateProgressBarDisplay();
  renderers.updateSearchButtonState();
  closeModal(elements.openFileModal);
  if (floatVisible) {
    toggleFloatOverlay(false);
  }
}

async function openFromLibrary(bookId, options = {}) {
  clearArchiveWarnings();
  await pushCurrentBookSyncOnAction();
  showLoading();
  // ★追加: UI描画更新のために少し待機
  await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

  try {

    userOverrodeDirection = false;
    const source = storage.getSettings().source || 'local';
    const record = await loadFile(bookId, source);

    if (!record) {
      const cloudBookId = storage.getCloudBookId(bookId);
      if (cloudBookId) {
        openCloudOnlyBook(cloudBookId);
        return;
      }
      alert("保存済みファイルが見つかりません。再度アップロードしてください。");
      return;
    }

    const file = bufferToFile(record);
    const info = storage.data.library[bookId];
    if (!info) return;

    currentBookId = bookId;
    currentBookInfo = info;
    resetLocalSaveTracking();
    currentCloudBookId = storage.getCloudBookId(bookId);
    if (syncLogic.isCloudSyncEnabled() && !currentCloudBookId && info?.contentHash) {
      try {
        const matchResult = await cloudSync.matchBook(info.contentHash, fileHandler.buildMatchMeta(info));
        if (matchResult?.cloudBookId) {
          currentCloudBookId = matchResult.cloudBookId;
          storage.setBookLink(bookId, currentCloudBookId);
        }
      } catch (error) {
        console.warn("クラウドの照合に失敗しました:", error);
      }
    }
    if (currentCloudBookId) {
      await fileHandler.upsertCloudIndexEntry(currentCloudBookId, info, info.contentHash, {
        storage,
        cloudSync,
        isCloudSyncEnabled: syncLogic.isCloudSyncEnabled,
        uiLanguage,
        overrides: { lastReadAt: Date.now() }
      });
    }

    const bookmarks = storage.getBookmarks(bookId);
    const progress = await syncLogic.resolveSyncedProgress(bookId, uiLanguage, currentCloudBookId, pushCurrentBookSync);
    const normalizedProgress = normalizeProgressSnapshot(progress, info.type);
    await applyReadingState(normalizedProgress);
    const explicitBookmark = options.bookmark;
    const startFromBookmark = explicitBookmark?.location ?? (options.useBookmark ? bookmarks[0]?.location : undefined);
    const start = startFromBookmark ?? normalizedProgress?.location;
    const startProgress = explicitBookmark?.percentage ?? normalizedProgress?.percentage;

    // 【修正】読み込み時にタイプを再判定（DB内の情報の誤りを補正）
    const detectedType = fileHandler.detectFileType(record.buffer);
    if (detectedType && detectedType !== info.type) {
      console.log(`タイプミスマッチを検出: ${info.type} -> ${detectedType}`);
      info.type = detectedType;
      storage.upsertBook(info);
    }

    renderers.hideCloudEmptyState();
    // isImageBook: zip または rar の場合
    const isImageBook = info.type === BOOK_TYPES.ZIP || info.type === BOOK_TYPES.RAR;
    if (!isImageBook) {
      // ... (既存のUI制御コード)
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.remove(UI_CLASSES.HIDDEN);
        elements.viewer.classList.add(UI_CLASSES.VISIBLE);
      }
      if (elements.fullscreenReader) {
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL);
      }

      showLoading();
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));
      await reader.openEpub(file, { location: start, percentage: startProgress });
    } else {
      // ... (既存のUI制御コード)
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      await reader.openImageBook(file, typeof start === "number" ? start : 0, info.type);
    }

    // [修正] オープン処理の後に状態を再適用
    if (normalizedProgress) {
      await applyReadingState(normalizedProgress);
    }

    storage.addHistory(bookId);
    renderers.renderBookmarkMarkers();
    renderers.updateProgressBarDisplay();
    renderers.updateSearchButtonState();
    renderers.updateFloatingUIButtons();
    closeModal(elements.openFileModal);
    if (floatVisible) {
      toggleFloatOverlay(false);
    }
  } catch (error) {
    console.error(error);
    alert(`ライブラリからの読み込みに失敗しました:\n\n${error.message}`);
  } finally {
    hideLoading();
  }
}




// ========================================
// 進捗管理
// ========================================

function persistReadingState(update) {
  if (!currentBookId) return;
  const existing = storage.getProgress(currentBookId) ?? {};
  storage.setProgress(currentBookId, { ...existing, ...update });
}

function resetLocalSaveTracking() {
  lastSavedPercentage = null;
}

async function applyReadingState(progress) {
  // 書籍ごとの記録がない場合はデフォルト設定を使用
  const targetWritingMode = progress?.writingMode || defaultWritingMode;
  const targetPageDirection = progress?.pageDirection || defaultPageDirection;
  const targetImageViewMode = progress?.imageViewMode || defaultImageViewMode;

  // 1. 書字方向・開き方向の復元
  writingMode = targetWritingMode;
  if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;

  pageDirection = targetPageDirection;
  if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;

  // 1.5. 両方を適用（リーダー本体への反映）
  await applyReadingSettings(writingMode, pageDirection);

  // 2. 表示モード（単ページ/見開き）の復元
  if (reader) {
    reader.imageViewMode = targetImageViewMode;
    renderers.updateSpreadModeButtonLabel();
  }

  // 2.5. 画像書庫の開き方向の復元
  // 画像書庫では pageDirection を imageReadingDirection として復元
  if (reader && reader.type !== BOOK_TYPES.EPUB) {
    reader.setImageReadingDirection(targetPageDirection);
    renderers.updateReadingDirectionButtonLabel();
    renderers.updateProgressBarDirection();
  }

  if (!progress) {
    // 新規書籍でも初期状態の表示を更新
    renderers.updateProgressBarDisplay();
    return;
  }

  // 3. テーマ・フォント等の復元
  if (progress.theme && progress.theme !== theme) {
    applyTheme(progress.theme);
  }
  if (Number.isFinite(progress.fontSize) && progress.fontSize !== fontSize) {
    applyFontSize(progress.fontSize);
  }
  if (progress.uiLanguage && progress.uiLanguage !== uiLanguage) {
    applyUiLanguage(progress.uiLanguage);
  }

  if (Number.isFinite(progress.percentage)) {
    lastSavedPercentage = progress.percentage;
  }

  // 最後に表示を確実に更新（しおりマーカー等）
  renderers.updateProgressBarDisplay();
}

function handleProgress(progress) {
  if (!currentBookId) return;

  const roundedPercentage = roundProgressPercentage(progress?.percentage);
  if (shouldPersistLocalProgress(roundedPercentage)) {
    storage.setProgress(currentBookId, {
      ...progress,
      percentage: roundedPercentage,
      writingMode,
      fontSize,
      theme,
      uiLanguage,
      pageDirection,
      imageViewMode: reader?.imageViewMode,
    });
    lastSavedPercentage = roundedPercentage;
  }
  renderers.updateProgressBarDisplay();
}

function getEpubPaginationTotal() {
  const totalPages = reader.pagination?.pages?.length;
  if (totalPages) return totalPages;
  const totalLocations = reader.book?.locations?.total;
  if (totalLocations) return totalLocations;
  return null;
}

// 移行済み: updateProgressBarDisplay, renderBookmarkMarkers, renderFloatBookmarkMarkers

async function seekToPercentage(percentage) {
  if (!currentBookId || !currentBookInfo) return;

  if (currentBookInfo.type === BOOK_TYPES.EPUB) {
    // EPUBの場合はlocation（CFI）ベースでシーク
    console.log(`Seeking to ${percentage}%`);

    try {
      if (reader.usingPaginator && reader.pagination?.pages?.length) {
        const totalPages = reader.pagination.pages.length;
        const pageIndex = Math.max(0, Math.min(Math.round((percentage / 100) * totalPages) - 1, totalPages - 1));
        if (reader.pageController) {
          reader.pageController.goTo(pageIndex);
        } else {
          reader.renderEpubPage(pageIndex);
        }
        // UI側の進捗表示を即時更新
        ui.updateProgress(pageIndex, totalPages);
        return;
      }
      console.warn('Locations not generated yet');
    } catch (error) {
      console.error('Error seeking to percentage:', error);
    }
  } else {
    // 画像書籍の場合はページ数でシーク
    const totalPages = reader.imagePages?.length || 1;
    const pageIndex = Math.max(0, Math.min(Math.round((percentage / 100) * (totalPages - 1)), totalPages - 1));
    reader.goTo(pageIndex);
  }
}

function handleBookReady(payload) {
  if (!currentBookInfo || !payload) return;

  const metadata = payload.metadata ?? payload;
  const toc = Array.isArray(payload.toc) ? payload.toc : [];
  currentToc = toc;

  // 方向判定とUI更新
  // 方向判定とUI更新
  if (currentBookInfo.type === BOOK_TYPES.EPUB) {
    const settings = storage.getSettings();
    const progress = storage.getProgress(currentBookId);

    // 優先順位: 1. 個別保存設定 > 2. メタデータ > 3. ユーザーデフォルト
    let targetPageDirection = progress?.pageDirection;
    let targetWritingMode = progress?.writingMode;

    // 1. 個別設定がない場合、メタデータをチェック
    if (!targetPageDirection && metadata.direction) {
      targetPageDirection = metadata.direction;
    }

    // 2. まだ決まっていない場合、デフォルト設定を使用
    if (!targetPageDirection) {
      targetPageDirection = settings.defaultPageDirection;
    }
    if (!targetWritingMode) {
      targetWritingMode = settings.defaultWritingMode;
    }

    // 適用（ユーザーによる一時的な変更フラグがある場合は無視...しないほうが良いかも？
    // ユーザーが「今」変更したならそれが最優先だが、userOverrodeDirection はどういうスコープ？
    // handleBookReady は本を開いた直後に来るはず。

    if (!userOverrodeDirection) {
      pageDirection = targetPageDirection;
      writingMode = targetWritingMode || writingMode;

      if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;
      if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;

      applyReadingSettings(writingMode, pageDirection);
    }

    renderers.updateProgressBarDirection(); // 進捗バーの方向更新
  }

  const title = metadata.title || currentBookInfo.title;
  currentBookInfo.title = title;
  storage.upsertBook({ ...currentBookInfo, title });
  if (currentCloudBookId) {
    const author = metadata.creator || metadata.author || "";
    fileHandler.upsertCloudIndexEntry(currentCloudBookId, currentBookInfo, currentBookInfo?.contentHash, {
      storage,
      cloudSync,
      isCloudSyncEnabled: syncLogic.isCloudSyncEnabled,
      uiLanguage,
      overrides: {
        title,
        author,
      },
    }).catch((error) => {
      console.warn("クラウドメタデータの更新に失敗しました:", error);
    });
  }
  renderers.renderLibrary();
  renderers.renderToc(currentToc);

  // EPUBスクロールモードのクラスを設定（横書きのみ縦スクロール）
  const scheduleEpubScrollModeUpdate = (attempt = 0) => {
    if (reader?.writingMode != null) {
      renderers.updateEpubScrollMode();
      return;
    }
    if (attempt >= 5) {
      console.warn("[handleBookReady] Writing mode not resolved, skipping epub-scroll update");
      return;
    }
    setTimeout(() => scheduleEpubScrollModeUpdate(attempt + 1), TIMING_CONFIG.SCROLL_MODE_UPDATE_DELAY_MS);
  };
  scheduleEpubScrollModeUpdate();

  // locations生成完了時に進捗バーを更新
  if (currentBookInfo.type === BOOK_TYPES.EPUB) {
    console.log('[handleBookReady] Setting up locations listener for progress updates');
    // locations生成完了を監視
    const checkLocations = setInterval(() => {
      const locations = reader.book?.locations;
      if (locations?.total > 0) {
        console.log('[handleBookReady] Locations available, updating progress bar');
        clearInterval(checkLocations);
        renderers.updateProgressBarDisplay();
      }
    }, TIMING_CONFIG.LOCATIONS_CHECK_INTERVAL_MS);

    // ロケーション確認タイムアウト
    setTimeout(() => {
      clearInterval(checkLocations);
      console.log('[handleBookReady] Locations check timeout');
    }, TIMING_CONFIG.LOCATIONS_CHECK_TIMEOUT_MS);

  }
}

// 移行済み: updateEpubScrollMode

// ========================================
// 目次管理
// ========================================

// 移行済み: renderToc, renderTocEntries

// ========================================
// しおり管理
// ========================================

// 移行済み: renderBookmarks

function addBookmark() {
  if (!currentBookId) {
    alert(t("openBookPrompt"));
    return;
  }

  const deviceSettings = storage.getSettings();
  const bookmark = reader.addBookmark(t("bookmarkDefault"), {
    deviceId: deviceSettings.deviceId,
    deviceColor: deviceSettings.deviceColor,
  });
  if (bookmark) {
    storage.addBookmark(currentBookId, bookmark);
    renderers.renderBookmarks(bookmarkMenuMode);
    renderers.renderBookmarkMarkers();

    requestCloudSyncIfNeeded(getProgressSnapshot());
  }
}

// ========================================
// ライブラリ・履歴
// ========================================

// 移行済み: renderLibrary, filterLibraryCards

// 移行済み: renderHistory

// ========================================
// テキスト検索（EPUB用）
// ========================================

async function performSearch(query) {
  if (!query || !currentBookId || currentBookInfo?.type !== BOOK_TYPES.EPUB || !reader.book) {
    return [];
  }

  if (elements.searchResults) {
    elements.searchResults.innerHTML = `<div class="search-loading">${t("searchLoading")}</div>`;
  }

  try {
    const searchResults = [];
    const spine = reader.book.spine;
    const locations = reader.book.locations;

    // 各セクションを検索
    for (let i = 0; i < spine.length; i++) {
      const item = spine.get(i);

      try {
        // セクションを読み込む
        await item.load(reader.book.load.bind(reader.book));

        const doc = item.document || item.contents?.document;
        if (!doc) continue;

        // テキストコンテンツを取得
        const textContent = doc.body?.textContent || '';

        // 検索クエリが含まれているか確認（大文字小文字を区別しない）
        const lowerQuery = query.toLowerCase();
        const lowerText = textContent.toLowerCase();

        if (lowerText.includes(lowerQuery)) {
          // マッチした位置を全て取得
          let index = 0;
          const matches = [];

          while (index < lowerText.length && matches.length < 5) { // 各セクションで最大5件
            const matchIndex = lowerText.indexOf(lowerQuery, index);
            if (matchIndex === -1) break;

            // 前後のコンテキストを取得（50文字ずつ）
            const start = Math.max(0, matchIndex - 50);
            const end = Math.min(textContent.length, matchIndex + query.length + 50);
            let excerpt = textContent.substring(start, end);

            // 改行を削除して整形
            excerpt = excerpt.replace(/\s+/g, ' ').trim();

            matches.push({
              excerpt,
              matchIndex,
            });

            index = matchIndex + query.length;
          }

          // 結果を追加
          for (const match of matches) {
            // CFIを生成（セクションの開始位置を使用）
            const cfi = item.cfiBase;
            const spineItem = reader.spineItems?.[i];
            const segmentIndex = reader.computeSegmentIndexForTextOffset(
              spineItem?.htmlString,
              match.matchIndex
            );

            // パーセンテージを計算
            let percentage = 0;
            if (locations && locations.length > 0) {
              const sectionPercentage = locations.percentageFromCfi(cfi);
              percentage = Math.round(sectionPercentage * 100);
            } else {
              // locationsが利用できない場合は、spine内の位置で概算
              percentage = Math.round((i / spine.length) * 100);
            }

            searchResults.push({
              cfi,
              excerpt: match.excerpt,
              query,
              sectionLabel: item.href,
              percentage,
              sectionIndex: i,
              spineIndex: i,
              segmentIndex,
            });
          }
        }

        // メモリリークを防ぐためにセクションをアンロード
        item.unload();

      } catch (error) {
        console.warn(`Failed to search in section ${item.href}:`, error);
      }
    }

    return searchResults;
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
}

// 移行済み: renderSearchResults

// ========================================
// モーダル制御
// ========================================

function isModalVisible(modal) {
  if (!modal) return false;
  if (modal.classList.contains(UI_CLASSES.BOOKMARK_MENU)) {
    return modal.classList.contains(UI_CLASSES.VISIBLE);
  }
  return !modal.classList.contains(UI_CLASSES.HIDDEN);
}

function openModal(modal) {
  if (!modal) return;
  // floatOverlay(blur) がモーダルより前面に残るのを防ぐ
  renderers.toggleFloatOverlay(false);
  if (elements.modalOverlay && modal.parentElement !== elements.modalOverlay) {
    elements.modalOverlay.appendChild(modal);
  }
  if (elements.modalOverlay) {
    elements.modalOverlay.classList.add(UI_CLASSES.VISIBLE);
  }
  if (modal.classList.contains(UI_CLASSES.BOOKMARK_MENU)) {
    modal.classList.add(UI_CLASSES.VISIBLE);
    ui.bookmarkMenuVisible = true;
  } else {
    modal.classList.remove(UI_CLASSES.HIDDEN);
  }

}

function closeModal(modal) {
  if (!modal) return;
  if (modal.classList.contains(UI_CLASSES.BOOKMARK_MENU)) {
    modal.classList.remove(UI_CLASSES.VISIBLE);
    ui.bookmarkMenuVisible = false;
  } else {
    modal.classList.add(UI_CLASSES.HIDDEN);
  }
  if (!elements.modalOverlay) return;
  const hasVisibleModal = Array.from(elements.modalOverlay.children).some((child) => {
    if (!(child instanceof HTMLElement)) return false;
    return isModalVisible(child);
  });
  if (!hasVisibleModal) {
    elements.modalOverlay.classList.remove(UI_CLASSES.VISIBLE);
  }
}

function closeExclusiveMenus() {
  closeModal(elements.bookmarkMenu);
  closeModal(elements.historyModal);
  closeModal(elements.searchModal);
  closeModal(elements.settingsModal);
  closeModal(elements.openFileModal);
  closeModal(elements.tocModal);
}

function openExclusiveMenu(modal) {
  closeExclusiveMenus();
  openModal(modal);
}

function openImageModal(src) {
  if (elements.modalImage) {
    elements.modalImage.src = src;
  }
  openModal(elements.imageModal);
}

// ========================================
// 設定
// ========================================

function applyTheme(newTheme) {
  theme = newTheme;
  document.body.dataset.theme = theme;
  reader.applyTheme(theme);
  storage.setSettings({ theme });
  persistReadingState({ theme });
  renderers.updateThemeToggleIcon();
  requestCloudSyncIfNeeded(getProgressSnapshot());
}

// 移行済み: updateThemeToggleIcon

function applyFontSize(nextSize) {
  if (!Number.isFinite(nextSize)) return;
  const clamped = Math.min(READER_CONFIG.FONT_SIZE_MAX, Math.max(READER_CONFIG.FONT_SIZE_MIN, Math.round(nextSize)));
  fontSize = clamped;
  reader.applyFontSize(fontSize);
  storage.setSettings({ fontSize });
  persistReadingState({ fontSize });
  requestCloudSyncIfNeeded(getProgressSnapshot());
}

function applyUiLanguage(nextLanguage) {
  if (!nextLanguage) return;
  uiLanguage = nextLanguage;
  storage.setSettings({ uiLanguage });
  document.documentElement.lang = uiLanguage === "en" ? "en" : "ja";
  elements.langJa?.classList.toggle(UI_CLASSES.ACTIVE, uiLanguage === "ja");
  elements.langEn?.classList.toggle(UI_CLASSES.ACTIVE, uiLanguage === "en");
  if (elements.langIcon) {
    elements.langIcon.src = uiLanguage === "ja" ? ASSET_PATHS.FLAG_JAPAN : ASSET_PATHS.FLAG_AMERICA;
  }
  persistReadingState({ uiLanguage });
  requestCloudSyncIfNeeded(getProgressSnapshot());

  const strings = getUiStrings(nextLanguage);
  document.title = strings.documentTitle;
  const appIconAlt = strings.appIconAlt ?? strings.documentTitle;
  if (elements.emptyStateIcon) elements.emptyStateIcon.alt = appIconAlt;
  if (elements.menuTitleImage) elements.menuTitleImage.alt = appIconAlt;
  if (elements.floatTitleImage) elements.floatTitleImage.alt = appIconAlt;
  if (elements.pageImage) elements.pageImage.alt = strings.pageImageAlt;
  if (elements.modalImage) elements.modalImage.alt = strings.modalImageAlt;
  const emptyTitle = elements.emptyState?.querySelector(DOM_SELECTORS.EMPTY_STATE_TITLE);
  const emptyDescription = elements.emptyState?.querySelector(DOM_SELECTORS.EMPTY_STATE_DESCRIPTION);
  if (emptyTitle) emptyTitle.textContent = strings.emptyTitle;
  if (emptyDescription) emptyDescription.textContent = strings.emptyDescription;
  if (elements.cloudAttachButton) elements.cloudAttachButton.textContent = strings.libraryAttachFile;
  if (elements.loadingText) elements.loadingText.textContent = strings.loadingText;
  if (!currentBookId && currentCloudBookId) {
    const meta = storage.data.cloudIndex?.[currentCloudBookId];
    const state = storage.getCloudState(currentCloudBookId);
    renderers.showCloudEmptyState({
      cloudBookId: currentCloudBookId,
      title: meta?.title ?? strings.cloudOnlyTitle,
      progressPercentage: state?.progress ?? 0,
      lastTimestamp: state?.updatedAt ?? meta?.lastReadAt ?? meta?.updatedAt ?? 0,
    });
  }

  const setMenuLabel = (button, icon, text) => {
    const iconSpan = button?.querySelector(DOM_SELECTORS.MENU_ICON);
    if (iconSpan) iconSpan.textContent = icon;
    const label = button?.querySelector(DOM_SELECTORS.MENU_LABEL);
    if (label) label.textContent = text;
  };
  const setIconOnly = (button, icon) => {
    if (!button) return;
    button.textContent = icon;
  };
  const setFloatLabel = (button, icon, text) => {
    if (!button) return;
    button.textContent = `${icon} ${text}`;
  };
  setMenuLabel(elements.menuOpen, UI_ICONS.MENU_OPEN, strings.menuOpen);
  setMenuLabel(elements.menuLibrary, UI_ICONS.MENU_LIBRARY, strings.menuLibrary);
  setMenuLabel(elements.menuSearch, UI_ICONS.MENU_SEARCH, strings.menuSearch);
  setMenuLabel(elements.menuBookmarks, UI_ICONS.MENU_BOOKMARKS, strings.menuBookmarks);
  setMenuLabel(elements.menuHistory, UI_ICONS.MENU_HISTORY, strings.menuHistory);
  setMenuLabel(elements.menuSettings, UI_ICONS.SETTINGS, strings.menuSettings);
  if (elements.langJa) elements.langJa.textContent = strings.languageLabelJa;
  if (elements.langEn) elements.langEn.textContent = strings.languageLabelEn;
  if (elements.floatLangJaImg) elements.floatLangJaImg.alt = strings.languageOptionJa;
  if (elements.floatLangEnImg) elements.floatLangEnImg.alt = strings.languageOptionEn;
  setFloatLabel(elements.floatOpen, UI_ICONS.MENU_OPEN, strings.menuOpen);
  setFloatLabel(elements.floatLibrary, UI_ICONS.MENU_LIBRARY, strings.menuLibrary);
  setFloatLabel(elements.floatSearch, UI_ICONS.MENU_SEARCH, strings.menuSearch);
  setFloatLabel(elements.floatBookmarks, UI_ICONS.MENU_BOOKMARKS, strings.menuBookmarks);
  setFloatLabel(elements.floatHistory, UI_ICONS.MENU_HISTORY, strings.menuHistory);

  if (elements.openToc) elements.openToc.textContent = strings.tocButton;
  if (elements.tocSectionTitle) elements.tocSectionTitle.textContent = strings.tocTitle;
  if (elements.floatSettings) {
    elements.floatSettings.textContent = UI_ICONS.SETTINGS;
    elements.floatSettings.setAttribute("aria-label", strings.menuSettings);
  }
  if (elements.openLangMenu) {
    elements.openLangMenu.textContent = UI_ICONS.LANGUAGE;
    elements.openLangMenu.setAttribute("aria-label", strings.languageMenuLabel);
  }
  if (elements.bookmarkMenuTitle) elements.bookmarkMenuTitle.textContent = strings.bookmarkTitle;
  if (elements.addBookmarkBtn) {
    elements.addBookmarkBtn.textContent = `${UI_ICONS.ADD} ${strings.addBookmark}`;
  }
  if (elements.searchModalTitle) elements.searchModalTitle.textContent = strings.searchTitle;
  if (elements.searchInput) elements.searchInput.placeholder = strings.searchPlaceholder;
  if (elements.searchBtn) {
    elements.searchBtn.textContent = `${UI_ICONS.MENU_SEARCH} ${strings.searchButton}`;
  }
  if (elements.tocModalTitle) elements.tocModalTitle.textContent = strings.tocTitle;
  if (elements.syncModalTitle) elements.syncModalTitle.textContent = strings.syncPromptTitle;
  if (elements.syncModalMessage) elements.syncModalMessage.textContent = strings.syncPromptMessage;
  if (elements.syncUseRemote) {
    elements.syncUseRemote.textContent = strings.syncPromptRemote.replace("{time}", "--");
  }
  if (elements.syncUseLocal) elements.syncUseLocal.textContent = strings.syncPromptLocal;
  if (elements.candidateModalTitle) elements.candidateModalTitle.textContent = strings.candidateModalTitle;
  if (elements.candidateModalMessage) {
    elements.candidateModalMessage.innerHTML = strings.candidateModalMessage.replace(/\n/g, "<br>");
  }
  if (elements.candidateUseLocal) elements.candidateUseLocal.textContent = strings.candidateUseLocal;
  setIconOnly(elements.closeBookmarkMenu, UI_ICONS.CLOSE);
  setIconOnly(elements.closeSearchModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeTocModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeFileModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeHistoryModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeSettingsModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeImageModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeCandidateModal, UI_ICONS.CLOSE);
  if (elements.closeCandidateModal) {
    elements.closeCandidateModal.setAttribute("aria-label", strings.closeButtonLabel);
  }
  if (elements.openFileModalTitle) elements.openFileModalTitle.textContent = strings.openFileTitle;
  if (archiveWarningTypes.length > 0) {
    renderers.showArchiveWarnings(archiveWarningTypes);
  }
  if (elements.librarySectionTitle) elements.librarySectionTitle.textContent = strings.librarySectionTitle;
  if (elements.libraryViewGrid) {
    elements.libraryViewGrid.setAttribute("aria-label", strings.libraryViewGridLabel);
  }
  if (elements.libraryViewList) {
    elements.libraryViewList.setAttribute("aria-label", strings.libraryViewListLabel);
  }
  if (elements.librarySearchInput) {
    elements.librarySearchInput.placeholder = strings.library_search_placeholder;
  }
  if (elements.historyModalTitle) elements.historyModalTitle.textContent = strings.historyTitle;
  if (elements.settingsModalTitle) elements.settingsModalTitle.textContent = strings.settingsTitle;
  if (elements.settingsDisplayTitle) elements.settingsDisplayTitle.textContent = strings.settingsDisplayTitle;
  if (elements.settingsDeviceTitle) elements.settingsDeviceTitle.textContent = strings.settingsDeviceTitle;
  if (elements.settingsDefaultWritingModeLabel) {
    elements.settingsDefaultWritingModeLabel.textContent = strings.settingsDefaultWritingModeLabel;
  }
  if (elements.settingsDefaultPageDirectionLabel) {
    elements.settingsDefaultPageDirectionLabel.textContent = strings.settingsDefaultPageDirectionLabel;
  }
  if (elements.settingsDefaultImageViewModeLabel) {
    elements.settingsDefaultImageViewModeLabel.textContent = strings.settingsDefaultImageViewModeLabel;
  }
  if (elements.themeLabel) elements.themeLabel.textContent = strings.themeLabel;
  if (elements.writingModeLabel) elements.writingModeLabel.textContent = strings.writingModeLabel;
  if (elements.pageDirectionLabel) elements.pageDirectionLabel.textContent = strings.pageDirectionLabel;
  if (elements.progressDisplayModeLabel) elements.progressDisplayModeLabel.textContent = strings.progressDisplayModeLabel;
  if (elements.deviceIdLabel) elements.deviceIdLabel.textContent = strings.deviceIdLabel;
  if (elements.deviceColorLabel) elements.deviceColorLabel.textContent = strings.deviceColorLabel;
  if (elements.deviceNameLabel) elements.deviceNameLabel.textContent = strings.deviceNameLabel;

  // デバイス情報の値をセット
  const deviceSettings = storage.getSettings();
  if (elements.deviceIdInput && deviceSettings.deviceId) {
    elements.deviceIdInput.value = deviceSettings.deviceId;
  }
  if (elements.deviceColorInput && deviceSettings.deviceColor) {
    elements.deviceColorInput.value = deviceSettings.deviceColor;
  }
  if (elements.deviceNameInput) {
    // storage.js の getDeviceInfo を使用
    elements.deviceNameInput.value = typeof getDeviceInfo === "function" ? getDeviceInfo() : "Unknown";
  }
  renderNotionSettingsStatus();

  if (elements.settingsAccountTitle) elements.settingsAccountTitle.textContent = strings.settingsAccountTitle;
  if (elements.settingsNotionTitle) elements.settingsNotionTitle.textContent = strings.settingsNotionTitle;
  if (elements.googleLoginButton) elements.googleLoginButton.textContent = strings.googleLoginLabel;
  if (elements.manualSyncButton) elements.manualSyncButton.textContent = strings.syncNowButton;
  if (elements.syncHint) elements.syncHint.textContent = strings.syncHint;
  if (elements.notionStatusLabel) elements.notionStatusLabel.textContent = strings.notionStatusLabel;
  if (elements.notionOauthUrlLabel) elements.notionOauthUrlLabel.textContent = strings.notionOauthUrlLabel;
  if (elements.notionWorkspaceLabel) elements.notionWorkspaceLabel.textContent = strings.notionWorkspaceLabel;
  if (elements.notionParentPageLabel) elements.notionParentPageLabel.textContent = strings.notionParentPageLabel;
  if (elements.notionDatabaseLabel) elements.notionDatabaseLabel.textContent = strings.notionDatabaseLabel;
  if (elements.notionConnectButton) elements.notionConnectButton.textContent = strings.notionConnectButton;
  if (elements.notionDisconnectButton) elements.notionDisconnectButton.textContent = strings.notionDisconnectButton;
  if (elements.notionHelpText) {
    elements.notionHelpText.textContent = tReplace(
      "notionHelpText",
      { url: getNotionUrlSample() },
      uiLanguage,
    );
  }
  if (elements.settingsFirebaseTitle) elements.settingsFirebaseTitle.textContent = strings.settingsFirebaseTitle;
  if (elements.firebaseApiKeyLabel) elements.firebaseApiKeyLabel.textContent = strings.firebaseApiKeyLabel;
  if (elements.firebaseAuthDomainLabel) {
    elements.firebaseAuthDomainLabel.textContent = strings.firebaseAuthDomainLabel;
  }
  if (elements.firebaseProjectIdLabel) elements.firebaseProjectIdLabel.textContent = strings.firebaseProjectIdLabel;
  if (elements.firebaseStorageBucketLabel) {
    elements.firebaseStorageBucketLabel.textContent = strings.firebaseStorageBucketLabel;
  }
  if (elements.firebaseMessagingSenderIdLabel) {
    elements.firebaseMessagingSenderIdLabel.textContent = strings.firebaseMessagingSenderIdLabel;
  }
  if (elements.firebaseAppIdLabel) elements.firebaseAppIdLabel.textContent = strings.firebaseAppIdLabel;
  if (elements.firebaseMeasurementIdLabel) {
    elements.firebaseMeasurementIdLabel.textContent = strings.firebaseMeasurementIdLabel;
  }
  if (elements.syncStatus) {
    renderers.updateSyncStatusDisplay();
  }
  if (elements.settingsDataTitle) elements.settingsDataTitle.textContent = strings.settingsDataTitle;
  if (elements.exportDataBtn) elements.exportDataBtn.textContent = strings.exportData;
  if (elements.importDataLabel) {
    const input = elements.importDataLabel.querySelector(DOM_SELECTORS.IMPORT_DATA_INPUT);
    elements.importDataLabel.textContent = strings.importData;
    if (input) {
      elements.importDataLabel.appendChild(input);
    }
  }

  if (elements.themeSelect) {
    const options = elements.themeSelect.options;
    if (options[0]) options[0].textContent = strings.themeDark;
    if (options[1]) options[1].textContent = strings.themeLight;
  }
  if (elements.writingModeSelect) {
    const options = elements.writingModeSelect.options;
    if (options[0]) options[0].textContent = strings.writingModeHorizontal;
    if (options[1]) options[1].textContent = strings.writingModeVertical;
  }
  if (elements.pageDirectionSelect) {
    const options = elements.pageDirectionSelect.options;
    if (options[0]) options[0].textContent = strings.pageDirectionLtr;
    if (options[1]) options[1].textContent = strings.pageDirectionRtl;
  }
  if (elements.progressDisplayModeSelect) {
    const options = elements.progressDisplayModeSelect.options;
    if (options[0]) options[0].textContent = strings.progressDisplayPage;
    if (options[1]) options[1].textContent = strings.progressDisplayPercentage;
  }
  if (elements.settingsDefaultWritingMode) {
    const options = elements.settingsDefaultWritingMode.options;
    if (options[0]) options[0].textContent = strings.writingModeHorizontal; // "横書き"
    if (options[1]) options[1].textContent = strings.writingModeVertical;   // "縦書き"
    elements.settingsDefaultWritingMode.value = defaultWritingMode;
  }
  if (elements.settingsDefaultPageDirection) {
    const options = elements.settingsDefaultPageDirection.options;
    if (options[0]) options[0].textContent = strings.pageDirectionRtl; // "右開き"
    if (options[1]) options[1].textContent = strings.pageDirectionLtr; // "左開き"
    elements.settingsDefaultPageDirection.value = defaultPageDirection;
  }
  if (elements.settingsDefaultImageViewMode) {
    const options = elements.settingsDefaultImageViewMode.options;
    if (options[0]) options[0].textContent = strings.spreadModeSingle; // "単ページ"
    if (options[1]) options[1].textContent = strings.spreadModeDouble; // "見開き"
    elements.settingsDefaultImageViewMode.value = defaultImageViewMode;
  }
  if (elements.fontPlus) elements.fontPlus.textContent = strings.fontIncreaseLabel;
  if (elements.fontMinus) elements.fontMinus.textContent = strings.fontDecreaseLabel;

  renderers.updateWritingModeToggleLabel();
  renderers.updateReadingDirectionEpubButtonLabel();
  renderers.updateReadingDirectionButtonLabel();
  renderers.updateSpreadModeButtonLabel();
  if (uiInitialized) {
    renderers.renderLibrary();
    renderers.renderHistory();
    renderers.renderBookmarks(bookmarkMenuMode);
    renderers.renderToc(currentToc);
    renderers.updateProgressBarDisplay();
    renderers.updateSearchButtonState();
    renderers.updateAuthStatusDisplay();
  }
}

// 移行済み: updateWritingModeToggleLabel

async function applyReadingSettings(nextWritingMode, nextPageDirection) {
  if (nextWritingMode) {
    writingMode = nextWritingMode;
  }
  if (nextPageDirection) {
    pageDirection = nextPageDirection;
  }

  // [修正] UIを即時更新 (重い処理の前に反映させる)
  if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;
  if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;

  renderers.updateWritingModeToggleLabel();
  renderers.updateReadingDirectionEpubButtonLabel();
  renderers.updateFloatingUIButtons();

  // [修正] ローディング表示を追加し、レンダリングを待機
  const isEpubOpen = currentBookInfo?.type === BOOK_TYPES.EPUB;
  if (isEpubOpen) {
    showLoading();
    // スピナーが表示されるよう、ブラウザの描画サイクルを1回回す
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, TIMING_CONFIG.ANIMATION_FRAME_DELAY_MS)));
  }

  try {
    await reader.applyReadingDirection(writingMode, pageDirection);
    renderers.updateProgressBarDirection();
    renderers.updateEpubScrollMode();
    storage.setSettings({ writingMode, pageDirection });
    persistReadingState({ writingMode, pageDirection });
    requestCloudSyncIfNeeded(getProgressSnapshot());
  } catch (error) {
    console.error("Failed to apply reading settings:", error);
  } finally {
    if (isEpubOpen) {
      hideLoading();
    }
  }
}

function applyLibraryViewMode(mode) {
  libraryViewMode = mode;
  if (elements.libraryGrid) {
    elements.libraryGrid.dataset.view = mode;
  }
  elements.libraryViewGrid?.classList.toggle(UI_CLASSES.ACTIVE, mode === "grid");
  elements.libraryViewList?.classList.toggle(UI_CLASSES.ACTIVE, mode === "list");
  storage.setSettings({ libraryViewMode: mode });
}

function applyProgressDisplayMode(mode) {
  progressDisplayMode = mode;
  storage.setSettings({ progressDisplayMode: mode });
  renderers.updateProgressBarDisplay();
  renderers.renderBookmarkMarkers();
}



async function pushCurrentBookSync() {
  const didSync = await syncLogic.pushCurrentBookSync(currentBookId, currentCloudBookId);
  if (didSync) {
    updateCloudSyncSnapshot(getProgressSnapshot());
  }
  return didSync;
}

function isAutoSyncReady(authStatus = checkAuthStatus()) {
  if (!autoSyncEnabled || !currentCloudBookId) return false;
  if (!shouldEnableAutoSync(authStatus)) {
    syncAutoSyncPolicy(authStatus);
    return false;
  }
  return true;
}

async function pushCurrentBookSyncIfReady() {
  if (!isAutoSyncReady()) return;
  const authStatus = checkAuthStatus();
  if (!authStatus.authenticated) {
    syncAutoSyncPolicy(authStatus);
    return;
  }
  try {
    await pushCurrentBookSync();
  } catch (error) {
    console.error("Auto-sync failed:", error);
  }
}

async function pushCurrentBookSyncOnAction() {
  try {
    await requestCloudSyncIfNeeded(getProgressSnapshot());
  } catch (error) {
    console.error("Auto-sync failed:", error);
  }
}

function getAutoSyncIntervalMs() {
  if (typeof document !== "undefined" && document.hidden) {
    return TIMING_CONFIG.BACKGROUND_SYNC_INTERVAL_MS;
  }
  return TIMING_CONFIG.PERIODIC_SYNC_MS;
}

function restartAutoSyncInterval() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
  if (!autoSyncEnabled) return;
  autoSyncInterval = setInterval(async () => {
    await pushCurrentBookSyncIfReady();
  }, getAutoSyncIntervalMs());
}

function toggleAutoSync(enabled) {
  autoSyncEnabled = enabled;
  storage.setSettings({ autoSyncEnabled: enabled });

  restartAutoSyncInterval();
}

function shouldEnableAutoSync() {
  return syncLogic.isCloudSyncEnabled();
}

function syncAutoSyncPolicy(authStatus = checkAuthStatus()) {
  const shouldEnable = shouldEnableAutoSync(authStatus);
  if (shouldEnable) {
    if (!autoSyncEnabled || !autoSyncInterval) {
      toggleAutoSync(true);
    }
  } else if (autoSyncEnabled) {
    toggleAutoSync(false);
  }
  return shouldEnable;
}

function scheduleAutoSyncPush() {
  void pushCurrentBookSyncOnAction();
}

function exportData() {
  const data = storage.exportData();
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `epub-reader-backup-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  try {
    const text = await file.text();
    storage.importData(text);
    renderers.renderLibrary();
    renderers.renderHistory();
    alert("データを読み込みました");
  } catch (error) {
    alert("データの読み込みに失敗しました: " + error.message);
  }
}

const FILE_PICKER_ACCEPT_TYPES = Object.freeze([
  Object.freeze({ mime: MIME_TYPES.EPUB, extensions: SUPPORTED_FORMATS.EPUB }),
  Object.freeze({ mime: MIME_TYPES.CBZ, extensions: [`.${FILE_EXTENSIONS.CBZ}`] }),
  Object.freeze({ mime: MIME_TYPES.ZIP, extensions: [`.${FILE_EXTENSIONS.ZIP}`] }),
  Object.freeze({ mime: MIME_TYPES.RAR, extensions: [`.${FILE_EXTENSIONS.RAR}`] }),
  Object.freeze({ mime: MIME_TYPES.RAR_LEGACY, extensions: [`.${FILE_EXTENSIONS.RAR}`] }),
  Object.freeze({ mime: MIME_TYPES.CBR, extensions: [`.${FILE_EXTENSIONS.CBR}`] }),
]);

const FILE_INPUT_ACCEPT = Object.freeze([
  ...SUPPORTED_FORMATS.EPUB,
  ...SUPPORTED_FORMATS.IMAGE_ARCHIVE,
]);

function buildFilePickerOptions() {
  const accept = FILE_PICKER_ACCEPT_TYPES.reduce((map, entry) => {
    map[entry.mime] = entry.extensions;
    return map;
  }, {});
  return {
    types: [
      {
        accept,
      },
    ],
    excludeAcceptAllOption: false,
    multiple: false,
  };
}

function ensureLegacyFileInput() {
  const acceptValue = FILE_INPUT_ACCEPT.join(",");
  const existing = elements.fileInput ?? document.getElementById(DOM_IDS.LEGACY_FILE_INPUT);
  if (existing) {
    existing.accept = acceptValue;
    if (existing !== elements.fileInput && existing.dataset.listenerAttached !== "true") {
      existing.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) {
          handleFile(file);
        } else {
          pendingCloudBookId = null;
        }
        e.target.value = "";
      });
      existing.dataset.listenerAttached = "true";
    }
    return existing;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.id = DOM_IDS.LEGACY_FILE_INPUT;
  input.accept = acceptValue;
  input.style.display = "none";
  input.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    } else {
      pendingCloudBookId = null;
    }
    e.target.value = "";
  });
  input.dataset.listenerAttached = "true";
  document.body.appendChild(input);
  return input;
}

async function openFileDialog() {
  const openLegacyFileInput = () => {
    const input = ensureLegacyFileInput();
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch (e) {
        console.warn('showPicker failed, falling back to click:', e);
      }
    }
    input.click();
  };

  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const [fileHandle] = await window.showOpenFilePicker(buildFilePickerOptions());
      const file = await fileHandle.getFile();
      if (file) {
        await handleFile(file);
      }
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.warn('showOpenFilePicker failed, falling back to legacy input:', error);
    }
  }

  openLegacyFileInput();
}

/**
 * 削除マーク済み書籍を実際に削除する
 */
async function commitPendingDeletes() {
  if (pendingDeletes.size === 0) return;

  console.log(`[commitPendingDeletes] ${pendingDeletes.size}冊を削除します`);

  for (const { id, type } of pendingDeletes.values()) {
    try {
      if (type === 'local') {
        // ローカルファイル削除
        await deleteBook(id);
        // storageからも削除（リンクされたクラウドデータ含む）
        storage.removeBook(id);
      } else if (type === 'cloud') {
        // クラウドデータのみ削除
        storage.removeCloudData(id);
      }
      console.log(`[commitPendingDeletes] 削除完了 (${type}): ${id}`);
    } catch (error) {
      console.error(`[commitPendingDeletes] 削除に失敗 (${type}): ${id}`, error);
    }
  }

  // 削除マークをクリア
  pendingDeletes.clear();
}

function showLibrary() {
  // 削除マークをリセット（前回の状態をクリア）
  pendingDeletes.clear();

  openModal(elements.openFileModal);
  if (elements.librarySearchInput) {
    elements.librarySearchInput.value = "";
  }
  renderers.renderLibrary();

  // モーダルの閉じるボタンにイベントを追加
  const closeHandler = async () => {
    await commitPendingDeletes();
    closeModal(elements.openFileModal);
    elements.closeFileModal?.removeEventListener('click', closeHandler);
  };
  elements.closeFileModal?.addEventListener('click', closeHandler);

  // バックドロップクリックでも閉じる処理を追加
  const backdropHandler = async (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      await commitPendingDeletes();
      closeModal(elements.openFileModal);
      elements.openFileModal?.querySelector('.modal-backdrop')?.removeEventListener('click', backdropHandler);
    }
  };
  elements.openFileModal?.querySelector('.modal-backdrop')?.addEventListener('click', backdropHandler);
}

function showSearch() {
  if (!currentBookId || currentBookInfo?.type !== BOOK_TYPES.EPUB) {
    alert(t("searchEpubOnly"));
    return;
  }
  openExclusiveMenu(elements.searchModal);
  if (elements.searchInput) {
    elements.searchInput.value = '';
    elements.searchInput.focus();
  }
  if (elements.searchResults) {
    elements.searchResults.innerHTML = '';
  }
}

function showBookmarks() {
  bookmarkMenuMode = "all";
  renderers.renderBookmarks(bookmarkMenuMode);
  openExclusiveMenu(elements.bookmarkMenu);
}

function showHistory() {
  openExclusiveMenu(elements.historyModal);
  renderers.renderHistory();
}

function showSettings() {
  openExclusiveMenu(elements.settingsModal);
  const currentSettings = storage.getSettings();

  renderers.updateAuthStatusDisplay();
}

// ========================================
// イベントハンドラー
// ========================================

function setupEvents() {
  console.log('[setupEvents] Starting event setup...');
  console.log('[setupEvents] elements.menuOpen:', elements.menuOpen);
  console.log('[setupEvents] elements.leftMenu:', elements.leftMenu);

  // メニューアクション
  if (elements.menuOpen) {
    elements.menuOpen.addEventListener('click', () => {
      console.log('[menuOpen] Clicked!');
      openFileDialog();
    });
    console.log('[setupEvents] menuOpen listener attached');
  } else {
    console.error('[setupEvents] elements.menuOpen is null or undefined!');
  }

  if (elements.menuLibrary) {
    elements.menuLibrary.addEventListener('click', () => {
      console.log('[menuLibrary] Clicked!');
      showLibrary();
    });
    console.log('[setupEvents] menuLibrary listener attached');
  } else {
    console.error('[setupEvents] elements.menuLibrary is null!');
  }

  if (elements.menuSearch) {
    elements.menuSearch.addEventListener('click', () => {
      console.log('[menuSearch] Clicked!');
      showSearch();
    });
  }

  if (elements.menuBookmarks) {
    elements.menuBookmarks.addEventListener('click', () => {
      console.log('[menuBookmarks] Clicked!');
      showBookmarks();
    });
  }

  if (elements.menuHistory) {
    elements.menuHistory.addEventListener('click', () => {
      console.log('[menuHistory] Clicked!');
      showHistory();
    });
  }

  elements.floatOpen?.addEventListener('click', () => {
    openFileDialog();
  });

  elements.floatLibrary?.addEventListener('click', () => {
    showLibrary();
  });

  elements.floatSearch?.addEventListener('click', () => {
    showSearch();
  });

  elements.floatBookmarks?.addEventListener('click', () => {
    showBookmarks();
  });

  elements.floatHistory?.addEventListener('click', () => {
    showHistory();
  });

  elements.floatSettings?.addEventListener('click', () => {
    showSettings();
  });

  elements.menuSettings?.addEventListener('click', () => {
    showSettings();
  });


  elements.langJa?.addEventListener('click', () => applyUiLanguage("ja"));
  elements.langEn?.addEventListener('click', () => applyUiLanguage("en"));

  elements.toggleWritingMode?.addEventListener('click', async () => {
    const nextMode =
      writingMode === WRITING_MODES.VERTICAL ? WRITING_MODES.HORIZONTAL : WRITING_MODES.VERTICAL;
    await applyReadingSettings(nextMode, null);
    if (elements.writingModeSelect) {
      elements.writingModeSelect.value = writingMode;
    }
  });

  // 見開き/単ページ切替ボタン
  elements.toggleSpreadMode?.addEventListener('click', () => {
    reader.toggleImageViewMode();
    renderers.updateSpreadModeButtonLabel();
  });

  // 左開き/右開き切替ボタン (画像用)
  elements.toggleReadingDirectionImage?.addEventListener('click', () => {
    reader.toggleImageReadingDirection();
    renderers.updateReadingDirectionButtonLabel();
    renderers.updateProgressBarDirection();
  });

  // 左開き/右開き切替ボタン (EPUB用)
  elements.toggleReadingDirectionEpub?.addEventListener('click', async () => {
    userOverrodeDirection = true;
    const nextDirection =
      pageDirection === READING_DIRECTIONS.RTL ? READING_DIRECTIONS.LTR : READING_DIRECTIONS.RTL;
    await applyReadingSettings(null, nextDirection);
    if (elements.pageDirectionSelect) {
      elements.pageDirectionSelect.value = pageDirection;
    }
  });



  elements.fontPlus?.addEventListener('click', () => {
    applyFontSize((fontSize ?? UI_DEFAULTS.fontSize) + 1);
  });

  elements.fontMinus?.addEventListener('click', () => {
    applyFontSize((fontSize ?? UI_DEFAULTS.fontSize) - 1);
  });

  elements.toggleTheme?.addEventListener('click', () => {
    applyTheme(theme === "dark" ? "light" : "dark");
  });

  elements.toggleLanguage?.addEventListener('click', () => {
    applyUiLanguage(uiLanguage === "ja" ? "en" : "ja");
  });

  // 言語メニュー（フロートUI用・地球儀ボタン横）
  elements.openLangMenu?.addEventListener('click', () => {
    elements.floatLangMenu?.classList.toggle(UI_CLASSES.HIDDEN);
  });

  elements.floatLangJa?.addEventListener('click', () => {
    applyUiLanguage("ja");
    elements.floatLangMenu?.classList.add(UI_CLASSES.HIDDEN);
  });

  elements.floatLangEn?.addEventListener('click', () => {
    applyUiLanguage("en");
    elements.floatLangMenu?.classList.add(UI_CLASSES.HIDDEN);
  });

  elements.floatBackdrop?.addEventListener('click', (e) => {
    e.stopPropagation();
    renderers.toggleFloatOverlay(false);
  });

  elements.openToc?.addEventListener('click', () => {
    if (!currentBookInfo || currentBookInfo.type !== BOOK_TYPES.EPUB) return;
    openExclusiveMenu(elements.tocModal);
  });

  // ファイル選択
  elements.fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    } else {
      pendingCloudBookId = null;
    }
    e.target.value = "";
  });

  // しおり追加
  elements.addBookmarkBtn?.addEventListener('click', addBookmark);

  elements.libraryViewGrid?.addEventListener('click', () => applyLibraryViewMode("grid"));
  elements.libraryViewList?.addEventListener('click', () => applyLibraryViewMode("list"));

  // 進捗バーのページ入力
  let isEditingProgress = false;

  elements.currentPageInput?.addEventListener('focus', () => {
    isEditingProgress = true;
  });

  elements.currentPageInput?.addEventListener('blur', () => {
    isEditingProgress = false;
  });

  elements.currentPageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.target.blur(); // フォーカスを外してblurイベントをトリガー

      const value = parseInt(e.target.value, 10);
      if (!isNaN(value)) {
        if (progressDisplayMode === "page") {
          // ページ数モード
          if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
            // EPUBの場合はページ数として扱う
            const totalPages = getEpubPaginationTotal();
            if (totalPages) {
              const percentage = (value / totalPages) * 100;
              seekToPercentage(Math.max(0, Math.min(percentage, 100)));
            } else {
              seekToPercentage(Math.max(0, Math.min(value, 100)));
            }
          } else if (currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR)) {
            // 画像書籍の場合はページ数として扱う
            const totalPages = reader.imagePages?.length || 1;
            const percentage = ((value - 1) / (totalPages - 1)) * 100;
            seekToPercentage(Math.max(0, Math.min(percentage, 100)));
          } else {
            // locations未生成のEPUBはパーセンテージとして扱う
            seekToPercentage(Math.max(0, Math.min(value, 100)));
          }
        } else {
          // パーセンテージモード
          seekToPercentage(Math.max(0, Math.min(value, 100)));
        }
      }
    }
  });

  // 設定
  elements.themeSelect?.addEventListener('change', (e) => {
    applyTheme(e.target.value);
  });

  elements.writingModeSelect?.addEventListener('change', async (e) => {
    await applyReadingSettings(e.target.value, null);
  });

  elements.pageDirectionSelect?.addEventListener('change', async (e) => {
    userOverrodeDirection = true;
    await applyReadingSettings(null, e.target.value);
  });

  elements.settingsDefaultWritingMode?.addEventListener('change', (e) => {
    defaultWritingMode = e.target.value;
    storage.setSettings({ defaultWritingMode });
  });

  elements.settingsDefaultPageDirection?.addEventListener('change', (e) => {
    defaultPageDirection = e.target.value;
    storage.setSettings({ defaultPageDirection });
  });

  elements.settingsDefaultImageViewMode?.addEventListener('change', (e) => {
    defaultImageViewMode = e.target.value;
    storage.setSettings({ defaultImageViewMode });
  });

  elements.progressDisplayModeSelect?.addEventListener('change', (e) => {
    applyProgressDisplayMode(e.target.value);
  });



  elements.googleLoginButton?.addEventListener('click', () => {
    const authStatus = checkAuthStatus();
    if (authStatus.authenticated) {
      logout();
      return;
    }
    // New Firebase Auth Login
    startGoogleLogin();
  });

  elements.notionOauthUrlInput?.addEventListener('input', (e) => {
    const nextValue = e.target.value.trim();
    const notionSettings = getNotionSettingsSnapshot();
    storage.setSettings({
      notionIntegration: {
        ...notionSettings,
        oauthUrl: nextValue,
      },
    });
  });

  elements.notionConnectButton?.addEventListener('click', handleNotionConnectClick);
  elements.notionDisconnectButton?.addEventListener('click', handleNotionDisconnectClick);

  // Manual sync button
  const manualSyncButton = document.getElementById(DOM_IDS.MANUAL_SYNC_BUTTON);
  const syncStatus = document.getElementById(DOM_IDS.SYNC_STATUS);

  manualSyncButton?.addEventListener('click', async () => {
    const authStatus = checkAuthStatus();
    if (!authStatus.authenticated) {
      if (syncStatus) {
        syncStatus.textContent = t('syncNeedsLoginStatus');
        renderers.setStatusClass(syncStatus, UI_CLASSES.STATUS_ERROR);
      }
      return;
    }

    try {
      const resolvedSource = cloudSync.resolveSource(null, storage.getSettings());
      if (resolvedSource !== SYNC_SOURCES.D1) {
        storage.setSettings({ source: SYNC_SOURCES.D1 });
      }
      manualSyncButton.disabled = true;
      manualSyncButton.textContent = t('syncInProgress');
      if (syncStatus) {
        syncStatus.textContent = t('syncStarting');
        renderers.setStatusClass(syncStatus, UI_CLASSES.STATUS_NEUTRAL);
      }

      // Pull index
      await syncLogic.syncAllBooksFromCloud(uiInitialized, bookmarkMenuMode);

      // If a book is open, sync its state
      if (currentBookId && currentCloudBookId) {
        await pushCurrentBookSync();
      }

      // SSOT: 同期完了後の最終的な永続化
      storage.save();

      if (syncStatus) {
        syncStatus.textContent = `${UI_ICONS.CHECK_MARK} ${t('syncCompleted')}`;
        renderers.setStatusClass(syncStatus, UI_CLASSES.STATUS_SUCCESS);
        setTimeout(() => {
          syncStatus.textContent = '';
          renderers.setStatusClass(syncStatus, null);
        }, TIMING_CONFIG.STATUS_MESSAGE_DISPLAY_MS);
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
      if (syncStatus) {
        let userMessage = t('syncFailed');
        let detailMessage = error.message;

        // ネットワークエラーやブロックの可能性を示唆する判定
        if (error.code === 'unavailable' ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('Network Error')) {

          userMessage = t('syncBlocked');
          detailMessage = t('syncBlockedDetail');
        } else if (error.code === 'permission-denied') {
          userMessage = t('syncPermissionError');
          detailMessage = t('syncPermissionDetail');
        }

        syncStatus.textContent = `${UI_ICONS.ERROR_MARK} ${userMessage}`;
        renderers.setStatusClass(syncStatus, UI_CLASSES.STATUS_ERROR);

        // 詳細をアラートでも表示（ユーザーに気づかせるため）
        alert(`${userMessage}\n\n${detailMessage}\n\n${t('errorDetail')}: ${error.message}`);
      }
    } finally {
      manualSyncButton.disabled = false;
      manualSyncButton.textContent = t('syncNowButton');
    }
  });

  elements.exportDataBtn?.addEventListener('click', exportData);

  elements.importDataInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importData(file);
  });

  // モーダル閉じる
  elements.closeFileModal?.addEventListener('click', () => closeModal(elements.openFileModal));
  elements.closeHistoryModal?.addEventListener('click', () => closeModal(elements.historyModal));
  elements.closeSettingsModal?.addEventListener('click', () => closeModal(elements.settingsModal));
  elements.closeImageModal?.addEventListener('click', () => closeModal(elements.imageModal));
  elements.closeSearchModal?.addEventListener('click', () => closeModal(elements.searchModal));
  elements.closeTocModal?.addEventListener('click', () => closeModal(elements.tocModal));
  elements.closeBookmarkMenu?.addEventListener('click', () => closeModal(elements.bookmarkMenu));
  elements.archiveWarningClose?.addEventListener('click', () => clearArchiveWarnings());

  // 検索機能
  const executeSearch = async () => {
    const query = elements.searchInput?.value?.trim();
    if (!query) {
      alert(t("searchMissingQuery"));
      return;
    }

    const results = await performSearch(query);
    renderSearchResults(results, query);
  };

  elements.searchBtn?.addEventListener('click', executeSearch);

  elements.searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      executeSearch();
    }
  });

  // モーダルバックドロップクリック
  [elements.openFileModal, elements.historyModal, elements.settingsModal, elements.imageModal, elements.searchModal, elements.tocModal].forEach(modal => {
    modal?.addEventListener('click', (e) => {
      if (e.target.classList.contains(UI_CLASSES.MODAL_BACKDROP) || e.target === modal) {
        closeModal(modal);
      }
    });
  });

  elements.modalOverlay?.addEventListener('click', (e) => {
    if (e.target !== elements.modalOverlay) return;
    e.stopPropagation();
    Array.from(elements.modalOverlay.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        closeModal(child);
      }
    });
  });

  // しおりメニューのバックドロップクリック
  elements.bookmarkMenu?.addEventListener('click', (e) => {
    // bookmarkMenuの直接クリック（背景部分）の場合は閉じる
    if (e.target === elements.bookmarkMenu) {
      closeModal(elements.bookmarkMenu);
    }
  });

  // 進捗バーパネルのクリックイベント伝播を止める（バックドロップに届かないように）
  elements.progressBarPanel?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 左メニューのクリックイベント伝播を止める
  elements.leftMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // ホイール操作でページ送り
  const wheelTarget = elements.fullscreenReader || elements.viewer;
  const wheelThrottleMs = 300;
  let lastWheelTime = 0;

  wheelTarget?.addEventListener('wheel', (event) => {
    // ズーム中はページ送りをスキップ（documentレベルのズームハンドラに任せる）
    if (reader.isZoomMode()) {
      return;
    }

    // モーダルが開いている場合は無視
    if (!elements.openFileModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.historyModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.settingsModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.imageModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.searchModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.syncModal?.classList.contains(UI_CLASSES.HIDDEN)) {
      return;
    }

    const targetElement = event.target instanceof Element ? event.target : null;
    if (targetElement?.closest(DOM_SELECTORS.CLICK_EXCLUDE_MENU)) {
      return;
    }

    event.preventDefault();

    const now = Date.now();
    if (now - lastWheelTime < wheelThrottleMs) {
      return;
    }

    if (event.deltaY > 0) {

      reader.next();
    } else if (event.deltaY < 0) {

      reader.prev();
    }

    lastWheelTime = now;
  }, { passive: false });

  // キーボード操作
  document.addEventListener('keydown', (e) => {
    // モーダルが開いている場合は無視
    if (!elements.openFileModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.historyModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.settingsModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.imageModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.searchModal?.classList.contains(UI_CLASSES.HIDDEN)) {
      return;
    }



    switch (e.key) {
      case 'ArrowLeft':
        if (pageDirection === READING_DIRECTIONS.RTL) {
          reader.next(); // 右開きの場合、左キーで次ページ
        } else {
          reader.prev();
        }
        break;
      case 'ArrowRight':
        if (pageDirection === READING_DIRECTIONS.RTL) {
          reader.prev(); // 右開きの場合、右キーで前ページ
        } else {
          reader.next();
        }
        break;
      case 'ArrowUp':
        reader.prev();
        break;
      case 'ArrowDown':
        reader.next();
        break;
      case 'Enter':
        // 書籍を閲覧中のみ全画面を切り替える
        if (currentBookId) {
          e.preventDefault();
          toggleFullscreen();
        }
        break;
    }
  });

  window.addEventListener('pagehide', () => {
    void pushCurrentBookSyncOnAction();
  });

  document.addEventListener('visibilitychange', () => {
    if (!autoSyncEnabled) return;
    restartAutoSyncInterval();
  });
  // ズームボタン
  elements.toggleZoom?.addEventListener('click', handleToggleZoom);

  // 全画面切替ボタン
  elements.toggleFullscreen?.addEventListener('click', () => {
    toggleFullscreen();
  });

  // 全画面状態が変わった時にボタンラベルを更新（Escキー等での解除にも対応）
  document.addEventListener('fullscreenchange', () => {
    updateFullscreenButtonLabel();
  });

  // プログレスバー矢印
  elements.progressPrev?.addEventListener('click', () => {

    reader.prev(1); // 1ページずつ戻る
  });

  elements.progressNext?.addEventListener('click', () => {

    reader.next(1); // 1ページずつ進む
  });

  // ライブラリ検索入力欄
  elements.librarySearchInput?.addEventListener('input', (e) => {
    renderers.filterLibraryCards(e.target.value);
  });
}

// ========================================
// 初期化
// ========================================

function init() {
  console.log("Initializing Epub Reader...");
  console.log("[init] readyState:", document.readyState);
  console.log("[init] elements object:", elements);

  // ライブラリ読み込み確認
  console.log("JSZip:", typeof JSZip !== "undefined" ? UI_ICONS.CHECK_MARK : UI_ICONS.ERROR_MARK);
  console.log("ePub:", typeof ePub !== "undefined" ? UI_ICONS.CHECK_MARK : UI_ICONS.ERROR_MARK);

  // イベント設定
  setupEvents();

  // テーマ適用
  applyTheme(theme);
  if (!Number.isFinite(fontSize)) {
    const baseFont = Number.parseFloat(
      window.getComputedStyle(elements.viewer || document.body)?.fontSize
    );
    fontSize = Number.isFinite(baseFont) ? baseFont : UI_DEFAULTS.fontSize;
  }
  applyFontSize(fontSize);
  applyReadingSettings(writingMode, pageDirection);
  applyLibraryViewMode(libraryViewMode);
  applyProgressDisplayMode(progressDisplayMode);

  // 自動同期設定（ログイン時のみ有効）
  syncAutoSyncPolicy();

  // ライブラリレンダリング
  renderers.renderLibrary();

  // 検索ボタンの状態を更新
  renderers.updateSearchButtonState();

  // 全画面ボタンの初期ラベルを設定
  updateFullscreenButtonLabel();

  console.log("Epub Reader initialized");
}

function initializeGoogleLogin() {
  try {
    initGoogleLogin({ prompt: false });
    googleLoginReady = true;
  } catch (error) {
    console.error("Google login initialization failed:", error);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register("./service-worker.js")
    .catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
}

function startApp() {
  init();
}

function startAfterDomReady() {
  registerServiceWorker();
  initializeGoogleLogin();
  startApp();
}

window.addEventListener("auth:login", () => {
  syncLogic.handleAuthLogin().catch((error) => {
    console.error("同期データの取得に失敗しました:", error);
  });
});

window.addEventListener("load", () => {
  if (!googleLoginReady) {
    initializeGoogleLogin();
  }
});

// DOMContentLoadedイベントを待ってから初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAfterDomReady);
} else {
  startAfterDomReady();
}
