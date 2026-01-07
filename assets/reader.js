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
    this.readingDirection = "rtl";
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
      this.applyReadingDirection(this.readingDirection);
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
    this.type = "image";
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isRar = ext === "rar" || file.type === "application/vnd.rar" || file.type === "application/x-rar-compressed";
    const buffer = await file.arrayBuffer();
    let images = [];

    if (isRar) {
      const { createExtractorFromData } = await this.ensureUnrar();
      const extractor = createExtractorFromData({ data: new Uint8Array(buffer) });
      const list = extractor.getFileList();
      const headers = list?.fileHeaders ?? list?.files ?? [];
      const imageHeaders = headers.filter((header) => {
        const name = header?.name ?? header?.fileName ?? header?.filename ?? header?.path ?? "";
        const isDir = header?.flags?.directory ?? header?.isDirectory ?? header?.directory;
        return !isDir && /(png|jpe?g|gif|webp)$/.test(name.toLowerCase());
      });

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
    } else {
      const JSZipLib = await this.ensureJSZip();
      const zip = await JSZipLib.loadAsync(buffer);
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        const lower = path.toLowerCase();
        if (/(png|jpe?g|gif|webp)$/.test(lower)) {
          images.push({ path, entry });
        }
      });
    }

    images.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    const buffers = await Promise.all(
      images.map(async (image) => {
        if (image.entry) {
          return image.entry.async("base64");
        }
        const base64 = this.uint8ToBase64(image.data);
        return base64;
      })
    );

    this.imagePages = buffers.map((base64, index) => {
      const ext = images[index].path.split(".").pop()?.toLowerCase() ?? "jpeg";
      const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${base64}`;
    });

    if (!this.imagePages.length) {
      throw new Error("画像が見つかりませんでした");
    }

    this.imageIndex = Math.min(startPage, this.imagePages.length - 1);
    this.renderImagePage();
    this.onReady?.({ title: file.name, creator: "画像書籍" });
  }

  renderImagePage() {
    if (!this.imagePages.length) return;
    this.imageElement.src = this.imagePages[this.imageIndex];
    this.pageIndicator.textContent = `${this.imageIndex + 1} / ${this.imagePages.length}`;
    this.onProgress?.({
      location: this.imageIndex,
      percentage: Math.round(((this.imageIndex + 1) / this.imagePages.length) * 100),
    });
    this.imageElement.onclick = () => this.onImageZoom?.(this.imagePages[this.imageIndex]);
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

  applyReadingDirection(direction) {
    this.readingDirection = direction;
    this.updateEpubTheme();
    if (this.rendition?.direction) {
      this.rendition.direction(direction);
    }
  }

  updateEpubTheme() {
    if (this.type !== "epub" || !this.rendition) return;
    const isVertical = this.readingDirection === "rtl";
    this.rendition.themes.default({
      body: {
        background: this.theme === "dark" ? "#0b1020" : "#ffffff",
        color: this.theme === "dark" ? "#e5e7eb" : "#0f172a",
        padding: "24px",
        lineHeight: 1.6,
        writingMode: isVertical ? "vertical-rl" : "horizontal-tb",
        textOrientation: isVertical ? "mixed" : "initial",
        direction: isVertical ? "rtl" : "ltr",
      },
      img: {
        maxWidth: "100%",
      },
    });
    this.rendition.themes.select("default");
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
        img.onclick = () => this.onImageZoom?.(img.src);
      });
    });
  }
}
