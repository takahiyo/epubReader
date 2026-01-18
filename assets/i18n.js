/**
 * i18n.js - 国際化 (Internationalization) モジュール
 * 
 * UI文字列の一元管理を行います。
 * 新しい言語を追加する場合は、UI_STRINGS に新しいキーを追加してください。
 */

import { APP_INFO } from "./constants.js";

// ============================================
// UI文字列定義
// ============================================
export const UI_STRINGS = Object.freeze({
  ja: Object.freeze({
    // ドキュメント
    documentTitle: APP_INFO.DOCUMENT_TITLE,
    
    // 空の状態
    emptyTitle: "本が選択されていません",
    emptyDescription: "画面中央をクリックしてメニューを表示",
    
    // メニュー
    menuOpen: "開く",
    menuLibrary: "ライブラリ",
    menuSearch: "テキスト検索",
    menuBookmarks: "しおり",
    menuHistory: "履歴",
    menuSettings: "設定",
    
    // 目次・しおり
    tocButton: "目次",
    bookmarkTitle: "しおり",
    bookmarkDefault: "しおり",
    addBookmark: "✚ 現在位置にしおりを追加",
    
    // 検索
    searchTitle: "テキスト検索",
    searchPlaceholder: "検索キーワードを入力...",
    searchButton: "🔍 検索",
    
    // 目次
    tocTitle: "目次",
    tocUntitled: "無題",
    
    // ファイル・ライブラリ
    openFileTitle: "ライブラリ",
    librarySectionTitle: "ライブラリ",
    historyTitle: "履歴",
    
    // 設定
    settingsTitle: "設定",
    settingsDisplayTitle: "表示設定",
    themeLabel: "テーマ",
    themeDark: "ダークモード",
    themeLight: "ライトモード",
    writingModeLabel: "書字方向",
    writingModeHorizontal: "横書き",
    writingModeVertical: "縦書き",
    pageDirectionLabel: "開き方向",
    pageDirectionLtr: "左開き",
    pageDirectionRtl: "右開き",
    progressDisplayModeLabel: "進捗表示形式",
    progressDisplayPage: "ページ数",
    progressDisplayPercentage: "パーセンテージ",
    
    // アカウント
    settingsAccountTitle: "アカウント",
    settingsDeviceTitle: "デバイス",
    deviceIdLabel: "デバイスID",
    deviceColorLabel: "デバイスカラー",
    settingsFirebaseTitle: "Firebase",
    googleLoginLabel: "Googleログイン",
    googleLogoutLabel: "ログオフ",
    googleLoginStatusSignedOut: "未ログイン",
    googleLoginStatusSignedIn: "ログイン済み: {user}",
    googleLoginStatusSignedInShort: "ログイン済み",
    googleLoginFailed: "ログインに失敗しました",
    
    // 同期
    syncToggleLabel: "同期を有効にする",
    syncToggleOff: "同期を無効にする",
    syncStatusLabel: "最終同期: {time}",
    syncStatusNever: "最終同期: 未実施",
    syncNeedsLogin: "同期には Google ログインが必要です。",
    
    // データ管理
    settingsDataTitle: "データ管理",
    exportData: "設定・データを書き出す",
    importData: "設定・データを読み込む",
    
    // ライブラリ・履歴
    libraryEmpty: "ライブラリが空です",
    historyEmpty: "履歴がありません",
    historyDeleteConfirm: "この履歴を削除しますか？",
    progressLabel: "進捗",
    bookmarkEmpty: "しおりがありません",
    bookmarkDeleteConfirm: "このしおりを削除しますか？",
    
    // プロンプト・メッセージ
    openBookPrompt: "本を開いてください",
    searchMissingQuery: "検索キーワードを入力してください",
    searchNoResults: "検索結果が見つかりませんでした",
    searchLoading: "検索中...",
    searchEpubOnly: "EPUB形式の本を開いている時のみ検索できます",
    searchNavigateFailed: "検索結果への移動に失敗しました",
    searchResultFallback: "結果",
    
    // トグルボタン
    writingModeToggleVertical: "縦",
    writingModeToggleHorizontal: "横",
    
    // 同期プロンプト
    syncPromptTitle: "同期の確認",
    syncPromptMessage: "他の端末で、より新しい読書位置があります。",
    syncPromptLocalMessage: "この端末の状態が新しいようです。アップロードしますか？",
    syncPromptJump: "最新の読書位置は {page} ですがジャンプしますか？",
    syncPromptRemote: "ジャンプする（{time}）",
    syncPromptLocal: "キャンセル",
    syncPromptUpload: "この端末の状態をアップロード",
    
    // クラウド
    libraryCloudMissingBadge: "この端末に未保存",
    libraryAttachFile: "ファイルを追加して紐づけ",
    cloudOnlyTitle: "クラウドの読書データのみ表示中",
    cloudOnlyDescription: "ファイルを追加すると続きから読めます",
    
    // 表示モード
    spreadModeDouble: "見開き",
    spreadModeSingle: "単ページ",
    pageDirectionLtrButton: "→左開き",
    pageDirectionRtlButton: "←右開き",
    zoomIn: "🔍+",
    zoomOut: "🔍−",
    deleteIcon: "🗑️",
    bookIcon: "📖",
    
    // 同期ステータス
    syncNeedsLoginStatus: "Googleログインが必要です",
    syncInProgress: "同期中...",
    syncStarting: "同期を開始しています...",
    syncCompleted: "✓ 同期完了",
    syncFailed: "同期に失敗しました",
    syncNowButton: "今すぐ同期",
    syncBlocked: "通信がブロックされました",
    syncBlockedDetail: "広告ブロック等の拡張機能をOFFにして再試行してください。\\n(Firebaseへの接続が遮断されています)",
    syncPermissionError: "権限エラー",
    syncPermissionDetail: "ログインし直してください。",
    
    // エラーメッセージ
    errorFileLoadFailed: "ファイルの読み込みに失敗しました。",
    errorFileName: "ファイル名",
    errorFileSize: "ファイルサイズ",
    errorDetail: "エラー詳細",
    errorNoImagesFound: "エラー: アーカイブ内に画像ファイルが見つかりませんでした。\\n\\n対応フォーマット: PNG, JPEG, GIF, WebP, BMP",
    errorImageLoadFailed: "エラー: 画像ファイルの変換に失敗しました。\\n\\nファイルが破損している可能性があります。",
    
    // 相対時間
    timeJustNow: "たった今",
    timeMinutesAgo: "{n}分前",
    timeHoursAgo: "{n}時間前",
    timeDaysAgo: "{n}日前",
    timeWeeksAgo: "{n}週間前",
    timeMonthsAgo: "{n}ヶ月前",
    timeYearsAgo: "{n}年前",
  }),
  
  en: Object.freeze({
    // Document
    documentTitle: APP_INFO.DOCUMENT_TITLE,
    
    // Empty state
    emptyTitle: "No book selected",
    emptyDescription: "Tap center of the screen to open menu",
    
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
    addBookmark: "✚ Add bookmark at current location",
    
    // Search
    searchTitle: "Text Search",
    searchPlaceholder: "Enter a search keyword...",
    searchButton: "🔍 Search",
    
    // TOC
    tocTitle: "Table of Contents",
    tocUntitled: "Untitled",
    
    // File & Library
    openFileTitle: "Library",
    librarySectionTitle: "Library",
    historyTitle: "History",
    
    // Settings
    settingsTitle: "Settings",
    settingsDisplayTitle: "Display",
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
    
    // Account
    settingsAccountTitle: "Account",
    settingsDeviceTitle: "Device",
    deviceIdLabel: "Device ID",
    deviceColorLabel: "Device color",
    settingsFirebaseTitle: "Firebase",
    googleLoginLabel: "Sign in with Google",
    googleLogoutLabel: "Sign out",
    googleLoginStatusSignedOut: "Signed out",
    googleLoginStatusSignedIn: "Signed in: {user}",
    googleLoginStatusSignedInShort: "Signed in",
    googleLoginFailed: "Failed to sign in",
    
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
    syncPromptLocalMessage: "This device has newer data. Upload it?",
    syncPromptRemote: "Continue from other device ({time})",
    syncPromptLocal: "Keep this device's position",
    syncPromptUpload: "Upload this device's state",
    
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
    zoomIn: "🔍+",
    zoomOut: "🔍−",
    deleteIcon: "🗑️",
    bookIcon: "📖",
    
    // Sync status
    syncNeedsLoginStatus: "Google sign-in required",
    syncInProgress: "Syncing...",
    syncStarting: "Starting sync...",
    syncCompleted: "✓ Sync completed",
    syncFailed: "Sync failed",
    syncNowButton: "Sync now",
    syncBlocked: "Connection blocked",
    syncBlockedDetail: "Please disable ad blockers and try again.\\n(Firebase connection is blocked)",
    syncPermissionError: "Permission error",
    syncPermissionDetail: "Please sign in again.",
    
    // Error messages
    errorFileLoadFailed: "Failed to load file.",
    errorFileName: "File name",
    errorFileSize: "File size",
    errorDetail: "Error details",
    errorNoImagesFound: "Error: No image files found in the archive.\\n\\nSupported formats: PNG, JPEG, GIF, WebP, BMP",
    errorImageLoadFailed: "Error: Failed to load image file.\\n\\nThe file may be corrupted.",
    
    // Relative time
    timeJustNow: "just now",
    timeMinutesAgo: "{n}m ago",
    timeHoursAgo: "{n}h ago",
    timeDaysAgo: "{n}d ago",
    timeWeeksAgo: "{n}w ago",
    timeMonthsAgo: "{n}mo ago",
    timeYearsAgo: "{n}y ago",
  }),
});

