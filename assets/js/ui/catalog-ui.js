/** Unified catalog dialog. Reader and storage dependencies are supplied by the application. */
import { CATALOG_CONFIG as C, CATALOG_UI as U, CATALOG_CSV as CSV, CATALOG_BULK as B, CATALOG_COPY as COPY, UI_CLASSES } from '../../constants.js';
import { openCatalog } from '../core/catalog-store.js';
import { saveCatalogEntry, changeCatalogLoan, bindCatalogFile, catalogRows, normalizeCatalogSearch } from '../core/catalog-actions.js';
import { previewCatalogCSV, applyCatalogCSV, exportCatalogCSV } from '../core/catalog-csv.js';
import { organizeCatalogBooks } from '../core/catalog-bulk.js';
import { createCatalogBulkEditor } from './catalog-bulk-editor.js';
import { createCatalogCopyDraft, registerCatalogCopies } from '../core/catalog-copy.js';
import { createCatalogCopyEditor } from './catalog-copy-editor.js';

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
  const selected = new Map(); let pageBooks = [], selectionCount, bulkLaunch, selectPage, clearSelection, csvExport, copyLaunch;
  const field = name => document.getElementById(U.prefix + name);
  const repo = () => repositoryPromise ||= openCatalog().catch(error => { repositoryPromise = null; throw error; });

  /** @param {string} tag DOM tag @param {string} text Safe text @returns {HTMLElement} New element. */
  function node(tag, text = '') { const element = document.createElement(tag); element.textContent = text; return element; }
  /** @param {string} key Translation key @param {Function} action Click callback @returns {HTMLButtonElement} Touch-sized button. */
  function button(key, action) { const element = node('button', t(key)); element.type = 'button'; element.onclick = action; return element; }
  /** @param {HTMLSelectElement} select Select @param {Array} values [value,label] pairs @returns {void} Safe options. */
  function options(select, values) { select.replaceChildren(...values.map(([value, label]) => { const option = node('option', label); option.value = value; return option; })); }
  /** @param {Error} error Failure @returns {void} Visible translated diagnostic. */
  function report(error) { notice.textContent = t(error.bulkReason ? 'catalog_bulk_error_' + error.bulkReason : error.csvReason ? 'catalog_csv_error_' + error.csvReason : U.errors[error.code] || (error instanceof TypeError || error instanceof SyntaxError ? U.errors.invalid : U.errors.storage)); }
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
      await run(async repository => { await repository.restoreJSON(await file.text()); selected.clear(); editing = null; editor.replaceChildren(); });
    };
    const csvInput = node('input'); csvInput.id = CSV.input; csvInput.type = 'file'; csvInput.accept = CSV.accept; csvInput.hidden = true;
    csvInput.onchange = async () => {
      const file = csvInput.files?.[0]; csvInput.value = '';
      if (!file || busy || !snapshot) return;
      // A failed replacement file must not leave a previous import's confirm button active.
      editing = null; editor.replaceChildren();
      await run(async repository => {
        if (file.size > CSV.maxBytes) { const error = new TypeError(); error.csvReason = CSV.errors.limit; throw error; }
        const token = generation, text = await file.text(), current = await repository.read();
        if (token === generation) showCSVPreview(previewCatalogCSV(current, text));
      });
    };
    const filterLabel = (key, control) => { const label = node('label', t(key)); label.append(control); return label; };
    tools.append(search, filterLabel('catalog_field_series_id', seriesFilter), filterLabel('catalog_field_provider', providerFilter), filterLabel('catalog_field_availability_status', availabilityFilter), button('catalog_new', () => edit()),
      button('catalog_backup', () => run(async repository => {
        const url = URL.createObjectURL(new Blob([await repository.exportJSON()], { type: 'application/json' }));
        const anchor = node('a'); anchor.href = url; anchor.download = U.backupName; anchor.click();
        // Release when the browser has consumed the click, without retaining an object URL indefinitely.
        requestAnimationFrame(() => URL.revokeObjectURL(url));
      })), button('catalog_restore', () => restoreInput.click()), restoreInput,
      button('catalog_csv_import', () => { if (!busy && snapshot) csvInput.click(); }), csvInput,
      button('catalog_csv_template', () => {
        const url = URL.createObjectURL(new Blob(['\uFEFF' + CSV.columns.join(',') + '\r\n'], { type: CSV.mime }));
        const anchor = node('a'); anchor.href = url; anchor.download = CSV.templateName; anchor.click();
        requestAnimationFrame(() => URL.revokeObjectURL(url));
      }));
    list = node('div'); list.id = U.list; editor = node('div'); editor.id = U.editor; paging = node('div'); paging.className = U.classes.paging;
    selectionCount = node('span'); selectionCount.id = B.count; selectionCount.setAttribute('aria-live', 'polite');
    selectPage = button('catalog_bulk_select_page', () => {
      if (busy || !snapshot || editing?.bulk) return;
      if (new Set([...selected.keys(), ...pageBooks.map(book => book.id)]).size > B.maxSelection) { report({ bulkReason: B.errors.selection }); return; }
      for (const book of pageBooks) if (!selected.has(book.id)) selected.set(book.id, book.revision);
      render();
    }); selectPage.id = B.selectPage;
    clearSelection = button('catalog_bulk_clear_selection', () => { if (!busy && !editing?.bulk) { selected.clear(); render(); } }); clearSelection.id = B.clear;
    bulkLaunch = button('catalog_bulk_title', organize); bulkLaunch.id = B.launch;
    csvExport = button('catalog_csv_export', () => {
      if (busy || !selected.size || editing?.bulk) return;
      const bookIds = [...selected.keys()];
      run(async repository => {
        // Read current committed metadata; an export must not use a stale dialog snapshot.
        const text = exportCatalogCSV(await repository.read(), bookIds);
        const url = URL.createObjectURL(new Blob([text], { type: CSV.mime }));
        const anchor = node('a'); anchor.href = url; anchor.download = CSV.exportName; anchor.click();
        requestAnimationFrame(() => URL.revokeObjectURL(url));
      });
    }); csvExport.id = CSV.export;
    copyLaunch = button('catalog_copy_title', () => {
      if (busy || !snapshot || !selected.size || editing?.bulk) return;
      const drafts = createCatalogCopyDraft(rows, selected); editing = { bulk: true };
      const form = createCatalogCopyEditor({ drafts, series: snapshot.series.filter(row => row.deleted_at == null), t, node, button, options,
        onCancel: () => { if (!busy) { editing = null; editor.replaceChildren(); render(); } },
        onSave: copies => run(async repository => {
          await repository.update(current => registerCatalogCopies(current, copies)); selected.clear(); editing = null; editor.replaceChildren();
        }) });
      editor.replaceChildren(form); render(); form.scrollIntoView({ block: 'nearest' });
      form.querySelector('input')?.focus();
    }); copyLaunch.id = COPY.launch;
    const selectionTools = node('div'); selectionTools.className = U.classes.tools;
    selectionTools.append(selectionCount, selectPage, clearSelection, bulkLaunch, copyLaunch, csvExport, node('p', t('catalog_bulk_selection_note')), node('p', t('catalog_csv_export_note')));
    const body = node('div'); body.className = UI_CLASSES.MODAL_BODY; body.append(node('p', t('catalog_note')), tools, selectionTools, notice, editor, list, paging);
    panel.replaceChildren(header, body); pageBooks = []; showSelection(); refresh();
  }

  /** @returns {void} Open a frozen selection; changing list filters cannot change the save targets. */
  function organize() {
    if (busy || !snapshot || !selected.size || editing?.bulk) return;
    const books = rows.filter(row => selected.has(row.book.id)).map(row => ({ ...row.book, revision: selected.get(row.book.id) }));
    editing = { bulk: true };
    const form = createCatalogBulkEditor({ books, series: snapshot.series.filter(row => row.deleted_at == null), t, node, button, options,
      onCancel: () => { if (!busy) { editing = null; editor.replaceChildren(); render(); } },
      onSave: command => run(async repository => {
        await repository.update(current => organizeCatalogBooks(current, command)); selected.clear(); editing = null; editor.replaceChildren();
      }) });
    editor.replaceChildren(form); render(); form.scrollIntoView({ block: 'nearest' }); document.getElementById(B.target).focus();
  }

  /** @returns {void} Keep selection count explicit, including selections outside the current page. */
  function showSelection() {
    if (!selectionCount) return;
    selectionCount.textContent = `${t('catalog_bulk_selected')}: ${selected.size}`;
    bulkLaunch.disabled = !snapshot || !selected.size || !!editing?.bulk;
    csvExport.disabled = !snapshot || !selected.size || !!editing?.bulk;
    copyLaunch.disabled = !snapshot || !selected.size || !!editing?.bulk;
    clearSelection.disabled = !selected.size || !!editing?.bulk;
    selectPage.disabled = !pageBooks.length || !!editing?.bulk;
  }

  /** @param {Object} preview Validated rows and transactional lease @returns {void} Review bounded CSV pages before any write. */
  function showCSVPreview(preview) {
    editing = { csv: true }; let previewPage = 0;
    const section = node('section'); section.id = CSV.preview; section.className = CSV.classes.preview;
    const summary = Object.entries(preview.counts).map(([key, count]) => `${t('catalog_csv_count_' + key)}: ${count}`).join(' · ');
    section.append(node('h4', t('catalog_csv_preview')), node('p', summary), node('p', t('catalog_csv_note')));
    const tableWrap = node('div'); tableWrap.className = CSV.classes.table;
    const pages = Math.max(1, Math.ceil(preview.rows.length / C.pageSize));
    const controls = node('div'); controls.className = U.classes.paging;
    /** @returns {void} Show safe row details and physical source line, without an unbounded DOM. */
    function drawRows() {
      const table = node('table'), header = node('tr');
      for (const key of ['line', 'title', 'provider', 'series', 'volume_label', 'details', 'result']) header.append(node('th', t('catalog_csv_column_' + key)));
      const head = node('thead'); head.append(header); const body = node('tbody');
      for (const row of preview.rows.slice(previewPage * C.pageSize, (previewPage + 1) * C.pageSize)) {
        const tr = node('tr');
        const result = [t('catalog_csv_status_' + row.status), row.reason ? t('catalog_csv_error_' + row.reason) : '', row.candidate ? t('catalog_csv_candidate') : ''].filter(Boolean).join(' · ');
        const details = Object.entries(row.values || {}).filter(([key, value]) => value && !['title', 'provider', 'series', 'volume_label'].includes(key)).map(([key, value]) => `${key}: ${value}`).join(' · ');
        for (const value of [String(row.line), row.title, row.provider, row.series, row.volume_label, details, result]) tr.append(node('td', value));
        body.append(tr);
      }
      table.append(head, body); tableWrap.replaceChildren(table);
      const previous = button('catalog_previous', () => { previewPage--; drawRows(); }); previous.disabled = previewPage === 0;
      const next = button('catalog_next', () => { previewPage++; drawRows(); }); next.disabled = previewPage >= pages - 1;
      controls.replaceChildren(previous, node('span', `${previewPage + 1} / ${pages}`), next);
    }
    const commit = button('catalog_csv_commit', () => run(async repository => {
      await repository.update(current => applyCatalogCSV(current, preview)); editing = null; editor.replaceChildren();
    }));
    commit.id = CSV.commit; commit.disabled = !!preview.counts.error || !preview.counts.add;
    section.append(tableWrap, controls, commit, button('catalog_cancel', () => { if (!busy) { editing = null; editor.replaceChildren(); } }));
    drawRows(); editor.replaceChildren(section); section.scrollIntoView({ block: 'nearest' });
  }

  /** @returns {void} Reindex a newly committed snapshot and retain search/filter values. */
  function refresh() {
    if (!snapshot || !list) return;
    rows = catalogRows(snapshot);
    const activeIds = new Set(rows.map(row => row.book.id));
    for (const id of selected.keys()) if (!activeIds.has(id)) selected.delete(id);
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
    const visibleRows = filtered.slice(page * C.pageSize, (page + 1) * C.pageSize); pageBooks = visibleRows.map(row => row.book);
    for (const row of visibleRows) {
      const card = node('article'); card.className = U.classes.book; card.dataset.bookId = row.book.id;
      const select = node('input'); select.type = 'checkbox'; select.checked = selected.has(row.book.id); select.disabled = !!editing?.bulk;
      select.setAttribute('aria-label', `${t('catalog_bulk_select')} ${row.book.title}`);
      const selection = node('label', t('catalog_bulk_select')); selection.className = B.classes.selection; selection.prepend(select); card.append(selection);
      select.onchange = () => {
        if (busy || editing?.bulk) { select.checked = selected.has(row.book.id); return; }
        if (select.checked && selected.size >= B.maxSelection) { select.checked = false; report({ bulkReason: B.errors.selection }); return; }
        if (select.checked) selected.set(row.book.id, row.book.revision); else selected.delete(row.book.id);
        showSelection();
      };
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
    showSelection();
  }

  /** @param {Object|null} book Explicit book identity @param {Object|null} holding Holding to edit @returns {void} Show editor with observed revisions. */
  function edit(book = null, holding = null) {
    if (busy || !snapshot) return;
    editing = { bookId: book?.id, holdingId: holding?.id, bookRevision: book?.revision, holdingRevision: holding?.revision };
    render();
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
    editing = null; selected.clear(); snapshot = null; page = 0; build(); openModal(root);
    const token = ++generation; notice.textContent = t('catalog_loading');
    try { const repository = await repo(); snapshot = await repository.migrateLegacy(getLegacy());
      if (token !== generation) return; notice.textContent = ''; refresh();
    } catch (error) { if (token === generation) report(error); }
  }
  backdrop.onclick = close; localize();
  return { show, close, localize };
}
