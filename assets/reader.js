import { EpubPaginator } from "../src/reader/epubPaginator.js";

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
    this.type = null;
    this.imagePages = [];
    this.imageIndex = 0;
    this.imageEntries = [];
    this.imagePageErrors = [];
    this.imageLoadToken = 0;
    this.theme = "dark";
    this.writingMode = "horizontal";
    this.pageDirection = "ltr";
    this.paginator = null;
    this.pagination = null;
    this.paginationPromise = null;
    this.currentPageIndex = 0;
    this.usingPaginator = false;
    this.resourceUrlCache = new Map();
    this.resourceLoader = null;
    this.pageContainer = null;
    this.spineItems = [];
    this.pageController = new PageController((index) => {
      this.renderEpubPage(index);
    });
    this.imageZoomBound = false;
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
    this.type = null;
    this.imagePages = [];
    this.imageIndex = 0;
    this.imageEntries = [];
    this.imagePageErrors = [];
    this.imageLoadToken = 0;
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
    if (typeof unrar !== "undefined") {
      return unrar;
    }
    if (typeof window !== "undefined") {
      const existing = window.unrar || window.Unrar || window.UnRAR;
      if (existing) {
        window.unrar = existing;
        return existing;
      }
      window.Module = {
        ...(window.Module || {}),
        locateFile: (path) => `./assets/vendor/${path}`,
      };
    }
    try {
      await this.loadScript("./assets/vendor/unrar.js");
    } catch (error) {
      throw new Error("RARの読み込みに失敗しました。wasmの読み込みに失敗している可能性があります。");
    }
    const localUnrar = typeof window !== "undefined"
      ? (window.unrar || window.Unrar || window.UnRAR)
      : null;
    if (!localUnrar) {
      throw new Error("RARの読み込みに失敗しました。wasmの読み込みに失敗している可能性があります。");
    }
    window.unrar = localUnrar;
    return localUnrar;
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
    console.log("Rendering to viewer element...");
    console.log("Viewer element:", this.viewer);
    console.log("Viewer dimensions:", {
      width: this.viewer.offsetWidth,
      height: this.viewer.offsetHeight,
      clientWidth: this.viewer.clientWidth,
      clientHeight: this.viewer.clientHeight
    });
    
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
    if (detectedReading?.writingMode) {
      this.writingMode = detectedReading.writingMode;
      console.log("Detected writing mode:", this.writingMode);
    }
    if (detectedReading?.pageDirection) {
      this.pageDirection = detectedReading.pageDirection;
      console.log("Detected page direction:", this.pageDirection);
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
    if (typeof startLocation === "number") {
      return Math.max(0, Math.min(startLocation, totalPages - 1));
    }
    if (startLocation && typeof startLocation === "object") {
      const explicitLocation = startLocation.location;
      if (typeof explicitLocation === "number") {
        return Math.max(0, Math.min(explicitLocation, totalPages - 1));
      }
      const percentage = startLocation.percentage;
      if (typeof percentage === "number") {
        const index = Math.round((percentage / 100) * totalPages) - 1;
        return Math.max(0, Math.min(index, totalPages - 1));
      }
    }
    return 0;
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
    this.pageContainer.innerHTML = page.htmlFragment;
    this.pageContainer.querySelectorAll("img").forEach((img) => {
      img.style.maxWidth = "100%";
      img.style.maxHeight = "70vh";
      img.style.display = "block";
      img.style.margin = "1em auto";
      img.style.objectFit = "contain";
    });
    this.resolveImagesInRenderedPage(page);
    this.updateEpubTheme();
    this.injectImageZoom();
    this.updateProgressFromPagination(pagination.pages.length);
  }

  updateProgressFromPagination(totalPages) {
    if (!totalPages) return;
    const percentage = Math.round(((this.currentPageIndex + 1) / totalPages) * 100);
    this.onProgress?.({
      location: this.currentPageIndex,
      percentage,
    });
  }

  async resolveImagesInRenderedPage(page) {
    if (!this.pageContainer || !this.resourceLoader) return;
    if (page?.spineIndex == null || page.spineIndex < 0) return;
    const spineItem = this.spineItems[page.spineIndex];
    if (!spineItem) return;
    const images = Array.from(this.pageContainer.querySelectorAll("img"));
    if (!images.length) return;
    await Promise.all(
      images.map(async (img) => {
        const src = img.getAttribute("src");
        if (!src || src.startsWith("blob:")) return;
        try {
          const resolved = await this.resourceLoader(src, spineItem);
          if (resolved) img.setAttribute("src", resolved);
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
      const resourceLoader = async (url) => {
        if (!url) return url;
        if (/^(https?:|data:|blob:)/i.test(url)) {
          return url;
        }
        if (this.resourceUrlCache.has(url)) {
          return this.resourceUrlCache.get(url);
        }
        try {
          const loaded = await this.book.load(url);
          if (!loaded) return url;
          if (typeof loaded === "string") return loaded;
          const blob = loaded instanceof Blob ? loaded : new Blob([loaded]);
          const objectUrl = URL.createObjectURL(blob);
          this.resourceUrlCache.set(url, objectUrl);
          return objectUrl;
        } catch (error) {
          console.warn("Failed to resolve resource:", url, error);
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
        padding: 24,
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

  async openImageBook(file, startPage = 0) {
    this.resetReaderState();
    this.type = "image";
    this.toc = [];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isRar = ext === "rar" || ext === "cbr" || file.type === "application/vnd.rar" || file.type === "application/x-rar-compressed";
    const buffer = await file.arrayBuffer();
    let images = [];

    try {
      console.log(`Processing ${isRar ? 'RAR' : 'ZIP/CBZ'} file: ${file.name}`);
      console.log(`File size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
      
      if (isRar) {
        console.log("Opening RAR file...");
        const { createExtractorFromData } = await this.ensureUnrar();
        const extractor = createExtractorFromData({ data: new Uint8Array(buffer) });
        const list = extractor.getFileList();
        const headers = list?.fileHeaders ?? list?.files ?? [];
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
          
          // 隠しファイルを除外 (.DS_Store, Thumbs.db, __MACOSX など)
          if (fileName.startsWith('.') || fileName.startsWith('__') || fileName.toLowerCase() === 'thumbs.db') {
            return false;
          }
          
          const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
          const result = !isDir && isImage;
          
          if (result) {
            console.log(`✓ Including: ${name}`);
          }
          
          return result;
        });
        
        console.log(`Filtered ${imageHeaders.length} image entries`);

        if (imageHeaders.length === 0) {
          console.error('No image files found in RAR. Available files:', headers.map(h => h?.name ?? h?.fileName));
          throw new Error("画像が見つかりませんでした。アーカイブ内に画像ファイル（PNG, JPEG, GIF, WebP, BMP）が含まれているか確認してください。");
        }

        const imageNames = imageHeaders
          .map((header) => header?.name ?? header?.fileName ?? header?.filename ?? header?.path ?? "")
          .filter(Boolean);
        
        console.log('Extracting images:', imageNames);
        const extracted = extractor.extractFiles(imageNames);
        const extractedFiles = extracted?.files ?? extracted ?? [];
        
        images = extractedFiles
          .map((item) => {
            const header = item?.fileHeader ?? item?.header ?? item;
            const name = header?.name ?? header?.fileName ?? header?.filename ?? item?.name ?? "";
            const data = item?.extraction?.data ?? item?.data;
            
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
            
            const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
            
            if (isImage) {
              console.log(`✓ Including: ${path}`);
            }
            
            return isImage;
          })
          .map(({ path, entry }) => ({ path, entry }));
        
        console.log(`Filtered ${images.length} image entries from ZIP`);
        
        if (images.length === 0) {
          console.error('No image files found in ZIP. Available files:', entries.map(e => e.path));
          throw new Error("画像が見つかりませんでした。アーカイブ内に画像ファイル（PNG, JPEG, GIF, WebP, BMP）が含まれているか確認してください。");
        }
      }

      if (!images.length) {
        throw new Error("画像が見つかりませんでした。対応フォーマット: PNG, JPEG, GIF, WebP, BMP");
      }

      // 自然順ソート（ファイル名の数字を考慮）
      images.sort((a, b) => {
        const normalize = (path) => path.replace(/\\/g, "/");
        const aPath = normalize(a.path);
        const bPath = normalize(b.path);
        
        // 階層の深さで優先順位をつける（浅い階層を優先）
        const depthA = aPath.split("/").length;
        const depthB = bPath.split("/").length;
        if (depthA !== depthB) {
          return depthA - depthB;
        }
        
        // 同じ階層なら、自然順ソート（数字を数値として比較）
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
    this.imageElement.src = this.imagePages[targetIndex] || "";
    if (this.pageIndicator) {
      this.pageIndicator.textContent = `${targetIndex + 1} / ${this.imagePages.length}`;
    }
    this.onProgress?.({
      location: targetIndex,
      percentage: Math.round(((targetIndex + 1) / this.imagePages.length) * 100),
    });
    this.bindImageZoomHandlers();
    this.loadImagePage(targetIndex);
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

  next() {
    if (this.type === "epub") {
      if (!this.pagination?.pages?.length) return;
      this.pageController.next();
    } else if (this.type === "image") {
      if (this.imageIndex < this.imagePages.length - 1) {
        this.imageIndex += 1;
        this.renderImagePage();
      }
    }
  }

  prev() {
    if (this.type === "epub") {
      if (!this.pagination?.pages?.length) return;
      this.pageController.prev();
    } else if (this.type === "image") {
      if (this.imageIndex > 0) {
        this.imageIndex -= 1;
        this.renderImagePage();
      }
    }
  }

  addBookmark(label = "しおり") {
    if (this.type === "epub") {
      if (!this.pagination?.pages?.length) return null;
      const percentage = Math.round(((this.currentPageIndex + 1) / this.pagination.pages.length) * 100);
      return {
        label,
        location: this.currentPageIndex,
        percentage,
        createdAt: Date.now(),
        type: "epub",
      };
    }

    return {
      label,
      location: this.imageIndex,
      percentage: Math.round(((this.imageIndex + 1) / this.imagePages.length) * 100),
      createdAt: Date.now(),
      type: "image",
    };
  }

  async goTo(bookmark) {
    if (!bookmark) return;
    if (bookmark.type === "epub") {
      if (typeof bookmark.location === "number" && this.pagination?.pages?.length) {
        this.pageController.goTo(bookmark.location);
        return;
      }
      if (typeof bookmark.percentage === "number" && this.pagination?.pages?.length) {
        const index = Math.round((bookmark.percentage / 100) * this.pagination.pages.length) - 1;
        this.pageController.goTo(index);
      }
    } else if (bookmark.type === "image") {
      this.imageIndex = Math.min(bookmark.location, this.imagePages.length - 1);
      this.renderImagePage();
    }
  }

  applyTheme(theme) {
    this.theme = theme;
    this.updateEpubTheme();
    document.body.dataset.theme = theme;
  }

  async applyReadingDirection(writingMode, pageDirection) {
    if (pageDirection) {
      this.pageDirection = pageDirection;
    }
    
    if (this.type !== "epub") {
      return;
    }
    
    if (writingMode) {
      this.writingMode = writingMode;
    }
    this.pagination = null;
    await this.buildPagination();
    this.pageController.goTo(this.currentPageIndex);
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
      this.pageContainer.style.padding = "24px";
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
    if (this.type === "epub") {
      this.viewer?.querySelectorAll("img").forEach((img) => {
        img.style.cursor = "zoom-in";
        this.bindElementZoomHandlers(img, () => img.src);
      });
      return;
    }
    if (!this.rendition) return;
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
