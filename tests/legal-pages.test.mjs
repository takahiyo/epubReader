import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPreviewServer } from '../scripts/local-preview.mjs';
import { localizeLegalLinks } from '../assets/js/ui/legal-links.js';

test('public legal pages work without login or JavaScript, with valid navigation and contact details', async () => {
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const filename of ['privacy.html', 'terms.html', 'privacy-en.html', 'terms-en.html']) {
      const response = await fetch(origin + '/' + filename);
      assert.equal(response.status, 200, filename);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      const html = await response.text();
      assert.match(html, /Flateight/); assert.match(html, /mailto:bookreader@flateight.jp/);
      assert.match(html, /<html lang="(ja|en)">/); assert.match(html, /<main id="legal-content">/);
      assert.doesNotMatch(html, /<script\b|\.apps\.googleusercontent\.com|AIzaSy/);
      for (const [, href] of html.matchAll(/href="([^" ]+)"/g)) {
        if (href.startsWith('#')) assert.ok(html.includes('id="' + href.slice(1) + '"'), href);
        if (href.startsWith('./')) assert.equal((await fetch(new URL(href, origin + '/' + filename))).status, 200, href);
      }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('legal pages and their stylesheet are bundled for offline PWA navigation', async () => {
  const { assets } = JSON.parse(await readFile('assets/sw-cache-config.json', 'utf8'));
  for (const asset of ['./privacy.html', './terms.html', './privacy-en.html', './terms-en.html', './assets/css/26-legal.css']) assert.ok(assets.includes(asset), asset);
  const homepage = await readFile('index.html', 'utf8');
  assert.match(homepage, /data-legal-link="privacy" href="\.\/privacy.html"/);
  assert.match(homepage, /data-legal-link="terms" href="\.\/terms.html"/);
});

test('changing the reader language points legal links to the matching static translation', () => {
  const privacy = { dataset: { legalLink: 'privacy' } }, terms = { dataset: { legalLink: 'terms' } }, notice = {};
  globalThis.document = { querySelectorAll: selector => selector === '[data-legal-link]' ? [privacy, terms] : [notice] };
  try {
    localizeLegalLinks('en');
    assert.equal(privacy.href, './privacy-en.html'); assert.equal(privacy.textContent, 'Privacy Policy');
    assert.equal(terms.href, './terms-en.html'); assert.equal(terms.textContent, 'Terms of Use');
    assert.ok(notice.textContent.includes('BookReader'));
    localizeLegalLinks('ja');
    assert.equal(privacy.href, './privacy.html'); assert.equal(privacy.textContent, 'プライバシーポリシー');
    assert.equal(terms.href, './terms.html'); assert.equal(terms.textContent, '利用規約');
  } finally { delete globalThis.document; }
});
