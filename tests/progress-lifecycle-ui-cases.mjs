/**
 * Exercise actual app closures and visibility events without contacting a live service.
 * @param {Object} page Puppeteer page running the mock-authenticated application
 * @returns {Promise<void>} Rejects if saving or foreground restoration loses the current position
 */
export async function verifyProgressLifecycle(page) {
  await page.evaluate(async () => {
    const entry = document.querySelector('script[src*="assets/app.js"]').src;
    const { progressTest } = await import(entry);
    const { TIMING_CONFIG } = await import('/assets/constants.js');
    const reader = window.__testReader;
    const bookId = progressTest.getBookId();
    const saved = () => JSON.parse(localStorage.getItem('epubReader:data')).progress[bookId];
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const originalLocator = reader.getPageLocator;
    const originalPercentage = reader._calculateCurrentPercentage;
    const originalGoTo = reader.goTo;
    const initial = progressTest.getProgressSnapshot();
    let hidden = false;
    let jumps = 0;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
    reader.goTo = function (...args) { jumps++; return originalGoTo.apply(this, args); };
    try {
      progressTest.toggleAutoSync(false);
      const first = { spineIndex: 1, segmentIndex: 10 };
      const second = { spineIndex: 1, segmentIndex: 11 };
      reader.onProgress({ location: first, percentage: 50 });
      reader.onProgress({ location: second, percentage: 50 });
      check(saved().location.segmentIndex === 11, 'Same percentage must not discard a changed text location');

      // Cache a visible snapshot without saving, then simulate a DOM that becomes unmeasurable.
      const checkpoint = { spineIndex: 1, segmentIndex: 12 };
      progressTest.getProgressSnapshot({ location: checkpoint, percentage: 50 });
      hidden = true;
      reader.getPageLocator = () => { throw new Error('Hidden DOM must not be measured'); };
      reader._calculateCurrentPercentage = () => { throw new Error('Hidden scroll ratio must not be measured'); };
      document.dispatchEvent(new Event('visibilitychange'));
      check(saved().location.segmentIndex === 12, 'Sync OFF must still flush the last visible position');
      window.dispatchEvent(new Event('pagehide'));
      check(saved().location.segmentIndex === 12, 'pagehide must preserve the visible checkpoint');

      hidden = false;
      // Reopening the same book invalidates its old visible cache; persisted restoration wins.
      progressTest.getProgressSnapshot({ location: { spineIndex: 1, segmentIndex: 99 }, percentage: 50 });
      progressTest.resetLocalSaveTracking();
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      check(saved().location.segmentIndex === 12, 'Reopening must not reuse a stale visible cache');

      hidden = false;
      reader.getPageLocator = originalLocator;
      reader._calculateCurrentPercentage = originalPercentage;
      // A deliberate jump back to 0 must survive a forced save and background flush.
      reader.onProgress({ location: { spineIndex: 0, segmentIndex: 0 }, percentage: 0 });
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      check(saved().percentage === 0 && saved().location.segmentIndex === 0, 'A deliberate return to start is valid');

      hidden = false;
      reader.onProgress({ location: initial.location, percentage: initial.percentage });
      progressTest.toggleAutoSync(true);
      const before = reader.viewer.scrollTop;
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.FOREGROUND_SYNC_DELAY_MS + 500));
      check(jumps === 0, 'Foreground synchronization must not call goTo on the live reader');
      check(reader.viewer.scrollTop === before, 'Foreground synchronization must preserve the live scroll offset');
      check(document.getElementById('syncModal').classList.contains('hidden'), 'Foreground sync must not interrupt reading with a position dialog');
    } finally {
      reader.getPageLocator = originalLocator;
      reader._calculateCurrentPercentage = originalPercentage;
      reader.goTo = originalGoTo;
      delete document.hidden;
      delete document.visibilityState;
      progressTest.toggleAutoSync(true);
      reader.onProgress({ location: initial.location, percentage: initial.percentage });
    }
  });
}
