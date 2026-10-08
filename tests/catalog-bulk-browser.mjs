/** Verify bulk selection/drafts and atomic organization through real DOM and IndexedDB. */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createPreviewServer } from '../scripts/local-preview.mjs';
import { CATALOG_BULK as B, CATALOG_UI as U } from '../assets/constants.js';

const server = createPreviewServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, page;
try {
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true, pipe: true, args: ['--no-sandbox'] });
  page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${server.address().port}/assets/sw-cache-config.json`);
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/style.css"><body></body>', { waitUntil: 'domcontentloaded' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const ids = await page.evaluate(async () => {
    const { openCatalog } = await import('/assets/js/core/catalog-store.js');
    const { emptyCatalog, catalogRecord } = await import('/assets/js/core/catalog-model.js');
    const { previewCatalogCSV } = await import('/assets/js/core/catalog-csv.js');
    const { createCatalogUI } = await import('/assets/js/ui/catalog-ui.js');
    const { CATALOG_STRINGS } = await import('/assets/i18n/catalog.js');
    const { UI_CLASSES } = await import('/assets/constants.js');
    const csv = 'title,provider,provider_book_id,volume_label\n' + Array.from({ length: 61 }, (_, i) => `Book${String(i).padStart(3, '0')},kindle,ID${i},${i}`).join('\n');
    const snapshot = previewCatalogCSV(emptyCatalog(), csv).next, common = () => catalogRecord(() => crypto.randomUUID(), 1000);
    const first = snapshot.holdings[0]; first.access_type = 'subscription_loan'; first.availability_status = 'returned';
    snapshot.holdings.push({ ...common(), book_id: first.book_id, provider: 'unext', access_type: 'purchased', availability_status: 'active' });
    const period = { ...common(), holding_id: first.id, started_at: 1, ended_at: 10, end_reason: 'returned' }; snapshot.access_periods.push(period);
    snapshot.reading_events.push({ ...common(), holding_id: first.id, access_period_id: period.id, event_type: 'completed', occurred_at: 5, recorded_at: 5, progress_percent: 100, source: 'manual' });
    snapshot.manual_reading_states.push({ ...common(), holding_id: first.id, status: 'completed', progress_percent: 100, reread_wanted: true });
    window.before = structuredClone(snapshot);
    const repo = await openCatalog(); await repo.update(() => snapshot); repo.close();
    window.language = 'ja';
    window.catalog = createCatalogUI({ t: key => CATALOG_STRINGS[window.language][key] || key, getLegacy: () => ({}),
      openModal: root => root.classList.remove(UI_CLASSES.HIDDEN), closeModal: root => root.classList.add(UI_CLASSES.HIDDEN), openLocal: async () => {} });
    await window.catalog.show(); return snapshot.books.map(book => book.id);
  });
  /** @param {string} id Input ID @param {string} value Draft @returns {Promise<void>} Type via normal input events. */
  async function input(id, value) { await page.evaluate(({ id, value }) => { const element = document.getElementById(id); element.value = value; element.dispatchEvent(new Event('input')); }, { id, value }); }
  /** @returns {Promise<Object>} Persistent data via a separate repository connection. */
  async function read() { return page.evaluate(async () => { const { openCatalog } = await import('/assets/js/core/catalog-store.js'); const repo = await openCatalog(); try { return await repo.read(); } finally { repo.close(); } }); }
  /** @param {string} id Explicit book identity @returns {Promise<void>} Select a visible book once, regardless of holdings. */
  async function selectBook(id) { await page.click(`article[data-book-id="${id}"] input[type="checkbox"]`); }
  await selectBook(ids[0]); assert.equal(await page.$eval('#' + B.count, element => element.textContent), '選択した巻: 1');
  await page.click('#' + B.selectPage); assert.equal(await page.$eval('#' + B.count, element => element.textContent), '選択した巻: 50');
  await input(U.search, 'Book060'); await selectBook(ids[60]);
  assert.equal(await page.$eval('#' + B.count, element => element.textContent), '選択した巻: 51');
  await input(U.search, ''); await page.click('#' + B.launch);
  assert.equal(await page.$$eval('#' + B.form + ' h4', rows => rows.length), 51); // heading + bounded 50 rows
  await page.setViewport({ width: 844, height: 390 });
  assert.equal(await page.$eval('#' + B.form, element => element.scrollWidth <= element.clientWidth), true);
  await page.setViewport({ width: 390, height: 844 });
  await page.select('#' + B.target, B.modes.create); await input(B.name, 'Organized series');
  await input(B.labelPrefix + ids[0], '上'); await input(B.orderPrefix + ids[0], '1');
  await page.evaluate(id => [...document.getElementById(id).querySelectorAll('button')].find(button => button.textContent === '次へ').click(), B.form);
  await input(B.labelPrefix + ids[60], '外伝'); await input(B.orderPrefix + ids[60], '99');
  await page.evaluate(id => [...document.getElementById(id).querySelectorAll('button')].find(button => button.textContent === '前へ').click(), B.form);
  assert.equal(await page.$eval('#' + B.labelPrefix + ids[0], element => element.value), '上');
  await page.click('#' + B.save); await page.waitForSelector('#' + B.form, { hidden: true });
  const after = await read(), before = await page.evaluate(() => window.before);
  const group = after.series.find(row => row.name === 'Organized series'); assert.ok(group);
  assert.equal(after.books.filter(row => row.series_id === group.id).length, 51);
  assert.equal(after.books.find(row => row.id === ids[60]).volume_label, '外伝');
  assert.deepEqual(after.books.find(row => row.id === ids[55]), before.books[55]);
  for (const name of ['holdings', 'access_periods', 'reading_events', 'manual_reading_states']) assert.deepEqual([...after[name]].sort((a, b) => a.id.localeCompare(b.id)), [...before[name]].sort((a, b) => a.id.localeCompare(b.id)));
  await input(U.search, 'Book000'); await selectBook(ids[0]); await page.click('#' + B.launch);
  await input(B.labelPrefix + ids[0], 'cancel this'); await page.click('#' + B.cancel);
  assert.equal((await read()).books.find(row => row.id === ids[0]).volume_label, '上');
  await page.click('#' + B.clear); await input(U.search, 'Book055'); await selectBook(ids[55]); await page.click('#' + B.launch);
  await page.select('#' + B.target, B.seriesOptionPrefix + group.id); await page.click('#' + B.save); await page.waitForSelector('#' + B.form, { hidden: true });
  assert.equal((await read()).books.find(row => row.id === ids[55]).series_id, group.id);
  await input(U.search, 'Book000'); await selectBook(ids[0]);
  await page.click('#' + B.launch); await input(B.labelPrefix + ids[0], 'stale draft');
  await page.evaluate(async id => { const { openCatalog } = await import('/assets/js/core/catalog-store.js'); const repo = await openCatalog(); await repo.update(current => { const book = current.books.find(row => row.id === id); book.title = 'Concurrent title'; book.revision++; return current; }); repo.close(); }, ids[0]);
  await page.click('#' + B.save); await page.waitForFunction(id => document.getElementById(id).textContent.includes('競合'), {}, U.notice);
  assert.equal((await read()).books.find(row => row.id === ids[0]).title, 'Concurrent title');
  assert.equal((await read()).books.find(row => row.id === ids[0]).volume_label, '上');
  assert.equal(await page.$eval('#' + B.labelPrefix + ids[0], element => element.value), 'stale draft');
  assert.equal(await page.$eval('#' + B.form, element => element.scrollWidth <= element.clientWidth), true);
  await page.click('#' + B.cancel); await page.evaluate(() => { window.language = 'en'; window.catalog.localize(); });
  assert.equal(await page.$eval('#' + B.launch, element => element.textContent), 'Organize selected volumes');
  await page.setViewport({ width: 1280, height: 900 }); assert.deepEqual(errors, []);
  console.log('PASS: cross-page/filter selection, bounded drafts, explicit 51-volume organization, preserved KU history, cancel and concurrent-edit rejection');
} catch (error) { if (page) console.error(await page.$eval('body', element => element.textContent)); throw error; }
finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
