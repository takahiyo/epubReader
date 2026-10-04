/** Outgoing payload privacy and legacy bookmark deletion regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCloudState, sanitizeCloudMeta, buildCloudSnapshot } from '../assets/js/core/cloud-payload.js';
import { bookmarkKey, mergeCloudStates } from '../assets/js/core/cloud-state-merge.js';
import { buildCloudStatePayload } from '../assets/cloudState.js';

const excerpt = 'private excerpt that must remain only on the device';
const location = { spineIndex: 3, segmentIndex: 500, visibleText: excerpt, unknown: excerpt };
const bookmark = { location, visibleText: excerpt, label: 'My bookmark', createdAt: 100, deviceId: 'device', deviceColor: '#123456', custom: excerpt };

test('outgoing progress and bookmarks keep stable positions without text or platform details', () => {
  const source = { progress: 40, lastCfi: location, location, visibleText: excerpt, deviceInfo: 'OS / browser',
    unknown: excerpt, bookmarks: [bookmark], bookmarkTombstones: {}, updatedAt: 100 };
  const safe = sanitizeCloudState(source);
  assert.deepEqual(safe.lastCfi, { spineIndex: 3, segmentIndex: 500 });
  assert.equal(safe.location, undefined);
  assert.equal(safe.bookmarks[0].label, 'My bookmark');
  assert.equal(safe.bookmarks[0].deviceId, 'device');
  assert.ok(!JSON.stringify(safe).includes(excerpt));
  assert.equal(safe.deviceInfo, undefined);
  assert.equal(source.lastCfi.visibleText, excerpt);
  assert.equal(source.bookmarks[0].visibleText, excerpt);
  for (const value of [0, 8, '3:500', { location: 2, percentage: 38 }]) {
    assert.deepEqual(sanitizeCloudState({ lastCfi: value }).lastCfi, value);
  }
});

test('payload builder does not mutate the local excerpts and arbitrary metadata is omitted', () => {
  const storage = { getProgress: () => ({ location, percentage: 40, updatedAt: 100 }), getBookmarks: () => [bookmark],
    data: { library: { local: { type: 'epub' } }, bookmarkTombstones: {} } };
  const payload = buildCloudStatePayload(storage, 'local', 'cloud');
  assert.ok(!JSON.stringify(payload).includes(excerpt));
  assert.equal(location.visibleText, excerpt);
  assert.deepEqual(sanitizeCloudMeta({ title: 'Title', author: 'Author', fingerprints: ['fingerprint'], updatedAt: 100,
    filePath: excerpt, fullText: excerpt, credentials: { token: excerpt } }),
  { title: 'Title', author: 'Author', fingerprints: ['fingerprint'], updatedAt: 100 });
});

test('legacy structured tombstones remove excerpt-free bookmarks without resurrection', () => {
  const oldKey = 'location:' + JSON.stringify(location);
  const safeBookmark = sanitizeCloudState({ bookmarks: [bookmark] }).bookmarks[0];
  assert.equal(bookmarkKey(bookmark), bookmarkKey(safeBookmark));
  const merged = mergeCloudStates({ bookmarkTombstones: { [oldKey]: 200 }, updatedAt: 200 },
    { bookmarks: [safeBookmark], updatedAt: 100 });
  assert.equal(merged.bookmarks.length, 0);
  assert.ok(!JSON.stringify(merged.bookmarkTombstones).includes(excerpt));
  const duplicates = mergeCloudStates({ bookmarks: [bookmark] }, { bookmarks: [safeBookmark] });
  assert.equal(duplicates.bookmarks.length, 1);
});

test('legacy snapshot providers never serialize credentials, history or arbitrary local data', () => {
  const storage = { getSettings: () => ({ apiKey: excerpt, onedriveToken: { accessToken: excerpt },
    d1Endpoint: excerpt, deviceId: excerpt, fontSize: 20, uiLanguage: 'ja' }),
    data: { library: { local: { title: 'Title', filePath: excerpt, contentHash: 'hash' } },
      progress: { local: { location, percentage: 40, updatedAt: 100 } }, bookmarks: { local: [bookmark] },
      cloudIndex: { cloud: { title: 'Title', filePath: excerpt } }, cloudStates: { cloud: { location } },
      history: [{ bookId: excerpt }], secret: excerpt, bookLinkMap: { local: 'cloud' } } };
  const safe = buildCloudSnapshot(storage);
  assert.ok(!JSON.stringify(safe).includes(excerpt));
  assert.deepEqual(safe.settings, { uiLanguage: 'ja', fontSize: 20 });
  assert.equal(safe.library.local.contentHash, 'hash');
  assert.equal(safe.bookLinkMap.local, 'cloud');
});
