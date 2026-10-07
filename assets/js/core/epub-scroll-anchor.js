/** EPUB scroll anchors: measure glyph ranges and restore within the original spine. */
import { READER_CONFIG, SCROLL_ANCHOR_CONFIG } from '../../constants.js';

/**
 * Walk the same text/media units used by the paginator, excluding reader navigation.
 * @param {Element} container Spine DOM
 * @returns {TreeWalker} Walker over text and atomic media
 */
function contentWalker(container) {
  return container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const parent = node.parentElement || node;
      if (parent.closest?.(SCROLL_ANCHOR_CONFIG.excludedSelector)) return NodeFilter.FILTER_REJECT;
      if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      return SCROLL_ANCHOR_CONFIG.mediaTags.includes(node.tagName?.toLowerCase())
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
}

/** @param {Node} node Text node @param {number} offset Character offset @returns {Range} One character's range */
function characterRange(node, offset) {
  const range = node.ownerDocument.createRange();
  const start = Math.min(Math.max(0, offset), node.textContent.length - 1);
  range.setStart(node, start);
  range.setEnd(node, start + 1);
  return range;
}

/** @param {Element} viewer Scroll viewport @returns {Object} Inner viewport bounds */
function viewportRect(viewer) {
  const rect = viewer.getBoundingClientRect();
  const top = rect.top + viewer.clientTop;
  const left = rect.left + viewer.clientLeft;
  return { top, left, bottom: top + viewer.clientHeight, right: left + viewer.clientWidth };
}

/** @param {Object} rect Content rectangle @param {Object} viewport Viewport @returns {boolean} Visible intersection */
function intersects(rect, viewport) {
  return rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom &&
    rect.right > viewport.left && rect.left < viewport.right;
}

/**
 * Find the first visible line inside a potentially very long text node in logarithmic time.
 * @param {Text} node Text node
 * @param {Object} viewport Scroll bounds
 * @returns {number|null} Character on the first visible line, or null for hidden text
 */
function visibleOffset(node, viewport) {
  const full = node.ownerDocument.createRange();
  full.selectNodeContents(node);
  if (!intersects(full.getBoundingClientRect(), viewport)) return null;
  let low = 0;
  let high = node.textContent.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const rect = characterRange(node, middle).getBoundingClientRect();
    if (rect.bottom <= viewport.top) low = middle + 1;
    else high = middle;
  }
  return intersects(characterRange(node, low).getBoundingClientRect(), viewport) ? low : null;
}

/**
 * Capture an existing numeric segment locator plus a device-local viewport offset.
 * @param {Element} viewer Horizontal-writing scroll viewport
 * @param {Element} container Rendered EPUB page
 * @param {number} fallbackSpineIndex Chapter when no joined wrapper exists
 * @returns {Object|null} {spineIndex, segmentIndex, viewportOffset, visibleText?}
 */
export function captureScrollAnchor(viewer, container, fallbackSpineIndex) {
  if (!viewer || !container || container.ownerDocument.hidden || viewer.clientHeight <= 0 || viewer.clientWidth <= 0) return null;
  const viewport = viewportRect(viewer);
  const joined = [...container.querySelectorAll(SCROLL_ANCHOR_CONFIG.spineSelector)];
  const scopes = joined.length ? joined : [container];
  for (const scope of scopes) {
    if (!intersects(scope.getBoundingClientRect(), viewport)) continue;
    const spineIndex = scope.dataset.spineIndex != null ? Number(scope.dataset.spineIndex) : fallbackSpineIndex;
    if (!Number.isFinite(spineIndex)) continue;
    let segment = Number(scope.dataset.segmentStart) || 0;
    const walker = contentWalker(scope);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const offset = visibleOffset(node, viewport);
        if (offset !== null) {
          const withinNode = Math.floor(offset / READER_CONFIG.TEXT_SEGMENT_STEP);
          const character = withinNode * READER_CONFIG.TEXT_SEGMENT_STEP;
          const rect = characterRange(node, character).getBoundingClientRect();
          // A short node may not contain enough text for matching; append following text in this spine.
          let text = node.textContent.slice(character);
          let next;
          while (text.length < SCROLL_ANCHOR_CONFIG.textLength && (next = walker.nextNode())) {
            if (next.nodeType === Node.TEXT_NODE) text += next.textContent;
          }
          return { spineIndex, segmentIndex: segment + withinNode, viewportOffset: rect.top - viewport.top,
            visibleText: text.replace(/\s+/g, ' ').trim().slice(0, SCROLL_ANCHOR_CONFIG.textLength) };
        }
        segment += Math.ceil(node.textContent.length / READER_CONFIG.TEXT_SEGMENT_STEP);
      } else {
        const rect = node.getBoundingClientRect();
        if (intersects(rect, viewport)) return { spineIndex, segmentIndex: segment, viewportOffset: rect.top - viewport.top };
        segment++;
      }
    }
  }
  return null;
}

/**
 * Resolve a segment to its exact text Range or media element without changing the DOM.
 * @param {Element} container Rendered page
 * @param {Object} locator Spine and segment, with optional viewportOffset
 * @returns {Range|Element|null} Geometry target, null if that spine/segment is absent
 */
export function resolveScrollTarget(container, locator) {
  if (!container || !Number.isFinite(locator?.segmentIndex) || locator.segmentIndex < 0) return null;
  const joined = [...container.querySelectorAll(SCROLL_ANCHOR_CONFIG.spineSelector)];
  const scope = joined.length ? joined.find(item => Number(item.dataset.spineIndex) === locator.spineIndex) : container;
  if (!scope) return null;
  let segment = Number(scope.dataset.segmentStart) || 0;
  const walker = contentWalker(scope);
  let node;
  while ((node = walker.nextNode())) {
    const count = node.nodeType === Node.TEXT_NODE ? Math.ceil(node.textContent.length / READER_CONFIG.TEXT_SEGMENT_STEP) : 1;
    if (locator.segmentIndex >= segment && locator.segmentIndex < segment + count) {
      return node.nodeType === Node.TEXT_NODE
        ? characterRange(node, (locator.segmentIndex - segment) * READER_CONFIG.TEXT_SEGMENT_STEP) : node;
    }
    segment += count;
  }
  return null;
}

/**
 * Align a Range or media rectangle to a chosen height inside this viewer only.
 * @param {Element} viewer Scroll viewport
 * @param {Range|Element} target Text/media target
 * @param {number} offset Desired pixel offset from viewport top
 * @returns {boolean} Whether the target has measurable geometry
 */
export function alignScrollTarget(viewer, target, offset = 0) {
  if (!viewer || !target) return false;
  const rect = target.getBoundingClientRect();
  if (rect.height <= 0) return false;
  // scrollTop assignment inherits CSS smooth scrolling, which leaves capture at the old position.
  viewer.scrollTo({ top: viewer.scrollTop + rect.top - viewportRect(viewer).top - offset, behavior: 'instant' });
  return true;
}

/**
 * Restore a saved local offset; cloud/legacy anchors without it align to the viewport top.
 * @param {Element} viewer Scroll viewport
 * @param {Element} container Rendered page
 * @param {Object} locator Stable position
 * @returns {boolean} Whether restoration succeeded
 */
export function restoreScrollAnchor(viewer, container, locator) {
  return alignScrollTarget(viewer, resolveScrollTarget(container, locator), Number.isFinite(locator?.viewportOffset) ? locator.viewportOffset : 0);
}
