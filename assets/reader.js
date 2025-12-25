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
  }

  async ensureJSZip() {
    if (typeof JSZip !== "undefined") {
      return JSZip;
    }
    const module = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
    return module.default ?? module;
  }

  async openEpub(file, startLocation) {
    this.type = "epub";
    const arrayBuffer = await file.arrayBuffer();
    this.book = ePub(arrayBuffer);
    this.rendition = this.book.renderTo(this.viewer, {
      width: "100%",
      height: "100%",
      flow: "paginated",
      allowScriptedContent: true,
    });

    this.book.ready.then(() => this.book.locations.generate(1600).catch(() => {}));

    this.rendition.on("rendered", () => {
      this.injectImageZoom();
      this.applyTheme(this.theme);
    });

    this.rendition.on("relocated", (location) => {
      const percentage = Math.round((location.start?.percentage ?? 0) * 100);
      this.onProgress?.({
        location: location.start?.cfi,
        percentage,
      });
    });

    await this.rendition.display(startLocation || undefined);
    this.viewer.classList.remove("hidden");
    this.imageViewer.classList.add("hidden");
    this.onReady?.(this.book.package?.metadata);
  }

  async openImageBook(file, startPage = 0) {
    this.type = "image";
    const JSZipLib = await this.ensureJSZip();
    const zip = await JSZipLib.loadAsync(file);
    const images = [];
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const lower = path.toLowerCase();
      if (/(png|jpe?g|gif|webp)$/.test(lower)) {
        images.push({ path, entry });
      }
    });

    images.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    const buffers = await Promise.all(
      images.map((image) => image.entry.async("base64"))
    );

    this.imagePages = buffers.map((base64, index) => {
      const ext = images[index].path.split(".").pop()?.toLowerCase() ?? "jpeg";
      const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${base64}`;
    });

    if (!this.imagePages.length) {
      throw new Error("画像が見つかりませんでした");
    }

    this.viewer.classList.add("hidden");
    this.imageViewer.classList.remove("hidden");
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
    if (this.type === "epub" && this.rendition) {
      this.rendition.themes.default({
        body: {
          background: theme === "dark" ? "#0b1020" : "#ffffff",
          color: theme === "dark" ? "#e5e7eb" : "#0f172a",
          padding: "24px",
          lineHeight: 1.6,
        },
        img: {
          maxWidth: "100%",
        },
      });
      this.rendition.themes.select("default");
      this.injectImageZoom();
    }
    document.body.dataset.theme = theme;
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
