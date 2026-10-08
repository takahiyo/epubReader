/** Catalog wire protocol: atomic mutation groups, server revisions and bounded change pages. */
const CATALOG_SYNC_BYTES = 512 * 1024;
export const CATALOG_SYNC = Object.freeze({
  maxMutations: 1, maxChanges: 5000, defaultPageSize: 10, maxPageSize: 50, maxD1Queries: 50,
  maxRecordBytes: 4096, maxPageBytes: CATALOG_SYNC_BYTES, maxMutationBytes: CATALOG_SYNC_BYTES,
  maxTextLength: 2048, maxAliases: 32, maxIdLength: 128,
  casRetries: 5,
  statuses: Object.freeze({ accepted: 'accepted', conflict: 'conflict', invalid: 'invalid' }),
  reasons: Object.freeze({ shape: 'shape', values: 'values', revision: 'revision', reused: 'mutation_reused' }),
  excludedHoldingFields: Object.freeze(['legacy_book_id']),
  providerHosts: Object.freeze({ local: [], kindle: ['amazon.co.jp', 'amazon.com'], unext: ['unext.jp'] }),
  urlQueryKeys: Object.freeze(['asin', 'titleid', 'bookid', 'contentid', 'ref', 'ref_', 'language', 'marketplaceid']),
  metaStore: 'catalog_sync_meta', metaId: 'state', recoveryStore: 'catalog_sync_recovery', scopePrefix: '-account-',
  bootstrapPageSize: 100,
  ignoredComparisonFields: Object.freeze(['revision', 'created_at', 'updated_at']),
  clientErrors: Object.freeze({ account: 'account', transport: 'transport', unavailable: 'unavailable', protocol: 'protocol', blocked: 'blocked', limit: 'limit', import: 'import', stale: 'stale' }),
  ui: Object.freeze({ open: 'catalogSyncOpen', run: 'catalogSyncRun', status: 'catalogSyncStatus', review: 'catalogSyncReview', local: 'catalogSyncLocal',
    keep: 'catalogSyncKeep', cloud: 'catalogSyncCloud', seed: 'catalogSyncSeed', empty: 'catalogSyncEmpty', recovery: 'catalogSyncRecovery' }),
});
