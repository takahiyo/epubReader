/** Real-browser layout, focus and hit-target checks for the unified reader controls. */
import { verifyMenuColors } from './menu-colors-cases.mjs';
export async function verifyReaderControls(page, screenshotDirectory, prefix) {
  const sizes = [[320, 568], [390, 844], [568, 320], [768, 1024], [1024, 768], [1440, 900]];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const open = () => page.evaluate(async () => {
    const { toggleFloatOverlay } = await import('/assets/js/ui/renderers.js');
    toggleFloatOverlay(true);
  });
  for (const language of ['ja', 'en']) {
    await page.evaluate(language => document.getElementById(language === 'ja' ? 'leftLangJa' : 'leftLangEn').click(), language);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const [width, height] of sizes) {
        await page.setViewport({ width, height, hasTouch: true });
        await open();
        await page.evaluate(() => {
          document.querySelectorAll(".float-menu-group").forEach(group => {
            const expanded = group.dataset.group === "book";
            if (group.classList.contains("expanded") !== expanded) group.querySelector(".float-menu-group-header").click();
          });
          document.querySelector(".float-buttons").scrollTop = 0;
        });
        const bounds = await page.evaluate(() => {
          const panel = document.querySelector('.reader-command-panel');
          const rect = panel.getBoundingClientRect();
          const nav = panel.querySelector('.reader-primary-actions');
          const primary = [...nav.querySelectorAll('button')].map(button => {
            const r = button.getBoundingClientRect();
            return { id: button.id, width: r.width, height: r.height, left: r.left, right: r.right, bottom: r.bottom };
          });
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            overflow: panel.scrollWidth - panel.clientWidth, primary, focusInside: panel.contains(document.activeElement) };
        });
        check(bounds.left >= -1 && bounds.right <= width + 1 && bounds.top >= -1 && bounds.bottom <= height + 1,
          'Panel must fit: ' + JSON.stringify({ width, height, language, theme, bounds }));
        check(bounds.overflow <= 1 && bounds.focusInside, 'No horizontal overflow and focus enters the panel');
        check(bounds.primary.map(button => button.id).join(',') === 'floatLibrary,openToc,floatBookmarks,floatSearch,floatSettings',
          'Primary action order stays consistent on every device');
        check(bounds.primary.every(button => button.width >= 44 && button.height >= 44 && button.left >= bounds.left && button.right <= bounds.right + 1),
          'Primary actions meet touch size and stay inside the panel');
        await verifyMenuColors(page);
        if (language === 'ja' && (width === 390 || width === 1440)) {
          await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".float-menu-group[data-group=book] .float-menu-group-items")).opacity) === 1);
          await page.evaluate(() => document.querySelector('.reader-command-panel').getAnimations({ subtree: true }).forEach(animation => animation.finish()));
          await page.evaluate(() => document.getElementById('__share-toast')?.remove());
          await page.screenshot({ path: screenshotDirectory + '/' + prefix + '-controls-' + theme + '-' + width + '.png' });
        }
        // Expanded tools can scroll; every actual button must remain reachable and unobscured.
        const targets = await page.evaluate(() => {
          document.querySelectorAll('.float-menu-group').forEach(group => {
            if (!group.classList.contains('expanded')) group.querySelector('.float-menu-group-header').click();
          });
          return [...document.querySelectorAll('.reader-command-panel button[id]')]
            .filter(button => !button.disabled && !button.closest('[inert]') && button.getClientRects().length)
            .map(button => button.id);
        });
        for (const id of targets) {
          const reachable = await page.evaluate(id => {
            const button = document.getElementById(id);
            button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            const r = button.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return button === hit || button.contains(hit);
          }, id);
          check(reachable, 'Expanded action is reachable at ' + width + 'x' + height + ': ' + id);
        }
        await page.evaluate(() => document.getElementById('closeReaderControls').click());
      }
    }
  }

  // Enlarged UI text and long book names must keep every command reachable in short windows.
  for (const [width, height] of [[320, 568], [568, 320], [1024, 768]]) {
    await page.setViewport({ width, height, hasTouch: true });
    await open();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
      document.getElementById('floatBookTitle').textContent = '非常に長い書籍タイトル'.repeat(30);
      document.querySelectorAll('.float-menu-group').forEach(group => {
        if (!group.classList.contains('expanded')) group.querySelector('.float-menu-group-header').click();
      });
    });
    const ids = await page.evaluate(() => [...document.querySelectorAll('.reader-command-panel button[id]')]
      .filter(button => !button.disabled && !button.closest('[inert]') && button.getClientRects().length).map(button => button.id));
    for (const id of ids) {
      check(await page.evaluate(id => {
        const button = document.getElementById(id); button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const panel = document.querySelector('.reader-command-panel');
        return button.contains(hit) && panel.scrollWidth <= panel.clientWidth + 1;
      }, id), '200% UI text must keep action reachable: ' + id + ' at ' + width + 'x' + height);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.getElementById('closeReaderControls').click(); });
  }
  if (prefix === 'comic') {
    for (const [width, height] of [[320, 568], [568, 320], [1440, 900]]) {
      await page.setViewport({ width, height, hasTouch: true });
      await open();
      await page.click('#toggleZoom');
      const zoomLayout = await page.evaluate(() => {
        const button = document.getElementById('toggleZoom');
        const slider = document.getElementById('zoomSlider');
        const buttonRect = button.getBoundingClientRect(), sliderRect = slider.getBoundingClientRect();
        const hit = document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2);
        const panTarget = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        const passed = document.body.classList.contains('is-zoomed') && button.contains(hit) &&
          sliderRect.left >= 0 && sliderRect.right <= innerWidth && sliderRect.top >= 0 && sliderRect.bottom <= innerHeight &&
          !panTarget.closest('.reader-command-panel, .float-backdrop');
        return { passed, buttonRect: buttonRect.toJSON(), sliderRect: sliderRect.toJSON(), hit: hit?.outerHTML?.slice(0,120), panTarget: panTarget?.outerHTML?.slice(0,120) };
      });
      check(zoomLayout.passed, 'Zoom UI at ' + width + 'x' + height + ': ' + JSON.stringify(zoomLayout));
      await page.evaluate(() => {
        const slider = document.getElementById('zoomSlider'); slider.value = '2.3'; slider.dispatchEvent(new Event('input', { bubbles: true }));
      });
      check(await page.evaluate(() => Math.abs(window.__testReader.zoomScale - 2.3) < .01), 'Zoom slider changes the actual reader scale');
      await page.click('#toggleZoom');
      check(await page.evaluate(() => !document.body.classList.contains('is-zoomed') &&
        !document.getElementById('floatOverlay').classList.contains('visible')), 'Zoom exit returns directly to reading');
    }
  }
  await page.setViewport({ width: 390, height: 844, hasTouch: true });
  await open();
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.reader-command-panel button')].filter(button =>
      !button.disabled && !button.closest('[inert]') && button.getClientRects().length);
    buttons.at(-1).focus();
  });
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement.id === 'closeReaderControls'), 'Tab wraps inside controls');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => !document.getElementById('floatOverlay').classList.contains('visible')), 'Escape closes controls');
  await open();
  await page.evaluate(async () => {
    const { updateFloatProgressBar } = await import('/assets/js/ui/renderers.js');
    updateFloatProgressBar(73);
  });
  check(await page.evaluate(() => document.getElementById('floatProgressPercent').textContent === '73%' &&
    document.getElementById('floatProgressFill').style.width === '73%'), 'Visible progress updates without a stale app flag');
  await page.click('#floatSettings');
  check(await page.evaluate(() => document.getElementById('settingsModal').contains(document.activeElement)), 'Settings receives focus from the primary action');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.getElementById('settingsModal').classList.contains('hidden')), 'Escape closes settings');
}
