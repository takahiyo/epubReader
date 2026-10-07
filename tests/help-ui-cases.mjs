/**
 * Exercise help from the real settings screen, including short screens and keyboard dismissal.
 * @param {Object} page - Puppeteer page with the application loaded
 * @param {string} screenshots - Directory for review images
 * @returns {Promise<void>} Rejects on unavailable content, overflow or unreachable actions
 */
export async function verifyHelp(page, screenshots) {
  const version = await page.evaluate(async () => (await import('/assets/constants.js')).APP_INFO.VERSION);
  for (const language of ['ja', 'en']) {
    const topics = await page.evaluate(async language => (await import('/assets/i18n/help.js')).HELP_CONTENT[language].sections.map(section => section.title), language);
    await page.evaluate(language => document.getElementById(language === 'ja' ? 'leftLangJa' : 'leftLangEn').click(), language);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const [width, height] of [[320, 568], [390, 844], [568, 320], [768, 1024], [1024, 768], [1440, 900]]) {
        await page.setViewport({ width, height, hasTouch: true });
        await page.evaluate(() => document.getElementById('floatSettings').click());
        await page.click('#settingsHelpButton');
        const result = await page.evaluate(() => {
          const help = document.getElementById('settingsHelpContent');
          help.querySelectorAll('details').forEach(item => item.open = true);
          const modal = document.querySelector('#settingsModal .modal-content');
          const rect = modal.getBoundingClientRect();
          return { open: document.getElementById('settingsHelpButton').getAttribute('aria-expanded'),
            focused: document.activeElement === help, title: help.querySelector('h4').textContent,
            sections: help.querySelectorAll('details').length, text: help.textContent,
            fits: rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1,
            overflow: modal.scrollWidth - modal.clientWidth };
        });
        if (result.open !== 'true' || !result.focused || !result.title.includes('Ver' + version) ||
            result.sections !== topics.length || !topics.every(topic => result.text.includes(topic)) || !result.fits || result.overflow > 1 || !result.text.includes('HTTPS') || !result.text.includes('tags')) {
          throw new Error('Help content/layout: ' + JSON.stringify({ language, theme, width, height, result }));
        }
        if (language === 'ja' && width === 390) {
          await page.evaluate(() => document.querySelector('#settingsModal .modal-content').scrollTop = 0);
          await page.screenshot({ path: screenshots + '/help-' + theme + '.png' });
        }
        // The end of a long article remains reachable; closing restores focus to its opener.
        await page.$eval('#settingsHelpClose', button => button.scrollIntoView({ block: 'center' }));
        await page.click('#settingsHelpClose');
        if (!await page.evaluate(() => document.getElementById('settingsHelpContent').classList.contains('hidden') &&
            document.activeElement.id === 'settingsHelpButton')) throw new Error('Help close must restore focus');
        await page.keyboard.press('Escape');
        if (!await page.evaluate(() => document.getElementById('settingsModal').classList.contains('hidden'))) throw new Error('Escape closes settings');
      }
    }
  }
}
