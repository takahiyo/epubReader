import { driveConfig, isDriveConfigured, prepareDrive, authorizeDrive, selectDriveBook, downloadDriveBook } from '../../googleDrive.js';
import { usesDriveRedirect, prepareDriveRedirect, consumeDriveReturn, exchangeDriveReturn, parseDriveFileLink } from '../../driveRedirect.js';

/** One shared, keyboard accessible entry point for browsers and installed PWAs. */
export function createGoogleDriveUI({ t, getAccount, login, openFile, beforeOpen, getIdToken = async () => null }) {
  const dialog = document.createElement('dialog'); dialog.id = 'googleDriveDialog'; dialog.className = 'google-drive-dialog';
  const heading = document.createElement('h2'); heading.id = 'googleDriveHeading';
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.addEventListener('keydown', event => event.stopPropagation());
  const description = document.createElement('p');
  const linkLabel = document.createElement('label'); linkLabel.className = 'google-drive-link';
  const linkText = document.createElement('span');
  const fileLink = document.createElement('input'); fileLink.type = 'url'; fileLink.id = 'googleDriveFileLink';
  fileLink.maxLength = 2048; fileLink.autocomplete = 'off'; fileLink.spellcheck = false;
  const linkHelp = document.createElement('small'); linkHelp.id = 'googleDriveLinkHelp';
  fileLink.setAttribute('aria-describedby', linkHelp.id); linkLabel.append(linkText, fileLink, linkHelp);
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const progress = document.createElement('progress'); progress.hidden = true;
  const connect = document.createElement('button'); connect.type = 'button'; connect.id = 'googleDriveConnect';
  const cancel = document.createElement('button'); cancel.type = 'button';
  dialog.append(heading, description, linkLabel, status, progress, connect, cancel); document.body.append(dialog);
  let controller, accountId, ready = false, busy = false, trigger, navigate;
  let returned = consumeDriveReturn();
  const alive = current => controller === current && !current.signal.aborted;
  function close() { controller?.abort(); controller = null; dialog.close(); trigger?.focus(); }
  cancel.onclick = close; dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  const localize = () => {
    document.querySelectorAll('[data-google-drive]').forEach(button => { button.textContent = t('driveOpen'); });
    heading.textContent = t('driveOpen'); description.textContent = t('driveDescription');
    linkLabel.hidden = !usesDriveRedirect(driveConfig()) || !getAccount().authenticated; linkText.textContent = t('driveLinkLabel');
    linkHelp.textContent = t('driveLinkHelp'); fileLink.placeholder = 'https://drive.google.com/file/d/…/view';
    cancel.textContent = t('driveClose'); progress.setAttribute('aria-label', t('driveLoading'));
    connect.textContent = t(getAccount().authenticated ? 'driveChoose' : 'googleLoginLabel');
  };
  window.addEventListener('auth:status', () => {
    if (controller && accountId !== getAccount().userId) close();
    localize(); resumeReturn();
  });
  async function show(event) {
    event?.stopPropagation();
    if (controller) return;
    trigger = event?.currentTarget; localize();
    controller = new AbortController(); const current = controller;
    accountId = getAccount().userId; ready = false; busy = false; navigate = null; progress.hidden = true; fileLink.value = '';
    connect.disabled = true;
    try { await beforeOpen(); } catch { close(); return; }
    if (!alive(current)) return;
    dialog.showModal(); status.textContent = t('drivePreparing');
    if (!navigator.onLine) { status.textContent = t('driveError_offline'); return; }
    if (!isDriveConfigured(driveConfig())) { status.textContent = t('driveError_config'); return; }
    try {
      if (usesDriveRedirect(driveConfig()) && getAccount().authenticated) {
        navigate = await prepareDriveRedirect(driveConfig(), getAccount(), current.signal);
      } else if (!usesDriveRedirect(driveConfig())) await prepareDrive();
      if (!alive(current)) return;
      ready = true; connect.disabled = false; status.textContent = t('driveReady');
    } catch (error) { if (alive(current)) status.textContent = t('driveError_' + (error.driveCode || 'network')); }
  }
  async function loadSelected(selected, token, current) {
    if (!alive(current)) return;
    if (!selected) { close(); return; }
    if (!dialog.open) dialog.showModal();
    status.textContent = t('driveLoading'); progress.hidden = false; progress.removeAttribute('value');
    const file = await downloadDriveBook(selected, token, { signal: current.signal,
      onProgress: (bytes, total) => {
        if (!alive(current)) return;
        status.textContent = t('driveLoading') + ' ' + (bytes / 1048576).toFixed(1) + ' MB';
        if (total) { progress.max = total; progress.value = bytes; }
      } });
    if (!alive(current) || getAccount().userId !== accountId) return;
    close(); await openFile(file);
  }
  async function resumeReturn() {
    if (!returned || controller || (!returned.error && !getAccount().authenticated)) return;
    const result = returned; returned = null;
    if (result.error === 'cancelled') return;
    localize(); controller = new AbortController(); const current = controller;
    linkLabel.hidden = true;
    accountId = getAccount().userId; busy = true; ready = false; connect.disabled = true;
    try {
      await beforeOpen();
      if (!alive(current)) return;
      dialog.showModal(); status.textContent = t('driveLoading');
      if (result.error) throw { driveCode: result.error };
      if (result.userId !== accountId) throw { driveCode: 'redirectState' };
      const token = await exchangeDriveReturn(driveConfig(), result, await getIdToken(), current.signal);
      await loadSelected({ id: result.fileId, resourceKey: result.resourceKey }, token, current);
    } catch (error) {
      if (alive(current)) {
        progress.hidden = true;
        status.textContent = t('driveError_' + (error.driveCode || 'network'));
      }
    } finally { if (alive(current)) busy = false; }
  }
  connect.onclick = async () => {
    if (!ready || busy) return;
    if (!getAccount().authenticated) { close(); login(); return; }
    busy = true; connect.disabled = true; const current = controller;
    try {
      const requested = navigate ? parseDriveFileLink(fileLink.value) : null;
      // Native modal dialogs sit above embedded Google consent UI. Dismiss our
      // top layer before either navigation or synchronous OAuth authorization.
      // Keep the controller alive; close() would cancel this request.
      dialog.close();
      if (navigate) { navigate(requested); return; }
      // No await precedes authorization: preserve the user's popup activation.
      const token = await authorizeDrive(driveConfig(), getAccount().userEmail, current.signal);
      if (!alive(current)) return;
      const selected = await selectDriveBook(driveConfig(), token, document.documentElement.lang, current.signal);
      if (!alive(current)) return;
      await loadSelected(selected, token, current);
    } catch (error) {
      if (!alive(current)) return;
      if (error.driveCode === 'cancelled') { close(); return; }
      if (!dialog.open) dialog.showModal();
      progress.hidden = true;
      status.textContent = t('driveError_' + (error.driveCode || 'network'));
    } finally { if (alive(current)) { busy = false; connect.disabled = false; } }
  };
  document.querySelectorAll('[data-google-drive]').forEach(button => button.addEventListener('click', show));
  localize(); resumeReturn(); return { localize };
}
