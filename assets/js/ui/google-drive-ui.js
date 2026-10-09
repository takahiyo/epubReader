import { driveConfig, isDriveConfigured, prepareDrive, authorizeDrive, selectDriveBook, downloadDriveBook } from '../../googleDrive.js';

/** One shared, keyboard accessible entry point for browsers and installed PWAs. */
export function createGoogleDriveUI({ t, getAccount, login, openFile, beforeOpen }) {
  const dialog = document.createElement('dialog'); dialog.id = 'googleDriveDialog'; dialog.className = 'google-drive-dialog';
  const heading = document.createElement('h2'); heading.id = 'googleDriveHeading';
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.addEventListener('keydown', event => event.stopPropagation());
  const description = document.createElement('p');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const progress = document.createElement('progress'); progress.hidden = true;
  const connect = document.createElement('button'); connect.type = 'button'; connect.id = 'googleDriveConnect';
  const cancel = document.createElement('button'); cancel.type = 'button';
  dialog.append(heading, description, status, progress, connect, cancel); document.body.append(dialog);
  let controller, accountId, ready = false, busy = false, trigger;
  const alive = current => controller === current && !current.signal.aborted;
  function close() { controller?.abort(); controller = null; dialog.close(); trigger?.focus(); }
  cancel.onclick = close; dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  const localize = () => {
    document.querySelectorAll('[data-google-drive]').forEach(button => { button.textContent = t('driveOpen'); });
    heading.textContent = t('driveOpen'); description.textContent = t('driveDescription');
    cancel.textContent = t('driveClose'); progress.setAttribute('aria-label', t('driveLoading'));
    connect.textContent = t(getAccount().authenticated ? 'driveChoose' : 'googleLoginLabel');
  };
  window.addEventListener('auth:status', () => { if (controller && accountId !== getAccount().userId) close(); localize(); });
  async function show(event) {
    event?.stopPropagation();
    if (controller) return;
    trigger = event?.currentTarget; localize();
    controller = new AbortController(); const current = controller;
    accountId = getAccount().userId; ready = false; busy = false; progress.hidden = true;
    connect.disabled = true;
    try { await beforeOpen(); } catch { close(); return; }
    if (!alive(current)) return;
    dialog.showModal(); status.textContent = t('drivePreparing');
    if (!navigator.onLine) { status.textContent = t('driveError_offline'); return; }
    if (!isDriveConfigured(driveConfig())) { status.textContent = t('driveError_config'); return; }
    try {
      await prepareDrive(); if (!alive(current)) return;
      ready = true; connect.disabled = false; status.textContent = t('driveReady');
    } catch { if (alive(current)) status.textContent = t('driveError_sdk'); }
  }
  connect.onclick = async () => {
    if (!ready || busy) return;
    if (!getAccount().authenticated) { close(); login(); return; }
    busy = true; connect.disabled = true; const current = controller;
    try {
      // No await precedes authorization: preserve the user's popup activation.
      const token = await authorizeDrive(driveConfig(), getAccount().userEmail, current.signal);
      if (!alive(current)) return;
      // Native dialog top layer would otherwise obscure Google's iframe picker.
      dialog.close();
      const selected = await selectDriveBook(driveConfig(), token, document.documentElement.lang, current.signal);
      if (!alive(current)) return;
      if (!selected) { close(); return; }
      dialog.showModal(); status.textContent = t('driveLoading'); progress.hidden = false; progress.removeAttribute('value');
      const file = await downloadDriveBook(selected, token, { signal: current.signal,
        onProgress: (bytes, total) => {
          if (!alive(current)) return;
          status.textContent = t('driveLoading') + ' ' + (bytes / 1048576).toFixed(1) + ' MB';
          if (total) { progress.max = total; progress.value = bytes; }
        } });
      if (!alive(current) || getAccount().userId !== accountId) return;
      close(); await openFile(file);
    } catch (error) {
      if (!alive(current)) return;
      if (error.driveCode === 'cancelled') { close(); return; }
      if (!dialog.open) dialog.showModal();
      progress.hidden = true;
      status.textContent = t('driveError_' + (error.driveCode || 'network'));
    } finally { if (alive(current)) { busy = false; connect.disabled = false; } }
  };
  document.querySelectorAll('[data-google-drive]').forEach(button => button.addEventListener('click', show));
  localize(); return { localize };
}
