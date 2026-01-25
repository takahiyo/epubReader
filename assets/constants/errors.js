// ============================================
// エラーハンドリング設定
// ============================================
export const ERROR_CODES = Object.freeze({
  JSZIP_WARNING: "jszip_warning",
  NO_IMAGES_FOUND: "no_images_found",
  IMAGE_LOAD_FAILED: "image_load_failed",
});

export const ERROR_MESSAGE_MATCHERS = Object.freeze({
  [ERROR_CODES.JSZIP_WARNING]: Object.freeze(["JSZip", "not defined"]),
  [ERROR_CODES.NO_IMAGES_FOUND]: Object.freeze([
    "画像が見つかりませんでした",
    "No images found",
  ]),
  [ERROR_CODES.IMAGE_LOAD_FAILED]: Object.freeze([
    "画像の読み込みに失敗",
    "Failed to load image",
  ]),
});
