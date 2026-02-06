import { APP_INFO } from "../constants.js";

export const UI_STRINGS_JA = Object.freeze({
  // ドキュメント
  documentTitle: APP_INFO.DOCUMENT_TITLE,
  appIconAlt: "EPUBリーダー",

  // 空の状態
  emptyTitle: "本が選択されていません",
  emptyDescription: "画面中央をクリックしてメニューを表示",
  loadingText: "読み込み中...",

  // 言語選択
  languageLabelJa: "日",
  languageLabelEn: "EN",
  languageMenuLabel: "言語メニュー",
  languageOptionJa: "日本語",
  languageOptionEn: "英語",

  // 操作エリア
  areaMenuToggle: "メニュー開閉",
  areaPagePrev: "前のページ",
  areaPageNext: "次のページ",
  areaPagePrevSingle: "前のページ (1枚)",
  areaPageNextSingle: "次のページ (1枚)",

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
  addBookmark: "現在位置にしおりを追加",

  // 検索
  searchTitle: "テキスト検索",
  searchPlaceholder: "検索キーワードを入力...",
  searchButton: "検索",

  // 目次
  tocTitle: "目次",
  tocUntitled: "無題",

  // ファイル・ライブラリ
  openFileTitle: "ライブラリ",
  librarySectionTitle: "ライブラリ",
  historyTitle: "履歴",
  libraryViewGridLabel: "グリッド表示",
  libraryViewListLabel: "一覧表示",

  // 設定
  settingsTitle: "設定",
  settingsDisplayTitle: "表示設定",
  settingsDefaultDirectionLabel: "デフォルトの開き方向 (画像書庫等)",
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
  settingsLayoutDirectionRtl: "右開き (縦書き)",
  settingsLayoutDirectionLtr: "左開き (横書き)",

  // デフォルト設定
  settingsDefaultWritingModeLabel: "デフォルトの書字方向",
  settingsDefaultPageDirectionLabel: "デフォルトの開き方向",
  settingsDefaultImageViewModeLabel: "デフォルトの表示モード",

  // アカウント
  settingsAccountTitle: "アカウント",
  settingsDeviceTitle: "デバイス",
  deviceIdLabel: "デバイスID",
  deviceColorLabel: "デバイスカラー",
  deviceNameLabel: "デバイス名",
  syncHint: "※ 同期がうまく行かない場合は、広告ブロック機能をこのサイトで「無効」に設定してください。",
  settingsFirebaseTitle: "Firebase",
  googleLoginLabel: "Googleログイン",
  googleLogoutLabel: "ログオフ",
  googleLoginStatusSignedOut: "未ログイン",
  googleLoginStatusSignedIn: "ログイン済み: {user}",
  googleLoginStatusSignedInShort: "ログイン済み",
  googleLoginFailed: "ログインに失敗しました",
  settingsNotionTitle: "Notion連携",
  notionStatusLabel: "連携状況",
  notionStatusDisconnected: "未連携",
  notionStatusConnected: "連携済み",
  notionStatusPending: "連携待機中",
  notionStatusError: "連携エラー",
  notionWorkspaceLabel: "ワークスペース",
  notionParentPageLabel: "連携先ページ",
  notionDatabaseLabel: "読書ログDB",
  notionValueEmpty: "未設定",
  notionConnectButton: "Notionと連携する",
  notionDisconnectButton: "連携を解除",
  notionHelpText: "Notionのページを選択して読書ログDBを作成します。",
  notionConnectUnavailable: "Notion連携の設定がまだ完了していません。",
  notionDisconnectConfirm: "Notion連携を解除しますか？",
  notionDisconnected: "Notion連携を解除しました。",

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
  syncPromptMessageWithDevice: "他の端末（{device}）で、より新しい読書位置があります。",
  syncPromptLocalMessage: "この端末の状態が新しいようです。アップロードしますか？",
  syncPromptLocalMessageWithDevice: "この端末の状態が新しいようです（他の端末: {device}）。アップロードしますか？",
  syncPromptJump: "最新の読書位置は {page} ですがジャンプしますか？",
  syncPromptRemote: "ジャンプする（{time}）",
  syncPromptLocal: "キャンセル",
  syncPromptUpload: "この端末の状態をアップロード",

  // 候補書籍
  candidateModalTitle: "類似の書籍が見つかりました",
  candidateModalMessage: "クラウド上にこの書籍と思われるデータが見つかりました。\\n同期して続きから読みますか？",
  candidateUseLocal: "同期せず新規として扱う",
  closeButtonLabel: "閉じる",
  archiveWarningTitle: "RARの注意点",
  rarWarningNoStream: "RARはストリーミング読み込みできないため、全体をメモリ展開します。",
  rarWarningSolidFullExtract: "solid RARの場合、途中ページ抽出でも先頭から全展開が必要です。",

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
  readingDirectionLtrTitle: "左開き（左から右へ読む）",
  readingDirectionRtlTitle: "右開き（右から左へ読む）",
  zoomInTitle: "ズームする",
  zoomOutTitle: "ズームを解除",
  fontIncreaseLabel: "A+",
  fontDecreaseLabel: "A-",
  untitledBook: "無題",
  candidateIdLabel: "ID: {id}",

  // 画像の代替テキスト
  pageImageAlt: "ページ画像",
  modalImageAlt: "拡大画像",

  // 同期ステータス
  syncNeedsLoginStatus: "Googleログインが必要です",
  syncInProgress: "同期中...",
  syncStarting: "同期を開始しています...",
  syncCompleted: "同期完了",
  syncFailed: "同期に失敗しました",
  syncNowButton: "今すぐ同期",
  syncBlocked: "通信がブロックされました",
  syncBlockedDetail:
    "広告ブロック等の拡張機能をOFFにして再試行してください。\\n(Firebaseへの接続が遮断されています)",
  syncPermissionError: "権限エラー",
  syncPermissionDetail: "ログインし直してください。",

  // クラウド同期メッセージ
  cloudSyncAuthRequired: "ログインが必要です。設定からログインしてください。",
  cloudSyncNoEndpoint: "Workers のエンドポイントが設定されていません",
  cloudSyncNoIdToken: "ID トークンが取得できません",
  cloudSyncOneDriveAuthRequired: "OneDrive の認証が必要です",
  cloudSyncPCloudConfigRequired: "pCloud の設定が必要です",
  cloudSyncWorkersFailed: "Workers の同期に失敗しました ({status})",
  cloudSyncUnknownSource: "未対応の同期ソースです: {source}",
  cloudSyncEndpointSaveFailed: "同期に失敗しました ({status})",
  cloudSyncEndpointLoadFailed: "データ取得に失敗しました ({status})",
  cloudSyncOneDriveFileMissing: "OneDrive 上に同期ファイルが見つかりませんでした",
  cloudSyncOneDriveFetchFailed: "OneDrive からの取得に失敗しました ({status})",
  cloudSyncOneDriveCheckFailed: "OneDrive のファイル確認に失敗しました ({status})",
  cloudSyncOneDriveSearchFailed: "OneDrive のファイル検索に失敗しました ({status})",
  cloudSyncOneDriveUploadFailed: "OneDrive への保存に失敗しました ({status})",
  cloudSyncPCloudSaveFailed: "pCloud への保存に失敗しました ({status})",
  cloudSyncPCloudFetchFailed: "pCloud からの取得に失敗しました ({status})",

  // エラーメッセージ
  errorFileLoadFailed: "ファイルの読み込みに失敗しました。",
  errorFileName: "ファイル名",
  errorFileSize: "ファイルサイズ",
  errorDetail: "エラー詳細",
  errorNoImagesFound:
    "エラー: アーカイブ内に画像ファイルが見つかりませんでした。\\n\\n対応フォーマット: PNG, JPEG, GIF, WebP, BMP",
  errorImageLoadFailed:
    "エラー: 画像ファイルの変換に失敗しました。\\n\\nファイルが破損している可能性があります。",

  // 相対時間
  timeJustNow: "たった今",
  timeMinutesAgo: "{n}分前",
  timeHoursAgo: "{n}時間前",
  timeDaysAgo: "{n}日前",
  timeWeeksAgo: "{n}週間前",
  timeMonthsAgo: "{n}ヶ月前",
  timeYearsAgo: "{n}年前",

  // ライブラリ検索・削除
  library_search_placeholder: "タイトルまたは著者名で検索",
  library_delete_confirm: "この本を削除しますか？\n（クラウド上のデータは保持されます）",
  delete_button: "削除",
  undo_button: "やり直し",
  linkMismatchWarning: "選択された書籍は、ライブラリ上の書籍と内容が異なる可能性があります。\n\nこのまま紐付けますか？",
});
