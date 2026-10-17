// Capture OAuth returns before loading external scripts. Never persist the code or tokens.
(() => {
  const url = new URL(location.href);
  if (!url.searchParams.get('state')?.startsWith('brdrive_')) return;
  const result = Object.fromEntries(url.searchParams);
  for (const key of ['code', 'state', 'scope', 'error', 'error_description', 'picked_file_ids', 'authuser', 'prompt']) {
    url.searchParams.delete(key);
  }
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  window.bookReaderDriveReturn = result;
})();
