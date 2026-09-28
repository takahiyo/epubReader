/** Construct inert novel markup from external HTML; never copy executable attributes or embedded documents. */
const ALLOWED_TAGS = new Set(['P', 'BR', 'RUBY', 'RT', 'RP', 'EM', 'STRONG', 'B', 'I', 'U', 'S', 'SPAN', 'DIV',
  'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'A', 'IMG']);
const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'TEMPLATE']);
const URL_PROTOCOLS = new Set(['https:', 'http:']);

/** Return a fragment preserving ruby and paragraphs while dropping active content. */
export function createNovelContent(html, baseUrl) {
  const source = new DOMParser().parseFromString(html, 'text/html');
  const fragment = document.createDocumentFragment();
  const copy = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent)); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || BLOCKED_TAGS.has(node.tagName)) return;
    if (!ALLOWED_TAGS.has(node.tagName)) { for (const child of node.childNodes) copy(child, parent); return; }
    const element = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === 'A' || node.tagName === 'IMG') {
      const attribute = node.tagName === 'A' ? 'href' : 'src';
      try {
        const raw = node.getAttribute(attribute);
        const url = raw && new URL(raw, baseUrl);
        if (url && URL_PROTOCOLS.has(url.protocol)) element.setAttribute(attribute, url.href);
      } catch { /* Invalid URLs are omitted while preserving visible text. */ }
      if (node.tagName === 'IMG') element.alt = node.getAttribute('alt') ?? '';
      if (node.tagName === 'A') element.rel = 'noreferrer noopener';
    }
    for (const child of node.childNodes) copy(child, element);
    parent.append(element);
  };
  for (const child of source.body.childNodes) copy(child, fragment);
  return fragment;
}
