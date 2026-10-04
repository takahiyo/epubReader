/** cloud-payload.js - Explicit, shared schema for data allowed to leave a device. */
const pick = (source, keys) => Object.fromEntries(keys.filter(key => source?.[key] !== undefined && (source[key] === null || ['string', 'number', 'boolean'].includes(typeof source[key]))).map(key => [key, source[key]]));
const META_FIELDS = ['cloudBookId', 'title', 'author', 'fingerprints', 'updatedAt', 'createdAt', 'lastReadAt', 'stateUpdatedAt', 'isDeleted'];
const STATE_FIELDS = ['progress', 'progressUpdatedAt', 'bookType', 'writingMode', 'epubViewMode', 'pageDirection', 'imageViewMode', 'fontSize', 'updatedAt'];
const BOOKMARK_FIELDS = ['id', 'cfi', 'index', 'label', 'percentage', 'createdAt', 'updatedAt', 'bookType', 'deviceId', 'deviceColor'];
const LOCATION_FIELDS = ['spineIndex', 'segmentIndex', 'location', 'percentage'];
const mapValues = (value, convert) => Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, convert(item)]));

/** Keep stable EPUB/image/web-novel positions, never the accompanying text or arbitrary fields. */
export function sanitizeCloudLocation(location) {
  if (typeof location === 'string' || typeof location === 'number' || location == null) return location ?? null;
  const result = Object.fromEntries(LOCATION_FIELDS.filter(key => key !== 'location' && Number.isFinite(location?.[key])).map(key => [key, location[key]]));
  if (location.location !== undefined) result.location = sanitizeCloudLocation(location.location);
  return Object.keys(result).length ? result : null;
}

/** Recognize legacy structured deletion keys without retaining embedded excerpts. */
export function canonicalBookmarkKey(key) {
  if (!key.startsWith('location:')) return key;
  try { return 'location:' + JSON.stringify(sanitizeCloudLocation(JSON.parse(key.slice('location:'.length)))); }
  catch { return key; }
}

/** Keep only bookmark UI/identity fields and its numeric or structured position. */
export function sanitizeCloudBookmark(bookmark) {
  return { ...pick(bookmark, BOOKMARK_FIELDS), location: sanitizeCloudLocation(bookmark?.location) };
}

/** Allowlisted book metadata retains matching, display and deletion behavior. */
export function sanitizeCloudMeta(meta) {
  const result = pick(meta, META_FIELDS);
  if (Array.isArray(meta?.fingerprints)) result.fingerprints = meta.fingerprints.filter(value => typeof value === 'string');
  return result;
}

/** Produce one canonical location and omit text, device platform details and unknown fields. */
export function sanitizeCloudState(state = {}) {
  const deleted = {};
  for (const [key, at] of Object.entries(state.bookmarkTombstones ?? {})) {
    const canonical = canonicalBookmarkKey(key);
    deleted[canonical] = Math.max(deleted[canonical] ?? 0, Number(at) || 0);
  }
  return { ...pick(state, STATE_FIELDS), lastCfi: sanitizeCloudLocation(state.lastCfi ?? state.location),
    bookmarks: (Array.isArray(state.bookmarks) ? state.bookmarks : []).map(sanitizeCloudBookmark), bookmarkTombstones: deleted };
}

/** Legacy providers sync reading data, never the complete local settings/token snapshot. */
export function buildCloudSnapshot(storage) {
  const data = storage.data ?? {};
  return {
    library: mapValues(data.library, book => pick(book, ['id', 'title', 'author', 'type', 'contentHash', 'updatedAt', 'isLargeFileStub'])),
    progress: mapValues(data.progress, progress => ({ ...pick(progress, ['percentage', ...STATE_FIELDS]), location: sanitizeCloudLocation(progress.location) })),
    bookmarks: mapValues(data.bookmarks, list => (Array.isArray(list) ? list : []).map(sanitizeCloudBookmark)),
    bookmarkTombstones: mapValues(data.bookmarkTombstones, deleted => sanitizeCloudState({ bookmarkTombstones: deleted }).bookmarkTombstones),
    cloudIndex: mapValues(data.cloudIndex, sanitizeCloudMeta),
    cloudStates: mapValues(data.cloudStates, sanitizeCloudState),
    bookLinkMap: { ...data.bookLinkMap },
    settings: pick(storage.getSettings(), ['uiLanguage', 'fontSize', 'defaultWritingMode', 'defaultPageDirection', 'defaultImageViewMode', 'oneBookmarkPerBook']),
  };
}
