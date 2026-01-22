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
import { UI_STRINGS, getUiStrings, t as translate, tReplace, DEFAULT_LANGUAGE, formatRelativeTime } from "./i18n.js";
import {
  APP_INFO,
  ERROR_CODES,
  ERROR_MESSAGE_MATCHERS,
  MIME_TYPES,
  SUPPORTED_FORMATS,
  TIMING_CONFIG,
  PROGRESS_CONFIG,
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
  DOM_IDS,
  DOM_SELECTORS,
  CSS_VARS,
  ASSET_PATHS,
  READER_CONFIG,
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
let defaultDirection = settings.defaultDirection ?? UI_DEFAULTS.defaultDirection;
let autoSyncEnabled = false;
let libraryViewMode = settings.libraryViewMode ?? UI_DEFAULTS.libraryViewMode;
let autoSyncInterval = null;
let autoSyncTimeout = null;
let bookmarkMenuMode = UI_DEFAULTS.bookmarkMenuMode;
let currentToc = [];
let uiInitialized = false;
let floatVisible = false;
let googleLoginReady = false;
let userOverrodeDirection = false;
// ライブラリで削除マークが付いた書籍のID（メニューを閉じた時に実際に削除）
// Map<string, { id: string, type: 'local' | 'cloud' }>
let pendingDeletes = new Map();

// UI_STRINGS は i18n.js からインポート済み

// 1. Lottieアニメーションデータ（外部JSONから読み込み）
let LOADER_ANIMATION_DATA = null;

// Lottieアニメーションデータを非同期で読み込む
async function loadLottieAnimationData() {
  if (LOADER_ANIMATION_DATA) return LOADER_ANIMATION_DATA;

  try {
    const response = await fetch(ASSET_PATHS.LOADER_ANIMATION);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    LOADER_ANIMATION_DATA = await response.json();
    return LOADER_ANIMATION_DATA;
  } catch (e) {
    console.warn('Failed to load Lottie animation data:', e);
    return null;
  }
}

// 2. ローディング制御用変数と関数
let lottieInstance = null;

async function initLoadingAnimation() {
  const container = document.getElementById(DOM_IDS.LOTTIE_LOADER);
  if (!container) return;

  // lottieが読み込まれているか確認
  if (typeof lottie === 'undefined') {
    console.warn('Lottie library not loaded.');
    return;
  }

  // 外部JSONからLottieデータを読み込む
  const animationData = await loadLottieAnimationData();
  if (!animationData) {
    console.warn('Lottie animation data (LOADER_ANIMATION_DATA) is missing.');
    return;
  }

  // ★追加: 背景レイヤー('bkgr')を削除して透過させる
  if (animationData.layers) {
    animationData.layers = animationData.layers.filter(layer => layer.nm !== 'bkgr');
  }

  try {
    lottieInstance = lottie.loadAnimation({
      container: container,
      renderer: 'svg',
      loop: true,
      autoplay: false, // 表示されるまで再生しない
      animationData: animationData
    });
  } catch (e) {
    console.error('Failed to initialize Lottie animation:', e);
  }
}

function showLoading() {
  const overlay = document.getElementById(DOM_IDS.LOADING_OVERLAY);
  if (overlay) {
    overlay.classList.add(UI_CLASSES.VISIBLE);
    lottieInstance?.play();
  }
}

function hideLoading() {
  const overlay = document.getElementById(DOM_IDS.LOADING_OVERLAY);
  if (overlay) {
    overlay.classList.remove(UI_CLASSES.VISIBLE);
    lottieInstance?.stop(); // 非表示時は停止してリソース節約
  }
}

// 初期化実行（非同期Lottie読み込み対応）
document.addEventListener('DOMContentLoaded', async () => {
  await initLoadingAnimation();
});


// i18n.js からインポートした関数をラップ（uiLanguage変数を参照するため）
function t(key) {
  return translate(key, uiLanguage);
}

function resolveErrorCode(error) {
  if (!error?.message) return null;
  const entries = Object.entries(ERROR_MESSAGE_MATCHERS);
  for (const [code, matchers] of entries) {
    if (matchers.some((matcher) => error.message.includes(matcher))) {
      return code;
    }
  }
  return null;
}



// ========================================



// ========================================
// 進捗保存（デバウンス処理）
// ========================================

let saveProgressTimeout;
function saveProgressDebounced() {
  clearTimeout(saveProgressTimeout);
  saveProgressTimeout = setTimeout(() => {
    saveCurrentProgress();
  }, 1000);
}

function saveCurrentProgress() {
  if (!currentBookId) return;

  let progressData = null;

  if (reader.type === BOOK_TYPES.EPUB) {
    const pageIndex = (typeof reader.currentPageIndex === 'object' && reader.currentPageIndex !== null) ? (reader.currentPageIndex.index ?? reader.currentPageIndex.pageIndex ?? 0) : Number(reader.currentPageIndex || 0);
    const total = reader.pagination?.pages?.length || 0;

    // CFIの取得（ページオブジェクトから）
    let cfi = null;
    if (reader.pagination?.pages?.[pageIndex]) {
      cfi = reader.pagination.pages[pageIndex].cfi;
    }

    const percentage = total > 1 ? (pageIndex / (total - 1)) * 100 : 0;

    progressData = {
      percentage,
      location: cfi,
      updatedAt: Date.now()
    };
  } else {
    // 画像書庫
    const index = (typeof reader.imageIndex === 'object' && reader.imageIndex !== null) ? (reader.imageIndex.index ?? 0) : Number(reader.imageIndex || 0);
    const total = reader.imagePages.length;
    const percentage = total > 1 ? (index / (total - 1)) * 100 : 0;

    progressData = {
      percentage,
      location: index,
      updatedAt: Date.now()
    };
  }

  if (progressData) {
    storage.setProgress(currentBookId, progressData);

    // 自動同期トリガー（関数が存在する場合のみ）
    if (typeof triggerAutoSync === 'function' && typeof isCloudSyncEnabled === 'function' && isCloudSyncEnabled() && autoSyncEnabled) {
      triggerAutoSync();
    }
  }
}

// ========================================
// リーダーコントローラー初期化
// ========================================

const reader = new ReaderController({
  viewerId: "viewer",
  imageViewerId: "imageViewer",
  imageElementId: "pageImage",
  pageIndicatorId: "pageIndicator",
  onProgress: (currentIndex, totalPages) => {
    ui.updateProgress(currentIndex, totalPages);
    saveProgressDebounced();
  },
  onReady: (data) => {
    // 起動時の初期化関連
    if (data.metadata) {
      document.title = data.metadata.title
        ? `${data.metadata.title} - ${APP_INFO.NAME}`
        : APP_INFO.NAME;
    }
    // 進捗バーの向きを更新
    updateProgressBarDirection();
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
}

// 初期化時に実行
applyCssVariablesFromConfig();

// ========================================
// UIコントローラー初期化
// ========================================

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
    toggleFloatOverlay();
  },
  onResize: () => {
    // リサイズ時のリペジネーション (EPUBのみ)
    reader.handleResize?.();
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

      renderBookmarks(bookmarkMenuMode);
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

function updateSearchButtonState() {
  if (!elements.menuSearch) return;

  const isEpubOpen = currentBookId && currentBookInfo?.type === BOOK_TYPES.EPUB;
  elements.menuSearch.disabled = !isEpubOpen;
  if (elements.openToc) {
    elements.openToc.disabled = !isEpubOpen;
  }
  if (elements.floatSearch) {
    elements.floatSearch.disabled = !isEpubOpen;
  }
}

function setElementVisibility(element, isVisible) {
  if (!element) return;
  element.classList.toggle(UI_CLASSES.HIDDEN, !isVisible);
}

function setStatusClass(element, statusClass) {
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

function setMaterialIconLabel(button, iconName, labelText) {
  if (!button) return;
  const icon = document.createElement("span");
  icon.className = UI_CLASSES.MATERIAL_ICON;
  icon.textContent = iconName;
  const label = document.createTextNode(` ${labelText}`);
  button.replaceChildren(icon, label);
}

// フローティングUIの切替ボタン表示を更新
function updateFloatingUIButtons() {
  // 画像書庫かどうかを判定 (type が "zip" または "rar")
  const isImageBook = currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR);
  const isEpub = currentBookInfo && currentBookInfo.type === BOOK_TYPES.EPUB;
  const isBookOpen = currentBookId !== null;

  // 目次ボタン (#openToc)
  // 書籍（EPUB）が開かれていない状態では無効化
  if (elements.openToc) {
    elements.openToc.disabled = !isEpub;
  }

  // 縦/横書き切替ボタン: 常に表示するが、EPUB以外では無効化
  if (elements.toggleWritingMode) {
    setElementVisibility(elements.toggleWritingMode, true);
    elements.toggleWritingMode.disabled = !isEpub;
  }

  // 見開き/単ページ切替ボタン: 画像書庫のみ表示
  if (elements.toggleSpreadMode) {
    setElementVisibility(elements.toggleSpreadMode, isImageBook);
    updateSpreadModeButtonLabel();
  }

  // 左開き/右開き切替ボタン
  if (elements.toggleReadingDirectionEpub) {
    if (isEpub) {
      setElementVisibility(elements.toggleReadingDirectionEpub, true);
      // 【修正】横書きでも開き方向（操作方向）の変更を許可するため、無効化ロジックを削除
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

  // ズームボタン: ブックが開いている時のみ表示
  if (elements.toggleZoom) {
    setElementVisibility(elements.toggleZoom, isBookOpen);
    updateZoomButtonLabel();
  }

  // プログレスバーの矢印: 画像書庫のみ表示
  if (elements.progressPrev) {
    elements.progressPrev.classList.toggle(UI_CLASSES.HIDDEN, !isImageBook);
  }
  if (elements.progressNext) {
    elements.progressNext.classList.toggle(UI_CLASSES.HIDDEN, !isImageBook);
  }

  // 進捗バーの方向を更新
  updateProgressBarDirection();
}

function handleToggleZoom() {
  // ズーム切替
  const isZoomed = reader.toggleZoom();

  // Bodyにクラス適用（UI制御用）
  if (isZoomed) {
    document.body.classList.add(UI_CLASSES.IS_ZOOMED);
  } else {
    document.body.classList.remove(UI_CLASSES.IS_ZOOMED);
  }

  updateZoomButtonLabel();
}

// 見開きボタンのラベルを更新
function updateSpreadModeButtonLabel() {
  if (!elements.toggleSpreadMode) return;
  const isSpread = reader.imageViewMode === IMAGE_VIEW_MODES.SPREAD;

  if (isSpread) {
    setMaterialIconLabel(elements.toggleSpreadMode, UI_ICONS.SPREAD_DOUBLE, t('spreadModeDouble'));
    elements.toggleSpreadMode.classList.add(UI_CLASSES.ACTIVE);
  } else {
    setMaterialIconLabel(elements.toggleSpreadMode, UI_ICONS.SPREAD_SINGLE, t('spreadModeSingle'));
    elements.toggleSpreadMode.classList.remove(UI_CLASSES.ACTIVE);
  }
}

// 左開き/右開きボタンのラベルを更新 (画像用)
function updateReadingDirectionButtonLabel() {
  if (!elements.toggleReadingDirectionImage) return;
  const isRtl = reader.imageReadingDirection === READING_DIRECTIONS.RTL;
  elements.toggleReadingDirectionImage.textContent = isRtl ? t('pageDirectionRtlButton') : t('pageDirectionLtrButton');
  elements.toggleReadingDirectionImage.title = isRtl ? t("readingDirectionRtlTitle") : t("readingDirectionLtrTitle");
}

// 左開き/右開きボタンのラベルを更新 (EPUB用)
function updateReadingDirectionEpubButtonLabel() {
  if (!elements.toggleReadingDirectionEpub) return;
  const isRtl = pageDirection === READING_DIRECTIONS.RTL;
  elements.toggleReadingDirectionEpub.textContent = isRtl ? t('pageDirectionRtlButton') : t('pageDirectionLtrButton');
  elements.toggleReadingDirectionEpub.title = isRtl ? t("readingDirectionRtlTitle") : t("readingDirectionLtrTitle");
}

// ズームボタンのラベルを更新
function updateZoomButtonLabel() {
  if (!elements.toggleZoom) return;
  const isZoomed = reader.imageZoomed;
  elements.toggleZoom.textContent = isZoomed ? UI_ICONS.ZOOM_OUT : UI_ICONS.ZOOM_IN;
  elements.toggleZoom.title = isZoomed ? t("zoomOutTitle") : t("zoomInTitle");
}

// 進捗バーの方向を更新（RTL時は反転）
function updateProgressBarDirection() {
  const isImageBook = currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR);
  let isRtl = false;

  if (isImageBook) {
    isRtl = reader.imageReadingDirection === READING_DIRECTIONS.RTL;
  } else if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
    isRtl = pageDirection === READING_DIRECTIONS.RTL;
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

  // [追加] 画像ビューア自体のRTLクラス切替 (スプレッド表示の順序制御用)
  if (elements.imageViewer) {
    if (isRtl) {
      elements.imageViewer.classList.add(UI_CLASSES.RTL_MODE);
    } else {
      elements.imageViewer.classList.remove(UI_CLASSES.RTL_MODE);
    }
  }
}

function updateAuthStatusDisplay() {
  if (!elements.userInfo) return;
  const authStatus = checkAuthStatus();
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
  syncAutoSyncPolicy(authStatus);
}

function updateSyncStatusDisplay(authStatus = checkAuthStatus()) {
  if (elements.syncStatus) {
    if (!authStatus.authenticated) {
      elements.syncStatus.textContent = t("syncNeedsLogin");
      return;
    }
    const lastSyncAt = storage.getSettings().lastSyncAt;
    if (!lastSyncAt) {
      elements.syncStatus.textContent = t("syncStatusNever");
      return;
    }
    const timeText = formatRelativeTime(lastSyncAt, uiLanguage);
    elements.syncStatus.textContent = t("syncStatusLabel").replace("{time}", timeText || "--");
  }
}

function toggleFloatOverlay(forceVisible) {
  // ズーム中はフローティングメニュー制御を完全に無視
  if (document.body.classList.contains(UI_CLASSES.IS_ZOOMED)) {
    return;
  }

  if (!elements.floatOverlay) return;
  const nextVisible = typeof forceVisible === "boolean" ? forceVisible : !floatVisible;
  floatVisible = nextVisible;
  elements.floatOverlay.classList.toggle(UI_CLASSES.VISIBLE, floatVisible);

  if (floatVisible) {
    updateFloatingUIButtons();
  }

  updateProgressBarDisplay();
}

function updateFloatProgressBar(percentage) {
  if (!elements.floatProgress || !floatVisible) return;
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

// ========================================
// ローディングオーバーレイ
// ========================================



function isCloudSyncEnabled(authStatus = checkAuthStatus()) {
  if (!authStatus.authenticated) {
    return false;
  }
  const settings = storage.getSettings();
  return cloudSync.resolveSource(null, settings) === "firebase";
}

function formatLibraryMeta({ progressPercentage, timestamp }) {
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progressPercentage ?? 0)));
  const relativeTime = formatRelativeTime(timestamp, uiLanguage);
  if (!relativeTime) {
    return `${clampedProgress}%`;
  }
  return `${clampedProgress}% / ${relativeTime}`;
}

function buildLibraryEntries() {
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
      fileType: localInfo?.type || normalizedMeta.fileType || null, // "epub" | "zip" | "rar" | null
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
      fileType: book.type || null, // "epub" | "zip" | "rar" | null
    });
  });

  entries.sort((a, b) => (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0));
  return entries;
}

