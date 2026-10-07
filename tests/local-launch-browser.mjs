/** Verify direct-file guidance and real HTTP startup without replacing authentication/CDN modules. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { createPreviewServer } from '../scripts/local-preview.mjs';
import { CATALOG_UI, APP_INFO } from '../assets/constants.js';

const server = createPreviewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true, args: ['--no-sandbox'] });
  const filePage = await browser.newPage();
  const blocked = [];
  filePage.on('console', message => { if (message.text().includes('CORS')) blocked.push(message.text()); });
  await filePage.goto(pathToFileURL(path.resolve('index.html')).href, { waitUntil: 'domcontentloaded' });
  assert.ok(await filePage.$eval('body', element => element.textContent.includes('Start-BookReader.cmd')));
  assert.ok(blocked.length > 0, 'Direct file modules must reproduce the reported browser restriction');
  console.log('PASS: file:// module restriction reproduces, and launch guidance replaces the frozen page');
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(id => !!document.getElementById(id)?.textContent.trim(), { timeout: 30000 }, CATALOG_UI.launch);
  await page.evaluate(() => document.getElementById('menuSettings').click());
  await page.waitForFunction(() => !document.getElementById('settingsModal').classList.contains('hidden'));
  await page.keyboard.press('Escape');
  await page.evaluate(id => document.getElementById(id).click(), CATALOG_UI.launch);
  await page.waitForFunction(id => !document.getElementById(id).classList.contains('hidden'), {}, CATALOG_UI.modal);
  assert.equal(await page.$eval('.catalog-panel', element => getComputedStyle(element).display), 'flex');
  assert.deepEqual(errors, []);
  console.log(`PASS: HTTP Ver${APP_INFO.VERSION} starts with real dependencies; settings and styled catalog menus open`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
