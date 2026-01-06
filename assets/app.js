// メインアプリケーション - 新UI対応版

import { StorageService } from "./storage.js";
import { ReaderController } from "./reader.js";
import { CloudSync } from "./cloudSync.js";
import { UIController, ProgressBarHandler } from "./ui.js";
import { updateActivity, logout, getCurrentUserId, checkAuthStatus } from "./auth.js";
import { saveFile, loadFile, bufferToFile } from "./fileStore.js";

// ========================================
// 初期化
// ========================================

const storage = new StorageService();
const cloudSync = new CloudSync(storage);

let currentBookId = null;
let currentBookInfo = null;
let theme = storage.getSettings().theme ?? "dark";
let readingDirection = storage.getSettings().readingDirection ?? "rtl";
let autoSyncEnabled = storage.getSettings().autoSyncEnabled ?? false;
let autoSyncInterval = null;

// ========================================
// DOM要素
// ========================================

const elements = {
  // リーダー
  viewer: document.getElementById("viewer"),
  imageViewer: document.getElementById("imageViewer"),
  pageImage: document.getElementById("pageImage"),
  emptyState: document.getElementById("emptyState"),
  
  // メニュー
  leftMenu: document.getElementById("leftMenu"),
  menuOpen: document.getElementById("menuOpen"),
  menuBookmarks: document.getElementById("menuBookmarks"),
  menuHistory: document.getElementById("menuHistory"),
  menuSettings: document.getElementById("menuSettings"),
  menuLogout: document.getElementById("menuLogout"),
  userInfo: document.getElementById("userInfo"),
  
  // 進捗バー
  progressBarPanel: document.getElementById("progressBarPanel"),
  progressFill: document.getElementById("progressFill"),
  progressThumb: document.getElementById("progressThumb"),
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
  
  historyModal: document.getElementById("historyModal"),
  closeHistoryModal: document.getElementById("closeHistoryModal"),
  historyList: document.getElementById("historyList"),
  
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsModal: document.getElementById("closeSettingsModal"),
  themeSelect: document.getElementById("themeSelect"),
  readingDirectionSelect: document.getElementById("readingDirection"),
  autoSyncEnabled: document.getElementById("autoSyncEnabled"),
  exportDataBtn: document.getElementById("exportDataBtn"),
  importDataInput: document.getElementById("importDataInput"),
  
  imageModal: document.getElementById("imageModal"),
  closeImageModal: document.getElementById("closeImageModal"),
  modalImage: document.getElementById("modalImage"),
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

// ========================================
// UIコントローラー初期化
// ========================================

const ui = new UIController({
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
      renderBookmarks();
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

// 進捗バーのドラッグハンドラー
const progressBarHandler = new ProgressBarHandler({
  container: elements.progressBarPanel?.querySelector('.progress-track'),
  thumb: elements.progressThumb,
  onSeek: (percentage) => {
    // パーセンテージからページ位置を計算してジャンプ
    seekToPercentage(percentage);
  },
});

// ========================================
// ユーザー情報表示
// ========================================

function updateUserInfo() {
  const authStatus = checkAuthStatus();
  if (authStatus.authenticated && elements.userInfo) {
    elements.userInfo.textContent = authStatus.userEmail || authStatus.userId || '';
  }
}

// ========================================
// ファイル処理
// ========================================

async function handleFile(file) {
  try {
    console.log(`Opening file: ${file.name}`);
    updateActivity();
    
    // ファイルタイプを自動判別
    const type = detectFileType(file);
    
    const buffer = await file.arrayBuffer();
    const id = await hashBuffer(buffer, file.name);
    const mime = guessMime(type, file);
    const source = storage.getSettings().source || 'local';
    
    await saveFile(id, buffer, { fileName: file.name, mime }, source);
    
    const info = {
      id,
      title: fileTitle(file.name),
      type: type === "epub" ? "epub" : "image",
      fileName: file.name,
      size: file.size,
      lastOpened: Date.now(),
    };
    
    storage.upsertBook(info);
    currentBookId = id;
    currentBookInfo = info;
    
    const savedProgress = storage.getProgress(id);
    const startLocation = savedProgress?.location;
    
    if (info.type === "epub") {
      console.log("Opening EPUB...");
      
      // 空の状態を非表示、ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add('hidden');
      if (elements.imageViewer) elements.imageViewer.classList.add('hidden');
      if (elements.viewer) {
        elements.viewer.classList.remove('hidden');
        elements.viewer.classList.add('visible');
      }
      
      await reader.openEpub(new File([buffer], file.name, { type: mime }), startLocation);
    } else {
      console.log("Opening image book...");
      
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
    closeModal(elements.openFileModal);
    
    // 自動同期が有効なら保存
    if (autoSyncEnabled) {
      await cloudSync.push();
    }
  } catch (error) {
    console.error("Error in handleFile:", error);
    alert(`ファイルの読み込みに失敗しました:\n\n${error.message}`);
  }
}

async function openFromLibrary(bookId, options = {}) {
  try {
    updateActivity();
    const source = storage.getSettings().source || 'local';
    const record = await loadFile(bookId, source);
    
    if (!record) {
      alert("保存済みファイルが見つかりません。再度アップロードしてください。");
      return;
    }
    
    const file = bufferToFile(record);
    const info = storage.data.library[bookId];
    if (!info) return;
    
    currentBookId = bookId;
    currentBookInfo = info;
    
    const bookmarks = storage.getBookmarks(bookId);
    const progress = storage.getProgress(bookId);
    const startFromBookmark = options.useBookmark ? bookmarks[0]?.location : undefined;
    const start = startFromBookmark ?? progress?.location;
    
    if (info.type === "epub") {
      // 空の状態を非表示、ビューアを表示
      if (elements.emptyState) elements.emptyState.classList.add('hidden');
      if (elements.imageViewer) elements.imageViewer.classList.add('hidden');
      if (elements.viewer) {
        elements.viewer.classList.remove('hidden');
        elements.viewer.classList.add('visible');
      }
      
      await reader.openEpub(file, start);
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
    
    closeModal(elements.openFileModal);
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
  if (type === "image") return "application/vnd.comicbook+zip";
  return file.type || "application/octet-stream";
}

async function hashBuffer(buffer, fileName) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${fileName.replace(/\W+/g, "-").toLowerCase()}-${hex.slice(0, 12)}`;
}

// ========================================
// 進捗管理
// ========================================

function handleProgress(progress) {
  if (!currentBookId) return;
  updateActivity();
  
  storage.setProgress(currentBookId, progress);
  updateProgressBarDisplay();
}

function updateProgressBarDisplay() {
  if (!currentBookId) return;
  
  const progress = storage.getProgress(currentBookId);
  if (!progress) return;
  
  const percentage = progress.percentage || 0;
  
  // 進捗バーの更新
  if (elements.progressFill) {
    elements.progressFill.style.width = `${percentage}%`;
  }
  
  if (elements.progressThumb) {
    elements.progressThumb.style.left = `${percentage}%`;
  }
  
  // ページ数の更新
  if (elements.currentPageInput) {
    elements.currentPageInput.value = Math.round(percentage);
  }
  
  if (elements.totalPages) {
    elements.totalPages.textContent = '100'; // パーセンテージ表示
  }
}

function seekToPercentage(percentage) {
  if (!currentBookId || !currentBookInfo) return;
  
  if (currentBookInfo.type === "epub") {
    // EPUBの場合はCFIベースでシーク（実装要）
    // 現状はパーセンテージのみ記録
    console.log(`Seeking to ${percentage}%`);
  } else {
    // 画像書籍の場合はページ数でシーク
    const totalPages = reader.imagePages?.length || 1;
    const pageIndex = Math.floor((percentage / 100) * totalPages);
    reader.imageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    reader.renderImagePage();
  }
}

function handleBookReady(meta) {
  if (!currentBookInfo || !meta) return;
  
  const title = meta.title || currentBookInfo.title;
  currentBookInfo.title = title;
  storage.upsertBook({ ...currentBookInfo, title });
  renderLibrary();
}

// ========================================
// しおり管理
// ========================================

function renderBookmarks() {
  if (!elements.bookmarkList) return;
  
  elements.bookmarkList.innerHTML = "";
  
  if (!currentBookId) {
    const empty = document.createElement("li");
    empty.textContent = "本を開いてください";
    empty.style.textAlign = "center";
    empty.style.color = "var(--muted)";
    elements.bookmarkList.appendChild(empty);
    return;
  }
  
  const bookmarks = storage.getBookmarks(currentBookId);
  
  if (!bookmarks.length) {
    const empty = document.createElement("li");
    empty.textContent = "しおりがありません";
    empty.style.textAlign = "center";
    empty.style.color = "var(--muted)";
    elements.bookmarkList.appendChild(empty);
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
    label.textContent = bookmark.label || "しおり";
    
    const meta = document.createElement("div");
    meta.className = "bookmark-meta";
    meta.textContent = `${new Date(bookmark.createdAt).toLocaleString()} / ${bookmark.percentage}%`;
    
    info.append(label, meta);
    
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "bookmark-delete";
    deleteBtn.textContent = "🗑️";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("このしおりを削除しますか？")) {
        storage.removeBookmark(currentBookId, bookmark.createdAt);
        renderBookmarks();
      }
    };
    
    item.append(info, deleteBtn);
    elements.bookmarkList.appendChild(item);
  });
}

function addBookmark() {
  if (!currentBookId) {
    alert("本を開いてください");
    return;
  }
  
  const bookmark = reader.addBookmark("しおり");
  if (bookmark) {
    storage.addBookmark(currentBookId, bookmark);
    renderBookmarks();
    
    // 自動同期
    if (autoSyncEnabled) {
      cloudSync.push();
    }
  }
}

// ========================================
// ライブラリ・履歴
// ========================================

function renderLibrary() {
  if (!elements.libraryGrid) return;
  
  elements.libraryGrid.innerHTML = "";
  const library = storage.data.library;
  const books = Object.values(library).sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0));
  
  if (!books.length) {
    const empty = document.createElement("p");
    empty.textContent = "ライブラリが空です";
    empty.style.textAlign = "center";
    empty.style.color = "var(--muted)";
    empty.style.gridColumn = "1 / -1";
    elements.libraryGrid.appendChild(empty);
    return;
  }
  
  books.forEach((book) => {
    const card = document.createElement("div");
    card.className = "library-card";
    card.onclick = () => openFromLibrary(book.id);
    
    const cover = document.createElement("div");
    cover.className = "library-cover";
    cover.textContent = book.title.slice(0, 2) || "📖";
    
    const title = document.createElement("div");
    title.className = "library-title";
    title.textContent = book.title;
    
    const progress = storage.getProgress(book.id);
    const meta = document.createElement("div");
    meta.className = "library-meta";
    meta.textContent = `${progress?.percentage ?? 0}%`;
    
    card.append(cover, title, meta);
    elements.libraryGrid.appendChild(card);
  });
}

function renderHistory() {
  if (!elements.historyList) return;
  
  elements.historyList.innerHTML = "";
  const history = storage.data.history;
  
  if (!history.length) {
    const empty = document.createElement("li");
    empty.textContent = "履歴がありません";
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
    meta.textContent = new Date(item.openedAt).toLocaleString();
    
    info.append(title, meta);
    historyItem.appendChild(info);
    elements.historyList.appendChild(historyItem);
  });
}

// ========================================
// モーダル制御
// ========================================

function openModal(modal) {
  if (modal) {
    modal.classList.remove('hidden');
    updateActivity();
  }
}

function closeModal(modal) {
  if (modal) {
    modal.classList.add('hidden');
  }
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
}

function applyReadingDirection(direction) {
  readingDirection = direction;
  // reader.jsに読書方向設定を追加する必要あり
  storage.setSettings({ readingDirection: direction });
}

function toggleAutoSync(enabled) {
  autoSyncEnabled = enabled;
  storage.setSettings({ autoSyncEnabled: enabled });
  
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
  
  if (enabled) {
    // 30秒ごとに自動同期
    autoSyncInterval = setInterval(async () => {
      try {
        await cloudSync.push();
        console.log('Auto-sync completed');
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, 30000);
  }
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

// ========================================
// イベントハンドラー
// ========================================

function setupEvents() {
  // メニューアクション
  elements.menuOpen?.addEventListener('click', () => {
    openModal(elements.openFileModal);
    renderLibrary();
  });
  
  elements.menuBookmarks?.addEventListener('click', () => {
    ui.showBookmarkMenu();
  });
  
  elements.menuHistory?.addEventListener('click', () => {
    openModal(elements.historyModal);
    renderHistory();
  });
  
  elements.menuSettings?.addEventListener('click', () => {
    openModal(elements.settingsModal);
    // 現在の設定値を反映
    if (elements.themeSelect) elements.themeSelect.value = theme;
    if (elements.readingDirectionSelect) elements.readingDirectionSelect.value = readingDirection;
    if (elements.autoSyncEnabled) elements.autoSyncEnabled.checked = autoSyncEnabled;
  });
  
  elements.menuLogout?.addEventListener('click', () => {
    if (confirm("ログアウトしますか？")) {
      logout();
    }
  });
  
  // ファイル選択
  elements.fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });
  
  // しおり追加
  elements.addBookmarkBtn?.addEventListener('click', addBookmark);
  
  // 進捗バーのページ入力
  elements.currentPageInput?.addEventListener('change', (e) => {
    const percentage = parseInt(e.target.value, 10);
    if (!isNaN(percentage)) {
      seekToPercentage(Math.max(0, Math.min(percentage, 100)));
    }
  });
  
  // 設定
  elements.themeSelect?.addEventListener('change', (e) => {
    applyTheme(e.target.value);
  });
  
  elements.readingDirectionSelect?.addEventListener('change', (e) => {
    applyReadingDirection(e.target.value);
  });
  
  elements.autoSyncEnabled?.addEventListener('change', (e) => {
    toggleAutoSync(e.target.checked);
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
  elements.closeBookmarkMenu?.addEventListener('click', () => ui.closeAllMenus());
  
  // モーダルバックドロップクリック
  [elements.openFileModal, elements.historyModal, elements.settingsModal, elements.imageModal].forEach(modal => {
    modal?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop') || e.target === modal) {
        closeModal(modal);
      }
    });
  });
  
  // しおりメニューのバックドロップクリック
  elements.bookmarkMenu?.addEventListener('click', (e) => {
    // bookmarkMenuの直接クリック（背景部分）の場合は閉じる
    if (e.target === elements.bookmarkMenu) {
      ui.closeAllMenus();
    }
  });
  
  // キーボード操作
  document.addEventListener('keydown', (e) => {
    // モーダルが開いている場合は無視
    if (!elements.openFileModal?.classList.contains('hidden') ||
        !elements.historyModal?.classList.contains('hidden') ||
        !elements.settingsModal?.classList.contains('hidden') ||
        !elements.imageModal?.classList.contains('hidden')) {
      return;
    }
    
    updateActivity();
    
    switch (e.key) {
      case 'ArrowLeft':
        if (readingDirection === 'rtl') {
          reader.next(); // 右開きの場合、左キーで次ページ
        } else {
          reader.prev();
        }
        break;
      case 'ArrowRight':
        if (readingDirection === 'rtl') {
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
}

// ========================================
// 初期化
// ========================================

function init() {
  console.log("Initializing Epub Reader...");
  
  // ライブラリ読み込み確認
  console.log("JSZip:", typeof JSZip !== "undefined" ? "✓" : "✗");
  console.log("ePub:", typeof ePub !== "undefined" ? "✓" : "✗");
  
  // ユーザー情報表示
  updateUserInfo();
  
  // イベント設定
  setupEvents();
  
  // テーマ適用
  applyTheme(theme);
  
  // 自動同期設定
  if (autoSyncEnabled) {
    toggleAutoSync(true);
  }
  
  // ライブラリレンダリング
  renderLibrary();
  
  console.log("Epub Reader initialized");
}

// DOMContentLoadedイベントを待ってから初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
