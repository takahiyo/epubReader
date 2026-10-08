/** Bounded history editor with explicit dates and no changes to current reader state. */
import { CATALOG_CONFIG as C, CATALOG_HISTORY as H, CATALOG_UI as U } from '../../constants.js';
import { catalogLocalDate } from '../core/catalog-history.js';

/** @param {Object} config Snapshot, holding, injected DOM/translation/save callbacks @returns {HTMLElement} History section. */
export function createCatalogHistoryEditor({ snapshot, holding, t, node, button, options, onSave, onCancel }) {
  const section = node('section'); section.className = U.classes.form;
  section.append(node('h4', t('catalog_history')),
    node('p', `${snapshot.books.find(book => book.id === holding.book_id)?.title || ''} · ${t('catalog_' + holding.provider)} · ${t('catalog_' + holding.access_type)}`),
    node('p', t('catalog_history_note')));
  const draft = node('div'), entries = node('div'), controls = node('div'); controls.className = U.classes.paging;
  const records = [
    ...snapshot.access_periods.filter(row => row.holding_id === holding.id && row.deleted_at == null).map(record => ({ kind: H.kinds.period, record })),
    ...snapshot.reading_events.filter(row => row.holding_id === holding.id && row.deleted_at == null).map(record => ({ kind: H.kinds.event, record })),
  ].sort((a, b) => (b.record.occurred_at ?? b.record.started_at ?? -1) - (a.record.occurred_at ?? a.record.started_at ?? -1));
  let page = 0;
  /** @param {string} kind Event or loan @param {Object|null} record Historical target @returns {void} Review new/corrected history before saving. */
  function edit(kind, record = null) {
    const form = node('form'); form.id = H.form; form.className = U.classes.form;
    const fields = kind === H.kinds.event ? H.eventFields : H.periodFields;
    form.append(node('h4', t(kind === H.kinds.event ? 'catalog_history_event' : 'catalog_history_period')));
    for (const name of fields) {
      const label = node('label', t('catalog_history_' + name));
      const control = node(name === 'event_type' ? 'select' : 'input'); control.id = H.prefix + name; control.name = name;
      if (name === 'event_type') { options(control, C.readingStates.map(value => [value, t('catalog_' + value)])); control.value = record?.event_type || H.completed; }
      else if (name === 'progress_percent') { control.type = 'number'; control.min = 0; control.max = 100; control.step = 'any'; control.value = record?.progress_percent ?? ''; }
      else {
        control.type = 'datetime-local'; control.step = 1; control.value = catalogLocalDate(record?.[name]);
        if (name === 'ended_at') {
          control.disabled = !!record && record.ended_at == null;
          control.required = !control.disabled;
        }
      }
      label.htmlFor = control.id; label.append(control); form.append(label);
    }
    const save = button('catalog_save', () => {}); save.id = H.save; save.type = 'submit';
    const cancel = button('catalog_cancel', () => draft.replaceChildren()); cancel.id = H.cancel;
    form.append(save, cancel);
    form.onsubmit = event => {
      event.preventDefault();
      onSave({ holdingId: holding.id, holdingRevision: holding.revision, kind, id: record?.id, revision: record?.revision,
        values: Object.fromEntries(fields.map(name => [name, form.elements.namedItem(name).value])) });
    };
    draft.replaceChildren(form); form.scrollIntoView({ block: 'nearest' }); form.querySelector('input,select')?.focus();
  }
  /** @returns {void} Render only one page while retaining the separate unsaved draft. */
  function render() {
    const date = value => value == null ? t('catalog_unknown_date') : new Date(value).toLocaleString();
    entries.replaceChildren();
    for (const { kind, record } of records.slice(page * C.pageSize, (page + 1) * C.pageSize)) {
      const row = node('div');
      const text = kind === H.kinds.event ? `${date(record.occurred_at)} · ${t('catalog_' + record.event_type)}${record.progress_percent == null ? '' : ` · ${record.progress_percent}%`}`
        : `${date(record.started_at)} → ${record.ended_at == null ? t('catalog_active') : date(record.ended_at)}`;
      row.append(node('p', text), button('catalog_history_correct', () => edit(kind, record))); entries.append(row);
    }
    if (!records.length) entries.append(node('p', t('catalog_no_history')));
    const pages = Math.max(1, Math.ceil(records.length / C.pageSize));
    const previous = button('catalog_previous', () => { page--; render(); }); previous.disabled = page === 0;
    const next = button('catalog_next', () => { page++; render(); }); next.disabled = page >= pages - 1;
    controls.replaceChildren(previous, node('span', `${page + 1} / ${pages}`), next);
  }
  section.append(button('catalog_history_event', () => edit(H.kinds.event)));
  if (holding.access_type === C.accessTypes[1]) section.append(button('catalog_history_period', () => edit(H.kinds.period)));
  section.append(button('catalog_close', onCancel), draft, entries, controls); render();
  return section;
}
