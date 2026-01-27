/**
 * EPUB pagination core module.
 *
 * Expected inputs:
 * - spineItems: Array<{ id: string, href: string, htmlString: string }>
 * - resourceLoader: (url: string, spineItem?: object) => Promise<string> | string
 * - settings: {
 *     viewportWidth: number,
 *     viewportHeight: number,
 *     fontSize?: string | number,
 *     writingMode?: "vertical-rl" | "horizontal-tb",
 *     lineHeight?: string | number,
 *     margin?: string,
 *     padding?: string
 *   }
 *
 * PageModel output:
 * - pages: Array<{
 *     spineIndex: number,
 *     withinSpineOffset: string, // "s:<segmentIndex>" (stable locator)
 *     htmlFragment: string,
 *     estimatedCharCount?: number
 *   }>
 * - locatePage(spineIndex, withinSpineOffset) -> pageIndex
 * - getLocator(pageIndex) -> { spineIndex, withinSpineOffset }
 *
 * Measurement strategy:
 * - Uses a hidden container sized to the viewport, applies base CSS, and measures
 *   overflow by injecting candidate fragments into a page element.
 * - Uses binary search on segment indices to find the largest fragment that fits.
 * - Guards against infinite loops with max iterations and progress checks.
 */

import { READER_CONFIG } from "../../assets/constants.js";

const DEFAULTS = {
  viewportWidth: READER_CONFIG.viewportWidth,
  viewportHeight: READER_CONFIG.viewportHeight,
  fontSize: READER_CONFIG.fontSize,
  writingMode: READER_CONFIG.writingMode,
  lineHeight: READER_CONFIG.lineHeight,
  margin: READER_CONFIG.margin,
  padding: READER_CONFIG.padding
};

const MAX_BINARY_SEARCH_ITERATIONS = READER_CONFIG.MAX_BINARY_SEARCH_ITERATIONS;
const MAX_PAGES_PER_SPINE = READER_CONFIG.MAX_PAGES_PER_SPINE;
const MIN_TEXT_UNIT_STEP = READER_CONFIG.TEXT_SEGMENT_STEP;
const FIT_TOLERANCE_PX = READER_CONFIG.FIT_TOLERANCE_PX;
const MAX_FIT_ATTEMPTS = READER_CONFIG.MAX_FIT_ATTEMPTS;

function normalizeSettings(settings) {
  return {
    ...DEFAULTS,
    ...settings
  };
}

function toCssSize(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "number") return `${value}px`;
  return value;
}

function toCssLineHeight(value, fallback) {
  if (value == null) return fallback;
  return value;
}

function createMeasurementContainer(settings) {
  const container = document.createElement("div");
  container.setAttribute("data-epub-paginator", "measurement");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = `${settings.viewportWidth}px`;
  container.style.height = `${settings.viewportHeight}px`;
  container.style.overflow = "hidden";
  container.style.visibility = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "-1";

  const page = document.createElement("div");
  page.setAttribute("data-epub-paginator", "page");
  page.style.width = "100%";
  page.style.height = "100%";
  page.style.boxSizing = "border-box";
  page.style.padding = toCssSize(settings.padding, DEFAULTS.padding);
  page.style.margin = toCssSize(settings.margin, DEFAULTS.margin);
  page.style.fontSize = toCssSize(settings.fontSize, DEFAULTS.fontSize);
  page.style.lineHeight = `${toCssLineHeight(settings.lineHeight, DEFAULTS.lineHeight)}`;
  page.style.writingMode = settings.writingMode;
  page.style.overflow = "hidden";
  page.style.wordBreak = "break-word";
  page.style.hyphens = "auto";

  const style = document.createElement("style");
  style.textContent = `
    [data-epub-paginator="page"] img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    [data-epub-paginator="page"] svg {
      max-width: 100%;
      max-height: 100%;
    }
    [data-epub-paginator="page"] * {
      box-sizing: border-box;
    }
    [data-epub-paginator="page"] p { margin: 0 0 0.8em 0; }
  `;

  container.appendChild(style);
  container.appendChild(page);
  document.body.appendChild(container);

  return { container, page };
}

function createSegments(body) {
  const segments = [];
  const walker = document.createTreeWalker(
    body,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.textContent || !node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName.toLowerCase();
          if (tag === "img" || tag === "svg" || tag === "video" || tag === "iframe") {
            return NodeFilter.FILTER_ACCEPT;
          }
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current.textContent || "";
      const length = text.length;
      let start = 0;
      while (start < length) {
        const end = Math.min(length, start + MIN_TEXT_UNIT_STEP);
        segments.push({ type: "text", node: current, start, end });
        start = end;
      }
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      segments.push({ type: "element", node: current });
    }
    current = walker.nextNode();
  }
  return segments;
}

