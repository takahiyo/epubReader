import { StorageService } from "./storage.js";
import { ReaderController } from "./reader.js";
import { CloudSync } from "./cloudSync.js";
import {
  captureAccessTokenFromHash as captureDriveAccessTokenFromHash,
  ensureDriveAccessToken,
  startDriveOAuth,
} from "./driveAuth.js";
import {
  captureAccessTokenFromHash as captureOneDriveAccessTokenFromHash,
  ensureOneDriveAccessToken,
  startOneDriveOAuth,
} from "./onedriveAuth.js";
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
  openFileModalButton: document.getElementById("openFileModalButton"),
  openFileModal: document.getElementById("openFileModal"),
  closeOpenFileModal: document.getElementById("closeOpenFileModal"),
  openSourceRadios: Array.from(document.querySelectorAll("input[name='openSource']")),
  openLocalSection: document.getElementById("openLocalSection"),
  openDriveSection: document.getElementById("openDriveSection"),
  openOneDriveSection: document.getElementById("openOneDriveSection"),
  openPCloudSection: document.getElementById("openPCloudSection"),
  openDriveAuth: document.getElementById("openDriveAuth"),
  refreshDriveFiles: document.getElementById("refreshDriveFiles"),
  drivePickerSelect: document.getElementById("drivePickerSelect"),
  openDriveSelected: document.getElementById("openDriveSelected"),
  openOneDriveAuth: document.getElementById("openOneDriveAuth"),
  refreshOneDriveFiles: document.getElementById("refreshOneDriveFiles"),
  oneDrivePickerSelect: document.getElementById("oneDrivePickerSelect"),
  openOneDriveSelected: document.getElementById("openOneDriveSelected"),
  pcloudFileUrlInput: document.getElementById("pcloudFileUrlInput"),
  openPcloudUrl: document.getElementById("openPcloudUrl"),
  openSettings: document.getElementById("openSettings"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsModal: document.getElementById("closeSettingsModal"),
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
let openSource = storage.getSettings().source ?? "local";
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

function detectTypeByName(fileName = "") {
  if (/\.epub$/i.test(fileName)) return "epub";
  return "image";
}

function ensureDriveTokenInteractive() {
  const settings = storage.getSettings();
  return ensureDriveAccessToken(settings, (driveToken) => storage.setSettings({ driveToken }));
}

function ensureOneDriveTokenInteractive() {
  const settings = storage.getSettings();
  return ensureOneDriveAccessToken(settings, (onedriveToken) => storage.setSettings({ onedriveToken }));
}

async function handleFile(file, type) {
  try {
    console.log(`Opening file: ${file.name}, type: ${type}`);
    setStatus(`ファイルを読み込んでいます: ${file.name}`);
    
    const buffer = await file.arrayBuffer();
    console.log(`File buffer size: ${buffer.byteLength} bytes`);
    
    const id = await hashBuffer(buffer, file.name);
    console.log(`File ID: ${id}`);
    
    const mime = guessMime(type, file);
    const source = storage.getSettings().source;
    
    setStatus("ファイルを保存しています...");
    await saveFile(id, buffer, { fileName: file.name, mime }, source);
    console.log("File saved successfully");

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

    setStatus("ビューアを初期化しています...");
    if (info.type === "epub") {
      console.log("Opening EPUB with startLocation:", startLocation);
      await reader.openEpub(new File([buffer], file.name, { type: mime }), startLocation);
      console.log("EPUB opened successfully");
    } else {
      console.log("Opening image book with startPage:", startLocation);
      await reader.openImageBook(new File([buffer], file.name, { type: mime }), typeof startLocation === "number" ? startLocation : 0);
      console.log("Image book opened successfully");
    }

    renderBookmarks();
    renderHistory();
    renderLibrary();
    setStatus("読み込みが完了しました。しおりや履歴は自動で保存されます。");
    if (elements.openFileModal && !elements.openFileModal.classList.contains("hidden")) {
      hideOpenFileModal();
    }
  } catch (error) {
    console.error("Error in handleFile:", error);
    console.error("Error stack:", error.stack);
    setStatus(`エラー: ${error.message || "読み込みに失敗しました"}`);
    alert(`ファイルの読み込みに失敗しました:\n\n${error.message}\n\nブラウザのコンソールを確認してください。`);
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

function setOpenSource(source, { persist = true } = {}) {
  openSource = source;
  const sectionMap = {
    local: elements.openLocalSection,
    drive: elements.openDriveSection,
    onedrive: elements.openOneDriveSection,
    pcloud: elements.openPCloudSection,
  };
  if (elements.openSourceRadios?.length) {
    elements.openSourceRadios.forEach((radio) => {
      if (radio) radio.checked = radio.value === source;
    });
  }
  Object.entries(sectionMap).forEach(([key, node]) => {
    if (!node) return;
    node.classList.toggle("hidden", key !== source);
  });
  if (persist) {
    storage.setSettings({ source });
    if (elements.sourceSelect) {
      elements.sourceSelect.value = source;
    }
    updateSourceControls(source);
  }
}

function showOpenFileModal() {
  if (!elements.openFileModal) return;
  setOpenSource(openSource, { persist: false });
  elements.openFileModal.classList.remove("hidden");
}

function hideOpenFileModal() {
  if (!elements.openFileModal) return;
  elements.openFileModal.classList.add("hidden");
}

function showSettingsModal() {
  if (!elements.settingsModal) return;
  elements.settingsModal.classList.remove("hidden");
}

function hideSettingsModal() {
  if (!elements.settingsModal) return;
  elements.settingsModal.classList.add("hidden");
}

function buildDriveQuery() {
  const epub = "mimeType='application/epub+zip'";
  const zip = "mimeType='application/zip' or mimeType contains 'zip'";
  return encodeURIComponent(`(${epub} or ${zip}) and trashed=false`);
}

async function fetchDriveFiles() {
  const accessToken = await ensureDriveTokenInteractive();
  const url = `https://www.googleapis.com/drive/v3/files?q=${buildDriveQuery()}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`Drive のファイル一覧取得に失敗しました (${response.status})`);
  }
  const json = await response.json();
  return json?.files ?? [];
}

async function downloadDriveFile(fileId) {
  const accessToken = await ensureDriveTokenInteractive();
  const metaResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaResponse.ok) {
    throw new Error(`Drive のファイル情報取得に失敗しました (${metaResponse.status})`);
  }
  const meta = await metaResponse.json();
  const dataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!dataResponse.ok) {
    throw new Error(`Drive ファイルのダウンロードに失敗しました (${dataResponse.status})`);
  }
  const blob = await dataResponse.blob();
  const buffer = await blob.arrayBuffer();
  const name = meta?.name || `drive-file-${fileId}`;
  return new File([buffer], name, { type: meta?.mimeType || blob.type || "application/octet-stream" });
}

async function fetchOneDriveFiles() {
  const accessToken = await ensureOneDriveTokenInteractive();
  const url =
    "https://graph.microsoft.com/v1.0/me/drive/special/approot/children?$top=200&$select=id,name,size,lastModifiedDateTime,file,@microsoft.graph.downloadUrl";
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`OneDrive のファイル一覧取得に失敗しました (${response.status})`);
  }
  const json = await response.json();
  return (json?.value ?? []).filter((item) => {
    const name = item?.name ?? "";
    return /\.epub$/i.test(name) || /\.zip$/i.test(name) || /\.cbz$/i.test(name);
  });
}

async function downloadOneDriveFile(fileId) {
  const accessToken = await ensureOneDriveTokenInteractive();
  const metaResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?select=id,name,file,@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaResponse.ok) {
    throw new Error(`OneDrive のファイル情報取得に失敗しました (${metaResponse.status})`);
  }
  const meta = await metaResponse.json();
  const downloadUrl = meta["@microsoft.graph.downloadUrl"];
  const dataResponse = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!dataResponse.ok) {
    throw new Error(`OneDrive ファイルのダウンロードに失敗しました (${dataResponse.status})`);
  }
  const blob = await dataResponse.blob();
  const buffer = await blob.arrayBuffer();
  const name = meta?.name || `onedrive-file-${fileId}`;
  const mime = meta?.file?.mimeType || blob.type || "application/octet-stream";
  return new File([buffer], name, { type: mime });
}

async function refreshDrivePicker() {
  if (!elements.drivePickerSelect) return;
  elements.drivePickerSelect.innerHTML = '<option value="">Drive のファイルを読み込み中...</option>';
  try {
    const files = await fetchDriveFiles();
    elements.drivePickerSelect.innerHTML = "";
    if (!files.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "EPUB / ZIP ファイルが見つかりません";
      elements.drivePickerSelect.appendChild(opt);
      return;
    }
    files.forEach((file) => {
      const opt = document.createElement("option");
      const updated = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "-";
      opt.value = file.id;
      opt.textContent = `${file.name} (${updated})`;
      elements.drivePickerSelect.appendChild(opt);
    });
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function refreshOneDrivePicker() {
  if (!elements.oneDrivePickerSelect) return;
  elements.oneDrivePickerSelect.innerHTML = '<option value="">OneDrive のファイルを読み込み中...</option>';
  try {
    const files = await fetchOneDriveFiles();
    elements.oneDrivePickerSelect.innerHTML = "";
    if (!files.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "EPUB / ZIP ファイルが見つかりません";
      elements.oneDrivePickerSelect.appendChild(opt);
      return;
    }
    files.forEach((file) => {
      const opt = document.createElement("option");
      const updated = file.lastModifiedDateTime ? new Date(file.lastModifiedDateTime).toLocaleString() : "-";
      opt.value = file.id;
      opt.textContent = `${file.name} (${updated})`;
      elements.oneDrivePickerSelect.appendChild(opt);
    });
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function openDriveSelectedFile() {
  const fileId = elements.drivePickerSelect?.value;
  if (!fileId) {
    alert("Drive のファイルを選択してください");
    return;
  }
  try {
    const file = await downloadDriveFile(fileId);
    await handleFile(file, detectTypeByName(file.name));
    hideOpenFileModal();
  } catch (error) {
    console.error(error);
    alert(error.message || "Drive からの読み込みに失敗しました");
  }
}

async function openOneDriveSelectedFile() {
  const fileId = elements.oneDrivePickerSelect?.value;
  if (!fileId) {
    alert("OneDrive のファイルを選択してください");
    return;
  }
  try {
    const file = await downloadOneDriveFile(fileId);
    await handleFile(file, detectTypeByName(file.name));
    hideOpenFileModal();
  } catch (error) {
    console.error(error);
    alert(error.message || "OneDrive からの読み込みに失敗しました");
  }
}

async function openPcloudFromUrl() {
  const url = elements.pcloudFileUrlInput?.value?.trim();
  if (!url) {
    alert("pCloud / カスタム URL を入力してください");
    return;
  }
  try {
    const settings = storage.getSettings();
    const headers = {};
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`ファイルの取得に失敗しました (${response.status})`);
    }
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const name =
      (() => {
        try {
          const parsed = new URL(url);
          const base = parsed.pathname.split("/").filter(Boolean).pop();
          return base || "pcloud-file";
        } catch {
          return "pcloud-file";
        }
      })() || "pcloud-file";
    const file = new File([buffer], name, { type: blob.type || "application/octet-stream" });
    await handleFile(file, detectTypeByName(file.name));
    hideOpenFileModal();
  } catch (error) {
    console.error(error);
    alert(error.message || "URL からの読み込みに失敗しました");
  }
}

function setupEvents() {
  elements.openSettings?.addEventListener("click", () => {
    showSettingsModal();
    updateSourceControls(storage.getSettings().source);
  });
  elements.closeSettingsModal?.addEventListener("click", () => hideSettingsModal());
  elements.settingsModal?.addEventListener("click", (e) => {
    if (e.target === elements.settingsModal || e.target.classList.contains("modal-backdrop")) {
      hideSettingsModal();
    }
  });

  elements.openFileModalButton?.addEventListener("click", () => showOpenFileModal());
  elements.closeOpenFileModal?.addEventListener("click", () => hideOpenFileModal());
  elements.openFileModal?.addEventListener("click", (e) => {
    if (e.target === elements.openFileModal || e.target.classList.contains("modal-backdrop")) {
      hideOpenFileModal();
    }
  });
  elements.openSourceRadios?.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const value = e.target.value;
      setOpenSource(value);
    });
  });

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
    setOpenSource(source);
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

  elements.openDriveAuth?.addEventListener("click", () => {
    const settings = storage.getSettings();
    if (!settings.driveClientId) {
      alert("Google Drive のクライアント ID を同期設定に入力してください");
      return;
    }
    startDriveOAuth(settings.driveClientId, window.location.origin + window.location.pathname);
  });
  elements.openOneDriveAuth?.addEventListener("click", () => {
    const settings = storage.getSettings();
    if (!settings.onedriveClientId) {
      alert("OneDrive のクライアント ID を同期設定に入力してください");
      return;
    }
    startOneDriveOAuth(settings.onedriveClientId, window.location.origin + window.location.pathname);
  });
  elements.refreshDriveFiles?.addEventListener("click", refreshDrivePicker);
  elements.refreshOneDriveFiles?.addEventListener("click", refreshOneDrivePicker);
  elements.openDriveSelected?.addEventListener("click", openDriveSelectedFile);
  elements.openOneDriveSelected?.addEventListener("click", openOneDriveSelectedFile);
  elements.openPcloudUrl?.addEventListener("click", openPcloudFromUrl);
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
  setOpenSource(settings.source ?? "local", { persist: false });
  updateSourceControls(settings.source);
}

function init() {
  // ライブラリの読み込み確認
  console.log("Checking libraries...");
  console.log("JSZip:", typeof JSZip !== "undefined" ? "✓ Loaded" : "✗ Not loaded");
  console.log("ePub:", typeof ePub !== "undefined" ? "✓ Loaded" : "✗ Not loaded");
  
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

// DOMContentLoadedイベントを待ってから初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
