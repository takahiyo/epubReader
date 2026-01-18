/**
 * app.js - メインアプリケーション
 * 
 * EPUB/画像書庫リーダーのメインエントリーポイント
 */

import { StorageService } from "./storage.js";
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
import { saveFile, loadFile, bufferToFile } from "./fileStore.js";
import { UI_STRINGS, getUiStrings, t as translate, tReplace, DEFAULT_LANGUAGE } from "./i18n.js";
import {
  APP_INFO,
  MIME_TYPES,
  SUPPORTED_FORMATS,
  TIMING_CONFIG,
  UI_COLORS,
  UI_DEFAULTS,
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
  if (legacyDirection === "rtl") {
    writingMode = "vertical";
    pageDirection = "rtl";
  } else if (legacyDirection === "ltr") {
    writingMode = "horizontal";
    pageDirection = "ltr";
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

// UI_STRINGS は i18n.js からインポート済み

// 1. Lottieアニメーションデータ（外部JSONから読み込み）
// SSOT: assets/animations/loader_book.json
let LOADER_ANIMATION_DATA = null;

// Lottieアニメーションデータを非同期で読み込む
async function loadLottieAnimationData() {
  if (LOADER_ANIMATION_DATA) return LOADER_ANIMATION_DATA;
  
  try {
    const response = await fetch('./assets/animations/loader_book.json');
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
  const container = document.getElementById('lottie-loader');
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
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.add('visible');
    lottieInstance?.play();
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('visible');
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

// ========================================
// DOM要素
// ========================================

const elements = {
  // リーダー
  fullscreenReader: document.getElementById("fullscreenReader"),
  viewer: document.getElementById("viewer"),
  imageViewer: document.getElementById("imageViewer"),
  pageImage: document.getElementById("pageImage"),
  emptyState: document.getElementById("emptyState"),
  cloudEmptyState: document.getElementById("cloudEmptyState"),
  cloudEmptyTitle: document.getElementById("cloudEmptyTitle"),
  cloudEmptyMeta: document.getElementById("cloudEmptyMeta"),
  cloudAttachButton: document.getElementById("cloudAttachButton"),
  floatOverlay: document.getElementById("floatOverlay"),
  floatBackdrop: document.querySelector("#floatOverlay .float-backdrop"),
  floatOpen: document.getElementById("floatOpen"),
  floatLibrary: document.getElementById("floatLibrary"),
  floatSearch: document.getElementById("floatSearch"),
  floatBookmarks: document.getElementById("floatBookmarks"),
  floatHistory: document.getElementById("floatHistory"),
  floatSettings: document.getElementById("floatSettings"),
  floatProgress: document.getElementById("floatProgress"),
  floatProgressPercent: document.getElementById("floatProgressPercent"),
  floatProgressTrack: document.getElementById("floatProgressTrack"),
  floatProgressMarks: document.getElementById("floatProgressMarks"),
  floatProgressFill: document.getElementById("floatProgressFill"),
  floatProgressThumb: document.getElementById("floatProgressThumb"),
  modalOverlay: document.getElementById("modalOverlay"),
  fontPlus: document.getElementById("fontPlus"),
  fontMinus: document.getElementById("fontMinus"),
  toggleTheme: document.getElementById("toggleTheme"),
  toggleLanguage: document.getElementById("toggleLanguage"),
  langIcon: document.getElementById("langIcon"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  floatLangMenu: document.getElementById("floatLangMenu"),
  openLangMenu: document.getElementById("openLangMenu"),
  floatLangJa: document.getElementById("floatLangJa"),
  floatLangEn: document.getElementById("floatLangEn"),

  // メニュー
  leftMenu: document.getElementById("leftMenu"),
  menuOpen: document.getElementById("menuOpen"),
  menuLibrary: document.getElementById("menuLibrary"),
  menuSearch: document.getElementById("menuSearch"),
  menuBookmarks: document.getElementById("menuBookmarks"),
  menuHistory: document.getElementById("menuHistory"),
  menuSettings: document.getElementById("menuSettings"),
  tocSection: document.getElementById("tocSection"),
  tocList: document.getElementById("tocList"),
  langJa: document.getElementById("langJa"),
  langEn: document.getElementById("langEn"),
  toggleWritingMode: document.getElementById("toggleWritingMode"),
  openToc: document.getElementById("openToc"),
  tocModal: document.getElementById("tocModal"),
  tocModalList: document.getElementById("tocModalList"),
  closeTocModal: document.getElementById("closeTocModal"),
  syncModal: document.getElementById("syncModal"),
  syncModalTitle: document.getElementById("syncModalTitle"),
  syncModalMessage: document.getElementById("syncModalMessage"),
  syncUseRemote: document.getElementById("syncUseRemote"),
  syncUseLocal: document.getElementById("syncUseLocal"),

  // 進捗バー
  progressBarPanel: document.getElementById("progressBarPanel"),
  progressBarBackdrop: document.getElementById("progressBarBackdrop"),
  progressFill: document.getElementById("progressFill"),
  progressThumb: document.getElementById("progressThumb"),
  progressTrack: document.querySelector(".progress-track"),
  currentPageInput: document.getElementById("currentPageInput"),
  totalPages: document.getElementById("totalPages"),
  progressPrev: document.getElementById("progressPrev"),
  progressNext: document.getElementById("progressNext"),

  // しおりメニュー
  bookmarkMenu: document.getElementById("bookmarkMenu"),
  bookmarkList: document.getElementById("bookmarkList"),
  addBookmarkBtn: document.getElementById("addBookmarkBtn"),
  closeBookmarkMenu: document.getElementById("closeBookmarkMenu"),

  // モーダル
  openFileModal: document.getElementById("openFileModal"),
  closeFileModal: document.getElementById("closeFileModal"),
  fileInput: document.getElementById("fileInput"),
  libraryGrid: document.getElementById("libraryGrid"),
  libraryViewGrid: document.getElementById("libraryViewGrid"),
  libraryViewList: document.getElementById("libraryViewList"),

  historyModal: document.getElementById("historyModal"),
  closeHistoryModal: document.getElementById("closeHistoryModal"),
  historyList: document.getElementById("historyList"),

  settingsModal: document.getElementById("settingsModal"),
  closeSettingsModal: document.getElementById("closeSettingsModal"),
  themeSelect: document.getElementById("themeSelect"),
  writingModeSelect: document.getElementById("writingMode"),
  pageDirectionSelect: document.getElementById("pageDirection"),
  settingsDefaultDirection: document.getElementById("settingsDefaultDirection"),
  progressDisplayModeSelect: document.getElementById("progressDisplayMode"),
  exportDataBtn: document.getElementById("exportDataBtn"),
  importDataInput: document.getElementById("importDataInput"),

  imageModal: document.getElementById("imageModal"),
  closeImageModal: document.getElementById("closeImageModal"),
  modalImage: document.getElementById("modalImage"),

  searchModal: document.getElementById("searchModal"),
  closeSearchModal: document.getElementById("closeSearchModal"),
  searchInput: document.getElementById("searchInput"),
  searchBtn: document.getElementById("searchBtn"),
  searchResults: document.getElementById("searchResults"),

  // UIラベル
  bookmarkMenuTitle: document.getElementById("bookmarkMenuTitle"),
  searchModalTitle: document.getElementById("searchModalTitle"),
  tocModalTitle: document.getElementById("tocModalTitle"),
  openFileModalTitle: document.getElementById("openFileModalTitle"),
  librarySectionTitle: document.getElementById("librarySectionTitle"),
  historyModalTitle: document.getElementById("historyModalTitle"),
  settingsModalTitle: document.getElementById("settingsModalTitle"),
  settingsDisplayTitle: document.getElementById("settingsDisplayTitle"),
  settingsDeviceTitle: document.getElementById("settingsDeviceTitle"),
  themeLabel: document.getElementById("themeLabel"),
  writingModeLabel: document.getElementById("writingModeLabel"),
  pageDirectionLabel: document.getElementById("pageDirectionLabel"),
  progressDisplayModeLabel: document.getElementById("progressDisplayModeLabel"),
  deviceIdLabel: document.getElementById("deviceIdLabel"),
  deviceIdInput: document.getElementById("deviceId"),
  deviceColorLabel: document.getElementById("deviceColorLabel"),
  deviceColorInput: document.getElementById("deviceColor"),
  settingsAccountTitle: document.getElementById("settingsAccountTitle"),
  googleLoginButton: document.getElementById("googleLoginButton"),
  syncToggleButton: document.getElementById("syncToggleButton"),
  userInfo: document.getElementById("userInfo"),
  syncStatus: document.getElementById("syncStatus"),

  settingsDataTitle: document.getElementById("settingsDataTitle"),
  importDataLabel: document.getElementById("importDataLabel"),

  // 候補選択モーダル
  candidateModal: document.getElementById("candidateModal"),
  candidateList: document.getElementById("candidateList"),
  candidateUseLocal: document.getElementById("candidateUseLocal"),
  closeCandidateModal: document.getElementById("closeCandidateModal"),

  // 画像書庫用ボタン
  toggleSpreadMode: document.getElementById("toggleSpreadMode"),
  toggleReadingDirectionEpub: document.getElementById("toggleReadingDirectionEpub"),
  toggleReadingDirectionImage: document.getElementById("toggleReadingDirectionImage"),
  toggleZoom: document.getElementById("toggleZoom"),
};

// ========================================
// リーダーコントローラー初期化
// ========================================

const reader = new ReaderController({
  viewerId: "viewer",
  imageViewerId: "imageViewer",
  imageElementId: "pageImage",
  pageIndicatorId: null, // 進捗バーで管理
  onProgress: handleProgress,
  onReady: handleBookReady,
  onImageZoom: openImageModal,
});

reader.applyTheme(theme);
reader.applyReadingDirection(writingMode, pageDirection);

// ========================================
// UIコントローラー初期化
// ========================================

const ui = new UIController({
  isBookOpen: () => currentBookId !== null,
  isPageNavigationEnabled: () => currentBookId !== null,
  isProgressBarAvailable: () => currentBookId !== null,
  isFloatVisible: () => floatVisible,
  isImageBook: () => currentBookInfo && (currentBookInfo.type === "zip" || currentBookInfo.type === "rar"),
  isSpreadMode: () => reader.imageViewMode === "spread",
  getWritingMode: () => (writingMode === "vertical" ? "vertical" : "horizontal"),
  getReadingDirection: () => {
    // EPUBの場合は pageDirection (ltr/rtl)
    if (currentBookInfo?.type === 'epub') {
      return pageDirection;
    }
    // 画像書庫の場合は reader.imageReadingDirection
    return reader.imageReadingDirection;
  },
  onFloatToggle: () => {
    toggleFloatOverlay();
  },
  onLeftMenu: (action) => {
    if (action === 'show') {

    }
  },
  onProgressBar: (action) => {
    if (action === 'show') {

      updateProgressBarDisplay();
    }
  },
  onBookmarkMenu: (action) => {
    if (action === 'show') {

      renderBookmarks(bookmarkMenuMode);
      bookmarkMenuMode = "current";
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

  elements.viewer.querySelectorAll("iframe").forEach(bindIframe);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.tagName === "IFRAME") {
          bindIframe(node);
          return;
        }
        node.querySelectorAll?.("iframe").forEach(bindIframe);
      });
    });
  });

  observer.observe(elements.viewer, { childList: true, subtree: true });
}

setupViewerIframeClickBridge();

// 進捗バーのドラッグハンドラー
const progressBarHandler = new ProgressBarHandler({
  container: elements.progressBarPanel?.querySelector('.progress-track'),
  thumb: elements.progressThumb,
  getIsRtl: () => {
    if (currentBookInfo && (currentBookInfo.type === "zip" || currentBookInfo.type === "rar")) {
      return reader.imageReadingDirection === "rtl";
    }
    if (currentBookInfo?.type === 'epub') {
      return pageDirection === 'rtl';
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
    if (currentBookInfo && (currentBookInfo.type === "zip" || currentBookInfo.type === "rar")) {
      return reader.imageReadingDirection === "rtl";
    }
    if (currentBookInfo?.type === 'epub') {
      return pageDirection === 'rtl';
    }
    return false;
  },
  onSeek: (percentage) => {
    seekToPercentage(percentage);
  },
});

function updateSearchButtonState() {
  if (!elements.menuSearch) return;

  const isEpubOpen = currentBookId && currentBookInfo?.type === 'epub';
  elements.menuSearch.disabled = !isEpubOpen;
  if (elements.openToc) {
    elements.openToc.disabled = !isEpubOpen;
  }
  if (elements.floatSearch) {
    elements.floatSearch.disabled = !isEpubOpen;
  }
}

// フローティングUIの切替ボタン表示を更新
function updateFloatingUIButtons() {
  // 画像書庫かどうかを判定 (type が "zip" または "rar")
  const isImageBook = currentBookInfo && (currentBookInfo.type === "zip" || currentBookInfo.type === "rar");
  const isEpub = currentBookInfo && currentBookInfo.type === "epub";
  const isBookOpen = currentBookId !== null;

  // 目次ボタン (#openToc)
  // 書籍（EPUB）が開かれていない状態では無効化
  if (elements.openToc) {
    elements.openToc.disabled = !isEpub;
  }

  // 縦/横書き切替ボタン: 常に表示するが、EPUB以外では無効化
  if (elements.toggleWritingMode) {
    elements.toggleWritingMode.style.display = "";
    elements.toggleWritingMode.disabled = !isEpub;
  }

  // 見開き/単ページ切替ボタン: 画像書庫のみ表示
  if (elements.toggleSpreadMode) {
    elements.toggleSpreadMode.style.display = isImageBook ? "" : "none";
    updateSpreadModeButtonLabel();
  }

  // 左開き/右開き切替ボタン
  if (elements.toggleReadingDirectionEpub) {
    if (isEpub) {
      elements.toggleReadingDirectionEpub.style.display = "";
      // 【修正】横書きでも開き方向（操作方向）の変更を許可するため、無効化ロジックを削除
      elements.toggleReadingDirectionEpub.disabled = false;
      elements.toggleReadingDirectionEpub.style.opacity = "";
      updateReadingDirectionEpubButtonLabel();
    } else {
      elements.toggleReadingDirectionEpub.style.display = "none";
    }
  }

  if (elements.toggleReadingDirectionImage) {
    if (isImageBook) {
      elements.toggleReadingDirectionImage.style.display = "";
      updateReadingDirectionButtonLabel();
    } else {
      elements.toggleReadingDirectionImage.style.display = "none";
    }
  }

  // ズームボタン: ブックが開いている時のみ表示
  if (elements.toggleZoom) {
    elements.toggleZoom.style.display = isBookOpen ? "" : "none";
    updateZoomButtonLabel();
  }

  // プログレスバーの矢印: 画像書庫のみ表示
  if (elements.progressPrev) {
    elements.progressPrev.classList.toggle('hidden', !isImageBook);
  }
  if (elements.progressNext) {
    elements.progressNext.classList.toggle('hidden', !isImageBook);
  }

  // 進捗バーの方向を更新
  updateProgressBarDirection();
}

function handleToggleZoom() {
  // ズーム切替
  const isZoomed = reader.toggleZoom();

  // Bodyにクラス適用（UI制御用）
  if (isZoomed) {
    document.body.classList.add('is-zoomed');
  } else {
    document.body.classList.remove('is-zoomed');
  }

  updateZoomButtonLabel();
}

// 見開きボタンのラベルを更新
function updateSpreadModeButtonLabel() {
  if (!elements.toggleSpreadMode) return;
  const isSpread = reader.imageViewMode === "spread";

  if (isSpread) {
    elements.toggleSpreadMode.innerHTML = `<span class="material-icons">auto_stories</span> ${t('spreadModeDouble')}`;
    elements.toggleSpreadMode.classList.add('active');
  } else {
    elements.toggleSpreadMode.innerHTML = `<span class="material-icons">tablet</span> ${t('spreadModeSingle')}`;
    elements.toggleSpreadMode.classList.remove('active');
  }
}

// 左開き/右開きボタンのラベルを更新 (画像用)
function updateReadingDirectionButtonLabel() {
  if (!elements.toggleReadingDirectionImage) return;
  const isRtl = reader.imageReadingDirection === "rtl";
  elements.toggleReadingDirectionImage.textContent = isRtl ? t('pageDirectionRtlButton') : t('pageDirectionLtrButton');
  elements.toggleReadingDirectionImage.title = isRtl ? "右開き（右から左へ読む）" : "左開き（左から右へ読む）";
}

// 左開き/右開きボタンのラベルを更新 (EPUB用)
function updateReadingDirectionEpubButtonLabel() {
  if (!elements.toggleReadingDirectionEpub) return;
  const isRtl = pageDirection === "rtl";
  elements.toggleReadingDirectionEpub.textContent = isRtl ? t('pageDirectionRtlButton') : t('pageDirectionLtrButton');
  elements.toggleReadingDirectionEpub.title = isRtl ? "右開き（右から左へ読む）" : "左開き（左から右へ読む）";
}

// ズームボタンのラベルを更新
function updateZoomButtonLabel() {
  if (!elements.toggleZoom) return;
  const isZoomed = reader.imageZoomed;
  elements.toggleZoom.textContent = isZoomed ? t('zoomOut') : t('zoomIn');
  elements.toggleZoom.title = isZoomed ? "ズームを解除" : "ズームする";
}

// 進捗バーの方向を更新（RTL時は反転）
function updateProgressBarDirection() {
  const isImageBook = currentBookInfo && (currentBookInfo.type === "zip" || currentBookInfo.type === "rar");
  let isRtl = false;

  if (isImageBook) {
    isRtl = reader.imageReadingDirection === "rtl";
  } else if (currentBookInfo?.type === 'epub') {
    isRtl = pageDirection === 'rtl';
  }

  const floatProgressBar = document.getElementById("floatProgress");
  if (floatProgressBar) {
    if (isRtl) {
      floatProgressBar.classList.add("rtl-progress");
    } else {
      floatProgressBar.classList.remove("rtl-progress");
    }
  }

  const progressBarWrapper = document.querySelector('.progress-bar-wrapper');
  if (progressBarWrapper) {
    if (isRtl) {
      progressBarWrapper.classList.add('rtl-mode');
    } else {
      progressBarWrapper.classList.remove('rtl-mode');
    }
  }

  // [追加] 画像ビューア自体のRTLクラス切替 (スプレッド表示の順序制御用)
  if (elements.imageViewer) {
    if (isRtl) {
      elements.imageViewer.classList.add('rtl-mode');
    } else {
      elements.imageViewer.classList.remove('rtl-mode');
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
    const timeText = uiLanguage === "en"
      ? formatRelativeTimeEn(lastSyncAt)
      : formatRelativeTime(lastSyncAt);
    elements.syncStatus.textContent = t("syncStatusLabel").replace("{time}", timeText || "--");
  }
}

function toggleFloatOverlay(forceVisible) {
  // ズーム中はフローティングメニュー制御を完全に無視
  if (document.body.classList.contains('is-zoomed')) {
    return;
  }

  if (!elements.floatOverlay) return;
  const nextVisible = typeof forceVisible === "boolean" ? forceVisible : !floatVisible;
  floatVisible = nextVisible;
  elements.floatOverlay.classList.toggle("visible", floatVisible);

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

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return "1分未満";
  if (diffMinutes < 60) return `${diffMinutes}分前`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間前`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}日前`;
}

function formatRelativeTimeEn(timestamp) {
  if (!timestamp) return "";
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return "less than a minute ago";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} days ago`;
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
  const relativeTime = uiLanguage === "en" ? formatRelativeTimeEn(timestamp) : formatRelativeTime(timestamp);
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
      title: normalizedMeta.title || localInfo?.title || "Untitled",
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
    elements.cloudEmptyState.classList.remove("hidden");
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
    elements.cloudEmptyState.classList.add("hidden");
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
  const timeText = uiLanguage === "en"
    ? formatRelativeTimeEn(timestamp)
    : formatRelativeTime(timestamp);
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
      const title = candidate.meta?.title || "Untitled";
      const author = candidate.meta?.author || "";
      const lastRead = candidate.meta?.lastReadAt
        ? (uiLanguage === "en" ? formatRelativeTimeEn(candidate.meta.lastReadAt) : formatRelativeTime(candidate.meta.lastReadAt))
        : "";

      item.innerHTML = `
        <div class="candidate-title">${title}</div>
        <div class="candidate-author">${author}</div>
        <div class="candidate-meta">ID: ${candidate.cloudBookId.slice(0, 8)}... ${lastRead ? `• ${t("syncStatusLabel").replace("{time}", lastRead)}` : ""}</div>
      `;

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
    title: overrides.title ?? info?.title ?? existing.title ?? "Untitled",
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


    // ファイルタイプを自動判別
    const type = detectFileType(file);
    console.log(`Detected file type: ${type}`);

    const buffer = await file.arrayBuffer();
    console.log(`File buffer loaded: ${buffer.byteLength} bytes`);

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
    const isImageBook = info.type === "zip" || info.type === "rar";
    if (!isImageBook) {
      console.log("Opening EPUB...");

      // 空の状態を非表示、ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add('hidden');
      if (elements.imageViewer) elements.imageViewer.classList.add('hidden');
      if (elements.viewer) {
        elements.viewer.classList.remove('hidden');
        elements.viewer.classList.add('visible');
      }
      // EPUBスクロールモードを解除（ページ分割描画のため）
      if (elements.fullscreenReader) {
        elements.fullscreenReader.classList.remove('epub-scroll');
      }

      showLoading();

      // ★追加: UI描画更新のために少し待機
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

      try {
        await reader.openEpub(new File([buffer], file.name, { type: mime }), {
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
      if (elements.emptyState) elements.emptyState.classList.add('hidden');
      if (elements.viewer) {
        elements.viewer.classList.add('hidden');
        elements.viewer.classList.remove('visible');
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove('hidden');

      await reader.openImageBook(
        new File([buffer], file.name, { type: mime }),
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

    // JSZipエラーは警告のみ（ファイルは正常に開ける可能性が高い）
    if (error.message && (error.message.includes('JSZip') || error.message.includes('not defined'))) {
      console.warn("JSZip warning detected, but file may have opened successfully");
      // エラーダイアログを表示しない（ファイルが開けているため）
      hideLoading();
      return;
    }

    // より詳細なエラーメッセージ
    let userMessage = `${t('errorFileLoadFailed')}\n\n${t('errorFileName')}: ${file.name}\n${t('errorFileSize')}: ${(file.size / 1024 / 1024).toFixed(2)} MB\n\n`;

    if (error.message.includes('画像が見つかりませんでした') || error.message.includes('No images found')) {
      userMessage += t('errorNoImagesFound');
    } else if (error.message.includes('画像の読み込みに失敗') || error.message.includes('Failed to load image')) {
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
    elements.viewer.classList.add("hidden");
    elements.viewer.classList.remove("visible");
  }
  if (elements.imageViewer) elements.imageViewer.classList.add("hidden");
  if (elements.emptyState) elements.emptyState.classList.remove("hidden");
  if (elements.progressBarPanel) elements.progressBarPanel.classList.add("hidden");
  if (elements.progressBarBackdrop) elements.progressBarBackdrop.classList.add("hidden");
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

    hideCloudEmptyState();
    // isImageBook: zip または rar の場合
    const isImageBook = info.type === "zip" || info.type === "rar";
    if (!isImageBook) {
      // 空の状態を非表示、ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add('hidden');
      if (elements.imageViewer) elements.imageViewer.classList.add('hidden');
      if (elements.viewer) {
        elements.viewer.classList.remove('hidden');
        elements.viewer.classList.add('visible');
      }
      // EPUBスクロールモードを解除（ページ分割描画のため）
      if (elements.fullscreenReader) {
        elements.fullscreenReader.classList.remove('epub-scroll');
      }

      await reader.openEpub(file, { location: start, percentage: startProgress });
    } else {
      // 空の状態を非表示、画像ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add('hidden');
      if (elements.viewer) {
        elements.viewer.classList.add('hidden');
        elements.viewer.classList.remove('visible');
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove('hidden');

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

function detectFileType(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'epub') return 'epub';
  if (ext === 'rar' || ext === 'cbr') return 'rar'; // Treat .cbr as RAR
  return 'zip'; // Treat .zip, .cbz as ZIP
}

function fileTitle(name) {
  return name.replace(/\.[^.]+$/, "");
}

function guessMime(type, file) {
  if (type === "epub") return "application/epub+zip";
  if (type === "image") {
    // This branch is for internal image files inside archives, likely unused for the main file
    // But keeping logic consistent if it were used
    return "application/octet-stream";
  }

  // For the main file passed to saveFile/handleFile
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "cbr") return "application/x-cbr";
  if (ext === "cbz") return "application/vnd.comicbook+zip";
  if (ext === "rar") return "application/vnd.rar";

  return file.type || "application/octet-stream";
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
    elements.progressBarPanel.classList.add('hidden');
  }
  if (elements.progressBarBackdrop) {
    elements.progressBarBackdrop.classList.add('hidden');
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
      if (currentBookInfo?.type === 'epub') {
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
            elements.totalPages.textContent = '100';
          }
        }
      } else if (currentBookInfo && (currentBookInfo.type === 'zip' || currentBookInfo.type === 'rar')) {
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
          elements.totalPages.textContent = '100';
        }
      }
    } else {
      // パーセンテージモード
      elements.currentPageInput.value = Math.round(percentage);

      if (elements.totalPages) {
        elements.totalPages.textContent = '100';
      }
    }
  }

  renderBookmarkMarkers();
}

function renderBookmarkMarkers() {
  if (!elements.progressTrack) return;
  elements.progressTrack.querySelectorAll(".bookmark-marker").forEach((node) => node.remove());
  if (!currentBookId) return;

  const bookmarks = storage.getBookmarks(currentBookId);
  if (!bookmarks.length) return;

  bookmarks.forEach((bookmark) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "bookmark-marker";
    const percentage = Math.min(100, Math.max(0, bookmark.percentage ?? 0));
    marker.style.left = `${percentage}%`;
    if (bookmark.deviceColor) {
      marker.style.background = bookmark.deviceColor;
      marker.style.borderColor = UI_COLORS.BOOKMARK_MARKER_BORDER;
    }

    // ツールチップの表示内容を進捗表示モードに合わせる
    let tooltipText = bookmark.label ?? t("bookmarkDefault");
    if (progressDisplayMode === "page") {
      // ページ数モードの場合
      if (currentBookInfo?.type === 'epub') {
        const totalPages = getEpubPaginationTotal();
        if (totalPages) {
          const pageIndex = Math.max(1, Math.round((percentage / 100) * totalPages));
          tooltipText += ` (${pageIndex}/${totalPages})`;
        } else {
          tooltipText += ` (${percentage}%)`;
        }
      } else if (currentBookInfo && (currentBookInfo.type === 'zip' || currentBookInfo.type === 'rar')) {
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
  elements.floatProgressMarks.querySelectorAll(".bookmark-marker").forEach((node) => node.remove());
  if (!currentBookId) return;

  const bookmarks = storage.getBookmarks(currentBookId);
  if (!bookmarks.length) return;

  bookmarks.forEach((bookmark) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "bookmark-marker";
    const percentage = Math.min(100, Math.max(0, bookmark.percentage ?? 0));
    marker.style.left = `${percentage}%`;
    if (bookmark.deviceColor) {
      marker.style.background = bookmark.deviceColor;
      marker.style.borderColor = UI_COLORS.BOOKMARK_MARKER_BORDER;
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

  if (currentBookInfo.type === "epub") {
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
  if (currentBookInfo.type === 'epub') {
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
  if (currentBookInfo.type === 'epub') {
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
  if (currentBookInfo?.type !== 'epub' || !elements.fullscreenReader) return;
  if (reader?.usingPaginator) {
    elements.fullscreenReader.classList.remove('epub-scroll');
    return;
  }
  const resolvedWritingMode = reader?.writingMode ?? currentBookInfo?.writingMode ?? writingMode;
  if (resolvedWritingMode === "vertical") {
    console.log('[updateEpubScrollMode] Disabling epub-scroll for vertical reading');
    elements.fullscreenReader.classList.remove('epub-scroll');
    return;
  }
  if (resolvedWritingMode === "horizontal") {
    console.log('[updateEpubScrollMode] Enabling epub-scroll for horizontal reading');
    elements.fullscreenReader.classList.add('epub-scroll');
  }
}

// ========================================
// 目次管理
// ========================================

function renderToc(tocItems = []) {
  if (!elements.tocModalList) return;

  if (elements.tocList) {
    elements.tocList.innerHTML = "";
  }
  elements.tocModalList.innerHTML = "";
  const isEpub = currentBookInfo?.type === "epub";

  if (!isEpub || !tocItems.length) {
    elements.tocSection?.classList.add("hidden");
    console.log('[renderToc] Hiding TOC section:', { isEpub, tocCount: tocItems.length });
    return;
  }

  console.log('[renderToc] Showing TOC section with', tocItems.length, 'items');
  elements.tocSection?.classList.add("hidden");
  renderTocEntries(tocItems, elements.tocModalList, 0);
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
      empty.style.color = "var(--muted)";
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
      deleteBtn.textContent = t('deleteIcon');
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
    empty.style.color = "var(--muted)";
    elements.bookmarkList.appendChild(empty);
    renderBookmarkMarkers();
    return;
  }

  const bookmarks = storage.getBookmarks(currentBookId);

  if (!bookmarks.length) {
    const empty = document.createElement("li");
    empty.textContent = t("bookmarkEmpty");
    empty.style.textAlign = "center";
    empty.style.color = "var(--muted)";
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
      if (currentBookInfo?.type === 'epub') {
        const totalPages = getEpubPaginationTotal();
        if (totalPages) {
          const pageIndex = Math.max(1, Math.round((bookmark.percentage / 100) * totalPages));
          metaText += ` / ${pageIndex}/${totalPages}`;
        } else {
          metaText += ` / ${bookmark.percentage}%`;
        }
      } else if (currentBookInfo?.type === 'image') {
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
    deleteBtn.textContent = t('deleteIcon');
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
    empty.style.color = "var(--muted)";
    empty.style.gridColumn = "1 / -1";
    elements.libraryGrid.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "library-card";
    card.onclick = () => {
      if (entry.hasLocalFile && entry.localBookId) {
        openFromLibrary(entry.localBookId);
      } else if (entry.cloudBookId) {
        openCloudOnlyBook(entry.cloudBookId);
      }
    };

    const cover = document.createElement("div");
    cover.className = "library-cover";
    cover.textContent = entry.title?.slice(0, 2) || t('bookIcon');

    const title = document.createElement("div");
    title.className = "library-title";
    title.textContent = entry.title;

    const meta = document.createElement("div");
    meta.className = "library-meta";
    meta.textContent = formatLibraryMeta({
      progressPercentage: entry.progressPercentage,
      timestamp: entry.lastTimestamp,
    });

    const actions = document.createElement("div");
    actions.className = "library-actions";

    // ファイルタイプバッジ [EPUB] [ZIP] [RAR]
    if (entry.fileType) {
      const typeBadge = document.createElement("span");
      typeBadge.className = "library-type-badge";
      typeBadge.textContent = `[${entry.fileType.toUpperCase()}]`;
      actions.appendChild(typeBadge);
    }

    if (!entry.hasLocalFile) {
      const badge = document.createElement("span");
      badge.className = "library-badge";
      badge.textContent = t("libraryCloudMissingBadge");
      actions.appendChild(badge);
    }

    if (!entry.hasLocalFile && entry.cloudBookId) {
      const attachButton = document.createElement("button");
      attachButton.type = "button";
      attachButton.className = "library-attach";
      attachButton.textContent = t("libraryAttachFile");
      attachButton.onclick = (event) => {
        event.stopPropagation();
        pendingCloudBookId = entry.cloudBookId;
        openFileDialog();
      };
      actions.appendChild(attachButton);
    }

    card.append(cover, title, meta, actions);
    elements.libraryGrid.appendChild(card);
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
    empty.style.color = "var(--muted)";
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
    deleteBtn.textContent = t('deleteIcon');
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
  if (!query || !currentBookId || currentBookInfo?.type !== 'epub' || !reader.book) {
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
  if (modal.classList.contains("bookmark-menu")) {
    return modal.classList.contains("visible");
  }
  return !modal.classList.contains("hidden");
}

function openModal(modal) {
  if (!modal) return;
  // floatOverlay(blur) がモーダルより前面に残るのを防ぐ
  toggleFloatOverlay(false);
  if (elements.modalOverlay && modal.parentElement !== elements.modalOverlay) {
    elements.modalOverlay.appendChild(modal);
  }
  if (elements.modalOverlay) {
    elements.modalOverlay.classList.add("visible");
  }
  if (modal.classList.contains("bookmark-menu")) {
    modal.classList.add("visible");
    ui.bookmarkMenuVisible = true;
  } else {
    modal.classList.remove("hidden");
  }

}

function closeModal(modal) {
  if (!modal) return;
  if (modal.classList.contains("bookmark-menu")) {
    modal.classList.remove("visible");
    ui.bookmarkMenuVisible = false;
  } else {
    modal.classList.add("hidden");
  }
  if (!elements.modalOverlay) return;
  const hasVisibleModal = Array.from(elements.modalOverlay.children).some((child) => {
    if (!(child instanceof HTMLElement)) return false;
    return isModalVisible(child);
  });
  if (!hasVisibleModal) {
    elements.modalOverlay.classList.remove("visible");
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
  elements.toggleTheme.textContent = theme === "dark" ? "🌙" : "☀️";
  elements.toggleTheme.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function applyFontSize(nextSize) {
  if (!Number.isFinite(nextSize)) return;
  const clamped = Math.min(28, Math.max(12, Math.round(nextSize)));
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
  elements.langJa?.classList.toggle("active", uiLanguage === "ja");
  elements.langEn?.classList.toggle("active", uiLanguage === "en");
  if (elements.langIcon) {
    elements.langIcon.src = uiLanguage === "ja" ? "assets/Flag_Japan.svg" : "assets/Flag_America.svg";
  }
  persistReadingState({ uiLanguage });

  const strings = getUiStrings(nextLanguage);
  document.title = strings.documentTitle;
  const emptyTitle = elements.emptyState?.querySelector("h2");
  const emptyDescription = elements.emptyState?.querySelector("p");
  if (emptyTitle) emptyTitle.textContent = strings.emptyTitle;
  if (emptyDescription) emptyDescription.textContent = strings.emptyDescription;
  if (elements.cloudAttachButton) elements.cloudAttachButton.textContent = strings.libraryAttachFile;
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

  const setMenuLabel = (button, text) => {
    const label = button?.querySelector("span:last-child");
    if (label) label.textContent = text;
  };
  const setFloatLabel = (button, icon, text) => {
    if (!button) return;
    button.textContent = `${icon} ${text}`;
  };
  setMenuLabel(elements.menuOpen, strings.menuOpen);
  setMenuLabel(elements.menuLibrary, strings.menuLibrary);
  setMenuLabel(elements.menuSearch, strings.menuSearch);
  setMenuLabel(elements.menuBookmarks, strings.menuBookmarks);
  setMenuLabel(elements.menuHistory, strings.menuHistory);
  setMenuLabel(elements.menuSettings, strings.menuSettings);
  setFloatLabel(elements.floatOpen, "📂", strings.menuOpen);
  setFloatLabel(elements.floatLibrary, "📚", strings.menuLibrary);
  setFloatLabel(elements.floatSearch, "🔍", strings.menuSearch);
  setFloatLabel(elements.floatBookmarks, "🔖", strings.menuBookmarks);
  setFloatLabel(elements.floatHistory, "🕘", strings.menuHistory);

  if (elements.openToc) elements.openToc.textContent = strings.tocButton;
  if (elements.bookmarkMenuTitle) elements.bookmarkMenuTitle.textContent = strings.bookmarkTitle;
  if (elements.addBookmarkBtn) elements.addBookmarkBtn.textContent = strings.addBookmark;
  if (elements.searchModalTitle) elements.searchModalTitle.textContent = strings.searchTitle;
  if (elements.searchInput) elements.searchInput.placeholder = strings.searchPlaceholder;
  if (elements.searchBtn) elements.searchBtn.textContent = strings.searchButton;
  if (elements.tocModalTitle) elements.tocModalTitle.textContent = strings.tocTitle;
  if (elements.syncModalTitle) elements.syncModalTitle.textContent = strings.syncPromptTitle;
  if (elements.syncModalMessage) elements.syncModalMessage.textContent = strings.syncPromptMessage;
  if (elements.syncUseLocal) elements.syncUseLocal.textContent = strings.syncPromptLocal;
  if (elements.openFileModalTitle) elements.openFileModalTitle.textContent = strings.openFileTitle;
  if (elements.librarySectionTitle) elements.librarySectionTitle.textContent = strings.librarySectionTitle;
  if (elements.historyModalTitle) elements.historyModalTitle.textContent = strings.historyTitle;
  if (elements.settingsModalTitle) elements.settingsModalTitle.textContent = strings.settingsTitle;
  if (elements.settingsDisplayTitle) elements.settingsDisplayTitle.textContent = strings.settingsDisplayTitle;
  if (elements.settingsDeviceTitle) elements.settingsDeviceTitle.textContent = strings.settingsDeviceTitle;
  if (elements.themeLabel) elements.themeLabel.textContent = strings.themeLabel;
  if (elements.writingModeLabel) elements.writingModeLabel.textContent = strings.writingModeLabel;
  if (elements.pageDirectionLabel) elements.pageDirectionLabel.textContent = strings.pageDirectionLabel;
  if (elements.progressDisplayModeLabel) elements.progressDisplayModeLabel.textContent = strings.progressDisplayModeLabel;
  if (elements.deviceIdLabel) elements.deviceIdLabel.textContent = strings.deviceIdLabel;
  if (elements.deviceColorLabel) elements.deviceColorLabel.textContent = strings.deviceColorLabel;
  if (elements.settingsAccountTitle) elements.settingsAccountTitle.textContent = strings.settingsAccountTitle;
  if (elements.googleLoginButton) elements.googleLoginButton.textContent = strings.googleLoginLabel;
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
    const input = elements.importDataLabel.querySelector("input");
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

  updateWritingModeToggleLabel();
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
  const isVertical = writingMode === "vertical";
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
  const isEpubOpen = currentBookInfo?.type === 'epub';
  if (isEpubOpen) {
    showLoading();
    // スピナーが表示されるよう、ブラウザの描画サイクルを1回回す
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, TIMING_CONFIG.ANIMATION_FRAME_DELAY_MS)));
  }

  try {
    await reader.applyReadingDirection(writingMode, pageDirection);
    updateEpubScrollMode();
    storage.setSettings({ writingMode, pageDirection });
    persistReadingState({ writingMode });
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
  elements.libraryViewGrid?.classList.toggle("active", mode === "grid");
  elements.libraryViewList?.classList.toggle("active", mode === "list");
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

function openFileDialog() {
  if (elements.fileInput) {
    // ユーザー操作同期ハンドラ内であれば showPicker が推奨される
    if (typeof elements.fileInput.showPicker === 'function') {
      try {
        elements.fileInput.showPicker();
        return;
      } catch (e) {
        console.warn('showPicker failed, falling back to click:', e);
      }
    }
    // フォールバック or 非対応ブラウザ
    elements.fileInput.click();
  }
}

function showLibrary() {
  openModal(elements.openFileModal);
  renderLibrary();
}

function showSearch() {
  if (!currentBookId || currentBookInfo?.type !== 'epub') {
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
    const nextMode = writingMode === "vertical" ? "horizontal" : "vertical";
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
    const nextDirection = pageDirection === "rtl" ? "ltr" : "rtl";
    await applyReadingSettings(null, nextDirection);
    if (elements.pageDirectionSelect) {
      elements.pageDirectionSelect.value = pageDirection;
    }
  });



  elements.fontPlus?.addEventListener('click', () => {
    applyFontSize((fontSize ?? 16) + 1);
  });

  elements.fontMinus?.addEventListener('click', () => {
    applyFontSize((fontSize ?? 16) - 1);
  });

  elements.toggleTheme?.addEventListener('click', () => {
    applyTheme(theme === "dark" ? "light" : "dark");
  });

  elements.toggleLanguage?.addEventListener('click', () => {
    applyUiLanguage(uiLanguage === "ja" ? "en" : "ja");
  });

  // 言語メニュー（フロートUI用・地球儀ボタン横）
  elements.openLangMenu?.addEventListener('click', () => {
    elements.floatLangMenu?.classList.toggle("hidden");
  });

  elements.floatLangJa?.addEventListener('click', () => {
    applyUiLanguage("ja");
    elements.floatLangMenu?.classList.add("hidden");
  });

  elements.floatLangEn?.addEventListener('click', () => {
    applyUiLanguage("en");
    elements.floatLangMenu?.classList.add("hidden");
  });

  elements.floatBackdrop?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFloatOverlay(false);
  });

  elements.openToc?.addEventListener('click', () => {
    if (!currentBookInfo || currentBookInfo.type !== "epub") return;
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
          if (currentBookInfo?.type === 'epub') {
            // EPUBの場合はページ数として扱う
            const totalPages = getEpubPaginationTotal();
            if (totalPages) {
              const percentage = (value / totalPages) * 100;
              seekToPercentage(Math.max(0, Math.min(percentage, 100)));
            } else {
              seekToPercentage(Math.max(0, Math.min(value, 100)));
            }
          } else if (currentBookInfo && (currentBookInfo.type === 'zip' || currentBookInfo.type === 'rar')) {
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
  const manualSyncButton = document.getElementById('manualSyncButton');
  const syncStatus = document.getElementById('syncStatus');

  manualSyncButton?.addEventListener('click', async () => {
    const authStatus = checkAuthStatus();
    if (!authStatus.authenticated) {
      if (syncStatus) {
        syncStatus.textContent = t('syncNeedsLoginStatus');
        syncStatus.style.color = UI_COLORS.ERROR;
      }
      return;
    }

    try {
      manualSyncButton.disabled = true;
      manualSyncButton.textContent = t('syncInProgress');
      if (syncStatus) {
        syncStatus.textContent = t('syncStarting');
        syncStatus.style.color = UI_COLORS.NEUTRAL;
      }

      // Pull index
      await syncAllBooksFromCloud();

      // If a book is open, sync its state
      if (currentBookId && currentCloudBookId) {
        await pushCurrentBookSync();
      }

      if (syncStatus) {
        syncStatus.textContent = t('syncCompleted');
        syncStatus.style.color = UI_COLORS.SUCCESS;
        setTimeout(() => {
          syncStatus.textContent = '';
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

        syncStatus.textContent = `✗ ${userMessage}`;
        syncStatus.style.color = UI_COLORS.ERROR;

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
      if (e.target.classList.contains('modal-backdrop') || e.target === modal) {
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
    if (!elements.openFileModal?.classList.contains('hidden') ||
      !elements.historyModal?.classList.contains('hidden') ||
      !elements.settingsModal?.classList.contains('hidden') ||
      !elements.imageModal?.classList.contains('hidden') ||
      !elements.searchModal?.classList.contains('hidden') ||
      !elements.syncModal?.classList.contains('hidden')) {
      return;
    }

    const targetElement = event.target instanceof Element ? event.target : null;
    if (targetElement?.closest('.left-menu, .progress-bar-panel, .bookmark-menu')) {
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
    if (!elements.openFileModal?.classList.contains('hidden') ||
      !elements.historyModal?.classList.contains('hidden') ||
      !elements.settingsModal?.classList.contains('hidden') ||
      !elements.imageModal?.classList.contains('hidden') ||
      !elements.searchModal?.classList.contains('hidden')) {
      return;
    }



    switch (e.key) {
      case 'ArrowLeft':
        if (pageDirection === 'rtl') {
          reader.next(); // 右開きの場合、左キーで次ページ
        } else {
          reader.prev();
        }
        break;
      case 'ArrowRight':
        if (pageDirection === 'rtl') {
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
}

// ========================================
// 初期化
// ========================================

function init() {
  console.log("Initializing Epub Reader...");

  // ライブラリ読み込み確認
  console.log("JSZip:", typeof JSZip !== "undefined" ? "✓" : "✗");
  console.log("ePub:", typeof ePub !== "undefined" ? "✓" : "✗");

  // イベント設定
  setupEvents();

  // テーマ適用
  applyTheme(theme);
  if (!Number.isFinite(fontSize)) {
    const baseFont = Number.parseFloat(
      window.getComputedStyle(elements.viewer || document.body)?.fontSize
    );
    fontSize = Number.isFinite(baseFont) ? baseFont : 16;
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
