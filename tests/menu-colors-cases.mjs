/**
 * Check actual menu text against composited ancestor backgrounds, including hover and expanded states.
 * @param {Object} page - Puppeteer page with the reader menu open
 * @returns {Promise<void>} Rejects on an unreadable label or missing surface hierarchy
 */
export async function verifyMenuColors(page) {
  const inspect = () => page.evaluate(() => {
    const rgb = color => color.match(/[\d.]+/g).map(Number);
    const blend = (front, back) => front.slice(0, 3).map((value, i) => value * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
    const luminance = color => {
      const channels = color.slice(0, 3).map(value => value / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const failures = [];
    const labels = document.querySelectorAll('.reader-command-panel button:not(:disabled):not(.bookmark-marker), .reader-section-label, .float-version, #floatBookTitle, .float-auth-status, .left-menu .menu-item:not(:disabled), .left-menu .user-info, .menu-version');
    for (const label of labels) {
      if (!label.textContent.trim() || !label.getClientRects().length || label.closest('[inert]')) continue;
      const ancestors = [];
      for (let element = label; element; element = element.parentElement) ancestors.unshift(element);
      let background = [255, 255, 255];
      for (const element of ancestors) background = blend(rgb(getComputedStyle(element).backgroundColor), background);
      const style = getComputedStyle(label);
      const foreground = blend([...rgb(style.color).slice(0, 3), Number(style.opacity)], background);
      const light = luminance(foreground), dark = luminance(background);
      const contrast = (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
      if (contrast < 4.5) failures.push({ label: label.id || label.className, contrast });
    }
    const panel = document.querySelector('.reader-command-panel');
    const action = panel.querySelector('.reader-primary-actions button');
    if (getComputedStyle(panel).backgroundColor === getComputedStyle(action).backgroundColor) failures.push({ label: 'Surface hierarchy' });
    return failures;
  });
  const initial = await inspect();
  if (initial.length) throw new Error('Menu contrast: ' + JSON.stringify(initial));
  await page.hover('#floatLibrary');
  const hovered = await inspect();
  if (hovered.length) throw new Error('Hovered menu contrast: ' + JSON.stringify(hovered));
  await page.mouse.move(0, 0);
}
