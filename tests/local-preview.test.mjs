import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewServer } from '../scripts/local-preview.mjs';

test('local preview serves the module graph with correct MIME types and denies private files', async () => {
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [pathname, contentType] of [['/', 'text/html'], ['/assets/app.js', 'text/javascript'],
      ['/assets/local-launch.js', 'text/javascript'], ['/assets/css/24-catalog.css', 'text/css'],
      ['/src/reader/epubPaginator.js', 'text/javascript']]) {
      const response = await fetch(origin + pathname);
      assert.equal(response.status, 200, pathname);
      assert.ok(response.headers.get('content-type').startsWith(contentType));
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    for (const pathname of ['/.git/config', '/workers/wrangler.toml', '/assets/%2f..%2f.git%2fconfig']) {
      assert.equal((await fetch(origin + pathname)).status, 404, pathname);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
