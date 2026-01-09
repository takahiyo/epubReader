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
 *     withinSpineOffset: string, // "u:<unitIndex>" (stable locator)
 *     htmlFragment: string,
 *     estimatedCharCount?: number
 *   }>
 * - locatePage(spineIndex, withinSpineOffset) -> pageIndex
 * - getLocator(pageIndex) -> { spineIndex, withinSpineOffset }
 *
 * Measurement strategy:
 * - Uses a hidden container sized to the viewport, applies base CSS, and measures
 *   overflow by injecting candidate fragments into a page element.
 * - Uses binary search on unit offsets to find the largest fragment that fits.
 * - Guards against infinite loops with max iterations and progress checks.
 */

const DEFAULTS = {
  viewportWidth: 800,
  viewportHeight: 600,
  fontSize: "16px",
  writingMode: "horizontal-tb",
  lineHeight: 1.6,
  margin: "0",
  padding: "16px"
};

const MAX_BINARY_SEARCH_ITERATIONS = 24;
const MAX_PAGES_PER_SPINE = 5000;
const MIN_TEXT_UNIT_STEP = 24;

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

function positionForIndex(segments, index) {
  if (index <= 0) {
    return { node: segments[0]?.node, offset: segments[0]?.type === "text" ? segments[0].start : 0, type: segments[0]?.type };
  }
  let remaining = index;
  for (const segment of segments) {
    const length = segment.type === "text" ? segment.end - segment.start : 1;
    if (remaining <= length) {
      if (segment.type === "text") {
        return { node: segment.node, offset: segment.start + remaining - 0, type: "text" };
      }
      return { node: segment.node, offset: remaining >= 1 ? 1 : 0, type: "element" };
    }
    remaining -= length;
  }
  const last = segments[segments.length - 1];
  if (!last) return null;
  if (last.type === "text") {
    return { node: last.node, offset: last.end, type: "text" };
  }
  return { node: last.node, offset: 1, type: "element" };
}

function createRangeFromUnits(segments, startIndex, endIndex) {
  if (!segments.length) return null;
  const range = document.createRange();
  const startPos = positionForIndex(segments, startIndex);
  const endPos = positionForIndex(segments, endIndex);
  if (!startPos || !endPos) return null;

  if (startPos.type === "element") {
    if (startPos.offset === 0) {
      range.setStartBefore(startPos.node);
    } else {
      range.setStartAfter(startPos.node);
    }
  } else {
    range.setStart(startPos.node, startPos.offset);
  }

  if (endPos.type === "element") {
    if (endPos.offset === 0) {
      range.setEndBefore(endPos.node);
    } else {
      range.setEndAfter(endPos.node);
    }
  } else {
    range.setEnd(endPos.node, endPos.offset);
  }

  return range;
}

function serializeRange(range) {
  if (!range) return "";
  const wrapper = document.createElement("div");
  wrapper.appendChild(range.cloneContents());
  return wrapper.innerHTML;
}

function measureFits(pageElement, htmlFragment, settings) {
  pageElement.innerHTML = htmlFragment;
  const overflowWidth = pageElement.scrollWidth - pageElement.clientWidth;
  const overflowHeight = pageElement.scrollHeight - pageElement.clientHeight;
  if (settings.writingMode === "vertical-rl") {
    return overflowWidth <= 1 && overflowHeight <= 1;
  }
  return overflowHeight <= 1 && overflowWidth <= 1;
}

async function resolveResources(body, resourceLoader, spineItem) {
  if (!resourceLoader) return;
  const images = Array.from(body.querySelectorAll("img"));
  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src) continue;
    try {
      const resolved = await resourceLoader(src, spineItem);
      if (resolved) img.setAttribute("src", resolved);
    } catch (error) {
      // Ignore resource errors to keep pagination resilient.
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

      const totalUnits = segments.reduce((sum, segment) => {
        return sum + (segment.type === "text" ? segment.end - segment.start : 1);
      }, 0);

      let startIndex = 0;
      let pageCount = 0;

      while (startIndex < totalUnits) {
        if (pageCount > MAX_PAGES_PER_SPINE) {
          break;
        }
        const endIndex = this.findFittingEndIndex(segments, startIndex, totalUnits);
        const safeEndIndex = Math.max(endIndex, startIndex + 1);
        const range = createRangeFromUnits(segments, startIndex, safeEndIndex);
        const htmlFragment = serializeRange(range);

        this.pages.push({
          spineIndex,
          withinSpineOffset: `u:${startIndex}`,
          htmlFragment,
          estimatedCharCount: safeEndIndex - startIndex
        });
        this.pageStartIndexMap.push({ spineIndex, startIndex });

        if (safeEndIndex <= startIndex) {
          break;
        }
        startIndex = safeEndIndex;
        pageCount += 1;
      }
    }

    return {
      pages: this.pages,
      locatePage: this.locatePage.bind(this),
      getLocator: this.getLocator.bind(this)
    };
  }

  findFittingEndIndex(segments, startIndex, totalUnits) {
    const { page } = this.measurement;
    let low = startIndex + 1;
    let high = totalUnits;
    let best = low;
    let iterations = 0;

    while (low <= high && iterations < MAX_BINARY_SEARCH_ITERATIONS) {
      const mid = Math.floor((low + high) / 2);
      const range = createRangeFromUnits(segments, startIndex, mid);
      const htmlFragment = serializeRange(range);
      const fits = measureFits(page, htmlFragment, this.settings);

      if (fits) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
      iterations += 1;
    }

    return best;
  }

  locatePage(spineIndex, withinSpineOffset) {
    const offsetIndex = Number(String(withinSpineOffset).replace("u:", ""));
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
