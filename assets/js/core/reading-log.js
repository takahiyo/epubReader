/**
 * reading-log.js - Export one reading snapshot as a Markdown note with flat YAML properties.
 * Copy and native sharing use the same allowlisted schema, without book contents or credentials.
 * Dependencies: constants and i18n. Called by app.js.
 */
import { APP_INFO, BOOK_TYPES, PROGRESS_PRECISION, READING_LOG_FORMAT, SUPPORTED_FORMATS } from '../../constants.js';
import { getUiStrings } from '../../i18n.js';
import { roundProgressPercentage } from './progress-utils.js';

/**
 * Read the user's [author]title filename convention without guessing volume or underscore boundaries.
 * @param {Object} readerState - Original filename and existing metadata
 * @returns {{title: string, author: string}|null} Explicit filename fields, or no recognized convention
 */
function filenameBookInfo(readerState) {
  // Web-novel titles are metadata, not filenames; leading brackets can be part of the actual title.
  if (readerState.bookType === BOOK_TYPES.WEB_NOVEL) return null;
  const source = typeof readerState.fileName === 'string' && readerState.fileName.trim()
    ? readerState.fileName : readerState.title;
  if (typeof source !== 'string') return null;
  let name = source.trim();
  const extensionIndex = name.lastIndexOf('.');
  const extension = name.slice(extensionIndex).toLowerCase();
  if (extensionIndex >= 0 && Object.values(SUPPORTED_FORMATS).some(formats => formats.includes(extension))) {
    name = name.slice(0, extensionIndex);
  }
  const match = READING_LOG_FORMAT.FILENAME_AUTHOR_PATTERN.exec(name);
  if (!match) return null;
  const author = match[1].trim();
  const title = match[2].trim();
  return author && title ? { author, title } : null;
}

/**
 * Make a note target without interpreting book punctuation as a heading, alias or folder.
 * @param {string} name - Original title or author
 * @returns {string} Quoted elsewhere as a YAML string; the original name is preserved separately
 */
function wikiLink(name) {
  const target = [...name.replace(/\s+/g, ' ').trim()].map(character =>
    READING_LOG_FORMAT.LINK_REPLACEMENTS[character] ?? character).join('').replace(/\.+$/, dots => '．'.repeat(dots.length));
  return '[[' + target + ']]';
}

/**
 * Format the local capture time with an explicit UTC offset.
 * @param {Date} date - Capture time
 * @returns {{date: string, timestamp: string}} Local calendar day and ISO datetime
 */
function captureTime(date) {
  const pad = value => String(value).padStart(2, '0');
  const day = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  const offset = -date.getTimezoneOffset();
  const zone = (offset >= 0 ? '+' : '-') + pad(Math.floor(Math.abs(offset) / 60)) + ':' + pad(Math.abs(offset) % 60);
  return { date: day, timestamp: day + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + zone };
}

/**
 * Serialize flat properties with JSON-compatible YAML quotes, keeping numeric values numeric.
 * @param {Object} properties - Explicit export fields only
 * @returns {string} YAML lines
 */
function yamlProperties(properties) {
  return Object.entries(properties).map(([key, value]) => {
    if (Array.isArray(value)) return value.length
      ? key + ':\n' + value.map(item => '  - ' + JSON.stringify(item)).join('\n')
      : key + ': []';
    // ISO date values remain YAML dates, not display strings or locale-specific text.
    if (key === 'date' || key === 'recorded_at') return key + ': ' + value;
    return key + ': ' + JSON.stringify(value);
  }).join('\n');
}

/**
 * Generate a complete note; property names and status values remain stable across UI languages.
 * @param {Object} readerState - Filename, title, authors, book ID/type, progress and optional page counts
 * @param {Object} options - Optional language and Date for deterministic capture
 * @returns {string} Markdown beginning with YAML frontmatter, ready for a new note
 */
export function generateReadingLogMarkdown(readerState, { language = 'ja', now = new Date() } = {}) {
  const strings = getUiStrings(language);
  // A recognized filename convention is authoritative for this export only; stored book metadata is unchanged.
  const fileInfo = filenameBookInfo(readerState);
  const title = fileInfo?.title ?? (typeof readerState.title === 'string' && readerState.title.trim()
    ? readerState.title : READING_LOG_FORMAT.UNTITLED);
  const author = fileInfo?.author ?? readerState.author;
  const inputAuthors = Array.isArray(author) ? author : [author];
  const isImage = readerState.bookType === BOOK_TYPES.ZIP || readerState.bookType === BOOK_TYPES.RAR;
  const authors = [...new Set(inputAuthors.filter(value => typeof value === 'string').map(value => value.trim())
    .filter(value => value && !(isImage && !fileInfo && value === READING_LOG_FORMAT.IMAGE_AUTHOR_PLACEHOLDER)))];
  const percentage = Number.isFinite(readerState.percentage)
    ? roundProgressPercentage(Math.max(0, Math.min(100, readerState.percentage)), PROGRESS_PRECISION) : 0;
  // Rounding 99.99% to 100% must not manufacture a completion event.
  const completed = Number.isFinite(readerState.percentage) && readerState.percentage >= 100;
  const time = captureTime(now);
  const book = wikiLink(title);
  const authorLinks = authors.map(wikiLink);
  const properties = {
    type: READING_LOG_FORMAT.TYPE,
    schema_version: READING_LOG_FORMAT.VERSION,
    date: time.date,
    recorded_at: time.timestamp,
    book,
    title,
    authors: authorLinks,
    author_names: authors,
    status: completed ? READING_LOG_FORMAT.STATUS_COMPLETED : READING_LOG_FORMAT.STATUS_READING,
    progress: percentage,
    tags: [READING_LOG_FORMAT.TYPE],
  };
  if (typeof readerState.bookId === 'string' && readerState.bookId) properties.book_id = readerState.bookId;
  if (Object.values(BOOK_TYPES).includes(readerState.bookType)) properties.format = readerState.bookType;
  // Page counts are a display snapshot, not a cross-device reading locator.
  if (Number.isFinite(readerState.totalPages) && readerState.totalPages > 0 && Number.isFinite(readerState.pageIndex)) {
    properties.page = Math.min(Math.floor(readerState.totalPages), Math.max(1, Math.floor(readerState.pageIndex) + 1));
    properties.total_pages = Math.floor(readerState.totalPages);
  }
  properties.app = APP_INFO.NAME;
  // Never export query parameters, URL credentials or a local filesystem URL.
  try {
    const url = new URL(readerState.appUrl);
    if (url.protocol === 'https:' || url.protocol === 'http:') properties.app_url = url.origin + url.pathname;
  } catch { /* The note remains usable when no public application URL exists. */ }
  const statusLabel = completed ? strings.readingLogCompletedStatus : strings.readingLogReadingStatus;
  return [
    '---', yamlProperties(properties), '---', '',
    '# ' + strings.share_reading_log, '',
    '- **' + strings.readingLogBookLabel + '**: ' + book,
    '- **' + strings.readingLogAuthorsLabel + '**: ' + (authorLinks.join(', ') || strings.readingLogNoAuthor),
    '- **' + strings.readingLogProgressLabel + '**: ' + percentage + '%',
    '- **' + strings.readingLogStatusLabel + '**: ' + statusLabel,
    '- **' + strings.readingLogRecordedAtLabel + '**: ' + time.timestamp,
    '', '## ' + strings.readingLogNotesHeading, '',
  ].join('\n');
}
