/** Headless browser smoke checks. Uses installed Puppeteer; no live account or cloud API is contacted. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer';
import { verifyShareDialog } from './share-dialog-ui-cases.mjs';
import { verifyReaderControls } from './reader-controls-ui-cases.mjs';
import { verifyHelp } from './help-ui-cases.mjs';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/__test.html') {
      res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Reader offline test</title>'); return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let body = await fs.readFile(file);
    if (pathname.endsWith('sw-cache-config.json')) {
      const config = JSON.parse(body);
      // Test local runtime caching without contacting public CDNs.
      config.assets = [...config.assets.filter(url => url.startsWith('./')), './__test.html'];
      body = Buffer.from(JSON.stringify(config));
    }
    res.setHeader('content-type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html',
      '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' })[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE,
    pipe: true, userDataDir: path.join(root, 'scratch', 'review-browser-profile-' + process.pid) });
  console.log('Browser launched');
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin + '/__test.html');
  console.log('Local test page opened');
  const result = await page.evaluate(async () => {
    const { createNovelContent } = await import('/assets/js/core/novel-content.js');
    const container = document.createElement('div');
    container.append(createNovelContent('<p onclick="alert(1)">Text<ruby>漢<rt>かん</rt></ruby><img src="javascript:alert(1)" onerror="alert(1)"><svg onload="alert(1)"></svg><script>alert(1)</script><a href="javascript:alert(1)">link</a></p>', 'https://example.test/chapter'));
    document.body.append(container);
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    return { ruby: container.querySelector('rt')?.textContent,
      unsafe: !!container.querySelector('script,svg,[onclick],[onerror],[src],[href]') };
  });
  assert.equal(result.ruby, 'かん'); assert.equal(result.unsafe, false);
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const offline = await page.evaluate(async () => {
    const urls = ['/assets/app.js?v=18', '/assets/cloudState.js', '/src/reader/epubPaginator.js',
      '/assets/constants/keybindings.js', '/assets/js/workers/rar-worker.js', '/assets/css/22-float-menu-toggle.css',
      '/assets/css/23-reader-controls.css', '/assets/js/ui/dialog-focus.js', '/assets/icons/reader-controls.svg'];
    return Promise.all(urls.map(async url => ({ url, status: (await fetch(url)).status })));
  });
  for (const item of offline) assert.equal(item.status, 200, item.url);
  console.log('PASS: safe novel markup, offline reload, versioned assets and nine required runtime dependencies');

  await page.setOfflineMode(false);
  await page.evaluate(async () => { for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister(); });
  const app = await browser.newPage();
  // Offline worker behavior is tested above; keep app requests inside the network mocks.
  await app.setBypassServiceWorker(true);
  await app.setViewport({ width: 800, height: 600, hasTouch: true });
  const errors = [];
  const require = createRequire(import.meta.url);
  const JSZip = require('../scratch/review-fixtures/jszip.cjs');
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/package.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test-handoff</dc:identifier><dc:title>Handoff fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-09-28T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${[0, 1, 2].map(i => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${[0, 1, 2].map(i => `<itemref idref="c${i}"/>`).join('')}</spine></package>`);
  zip.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>' + [0, 1, 2].map(i => `<li><a href="c${i}.xhtml">Chapter ${i}</a></li>`).join('') + '</ol></nav></body></html>');
  for (const i of [0, 1, 2]) zip.file(`OPS/c${i}.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${i}</title></head><body><h1>Chapter ${i}</h1>${Array.from({ length: 45 }, (_, j) => `<p>Chapter ${i}, paragraph ${j}. This is a reading position regression fixture with enough text to span several pages.</p>`).join('')}</body></html>`);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const fixture = path.join(root, 'scratch/review-fixtures/handoff.epub');
  await fs.writeFile(fixture, bytes);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const libraryScripts = {
    jszip: await fs.readFile(path.join(root, 'scratch/review-fixtures/jszip.cjs'), 'utf8'),
    epub: await fs.readFile(path.join(root, 'scratch/review-fixtures/epub.js'), 'utf8'),
  };
  // Legacy metadata intentionally omits cloudBookId; the map key must restore it.
  const remoteIndex = { existing: { title: 'Handoff fixture', fingerprints: [hash], updatedAt: 100 } };
  const remoteState = { progress: 50, lastCfi: { spineIndex: 1, segmentIndex: 0 }, progressUpdatedAt: 100,
    updatedAt: 100, writingMode: 'horizontal-tb', epubViewMode: 'paginated', bookmarks: [{ location: { spineIndex: 1, segmentIndex: 0 }, percentage: 50, createdAt: 100 }] };
  const remoteStates = { existing: remoteState };
  app.on('pageerror', error => errors.push(error.message));
  app.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  await app.setRequestInterception(true);
  app.on('request', request => {
    if (request.url().startsWith(origin)) return request.continue();
    if (request.url().includes('.workers.dev')) {
      const route = new URL(request.url()).searchParams.get('path');
      const payload = request.postData() ? JSON.parse(request.postData()) : {};
      const data = route === '/sync/index/pull' ? remoteIndex : route === '/sync/state/pull'
        ? remoteStates[payload.cloudBookId] ?? {} : { success: true };
      return request.respond({ status: 200, contentType: 'application/json', headers: {
        'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
      }, body: JSON.stringify({ data }) });
    }
    let body = '';
    if (request.url().includes('jszip')) body = libraryScripts.jszip;
    if (request.url().includes('epubjs')) body = libraryScripts.epub;
    if (request.url().endsWith('firebase-app.js')) body = 'export const initializeApp = () => ({});';
    if (request.url().endsWith('firebase-auth.js')) body = `const auth={currentUser:{uid:'test',getIdToken:async()=> 'fixture-token'},authStateReady:async()=>{}};
      export const getAuth=()=>auth; export class GoogleAuthProvider {static credential(){return {}}}
      export const signInWithCredential=async()=>{};export const signInWithPopup=async()=>{};
      export const signOut=async()=>{};export const onAuthStateChanged=(a,fn)=>{setTimeout(()=>fn(a.currentUser),0);return ()=>{}};`;
    return request.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
  });
  await app.goto(origin, { waitUntil: 'networkidle0' });
  assert.deepEqual(errors, []);
  assert.ok(await app.$('#fileInput'));
  console.log('PASS: main application starts with mocked authentication and cloud API');
  await app.evaluate(async () => {
    const { ReaderController } = await import('/assets/reader.js');
    const { runReaderLocationCases } = await import('/tests/reader-location-cases.mjs');
    await runReaderLocationCases(ReaderController);
  });
  console.log('PASS: repeated text, DOM scroll targets, legacy locators, nearest fallback and overlapping resize regressions');
  await app.evaluate(async () => {
    const { ReaderController } = await import('/assets/reader.js');
    const original = ReaderController.prototype.openEpub;
    ReaderController.prototype.openEpub = async function (...args) {
      window.__testReader = this;
      window.__testOpenStarted = true;
      window.__testOpenResizeCalls = window.__testResizeCalls;
      await new Promise(resolve => { window.__testReleaseOpen = resolve; });
      return original.apply(this, args);
    };
    const originalResize = ReaderController.prototype.handleResize;
    window.__testResizeCalls = 0;
    ReaderController.prototype.handleResize = function (...args) {
      window.__testResizeCalls++;
      return originalResize.apply(this, args);
    };
  });
  await (await app.$('#fileInput')).uploadFile(fixture);
  await app.waitForFunction(() => !document.getElementById('syncModal').classList.contains('hidden'));
  await app.click('#syncUseRemote');
  await app.waitForFunction(() => window.__testOpenStarted);
  await app.setViewport({ width: 390, height: 844, hasTouch: true });
  await app.evaluate(async () => {
    const { TIMING_CONFIG } = await import('/assets/constants.js');
    await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.RESIZE_DEBOUNCE_MS * 2));
    if (window.__testResizeCalls !== window.__testOpenResizeCalls) throw new Error('Resize ran before file restoration');
    window.__testReleaseOpen();
  });
  await app.waitForFunction(() => window.__testResizeCalls > window.__testOpenResizeCalls && !window.__testReader.isRepaginating);
  await app.waitForFunction(() => window.__testReader?.pagination?.pages?.length > 0 &&
    !document.getElementById('loadingOverlay').classList.contains('visible'), { timeout: 30000 });
  // Loading can finish before asynchronous reading-state restoration; assert the resulting locator.
  await app.waitForFunction(() => window.__testReader?.getPageLocator(window.__testReader.currentPageIndex)?.spineIndex === 1);
  const loaded = await app.evaluate(hash => {
    const saved = JSON.parse(localStorage.getItem('epubReader:data'));
    const reader = window.__testReader;
    return { linked: saved.bookLinkMap[hash], bookmarkCount: saved.bookmarks[hash]?.length,
      page: reader.currentPageIndex, locator: reader.getPageLocator(reader.currentPageIndex) };
  }, hash);
  assert.deepEqual(errors, []);
  assert.equal(loaded.linked, 'existing'); assert.equal(loaded.bookmarkCount, 1);
  assert.ok(loaded.page > 0); assert.equal(loaded.locator.spineIndex, 1);
  console.log('PASS: EPUB selection and viewport change during loading restore remote position and bookmarks');
  // Exercise the actual Reading Log click and clipboard path, not just the formatter.
  await app.evaluate(() => document.getElementById('leftLangJa').click());
  const readingLog = await app.evaluate(async () => {
    let copied;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async value => { copied = value; } });
    const pageIndex = window.__testReader.currentPageIndex;
    document.getElementById('share-log-btn').click();
    return { copied, page: pageIndex + 1 };
  });
  assert.ok(readingLog.copied.startsWith('---\n'));
  assert.ok(readingLog.copied.includes('作品: "[[handoff]]"'));
  assert.ok(readingLog.copied.includes('書籍ID: "existing"'));
  assert.ok(readingLog.copied.includes('ページ: ' + readingLog.page + '\n'));
  assert.equal(readingLog.copied.split('\n---\n')[1], '\n## 感想・メモ\n');
  await app.evaluate(() => document.getElementById('leftLangEn').click());
  console.log('PASS: Japanese Reading Log copies localized properties, current page and a notes-only body');
  // Native-share choices use the same Markdown and must remain usable in a short window.
  await app.setViewport({ width: 568, height: 320, hasTouch: true });
  await app.evaluate(async () => {
    const { toggleFloatOverlay } = await import('/assets/js/ui/renderers.js');
    Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => { window.__sharedLog = payload; } });
    toggleFloatOverlay(true);
    document.getElementById('share-log-btn').click();
  });
  await app.keyboard.press('Escape');
  await verifyShareDialog(app, path.join(root, 'scratch/review-fixtures'));
  await app.evaluate(() => document.getElementById('share-log-btn').click());
  const shareDialog = await app.evaluate(() => {
    const dialog = document.getElementById('__share-dialog').firstElementChild;
    const rect = dialog.getBoundingClientRect();
    return { fits: rect.top >= 0 && rect.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth + 1,
      focused: dialog.contains(document.activeElement), minButtons: [...dialog.querySelectorAll('button')].every(button => button.getBoundingClientRect().height >= 44) };
  });
  assert.deepEqual(shareDialog, { fits: true, focused: true, minButtons: true });
  await app.keyboard.press('Escape');
  assert.ok(await app.evaluate(() => !document.getElementById('__share-dialog')));
  await app.evaluate(() => {
    document.getElementById('share-log-btn').click();
    document.querySelector('#__share-dialog button').click();
  });
  await app.waitForFunction(() => window.__sharedLog?.text?.startsWith('---\n'));
  assert.ok(await app.evaluate(() => window.__sharedLog.text.includes('book: "[[handoff]]"')));
  assert.equal(await app.evaluate(() => window.__sharedLog.text.split('\n---\n')[1]), '\n## Thoughts and notes\n');
  await app.evaluate(() => {
    window.__fallbackLog = null;
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new Error('Mock share unavailable'); } });
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async value => { window.__fallbackLog = value; } });
    document.getElementById('share-log-btn').click();
    document.querySelector('#__share-dialog button').click();
  });
  await app.waitForFunction(() => window.__fallbackLog?.startsWith('---\n'));
  await app.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
  console.log('PASS: Markdown native share, clipboard fallback and landscape share-dialog focus/layout');


  await app.evaluate(async () => {
    const { runSearchRaceCases } = await import('/tests/search-race-cases.mjs');
    await runSearchRaceCases(window.__testReader);
  });
  console.log('PASS: late search completion, input edits, close/reopen, book replacement and empty results');
  await app.evaluate(async () => {
    const reader = window.__testReader;
    const query = 'Chapter 1, paragraph 25.';
    const segment = reader.resolveLocationByText(1, query);
    reader.goToSegment(1, segment, query, false);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (reader.getPageLocator(reader.currentPageIndex).segmentIndex <= 0) throw new Error('Fixture must resume inside a chapter');
  });
  for (const [width, height] of [[1440, 900], [568, 320], [768, 1024]]) {
    const before = await app.evaluate(() => ({ locator: window.__testReader.getPageLocator(window.__testReader.currentPageIndex), calls: window.__testResizeCalls }));
    await app.setViewport({ width, height, hasTouch: true });
    await app.waitForFunction(calls => window.__testResizeCalls > calls && !window.__testReader.isRepaginating, {}, before.calls);
    const preserved = await app.evaluate(locator => window.__testReader.findPageContaining(locator.spineIndex, locator.segmentIndex) === window.__testReader.currentPageIndex, before.locator);
    assert.ok(preserved, 'Resize must retain the page containing the previous reading anchor');
  }
  console.log('PASS: EPUB reading anchor survives desktop, landscape-phone and tablet repagination');
  await app.evaluate(async () => {
    const reader = window.__testReader;
    await reader.applyEpubViewMode('scroll');
    const query = 'Chapter 1, paragraph 25.';
    reader.goToSegment(1, reader.resolveLocationByText(1, query), query, false);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const before = await app.evaluate(() => ({ locator: window.__testReader.getPageLocator(window.__testReader.currentPageIndex), calls: window.__testResizeCalls }));
    await app.setViewport({ width, height, hasTouch: true });
    await app.waitForFunction(calls => window.__testResizeCalls > calls && !window.__testReader.isRepaginating, {}, before.calls);
    const after = await app.evaluate(() => window.__testReader.getPageLocator(window.__testReader.currentPageIndex));
    assert.equal(after.spineIndex, before.locator.spineIndex);
    assert.equal(after.visibleText?.slice(0, 30), before.locator.visibleText?.slice(0, 30), 'Scroll resize must return to the same visible text');
  }
  console.log('PASS: scroll reading position survives phone and desktop widths');
  await verifyReaderControls(app, path.join(root, 'scratch/review-fixtures'), 'epub');
  console.log('PASS: unified reader controls fit six viewports in both themes/languages, all actions reachable and keyboard focus contained');
  const pngs = await app.evaluate(() => Array.from({ length: 6 }, (_, index) => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 600, 900);
    context.fillStyle = '#111111'; context.font = '48px sans-serif'; context.fillText(`Page ${index}`, 60, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  }));
  const comic = new JSZip(); pngs.forEach((png, index) => comic.file(`${index}.png`, png, { base64: true }));
  const comicBytes = await comic.generateAsync({ type: 'nodebuffer' });
  const size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(comicBytes.length));
  const comicHash = Buffer.from(await crypto.subtle.digest('SHA-256', Buffer.concat([comicBytes, size]))).toString('hex');
  const comicFile = path.join(root, 'scratch/review-fixtures/[漫画家×原作者]作品_名_第003巻.cbz');
  await fs.writeFile(comicFile, comicBytes);
  remoteIndex.comic = { title: 'Comic fixture', fingerprints: [comicHash], updatedAt: 200 };
  remoteStates.comic = { progress: 50, lastCfi: 2, progressUpdatedAt: 200, updatedAt: 200,
    imageViewMode: 'single', pageDirection: 'rtl', bookmarks: [{ location: 2, percentage: 50, createdAt: 200 }] };
  await (await app.$('#fileInput')).uploadFile(comicFile);
  await app.waitForFunction(() => !document.getElementById('syncModal').classList.contains('hidden'));
  await app.click('#syncUseRemote');
  await app.waitForFunction(() => window.__testReader?.imagePages?.length === 6 &&
    !document.getElementById('loadingOverlay').classList.contains('visible'), { timeout: 30000 });
  const comicResult = await app.evaluate(hash => ({
    index: window.__testReader.imageIndex,
    linked: JSON.parse(localStorage.getItem('epubReader:data')).bookLinkMap[hash],
  }), comicHash);
  assert.equal(comicResult.index, 2); assert.equal(comicResult.linked, 'comic');
  assert.deepEqual(errors, []);
  console.log('PASS: first CBZ selection matches cloud metadata and opens image index 2');
  const filenameLog = await app.evaluate(() => {
    let copied;
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async value => { copied = value; } });
    document.getElementById('share-log-btn').click();
    return copied;
  });
  assert.ok(filenameLog.includes('title: "作品_名_第003巻"\n'));
  assert.ok(filenameLog.includes('authors:\n  - "[[漫画家]]"\n'));
  assert.ok(filenameLog.includes('book: "[[作品_名_第003巻]]"\n'));
  assert.ok(filenameLog.includes('original_authors:\n  - "[[原作者]]"\n'));
  console.log('PASS: actual comic filename separates author and title in copied reading-log properties');

  await verifyReaderControls(app, path.join(root, 'scratch/review-fixtures'), 'comic');
  // Shared panels must fit narrow phones, tablet split views and desktop windows in both languages.
  for (const language of ['ja', 'en']) {
    await app.evaluate(language => document.getElementById(language === 'ja' ? 'leftLangJa' : 'leftLangEn').click(), language);
    for (const [width, height] of [[320, 568], [390, 844], [568, 320], [768, 1024], [1024, 768], [1440, 900]]) {
      await app.setViewport({ width, height, hasTouch: true });
      await app.evaluate(() => document.getElementById('menuSettings').click());
      const bounds = await app.evaluate(() => {
        const modal = document.querySelector('#settingsModal .modal-content');
        document.querySelectorAll('#settingsModal .settings-section').forEach(section => section.classList.remove('collapsed'));
        const rect = modal.getBoundingClientRect();
        const close = modal.querySelector('.close-btn').getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          overflow: modal.scrollWidth - modal.clientWidth, closeWidth: close.width, closeHeight: close.height };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= width + 1 && bounds.top >= 0 && bounds.bottom <= height + 1,
        JSON.stringify({ language, width, height, bounds }));
      assert.ok(bounds.overflow <= 1, JSON.stringify({ language, width, bounds }));
      assert.ok(bounds.closeWidth >= 44 && bounds.closeHeight >= 44);
      await app.waitForFunction(() => [...document.querySelectorAll('#settingsModal .settings-section-content')].every(el => Number(getComputedStyle(el).opacity) === 1));
      await app.screenshot({ path: path.join(root, 'scratch/review-fixtures', 'settings-' + language + '-' + width + '.png') });
      await app.evaluate(() => document.querySelector('#settingsModal .close-btn').click());
    }
  }
  await app.setViewport({ width: 800, height: 600, hasTouch: true });
  console.log('PASS: settings fit six phone/tablet/desktop viewports in Japanese and English, with 44px close targets');
  await verifyHelp(app, path.join(root, 'scratch/review-fixtures'));
  console.log('PASS: Ver1.2.0 help topics, six screen sizes, both themes/languages, close and keyboard focus');

} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
