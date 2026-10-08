/** Real IndexedDB/DOM checks for KU historical registration and cross-provider monthly filtering. */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createPreviewServer } from '../scripts/local-preview.mjs';
import { CATALOG_HISTORY as H, CATALOG_UI as U } from '../assets/constants.js';

const server = createPreviewServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true, pipe: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.emulateTimezone('Asia/Tokyo'); await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${server.address().port}/assets/sw-cache-config.json`);
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/style.css"><body></body>', { waitUntil: 'domcontentloaded' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const holdingId = await page.evaluate(async () => {
    const { openCatalog } = await import('/assets/js/core/catalog-store.js');
    const { emptyCatalog, catalogRecord } = await import('/assets/js/core/catalog-model.js');
    const { previewCatalogCSV } = await import('/assets/js/core/catalog-csv.js');
    const { saveCatalogHistory } = await import('/assets/js/core/catalog-history.js');
    const { createCatalogUI } = await import('/assets/js/ui/catalog-ui.js');
    const { CATALOG_STRINGS } = await import('/assets/i18n/catalog.js');
    const { UI_CLASSES } = await import('/assets/constants.js');
    let c = previewCatalogCSV(emptyCatalog(), 'title,provider,access_type,availability_status,book_key\nKU rereading,kindle,subscription_loan,returned,one\nOther provider,kindle,subscription_loan,returned,two\nOther provider,unext,purchased,active,two\nUnknown date,kindle,subscription_loan,returned,three').next;
    const common = () => catalogRecord(() => crypto.randomUUID(), Date.now());
    c.manual_reading_states.push({ ...common(), holding_id: c.holdings[0].id, status: 'reading', progress_percent: 42, reread_wanted: true });
    for (const i of [2, 3]) c = saveCatalogHistory(c, { holdingId: c.holdings[i].id, holdingRevision: 1, kind: 'event', values: { event_type: 'completed', occurred_at: i === 2 ? '2026-09-10T12:00' : '', progress_percent: '' } });
    window.before = structuredClone(c);
    const repo = await openCatalog(); await repo.update(() => c); repo.close();
    window.language = 'ja'; window.catalog = createCatalogUI({ t: key => CATALOG_STRINGS[window.language][key] || key, getLegacy: () => ({}),
      openModal: root => root.classList.remove(UI_CLASSES.HIDDEN), closeModal: root => root.classList.add(UI_CLASSES.HIDDEN), openLocal: async () => {} });
    await window.catalog.show(); return c.holdings[0].id;
  });
  /** @param {string} id Control @param {string} value Input @returns {Promise<void>} Dispatch input normally. */
  async function input(id, value) { await page.evaluate(({ id, value }) => { const control = document.getElementById(id); control.value = value; control.dispatchEvent(new Event('input')); }, { id, value }); }
  /** @param {string} label Localized button text @param {string} scope Search root @returns {Promise<void>} Click an observed button. */
  async function click(label, scope = '#' + U.editor) { await page.evaluate(({ label, scope }) => [...document.querySelector(scope).querySelectorAll('button')].find(button => button.textContent === label).click(), { label, scope }); }
  /** @returns {Promise<Object>} Persistent catalog from another connection. */
  async function read() { return page.evaluate(async () => { const { openCatalog } = await import('/assets/js/core/catalog-store.js'); const repo = await openCatalog(); try { return await repo.read(); } finally { repo.close(); } }); }
  const line = `[data-holding-id="${holdingId}"]`;
  await click('利用期間・読書履歴', line); await click('読書履歴を追加');
  await input(H.prefix + 'occurred_at', '2026-09-30T23:59:59'); await input(H.prefix + 'progress_percent', '100');
  await page.click('#' + H.cancel); assert.equal((await read()).reading_events.length, 2);
  await click('読書履歴を追加'); await input(H.prefix + 'occurred_at', '2026-09-30T23:59:59'); await input(H.prefix + 'progress_percent', '100');
  await page.click('#' + H.save); await page.waitForSelector('#' + H.form, { hidden: true });
  const after = await read(), before = await page.evaluate(() => window.before);
  assert.deepEqual(after.manual_reading_states, before.manual_reading_states);
  assert.deepEqual([...after.holdings].sort((a, b) => a.id.localeCompare(b.id)), [...before.holdings].sort((a, b) => a.id.localeCompare(b.id)));
  await page.select('#' + U.provider, 'kindle'); await page.select('#' + H.accessFilter, 'subscription_loan'); await input(H.monthFilter, '2026-09');
  assert.deepEqual(await page.$$eval('#' + U.list + ' h4', rows => rows.map(row => row.textContent)), ['KU rereading']);
  await input(H.monthFilter, '2026-10'); assert.equal(await page.$$eval('#' + U.list + ' article', rows => rows.length), 0);
  await input(H.monthFilter, '2026-09'); await page.select('#' + U.provider, 'unext'); await page.select('#' + H.accessFilter, '');
  assert.deepEqual(await page.$$eval('#' + U.list + ' h4', rows => rows.map(row => row.textContent)), ['Other provider']);
  await page.select('#' + U.provider, ''); await input(H.monthFilter, '');
  await click('利用期間・読書履歴', line); await click('過去の返却済み期間を追加');
  await input(H.prefix + 'started_at', '2026-09-01T12:00'); await input(H.prefix + 'ended_at', '2026-09-30T23:59');
  assert.equal(await page.$eval('#' + H.form, form => form.scrollWidth <= form.clientWidth), true);
  await page.click('#' + H.save); await page.waitForSelector('#' + H.form, { hidden: true }); assert.equal((await read()).access_periods.length, 1);
  await click('利用期間・読書履歴', line); await click('履歴を修正');
  await input(H.prefix + 'occurred_at', '2026-08-31T23:59'); await page.click('#' + H.save); await page.waitForSelector('#' + H.form, { hidden: true });
  await input(H.monthFilter, '2026-09'); await page.select('#' + U.provider, 'kindle'); assert.equal(await page.$$eval('#' + U.list + ' article', rows => rows.length), 0);
  await input(H.monthFilter, '2026-08'); assert.equal(await page.$$eval('#' + U.list + ' article', rows => rows.length), 1);
  await click('利用期間・読書履歴', line);
  await page.evaluate(id => [...document.getElementById(id).querySelectorAll('p')].find(p => p.textContent.includes(' · 読了')).parentElement.querySelector('button').click(), U.editor);
  await input(H.prefix + 'occurred_at', '2026-08-30T12:00');
  await page.evaluate(async id => { const { openCatalog } = await import('/assets/js/core/catalog-store.js'); const repo = await openCatalog(); await repo.update(c => { c.reading_events.find(e => e.holding_id === id).revision++; return c; }); repo.close(); }, holdingId);
  await page.click('#' + H.save); await page.waitForFunction(id => document.getElementById(id).textContent.includes('競合'), {}, U.notice);
  assert.equal(await page.$eval('#' + H.prefix + 'occurred_at', control => control.value), '2026-08-30T12:00');
  assert.equal((await read()).reading_events.find(e => e.holding_id === holdingId).occurred_at, new Date('2026-08-31T23:59+09:00').getTime());
  await page.evaluate(async () => { window.catalog.close(); window.language = 'en'; await window.catalog.show(); });
  assert.equal(await page.$eval('#' + H.monthFilter, control => control.getAttribute('aria-label')), 'Completion month (excludes unknown dates)');
  await page.setViewport({ width: 1365, height: 900 }); assert.deepEqual(errors, []);
  console.log('Catalog history browser: dates, cancellation, KU month/source filters, return history, correction, stale drafts, mobile and English passed');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
