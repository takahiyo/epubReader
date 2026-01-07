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
    this.imageZoomBound = false;
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
      
      // JSZipの問題の場合、より詳細な情報を提供
      if (error.message.includes('JSZip')) {
        console.error("JSZip diagnostic info:", {
          'window.JSZip': typeof window.JSZip,
          'globalThis.JSZip': typeof globalThis.JSZip,
          'JSZipLib available': !!JSZipLib,
          'JSZipLib.loadAsync': typeof JSZipLib?.loadAsync,
          'error': error.message
        });
        
        // 別の読み込み方法を試す
        throw new Error(`EPUB読み込みエラー: JSZipライブラリが見つかりません。\\n\\nブラウザのキャッシュをクリアして、ページを再読み込みしてください。\\n\\n技術詳細: ${error.message}`);
      }
      
      throw new Error(`EPUBファイルの解析に失敗しました: ${error.message}`);
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
    
    // ビューアのサイズを明示的に設定
    const viewerWidth = this.viewer.clientWidth || 800;
    const viewerHeight = this.viewer.clientHeight || 600;
    
    this.rendition = this.book.renderTo(this.viewer, {
      width: viewerWidth,
      height: viewerHeight,
      flow: "paginated",
      allowScriptedContent: true,
      spread: "auto",
    });
    
    if (!this.rendition) {
      throw new Error("EPUBレンダラーの初期化に失敗しました。");
    }
    
    console.log("Rendition created successfully:", this.rendition);

    await this.book.ready;
    
    // 目次の生成
    try {
      await this.book.locations.generate(1600);
    } catch (err) {
      console.warn("目次の生成に失敗しました:", err);
    }

    this.rendition.on("rendered", () => {
      this.injectImageZoom();
      this.updateEpubTheme();
    });

    this.rendition.on("relocated", (location) => {
      const percentage = Math.round((location.start?.percentage ?? 0) * 100);
      this.onProgress?.({
        location: location.start?.cfi,
        percentage,
      });
    });

    try {
      console.log("Calling rendition.display with location:", startLocation);
      this.applyReadingDirection(this.writingMode, this.pageDirection);
      const displayed = await this.rendition.display(startLocation || undefined);
      console.log("Display result:", displayed);
      console.log("Rendition current location:", this.rendition.currentLocation());
      
      console.log("Viewer visibility set, checking iframe...");
      setTimeout(() => {
        const iframe = this.viewer.querySelector("iframe");
        console.log("Iframe element:", iframe);
        if (iframe) {
          console.log("Iframe dimensions:", {
            width: iframe.offsetWidth,
            height: iframe.offsetHeight,
            src: iframe.src
          });
        }
      }, 100);
      
      this.onReady?.(this.book.package?.metadata);
      console.log("EPUB opened successfully");
    } catch (err) {
      console.error("EPUBの表示に失敗しました:", err);
      console.error("Error stack:", err.stack);
      throw new Error(`EPUBの表示に失敗しました: ${err.message}`);
    }
  }

  async openImageBook(file, startPage = 0) {
    this.resetReaderState();
    this.type = "image";
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
      this.onReady?.({ title: file.name, creator: "画像書籍" });
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
      this.rendition?.next();
    } else if (this.type === "image") {
      if (this.imageIndex < this.imagePages.length - 1) {
        this.imageIndex += 1;
        this.renderImagePage();
      }
    }
  }

  prev() {
    if (this.type === "epub") {
      this.rendition?.prev();
    } else if (this.type === "image") {
      if (this.imageIndex > 0) {
        this.imageIndex -= 1;
        this.renderImagePage();
      }
    }
  }

  addBookmark(label = "しおり") {
    if (this.type === "epub") {
      const location = this.rendition?.currentLocation();
      if (!location) return null;
      return {
        label,
        location: location.start?.cfi,
        percentage: Math.round((location.start?.percentage ?? 0) * 100),
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
    if (bookmark.type === "epub" && this.rendition) {
      await this.rendition.display(bookmark.location);
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
    if (writingMode) {
      this.writingMode = writingMode;
    }
    if (pageDirection) {
      this.pageDirection = pageDirection;
    }
    
    if (this.type !== "epub" || !this.rendition) {
      return;
    }
    
    // 現在位置を保存
    const current = this.rendition.currentLocation();
    const currentCfi = current?.start?.cfi;
    
    // テーマとスタイルを更新（表示前に適用）
    this.updateEpubTheme();
    
    // ページ送り方向を設定
    if (this.rendition.direction) {
      this.rendition.direction(this.pageDirection);
    }
    
    // コンテンツにスタイルを適用
    this.applyWritingModeToContents();
    
    // レンダリング完了を待ってから位置を復元
    if (currentCfi) {
      try {
        // 一度レンダリングイベントを待つ
        await new Promise((resolve) => {
          const handler = () => {
            this.rendition.off('rendered', handler);
            resolve();
          };
          this.rendition.once('rendered', handler);
          
          // 位置を復元
          this.rendition.display(currentCfi);
        });
      } catch (error) {
        console.warn("Failed to restore position after direction change:", error);
      }
    }
  }

  applyWritingModeToContents() {
    if (this.type !== "epub" || !this.rendition) return;
    const isVertical = this.writingMode === "vertical";
    const writingMode = isVertical ? "vertical-rl" : "horizontal-tb";
    const textOrientation = isVertical ? "mixed" : "initial";
    const contents = this.rendition.getContents();
    contents.forEach((content) => {
      const doc = content.document;
      if (!doc?.documentElement) return;
      doc.documentElement.style.setProperty("writing-mode", writingMode, "important");
      doc.documentElement.style.setProperty("text-orientation", textOrientation, "important");
      doc.documentElement.style.setProperty("direction", this.pageDirection, "important");
      if (doc.body) {
        doc.body.style.setProperty("writing-mode", writingMode, "important");
        doc.body.style.setProperty("text-orientation", textOrientation, "important");
        doc.body.style.setProperty("direction", this.pageDirection, "important");
      }
    });
  }

  updateEpubTheme() {
    if (this.type !== "epub" || !this.rendition) return;
    const isVertical = this.writingMode === "vertical";
    this.rendition.themes.default({
      html: {
        writingMode: isVertical ? "vertical-rl" : "horizontal-tb",
        textOrientation: isVertical ? "mixed" : "initial",
        direction: this.pageDirection,
      },
      body: {
        background: this.theme === "dark" ? "#0b1020" : "#ffffff",
        color: this.theme === "dark" ? "#e5e7eb" : "#0f172a",
        padding: "24px",
        lineHeight: 1.6,
        writingMode: isVertical ? "vertical-rl" : "horizontal-tb",
        textOrientation: isVertical ? "mixed" : "initial",
        direction: this.pageDirection,
      },
      img: {
        maxWidth: "100%",
      },
    });
    this.rendition.themes.select("default");
    this.applyWritingModeToContents();
    this.injectImageZoom();
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
    if (!this.rendition) return;
    const contents = this.rendition.getContents();
    contents.forEach((content) => {
      const doc = content.document;
      doc.querySelectorAll("img").forEach((img) => {
        img.style.cursor = "zoom-in";
        this.bindElementZoomHandlers(img, () => img.src);
      });
    });
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
