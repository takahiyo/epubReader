/**
 * Verify real Range geometry for long paragraphs, joined chapters and partial-spine fragments.
 * @param {Function} ReaderController Production controller
 * @returns {Promise<void>} Rejects if the exact text position or viewport offset drifts
 */
export async function runScrollAnchorCases(ReaderController) {
  const { captureScrollAnchor, restoreScrollAnchor, resolveScrollTarget } = await import('/assets/js/core/epub-scroll-anchor.js');
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const viewer = document.createElement('div');
  viewer.style.cssText = 'position:fixed;top:15px;left:15px;width:260px;height:180px;overflow:auto;border:1px solid black;font:16px/24px sans-serif;background:white;z-index:99999;';
  const container = document.createElement('div');
  const longText = Array.from({ length: 500 }, (_, i) => `word${i} A long paragraph keeps its reading position. `).join('');
  const firstHtml = `<h1>First chapter</h1><p>${longText}</p>`;
  const secondHtml = `<h1>Second chapter</h1><p>${longText}</p>`;
  container.innerHTML = `<div class="epub-scroll-nav-group" style="height:25px">Reader UI must not count as book text</div>
    <div class="joined-spine-item" data-spine-index="0" data-segment-start="0">${firstHtml}</div>
    <div class="joined-spine-item" data-spine-index="1" data-segment-start="0">${secondHtml}</div>`;
  viewer.append(container);
  document.body.append(viewer);
  try {
    const firstParagraph = container.querySelector('p');
    viewer.scrollTop = firstParagraph.offsetTop + firstParagraph.clientHeight / 2;
    await frame();
    const before = viewer.scrollTop;
    const anchor = captureScrollAnchor(viewer, container, 0);
    check(anchor.spineIndex === 0 && anchor.segmentIndex > 100, 'Long paragraph must capture a visible character, not its first segment');
    check(!anchor.visibleText.startsWith('First chapter') && !anchor.visibleText.includes('Reader UI'), 'Visible text must start near the current line and exclude navigation');
    viewer.scrollTop = 0;
    viewer.style.scrollBehavior = 'smooth';
    check(restoreScrollAnchor(viewer, container, anchor), 'Long paragraph anchor must resolve');
    check(Math.abs(viewer.scrollTop - before) <= 1, 'Restore must retain the same line and its screen offset');
    viewer.style.scrollBehavior = 'auto';

    // The controller must report chapter 1 even though the rendered page belongs to group chapter 0.
    const second = container.querySelector('[data-spine-index="1"]');
    viewer.scrollTop = second.offsetTop + second.querySelector('p').clientHeight / 2;
    await frame();
    const reader = Object.create(ReaderController.prototype);
    reader.viewer = viewer; reader.pageContainer = container;
    reader.type = 'epub'; reader.epubViewMode = 'scroll'; reader.writingMode = 'horizontal';
    reader.currentPageIndex = 0; reader.pagination = { pages: [{ spineIndex: 0, withinSpineOffset: 's:0' }] };
    reader._spineGroups = [{ start: 0, end: 1 }]; reader._lastValidScrollLocation = null;
    reader.spineItems = [{ htmlString: firstHtml }, { htmlString: secondHtml }];
    const joined = reader.getPageLocator(0);
    const secondBefore = viewer.scrollTop;
    check(joined.spineIndex === 1 && joined.segmentIndex > 100, 'Joined chapter must keep its own spine and segment');
    viewer.scrollTop = 0;
    await reader.goTo({ bookType: 'epub', location: { ...joined, visibleText: undefined } });
    check(Math.abs(viewer.scrollTop - secondBefore) <= 1, 'Controller numeric restoration must find a child spine inside its group');
    viewer.scrollTop = 0;
    await reader.goTo({ bookType: 'epub', location: joined });
    check(Math.abs(viewer.scrollTop - secondBefore) <= 24, 'Text-assisted restoration must stay within one line in a long paragraph');
    check(resolveScrollTarget(container, { spineIndex: 99, segmentIndex: 0 }) === null, 'Missing chapter must not resolve into another chapter');

    // A fragment starts at a nonzero global segment, even when its DOM text starts at zero.
    container.innerHTML = '<div class="joined-spine-item" data-spine-index="2" data-segment-start="200"><p>' + longText + '</p></div>';
    viewer.scrollTop = 800;
    await frame();
    const partial = captureScrollAnchor(viewer, container, 2);
    const partialBefore = viewer.scrollTop;
    check(partial.spineIndex === 2 && partial.segmentIndex > 200, 'Fragment must include the original spine segment offset');
    viewer.scrollTop = 0;
    check(restoreScrollAnchor(viewer, container, partial) && Math.abs(viewer.scrollTop - partialBefore) <= 1,
      'Partial-spine fragment must restore using global segment numbering');
    // Reflow changes line wrapping, but the same stable character can still be restored.
    viewer.style.width = '330px';
    await frame();
    check(restoreScrollAnchor(viewer, container, partial), 'Reflowed paragraph must retain its text anchor');
    const target = resolveScrollTarget(container, partial).getBoundingClientRect();
    check(Math.abs(target.top - (viewer.getBoundingClientRect().top + viewer.clientTop) - partial.viewportOffset) <= 1,
      'Reflow must preserve the saved character at the same screen height');

    // Exercise the real renderer: a later explicit jump must win over its queued initial frame.
    const rendered = Object.create(ReaderController.prototype);
    Object.assign(rendered, { viewer, type: 'epub', epubViewMode: 'scroll', writingMode: 'horizontal', currentPageIndex: 0,
      pagination: { pages: [{ spineIndex: 0, withinSpineOffset: 's:0', htmlFragment: firstHtml }] },
      resolveImagesInRenderedPage() {}, interceptInternalLinks() {}, updateEpubTheme() {}, injectImageZoom() {},
      injectScrollNavigationButtons() {} });
    viewer.style.overflowAnchor = 'none';
    rendered.bindEpubScrollEvents();
    rendered.renderEpubPage(0);
    rendered._scrollToPositionInDOM(rendered.pageContainer, 900, null, false, 0, 0);
    const jumped = viewer.scrollTop;
    await frame();
    check(jumped > 100 && Math.abs(viewer.scrollTop - jumped) <= 1, 'Queued render must not overwrite a newer explicit jump');
    const delayAnchor = rendered.getPageLocator(0);
    rendered.pageContainer.querySelector('h1').style.height = '400px';
    await frame();
    const delayed = resolveScrollTarget(rendered.pageContainer, delayAnchor).getBoundingClientRect();
    check(Math.abs(delayed.top - (viewer.getBoundingClientRect().top + viewer.clientTop) - delayAnchor.viewportOffset) <= 1,
      'Late content-size changes must preserve the same glyph, not the paragraph start');
    viewer.scrollTop += 200;
    viewer.dispatchEvent(new Event('scroll'));
    check(rendered._scrollRestoration === null, 'User scrolling must cancel late restoration to the previous reading position');
    rendered._resizeObserver.disconnect();

    // A media-only anchor keeps the scrolled part of a tall image visible.
    container.innerHTML = '<div class="joined-spine-item" data-spine-index="3" data-segment-start="0"><img width="200" height="480"><p>Caption</p></div>';
    viewer.replaceChildren(container);
    viewer.scrollTop = 200;
    const mediaAnchor = captureScrollAnchor(viewer, container, 3);
    const mediaTop = viewer.scrollTop;
    check(mediaAnchor.spineIndex === 3 && mediaAnchor.segmentIndex === 0, 'Images count as one stable content segment');
    viewer.scrollTop = 0;
    check(restoreScrollAnchor(viewer, container, mediaAnchor) && Math.abs(viewer.scrollTop - mediaTop) <= 1,
      'Tall-image restoration must preserve the visible portion of the image');
  } finally {
    viewer.remove();
  }
}
