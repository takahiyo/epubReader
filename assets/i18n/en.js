import { APP_INFO } from "../constants.js";

export const UI_STRINGS_EN = Object.freeze({
  // Document
  documentTitle: APP_INFO.DOCUMENT_TITLE,
  appIconAlt: "EPUB Reader",

  // Empty state
  emptyTitle: "No book selected",
  emptyDescription: "Tap center of the screen to open menu",
  loadingText: "Loading...",

  // Language selection
  languageLabelJa: "JA",
  languageLabelEn: "EN",
  languageMenuLabel: "Language menu",
  languageOptionJa: "Japanese",
  languageOptionEn: "English",

  // Tap areas
  areaMenuToggle: "Toggle menu",
  areaPagePrev: "Previous page",
  areaPageNext: "Next page",
  areaPagePrevSingle: "Previous page (single)",
  areaPageNextSingle: "Next page (single)",

  // Menu
  menuOpen: "Open",
  menuLibrary: "Library",
  menuSearch: "Text Search",
  menuBookmarks: "Bookmarks",
  menuHistory: "History",
  menuSettings: "Settings",

  // TOC & Bookmarks
  tocButton: "TOC",
  bookmarkTitle: "Bookmarks",
  bookmarkDefault: "Bookmark",
  addBookmark: "Add bookmark at current location",

  // Search
  searchTitle: "Text Search",
  searchPlaceholder: "Enter a search keyword...",
  searchButton: "Search",

  // TOC
  tocTitle: "Table of Contents",
  tocUntitled: "Untitled",

  // File & Library
  openFileTitle: "Library",
  librarySectionTitle: "Library",
  historyTitle: "History",
  libraryViewGridLabel: "Grid view",
  libraryViewListLabel: "List view",

  // Settings
  settingsTitle: "Settings",
  settingsDisplayTitle: "Display",
  settingsDefaultDirectionLabel: "Default page direction (image archives)",
  themeLabel: "Theme",
  themeDark: "Dark mode",
  themeLight: "Light mode",
  writingModeLabel: "Writing mode",
  writingModeHorizontal: "Horizontal",
  writingModeVertical: "Vertical",
  pageDirectionLabel: "Page direction",
  pageDirectionLtr: "Left binding",
  pageDirectionRtl: "Right binding",
  progressDisplayModeLabel: "Progress format",
  progressDisplayPage: "Pages",
  progressDisplayPercentage: "Percentage",
  settingsLayoutDirectionRtl: "Right to Left (Vertical)",
  settingsLayoutDirectionLtr: "Left to Right (Horizontal)",

  // Default Settings
  settingsDefaultWritingModeLabel: "Default Writing Mode",
  settingsDefaultPageDirectionLabel: "Default Page Direction",
  settingsDefaultImageViewModeLabel: "Default View Mode",

  // Account
  settingsAccountTitle: "Account",
  settingsDeviceTitle: "Device",
  deviceIdLabel: "Device ID",
  deviceColorLabel: "Device color",
  deviceNameLabel: "Device Name",
  syncHint: "If sync fails, disable ad blockers for this site.",
  settingsFirebaseTitle: "Firebase",
  googleLoginLabel: "Sign in with Google",
  googleLogoutLabel: "Sign out",
  googleLoginStatusSignedOut: "Signed out",
  googleLoginStatusSignedIn: "Signed in: {user}",
  googleLoginStatusSignedInShort: "Signed in",
  googleLoginFailed: "Failed to sign in",
  settingsNotionTitle: "Notion Integration",
  notionStatusLabel: "Status",
  notionStatusDisconnected: "Not connected",
  notionStatusConnected: "Connected",
  notionStatusPending: "Pending",
  notionStatusError: "Connection error",
  notionWorkspaceLabel: "Workspace",
  notionParentPageLabel: "Target Page",
  notionDatabaseLabel: "Reading Log DB",
  notionValueEmpty: "Not set",
  notionConnectButton: "Connect to Notion",
  notionDisconnectButton: "Disconnect",
  notionHelpText: "Select a Notion page to create the reading log database.",
  notionConnectUnavailable: "Notion connection is not configured yet.",
  notionDisconnectConfirm: "Disconnect Notion integration?",
  notionDisconnected: "Notion integration was disconnected.",

  // Sync
  syncToggleLabel: "Enable sync",
  syncToggleOff: "Disable sync",
  syncStatusLabel: "Last sync: {time}",
  syncStatusNever: "Last sync: never",
  syncNeedsLogin: "Sign in with Google to enable sync.",

  // Data management
  settingsDataTitle: "Data",
  exportData: "Export settings & data",
  importData: "Import settings & data",

  // Library & History
  libraryEmpty: "Your library is empty",
  historyEmpty: "No history yet",
  historyDeleteConfirm: "Delete this history entry?",
  progressLabel: "Progress",
  bookmarkEmpty: "No bookmarks",
  bookmarkDeleteConfirm: "Delete this bookmark?",

  // Prompts & Messages
  openBookPrompt: "Please open a book.",
  searchMissingQuery: "Please enter a search keyword.",
  searchNoResults: "No results found.",
  searchLoading: "Searching...",
  searchEpubOnly: "Search is available only when an EPUB is open.",
  searchNavigateFailed: "Failed to navigate to the search result.",
  searchResultFallback: "Result",

  // Toggle buttons
  writingModeToggleVertical: "V",
  writingModeToggleHorizontal: "H",

  // Sync prompts
  syncPromptTitle: "Sync available",
  syncPromptMessage: "A newer reading position is available on another device.",
  syncPromptMessageWithDevice: "A newer reading position is available on {device}.",
  syncPromptLocalMessage: "This device has newer data. Upload it?",
  syncPromptLocalMessageWithDevice: "This device has newer data. Upload it? (Other device: {device})",
  syncPromptJump: "Latest reading position is {page}. Jump to it?",
  syncPromptRemote: "Continue from other device ({time})",
  syncPromptLocal: "Keep this device's position",
  syncPromptUpload: "Upload this device's state",

  // Candidate books
  candidateModalTitle: "Similar book found",
  candidateModalMessage:
    "We found a matching book in the cloud.\\nContinue from the synced position?",
  candidateUseLocal: "Treat as new without syncing",
  closeButtonLabel: "Close",
  archiveWarningTitle: "RAR notices",
  rarWarningNoStream: "RAR cannot be streamed, so the entire file is loaded into memory.",
  rarWarningSolidFullExtract: "Solid RAR archives require full extraction from the beginning, even for mid-pages.",

  // Cloud
  libraryCloudMissingBadge: "Not on this device",
  libraryAttachFile: "Attach file to link",
  cloudOnlyTitle: "Viewing cloud reading data",
  cloudOnlyDescription: "Attach the file to continue reading.",

  // Display modes
  spreadModeDouble: "Spread",
  spreadModeSingle: "Single",
  pageDirectionLtrButton: "→LTR",
  pageDirectionRtlButton: "←RTL",
  readingDirectionLtrTitle: "Left binding (read left to right)",
  readingDirectionRtlTitle: "Right binding (read right to left)",
  zoomInTitle: "Zoom in",
  zoomOutTitle: "Zoom out",
  fontIncreaseLabel: "A+",
  fontDecreaseLabel: "A-",
  untitledBook: "Untitled",
  candidateIdLabel: "ID: {id}",

  // Image alt text
  pageImageAlt: "Page image",
  modalImageAlt: "Zoomed image",

  // Sync status
  syncNeedsLoginStatus: "Google sign-in required",
  syncInProgress: "Syncing...",
  syncStarting: "Starting sync...",
  syncCompleted: "Sync completed",
  syncFailed: "Sync failed",
  syncNowButton: "Sync now",
  syncBlocked: "Connection blocked",
  syncBlockedDetail:
    "Please disable ad blockers and try again.\\n(Firebase connection is blocked)",
  syncPermissionError: "Permission error",
  syncPermissionDetail: "Please sign in again.",

  // Cloud sync messages
  cloudSyncAuthRequired: "Login is required. Please sign in from settings.",
  cloudSyncNoEndpoint: "Workers endpoint is not configured",
  cloudSyncNoIdToken: "ID token is not available",
  cloudSyncOneDriveAuthRequired: "OneDrive authentication is required",
  cloudSyncPCloudConfigRequired: "pCloud configuration is required",
  cloudSyncWorkersFailed: "Workers sync failed ({status})",
  cloudSyncUnknownSource: "Unknown sync source: {source}",
  cloudSyncEndpointSaveFailed: "Sync failed ({status})",
  cloudSyncEndpointLoadFailed: "Failed to fetch data ({status})",
  cloudSyncOneDriveFileMissing: "Sync file was not found on OneDrive",
  cloudSyncOneDriveFetchFailed: "Failed to fetch from OneDrive ({status})",
  cloudSyncOneDriveCheckFailed: "Failed to verify OneDrive file ({status})",
  cloudSyncOneDriveSearchFailed: "Failed to search OneDrive file ({status})",
  cloudSyncOneDriveUploadFailed: "Failed to save to OneDrive ({status})",
  cloudSyncPCloudSaveFailed: "Failed to save to pCloud ({status})",
  cloudSyncPCloudFetchFailed: "Failed to fetch from pCloud ({status})",

  // Error messages
  errorFileLoadFailed: "Failed to load file.",
  errorFileName: "File name",
  errorFileSize: "File size",
  errorDetail: "Error details",
  errorNoImagesFound:
    "Error: No image files found in the archive.\\n\\nSupported formats: PNG, JPEG, GIF, WebP, BMP",
  errorImageLoadFailed:
    "Error: Failed to load image file.\\n\\nThe file may be corrupted.",

  // Relative time
  timeJustNow: "just now",
  timeMinutesAgo: "{n}m ago",
  timeHoursAgo: "{n}h ago",
  timeDaysAgo: "{n}d ago",
  timeWeeksAgo: "{n}w ago",
  timeMonthsAgo: "{n}mo ago",
  timeYearsAgo: "{n}y ago",

  // Library search & delete
  library_search_placeholder: "Search by title or author",
  library_delete_confirm: "Delete this book?\n(Cloud data will remain)",
  delete_button: "Delete",
  undo_button: "Undo",
  linkMismatchWarning: "The selected book may be different from the one in your library.\n\nDo you want to link it anyway?",
});