function positionForSegmentIndex(segments, index) {
  const clampedIndex = Math.min(Math.max(index, 0), segments.length);
  if (!segments.length) return null;
  if (clampedIndex === 0) {
    const first = segments[0];
    return {
      node: first.node,
      offset: first.type === "text" ? first.start : 0,
      type: first.type
    };
  }
  const segmentIndex = Math.min(clampedIndex, segments.length - 1);
  const segment = segments[segmentIndex];
  if (segment.type === "text") {
    return { node: segment.node, offset: segment.start, type: "text" };
  }
  return { node: segment.node, offset: 0, type: "element" };
}

function createRangeFromSegmentIndices(segments, startIndex, endIndex) {
  if (!segments.length) return null;
  const range = document.createRange();
  const clampedStart = Math.min(Math.max(startIndex, 0), segments.length - 1);
  const clampedEnd = Math.min(Math.max(endIndex, clampedStart + 1), segments.length);
  const startSeg = segments[clampedStart];
  const endSeg = segments[clampedEnd - 1];
  if (!startSeg || !endSeg) return null;

  if (startSeg.type === "element") {
    range.setStartBefore(startSeg.node);
  } else {
    range.setStart(startSeg.node, startSeg.start);
  }

  if (endSeg.type === "element") {
    range.setEndAfter(endSeg.node);
  } else {
    range.setEnd(endSeg.node, endSeg.end);
  }

  return range;
}

function serializeRange(range) {
  if (!range) return "";
  const wrapper = document.createElement("div");
  wrapper.appendChild(range.cloneContents());
  return wrapper.innerHTML;
}

async function waitForImages(pageElement) {
  const images = Array.from(pageElement.querySelectorAll("img"));
  if (!images.length) return;
  await Promise.all(
    images.map((img) => {
      if (img.decode) {
        return img.decode().catch(() => undefined);
      }
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const cleanup = () => {
          img.removeEventListener("load", cleanup);
          img.removeEventListener("error", cleanup);
          resolve();
        };
        img.addEventListener("load", cleanup, { once: true });
        img.addEventListener("error", cleanup, { once: true });
      });
    })
  );
}

async function measureFits(pageElement, htmlFragment, settings) {
  pageElement.innerHTML = htmlFragment;
  await waitForImages(pageElement);
  const overflowWidth = pageElement.scrollWidth - pageElement.clientWidth;
  const overflowHeight = pageElement.scrollHeight - pageElement.clientHeight;
  if (settings.writingMode === "vertical-rl") {
    return overflowWidth <= FIT_TOLERANCE_PX && overflowHeight <= FIT_TOLERANCE_PX;
  }
  return overflowHeight <= FIT_TOLERANCE_PX && overflowWidth <= FIT_TOLERANCE_PX;
}

async function resolveResources(body, resourceLoader, spineItem) {
  if (!resourceLoader) return;
  const images = Array.from(body.querySelectorAll("img, image"));

  for (const img of images) {
    const tagName = img.tagName.toLowerCase();
    const isSvgImage = tagName === "image";
    const attrName = isSvgImage
      ? (img.hasAttribute("href") ? "href" : "xlink:href")
      : "src";

    const src = img.getAttribute(attrName);
    if (!src || src.startsWith("blob:") || src.startsWith("data:")) {
      if (isSvgImage || !img.hasAttribute("srcset")) continue;
    }

    try {
      if (src && !src.startsWith("blob:") && !src.startsWith("data:")) {
        const resolved = await resourceLoader(src, spineItem);
        if (resolved) {
          img.setAttribute(attrName, resolved);
        }
      }

      // [追加] imgタグかつsrcsetがある場合も解決する
      if (!isSvgImage && img.hasAttribute("srcset")) {
        const srcset = img.getAttribute("srcset");
        const parts = await Promise.all(
          srcset.split(",").map(async (part) => {
            const trimmed = part.trim();
            if (!trimmed) return "";
            const [url, descriptor] = trimmed.split(/\s+/, 2);
            const resolvedUrl = await resourceLoader(url, spineItem);
            return descriptor ? `${resolvedUrl} ${descriptor}` : resolvedUrl;
          })
        );
        img.setAttribute("srcset", parts.filter(Boolean).join(", "));
      }
    } catch (error) {
      // Ignore resource errors
    }
  }
}

