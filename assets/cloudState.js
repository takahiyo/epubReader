/**
 * cloudState.js - クラウド同期の状態ペイロードを生成するSSOT
 *
 * NOTE:
 * - ここは「クラウド同期状態の構造」を一元管理するための唯一の場所です。
 * - 仕様が変わる場合は必ずこのモジュールを修正し、呼び出し側は変更しません。
 * - AIエージェントが誤って重複実装や削除を行わないよう、SSOTとして明示しています。
 */

import { getDeviceInfo } from "./storage.js";

/**
 * クラウド同期用の状態ペイロードを構築する
 * @param {import("./storage.js").StorageService} storage
 * @param {string} localBookId
 * @param {string|null} cloudBookId
 */
export function buildCloudStatePayload(storage, localBookId, cloudBookId) {
  if (!storage || !localBookId) return { cloudBookId, state: {}, updatedAt: 0 };
  const progress = storage.getProgress(localBookId) ?? {};
  const bookmarks = storage.getBookmarks(localBookId) ?? [];
  const bookInfo = storage.data?.library?.[localBookId];
  const deviceInfo = typeof getDeviceInfo === "function" ? getDeviceInfo() : null;

  const updatedAt = Math.max(
    progress?.updatedAt ?? 0,
    ...bookmarks.map((bookmark) => bookmark?.updatedAt ?? bookmark?.createdAt ?? 0),
  );

  const state = {
    progress: progress?.percentage ?? 0,
    lastCfi: progress?.location ?? null,
    bookType: bookInfo?.type ?? null,
    location: progress?.location ?? null,
    bookmarks: bookmarks.map((bookmark) => ({
      ...bookmark,
      bookType: bookmark.bookType ?? bookmark.type ?? null,
      deviceId: bookmark.deviceId ?? null,
      deviceColor: bookmark.deviceColor ?? null,
      updatedAt: bookmark?.updatedAt ?? bookmark?.createdAt ?? Date.now(),
    })),
    // 読書環境の同期
    writingMode: progress?.writingMode ?? null,
    pageDirection: progress?.pageDirection ?? null,
    imageViewMode: progress?.imageViewMode ?? null,
    fontSize: progress?.fontSize ?? null,
    deviceInfo,
    updatedAt,
  };

  return { cloudBookId, state, updatedAt };
}
