/** Real DOM/IndexedDB account linking, durable retry and two-device conflict recovery. */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createPreviewServer } from '../scripts/local-preview.mjs';
import { emptyCatalog } from '../assets/js/core/catalog-model.js';
import { prepareCatalogMutation, validateCatalogMutation } from '../assets/js/core/catalog-sync-protocol.js';
import { CATALOG_SYNC as S, CATALOG_UI as U, SYNC_PATHS } from '../assets/constants.js';

const server = createPreviewServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const accounts = new Map(), requests = []; let loseResponse = false, browser;
/** @param {string} path Route @param {Object} payload Body @param {Object} context Test authenticated identity @returns {Object} Server protocol with idempotent receipts. */
function transport(path, payload, context) {
  requests.push({ path, uid: context.uid });
  const account = accounts.get(context.uid) || { snapshot: emptyCatalog(), receipts: new Map(), groups: [] }; accounts.set(context.uid, account);
  if (path === SYNC_PATHS.CATALOG_PUSH) {
    const command = validateCatalogMutation(payload.mutations[0]); let receipt = account.receipts.get(command.mutationId);
    if (!receipt) {
      const result = prepareCatalogMutation(account.snapshot, command); receipt = result.result; account.receipts.set(command.mutationId, receipt);
      if (result.next) { account.snapshot = result.next; account.groups.push({ cursor: account.groups.length + 1, mutationId: command.mutationId, changes: receipt.changes }); }
    }
    if (loseResponse) { loseResponse = false; throw new Error('Connection lost after server commit'); }
    return { results: [receipt] };
  }
  const groups = account.groups.filter(group => group.cursor > payload.cursor).slice(0, payload.limit);
  const nextCursor = groups.at(-1)?.cursor ?? payload.cursor;
  return { groups, nextCursor, hasMore: nextCursor < account.groups.length };
}
try {
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true, pipe: true, args: ['--no-sandbox'] });
  const contexts = await Promise.all([browser.createBrowserContext(), browser.createBrowserContext()]);
  /** @param {Object} context Browser device @param {boolean} seed Add initial device catalog @returns {Promise<Object>} Catalog UI test page. */
  async function device(context, seed) {
    const page = await context.newPage(); await page.setViewport({ width: 390, height: 844 }); await page.exposeFunction('serverTransport', transport);
    await page.goto(`http://127.0.0.1:${server.address().port}/assets/sw-cache-config.json`);
    await page.setContent('<!doctype html><link rel="stylesheet" href="/assets/style.css"><body></body>');
    await page.evaluate(async seed => {
      const { openCatalog } = await import('/assets/js/core/catalog-store.js');
      const { previewCatalogCSV } = await import('/assets/js/core/catalog-csv.js');
      const { emptyCatalog } = await import('/assets/js/core/catalog-model.js');
      const { createCatalogUI } = await import('/assets/js/ui/catalog-ui.js');
      const { CATALOG_STRINGS } = await import('/assets/i18n/catalog.js');
      const { catalogAccountDatabase } = await import('/assets/js/core/catalog-sync.js');
      const { UI_CLASSES } = await import('/assets/constants.js');
      window.account = { uid: 'owner', endpoint: 'https://test.worker', label: 'Owner', canSync: true };
      window.openAccountRepo = async () => openCatalog({ databaseName: await catalogAccountDatabase(window.account) });
      if (seed) { const repo = await openCatalog(); await repo.update(() => previewCatalogCSV(emptyCatalog(), 'title,provider\nDevice volume,kindle').next); repo.close(); }
      window.catalog = createCatalogUI({ t: key => CATALOG_STRINGS.ja[key] || key, getLegacy: () => ({}),
        getSyncContext: () => window.account, syncTransport: (...args) => window.serverTransport(...args), openLocal: async () => {},
        openModal: root => root.classList.remove(UI_CLASSES.HIDDEN), closeModal: root => root.classList.add(UI_CLASSES.HIDDEN) });
      await window.catalog.show();
    }, seed);
    return page;
  }
  /** @param {Object} page Device @param {string} id Observed control @returns {Promise<void>} Wait for usable UI then activate. */
  async function click(page, id) { await page.waitForFunction(id => { const el = document.getElementById(id); return el && !el.disabled; }, {}, id); await page.click('#' + id); }
  /** @param {Object} page Device @returns {Promise<void>} Wait for serialized operation completion. */
  async function ready(page) { await page.waitForFunction(id => !document.getElementById(id).disabled, {}, S.ui.run); }
  /** @param {Object} page Device @returns {Promise<Object>} Read account snapshot and state through another real connection. */
  async function read(page) { return page.evaluate(async () => { const repo = await window.openAccountRepo(); try { return await repo.readBundle(); } finally { repo.close(); } }); }
  /** @param {Object} page Device @param {string} title Edited content @returns {Promise<void>} Commit while leaving synchronization manual. */
  async function edit(page, title) {
    await page.evaluate(async title => { const repo = await window.openAccountRepo(); await repo.update(c => { c.books[0].title = title; c.books[0].revision++; return c; }); repo.close(); await window.catalog.show(); }, title);
  }
  let a = await device(contexts[0], true); const b = await device(contexts[1], false);
  assert.equal(requests.length, 0); await click(a, S.ui.open); await a.waitForSelector('#' + S.ui.seed);
  assert.equal(requests.length, 0); assert.match(await a.$eval('#' + U.editor, el => el.textContent), /巻・版: 1/);
  loseResponse = true; await click(a, S.ui.seed); await ready(a);
  const failed = await read(a); assert.ok(failed.state.pending); assert.equal(accounts.get('owner').groups.length, 1);
  await a.close(); a = await device(contexts[0], false); assert.ok((await read(a)).state.pending);
  await click(a, S.ui.run); await ready(a);
  assert.equal((await read(a)).state.pending, null); assert.equal(accounts.get('owner').groups.length, 1);
  await click(b, S.ui.open); await click(b, S.ui.empty); await ready(b);
  assert.equal((await read(b)).snapshot.books[0].title, 'Device volume');
  await edit(a, 'Device A'); await edit(b, 'Device B'); await click(a, S.ui.run); await ready(a);
  await click(b, S.ui.run); await ready(b);
  const conflict = await read(b); assert.equal(conflict.state.blocked.status, 'conflict'); assert.equal(conflict.snapshot.books[0].title, 'Device B');
  await click(b, S.ui.review); await b.waitForSelector('#' + S.ui.cloud);
  assert.match(await b.$eval('#' + U.editor, el => el.textContent), /Device A/); assert.match(await b.$eval('#' + U.editor, el => el.textContent), /Device B/);
  await click(b, S.ui.cloud); await ready(b); const adopted = await read(b);
  assert.equal(adopted.snapshot.books[0].title, 'Device A'); assert.equal(adopted.state.outbox.length, 0);
  assert.equal(await b.evaluate(async () => { const repo = await window.openAccountRepo(); const json = await repo.recoveryJSON(); repo.close(); return JSON.parse(json).books[0].title; }), 'Device B');
  assert.equal(await b.$eval('.catalog-panel', el => el.scrollWidth <= el.clientWidth), true);
  // Account restoration queues tombstones, preserves revision leases and commits outbox with catalog data.
  const restored = await b.evaluate(async () => {
    const repo = await window.openAccountRepo(), before = await repo.read();
    const backup = structuredClone(before); backup.books[0].title = 'Restored'; backup.books[0].revision = 1;
    await repo.restoreJSON(JSON.stringify(backup)); const after = await repo.readBundle();
    await repo.restoreJSON(JSON.stringify({ ...backup, books: [], holdings: [] })); const removed = await repo.readBundle(); repo.close();
    return { before, after, removed };
  });
  assert.ok(restored.after.snapshot.books[0].revision > restored.before.books[0].revision);
  assert.ok(restored.after.state.outbox.length); assert.ok(restored.removed.snapshot.books[0].deleted_at);
  assert.ok(restored.removed.snapshot.holdings[0].deleted_at); assert.ok(restored.removed.state.outbox.length);
  await click(a, S.ui.local);
  await a.waitForFunction(id => document.getElementById(id).textContent.includes('Device volume'), {}, U.list);
  // A second account never receives the prior account catalog just by signing in/opening the dialog.
  const before = requests.length;
  await b.evaluate(async () => { window.account = { ...window.account, uid: 'other', label: 'Other' }; window.catalog.resetContext(); await window.catalog.show(); });
  assert.equal(requests.length, before); assert.equal(await b.$$eval('#' + U.list + ' article', els => els.length), 0);
  await click(b, S.ui.open); await click(b, S.ui.empty); await ready(b); assert.equal((await read(b)).snapshot.books.length, 0);
  assert.equal(accounts.get('other').snapshot.books.length, 0);
  console.log('Catalog sync browser: explicit linking, lost-response retry after reopening, two-device conflict, recovery archive and account isolation passed');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
