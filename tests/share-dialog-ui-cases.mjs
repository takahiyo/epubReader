/** Validate actual theme colors and reachable share actions rather than relying on CSS declarations. */
export async function verifyShareDialog(page, screenshotDirectory) {
  for (const language of ['ja', 'en']) {
    await page.evaluate(language => document.getElementById(language === 'ja' ? 'leftLangJa' : 'leftLangEn').click(), language);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const [width, height] of [[320, 568], [390, 844], [568, 320], [768, 1024], [1024, 768], [1440, 900]]) {
        await page.setViewport({ width, height, hasTouch: true });
        await page.evaluate(() => document.getElementById('share-log-btn').click());
        const result = await page.evaluate(() => {
          const dialog = document.querySelector('.reading-log-share-dialog');
          const rect = dialog.getBoundingClientRect();
          const background = getComputedStyle(dialog).backgroundColor;
          const probe = document.createElement('div');
          probe.style.background = 'var(--card)'; dialog.append(probe);
          const themeBackground = getComputedStyle(probe).backgroundColor; probe.remove();
          const luminance = color => {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255)
              .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
          };
          const actions = [...dialog.querySelectorAll('button')].map(button => {
            button.scrollIntoView({ block: 'nearest' });
            const bounds = button.getBoundingClientRect(), style = getComputedStyle(button);
            const bg = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? background : style.backgroundColor;
            const light = luminance(style.color), dark = luminance(bg);
            const contrast = (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
            const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
            return { contrast, height: bounds.height, reachable: button.contains(hit) };
          });
          return { fits: rect.top >= 0 && rect.bottom <= innerHeight + 1 && dialog.scrollWidth <= dialog.clientWidth + 1,
            background, themeBackground, actions, focused: dialog.contains(document.activeElement) };
        });
        if (!result.fits || !result.focused || result.background !== result.themeBackground ||
            result.actions.some(action => action.contrast < 4.5 || action.height < 44 || !action.reachable)) {
          throw new Error('Share dialog theme/layout failure: ' + JSON.stringify({ language, theme, width, height, result }));
        }
        if (language === 'ja' && width === 390) {
          await page.evaluate(() => document.querySelector('.reading-log-share-dialog').scrollTop = 0);
          await page.screenshot({ path: screenshotDirectory + '/share-dialog-' + theme + '.png' });
        }
        await page.keyboard.press('Escape');
      }
    }
  }
}
