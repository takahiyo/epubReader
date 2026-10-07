import { SUPPORTED_FORMATS } from './formats.js';
import { BOOK_TYPES } from './reader.js';

/** Catalog persistence schema. Kept separate from legacy reader/file storage. */
export const CATALOG_CONFIG = Object.freeze({
  databaseName: 'bookreader-catalog', databaseVersion: 1, schemaVersion: 1,
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
