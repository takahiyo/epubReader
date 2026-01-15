import { EpubPaginator } from "../src/reader/epubPaginator.js";

const TEXT_SEGMENT_STEP = 24; // epubPaginator.js の MIN_TEXT_UNIT_STEP と合わせる

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
    onReady,
    onImageZoom,
  }) {
    this.viewer = document.getElementById(viewerId);
    this.imageViewer = document.getElementById(imageViewerId);
    this.imageElement = document.getElementById(imageElementId);
    this.pageIndicator = document.getElementById(pageIndicatorId);
    this.onProgress = onProgress;
    this.onReady = onReady;
    this.onImageZoom = onImageZoom;
    this.rendition = null;
    this.book = null;
    this.type = null; // "epub" | "zip" | "rar"
    this.imagePages = [];
    this.imageIndex = 0;
    this.imageEntries = [];
    this.imagePageErrors = [];
    this.imageLoadToken = 0;
    this.imageViewMode = "single"; // "single" | "spread"
    this.imageReadingDirection = "ltr"; // "ltr" = 左開き, "rtl" = 右開き
    this.imageZoomed = false;
    this.theme = "dark";
    this.writingMode = "horizontal";
    this.pageDirection = "ltr";
    this.preferredWritingMode = null;
    this.paginator = null;
    this.pagination = null;
    this.paginationPromise = null;
    this.currentPageIndex = 0;
    this.usingPaginator = false;
    this.resourceUrlCache = new Map();
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
    this.type = null; // "epub" | "zip" | "rar"
    this.imagePages = [];
    this.imageIndex = 0;
    this.imageEntries = [];
    this.imagePageErrors = [];
    this.imageLoadToken = 0;
    this.imageViewMode = "single"; // "single" | "spread"
    this.imageReadingDirection = "ltr"; // "ltr" = 左開き, "rtl" = 右開き
    this.imageZoomed = false;
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
    await this.loadScript("./assets/vendor/jszip.min.js");
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

  async loadJSZipFromCdn(isPlaceholder) {
    const sources = [
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js",
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
      console.log("Loading node-unrar-js from esm.sh...");

      // JS: ブラウザ互換に変換してくれる esm.sh を使用
      const JS_URL = "https://esm.sh/node-unrar-js@2.0.2";
      // WASM: 静的ファイルは jsdelivr から取得
      const WASM_URL = "https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/dist/js/unrar.wasm";

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
    const existing = document.querySelector(`script[data-reader-src="${src}"]`);
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
    this.type = "epub";
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
      const pagination = await this.buildPagination();
      if (!pagination?.pages?.length) {
        throw new Error("EPUBのページ分割に失敗しました。");
      }

      const startPage = this.resolveStartPageIndex(startLocation, pagination.pages.length);
      this.pageController.setTotalPages(pagination.pages.length);
      this.pageController.goTo(startPage);

      // 初回のonReadyコールバック（メタデータと目次）
      this.onReady?.({
        metadata: this.book.package?.metadata,
        toc: this.toc,
      });

      // locations生成（検索の補助用）- バックグラウンドで実行
      console.log("Generating locations for search support...");
      this.book.locations.generate(1600).then(() => {
        console.log("Locations generated successfully:", this.book.locations.total);
      }).catch((err) => {
        console.warn("目次の生成に失敗しました:", err);
      });

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

  getEdgePadding() {
    const width = this.viewer?.clientWidth || window.innerWidth;
    const height = this.viewer?.clientHeight || window.innerHeight;
    const inlinePadding = Math.round(width * 0.04);
    const blockPadding = Math.round(height * 0.05);
    return Math.max(16, inlinePadding, blockPadding);
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
    const anchors = Array.from(container.querySelectorAll("a[href]"));
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
    this.pageContainer = this.viewer.querySelector(".epub-page");
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

    this.pageContainer.querySelectorAll("img").forEach((img) => {
      img.style.maxWidth = "100%";
      img.style.maxHeight = "70vh";
      img.style.display = "block";
      img.style.margin = "1em auto";
      img.style.objectFit = "contain";
    });
    this.resolveImagesInRenderedPage(page);
    this.interceptInternalLinks(this.pageContainer, page);
    this.updateEpubTheme();
    this.injectImageZoom();
    this.updateProgressFromPagination(pagination.pages.length);
  }

  updateProgressFromPagination(totalPages) {
    if (!totalPages) return;
    const percentage = Math.round(((this.currentPageIndex + 1) / totalPages) * 100);
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
    const images = Array.from(this.pageContainer.querySelectorAll("img, svg image"));
    if (!images.length) return;
    await Promise.all(
      images.map(async (img) => {
        const tagName = img.tagName.toLowerCase();
        const isSvgImage = tagName === "image";
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
    if (this.type !== "epub" || !this.book?.spine) {
      return null;
    }
    if (this.pagination) {
      return this.pagination;
    }
    if (this.paginationPromise) {
      return this.paginationPromise;
    }

    const viewportWidth = this.viewer?.clientWidth || window.innerWidth;
    const viewportHeight = this.viewer?.clientHeight || window.innerHeight;
    const baseFontSize = Number.parseFloat(
      window.getComputedStyle(this.viewer || document.body)?.fontSize
    ) || 16;
    const writingMode = this.writingMode === "vertical" ? "vertical-rl" : "horizontal-tb";
    const edgePadding = this.getEdgePadding();

    this.paginationPromise = (async () => {
      const spineItems = [];

      for (let i = 0; i < this.book.spine.length; i += 1) {
        const item = this.book.spine.get(i);
        if (!item) continue;
        try {
          await item.load(this.book.load.bind(this.book));
          const doc = item.document || item.contents?.document;
          const htmlString = doc?.body?.innerHTML ?? "";
          if (htmlString.trim()) {
            spineItems.push({
              id: item.idref || item.id || `spine-${i}`,
              href: item.href,
              htmlString,
            });
          }
        } catch (error) {
          console.warn("Failed to load spine item for pagination:", error);
        } finally {
          if (item.unload) {
            item.unload();
          }
        }
      }

      if (!spineItems.length) {
        this.pagination = null;
        return null;
      }

      if (this.paginator?.destroy) {
        this.paginator.destroy();
      }
      const resolveResourceUrl = (url, spineItem) => {
        if (!url || /^(https?:|data:|blob:)/i.test(url)) {
          return url;
        }

        // Try book.resolve first (ePub.js built-in)
        if (this.book?.resolve) {
          try {
            const resolved = this.book.resolve(url, spineItem?.href);
            if (resolved) return resolved;
          } catch (error) {
            // ignore and fallback
          }
        }

        // Manual resolution with ".." normalization
        if (spineItem?.href) {
          // Get base directory from spine item href
          const baseParts = spineItem.href.split("/").slice(0, -1);
          const base = baseParts.join("/");

          // Combine base and url
          const combined = base ? `${base}/${url}` : url;

          // Normalize backslashes to forward slashes
          const normalized = combined.replace(/\\/g, "/");

          // Remove query and hash
          const withoutQuery = normalized.split(/[?#]/)[0];

          // Use URL constructor to normalize ".." and "."
          try {
            // Prepend a dummy base to use URL API
            const dummyBase = "http://dummy";
            const fullUrl = new URL(withoutQuery, dummyBase);
            // Extract pathname and remove leading slash
            const result = fullUrl.pathname.replace(/^\//, "");
            return result;
          } catch (error) {
            // Fallback: manual ".." removal
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
        }

        return url;
      };

      const resourceLoader = async (url, spineItem) => {
        if (!url) return url;
        if (/^(https?:|data:|blob:)/i.test(url)) {
          return url;
        }

        const resolvedUrl = resolveResourceUrl(url, spineItem);

        if (this.resourceUrlCache.has(resolvedUrl)) {
          return this.resourceUrlCache.get(resolvedUrl);
        }

        try {
          // Try multiple candidate keys to find the resource
          const candidates = [
            resolvedUrl,
            resolvedUrl.replace(/^\//, ""), // without leading slash
            `/${resolvedUrl}`, // with leading slash
            decodeURIComponent(resolvedUrl), // decoded
            encodeURI(resolvedUrl), // encoded
            url // original
          ];

          let resourceItem = null;
          let foundKey = null;

          for (const candidate of candidates) {
            try {
              const item = this.book?.resources?.get?.(candidate);
              if (item) {
                resourceItem = item;
                foundKey = candidate;
                break;
              }
            } catch (e) {
              // try next candidate
            }
          }

          if (resourceItem?.then) {
            resourceItem = await resourceItem;
          }

          if (!resourceItem) {
            console.warn("[EPUB Resource] Not found:", {
              originalUrl: url,
              resolvedUrl: resolvedUrl,
              spineHref: spineItem?.href,
              triedCandidates: candidates
            });
            return url;
          }
          if (typeof resourceItem === "string") {
            return resourceItem;
          }
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
          if (resourceItem.getText) {
            return await resourceItem.getText();
          }
          if (resourceItem.getBlob) {
            const blob = await resourceItem.getBlob();
            const objectUrl = URL.createObjectURL(blob);
            this.resourceUrlCache.set(resolvedUrl, objectUrl);
            return objectUrl;
          }
          console.warn("Unknown resource API:", resourceItem);
          return url;
        } catch (error) {
          console.error("Failed to load resource:", resolvedUrl, error);
          return url;
        }
      };

      this.spineItems = spineItems;
      this.resourceLoader = resourceLoader;
      this.paginator = new EpubPaginator(spineItems, resourceLoader, {
        viewportWidth,
        viewportHeight,
        fontSize: baseFontSize,
        lineHeight: 1.8,
        writingMode,
        padding: edgePadding,
      });

      const pagination = await this.paginator.paginate();
      await this.addCoverPageIfNeeded(pagination);
      this.pagination = pagination;
      this.pageController.setTotalPages(pagination.pages.length);
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
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isRar = bookType === "rar" || ext === "rar" || ext === "cbr" || file.type === "application/vnd.rar" || file.type === "application/x-rar-compressed" || file.type === "application/x-cbr";
    // type: "zip" | "rar" として設定
    this.type = isRar ? "rar" : "zip";
    const buffer = await file.arrayBuffer();
    let images = [];

    try {
      console.log(`Processing ${isRar ? 'RAR' : 'ZIP/CBZ'} file: ${file.name}`);
      console.log(`File size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

      if (isRar) {
        console.log("Opening RAR file...");
        const { createExtractorFromData } = await this.ensureUnrar();
        const extractor = await createExtractorFromData({ data: new Uint8Array(buffer) });

        // 1. getFileListの結果から fileHeaders を取得して配列に変換
        // 修正: v2では戻り値が { arcHeader, fileHeaders } となっているため .fileHeaders にアクセスする
        const list = extractor.getFileList();
        const headers = [...list.fileHeaders];

        console.log(`Found ${headers.length} entries in RAR`);

        // デバッグ: 最初の数エントリを表示
        if (headers.length > 0) {
          console.log('Sample RAR entries:', headers.slice(0, 3).map(h => ({
            name: h?.name ?? h?.fileName ?? h?.filename ?? h?.path,
            isDir: h?.flags?.directory ?? h?.isDirectory ?? h?.directory
          })));
        }

        const imageHeaders = headers.filter((header) => {
          const name = header?.name ?? header?.fileName ?? header?.filename ?? header?.path ?? "";
          if (!name) return false;

          const normalized = name.replace(/\\/g, "/");
          const fileName = normalized.split("/").pop() ?? "";
          const isDir = header?.flags?.directory ?? header?.isDirectory ?? header?.directory ?? false;

          if (fileName.startsWith('.') || fileName.startsWith('__') || fileName.toLowerCase() === 'thumbs.db') {
            return false;
          }

          const isImage = /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(fileName);
          return !isDir && isImage;
        });

        console.log(`Filtered ${imageHeaders.length} image entries`);

        if (imageHeaders.length === 0) {
          console.error('No image files found in RAR. Available files:', headers.map(h => h?.name ?? h?.fileName));
          throw new Error("画像が見つかりませんでした。アーカイブ内に画像ファイル（PNG, JPEG, GIF, WebP, AVIF, BMP）が含まれているか確認してください。");
        }

        const imageNames = imageHeaders
          .map((header) => header?.name ?? header?.fileName ?? header?.filename ?? header?.path ?? "")
          .filter(Boolean);

        console.log('Extracting images:', imageNames);

        // 2. extractメソッドを使用し、結果から files を取得して配列に変換
        // 修正: v2では戻り値が { arcHeader, files } となっているため .files にアクセスする
        const extracted = extractor.extract({ files: imageNames });
        const extractedFiles = [...extracted.files];

        images = extractedFiles
          .map((item) => {
            const header = item?.fileHeader ?? item?.header ?? item;
            const name = header?.name ?? header?.fileName ?? header?.filename ?? item?.name ?? "";

            // 3. データ取得ロジックをv2に対応 (item.extraction が Uint8Array の場合がある)
            let data = item?.extraction;
            if (data && data.data) {
              // 古い構造へのフォールバック
              data = data.data;
            } else if (item?.data) {
              data = item.data;
            }

            if (!data) {
              console.warn(`Failed to extract data for: ${name}`);
              return null;
            }

            return { path: name, data };
          })
          .filter((entry) => entry !== null && entry.path && entry.data);

        console.log(`Successfully extracted ${images.length} images from RAR`);
      } else {
        console.log("Opening ZIP/CBZ file...");
        const JSZipLib = await this.ensureJSZip();
        const zip = await JSZipLib.loadAsync(buffer);

        const entries = [];
        zip.forEach((path, entry) => {
          // ディレクトリを除外
          if (!entry.dir) {
            entries.push({ path, entry });
          }
        });

        console.log(`Found ${entries.length} files in ZIP`);

        // デバッグ: 最初の数エントリを表示
        if (entries.length > 0) {
          console.log('Sample ZIP entries:', entries.slice(0, 5).map(e => e.path));
        }

        images = entries
          .filter(({ path }) => {
            const normalized = path.replace(/\\/g, "/");
            const fileName = normalized.split("/").pop() ?? normalized;

            // 隠しファイルを除外
            if (fileName.startsWith('.') || fileName.startsWith('__') || fileName.toLowerCase() === 'thumbs.db') {
              return false;
            }

            const isImage = /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(fileName);

            if (isImage) {
              console.log(`✓ Including: ${path}`);
            }

            return isImage;
          })
          .map(({ path, entry }) => ({ path, entry }));

        console.log(`Filtered ${images.length} image entries from ZIP`);

        if (images.length === 0) {
          console.error('No image files found in ZIP. Available files:', entries.map(e => e.path));
          throw new Error("画像が見つかりませんでした。アーカイブ内に画像ファイル（PNG, JPEG, GIF, WebP, AVIF, BMP）が含まれているか確認してください。");
        }
      }

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

      const preloadCount = Math.min(3, images.length);
      console.log(`Preloading ${preloadCount} images to base64...`);

      for (let index = 0; index < preloadCount; index += 1) {
        await this.convertImageAtIndex(index, { reportError: true });
      }

      this.imageIndex = Math.min(startPage, this.imagePages.length - 1);
      const loadedCount = this.imagePages.filter((page) => page !== null).length;
      console.log(`Preloaded ${loadedCount} images successfully`);

      if (loadedCount === 0) {
        await this.convertImageAtIndex(this.imageIndex, { reportError: true });
        if (!this.imagePages[this.imageIndex]) {
          console.error('All preloaded images failed to convert to base64');
          throw new Error("画像の読み込みに失敗しました。最初のページの変換に失敗しました。");
        }
      }

      this.renderImagePage();
      this.onReady?.({
        metadata: { title: file.name, creator: "画像書籍" },
        toc: [],
      });
    } catch (error) {
      console.error("Error opening image book:", error);
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
      let base64 = null;
      if (image.entry) {
        base64 = await image.entry.async("base64");
        if (!base64) {
          throw new Error("base64データが空です。");
        }
      } else if (image.data) {
        if (!image.data || image.data.length === 0) {
          throw new Error("画像データが空です。");
        }
        base64 = this.uint8ToBase64(image.data);
      } else {
        throw new Error("変換元データが見つかりませんでした。");
      }

      const ext = image.path.split(".").pop()?.toLowerCase() ?? "jpeg";
      const mime =
        ext === "png" ? "image/png" :
          ext === "gif" ? "image/gif" :
            ext === "webp" ? "image/webp" :
              ext === "avif" ? "image/avif" :
                ext === "bmp" ? "image/bmp" :
                  ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
                    "image/jpeg";
      const dataUrl = `data:${mime};base64,${base64}`;
      this.imagePages[index] = dataUrl;
      return dataUrl;
    } catch (error) {
      const pageNumber = index + 1;
      const message = `画像変換に失敗しました（${pageNumber}ページ目: ${image.path}）`;
      console.error(message, error);
      this.imagePageErrors[index] = message;
      if (reportError) {
        this.showImageConvertError(message);
      }
      return null;
    }
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
      if (this.imageReadingDirection === "rtl") {
        this.imageViewer.classList.add('rtl-mode');
      } else {
        this.imageViewer.classList.remove('rtl-mode');
      }
    }

    // 現在のページが横長かどうかチェック（非同期だが、すでにプリロード済みと仮定または簡易チェック）
    // 横長判定: プリロードされた画像データから判定するのは難しいが、
    // Imageオブジェクトを一時生成してチェックするか、キャッシュ済みの情報を利用する。
    // ここでは描画時に判定して動的にモード切替相当の処理を行うアプローチをとる。

    // 見開きモードの場合
    if (this.imageViewMode === "spread" && this.imageViewer) {
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
      // convertImageAtIndex は ZIP/RAR から画像を解凍し、this.imagePages[index] にセットします
      await this.convertImageAtIndex(index);
    }

    // imagePages[index] が Promise (ZIP解凍待ち) の可能性があるため await する
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
    if (this.type !== "epub") {
      this.imageElement.onclick = null;
      this.imageElement.style.pointerEvents = "none";
    }

    // ズーム適用
    if (this.imageZoomed) {
      this.imageViewer?.classList.add('zoomed');
      this.imageElement.style.transform = 'scale(2)';
      this.imageElement.style.transformOrigin = 'center center';
    } else {
      this.imageViewer?.classList.remove('zoomed');
      this.imageElement.style.transform = 'scale(1)';
    }

    // 見開きコンテナ削除
    if (this.imageViewer) {
      const spreadContainer = this.imageViewer.querySelector('.spread-container');
      if (spreadContainer) spreadContainer.remove();

      // ズーム状態の適用（単ページ）
      if (this.imageZoomed) {
        this.imageViewer.classList.add('zoomed');
        this.imageElement.style.transform = 'scale(2)';
        this.imageElement.style.transformOrigin = 'center center';
      } else {
        this.imageViewer.classList.remove('zoomed');
        this.imageElement.style.transform = 'scale(1)';
      }
    }

    this.loadImagePage(index);
    // プリロード
    if (index + 1 < this.imagePages.length) {
      this.loadImagePage(index + 1);
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
      percentage: Math.round(((targetIndex + 1) / this.imagePages.length) * 100),
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
    let container = this.imageViewer.querySelector('.spread-container');
    if (!container) {
      // コンテナが存在しない場合は新規作成して追加する
      container = document.createElement('div');
      container.className = 'spread-container';
      this.imageViewer.appendChild(container);
    }

    // 画像書庫ならクリック無効
    if (this.type !== "epub") {
      container.style.pointerEvents = "none";
    }

    // ズーム状態を適用
    if (this.imageZoomed) {
      this.imageViewer.classList.add('zoomed');
      container.style.transform = 'scale(2)';
      container.style.transformOrigin = '0 0';
    } else {
      this.imageViewer.classList.remove('zoomed');
      container.style.transform = 'scale(1)';
      container.style.transformOrigin = 'center center';
    }

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
      if (this.type !== "epub") img.style.pointerEvents = "none";
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
        if (this.type !== "epub") leftImg.style.pointerEvents = "none";
        container.appendChild(leftImg);

        const rightImg = document.createElement('img');
        rightImg.src = rightImgSrc;
        rightImg.className = 'spread-page spread-right';
        if (this.type !== "epub") rightImg.style.pointerEvents = "none";
        container.appendChild(rightImg);

      } else {
        // 1枚表示（ペア相手がいない、または次がワイド）
        const img1 = document.createElement('img');
        img1.src = page1Src;
        img1.className = 'spread-page single-view';
        if (this.type !== "epub") img1.style.pointerEvents = "none";
        container.appendChild(img1);

        this.currentSpreadStep = 1;
      }
    }

    // プリロード
    const preloadStep = this.currentSpreadStep || 1;
    if (targetIndex + preloadStep < this.imagePages.length) {
      // 次の画像データだけ取得しておく（キャッシュ乗る）
      this.getPageDimensions(targetIndex + preloadStep);
    }

    this.updateProgress(targetIndex, isWide);
  }

  setImageViewMode(mode) {
    if (mode !== "single" && mode !== "spread") return;
    this.imageViewMode = mode;
    this.renderImagePage();
  }

  toggleImageViewMode() {
    this.setImageViewMode(this.imageViewMode === "single" ? "spread" : "single");
    return this.imageViewMode;
  }

  // 左開き/右開き切替
  setImageReadingDirection(direction) {
    if (direction !== "ltr" && direction !== "rtl") return;
    this.imageReadingDirection = direction;
    this.renderImagePage();
  }

  toggleImageReadingDirection() {
    this.setImageReadingDirection(this.imageReadingDirection === "ltr" ? "rtl" : "ltr");
    return this.imageReadingDirection;
  }

  // ズーム切替（画像書庫用）
  toggleImageZoom() {
    this.imageZoomed = !this.imageZoomed;
    this.renderImagePage(); // 再描画してズーム適用
    return this.imageZoomed;
  }

  // ズーム解除
  resetImageZoom() {
    this.imageZoomed = false;
    if (this.imageViewer) {
      this.imageViewer.classList.remove('zoomed');
      const spreadContainer = this.imageViewer.querySelector('.spread-container');
      if (spreadContainer) spreadContainer.style.transform = 'scale(1)';
    }
    if (this.imageElement) {
      this.imageElement.style.transform = 'scale(1)';
    }
  }

  // 統合ズーム切替
  toggleZoom() {
    // 既存の実装を継承しつつ、ImageZoomedフラグを管理
    if (this.isImageBook()) {
      return this.toggleImageZoom();
    } else {
      this.imageZoomed = !this.imageZoomed;
      if (this.viewer) {
        this.viewer.style.transform = this.imageZoomed ? 'scale(1.5)' : 'scale(1)';
        this.viewer.style.transformOrigin = 'center center';
      }
      return this.imageZoomed;
    }
  }

  isImageBook() {
    return this.type === "zip" || this.type === "rar";
  }

  // 現在のページが横長かどうかを確認（Navigation用）
  async isCurrentPageWideSync() {
    if (!this.imagePages[this.imageIndex]) return false;
    // 既にキャッシュされていれば早い。キャッシュがなければ非同期になるが
    // ここでは簡易的に直近の判定結果を使いたいところ。
    // しかし厳密には非同期。navigation内でawaitするのはUIレスポンスに関わる。
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

    const dataUrl = await this.convertImageAtIndex(index, { reportError: true });
    if (!dataUrl) return;
    if (currentToken === this.imageLoadToken) {
      this.imageElement.src = dataUrl;
      this.imageElement.alt = "ページ画像";
      this.imageElement.title = "";
    }
  }



  async prev(step) {
    if (this.imageZoomed) return; // ズーム中はページめくり無効

    // EPUBの場合はPageControllerを使用
    if (this.type === "epub") {
      this.pageController?.prev();
      return;
    }

    if (this.render && this.render.prev && !this.isImageBook()) {
      this.render.prev();
      return;
    }

    let targetIndex;
    if (this.imageViewMode === "spread") {
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
                // ケース1: [P-2(T), P-1(T)] -> [current(T)...]
                //   P-1 のパートナーは P-2. なので P-2 へ戻る (-2).
                // ケース2: [P-1(T)] -> [current(W)] (P-1の次は本来ペアだが次がWなので単独)
                //   これは「P-1から見た次」の話。
                //   「戻る」動作は「何が表示されていたか」を復元する。
                //   P-1 が P-2 とペアだったのか、単独だったのかを知りたい。
                //   -> P-2 が T なら P-2 とペア (-2).
                //   -> P-2 が W なら P-1 はペア相手不在(前のWとは組めない) -> P-1 は新しい先頭 (-1).
                //   -> P-2 が存在しない(Index<0) -> P-1 は先頭 (-1).
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
  }

  async next(step) {
    if (this.imageZoomed) return; // ズーム中はページめくり無効

    // EPUBの場合はPageControllerを使用
    if (this.type === "epub") {
      this.pageController?.next();
      return;
    }

    if (this.render && this.render.next && !this.isImageBook()) {
      this.render.next();
      return;
    }

    let targetIndex;
    if (this.imageViewMode === "spread") {
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
  }

  addBookmark(label = "しおり", { deviceId, deviceColor } = {}) {
    if (this.type === "epub") {
      if (!this.pagination?.pages?.length) return null;
      const percentage = Math.round(((this.currentPageIndex + 1) / this.pagination.pages.length) * 100);
      const locator = this.getPageLocator(this.currentPageIndex) || this.getFallbackLocator();
      const cfi = locator ? `${locator.spineIndex}:${locator.segmentIndex}` : null;
      const bookmark = {
        label,
        location: locator,
        cfi,
        percentage,
        createdAt: Date.now(),
        bookType: "epub", // bookType として保存
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
      percentage: Math.round(((this.imageIndex + 1) / this.imagePages.length) * 100),
      createdAt: Date.now(),
      bookType: this.type, // "zip" | "rar"
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
      if (this.type === "epub") {
        this.pageController.goTo(bookmark);
      } else {
        // 画像書庫の場合、範囲チェックをして移動
        this.imageIndex = Math.max(0, Math.min(bookmark, this.imagePages.length - 1));
        this.renderImagePage();
      }
      return;
    }

    // 以下、しおりオブジェクト（{ bookType: ..., location: ... }）の場合の処理

    // bookType または type で判定（互換性のため両方サポート）。
    // bookmarkオブジェクトにtypeが無い場合は現在のthis.typeをフォールバックとして使用
    const bookType = bookmark.bookType || bookmark.type || this.type;

    if (bookType === "epub") {
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
    } else if (bookType === "zip" || bookType === "rar" || bookType === "image") {
      // 画像書庫: location は imageIndex
      const targetIndex = typeof bookmark.location === "number"
        ? bookmark.location
        : Math.round((bookmark.percentage / 100) * this.imagePages.length) - 1;
      this.imageIndex = Math.max(0, Math.min(targetIndex, this.imagePages.length - 1));
      this.renderImagePage();
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
    if (this.type !== "epub") {
      return;
    }
    this.pagination = null;
    await this.buildPagination();
    this.pageController.goTo(this.currentPageIndex);
  }

  async applyReadingDirection(writingMode, pageDirection) {
    if (pageDirection) {
      this.pageDirection = pageDirection;
    }
    if (writingMode) {
      this.writingMode = writingMode;
      this.preferredWritingMode = writingMode;
    }

    if (this.type !== "epub") {
      return;
    }

    try {
      console.log("[Reader] applyReadingDirection:", { writingMode, pageDirection });
      this.pagination = null;
      await this.buildPagination();
      this.pageController.goTo(this.currentPageIndex);
    } catch (error) {
      console.error("[Reader] Failed to apply reading direction:", error);
    }
  }

  applyWritingModeToContents() {
    if (this.type !== "epub") return;
    const isVertical = this.writingMode === "vertical";
    const writingMode = isVertical ? "vertical-rl" : "horizontal-tb";
    const textOrientation = isVertical ? "mixed" : "initial";
    const contentDirection = "ltr";
    const target = this.pageContainer || this.viewer;
    if (!target) return;
    target.style.setProperty("writing-mode", writingMode);
    target.style.setProperty("text-orientation", textOrientation);
    target.style.setProperty("direction", contentDirection);
    target.style.setProperty("text-align", "start");
    target.style.setProperty("text-align-last", "start");
  }

  updateEpubTheme() {
    if (this.type !== "epub") return;
    const isVertical = this.writingMode === "vertical";
    const contentDirection = "ltr";

    console.log("[updateEpubTheme] Applying theme:", {
      isVertical,
      theme: this.theme,
      writingMode: this.writingMode
    });

    // 縦書き・横書きともに縦スクロールで表示するため、
    // writing-modeはそのまま適用するが、レイアウトは縦スクロール用に最適化
    if (this.viewer) {
      this.viewer.style.background = this.theme === "dark" ? "#0b1020" : "#ffffff";
      this.viewer.style.color = this.theme === "dark" ? "#e5e7eb" : "#0f172a";
      this.viewer.style.width = "100%";
      this.viewer.style.height = "100%";
    }
    if (this.pageContainer) {
      const edgePadding = this.getEdgePadding();
      this.pageContainer.style.padding = `${edgePadding}px`;
      this.pageContainer.style.lineHeight = "1.8";
      this.pageContainer.style.maxWidth = "900px";
      this.pageContainer.style.margin = "0 auto";
      this.pageContainer.style.width = "100%";
      this.pageContainer.style.minHeight = "100%";
      this.pageContainer.style.boxSizing = "border-box";
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
          const styleText = Array.from(doc.querySelectorAll("style"))
            .map((style) => style.textContent || "")
            .join(" ");
          const combined = `${inlineStyles} ${styleText}`.toLowerCase();
          if (combined.includes("writing-mode: vertical")) {
            writingMode = "vertical";
          } else if (combined.includes("writing-mode: horizontal")) {
            writingMode = "horizontal";
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

  uint8ToBase64(uint8) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  injectImageZoom() {
    /* Image zoom on click is disabled per user request
    if (this.type === "epub") {
      this.viewer?.querySelectorAll("img").forEach((img) => {
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
}
