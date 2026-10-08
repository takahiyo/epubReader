/** Copy registration review. DOM/translation/callbacks are injected by catalog-ui.js. */
import { CATALOG_CONFIG as C, CATALOG_COPY as COPY, CATALOG_UI as U } from '../../constants.js';

/** @param {Object} config Drafts, series, DOM helpers and callbacks @returns {HTMLFormElement} Bounded editor retaining offscreen inputs. */
export function createCatalogCopyEditor({ drafts, series, t, node, button, options, onSave, onCancel }) {
  const form = node('form'); form.id = COPY.form; form.className = U.classes.form;
  const rows = node('div'); rows.style.gridColumn = '1 / -1'; let page = 0;
  const paging = node('div'); paging.className = U.classes.paging;
  const selections = { series_id: [['', t('catalog_bulk_clear_series')], ...series.map(row => [row.id, row.name])],
    provider: C.providers.map(value => [value, t('catalog_' + value)]), format: [['', t('catalog_unknown')], ...C.localFormats.map(value => [value, value.toUpperCase()])],
    access_type: C.accessTypes.map(value => [value, t('catalog_' + value)]), availability_status: C.availabilityStates.map(value => [value, t('catalog_' + value)]) };
  /** @param {HTMLElement} container Parent @param {Object} values Draft fields @param {string[]} fields Allowed fields @param {string} prefix Identity @returns {void} Editable fields. */
  function inputs(container, values, fields, prefix) {
    for (const key of fields) {
      const label = node('label', t('catalog_field_' + key)), control = node(selections[key] ? 'select' : 'input'); control.id = COPY.prefix + prefix + '-' + key;
      if (selections[key]) { options(control, selections[key]); control.value = values[key]; }
      else { control.type = key === 'sort_order' ? 'number' : key === 'external_url' ? 'url' : 'text'; control.value = values[key]; control.required = key === 'title'; }
      label.htmlFor = control.id; label.append(control); container.append(label);
      control.oninput = () => { values[key] = control.value; if (key === 'provider' && control.value !== C.providers[0]) {
        values.format = ''; document.getElementById(COPY.prefix + prefix + '-format').value = '';
      } };
    }
  }
  /** @returns {void} Draw one page; every input writes to the retained draft. */
  function draw() {
    rows.replaceChildren(); const pages = Math.max(1, Math.ceil(drafts.length / C.pageSize));
    for (let i = page * C.pageSize; i < Math.min(drafts.length, (page + 1) * C.pageSize); i++) {
      const draft = drafts[i], card = node('section'); card.className = U.classes.book;
      card.append(node('h4', `${i + 1} · ${t('catalog_copy_book')}`)); inputs(card, draft.values, COPY.bookFields, String(i));
      for (let j = 0; j < draft.holdings.length; j++) {
        const holding = node('section'); holding.className = U.classes.holding;
        inputs(holding, draft.holdings[j].values, COPY.holdingFields, `${i}-${j}`); card.append(holding);
      }
      rows.append(card);
    }
    const previous = button('catalog_previous', () => { page--; draw(); }); previous.disabled = page === 0;
    const next = button('catalog_next', () => { page++; draw(); }); next.disabled = page >= pages - 1;
    paging.replaceChildren(previous, node('span', `${page + 1} / ${pages}`), next);
  }
  const save = button('catalog_copy_save', () => {}); save.type = 'submit'; save.id = COPY.save;
  const cancel = button('catalog_cancel', onCancel); cancel.id = COPY.cancel;
  form.append(node('p', `${t('catalog_copy_note')} (${drafts.length})`), rows, paging, save, cancel);
  form.onsubmit = event => { event.preventDefault(); onSave(structuredClone(drafts)); };
  draw(); return form;
}
