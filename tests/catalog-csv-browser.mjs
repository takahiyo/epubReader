/** CSV review and persistence through the real DOM and IndexedDB, with no external accounts. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createPreviewServer } from '../scripts/local-preview.mjs';
import { CATALOG_CSV as CSV, CATALOG_UI as U } from '../assets/constants.js';
import { parseCatalogCSV } from '../assets/js/core/catalog-csv.js';

const server = createPreviewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, page;
try {
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true, pipe: true, args: ['--no-sandbox'] });
  page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${server.address().port}/assets/sw-cache-config.json`);
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/style.css"><body></body>', { waitUntil: 'domcontentloaded' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    const { createCatalogUI } = await import('/assets/js/ui/catalog-ui.js');
    const { CATALOG_STRINGS } = await import('/assets/i18n/catalog.js');
    const { UI_CLASSES } = await import('/assets/constants.js');
    window.catalog = createCatalogUI({ t: key => CATALOG_STRINGS.ja[key] || key, getLegacy: () => ({}),
      openModal: root => root.classList.remove(UI_CLASSES.HIDDEN), closeModal: root => root.classList.add(UI_CLASSES.HIDDEN), openLocal: async () => {} });
    await window.catalog.show();
  });
  /** @param {string} text CSV content @param {boolean} validHeader Expected preview @returns {Promise<void>} Exercise the browser file input. */
  async function selectCSV(text, validHeader = true) {
    await page.evaluate(({ id, text }) => {
      const input = document.getElementById(id), transfer = new DataTransfer();
      transfer.items.add(new File([text], 'catalog.csv', { type: 'text/csv' })); input.files = transfer.files; input.dispatchEvent(new Event('change'));
    }, { id: CSV.input, text });
    if (!validHeader) { await page.waitForFunction(id => document.getElementById(id).textContent.includes('CSV列名'), {}, U.notice); return; }
    try {
      await page.waitForSelector('#' + CSV.preview); await page.waitForFunction(id => document.getElementById(id).textContent === '', {}, U.notice);
    } catch (error) { throw new Error('CSV preview failed: ' + await page.$eval('#' + U.notice, element => element.textContent), { cause: error }); }
  }
  /** @returns {Promise<Object>} Read persistent records from a separate connection. */
  async function read() { return page.evaluate(async () => { const { openCatalog } = await import('/assets/js/core/catalog-store.js'); const repo = await openCatalog(); try { return await repo.read(); } finally { repo.close(); } }); }

  await selectCSV('title,provider\n<script>bad</script>,kindle\nInvalid,other');
  console.log('Invalid CSV preview checked');
  assert.equal(await page.$eval('#' + CSV.commit, element => element.disabled), true);
  assert.equal(await page.$eval('#' + CSV.preview, element => element.querySelectorAll('script').length), 0);
  assert.equal((await read()).books.length, 0);
  await page.evaluate(id => [...document.getElementById(id).querySelectorAll('button')].find(button => button.textContent === 'キャンセル').click(), CSV.preview);
  const text = 'title,provider,series,volume_label,sort_order,provider_book_id,book_key\n' +
    'First,kindle,Series,上,1,A,one\nFirst,unext,Series,上,1,U,one\nSecond,kindle,Series,10.5,2,B,two';
  await selectCSV(text); assert.equal((await read()).holdings.length, 0);
  console.log('Valid CSV preview checked');
  await page.click('#' + CSV.commit); await page.waitForSelector('#' + CSV.preview, { hidden: true });
  const next = await read(); assert.equal(next.books.length, 2); assert.equal(next.holdings.length, 3); assert.equal(next.series.length, 1);
  console.log('CSV committed');
  assert.equal(await page.$eval('#' + CSV.export, element => element.disabled), true);
  const downloadDirectory = path.resolve('scratch', 'catalog-csv-download-' + process.pid); await fs.mkdir(downloadDirectory, { recursive: true });
  const protocol = await page.createCDPSession(); await protocol.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory });
  await page.select('#' + U.provider, 'unext');
  const firstId = next.books.find(book => book.title === 'First').id;
  await page.click(`article[data-book-id="${firstId}"] input[type="checkbox"]`);
  await page.click('#' + CSV.export);
  let download;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { download = await fs.readFile(path.join(downloadDirectory, CSV.exportName), 'utf8'); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  assert.ok(download, 'Selected CSV must download through the real button');
  const exported = parseCatalogCSV(download); assert.equal(exported.length, 3);
  assert.deepEqual(exported.slice(1).map(row => row.cells[exported[0].cells.indexOf('provider')]), ['kindle', 'unext']);
  assert.equal((await read()).holdings.length, 3);
  await page.select('#' + U.provider, '');
  await selectCSV(text); assert.equal(await page.$eval('#' + CSV.commit, element => element.disabled), true);
  assert.equal(await page.$eval('#' + CSV.preview, element => element.textContent.includes('スキップ: 3')), true);
  await page.evaluate(id => [...document.getElementById(id).querySelectorAll('button')].find(button => button.textContent === 'キャンセル').click(), CSV.preview);

  await selectCSV('title,provider\nThird,unext');
  await page.evaluate(async () => {
    const { openCatalog } = await import('/assets/js/core/catalog-store.js'); const repo = await openCatalog();
    await repo.update(current => { current.books[0].title = 'Edited elsewhere'; current.books[0].revision++; return current; }); repo.close();
  });
  await page.click('#' + CSV.commit); await page.waitForFunction(id => document.getElementById(id).textContent.includes('競合'), {}, U.notice);
  assert.equal((await read()).holdings.length, 3); assert.equal((await read()).books.some(book => book.title === 'Edited elsewhere'), true);
  assert.equal(await page.$eval('#' + CSV.preview, element => element.parentElement.scrollWidth <= element.parentElement.clientWidth), true);
  await selectCSV('title,provider,provider_book_id\n' + Array.from({ length: 60 }, (_, index) => `Volume ${index},kindle,ID${index}`).join('\n'));
  assert.equal(await page.$$eval('#' + CSV.preview + ' tbody tr', rows => rows.length), 50);
  await page.evaluate(id => [...document.getElementById(id).querySelectorAll('button')].find(button => button.textContent === '次へ').click(), CSV.preview);
  assert.equal(await page.$$eval('#' + CSV.preview + ' tbody tr', rows => rows.length), 10);
  await page.setViewport({ width: 1280, height: 900 });
  assert.equal(await page.$eval('#' + CSV.preview, element => element.parentElement.scrollWidth <= element.parentElement.clientWidth), true);
  assert.equal((await read()).holdings.length, 3);
  await selectCSV('title,provider,cookie\nInvalid,kindle,secret', false);
  assert.equal(await page.$('#' + CSV.preview), null);
  assert.equal((await read()).holdings.length, 3);
  assert.deepEqual(errors, []);
  console.log('PASS: selected CSV download includes all holdings across provider filters; import, cancel, duplicates, concurrent edits and bounded preview');
} catch (error) { if (page) console.error(await page.$eval('body', element => element.textContent)); throw error; }
finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
