// メインアプリケーション - 新UI対応版

import { StorageService } from "./storage.js";
import { ReaderController } from "./reader.js";
import { CloudSync } from "./cloudSync.js";
import { UIController, ProgressBarHandler } from "./ui.js";
import {
  updateActivity,
  checkAuthStatus,
  initGoogleLogin,
  logout,
  onGoogleLoginStart as startGoogleLoginUi,
  onGoogleLoginEnd as endGoogleLoginUi,
} from "./auth.js";
import { saveFile, loadFile, bufferToFile } from "./fileStore.js";

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
let theme = settings.theme ?? "dark";
let writingMode = settings.writingMode;
let pageDirection = settings.pageDirection;
let uiLanguage = settings.uiLanguage ?? "en";
let progressDisplayMode = settings.progressDisplayMode ?? "page";
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
if (!writingMode) writingMode = "horizontal";
if (!pageDirection) pageDirection = "ltr";
let autoSyncEnabled = false;
let libraryViewMode = settings.libraryViewMode ?? "grid";
let autoSyncInterval = null;
let autoSyncTimeout = null;
let bookmarkMenuMode = "current";
let currentToc = [];
let uiInitialized = false;
let floatVisible = false;
let googleLoginReady = false;

const UI_STRINGS = {
  ja: {
    documentTitle: "Epub Reader",
    emptyTitle: "本が選択されていません",
    emptyDescription: "画面中央をクリックしてメニューを表示",
    menuOpen: "開く",
    menuLibrary: "ライブラリ",
    menuSearch: "テキスト検索",
    menuBookmarks: "しおり",
    menuHistory: "履歴",
    menuSettings: "設定",
    tocButton: "目次",
    bookmarkTitle: "しおり",
    bookmarkDefault: "しおり",
    addBookmark: "✚ 現在位置にしおりを追加",
    searchTitle: "テキスト検索",
    searchPlaceholder: "検索キーワードを入力...",
    searchButton: "🔍 検索",
    tocTitle: "目次",
    tocUntitled: "無題",
    openFileTitle: "ライブラリ",
    librarySectionTitle: "ライブラリ",
    historyTitle: "履歴",
    settingsTitle: "設定",
    settingsDisplayTitle: "表示設定",
    themeLabel: "テーマ",
    themeDark: "ダークモード",
    themeLight: "ライトモード",
    writingModeLabel: "書字方向",
    writingModeHorizontal: "横書き",
    writingModeVertical: "縦書き",
    pageDirectionLabel: "開き方向",
    pageDirectionLtr: "左開き",
    pageDirectionRtl: "右開き",
    progressDisplayModeLabel: "進捗表示形式",
    progressDisplayPage: "ページ数",
    progressDisplayPercentage: "パーセンテージ",
    settingsAccountTitle: "アカウント",
    googleLoginLabel: "Googleログイン",
    googleLogoutLabel: "ログオフ",
    googleLoginStatusSignedOut: "未ログイン",
    googleLoginStatusSignedIn: "ログイン済み: {user}",
    googleLoginStatusSignedInShort: "ログイン済み",
    googleLoginFailed: "ログインに失敗しました",
    syncToggleLabel: "同期を有効にする",
    syncToggleOff: "同期を無効にする",
    syncStatusLabel: "最終同期: {time}",
    syncStatusNever: "最終同期: 未実施",
    syncNeedsLogin: "同期には Google ログインが必要です。",
    settingsDataTitle: "データ管理",
    exportData: "設定・データを書き出す",
    importData: "設定・データを読み込む",
    libraryEmpty: "ライブラリが空です",
    historyEmpty: "履歴がありません",
    historyDeleteConfirm: "この履歴を削除しますか？",
    progressLabel: "進捗",
    bookmarkEmpty: "しおりがありません",
    bookmarkDeleteConfirm: "このしおりを削除しますか？",
    openBookPrompt: "本を開いてください",
    searchMissingQuery: "検索キーワードを入力してください",
    searchNoResults: "検索結果が見つかりませんでした",
    searchLoading: "検索中...",
    searchEpubOnly: "EPUB形式の本を開いている時のみ検索できます",
    searchNavigateFailed: "検索結果への移動に失敗しました",
    searchResultFallback: "結果",
    writingModeToggleVertical: "縦",
    writingModeToggleHorizontal: "横",
    syncPromptTitle: "同期の確認",
    syncPromptMessage: "他の端末で、より新しい読書位置があります。",
    syncPromptLocalMessage: "この端末の状態が新しいようです。アップロードしますか？",
    syncPromptJump: "最新の読書位置は {page} ですがジャンプしますか？",
    syncPromptRemote: "ジャンプする（{time}）",
    syncPromptLocal: "キャンセル",
    syncPromptUpload: "この端末の状態をアップロード",
    libraryCloudMissingBadge: "この端末に未保存",
    libraryAttachFile: "ファイルを追加して紐づけ",
    cloudOnlyTitle: "クラウドの読書データのみ表示中",
    cloudOnlyDescription: "ファイルを追加すると続きから読めます",
  },
  en: {
    documentTitle: "Epub Reader",
    emptyTitle: "No book selected",
    emptyDescription: "Tap center of the screen to open menu",
    menuOpen: "Open",
    menuLibrary: "Library",
    menuSearch: "Text Search",
    menuBookmarks: "Bookmarks",
    menuHistory: "History",
    menuSettings: "Settings",
    tocButton: "TOC",
    bookmarkTitle: "Bookmarks",
    bookmarkDefault: "Bookmark",
    addBookmark: "✚ Add bookmark at current location",
    searchTitle: "Text Search",
    searchPlaceholder: "Enter a search keyword...",
    searchButton: "🔍 Search",
    tocTitle: "Table of Contents",
    tocUntitled: "Untitled",
    openFileTitle: "Library",
    librarySectionTitle: "Library",
    historyTitle: "History",
    settingsTitle: "Settings",
    settingsDisplayTitle: "Display",
    themeLabel: "Theme",
    themeDark: "Dark mode",
    themeLight: "Light mode",
    writingModeLabel: "Writing mode",
    writingModeHorizontal: "Horizontal",
    writingModeVertical: "Vertical",
    pageDirectionLabel: "Page direction",
    pageDirectionLtr: "Left binding",
    pageDirectionRtl: "Right binding",
    progressDisplayModeLabel: "Progress format",
    progressDisplayPage: "Pages",
    progressDisplayPercentage: "Percentage",
    settingsAccountTitle: "Account",
    googleLoginLabel: "Sign in with Google",
    googleLogoutLabel: "Sign out",
    googleLoginStatusSignedOut: "Signed out",
    googleLoginStatusSignedIn: "Signed in: {user}",
    googleLoginStatusSignedInShort: "Signed in",
    googleLoginFailed: "Failed to sign in",
    syncToggleLabel: "Enable sync",
    syncToggleOff: "Disable sync",
    syncStatusLabel: "Last sync: {time}",
    syncStatusNever: "Last sync: never",
    syncNeedsLogin: "Sign in with Google to enable sync.",
    settingsDataTitle: "Data",
    exportData: "Export settings & data",
    importData: "Import settings & data",
    libraryEmpty: "Your library is empty",
    historyEmpty: "No history yet",
    historyDeleteConfirm: "Delete this history entry?",
    progressLabel: "Progress",
    bookmarkEmpty: "No bookmarks",
    bookmarkDeleteConfirm: "Delete this bookmark?",
    openBookPrompt: "Please open a book.",
    searchMissingQuery: "Please enter a search keyword.",
    searchNoResults: "No results found.",
    searchLoading: "Searching...",
    searchEpubOnly: "Search is available only when an EPUB is open.",
    searchNavigateFailed: "Failed to navigate to the search result.",
    searchResultFallback: "Result",
    writingModeToggleVertical: "V",
    writingModeToggleHorizontal: "H",
    syncPromptTitle: "Sync available",
    syncPromptMessage: "A newer reading position is available on another device.",
    syncPromptLocalMessage: "This device has newer data. Upload it?",
    syncPromptRemote: "Continue from other device ({time})",
    syncPromptLocal: "Keep this device's position",
    syncPromptUpload: "Upload this device's state",
    libraryCloudMissingBadge: "Not on this device",
    libraryAttachFile: "Attach file to link",
    cloudOnlyTitle: "Viewing cloud reading data",
    cloudOnlyDescription: "Attach the file to continue reading.",
  },
};

