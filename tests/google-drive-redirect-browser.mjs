/** Top-level iPad Drive round trip with mocked OAuth and Drive boundaries; no real Google account. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><html lang="ja"><meta name="referrer" content="strict-origin">
        <script src="/assets/drive-return.js"></script><button data-google-drive>Drive</button></html>`);
      return;
    }
    if (url.pathname === '/oauth/drive/config') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ redirectUri: origin + '/' })); return;
    }
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE,
    pipe: true, userDataDir: path.join(root, 'scratch', 'drive-redirect-browser-' + process.pid) });
  const page = await browser.newPage();
  await page.setViewport({ width: 820, height: 1180 });
  await page.setUserAgent('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
  const errors = [], exchanges = [], oauth = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'https://accounts.google.com') {
      oauth.push(url);
      const callback = new URL('/', origin);
      callback.search = new URLSearchParams({ code: 'one-time-code', state: url.searchParams.get('state'),
        picked_file_ids: 'book-id', scope: 'https://www.googleapis.com/auth/drive.file' });
      return request.respond({ status: 302, headers: { Location: callback.href } });
    }
    if (url.pathname === '/oauth/drive/token') {
      exchanges.push({ body: JSON.parse(request.postData()), authorization: request.headers().authorization });
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'drive-token' }) });
    }
    if (url.origin === 'https://www.googleapis.com') return request.respond({ status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
      contentType: url.searchParams.has('alt') ? 'application/epub+zip' : 'application/json',
      body: url.searchParams.has('alt') ? 'book' : JSON.stringify({ name: 'Book.epub', size: '4' }) });
    if (url.origin !== origin) return request.abort();
    return request.continue();
  });
  const initialize = (authenticated = true) => page.evaluate(async authenticated => {
    window.APP_CONFIG = { googleDrive: { tokenEndpoint: location.origin + '/oauth/drive' } };
    const { createGoogleDriveUI } = await import('/assets/js/ui/google-drive-ui.js');
    const { DRIVE_STRINGS } = await import('/assets/i18n/google-drive.js');
    window.account = authenticated ? { authenticated: true, userId: 'reader', userEmail: 'reader@example.test' } : { authenticated: false };
    window.opened = [];
    createGoogleDriveUI({ t: key => DRIVE_STRINGS.ja[key] || key, getAccount: () => window.account,
      getIdToken: async () => 'firebase-token', login() {}, beforeOpen() {},
      openFile: async file => window.opened.push({ name: file.name, content: await file.text() }) });
  }, authenticated);
  await page.goto(origin);
  await initialize();
  await page.click('[data-google-drive]');
  await page.waitForFunction(() => !document.querySelector('#googleDriveConnect').disabled);
  await Promise.all([page.waitForNavigation(), page.click('#googleDriveConnect')]);
  assert.equal(oauth.length, 1);
  assert.equal(oauth[0].searchParams.get('trigger_onepick'), 'true');
  assert.equal(oauth[0].searchParams.get('response_type'), 'code');
  assert.equal(oauth[0].searchParams.get('code_challenge_method'), 'S256');
  assert.equal(page.url(), origin + '/'); // code removed before application initialization
  await initialize(false);
  assert.equal(exchanges.length, 0); // Firebase can restore after the UI is constructed.
  await page.evaluate(() => {
    window.account = { authenticated: true, userId: 'reader', userEmail: 'reader@example.test' };
    dispatchEvent(new Event('auth:status'));
  });
  try { await page.waitForFunction(() => window.opened.length === 1); }
  catch (error) {
    console.error('Round-trip state:', await page.evaluate(() => document.body.textContent), errors, exchanges);
    throw error;
  }
  assert.deepEqual(await page.evaluate(() => window.opened), [{ name: 'Book.epub', content: 'book' }]);
  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].authorization, 'Bearer firebase-token');
  assert.equal(exchanges[0].body.code, 'one-time-code');
  assert.match(exchanges[0].body.verifier, /^[\w-]{43}$/);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('bookreader.drive.redirect')), null);
  assert.equal(await page.evaluate(() => !!window.google || !!window.gapi), false);
  assert.deepEqual(errors, []);
  console.log('PASS: iPad top-level OAuth, PKCE, URL cleanup, authenticated code exchange and ID-only file handoff');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
