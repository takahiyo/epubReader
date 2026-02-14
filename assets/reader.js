/**
 * reader.js - リーダーコントローラー
 * 
 * EPUB/画像書庫の表示とナビゲーションを管理します。
 */

import { EpubPaginator } from "../src/reader/epubPaginator.js";
import {
  CDN_URLS,
  ASSET_PATHS,
  READER_CONFIG,
  DOM_IDS,
  DOM_SELECTORS,
  UI_CLASSES,
  DATA_ATTRS,
  BOOK_TYPES,
  WRITING_MODES,
  READING_DIRECTIONS,
  IMAGE_VIEW_MODES,
  CSS_WRITING_MODES,
  UI_DEFAULTS,
  MEMORY_STRATEGY,
  READER_LOADING_PHASES,
  READER_LOADING_STATUSES,
} from "./constants.js";
import { createArchiveHandler } from "./js/core/archive-handler.js";
import { calculateProgressPercentage } from "./js/core/progress-utils.js";

const TEXT_SEGMENT_STEP = READER_CONFIG.TEXT_SEGMENT_STEP;
const getMemoryStrategy = () => {
  if (typeof window !== "undefined" && window.EPUB_READER_CONFIG?.MEMORY_STRATEGY) {
    return window.EPUB_READER_CONFIG.MEMORY_STRATEGY;
  }
  return MEMORY_STRATEGY;
};
const getReaderLineHeight = () => READER_CONFIG.lineHeight ?? READER_CONFIG.DEFAULT_LINE_HEIGHT;
const normalizeRelativePath = (path) => {
  if (!path) return path;
  const normalized = path.replace(/\\/g, "/");
  const withoutQuery = normalized.split(/[?#]/)[0];
  try {
    const dummyBase = "http://dummy";
    const fullUrl = new URL(withoutQuery, dummyBase);
    return fullUrl.pathname.replace(/^\//, "");
  } catch (error) {
    const parts = withoutQuery.split("/").filter(p => p && p !== ".");
    const result = [];
    for (const part of parts) {
      if (part === ".." && result.length > 0) {
        result.pop();
      } else if (part !== "..") {
        result.push(part);
      }
    }
    return result.join("/");
  }
};
const safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};
const safeEncodeURI = (value) => {
  try {
    return encodeURI(value);
  } catch (error) {
    return value;
  }
};
const normalizeResourceEncoding = (value) => {
  if (!value) return value;
  const decoded = safeDecodeURIComponent(value);
  return safeEncodeURI(decoded);
};
const normalizeResourcePath = (url, spineItem) => {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  const normalized = url.replace(/\\/g, "/");
  const [pathPart] = normalized.split(/[?#]/);

  if (!spineItem?.href) {
    return normalizeRelativePath(pathPart);
  }

  const baseParts = spineItem.href.replace(/\\/g, "/").split("/").slice(0, -1);
  const base = baseParts.join("/");

  if (!base) {
    return normalizeRelativePath(pathPart);
  }

  if (pathPart.startsWith("/")) {
    return normalizeRelativePath(pathPart.replace(/^\/+/, ""));
  }

  const isExplicitRelative = pathPart.startsWith("./") || pathPart.startsWith("../");
  const hasDirectory = pathPart.includes("/");
  if (!isExplicitRelative && hasDirectory && !pathPart.startsWith(`${base}/`)) {
    return normalizeRelativePath(pathPart);
  }

  const shouldResolve = !pathPart.startsWith(`${base}/`) && pathPart !== base;
  const combined = shouldResolve ? `${base}/${pathPart}` : pathPart;
  return normalizeRelativePath(combined);
};
const normalizeResourceKey = (url, spineItem, book) => {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  const normalized = normalizeResourcePath(url, spineItem);
  const resolved = book?.path?.resolve ? book.path.resolve(normalized) : normalized;
  const encoded = normalizeResourceEncoding(resolved);
  return normalizeRelativePath(encoded);
};
const normalizeResourceComparisonKey = (url, spineItem, book) => {
  const normalized = normalizeResourceKey(url, spineItem, book);
  if (!normalized) return normalized;
  return normalized.replace(/\.[^./?#]+$/, (ext) => ext.toLowerCase());
};
const normalizeResourceFilenameKey = (filename) => {
  if (!filename) return filename;
  const encoded = normalizeResourceEncoding(filename);
  return encoded.replace(/\.[^./?#]+$/, (ext) => ext.toLowerCase());
};
const normalizeZipEntryKey = (value, { lowerCase = false } = {}) => {
  if (!value) return value;
  const decoded = safeDecodeURIComponent(value);
  const normalized = decoded.replace(/\\/g, "/");
  return lowerCase ? normalized.toLowerCase() : normalized;
};

class PageController {
  constructor(onChange) {
    this.onChange = onChange;
    this.currentIndex = 0;
    this.totalPages = 0;
  }

  setTotalPages(totalPages) {
    this.totalPages = Math.max(0, totalPages || 0);
    if (this.totalPages === 0) {
      this.currentIndex = 0;
      return;
    }
    this.currentIndex = Math.min(this.currentIndex, this.totalPages - 1);
  }

  goTo(index) {
    if (this.totalPages === 0) return;
    const clamped = Math.max(0, Math.min(index, this.totalPages - 1));
    this.currentIndex = clamped;
    this.onChange?.(clamped);
  }

  next() {
    this.goTo(this.currentIndex + 1);
  }

  prev() {
    this.goTo(this.currentIndex - 1);
  }
}

export class ReaderController {
  constructor({
    viewerId,
    imageViewerId,
    imageElementId,
    pageIndicatorId,
    onProgress,
    onLoadingUpdate,
    onReady,
    onImageZoom,
    onRepaginationStart,
    onRepaginationEnd,
  }) {
    this.viewer = document.getElementById(viewerId);
    this.imageViewer = document.getElementById(imageViewerId);
    this.imageElement = document.getElementById(imageElementId);
    this.pageIndicator = document.getElementById(pageIndicatorId);
    this.onProgress = onProgress;
    this.onLoadingUpdate = onLoadingUpdate;
    this.onReady = onReady;
    this.onImageZoom = onImageZoom;
    this.onRepaginationStart = onRepaginationStart;
    this.onRepaginationEnd = onRepaginationEnd;
    this.rendition = null;
    this.book = null;
    this.type = null; // "epub" | "image"
    this.archiveHandler = null;
    this.imagePages = [];
    this.imageIndex = 0;
    this.imageEntries = [];
    this.imagePageErrors = [];
    this.imageLoadToken = 0;
    this.imageArchiveSize = 0;
    this.imageViewMode = IMAGE_VIEW_MODES.SINGLE;
    this.imageReadingDirection = READING_DIRECTIONS.LTR; // "ltr" = 左開き, "rtl" = 右開き
    this.imageZoomed = false;
    this.repaginationRequestId = 0;
    this.theme = UI_DEFAULTS.theme;
    this.writingMode = WRITING_MODES.HORIZONTAL;
    this.pageDirection = READING_DIRECTIONS.LTR;
    this.preferredWritingMode = null;
    this.paginator = null;
    this.pagination = null;
    this.paginationPromise = null;
    this.paginationComplete = false;
    this.currentPageIndex = 0;
    this.usingPaginator = false;
    this.resourceUrlCache = new Map();
    this.zipFileKeyMap = null;
    this.resourceLoader = null;
    this.pageContainer = null;
    this.fontSize = null;
    this.spineItems = [];
    this.pageController = new PageController((index) => {
      this.renderEpubPage(index);
    });
    this.imageZoomBound = false;
    this.pageDimensionCache = {}; // [追加] 画像サイズ情報のキャッシュ
    this.toc = [];
    this.resizeTimer = null; // [追加] リサイズ用のタイマー

    // [New] Zoom State
    this.zoomScale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.isPinching = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.pinchStartDistance = 0;
    this.pinchStartScale = 1.0;
    this.transformFrame = null;
    this.pendingTransform = false;

    // Bind global pan events
    this.bindPanEvents();
    this.bindZoomEvents();
    this.setupZoomSlider();
  }

  getReaderMaxWidthValue() {
    const root = document.documentElement;
    const cssValue = root
      ? getComputedStyle(root).getPropertyValue("--reader-max-width").trim()
      : "";
    return cssValue || READER_CONFIG.layout?.maxWidth || "";
  }

  resolveCssWidthPx(value, referenceElement = null) {
    if (!value) return null;
    const host = referenceElement || this.viewer || document.body;
    if (!host) return null;
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.width = value;
    host.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return Number.isFinite(width) && width > 0 ? width : null;
  }

  getEffectiveContentWidth(viewportWidth, maxWidthValue = "") {
    const resolvedMaxWidth = maxWidthValue || this.getReaderMaxWidthValue();
    const maxWidthPx = this.resolveCssWidthPx(resolvedMaxWidth);
    if (!maxWidthPx) return viewportWidth;
    return Math.min(viewportWidth, maxWidthPx);
  }

  emitLoadingUpdate({ phase, status, current, total } = {}) {
    if (!this.onLoadingUpdate || !phase || !status) return;
    const percentage =
      Number.isFinite(current) && Number.isFinite(total) && total > 0
        ? Math.round((current / total) * 100)
        : null;
    this.onLoadingUpdate({
      phase,
      status,
      current,
      total,
      percentage,
    });
  }

  resetReaderState() {
    if (this.rendition?.destroy) {
      try {
        this.rendition.destroy();
      } catch (error) {
        console.warn("Failed to destroy rendition:", error);
      }
    }
    if (this.book?.destroy) {
      try {
        this.book.destroy();
      } catch (error) {
        console.warn("Failed to destroy book:", error);
      }
    }
    this.rendition = null;
    this.book = null;
    this.type = null; // "epub" | "image"
    this.archiveHandler = null;
    this.revokeImagePages();
    this.imagePages = [];
    this.imageIndex = 0;
    this.imageEntries = [];
    this.imagePageErrors = [];
    this.imageLoadToken = 0;
    this.imageZoomed = false;
    if (this.currentPaginationRun) {
      this.currentPaginationRun.cancelled = true;
      this.currentPaginationRun = null;
    }
    this._isInitialReadyCalled = false;
    this.toc = [];
    if (this.paginator?.destroy) {
      this.paginator.destroy();
    }
    this.paginator = null;
    this.pagination = null;
    this.paginationPromise = null;
    this.currentPageIndex = 0;
    this.usingPaginator = false;
    this.resourceUrlCache.forEach((url) => URL.revokeObjectURL(url));
    this.resourceUrlCache.clear();
    this.zipFileKeyMap = null;
    this.resourceLoader = null;
    this.pageContainer = null;
    this.spineItems = [];
    this.pageController = new PageController((index) => {
      this.renderEpubPage(index);
    });
    if (this.viewer) {
      this.viewer.innerHTML = "";
    }
    if (this.imageElement) {
      this.imageElement.src = "";
    }
    if (this.pageIndicator) {
      this.pageIndicator.textContent = "";
    }
    this.imageZoomBound = false;
    this.zoomScale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.isPinching = false;
    this.pinchStartDistance = 0;
    this.pinchStartScale = 1.0;
    if (typeof document !== 'undefined') {
      document.body.classList.remove(UI_CLASSES.IS_ZOOMED);
      const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
      if (slider) slider.value = this.getZoomConfig().min;
    }
    this.updateTransform();
  }

  revokeImagePages() {
    if (!this.imagePages?.length) return;
    this.imagePages.forEach((page) => {
      if (typeof page === "string" && page.startsWith("blob:")) {
        URL.revokeObjectURL(page);
      }
    });
  }

  /**
   * リサイズ時の処理（Debounce付き）
   * 回転中などの連続発火を防ぐ
   */
  onResize() {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      this.handleResize();
    }, 200); // 200ms待機してから実行
  }

  /**
   * リサイズ時の処理
   * ビューポートサイズ変更時にページ分割を再計算
   */
  async handleResize() {
    // EPUB表示中でなければ何もしない
    if (this.type !== BOOK_TYPES.EPUB || !this.paginator) {
      return;
    }

    this.repaginationRequestId += 1;
    const myRequestId = this.repaginationRequestId;

    console.log(`handleResize: リペジネーション開始 (requestId=${myRequestId})`);

    // ローディング表示（最新のリクエストのみ管理）
    this.onRepaginationStart?.();

    // 現在のページ位置を保存
    const currentLocator = this.getPageLocator(this.currentPageIndex);

    // リペジネーション実行
    const paginationMetrics = this.getPaginationViewportMetrics();
    const { hPad, vPad } = this.getPaddings();
    const edgePadding = `${vPad}px ${hPad}px`; // CSS形式 (上下 左右)

    const newSettings = {
      viewportWidth: paginationMetrics.viewportWidth,
      viewportHeight: paginationMetrics.viewportHeight,
      maxWidth: paginationMetrics.maxWidthValue,
      contentWidth: paginationMetrics.contentWidth,
      padding: edgePadding,
      lineHeight: paginationMetrics.lineHeight,
    };

    try {
      await this.paginator.repaginate(newSettings);
      if (myRequestId !== this.repaginationRequestId) {
        console.debug(
          `handleResize: 古いリペジネーション結果を無視 (requestId=${myRequestId}, currentId=${this.repaginationRequestId})`
        );
        // 新しいリクエストがローディングを管理するので、ここでは解除しない
        return;
      }
      this.pagination = { pages: this.paginator.pages };
      this.pageController.setTotalPages(this.pagination.pages.length);

      // 元の位置に戻る
      if (currentLocator) {
        const newIndex = this.findPageContaining(
          currentLocator.spineIndex,
          currentLocator.segmentIndex
        );
        if (newIndex >= 0) {
          this.pageController.goTo(newIndex);
        }
      }

      // ブラウザの再描画を確定させる
      void document.body.offsetHeight;

      console.log(
        `handleResize: リペジネーション完了 (${this.pagination.pages.length}ページ, requestId=${myRequestId})`
      );
    } catch (error) {
      if (error?.name === "PaginationCancelledError") {
        console.debug("handleResize: リペジネーションがキャンセルされました");
        // 新しいリクエストがローディングを管理するので、ここでは解除しない
        return;
      }
      console.error("handleResize: リペジネーション失敗", error);
    }

    // 最新のリクエストの場合のみローディングを解除
    if (myRequestId === this.repaginationRequestId) {
      this.onRepaginationEnd?.();
    }
  }

  async ensureJSZip() {
    const isPlaceholder = (jszip) =>
      typeof jszip?.loadAsync === "function" && jszip.loadAsync.name === "missing";

    if (typeof JSZip !== "undefined") {
      if (typeof window !== "undefined" && !window.JSZip) {
        window.JSZip = JSZip;
      }
      if (isPlaceholder(JSZip)) {
        console.warn("JSZip vendor file is a placeholder. Loading JSZip from CDN...");
        return this.loadJSZipFromCdn(isPlaceholder);
      }
      console.log("JSZip is already loaded");
      return JSZip;
    }
    if (typeof window !== "undefined" && window.JSZip) {
      if (isPlaceholder(window.JSZip)) {
        console.warn("JSZip vendor file is a placeholder. Loading JSZip from CDN...");
        return this.loadJSZipFromCdn(isPlaceholder);
      }
      console.log("JSZip is already loaded (window.JSZip)");
      return window.JSZip;
    }
    console.log("Loading JSZip from local vendor...");
    await this.loadScript(ASSET_PATHS.VENDOR_JSZIP);
    const localJszip = typeof window !== "undefined" ? window.JSZip : null;
    if (!localJszip) {
      throw new Error("JSZipの読み込みに失敗しました。ベンダーファイルを確認してください。");
    }
    if (isPlaceholder(localJszip)) {
      console.warn("Local JSZip is a placeholder. Loading JSZip from CDN...");
      return this.loadJSZipFromCdn(isPlaceholder);
    }
    console.log("JSZip loaded successfully (local)");
    return localJszip;
  }

  getZipFileKeyMap() {
    if (this.zipFileKeyMap) {
      return this.zipFileKeyMap;
    }
    const zipFiles = this.book?.archive?.zip?.files;
    if (!zipFiles) {
      return null;
    }
    const map = new Map();
    for (const key of Object.keys(zipFiles)) {
      const normalized = normalizeZipEntryKey(key);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, key);
      }
      const lower = normalizeZipEntryKey(key, { lowerCase: true });
      if (lower && !map.has(lower)) {
        map.set(lower, key);
      }
    }
    this.zipFileKeyMap = map;
    return map;
  }

  async loadJSZipFromCdn(isPlaceholder) {
    // CDN URLs from constants.js (SSOT)
    const sources = [
      CDN_URLS.JSZIP,
      CDN_URLS.JSZIP_FALLBACK,
    ];

    for (const src of sources) {
      try {
        await this.loadScript(src);
        const cdnJszip = typeof window !== "undefined" ? window.JSZip : null;
        if (cdnJszip && !isPlaceholder(cdnJszip)) {
          console.log(`JSZip loaded successfully from CDN: ${src}`);
          return cdnJszip;
        }
      } catch (error) {
        console.warn(`Failed to load JSZip from CDN: ${src}`, error);
      }
    }

    throw new Error("JSZipの読み込みに失敗しました。ベンダーファイルがプレースホルダーのため、公式JSZipを配置するかCDNにアクセスできる環境で再試行してください。");
  }

  async ensureUnrar() {
    // ローカルの window.unrar があればそれを使う (後方互換性)
    if (typeof window !== "undefined") {
      const existing = window.unrar || window.Unrar || window.UnRAR;
      const isPlaceholder = (lib) =>
        typeof lib?.createExtractorFromData === "function" &&
        lib.createExtractorFromData.name === "missing";

      if (existing && !isPlaceholder(existing)) {
        return existing;
      }
    }

    // CDNから読み込む
    try {
      console.log("Loading node-unrar-js from CDN...");

      // CDN URLs from constants.js (SSOT)
      const JS_URL = CDN_URLS.UNRAR_JS;
      const WASM_URL = CDN_URLS.UNRAR_WASM;

      // 1. WASMバイナリを取得
      console.log(`Fetching WASM from: ${WASM_URL}`);
      const wasmPromise = fetch(WASM_URL).then(res => {
        if (!res.ok) throw new Error(`Failed to load WASM: ${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      });

      // 2. JSモジュールを読み込み
      console.log(`Importing JS from: ${JS_URL}`);
      const modulePromise = import(JS_URL);

      // 両方の完了を待つ
      const [wasmBinary, module] = await Promise.all([wasmPromise, modulePromise]);

      // エクスポートの取得 (esm.sh は Named Export または default に格納される)
      const createExtractor = module.createExtractorFromData || module.default?.createExtractorFromData;

      if (!createExtractor) {
        console.error("Loaded module exports:", module);
        throw new Error("createExtractorFromData がモジュール内に見つかりません。");
      }

      console.log("node-unrar-js loaded successfully.");

      // 3. ラッパーオブジェクトを返す (WASMを自動注入)
      return {
        createExtractorFromData: async (options) => {
          return createExtractor({
            ...options,
            wasmBinary: wasmBinary // 手動取得したバイナリを渡す
          });
        }
      };

    } catch (error) {
      console.error("RAR Library Load Error:", error);
      throw new Error(`RARライブラリの読み込みに失敗しました: ${error.message}`);
    }
  }

  async loadScript(src) {
    if (typeof document === "undefined") {
      throw new Error(`Script load requires document: ${src}`);
    }
    const existing = document.querySelector(`script[${DATA_ATTRS.READER_SRC}="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return;
      await new Promise((resolve, reject) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      });
      return;
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.readerSrc = src;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async openEpub(file, startLocation) {
    this.resetReaderState();
    this.type = BOOK_TYPES.EPUB;
    this.usingPaginator = true;

    // JSZipを先にロード
    const JSZipLib = await this.ensureJSZip();

    // JSZipがグローバルに設定されていることを確認（EPUB.jsが必要）
    if (typeof window !== 'undefined') {
      if (!window.JSZip) {
        window.JSZip = JSZipLib;
        console.log("Set window.JSZip explicitly for EPUB.js");
      }

      // グローバルスコープにも設定（一部のEPUB.jsバージョンが必要とする）
      if (typeof globalThis !== 'undefined' && !globalThis.JSZip) {
        globalThis.JSZip = JSZipLib;
        console.log("Set globalThis.JSZip for compatibility");
      }
    }

    // JSZipが正しくロードされたか確認
    console.log("JSZip status after loading:", {
      'window.JSZip': typeof window.JSZip,
      'JSZipLib': typeof JSZipLib,
      'has methods': typeof JSZipLib?.loadAsync === 'function'
    });

    // EPUB.jsがJSZipを認識できるか最終確認
    if (typeof window.JSZip === 'undefined' && typeof JSZipLib === 'undefined') {
      throw new Error("JSZipの読み込みに失敗しました。ページを再読み込みしてください。");
    }

    // EPUBライブラリの確認（複数の場所をチェック）
    let epubConstructor = null;

    if (typeof ePub !== "undefined") {
      epubConstructor = ePub;
      console.log("Found ePub in global scope");
    } else if (typeof window.ePub !== "undefined") {
      epubConstructor = window.ePub;
      console.log("Found window.ePub");
    } else if (typeof window.EPUBJS !== "undefined" && typeof window.EPUBJS.ePub !== "undefined") {
      epubConstructor = window.EPUBJS.ePub;
      console.log("Found window.EPUBJS.ePub");
    }

    if (!epubConstructor) {
      console.error("EPUB.js library not found in any expected location");
      console.error("Available globals:", Object.keys(window).filter(k => k.toLowerCase().includes('epub')));
      throw new Error("EPUB.jsライブラリが読み込まれていません。\\n\\nページを再読み込みしてください。\\n\\n問題が解決しない場合は、開発者ツールのコンソールを確認してください。");
    }

    const arrayBuffer = await file.arrayBuffer();

    console.log("Creating ePub instance with constructor:", typeof epubConstructor);
    // EPUB.jsのための最終的なJSZip確認
    console.log("JSZip check before creating book:", {
      'window.JSZip type': typeof window.JSZip,
      'window.JSZip exists': !!window.JSZip,
      'window.JSZip.loadAsync': typeof window.JSZip?.loadAsync
    });

    // EPUB.jsがグローバルスコープでJSZipを見つけられるようにする
    // これは一部のEPUB.jsバージョンで必要
    if (typeof JSZip === 'undefined' && window.JSZip) {
      try {
        // グローバルスコープに注入を試みる（strictモードでは動作しない可能性あり）
        globalThis.JSZip = window.JSZip;
        console.log("Injected JSZip into globalThis");
      } catch (e) {
        console.warn("Could not inject JSZip into globalThis:", e);
      }
    }

    try {
      this.book = epubConstructor(arrayBuffer);
      console.log("ePub book instance created successfully");
    } catch (error) {
      console.error("Failed to create ePub instance:", error);

      // JSZipの問題の場合、エラーを抑制してリトライ
      if (error.message && (error.message.includes('JSZip') || error.message.includes('not defined'))) {
        console.warn("JSZip error detected, attempting to continue anyway...");
        console.error("JSZip diagnostic info:", {
          'window.JSZip': typeof window.JSZip,
          'globalThis.JSZip': typeof globalThis.JSZip,
          'JSZipLib available': !!JSZipLib,
          'JSZipLib.loadAsync': typeof JSZipLib?.loadAsync,
          'error': error.message
        });

        // JSZipエラーでもbookインスタンスが作成されている可能性があるため続行を試みる
        // EPUB.jsの古いバージョンではエラーが出ても動作することがある
        try {
          this.book = epubConstructor(arrayBuffer);
          console.log("Retry succeeded: ePub book instance created");
        } catch (retryError) {
          console.error("Retry failed:", retryError);
          // エラーは表示せず、bookインスタンスの存在を確認
          if (!this.book) {
            // 最後の手段：エラーを無視して続行を試みる
            console.warn("Creating book instance despite errors...");
            this.book = epubConstructor(arrayBuffer);
          }
        }
      } else {
        throw new Error(`EPUBファイルの解析に失敗しました: ${error.message}`);
      }
    }

    if (!this.book) {
      throw new Error("EPUBファイルの解析に失敗しました（bookオブジェクトがnull）。");
    }

    console.log("ePub instance created:", this.book);

    // book.readyを待つ
    await this.book.ready;
    console.log("Book ready");

    // 目次を取得
    let toc = [];
    try {
      await this.book.loaded.navigation;
      toc = this.book.navigation?.toc ?? [];
      console.log("TOC loaded:", toc.length, "items");
    } catch (err) {
      console.warn("目次の取得に失敗しました:", err);
    }
    this.toc = toc;

    // 縦書き・横書きを自動判別
    const detectedReading = await this.detectReadingDirectionFromBook();
    if (detectedReading?.pageDirection) {
      this.pageDirection = detectedReading.pageDirection;
      console.log("Detected page direction:", this.pageDirection);
    }
    if (this.preferredWritingMode) {
      this.writingMode = this.preferredWritingMode;
      console.log("Using preferred writing mode:", this.writingMode);
    } else if (detectedReading?.writingMode) {
      this.writingMode = detectedReading.writingMode;
      console.log("Detected writing mode:", this.writingMode);
    }

    if (this.viewer) {
      this.viewer.style.overflow = "hidden";
    }

    // テーマを事前適用
    this.updateEpubTheme();

    try {
      // 開始位置を一時保存（逐次パジネーションの初回完了時に使用）
      this._pendingStartLocation = startLocation;
      const pagination = await this.buildPagination();
      // buildPagination 内で既に初回表示されるが、完了時の念押し
      if (!pagination?.pages?.length) {
        throw new Error("EPUBのページ分割に失敗しました。");
      }

      const startPage = this.resolveStartPageIndex(startLocation, pagination.pages.length);
      this.pageController.setTotalPages(pagination.pages.length);
      this.pageController.goTo(startPage);

      // 初回のonReadyコールバック（メタデータと目次）
      if (!this._isInitialReadyCalled) {
        this._isInitialReadyCalled = true;
        this.onReady?.({
          metadata: this.book.package?.metadata,
          toc: this.toc,
        });
      }

      // locations生成は重い処理のため、ユーザー操作(検索)時にオンデマンドで実行する
      // （初期ロード時のメインスレッドブロックを回避）

      console.log("EPUB opened successfully");
    } catch (err) {
      console.error("EPUBの表示に失敗しました:", err);
      console.error("Error stack:", err.stack);
      throw new Error(`EPUBの表示に失敗しました: ${err.message}`);
    }
  }

  resolveStartPageIndex(startLocation, totalPages) {
    const maxIndex = Math.max(0, totalPages - 1);
    if (typeof startLocation === "number") {
      return Math.max(0, Math.min(startLocation, maxIndex));
    }
    if (startLocation && typeof startLocation === "object") {
      const directLocator = startLocation.location;
      const locator =
        directLocator &&
          typeof directLocator === "object" &&
          typeof directLocator.spineIndex === "number" &&
          typeof directLocator.segmentIndex === "number"
          ? directLocator
          : startLocation;
      if (
        typeof locator.spineIndex === "number" &&
        typeof locator.segmentIndex === "number"
      ) {
        const pageIndex = this.findPageContaining(
          locator.spineIndex,
          locator.segmentIndex,
          this.pagination?.pages ?? []
        );
        if (pageIndex >= 0) {
          return pageIndex;
        }
      }
      const explicitLocation = startLocation.location;
      if (typeof explicitLocation === "number") {
        return Math.max(0, Math.min(explicitLocation, maxIndex));
      }
      const percentage = startLocation.percentage;
      if (typeof percentage === "number") {
        const index = Math.round((percentage / 100) * totalPages) - 1;
        return Math.max(0, Math.min(index, maxIndex));
      }
    }
    return 0;
  }

  resolveStartPageIndexIfReady(startLocation, totalPages) {
    if (!startLocation || typeof startLocation !== "object") {
      return this.paginationComplete
        ? this.resolveStartPageIndex(startLocation, totalPages)
        : null;
    }
    const directLocator = startLocation.location;
    const locator =
      directLocator &&
        typeof directLocator === "object" &&
        typeof directLocator.spineIndex === "number" &&
        typeof directLocator.segmentIndex === "number"
        ? directLocator
        : null;
    if (locator) {
      const pageIndex = this.findPageContaining(
        locator.spineIndex,
        locator.segmentIndex,
        this.pagination?.pages ?? []
      );
      if (pageIndex >= 0) {
        return pageIndex;
      }
      return null;
    }
    return this.paginationComplete
      ? this.resolveStartPageIndex(startLocation, totalPages)
      : null;
  }

  isExternalLink(href) {
    if (!href) return false;
    return /^(https?:|mailto:|tel:|data:|blob:|ftp:)/i.test(href) || href.startsWith("//");
  }

  normalizeHrefPath(path) {
    if (!path) return "";
    const cleaned = path.split("?")[0].split("#")[0].trim();
    return cleaned.replace(/^\.\//, "");
  }

  resolveSpineIndexFromHref(href, fallbackSpineIndex = 0) {
    if (!href) return fallbackSpineIndex;
    const [pathPart] = href.split("#");
    const normalized = this.normalizeHrefPath(pathPart);
    if (!normalized) return fallbackSpineIndex;
    const directIndex = this.spineItems.findIndex((item) => item.href === normalized);
    if (directIndex >= 0) return directIndex;
    const matchIndex = this.spineItems.findIndex((item) =>
      item.href?.endsWith(`/${normalized}`) || item.href?.endsWith(normalized)
    );
    return matchIndex >= 0 ? matchIndex : fallbackSpineIndex;
  }

  getPaddings() {
    const width = this.viewer?.clientWidth || window.innerWidth;
    const height = this.viewer?.clientHeight || window.innerHeight;

    // 横: 現状維持 (幅の4% または 高さの5% の大きい方、最低16px)
    // これにより既存の「横幅」の感覚を維持します
    const hPad = Math.max(16, Math.round(width * 0.04), Math.round(height * 0.05));

    // 縦: 画面環境の95%を利用 -> 余白は合計5% (上下それぞれ2.5%)
    const vPad = Math.max(16, Math.round(height * 0.025));

    return { hPad, vPad };
  }

  getEdgePadding() {
    // 後方互換性のため残す（横パディングを返す）
    const { hPad } = this.getPaddings();
    return hPad;
  }

  getEpubPageLayoutValues() {
    const paddings = this.getPaddings();
    return {
      edgePadding: this.getEdgePadding(), // 後方互換性のため
      hPad: paddings.hPad,
      vPad: paddings.vPad,
      lineHeight: getReaderLineHeight(),
      maxWidthValue: this.getReaderMaxWidthValue(),
    };
  }

  applyEpubPageLayoutStyles(target, { edgePadding, hPad, vPad, lineHeight, maxWidthValue }) {
    if (!target) return;
    // 新しいパディング方式（vPad/hPadが指定されている場合）
    if (vPad !== undefined && hPad !== undefined) {
      target.style.padding = `${vPad}px ${hPad}px`; // 上下 左右
    } else {
      // 後方互換性
      target.style.padding = `${edgePadding}px`;
    }
    target.style.lineHeight = `${lineHeight}`;
    if (maxWidthValue) {
      target.style.maxWidth = maxWidthValue;
    } else {
      target.style.removeProperty("max-width");
    }
    target.style.margin = "0 auto";
    target.style.width = "100%";
    target.style.minHeight = "100%";
    target.style.boxSizing = "border-box";
  }

  getPaginationViewportMetrics() {
    const viewer = this.viewer || document.body;
    const viewportWidth = viewer?.clientWidth || window.innerWidth;
    const viewportHeight = viewer?.clientHeight || window.innerHeight;
    const layout = this.getEpubPageLayoutValues();
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.left = "-99999px";
    probe.style.top = "0";
    this.applyEpubPageLayoutStyles(probe, layout);
    viewer.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    const contentWidth =
      Number.isFinite(rect.width) && rect.width > 0
        ? rect.width
        : this.getEffectiveContentWidth(viewportWidth, layout.maxWidthValue);
    return {
      viewportWidth,
      viewportHeight,
      contentWidth,
      ...layout,
    };
  }

  computeSegmentIndexForFragment(htmlString, fragmentId) {
    if (!htmlString || !fragmentId) return 0;

    const doc = new DOMParser().parseFromString(htmlString, "text/html");
    const body = doc.body;
    const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(fragmentId) : fragmentId;
    const target =
      body.querySelector(`#${escapedId}`) ||
      body.querySelector(`[name="${escapedId}"]`);
    if (!target) return 0;

    const segments = [];
    const walker = doc.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName?.toLowerCase();
            if (tag === "img" || tag === "svg" || tag === "video" || tag === "iframe") {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        const length = text.length;
        let start = 0;
        while (start < length) {
          const end = Math.min(length, start + TEXT_SEGMENT_STEP);
          segments.push({ type: "text", node, start, end });
          start = end;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        segments.push({ type: "element", node });
      }
      node = walker.nextNode();
    }

    const index = segments.findIndex((segment) => target.contains(segment.node));
    return index >= 0 ? index : 0;
  }

  computeSegmentIndexForTextOffset(htmlString, targetOffset) {
    if (!htmlString || typeof targetOffset !== "number" || targetOffset < 0) return 0;

    const doc = new DOMParser().parseFromString(htmlString, "text/html");
    const body = doc.body;
    const segments = [];
    const walker = doc.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName?.toLowerCase();
            if (tag === "img" || tag === "svg" || tag === "video" || tag === "iframe") {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let textOffset = 0;
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        const length = text.length;
        let start = 0;
        while (start < length) {
          const end = Math.min(length, start + TEXT_SEGMENT_STEP);
          segments.push({
            type: "text",
            node,
            start,
            end,
            globalStart: textOffset + start,
            globalEnd: textOffset + end
          });
          start = end;
        }
        textOffset += length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        segments.push({ type: "element", node });
      }
      node = walker.nextNode();
    }

    if (!segments.length) return 0;

    const index = segments.findIndex(
      (segment) =>
        segment.type === "text" &&
        targetOffset >= segment.globalStart &&
        targetOffset < segment.globalEnd
    );
    if (index >= 0) return index;
    if (targetOffset >= textOffset) return segments.length - 1;
    return 0;
  }

  findPageContaining(spineIndex, segmentIndex, pages = this.pagination?.pages ?? []) {
    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      if (page.spineIndex !== spineIndex) continue;
      const start = Number(String(page.withinSpineOffset).replace("s:", ""));
      const next = pages[i + 1];
      const end =
        next && next.spineIndex === spineIndex
          ? Number(String(next.withinSpineOffset).replace("s:", ""))
          : Infinity;
      if (segmentIndex >= start && segmentIndex < end) {
        return i;
      }
    }
    return -1;
  }

  getPageLocator(pageIndex) {
    const pages = this.pagination?.pages ?? [];
    const page = pages[pageIndex];
    if (!page || page.spineIndex == null || page.spineIndex < 0) return null;
    const segmentIndex = Number(String(page.withinSpineOffset).replace("s:", ""));
    if (Number.isNaN(segmentIndex)) return null;
    return { spineIndex: page.spineIndex, segmentIndex };
  }

  getFallbackLocator() {
    const pages = this.pagination?.pages ?? [];
    const first = pages.find((page) => page.spineIndex >= 0);
    if (!first) return null;
    const segmentIndex = Number(String(first.withinSpineOffset).replace("s:", ""));
    if (Number.isNaN(segmentIndex)) return null;
    return { spineIndex: first.spineIndex, segmentIndex };
  }

  goToSegment(spineIndex, segmentIndex) {
    if (!this.pagination?.pages?.length) return;
    const pageIndex = this.findPageContaining(spineIndex, segmentIndex);
    if (pageIndex >= 0) {
      this.pageController.goTo(pageIndex);
    }
  }

  navigateToHref(href, fallbackSpineIndex = 0) {
    if (!href || !this.pagination?.pages?.length) return;
    const [pathPart, fragPart] = href.split("#");
    const spineIndex = this.resolveSpineIndexFromHref(pathPart || href, fallbackSpineIndex);
    let segmentIndex = 0;
    if (fragPart) {
      const spineItem = this.spineItems?.[spineIndex];
      segmentIndex = this.computeSegmentIndexForFragment(spineItem?.htmlString, fragPart);
    }

    let pageIndex = this.findPageContaining(spineIndex, segmentIndex);
    if (pageIndex < 0) {
      pageIndex = this.pagination.pages.findIndex((page) => page.spineIndex === spineIndex);
    }
    if (pageIndex >= 0) {
      this.pageController.goTo(pageIndex);
    }
  }

  interceptInternalLinks(container, page) {
    if (!container) return;
    const anchors = Array.from(container.querySelectorAll(DOM_SELECTORS.ANCHOR_WITH_HREF));
    if (!anchors.length) return;
    anchors.forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        const href = anchor.getAttribute("href");
        if (!href || this.isExternalLink(href)) return;
        event.preventDefault();
        event.stopPropagation();
        const fallbackSpineIndex =
          page?.spineIndex ?? this.pagination?.pages?.[this.currentPageIndex]?.spineIndex ?? 0;
        this.navigateToHref(href, fallbackSpineIndex);
      });
    });
  }

  renderEpubPage(index, pagination = this.pagination) {
    if (!pagination?.pages?.length || !this.viewer) return;
    const clampedIndex = Math.max(0, Math.min(index, pagination.pages.length - 1));
    const page = pagination.pages[clampedIndex];
    if (!page) return;
    this.currentPageIndex = clampedIndex;
    this.viewer.innerHTML = `<div class="epub-page"></div>`;
    this.pageContainer = this.viewer.querySelector(DOM_SELECTORS.EPUB_PAGE);
    if (!this.pageContainer) return;

    // --- [修正開始] ---
    // HTML内の src/srcset を data-src/data-srcset に一時退避させて 404 を防ぐ
    let safeHtml = page.htmlFragment || "";

    // src="..." を data-src="..." に置換 (blob: や data: で始まる解決済みパスは除外)
    safeHtml = safeHtml.replace(
      /(<img\s+[^>]*?)\bsrc\s*=\s*(["'])(?!blob:|data:)(.*?)\2/gi,
      '$1data-src=$2$3$2'
    );
    // srcset="..." を data-srcset="..." に置換
    safeHtml = safeHtml.replace(
      /(<img\s+[^>]*?)\bsrcset\s*=\s*(["'])(?!blob:|data:)(.*?)\2/gi,
      '$1data-srcset=$2$3$2'
    );

    this.pageContainer.innerHTML = safeHtml;
    // --- [修正終了] ---

    this.pageContainer.querySelectorAll(DOM_SELECTORS.IMAGE).forEach((img) => {
      // 画面環境の95%を利用し、小さい画像は拡大する設定
      img.style.width = "95%";       // 横95%強制
      img.style.height = "95vh";     // 縦95%強制
      img.style.objectFit = "contain"; // アスペクト比維持で枠内に収める
      img.style.margin = "0 auto";   // 中央寄せ
      img.style.display = "block";

      // 以前のmax設定は干渉するため解除
      img.style.maxWidth = "none";
      img.style.maxHeight = "none";
    });
    this.resolveImagesInRenderedPage(page);
    this.interceptInternalLinks(this.pageContainer, page);
    this.updateEpubTheme();
    this.injectImageZoom();
    this.updateProgressFromPagination(pagination.pages.length);
  }

  updateProgressFromPagination(totalPages) {
    if (!totalPages) return;
    const percentage = calculateProgressPercentage(this.currentPageIndex, totalPages);
    const locator = this.getPageLocator(this.currentPageIndex);
    const fallbackLocator = locator ? null : this.getFallbackLocator();
    this.onProgress?.({
      location: locator ?? fallbackLocator ?? null,
      percentage,
    });
  }

  async resolveImagesInRenderedPage(page) {
    if (!this.pageContainer || !this.resourceLoader) return;
    if (page?.spineIndex == null || page.spineIndex < 0) return;
    const spineItem = this.spineItems[page.spineIndex];
    if (!spineItem) return;
    const images = Array.from(this.pageContainer.querySelectorAll(DOM_SELECTORS.IMAGE_WITH_SVG));
    if (!images.length) return;
    await Promise.all(
      images.map(async (img) => {
        const tagName = img.tagName.toLowerCase();
        const isSvgImage = tagName === BOOK_TYPES.IMAGE;
        const attrName = isSvgImage
          ? (img.getAttribute("href") ? "href" : "xlink:href")
          : "src";

        // data-src もフォールバックとして取得
        const fallbackSrc = !isSvgImage
          ? (img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src"))
          : null;
        const src = img.getAttribute(attrName) || fallbackSrc;

        if (!src || src.startsWith("blob:")) return;
        try {
          const resolved = await this.resourceLoader(src, spineItem);
          if (resolved) {
            img.setAttribute(attrName, resolved);
            if (!isSvgImage && attrName !== "src") {
              img.setAttribute("src", resolved);
            }
            // [追加] 解決できたら一時退避用の属性を削除
            if (fallbackSrc) img.removeAttribute("data-src");
          }
          if (!isSvgImage) {
            // [修正] data-srcset にも対応
            let srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
            if (srcset) {
              const parts = await Promise.all(
                srcset.split(",").map(async (part) => {
                  const trimmed = part.trim();
                  if (!trimmed) return "";
                  const [url, descriptor] = trimmed.split(/\s+/, 2);
                  const resolvedUrl = await this.resourceLoader(url, spineItem);
                  return descriptor ? `${resolvedUrl} ${descriptor}` : resolvedUrl;
                })
              );
              img.setAttribute("srcset", parts.filter(Boolean).join(", "));
              // [追加] data-srcset を削除
              img.removeAttribute("data-srcset");
            }
          }
        } catch (error) {
          // ignore
        }
      })
    );
  }

  async buildPagination() {
    if (this.type !== BOOK_TYPES.EPUB || !this.book?.spine) {
      return null;
    }
    if (this.pagination) {
      console.log('[buildPagination] キャッシュ済みpaginationを返却 (pages:', this.pagination.pages?.length, ')');
      return this.pagination;
    }
    if (this.paginationPromise) {
      console.log('[buildPagination] 既存のpaginationPromiseを待機');
      return this.paginationPromise;
    }
    console.time('[buildPagination] total');
    console.log('[buildPagination] 開始 (spine items:', this.book.spine.length, ')');

    const paginationMetrics = this.getPaginationViewportMetrics();
    const viewportWidth = paginationMetrics.viewportWidth;
    const viewportHeight = paginationMetrics.viewportHeight;
    const maxWidthValue = paginationMetrics.maxWidthValue;
    const contentWidth = paginationMetrics.contentWidth;
    const baseFontSize = Number.parseFloat(
      window.getComputedStyle(this.viewer || document.body)?.fontSize
    ) || 16;
    const writingMode =
      this.writingMode === WRITING_MODES.VERTICAL
        ? CSS_WRITING_MODES.VERTICAL
        : CSS_WRITING_MODES.HORIZONTAL;

    // 新しいパディング方式（vPad/hPadが指定されている場合）
    const { hPad, vPad } = this.getPaddings();
    const edgePadding = `${vPad}px ${hPad}px`; // CSS形式 (上下 左右)

    this.paginationPromise = (async () => {
      this.paginationComplete = false;
      const { hPad, vPad } = this.getPaddings();
      const edgePadding = `${vPad}px ${hPad}px`;
      const baseFontSize = Number.parseFloat(
        window.getComputedStyle(this.viewer || document.body)?.fontSize
      ) || 16;
      const writingMode = this.writingMode === WRITING_MODES.VERTICAL
        ? CSS_WRITING_MODES.VERTICAL
        : CSS_WRITING_MODES.HORIZONTAL;

      // 初回表示用のスケルトン pagination オブジェクトを作成
      this.pagination = { pages: [] };

      this.resourceLoader = (async (url, spineItem) => {
        if (!url) return url;
        if (/^(https?:|data:|blob:)/i.test(url)) return url;
        const resolvedUrl = normalizeResourceKey(url, spineItem, this.book);
        if (this.resourceUrlCache.has(resolvedUrl)) return this.resourceUrlCache.get(resolvedUrl);

        try {
          const filename = url.split("/").pop();
          const candidateSeeds = [
            resolvedUrl,
            resolvedUrl?.replace(/^\//, ""),
            url,
            `OEBPS/${url}`,
            `OEBPS/${resolvedUrl}`,
            filename,
            `Images/${filename}`,
            `OEBPS/Images/${filename}`,
            safeDecodeURIComponent(url),
            safeDecodeURIComponent(resolvedUrl),
            safeEncodeURI(safeDecodeURIComponent(url)),
            safeEncodeURI(safeDecodeURIComponent(resolvedUrl)),
          ];
          const candidates = candidateSeeds
            .map((candidate) => normalizeResourceKey(candidate, spineItem, this.book))
            .filter((value, index, array) => value && array.indexOf(value) === index);

          let resourceItem = null;
          for (const candidate of candidates) {
            try {
              let item = this.book?.resources?.get?.(candidate);
              if (item && typeof item.then === 'function') item = await item;
              if (item) {
                resourceItem = item;
                break;
              }
            } catch (e) { }
          }

          if (!resourceItem && this.book?.package?.manifest) {
            try {
              const manifest = this.book.package.manifest;
              const targetFilename = normalizeResourceFilenameKey(filename);
              const resolvedComparisonKey = normalizeResourceComparisonKey(resolvedUrl, spineItem, null);
              const foundItem = Object.values(manifest).find(item => {
                if (!item.href) return false;
                const resolvedHref = this.book?.path?.resolve ? this.book.path.resolve(item.href) : item.href;
                const manifestKey = normalizeResourceComparisonKey(resolvedHref, spineItem, null);
                return manifestKey === resolvedComparisonKey || (targetFilename && manifestKey.endsWith("/" + targetFilename));
              });
              if (foundItem) {
                const resolvedHref = this.book?.path?.resolve ? this.book.path.resolve(foundItem.href) : foundItem.href;
                let item = this.book.resources.get(normalizeResourceKey(resolvedHref, spineItem, null));
                if (item && typeof item.then === 'function') item = await item;
                if (item) resourceItem = item;
              }
            } catch (e) { }
          }

          if (!resourceItem) {
            const zip = this.book?.archive?.zip;
            const zipFileKeyMap = this.getZipFileKeyMap();
            if (zip && zipFileKeyMap) {
              const zipKeys = [resolvedUrl, url, safeDecodeURIComponent(url), safeDecodeURIComponent(resolvedUrl)]
                .map((value) => normalizeZipEntryKey(value))
                .filter((value, index, array) => value && array.indexOf(value) === index);
              for (const key of zipKeys) {
                const lookupKey = normalizeZipEntryKey(key, { lowerCase: true });
                const realKey = zipFileKeyMap.get(key) ?? zipFileKeyMap.get(lookupKey);
                if (!realKey) continue;
                const fileEntry = zip.file(realKey);
                if (!fileEntry) continue;
                const blob = await fileEntry.async("blob");
                const objectUrl = URL.createObjectURL(blob);
                this.resourceUrlCache.set(resolvedUrl, objectUrl);
                return objectUrl;
              }
            }
          }

          if (!resourceItem) return url;
          if (typeof resourceItem === "string") return resourceItem;
          if (resourceItem instanceof Blob) {
            const objectUrl = URL.createObjectURL(resourceItem);
            this.resourceUrlCache.set(resolvedUrl, objectUrl);
            return objectUrl;
          }
          const type = resourceItem.mediaType || resourceItem.type || "";
          if (type.startsWith("image/") || type.includes("font")) {
            const blob = await resourceItem.getBlob();
            const objectUrl = URL.createObjectURL(blob);
            this.resourceUrlCache.set(resolvedUrl, objectUrl);
            return objectUrl;
          }
          if (resourceItem.getText) return await resourceItem.getText();
          if (resourceItem.getBlob) {
            const blob = await resourceItem.getBlob();
            const objectUrl = URL.createObjectURL(blob);
            this.resourceUrlCache.set(resolvedUrl, objectUrl);
            return objectUrl;
          }
          return url;
        } catch (error) {
          console.error("Failed to load resource:", resolvedUrl, error);
          return url;
        }
      });
      this.spineItems = [];

      // パジネーター初期化 (spineItems は後で追加される)
      this.paginator = new EpubPaginator([], this.resourceLoader, {
        viewportWidth: paginationMetrics.viewportWidth,
        viewportHeight: paginationMetrics.viewportHeight,
        contentWidth: paginationMetrics.contentWidth,
        maxWidth: maxWidthValue,
        fontSize: baseFontSize,
        lineHeight: paginationMetrics.lineHeight,
        writingMode,
        padding: edgePadding,
      });

      // 以前のパジネーション実行があれば中断
      if (this.currentPaginationRun) {
        this.currentPaginationRun.cancelled = true;
      }
      const run = { cancelled: false };
      this.currentPaginationRun = run;

      // 逐次読み込みループ
      const progressiveGen = this.paginator.paginateProgressive(run);
      let isFirstChapterDone = false;
      let spineIndex = 0;

      // Spineの項目を1つずつロードしてパジネーションに渡す
      while (spineIndex < this.book.spine.length) {
        const item = this.book.spine.get(spineIndex);
        if (item) {
          try {
            await item.load(this.book.load.bind(this.book));
            const doc = item.document || item.contents?.document;
            const htmlString = doc?.body?.innerHTML ?? "";
            if (htmlString.trim()) {
              const newItem = {
                id: item.idref || item.id || `spine-${spineIndex}`,
                href: item.href,
                htmlString,
              };
              this.spineItems.push(newItem);
              this.paginator.spineItems.push(newItem);

              // 逐次計算の実行
              const result = await progressiveGen.next();
              // 中断チェック
              if (run.cancelled) {
                console.log("Pagination cancelled during loop.");
                return null;
              }
              if (result.value) {
                this.pagination.pages = result.value.pages;
                this.pageController.setTotalPages(this.pagination.pages.length);

                // 第1チャプターが完了したら即座に表示を開始
                if (!isFirstChapterDone) {
                  isFirstChapterDone = true;
                  // ローディング解除と初期表示
                  const startPage = this.resolveStartPageIndexIfReady(
                    this._pendingStartLocation,
                    this.pagination.pages.length
                  );
                  if (startPage !== null) {
                    this.pageController.goTo(startPage);
                  }

                  // メタデータと目次を通知（初回のみ、またはリパジネーション時は必要に応じて）
                  if (!this._isInitialReadyCalled) {
                    this._isInitialReadyCalled = true;
                    this.onReady?.({
                      metadata: this.book.package?.metadata,
                      toc: this.toc,
                    });
                  }
                } else {
                  // 2回目以降は現在のページがずれないように調整が必要な場合があるが、
                  // 基本的には pages が増えるだけなので、progress 表示などの更新を行う
                  this.updateProgressFromPagination(this.pagination.pages.length);
                }
              }
              if (result.done) break;
            }
          } catch (error) {
            console.warn("Failed to load spine item for pagination:", error);
          } finally {
            if (item.unload) item.unload();
          }
        }
        spineIndex++;
      }

      // 中断チェック
      if (run.cancelled) return null;

      // 最終的な後処理（カバーページ追加など）
      await this.addCoverPageIfNeeded(this.pagination);
      this.pageController.setTotalPages(this.pagination.pages.length);
      this.paginationComplete = true;
      console.timeEnd('[buildPagination] total');
      console.log('[buildPagination] 完了 (pages:', this.pagination.pages.length, ')');
      return this.pagination;
    })();

    try {
      return await this.paginationPromise;
    } finally {
      this.paginationPromise = null;
    }
  }

  async openImageBook(file, startPage = 0, bookType = null) {
    this.resetReaderState();
    this.toc = [];
    void bookType;
    this.imageArchiveSize = file?.size ?? 0;
    this.emitLoadingUpdate({
      phase: READER_LOADING_PHASES.ARCHIVE_INIT,
      status: READER_LOADING_STATUSES.START,
    });
    const handler = await createArchiveHandler(file);
    this.emitLoadingUpdate({
      phase: READER_LOADING_PHASES.ARCHIVE_INIT,
      status: READER_LOADING_STATUSES.COMPLETE,
    });
    this.archiveHandler = handler;
    // 画像書庫として扱う
    this.type = BOOK_TYPES.IMAGE;
    let images = [];

    try {
      const archiveLabel = handler.getArchiveLabel();
      console.log(`Processing ${archiveLabel} file: ${file.name}`);

      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.ARCHIVE_LIST,
        status: READER_LOADING_STATUSES.START,
      });
      const imageEntries = await handler.listImageEntries();
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.ARCHIVE_LIST,
        status: READER_LOADING_STATUSES.COMPLETE,
        current: imageEntries.length,
        total: imageEntries.length,
      });
      console.log(`Filtered ${imageEntries.length} image entries from ${archiveLabel}`);

      if (imageEntries.length === 0) {
        console.error("No image files found in archive.");
        throw new Error("画像が見つかりませんでした。アーカイブ内に画像ファイル（PNG, JPEG, GIF, WebP, AVIF, BMP）が含まれているか確認してください。");
      }

      images = imageEntries.map(({ path, entry }) => ({ path, entry }));

      if (!images.length) {
        throw new Error("画像が見つかりませんでした。対応フォーマット: PNG, JPEG, GIF, WebP, AVIF, BMP");
      }

      // 階層対応 + ファイル名順に統一してソート
      images.sort((a, b) => {
        const normalize = (path) => path.replace(/\\/g, "/");
        const aPath = normalize(a.path);
        const bPath = normalize(b.path);

        // パス全体で自然順ソート（階層含む）
        return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: "base" });
      });

      console.log('Sorted image paths:', images.slice(0, 5).map(img => img.path));

      this.imageEntries = images;
      this.imagePages = new Array(images.length).fill(null);
      this.imagePageErrors = new Array(images.length).fill(null);

      const memoryStrategy = getMemoryStrategy();
      const preloadCount = Math.min(
        memoryStrategy?.imagePreloadCount ?? MEMORY_STRATEGY.imagePreloadCount,
        images.length
      );
      console.log(`Preloading ${preloadCount} images to object URLs...`);
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.IMAGE_PRELOAD,
        status: READER_LOADING_STATUSES.START,
        current: 0,
        total: preloadCount,
      });

      for (let index = 0; index < preloadCount; index += 1) {
        await this.convertImageAtIndex(index, { reportError: true });
        this.emitLoadingUpdate({
          phase: READER_LOADING_PHASES.IMAGE_PRELOAD,
          status: READER_LOADING_STATUSES.PROGRESS,
          current: index + 1,
          total: preloadCount,
        });
      }

      this.imageIndex = Math.min(startPage, this.imagePages.length - 1);
      const loadedCount = this.imagePages.filter((page) => page !== null).length;
      console.log(`Preloaded ${loadedCount} images successfully`);

      if (loadedCount === 0) {
        await this.convertImageAtIndex(this.imageIndex, { reportError: true });
        if (!this.imagePages[this.imageIndex]) {
          console.error('All preloaded images failed to convert to object URLs');
          throw new Error("画像の読み込みに失敗しました。最初のページの変換に失敗しました。");
        }
      }

      this.renderImagePage();
      this.onReady?.({
        metadata: { title: file.name, creator: "画像書籍" },
        toc: [],
      });
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.READY,
        status: READER_LOADING_STATUSES.COMPLETE,
        current: this.imageIndex + 1,
        total: this.imagePages.length,
      });
    } catch (error) {
      console.error("Error opening image book:", error);
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.ARCHIVE_INIT,
        status: READER_LOADING_STATUSES.ERROR,
      });
      throw new Error(`画像書籍の読み込みに失敗しました: ${error.message}`);
    }
  }

  async convertImageAtIndex(index, { reportError } = {}) {
    if (!this.imageEntries.length) return null;
    if (this.imagePages[index]) return this.imagePages[index];
    if (this.imagePageErrors[index]) return null;

    const image = this.imageEntries[index];
    if (!image) return null;

    try {
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.IMAGE_CONVERT,
        status: READER_LOADING_STATUSES.START,
        current: index + 1,
        total: this.imageEntries.length,
      });
      const handler = this.archiveHandler;
      if (!handler) {
        throw new Error("アーカイブハンドラが初期化されていません。");
      }

      const blob = await handler.getFileBlob(image.path);
      if (!blob || blob.size === 0) {
        throw new Error("画像データが空です。");
      }

      const objectUrl = URL.createObjectURL(blob);
      this.imagePages[index] = objectUrl;
      this.manageImageCache(index);
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.IMAGE_CONVERT,
        status: READER_LOADING_STATUSES.COMPLETE,
        current: index + 1,
        total: this.imageEntries.length,
      });
      return objectUrl;
    } catch (error) {
      const pageNumber = index + 1;
      const message = `画像変換に失敗しました（${pageNumber}ページ目: ${image.path}）`;
      console.error(message, error);
      this.imagePageErrors[index] = message;
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.IMAGE_CONVERT,
        status: READER_LOADING_STATUSES.ERROR,
        current: index + 1,
        total: this.imageEntries.length,
      });
      if (reportError) {
        this.showImageConvertError(message);
      }
      return null;
    }
  }

  getImageCacheSize() {
    const memoryStrategy = getMemoryStrategy();
    const cacheSize = memoryStrategy?.CACHE_SIZE ?? MEMORY_STRATEGY.CACHE_SIZE;
    const largeCacheSize = memoryStrategy?.LARGE_CACHE_SIZE ?? MEMORY_STRATEGY.LARGE_CACHE_SIZE;
    const largeFileThreshold = memoryStrategy?.LARGE_FILE_THRESHOLD ?? MEMORY_STRATEGY.LARGE_FILE_THRESHOLD;
    if (this.imageArchiveSize >= largeFileThreshold) {
      return largeCacheSize;
    }
    return cacheSize;
  }

  manageImageCache(currentIndex) {
    if (!this.isImageBook() || !this.imagePages.length) return;
    const cacheSize = this.getImageCacheSize();
    if (!Number.isFinite(cacheSize) || cacheSize < 0) return;

    const minIndex = Math.max(0, currentIndex - cacheSize);
    const maxIndex = Math.min(this.imagePages.length - 1, currentIndex + cacheSize);

    this.imagePages.forEach((page, index) => {
      if (index >= minIndex && index <= maxIndex) return;
      if (typeof page === "string") {
        URL.revokeObjectURL(page);
      }
      if (page !== null) {
        this.imagePages[index] = null;
      }
    });
  }

  showImageConvertError(message) {
    if (this.imageElement) {
      this.imageElement.removeAttribute("src");
      this.imageElement.alt = message;
      this.imageElement.title = message;
    }
    if (typeof alert === "function") {
      alert(message);
    }
  }

  renderImagePage() {
    if (!this.imagePages.length) return;
    const targetIndex = this.imageIndex;

    // RTL モードクラスを適用
    if (this.imageViewer) {
      if (this.imageReadingDirection === READING_DIRECTIONS.RTL) {
        this.imageViewer.classList.add(UI_CLASSES.RTL_MODE);
      } else {
        this.imageViewer.classList.remove(UI_CLASSES.RTL_MODE);
      }
    }

    // 現在のページが横長かどうかチェック（非同期だが、すでにプリロード済みと仮定または簡易チェック）
    // 横長判定: プリロードされた画像データから判定するのは難しいが、
    // Imageオブジェクトを一時生成してチェックするか、キャッシュ済みの情報を利用する。
    // ここでは描画時に判定して動的にモード切替相当の処理を行うアプローチをとる。

    // 見開きモードの場合
    if (this.imageViewMode === IMAGE_VIEW_MODES.SPREAD && this.imageViewer) {
      // 横長チェックは renderSpreadPage 内で実施し、必要なら単ページ表示にフォールバック
      // ただし描画遅延を防ぐため、Imageオブジェクトでサイズ取得を試みる
      this.checkWideAndRender(targetIndex);
    } else {
      // 単ページモード
      this.renderSinglePageWithStyle(targetIndex);
    }
  }

  async checkWideAndRender(index) {
    // 横長判定も renderSpreadPage 内で行うため、直接呼び出す
    await this.renderSpreadPage(index);
  }

  // ---------------------------------------------------------
  // [修正] 画像データを安全に取得するヘルパー（自動ロード機能付き）
  // ---------------------------------------------------------
  async getImageData(index) {
    if (index < 0 || index >= this.imagePages.length) return null;

    // ★追加: データがまだロードされていない（nullの）場合は、ここで変換処理を実行する
    if (!this.imagePages[index] && !this.imagePageErrors[index]) {
      // convertImageAtIndex はアーカイブから画像を取得し、this.imagePages[index] にセットします
      await this.convertImageAtIndex(index);
    }

    // imagePages[index] が Promise (アーカイブ読込待ち) の可能性があるため await する
    try {
      const src = await this.imagePages[index];
      return src;
    } catch (e) {
      console.error("Image load failed:", e);
      return null;
    }
  }

  // ---------------------------------------------------------
  // [修正] 画像サイズ判定（キャッシュ機能付き）
  // ---------------------------------------------------------
  async getPageDimensions(index) {
    // キャッシュがあればそれを返す（高速化）
    if (this.pageDimensionCache[index]) {
      return this.pageDimensionCache[index];
    }

    const src = await this.getImageData(index);
    if (!src) return { w: 0, h: 0 };

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = { w: img.naturalWidth, h: img.naturalHeight };
        // サイズをキャッシュに保存
        this.pageDimensionCache[index] = size;
        resolve(size);
      };
      img.onerror = () => {
        resolve({ w: 0, h: 0 });
      };
      img.src = src;
    });
  }

  async isImageWide(index) {
    // 範囲外チェック
    if (index < 0 || index >= this.imagePages.length) return false;

    // 画像データの取得
    const src = this.imagePages[index];
    if (!src) return false;

    // 画像サイズを取得するヘルパー
    const getSize = (url) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = url;
    });

    const currentSize = await getSize(src);

    // 判定ロジック: 単純に横幅が高さより大きいかどうか
    // (以前の 1.5倍ルールは廃止し、明確な「横長」定義を使用)
    return currentSize.w > currentSize.h;
  }

  renderSinglePageWithStyle(index, isWideSpread = false) {
    if (!this.imageElement) return;

    this.imageElement.src = this.imagePages[index] || "";
    this.imageElement.style.display = '';

    // 単ページでも画像書庫ならクリック無効化
    if (this.type !== BOOK_TYPES.EPUB) {
      this.imageElement.onclick = null;
      this.imageElement.style.pointerEvents = "none";
    }

    // 見開きコンテナ削除
    if (this.imageViewer) {
      const spreadContainer = this.imageViewer.querySelector(DOM_SELECTORS.SPREAD_CONTAINER);
      if (spreadContainer) spreadContainer.remove();
    }

    this.syncZoomedClass();
    this.updateTransform();

    this.loadImagePage(index);
    // プリロード
    const memoryStrategy = getMemoryStrategy();
    const preloadAheadCount = memoryStrategy.imagePreloadAheadCount;
    if (index + preloadAheadCount < this.imagePages.length) {
      this.loadImagePage(index + preloadAheadCount);
    }

    if (!isWideSpread) {
      this.updateProgress(index, false);
    }
  }

  updateProgress(targetIndex, isWideSpread) {
    if (this.pageIndicator) {
      this.pageIndicator.textContent = `${targetIndex + 1} / ${this.imagePages.length}`;
    }
    this.onProgress?.({
      location: targetIndex,
      percentage: calculateProgressPercentage(targetIndex, this.imagePages.length),
    });
  }

  // ---------------------------------------------------------
  // [修正] 見開き描画メソッド
  // ---------------------------------------------------------
  async renderSpreadPage(targetIndex) {
    if (!this.imageViewer || !this.imagePages.length) return;

    // 元の画像を非表示
    this.imageElement.style.display = 'none';

    // --- 修正箇所 ---
    // 以前のコードではここで this.imageViewer 自体のクラスを書き換えてしまうバグがありました
    let container = this.imageViewer.querySelector(DOM_SELECTORS.SPREAD_CONTAINER);
    if (!container) {
      // コンテナが存在しない場合は新規作成して追加する
      container = document.createElement('div');
      container.className = 'spread-container';
      this.imageViewer.appendChild(container);
    }

    // 画像書庫ならクリック無効
    if (this.type !== BOOK_TYPES.EPUB) {
      container.style.pointerEvents = "none";
    }

    this.syncZoomedClass();

    // 描画開始前に中身を空にする（プログレスバー移動時の残像防止）
    container.innerHTML = '';

    // 1. 現在のページの画像データとサイズを取得
    const page1Src = await this.getImageData(targetIndex);
    if (!page1Src) {
      // 画像がない（範囲外など）
      return;
    }

    // サイズ判定
    const isWide = await this.isImageWide(targetIndex);

    if (isWide) {
      // --- ワイド画像 (1枚表示) ---
      const img = document.createElement('img');
      img.src = page1Src;
      img.className = 'spread-page wide'; //.wide -> max-width: 100%
      if (this.type !== BOOK_TYPES.EPUB) img.style.pointerEvents = "none";
      container.appendChild(img);

      this.currentSpreadStep = 1;

    } else {
      // --- 通常画像 (ペア表示を試みる) ---

      // 次のページがあるか確認
      const nextIndex = targetIndex + 1;
      let showTwoPages = false;
      let page2Src = null;

      if (nextIndex < this.imagePages.length) {
        // 次のページのサイズも確認
        const isNextWide = await this.isImageWide(nextIndex);
        if (!isNextWide) {
          // 次も縦長ならペア成立
          page2Src = await this.getImageData(nextIndex);
          if (page2Src) {
            showTwoPages = true;
          }
        }
      }

      if (showTwoPages) {
        // 2枚表示
        this.currentSpreadStep = 2;

        // 【修正】CSS側(.rtl-mode)で表示順序を反転させるため、
        // JS側では常に DOM順序 = [現在ページ, 次ページ] として生成する。
        // これにより、RTL時は CSS flex-direction 等の効果で [次ページ] [現在ページ] と表示される。
        const leftImgSrc = page1Src;
        const rightImgSrc = page2Src;

        const leftImg = document.createElement('img');
        leftImg.src = leftImgSrc;
        leftImg.className = 'spread-page spread-left';
        if (this.type !== BOOK_TYPES.EPUB) leftImg.style.pointerEvents = "none";
        container.appendChild(leftImg);

        const rightImg = document.createElement('img');
        rightImg.src = rightImgSrc;
        rightImg.className = 'spread-page spread-right';
        if (this.type !== BOOK_TYPES.EPUB) rightImg.style.pointerEvents = "none";
        container.appendChild(rightImg);

      } else {
        // 1枚表示（ペア相手がいない、または次がワイド）
        const img1 = document.createElement('img');
        img1.src = page1Src;
        img1.className = 'spread-page single-view';
        if (this.type !== BOOK_TYPES.EPUB) img1.style.pointerEvents = "none";
        container.appendChild(img1);

        this.currentSpreadStep = 1;
      }
    }

    // プリロード
    const memoryStrategy = getMemoryStrategy();
    const preloadStep = this.currentSpreadStep || memoryStrategy.imagePreloadAheadCount;
    if (targetIndex + preloadStep < this.imagePages.length) {
      // 次の画像データだけ取得しておく（キャッシュ乗る）
      this.getPageDimensions(targetIndex + preloadStep);
    }

    this.updateProgress(targetIndex, isWide);
    this.updateTransform();
  }

  setImageViewMode(mode) {
    if (mode !== IMAGE_VIEW_MODES.SINGLE && mode !== IMAGE_VIEW_MODES.SPREAD) return;
    this.imageViewMode = mode;
    this.renderImagePage();
  }

  toggleImageViewMode() {
    this.setImageViewMode(
      this.imageViewMode === IMAGE_VIEW_MODES.SINGLE ? IMAGE_VIEW_MODES.SPREAD : IMAGE_VIEW_MODES.SINGLE
    );
    return this.imageViewMode;
  }

  // 左開き/右開き切替
  setImageReadingDirection(direction) {
    if (direction !== READING_DIRECTIONS.LTR && direction !== READING_DIRECTIONS.RTL) return;
    this.imageReadingDirection = direction;
    this.renderImagePage();
  }

  toggleImageReadingDirection() {
    this.setImageReadingDirection(
      this.imageReadingDirection === READING_DIRECTIONS.LTR ? READING_DIRECTIONS.RTL : READING_DIRECTIONS.LTR
    );
    return this.imageReadingDirection;
  }

  // ズーム切替（画像書庫用）
  toggleImageZoom() {
    return this.toggleZoom();
  }

  // ズーム解除
  resetImageZoom() {
    this.setZoomLevel(this.getZoomConfig().min);
  }

  isImageBook() {
    return this.type === BOOK_TYPES.IMAGE;
  }

  // 現在のページが横長かどうかを確認（Navigation用）
  async isCurrentPageWideSync() {
    if (!this.imagePages[this.imageIndex]) return false;
    // 既にキャッシュされていれば早い。キャッシュがなければ非同期になるが
    // ここでは簡易的に直近の判定結果を使いたいところ。
    // 一旦、毎回チェックする。
    return await this.isImageWide(this.imageIndex);
  }

  async loadImagePage(index) {
    const currentToken = ++this.imageLoadToken;
    if (this.imagePages[index]) {
      if (currentToken === this.imageLoadToken) {
        this.imageElement.src = this.imagePages[index];
        this.imageElement.alt = "ページ画像";
        this.imageElement.title = "";
      }
      return;
    }

    const objectUrl = await this.convertImageAtIndex(index, { reportError: true });
    if (!objectUrl) return;
    if (currentToken === this.imageLoadToken) {
      this.imageElement.src = objectUrl;
      this.imageElement.alt = "ページ画像";
      this.imageElement.title = "";
    }
  }



  async prev(step) {
    if (this.imageZoomed) return; // ズーム中はページめくり無効

    // EPUBの場合はPageControllerを使用
    if (this.type === BOOK_TYPES.EPUB) {
      this.pageController?.prev();
      return;
    }

    if (this.render && this.render.prev && !this.isImageBook()) {
      this.render.prev();
      return;
    }

    let targetIndex;
    if (this.imageViewMode === IMAGE_VIEW_MODES.SPREAD) {
      // 戻る場合、戻り先のページが「ワイド」かどうかを事前にチェックする必要がある
      // 1つ前のページ(index-1)がワイドなら、そこは「1枚表示」だったはずなので -1 戻る
      // ワイドでないなら、そこは「2枚表示の右側(または左側)」だったはずなので -2 戻る
      // ただし、もし step が指定されている場合(1など)はどうするか？
      // prev(1) は「1枚戻る」を意図している。

      if (step !== undefined && step === 1) {
        targetIndex = Math.max(0, this.imageIndex - 1);
      } else {
        // スマート「戻る」判定
        // 1. 1つ前が横長なら「1枚表示」だった -> -1
        // 2. 1つ前が縦長の場合、そのさらに前(2つ前)とペアだったか確認
        //    ペア条件: 2つ前が存在し、かつ2つ前も縦長。 -> -2
        //    そうでなければ(2つ前が横長、あるいは存在しない) -> -1

        const prevIndex = this.imageIndex - 1;
        if (prevIndex < 0) {
          targetIndex = 0;
        } else {
          const isPrevWide = await this.isImageWide(prevIndex);
          if (isPrevWide) {
            targetIndex = prevIndex; // -1
          } else {
            // 1つ前は縦長。ペアか？
            const prevPrevIndex = this.imageIndex - 2;
            if (prevPrevIndex < 0) {
              targetIndex = prevIndex; // -1 (ペア相手なし)
            } else {
              const isPrevPrevWide = await this.isImageWide(prevPrevIndex);
              if (!isPrevPrevWide) {
                // 2つ前も縦長 -> ペア成立
                targetIndex = prevPrevIndex; // -2
              } else {
                // 2つ前は横長 -> 1つ前はペア相手に選ばれず単独表示(または次の横長とはペア組まない)だったはず
                // ※ renderSpreadPageのロジックでは「現在=縦, 次=横」なら「現在」は単独表示になる。
                // つまり prevPrev(Wide) -> prev(Tall) -> current(Tall) の並びなら
                // prevPrev は単独。 prev は current とペアにはならない(prevPrevの一部ではない)。
                // 待てよ、 prevPrev(Wide) | prev(Tall) | current...
                // prevPrevの次は prev。 prevPrevは単独表示。
                // 次に prev を表示する際、 prev(Tall) の次は current(Tall) なので prev+current ペアになるはず...？
                // ああ、ここが重要。「prevPrevがWide」だった場合、そこでページ区切り。
                // 次のページは prev から始まる。
                // prev(Tall) + next(Tall) ならペアになる。
                // なので、 prevPrev が Wide なら、 prev は新しいペアの先頭になれる。
                // つまり prev と prev+1 (current) がペアだった可能性がある。
                // しかし、今「current」にいるということは、current が表示先頭。
                // つまり prev は表示されていなかった。
                // ということは prev は current とペアではなかった（currentが先頭だから）。
                // もし prev と current がペアなら、表示は prev を先頭にしているはず。
                // なので current が表示先頭なら、 prev は「前のspread」に含まれていた。
                //
                // パターン整理:
                // [P-2(T), P-1(T)] -> 今 [C(..)] : 戻るなら P-2 (-2)
                // [P-2(W)] -> [P-1(T)] -> 今 [C(..)] (※P-1の次がCならペアのはずだが、Cが先頭ということはP-1は孤立？)
                // ありえるケース:
                //   P-1(T), C(W) ... P-1は単独表示(step=1)。次はC。 -> 今 C。戻るなら P-1 (-1)。
                //   つまり「P-1とペアになる相手」は C なのだが、CがWideだからペア解消された。
                //   この場合 P-1 は単独。
                //
                // 判定ロジック再考:
                // 「P-1 を先頭として renderSpreadPage した場合、 step はいくつか？」を判定すれば確実。
                // renderSpreadPage(P-1) をシミュレート。
                //   P-1 is Wide? No.
                //   Check P-1's Next (P-0 a.k.a current).
                //   If current is Wide?
                //     Yes -> P-1 step is 1. => 戻り先は P-1 (-1).
                //     No (current is Tall) -> P-1 step is 2. => 戻り先は P-1 (-2)? いや、P-1から始まって step2なら P-1, current が表示される。
                //     今 current にいるなら、本来 P-1 が表示されているべきペアだったのでは？
                //     ユーザーが手動で current に飛んだ場合などはありえるが、順送りなら P-1, current と表示されるはず。
                //     しかし「戻る」ボタンを押す状況では、今は current が先頭で見えている。
                //     つまり [P-2, P-1] の次ページとして current が来ていると仮定するのが自然。
                //     (P-1 と current がペアなら、今 current 単独で見ているのは変だが、
                //      もし P-1(T) + current(W) なら P-1単独 -> current単独 となるので、今 current 閲覧中はありえる)
                //
                // 結論:
                //   P-1(T) の場合:
                //     Check P-2.
                //     If P-2 exists AND P-2 is Tall -> They form a pair [P-2, P-1]. Return -2.
                //     Else (P-2 is Wide or None) -> P-1 stands alone [P-1]. Return -1.

                targetIndex = prevPrevIndex; // -2
              }
            }
          }
        }
      }
    } else {
      targetIndex = Math.max(0, this.imageIndex - (step || 1));
    }
    await this.goTo(targetIndex);
    this.manageImageCache(this.imageIndex);
  }

  async next(step) {
    if (this.imageZoomed) return; // ズーム中はページめくり無効

    // EPUBの場合はPageControllerを使用
    if (this.type === BOOK_TYPES.EPUB) {
      this.pageController?.next();
      return;
    }

    if (this.render && this.render.next && !this.isImageBook()) {
      this.render.next();
      return;
    }

    let targetIndex;
    if (this.imageViewMode === IMAGE_VIEW_MODES.SPREAD) {
      // 表示時に計算したステップ数分だけ進む
      // (ワイド表示なら+1、通常なら+2)
      // 引数 step が指定されている場合(1など)はそれを優先するか、
      // あるいは step が未指定(undefined)の場合のみ currentSpreadStep を使う。
      // UIからは next() (undefined) か next(1) が呼ばれる。

      const actualStep = step !== undefined ? step : (this.currentSpreadStep || 1);
      targetIndex = Math.min(this.imagePages.length - 1, this.imageIndex + actualStep);
    } else {
      targetIndex = Math.min(this.imagePages.length - 1, this.imageIndex + (step || 1));
    }
    await this.goTo(targetIndex);
    this.manageImageCache(this.imageIndex);
  }

  addBookmark(label = "しおり", { deviceId, deviceColor } = {}) {
    if (this.type === BOOK_TYPES.EPUB) {
      if (!this.pagination?.pages?.length) return null;
      const percentage = calculateProgressPercentage(this.currentPageIndex, this.pagination.pages.length);
      const locator = this.getPageLocator(this.currentPageIndex) || this.getFallbackLocator();
      const cfi = locator ? `${locator.spineIndex}:${locator.segmentIndex}` : null;
      const bookmark = {
        label,
        location: locator,
        cfi,
        percentage,
        createdAt: Date.now(),
        bookType: BOOK_TYPES.EPUB, // bookType として保存
      };
      if (deviceId !== undefined) bookmark.deviceId = deviceId;
      if (deviceColor !== undefined) bookmark.deviceColor = deviceColor;
      return bookmark;
    }

    // 画像書庫の場合
    const cfi = `image:${this.imageIndex}`;
    const bookmark = {
      label,
      location: this.imageIndex, // imageIndex を location として保存
      cfi,
      percentage: calculateProgressPercentage(this.imageIndex, this.imagePages.length),
      createdAt: Date.now(),
      bookType: this.type, // "image"
    };
    if (deviceId !== undefined) bookmark.deviceId = deviceId;
    if (deviceColor !== undefined) bookmark.deviceColor = deviceColor;
    return bookmark;
  }

  async goTo(bookmark) {
    // 0は有効なインデックスなので、null/undefinedのみ除外
    if (bookmark === null || bookmark === undefined) return;

    // 数値が渡された場合（next/prevからの呼び出しなど）は、現在のモードに合わせて移動
    if (typeof bookmark === "number") {
      if (this.type === BOOK_TYPES.EPUB) {
        this.pageController.goTo(bookmark);
      } else {
        // 画像書庫の場合、範囲チェックをして移動
        this.imageIndex = Math.max(0, Math.min(bookmark, this.imagePages.length - 1));
        this.renderImagePage();
        this.manageImageCache(this.imageIndex);
      }
      return;
    }

    // 以下、しおりオブジェクト（{ bookType: ..., location: ... }）の場合の処理

    // bookType または type で判定（互換性のため両方サポート）。
    // bookmarkオブジェクトにtypeが無い場合は現在のthis.typeをフォールバックとして使用
    const bookType = bookmark.bookType || bookmark.type || this.type;

    if (bookType === BOOK_TYPES.EPUB) {
      if (
        bookmark.location &&
        typeof bookmark.location === "object" &&
        typeof bookmark.location.spineIndex === "number" &&
        typeof bookmark.location.segmentIndex === "number"
      ) {
        this.goToSegment(bookmark.location.spineIndex, bookmark.location.segmentIndex);
        return;
      }
      if (typeof bookmark.location === "number" && this.pagination?.pages?.length) {
        this.pageController.goTo(bookmark.location);
        return;
      }
      if (typeof bookmark.percentage === "number" && this.pagination?.pages?.length) {
        const index = Math.round((bookmark.percentage / 100) * this.pagination.pages.length) - 1;
        this.pageController.goTo(index);
      }
    } else if (bookType !== BOOK_TYPES.EPUB) {
      // 画像書庫: location は imageIndex
      const targetIndex = typeof bookmark.location === "number"
        ? bookmark.location
        : Math.round((bookmark.percentage / 100) * this.imagePages.length) - 1;
      this.imageIndex = Math.max(0, Math.min(targetIndex, this.imagePages.length - 1));
      this.renderImagePage();
      this.manageImageCache(this.imageIndex);
    }
  }

  applyTheme(theme) {
    this.theme = theme;
    this.updateEpubTheme();
    document.body.dataset.theme = theme;
  }

  async applyFontSize(fontSize) {
    if (!Number.isFinite(fontSize)) return;
    this.fontSize = fontSize;
    if (this.viewer) {
      this.viewer.style.fontSize = `${fontSize}px`;
    }
    if (this.type !== BOOK_TYPES.EPUB) {
      return;
    }
    this.pagination = null;
    await this.buildPagination();
    this.pageController.goTo(this.currentPageIndex);
  }

  async applyReadingDirection(writingMode, pageDirection) {
    // もし既に設定が同じなら何もしない（無限ループ防止）
    if (this.writingMode === writingMode && this.pageDirection === pageDirection) {
      console.log("[Reader] applyReadingDirection: No change detected, skipping repagination",
        { current: { wm: this.writingMode, pd: this.pageDirection }, requested: { wm: writingMode, pd: pageDirection } });
      return;
    }
    console.log("[Reader] applyReadingDirection: 設定変更あり → 再パジネーション実行",
      { current: { wm: this.writingMode, pd: this.pageDirection }, requested: { wm: writingMode, pd: pageDirection } });
    console.time('[applyReadingDirection] buildPagination');

    if (pageDirection) {
      this.pageDirection = pageDirection;
    }
    if (writingMode) {
      this.writingMode = writingMode;
      this.preferredWritingMode = writingMode;
    }

    if (this.type !== BOOK_TYPES.EPUB) {
      return;
    }

    try {
      console.log("[Reader] applyReadingDirection:", { writingMode, pageDirection });

      // 実行中のパジネーションを中断
      if (this.currentPaginationRun) {
        this.currentPaginationRun.cancelled = true;
      }
      this.paginationPromise = null;
      this.pagination = null;

      // 再計算を開始（非同期に待つ必要はないが、完了を待つことで確実に表示を更新する）
      const pagination = await this.buildPagination();
      console.timeEnd('[applyReadingDirection] buildPagination');
      if (pagination) {
        this.pageController.goTo(this.currentPageIndex);
      }
    } catch (error) {
      console.timeEnd('[applyReadingDirection] buildPagination');
      console.error("[Reader] Failed to apply reading direction:", error);
    }
  }

  applyWritingModeToContents() {
    if (this.type !== BOOK_TYPES.EPUB) return;
    const isVertical = this.writingMode === WRITING_MODES.VERTICAL;
    const writingMode = isVertical ? CSS_WRITING_MODES.VERTICAL : CSS_WRITING_MODES.HORIZONTAL;
    const textOrientation = isVertical ? "mixed" : "initial";
    const contentDirection = READING_DIRECTIONS.LTR;
    const target = this.pageContainer || this.viewer;
    if (!target) return;
    target.style.setProperty("writing-mode", writingMode);
    target.style.setProperty("text-orientation", textOrientation);
    target.style.setProperty("direction", contentDirection);
    target.style.setProperty("text-align", "start");
    target.style.setProperty("text-align-last", "start");
  }

  updateEpubTheme() {
    if (this.type !== BOOK_TYPES.EPUB) return;
    const isVertical = this.writingMode === WRITING_MODES.VERTICAL;
    const contentDirection = READING_DIRECTIONS.LTR;

    console.log("[updateEpubTheme] Applying theme:", {
      isVertical,
      theme: this.theme,
      writingMode: this.writingMode
    });

    // 縦書き・横書きともに縦スクロールで表示するため、
    // writing-modeはそのまま適用するが、レイアウトは縦スクロール用に最適化
    if (this.viewer) {
      this.viewer.style.background = "var(--reader-bg)";
      this.viewer.style.color = "var(--reader-text)";
      this.viewer.style.width = "100%";
      this.viewer.style.height = "100%";
    }
    if (this.pageContainer) {
      const layout = this.getEpubPageLayoutValues();
      this.applyEpubPageLayoutStyles(this.pageContainer, layout);
    }
    this.applyWritingModeToContents();
  }

  async addCoverPageIfNeeded(pagination) {
    if (!pagination?.pages?.length || !this.book) return;
    const coverUrl = await this.resolveCoverUrl();
    if (!coverUrl) return;
    const htmlFragment = `
      <div class="epub-cover">
        <img src="${coverUrl}" alt="Cover" />
      </div>
    `;
    pagination.pages.unshift({
      spineIndex: -1,
      withinSpineOffset: "cover",
      htmlFragment,
      estimatedCharCount: htmlFragment.length,
    });
  }

  async resolveCoverUrl() {
    if (typeof this.book.coverUrl === "function") {
      try {
        const url = await this.book.coverUrl();
        if (url) return url;
      } catch (error) {
        // ignore
      }
    }
    try {
      const coverPath = await this.book.loaded?.cover;
      if (coverPath && this.resourceLoader) {
        return await this.resourceLoader(coverPath);
      }
    } catch (error) {
      // ignore
    }
    return null;
  }

  async detectReadingDirectionFromBook() {
    if (!this.book?.spine) return null;
    const metadataDirection = this.book.package?.metadata?.direction;
    const spineDirection = this.book.spine?.direction;
    const pageDirection = metadataDirection || spineDirection || null;
    let writingMode = null;

    const spineItem = this.book.spine.get(0);
    if (spineItem) {
      try {
        await spineItem.load(this.book.load.bind(this.book));
        const doc = spineItem.document || spineItem.contents?.document;
        if (doc) {
          const inlineStyles = [
            doc.documentElement?.getAttribute("style"),
            doc.body?.getAttribute("style"),
          ]
            .filter(Boolean)
            .join(" ");
          const styleText = Array.from(doc.querySelectorAll(DOM_SELECTORS.STYLE))
            .map((style) => style.textContent || "")
            .join(" ");
          const combined = `${inlineStyles} ${styleText}`.toLowerCase();
          if (combined.includes(`writing-mode: ${WRITING_MODES.VERTICAL}`)) {
            writingMode = WRITING_MODES.VERTICAL;
          } else if (combined.includes(`writing-mode: ${WRITING_MODES.HORIZONTAL}`)) {
            writingMode = WRITING_MODES.HORIZONTAL;
          }
        }
      } catch (error) {
        console.warn("Failed to detect writing mode from spine:", error);
      }
    }

    return {
      writingMode,
      pageDirection,
    };
  }

  injectImageZoom() {
    /* Image zoom on click is disabled per user request
    if (this.type === BOOK_TYPES.EPUB) {
      this.viewer?.querySelectorAll(DOM_SELECTORS.IMAGE).forEach((img) => {
        img.style.cursor = "zoom-in";
        this.bindElementZoomHandlers(img, () => img.src);
      });
      return;
    }
    if (!this.rendition) return;
    */
  }

  bindImageZoomHandlers() {
    if (!this.imageElement || this.imageZoomBound) return;
    this.imageZoomBound = true;
    this.bindElementZoomHandlers(this.imageElement, () => this.imagePages[this.imageIndex]);
  }

  bindElementZoomHandlers(element, getSrc) {
    if (!element || element.dataset.zoomBound === "true") return;
    element.dataset.zoomBound = "true";
    let longPressTimer = null;
    let longPressFired = false;
    const startPress = (event) => {
      if (event.type === "mousedown" && event.button !== 0) return;
      longPressFired = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        this.onImageZoom?.(getSrc());
      }, 500);
    };
    const endPress = () => {
      clearTimeout(longPressTimer);
    };
    element.addEventListener("mousedown", startPress);
    element.addEventListener("touchstart", startPress, { passive: true });
    element.addEventListener("mouseup", endPress);
    element.addEventListener("mouseleave", endPress);
    element.addEventListener("touchend", endPress);
    element.addEventListener("touchcancel", endPress);
    element.addEventListener("click", () => {
      if (longPressFired) {
        longPressFired = false;
        return;
      }
      this.onImageZoom?.(getSrc());
    });
  }

  // ========================================
  // ズーム・パン・ドラッグ制御
  // ========================================

  getActiveViewer() {
    // 画像モードなら imageViewer
    if (this.isImageBook()) {
      return this.imageViewer;
    }
    // EPUBなら viewer
    return this.viewer;
  }

  getZoomTarget() {
    if (this.isImageBook()) {
      const spreadContainer = this.imageViewer?.querySelector(DOM_SELECTORS.SPREAD_CONTAINER);
      if (this.imageViewMode === IMAGE_VIEW_MODES.SPREAD && spreadContainer) {
        return spreadContainer;
      }
      return this.imageElement;
    }
    return this.viewer;
  }

  getZoomConfig() {
    const slider = typeof document !== 'undefined'
      ? document.getElementById(DOM_IDS.ZOOM_SLIDER)
      : null;
    const min = slider?.min ? parseFloat(slider.min) : 1.0;
    const max = slider?.max ? parseFloat(slider.max) : 3.0;
    const step = slider?.step ? parseFloat(slider.step) : 0.1;
    return {
      min: Number.isFinite(min) ? min : 1.0,
      max: Number.isFinite(max) ? max : 3.0,
      step: Number.isFinite(step) ? step : 0.1,
    };
  }

  isZoomMode() {
    return this.imageZoomed;
  }

  setupZoomSlider() {
    if (typeof document === 'undefined') return;
    const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
    if (slider) {
      // 既存のリスナーを削除できないため、クローンして置換（簡易的な方法）
      // またはそのまま追加（重複に注意）
      // ここでは初回のみ実行されると想定
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.setZoomLevel(val);
      });
    }
  }

  /**
   * イベントがリーダー表示領域内で発生したか判定
   * event.targetではなく座標で判定し、透明な上位レイヤー要素の影響を受けない
   */
  isEventInReaderArea(event) {
    const reader = document.getElementById(DOM_IDS.FULLSCREEN_READER);
    if (!reader) return false;
    const rect = reader.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  bindPanEvents() {
    if (typeof window === 'undefined') return;

    this.panStartX = 0;
    this.panStartY = 0;

    const startDrag = (x, y) => {
      // ズームモードでないならドラッグしない
      if (!this.imageZoomed || this.isPinching) return;

      this.isDragging = true;
      this.lastMouseX = x;
      this.lastMouseY = y;

      // カーソル変更
      document.body.classList.add(UI_CLASSES.IS_DRAGGING);
      const active = this.getActiveViewer();
      if (active) active.style.cursor = 'grabbing';
    };

    const moveDrag = (x, y) => {
      if (!this.isDragging || this.isPinching) return;

      const dx = x - this.lastMouseX;
      const dy = y - this.lastMouseY;

      this.panX += dx;
      this.panY += dy;

      this.lastMouseX = x;
      this.lastMouseY = y;

      this.updateTransform();
    };

    const endDrag = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.classList.remove(UI_CLASSES.IS_DRAGGING);
      const active = this.getActiveViewer();
      if (active) active.style.cursor = '';
    };

    // マウスイベント（リーダー領域内ならドラッグ開始）
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.isEventInReaderArea(e)) {
        startDrag(e.clientX, e.clientY);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        e.preventDefault();
        moveDrag(e.clientX, e.clientY);
      }
    });

    document.addEventListener('mouseup', endDrag);

    // タッチイベント
    const touchOpts = { passive: false };

    document.addEventListener('touchstart', (e) => {
      if (this.imageZoomed && this.isEventInReaderArea(e)) {
        if (e.touches.length === 1) {
          e.preventDefault();
          startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
      }
    }, touchOpts);

    document.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length === 1 && !this.isPinching) {
        e.preventDefault();
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, touchOpts);

    document.addEventListener('touchend', endDrag);
  }

  bindZoomEvents() {
    if (typeof window === 'undefined') return;

    // ホイールズーム（documentレベルで捕捉）
    document.addEventListener('wheel', (event) => {
      const inArea = this.isEventInReaderArea(event);
      if (!inArea) return;

      const { step } = this.getZoomConfig();

      // ズームモード中はCtrlキー不要でホイールズーム有効
      // ズームモード外ではCtrl+ホイールでのみズーム開始
      if (!this.imageZoomed && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // 手前に回す(deltaY > 0) = ズームアウト、奥に回す(deltaY < 0) = ズームイン
      const direction = event.deltaY > 0 ? -1 : 1;
      const wheelStep = step * 2;
      const nextScale = this.zoomScale + direction * wheelStep;

      this.setZoomLevel(nextScale, { x: event.clientX, y: event.clientY });
    }, { passive: false });

    // ピンチズーム（documentレベルで捕捉）
    const touchOpts = { passive: false };

    document.addEventListener('touchstart', (event) => {
      if (!this.isEventInReaderArea(event)) return;

      if (event.touches.length === 2) {
        event.preventDefault();
        this.isPinching = true;
        this.isDragging = false;
        this.pinchStartDistance = this.getPinchDistance(event.touches);
        this.pinchStartScale = this.zoomScale;
        this.pinchCenterStart = this.getPinchCenter(event.touches);
      }
    }, touchOpts);

    document.addEventListener('touchmove', (event) => {
      if (this.isPinching && event.touches.length === 2) {
        event.preventDefault();
        const distance = this.getPinchDistance(event.touches);
        const center = this.getPinchCenter(event.touches);

        if (this.pinchStartDistance > 0) {
          const scale = this.pinchStartScale * (distance / this.pinchStartDistance);
          this.setZoomLevel(scale, center);
        }
      }
    }, touchOpts);

    document.addEventListener('touchend', (event) => {
      if (event.touches.length < 2) {
        this.isPinching = false;
        this.pinchStartDistance = 0;
      }
    }, touchOpts);
  }

  getPinchCenter(touches) {
    const [t1, t2] = touches;
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  getPinchDistance(touches) {
    const [touch1, touch2] = touches;
    if (!touch1 || !touch2) return 0;
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.hypot(dx, dy);
  }

  syncZoomedClass() {
    // CSSクラスの同期のみ（imageZoomedフラグはtoggleZoom()で制御）
    if (this.imageViewer) {
      this.imageViewer.classList.toggle(UI_CLASSES.ZOOMED, this.imageZoomed);
    }
  }

  setZoomLevel(scale, center) {
    const oldScale = this.zoomScale;
    this.zoomScale = parseFloat(scale);
    const body = document.body;
    const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
    const { min, max } = this.getZoomConfig();

    // 範囲制限
    if (this.zoomScale < min) this.zoomScale = min;
    if (this.zoomScale > max) this.zoomScale = max;

    // 中心点指定がある場合のパン補正 (Zoom towards center)
    // center: { x, y } (clientX, clientY)
    if (center && Math.abs(this.zoomScale - oldScale) > 0.001) {
      let active = this.getActiveViewer();
      const target = this.getZoomTarget();
      // EPUBなど、ターゲット自体がViewerとして返される場合は親要素をコンテナ（ビューポート）とする
      if (active === target && active?.parentElement) {
        active = active.parentElement;
      }

      if (active) {
        const rect = active.getBoundingClientRect();
        // コンテナ内の相対座標
        const mouseX = center.x - rect.left;
        const mouseY = center.y - rect.top;

        // 計算式: newPan = mousePos - (mousePos - oldPan) * (newScale / oldScale)
        // transform-origin: 0 0 前提
        const ratio = this.zoomScale / oldScale;
        this.panX = mouseX - (mouseX - this.panX) * ratio;
        this.panY = mouseY - (mouseY - this.panY) * ratio;
      }
    } else if (Math.abs(this.zoomScale - oldScale) > 0.001 && !center && this.zoomScale > min) {
      // 中心指定がない場合は画面中央を基準にする
      let active = this.getActiveViewer();
      const target = this.getZoomTarget();
      if (active === target && active?.parentElement) {
        active = active.parentElement;
      }

      if (active) {
        const rect = active.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const ratio = this.zoomScale / oldScale;
        this.panX = centerX - (centerX - this.panX) * ratio;
        this.panY = centerY - (centerY - this.panY) * ratio;
      }
    }

    // スライダーの値を同期
    if (slider) slider.value = this.zoomScale;

    // ズームモードの入り切りはここでは行わない（toggleZoom()で制御）
    this.syncZoomedClass();
    this.onImageZoom?.(this.imageZoomed, this.zoomScale);
    this.updateTransform();
  }

  updateTransform() {
    if (this.pendingTransform) return;
    this.pendingTransform = true;
    this.transformFrame = requestAnimationFrame(() => {
      this.pendingTransform = false;
      this.applyTransform();
    });
  }

  applyTransform() {
    const target = this.getZoomTarget();
    if (!target) return;

    this.clampPan();
    if (this.zoomScale <= this.getZoomConfig().min) {
      target.style.transform = '';
      this.syncZoomSlider();
      return;
    }

    const transformValue = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomScale})`;
    target.style.transform = transformValue;
    this.syncZoomSlider();
  }

  syncZoomSlider() {
    const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
    if (!slider) return;
    const currentValue = parseFloat(slider.value);
    if (!Number.isFinite(currentValue) || currentValue !== this.zoomScale) {
      slider.value = this.zoomScale;
    }
  }

  clampPan() {
    let container = this.getActiveViewer();
    const target = this.getZoomTarget();
    if (!container || !target) return;

    // EPUBなど、ターゲット自体がViewerの場合は親要素をコンテナとする
    if (container === target && container?.parentElement) {
      container = container.parentElement;
    }

    const containerRect = container.getBoundingClientRect();

    // ターゲットの元サイズ（scale=1.0）を取得
    // target.offsetWidth / offsetHeight は transform の影響を受けない（レイアウトサイズ）
    // ただし、getBoundingClientRect は transform の影響を受けるので注意
    const targetWidth = target.offsetWidth;
    const targetHeight = target.offsetHeight;

    // スケール後のサイズ
    const scaledWidth = targetWidth * this.zoomScale;
    const scaledHeight = targetHeight * this.zoomScale;

    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // 水平方向
    if (scaledWidth <= containerWidth) {
      // 画面より小さい場合は中央寄せ
      this.panX = (containerWidth - scaledWidth) / 2;
    } else {
      // 画面より大きい場合、端までスクロールできるようにする
      // 左上(0,0) ～ 右下(containerWidth - scaledWidth, containerHeight - scaledHeight)
      const minPanX = containerWidth - scaledWidth;
      const maxPanX = 0;
      this.panX = Math.min(maxPanX, Math.max(minPanX, this.panX));
    }

    // 垂直方向
    if (scaledHeight <= containerHeight) {
      this.panY = (containerHeight - scaledHeight) / 2;
    } else {
      const minPanY = containerHeight - scaledHeight;
      const maxPanY = 0;
      this.panY = Math.min(maxPanY, Math.max(minPanY, this.panY));
    }
  }

  toggleZoom() {
    const { min } = this.getZoomConfig();
    const body = document.body;
    const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
    const backdrop = document.querySelector('#floatOverlay .float-backdrop');

    if (this.imageZoomed) {
      // ズームモードOFF: スケール・パンをリセット
      this.imageZoomed = false;
      this.zoomScale = min;
      this.panX = 0;
      this.panY = 0;
      body.classList.remove(UI_CLASSES.IS_ZOOMED);
      if (slider) slider.value = min;
      if (backdrop) backdrop.style.pointerEvents = '';
      this.syncZoomedClass();
      this.onImageZoom?.(this.imageZoomed, this.zoomScale);
      this.updateTransform();
      return false;
    }

    // ズームモードON: 1倍のまま開始（スライダーで拡大を促す）
    this.imageZoomed = true;
    body.classList.add(UI_CLASSES.IS_ZOOMED);
    if (backdrop) backdrop.style.pointerEvents = 'none';
    this.syncZoomedClass();
    this.onImageZoom?.(this.imageZoomed, this.zoomScale);
    return true;
  }
}
