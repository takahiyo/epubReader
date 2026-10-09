import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadDriveBook, DRIVE_MAX_BYTES, isDriveBook, isDriveConfigured, authorizeDrive, DRIVE_SCOPE } from '../assets/googleDrive.js';

const selected = { id: 'book/id', name: 'Book.EPUB', url: 'https://untrusted.test/file' };
const metadata = { name: 'Book.EPUB', size: '4', mimeType: 'application/epub+zip', capabilities: { canDownload: true } };

test('Drive configuration requires all three identifiers and supported extensions are case insensitive', () => {
  assert.equal(isDriveConfigured({ clientId: 'id', apiKey: 'key', appId: 'project-name' }), false);
  assert.equal(isDriveConfigured({ clientId: 'id', apiKey: 'key', appId: '123' }), true);
  for (const name of ['book.epub', 'book.CBZ', 'book.zip', 'book.rar', 'book.cbr']) assert.ok(isDriveBook(name));
  for (const name of ['book.pdf', 'book.epub.exe', '', null]) assert.equal(isDriveBook(name), false);
});

test('download uses fixed API URLs, bearer header and no-store; returns reader File with progress', async () => {
  const requests = [], progress = [];
  const file = await downloadDriveBook({ ...selected, resourceKey: 'resource' }, 'fake-token', {
    onProgress: (...values) => progress.push(values),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1 ? Response.json(metadata) : new Response('test');
    },
  });
  assert.equal(file.name, metadata.name); assert.equal(await file.text(), 'test');
  assert.deepEqual(progress, [[4, 4]]);
  assert.match(requests[0].url, /^https:\/\/www.googleapis.com\/drive\/v3\/files\/book%2Fid\?/);
  assert.match(requests[1].url, /alt=media/);
  for (const { url, options } of requests) {
    assert.ok(!url.includes('fake-token')); assert.ok(!url.includes('untrusted'));
    assert.equal(options.headers.Authorization, 'Bearer fake-token');
    assert.equal(options.headers['X-Goog-Drive-Resource-Keys'], 'book/id/resource');
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit');
  }
});

test('unsupported and oversized files fail before content fetch', async () => {
  for (const [change, code] of [ [{ size: String(DRIVE_MAX_BYTES + 1) }, 'size'],
    [{ name: 'book.pdf' }, 'format'], [{ capabilities: { canDownload: false } }, 'permission'],
    [{ mimeType: 'application/vnd.google-apps.shortcut' }, 'format'] ]) {
    let calls = 0;
    await assert.rejects(downloadDriveBook(selected, 'token', { fetchImpl: async () => {
      calls++; return Response.json({ ...metadata, ...change });
    } }), error => error.driveCode === code);
    assert.equal(calls, 1);
  }
});

test('download maps HTTP errors without echoing tokens or remote error bodies', async () => {
  for (const [status, code] of [[401, 'expired'], [403, 'permission'], [404, 'missing'], [429, 'network'], [500, 'network']]) {
    await assert.rejects(downloadDriveBook(selected, 'secret', { fetchImpl: async () => new Response('sensitive', { status }) }),
      error => error.driveCode === code && !error.message.includes('sensitive'));
  }
});

test('truncated files never reach the reader', async () => {
  let calls = 0;
  await assert.rejects(downloadDriveBook(selected, 'token', { fetchImpl: async () => ++calls === 1
    ? Response.json(metadata) : new Response('bad') }), error => error.driveCode === 'network');
});

test('cancellation stops stream processing and cancels the reader', async () => {
  const controller = new AbortController(); let calls = 0, cancelled = false;
  await assert.rejects(downloadDriveBook(selected, 'token', { signal: controller.signal,
    onProgress: () => controller.abort(),
    fetchImpl: async () => ++calls === 1 ? Response.json({ ...metadata, size: '0' }) : new Response(new ReadableStream({
      pull(stream) { stream.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; },
    })),
  }), { name: 'AbortError' });
  assert.equal(cancelled, true);
});

test('unknown or dishonest metadata cannot bypass the streaming size cap', async () => {
  let calls = 0, cancelled = false;
  const chunk = new Uint8Array(1024 * 1024);
  await assert.rejects(downloadDriveBook(selected, 'token', {
    fetchImpl: async () => ++calls === 1 ? Response.json({ ...metadata, size: '0' }) : new Response(new ReadableStream({
      pull(stream) { stream.enqueue(chunk); }, cancel() { cancelled = true; },
    })),
  }), error => error.driveCode === 'size');
  assert.equal(cancelled, true);
});

test('OAuth requests only drive.file synchronously; abort ignores late callbacks', async () => {
  let options, requested = false;
  globalThis.google = { accounts: { oauth2: {
    initTokenClient: config => { options = config; return { requestAccessToken() { requested = true; } }; },
    hasGrantedAllScopes: () => true,
  } } };
  try {
    const controller = new AbortController();
    const result = authorizeDrive({ clientId: 'client' }, 'reader@example.test', controller.signal);
    assert.equal(requested, true); assert.equal(options.scope, DRIVE_SCOPE);
    assert.equal(options.include_granted_scopes, false); assert.equal(options.hint, 'reader@example.test');
    controller.abort(); options.callback({ access_token: 'late-token' });
    await assert.rejects(result, { name: 'AbortError' });
  } finally { delete globalThis.google; }
});
