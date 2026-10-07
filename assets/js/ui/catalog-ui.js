/** Unified catalog dialog. Reader and storage dependencies are supplied by the application. */
import { CATALOG_CONFIG as C, CATALOG_UI as U, UI_CLASSES } from '../../constants.js';
import { openCatalog } from '../core/catalog-store.js';
import { saveCatalogEntry, changeCatalogLoan, bindCatalogFile, catalogRows, normalizeCatalogSearch } from '../core/catalog-actions.js';

/**
 * Create one dialog without changing the reader's initialization order.
 * @param {Object} config Translation, legacy data, modal and local-file callbacks
 * @returns {Object} show/close/localize API
 */
export function createCatalogUI({ t, getLegacy, openModal, closeModal, openLocal }) {
  const root = document.createElement('div'); root.id = U.modal; root.className = `${UI_CLASSES.MODAL} ${UI_CLASSES.HIDDEN}`;
  const panel = document.createElement('section'); panel.className = `${UI_CLASSES.MODAL_CONTENT} ${U.classes.panel}`;
  const backdrop = document.createElement('div'); backdrop.className = UI_CLASSES.MODAL_BACKDROP; root.append(backdrop, panel); document.body.append(root);
  let repositoryPromise, snapshot, rows = [], page = 0, editing = null, busy = false, generation = 0;
  let search, seriesFilter, providerFilter, availabilityFilter, list, editor, notice, paging;
  const field = name => document.getElementById(U.prefix + name);
  const repo = () => repositoryPromise ||= openCatalog().catch(error => { repositoryPromise = null; throw error; });

  /** @param {string} tag DOM tag @param {string} text Safe text @returns {HTMLElement} New element. */
  function node(tag, text = '') { const element = document.createElement(tag); element.textContent = text; return element; }
  /** @param {string} key Translation key @param {Function} action Click callback @returns {HTMLButtonElement} Touch-sized button. */
  function button(key, action) { const element = node('button', t(key)); element.type = 'button'; element.onclick = action; return element; }
  /** @param {HTMLSelectElement} select Select @param {Array} values [value,label] pairs @returns {void} Safe options. */
  function options(select, values) { select.replaceChildren(...values.map(([value, label]) => { const option = node('option', label); option.value = value; return option; })); }
  /** @param {Error} error Failure @returns {void} Visible translated diagnostic. */
  function report(error) { notice.textContent = t(U.errors[error.code] || (error instanceof TypeError || error instanceof SyntaxError ? U.errors.invalid : U.errors.storage)); }
  /** @returns {void} Close without a late asynchronous open taking focus again. */
  function close() { generation++; closeModal(root); }

  /** @returns {void} Rebuild the dialog labels using the current application language. */
  function localize() {
    const launch = document.getElementById(U.launch); if (launch) launch.textContent = t('catalog_title');
    if (root.classList.contains(UI_CLASSES.HIDDEN)) return;
    // Language changes while editing preserve the draft; labels update on the next opening.
    if (!editing) build();
  }

  /** @returns {void} Build controls; stored metadata is inserted as text, never HTML. */
  function build() {
    const heading = node('h3', t('catalog_title')); heading.id = U.heading;
    const header = node('div'); header.className = UI_CLASSES.MODAL_HEADER; header.append(heading, button('catalog_close', close));
    notice = node('p'); notice.id = U.notice; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
    const tools = node('div'); tools.className = U.classes.tools;
    search = node('input'); search.id = U.search; search.type = 'search'; search.placeholder = t('catalog_search'); search.setAttribute('aria-label', t('catalog_search'));
    const select = (id, label) => { const control = node('select'); control.id = id; control.setAttribute('aria-label', t(label)); return control; };
    seriesFilter = select(U.series, 'catalog_field_series_id'); providerFilter = select(U.provider, 'catalog_field_provider'); availabilityFilter = select(U.availability, 'catalog_field_availability_status');
    options(providerFilter, [['', t('catalog_all')], ...C.providers.map(value => [value, t('catalog_' + value)])]);
    options(availabilityFilter, [['', t('catalog_all')], ...C.availabilityStates.map(value => [value, t('catalog_' + value)])]);
    for (const control of [search, seriesFilter, providerFilter, availabilityFilter]) control.oninput = () => { page = 0; render(); };
    const restoreInput = node('input'); restoreInput.type = 'file'; restoreInput.accept = '.json,application/json'; restoreInput.hidden = true;
    restoreInput.onchange = async () => {
      const file = restoreInput.files?.[0]; restoreInput.value = '';
      if (!file || busy || !confirm(t('catalog_restore_confirm'))) return;
      await run(async repository => { await repository.restoreJSON(await file.text()); editing = null; editor.replaceChildren(); });
    };
    const filterLabel = (key, control) => { const label = node('label', t(key)); label.append(control); return label; };
    tools.append(search, filterLabel('catalog_field_series_id', seriesFilter), filterLabel('catalog_field_provider', providerFilter), filterLabel('catalog_field_availability_status', availabilityFilter), button('catalog_new', () => edit()),
      button('catalog_backup', () => run(async repository => {
        const url = URL.createObjectURL(new Blob([await repository.exportJSON()], { type: 'application/json' }));
        const anchor = node('a'); anchor.href = url; anchor.download = U.backupName; anchor.click();
        // Release when the browser has consumed the click, without retaining an object URL indefinitely.
        requestAnimationFrame(() => URL.revokeObjectURL(url));
      })), button('catalog_restore', () => restoreInput.click()), restoreInput);
    list = node('div'); list.id = U.list; editor = node('div'); editor.id = U.editor; paging = node('div'); paging.className = U.classes.paging;
    const body = node('div'); body.className = UI_CLASSES.MODAL_BODY; body.append(node('p', t('catalog_note')), tools, notice, editor, list, paging);
    panel.replaceChildren(header, body); refresh();
  }

  /** @returns {void} Reindex a newly committed snapshot and retain search/filter values. */
  function refresh() {
    if (!snapshot || !list) return;
    rows = catalogRows(snapshot);
    const chosen = seriesFilter.value;
    options(seriesFilter, [['', t('catalog_all')], ...snapshot.series.filter(row => row.deleted_at == null).map(row => [row.id, row.name])]);
    seriesFilter.value = chosen; render();
  }

  /** @returns {void} Render one bounded result page, sorted by explicit volume order. */
  function render() {
    if (!snapshot || !list) return;
    const query = normalizeCatalogSearch(search.value);
    const filtered = rows.filter(row => row.search.includes(query) && (!seriesFilter.value || row.book.series_id === seriesFilter.value) &&
      row.holdings.some(holding => (!providerFilter.value || holding.provider === providerFilter.value) && (!availabilityFilter.value || holding.availability_status === availabilityFilter.value)));
    const pages = Math.max(1, Math.ceil(filtered.length / C.pageSize)); page = Math.min(page, pages - 1);
    list.replaceChildren();
    const states = new Map(snapshot.manual_reading_states.map(state => [state.holding_id, state]));
    for (const row of filtered.slice(page * C.pageSize, (page + 1) * C.pageSize)) {
      const card = node('article'); card.className = U.classes.book; card.dataset.bookId = row.book.id;
      card.append(node('h4', row.book.title), node('p', [row.series?.name, row.book.volume_label, row.book.edition, row.book.author].filter(Boolean).join(' · ')),
        button('catalog_add', () => edit(row.book)));
      for (const holding of row.holdings) {
        const line = node('div'); line.className = U.classes.holding; line.dataset.holdingId = holding.id;
        const state = states.get(holding.id);
        line.append(node('p', [t('catalog_' + holding.provider), holding.format?.toUpperCase(), t('catalog_' + holding.access_type),
          t('catalog_' + holding.availability_status), state ? t('catalog_' + state.status) : '', state?.progress_percent != null ? `${state.progress_percent}%` : ''].filter(Boolean).join(' · ')));
        if (holding.provider === C.providers[0]) {
          line.append(button(holding.legacy_book_id || holding.legacy_cloud_book_id ? 'catalog_local_open' : 'catalog_pick', async () => {
            if (busy) return;
            close();
            try {
              const binding = await openLocal(holding);
              if (binding) await (await repo()).update(current => bindCatalogFile(current, { holdingId: holding.id, revision: holding.revision, ...binding }));
            } catch (error) { await show(); report(error); }
          }));
          if (!holding.legacy_book_id && !holding.legacy_cloud_book_id) line.append(node('span', t('catalog_unbound')));
        } else if (holding.external_url) {
          const unavailable = [C.availabilityStates[1], C.availabilityStates[2]].includes(holding.availability_status);
          const anchor = node('a', t(unavailable ? 'catalog_check_access' : 'catalog_open')); anchor.href = holding.external_url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; line.append(anchor);
        } else if (!holding.external_url) line.append(node('span', t('catalog_no_link')));
        line.append(button('catalog_edit', () => edit(row.book, holding)));
        if (holding.access_type === C.accessTypes[1]) {
          const active = snapshot.access_periods.find(period => period.holding_id === holding.id && period.deleted_at == null && period.ended_at == null);
          line.append(button(active ? 'catalog_return' : 'catalog_borrow', () => run(repository => repository.update(current =>
            changeCatalogLoan(current, { holdingId: holding.id, revision: holding.revision, action: active ? C.loanActions.return : C.loanActions.borrow, periodId: active?.id })))));
        }
        card.append(line);
      }
      list.append(card);
    }
    if (!filtered.length) list.append(node('p', t('catalog_empty')));
    const previous = button('catalog_previous', () => { page--; render(); }); previous.disabled = page === 0;
    const next = button('catalog_next', () => { page++; render(); }); next.disabled = page >= pages - 1;
    paging.replaceChildren(previous, node('span', `${page + 1} / ${pages} · ${filtered.length}`), next);
  }

  /** @param {Object|null} book Explicit book identity @param {Object|null} holding Holding to edit @returns {void} Show editor with observed revisions. */
  function edit(book = null, holding = null) {
    if (busy || !snapshot) return;
    editing = { bookId: book?.id, holdingId: holding?.id, bookRevision: book?.revision, holdingRevision: holding?.revision };
    const state = snapshot.manual_reading_states.find(row => row.holding_id === holding?.id);
    const values = { ...book, ...holding, ...state, provider: holding?.provider || C.providers[1], access_type: holding?.access_type || C.accessTypes[0],
      availability_status: holding?.availability_status || C.availabilityStates[3], status: state?.status || C.readingStates[0] };
    const form = node('form'); form.id = U.form; form.className = U.classes.form;
    const selections = { series_id: [['', t('catalog_all')], ...snapshot.series.filter(row => row.deleted_at == null).map(row => [row.id, row.name])],
      provider: C.providers.map(value => [value, t('catalog_' + value)]), format: [['', t('catalog_unknown')], ...C.localFormats.map(value => [value, value.toUpperCase()])],
      access_type: C.accessTypes.map(value => [value, t('catalog_' + value)]), availability_status: C.availabilityStates.map(value => [value, t('catalog_' + value)]), status: C.readingStates.map(value => [value, t('catalog_' + value)]) };
    for (const name of U.fields) {
      const label = node('label', t('catalog_field_' + name)); const control = node(selections[name] ? 'select' : 'input');
      control.id = U.prefix + name; control.name = name;
      if (selections[name]) { options(control, selections[name]); control.value = values[name] ?? ''; }
      else if (name === 'reread_wanted') { control.type = 'checkbox'; control.checked = !!values[name]; }
      else { control.type = name === 'external_url' ? 'url' : U.numericInputs.includes(name) ? 'number' : 'text'; control.value = values[name] ?? '';
        if (name === 'title') control.required = true;
        if (name === 'progress_percent') { control.min = 0; control.max = 100; control.step = 'any'; }
      }
      label.htmlFor = control.id; label.append(control); form.append(label);
    }
    editor.replaceChildren(form);
    if (holding) { field('provider').disabled = true; field('access_type').disabled = true; }
    if (holding && snapshot.access_periods.some(row => row.holding_id === holding.id)) {
      field('access_type').disabled = true; field('availability_status').disabled = true;
    }
    const save = button('catalog_save', () => {}); save.type = 'submit';
    form.append(node('p', t('catalog_editor_note')), save, button('catalog_cancel', () => { if (!busy) { editing = null; editor.replaceChildren(); } }));
    form.onsubmit = event => {
      event.preventDefault(); if (busy) return;
      const values = Object.fromEntries(U.fields.map(name => [name, name === 'reread_wanted' ? field(name).checked : field(name).value]));
      const command = { ...editing, values };
      run(async repository => { await repository.update(current => saveCatalogEntry(current, command)); editing = null; editor.replaceChildren(); });
    };
    editor.replaceChildren(form);
    if (holding) {
      const history = node('details'); history.append(node('summary', t('catalog_history')));
      const date = value => value == null ? t('catalog_unknown_date') : new Date(value).toLocaleString();
      const periods = snapshot.access_periods.filter(row => row.holding_id === holding.id && row.deleted_at == null);
      const events = snapshot.reading_events.filter(row => row.holding_id === holding.id && row.deleted_at == null);
      for (const period of periods) history.append(node('p', `${date(period.started_at)} → ${date(period.ended_at)} ${period.end_reason ? t('catalog_' + period.end_reason) : ''}`));
      for (const event of events) history.append(node('p', `${date(event.occurred_at)} · ${t('catalog_' + event.event_type)}${event.progress_percent == null ? '' : ` · ${event.progress_percent}%`}`));
      if (!periods.length && !events.length) history.append(node('p', t('catalog_no_history')));
      editor.append(history);
    }
    field('title').focus(); editor.scrollIntoView({ block: 'nearest' });
  }

  /** @param {Function} operation Async repository operation @returns {Promise<void>} Serialized save with visible failure. */
  async function run(operation) {
    if (busy) return; busy = true; notice.textContent = t('catalog_loading');
    const token = generation;
    try { const repository = await repo(); await operation(repository); snapshot = await repository.read();
      if (token === generation) { notice.textContent = ''; refresh(); }
    } catch (error) { if (token === generation) report(error); }
    finally { busy = false; }
  }

  /** @returns {Promise<void>} Open immediately and migrate only after the user enters the catalog. */
  async function show() {
    if (busy) return;
    editing = null; snapshot = null; page = 0; build(); openModal(root);
    const token = ++generation; notice.textContent = t('catalog_loading');
    try { const repository = await repo(); snapshot = await repository.migrateLegacy(getLegacy());
      if (token !== generation) return; notice.textContent = ''; refresh();
    } catch (error) { if (token === generation) report(error); }
  }
  backdrop.onclick = close; localize();
  return { show, close, localize };
}