// ============================================
// デフォルト言語
// ============================================
export const DEFAULT_LANGUAGE = "en";

// ============================================
// サポート言語リスト
// ============================================
export const SUPPORTED_LANGUAGES = Object.freeze(Object.keys(UI_STRINGS));

// ============================================
// ヘルパー関数
// ============================================

/**
 * 指定言語のUI文字列を取得
 * @param {string} language - 言語コード ("ja" | "en")
 * @returns {Object} UI文字列オブジェクト
 */
export function getUiStrings(language = DEFAULT_LANGUAGE) {
  return UI_STRINGS[language] ?? UI_STRINGS[DEFAULT_LANGUAGE];
}

/**
 * 指定キーの翻訳文字列を取得
 * @param {string} key - 翻訳キー
 * @param {string} language - 言語コード
 * @returns {string} 翻訳文字列
 */
export function t(key, language = DEFAULT_LANGUAGE) {
  const strings = getUiStrings(language);
  return strings[key] ?? key;
}

/**
 * プレースホルダーを置換した翻訳文字列を取得
 * @param {string} key - 翻訳キー
 * @param {Object} replacements - 置換マップ { placeholder: value }
 * @param {string} language - 言語コード
 * @returns {string} 置換済み翻訳文字列
 */
export function tReplace(key, replacements = {}, language = DEFAULT_LANGUAGE) {
  let text = t(key, language);
  Object.entries(replacements).forEach(([placeholder, value]) => {
    text = text.replace(`{${placeholder}}`, value);
  });
  return text;
}

/**
 * ブラウザの言語設定から最適な言語を検出
 * @returns {string} 言語コード
 */
export function detectBrowserLanguage() {
  if (typeof navigator === "undefined") return DEFAULT_LANGUAGE;
  const browserLang = navigator.language?.split("-")[0];
  return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : DEFAULT_LANGUAGE;
}
