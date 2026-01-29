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

export const ARCHIVE_LIBRARY_ERRORS = Object.freeze({
  JSZIP_NOT_FOUND:
    "JSZip が読み込まれていません。assets/vendor/jszip.min.js を読み込むか、CDN への接続を確認してください。",
  JSZIP_LOAD_FAILED:
    "JSZip の読み込みに失敗しました。assets/vendor/jszip.min.js の配置または CDN 接続を確認してください。",
  UNRAR_NOT_FOUND:
    "node-unrar-js が読み込まれていません。assets/vendor/unrar.js と unrar.wasm を読み込むか、CDN への接続を確認してください。",
  UNRAR_LOAD_FAILED:
    "node-unrar-js の読み込みに失敗しました。assets/vendor/unrar.js と unrar.wasm の配置または CDN 接続を確認してください。",
  UNRAR_WORKER_FALLBACK:
    "RAR処理用のWeb Workerを初期化できませんでした。メインスレッドで処理します。",
});

export const ARCHIVE_PROCESSING_ERRORS = Object.freeze({
  RAR_EXTRACT_FAILED: "RAR内にファイルが見つからないか抽出に失敗しました",
});
