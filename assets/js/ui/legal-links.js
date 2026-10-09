import { getUiStrings } from '../../i18n.js';

/** Keep public legal links usable before login and after interface-language changes. */
export function localizeLegalLinks(language) {
  const strings = getUiStrings(language), suffix = language === 'en' ? '-en' : '';
  document.querySelectorAll('[data-legal-link]').forEach(link => {
    const kind = link.dataset.legalLink;
    if (!['privacy', 'terms'].includes(kind)) return;
    link.href = './' + kind + suffix + '.html';
    link.textContent = strings[kind === 'privacy' ? 'legalPrivacy' : 'legalTerms'];
  });
  document.querySelectorAll('[data-legal-notice]').forEach(element => { element.textContent = strings.legalNotice; });
}
