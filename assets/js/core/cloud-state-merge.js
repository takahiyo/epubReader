/** Pure state merge shared by browser storage and the Worker; no DOM or SDK dependencies. */

/** Stable bookmark identity, including structured EPUB/Web-novel locations. */
export function bookmarkKey(bookmark) {
  if (bookmark?.cfi) return `cfi:${bookmark.cfi}`;
  if (bookmark?.location != null) return `location:${JSON.stringify(bookmark.location)}`;
  if (bookmark?.index != null) return `index:${bookmark.index}`;
  return bookmark?.id ? `id:${bookmark.id}` : null;
}

/** Merge independently edited bookmarks and deletions without replacing newer reading progress. */
export function mergeCloudStates(current = {}, incoming = {}) {
  const timestamp = state => Number(state.progressUpdatedAt ?? state.updatedAt) || 0;
  const newer = timestamp(incoming) >= timestamp(current) ? incoming : current;
  const older = newer === incoming ? current : incoming;
  const deleted = { ...(current.bookmarkTombstones ?? {}) };
  for (const [key, at] of Object.entries(incoming.bookmarkTombstones ?? {})) {
    deleted[key] = Math.max(deleted[key] ?? 0, Number(at) || 0);
  }
  const bookmarks = new Map();
  for (const bookmark of [...(current.bookmarks ?? []), ...(incoming.bookmarks ?? [])]) {
    const key = bookmarkKey(bookmark);
    if (!key) continue;
    const at = Number(bookmark.updatedAt ?? bookmark.createdAt) || 0;
    if ((deleted[key] ?? -1) >= at) continue;
    const existing = bookmarks.get(key);
    if (!existing || at > (existing.updatedAt ?? existing.createdAt ?? 0)) bookmarks.set(key, bookmark);
  }
  return {
    ...older, ...newer,
    progressUpdatedAt: timestamp(newer),
    bookmarks: [...bookmarks.values()].sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)),
    bookmarkTombstones: deleted,
    updatedAt: Math.max(Number(current.updatedAt) || 0, Number(incoming.updatedAt) || 0),
  };
}
