import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadDriveBook } from '../assets/googleDrive.js';

const selected = { id: 'large-book', name: 'Large.cbz' };
const chunk = new Uint8Array(1024 * 1024);
const chunkCount = 257;
const totalBytes = chunk.byteLength * chunkCount;

function downloadOptions(size, onProgress = () => {}, signal, count = chunkCount) {
  let requests = 0, sent = 0, cancelled = false;
  return {
    get cancelled() { return cancelled; },
    signal, onProgress,
    fetchImpl: async () => ++requests === 1
      ? Response.json({ name: selected.name, size, mimeType: 'application/zip' })
      : new Response(new ReadableStream({
        pull(controller) {
          if (sent++ < count) controller.enqueue(chunk);
          else controller.close();
        },
        cancel() { cancelled = true; },
      })),
  };
}

for (const size of [String(totalBytes), undefined]) {
  test(`downloads more than 256 MiB with ${size ? 'known' : 'unknown'} metadata size`, async () => {
    const progress = [];
    const file = await downloadDriveBook(selected, 'token', downloadOptions(size,
      (received, total) => progress.push([received, total])));
    assert.equal(file.size, totalBytes);
    assert.equal(file.name, selected.name);
    assert.equal(file.type, 'application/zip');
    assert.equal(progress.length, chunkCount);
    assert.deepEqual(progress.at(-1), [totalBytes, size ? totalBytes : 0]);
    assert.deepEqual(new Uint8Array(await file.slice(-4).arrayBuffer()), new Uint8Array(4));
  });
}

test('large downloads still reject incomplete content', async () => {
  await assert.rejects(downloadDriveBook(selected, 'token', downloadOptions(String(totalBytes + 1))),
    error => error.driveCode === 'network');
});

test('large downloads can be cancelled after crossing the former size cap', async () => {
  const controller = new AbortController();
  const options = downloadOptions(String(totalBytes + 2 * chunk.byteLength), received => {
    if (received === totalBytes) controller.abort();
  }, controller.signal, chunkCount + 2);
  await assert.rejects(downloadDriveBook(selected, 'token', options), { name: 'AbortError' });
  assert.equal(options.cancelled, true);
});
