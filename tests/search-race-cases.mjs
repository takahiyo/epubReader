/** Browser regressions: delayed chapter loading must never revive an obsolete search. */
export async function runSearchRaceCases(reader) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  const book = reader.book;
  const items = Array.from({ length: book.spine.length }, (_, index) => book.spine.get(index));
  const originalLoad = items[0].load;
  const originalUnloads = items.map(item => item.unload);
  let loads = 0;
  let unloads = 0;
  let hold = null;
  const pending = [];
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  const submit = query => {
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('searchBtn').click();
  };
  const deferNext = (fail = false) => {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    hold = { promise, fail };
    pending.push(release);
    return release;
  };
  // Wait for the actual DOM update rather than guessing how long EPUB chapter loading takes.
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 2000; attempt++) {
      if (predicate()) return;
      await settle();
    }
    throw new Error('Search regression did not settle');
  };
  items[0].load = async function (...args) {
    loads++;
    const pause = hold;
    hold = null;
    if (pause) {
      await pause.promise;
      if (pause.fail) throw new Error('Delayed obsolete search failure');
    }
    return originalLoad.apply(this, args);
  };
  items.forEach((item, index) => {
    item.unload = function (...args) { unloads++; return originalUnloads[index].apply(this, args); };
  });
  try {
    document.getElementById('menuSearch').click();
    const oldRelease = deferNext();
    submit('Chapter 1, paragraph 5.');
    check(loads === 1, 'Old search must reach its delayed chapter load');
    submit('Chapter 1, paragraph 35.');
    await waitFor(() => results.querySelector('.search-result-item'));
    check(results.textContent.includes('paragraph 35.'), 'Latest search must display its own match');
    const latest = results.innerHTML;
    const completedLoads = loads;
    const completedUnloads = unloads;
    oldRelease();
    await waitFor(() => unloads > completedUnloads);
    await settle();
    check(results.innerHTML === latest, 'Late old results must not overwrite the latest search');
    check(loads === completedLoads, 'Cancelled search must not load its remaining chapters');

    const failRelease = deferNext(true);
    submit('Chapter 1, paragraph 5.');
    submit('Chapter 1, paragraph 5.');
    await waitFor(() => results.querySelector('.search-result-item'));
    const sameQueryLatest = results.innerHTML;
    const beforeFailure = unloads;
    failRelease();
    await waitFor(() => unloads > beforeFailure); await settle();
    check(results.innerHTML === sameQueryLatest, 'An old failure must not clear a newer result for the same query');

    const editRelease = deferNext();
    submit('Chapter 1, paragraph 5.');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const beforeEdit = unloads;
    editRelease();
    await waitFor(() => unloads > beforeEdit); await settle();
    check(results.childElementCount === 0, 'Editing or clearing the input invalidates the running search');

    const closeRelease = deferNext();
    submit('Chapter 1, paragraph 5.');
    document.getElementById('closeSearchModal').click();
    document.getElementById('menuSearch').click();
    const beforeClose = unloads;
    closeRelease();
    await waitFor(() => unloads > beforeClose); await settle();
    check(results.childElementCount === 0, 'Closing and reopening search must not restore old results');

    const bookRelease = deferNext();
    submit('Chapter 1, paragraph 5.');
    reader.book = { ...book };
    const beforeBook = unloads;
    bookRelease();
    await waitFor(() => unloads > beforeBook); await settle();
    check(!results.querySelector('.search-result-item'), 'Another book instance must reject pending results');
    reader.book = book;
    document.getElementById('closeSearchModal').click();

    document.getElementById('menuSearch').click();
    submit('A query absent from every chapter');
    await waitFor(() => !results.querySelector('.search-loading') && results.textContent.length > 0);
    check(!results.querySelector('.search-result-item'), 'Latest empty results must still be displayed');
    document.getElementById('closeSearchModal').click();
  } finally {
    pending.forEach(release => release());
    reader.book = book;
    items[0].load = originalLoad;
    items.forEach((item, index) => { item.unload = originalUnloads[index]; });
  }
}
