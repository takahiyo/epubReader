/** dialog-focus.js - Keep keyboard interaction inside the visible reader dialog. */
import { DOM_SELECTORS, UI_CLASSES } from '../../constants.js';
let active = null;

/**
 * Find visible keyboard controls, excluding collapsed groups and the hidden zoom slider.
 * @param {HTMLElement} scope - Dialog to inspect
 * @returns {HTMLElement[]} Controls in DOM order
 */
function controls(scope) {
  return [...scope.querySelectorAll(DOM_SELECTORS.DIALOG_FOCUSABLE)].filter(element =>
    !element.closest('[inert]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.closest(DOM_SELECTORS.ZOOM_SLIDER_CONTAINER));
}

/**
 * Activate one dialog and remember its opener without changing book layout.
 * @param {HTMLElement} scope - Visible dialog
 * @param {Function|null} dismiss - Optional Escape action
 * @returns {void}
 */
export function beginDialogFocus(scope, dismiss = null) {
  if (!scope || active?.scope === scope) return;
  if (active) endDialogFocus(active.scope, false);
  const opener = document.activeElement;
  const keydown = event => {
    if (document.body.classList.contains(UI_CLASSES.IS_ZOOMED)) return;
    if (event.key === 'Escape' && dismiss) {
      event.preventDefault(); event.stopImmediatePropagation(); dismiss(); return;
    }
    if (event.key !== 'Tab') return;
    const items = controls(scope);
    const first = items[0] ?? scope;
    const last = items.at(-1) ?? scope;
    if (!scope.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) ||
      (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  };
  // Button/input handlers run normally, while reader shortcuts cannot fire behind the dialog.
  const containKeys = event => { if (!document.body.classList.contains(UI_CLASSES.IS_ZOOMED)) event.stopPropagation(); };
  scope.setAttribute('tabindex', '-1');
  document.addEventListener('keydown', keydown, true);
  scope.addEventListener('keydown', containKeys);
  active = { scope, opener, keydown, containKeys };
  (controls(scope)[0] ?? scope).focus({ preventScroll: true });
}

/**
 * Release dialog keyboard handling and restore a still-visible opener.
 * @param {HTMLElement} scope - Dialog being closed
 * @param {boolean} restore - Whether to return focus
 * @returns {void}
 */
export function endDialogFocus(scope, restore = true) {
  if (active?.scope !== scope) return;
  const { opener, keydown, containKeys } = active;
  document.removeEventListener('keydown', keydown, true);
  scope.removeEventListener('keydown', containKeys);
  active = null;
  if (restore && opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
}
