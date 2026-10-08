import { SUPPORTED_FORMATS } from './formats.js';
import { BOOK_TYPES } from './reader.js';

/** Catalog persistence schema. Kept separate from legacy reader/file storage. */
export const CATALOG_CONFIG = Object.freeze({
  pageSize: 50,
  sources: Object.freeze({ manual: 'manual', legacy: 'legacy' }),
  loanActions: Object.freeze({ borrow: 'borrow', return: 'return' }),
  errorCodes: Object.freeze({ conflict: 'conflict', invalid: 'invalid' }),
  databaseName: 'bookreader-catalog', databaseVersion: 2, schemaVersion: 1,
  providers: Object.freeze(['local', 'kindle', 'unext']),
  accessTypes: Object.freeze(['purchased', 'subscription_loan']),
  availabilityStates: Object.freeze(['active', 'returned', 'expired', 'unknown']),
  readingStates: Object.freeze(['unread', 'reading', 'completed']),
  localFormats: Object.freeze([...SUPPORTED_FORMATS.EPUB, ...SUPPORTED_FORMATS.IMAGE_ARCHIVE].map(extension => extension.slice(1))),
  legacyExcludedType: BOOK_TYPES.WEB_NOVEL,
  commonFields: Object.freeze(['id', 'revision', 'created_at', 'updated_at', 'deleted_at']),
  numericFields: Object.freeze(['revision', 'created_at', 'updated_at', 'deleted_at', 'sort_order', 'progress_percent', 'started_at', 'ended_at', 'occurred_at', 'recorded_at', 'availability_checked_at']),
  booleanFields: Object.freeze(['reread_wanted']),
  fields: Object.freeze({
    series: ['name', 'aliases'],
    books: ['title', 'author', 'series_id', 'volume_label', 'sort_order', 'edition'],
    holdings: ['book_id', 'provider', 'format', 'provider_book_id', 'external_url', 'access_type', 'availability_status', 'availability_checked_at', 'source', 'legacy_book_id', 'legacy_cloud_book_id'],
    access_periods: ['holding_id', 'started_at', 'ended_at', 'end_reason'],
    reading_events: ['holding_id', 'access_period_id', 'event_type', 'occurred_at', 'recorded_at', 'progress_percent', 'source'],
    manual_reading_states: ['holding_id', 'status', 'progress_percent', 'reread_wanted'],
  }),
});

/** UI identities shared by the application, catalog dialog and browser tests. */
export const CATALOG_UI = Object.freeze({
  launch: 'menuCatalog', floatLaunch: 'floatCatalog', modal: 'catalogModal', heading: 'catalogHeading',
  list: 'catalogList', search: 'catalogSearch', series: 'catalogSeries', provider: 'catalogProvider',
  availability: 'catalogAvailability', editor: 'catalogEditor', notice: 'catalogNotice',
  form: 'catalogForm', prefix: 'catalog-', backupName: 'bookreader-catalog.json',
  numericInputs: Object.freeze(['sort_order', 'progress_percent']),
  classes: Object.freeze({ panel: 'catalog-panel', tools: 'catalog-tools', paging: 'catalog-paging', book: 'catalog-book', holding: 'catalog-holding', form: 'catalog-form' }),
  fields: Object.freeze(['title', 'author', 'series_id', 'new_series', 'volume_label', 'sort_order', 'edition',
    'provider', 'format', 'provider_book_id', 'external_url', 'access_type', 'availability_status', 'progress_percent', 'status', 'reread_wanted']),
  errors: Object.freeze({ conflict: 'catalog_conflict', invalid: 'catalog_invalid', storage: 'catalog_storage_error' }),
});

/** CSV is an additive registration format, not a full backup or an update command. */
export const CATALOG_CSV = Object.freeze({
  maxBytes: 1024 * 1024, maxRows: 5000,
  columns: Object.freeze(['title', 'provider', 'author', 'series', 'volume_label', 'sort_order', 'edition', 'format',
    'provider_book_id', 'external_url', 'access_type', 'availability_status', 'book_key']),
  required: Object.freeze(['title', 'provider']),
  statuses: Object.freeze({ add: 'add', duplicate: 'duplicate', error: 'error' }),
  errors: Object.freeze({ syntax: 'syntax', header: 'header', limit: 'limit', values: 'values', group: 'group', series: 'series', selection: 'selection' }),
  input: 'catalogCSVInput', preview: 'catalogCSVPreview', commit: 'catalogCSVCommit',
  templateName: 'bookreader-catalog-template.csv', mime: 'text/csv;charset=utf-8', accept: '.csv,text/csv',
  export: 'catalogCSVExport', exportName: 'bookreader-selected-books.csv', bookKeyPrefix: 'book_', spreadsheetTextPrefix: '\t',
  classes: Object.freeze({ preview: 'catalog-csv-preview', table: 'catalog-csv-table' }),
});

/** Bulk editing only organizes explicit books; holding and reader identities stay untouched. */
export const CATALOG_BULK = Object.freeze({
  maxSelection: 500,
  modes: Object.freeze({ keep: '__keep__', clear: '__clear__', create: '__create__', set: '__set__' }),
  seriesOptionPrefix: 'series:',
  errors: Object.freeze({ selection: 'selection', order: 'order', series: 'series' }),
  count: 'catalogSelectionCount', launch: 'catalogBulkLaunch', selectPage: 'catalogSelectPage', clear: 'catalogSelectionClear',
  form: 'catalogBulkForm', target: 'catalogBulkTarget', name: 'catalogBulkName', save: 'catalogBulkSave', cancel: 'catalogBulkCancel',
  labelPrefix: 'catalogBulkVolume-', orderPrefix: 'catalogBulkOrder-',
  classes: Object.freeze({ selection: 'catalog-selection', editor: 'catalog-bulk-editor', row: 'catalog-bulk-row' }),
});

/** Copy registration uses new identities and explicit drafts, never reader/history cloning. */
export const CATALOG_COPY = Object.freeze({
  launch: 'catalogCopyLaunch', form: 'catalogCopyForm', save: 'catalogCopySave', cancel: 'catalogCopyCancel',
  prefix: 'catalogCopy-',
  bookFields: Object.freeze(['title', 'author', 'series_id', 'volume_label', 'sort_order', 'edition']),
  holdingFields: Object.freeze(['provider', 'format', 'access_type', 'provider_book_id', 'external_url', 'availability_status']),
});

/** Historical entries never replace current reading or availability state. */
export const CATALOG_HISTORY = Object.freeze({
  form: 'catalogHistoryForm', save: 'catalogHistorySave', cancel: 'catalogHistoryCancel', prefix: 'catalogHistory-',
  accessFilter: 'catalogAccessType', monthFilter: 'catalogCompletionMonth',
  kinds: Object.freeze({ event: 'event', period: 'period' }),
  eventFields: Object.freeze(['event_type', 'occurred_at', 'progress_percent']),
  periodFields: Object.freeze(['started_at', 'ended_at']),
  completed: CATALOG_CONFIG.readingStates[2],
});
