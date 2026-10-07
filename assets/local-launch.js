/** Classic script: module imports are blocked under file://, so this notice must not use imports. */
(() => {
  if (location.protocol !== 'file:') return;
  document.addEventListener('DOMContentLoaded', () => {
    const notice = document.createElement('main');
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'max-width:680px;margin:40px auto;padding:24px;line-height:1.8;color:var(--text);background:var(--card);border-radius:16px;overflow-wrap:anywhere;';
    // Fixed explanatory content only; no document paths, credentials or book data are interpolated.
    notice.innerHTML = `<h1>BookReaderはHTTPで開いてください</h1>
<p>index.htmlを直接開く（file://）と、ブラウザーがJavaScriptモジュールを読み込めず、メニューが動作しません。</p>
<ol><li>このフォルダーの <strong>Start-BookReader.cmd</strong> をダブルクリックしてください。</li>
<li>自動で開くブラウザーでBookReaderを利用してください。起動したサーバーのウィンドウは使用中そのままにしてください。</li></ol>
<p>ターミナルを使う場合：<code>node scripts/local-preview.mjs --open</code></p>
<p>本や読書記録は削除していません。file://とHTTPではブラウザーの保存領域が異なります。</p>
<p lang="en">Open Start-BookReader.cmd, or run the command above. Direct file:// opening cannot load JavaScript modules.</p>`;
    document.body.replaceChildren(notice);
  }, { once: true });
})();
