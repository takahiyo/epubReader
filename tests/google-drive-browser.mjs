/** Browser integration with fake Google SDK / Drive; never contacts a real account. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/css/01-tokens.css"><link rel="stylesheet" href="/assets/css/25-google-drive.css"><button data-google-drive>Drive</button></html>'); return;
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE,
    pipe: true, userDataDir: path.join(root, 'scratch', 'drive-browser-profile-' + process.pid) });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async () => {
    // Keep the unconfigured case isolated from production credentials and live SDK requests.
    window.APP_CONFIG = { googleDrive: { clientId: '', apiKey: '', appId: '' } };
    const { createGoogleDriveUI } = await import('/assets/js/ui/google-drive-ui.js');
    const { DRIVE_STRINGS } = await import('/assets/i18n/google-drive.js');
    window.opened = []; window.account = { authenticated: true, userId: 'reader', userEmail: 'reader@example.test' };
    window.ui = createGoogleDriveUI({ t: key => DRIVE_STRINGS.ja[key] || key, getAccount: () => window.account,
      login() {}, beforeOpen() {}, openFile: async file => window.opened.push({ name: file.name, text: await file.text() }) });
  });
  await page.click('[data-google-drive]');
  assert.ok(await page.$eval('#googleDriveDialog', element => element.textContent.includes('未設定')));
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.APP_CONFIG = { googleDrive: { clientId: 'fake', apiKey: 'fake', appId: '123' } };
    window.gapi = { load: (_, options) => options.callback() };
    class Builder {
      addView() { return this; } setDeveloperKey() { return this; } setAppId() { return this; }
      setOAuthToken() { return this; } setOrigin() { return this; } setLocale() { return this; }
      setSize() { return this; } setCallback(callback) { window.pickerCallback = callback; return this; }
      build() { return { dispose() {}, setVisible() {
        window.pickerAboveDialog = !document.querySelector('dialog').open;
        if (window.holdPicker) return;
        setTimeout(() => window.pickerCallback({ action: 'picked', docs: [{ id: 'id', name: 'Book.epub' }] }), 0);
      } }; }
    }
    window.google = {
      accounts: { oauth2: { hasGrantedAllScopes: () => true, initTokenClient: options => ({ requestAccessToken() {
        window.oauthWasUserActivated = navigator.userActivation.isActive;
        options.callback({ access_token: 'fake-token' });
      } }) } },
      picker: { DocsView: class { setIncludeFolders() { return this; } setSelectFolderEnabled() { return this; } },
        PickerBuilder: Builder, Action: { CANCEL: 'cancel', PICKED: 'picked' } },
    };
    window.fetch = async url => url.includes('alt=media') ? new Response('test') : Response.json({ name: 'Book.epub', size: '4' });
  });
  await page.click('[data-google-drive]');
  await page.waitForFunction(() => !document.querySelector('#googleDriveConnect').disabled);
  await fs.mkdir(path.join(root, 'scratch'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'scratch/google-drive-mobile.png') });
  assert.ok(await page.$eval('dialog', element => element.getBoundingClientRect().right <= innerWidth));
  await page.click('#googleDriveConnect');
  await page.waitForFunction(() => window.opened.length === 1);
  assert.deepEqual(await page.evaluate(() => window.opened), [{ name: 'Book.epub', text: 'test' }]);
  assert.equal(await page.evaluate(() => window.oauthWasUserActivated && window.pickerAboveDialog), true);

  // Account switches must discard late Picker selections and restore a usable launch button.
  await page.evaluate(() => { window.holdPicker = true; });
  await page.click('[data-google-drive]');
  await page.waitForFunction(() => !document.querySelector('#googleDriveConnect').disabled);
  await page.click('#googleDriveConnect');
  await page.evaluate(() => {
    window.account = { authenticated: true, userId: 'other' };
    dispatchEvent(new Event('auth:status'));
    window.pickerCallback({ action: 'picked', docs: [{ id: 'id', name: 'Book.epub' }] });
  });
  assert.equal(await page.evaluate(() => window.opened.length), 1);
  await page.click('[data-google-drive]');
  assert.equal(await page.$eval('dialog', element => element.open), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('[data-google-drive]', element => element === document.activeElement), true);
  assert.deepEqual(errors, []);
  console.log('PASS: mobile dialog, missing config, OAuth gesture, picker layering, file handoff, account switch, cancellation and focus');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
