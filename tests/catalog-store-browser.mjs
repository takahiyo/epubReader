/** Verify catalog durability and atomic rollback in Chrome's actual IndexedDB. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    if (pathname === '/') return res.end('<!doctype html><title>Catalog test</title>');
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_EXECUTABLE,
    headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('Catalog page error:', error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async () => {
    const { openCatalog } = await import('/assets/js/core/catalog-store.js');
    const { catalogRecord } = await import('/assets/js/core/catalog-model.js');
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const repository = await openCatalog({ databaseName: 'catalog-test' });
    localStorage.setItem('epubReader:data', JSON.stringify({ bookmarks: { old: ['keep'] } }));
    const original = localStorage.getItem('epubReader:data');
    const legacy = { library: { a: { title: 'One', type: 'epub' } } };
    let sequence = 0;
    const options = { now: 100, uuid: () => `test-${++sequence}` };
    await Promise.all([repository.migrateLegacy(legacy, options), repository.migrateLegacy(legacy, options)]);
    const snapshot = await repository.read();
    check(snapshot.holdings.length === 1, 'Concurrent migration must not duplicate records');
    const holding = snapshot.holdings[0];
    holding.provider = 'kindle'; holding.access_type = 'subscription_loan'; holding.availability_status = 'returned';
    const common = id => catalogRecord(() => id, 100);
    snapshot.access_periods.push({ ...common('loan'), holding_id: holding.id, started_at: 100, ended_at: 500, end_reason: 'returned' });
    snapshot.reading_events.push({ ...common('event'), holding_id: holding.id, access_period_id: 'loan', event_type: 'completed', occurred_at: 400, recorded_at: 400, progress_percent: 100 });
    snapshot.manual_reading_states.push({ ...common('state'), holding_id: holding.id, status: 'completed', progress_percent: 100, reread_wanted: true });
    await repository.restoreJSON(JSON.stringify(snapshot));
    const backup = await repository.exportJSON();
    const invalid = structuredClone(snapshot); invalid.holdings[0].book_id = 'absent';
    let failed = false;
    try { await repository.restoreJSON(JSON.stringify(invalid)); } catch { failed = true; }
    check(failed && await repository.exportJSON() === backup, 'Invalid restore must retain all persisted records');

    // Fail after clear/put requests have been queued: the whole transaction must roll back.
    const put = IDBObjectStore.prototype.put;
    let puts = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (++puts === 3) throw new DOMException('Injected failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
    failed = false;
    try { await repository.restoreJSON(backup); } catch { failed = true; }
    finally { IDBObjectStore.prototype.put = put; }
    check(failed && await repository.exportJSON() === backup, 'Write failure must roll back clears and earlier writes');
    repository.close();
    const reopened = await openCatalog({ databaseName: 'catalog-test' });
    check(await reopened.exportJSON() === backup, 'Reopening must preserve returned KU history and progress');
    check(localStorage.getItem('epubReader:data') === original, 'Reader storage must remain untouched');
    reopened.close();
  });
  console.log('PASS: IndexedDB concurrent migration, KU history round trip, invalid import, atomic write rollback and reopen');
  await page.evaluate(async () => {
    const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = '/assets/style.css';
    const loaded = new Promise((resolve, reject) => { stylesheet.onload = resolve; stylesheet.onerror = reject; });
    document.head.append(stylesheet); await loaded;
    try {
      const { runCatalogUICases } = await import('/tests/catalog-ui-cases.mjs'); await runCatalogUICases();
    } catch (error) { console.error(error.stack); throw error; }
  });
  console.log('PASS: catalog registration, multi-provider volume, normalized search, KU return/reborrow, safe URL and reopening');
  for (const [width, height] of [[320, 568], [568, 320], [1440, 900]]) {
    await page.setViewport({ width, height });
    const bounds = await page.evaluate(() => {
      const panel = document.querySelector('.catalog-panel'); const rect = panel.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, overflow: panel.scrollWidth - panel.clientWidth };
    });
    if (bounds.left < 0 || bounds.right > width + 1 || bounds.top < 0 || bounds.bottom > height + 1 || bounds.overflow > 1) throw new Error(JSON.stringify({ width, height, bounds }));
    await page.screenshot({ path: path.join(root, 'scratch/review-fixtures', `catalog-${width}.png`) });
  }
  console.log('PASS: catalog fits narrow phone, landscape phone and desktop');
  const performanceResult = await page.evaluate(async () => {
    const { openCatalog } = await import('/assets/js/core/catalog-store.js');
    const { emptyCatalog, catalogRecord } = await import('/assets/js/core/catalog-model.js');
    const { CATALOG_UI: U, CATALOG_CONFIG: C } = await import('/assets/constants.js');
    const repository = await openCatalog(); const snapshot = emptyCatalog();
    for (let index = 0; index < 10000; index++) {
      snapshot.books.push({ ...catalogRecord(() => `large-book-${index}`, 100), title: `Book ${index}`, sort_order: index, volume_label: String(index) });
      snapshot.holdings.push({ ...catalogRecord(() => `large-holding-${index}`, 100), book_id: `large-book-${index}`,
        provider: 'kindle', access_type: 'purchased', availability_status: 'active' });
    }
    await repository.restoreJSON(JSON.stringify(snapshot)); repository.close();
    window.__catalogTest.close(); await window.__catalogTest.show();
    const visible = document.getElementById(U.list).querySelectorAll('article').length;
    if (visible !== C.pageSize) throw new Error('Large catalog must use bounded pagination');
    const search = document.getElementById(U.search); const started = performance.now();
    search.value = 'Book 9999'; search.dispatchEvent(new Event('input'));
    const elapsed = performance.now() - started;
    if (document.getElementById(U.list).querySelectorAll('article').length !== 1) throw new Error('Large catalog search result missing');
    if (elapsed > 300) throw new Error(`Search exceeds target: ${elapsed}ms`);
    return { books: 10000, visible, searchMs: Math.round(elapsed) };
  });
  console.log('PASS: 10,000-book paginated catalog search', performanceResult);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
