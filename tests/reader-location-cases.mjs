/** Browser regressions for repeated text, legacy locators and overlapping repagination. */
export async function runReaderLocationCases(ReaderController) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const reader = Object.create(ReaderController.prototype);
  const phrase = '同じ文章が何度も繰り返される場合にも、保存した本文の近くへ戻ります。';
  const container = document.createElement('div');
  container.innerHTML = Array.from({ length: 10 }, (_, i) => `<p id="occurrence-${i}"><img>${phrase}</p>`).join('');
  reader.spineItems = [{ htmlString: container.innerHTML }];
  const item = reader.spineItems[0];
  const last = reader.findSearchMatchesInSpine(item, phrase, Number.MAX_SAFE_INTEGER)[0];
  check(last.matchIndex === phrase.length * 9, 'Must consider repetitions beyond the first five');
  check(reader.resolveLocationByText(0, phrase, 'test', last.segmentIndex) === last.segmentIndex,
    'Text restoration must select the occurrence nearest the saved segment');
  check(reader.findSearchMatchesInSpine(item, phrase).length === 5, 'Normal search keeps its display limit');
  check(reader._findTextInDOM(container, phrase, last.segmentIndex)[0].node.parentElement.id === 'occurrence-9',
    'DOM scrolling must use the same repeated-text occurrence and count images');
  check(reader._findTextInDOM(container, phrase, 0)[0].node.parentElement.id === 'occurrence-0',
    'Zero is a valid saved location');
  check(reader._findTextInDOM(container, phrase)[0].node.parentElement.id === 'occurrence-0',
    'Unhinted DOM search stays compatible');
  const normalized = document.createElement('div');
  normalized.innerHTML = '<p>Ａ <em>Ｂ</em>　Ｃ</p>';
  const normalizedMatches = reader._findTextInDOM(normalized, 'ABC', 0);
  check(normalizedMatches.length === 3 && normalizedMatches[2].matchEnd === 2,
    'Normalized text matching preserves the full original range across tags and spaces');
  reader.paginationComplete = true;
  reader.epubViewMode = 'paginated';
  reader.pagination = { pages: [
    { spineIndex: 0, withinSpineOffset: 's:20' },
    { spineIndex: 0, withinSpineOffset: 's:40' },
    { spineIndex: 0, withinSpineOffset: 's:' + last.segmentIndex },
  ] };
  check(reader.resolveStartPageIndexIfReady({ spineIndex: 0, segmentIndex: last.segmentIndex, visibleText: phrase }, 3) === 2,
    'Old unwrapped locators must retain their text and segment hint');
  check(reader.resolveStartPageIndexIfReady({ location: { spineIndex: 0, segmentIndex: 5 }, visibleText: 'missing text' }, 3) === 0,
    'Out-of-bound locations choose the nearest page within the original chapter');
  check(reader.findNearestPageInSpine(99, 5) === -1, 'Fallback must never select another chapter');

  // A valid zero is a user navigation, not evidence of a broken background measurement.
  reader.epubViewMode = 'scroll';
  reader.currentPageIndex = 0;
  reader.pageContainer = container;
  reader._captureScrollAnchor = () => ({ spineIndex: 0, segmentIndex: 0 });
  reader.getCurrentVisibleText = () => null;
  reader._lastValidScrollLocation = { spineIndex: 0, segmentIndex: 80 };
  reader._lastValidScrollRatio = 0.75;
  reader.writingMode = 'horizontal';
  reader.viewer = { scrollTop: 0, scrollHeight: 2000, clientHeight: 600 };
  check(reader.getPageLocator(0).segmentIndex === 0, 'Visible chapter start must not reuse a stale segment');
  check(reader._calculateCurrentPercentage(3) === 0, 'Visible scroll start must not reuse a stale ratio');
  reader.updateProgressFromPagination(3);
  check(reader._lastValidScrollLocation.segmentIndex === 0, 'The last valid anchor must include explicit start navigation');

  // Deferred paginator boundaries make the race deterministic without real device timing.
  const resizer = Object.create(ReaderController.prototype);
  const releases = [];
  const anchor = { spineIndex: 1, segmentIndex: 150 };
  let captures = 0;
  let completions = 0;
  let restored = null;
  resizer.type = 'epub';
  resizer.repaginationRequestId = 0;
  resizer._resizeAnchor = null;
  resizer.paginator = { pages: [{ spineIndex: 1, withinSpineOffset: 's:140' }],
    repaginate: () => new Promise(resolve => releases.push(resolve)) };
  resizer.getPageLocator = () => { captures++; return anchor; };
  resizer.getPaginationViewportMetrics = () => ({});
  resizer.getPaddings = () => ({ hPad: 0, vPad: 0 });
  resizer.resolveStartPageIndexIfReady = location => { restored = location.location; return 0; };
  resizer.pageController = { setTotalPages() {}, goTo() {} };
  resizer.onRepaginationEnd = () => completions++;
  const first = resizer.handleResize();
  const second = resizer.handleResize();
  check(captures === 1 && resizer.isRepaginating, 'Overlapping resizes capture the reading anchor only once');
  releases[0](); await first;
  check(completions === 0 && resizer.isRepaginating, 'Stale completion must not release the latest resize');
  releases[1](); await second;
  check(restored === anchor && completions === 1 && !resizer.isRepaginating,
    'Latest resize restores the original anchor and clears its state');
  resizer.paginator.repaginate = async () => { const error = new Error('cancelled'); error.name = 'PaginationCancelledError'; throw error; };
  await resizer.handleResize();
  check(!resizer.isRepaginating && resizer._resizeAnchor === null, 'Cancelled latest resize must clear its state');
  return true;
}
