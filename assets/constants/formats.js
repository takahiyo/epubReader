// ============================================
// サポートファイル形式
// ============================================
export const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".avif",
  ".jfif",
  ".heic",
  ".heif",
  ".tiff",
  ".tif",
]);

export const SUPPORTED_FORMATS = Object.freeze({
  EPUB: [".epub"],
  IMAGE_ARCHIVE: [".cbz", ".zip", ".rar", ".cbr"],
  IMAGES: SUPPORTED_IMAGE_EXTENSIONS,
  WEB_NOVEL: [".txt", ".html"], // Web小説スタブ用
});

// ============================================
// MIME タイプ
// ============================================
export const MIME_TYPES = Object.freeze({
  EPUB: "application/epub+zip",
  ZIP: "application/zip",
  CBZ: "application/vnd.comicbook+zip",
  RAR: "application/vnd.rar",
  RAR_LEGACY: "application/x-rar-compressed",
  CBR: "application/x-cbr",
  PNG: "image/png",
  JPEG: "image/jpeg",
  GIF: "image/gif",
  WEBP: "image/webp",
  AVIF: "image/avif",
  BMP: "image/bmp",
  HEIC: "image/heic",
  HEIF: "image/heif",
  TIFF: "image/tiff",
  WEB_NOVEL: "text/x-web-novel",
});

// ============================================
// ファイル読み込み戦略 (SSOT)
// ============================================
/**
 * ファイルサイズと端末環境に基づく読み込み戦略の閾値。
 * handleFile / file-handler.js が参照し、最適な読み込み手法を自動選択する。
 */
export const FILE_STRATEGY = Object.freeze({
  /** マジックナンバー判定に必要な先頭バイト数 */
  HEADER_BYTES: 100,
  /** 一括読み込みの上限（これ以下は従来通り arrayBuffer() で高速一括処理） */
  DIRECT_BUFFER_LIMIT: 10 * 1024 * 1024,   // 10MB
  /** 大容量ファイルのしきい値（これ以上はOPFS優先保存の対象） */
  LARGE_FILE_THRESHOLD: 50 * 1024 * 1024,   // 50MB
  /** 低メモリと判定するデバイスメモリ (GB) */
  LOW_MEMORY_THRESHOLD_GB: 2,
  /** 権限消失 (NotReadableError) 時の最大リトライ回数 */
  PERMISSION_RETRY_MAX: 2,
  /** リトライ間の待機時間 (ms) */
  PERMISSION_RETRY_DELAY_MS: 500,
  /** JSZip の一括展開時のピークメモリ推定倍率（File/Blob直接渡しのため実際は2倍程度） */
  JSZIP_PEAK_MULTIPLIER: 2,
  /** JSZip 展開に割り当てるメモリ上限（端末メモリの何割まで） */
  SAFE_MEMORY_RATIO: 0.25,
});
