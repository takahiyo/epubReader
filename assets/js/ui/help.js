/** Settings help uses local text-only content and the existing modal's scrolling and focus handling. */
import { APP_INFO, UI_CLASSES } from '../../constants.js';
import { getUiStrings } from '../../i18n.js';

/**
 * Render current-language help safely without loading remote content or interpreting HTML.
 * @param {Object} elements - Shared UI element references
 * @param {string} language - Current interface language
 * @returns {void}
 */
export function renderHelp(elements, language) {
  const content = getUiStrings(language).helpContent;
  const { settingsHelpButton: button, settingsHelpContent: article, settingsHelpClose: close } = elements;
  if (!button || !article || !close) return;
  button.textContent = content.button;
  close.textContent = content.close;
  article.setAttribute('aria-label', content.title);
  article.replaceChildren();
  const heading = document.createElement('h4');
  heading.textContent = content.title + ' — Ver' + APP_INFO.VERSION;
  const intro = document.createElement('p');
  intro.textContent = content.intro;
  article.append(heading, intro);
  for (const section of content.sections) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = section.title;
    details.append(summary);
    for (const text of section.paragraphs) {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      details.append(paragraph);
    }
    article.append(details);
  }
}

/**
 * Toggle inline help without introducing another dialog or changing reading state.
 * @param {Object} elements - Shared UI element references
 * @param {boolean} open - Whether help should be shown
 * @param {boolean} focus - Move focus for a user action, but not settings initialization
 * @returns {void}
 */
export function setHelpOpen(elements, open, focus = true) {
  elements.settingsHelpContent?.classList.toggle(UI_CLASSES.HIDDEN, !open);
  elements.settingsHelpClose?.classList.toggle(UI_CLASSES.HIDDEN, !open);
  elements.settingsHelpButton?.setAttribute('aria-expanded', String(open));
  if (focus) (open ? elements.settingsHelpContent : elements.settingsHelpButton)?.focus({ preventScroll: true });
}