export class EpubPaginator {
  constructor(spineItems = [], resourceLoader = null, settings = {}) {
    this.spineItems = spineItems;
    this.resourceLoader = resourceLoader;
    this.settings = normalizeSettings(settings);
    this.pages = [];
    this.pageStartIndexMap = [];
    this.measurement = null;
  }

  async paginate() {
    if (!document || !document.body) {
      throw new Error("EpubPaginator requires a browser DOM.");
    }
    this.pages = [];
    this.pageStartIndexMap = [];

    if (this.measurement) {
      this.measurement.container.remove();
    }
    this.measurement = createMeasurementContainer(this.settings);

    for (let spineIndex = 0; spineIndex < this.spineItems.length; spineIndex += 1) {
      const spineItem = this.spineItems[spineIndex];
      const parsed = new DOMParser().parseFromString(spineItem.htmlString || "", "text/html");
      const body = parsed.body;

      await resolveResources(body, this.resourceLoader, spineItem);
      const segments = createSegments(body);
      if (!segments.length) {
        continue;
      }

      const totalUnits = segments.length;
      let startIndex = 0;
      let pageCount = 0;
      let safetyCounter = 0;

      while (startIndex < totalUnits) {
        if (pageCount >= MAX_PAGES_PER_SPINE || safetyCounter > totalUnits + 5) {
          break;
        }
        const endIndex = await this.findFittingEndIndex(segments, startIndex, totalUnits);
        const safeEndIndex = Math.max(endIndex, startIndex + 1);
        const range = createRangeFromSegmentIndices(segments, startIndex, safeEndIndex);
        const htmlFragment = serializeRange(range);

        this.pages.push({
          spineIndex,
          withinSpineOffset: `s:${startIndex}`,
          htmlFragment,
          estimatedCharCount: htmlFragment.length
        });
        this.pageStartIndexMap.push({ spineIndex, startIndex });

        if (safeEndIndex <= startIndex) {
          startIndex += 1;
        } else {
          startIndex = safeEndIndex;
        }
        pageCount += 1;
        safetyCounter += 1;
      }
    }

    return {
      pages: this.pages,
      locatePage: this.locatePage.bind(this),
      getLocator: this.getLocator.bind(this)
    };
  }

  async findFittingEndIndex(segments, startIndex, totalUnits) {
    const { page } = this.measurement;
    let low = startIndex + 1;
    let high = totalUnits;
    let best = startIndex + 1;
    let iterations = 0;

    while (low <= high && iterations < MAX_BINARY_SEARCH_ITERATIONS) {
      const mid = Math.floor((low + high) / 2);
      const range = createRangeFromSegmentIndices(segments, startIndex, mid);
      const htmlFragment = serializeRange(range);
      const fits = await measureFits(page, htmlFragment, this.settings);

      if (fits) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
      iterations += 1;
    }

    const singleRange = createRangeFromSegmentIndices(segments, startIndex, startIndex + 1);
    const singleFragment = serializeRange(singleRange);
    let canFitSingle = false;
    for (let attempt = 0; attempt < MAX_FIT_ATTEMPTS; attempt += 1) {
      canFitSingle = await measureFits(page, singleFragment, this.settings);
      if (canFitSingle) break;
    }

    if (!canFitSingle) {
      return startIndex + 1;
    }

    return best;
  }

  locatePage(spineIndex, withinSpineOffset) {
    const offsetIndex = Number(String(withinSpineOffset).replace("s:", ""));
    if (Number.isNaN(offsetIndex)) return -1;

    let lastMatch = -1;
    for (let i = 0; i < this.pageStartIndexMap.length; i += 1) {
      const entry = this.pageStartIndexMap[i];
      if (entry.spineIndex !== spineIndex) continue;
      if (entry.startIndex <= offsetIndex) {
        lastMatch = i;
      } else {
        break;
      }
    }
    return lastMatch;
  }

  getLocator(pageIndex) {
    const page = this.pages[pageIndex];
    if (!page) return null;
    return {
      spineIndex: page.spineIndex,
      withinSpineOffset: page.withinSpineOffset
    };
  }

  async repaginate(nextSettings = {}) {
    this.settings = normalizeSettings({ ...this.settings, ...nextSettings });
    return this.paginate();
  }

  destroy() {
    if (this.measurement) {
      this.measurement.container.remove();
      this.measurement = null;
    }
  }
}

// Integration stub (example):
// const paginator = new EpubPaginator(spineItems, resourceLoader, settings);
// const pageModel = await paginator.paginate();