function showCloudEmptyState({ cloudBookId, title, progressPercentage, lastTimestamp }) {
  if (elements.cloudEmptyState) {
    elements.cloudEmptyState.classList.remove(UI_CLASSES.HIDDEN);
  }
  if (elements.cloudEmptyTitle) {
    elements.cloudEmptyTitle.textContent = `${t("cloudOnlyTitle")}：${title ?? ""}`;
  }
  if (elements.cloudEmptyMeta) {
    const metaText = formatLibraryMeta({
      progressPercentage,
      timestamp: lastTimestamp,
    });
    elements.cloudEmptyMeta.textContent = `${t("cloudOnlyDescription")} (${metaText})`;
  }
  if (elements.cloudAttachButton) {
    elements.cloudAttachButton.textContent = t("libraryAttachFile");
    elements.cloudAttachButton.onclick = () => {
      pendingCloudBookId = cloudBookId;
      openFileDialog();
    };
  }
}

function hideCloudEmptyState() {
  if (elements.cloudEmptyState) {
    elements.cloudEmptyState.classList.add(UI_CLASSES.HIDDEN);
  }
}

async function syncAllBooksFromCloud() {
  if (!isCloudSyncEnabled()) return;

  // 1. Pull from Cloud (既存の処理)
  try {
    const remote = await cloudSync.pullIndex();
    const index = remote?.index ?? {};
    const updatedAt = remote?.updatedAt ?? Date.now();
    storage.mergeCloudIndex(index, updatedAt);

    // ★追加: クラウドインデックスを元に、ローカル書籍との自動リンクを試行
    const library = storage.data.library;
    Object.keys(library).forEach(localBookId => {
      // まだリンクされていないローカル書籍
      if (!storage.getCloudBookId(localBookId)) {
        const book = library[localBookId];
        if (book && book.contentHash) {
          // ハッシュ(fingerprint)が一致するクラウド書籍を探す
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
    // Pullに失敗してもPushは試行する
  }

  // 2. Push Local to Cloud (不足分のアップロード)
  try {
    const library = storage.data.library;
    const cloudIndex = storage.data.cloudIndex ?? {};

    for (const localBook of Object.values(library)) {
      if (!localBook || !localBook.id) continue;

      let cloudBookId = storage.getCloudBookId(localBook.id);

      // ケースA: 既にリンクされているが、クラウドインデックスに存在しない（消されたか、別アカウントか、同期ミス）
      if (cloudBookId && !cloudIndex[cloudBookId]) {
        console.log(`Re-uploading metadata for linked book: ${localBook.title}`);
        await upsertCloudIndexEntry(cloudBookId, localBook, localBook.contentHash);
        continue;
      }

      // ケースB: リンクされていない
      if (!cloudBookId) {
        // クラウドインデックスからハッシュで探す
        const matchEntry = Object.values(cloudIndex).find(
          entry => entry.fingerprints && entry.fingerprints.includes(localBook.contentHash)
        );

        if (matchEntry && matchEntry.cloudBookId) {
          // マッチした場合はリンクする
          console.log(`Linking local book "${localBook.title}" to existing cloud book`);
          storage.setBookLink(localBook.id, matchEntry.cloudBookId);
        } else {
          // マッチしない場合は新規作成してアップロード
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

  // 3. 完了処理
  storage.setSettings({ lastSyncAt: Date.now() });
  updateSyncStatusDisplay();
  if (uiInitialized) {
    renderLibrary();
    renderHistory();
    renderBookmarks(bookmarkMenuMode);
  }
}

async function handleAuthLogin() {
  updateAuthStatusDisplay();
  syncAutoSyncPolicy();
  await syncAllBooksFromCloud();
}

function buildSyncRemoteLabel(timestamp) {
  const timeText = formatRelativeTime(timestamp, uiLanguage);
  return t("syncPromptRemote").replace("{time}", timeText || "--");
}

function promptSyncResolution({ localUpdatedAt, remoteUpdatedAt }) {
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
      elements.syncUseRemote.textContent = buildSyncRemoteLabel(remoteUpdatedAt);
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
        closeModal(elements.syncModal);
        resolve("remote");
      };
    }

    if (elements.syncUseLocal) {
      elements.syncUseLocal.onclick = async () => {
        cleanup();
        closeModal(elements.syncModal);
        resolve("local");
      };
    }

    openModal(elements.syncModal);
  });
}

function promptSyncCandidate(candidates) {
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
        closeModal(elements.candidateModal);
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
        closeModal(elements.candidateModal);
        resolve(null);
      };
    }

    if (elements.closeCandidateModal) {
      elements.closeCandidateModal.onclick = () => {
        cleanup();
        closeModal(elements.candidateModal);
        resolve(null);
      };
    }

    openModal(elements.candidateModal);
  });
}

