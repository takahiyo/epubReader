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
const settings = storage.getSettings();

let currentBookId = null;
let currentBookInfo = null;
let theme = settings.theme ?? "dark";
let writingMode = settings.writingMode;
let pageDirection = settings.pageDirection;
let progressDisplayMode = settings.progressDisplayMode ?? "page";
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
let autoSyncEnabled = settings.autoSyncEnabled ?? false;
let libraryViewMode = settings.libraryViewMode ?? "grid";
let autoSyncInterval = null;
let bookmarkMenuMode = "current";

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
  
  // メニュー
  leftMenu: document.getElementById("leftMenu"),
  menuOpen: document.getElementById("menuOpen"),
  menuLibrary: document.getElementById("menuLibrary"),
  menuSearch: document.getElementById("menuSearch"),
  menuBookmarks: document.getElementById("menuBookmarks"),
  menuHistory: document.getElementById("menuHistory"),
  menuSettings: document.getElementById("menuSettings"),
  menuLogout: document.getElementById("menuLogout"),
  userInfo: document.getElementById("userInfo"),
  
  // 進捗バー
  progressBarPanel: document.getElementById("progressBarPanel"),
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
  autoSyncEnabled: document.getElementById("autoSyncEnabled"),
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

function updateSearchButtonState() {
  if (!elements.menuSearch) return;
  
  const isEpubOpen = currentBookId && currentBookInfo?.type === 'epub';
  elements.menuSearch.disabled = !isEpubOpen;
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
    
    // 自動同期が有効なら保存
    if (autoSyncEnabled) {
      await cloudSync.push();
    }
  } catch (error) {
    console.error("Error in handleFile:", error);
    console.error("Error stack:", error.stack);
    
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
    const explicitBookmark = options.bookmark;
    const startFromBookmark = explicitBookmark?.location ?? (options.useBookmark ? bookmarks[0]?.location : undefined);
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
    
    renderBookmarkMarkers();
    updateProgressBarDisplay();
    updateSearchButtonState();
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

function handleProgress(progress) {
  if (!currentBookId) return;
  updateActivity();
  
  storage.setProgress(currentBookId, progress);
  updateProgressBarDisplay();
}

function updateProgressBarDisplay() {
  if (!currentBookId) return;
  
  const progress = storage.getProgress(currentBookId);
  const percentage = progress?.percentage || 0;
  
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
      if (currentBookInfo?.type === 'epub' && reader.rendition?.book?.locations) {
        // EPUBの場合はlocationインデックスを表示
        const totalLocations = reader.rendition.book.locations.total;
        const currentLocation = Math.round((percentage / 100) * totalLocations);
        elements.currentPageInput.value = currentLocation;
        
        if (elements.totalPages) {
          elements.totalPages.textContent = totalLocations.toString();
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
    let tooltipText = bookmark.label ?? "しおり";
    if (progressDisplayMode === "page") {
      // ページ数モードの場合
      if (currentBookInfo?.type === 'epub' && reader.rendition?.book?.locations) {
        const totalLocations = reader.rendition.book.locations.total;
        const locationIndex = Math.round((percentage / 100) * totalLocations);
        tooltipText += ` (${locationIndex}/${totalLocations})`;
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
}

async function seekToPercentage(percentage) {
  if (!currentBookId || !currentBookInfo) return;
  
  if (currentBookInfo.type === "epub") {
    // EPUBの場合はlocation（CFI）ベースでシーク
    console.log(`Seeking to ${percentage}%`);
    
    try {
      // EPUB.jsのrendition.locationsを使用
      if (reader.rendition && reader.rendition.book && reader.rendition.book.locations) {
        const locations = reader.rendition.book.locations;
        
        // パーセンテージからlocationインデックスを計算
        const totalLocations = locations.total;
        const targetIndex = Math.floor((percentage / 100) * totalLocations);
        
        // locationインデックスからCFIを取得
        const cfi = locations.cfiFromPercentage(percentage / 100);
        
        if (cfi) {
          console.log(`Jumping to CFI: ${cfi}`);
          await reader.rendition.display(cfi);
        } else {
          console.warn('Could not get CFI for percentage:', percentage);
        }
      } else {
        console.warn('Locations not generated yet');
      }
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
      empty.textContent = "しおりがありません";
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
      label.textContent = `${book.title} / ${bookmark.label || "しおり"}`;
      
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
        if (confirm("このしおりを削除しますか？")) {
          storage.removeBookmark(bookId, bookmark.createdAt);
          renderBookmarks(mode);
          renderBookmarkMarkers();
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
    empty.textContent = "本を開いてください";
    empty.style.textAlign = "center";
    empty.style.color = "var(--muted)";
    elements.bookmarkList.appendChild(empty);
    renderBookmarkMarkers();
    return;
  }

  const bookmarks = storage.getBookmarks(currentBookId);

  if (!bookmarks.length) {
    const empty = document.createElement("li");
    empty.textContent = "しおりがありません";
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
    label.textContent = bookmark.label || "しおり";

    const meta = document.createElement("div");
    meta.className = "bookmark-meta";
    
    // メタ情報を進捗表示モードに合わせて表示
    let metaText = new Date(bookmark.createdAt).toLocaleString();
    if (progressDisplayMode === "page") {
      if (currentBookInfo?.type === 'epub' && reader.rendition?.book?.locations) {
        const totalLocations = reader.rendition.book.locations.total;
        const locationIndex = Math.round((bookmark.percentage / 100) * totalLocations);
        metaText += ` / ${locationIndex}/${totalLocations}`;
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
      if (confirm("このしおりを削除しますか？")) {
        storage.removeBookmark(currentBookId, bookmark.createdAt);
        renderBookmarks(mode);
        renderBookmarkMarkers();
      }
    };

    item.append(info, deleteBtn);
    elements.bookmarkList.appendChild(item);
  });

  renderBookmarkMarkers();
}

function addBookmark() {
  if (!currentBookId) {
    alert("本を開いてください");
    return;
  }
  
  const bookmark = reader.addBookmark("しおり");
  if (bookmark) {
    storage.addBookmark(currentBookId, bookmark);
    renderBookmarks(bookmarkMenuMode);
    renderBookmarkMarkers();
    
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
    
    // 進捗情報を追加
    const progress = storage.getProgress(book.id);
    const progressText = progress ? `${progress.percentage}%` : "0%";
    meta.textContent = `${new Date(item.openedAt).toLocaleString()} / 進捗: ${progressText}`;
    
    info.append(title, meta);
    historyItem.appendChild(info);
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
    elements.searchResults.innerHTML = '<div class="search-loading">検索中...</div>';
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
    noResults.textContent = '検索結果が見つかりませんでした';
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
    if (progressDisplayMode === "page" && reader.rendition?.book?.locations) {
      const totalLocations = reader.rendition.book.locations.total;
      const locationIndex = Math.round((result.percentage / 100) * totalLocations);
      locationText = `${locationIndex}/${totalLocations}`;
    } else {
      locationText = `${result.percentage}%`;
    }
    
    meta.textContent = `${locationText} / ${result.sectionLabel || `結果 ${index + 1}`}`;
    
    item.append(excerpt, meta);
    
    item.onclick = async () => {
      if (result.cfi && reader.rendition) {
        try {
          console.log('Navigating to CFI:', result.cfi);
          await reader.rendition.display(result.cfi);
          closeModal(elements.searchModal);
        } catch (error) {
          console.error('Failed to navigate to search result:', error);
          alert('検索結果への移動に失敗しました');
        }
      }
    };
    
    elements.searchResults.appendChild(item);
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

async function applyReadingSettings(nextWritingMode, nextPageDirection) {
  if (nextWritingMode) {
    writingMode = nextWritingMode;
  }
  if (nextPageDirection) {
    pageDirection = nextPageDirection;
  }
  await reader.applyReadingDirection(writingMode, pageDirection);
  storage.setSettings({ writingMode, pageDirection });
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
    elements.fileInput?.click();
  });
  
  elements.menuLibrary?.addEventListener('click', () => {
    openModal(elements.openFileModal);
    renderLibrary();
  });
  
  elements.menuSearch?.addEventListener('click', () => {
    if (!currentBookId || currentBookInfo?.type !== 'epub') {
      alert('EPUB形式の本を開いている時のみ検索できます');
      return;
    }
    openModal(elements.searchModal);
    if (elements.searchInput) {
      elements.searchInput.value = '';
      elements.searchInput.focus();
    }
    if (elements.searchResults) {
      elements.searchResults.innerHTML = '';
    }
  });
  
  elements.menuBookmarks?.addEventListener('click', () => {
    bookmarkMenuMode = "all";
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
    if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;
    if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;
    if (elements.progressDisplayModeSelect) elements.progressDisplayModeSelect.value = progressDisplayMode;
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
          if (currentBookInfo?.type === 'epub' && reader.rendition?.book?.locations) {
            // EPUBの場合はlocationインデックスとして扱う
            const totalLocations = reader.rendition.book.locations.total;
            const percentage = (value / totalLocations) * 100;
            seekToPercentage(Math.max(0, Math.min(percentage, 100)));
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
  elements.closeSearchModal?.addEventListener('click', () => closeModal(elements.searchModal));
  elements.closeBookmarkMenu?.addEventListener('click', () => ui.closeAllMenus());
  
  // 検索機能
  const executeSearch = async () => {
    const query = elements.searchInput?.value?.trim();
    if (!query) {
      alert('検索キーワードを入力してください');
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
  [elements.openFileModal, elements.historyModal, elements.settingsModal, elements.imageModal, elements.searchModal].forEach(modal => {
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
        !elements.searchModal?.classList.contains('hidden')) {
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
  applyReadingSettings(writingMode, pageDirection);
  applyLibraryViewMode(libraryViewMode);
  applyProgressDisplayMode(progressDisplayMode);
  
  // 自動同期設定
  if (autoSyncEnabled) {
    toggleAutoSync(true);
  }
  
  // ライブラリレンダリング
  renderLibrary();
  
  // 検索ボタンの状態を更新
  updateSearchButtonState();
  
  console.log("Epub Reader initialized");
}

// DOMContentLoadedイベントを待ってから初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