function getUiStrings(language = uiLanguage) {
  return UI_STRINGS[language] ?? UI_STRINGS.ja;
}

function t(key) {
  return getUiStrings()[key] ?? key;
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
  themeLabel: document.getElementById("themeLabel"),
  writingModeLabel: document.getElementById("writingModeLabel"),
  pageDirectionLabel: document.getElementById("pageDirectionLabel"),
  progressDisplayModeLabel: document.getElementById("progressDisplayModeLabel"),
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
  getWritingMode: () => (writingMode === "vertical" ? "vertical" : "horizontal"),
  onFloatToggle: () => {
    toggleFloatOverlay();
  },
  onLeftMenu: (action) => {
    if (action === 'show') {
      updateActivity();
    }
  },
  onProgressBar: (action) => {
    if (action === 'show') {
      updateActivity();
      updateProgressBarDisplay();
    }
  },
  onBookmarkMenu: (action) => {
    if (action === 'show') {
      updateActivity();
      renderBookmarks(bookmarkMenuMode);
      bookmarkMenuMode = "current";
    }
  },
  onPagePrev: () => {
    updateActivity();
    reader.prev();
  },
  onPageNext: () => {
    updateActivity();
    reader.next();
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
  onSeek: (percentage) => {
    // パーセンテージからページ位置を計算してジャンプ
    seekToPercentage(percentage);
  },
});

