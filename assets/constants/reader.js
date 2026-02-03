// ============================================
// 読書状態の定義
// ============================================
export const BOOK_TYPES = Object.freeze({
  EPUB: "epub",
  ZIP: "zip",
  RAR: "rar",
  IMAGE: "image",
});

export const WRITING_MODES = Object.freeze({
  HORIZONTAL: "horizontal",
  VERTICAL: "vertical",
});

export const READING_DIRECTIONS = Object.freeze({
  LTR: "ltr",
  RTL: "rtl",
});

export const IMAGE_VIEW_MODES = Object.freeze({
  SINGLE: "single",
  SPREAD: "spread",
});

export const THEME_MODES = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
});

export const CSS_WRITING_MODES = Object.freeze({
  VERTICAL: "vertical-rl",
  HORIZONTAL: "horizontal-tb",
});

export const FILE_EXTENSIONS = Object.freeze({
  EPUB: "epub",
  ZIP: "zip",
  RAR: "rar",
  CBR: "cbr",
  CBZ: "cbz",
});

export const ARCHIVE_WARNING_TYPES = Object.freeze({
  RAR_NO_STREAM: "rar_no_stream",
  RAR_SOLID_FULL_EXTRACT: "rar_solid_full_extract",
});

export const ARCHIVE_WARNING_I18N_KEYS = Object.freeze({
  [ARCHIVE_WARNING_TYPES.RAR_NO_STREAM]: "rarWarningNoStream",
  [ARCHIVE_WARNING_TYPES.RAR_SOLID_FULL_EXTRACT]: "rarWarningSolidFullExtract",
});

export const ARCHIVE_WARNING_EVENT = "archive-warning";

export const ARCHIVE_WARNING_CONFIG = Object.freeze({
  AUTO_CLOSE_MS: 2500,
});

export const ARCHIVE_WORKER_MESSAGES = Object.freeze({
  INIT: "archive_worker_init",
  EXTRACT: "archive_worker_extract",
  ERROR: "archive_worker_error",
});

export const READER_LOADING_PHASES = Object.freeze({
  ARCHIVE_INIT: "archive_init",
  ARCHIVE_LIST: "archive_list",
  IMAGE_PRELOAD: "image_preload",
  IMAGE_CONVERT: "image_convert",
  READY: "ready",
});

export const READER_LOADING_STATUSES = Object.freeze({
  START: "start",
  PROGRESS: "progress",
  COMPLETE: "complete",
  ERROR: "error",
});

// ============================================
// リーダー設定
// ============================================
export const READER_CONFIG = Object.freeze({
  viewportWidth: 800,
  viewportHeight: 600,
  fontSize: "16px",
  writingMode: "horizontal-tb",
  lineHeight: 1.6,
  paragraphMarginEm: 0.8,
  orphans: 1,
  widows: 1,
  margin: "0",
  padding: "16px",
  // レイアウト設定（レスポンシブ・禁則処理）
  layout: Object.freeze({
    maxWidth: "800px", // コンテンツ最大幅
    textAlign: "justify", // 両端揃え
    lineBreak: "strict", // 厳格な禁則処理
    wordBreak: "normal", // 標準のワードブレーク
  }),
  FONT_SIZE_MIN: 12,
  FONT_SIZE_MAX: 28,
  MAX_BINARY_SEARCH_ITERATIONS: 24,
  MAX_PAGES_PER_SPINE: 5000,
  FIT_TOLERANCE_PX: 0,
  MAX_FIT_ATTEMPTS: 3,
  TEXT_SEGMENT_STEP: 5,
  DEFAULT_LINE_HEIGHT: 1.8,
  LOCATIONS_CHARS_PER_PAGE: 1600,
});

// ============================================
// メモリ/キャッシュ戦略
// ============================================
export const MEMORY_STRATEGY = Object.freeze({
  imagePreloadCount: 3,
  imagePreloadAheadCount: 1,
  CACHE_SIZE: 6,
  LARGE_CACHE_SIZE: 3,
  LARGE_FILE_THRESHOLD: 50 * 1024 * 1024,
});
