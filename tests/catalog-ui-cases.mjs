/** @returns {Promise<void>} Exercise actual catalog UI, IndexedDB commands and safe text rendering. */
export async function runCatalogUICases() {
  const { createCatalogUI } = await import('/assets/js/ui/catalog-ui.js');
  const { CATALOG_UI: U } = await import('/assets/constants.js');
  const { t: translate } = await import('/assets/i18n.js');
  const { beginDialogFocus, endDialogFocus } = await import('/assets/js/ui/dialog-focus.js');
  const { openCatalog } = await import('/assets/js/core/catalog-store.js');
  const t = key => translate(key, 'ja');
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = async predicate => {
    const until = Date.now() + 5000;
    while (!predicate()) { if (Date.now() > until) throw new Error('UI update timed out'); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  const launch = document.createElement('button'); launch.id = U.launch; document.body.append(launch);
  const legacy = { library: { local: { title: 'Local fixture', fileName: 'local.epub', type: 'epub' } } };
  const localOpened = [];
  const controller = createCatalogUI({ t, getLegacy: () => legacy,
    openModal: root => { root.classList.remove('hidden'); beginDialogFocus(root, () => controller.close()); },
    closeModal: root => { endDialogFocus(root); root.classList.add('hidden'); },
    openLocal: async holding => { localOpened.push(holding); return holding.legacy_book_id ? undefined : { bookId: 'chosen', format: 'cbz' }; },
  });
  window.__catalogTest = controller;
  await controller.show();
  const root = document.getElementById(U.modal);
  const click = (key, scope = root) => { const target = [...scope.querySelectorAll('button')].find(button => button.textContent === t(key)); check(target, `Missing button ${key}`); target.click(); };
  const fill = (name, value) => { const control = document.getElementById(U.prefix + name); control.value = value; control.dispatchEvent(new Event('input', { bubbles: true })); };
  const card = () => [...root.querySelectorAll('article')].find(row => row.querySelector('h4').textContent === '<b>Test １</b>');
  const kindle = () => [...card().querySelectorAll('.catalog-holding')].find(row => row.textContent.includes(t('catalog_kindle')));
  const submit = async () => { document.getElementById(U.form).requestSubmit(); await wait(() => !document.getElementById(U.form) && !document.getElementById(U.notice).textContent); };
  click('catalog_local_open'); await wait(() => localOpened.length === 1);
  check(localOpened[0].legacy_book_id === 'local', 'Local reads must retain reader identity');
  await controller.show(); click('catalog_new');
  fill('title', '<b>Test １</b>'); fill('new_series', 'シリーズSaga'); fill('volume_label', '上'); fill('sort_order', '1');
  fill('access_type', 'subscription_loan'); fill('external_url', 'https://example.com/book'); await submit();
  check(!card().querySelector('b'), 'Book metadata must be rendered as text, never markup');
  click('catalog_add', card()); fill('provider', 'unext'); await submit();
  check(card().querySelectorAll('.catalog-holding').length === 2, 'Two providers must share one explicitly selected volume');
  click('catalog_borrow', card()); await wait(() => !![...card().querySelectorAll('button')].find(button => button.textContent === t('catalog_return')));
  click('catalog_edit', kindle()); fill('status', 'completed'); fill('progress_percent', '100'); await submit();
  click('catalog_return', card()); await wait(() => card().textContent.includes(t('catalog_returned')));
  check(card().textContent.includes(t('catalog_completed')), 'Returning KU must preserve completion');
  check(card().querySelector('a').textContent === t('catalog_check_access'), 'Returned links must ask to recheck availability');
  click('catalog_borrow', card()); await wait(() => !![...card().querySelectorAll('button')].find(button => button.textContent === t('catalog_return')));
  click('catalog_edit', kindle()); fill('status', 'reading'); fill('progress_percent', '42'); await submit();
  const search = document.getElementById(U.search); search.value = 'test 1'; search.dispatchEvent(new Event('input'));
  check(root.querySelectorAll('article').length === 1, 'Search must normalize full-width characters');
  search.value = 'Saga'; search.dispatchEvent(new Event('input')); check(root.querySelectorAll('article').length === 1, 'Series name must be searchable');
  const repository = await openCatalog(); const snapshot = await repository.read();
  const ku = snapshot.holdings.find(row => row.access_type === 'subscription_loan');
  check(snapshot.access_periods.filter(row => row.holding_id === ku.id).length === 2, 'Reborrow must create a separate period');
  check(snapshot.reading_events.some(row => row.holding_id === ku.id && row.event_type === 'completed'), 'Reread must retain the prior completion event');
  click('catalog_edit', kindle()); fill('external_url', 'javascript:alert(1)');
  document.getElementById(U.form).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await wait(() => document.getElementById(U.notice).textContent === t('catalog_invalid'));
  check((await repository.read()).holdings.find(row => row.id === ku.id).external_url === 'https://example.com/book', 'Unsafe URL must not change storage');
  click('catalog_cancel'); controller.close(); await controller.show();
  check(root.querySelectorAll('article').length === 2, 'Reopening must preserve catalog records without migration duplicates');
  repository.close();
  // Explicitly bind a manually registered Local holding to the user's selected file.
  click('catalog_new'); fill('title', 'Chosen local file'); fill('provider', 'local'); await submit();
  const unbound = [...root.querySelectorAll('article')].find(row => row.querySelector('h4').textContent === 'Chosen local file');
  click('catalog_pick', unbound); await wait(() => localOpened.length === 2);
  await new Promise(resolve => setTimeout(resolve, 100));
  await controller.show();
  const checkRepository = await openCatalog();
  check((await checkRepository.read()).holdings.some(row => row.legacy_book_id === 'chosen'), 'Selected file identity must persist on the manually registered holding');
  checkRepository.close();
}