const floatProgressHandler = new ProgressBarHandler({
  container: elements.floatProgressTrack,
  thumb: elements.floatProgressThumb,
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
  if (!elements.floatOverlay) return;
  const nextVisible = typeof forceVisible === "boolean" ? forceVisible : !floatVisible;
  floatVisible = nextVisible;
  elements.floatOverlay.classList.toggle("visible", floatVisible);
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

function isCloudSyncEnabled(authStatus = checkAuthStatus()) {
  if (!authStatus.authenticated) {
    return false;
  }
  const settings = storage.getSettings();
  return Boolean(settings.gasEndpoint);
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

function promptSyncChoice({ mode, remoteProgress }) {
  return new Promise((resolve) => {
    if (!elements.syncModal || !elements.syncUseRemote || !elements.syncUseLocal) {
      resolve("local");
      return;
    }

    if (elements.syncModalTitle) {
      elements.syncModalTitle.textContent = t("syncPromptTitle");
    }

    // Remote update available (Continuity Prompt)
    if (mode === "remote") {
      const pageStr = remoteProgress.progressDisplayMode === "page"
        ? `${remoteProgress.location ?? "?"}ページ`
        : `${(remoteProgress.percentage ?? 0).toFixed(0)}%`;

      const message = t("syncPromptJump").replace("{page}", pageStr);

      if (elements.syncModalMessage) {
        elements.syncModalMessage.textContent = message;
      }
      elements.syncUseRemote.textContent = t("syncPromptRemote").replace("{time}", new Date(remoteProgress.updatedAt).toLocaleString());
      elements.syncUseLocal.textContent = t("syncPromptLocal");
    }
    // Local is newer (Conflict/Reverse Sync)
    else {
      if (elements.syncModalMessage) {
        elements.syncModalMessage.textContent = t("syncPromptLocalMessage");
      }
      elements.syncUseRemote.textContent = t("syncPromptUpload");
      elements.syncUseLocal.textContent = t("syncPromptLocal");
    }

    const cleanup = () => {
      elements.syncUseRemote.removeEventListener("click", onRemote);
      elements.syncUseLocal.removeEventListener("click", onLocal);
    };
    const onRemote = () => {
      cleanup();
      closeModal(elements.syncModal);
      resolve(mode === "local" ? "upload" : "remote");
    };
    const onLocal = () => {
      cleanup();
      closeModal(elements.syncModal);
      resolve("local");
    };

    elements.syncUseRemote.addEventListener("click", onRemote, { once: true });
    elements.syncUseLocal.addEventListener("click", onLocal, { once: true });
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
  const history = (storage.data.history ?? []).filter((entry) => entry.bookId === localBookId);
  const updatedAt = Math.max(
    progress?.updatedAt ?? 0,
    ...bookmarks.map((bookmark) => bookmark?.updatedAt ?? bookmark?.createdAt ?? 0),
    ...history.map((entry) => entry?.updatedAt ?? entry?.openedAt ?? 0),
  );
  const state = {
    progress: progress?.percentage ?? 0,
    lastCfi: progress?.location ?? null,
    bookmarks: bookmarks.map((bookmark) => ({
      ...bookmark,
      updatedAt: bookmark?.updatedAt ?? bookmark?.createdAt ?? Date.now(),
    })),
    history: history.map((entry) => ({
      ...entry,
      updatedAt: entry?.updatedAt ?? entry?.openedAt ?? Date.now(),
    })),
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
  if (state.bookmarks) {
    storage.setBookmarks(localBookId, state.bookmarks);
  }
  if (state.history) {
    const normalizedHistory = state.history.map((entry) => ({
      openedAt: entry?.openedAt ?? entry?.updatedAt ?? Date.now(),
    }));
    storage.setHistoryEntries(localBookId, normalizedHistory);
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

async function resolveSyncedProgress(localBookId, cloudBookId = storage.getCloudBookId(localBookId)) {
  const localProgress = storage.getProgress(localBookId);
  if (!isCloudSyncEnabled() || !cloudBookId) {
    return localProgress;
  }

  try {
    const remote = await cloudSync.pullState(cloudBookId);
    const remoteState = remote?.state;
    const localPayload = buildCloudStatePayload(localBookId, cloudBookId);
    const localUpdatedAt = localPayload.updatedAt ?? 0;

    if (isEmptyCloudState(remoteState)) {
      if (localUpdatedAt > 0) {
        await cloudSync.pushState(cloudBookId, localPayload.state, localPayload.updatedAt);
        storage.setSettings({ lastSyncAt: Date.now() });
      }
      return localProgress;
    }

    const remoteUpdatedAt = remoteState?.updatedAt ?? 0;
    // クラウドの方が新しい場合（かつ、読書位置が異なる場合のみプロンプト）
    if (remoteUpdatedAt > localUpdatedAt) {
      // 5%以上、または5ページ以上の差があるか？ (あまりに細かい差は無視するか、ユーザー体験次第)
      // 今回は純粋にタイムスタンプと位置の違いで判定
      if (remoteState.location !== localProgress?.location) {
        const choice = await promptSyncChoice({ mode: "remote", remoteProgress: remoteState });
        if (choice === "remote") {
          applyCloudStateToLocal(localBookId, cloudBookId, remoteState);
          storage.setSettings({ lastSyncAt: Date.now() });
          return storage.getProgress(localBookId);
        }
        // cancel selected: use local progress (and effectively ignore remote for this session)
        // optionally we could push local to overwrite, but "Cancel" usually means "Don't change anything"
        return localProgress;
      }
      return localProgress;
    }

    if (localUpdatedAt > remoteUpdatedAt) {
      const choice = await promptSyncChoice({ mode: "local" });
      if (choice === "upload") {
        await cloudSync.pushState(cloudBookId, localPayload.state, localPayload.updatedAt);
        storage.setSettings({ lastSyncAt: Date.now() });
      }
      return localProgress;
    }
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
  try {
    console.log(`Opening file: ${file.name}, type: ${file.type}, size: ${file.size}`);
    updateActivity();

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

    const info = {
      id,
      title: fileTitle(file.name),
      type: type === "epub" ? "epub" : "image",
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
    if (info.type === "epub") {
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

      await reader.openEpub(new File([buffer], file.name, { type: mime }), {
        location: startLocation,
        percentage: startProgress,
      });
    } else {
      console.log("Opening image book...");
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
        typeof startLocation === "number" ? startLocation : 0
      );
    }

    console.log("Book opened successfully");
    renderLibrary();
    renderBookmarkMarkers();
    updateProgressBarDisplay();
    updateSearchButtonState();
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
      return;
    }

    // より詳細なエラーメッセージ
    let userMessage = `ファイルの読み込みに失敗しました。\n\nファイル名: ${file.name}\nファイルサイズ: ${(file.size / 1024 / 1024).toFixed(2)} MB\n\n`;

    if (error.message.includes('画像が見つかりませんでした')) {
      userMessage += 'エラー: アーカイブ内に画像ファイルが見つかりませんでした。\n\n対応フォーマット: PNG, JPEG, GIF, WebP, BMP';
    } else if (error.message.includes('画像の読み込みに失敗')) {
      userMessage += 'エラー: 画像ファイルの変換に失敗しました。\n\nファイルが破損している可能性があります。';
    } else {
      userMessage += `エラー詳細: ${error.message}`;
    }

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
  try {
    updateActivity();
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
    if (info.type === "epub") {
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

      await reader.openImageBook(file, typeof start === "number" ? start : 0);
    }

    storage.addHistory(bookId);
    scheduleAutoSyncPush();
    renderBookmarkMarkers();
    updateProgressBarDisplay();
    updateSearchButtonState();
    closeModal(elements.openFileModal);
    if (floatVisible) {
      toggleFloatOverlay(false);
    }
  } catch (error) {
    console.error(error);
    alert(`ライブラリからの読み込みに失敗しました:\n\n${error.message}`);
  }
}

function detectFileType(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return ext === 'epub' ? 'epub' : 'image';
}

function fileTitle(name) {
  return name.replace(/\.[^.]+$/, "");
}

function guessMime(type, file) {
  if (type === "epub") return "application/epub+zip";
  if (type === "image") {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "rar") return "application/vnd.rar";
    return "application/vnd.comicbook+zip";
  }
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
  updateActivity();

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
      } else if (currentBookInfo?.type === 'image') {
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
      } else if (currentBookInfo?.type === 'image') {
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
    const pageIndex = Math.floor((percentage / 100) * totalPages);
    reader.imageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    reader.renderImagePage();
  }
}

function handleBookReady(payload) {
  if (!currentBookInfo || !payload) return;

  const metadata = payload.metadata ?? payload;
  const toc = Array.isArray(payload.toc) ? payload.toc : [];
  currentToc = toc;

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
    setTimeout(() => scheduleEpubScrollModeUpdate(attempt + 1), 100);
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
    }, 500);

    // 10秒後にタイムアウト
    setTimeout(() => {
      clearInterval(checkLocations);
      console.log('[handleBookReady] Locations check timeout');
    }, 10000);

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
      label.textContent = `${book.title} / ${bookmark.label || t("bookmarkDefault")}`;

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
      deleteBtn.textContent = "🗑️";
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

    const info = document.createElement("div");
    info.className = "bookmark-info";
    info.onclick = () => {
      reader.goTo(bookmark);
      ui.closeAllMenus();
    };

    const label = document.createElement("div");
    label.className = "bookmark-label";
    label.textContent = bookmark.label || t("bookmarkDefault");

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
    deleteBtn.textContent = "🗑️";
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

  const bookmark = reader.addBookmark(t("bookmarkDefault"));
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
    cover.textContent = entry.title?.slice(0, 2) || "📖";

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
    deleteBtn.textContent = "🗑️";
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
  updateActivity();
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
  if (elements.themeLabel) elements.themeLabel.textContent = strings.themeLabel;
  if (elements.writingModeLabel) elements.writingModeLabel.textContent = strings.writingModeLabel;
  if (elements.pageDirectionLabel) elements.pageDirectionLabel.textContent = strings.pageDirectionLabel;
  if (elements.progressDisplayModeLabel) elements.progressDisplayModeLabel.textContent = strings.progressDisplayModeLabel;
  if (elements.settingsAccountTitle) elements.settingsAccountTitle.textContent = strings.settingsAccountTitle;
  if (elements.googleLoginButton) elements.googleLoginButton.textContent = strings.googleLoginLabel;
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
  await reader.applyReadingDirection(writingMode, pageDirection);
  updateEpubScrollMode();
  storage.setSettings({ writingMode, pageDirection });
  persistReadingState({ writingMode });
  updateWritingModeToggleLabel();
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
  await cloudSync.pushState(currentCloudBookId, payload.state, payload.updatedAt);
  storage.setSettings({ lastSyncAt: Date.now() });
  updateSyncStatusDisplay();
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
    // 30秒ごとに自動同期
    autoSyncInterval = setInterval(async () => {
      try {
        await pushCurrentBookSync();
        console.log('Auto-sync completed');
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, 30000);
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
  }, 1500);
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
  elements.fileInput?.click();
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
  if (elements.themeSelect) elements.themeSelect.value = theme;
  if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;
  if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;
  if (elements.progressDisplayModeSelect) elements.progressDisplayModeSelect.value = progressDisplayMode;
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
          } else if (currentBookInfo?.type === 'image') {
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
    await applyReadingSettings(null, e.target.value);
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
    try {
      if (!googleLoginReady) {
        initializeGoogleLogin();
      }
      startGoogleLoginUi();
      window.google?.accounts?.id?.prompt((notification) => {
        if (
          notification.isNotDisplayed?.() ||
          notification.isSkippedMoment?.() ||
          notification.isDismissedMoment?.()
        ) {
          endGoogleLoginUi();
        }
      });
    } catch (error) {
      endGoogleLoginUi();
      console.error("Google login failed:", error);
      if (elements.userInfo) {
        elements.userInfo.textContent = t("googleLoginFailed");
      }
    }
  });

  // Manual sync button
  const manualSyncButton = document.getElementById('manualSyncButton');
  const syncStatus = document.getElementById('syncStatus');

  manualSyncButton?.addEventListener('click', async () => {
    const authStatus = checkAuthStatus();
    if (!authStatus.authenticated) {
      if (syncStatus) {
        syncStatus.textContent = 'Googleログインが必要です';
        syncStatus.style.color = '#f44336';
      }
      return;
    }

    try {
      manualSyncButton.disabled = true;
      manualSyncButton.textContent = '同期中...';
      if (syncStatus) {
        syncStatus.textContent = '同期を開始しています...';
        syncStatus.style.color = '#666';
      }

      // Pull index
      await syncAllBooksFromCloud();

      // If a book is open, sync its state
      if (currentBookId && currentCloudBookId) {
        await pushCurrentBookSync();
      }

      if (syncStatus) {
        syncStatus.textContent = '✓ 同期完了';
        syncStatus.style.color = '#4caf50';
        setTimeout(() => {
          syncStatus.textContent = '';
        }, 3000);
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
      if (syncStatus) {
        syncStatus.textContent = '✗ 同期に失敗しました: ' + error.message;
        syncStatus.style.color = '#f44336';
      }
    } finally {
      manualSyncButton.disabled = false;
      manualSyncButton.textContent = '今すぐ同期';
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
      updateActivity();
      reader.next();
    } else if (event.deltaY < 0) {
      updateActivity();
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

    updateActivity();

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

function startApp() {
  init();
}

function startAfterDomReady() {
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