function buildCloudStatePayload(localBookId, cloudBookId) {
  const progress = storage.getProgress(localBookId) ?? {};
  const bookmarks = storage.getBookmarks(localBookId) ?? [];
  // historyは端末ごとなので送信しない
  const bookInfo = storage.data.library[localBookId];

  const updatedAt = Math.max(
    progress?.updatedAt ?? 0,
    ...bookmarks.map((bookmark) => bookmark?.updatedAt ?? bookmark?.createdAt ?? 0)
  );

  const state = {
    progress: progress?.percentage ?? 0,
    lastCfi: progress?.location ?? null,
    // bookType と location を含める
    bookType: bookInfo?.type ?? null, // "epub" | "zip" | "rar"
    location: progress?.location ?? null, // epub: CFI object, image: imageIndex
    bookmarks: bookmarks.map((bookmark) => ({
      ...bookmark,
      bookType: bookmark.bookType ?? bookmark.type ?? null, // 互換性のため
      deviceId: bookmark.deviceId ?? null,
      deviceColor: bookmark.deviceColor ?? null,
      updatedAt: bookmark?.updatedAt ?? bookmark?.createdAt ?? Date.now(),
    })),
    // historyフィールドを削除
    updatedAt,
  };
  return { cloudBookId, state, updatedAt };
}

function isEmptyCloudState(state) {
  if (!state) return true;
  const hasBookmarks = Array.isArray(state.bookmarks) && state.bookmarks.length > 0;
  const hasHistory = Array.isArray(state.history) && state.history.length > 0;
  const hasProgress = typeof state.progress === "number" && state.progress > 0;
  const hasLocation = Boolean(state.lastCfi);
  const hasUpdatedAt = (state.updatedAt ?? 0) > 0;
  return !(hasBookmarks || hasHistory || hasProgress || hasLocation || hasUpdatedAt);
}

function applyCloudStateToLocal(localBookId, cloudBookId, state) {
  if (!state || !localBookId) return;

  if (state.bookmarks && Array.isArray(state.bookmarks)) {
    storage.mergeBookmarks(localBookId, state.bookmarks);
  }

  // historyの適用処理を削除

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

async function resolveSyncedProgress(localBookId, cloudBookId = storage.getCloudBookId(localBookId)) {
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
      const choice = await promptSyncResolution({ localUpdatedAt, remoteUpdatedAt });
      if (choice === "remote") {
        applyCloudStateToLocal(localBookId, cloudBookId, remoteState);
        storage.setSettings({ lastSyncAt: Date.now() });
        updateSyncStatusDisplay();
      } else {
        storage.setCloudState(cloudBookId, remoteState);
        if (localUpdatedAt > remoteUpdatedAt) {
          await pushCurrentBookSync();
        }
      }
      return storage.getProgress(localBookId);
    }

    applyCloudStateToLocal(localBookId, cloudBookId, remoteState);
    storage.setSettings({ lastSyncAt: Date.now() });
    updateSyncStatusDisplay();
    return storage.getProgress(localBookId);
  } catch (error) {
    console.warn("同期情報の取得に失敗しました:", error);
  }

  return localProgress;
}

