/**
 * シームレス挿絵のスクロールと長押しズームを、実際のChromiumタッチ入力で確認する。
 * ReaderController本体を使い、書籍ロード・認証の依存だけをフィクスチャから除外する。
 * 実行: NODE_PATH に Playwright のある node_modules を指定して node tests/image-touch-scroll-browser.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as constants from '../assets/constants.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const readerSource = await readFile(new URL('../assets/reader.js', import.meta.url), 'utf8');
const readerClass = readerSource.slice(readerSource.indexOf('export class ReaderController')).replace('export class', 'class');
const css = await Promise.all(['04-reader', '06-reader-extras', '19-zoom'].map(name =>
  readFile(new URL(`../assets/css/${name}.css`, import.meta.url), 'utf8')));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
});

try {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const client = await page.context().newCDPSession(page);
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${css.join('\n')}
      .hidden { display: none !important; }
      #fullscreenReader { z-index: 1; }
      #imageViewer { z-index: 20; padding: 0; }
      #viewer img { display: block; width: 360px; height: 500px; }
      .filler { height: 2000px; }
    </style>
    <div id="fullscreenReader" class="fullscreen-reader epub-scroll-mode">
      <div id="viewer" class="viewer"><img id="illustration"><div class="filler"></div></div>
      <div id="imageViewer" class="image-viewer hidden"><img id="pageImage"></div>
    </div>`);
  const fixtureConstants = Object.fromEntries([
    'LONG_PRESS_ZOOM_CONFIG', 'DOM_IDS', 'DOM_SELECTORS', 'UI_CLASSES', 'BOOK_TYPES',
    'EPUB_VIEW_MODES', 'IMAGE_VIEW_MODES', 'READER_CONFIG',
  ].map(name => [name, constants[name]]));
  await page.evaluate(values => Object.assign(window, values), fixtureConstants);
  await page.addScriptTag({ content: `${readerClass}\nwindow.ReaderController = ReaderController;` });
  await page.evaluate(() => {
    const reader = window.reader = Object.create(ReaderController.prototype);
    Object.assign(reader, {
      type: BOOK_TYPES.EPUB, epubViewMode: EPUB_VIEW_MODES.SCROLL,
      viewer: document.getElementById('viewer'), imageViewer: document.getElementById('imageViewer'),
      imageElement: document.getElementById('pageImage'), imageViewMode: IMAGE_VIEW_MODES.SINGLE,
      longPressZoomEnabled: true, longPressZoomScale: LONG_PRESS_ZOOM_CONFIG.DEFAULT_SCALE,
      imageZoomed: false, zoomScale: 1, panX: 0, panY: 0,
    });
    const image = document.getElementById('illustration');
    image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="500"><rect width="360" height="500" fill="orange"/></svg>');
    reader.bindElementZoomHandlers(image, () => image.src);
    reader.bindPanEvents();
    reader.bindZoomEvents();
    window.fixtureTouch = (type, points, cancelable = true) => {
      const event = new Event(type, { bubbles: true, cancelable });
      const touches = points.map(([identifier, clientX, clientY]) => ({ identifier, clientX, clientY }));
      Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: touches } });
      document.getElementById('illustration').dispatchEvent(event);
      return event.defaultPrevented;
    };
  });
  await page.waitForFunction(() => document.getElementById('illustration').complete);
  const dispatch = (type, points = []) => client.send('Input.dispatchTouchEvent', {
    type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })),
  });
  const resetScroll = async () => {
    // 前のスワイプの慣性を落ち着かせ、CSSのsmoothに影響されず初期位置へ戻す。
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      reader._cancelImageTouchGesture?.();
      reader.viewer.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await page.waitForFunction(() => reader.viewer.scrollTop === 0);
    await page.waitForTimeout(100);
  };
  const swipe = async () => {
    await dispatch('touchStart', [[1, 180, 420]]);
    for (const y of [390, 350, 300, 250]) await dispatch('touchMove', [[1, 180, y]]);
    // 指を止めても、同じタッチの途中で長押し判定へ戻らない。
    await page.waitForTimeout(constants.LONG_PRESS_ZOOM_CONFIG.DELAY_MS + 50);
    assert.equal(await page.evaluate(() => reader.imageZoomed), false);
    await dispatch('touchEnd');
  };

  await swipe();
  await page.waitForTimeout(constants.LONG_PRESS_ZOOM_CONFIG.DELAY_MS + 100);
  assert.ok(await page.evaluate(() => reader.viewer.scrollTop > 0), '画像上から本文をスクロールできる');
  assert.equal(await page.evaluate(() => reader.imageZoomed), false, 'スワイプ途中で停止してもズームしない');

  await resetScroll();
  await page.evaluate(() => reader.viewer.scrollTo({ top: 120, behavior: 'instant' }));
  await page.waitForTimeout(100);
  const readingPosition = await page.evaluate(() => ({ top: reader.viewer.scrollTop, width: reader.viewer.clientWidth }));
  await dispatch('touchStart', [[1, 180, 250]]);
  await page.waitForFunction(() => reader.imageZoomed);
  assert.equal(await page.evaluate(() => reader.viewer.clientWidth), readingPosition.width, '本文固定で折り返し幅を変えない');
  const before = await page.evaluate(() => ({ top: reader.viewer.scrollTop, pan: reader.panY }));
  await dispatch('touchMove', [[1, 180, 120]]);
  await dispatch('touchMove', [[1, 180, 640]]);
  const during = await page.evaluate(() => ({ top: reader.viewer.scrollTop, pan: reader.panY, zoomed: reader.imageZoomed }));
  assert.equal(during.top, before.top, 'ズーム後の大きな移動でも本文位置が変わらない');
  assert.notEqual(during.pan, before.pan, '拡大画像の表示位置は移動する');
  assert.equal(during.zoomed, true, '画像外へ指を動かしてもズームを維持する');
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => reader.viewer.scrollTop), before.top, 'ズーム中はホイールでも本文が動かない');
  await dispatch('touchEnd');
  assert.equal(await page.evaluate(() => reader.imageZoomed), false);
  assert.equal(await page.evaluate(() => reader.viewer.scrollTop), readingPosition.top, '読書途中の位置も維持する');
  assert.equal(await page.evaluate(() => reader.longPressZoomJustEnded), true, 'ズーム終了直後のクリックをガードする');
  assert.equal(await page.evaluate(() => reader._cancelImageTouchGesture), null);
  await swipe();
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => reader.viewer.scrollTop > 0), '次のスワイプでスクロールを再開する');

  await resetScroll();
  await page.evaluate(() => {
    reader.viewer.style.setProperty('overflow-y', 'scroll', 'important');
    fixtureTouch('touchstart', [[1, 180, 250]]);
  });
  await page.waitForFunction(() => reader.imageZoomed);
  assert.equal(await page.evaluate(() => fixtureTouch('touchstart', [[1, 180, 250], [2, 200, 250]])), true);
  await page.evaluate(() => fixtureTouch('touchend', [[2, 200, 250]]));
  assert.equal(await page.evaluate(() => reader.imageZoomed), false);
  assert.equal(await page.evaluate(() => reader.viewer.style.overflowY), 'hidden', '残った指がある間は本文を固定する');
  assert.equal(await page.evaluate(() => fixtureTouch('touchmove', [[2, 200, 100]])), true);
  await page.evaluate(() => fixtureTouch('touchend', []));
  assert.deepEqual(await page.evaluate(() => [reader.viewer.style.overflowY, reader.viewer.style.getPropertyPriority('overflow-y')]), ['scroll', 'important']);

  await page.evaluate(() => {
    fixtureTouch('touchstart', [[1, 180, 250]]);
    fixtureTouch('touchmove', [[1, 180, 249]], false);
  });
  await page.waitForTimeout(constants.LONG_PRESS_ZOOM_CONFIG.DELAY_MS + 50);
  assert.equal(await page.evaluate(() => reader.imageZoomed), false, 'ブラウザが引き取った操作からズームしない');
  await page.evaluate(() => fixtureTouch('touchcancel', []));
  assert.equal(await page.evaluate(() => reader._cancelImageTouchGesture), null);

  await page.evaluate(() => fixtureTouch('touchstart', [[1, 180, 250]]));
  await page.waitForFunction(() => reader.imageZoomed);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.evaluate(() => reader.imageZoomed), false, '画面中断でズームを解除する');
  assert.equal(await page.evaluate(() => reader.viewer.style.overflowY), 'scroll', '中断後に本文固定が残らない');

  await page.evaluate(() => {
    reader.type = BOOK_TYPES.IMAGE;
    fixtureTouch('touchstart', [[1, 180, 250]]);
  });
  assert.equal(await page.evaluate(() => reader._cancelImageTouchGesture), null, '画像書庫にはシームレス用処理を適用しない');
  assert.deepEqual(errors, []);
  console.log('PASS: native image swipe, zoom pan and scroll lock, next swipe, multi-touch, cancellation, style restoration, book scope');
} finally {
  await browser.close();
}
