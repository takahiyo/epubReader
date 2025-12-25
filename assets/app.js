import { StorageService } from "./storage.js";
import { ReaderController } from "./reader.js";
import { CloudSync } from "./cloudSync.js";
import { captureAccessTokenFromHash as captureDriveAccessTokenFromHash, startDriveOAuth } from "./driveAuth.js";
import { captureAccessTokenFromHash as captureOneDriveAccessTokenFromHash, startOneDriveOAuth } from "./onedriveAuth.js";
import { saveFile, loadFile, bufferToFile } from "./fileStore.js";

const storage = new StorageService();
const cloudSync = new CloudSync(storage);

const elements = {
  epubInput: document.getElementById("epubInput"),
  zipInput: document.getElementById("zipInput"),
  historyList: document.getElementById("historyList"),
  libraryGrid: document.getElementById("libraryGrid"),
  bookmarkList: document.getElementById("bookmarkList"),
  bookTitle: document.getElementById("bookTitle"),
  bookMeta: document.getElementById("bookMeta"),
  progressText: document.getElementById("progressText"),
  progressBar: document.getElementById("progressBar"),
  bookmarkBtn: document.getElementById("bookmarkBtn"),
  goToBookmark: document.getElementById("goToBookmark"),
  prevSection: document.getElementById("prevSection"),
  nextSection: document.getElementById("nextSection"),
  toggleTheme: document.getElementById("toggleTheme"),
  imageViewer: document.getElementById("imageViewer"),
  viewer: document.getElementById("viewer"),
  prevPage: document.getElementById("prevPage"),
  nextPage: document.getElementById("nextPage"),
  pageIndicator: document.getElementById("pageIndicator"),
  openBookmarkFromLibrary: document.getElementById("openBookmarkFromLibrary"),
  syncNow: document.getElementById("syncNow"),
  endpointInput: document.getElementById("endpointInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  driveClientIdInput: document.getElementById("driveClientIdInput"),
  driveFileIdInput: document.getElementById("driveFileIdInput"),
  driveFolderIdInput: document.getElementById("driveFolderIdInput"),
  driveFileNameInput: document.getElementById("driveFileNameInput"),
  authorizeDrive: document.getElementById("authorizeDrive"),
  onedriveClientIdInput: document.getElementById("onedriveClientIdInput"),
  onedriveFilePathInput: document.getElementById("onedriveFilePathInput"),
  authorizeOneDrive: document.getElementById("authorizeOneDrive"),
  exportData: document.getElementById("exportData"),
  importData: document.getElementById("importData"),
  modal: document.getElementById("imageModal"),
  modalImage: document.getElementById("modalImage"),
  closeModal: document.getElementById("closeModal"),
  sourceSelect: document.getElementById("sourceSelect"),
  sourceLogin: document.getElementById("sourceLogin"),
  syncStatusText: document.getElementById("syncStatusText"),
};

const reader = new ReaderController({
  viewerId: "viewer",
  imageViewerId: "imageViewer",
  imageElementId: "pageImage",
  pageIndicatorId: "pageIndicator",
  onProgress: handleProgress,
  onReady: handleBookReady,
  onImageZoom: openModal,
});

let currentBookId = null;
let currentBookInfo = null;
let theme = storage.getSettings().theme ?? "dark";
reader.applyTheme(theme);

function setStatus(message) {
  elements.bookMeta.textContent = message;
}

function setSyncStatus(message) {
  if (!elements.syncStatusText) return;
  elements.syncStatusText.textContent = message;
}

function updateHeader(info) {
  if (!info) {
    elements.bookTitle.textContent = "本が未選択です";
    setStatus("EPUB / CBZ を読み込むとここに表示されます");
    return;
  }

  elements.bookTitle.textContent = info.title;
  const typeLabel = info.type === "epub" ? "EPUB" : "画像スキャン";
  const progress = storage.getProgress(info.id);
  const percentage = progress?.percentage ?? 0;
  const updated = info.updatedAt ? new Date(info.updatedAt).toLocaleString() : "";
  elements.bookMeta.textContent = `${typeLabel} / ${info.fileName ?? ""} / 進捗 ${percentage}% ${updated ? "・" + updated : ""}`;
}

async function hashBuffer(buffer, fileName) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${fileName.replace(/\W+/g, "-").toLowerCase()}-${hex.slice(0, 12)}`;
}

function fileTitle(name) {
  return name.replace(/\.[^.]+$/, "");
}

function guessMime(type, file) {
  if (type === "epub") return "application/epub+zip";
  if (type === "image") return "application/vnd.comicbook+zip";
  return file.type || "application/octet-stream";
}

async function handleFile(file, type) {
  try {
    const buffer = await file.arrayBuffer();
    const id = await hashBuffer(buffer, file.name);
    const mime = guessMime(type, file);
    const source = storage.getSettings().source;
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
    updateHeader(info);

    const savedProgress = storage.getProgress(id);
    const startLocation = savedProgress?.location;

    if (info.type === "epub") {
      await reader.openEpub(new File([buffer], file.name, { type: mime }), startLocation);
    } else {
      await reader.openImageBook(new File([buffer], file.name, { type: mime }), typeof startLocation === "number" ? startLocation : 0);
    }

    renderBookmarks();
    renderHistory();
    renderLibrary();
    setStatus("読み込みが完了しました。しおりや履歴は自動で保存されます。");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "読み込みに失敗しました");
  }
}

async function openFromLibrary(bookId, options = {}) {
  try {
    const source = storage.getSettings().source;
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
    updateHeader(info);

    const bookmarks = storage.getBookmarks(bookId);
    const progress = storage.getProgress(bookId);
    const startFromBookmark = options.useBookmark ? bookmarks[0]?.location : undefined;
    const start = startFromBookmark ?? progress?.location;

    if (info.type === "epub") {
      await reader.openEpub(file, start);
    } else {
      await reader.openImageBook(file, typeof start === "number" ? start : 0);
    }

    renderBookmarks();
    setStatus(options.useBookmark ? "しおり位置から再開しました" : "前回の位置から再開しました");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "ライブラリからの読み込みに失敗しました");
  }
}

function handleProgress(progress) {
  if (!currentBookId) return;
  storage.setProgress(currentBookId, progress);
  elements.progressText.textContent = `進捗 ${progress.percentage}%`;
  elements.progressBar.style.width = `${progress.percentage}%`;
}

function handleBookReady(meta) {
  if (!currentBookInfo || !meta) return;
  const title = meta.title || currentBookInfo.title;
  currentBookInfo.title = title;
  storage.upsertBook({ ...currentBookInfo, title });
  updateHeader(currentBookInfo);
  renderLibrary();
}

function renderHistory() {
  const history = storage.data.history;
  elements.historyList.innerHTML = "";
  history.forEach((item) => {
    const book = storage.data.library[item.bookId];
    if (!book) return;
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.innerHTML = `<strong>${book.title}</strong><span class="meta">${new Date(item.openedAt).toLocaleString()}</span>`;
    const button = document.createElement("button");
    button.textContent = "開く";
    button.className = "small primary";
    button.onclick = () => openFromLibrary(book.id);
    li.append(left, button);
    elements.historyList.appendChild(li);
  });
}

function renderLibrary() {
  const library = storage.data.library;
  elements.libraryGrid.innerHTML = "";
  Object.values(library)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .forEach((book) => {
      const card = document.createElement("div");
      card.className = "library-card";

      const cover = document.createElement("div");
      cover.className = "cover";
      cover.textContent = book.title.slice(0, 12) || "本";

      const title = document.createElement("h3");
      title.textContent = book.title;

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = book.type === "epub" ? "EPUB" : "画像";

      const meta = document.createElement("div");
      const progress = storage.getProgress(book.id);
      meta.className = "muted";
      meta.textContent = `進捗 ${progress?.percentage ?? 0}% / 更新 ${book.updatedAt ? new Date(book.updatedAt).toLocaleDateString() : "-"}`;

      const actions = document.createElement("div");
      actions.className = "actions";
      const openBtn = document.createElement("button");
      openBtn.textContent = "開く";
      openBtn.className = "primary";
      openBtn.onclick = () => openFromLibrary(book.id);

      const bookmarkBtn = document.createElement("button");
      bookmarkBtn.textContent = "しおりから";
      bookmarkBtn.className = "secondary";
      bookmarkBtn.onclick = () => openFromLibrary(book.id, { useBookmark: true });

      actions.append(openBtn, bookmarkBtn);
      card.append(cover, badge, title, meta, actions);
      elements.libraryGrid.appendChild(card);
    });
}

function renderBookmarks() {
  elements.bookmarkList.innerHTML = "";
  if (!currentBookId) return;
  const list = storage.getBookmarks(currentBookId);
  if (!list.length) {
    const empty = document.createElement("li");
    empty.textContent = "まだしおりがありません";
    elements.bookmarkList.appendChild(empty);
    return;
  }

  list.forEach((bookmark) => {
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.innerHTML = `<strong>${bookmark.label}</strong><span class="meta">${new Date(bookmark.createdAt).toLocaleString()} / ${bookmark.percentage}%</span>`;

    const buttons = document.createElement("div");
    buttons.className = "button-row";
    const goBtn = document.createElement("button");
    goBtn.textContent = "移動";
    goBtn.className = "small primary";
    goBtn.onclick = () => reader.goTo(bookmark);

    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.className = "small secondary";
    delBtn.onclick = () => {
      storage.removeBookmark(currentBookId, bookmark.createdAt);
      renderBookmarks();
    };

    buttons.append(goBtn, delBtn);
    li.append(left, buttons);
    elements.bookmarkList.appendChild(li);
  });
}

function openModal(src) {
  elements.modal.classList.remove("hidden");
  elements.modalImage.src = src;
}

function closeModal() {
  elements.modal.classList.add("hidden");
  elements.modalImage.src = "";
}

function toggleFields(nodes, disabled) {
  nodes.forEach((el) => {
    if (!el) return;
    el.disabled = disabled;
  });
}

function updateSourceControls(source) {
  const current = cloudSync.resolveSource(source, storage.getSettings());
  const loginButton = elements.sourceLogin;
  const driveFields = [
    elements.driveClientIdInput,
    elements.driveFileIdInput,
    elements.driveFolderIdInput,
    elements.driveFileNameInput,
    elements.authorizeDrive,
  ];
  const onedriveFields = [elements.onedriveClientIdInput, elements.onedriveFilePathInput, elements.authorizeOneDrive];
  const endpointFields = [elements.endpointInput, elements.apiKeyInput];

  switch (current) {
    case "drive":
      toggleFields(driveFields, false);
      toggleFields(onedriveFields, true);
      toggleFields(endpointFields, true);
      if (loginButton) loginButton.disabled = false;
      setSyncStatus("Google Drive モードです。クライアント ID を設定して認証してください。");
      break;
    case "onedrive":
      toggleFields(driveFields, true);
      toggleFields(onedriveFields, false);
      toggleFields(endpointFields, true);
      if (loginButton) loginButton.disabled = false;
      setSyncStatus("OneDrive モードです。クライアント ID を設定して認証してください。");
      break;
    case "pcloud":
      toggleFields(driveFields, true);
      toggleFields(onedriveFields, true);
      toggleFields(endpointFields, false);
      if (loginButton) loginButton.disabled = false;
      setSyncStatus("pCloud モードです。エンドポイントと API Key を設定してください。");
      break;
    case "local":
    default:
      toggleFields(driveFields, true);
      toggleFields(onedriveFields, true);
      toggleFields(endpointFields, true);
      if (loginButton) loginButton.disabled = true;
      setSyncStatus("ローカルモードです。クラウド同期はスキップされます。");
      break;
  }
}

function setupEvents() {
  elements.epubInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file, "epub");
  });

  elements.zipInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file, "image");
  });

  elements.bookmarkBtn.onclick = () => {
    const bookmark = reader.addBookmark("しおり");
    if (bookmark && currentBookId) {
      storage.addBookmark(currentBookId, bookmark);
      renderBookmarks();
      setStatus("しおりを追加しました");
    }
  };

  elements.goToBookmark.onclick = () => {
    if (!currentBookId) return;
    const bookmarks = storage.getBookmarks(currentBookId);
    if (!bookmarks.length) return;
    reader.goTo(bookmarks[0]);
  };

  elements.prevSection.onclick = () => reader.prev();
  elements.nextSection.onclick = () => reader.next();
  elements.prevPage.onclick = () => reader.prev();
  elements.nextPage.onclick = () => reader.next();

  elements.toggleTheme.onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    reader.applyTheme(theme);
    storage.setSettings({ theme });
  };

  elements.openBookmarkFromLibrary.onclick = () => {
    if (currentBookId) {
      const bookmarks = storage.getBookmarks(currentBookId);
      if (bookmarks.length) reader.goTo(bookmarks[0]);
      return;
    }
    const latest = Object.entries(storage.data.bookmarks)
      .flatMap(([bookId, list]) => list.map((b) => ({ ...b, bookId })))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest) openFromLibrary(latest.bookId, { useBookmark: true });
  };

  elements.syncNow.onclick = async () => {
    try {
      await cloudSync.push();
      await cloudSync.pull();
      renderBookmarks();
      renderHistory();
      renderLibrary();
      setStatus("クラウド同期が完了しました");
    } catch (error) {
      alert(error.message);
    }
  };

  elements.exportData.onclick = () => {
    const data = storage.exportData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "epub-reader-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  elements.importData.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    storage.importData(text);
    renderBookmarks();
    renderHistory();
    renderLibrary();
    setStatus("設定を読み込みました");
  });

  elements.endpointInput.addEventListener("change", (e) => {
    storage.setSettings({ endpoint: e.target.value.trim() });
  });

  elements.apiKeyInput.addEventListener("change", (e) => {
    storage.setSettings({ apiKey: e.target.value.trim() });
  });

  elements.sourceSelect.addEventListener("change", (e) => {
    const source = e.target.value;
    storage.setSettings({ source });
    updateSourceControls(source);
  });

  elements.sourceLogin.addEventListener("click", () => {
    const source = storage.getSettings().source || "local";
    if (source === "drive") {
      const settings = storage.getSettings();
      if (!settings.driveClientId) {
        alert("Google Drive のクライアント ID を入力してください");
        return;
      }
      startDriveOAuth(settings.driveClientId, window.location.origin + window.location.pathname);
      setSyncStatus("Google Drive の認可を別ウィンドウで進めてください。完了後に戻って同期を実行できます。");
      return;
    }
    if (source === "onedrive") {
      const settings = storage.getSettings();
      if (!settings.onedriveClientId) {
        alert("OneDrive のクライアント ID を入力してください");
        return;
      }
      startOneDriveOAuth(settings.onedriveClientId, window.location.origin + window.location.pathname);
      setSyncStatus("OneDrive の認可を別ウィンドウで進めてください。完了後に戻って同期を実行できます。");
      return;
    }
    if (source === "pcloud") {
      setSyncStatus("pCloud モードです。エンドポイントと API Key を確認して「今すぐクラウド同期」を押してください。");
      return;
    }
    setSyncStatus("ローカルモードです。同期はスキップされます。");
  });

  elements.driveClientIdInput.addEventListener("change", (e) => {
    storage.setSettings({ driveClientId: e.target.value.trim() });
  });

  elements.driveFileIdInput.addEventListener("change", (e) => {
    storage.setSettings({ driveFileId: e.target.value.trim() });
  });

  elements.driveFolderIdInput.addEventListener("change", (e) => {
    storage.setSettings({ driveFolderId: e.target.value.trim() });
  });

  elements.driveFileNameInput.addEventListener("change", (e) => {
    storage.setSettings({ driveFileName: e.target.value.trim() || "epub-reader-data.json" });
    elements.driveFileNameInput.value = storage.getSettings().driveFileName;
  });

  elements.onedriveClientIdInput.addEventListener("change", (e) => {
    storage.setSettings({ onedriveClientId: e.target.value.trim() });
  });

  elements.onedriveFilePathInput.addEventListener("change", (e) => {
    const value = e.target.value.trim() || "epub-reader-data.json";
    storage.setSettings({ onedriveFilePath: value });
    elements.onedriveFilePathInput.value = storage.getSettings().onedriveFilePath;
  });

  elements.authorizeDrive.addEventListener("click", () => {
    const settings = storage.getSettings();
    if (!settings.driveClientId) {
      alert("Google Drive のクライアント ID を入力してください");
      return;
    }
    startDriveOAuth(settings.driveClientId, window.location.origin + window.location.pathname);
  });

  elements.authorizeOneDrive.addEventListener("click", () => {
    const settings = storage.getSettings();
    if (!settings.onedriveClientId) {
      alert("OneDrive のクライアント ID を入力してください");
      return;
    }
    startOneDriveOAuth(settings.onedriveClientId, window.location.origin + window.location.pathname);
  });

  elements.modal.addEventListener("click", (e) => {
    if (e.target === elements.modal || e.target.classList.contains("modal-backdrop")) {
      closeModal();
    }
  });
  elements.closeModal.onclick = closeModal;
}

function loadSettings() {
  const settings = storage.getSettings();
  elements.endpointInput.value = settings.endpoint ?? "";
  elements.apiKeyInput.value = settings.apiKey ?? "";
  elements.sourceSelect.value = settings.source ?? "local";
  elements.driveClientIdInput.value = settings.driveClientId ?? "";
  elements.driveFileIdInput.value = settings.driveFileId ?? "";
  elements.driveFolderIdInput.value = settings.driveFolderId ?? "";
  elements.driveFileNameInput.value = settings.driveFileName ?? "epub-reader-data.json";
  elements.onedriveClientIdInput.value = settings.onedriveClientId ?? "";
  elements.onedriveFilePathInput.value = settings.onedriveFilePath ?? "epub-reader-data.json";
  if (settings.theme) {
    theme = settings.theme;
    reader.applyTheme(theme);
  }
  updateSourceControls(settings.source);
}

function init() {
  loadSettings();
  const capturedDrive = captureDriveAccessTokenFromHash("drive");
  if (capturedDrive) {
    storage.setSettings({ driveToken: capturedDrive });
    setSyncStatus("Google Drive の認証が完了しました。同期を再度実行してください。");
    setStatus("Google Drive の認証が完了しました。同期を再度実行してください。");
  }
  const capturedOneDrive = captureOneDriveAccessTokenFromHash("onedrive");
  if (capturedOneDrive) {
    storage.setSettings({ onedriveToken: capturedOneDrive });
    setSyncStatus("OneDrive の認証が完了しました。同期を再度実行してください。");
    setStatus("OneDrive の認証が完了しました。同期を再度実行してください。");
  }
  setupEvents();
  renderHistory();
  renderLibrary();
}

init();
