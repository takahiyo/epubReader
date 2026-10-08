/**
 * catalog-bulk-editor.js: bounded, explicit draft for series/volume organization.
 * Dependencies: shared catalog constants; DOM/translation/save callbacks are injected
 * by catalog-ui.js. Draft survives paging and is never saved by opening this editor.
 */
import { CATALOG_CONFIG as C, CATALOG_BULK as B, CATALOG_UI as U } from '../../constants.js';

/**
 * Build a draft for selected book identities with the revisions observed at selection.
 * @param {Object} config Snapshot, selected books, DOM helpers and callbacks
 * @returns {HTMLFormElement} Editor; submit emits a command, not a storage write
 */
export function createCatalogBulkEditor({ books, series, t, node, button, options, onSave, onCancel }) {
  const form = node('form'); form.id = B.form; form.className = B.classes.editor;
  const draft = books.map(book => ({ bookId: book.id, revision: book.revision, volume_label: book.volume_label || '', sort_order: book.sort_order ?? '' }));
  const target = node('select'); target.id = B.target;
  options(target, [[B.modes.keep, t('catalog_bulk_keep')], [B.modes.clear, t('catalog_bulk_clear_series')],
    [B.modes.create, t('catalog_bulk_new_series')], ...series.map(row => [B.seriesOptionPrefix + row.id, row.name])]);
  const name = node('input'); name.id = B.name; name.type = 'text'; name.disabled = true;
  target.onchange = () => { name.disabled = target.value !== B.modes.create; name.required = !name.disabled; };
  const targetLabel = node('label', t('catalog_bulk_target')); targetLabel.htmlFor = target.id; targetLabel.append(target);
  const nameLabel = node('label', t('catalog_field_new_series')); nameLabel.htmlFor = name.id; nameLabel.append(name);
  const rows = node('div'), paging = node('div'); paging.className = U.classes.paging; let page = 0;
  /** @returns {void} Render one page while keeping every offscreen draft in memory. */
  function draw() {
    rows.replaceChildren(); const pages = Math.max(1, Math.ceil(books.length / C.pageSize));
    for (let index = page * C.pageSize; index < Math.min(books.length, (page + 1) * C.pageSize); index++) {
      const book = books[index], entry = draft[index], row = node('div'); row.className = B.classes.row;
      row.append(node('h4', book.title), node('p', [series.find(value => value.id === book.series_id)?.name, book.edition, book.author].filter(Boolean).join(' · ')));
      for (const [key, prefix, type] of [['volume_label', B.labelPrefix, 'text'], ['sort_order', B.orderPrefix, 'number']]) {
        const label = node('label', t('catalog_field_' + key)), control = node('input'); control.id = prefix + book.id; control.type = type; control.value = entry[key];
        label.htmlFor = control.id; label.append(control); row.append(label);
        control.oninput = () => { entry[key] = control.value; };
      }
      rows.append(row);
    }
    const previous = button('catalog_previous', () => { page--; draw(); }); previous.disabled = page === 0;
    const next = button('catalog_next', () => { page++; draw(); }); next.disabled = page >= pages - 1;
    paging.replaceChildren(previous, node('span', `${page + 1} / ${pages}`), next);
  }
  const save = button('catalog_bulk_save', () => {}); save.id = B.save; save.type = 'submit';
  const cancel = button('catalog_cancel', onCancel); cancel.id = B.cancel;
  form.append(node('h4', `${t('catalog_bulk_title')} · ${books.length}`), node('p', t('catalog_bulk_note')), targetLabel, nameLabel, rows, paging, save, cancel);
  form.onsubmit = event => {
    event.preventDefault();
    // Imported IDs may contain reserved mode text; prefixed option values remain unambiguous.
    const chosen = series.find(row => B.seriesOptionPrefix + row.id === target.value);
    onSave({ books: structuredClone(draft), seriesMode: chosen ? B.modes.set : target.value,
      seriesId: chosen?.id, seriesRevision: chosen?.revision, seriesName: name.value });
  };
  draw(); return form;
}
