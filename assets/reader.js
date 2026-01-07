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
    if (typeof JSZip !== "undefined") {
      if (typeof window !== "undefined" && !window.JSZip) {
        window.JSZip = JSZip;
      }
      console.log("JSZip is already loaded");
      return JSZip;
    }
    console.log("Loading JSZip from CDN...");
    const module = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
    const jszip = module.default ?? module;
    if (typeof window !== "undefined") {
      window.JSZip = jszip;
    }
    console.log("JSZip loaded successfully");
    return jszip;
  }

  async ensureUnrar() {
    if (typeof unrar !== "undefined") {
      return unrar;
    }
    const module = await import("https://cdn.jsdelivr.net/npm/unrar-js@0.4.0/esm/unrar.js");
    const api = module?.default ?? module;
    if (typeof window !== "undefined") {
      window.unrar = api;
    }
    return api;
  }

  async openEpub(file, startLocation) {
    this.resetReaderState();
    this.type = "epub";
    await this.ensureJSZip();
    
    // EPUBライブラリの確認
    if (typeof ePub === "undefined" && typeof window.ePub === "undefined") {
      throw new Error("EPUB.jsライブラリが読み込まれていません。ページを再読み込みしてください。");
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const epubConstructor = typeof ePub !== "undefined" ? ePub : window.ePub;
    
    console.log("Creating ePub instance...");
    this.book = epubConstructor(arrayBuffer);
    
    if (!this.book) {
      throw new Error("EPUBファイルの解析に失敗しました。");
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
    const isRar = ext === "rar" || file.type === "application/vnd.rar" || file.type === "application/x-rar-compressed";
    const buffer = await file.arrayBuffer();
    let images = [];

    try {
      if (isRar) {
        console.log("Opening RAR file...");
        const { createExtractorFromData } = await this.ensureUnrar();
        const extractor = createExtractorFromData({ data: new Uint8Array(buffer) });
        const list = extractor.getFileList();
        const headers = list?.fileHeaders ?? list?.files ?? [];
        console.log(`Found ${headers.length} entries in RAR`);
        
        const imageHeaders = headers.filter((header) => {
          const name = header?.name ?? header?.fileName ?? header?.filename ?? header?.path ?? "";
          const normalized = name.replace(/\\/g, "/");
          const fileName = normalized.split("/").pop() ?? "";
          const isDir = header?.flags?.directory ?? header?.isDirectory ?? header?.directory;
          return !isDir && /(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
        });
        
        console.log(`Filtered ${imageHeaders.length} image entries`);

        const imageNames = imageHeaders
          .map((header) => header?.name ?? header?.fileName ?? header?.filename ?? header?.path ?? "")
          .filter(Boolean);
        const extracted = extractor.extractFiles(imageNames);
        const extractedFiles = extracted?.files ?? extracted ?? [];
        
        images = extractedFiles
          .map((item) => {
            const header = item?.fileHeader ?? item?.header ?? item;
            const name = header?.name ?? header?.fileName ?? header?.filename ?? item?.name ?? "";
            const data = item?.extraction?.data ?? item?.data;
            return { path: name, data };
          })
          .filter((entry) => entry.path && entry.data);
        
        console.log(`Extracted ${images.length} images from RAR`);
      } else {
        console.log("Opening ZIP file...");
        const JSZipLib = await this.ensureJSZip();
        const zip = await JSZipLib.loadAsync(buffer);
        
        const entries = [];
        zip.forEach((path, entry) => {
          if (!entry.dir) {
            entries.push({ path, entry });
          }
        });
        
        console.log(`Found ${entries.length} files in ZIP`);
        
        images = entries
          .filter(({ path }) => {
            const normalized = path.replace(/\\/g, "/");
            const fileName = normalized.split("/").pop() ?? normalized;
            return /(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
          })
          .map(({ path, entry }) => ({ path, entry }));
        
        console.log(`Filtered ${images.length} image entries from ZIP`);
      }

      if (!images.length) {
        throw new Error("画像が見つかりませんでした。対応フォーマット: PNG, JPEG, GIF, WebP, BMP");
      }

      images.sort((a, b) => {
        const normalize = (path) => path.replace(/\\/g, "/");
        const aPath = normalize(a.path);
        const bPath = normalize(b.path);
        const depthA = aPath.split("/").length;
        const depthB = bPath.split("/").length;
        if (depthA !== depthB) {
          return depthA - depthB;
        }
        return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: "base" });
      });
      
      console.log(`Converting ${images.length} images to base64...`);
      const buffers = await Promise.all(
        images.map(async (image) => {
          try {
            if (image.entry) {
              return await image.entry.async("base64");
            }
            const base64 = this.uint8ToBase64(image.data);
            return base64;
          } catch (error) {
            console.error(`Failed to process image: ${image.path}`, error);
            return null;
          }
        })
      );

      this.imagePages = buffers
        .map((base64, index) => {
          if (!base64) return null;
          const ext = images[index].path.split(".").pop()?.toLowerCase() ?? "jpeg";
          const mime = 
            ext === "png" ? "image/png" :
            ext === "gif" ? "image/gif" :
            ext === "webp" ? "image/webp" :
            ext === "bmp" ? "image/bmp" :
            "image/jpeg";
          return `data:${mime};base64,${base64}`;
        })
        .filter(Boolean);

      if (!this.imagePages.length) {
        throw new Error("画像の読み込みに失敗しました");
      }

      console.log(`Successfully loaded ${this.imagePages.length} images`);
      this.imageIndex = Math.min(startPage, this.imagePages.length - 1);
      this.renderImagePage();
      this.onReady?.({ title: file.name, creator: "画像書籍" });
    } catch (error) {
      console.error("Error opening image book:", error);
      throw new Error(`画像書籍の読み込みに失敗しました: ${error.message}`);
    }
  }

  renderImagePage() {
    if (!this.imagePages.length) return;
    this.imageElement.src = this.imagePages[this.imageIndex];
    if (this.pageIndicator) {
      this.pageIndicator.textContent = `${this.imageIndex + 1} / ${this.imagePages.length}`;
    }
    this.onProgress?.({
      location: this.imageIndex,
      percentage: Math.round(((this.imageIndex + 1) / this.imagePages.length) * 100),
    });
    this.bindImageZoomHandlers();
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