function generateCloudBookId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `cloud-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildCloudMeta({ cloudBookId, info, fingerprint, overrides = {} }) {
  const existing = storage.data.cloudIndex?.[cloudBookId] ?? {};
  const fingerprints = new Set([
    ...(existing.fingerprints ?? []),
    ...(overrides.fingerprints ?? []),
  ]);
  if (fingerprint) fingerprints.add(fingerprint);
  return {
    cloudBookId,
    title: overrides.title ?? info?.title ?? existing.title ?? t("untitledBook"),
    author: overrides.author ?? info?.author ?? existing.author ?? "",
    identifiers: overrides.identifiers ?? existing.identifiers ?? [],
    fingerprints: Array.from(fingerprints),
    fileType: overrides.fileType ?? info?.type ?? existing.fileType ?? null, // "epub" | "zip" | "rar"
    lastReadAt: overrides.lastReadAt ?? Date.now(),
    updatedAt: Date.now(),
    createdAt: existing.createdAt ?? overrides.createdAt ?? Date.now(),
  };
}

async function upsertCloudIndexEntry(cloudBookId, info, fingerprint, overrides = {}) {
  if (!cloudBookId) return null;
  const meta = buildCloudMeta({ cloudBookId, info, fingerprint, overrides });
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

function buildMatchMeta(info) {
  return {
    title: info?.title ?? "",
    author: info?.author ?? "",
    identifiers: info?.identifiers ?? [],
  };
}

// ========================================
// ファイル処理
// ========================================

async function handleFile(file) {
  showLoading();
  userOverrodeDirection = false;
  try {
    console.log(`Opening file: ${file.name}, type: ${file.type}, size: ${file.size}`);

    const buffer = await file.arrayBuffer();
    console.log(`File buffer loaded: ${buffer.byteLength} bytes`);

    // ファイルタイプを自動判別 (マジックナンバー優先)
    const type = detectFileType(buffer) || detectFileType(file);
    if (!type) {
      hideLoading();
      alert(t ? t('errorFileLoadFailed') : "対応していないファイル形式です。");
      return;
    }
    console.log(`Detected file type: ${type}`);

    const contentHash = await hashBuffer(buffer);
    // 移行方針: 既存のcontentHash一致を優先し、旧ID(短縮ハッシュ)一致なら旧IDを再利用して重複登録を防ぐ
    const existingRecord = findBookByContentHash(storage.data.library, contentHash);
    const id = existingRecord?.id ?? contentHash;
    const mime = guessMime(type, file);
    const source = storage.getSettings().source || 'local';

    console.log(`Saving file to storage with ID: ${id.substring(0, 12)}...`);
    await saveFile(id, buffer, { fileName: file.name, mime }, source);

    // type: "epub" | "zip" | "rar" として正式に保存
    const info = {
      id,
      title: fileTitle(file.name),
      type: type, // "epub" | "zip" | "rar"
      fileName: file.name,
      size: file.size,
      contentHash,
      lastOpened: Date.now(),
    };

    storage.upsertBook(info);
    currentBookId = id;
    currentBookInfo = info;

    let cloudBookId = pendingCloudBookId ?? storage.getCloudBookId(id);
    if (cloudBookId) {
      storage.setBookLink(id, cloudBookId);
    }
    if (isCloudSyncEnabled()) {
      if (!cloudBookId) {
        try {
          const matchResult = await cloudSync.matchBook(contentHash, buildMatchMeta(info));
          if (matchResult?.cloudBookId) {
            cloudBookId = matchResult.cloudBookId;
          } else if (matchResult?.candidates?.length > 0) {
            cloudBookId = await promptSyncCandidate(matchResult.candidates);
          }
        } catch (error) {
          console.warn("クラウドの照合に失敗しました:", error);
        }
      }
      if (!cloudBookId) {
        cloudBookId = generateCloudBookId();
      }
      if (cloudBookId) {
        storage.setBookLink(id, cloudBookId);
        await upsertCloudIndexEntry(cloudBookId, info, contentHash);
      }
    }
    pendingCloudBookId = null;
    currentCloudBookId = cloudBookId;

    const syncedProgress = await resolveSyncedProgress(id, cloudBookId);
    await applyReadingState(syncedProgress);
    const startLocation = syncedProgress?.location;
    const startProgress = syncedProgress?.percentage;

    hideCloudEmptyState();
    // isImageBook: zip または rar の場合
    const isImageBook = info.type === BOOK_TYPES.ZIP || info.type === BOOK_TYPES.RAR;
    if (!isImageBook) {
      console.log("Opening EPUB...");

      // 空の状態を非表示、ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.remove(UI_CLASSES.HIDDEN);
        elements.viewer.classList.add(UI_CLASSES.VISIBLE);
      }
      // EPUBスクロールモードを解除（ページ分割描画のため）
      if (elements.fullscreenReader) {
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL);
      }

      showLoading();

      // ★追加: UI描画更新のために少し待機
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
      console.log(`Opening image book (${info.type})...`);
      console.log(`Start location: ${startLocation}`);

      // 空の状態を非表示、画像ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      await reader.openImageBook(
        new File([new Uint8Array(buffer)], file.name, { type: mime }),
        typeof startLocation === "number" ? startLocation : 0,
        info.type // "zip" | "rar" を渡す
      );
      // [追加] デフォルトの開き方向を適用
      // 保存された進行状況に方向が含まれていないため、常にデフォルト（またはユーザー設定）を適用
      // ※将来的には個別の方向保存に対応する可能性があるが、現状はデフォルト設定を使用
      reader.setImageReadingDirection(defaultDirection);
      updateReadingDirectionButtonLabel();
      updateProgressBarDirection();
    }

    console.log("Book opened successfully");
    hideLoading();
    renderLibrary();
    renderBookmarkMarkers();
    updateProgressBarDisplay();
    updateSearchButtonState();
    updateFloatingUIButtons();
    closeModal(elements.openFileModal);
    if (floatVisible) {
      toggleFloatOverlay(false);
    }

    // 自動同期が有効なら保存
    if (syncAutoSyncPolicy(checkAuthStatus())) {
      await pushCurrentBookSync();
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

  if (elements.viewer) {
    elements.viewer.classList.add(UI_CLASSES.HIDDEN);
    elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
  }
  if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
  if (elements.emptyState) elements.emptyState.classList.remove(UI_CLASSES.HIDDEN);
  if (elements.progressBarPanel) elements.progressBarPanel.classList.add(UI_CLASSES.HIDDEN);
  if (elements.progressBarBackdrop) elements.progressBarBackdrop.classList.add(UI_CLASSES.HIDDEN);
  showCloudEmptyState({
    cloudBookId,
    title: meta?.title ?? t("cloudOnlyTitle"),
    progressPercentage: state?.progress ?? 0,
    lastTimestamp: state?.updatedAt ?? meta?.lastReadAt ?? meta?.updatedAt ?? 0,
  });
  updateProgressBarDisplay();
  updateSearchButtonState();
  closeModal(elements.openFileModal);
  if (floatVisible) {
    toggleFloatOverlay(false);
  }
}

async function openFromLibrary(bookId, options = {}) {
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
    currentCloudBookId = storage.getCloudBookId(bookId);
    if (isCloudSyncEnabled() && !currentCloudBookId && info?.contentHash) {
      try {
        const matchResult = await cloudSync.matchBook(info.contentHash, buildMatchMeta(info));
        if (matchResult?.cloudBookId) {
          currentCloudBookId = matchResult.cloudBookId;
          storage.setBookLink(bookId, currentCloudBookId);
        }
      } catch (error) {
        console.warn("クラウドの照合に失敗しました:", error);
      }
    }
    if (currentCloudBookId) {
      await upsertCloudIndexEntry(currentCloudBookId, info, info.contentHash, { lastReadAt: Date.now() });
    }

    const bookmarks = storage.getBookmarks(bookId);
    const progress = await resolveSyncedProgress(bookId, currentCloudBookId);
    await applyReadingState(progress);
    const explicitBookmark = options.bookmark;
    const startFromBookmark = explicitBookmark?.location ?? (options.useBookmark ? bookmarks[0]?.location : undefined);
    const start = startFromBookmark ?? progress?.location;
    const startProgress = explicitBookmark?.percentage ?? progress?.percentage;

    // 【修正】読み込み時にタイプを再判定（DB内の情報の誤りを補正）
    const detectedType = detectFileType(record.buffer);
    if (detectedType && detectedType !== info.type) {
      console.log(`タイプミスマッチを検出: ${info.type} -> ${detectedType}`);
      info.type = detectedType;
      storage.upsertBook(info);
    }

    hideCloudEmptyState();
    // isImageBook: zip または rar の場合
    const isImageBook = info.type === BOOK_TYPES.ZIP || info.type === BOOK_TYPES.RAR;
    if (!isImageBook) {
      // 空の状態を非表示、ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.remove(UI_CLASSES.HIDDEN);
        elements.viewer.classList.add(UI_CLASSES.VISIBLE);
      }
      // EPUBスクロールモードを解除（ページ分割描画のため）
      if (elements.fullscreenReader) {
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL);
      }

      await reader.openEpub(file, { location: start, percentage: startProgress });
    } else {
      // 空の状態を非表示、画像ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      await reader.openImageBook(file, typeof start === "number" ? start : 0, info.type);
    }

    storage.addHistory(bookId);
    scheduleAutoSyncPush();
    renderBookmarkMarkers();
    updateProgressBarDisplay();
    updateSearchButtonState();
    updateFloatingUIButtons();
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

function detectFileType(fileOrBuffer) {
  // ArrayBufferの場合はマジックナンバーチェック
  if (fileOrBuffer instanceof ArrayBuffer) {
    const view = new Uint8Array(fileOrBuffer);
    // EPUB (PK\x03\x04 + mimetype) - 簡易的に PK チェックのみでも ZIP と混同しやすいが
    // ZIP (PK\x03\x04)
    if (view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04) {
      // 内部に "mimetypeapplication/epub+zip" があるかチェック（オフセット 30付近）
      const str = String.fromCharCode(...view.slice(30, 60));
      if (str.includes("mimetypeapplication/epub+zip")) {
        return BOOK_TYPES.EPUB;
      }
      return BOOK_TYPES.ZIP;
    }
    // RAR (Rar!\x1a\x07\x00) v4
    if (view[0] === 0x52 && view[1] === 0x61 && view[2] === 0x72 && view[3] === 0x21 && view[4] === 0x1a && view[5] === 0x07) {
      return BOOK_TYPES.RAR;
    }
    // RAR (Rar!\x1a\x07\x01) v5
    if (view[0] === 0x52 && view[1] === 0x61 && view[2] === 0x72 && view[3] === 0x21 && view[4] === 0x1a && view[5] === 0x07 && view[6] === 0x01) {
      return BOOK_TYPES.RAR;
    }
  }

  // File オブジェクトの場合は名前から判別（フォールバック）
  const name = fileOrBuffer.name || "";
  const ext = name.split(".").pop().toLowerCase();
  if (ext === FILE_EXTENSIONS.EPUB) return BOOK_TYPES.EPUB;
  if (ext === FILE_EXTENSIONS.RAR || ext === FILE_EXTENSIONS.CBR) return BOOK_TYPES.RAR;
  if (ext === FILE_EXTENSIONS.ZIP || ext === FILE_EXTENSIONS.CBZ) return BOOK_TYPES.ZIP;

  // 不明な場合はnullを返す（呼び出し側でデフォルト処理）
  return null;
}

function fileTitle(name) {
  return name.replace(/\.[^.]+$/, "");
}

function guessMime(type, file) {
  if (type === BOOK_TYPES.EPUB) return MIME_TYPES.EPUB;
  if (type === BOOK_TYPES.IMAGE) {
    // This branch is for internal image files inside archives, likely unused for the main file
    // But keeping logic consistent if it were used
    return FILESTORE_CONFIG.DEFAULT_MIME_TYPE;
  }

  // For the main file passed to saveFile/handleFile
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === FILE_EXTENSIONS.CBR) return MIME_TYPES.CBR;
  if (ext === FILE_EXTENSIONS.CBZ) return MIME_TYPES.CBZ;
  if (ext === FILE_EXTENSIONS.RAR) return MIME_TYPES.RAR;

  return file.type || FILESTORE_CONFIG.DEFAULT_MIME_TYPE;
}

async function hashBuffer(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

function findBookByContentHash(library, contentHash) {
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

// ========================================
// 進捗管理
// ========================================

function persistReadingState(update) {
  if (!currentBookId) return;
  const existing = storage.getProgress(currentBookId) ?? {};
  storage.setProgress(currentBookId, { ...existing, ...update });
}

async function applyReadingState(progress) {
  if (!progress) return;
  if (progress.writingMode && progress.writingMode !== writingMode) {
    writingMode = progress.writingMode;
    if (elements.writingModeSelect) {
      elements.writingModeSelect.value = writingMode;
    }
    await applyReadingSettings(writingMode, pageDirection);
  }
  if (progress.theme && progress.theme !== theme) {
    applyTheme(progress.theme);
  }
  if (Number.isFinite(progress.fontSize) && progress.fontSize !== fontSize) {
    applyFontSize(progress.fontSize);
  }
  if (progress.uiLanguage && progress.uiLanguage !== uiLanguage) {
    applyUiLanguage(progress.uiLanguage);
  }
}

function handleProgress(progress) {
  if (!currentBookId) return;


  storage.setProgress(currentBookId, {
    ...progress,
    writingMode,
    fontSize,
    theme,
    uiLanguage,
  });
  scheduleAutoSyncPush();
  updateProgressBarDisplay();
}

function getEpubPaginationTotal() {
  const totalPages = reader.pagination?.pages?.length;
  if (totalPages) return totalPages;
  const totalLocations = reader.book?.locations?.total;
  if (totalLocations) return totalLocations;
  return null;
}

function updateProgressBarDisplay() {
  if (!currentBookId) return;

  if (elements.progressBarPanel) {
    elements.progressBarPanel.classList.add(UI_CLASSES.HIDDEN);
  }
  if (elements.progressBarBackdrop) {
    elements.progressBarBackdrop.classList.add(UI_CLASSES.HIDDEN);
  }

  const progress = storage.getProgress(currentBookId);
  const percentage = progress?.percentage || 0;
  updateFloatProgressBar(percentage);

  // 進捗バーの更新
  if (elements.progressFill) {
    elements.progressFill.style.width = `${percentage}%`;
  }

  if (elements.progressThumb) {
    elements.progressThumb.style.left = `${percentage}%`;
  }

  // ページ数の更新（入力中でない場合のみ）
  if (elements.currentPageInput && document.activeElement !== elements.currentPageInput) {
    if (progressDisplayMode === "page") {
      // ページ数モード
      if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
        // EPUBの場合はページ数を表示
        const totalPages = getEpubPaginationTotal();
        if (totalPages) {
          const currentPage = Math.max(1, Math.round((percentage / 100) * totalPages));
          elements.currentPageInput.value = currentPage;

          if (elements.totalPages) {
            elements.totalPages.textContent = totalPages.toString();
          }
        } else {
          // ページ数が未生成の場合はパーセンテージ表示
          elements.currentPageInput.value = Math.round(percentage);
          if (elements.totalPages) {
            elements.totalPages.textContent = PROGRESS_CONFIG.MAX_PERCENT.toString();
          }
        }
      } else if (currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR)) {
        // 画像書籍の場合はページ数
        const totalPages = reader.imagePages?.length || 1;
        const currentPage = Math.max(1, Math.round((percentage / 100) * totalPages));
        elements.currentPageInput.value = currentPage;

        if (elements.totalPages) {
          elements.totalPages.textContent = totalPages.toString();
        }
      } else {
        // locations未生成のEPUBはパーセンテージ表示
        elements.currentPageInput.value = Math.round(percentage);
        if (elements.totalPages) {
          elements.totalPages.textContent = PROGRESS_CONFIG.MAX_PERCENT.toString();
        }
      }
    } else {
      // パーセンテージモード
      elements.currentPageInput.value = Math.round(percentage);

      if (elements.totalPages) {
        elements.totalPages.textContent = PROGRESS_CONFIG.MAX_PERCENT.toString();
      }
    }
  }

  renderBookmarkMarkers();
}

function renderBookmarkMarkers() {
  if (!elements.progressTrack) return;
  elements.progressTrack.querySelectorAll(DOM_SELECTORS.BOOKMARK_MARKER).forEach((node) => node.remove());
  if (!currentBookId) return;

  const bookmarks = storage.getBookmarks(currentBookId);
  if (!bookmarks.length) return;

  bookmarks.forEach((bookmark) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = UI_CLASSES.BOOKMARK_MARKER;
    const percentage = Math.min(100, Math.max(0, bookmark.percentage ?? 0));
    marker.style.left = `${percentage}%`;
    if (bookmark.deviceColor) {
      marker.style.background = bookmark.deviceColor;
    }

    // ツールチップの表示内容を進捗表示モードに合わせる
    let tooltipText = bookmark.label ?? t("bookmarkDefault");
    if (progressDisplayMode === "page") {
      // ページ数モードの場合
      if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
        const totalPages = getEpubPaginationTotal();
        if (totalPages) {
          const pageIndex = Math.max(1, Math.round((percentage / 100) * totalPages));
          tooltipText += ` (${pageIndex}/${totalPages})`;
        } else {
          tooltipText += ` (${percentage}%)`;
        }
      } else if (currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR)) {
        const totalPages = reader.imagePages?.length || 1;
        const pageNumber = Math.max(1, Math.round((percentage / 100) * totalPages));
        tooltipText += ` (${pageNumber}/${totalPages})`;
      } else {
        tooltipText += ` (${percentage}%)`;
      }
    } else {
      // パーセンテージモード
      tooltipText += ` (${percentage}%)`;
    }

    marker.title = tooltipText;
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      reader.goTo(bookmark);
      ui.closeAllMenus();
    });
    elements.progressTrack.appendChild(marker);
  });

  renderFloatBookmarkMarkers();
}

function renderFloatBookmarkMarkers() {
  if (!elements.floatProgressMarks) return;
  elements.floatProgressMarks.querySelectorAll(DOM_SELECTORS.BOOKMARK_MARKER).forEach((node) => node.remove());
  if (!currentBookId) return;

  const bookmarks = storage.getBookmarks(currentBookId);
  if (!bookmarks.length) return;

  bookmarks.forEach((bookmark) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = UI_CLASSES.BOOKMARK_MARKER;
    const percentage = Math.min(100, Math.max(0, bookmark.percentage ?? 0));
    marker.style.left = `${percentage}%`;
    if (bookmark.deviceColor) {
      marker.style.background = bookmark.deviceColor;
    }
    marker.title = bookmark.label ?? t("bookmarkDefault");
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      reader.goTo(bookmark);
    });
    elements.floatProgressMarks.appendChild(marker);
  });
}

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
  if (currentBookInfo.type === BOOK_TYPES.EPUB) {
    // メタデータから方向を取得（設定値があればそちらを優先）
    const metadataDirection = metadata.direction;
    if (metadataDirection && !userOverrodeDirection) {
      pageDirection = metadataDirection;
      if (elements.pageDirectionSelect) {
        elements.pageDirectionSelect.value = pageDirection;
      }
    }
    updateProgressBarDirection(); // 進捗バーの方向更新
  }

  const title = metadata.title || currentBookInfo.title;
  currentBookInfo.title = title;
  storage.upsertBook({ ...currentBookInfo, title });
  if (currentCloudBookId) {
    const author = metadata.creator || metadata.author || "";
    upsertCloudIndexEntry(currentCloudBookId, currentBookInfo, currentBookInfo?.contentHash, {
      title,
      author,
    }).catch((error) => {
      console.warn("クラウドメタデータの更新に失敗しました:", error);
    });
  }
  renderLibrary();
  renderToc(currentToc);

  // EPUBスクロールモードのクラスを設定（横書きのみ縦スクロール）
  const scheduleEpubScrollModeUpdate = (attempt = 0) => {
    if (reader?.writingMode != null) {
      updateEpubScrollMode();
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
        updateProgressBarDisplay();
      }
    }, TIMING_CONFIG.LOCATIONS_CHECK_INTERVAL_MS);

    // ロケーション確認タイムアウト
    setTimeout(() => {
      clearInterval(checkLocations);
      console.log('[handleBookReady] Locations check timeout');
    }, TIMING_CONFIG.LOCATIONS_CHECK_TIMEOUT_MS);

  }
}

function updateEpubScrollMode() {
  if (currentBookInfo?.type !== BOOK_TYPES.EPUB || !elements.fullscreenReader) return;
  if (reader?.usingPaginator) {
    elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL);
    return;
  }
  const resolvedWritingMode = reader?.writingMode ?? currentBookInfo?.writingMode ?? writingMode;
  if (resolvedWritingMode === WRITING_MODES.VERTICAL) {
    console.log('[updateEpubScrollMode] Disabling epub-scroll for vertical reading');
    elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL);
    return;
  }
  if (resolvedWritingMode === WRITING_MODES.HORIZONTAL) {
    console.log('[updateEpubScrollMode] Enabling epub-scroll for horizontal reading');
    elements.fullscreenReader.classList.add(UI_CLASSES.EPUB_SCROLL);
  }
}

// ========================================
// 目次管理
// ========================================

function renderToc(tocItems = []) {
  if (!elements.tocModalList) return;

  const normalizedToc = tocItems?.toc ?? tocItems?.items ?? tocItems;
  const tocArray = Array.isArray(normalizedToc)
    ? normalizedToc
    : Object.values(normalizedToc || {});

  if (elements.tocList) {
    elements.tocList.innerHTML = "";
  }
  elements.tocModalList.innerHTML = "";
  const isEpub = currentBookInfo?.type === BOOK_TYPES.EPUB;

  if (!isEpub || tocArray.length === 0) {
    elements.tocSection?.classList.add(UI_CLASSES.HIDDEN);
    console.log('[renderToc] Hiding TOC section:', { isEpub, tocCount: tocArray.length });
    return;
  }

  console.log('[renderToc] Showing TOC section with', tocArray.length, 'items');
  elements.tocSection?.classList.remove(UI_CLASSES.HIDDEN);
  renderTocEntries(tocArray, elements.tocModalList, 0);
}

function renderTocEntries(items, container, depth) {
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
        if (reader?.usingPaginator && item.href) {
          reader.navigateToHref(item.href);
        }
        ui.closeAllMenus();
        closeModal(elements.tocModal);
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

// ========================================
// しおり管理
// ========================================

function renderBookmarks(mode = "current") {
  if (!elements.bookmarkList) return;

  elements.bookmarkList.innerHTML = "";

  if (mode === "all") {
    const historyOrder = storage.data.history.map((item) => item.bookId);
    const libraryOrder = Object.keys(storage.data.library);
    const orderedBookIds = [...historyOrder, ...libraryOrder].filter((id, index, self) => self.indexOf(id) === index);
    const entries = [];

    orderedBookIds.forEach((bookId) => {
      const book = storage.data.library[bookId];
      if (!book) return;
      const bookmarks = storage.getBookmarks(bookId);
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
      if (bookmark.deviceColor) {
        item.style.borderLeftColor = bookmark.deviceColor;
      }

      const info = document.createElement("div");
      info.className = "bookmark-info";
      info.onclick = async () => {
        if (bookId === currentBookId) {
          reader.goTo(bookmark);
        } else {
          await openFromLibrary(bookId, { bookmark });
        }
        ui.closeAllMenus();
      };

      const label = document.createElement("div");
      label.className = "bookmark-label";
      const colorDot = document.createElement("span");
      colorDot.className = "bookmark-color-dot";
      if (bookmark.deviceColor) {
        colorDot.style.background = bookmark.deviceColor;
      }
      const labelText = document.createElement("span");
      labelText.textContent = `${book.title} / ${bookmark.label || t("bookmarkDefault")}`;
      label.append(colorDot, labelText);

      const meta = document.createElement("div");
      meta.className = "bookmark-meta";

      // メタ情報を進捗表示モードに合わせて表示
      let metaText = new Date(bookmark.createdAt).toLocaleString();
      if (progressDisplayMode === "page") {
        // ここでは簡易的にパーセンテージのみ表示（本を開いていないため正確なページ数は不明）
        metaText += ` / ${bookmark.percentage}%`;
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
          storage.removeBookmark(bookId, bookmark.createdAt);
          renderBookmarks(mode);
          renderBookmarkMarkers();
          scheduleAutoSyncPush();
        }
      };

      item.append(info, deleteBtn);
      elements.bookmarkList.appendChild(item);
    });

    renderBookmarkMarkers();
    return;
  }

  if (!currentBookId) {
    const empty = document.createElement("li");
    empty.textContent = t("openBookPrompt");
    empty.style.textAlign = "center";
    empty.style.color = `var(${CSS_VARS.MUTED})`;
    elements.bookmarkList.appendChild(empty);
    renderBookmarkMarkers();
    return;
  }

  const bookmarks = storage.getBookmarks(currentBookId);

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
    if (bookmark.deviceColor) {
      item.style.borderLeftColor = bookmark.deviceColor;
    }

    const info = document.createElement("div");
    info.className = "bookmark-info";
    info.onclick = () => {
      reader.goTo(bookmark);
      ui.closeAllMenus();
    };

    const label = document.createElement("div");
    label.className = "bookmark-label";
    const colorDot = document.createElement("span");
    colorDot.className = "bookmark-color-dot";
    if (bookmark.deviceColor) {
      colorDot.style.background = bookmark.deviceColor;
    }
    const labelText = document.createElement("span");
    labelText.textContent = bookmark.label || t("bookmarkDefault");
    label.append(colorDot, labelText);

    const meta = document.createElement("div");
    meta.className = "bookmark-meta";

    // メタ情報を進捗表示モードに合わせて表示
    let metaText = new Date(bookmark.createdAt).toLocaleString();
    if (progressDisplayMode === "page") {
      if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
        const totalPages = getEpubPaginationTotal();
        if (totalPages) {
          const pageIndex = Math.max(1, Math.round((bookmark.percentage / 100) * totalPages));
          metaText += ` / ${pageIndex}/${totalPages}`;
        } else {
          metaText += ` / ${bookmark.percentage}%`;
        }
      } else if (currentBookInfo?.type === BOOK_TYPES.IMAGE) {
        const totalPages = reader.imagePages?.length || 1;
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
        storage.removeBookmark(currentBookId, bookmark.createdAt);
        renderBookmarks(mode);
        renderBookmarkMarkers();
        scheduleAutoSyncPush();
      }
    };

    item.append(info, deleteBtn);
    elements.bookmarkList.appendChild(item);
  });

  renderBookmarkMarkers();
}

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
    renderBookmarks(bookmarkMenuMode);
    renderBookmarkMarkers();

    // 自動同期
    scheduleAutoSyncPush();
  }
}

// ========================================
// ライブラリ・履歴
// ========================================

function renderLibrary() {
  if (!elements.libraryGrid) return;

  elements.libraryGrid.innerHTML = "";
  const entries = buildLibraryEntries();

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
    // 検索フィルタ用のdata属性を設定
    card.dataset.title = (entry.title || "").toLowerCase();
    card.dataset.author = (entry.author || "").toLowerCase();

    // 削除/やり直しボタン
    const deleteId = entry.localBookId || entry.cloudBookId;
    if (deleteId) {
      const deleteType = entry.localBookId ? 'local' : 'cloud';
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "library-delete-btn";

      const isMarked = pendingDeletes.has(deleteId);

      if (isMarked) {
        actionBtn.textContent = "↩";
        actionBtn.title = t("undo_button");
        actionBtn.classList.add("undo-mode");
        card.classList.add("marked-for-delete");
      } else {
        actionBtn.textContent = UI_ICONS.DELETE;
        actionBtn.title = t("delete_button");
      }

      actionBtn.onclick = (event) => {
        event.stopPropagation();

        if (pendingDeletes.has(deleteId)) {
          // やり直し
          pendingDeletes.delete(deleteId);
          card.classList.remove("marked-for-delete");
          actionBtn.textContent = UI_ICONS.DELETE;
          actionBtn.title = t("delete_button");
          actionBtn.classList.remove("undo-mode");
        } else {
          // 削除マーク
          pendingDeletes.set(deleteId, { id: deleteId, type: deleteType });
          card.classList.add("marked-for-delete");
          actionBtn.textContent = "↩";
          actionBtn.title = t("undo_button");
          actionBtn.classList.add("undo-mode");
        }
      };
      card.appendChild(actionBtn);
    }

    // カードクリックイベント（削除マーク時は無効）
    card.onclick = () => {
      if (deleteId && pendingDeletes.has(deleteId)) {
        return;
      }
      if (entry.hasLocalFile && entry.localBookId) {
        openFromLibrary(entry.localBookId);
      } else if (entry.cloudBookId) {
        openCloudOnlyBook(entry.cloudBookId);
      }
    };

    const cover = document.createElement("div");
    cover.className = "library-cover";
    cover.textContent = entry.title?.slice(0, 2) || UI_ICONS.BOOK;

    // --- 情報エリア（新レイアウト） ---
    const info = document.createElement("div");
    info.className = "library-info";

    // 1行目：タイトル（スクロール用span包含）
    const title = document.createElement("div");
    title.className = "library-title";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = entry.title;
    title.appendChild(titleSpan);

    // 2行目：メタ情報 + バッジ
    const row2 = document.createElement("div");
    row2.className = "library-row-2";

    const meta = document.createElement("div");
    meta.className = "library-meta";
    meta.textContent = formatLibraryMeta({
      progressPercentage: entry.progressPercentage,
      timestamp: entry.lastTimestamp,
    });
    row2.appendChild(meta);

    // ファイルタイプバッジ
    if (entry.fileType) {
      const typeBadge = document.createElement("span");
      typeBadge.className = "library-type-badge";
      typeBadge.textContent = `[${entry.fileType.toUpperCase()}]`;
      row2.appendChild(typeBadge);
    }

    // 未ダウンロードバッジ
    if (!entry.hasLocalFile) {
      const cloudBadge = document.createElement("span");
      cloudBadge.className = "library-type-badge";
      cloudBadge.style.color = "var(--muted)";
      cloudBadge.textContent = "☁";
      cloudBadge.title = t("libraryCloudMissingBadge");
      row2.appendChild(cloudBadge);
    }

    // アタッチボタン（クラウドのみの場合）
    if (!entry.hasLocalFile && entry.cloudBookId) {
      const attachButton = document.createElement("button");
      attachButton.type = "button";
      attachButton.className = "library-attach";
      attachButton.textContent = "📎";
      attachButton.title = t("libraryAttachFile");
      attachButton.onclick = (event) => {
        event.stopPropagation();
        pendingCloudBookId = entry.cloudBookId;
        openFileDialog();
      };
      row2.appendChild(attachButton);
    }

    info.append(title, row2);
    card.append(cover, info);

    elements.libraryGrid.appendChild(card);
  });
}

/**
 * ライブラリカードを検索クエリでフィルタリング
 * @param {string} query - 検索クエリ
 */
function filterLibraryCards(query) {
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

function renderHistory() {
  if (!elements.historyList) return;

  elements.historyList.innerHTML = "";
  const history = storage.data.history;

  if (!history.length) {
    const empty = document.createElement("li");
    empty.textContent = t("historyEmpty");
    empty.style.textAlign = "center";
    empty.style.color = `var(${CSS_VARS.MUTED})`;
    elements.historyList.appendChild(empty);
    return;
  }

  history.forEach((item) => {
    const book = storage.data.library[item.bookId];
    if (!book) return;

    const historyItem = document.createElement("li");
    historyItem.className = "history-item";
    historyItem.onclick = () => {
      openFromLibrary(book.id);
      closeModal(elements.historyModal);
    };

    const info = document.createElement("div");
    info.className = "history-info";

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = book.title;

    const meta = document.createElement("div");
    meta.className = "history-meta";

    // 進捗情報を追加
    const progress = storage.getProgress(book.id);
    const progressText = progress ? `${progress.percentage}%` : "0%";
    meta.textContent = `${new Date(item.openedAt).toLocaleString()} / ${t("progressLabel")}: ${progressText}`;

    info.append(title, meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "history-delete";
    deleteBtn.textContent = UI_ICONS.DELETE;
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(t("historyDeleteConfirm"))) {
        storage.removeHistory(item.bookId);
        renderHistory();
      }
    };

    historyItem.append(info, deleteBtn);
    elements.historyList.appendChild(historyItem);
  });
}

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

function renderSearchResults(results, query) {
  if (!elements.searchResults) return;

  elements.searchResults.innerHTML = '';

  if (!results.length) {
    const noResults = document.createElement('div');
    noResults.className = 'search-no-results';
    noResults.textContent = t("searchNoResults");
    elements.searchResults.appendChild(noResults);
    return;
  }

  results.forEach((result, index) => {
    const item = document.createElement('div');
    item.className = 'search-result-item';

    const excerpt = document.createElement('div');
    excerpt.className = 'search-result-excerpt';

    // クエリをハイライト
    const escapedQuery = result.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const highlightedText = result.excerpt.replace(regex, '<mark>$1</mark>');
    excerpt.innerHTML = `...${highlightedText}...`;

    const meta = document.createElement('div');
    meta.className = 'search-result-meta';

    // パーセンテージまたはページ情報を表示
    let locationText = '';
    if (progressDisplayMode === "page") {
      const totalPages = getEpubPaginationTotal();
      if (totalPages) {
        const pageIndex = Math.max(1, Math.round((result.percentage / 100) * totalPages));
        locationText = `${pageIndex}/${totalPages}`;
      } else if (reader.book?.locations) {
        const totalLocations = reader.book.locations.total;
        const locationIndex = Math.round((result.percentage / 100) * totalLocations);
        locationText = `${locationIndex}/${totalLocations}`;
      } else {
        locationText = `${result.percentage}%`;
      }
    } else {
      locationText = `${result.percentage}%`;
    }

    meta.textContent = `${locationText} / ${result.sectionLabel || `${t("searchResultFallback")} ${index + 1}`}`;

    item.append(excerpt, meta);

    item.onclick = async () => {
      if (
        typeof result.spineIndex === "number" &&
        typeof result.segmentIndex === "number" &&
        typeof reader?.goToSegment === "function"
      ) {
        reader.goToSegment(result.spineIndex, result.segmentIndex);
      } else {
        seekToPercentage(result.percentage);
      }
      closeModal(elements.searchModal);
    };

    elements.searchResults.appendChild(item);
  });
}

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
  toggleFloatOverlay(false);
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
  updateThemeToggleIcon();
}

function updateThemeToggleIcon() {
  if (!elements.toggleTheme) return;
  elements.toggleTheme.textContent = theme === "dark" ? UI_ICONS.THEME_DARK : UI_ICONS.THEME_LIGHT;
  elements.toggleTheme.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function applyFontSize(nextSize) {
  if (!Number.isFinite(nextSize)) return;
  const clamped = Math.min(READER_CONFIG.FONT_SIZE_MAX, Math.max(READER_CONFIG.FONT_SIZE_MIN, Math.round(nextSize)));
  fontSize = clamped;
  reader.applyFontSize(fontSize);
  storage.setSettings({ fontSize });
  persistReadingState({ fontSize });
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
    showCloudEmptyState({
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
  if (elements.settingsDefaultDirectionLabel) {
    elements.settingsDefaultDirectionLabel.textContent = strings.settingsDefaultDirectionLabel;
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

  if (elements.settingsAccountTitle) elements.settingsAccountTitle.textContent = strings.settingsAccountTitle;
  if (elements.googleLoginButton) elements.googleLoginButton.textContent = strings.googleLoginLabel;
  if (elements.manualSyncButton) elements.manualSyncButton.textContent = strings.syncNowButton;
  if (elements.syncHint) elements.syncHint.textContent = strings.syncHint;
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
    updateSyncStatusDisplay();
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
  if (elements.settingsDefaultDirection) {
    const options = elements.settingsDefaultDirection.options;
    if (options[0]) options[0].textContent = strings.settingsLayoutDirectionRtl;
    if (options[1]) options[1].textContent = strings.settingsLayoutDirectionLtr;
  }
  if (elements.fontPlus) elements.fontPlus.textContent = strings.fontIncreaseLabel;
  if (elements.fontMinus) elements.fontMinus.textContent = strings.fontDecreaseLabel;

  updateWritingModeToggleLabel();
  updateReadingDirectionEpubButtonLabel();
  updateReadingDirectionButtonLabel();
  updateSpreadModeButtonLabel();
  if (uiInitialized) {
    renderLibrary();
    renderHistory();
    renderBookmarks(bookmarkMenuMode);
    renderToc(currentToc);
    updateProgressBarDisplay();
    updateSearchButtonState();
    updateAuthStatusDisplay();
  }
}

function updateWritingModeToggleLabel() {
  if (!elements.toggleWritingMode) return;
  const isVertical = writingMode === WRITING_MODES.VERTICAL;
  elements.toggleWritingMode.textContent = isVertical
    ? t("writingModeToggleVertical")
    : t("writingModeToggleHorizontal");
  elements.toggleWritingMode.setAttribute("aria-pressed", isVertical ? "true" : "false");
}

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

  updateWritingModeToggleLabel();
  updateReadingDirectionEpubButtonLabel();
  updateFloatingUIButtons();

  // [修正] ローディング表示を追加し、レンダリングを待機
  const isEpubOpen = currentBookInfo?.type === BOOK_TYPES.EPUB;
  if (isEpubOpen) {
    showLoading();
    // スピナーが表示されるよう、ブラウザの描画サイクルを1回回す
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, TIMING_CONFIG.ANIMATION_FRAME_DELAY_MS)));
  }

  try {
    await reader.applyReadingDirection(writingMode, pageDirection);
    updateProgressBarDirection();
    updateEpubScrollMode();
    storage.setSettings({ writingMode, pageDirection });
    persistReadingState({ writingMode, pageDirection });
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
  updateProgressBarDisplay();
  renderBookmarkMarkers();
}



async function pushCurrentBookSync() {
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
    updateSyncStatusDisplay();
  }
}

function toggleAutoSync(enabled) {
  autoSyncEnabled = enabled;
  storage.setSettings({ autoSyncEnabled: enabled });

  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
  if (autoSyncTimeout) {
    clearTimeout(autoSyncTimeout);
    autoSyncTimeout = null;
  }

  if (enabled) {
    // 定期的に自動同期 (TIMING_CONFIG.AUTO_SYNC_INTERVAL_MS)
    autoSyncInterval = setInterval(async () => {
      try {
        await pushCurrentBookSync();
        console.log('Auto-sync completed');
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, TIMING_CONFIG.AUTO_SYNC_INTERVAL_MS);
  }
}

function shouldEnableAutoSync(authStatus = checkAuthStatus()) {
  return isCloudSyncEnabled(authStatus);
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
  if (!autoSyncEnabled || !currentCloudBookId) return;
  const authStatus = checkAuthStatus();
  if (!shouldEnableAutoSync(authStatus)) {
    syncAutoSyncPolicy(authStatus);
    return;
  }
  if (autoSyncTimeout) {
    clearTimeout(autoSyncTimeout);
  }
  autoSyncTimeout = setTimeout(async () => {
    autoSyncTimeout = null;
    try {
      await pushCurrentBookSync();
    } catch (error) {
      console.error("Auto-sync failed:", error);
    }
  }, TIMING_CONFIG.AUTO_SYNC_DEBOUNCE_MS);
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
    renderLibrary();
    renderHistory();
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
  renderLibrary();

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
  renderBookmarks(bookmarkMenuMode);
  openExclusiveMenu(elements.bookmarkMenu);
}

function showHistory() {
  openExclusiveMenu(elements.historyModal);
  renderHistory();
}

function showSettings() {
  openExclusiveMenu(elements.settingsModal);
  const currentSettings = storage.getSettings();

  updateAuthStatusDisplay();
}

// ========================================
// イベントハンドラー
// ========================================

function setupEvents() {
  // メニューアクション
  elements.menuOpen?.addEventListener('click', () => {
    openFileDialog();
  });

  elements.menuLibrary?.addEventListener('click', () => {
    showLibrary();
  });

  elements.menuSearch?.addEventListener('click', () => {
    showSearch();
  });

  elements.menuBookmarks?.addEventListener('click', () => {
    showBookmarks();
  });

  elements.menuHistory?.addEventListener('click', () => {
    showHistory();
  });

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
    updateSpreadModeButtonLabel();
  });

  // 左開き/右開き切替ボタン (画像用)
  elements.toggleReadingDirectionImage?.addEventListener('click', () => {
    reader.toggleImageReadingDirection();
    updateReadingDirectionButtonLabel();
    updateProgressBarDirection();
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
    toggleFloatOverlay(false);
  });

  elements.openToc?.addEventListener('click', () => {
    if (!currentBookInfo || currentBookInfo.type !== BOOK_TYPES.EPUB) return;
    openModal(elements.tocModal);
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

  elements.settingsDefaultDirection?.addEventListener('change', (e) => {
    defaultDirection = e.target.value;
    storage.setSettings({ defaultDirection });
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

  // Manual sync button
  const manualSyncButton = document.getElementById(DOM_IDS.MANUAL_SYNC_BUTTON);
  const syncStatus = document.getElementById(DOM_IDS.SYNC_STATUS);

  manualSyncButton?.addEventListener('click', async () => {
    const authStatus = checkAuthStatus();
    if (!authStatus.authenticated) {
      if (syncStatus) {
        syncStatus.textContent = t('syncNeedsLoginStatus');
        setStatusClass(syncStatus, UI_CLASSES.STATUS_ERROR);
      }
      return;
    }

    try {
      manualSyncButton.disabled = true;
      manualSyncButton.textContent = t('syncInProgress');
      if (syncStatus) {
        syncStatus.textContent = t('syncStarting');
        setStatusClass(syncStatus, UI_CLASSES.STATUS_NEUTRAL);
      }

      // Pull index
      await syncAllBooksFromCloud();

      // If a book is open, sync its state
      if (currentBookId && currentCloudBookId) {
        await pushCurrentBookSync();
      }

      if (syncStatus) {
        syncStatus.textContent = `${UI_ICONS.CHECK_MARK} ${t('syncCompleted')}`;
        setStatusClass(syncStatus, UI_CLASSES.STATUS_SUCCESS);
        setTimeout(() => {
          syncStatus.textContent = '';
          setStatusClass(syncStatus, null);
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
        setStatusClass(syncStatus, UI_CLASSES.STATUS_ERROR);

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
    }
  });

  window.addEventListener('pagehide', () => {
    if (!autoSyncEnabled) return;
    const authStatus = checkAuthStatus();
    if (!authStatus.authenticated) {
      syncAutoSyncPolicy(authStatus);
      return;
    }
    pushCurrentBookSync().catch((error) => {
      console.error("Auto-sync failed:", error);
    });
  });
  // ズームボタン
  elements.toggleZoom?.addEventListener('click', handleToggleZoom);

  // プログレスバー矢印
  elements.progressPrev?.addEventListener('click', () => {

    reader.prev(1); // 1ページずつ戻る
  });

  elements.progressNext?.addEventListener('click', () => {

    reader.next(1); // 1ページずつ進む
  });

  // ライブラリ検索入力欄
  elements.librarySearchInput?.addEventListener('input', (e) => {
    filterLibraryCards(e.target.value);
  });
}

// ========================================
// 初期化
// ========================================

function init() {
  console.log("Initializing Epub Reader...");

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
  renderLibrary();

  // 検索ボタンの状態を更新
  updateSearchButtonState();

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
  handleAuthLogin().catch((error) => {
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
