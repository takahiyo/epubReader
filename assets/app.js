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
  FILE_STRATEGY,
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
let isBookLoading = false;
let pendingCloudBookId = null;

let theme = settings.theme ?? UI_DEFAULTS.theme;
let uiLanguage = settings.uiLanguage ?? UI_DEFAULTS.uiLanguage;
let writingMode = settings.writingMode;
let pageDirection = settings.pageDirection;
let bookmarkMenuMode = settings.bookmarkMenuMode ?? UI_DEFAULTS.bookmarkMenuMode;
let epubViewMode = settings.epubViewMode ?? UI_DEFAULTS.epubViewMode;
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
let oneBookmarkPerBook = settings.oneBookmarkPerBook ?? DEFAULT_SETTINGS.oneBookmarkPerBook;
let autoSyncEnabled = false;
let libraryViewMode = settings.libraryViewMode ?? UI_DEFAULTS.libraryViewMode;
let autoSyncInterval = null;
let lastSavedPercentage = null;
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
  // ズームスライダーの初期化をDOM準備後に行う
  if (reader && typeof reader.setupZoomSlider === 'function') {
    reader.setupZoomSlider();
  }
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
      cfi: location.cfi || undefined,
      visibleText: location.visibleText || undefined,
    };
  }
  if (typeof location === "string") {
    // 既存の "spineIndex:segmentIndex" 形式の文字列復元
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

// 認証成功時の同期トリガー設定 (初期化後すぐに登録)
window.addEventListener("auth:login", () => {
  console.log("[app] auth:login event received, starting sync...");
  syncLogic.handleAuthLogin().catch((error) => {
    console.error("同期データの取得に失敗しました:", error);
  });
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

function saveCurrentProgress(options = {}) {
  const { progressSnapshot = getProgressSnapshot(), force = false } = options;
  if (!currentBookId || isBookLoading) return;

  // リーダーが未初期化（ページ分割前）の場合は保存をスキップして位置の上書きを防ぐ
  if (getCurrentTotalPages() <= 0) return;

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
      epubViewMode,
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

  if (!progressData) return progressSnapshot;
  if (!force && !shouldPersistLocalProgress(progressData.percentage)) return progressSnapshot;

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

async function requestCloudSyncIfNeeded(options = {}) {
  const { progressSnapshot = getProgressSnapshot(), force = false } = options;
  if (!force && !shouldSyncCloudProgress(progressSnapshot)) return;
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

    ui.updateProgress(progressSnapshot.pageIndex, progressSnapshot.totalPages, progressSnapshot.percentage);
    const savedSnapshot = saveCurrentProgress({ progressSnapshot });
    requestCloudSyncIfNeeded({ progressSnapshot: savedSnapshot });
  },
  onLoadingUpdate: (loadingInfo) => {
    // ローディング状態の更新をコンソールに記録
    // 将来的にUIに表示する場合はここで処理
    console.log('[ReaderController] Loading update:', loadingInfo);
  },
  onRepaginationStart: () => {
    showLoading();
  },
  onRepaginationEnd: () => {
    hideLoading();
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
reader.applyEpubViewMode(epubViewMode);

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
  isImageBook: () => {
    const type = reader?.type;
    return Boolean(type === BOOK_TYPES.IMAGE || type === BOOK_TYPES.ZIP || type === BOOK_TYPES.RAR);
  },
  isSpreadMode: () => Boolean(reader?.imageViewMode === IMAGE_VIEW_MODES.SPREAD),

  getReadingDirection: () => {
    // EPUBの場合は pageDirection (ltr/rtl)
    if (reader?.type === BOOK_TYPES.EPUB) {
      return pageDirection;
    }
    // 画像書庫の場合は reader.imageReadingDirection
    return reader?.imageReadingDirection;
  },

  getWritingMode: () => {
    return writingMode;
  },

  getEpubViewMode: () => epubViewMode,

  onFloatToggle: () => {
    renderers.toggleFloatOverlay();
  },
  onResize: () => {
    // リサイズ時のリペジネーション (EPUBのみ)
    // ui.js側で既に250msデバウンス済みなので直接呼び出す
    if (!reader.handleResize) return;
    reader.handleResize();
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
    get epubViewMode() { return epubViewMode; },
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
    setPendingCloudBookId: (id) => { pendingCloudBookId = id; },

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

    // 1. 環境に適した読み込み戦略を選択
    const strategy = fileHandler.selectLoadingStrategy(file, fileHandler.detectEnvironment());
    const isLargeFile = file.size > FILE_STRATEGY.LARGE_FILE_THRESHOLD;

    // 2. 先頭バイトのみでファイルタイプを判定（全バッファ不要）
    //    NotReadableError 発生時は自動リトライ
    const header = await fileHandler.readFileWithRetry(file,
      () => fileHandler.readFileHeader(file, FILE_STRATEGY.HEADER_BYTES));
    console.log(`File header loaded: ${header.byteLength} bytes`);

    // マジックナンバー優先、フォールバックとして拡張子判定
    const type = fileHandler.detectFileType(header) || fileHandler.detectFileType(file);
    if (!type) {
      hideLoading();
      alert(t ? t('errorFileLoadFailed') : "対応していないファイル形式です。");
      return;
    }
    console.log(`Detected file type: ${type}`);

    const isArchiveBook = type === BOOK_TYPES.ZIP || type === BOOK_TYPES.RAR;

    // 2.5. ストリーミングモード判定（能力ベース、OS非依存）
    //      ZIPファイルかつ端末のメモリ能力に対しファイルが大きすぎる場合、
    //      JSZipの一括展開ではなくzip.jsのストリーミングモードに切り替える
    const useStreaming = isArchiveBook && type === BOOK_TYPES.ZIP &&
      fileHandler.shouldUseStreaming(file);

    // ストリーミングモード時: ローディング画面にメモリ制限モードの通知を表示
    if (useStreaming) {
      showStreamingNotice();
    }

    // 3. ハッシュ計算（リトライ付き）
    //    画像書庫は fingerprint（File直接、バッファ不要）
    //    大容量EPUBは軽量ハッシュ（先頭1MB+末尾1MB+サイズ、ピークメモリ ~2MB）
    //    小容量EPUBは従来の全バッファハッシュ（高速）
    let contentHash;
    if (isArchiveBook) {
      contentHash = await fileHandler.buildArchiveFingerprint(file);
    } else if (isLargeFile) {
      // 大容量EPUB: file.arrayBuffer() を呼ばずにハッシュ計算
      contentHash = await fileHandler.readFileWithRetry(file,
        () => fileHandler.hashFileLightweight(file));
    } else {
      // 小容量EPUB: 従来の全バッファハッシュ（高速）
      contentHash = await fileHandler.readFileWithRetry(file,
        async () => fileHandler.hashBuffer(await file.arrayBuffer()));
    }

    // 移行方針: 既存のcontentHash一致を優先し、旧ID(短縮ハッシュ)一致なら旧IDを再利用して重複登録を防ぐ
    const existingRecord = fileHandler.findBookByContentHash(storage.data.library, contentHash);
    const id = existingRecord?.id ?? contentHash;
    const mime = fileHandler.guessMime(type, file);
    const source = storage.getSettings().source || SYNC_SOURCES.LOCAL;

    // 4. ファイル保存
    //    ストリーミングモード: 本体を保存しない（メタデータのみ）
    //    大容量: File オブジェクトを直接 OPFS に渡す（全バッファをメモリに載せない）
    //    小容量: arrayBuffer() で一括取得し IndexedDB に保存
    if (useStreaming) {
      console.log(`[Streaming] Stub mode: skipping file body save for ${id.substring(0, 12)}...`);
      // 本体保存スキップ — メタデータのみライブラリに記録
    } else {
      console.log(`Saving file to storage with ID: ${id.substring(0, 12)}...`);
      if (isLargeFile) {
        await saveFile(id, file, { fileName: file.name, mime }, source);
      } else {
        const bufferForSave = await fileHandler.readFileWithRetry(file, () => file.arrayBuffer());
        await saveFile(id, bufferForSave, { fileName: file.name, mime }, source);
      }
    }

    // type: "epub" | "zip" | "rar" として正式に保存
    const info = {
      id,
      title: fileHandler.fileTitle(file.name),
      type: type, // "epub" | "zip" | "rar"
      fileName: file.name,
      size: file.size,
      contentHash,
      lastOpened: Date.now(),
      // ストリーミングモード: 再開時にファイル再選択が必要
      ...(useStreaming ? { isLargeFileStub: true } : {}),
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

    // 5. リーダーへの File オブジェクト渡し
    //    大容量: 元の File オブジェクトをそのまま渡す（バッファ二重消費を完全回避）
    //    小容量: 保存済みバッファからFileを再構築（従来互換）
    const fileToOpen = file; // File オブジェクトをそのまま渡す

    // 6. ビューアの切り替えと初期表示設定
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
      console.time('[handleFile] openEpub');
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

      try {
        await reader.openEpub(fileToOpen, {
          location: startLocation,
          percentage: startProgress,
          epubViewMode: syncedProgress?.epubViewMode || epubViewMode,
          writingMode: syncedProgress?.writingMode || writingMode,
          pageDirection: syncedProgress?.pageDirection || pageDirection,
        });
        console.timeEnd('[handleFile] openEpub');
      } catch (epubError) {
        console.timeEnd('[handleFile] openEpub');
        // openEpub失敗時のみローディングを解除（成功時はapplyReadingState完了後に解除）
        hideLoading();
        throw epubError;
      }
    } else {
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      await reader.openImageBook(
        fileToOpen,
        typeof startLocation === "number" ? startLocation : 0,
        type,
        { streaming: useStreaming }
      );
    }

    // 2. 状態の適用（オープン後に実行することで初期化による上書きを防ぐ）
    console.time('[handleFile] applyReadingState');
    await applyReadingState(syncedProgress);
    console.timeEnd('[handleFile] applyReadingState');

    // 同期されたしおりをUIに反映
    renderers.renderBookmarks(bookmarkMenuMode);

    console.log("Book opened successfully");
    // ストリーミングモード通知を削除
    const streamingNotice = elements.loadingOverlay?.querySelector('.streaming-notice');
    if (streamingNotice) streamingNotice.remove();
    hideLoading();
    renderers.renderLibrary();
    renderers.renderBookmarkMarkers();
    renderers.updateProgressBarDisplay();
    renderers.updateSearchButtonState();
    renderers.updateFloatingUIButtons();
    closeExclusiveMenus();
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

/**
 * ストリーミングモード（機能制限モード）の通知を表示する
 */
function showStreamingNotice() {
  if (elements.loadingOverlay) {
    let notice = elements.loadingOverlay.querySelector('.streaming-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'streaming-notice';
      notice.style.cssText = 'color:#ffb74d;font-size:0.85rem;text-align:center;margin-top:12px;padding:0 16px;line-height:1.5;';
      notice.textContent = translate('streamingNotice') || 'メモリが不足しているため、機能制限モード（ストリーミング）で読み込んでいます。一部の機能が利用できません。';
      elements.loadingOverlay.appendChild(notice);
    }
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
  closeExclusiveMenus();
  if (floatVisible) {
    toggleFloatOverlay(false);
  }
}

let stubReselectInput = null;

/**
 * スタブエントリー用ファイル再選択ダイアログ。
 * ユーザーにファイルを選ばせ、軽量ハッシュで同一ファイルか検証する。
 * @param {object} info - ライブラリのブック情報
 * @returns {Promise<File|null>} 選択されたFile、キャンセル時はnull
 */
function promptFileReselect(info) {
  return new Promise((resolve) => {
    // 恒久的な input 要素を準備（Android WebViewでのFileストリーム切断・無限ロードを防ぐためDOMから削除しない）
    if (!stubReselectInput) {
      stubReselectInput = document.createElement("input");
      stubReselectInput.type = "file";
      stubReselectInput.accept = SUPPORTED_FORMATS.IMAGE_ARCHIVE.join(",");
      stubReselectInput.style.display = "none";
      document.body.appendChild(stubReselectInput);
    }

    // 以前のイベントを確実に消すため要素を置き換える
    const newClone = stubReselectInput.cloneNode(true);
    stubReselectInput.parentNode.replaceChild(newClone, stubReselectInput);
    stubReselectInput = newClone;
    stubReselectInput.value = '';

    // カスタムダイアログUIの構築
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:sans-serif;";

    const dialog = document.createElement("div");
    dialog.style.cssText = "background:var(--bg-color, #fff);color:var(--text-color, #333);padding:24px;border-radius:8px;width:90%;max-width:400px;box-shadow:0 8px 24px rgba(0,0,0,0.2);";

    const title = document.createElement("h3");
    title.textContent = translate('stubReselectTitle', uiLanguage) || "ファイル再選択";
    title.style.cssText = "margin:0 0 16px 0;font-size:1.2rem;";

    const msgTemplate = translate('stubReselectMessage', uiLanguage) || "「{title}」は大容量ファイルのため本体が保存されていません。\n閲覧を再開するには元のファイルを選択してください。";
    const desc = document.createElement("p");
    desc.textContent = msgTemplate.replace('{title}', info.title);
    desc.style.cssText = "margin:0 0 24px 0;line-height:1.5;white-space:pre-wrap;font-size:0.95rem;";

    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = "display:flex;justify-content:flex-end;gap:12px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = translate('cancel', uiLanguage) || "キャンセル";
    cancelBtn.style.cssText = "padding:8px 16px;border:none;background:transparent;color:var(--text-color, #333);cursor:pointer;font-size:0.95rem;font-weight:bold;";

    const selectBtn = document.createElement("button");
    selectBtn.textContent = translate('selectFile', uiLanguage) || "ファイルを選択";
    selectBtn.style.cssText = "padding:8px 16px;border:none;background:var(--primary-color, #007bff);color:#fff;border-radius:4px;cursor:pointer;font-size:0.95rem;font-weight:bold;";

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(selectBtn);

    dialog.appendChild(title);
    dialog.appendChild(desc);
    dialog.appendChild(btnContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = () => {
      if (overlay.parentNode) {
        document.body.removeChild(overlay);
      }
    };

    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve(null);
    });

    selectBtn.addEventListener("click", () => {
      stubReselectInput.click();
    });

    stubReselectInput.addEventListener("change", () => {
      const file = stubReselectInput.files?.[0] ?? null;
      cleanup();
      resolve(file);
    }, { once: true });
  });
}

async function openFromLibrary(bookId, options = {}) {
  clearArchiveWarnings();
  await pushCurrentBookSyncOnAction();
  showLoading();
  // ★追加: UI描画更新のために少し待機
  await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

  try {

    userOverrodeDirection = false;
    const info = storage.data.library[bookId];

    // ========================================
    // スタブエントリー: ファイル再選択フロー
    // ========================================
    if (info?.isLargeFileStub) {
      hideLoading();
      // ブラウザ標準のalertを削除し、専用のダイアログからファイル再選択を促す

      const file = await promptFileReselect(info);
      if (!file) {
        // キャンセル
        return;
      }
      showLoading();
      showStreamingNotice();
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

      // 軽量ハッシュで同一ファイルか検証（リトライ付き）
      const reHash = await fileHandler.readFileWithRetry(file,
        () => fileHandler.buildArchiveFingerprint(file));

      if (reHash !== info.contentHash) {
        hideLoading();
        alert(translate('stubHashMismatch', uiLanguage) ||
          "選択されたファイルは登録済みのファイルと一致しません。\n正しいファイルを選択してください。");
        return;
      }

      // 進捗の復元
      currentBookId = bookId;
      isBookLoading = true;
      currentBookInfo = info;
      resetLocalSaveTracking();
      currentCloudBookId = storage.getCloudBookId(bookId);

      const progress = await syncLogic.resolveSyncedProgress(bookId, uiLanguage, currentCloudBookId, pushCurrentBookSync);
      const normalizedProgress = normalizeProgressSnapshot(progress, info.type);
      const startPage = normalizedProgress?.location;

      // ストリーミングモードで閲覧を開始
      renderers.hideCloudEmptyState();
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      await reader.openImageBook(file, typeof startPage === "number" ? startPage : 0, info.type, { streaming: true });

      if (normalizedProgress) {
        await applyReadingState(normalizedProgress);
      }

      storage.addHistory(bookId);
      renderers.renderBookmarkMarkers();
      renderers.updateProgressBarDisplay();
      renderers.updateSearchButtonState();
      renderers.updateFloatingUIButtons();
      closeExclusiveMenus();
      if (floatVisible) {
        toggleFloatOverlay(false);
      }
      // スタブフロー正常完了: isBookLoading を解除し、ローディングを非表示にする
      isBookLoading = false;
      hideLoading();
      return;
    }

    // ========================================
    // 通常フロー: IndexedDB / OPFS から読み込み
    // ========================================
    const source = storage.getSettings().source || SYNC_SOURCES.LOCAL;
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
    if (!info) return;

    currentBookId = bookId;
    isBookLoading = true;
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
      console.time('[libraryLoad] openEpub');
      await reader.openEpub(file, {
        location: start,
        percentage: startProgress,
        epubViewMode: normalizedProgress?.epubViewMode || epubViewMode,
        writingMode: normalizedProgress?.writingMode || writingMode,
        pageDirection: normalizedProgress?.pageDirection || pageDirection,
      });
      console.timeEnd('[libraryLoad] openEpub');
    } else {
      // ... (既存のUI制御コード)
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      // 通常保存された画像書庫でも、現在の端末メモリに対して大きすぎる場合はストリーミングに切替
      const streamingNeeded = (info.type === BOOK_TYPES.ZIP) && fileHandler.shouldUseStreaming(file);
      await reader.openImageBook(file, typeof start === "number" ? start : 0, info.type, { streaming: streamingNeeded });
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
    closeExclusiveMenus();
    if (floatVisible) {
      toggleFloatOverlay(false);
    }
  } catch (error) {
    console.error(error);
    alert(`ライブラリからの読み込みに失敗しました:\n\n${error.message}`);
  } finally {
    isBookLoading = false;
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
  // 書籍ごとの記録がない場合はリーダーの自動検出値を優先し、検出もなければデフォルト設定を使用
  const targetWritingMode = progress?.writingMode || reader.writingMode || defaultWritingMode;
  const targetPageDirection = progress?.pageDirection || reader.pageDirection || defaultPageDirection;
  const targetImageViewMode = progress?.imageViewMode || defaultImageViewMode;
  const targetEpubViewMode = progress?.epubViewMode || reader.epubViewMode || epubViewMode;

  // 1. 書字方向・開き方向の復元
  writingMode = targetWritingMode;
  if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;

  pageDirection = targetPageDirection;
  if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;

  // 1.5. 両方を適用（リーダー本体への反映）
  // 呼び出し元(handleFile/openFromLibrary)がloadingを管理するためスキップ
  // 初期化時の状態適用ではストレージ・クラウドへの再保存を抑制する（位置の上書きを防止）
  await applyReadingSettings(writingMode, pageDirection, { skipLoadingOverlay: true, ignoreForce: true });

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

  // 2.6. EPUB表示モードの復元
  if (reader && reader.type === BOOK_TYPES.EPUB) {
    // 初回ロード時は reader 側にすでに正しい値を渡して初期化しているため、強制上書き(force=true)でのパジネーション再構築を防ぐ。
    // UIの更新だけ行うため ignoreReaderUpdate を true にする。
    await applyEpubViewMode(targetEpubViewMode, false, true);
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
      epubViewMode,
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




async function handleBookReady(payload) {
  if (!currentBookInfo || !payload) return;

  const metadata = payload.metadata ?? payload;
  const toc = Array.isArray(payload.toc) ? payload.toc : [];
  currentToc = toc;

  // 方向判定とUI更新
  // 方向判定とUI更新
  if (currentBookInfo.type === BOOK_TYPES.EPUB) {
    const settings = storage.getSettings();
    const progress = storage.getProgress(currentBookId);

    // 優先順位: 1. 個別保存設定 > 2. メタデータ/自動判別 > 3. ユーザーデフォルト
    let targetPageDirection = progress?.pageDirection;
    let targetWritingMode = progress?.writingMode;
    let targetEpubViewMode = progress?.epubViewMode;

    // 1. 個別設定がない場合、メタデータまたはリーダーの自動判別値をチェック
    if (!targetPageDirection) {
      targetPageDirection = payload.direction || metadata.direction;
    }
    if (!targetWritingMode) {
      targetWritingMode = payload.writingMode;
    }

    // 2. まだ決まっていない場合、デフォルト設定を使用
    if (!targetPageDirection) {
      targetPageDirection = settings.defaultPageDirection;
    }
    if (!targetWritingMode) {
      targetWritingMode = settings.defaultWritingMode;
    }
    if (!targetEpubViewMode) {
      targetEpubViewMode = settings.epubViewMode;
    }

    // 適用
    if (!userOverrodeDirection) {
      // 本来の仕様では保存された progress が最優先だが、
      // ページ分割完了前に保存された default 値 (ltr) などのノイズを回避するため、
      // 保存値が default かつ リーダーが rtl を検出した場合は、検出値を優先する
      if (!progress?.pageDirection && payload.direction) {
        targetPageDirection = payload.direction;
      }
      if (!progress?.writingMode && payload.writingMode) {
        targetWritingMode = payload.writingMode;
      }

      pageDirection = targetPageDirection;
      writingMode = targetWritingMode || writingMode;
      epubViewMode = targetEpubViewMode || epubViewMode;

      if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;
      if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;
      if (elements.settingsEpubViewMode) elements.settingsEpubViewMode.value = epubViewMode;

      // 初期化時の状態適用 (リーダー側ではパジネーションはすでに走っているため ignoreReaderUpdate = true)
      await applyReadingSettings(writingMode, pageDirection, { skipLoadingOverlay: true, ignoreForce: true });
      await applyEpubViewMode(epubViewMode, false, true);
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

  // locations生成は初期ロード時のメインスレッドブロックを避けるため無効化
  // 進捗表示はページベースの計算にフォールバックする
  if (currentBookInfo.type === BOOK_TYPES.EPUB) {

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
    bookmark.updatedAt = Date.now();
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
  console.log(`[Search] performSearch called target: "${query}"`);
  if (!query || !currentBookId || currentBookInfo?.type !== BOOK_TYPES.EPUB || !reader.book) {
    console.warn("[Search] Aborting: Missing query, book ID, EPUB type, or reader.book");
    return [];
  }

  if (elements.searchResults) {
    elements.searchResults.innerHTML = `<div class="search-loading">${t("searchLoading")}</div>`;
  }

  try {
    const searchResults = [];
    const spine = reader.book.spine;
    const locations = reader.book.locations;

    console.log(`[Search] Starting search across ${spine?.length || 0} spine items.`);

    // 各セクションを検索
    for (let i = 0; i < spine.length; i++) {
      const item = spine.get(i);

      try {
        console.log(`[Search] Loading section ${i}: ${item.href}`);
        // セクションを読み込む
        await item.load(reader.book.load.bind(reader.book));

        const doc = item.document || item.contents?.document;
        if (!doc) {
          console.warn(`[Search] Skipping section ${i}: No document available.`);
          continue;
        }

        // リーダー側のテキスト全抽出・セグメント計算機能を使用
        const spineItem = reader.spineItems?.[i];
        if (!spineItem) {
          item.unload();
          continue;
        }

        const matches = reader.findSearchMatchesInSpine(spineItem, query);

        // 結果を追加
        for (const match of matches) {
          // CFIを生成（セクションの開始位置を使用）
          const cfi = item.cfiBase;

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
            segmentIndex: match.segmentIndex,
          });
        }

        // メモリリークを防ぐためにセクションをアンロード
        item.unload();

      } catch (error) {
        console.warn(`[Search] Failed to search in section ${item.href}:`, error);
      }
    }

    console.log(`[Search] Search complete. Found ${searchResults.length} results.`);
    return searchResults;
  } catch (error) {
    console.error('[Search] Search processing failed entirely:', error);
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
  saveCurrentProgress({ force: true });
  requestCloudSyncIfNeeded({ force: true });
}

// 移行済み: updateThemeToggleIcon

function applyFontSize(nextSize) {
  if (!Number.isFinite(nextSize)) return;
  const clamped = Math.min(READER_CONFIG.FONT_SIZE_MAX, Math.max(READER_CONFIG.FONT_SIZE_MIN, Math.round(nextSize)));
  fontSize = clamped;
  reader.applyFontSize(fontSize);
  storage.setSettings({ fontSize });
  persistReadingState({ fontSize });
  saveCurrentProgress({ force: true });
  requestCloudSyncIfNeeded({ force: true });
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
  if (elements.dropText) elements.dropText.textContent = strings.dropText;
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
  setFloatLabel(elements.floatPrevBook, UI_ICONS.AREA_LEFT, strings.menuPrevBook);
  setFloatLabel(elements.floatNextBook, UI_ICONS.AREA_RIGHT, strings.menuNextBook);
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
  // 巻ナビゲーションラベルの更新

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
  if (elements.settingsDefaultImageViewModeLabel) elements.settingsDefaultImageViewModeLabel.textContent = strings.settingsDefaultImageViewModeLabel;
  if (elements.settingsEpubViewModeLabel) elements.settingsEpubViewModeLabel.textContent = strings.settingsEpubViewModeLabel;
  if (elements.progressDisplayModeLabel) elements.progressDisplayModeLabel.textContent = strings.progressDisplayModeLabel;
  if (elements.writingModeLabel) elements.writingModeLabel.textContent = strings.writingModeLabel;
  if (elements.pageDirectionLabel) elements.pageDirectionLabel.textContent = strings.pageDirectionLabel;
  if (elements.progressDisplayModeLabel) elements.progressDisplayModeLabel.textContent = strings.progressDisplayModeLabel;
  if (elements.deviceIdLabel) elements.deviceIdLabel.textContent = strings.deviceIdLabel;
  if (elements.deviceColorLabel) elements.deviceColorLabel.textContent = strings.deviceColorLabel;
  if (elements.deviceNameLabel) elements.deviceNameLabel.textContent = strings.deviceNameLabel;
  if (elements.settingsOneBookmarkPerBookLabel) {
    elements.settingsOneBookmarkPerBookLabel.textContent = strings.settingsOneBookmarkPerBookLabel;
  }
  if (elements.settingsOneBookmarkPerBook) {
    elements.settingsOneBookmarkPerBook.checked = !!oneBookmarkPerBook;
  }

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
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === "single") options[i].text = strings.spreadModeSingle;
      if (options[i].value === "spread") options[i].text = strings.spreadModeDouble;
    }
  }

  if (elements.settingsEpubViewMode) {
    const options = elements.settingsEpubViewMode.options;
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === "paginated") options[i].text = strings.epubViewModePaginated;
      if (options[i].value === "scroll") options[i].text = strings.epubViewModeScroll;
    }
    elements.settingsEpubViewMode.value = epubViewMode;
  }

  if (elements.progressDisplayModeSelect) {
    const options = elements.progressDisplayModeSelect.options;
    if (options[0]) options[0].textContent = strings.progressDisplayPage;
    if (options[1]) options[1].textContent = strings.progressDisplayPercentage;
  }
  if (elements.fontPlus) elements.fontPlus.textContent = strings.fontIncreaseLabel;
  if (elements.fontMinus) elements.fontMinus.textContent = strings.fontDecreaseLabel;

  renderers.updateWritingModeToggleLabel();
  renderers.updateReadingDirectionEpubButtonLabel();
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

async function applyReadingSettings(nextWritingMode, nextPageDirection, options = {}) {
  const { skipLoadingOverlay = false, ignoreForce = false } = options;
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

  // ローディング表示を追加し、レンダリングを待機
  // skipLoadingOverlay: 初回ブック読込中（handleBookReady経由）では
  // 呼び出し元がloadingを管理するためスキップする
  const isEpubOpen = currentBookInfo?.type === BOOK_TYPES.EPUB;
  const manageLoading = isEpubOpen && !options.skipLoadingOverlay;
  if (manageLoading) {
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
    if (!ignoreForce) {
      saveCurrentProgress({ force: true });
      requestCloudSyncIfNeeded({ force: true });
    }
  } catch (error) {
    console.error("Failed to apply reading settings:", error);
  } finally {
    if (manageLoading) {
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

/**
 * EPUB表示モードの適用と保存
 */
async function applyEpubViewMode(mode, force = false, ignoreReaderUpdate = false) {
  const modeChanged = epubViewMode !== mode;
  if (!modeChanged && !force && (!reader || reader.epubViewMode === mode)) return;

  if (modeChanged) {
    epubViewMode = mode;
    storage.setSettings({ epubViewMode: mode });
  }

  if (reader && reader.type === BOOK_TYPES.EPUB) {
    // スクロールモード選択時は強制的に「横書き」にする
    let needsWritingModeUpdate = false;
    if (mode === 'scroll' && writingMode !== WRITING_MODES.HORIZONTAL) {
      writingMode = WRITING_MODES.HORIZONTAL;
      storage.setSettings({ writingMode });
      if (elements.writingModeSelect) {
        elements.writingModeSelect.value = writingMode;
      }
      needsWritingModeUpdate = true;
    }

    // 設定変更扱いとしてメニューを閉じる
    closeExclusiveMenus();

    if (ignoreReaderUpdate) {
      // 初期化時等、UIのみ更新しリーダーの再パジネーションは実行しない
      if (reader) reader.epubViewMode = mode;
    } else {
      // スクロールモード・ページめくりモードの切替時には再度パジネーションが必要になるため、
      // 現在位置を保存してからリパジネーションを実行する。
      showLoading();
      try {
        if (needsWritingModeUpdate) {
          // applyReadingSettingsの中でreader.applyReadingDirectionが呼ばれ、
          // そこで新しい epubViewMode に基づいたパジネーションが1回だけ実行される。
          await applyReadingSettings(writingMode, null);
        }

        // 設定変更扱いとして再描画・UIクラス適用・位置復元
        // reader.applyEpubViewMode内部で二重パジネーションのガードが行われる
        if (reader && reader.applyEpubViewMode) {
          await reader.applyEpubViewMode(mode, force);
        }

        // 個別書籍の状態としても保存
        persistReadingState({ epubViewMode: mode });
      } finally {
        hideLoading();
      }
    }
  }

  // スクロールモード時は縦横切替ボタンを無効化
  if (elements.toggleWritingMode) {
    if (mode === 'scroll') {
      elements.toggleWritingMode.classList.add('disabled');
      elements.toggleWritingMode.style.opacity = '0.5';
      elements.toggleWritingMode.style.cursor = 'not-allowed';
    } else {
      elements.toggleWritingMode.classList.remove('disabled');
      elements.toggleWritingMode.style.opacity = '';
      elements.toggleWritingMode.style.cursor = '';
    }
  }
}

/**
 * テーマ適用
 */


async function pushCurrentBookSync(options = {}) {
  const { force = false } = options;
  if (isBookLoading && !force) return false;
  // 送信前に現在の状態を強制保存
  saveCurrentProgress({ force: true });
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

async function pushCurrentBookSyncOnAction(options = {}) {
  const { force = false } = options;
  try {
    const progressSnapshot = getProgressSnapshot();
    saveCurrentProgress({ progressSnapshot, force });
    await requestCloudSyncIfNeeded({ progressSnapshot, force });
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
  void pushCurrentBookSyncOnAction({ force: true });
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
    multiple: true,
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
      const fileHandles = await window.showOpenFilePicker(buildFilePickerOptions());
      if (fileHandles.length === 0) return;

      const fileHandle = fileHandles[0];
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
    elements.menuOpen.addEventListener('click', (e) => {
      console.log('[menuOpen] Clicked!');
      e.stopPropagation();
      e.preventDefault();
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
    elements.menuBookmarks.addEventListener('click', (e) => {
      console.log('[menuBookmarks] Clicked!');
      // イベントの伝播を防ぎ、背後の要素が誤認されるゴーストクリックを防止
      e.stopPropagation();
      e.preventDefault();
      showBookmarks();
    });
  }

  if (elements.menuHistory) {
    elements.menuHistory.addEventListener('click', () => {
      console.log('[menuHistory] Clicked!');
      showHistory();
    });
  }

  elements.floatOpen?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    openFileDialog();
  });

  elements.floatLibrary?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showLibrary();
  });

  elements.floatSearch?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
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
    // スクロールモード中は「縦書き」への切り替えを禁止
    if (epubViewMode === 'scroll') {
      alert(t("verticalScrollDisabled") || "シームレススクロール中は横書き固定となります");
      return;
    }

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
    if (epubViewMode === 'scroll' && e.target.value === WRITING_MODES.VERTICAL) {
      alert(t("verticalScrollDisabled") || "シームレススクロール中は横書き固定となります");
      e.target.value = WRITING_MODES.HORIZONTAL;
      return;
    }
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

  elements.settingsOneBookmarkPerBook?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    oneBookmarkPerBook = enabled;
    storage.setSettings({ oneBookmarkPerBook: enabled });
  });

  // PWA Install Button
  elements.installButton?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to the install prompt: ${outcome}`);
    deferredPrompt = null;
    renderers.updateInstallButton(false);
  });

  elements.settingsEpubViewMode?.addEventListener('change', (e) => {
    applyEpubViewMode(e.target.value);
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
  elements.manualSyncButton?.addEventListener('click', async () => {
    const authStatus = checkAuthStatus();
    if (!authStatus.authenticated) {
      if (elements.syncStatus) {
        elements.syncStatus.textContent = t('syncNeedsLoginStatus');
        renderers.setStatusClass(elements.syncStatus, UI_CLASSES.STATUS_ERROR);
      }
      return;
    }

    try {
      const settings = storage.getSettings();
      const resolvedSource = cloudSync.resolveSource(null, settings);
      if (resolvedSource !== SYNC_SOURCES.D1) {
        console.log('[manualSync] Enforcing D1 source for manual sync');
        storage.setSettings({ source: SYNC_SOURCES.D1 });
      }

      elements.manualSyncButton.disabled = true;
      elements.manualSyncButton.textContent = t('syncInProgress');
      if (elements.syncStatus) {
        elements.syncStatus.textContent = t('syncStarting');
        renderers.setStatusClass(elements.syncStatus, UI_CLASSES.STATUS_NEUTRAL);
      }

      // 送信前に現在の進捗を強制保存（最新状態を同期するため）
      saveCurrentProgress({ force: true });

      // クラウドからインデックスをプル
      await syncLogic.syncAllBooksFromCloud(uiInitialized, bookmarkMenuMode);

      // 開いている本があればその状態をプッシュ
      if (currentBookId && currentCloudBookId) {
        await syncLogic.pushCurrentBookSync(currentBookId, currentCloudBookId);
      }

      // SSOT: 同期完了後の最終的な永続化
      storage.save();

      if (elements.syncStatus) {
        elements.syncStatus.textContent = `${UI_ICONS.CHECK_MARK} ${t('syncCompleted')}`;
        renderers.setStatusClass(elements.syncStatus, UI_CLASSES.STATUS_SUCCESS);
        setTimeout(() => {
          elements.syncStatus.textContent = '';
          renderers.setStatusClass(elements.syncStatus, null);
        }, TIMING_CONFIG.STATUS_MESSAGE_DISPLAY_MS);
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
      if (elements.syncStatus) {
        let userMessage = t('syncFailed');
        let detailMessage = error.message;

        if (error.code === 'unavailable' ||
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('Network Error')) {
          userMessage = t('syncBlocked');
          detailMessage = t('syncBlockedDetail');
        } else if (error.code === 'permission-denied') {
          userMessage = t('syncPermissionError');
          detailMessage = t('syncPermissionDetail');
        }

        elements.syncStatus.textContent = `${UI_ICONS.ERROR_MARK} ${userMessage}`;
        renderers.setStatusClass(elements.syncStatus, UI_CLASSES.STATUS_ERROR);

        alert(`${userMessage}\n\n${detailMessage}\n\n${t('errorDetail')}: ${error.message}`);
      }
    } finally {
      if (elements.manualSyncButton) {
        elements.manualSyncButton.disabled = false;
        elements.manualSyncButton.textContent = t('syncNowButton');
      }
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
    renderers.renderSearchResults(results, query);
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

  // (※ epubScrollCenterClick のリスナーは二重トグルの原因となり削除済)

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

    // EPUBのスクロールモード時はネイティブのスクロールを優先するため、ページめくりはしない
    if (epubViewMode === 'scroll' && reader && reader.type === BOOK_TYPES.EPUB) {
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

    // EPUBでスクロールモードの場合は、コンテナの端に到達しているか判定する
    if (epubViewMode === 'scroll' && reader && reader.type === BOOK_TYPES.EPUB && reader.viewer) {
      const viewer = reader.viewer;
      const isVertical = reader.writingMode === WRITING_MODES.VERTICAL;
      const isRtl = pageDirection === READING_DIRECTIONS.RTL;

      let isAtStart = false;
      let isAtEnd = false;
      // scrollLeft / scrollTop 等は小数点を含む場合があるため、余裕を持たせた判定(5px)を行う
      const threshold = 5;

      if (isVertical) {
        // 縦書き
        const scrollAbs = Math.abs(viewer.scrollLeft);
        const maxScroll = Math.max(0, viewer.scrollWidth - viewer.clientWidth);

        // writing-mode: vertical-rl の実装では scrollLeft が 0 の時が右端（開始）、そこから負に広がる
        if (viewer.scrollLeft === 0 || scrollAbs <= threshold) {
          isAtStart = true;
        } else if (scrollAbs >= maxScroll - threshold) {
          isAtEnd = true;
        }

        const wheelDir = event.deltaY > 0 ? 1 : (event.deltaY < 0 ? -1 : 0);

        // コンテナ端でなければネイティブスクロール（横）に変換
        if (wheelDir !== 0 && !isAtStart && !isAtEnd) {
          event.preventDefault();
          viewer.scrollBy({ left: -wheelDir * 60, behavior: 'auto' });
          return;
        } else if (wheelDir !== 0) {
          // 端にいる場合でも、さらにその方向へスクロールしようとした時だけページ遷移、逆ならスクロール
          if (wheelDir < 0) { // 上へ（前へ）
            if (isAtStart) {
              // スクロール端での自動遷移を廃止
              console.log('[Wheel] At start, ignoring scroll-up transition');
            } else {
              event.preventDefault();
              viewer.scrollBy({ left: -wheelDir * 60, behavior: 'auto' });
            }
          } else if (wheelDir > 0) { // 下へ（次へ）
            if (isAtEnd) {
              // スクロール端での自動遷移を廃止
              console.log('[Wheel] At end, ignoring scroll-down transition');
            } else {
              event.preventDefault();
              viewer.scrollBy({ left: -wheelDir * 60, behavior: 'auto' });
            }
          }
          return;
        }
      } else {
        // 横書き (上から下へスクロール)
        isAtStart = Math.floor(viewer.scrollTop) <= threshold;
        isAtEnd = Math.ceil(viewer.scrollTop) >= viewer.scrollHeight - viewer.clientHeight - threshold;

        const wheelDir = event.deltaY > 0 ? 1 : (event.deltaY < 0 ? -1 : 0);
        if (wheelDir !== 0) {
          // スロール開始位置で上（前）に戻ろうとした場合
          if (wheelDir < 0 && isAtStart) {
            // スクロール端での自動遷移を廃止
            console.log('[Wheel] At top, ignoring scroll-up transition');
          }
          // スクロール終端で下（次）に進もうとした場合
          else if (wheelDir > 0 && isAtEnd) {
            // スクロール端での自動遷移を廃止
            console.log('[Wheel] At bottom, ignoring scroll-down transition');
          }
        }
        return; // コンテナ端でなければネイティブスクロールに任せる
      }
    }

    // 通常のページめくりモード
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



    const isEpubScroll = epubViewMode === 'scroll' && reader && reader.type === BOOK_TYPES.EPUB;
    const isVertical = reader && reader.writingMode === WRITING_MODES.VERTICAL;
    const isRtl = pageDirection === READING_DIRECTIONS.RTL;

    switch (e.key) {
      case 'ArrowLeft':
        if (isEpubScroll && !isVertical) return; // 横書きのスクロールでは左右キーは無視
        if (isEpubScroll && isVertical) {
          // 縦書きスクロール時の左キー（通常は下のテキストへ＝次のページ方向）
          // （ネイティブスクロールに任せるためデフォルトアクションを妨げない）
          return;
        }
        if (pageDirection === READING_DIRECTIONS.RTL) {
          if (isEpubScroll && isVertical) return;
          reader.next(); // 右開きの場合、左キーで次ページ
        } else {
          if (isEpubScroll && isVertical) return;
          reader.prev();
        }
        break;
      case 'ArrowRight':
        if (isEpubScroll && !isVertical) return;
        if (isEpubScroll && isVertical) {
          return;
        }
        if (pageDirection === READING_DIRECTIONS.RTL) {
          if (isEpubScroll && isVertical) return;
          reader.prev(); // 右開きの場合、右キーで前ページ
        } else {
          if (isEpubScroll && isVertical) return;
          reader.next();
        }
        break;
      case 'ArrowUp':
        if (isEpubScroll) return;
        reader.prev();
        break;
      case 'ArrowDown':
        if (isEpubScroll) return;
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
    void pushCurrentBookSyncOnAction({ force: true });
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

  // 全画面状態が変わった時にボタンラベルを更新
  // リペジネーションは window.resize イベント経由で自動的にトリガーされる
  // （ui.js の setupResizeHandler → onResize → reader.handleResize）
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

  // ========================================
  // ドラッグ＆ドロップ (D&D) イベント
  // ========================================

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add(UI_CLASSES.IS_FILE_DRAGGING);
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 画面外または子要素への移動で判定が揺れるのを防ぐため、relatedTargetをチェック
    if (!e.relatedTarget) {
      document.body.classList.remove(UI_CLASSES.IS_FILE_DRAGGING);
    }
  });

  // オーバーレイ自体からも離脱判定（子要素対策）
  elements.dropOverlay?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove(UI_CLASSES.IS_FILE_DRAGGING);
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove(UI_CLASSES.IS_FILE_DRAGGING);

    const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
    if (droppedFiles.length > 0) {
      handleFile(droppedFiles[0]);
    }
  });

  // PWA Install Event Listeners
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    renderers.updateInstallButton(true);
    console.log('[PWA] beforeinstallprompt event fired');
  });

  window.addEventListener('appinstalled', (event) => {
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    renderers.updateInstallButton(false);
    console.log('[PWA] App was installed');
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

// auth:login リスナーを上部の初期化フローに移動したため、ここは削除

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
