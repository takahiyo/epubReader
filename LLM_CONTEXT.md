# LLM向けプロジェクト・コンテキスト 

本ドキュメントは **NotebookLM・外部LLM** がリポジトリを横断解析するための**単一ソース**です。
前半に要約、後半に**現行アプリの全ソース全文**を含みます。

## 結合に含まれるファイル一覧
- `index.html`
- `sw.js`
- `assets/constants.js`
- `assets/config.js`
- `assets/storage.js`
- `assets/cloudSync.js`
- `assets/app.js`
- `assets/reader.js`
- `assets/ui.js`
- `assets/style.css`
- `docs/CORE_PRINCIPLES.md`
- `docs/SSOT_GUIDE.md`
- `docs/MODULE_GUIDE.md`
- `docs/COMMENT_GUIDE.md`
- `docs/REFACTOR_GUIDE.md`
- `docs/CSS_GUIDE.md`

## 後半: 全ソースコード
以下、各ファイルは `### 相対パス` の見出しの直後にコードブロックで**全文**を記載する。

---

### index.html

```html
<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#2c3e50">
  <link rel="apple-touch-icon" href="assets/icon_BookReader_512.png">
  <link rel="icon" type="image/png" sizes="192x192" href="assets/icon_BookReader_192.png">
  <title>BookReader</title>
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="./assets/css/01-tokens.css" />
  <link rel="stylesheet" href="./assets/css/02-reset.css" />
  <link rel="stylesheet" href="./assets/css/03-base.css" />
  <link rel="stylesheet" href="./assets/css/04-reader.css" />
  <link rel="stylesheet" href="./assets/css/05-float-ui.css" />
  <link rel="stylesheet" href="./assets/css/06-reader-extras.css" />
  <link rel="stylesheet" href="./assets/css/07-menu.css" />
  <link rel="stylesheet" href="./assets/css/08-progress.css" />
  <link rel="stylesheet" href="./assets/css/09-bookmark.css" />
  <link rel="stylesheet" href="./assets/css/10-modal.css" />
  <link rel="stylesheet" href="./assets/css/11-library.css" />
  <link rel="stylesheet" href="./assets/css/12-history.css" />
  <link rel="stylesheet" href="./assets/css/13-search.css" />
  <link rel="stylesheet" href="./assets/css/14-settings.css" />
  <link rel="stylesheet" href="./assets/css/15-responsive.css" />
  <link rel="stylesheet" href="./assets/css/16-candidate.css" />
  <link rel="stylesheet" href="./assets/css/17-loading.css" />
  <link rel="stylesheet" href="./assets/css/18-float-lang.css" />
  <link rel="stylesheet" href="./assets/css/19-zoom.css" />
  <link rel="stylesheet" href="./assets/css/20-drag-drop.css" />
  <!-- <script src="https://accounts.google.com/gsi/client" async defer></script> -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"></script>
  <!-- ライブラリの読み込み（モジュールより前に、同期的に） -->
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js" crossorigin="anonymous"></script>
  <!-- JSZipとePubがグローバルに設定されていることを確認 -->
  <script>
    // EPUB.jsが必要とするグローバル変数を確実に設定
    (function () {
      // JSZipの確認と設定
      if (typeof JSZip !== 'undefined') {
        window.JSZip = JSZip;
        console.log('[Init] JSZip loaded and set to window.JSZip');
      } else {
        console.error('[Init] JSZip NOT loaded from CDN!');
      }

      // ePubの確認と設定
      if (typeof ePub !== 'undefined') {
        window.ePub = ePub;
        console.log('[Init] ePub loaded and set to window.ePub');
      } else {
        console.error('[Init] ePub NOT loaded from CDN!');
      }

      // デバッグ情報
      console.log('[Init] Library status:', {
        JSZip: typeof JSZip !== 'undefined' ? 'loaded' : 'missing',
        'window.JSZip': typeof window.JSZip !== 'undefined' ? 'available' : 'missing',
        ePub: typeof ePub !== 'undefined' ? 'loaded' : 'missing',
        'window.ePub': typeof window.ePub !== 'undefined' ? 'available' : 'missing'
      });
    })();
  </script>
</head>

<body>
  <!-- 全画面リーダー -->
  <div id="fullscreenReader" class="fullscreen-reader">
    <!-- EPUB ビューア -->
    <div id="viewer" class="viewer"></div>

    <!-- Web小説ビューア -->
    <div id="webNovelViewer" class="viewer hidden"></div>

    <!-- クリック検知用オーバーレイ -->
    <div id="clickOverlay" class="click-overlay"></div>

    <!-- 画像ビューア -->
    <div id="imageViewer" class="image-viewer hidden">
      <img id="pageImage" alt="" />
    </div>

    <!-- アーカイブ警告バナー -->
    <div id="archiveWarningBanner" class="archive-warning hidden" role="status" aria-live="polite">
      <div class="archive-warning-body">
        <p id="archiveWarningTitle" class="archive-warning-title"></p>
        <ul id="archiveWarningList" class="archive-warning-list"></ul>
      </div>
      <button id="archiveWarningClose" class="archive-warning-close" type="button"></button>
    </div>

    <!-- 空の状態（本が未選択） -->
    <div id="emptyState" class="empty-state">
      <img id="emptyStateIcon" src="assets/bookreader.png" class="empty-book-icon" alt="" />
      <h2></h2>
      <p></p>
      <div id="cloudEmptyState" class="cloud-empty hidden">
        <p id="cloudEmptyTitle" class="cloud-empty-title"></p>
        <p id="cloudEmptyMeta" class="cloud-empty-meta"></p>
        <button id="cloudAttachButton" class="secondary-btn" type="button"></button>
      </div>
    </div>
  </div>

  <!-- ファイル選択（非表示） -->
  <input type="file" id="fileInput" accept=".epub,.cbz,.zip,.rar,.cbr" class="file-input-hidden" />

  <!-- 左サイドメニューバックドロップ -->
  <div id="leftMenuBackdrop" class="menu-backdrop"></div>

  <!-- 左サイドメニュー -->
  <div id="leftMenu" class="left-menu">
    <div class="menu-header">
      <img id="menuTitleImage" src="assets/bookreader.png" alt="" class="menu-title-image" />
    </div>

    <nav class="menu-nav">
      <button id="menuOpen" class="menu-item">
        <span class="menu-icon"></span>
        <span></span>
      </button>
      <button id="menuLibrary" class="menu-item">
        <span class="menu-icon"></span>
        <span></span>
      </button>
      <button id="menuSearch" class="menu-item">
        <span class="menu-icon"></span>
        <span></span>
      </button>
      <button id="menuWebNovel" class="menu-item">
        <span class="menu-icon">🌐📝</span>
        <span></span>
      </button>
      <button id="menuBookmarks" class="menu-item">
        <span class="menu-icon"></span>
        <span></span>
      </button>
      <button id="menuHistory" class="menu-item">
        <span class="menu-icon"></span>
        <span></span>
      </button>
      <button id="menuSettings" class="menu-item">
        <span class="menu-icon"></span>
        <span></span>
      </button>
    </nav>

    <div class="menu-language">
      <button id="langJa" class="lang-btn" type="button"></button>
      <button id="langEn" class="lang-btn" type="button"></button>
    </div>

    <div id="tocSection" class="toc-section hidden">
      <h3 id="tocSectionTitle" class="toc-title"></h3>
      <ul id="tocList" class="toc-list"></ul>
    </div>

  </div>

  <!-- 進捗バーバックドロップ -->
  <div id="progressBarBackdrop" class="menu-backdrop"></div>

  <!-- 進捗バーパネル -->
  <div id="progressBarPanel" class="progress-bar-panel">
    <div class="progress-container">
      <div class="progress-bar-wrapper">
        <button id="progressPrev" class="progress-arrow hidden">◀</button>
        <div class="progress-track">
          <div id="progressFill" class="progress-fill"></div>
          <div id="progressThumb" class="progress-thumb"></div>
          <!-- しおりマーカーはJSで動的に追加 -->
        </div>
        <button id="progressNext" class="progress-arrow hidden">▶</button>
      </div>
      <div class="progress-info">
        <div class="page-numbers">
          <input id="currentPageInput" type="number" class="current-page-input" value="1" min="1" />
          <span>/</span>
          <span id="totalPages" class="total-pages">0</span>
        </div>

      </div>
    </div>
  </div>

  <!-- しおりメニュー（モーダル） -->
  <div id="bookmarkMenu" class="bookmark-menu">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="bookmarkMenuTitle"></h3>
        <button id="addBookmarkBtn" class="add-bookmark-btn"></button>
        <button id="closeBookmarkMenu" class="close-btn"></button>
      </div>
      <div class="modal-body">
        <ul id="bookmarkList" class="bookmark-list"></ul>
      </div>
    </div>
  </div>

  <!-- テキスト検索モーダル（EPUB用） -->
  <div id="searchModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-medium">
      <div class="modal-header">
        <h3 id="searchModalTitle"></h3>
        <button id="closeSearchModal" class="close-btn"></button>
      </div>
      <div class="modal-body">
        <div class="search-input-container">
          <input type="text" id="searchInput" class="search-input" placeholder="" />
          <button id="searchBtn" class="search-btn"></button>
        </div>
        <div id="searchResults" class="search-results"></div>
      </div>
    </div>
  </div>

  <!-- 目次モーダル -->
  <div id="tocModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-medium">
      <div class="modal-header">
        <h3 id="tocModalTitle"></h3>
        <button id="closeTocModal" class="close-btn"></button>
      </div>
      <div class="modal-body">
        <ul id="tocModalList" class="toc-list"></ul>
      </div>
    </div>
  </div>

  <!-- 候補書籍選択モーダル -->
  <div id="candidateModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="candidateModalTitle"></h2>
        <button id="closeCandidateModal" class="close-btn" aria-label=""></button>
      </div>
      <div class="modal-body">
        <p id="candidateModalMessage"></p>
        <div id="candidateList" class="candidate-list">
          <!-- 候補リストがここに挿入されます -->
        </div>
      </div>
      <div class="modal-footer">
        <button id="candidateUseLocal" class="sync-action-btn" style="margin-top: 1rem;"></button>
      </div>
    </div>
  </div>

  <!-- 同期モーダル -->
  <div id="syncModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-medium">
      <div class="modal-header">
        <h3 id="syncModalTitle"></h3>
      </div>
      <div class="modal-body">
        <p id="syncModalMessage" class="sync-message"></p>
        <div class="sync-actions">
          <button id="syncUseRemote" class="sync-action-btn primary" type="button"></button>
          <button id="syncUseLocal" class="sync-action-btn" type="button"></button>
        </div>
      </div>
    </div>
  </div>

  <!-- ファイル選択モーダル -->
  <div id="openFileModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3 id="openFileModalTitle"></h3>
        <button id="closeFileModal" class="close-btn"></button>
      </div>
      <div class="modal-body">
        <div id="librarySection" class="library-section">
          <div class="library-controls">
            <h4 id="librarySectionTitle"></h4>
            <input type="text" id="library-search-input" class="library-search-input" placeholder="" />
            <div class="library-view-toggle">
              <button id="libraryViewGrid" class="library-view-btn" type="button" aria-label="">🔲</button>
              <button id="libraryViewList" class="library-view-btn" type="button" aria-label="">📄</button>
            </div>
          </div>
          <div id="libraryGrid" class="library-grid"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Web小説モーダル -->
  <div id="webNovelSearchModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3 id="webNovelSearchModalTitle">Web小説を探す</h3>
        <button id="closeWebNovelSearchModal" class="close-btn"></button>
      </div>
      <div class="modal-body">
        <div class="search-input-container">
          <input type="text" id="webNovelSearchInput" class="search-input" placeholder="作品名や作者名で検索（なろう・カクヨム）" />
          <button id="webNovelSearchBtn" class="search-btn">検索</button>
        </div>
        <div class="search-filters"
          style="margin: 0.5rem 0 1rem 0; display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.9rem; color: var(--text-secondary); align-items: center;">
          <label style="cursor:pointer; display:flex; align-items:center; gap:0.3rem;"><input type="checkbox"
              id="webNovelSourceNarou" checked> 小説家になろう</label>
          <label style="cursor:pointer; display:flex; align-items:center; gap:0.3rem;"><input type="checkbox"
              id="webNovelSourceKakuyomu" checked> カクヨム</label>
          <div style="display:flex; align-items:center; gap:0.3rem; margin-left: auto;">
            <label for="webNovelSort">ソート:</label>
            <select id="webNovelSort"
              style="background:var(--bg-panel); color:var(--text-primary); border:1px solid var(--border); padding:2px 5px; border-radius:4px;">
              <option value="rating">評価順</option>
              <option value="title">五十音順</option>
              <option value="site">サイト別</option>
            </select>
          </div>
        </div>
        <div id="webNovelSearchResults" class="library-grid"></div>
      </div>
    </div>
  </div>

  <!-- Web小説目次モーダル -->
  <div id="webNovelTocModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-large">
      <div class="modal-header">
        <button id="backToWebNovelSearch" class="back-btn"
          style="margin-right: 0.5rem; border:none; background:none; cursor:pointer; font-size:1.2rem; color:var(--text-primary);">←</button>
        <h3 id="webNovelTocModalTitle">目次</h3>
        <button id="closeWebNovelTocModal" class="close-btn"></button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 1rem;">
          <h4 id="webNovelTocAuthor" style="font-weight:normal; color:var(--text-secondary);"></h4>
          <button id="webNovelAddToLibraryBtn" class="primary-btn" style="margin-top:0.5rem;">ライブラリに追加</button>
        </div>
        <ul id="webNovelTocList" class="history-list"></ul>
      </div>
    </div>
  </div>

  <!-- 履歴モーダル -->
  <div id="historyModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-medium">
      <div class="modal-header">
        <h3 id="historyModalTitle"></h3>
        <button id="closeHistoryModal" class="close-btn"></button>
      </div>
      <div class="modal-body">
        <ul id="historyList" class="history-list"></ul>
      </div>
    </div>
  </div>

  <!-- 設定モーダル -->
  <div id="settingsModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3 id="settingsModalTitle"></h3>
        <button id="closeSettingsModal" class="close-btn"></button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <h4 id="settingsDisplayTitle"></h4>
          <div class="setting-item">
            <label for="progressDisplayMode" id="progressDisplayModeLabel"></label>
            <select id="progressDisplayMode">
              <option value="page"></option>
              <option value="percentage"></option>
            </select>
          </div>
          <div class="setting-item">
            <label for="settingsEpubViewMode" id="settingsEpubViewModeLabel"></label>
            <select id="settingsEpubViewMode">
              <option value="paginated"></option>
              <option value="scroll"></option>
            </select>
          </div>
          <div class="setting-item">
            <label for="settingsDefaultWritingMode" id="settingsDefaultWritingModeLabel"></label>
            <select id="settingsDefaultWritingMode">
              <option value="horizontal-tb"></option>
              <option value="vertical-rl"></option>
            </select>
          </div>
          <div class="setting-item">
            <label for="settingsDefaultPageDirection" id="settingsDefaultPageDirectionLabel"></label>
            <select id="settingsDefaultPageDirection">
              <option value="rtl"></option>
              <option value="ltr"></option>
            </select>
          </div>
          <div class="setting-item">
            <label for="settingsDefaultImageViewMode" id="settingsDefaultImageViewModeLabel"></label>
            <select id="settingsDefaultImageViewMode">
              <option value="single"></option>
              <option value="spread"></option>
            </select>
          </div>
          <div class="setting-item">
            <label for="settingsOneBookmarkPerBook" id="settingsOneBookmarkPerBookLabel"></label>
            <input type="checkbox" id="settingsOneBookmarkPerBook" />
          </div>
        </div>

        <div class="settings-section">
          <h4 id="settingsDeviceTitle"></h4>
          <div class="setting-item">
            <label for="deviceId" id="deviceIdLabel"></label>
            <input id="deviceId" type="text" readonly />
          </div>
          <div class="setting-item">
            <label for="deviceColor" id="deviceColorLabel"></label>
            <input id="deviceColor" type="text" readonly />
          </div>
          <div class="setting-item">
            <label for="deviceName" id="deviceNameLabel"></label>
            <input id="deviceName" type="text" readonly />
          </div>
          <!-- PWA Install Button -->
          <div class="setting-item hidden" id="installContainer">
            <button id="installButton" class="secondary-btn" type="button"></button>
          </div>
        </div>

        <div class="settings-section">
          <h4 id="settingsAccountTitle"></h4>
          <div class="setting-item">
            <div class="setting-actions">
              <button id="googleLoginButton" class="secondary-btn" type="button"></button>
              <button id="manualSyncButton" class="secondary-btn" type="button" style="margin-left: 10px;"></button>
            </div>
            <p id="userInfo" class="setting-hint"></p>
            <p id="syncStatus" class="setting-hint" style="margin-top: 5px;"></p>
            <p id="syncHint" class="setting-hint" style="margin-top: 10px; color: var(--muted); font-size: 0.85rem;">
            </p>
          </div>
        </div>

        <div class="settings-section">
          <h4 id="settingsNotionTitle"></h4>
          <div class="setting-item">
            <label id="notionStatusLabel" for="notionStatus"></label>
            <p id="notionStatus" class="setting-hint"></p>
          </div>
          <div class="setting-item">
            <label id="notionOauthUrlLabel" for="notionOauthUrl"></label>
            <input id="notionOauthUrl" type="text" />
          </div>
          <div class="setting-item">
            <label id="notionWorkspaceLabel" for="notionWorkspace"></label>
            <input id="notionWorkspace" type="text" readonly />
          </div>
          <div class="setting-item">
            <label id="notionParentPageLabel" for="notionParentPage"></label>
            <input id="notionParentPage" type="text" readonly />
          </div>
          <div class="setting-item">
            <label id="notionDatabaseLabel" for="notionDatabase"></label>
            <input id="notionDatabase" type="text" readonly />
          </div>
          <div class="setting-item">
            <div class="setting-actions">
              <button id="notionConnectButton" class="secondary-btn" type="button"></button>
              <button id="notionDisconnectButton" class="secondary-btn" type="button"></button>
            </div>
            <p id="notionHelpText" class="setting-hint"></p>
          </div>
        </div>



      </div>
    </div>
  </div>

  <!-- 画像拡大モーダル -->
  <div id="imageModal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <button id="closeImageModal" class="close-btn"></button>
      <img id="modalImage" alt="" />
    </div>
  </div>

  <!-- フロートオーバーレイ -->
  <div id="floatOverlay">
    <div class="float-backdrop"></div>

    <div class="float-title">
      <img id="floatTitleImage" src="assets/bookreader.png" alt="" />
    </div>

    <div class="float-buttons">
      <div class="float-main-menu">
        <button id="openToc" type="button"></button>
        <button id="floatOpen" type="button"></button>

        <button id="floatLibrary" type="button"></button>
        <button id="floatSearch" type="button"></button>
        <button id="floatWebNovel" type="button">🌐📝</button>
        <button id="floatBookmarks" type="button"></button>
        <button id="floatHistory" type="button"></button>
      </div>

      <button id="floatSettings" class="float-settings" type="button"></button>

      <!-- 右上 -->
      <div class="float-top-right">
        <button id="toggleReadingDirectionEpub" class="hidden" type="button"></button>
        <button id="toggleReadingDirectionImage" class="hidden" type="button"></button>
        <button id="toggleWritingMode" type="button"></button>
        <button id="toggleSpreadMode" class="hidden" type="button"></button>
      </div>

      <!-- 右下 -->
      <div class="font-buttons">
        <button id="fontPlus" type="button"></button>
        <button id="fontMinus" type="button"></button>
      </div>

      <!-- 右中央 -->
      <button id="toggleTheme" type="button"></button>
      <button id="toggleZoom" class="hidden" type="button"></button>
      <button id="toggleFullscreen" type="button"></button>

      <!-- 【追加】ズームスライダー用コンテナ -->
      <div id="zoomSliderContainer" class="zoom-slider-container">
        <input type="range" id="zoomSlider" min="1.0" max="5.0" step="0.1" value="1.0">
      </div>

      <!-- 左下 (言語メニュー) -->
      <button id="openLangMenu" class="float-lang-toggle" type="button"></button>
    </div>

    <div id="floatProgress">
      <div id="floatProgressPercent">0%</div>
      <div id="floatProgressTrack" class="progress-track">
        <div id="floatProgressMarks"></div>
        <div id="floatProgressFill"></div>
        <div id="floatProgressThumb"></div>
      </div>
    </div>
  </div>

  <!-- 言語選択メニュー（フロート用・地球儀ボタン横） -->
  <div id="floatLangMenu" class="float-lang-menu hidden">
    <button id="floatLangJa" class="lang-option-btn">
      <img src="assets/Flag_Japan.svg" alt="" />
    </button>
    <button id="floatLangEn" class="lang-option-btn">
      <img src="assets/Flag_America.svg" alt="" />
    </button>
  </div>

  <!-- ローディングオーバーレイ -->
  <div id="loadingOverlay" class="loading-overlay">
    <div id="lottie-loader" class="loading-animation"></div>
    <p id="loadingText" class="loading-text"></p>
  </div>

  <!-- D&Dオーバーレイ -->
  <div id="dropOverlay" class="drop-overlay">
    <div class="drop-message">
      <span class="drop-icon">📂</span>
      <p id="dropText"></p>
    </div>
  </div>

  <div id="modalOverlay"></div>

  <!-- config.js は ES module として constants.js を参照 -->
  <script type="module" src="./assets/config.js"></script>
  <!-- auth.js は app.js から import するため、ここでは直接読み込まない -->
  <script type="module" src="./assets/app.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('Service Worker registered'))
          .catch(err => console.error('Service Worker registration failed', err));
      });
    }
  </script>
</body>

</html>
```

### sw.js

```javascript
/**
 * sw.js - Service Worker
 *
 * PWA オフラインサポート用 Service Worker
 *
 * 注意: Service Worker は ES Modules をサポートしないため、
 * constants.js から直接 import できません。
 * 設定変更時は constants.js と同期してください。
 *
 * SSOT 参照元: assets/constants.js
 * - PWA_CONFIG.CACHE_NAME
 * - CDN_URLS.*
 * - SW_CACHE_ASSETS
 *
 * 生成物: assets/sw-cache-config.json
 */

const CONFIG_URL = "./assets/sw-cache-config.json";
let configPromise;

const loadConfig = () => {
    if (!configPromise) {
        configPromise = fetch(CONFIG_URL, { cache: "no-store" }).then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to load ${CONFIG_URL}`);
            }
            return response.json();
        });
    }
    return configPromise;
};

// インストール時にファイルをキャッシュ（HTTPキャッシュをバイパスして最新版を取得）
self.addEventListener('install', (event) => {
    event.waitUntil(
        loadConfig().then((config) =>
            caches.open(config.cacheName).then((cache) =>
                Promise.all(
                    config.assets.map((url) =>
                        fetch(url, { cache: "no-cache" })
                            .then((response) => cache.put(url, response))
                            .catch((err) => {
                                console.warn(`[SW] Failed to cache: ${url}`, err);
                            })
                    )
                )
            )
        )
    );
    self.skipWaiting();
});

// 古いキャッシュを削除 + 即座にページを制御
self.addEventListener('activate', (event) => {
    event.waitUntil(
        loadConfig().then((config) =>
            caches.keys().then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== config.cacheName)
                        .map((key) => caches.delete(key))
                )
            )
        ).then(() => self.clients.claim())
    );
});

// ネットワーク優先（ローカルアセットはHTTPキャッシュをバイパス）
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;
    const isLocalAsset = isLocal && /\.(js|css|json|html)$/.test(url.pathname);
    const isNavigation = event.request.mode === 'navigate';

    if (isLocalAsset || isNavigation) {
        // ローカルアセット / ページナビゲーション: HTTPキャッシュバイパス + SW キャッシュフォールバック
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .catch(() => caches.match(event.request))
        );
    } else {
        // CDN等の外部リソース / 画像等: 従来のネットワーク優先
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
    }
});

```

### assets/constants.js

```javascript
/**
 * constants.js - Single Source of Truth (SSOT)
 *
 * すべての設定値・定数をカテゴリ別に分割し、ここで再エクスポートします。
 * 既存の import 互換性を保つためのバレルファイルです。
 */

export * from "./constants/app-info.js";
export * from "./constants/runtime-config.js";
export * from "./constants/storage.js";
export * from "./constants/sync.js";
export * from "./constants/progress.js";
export * from "./constants/ui.js";
export * from "./constants/reader.js";
export * from "./constants/interaction.js";
export * from "./constants/assets.js";
export * from "./constants/errors.js";
export * from "./constants/formats.js";
export * from "./constants/pwa.js";
export * from "./constants/timing.js";
export * from "./constants/global.js";
export * from "./constants/notion.js";

```

### assets/config.js

```javascript
/**
 * config.js - グローバル設定公開
 * 
 * constants.js から設定を読み込み、window オブジェクトに公開します。
 * 非モジュール環境（Service Worker等）との互換性を維持します。
 */

// constants.js がモジュールとして読み込まれる前に実行される可能性があるため、
// 直接値を参照せず、constants.js で定義された値と同期させる
import { GOOGLE_AUTH_CONFIG, WORKERS_CONFIG, MEMORY_STRATEGY } from "./constants.js";

// 既存の設定を保持しつつ、SSOT から値を設定
window.EPUB_READER_CONFIG = window.EPUB_READER_CONFIG || {};
window.EPUB_READER_CONFIG.googleClientId =
  window.EPUB_READER_CONFIG.googleClientId || GOOGLE_AUTH_CONFIG.CLIENT_ID;
window.EPUB_READER_CONFIG.MEMORY_STRATEGY =
  window.EPUB_READER_CONFIG.MEMORY_STRATEGY || MEMORY_STRATEGY;

// アプリ共通設定（SSOT参照）
// 既存の window.APP_CONFIG を上書きせずマージし、外部注入設定を保持する。
window.APP_CONFIG = {
  ...(window.APP_CONFIG || {}),
  D1_SYNC_ENDPOINT:
    window.APP_CONFIG?.D1_SYNC_ENDPOINT ||
    window.APP_CONFIG?.FIREBASE_SYNC_ENDPOINT ||
    WORKERS_CONFIG.SYNC_ENDPOINT,
  // 互換性維持
  FIREBASE_SYNC_ENDPOINT:
    window.APP_CONFIG?.D1_SYNC_ENDPOINT ||
    window.APP_CONFIG?.FIREBASE_SYNC_ENDPOINT ||
    WORKERS_CONFIG.SYNC_ENDPOINT,
  API_BASE_URL:
    window.APP_CONFIG?.API_BASE_URL ||
    window.APP_CONFIG?.D1_SYNC_ENDPOINT ||
    window.APP_CONFIG?.FIREBASE_SYNC_ENDPOINT ||
    WORKERS_CONFIG.SYNC_ENDPOINT,
};

```

### assets/storage.js

```javascript
/**
 * storage.js - ローカルストレージ管理
 * 
 * 読書データの永続化とデータマージ機能を提供します。
 * 設定値は constants.js (SSOT) から参照します。
 */

import {
  STORAGE_CONFIG,
  STORAGE_SOURCE_ALIASES,
  STORAGE_SOURCE_DEFAULT,
  DEVICE_COLOR_PALETTE,
  DEFAULT_SETTINGS,
  DEFAULT_DATA_SHAPE,
  NOTION_DEFAULT_SETTINGS,
  NOTION_INTEGRATION_STATUS,
  BOOK_TYPES,
} from "./constants.js";

const STORAGE_KEY = STORAGE_CONFIG.KEY;
const MAX_HISTORY_ENTRIES = STORAGE_CONFIG.MAX_HISTORY_ENTRIES;
const MAX_BOOKMARKS_PER_BOOK = STORAGE_CONFIG.MAX_BOOKMARKS_PER_BOOK;

const normalizeStorageSource = (source) => {
  if (!source) return null;
  return STORAGE_SOURCE_ALIASES[source] ?? source;
};

const generateDeviceId = () => {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2);
  const timePart = Date.now().toString(36);
  return `device-${timePart}-${randomPart}`;
};

/**
 * UserAgent を解析して OS/ブラウザ名を返す
 * @returns {string} "OS名 / ブラウザ名" 形式の文字列
 */
const getDeviceInfo = () => {
  if (typeof navigator === "undefined" || !navigator.userAgent) {
    return "Unknown";
  }

  const ua = navigator.userAgent;

  // OS判定
  let os = "Unknown OS";
  if (/Windows NT 10/.test(ua)) {
    os = "Windows 10/11";
  } else if (/Windows NT 6\.3/.test(ua)) {
    os = "Windows 8.1";
  } else if (/Windows NT 6\.2/.test(ua)) {
    os = "Windows 8";
  } else if (/Windows NT 6\.1/.test(ua)) {
    os = "Windows 7";
  } else if (/Windows/.test(ua)) {
    os = "Windows";
  } else if (/Mac OS X/.test(ua)) {
    os = "macOS";
  } else if (/iPhone|iPad|iPod/.test(ua)) {
    os = "iOS";
  } else if (/Android/.test(ua)) {
    os = "Android";
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  } else if (/CrOS/.test(ua)) {
    os = "Chrome OS";
  }

  // ブラウザ判定（順序重要: より特定的なものを先に）
  let browser = "Unknown Browser";
  if (/Edg\//.test(ua)) {
    browser = "Edge";
  } else if (/OPR\/|Opera/.test(ua)) {
    browser = "Opera";
  } else if (/Vivaldi/.test(ua)) {
    browser = "Vivaldi";
  } else if (/Brave/.test(ua)) {
    browser = "Brave";
  } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    browser = "Chrome";
  } else if (/Firefox\//.test(ua)) {
    browser = "Firefox";
  } else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) {
    browser = "Safari";
  } else if (/MSIE|Trident/.test(ua)) {
    browser = "Internet Explorer";
  }

  return `${os} / ${browser}`;
};

const selectDeviceColor = (deviceId) => {
  if (!deviceId) return DEVICE_COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < deviceId.length; i += 1) {
    hash = (hash * 31 + deviceId.charCodeAt(i)) % 1000000007;
  }
  const index = Math.abs(hash) % DEVICE_COLOR_PALETTE.length;
  return DEVICE_COLOR_PALETTE[index];
};

const ensureDeviceSettings = (settings) => {
  let updated = false;
  let deviceId = settings.deviceId;
  if (!deviceId) {
    deviceId = generateDeviceId();
    updated = true;
  }
  let deviceColor = settings.deviceColor;
  if (!deviceColor) {
    deviceColor = selectDeviceColor(deviceId);
    updated = true;
  }
  return {
    updated,
    settings: {
      ...settings,
      deviceId,
      deviceColor,
    },
  };
};

const getBookmarkUpdatedAt = (bookmark) => bookmark?.updatedAt ?? bookmark?.createdAt ?? 0;

const getBookmarkType = (bookmark) => bookmark?.bookType ?? bookmark?.type ?? null;

const getBookmarkKey = (bookmark) => {
  const bookmarkType = getBookmarkType(bookmark);
  const cfi = bookmark?.cfi;
  if (bookmarkType === BOOK_TYPES.EPUB && cfi) return `cfi:${cfi}`;

  const location = bookmark?.location;
  if (typeof location === "number") return `location:${location}`;

  const index = bookmark?.index;
  if (typeof index === "number") return `index:${index}`;

  if (cfi) return `cfi:${cfi}`;
  return null;
};

const pickNewerBookmark = (existing, incoming) => {
  if (!existing) return incoming;
  const incomingUpdatedAt = getBookmarkUpdatedAt(incoming);
  const existingUpdatedAt = getBookmarkUpdatedAt(existing);
  if (incomingUpdatedAt > existingUpdatedAt) return incoming;
  if (incomingUpdatedAt < existingUpdatedAt) return existing;
  if (!existing.label && incoming?.label) return incoming;
  return existing;
};

// デフォルトデータ構造（設定はSSOTから参照）
const defaultData = {
  ...DEFAULT_DATA_SHAPE,
  settings: { ...DEFAULT_SETTINGS },
};

// デバイス情報取得関数をエクスポート
export { getDeviceInfo };

export class StorageService {
  constructor(key = STORAGE_KEY) {
    this.key = key;
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { ...defaultData };
      const parsed = JSON.parse(raw);
      const settings = {
        ...defaultData.settings,
        ...(parsed.settings ?? {}),
      };
      const deviceNormalized = ensureDeviceSettings(settings);
      const normalizedSettings = deviceNormalized.settings;

      const normalizedSource = normalizeStorageSource(settings.source) ?? STORAGE_SOURCE_DEFAULT;
      const normalizedDestination = normalizeStorageSource(settings.saveDestination);
      const notionIntegration = {
        ...NOTION_DEFAULT_SETTINGS,
        ...(settings.notionIntegration ?? {}),
      };
      const normalizedNotionStatus =
        Object.values(NOTION_INTEGRATION_STATUS).includes(notionIntegration.status)
          ? notionIntegration.status
          : NOTION_DEFAULT_SETTINGS.status;
      const data = {
        ...defaultData,
        ...parsed,
        library: parsed.library ?? {},
        bookmarks: parsed.bookmarks ?? {},
        progress: parsed.progress ?? {},
        history: parsed.history ?? [],
        cloudIndex: parsed.cloudIndex ?? {},
        cloudStates: parsed.cloudStates ?? {},
        cloudIndexUpdatedAt: parsed.cloudIndexUpdatedAt ?? null,
        bookLinkMap: parsed.bookLinkMap ?? {},
        settings: {
          ...normalizedSettings,
          syncEnabled: normalizedSettings.syncEnabled ?? defaultData.settings.syncEnabled,
          lastSyncAt: normalizedSettings.lastSyncAt ?? defaultData.settings.lastSyncAt,
          lastIndexSyncAt: normalizedSettings.lastIndexSyncAt ?? defaultData.settings.lastIndexSyncAt, // SSOT: D1インデックス同期時刻
          apiKey: normalizedSettings.apiKey || defaultData.settings.apiKey,
          endpoint: normalizedSettings.endpoint || defaultData.settings.endpoint,
          d1Endpoint:
            normalizedSettings.d1Endpoint ||
            normalizedSettings.firebaseEndpoint ||
            normalizedSettings.firebaseSyncEndpoint ||
            defaultData.settings.d1Endpoint,
          source: normalizedSource || defaultData.settings.source,
          saveDestination:
            normalizedDestination || normalizedSource || defaultData.settings.saveDestination,
          onedriveClientId: normalizedSettings.onedriveClientId || defaultData.settings.onedriveClientId,
          onedriveRedirectUri: normalizedSettings.onedriveRedirectUri || defaultData.settings.onedriveRedirectUri,
          onedriveFilePath: normalizedSettings.onedriveFilePath || defaultData.settings.onedriveFilePath,
          onedriveFileId: normalizedSettings.onedriveFileId || defaultData.settings.onedriveFileId,
          onedriveToken: normalizedSettings.onedriveToken || defaultData.settings.onedriveToken,
          notionIntegration: {
            ...NOTION_DEFAULT_SETTINGS,
            ...notionIntegration,
            status: normalizedNotionStatus,
          },

          autoSyncEnabled: normalizedSettings.autoSyncEnabled ?? defaultData.settings.autoSyncEnabled,
        },
      };
      if (deviceNormalized.updated) {
        localStorage.setItem(this.key, JSON.stringify(data));
      }
      return data;
    } catch (error) {
      console.error("ストレージの読み込みに失敗しました", error);
      return { ...defaultData };
    }
  }

  save() {
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }

  upsertBook(book) {
    const existing = this.data.library[book.id] ?? {};
    this.data.library[book.id] = {
      ...existing,
      ...book,
      contentHash: book.contentHash ?? existing.contentHash,
      updatedAt: Date.now(),
    };
    this.addHistory(book.id);
    this.save();
  }

  addHistory(bookId) {
    this.data.history = [
      { bookId, openedAt: Date.now() },
      ...this.data.history.filter((item) => item.bookId !== bookId),
    ].slice(0, MAX_HISTORY_ENTRIES);
    this.save();
  }

  addBookmark(bookId, bookmark) {
    let list = this.data.bookmarks[bookId] ?? [];
    const settings = this.getSettings();

    if (settings.oneBookmarkPerBook) {
      // 1冊につき1しおり設定が有効な場合は既存をクリア
      list = [];
    }

    const incomingKey = getBookmarkKey(bookmark);
    let updated = false;

    // 同一箇所のしおりがあるか確認して更新
    let newList = list.map((existing) => {
      const existingKey = getBookmarkKey(existing);
      if (incomingKey && existingKey === incomingKey) {
        updated = true;
        return pickNewerBookmark(existing, bookmark);
      }
      return existing;
    });

    if (!updated) {
      // 新規追加
      newList = [bookmark, ...newList];
    }

    this.data.bookmarks[bookId] = newList
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, MAX_BOOKMARKS_PER_BOOK);
    this.save();
  }

  setBookmarks(bookId, bookmarks) {
    this.data.bookmarks[bookId] = Array.isArray(bookmarks) ? bookmarks : [];
    this.save();
  }

  mergeBookmarks(bookId, incomingList) {
    if (!Array.isArray(incomingList)) return;

    const currentList = this.data.bookmarks[bookId] ?? [];
    const map = new Map();

    // 既存と新規をマージ（位置キーで重複排除、updatedAt を最優先で採用）
    [...currentList, ...incomingList].forEach((bookmark) => {
      const key = getBookmarkKey(bookmark);
      if (!key) return;
      const existing = map.get(key);
      map.set(key, pickNewerBookmark(existing, bookmark));
    });

    const mergedList = Array.from(map.values())
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, MAX_BOOKMARKS_PER_BOOK);

    console.log(`[Storage] Merged bookmarks for ${bookId}: ${currentList.length} -> ${mergedList.length}`);
    this.data.bookmarks[bookId] = mergedList;
    this.save();
  }

  getBookmarks(bookId) {
    return this.data.bookmarks[bookId] ?? [];
  }

  setProgress(bookId, progress) {
    this.data.progress[bookId] = {
      ...(this.data.progress[bookId] ?? {}),
      ...progress,
      // 指定がなければ現在時刻を使用、あればそれを尊重（クラウド同期用）
      updatedAt: progress.updatedAt ?? Date.now(),
    };
    this.save();
  }

  getProgress(bookId) {
    return this.data.progress[bookId];
  }

  removeBookmark(bookId, createdAt) {
    const list = this.data.bookmarks[bookId] ?? [];
    this.data.bookmarks[bookId] = list.filter((b) => b.createdAt !== createdAt);
    this.save();
  }

  removeHistory(bookId) {
    this.data.history = this.data.history.filter((item) => item.bookId !== bookId);
    this.save();
  }

  /**
   * ライブラリから書籍を削除（メタデータ、進捗、しおり、履歴も削除）
   * @param {string} bookId - 削除する書籍のID
   */
  removeBook(bookId) {
    if (!bookId) return;

    // リンクされたクラウドIDを取得
    const cloudBookId = this.data.bookLinkMap[bookId];

    // ライブラリから削除
    delete this.data.library[bookId];
    // 進捗を削除
    delete this.data.progress[bookId];
    // しおりを削除
    delete this.data.bookmarks[bookId];
    // 履歴から削除
    this.data.history = this.data.history.filter((item) => item.bookId !== bookId);
    // bookLinkMapから削除
    delete this.data.bookLinkMap[bookId];

    // クラウドデータも削除
    if (cloudBookId) {
      this.removeCloudData(cloudBookId);
    }

    this.save();
  }

  /**
   * クラウドインデックスから書籍情報を削除
   * @param {string} cloudBookId 
   */
  removeCloudData(cloudBookId) {
    if (!cloudBookId) return;
    delete this.data.cloudIndex[cloudBookId];
    delete this.data.cloudStates[cloudBookId];
    this.save();
  }

  setHistoryEntries(bookId, entries) {
    const filtered = this.data.history.filter((item) => item.bookId !== bookId);
    const normalized = Array.isArray(entries)
      ? entries.map((entry) => ({ bookId, openedAt: entry?.openedAt ?? Date.now() }))
      : [];
    this.data.history = [...normalized, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
    this.save();
  }

  setSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
  }

  getSettings() {
    return this.data.settings;
  }

  exportData() {
    return JSON.stringify(this.data, null, 2);
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }

  importData(json) {
    try {
      const parsed = JSON.parse(json);
      const settings = {
        ...defaultData.settings,
        ...(parsed.settings ?? {}),
      };
      const deviceNormalized = ensureDeviceSettings(settings);
      const normalizedSettings = deviceNormalized.settings;

      const normalizedSource = settings.source === "drive" ? "local" : settings.source;
      const normalizedDestination = settings.saveDestination === "drive" ? "local" : settings.saveDestination;
      this.data = {
        ...defaultData,
        ...parsed,
        library: parsed.library ?? {},
        bookmarks: parsed.bookmarks ?? {},
        progress: parsed.progress ?? {},
        history: parsed.history ?? [],
        cloudIndex: parsed.cloudIndex ?? {},
        cloudStates: parsed.cloudStates ?? {},
        cloudIndexUpdatedAt: parsed.cloudIndexUpdatedAt ?? null,
        bookLinkMap: parsed.bookLinkMap ?? {},
        settings: {
          ...normalizedSettings,
          syncEnabled: normalizedSettings.syncEnabled ?? defaultData.settings.syncEnabled,
          lastSyncAt: normalizedSettings.lastSyncAt ?? defaultData.settings.lastSyncAt,
          lastIndexSyncAt: normalizedSettings.lastIndexSyncAt ?? defaultData.settings.lastIndexSyncAt, // SSOT: D1インデックス同期時刻
          apiKey: normalizedSettings.apiKey || defaultData.settings.apiKey,
          endpoint: normalizedSettings.endpoint || defaultData.settings.endpoint,
          d1Endpoint:
            normalizedSettings.d1Endpoint ||
            normalizedSettings.firebaseEndpoint ||
            normalizedSettings.firebaseSyncEndpoint ||
            defaultData.settings.d1Endpoint,
          source: normalizedSource || defaultData.settings.source,
          saveDestination: normalizedDestination || normalizedSource || defaultData.settings.saveDestination,
          onedriveClientId: normalizedSettings.onedriveClientId || defaultData.settings.onedriveClientId,
          onedriveRedirectUri: normalizedSettings.onedriveRedirectUri || defaultData.settings.onedriveRedirectUri,
          onedriveFilePath: normalizedSettings.onedriveFilePath || defaultData.settings.onedriveFilePath,
          onedriveFileId: normalizedSettings.onedriveFileId || defaultData.settings.onedriveFileId,
          onedriveToken: normalizedSettings.onedriveToken || defaultData.settings.onedriveToken,

          autoSyncEnabled: normalizedSettings.autoSyncEnabled ?? defaultData.settings.autoSyncEnabled,
        },
      };
      this.save();
    } catch (error) {
      throw new Error("JSON の読み込みに失敗しました");
    }
  }

  mergeData(incoming) {
    const parsed = typeof incoming === "string" ? JSON.parse(incoming) : incoming;
    const normalized = {
      ...defaultData,
      ...parsed,
      library: parsed?.library ?? {},
      bookmarks: parsed?.bookmarks ?? {},
      progress: parsed?.progress ?? {},
      history: parsed?.history ?? [],
      cloudIndex: parsed?.cloudIndex ?? {},
      cloudStates: parsed?.cloudStates ?? {},
      cloudIndexUpdatedAt: parsed?.cloudIndexUpdatedAt ?? null,
      bookLinkMap: parsed?.bookLinkMap ?? {},
    };

    const mergedLibrary = { ...this.data.library };
    Object.entries(normalized.library).forEach(([id, book]) => {
      const existing = mergedLibrary[id];
      const incomingUpdatedAt = book?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        mergedLibrary[id] = { ...existing, ...book };
      } else {
        mergedLibrary[id] = { ...book, ...existing };
      }
    });

    const mergedBookmarks = { ...this.data.bookmarks };
    Object.entries(normalized.bookmarks).forEach(([bookId, incomingList]) => {
      const currentList = mergedBookmarks[bookId] ?? [];
      const map = new Map();
      [...incomingList, ...currentList].forEach((bookmark) => {
        const key = getBookmarkKey(bookmark);
        if (!key) return;
        const existing = map.get(key);
        map.set(key, pickNewerBookmark(existing, bookmark));
      });
      const mergedList = Array.from(map.values())
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, STORAGE_CONFIG.MAX_BOOKMARKS_PER_BOOK);
      mergedBookmarks[bookId] = mergedList;
    });

    const mergedHistoryMap = new Map();
    [...(this.data.history ?? []), ...(normalized.history ?? [])].forEach((entry) => {
      if (!entry?.bookId) return;
      const existing = mergedHistoryMap.get(entry.bookId);
      if (!existing || (entry.openedAt ?? 0) > (existing.openedAt ?? 0)) {
        mergedHistoryMap.set(entry.bookId, entry);
      }
    });
    const mergedHistory = Array.from(mergedHistoryMap.values()).sort(
      (a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0),
    );

    const mergedProgress = { ...this.data.progress };
    Object.entries(normalized.progress).forEach(([bookId, incomingProgress]) => {
      const existing = mergedProgress[bookId];
      const incomingUpdatedAt = incomingProgress?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        mergedProgress[bookId] = { ...existing, ...incomingProgress };
      } else {
        mergedProgress[bookId] = { ...incomingProgress, ...existing };
      }
    });

    const mergedCloudIndex = { ...this.data.cloudIndex };
    Object.entries(normalized.cloudIndex ?? {}).forEach(([cloudBookId, incomingMeta]) => {
      const existing = mergedCloudIndex[cloudBookId];
      const incomingUpdatedAt = incomingMeta?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        mergedCloudIndex[cloudBookId] = { ...existing, ...incomingMeta };
      } else {
        mergedCloudIndex[cloudBookId] = { ...incomingMeta, ...existing };
      }
    });

    const mergedCloudStates = { ...this.data.cloudStates };
    Object.entries(normalized.cloudStates ?? {}).forEach(([cloudBookId, incomingState]) => {
      const existing = mergedCloudStates[cloudBookId];
      const incomingUpdatedAt = incomingState?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        mergedCloudStates[cloudBookId] = { ...existing, ...incomingState };
      } else {
        mergedCloudStates[cloudBookId] = { ...incomingState, ...existing };
      }
    });

    const mergedBookLinkMap = { ...this.data.bookLinkMap, ...normalized.bookLinkMap };

    this.data = {
      ...this.data,
      library: mergedLibrary,
      bookmarks: mergedBookmarks,
      progress: mergedProgress,
      history: mergedHistory,
      cloudIndex: mergedCloudIndex,
      cloudStates: mergedCloudStates,
      cloudIndexUpdatedAt: normalized.cloudIndexUpdatedAt ?? this.data.cloudIndexUpdatedAt,
      bookLinkMap: mergedBookLinkMap,
      settings: this.data.settings,
    };
    const deviceNormalized = ensureDeviceSettings(this.data.settings ?? defaultData.settings);
    if (deviceNormalized.updated) {
      this.data.settings = deviceNormalized.settings;
    }
    this.save();
  }

  getCloudBookId(localBookId) {
    return this.data.bookLinkMap?.[localBookId] ?? null;
  }

  setBookLink(localBookId, cloudBookId) {
    if (!localBookId || !cloudBookId) return;
    this.data.bookLinkMap = {
      ...(this.data.bookLinkMap ?? {}),
      [localBookId]: cloudBookId,
    };
    this.save();
  }

  mergeCloudIndex(index, updatedAt = null) {
    if (!index || typeof index !== "object") return;
    const merged = { ...(this.data.cloudIndex ?? {}) };
    Object.entries(index).forEach(([cloudBookId, meta]) => {
      const existing = merged[cloudBookId];
      const incomingUpdatedAt = meta?.updatedAt ?? 0;
      const existingUpdatedAt = existing?.updatedAt ?? 0;
      if (!existing || incomingUpdatedAt > existingUpdatedAt) {
        merged[cloudBookId] = { ...existing, ...meta };
      } else {
        merged[cloudBookId] = { ...meta, ...existing };
      }
    });
    this.data.cloudIndex = merged;
    if (updatedAt) {
      this.data.cloudIndexUpdatedAt = updatedAt;
    }
    this.save();
  }

  setCloudIndexUpdatedAt(updatedAt) {
    if (!updatedAt) return;
    this.data.cloudIndexUpdatedAt = updatedAt;
    this.save();
  }

  setCloudState(cloudBookId, state) {
    if (!cloudBookId || !state) return;
    const existing = this.data.cloudStates?.[cloudBookId];
    const incomingUpdatedAt = state?.updatedAt ?? 0;
    const existingUpdatedAt = existing?.updatedAt ?? 0;
    if (!existing || incomingUpdatedAt >= existingUpdatedAt) {
      this.data.cloudStates = {
        ...(this.data.cloudStates ?? {}),
        [cloudBookId]: state,
      };
      this.save();
    }
  }

  getCloudState(cloudBookId) {
    return this.data.cloudStates?.[cloudBookId] ?? null;
  }
}

```

### assets/cloudSync.js

```javascript
/**
 * cloudSync.js - クラウド同期 (D1版)
 * * Cloudflare Workers (D1) を正(SSOT)として利用します。
 * Firestore SDKへの直接アクセスは廃止されました。
 */

import {
  SYNC_CONFIG,
  SYNC_PATHS,
  SYNC_RETRY_BASE_MS,
  SYNC_RETRY_MAX,
  SYNC_RETRY_MAX_MS,
  WORKERS_CONFIG,
} from "./constants.js";
import { ensureOneDriveAccessToken, isTokenValid as isOneDriveTokenValid } from "./onedriveAuth.js";
import { getCurrentUserId, getIdTokenInfo, ID_TOKEN_TYPE } from "./auth.js";
import { t, tReplace } from "./i18n.js";
import { buildCloudStatePayload } from "./cloudState.js";

export class CloudSync {
  constructor(storage) {
    this.storage = storage;
  }

  resolveSource(source, settings = this.storage.getSettings()) {
    const selected =
      source ||
      settings.saveDestination ||
      settings.source ||
      SYNC_CONFIG.DEFAULT_SOURCE;

    // SSOT: "local"は同期を無効にする特別な値
    // しかし、ユーザーが明示的にD1を無効化していない限り、
    // エンドポイントが設定されていればD1を使用すべき
    const hasEndpoint = !!this.getWorkerEndpoint(settings);
    const shouldUseD1 = selected === "local" &&
      !settings.explicitlyDisabledSync &&
      hasEndpoint;

    const effectiveSource = shouldUseD1 ? "d1" : selected;
    const normalized = SYNC_CONFIG.LEGACY_ALIASES[effectiveSource] ?? effectiveSource;

    if (SYNC_CONFIG.ALLOWED_SOURCES.includes(normalized)) {
      return normalized;
    }
    return SYNC_CONFIG.DEFAULT_SOURCE;
  }

  isPCloudConfigured(settings) {
    if (!settings?.apiKey || settings.apiKey === "<必要ならキー>") {
      return false;
    }
    return Boolean(settings?.endpoint);
  }

  getSettings(source) {
    const settings = this.storage.getSettings();
    const resolvedSource = this.resolveSource(source, settings);
    return { settings, resolvedSource };
  }

  getUserIdOrThrow() {
    const uid = getCurrentUserId();
    if (!uid) {
      throw new Error(t("cloudSyncAuthRequired"));
    }
    return uid;
  }

  // Workerのエンドポイント取得 (設定名は d1Endpoint を優先)
  getWorkerEndpoint(settings = this.storage.getSettings()) {
    return (
      settings?.d1Endpoint ||
      settings?.firebaseEndpoint ||
      settings?.firebaseSyncEndpoint ||
      (typeof window !== "undefined" &&
        (window.APP_CONFIG?.D1_SYNC_ENDPOINT || window.APP_CONFIG?.FIREBASE_SYNC_ENDPOINT)) ||
      WORKERS_CONFIG.SYNC_ENDPOINT ||
      ""
    );
  }

  buildWorkerSyncUrl(endpoint, path) {
    if (!endpoint) return null;
    if (endpoint.includes("{path}")) {
      return endpoint.replace("{path}", encodeURIComponent(path));
    }
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}path=${encodeURIComponent(path)}`;
  }

  getRetryDelayMs(attempt) {
    const backoff = SYNC_RETRY_BASE_MS * 2 ** attempt;
    return Math.min(backoff, SYNC_RETRY_MAX_MS);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isRetryableStatus(status) {
    return status >= 500;
  }

  async fetchWithRetry(url, options) {
    for (let attempt = 0; attempt <= SYNC_RETRY_MAX; attempt += 1) {
      try {
        const response = await fetch(url, options);
        if (!response.ok && this.isRetryableStatus(response.status)) {
          // サーバーが返した詳細エラーをコンソールに出力（デバッグ用）
          try {
            const errorDetails = await response.clone().text();
            console.error(`[CloudSync Error Details] HTTP ${response.status} from ${url}:`, errorDetails);
          } catch (_) { /* レスポンス読み取り失敗は無視 */ }
          if (attempt < SYNC_RETRY_MAX) {
            await this.sleep(this.getRetryDelayMs(attempt));
            continue;
          }
        }
        return response;
      } catch (error) {
        if (attempt < SYNC_RETRY_MAX) {
          await this.sleep(this.getRetryDelayMs(attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error(t("cloudSyncWorkersFailed"));
  }

  async getIdToken() {
    const info = await getIdTokenInfo();
    if (!info?.idToken) return null;
    // GISトークンでもFirebaseトークンでも、Worker側で検証するためそのまま返す
    return info.idToken;
  }

  normalizeCloudState(state, updatedAt) {
    const safeState = state ?? {};
    const safeBookmarks = Array.isArray(safeState.bookmarks) ? safeState.bookmarks : [];
    return {
      ...safeState,
      progress: typeof safeState.progress === "number" ? safeState.progress : 0,
      lastCfi: safeState.lastCfi ?? null,
      location: safeState.location ?? safeState.lastCfi ?? null,
      bookmarks: safeBookmarks,
      updatedAt: safeState.updatedAt ?? updatedAt ?? Date.now(),
    };
  }

  // ===============================
  // Worker (D1) Access Methods
  // ===============================

  async postWorkerSync(path, payload, settings = this.storage.getSettings()) {
    const endpoint = this.getWorkerEndpoint(settings);
    if (!endpoint) {
      throw new Error(t("cloudSyncNoEndpoint"));
    }
    const idToken = await this.getIdToken();
    if (!idToken) {
      throw new Error(t("cloudSyncNoIdToken"));
    }
    const url = this.buildWorkerSyncUrl(endpoint, path);

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, ...payload }),
    });

    if (!response.ok) {
      // fetchWithRetry でリトライ済みの最終レスポンス: 詳細を出力してからスロー
      try {
        const errorDetails = await response.text();
        console.error(`[CloudSync Error Details] HTTP ${response.status} (final):`, errorDetails);
      } catch (_) { /* 読み取り失敗は無視 */ }
      throw new Error(tReplace("cloudSyncWorkersFailed", { status: response.status }));
    }
    const json = await response.json();

    // エラーレスポンスのハンドリング
    if (json.error) {
      throw new Error(json.error);
    }

    const data = json?.data;
    const isEmptyData =
      data == null ||
      (Array.isArray(data) && data.length === 0) ||
      (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0);

    // SSOT: /sync/state/pull においてデータが空なのは、新規書籍では正常なため log に留める
    if (isEmptyData) {
      console.log(`[CloudSync] No granular data found for path: ${path}`);
    }

    return json?.data ?? json;
  }

  // ===============================
  // D1 Operations (via Worker)
  // ===============================

  async pullBookDataD1(bookId, settings = this.storage.getSettings()) {
    // D1移行後は個別のBookData取得もWorker経由で行う
    // (現在の実装ではpullStateがその役割を担うため、ここは互換性維持または未使用)
    return {};
  }

  async matchBook(fingerprint, meta, settings = this.storage.getSettings()) {
    // マッチング機能はWorker側で未実装の場合があるため、インデックス同期で代用するか、
    // 必要に応じてWorkerに実装を追加する。
    // 現状のWorker実装には matchBook 用のエンドポイントがないため、
    // ここでは「見つからない」として返し、新規作成フローに倒すのが安全。
    // ※必要であればWorkerに /sync/match エンドポイントを追加実装してください。
    return { found: false };
  }

  async pullIndex(settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("d1", settings);
    if (resolvedSource !== "d1") {
      return { source: resolvedSource, status: "skipped" };
    }
    // 差分同期: 最後の同期時刻以降の更新のみ取得
    const since = this.storage.data.cloudIndexUpdatedAt ?? null;
    return this.postWorkerSync(SYNC_PATHS.INDEX_PULL, { since }, settings);
  }

  async pushIndexDelta(indexDelta, updatedAt, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("d1", settings);
    if (resolvedSource !== "d1") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.postWorkerSync(SYNC_PATHS.INDEX_PUSH, { indexDelta, updatedAt }, settings);
  }

  async pullState(cloudBookId, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("d1", settings);
    if (resolvedSource !== "d1") {
      return { source: resolvedSource, status: "skipped" };
    }
    return this.postWorkerSync(SYNC_PATHS.STATE_PULL, { cloudBookId }, settings);
  }

  async pushState(cloudBookId, state, updatedAt, settings = this.storage.getSettings()) {
    const resolvedSource = this.resolveSource("d1", settings);
    if (resolvedSource !== "d1") {
      return { source: resolvedSource, status: "skipped" };
    }
    const normalizedState = this.normalizeCloudState(state, updatedAt);
    const payload = { state: normalizedState, updatedAt: normalizedState.updatedAt };
    return this.postWorkerSync(SYNC_PATHS.STATE_PUSH, { cloudBookId, ...payload }, settings);
  }

  // ===============================
  // Other Cloud Providers (OneDrive / pCloud / Generic Endpoint)
  // ===============================
  // ※ ここから下は既存コードと同じですが、CloudSyncクラス全体を置き換えるため含めます

  buildHeaders(apiKey) {
    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
  }

  buildAuthHeader(apiKey) {
    if (!apiKey) return {};
    return { Authorization: `Bearer ${apiKey}` };
  }

  async pushToEndpoint(settings) {
    const { endpoint, apiKey } = settings;
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({ action: "save", payload }),
    });

    if (!response.ok) {
      throw new Error(tReplace("cloudSyncEndpointSaveFailed", { status: response.status }));
    }

    return response.json().catch(() => ({}));
  }

  async pullFromEndpoint(settings, { merge = true } = {}) {
    const { endpoint, apiKey } = settings;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({ action: "load" }),
    });

    if (!response.ok) {
      throw new Error(tReplace("cloudSyncEndpointLoadFailed", { status: response.status }));
    }

    const json = await response.json();
    if (json?.data && merge) {
      this.storage.mergeData(json.data);
    }
    return json;
  }

  async pushToOneDrive(settings) {
    const accessToken = this.ensureOneDriveToken(settings);
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };
    const fileId = await this.uploadToOneDrive(accessToken, payload, settings);
    if (fileId && fileId !== settings.onedriveFileId) {
      this.storage.setSettings({ onedriveFileId: fileId });
    }
    return { source: "onedrive", fileId };
  }

  async pullFromOneDrive(settings, { merge = true } = {}) {
    const accessToken = this.ensureOneDriveToken(settings);
    const item = await this.resolveOneDriveItem(accessToken, settings);
    if (!item?.id) {
      throw new Error(t("cloudSyncOneDriveFileMissing"));
    }
    const response = await fetch(this.buildOneDriveContentUrl({ ...settings, onedriveFileId: item.id }), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncOneDriveFetchFailed", { status: response.status }));
    }
    const json = await response.json();
    if (json?.data && merge) {
      this.storage.mergeData(json.data);
    }
    if (item.id && item.id !== settings.onedriveFileId) {
      this.storage.setSettings({ onedriveFileId: item.id });
    }
    return json;
  }

  ensureOneDriveToken(settings) {
    const token = ensureOneDriveAccessToken(settings, (onedriveToken) => {
      this.storage.setSettings({ onedriveToken });
    });
    return token;
  }

  encodeOneDrivePath(path) {
    return path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
  }

  buildOneDrivePath(settings) {
    const fallback = "epub-reader-data.json";
    const rawPath = settings.onedriveFilePath || fallback;
    const normalized = rawPath.replace(/^\/+/, "");
    return normalized || fallback;
  }

  buildOneDriveContentUrl(settings) {
    if (settings.onedriveFileId) {
      return `https://graph.microsoft.com/v1.0/me/drive/items/${settings.onedriveFileId}/content`;
    }
    const path = this.buildOneDrivePath(settings);
    const encodedPath = this.encodeOneDrivePath(path);
    return `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodedPath}:/content`;
  }

  async resolveOneDriveItem(accessToken, settings) {
    if (settings.onedriveFileId) {
      const byId = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${settings.onedriveFileId}?select=id,name,lastModifiedDateTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (byId.ok) {
        return byId.json();
      }
      if (byId.status !== 404) {
        throw new Error(tReplace("cloudSyncOneDriveCheckFailed", { status: byId.status }));
      }
    }

    const path = this.buildOneDrivePath(settings);
    const encodedPath = this.encodeOneDrivePath(path);
    const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodedPath}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncOneDriveSearchFailed", { status: response.status }));
    }
    const result = await response.json();
    return result ?? null;
  }

  async uploadToOneDrive(accessToken, payload, settings) {
    const url = this.buildOneDriveContentUrl(settings);
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncOneDriveUploadFailed", { status: response.status }));
    }
    const meta = await response.json().catch(() => null);
    return meta?.id ?? null;
  }

  async pushToPCloud(settings) {
    const { endpoint, apiKey } = settings;
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...this.buildAuthHeader(apiKey),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncPCloudSaveFailed", { status: response.status }));
    }
    return response.json().catch(() => ({ source: "pcloud" }));
  }

  async pullFromPCloud(settings, { merge = true } = {}) {
    const { endpoint, apiKey } = settings;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: this.buildAuthHeader(apiKey),
    });
    if (response.status === 404) {
      return { source: "pcloud", status: "not_found" };
    }
    if (!response.ok) {
      throw new Error(tReplace("cloudSyncPCloudFetchFailed", { status: response.status }));
    }
    const json = await response.json();
    if (json?.data && merge) {
      this.storage.mergeData(json.data);
    }
    return json;
  }

  // ===============================
  // Public API Wrappers (Backward Compatibility)
  // ===============================

  /**
   * データをクラウドにプッシュします。
   * D1バックエンドへの同期を実行します。
   * @param {string} source 同期先ソース ("d1"/"onedrive"/"pcloud"/"local")
   * @returns {Promise<Object>} 同期結果
   */
  async push(source) {
    const { settings, resolvedSource } = this.getSettings(source);

    if (resolvedSource === "local") return { source: "local", status: "skipped" };
    // "d1" means Worker(D1) in this implementation
    if (resolvedSource === "d1") {
      // NOTE:
      // - D1同期はフルバックアップではなく、インデックス/状態のグラニュラー同期を採用。
      // - 同期仕様は cloudState.js に集約し、AIエージェントの誤修正を防止する。
      console.log("[CloudSync.push] D1 granular sync starting...");
      const updatedAt = Date.now();
      const snapshot = this.storage.snapshot();
      const indexDelta = snapshot.cloudIndex ?? {};
      console.log("[CloudSync.push] Pushing index delta with", Object.keys(indexDelta).length, "entries");
      const indexResult = await this.pushIndexDelta(indexDelta, updatedAt, settings);
      console.log("[CloudSync.push] Index push result:", indexResult);

      const lastBookId = this.storage.data.lastBookId;
      const lastCloudBookId = lastBookId ? this.storage.getCloudBookId(lastBookId) : null;
      if (lastBookId && lastCloudBookId) {
        console.log("[CloudSync.push] Pushing state for current book:", lastCloudBookId);
        const payload = buildCloudStatePayload(this.storage, lastBookId, lastCloudBookId);
        if (payload?.state) {
          const stateResult = await this.pushState(lastCloudBookId, payload.state, payload.updatedAt, settings);
          console.log("[CloudSync.push] State push result:", stateResult);
        }
      }

      // SSOT: 同期時刻を複数のフィールドに設定して一貫性を保つ
      console.log("[CloudSync.push] Setting sync timestamps:", updatedAt);
      this.storage.setSettings({
        lastSyncAt: updatedAt,
        lastIndexSyncAt: updatedAt  // SSOT: 表示用に明示的に設定
      });
      if (typeof this.storage.setCloudIndexUpdatedAt === "function") {
        this.storage.setCloudIndexUpdatedAt(updatedAt);
      } else {
        this.storage.data.cloudIndexUpdatedAt = updatedAt;
      }
      // SSOT: 全ての同期時刻更新後に一度だけ永続化
      this.storage.save();
      console.log("[CloudSync.push] Sync completed and saved successfully. Timestamps set:", {
        lastSyncAt: this.storage.getSettings().lastSyncAt,
        lastIndexSyncAt: this.storage.getSettings().lastIndexSyncAt,
        cloudIndexUpdatedAt: this.storage.data.cloudIndexUpdatedAt
      });
      return { source: "d1", status: "success", updatedAt };
    }
    if (resolvedSource === "onedrive") {
      if (!isOneDriveTokenValid(settings?.onedriveToken)) return { source: "onedrive", status: "unauthenticated" };
      return this.pushToOneDrive(settings);
    }
    if (resolvedSource === "pcloud") {
      if (!this.isPCloudConfigured(settings)) return { source: "pcloud", status: "unauthenticated" };
      return this.pushToPCloud(settings);
    }
    if (settings.endpoint) return this.pushToEndpoint(settings);

    throw new Error(tReplace("cloudSyncUnknownSource", { source: resolvedSource }));
  }

  async pull(source) {
    const { settings, resolvedSource } = this.getSettings(source);

    if (resolvedSource === "local") return { source: "local", status: "skipped" };
    if (resolvedSource === "d1") {
      // D1ではフルリストアではなく、差分同期を使用する
      // syncAllBooksFromCloud (pullIndex) を使用すること
      console.warn("Full backup pull is not implemented for D1 backend. Use syncAllBooksFromCloud instead.");
      return { source: "d1", status: "skipped_full_restore" };
    }
    if (resolvedSource === "onedrive") {
      if (!isOneDriveTokenValid(settings?.onedriveToken)) return { source: "onedrive", status: "unauthenticated" };
      return this.pullFromOneDrive(settings, { merge: true });
    }
    if (resolvedSource === "pcloud") {
      if (!this.isPCloudConfigured(settings)) return { source: "pcloud", status: "unauthenticated" };
      return this.pullFromPCloud(settings, { merge: true });
    }
    if (settings.endpoint) return this.pullFromEndpoint(settings, { merge: true });

    throw new Error(tReplace("cloudSyncUnknownSource", { source: resolvedSource }));
  }
}

```

### assets/app.js

```javascript
/**
 * app.js - メインアプリケーション
 * 
 * EPUB/画像書庫リーダーのメインエントリーポイント
 */

import { StorageService, getDeviceInfo } from "./storage.js";
import { ReaderController } from "./reader.js";
import { CloudSync } from "./cloudSync.js";
import { UIController, ProgressBarHandler } from "./ui.js";
import {
  checkAuthStatus,
  initGoogleLogin,
  logout,
  startGoogleLogin,
  onGoogleLoginStart as startGoogleLoginUi,
  onGoogleLoginEnd as endGoogleLoginUi,
} from "./auth.js";
import { auth } from "./firebaseConfig.js";
import { saveFile, loadFile, bufferToFile, deleteBook } from "./fileStore.js";
import { elements } from "./js/ui/elements.js";
import { initLoadingAnimation, showLoading, hideLoading } from "./js/ui/overlay-manager.js";
import { resolveErrorCode } from "./js/ui/i18n-utils.js";
import * as fileHandler from "./js/core/file-handler.js";
import { calculateProgressPercentage, normalizePageIndex, roundProgressPercentage } from "./js/core/progress-utils.js";
import * as syncLogic from "./js/core/sync-logic.js";
import * as renderers from "./js/ui/renderers.js";
import { UI_STRINGS, getUiStrings, t as translate, tReplace, DEFAULT_LANGUAGE, formatRelativeTime } from "./i18n.js";
import { setupWebNovelUI } from "./js/ui/web-novel-ui.js";
import {
  APP_INFO,
  ERROR_CODES,
  ERROR_MESSAGE_MATCHERS,
  MIME_TYPES,
  SUPPORTED_FORMATS,
  TIMING_CONFIG,
  UI_CLASSES,
  UI_ICONS,
  UI_SYMBOLS,
  UI_DEFAULTS,
  BOOK_TYPES,
  WRITING_MODES,
  READING_DIRECTIONS,
  IMAGE_VIEW_MODES,
  FILESTORE_CONFIG,
  FILE_EXTENSIONS,
  FILE_STRATEGY,
  ARCHIVE_WARNING_EVENT,
  ARCHIVE_WARNING_CONFIG,
  DOM_IDS,
  DOM_SELECTORS,
  CSS_VARS,
  ASSET_PATHS,
  READER_CONFIG,
  SYNC_SOURCES,
  CLOUD_SYNC_PAGE_THRESHOLD,
  NOTION_INTEGRATION_STATUS,
  NOTION_DEFAULT_SETTINGS,
  NOTION_CONFIG,
} from "./constants.js";

// ========================================
// 初期化
// ========================================

const storage = new StorageService();
const cloudSync = new CloudSync(storage);
const settings = storage.getSettings();
const initialAuthStatus = checkAuthStatus();

let currentBookId = null;
let currentBookInfo = null;
let currentCloudBookId = null;
let isBookLoading = false;
let pendingCloudBookId = null;

let theme = settings.theme ?? UI_DEFAULTS.theme;
let uiLanguage = settings.uiLanguage ?? UI_DEFAULTS.uiLanguage;
let writingMode = settings.writingMode;
let pageDirection = settings.pageDirection;
let bookmarkMenuMode = settings.bookmarkMenuMode ?? UI_DEFAULTS.bookmarkMenuMode;
let epubViewMode = settings.epubViewMode ?? UI_DEFAULTS.epubViewMode;
let progressDisplayMode = settings.progressDisplayMode ?? UI_DEFAULTS.progressDisplayMode;
let fontSize = Number.isFinite(settings.fontSize) ? settings.fontSize : null;
let archiveWarningTimeoutId = null;
const legacyDirection = settings.readingDirection;
if (!writingMode || !pageDirection) {
  const legacyConfig = UI_DEFAULTS.legacyDirectionMap[legacyDirection];
  if (legacyConfig) {
    writingMode = legacyConfig.writingMode;
    pageDirection = legacyConfig.pageDirection;
  }
}
if (!writingMode) writingMode = UI_DEFAULTS.writingMode;
if (!pageDirection) pageDirection = UI_DEFAULTS.pageDirection;
let defaultWritingMode = settings.defaultWritingMode ?? UI_DEFAULTS.writingMode;
let defaultPageDirection = settings.defaultPageDirection ?? UI_DEFAULTS.defaultDirection;
let defaultImageViewMode = settings.defaultImageViewMode ?? UI_DEFAULTS.imageViewMode;
let oneBookmarkPerBook = settings.oneBookmarkPerBook ?? DEFAULT_SETTINGS.oneBookmarkPerBook;
let autoSyncEnabled = false;
let libraryViewMode = settings.libraryViewMode ?? UI_DEFAULTS.libraryViewMode;
let autoSyncInterval = null;
let lastSavedPercentage = null;
let currentToc = [];
let uiInitialized = false;
let floatVisible = false;
let googleLoginReady = false;
let userOverrodeDirection = false;
let archiveWarningTypes = [];
// ライブラリで削除マークが付いた書籍のID（メニューを閉じた時に実際に削除）
// Map<string, { id: string, type: 'local' | 'cloud' }>
let pendingDeletes = new Map();

const NOTION_STATUS_LABEL_KEYS = Object.freeze({
  [NOTION_INTEGRATION_STATUS.DISCONNECTED]: "notionStatusDisconnected",
  [NOTION_INTEGRATION_STATUS.CONNECTED]: "notionStatusConnected",
  [NOTION_INTEGRATION_STATUS.PENDING]: "notionStatusPending",
  [NOTION_INTEGRATION_STATUS.ERROR]: "notionStatusError",
});

// UI_STRINGS は i18n.js からインポート済み


// 初期化実行（非同期Lottie読み込み対応）
document.addEventListener('DOMContentLoaded', async () => {
  await initLoadingAnimation();
  // ズームスライダーの初期化をDOM準備後に行う
  if (reader && typeof reader.setupZoomSlider === 'function') {
    reader.setupZoomSlider();
  }
});


function t(key) {
  return translate(key, uiLanguage);
}





function getNotionSettingsSnapshot() {
  const currentSettings = storage.getSettings();
  return {
    ...NOTION_DEFAULT_SETTINGS,
    ...(currentSettings.notionIntegration ?? {}),
  };
}

function getNotionUrlSample() {
  return NOTION_CONFIG.OAUTH_URL_SAMPLE || NOTION_CONFIG.OAUTH_URL;
}

function getNotionOAuthUrl() {
  const notionSettings = getNotionSettingsSnapshot();
  return notionSettings.oauthUrl || NOTION_CONFIG.OAUTH_URL;
}

function normalizeEpubLocation(location) {
  if (!location) return null;
  if (
    typeof location === "object" &&
    Number.isFinite(location.spineIndex) &&
    Number.isFinite(location.segmentIndex)
  ) {
    return {
      spineIndex: location.spineIndex,
      segmentIndex: location.segmentIndex,
      cfi: location.cfi || undefined,
      visibleText: location.visibleText || undefined,
    };
  }
  if (typeof location === "string") {
    // 既存の "spineIndex:segmentIndex" 形式の文字列復元
    const match = location.match(/^(\d+):(\d+)$/);
    if (match) {
      return {
        spineIndex: Number(match[1]),
        segmentIndex: Number(match[2]),
      };
    }
  }
  return null;
}

function normalizeProgressSnapshot(progress, bookType) {
  if (!progress || bookType !== BOOK_TYPES.EPUB) return progress;
  const normalizedLocation = normalizeEpubLocation(progress.location);
  if (!normalizedLocation) return progress;
  return {
    ...progress,
    location: normalizedLocation,
  };
}

function renderNotionSettingsStatus() {
  const notionSettings = getNotionSettingsSnapshot();
  const statusKey = NOTION_STATUS_LABEL_KEYS[notionSettings.status] ?? "notionStatusDisconnected";
  if (elements.notionStatus) {
    elements.notionStatus.textContent = t(statusKey);
  }
  if (elements.notionWorkspaceInput) {
    elements.notionWorkspaceInput.value = notionSettings.workspaceName || t("notionValueEmpty");
  }
  if (elements.notionParentPageInput) {
    elements.notionParentPageInput.value = notionSettings.parentPageId || t("notionValueEmpty");
  }
  if (elements.notionDatabaseInput) {
    elements.notionDatabaseInput.value = notionSettings.databaseId || t("notionValueEmpty");
  }
  if (elements.notionOauthUrlInput) {
    elements.notionOauthUrlInput.value = notionSettings.oauthUrl || "";
    elements.notionOauthUrlInput.placeholder = tReplace(
      "notionOauthUrlPlaceholder",
      { url: getNotionUrlSample() },
      uiLanguage,
    );
  }
  const isConnected = notionSettings.status === NOTION_INTEGRATION_STATUS.CONNECTED;
  if (elements.notionConnectButton) {
    elements.notionConnectButton.disabled = isConnected;
  }
  if (elements.notionDisconnectButton) {
    elements.notionDisconnectButton.disabled = !isConnected;
  }
}

function handleNotionConnectClick() {
  const notionUrl = getNotionOAuthUrl();
  if (!notionUrl) {
    alert(tReplace("notionConnectUnavailable", { url: getNotionUrlSample() }, uiLanguage));
    return;
  }
  window.location.href = notionUrl;
}

function handleNotionDisconnectClick() {
  if (!confirm(t("notionDisconnectConfirm"))) return;
  storage.setSettings({ notionIntegration: { ...NOTION_DEFAULT_SETTINGS } });
  renderNotionSettingsStatus();
  alert(t("notionDisconnected"));
}

// 同期ロジックの初期化
syncLogic.init({
  storage,
  cloudSync,
  checkAuthStatus,
  callbacks: {
    openModal,
    closeModal,
    renderLibrary: () => renderers.renderLibrary(),
    renderHistory: () => renderers.renderHistory(),
    renderBookmarks: (mode) => renderers.renderBookmarks(mode),
    updateSyncStatusDisplay: (auth) => renderers.updateSyncStatusDisplay(auth),
    updateFloatingUIButtons: () => renderers.updateFloatingUIButtons(),
    updateProgressBarDisplay: () => renderers.updateProgressBarDisplay(),
    updateAuthStatusDisplay: () => renderers.updateAuthStatusDisplay(),
    syncAutoSyncPolicy,
    openFileDialog,
    applyReadingState,
  },
});

// 認証成功時の同期トリガー設定 (初期化後すぐに登録)
window.addEventListener("auth:login", () => {
  console.log("[app] auth:login event received, starting sync...");
  syncLogic.handleAuthLogin().catch((error) => {
    console.error("同期データの取得に失敗しました:", error);
  });
});

function setArchiveWarnings(warningTypes = []) {
  const uniqueTypes = [...new Set(warningTypes)];
  archiveWarningTypes = uniqueTypes;
  renderers.showArchiveWarnings(uniqueTypes);
  if (archiveWarningTimeoutId) {
    clearTimeout(archiveWarningTimeoutId);
    archiveWarningTimeoutId = null;
  }
  if (uniqueTypes.length > 0 && ARCHIVE_WARNING_CONFIG.AUTO_CLOSE_MS > 0) {
    archiveWarningTimeoutId = setTimeout(() => {
      clearArchiveWarnings();
    }, ARCHIVE_WARNING_CONFIG.AUTO_CLOSE_MS);
  }
}

function clearArchiveWarnings() {
  archiveWarningTypes = [];
  renderers.hideArchiveWarnings();
  if (archiveWarningTimeoutId) {
    clearTimeout(archiveWarningTimeoutId);
    archiveWarningTimeoutId = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener(ARCHIVE_WARNING_EVENT, (event) => {
    const warningTypes = event?.detail?.warningTypes ?? [];
    if (Array.isArray(warningTypes) && warningTypes.length > 0) {
      setArchiveWarnings(warningTypes);
    }
  });
}




// ========================================



// ========================================
// 進捗保存
// ========================================
function getCurrentTotalPages() {
  if (!reader) return 0;
  return reader.type === BOOK_TYPES.EPUB
    ? (reader.pagination?.pages?.length || 0)
    : (reader.imagePages?.length || 0);
}

function getCurrentPageIndex() {
  if (!reader) return 0;
  const rawIndex = reader.type === BOOK_TYPES.EPUB ? reader.currentPageIndex : reader.imageIndex;
  return normalizePageIndex(rawIndex);
}

function getProgressSnapshot(progressOverride = {}) {
  const totalPages = getCurrentTotalPages();
  const pageIndex = getCurrentPageIndex();
  const fallbackPercentage = calculateProgressPercentage(pageIndex, totalPages) ?? 0;
  const percentage = Number.isFinite(progressOverride.percentage)
    ? progressOverride.percentage
    : fallbackPercentage;
  return {
    pageIndex,
    totalPages,
    percentage,
    location: progressOverride.location ?? null,
  };
}

function shouldPersistLocalProgress(percentage) {
  if (!Number.isFinite(percentage)) return false;
  if (!Number.isFinite(lastSavedPercentage)) return true;
  return Math.abs(percentage - lastSavedPercentage) >= TIMING_CONFIG.LOCAL_SAVE_THRESHOLD_PERCENT;
}

function saveCurrentProgress(options = {}) {
  const { progressSnapshot = getProgressSnapshot(), force = false } = options;
  if (!currentBookId || isBookLoading) return;

  // リーダーが未初期化（ページ分割前）の場合は保存をスキップして位置の上書きを防ぐ
  if (getCurrentTotalPages() <= 0) return;

  let progressData = null;

  if (reader.type === BOOK_TYPES.EPUB) {
    const pageIndex = progressSnapshot.pageIndex;
    const total = progressSnapshot.totalPages;
    const locatorFromSnapshot = normalizeEpubLocation(progressSnapshot.location);
    const fallbackLocator =
      typeof reader.getPageLocator === "function" ? reader.getPageLocator(pageIndex) : null;
    const location = locatorFromSnapshot ?? fallbackLocator;
    const percentage = progressSnapshot.percentage;

    progressData = {
      percentage,
      location,
      // 読書環境も保存（EPUB用）
      writingMode,
      pageDirection,
      epubViewMode,
      updatedAt: Date.now()
    };
  } else {
    // 画像書庫
    const index = progressSnapshot.pageIndex;
    const percentage = progressSnapshot.percentage;

    progressData = {
      percentage,
      location: index,
      // 画像書庫用の表示設定も保存
      imageViewMode: reader.imageViewMode,
      pageDirection: reader.imageReadingDirection,
      updatedAt: Date.now()
    };
  }

  if (!progressData) return progressSnapshot;

  // [修正] 強制保存（pagehide等のバックグラウンド移行時）における意図しない位置リセットを防止
  // すでに読了が進んでいる（0.1%以上）状態で、今回0%が取得された場合は、ブラウザのDOM計測失敗の可能性が高いため保存をスキップ
  if (force && progressData.percentage === 0 && lastSavedPercentage > 0.001) {
    console.warn("[saveCurrentProgress] Force save detected potential reset (0% vs last " + lastSavedPercentage + "%). Skipping.");
    return progressSnapshot;
  }

  if (!force && !shouldPersistLocalProgress(progressData.percentage)) return progressSnapshot;

  storage.setProgress(currentBookId, progressData);
  lastSavedPercentage = progressData.percentage;
  return progressSnapshot;
}

function shouldSyncCloudProgress(progressSnapshot) {
  if (!progressSnapshot || !currentBookId || !currentCloudBookId) return false;
  if (!syncLogic.isCloudSyncEnabled()) return false;
  const progress = storage.getProgress(currentBookId) ?? {};
  const lastSyncedPageIndex = Number.isFinite(progress.cloudSyncPageIndex) ? progress.cloudSyncPageIndex : null;
  const lastSyncedAt = progress.cloudSyncAt ?? 0;
  const pageDelta = lastSyncedPageIndex === null
    ? Number.POSITIVE_INFINITY
    : Math.abs(progressSnapshot.pageIndex - lastSyncedPageIndex);
  const timeDelta = Date.now() - lastSyncedAt;
  return pageDelta >= CLOUD_SYNC_PAGE_THRESHOLD || timeDelta >= getAutoSyncIntervalMs();
}

function updateCloudSyncSnapshot(progressSnapshot) {
  if (!progressSnapshot || !currentBookId) return;
  const existing = storage.getProgress(currentBookId) ?? {};
  storage.setProgress(currentBookId, {
    cloudSyncAt: Date.now(),
    cloudSyncPageIndex: progressSnapshot.pageIndex,
    cloudSyncPercentage: progressSnapshot.percentage,
    updatedAt: existing.updatedAt,
  });
}

async function requestCloudSyncIfNeeded(options = {}) {
  const { progressSnapshot = getProgressSnapshot(), force = false } = options;
  if (!force && !shouldSyncCloudProgress(progressSnapshot)) return;
  const authStatus = checkAuthStatus();
  if (!authStatus.authenticated) {
    syncAutoSyncPolicy(authStatus);
    return;
  }
  await pushCurrentBookSync();
}

// ========================================
// リーダーコントローラー初期化
// ========================================

const reader = new ReaderController({
  viewerId: "viewer",
  imageViewerId: "imageViewer",
  imageElementId: "pageImage",
  pageIndicatorId: "pageIndicator",
  onProgress: ({ location, percentage }) => {
    // reader.js は { location, percentage } を渡す。readerから現在値を取得して更新
    const progressSnapshot = getProgressSnapshot({ location, percentage });

    ui.updateProgress(progressSnapshot.pageIndex, progressSnapshot.totalPages, progressSnapshot.percentage);
    const savedSnapshot = saveCurrentProgress({ progressSnapshot });
    requestCloudSyncIfNeeded({ progressSnapshot: savedSnapshot });
  },
  onLoadingUpdate: (loadingInfo) => {
    // ローディング状態の更新をコンソールに記録
    // 将来的にUIに表示する場合はここで処理
    console.log('[ReaderController] Loading update:', loadingInfo);
  },
  onRepaginationStart: () => {
    showLoading();
  },
  onRepaginationEnd: () => {
    hideLoading();
  },
  onReady: (data) => {
    // 起動時の初期化関連
    if (data.metadata) {
      document.title = data.metadata.title
        ? `${data.metadata.title} - ${APP_INFO.NAME}`
        : APP_INFO.NAME;
    }
    // 進捗バーの向きを更新
    renderers.updateProgressBarDirection();
    handleBookReady(data);
  },
  onImageZoom: (isZoomed) => {
    if (isZoomed) {
      document.body.classList.add(UI_CLASSES.IS_ZOOMED);
    } else {
      document.body.classList.remove(UI_CLASSES.IS_ZOOMED);
    }
  },
});

reader.applyTheme(theme);
reader.applyReadingDirection(writingMode, pageDirection);
reader.applyEpubViewMode(epubViewMode);

// ========================================
// CSS変数の注入 (SSOT)
// ========================================
function applyCssVariablesFromConfig() {
  const root = document.documentElement;
  const layout = READER_CONFIG.layout;

  if (layout) {
    if (layout.maxWidth) root.style.setProperty('--reader-max-width', layout.maxWidth);
    if (layout.textAlign) root.style.setProperty('--reader-text-align', layout.textAlign);
    if (layout.lineBreak) root.style.setProperty('--reader-line-break', layout.lineBreak);
    if (layout.wordBreak) root.style.setProperty('--reader-word-break', layout.wordBreak);
  }

  // SSOT: READER_CONFIG に合わせて表示用タイポグラフィを統一
  root.style.setProperty('--reader-line-height', `${READER_CONFIG.lineHeight}`);
  root.style.setProperty(
    '--reader-paragraph-margin',
    typeof READER_CONFIG.paragraphMarginEm === "number"
      ? `${READER_CONFIG.paragraphMarginEm}em`
      : READER_CONFIG.paragraphMarginEm
  );
  root.style.setProperty('--reader-orphans', `${READER_CONFIG.orphans}`);
  root.style.setProperty('--reader-widows', `${READER_CONFIG.widows}`);
}

// 初期化時に実行
applyCssVariablesFromConfig();

// ========================================
// UIコントローラー初期化
// ========================================

const createDebouncedHandler = (callback, delayMs) => {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      callback(...args);
    }, delayMs);
  };
};

const debouncedResizeHandler = createDebouncedHandler(() => {
  if (!reader.handleResize) return;
  console.log(`[onResize] handleResize (debounced ${TIMING_CONFIG.RESIZE_DEBOUNCE_MS}ms)`);
  reader.handleResize();
}, TIMING_CONFIG.RESIZE_DEBOUNCE_MS);

const ui = new UIController({
  isBookOpen: () => reader.book !== null || reader.imagePages.length > 0,
  isPageNavigationEnabled: () => true, // 常に有効（必要なら調整）
  isProgressBarAvailable: () => reader.type === BOOK_TYPES.EPUB || reader.type === BOOK_TYPES.ZIP || reader.type === BOOK_TYPES.RAR,
  isFloatVisible: () => elements.floatOverlay.classList.contains(UI_CLASSES.VISIBLE),

  // 追加: 画像/見開き判定用
  isImageBook: () => {
    const type = reader?.type;
    return Boolean(type === BOOK_TYPES.IMAGE || type === BOOK_TYPES.ZIP || type === BOOK_TYPES.RAR);
  },
  isSpreadMode: () => Boolean(reader?.imageViewMode === IMAGE_VIEW_MODES.SPREAD),

  getReadingDirection: () => {
    // EPUBの場合は pageDirection (ltr/rtl)
    if (reader?.type === BOOK_TYPES.EPUB) {
      return pageDirection;
    }
    // 画像書庫の場合は reader.imageReadingDirection
    return reader?.imageReadingDirection;
  },

  getWritingMode: () => {
    return writingMode;
  },

  getEpubViewMode: () => epubViewMode,

  onFloatToggle: () => {
    renderers.toggleFloatOverlay();
  },
  onResize: () => {
    // リサイズ時のリペジネーション (EPUBのみ)
    // ui.js側で既に250msデバウンス済みなので直接呼び出す
    if (!reader.handleResize) return;
    reader.handleResize();
  },
  onLeftMenu: (action) => {
    if (action === 'show') {

    }
  },
  onProgressBar: (action) => {
    if (action === 'show') {
      const total = reader.pagination ? reader.pagination.pages.length : 0;
      ui.updateProgress(reader.currentPageIndex, total);
    }
  },
  onBookmarkMenu: (action) => {
    if (action === 'show') {

      renderers.renderBookmarks(bookmarkMenuMode);
      bookmarkMenuMode = UI_DEFAULTS.bookmarkMenuMode;
    }
  },
  onPagePrev: (step) => {

    reader.prev(step);
  },
  onPageNext: (step) => {

    reader.next(step);
  },
});

uiInitialized = true;

renderers.init({
  storage,
  reader,
  syncLogic,
  ui,
  state: {
    get currentBookId() { return currentBookId; },
    get currentBookInfo() { return currentBookInfo; },
    get currentCloudBookId() { return currentCloudBookId; },
    get pendingCloudBookId() { return pendingCloudBookId; },
    get uiLanguage() { return uiLanguage; },
    get epubViewMode() { return epubViewMode; },
    get progressDisplayMode() { return progressDisplayMode; },
    get floatVisible() { return floatVisible; },
    get pageDirection() { return pageDirection; },
    get bookmarkMenuMode() { return bookmarkMenuMode; },
    get pendingDeletes() { return pendingDeletes; },
    get writingMode() { return writingMode; },
    get theme() { return theme; },
  },
  actions: {
    checkAuthStatus,
    syncAutoSyncPolicy,
    openFromLibrary,
    openCloudOnlyBook,
    openFileDialog,
    closeModal,
    closeAllMenus: () => {
      if (ui) ui.closeAllMenus();
      closeExclusiveMenus();
    },
    scheduleAutoSyncPush,
    getEpubPaginationTotal: () => {
      if (reader.type !== BOOK_TYPES.EPUB || !reader.paginator) return null;
      return reader.paginator.isComplete ? reader.pagination?.pages?.length : null;
    },
    setPendingCloudBookId: (id) => { pendingCloudBookId = id; },

  }
});

applyUiLanguage(uiLanguage);

function setupViewerIframeClickBridge() {
  if (!elements.viewer || !elements.fullscreenReader) return;

  const handleIframeClick = (iframe, event) => {
    const rect = iframe.getBoundingClientRect();
    const x = rect.left + event.clientX;
    const y = rect.top + event.clientY;
    const area = ui.getClickArea(x, y, elements.fullscreenReader);
    ui.handleAreaClick(area, event);
  };

  const bindIframe = (iframe) => {
    if (!iframe || iframe.dataset.clickBridgeBound === "true") return;
    iframe.dataset.clickBridgeBound = "true";

    const attachClickListener = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        doc.addEventListener("click", (event) => handleIframeClick(iframe, event));

        // タッチイベントも親へ転送（ズームやスワイプのため）
        const forwardTouchEvent = (e) => {
          // タッチ座標を親ウィンドウ基準に変換してはいないが、イベント自体を親に伝える
          // フルスクリーンリーダーがタッチを拾えるようにする
          const newEvent = new CustomEvent(e.type, {
            bubbles: true,
            cancelable: true,
            detail: e
          });
          // カスタムプロパティとしてオリジナルイベントのtouchesを付与
          newEvent.touches = e.touches;
          newEvent.changedTouches = e.changedTouches;
          newEvent.target = e.target;

          elements.fullscreenReader.dispatchEvent(newEvent);
        };

        doc.addEventListener("touchstart", forwardTouchEvent, { passive: false });
        doc.addEventListener("touchmove", forwardTouchEvent, { passive: false });
        doc.addEventListener("touchend", forwardTouchEvent, { passive: false });
        doc.addEventListener("touchcancel", forwardTouchEvent, { passive: false });

      } catch (error) {
        console.warn("Failed to attach iframe event bridge:", error);
      }
    };

    if (iframe.contentDocument?.readyState === "complete") {
      attachClickListener();
    } else {
      iframe.addEventListener("load", attachClickListener, { once: true });
    }
  };

  elements.viewer.querySelectorAll(DOM_SELECTORS.IFRAME).forEach(bindIframe);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.tagName === "IFRAME") {
          bindIframe(node);
          return;
        }
        node.querySelectorAll?.(DOM_SELECTORS.IFRAME).forEach(bindIframe);
      });
    });
  });

  observer.observe(elements.viewer, { childList: true, subtree: true });
}

setupViewerIframeClickBridge();

// 進捗バーのドラッグハンドラー
const progressBarHandler = new ProgressBarHandler({
  container: elements.progressBarPanel?.querySelector(DOM_SELECTORS.PROGRESS_TRACK),
  thumb: elements.progressThumb,
  getIsRtl: () => {
    if (currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR)) {
      return reader.imageReadingDirection === READING_DIRECTIONS.RTL;
    }
    if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
      return pageDirection === READING_DIRECTIONS.RTL;
    }
    return false;
  },
  onSeek: (percentage) => {
    // パーセンテージからページ位置を計算してジャンプ
    seekToPercentage(percentage);
  },
});

const floatProgressHandler = new ProgressBarHandler({
  container: elements.floatProgressTrack,
  thumb: elements.floatProgressThumb,
  getIsRtl: () => {
    if (currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR)) {
      return reader.imageReadingDirection === READING_DIRECTIONS.RTL;
    }
    if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
      return pageDirection === READING_DIRECTIONS.RTL;
    }
    return false;
  },
  onSeek: (percentage) => {
    seekToPercentage(percentage);
  },
});

// UI表示ロジックは renderers.js に移行済み

function handleToggleZoom(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  // ズーム切替（toggleZoom()内部でbodyクラスも制御済み）
  const zoomOn = reader.toggleZoom();
  renderers.updateZoomButtonLabel();

  // ズーム解除時はフローティングメニューを閉じてリーダー画面に戻す
  // （ズーム中はCSSで非表示だがDOMはvisible状態のため、解除時にメニューが残る問題を防止）
  if (!zoomOn) {
    renderers.toggleFloatOverlay(false);
  }
}

// ========================================
// 全画面切替
// ========================================

/**
 * ブラウザの全画面表示を切り替える
 * Fullscreen API を使用（F11相当）
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    // 全画面にする
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn('[toggleFullscreen] 全画面への切替に失敗しました:', err);
    });
  } else {
    // 全画面を解除する
    document.exitFullscreen().catch((err) => {
      console.warn('[toggleFullscreen] 全画面の解除に失敗しました:', err);
    });
  }
}

/**
 * 全画面ボタンのラベルを現在の全画面状態に合わせて更新する
 */
function updateFullscreenButtonLabel() {
  if (!elements.toggleFullscreen) return;
  const isFullscreen = !!document.fullscreenElement;
  elements.toggleFullscreen.textContent = isFullscreen
    ? UI_ICONS.FULLSCREEN_EXIT
    : UI_ICONS.FULLSCREEN_ENTER;
  elements.toggleFullscreen.title = isFullscreen
    ? t('fullscreenExitTitle')
    : t('fullscreenEnterTitle');
}

// 移行済み: updateSpreadModeButtonLabel, updateReadingDirectionButtonLabel, updateReadingDirectionEpubButtonLabel, updateZoomButtonLabel, updateProgressBarDirection

// 移行済み: updateAuthStatusDisplay, updateSyncStatusDisplay, updateFloatProgressBar

// ========================================
// ローディングオーバーレイ
// ========================================



// syncLogic.js に移行済み

// 移行済み: showCloudEmptyState, hideCloudEmptyState


// ========================================
// ファイル処理
// ========================================

async function handleFile(file) {
  clearArchiveWarnings();
  await pushCurrentBookSyncOnAction();
  showLoading();
  userOverrodeDirection = false;
  try {
    console.log(`Opening file: ${file.name}, type: ${file.type}, size: ${file.size}`);

    // 1. 環境に適した読み込み戦略を選択
    const strategy = fileHandler.selectLoadingStrategy(file, fileHandler.detectEnvironment());
    const isLargeFile = file.size > FILE_STRATEGY.LARGE_FILE_THRESHOLD;

    // 2. 先頭バイトのみでファイルタイプを判定（全バッファ不要）
    //    NotReadableError 発生時は自動リトライ
    const header = await fileHandler.readFileWithRetry(file,
      () => fileHandler.readFileHeader(file, FILE_STRATEGY.HEADER_BYTES));
    console.log(`File header loaded: ${header.byteLength} bytes`);

    // マジックナンバー優先、フォールバックとして拡張子判定
    const type = fileHandler.detectFileType(header) || fileHandler.detectFileType(file);
    if (!type) {
      hideLoading();
      alert(t ? t('errorFileLoadFailed') : "対応していないファイル形式です。");
      return;
    }
    console.log(`Detected file type: ${type}`);

    const isArchiveBook = type === BOOK_TYPES.ZIP || type === BOOK_TYPES.RAR;

    // 2.5. ストリーミングモード判定（能力ベース、OS非依存）
    //      ZIPファイルかつ端末のメモリ能力に対しファイルが大きすぎる場合、
    //      JSZipの一括展開ではなくzip.jsのストリーミングモードに切り替える
    const useStreaming = isArchiveBook && type === BOOK_TYPES.ZIP &&
      fileHandler.shouldUseStreaming(file);

    // ストリーミングモード時: ローディング画面にメモリ制限モードの通知を表示
    if (useStreaming) {
      showStreamingNotice();
    }

    // 3. ハッシュ計算（リトライ付き）
    //    画像書庫は fingerprint（File直接、バッファ不要）
    //    大容量EPUBは軽量ハッシュ（先頭1MB+末尾1MB+サイズ、ピークメモリ ~2MB）
    //    小容量EPUBは従来の全バッファハッシュ（高速）
    let contentHash;
    if (isArchiveBook) {
      contentHash = await fileHandler.buildArchiveFingerprint(file);
    } else if (isLargeFile) {
      // 大容量EPUB: file.arrayBuffer() を呼ばずにハッシュ計算
      contentHash = await fileHandler.readFileWithRetry(file,
        () => fileHandler.hashFileLightweight(file));
    } else {
      // 小容量EPUB: 従来の全バッファハッシュ（高速）
      contentHash = await fileHandler.readFileWithRetry(file,
        async () => fileHandler.hashBuffer(await file.arrayBuffer()));
    }

    // 移行方針: 既存のcontentHash一致を優先し、旧ID(短縮ハッシュ)一致なら旧IDを再利用して重複登録を防ぐ
    const existingRecord = fileHandler.findBookByContentHash(storage.data.library, contentHash);
    const id = existingRecord?.id ?? contentHash;
    const mime = fileHandler.guessMime(type, file);
    const source = storage.getSettings().source || SYNC_SOURCES.LOCAL;

    // 4. ファイル保存
    //    ストリーミングモード: 本体を保存しない（メタデータのみ）
    //    大容量: File オブジェクトを直接 OPFS に渡す（全バッファをメモリに載せない）
    //    小容量: arrayBuffer() で一括取得し IndexedDB に保存
    if (useStreaming) {
      console.log(`[Streaming] Stub mode: skipping file body save for ${id.substring(0, 12)}...`);
      // 本体保存スキップ — メタデータのみライブラリに記録
    } else {
      console.log(`Saving file to storage with ID: ${id.substring(0, 12)}...`);
      if (isLargeFile) {
        await saveFile(id, file, { fileName: file.name, mime }, source);
      } else {
        const bufferForSave = await fileHandler.readFileWithRetry(file, () => file.arrayBuffer());
        await saveFile(id, bufferForSave, { fileName: file.name, mime }, source);
      }
    }

    // type: "epub" | "zip" | "rar" として正式に保存
    const info = {
      id,
      title: fileHandler.fileTitle(file.name),
      type: type, // "epub" | "zip" | "rar"
      fileName: file.name,
      size: file.size,
      contentHash,
      lastOpened: Date.now(),
      // ストリーミング不要になった場合、過去の true を上書きしてスタブ状態を解除する
      isLargeFileStub: useStreaming,
    };

    storage.upsertBook(info);
    currentBookId = id;
    currentBookInfo = info;
    resetLocalSaveTracking();

    let cloudBookId = pendingCloudBookId ?? storage.getCloudBookId(id);
    if (cloudBookId) {
      // 紐付け時（pendingCloudBookId がある場合）の照合チェック
      if (pendingCloudBookId && syncLogic.isCloudSyncEnabled()) {
        const cloudMeta = storage.data.cloudIndex?.[cloudBookId];
        if (cloudMeta && cloudMeta.fingerprints && !cloudMeta.fingerprints.includes(contentHash)) {
          const proceed = confirm(translate('linkMismatchWarning'));
          if (!proceed) {
            hideLoading();
            pendingCloudBookId = null;
            return;
          }
        }
      }
      storage.setBookLink(id, cloudBookId);
    }
    if (syncLogic.isCloudSyncEnabled()) {
      if (!cloudBookId) {
        try {
          const matchResult = await cloudSync.matchBook(contentHash, fileHandler.buildMatchMeta(info));
          if (matchResult?.cloudBookId) {
            cloudBookId = matchResult.cloudBookId;
          } else if (matchResult?.candidates?.length > 0) {
            cloudBookId = await syncLogic.promptSyncCandidate(matchResult.candidates);
          }
        } catch (error) {
          console.warn("クラウドの照合に失敗しました:", error);
        }
      }
      if (!cloudBookId) {
        cloudBookId = fileHandler.generateCloudBookId();
      }
      if (cloudBookId) {
        storage.setBookLink(id, cloudBookId);
        await fileHandler.upsertCloudIndexEntry(cloudBookId, info, contentHash, {
          storage,
          cloudSync,
          isCloudSyncEnabled: syncLogic.isCloudSyncEnabled,
          uiLanguage
        });
      }
    }
    pendingCloudBookId = null;
    currentCloudBookId = cloudBookId;

    const syncedProgress = await syncLogic.resolveSyncedProgress(id, uiLanguage, cloudBookId, pushCurrentBookSync);
    const startLocation = syncedProgress?.location;
    const startProgress = syncedProgress?.percentage;

    renderers.hideCloudEmptyState();

    // 5. リーダーへの File オブジェクト渡し
    //    大容量: 元の File オブジェクトをそのまま渡す（バッファ二重消費を完全回避）
    //    小容量: 保存済みバッファからFileを再構築（従来互換）
    const fileToOpen = file; // File オブジェクトをそのまま渡す

    // 6. ビューアの切り替えと初期表示設定
    if (!isArchiveBook) {
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.remove(UI_CLASSES.HIDDEN);
        elements.viewer.classList.add(UI_CLASSES.VISIBLE);
      }
      if (elements.fullscreenReader) {
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL);
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL_MODE);
        elements.fullscreenReader.classList.remove('show-mode-indicator');
      }
      showLoading();
      console.time('[handleFile] openEpub');
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

      try {
        await reader.openEpub(fileToOpen, {
          location: startLocation,
          percentage: startProgress,
          epubViewMode: syncedProgress?.epubViewMode || epubViewMode,
          writingMode: syncedProgress?.writingMode || writingMode,
          pageDirection: syncedProgress?.pageDirection || pageDirection,
        });
        console.timeEnd('[handleFile] openEpub');
      } catch (epubError) {
        console.timeEnd('[handleFile] openEpub');
        // openEpub失敗時のみローディングを解除（成功時はapplyReadingState完了後に解除）
        hideLoading();
        throw epubError;
      }
    } else {
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      await reader.openImageBook(
        fileToOpen,
        typeof startLocation === "number" ? startLocation : 0,
        type,
        { streaming: useStreaming }
      );
    }

    // 2. 状態の適用（オープン後に実行することで初期化による上書きを防ぐ）
    console.time('[handleFile] applyReadingState');
    await applyReadingState(syncedProgress);
    console.timeEnd('[handleFile] applyReadingState');

    // 同期されたしおりをUIに反映
    renderers.renderBookmarks(bookmarkMenuMode);

    console.log("Book opened successfully");
    // ストリーミングモード通知を削除
    const streamingNotice = elements.loadingOverlay?.querySelector('.streaming-notice');
    if (streamingNotice) streamingNotice.remove();
    hideLoading();
    renderers.renderLibrary();
    renderers.renderBookmarkMarkers();
    renderers.updateProgressBarDisplay();
    renderers.updateSearchButtonState();
    renderers.updateFloatingUIButtons();
    closeExclusiveMenus();
    if (floatVisible) {
      toggleFloatOverlay(false);
    }
  } catch (error) {
    console.error("Error in handleFile:", error);
    console.error("Error stack:", error.stack);
    const resolvedCode = resolveErrorCode(error);
    if (resolvedCode) {
      error.code = error.code ?? resolvedCode;
    }

    // JSZipエラーは警告のみ（ファイルは正常に開ける可能性が高い）
    if (error.code === ERROR_CODES.JSZIP_WARNING) {
      console.warn("JSZip warning detected, but file may have opened successfully");
      // エラーダイアログを表示しない（ファイルが開けているため）
      hideLoading();
      return;
    }

    // より詳細なエラーメッセージ
    let userMessage = `${t('errorFileLoadFailed')}\n\n${t('errorFileName')}: ${file.name}\n${t('errorFileSize')}: ${(file.size / 1024 / 1024).toFixed(2)} MB\n\n`;

    if (error.code === ERROR_CODES.NO_IMAGES_FOUND) {
      userMessage += t('errorNoImagesFound');
    } else if (error.code === ERROR_CODES.IMAGE_LOAD_FAILED) {
      userMessage += t('errorImageLoadFailed');
    } else {
      userMessage += `${t('errorDetail')}: ${error.message}`;
    }

    hideLoading();
    alert(userMessage);
  }
}

/**
 * ストリーミングモード（機能制限モード）の通知を表示する
 */
function showStreamingNotice() {
  if (elements.loadingOverlay) {
    let notice = elements.loadingOverlay.querySelector('.streaming-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'streaming-notice';
      notice.style.cssText = 'color:#ffb74d;font-size:0.85rem;text-align:center;margin-top:12px;padding:0 16px;line-height:1.5;';
      notice.textContent = translate('streamingNotice', uiLanguage) || 'メモリが不足しているため、機能制限モード（ストリーミング）で読み込んでいます。一部の機能が利用できません。';
      elements.loadingOverlay.appendChild(notice);
    }
  }
}

function openCloudOnlyBook(cloudBookId) {
  const meta = storage.data.cloudIndex?.[cloudBookId];
  const state = storage.getCloudState(cloudBookId);
  currentBookId = null;
  currentBookInfo = null;
  currentCloudBookId = cloudBookId;
  resetLocalSaveTracking();

  if (elements.viewer) {
    elements.viewer.classList.add(UI_CLASSES.HIDDEN);
    elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
  }
  if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
  if (elements.emptyState) elements.emptyState.classList.remove(UI_CLASSES.HIDDEN);
  if (elements.progressBarPanel) elements.progressBarPanel.classList.add(UI_CLASSES.HIDDEN);
  if (elements.progressBarBackdrop) elements.progressBarBackdrop.classList.add(UI_CLASSES.HIDDEN);
  renderers.showCloudEmptyState({
    cloudBookId,
    title: meta?.title ?? t("cloudOnlyTitle"),
    progressPercentage: state?.progress ?? 0,
    lastTimestamp: state?.updatedAt ?? meta?.lastReadAt ?? meta?.updatedAt ?? 0,
  });
  renderers.updateProgressBarDisplay();
  renderers.updateSearchButtonState();
  closeExclusiveMenus();
  if (floatVisible) {
    toggleFloatOverlay(false);
  }
}

let stubReselectInput = null;

/**
 * スタブエントリー用ファイル再選択ダイアログ。
 * ユーザーにファイルを選ばせ、軽量ハッシュで同一ファイルか検証する。
 * @param {object} info - ライブラリのブック情報
 * @returns {Promise<File|null>} 選択されたFile、キャンセル時はnull
 */
function promptFileReselect(info) {
  return new Promise((resolve) => {
    // 恒久的な input 要素を準備（Android WebViewでのFileストリーム切断・無限ロードを防ぐためDOMから削除しない）
    if (!stubReselectInput) {
      stubReselectInput = document.createElement("input");
      stubReselectInput.type = "file";
      stubReselectInput.accept = SUPPORTED_FORMATS.IMAGE_ARCHIVE.join(",");
      stubReselectInput.style.display = "none";
      document.body.appendChild(stubReselectInput);
    }

    // 以前のイベントを確実に消すため要素を置き換える
    const newClone = stubReselectInput.cloneNode(true);
    stubReselectInput.parentNode.replaceChild(newClone, stubReselectInput);
    stubReselectInput = newClone;
    stubReselectInput.value = '';

    // カスタムダイアログUIの構築
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:sans-serif;";

    const dialog = document.createElement("div");
    dialog.style.cssText = "background:var(--bg-color, #fff);color:var(--text-color, #333);padding:24px;border-radius:8px;width:90%;max-width:400px;box-shadow:0 8px 24px rgba(0,0,0,0.2);";

    const title = document.createElement("h3");
    title.textContent = translate('stubReselectTitle', uiLanguage) || "ファイル再選択";
    title.style.cssText = "margin:0 0 16px 0;font-size:1.2rem;";

    const msgTemplate = translate('stubReselectMessage', uiLanguage) || "「{title}」は大容量ファイルのため本体が保存されていません。\n閲覧を再開するには元のファイルを選択してください。";
    const desc = document.createElement("p");
    desc.textContent = msgTemplate.replace('{title}', info.title);
    desc.style.cssText = "margin:0 0 24px 0;line-height:1.5;white-space:pre-wrap;font-size:0.95rem;";

    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = "display:flex;justify-content:flex-end;gap:12px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = translate('cancel', uiLanguage) || "キャンセル";
    cancelBtn.style.cssText = "padding:8px 16px;border:none;background:transparent;color:var(--text-color, #333);cursor:pointer;font-size:0.95rem;font-weight:bold;";

    const selectBtn = document.createElement("button");
    selectBtn.textContent = translate('selectFile', uiLanguage) || "ファイルを選択";
    selectBtn.style.cssText = "padding:8px 16px;border:none;background:var(--primary-color, #007bff);color:#fff;border-radius:4px;cursor:pointer;font-size:0.95rem;font-weight:bold;";

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(selectBtn);

    dialog.appendChild(title);
    dialog.appendChild(desc);
    dialog.appendChild(btnContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = () => {
      if (overlay.parentNode) {
        document.body.removeChild(overlay);
      }
    };

    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve(null);
    });

    selectBtn.addEventListener("click", () => {
      stubReselectInput.click();
    });

    stubReselectInput.addEventListener("change", () => {
      const file = stubReselectInput.files?.[0] ?? null;
      cleanup();
      resolve(file);
    }, { once: true });
  });
}

async function openFromLibrary(bookId, options = {}) {
  clearArchiveWarnings();
  await pushCurrentBookSyncOnAction();
  showLoading();
  // ★追加: UI描画更新のために少し待機
  await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

  try {

    userOverrodeDirection = false;
    const info = storage.data.library[bookId];

    // ========================================
    // スタブエントリー: ファイル再選択フロー
    // ========================================
    if (info?.isLargeFileStub) {
      hideLoading();

      const file = await promptFileReselect(info);
      if (!file) {
        // キャンセル
        return;
      }
      showLoading();
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));

      // 軽量ハッシュで同一ファイルか検証（リトライ付き）
      const reHash = await fileHandler.readFileWithRetry(file,
        () => fileHandler.buildArchiveFingerprint(file));

      if (reHash !== info.contentHash) {
        hideLoading();
        alert(translate('stubHashMismatch', uiLanguage) ||
          "選択されたファイルは登録済みのファイルと一致しません。\n正しいファイルを選択してください。");
        return;
      }

      // スタブファイルが正しく再選択された場合、以後の振る舞いを
      // 全て通常の「ファイルを開く」フローへ委譲し、動作を完全に統一する
      hideLoading();
      await handleFile(file, bookId);
      return;
    }

    // ========================================
    // 通常フロー: IndexedDB / OPFS から読み込み
    // ========================================
    const source = storage.getSettings().source || SYNC_SOURCES.LOCAL;
    const record = await loadFile(bookId, source);

    if (!record) {
      const cloudBookId = storage.getCloudBookId(bookId);
      if (cloudBookId) {
        openCloudOnlyBook(cloudBookId);
        return;
      }
      alert("保存済みファイルが見つかりません。再度アップロードしてください。");
      return;
    }

    const file = bufferToFile(record);
    if (!info) return;

    currentBookId = bookId;
    isBookLoading = true;
    currentBookInfo = info;
    resetLocalSaveTracking();
    currentCloudBookId = storage.getCloudBookId(bookId);
    if (syncLogic.isCloudSyncEnabled() && !currentCloudBookId && info?.contentHash) {
      try {
        const matchResult = await cloudSync.matchBook(info.contentHash, fileHandler.buildMatchMeta(info));
        if (matchResult?.cloudBookId) {
          currentCloudBookId = matchResult.cloudBookId;
          storage.setBookLink(bookId, currentCloudBookId);
        }
      } catch (error) {
        console.warn("クラウドの照合に失敗しました:", error);
      }
    }
    if (currentCloudBookId) {
      await fileHandler.upsertCloudIndexEntry(currentCloudBookId, info, info.contentHash, {
        storage,
        cloudSync,
        isCloudSyncEnabled: syncLogic.isCloudSyncEnabled,
        uiLanguage,
        overrides: { lastReadAt: Date.now() }
      });
    }

    const bookmarks = storage.getBookmarks(bookId);
    const progress = await syncLogic.resolveSyncedProgress(bookId, uiLanguage, currentCloudBookId, pushCurrentBookSync);
    const normalizedProgress = normalizeProgressSnapshot(progress, info.type);
    await applyReadingState(normalizedProgress);
    const explicitBookmark = options.bookmark;
    const startFromBookmark = explicitBookmark?.location ?? (options.useBookmark ? bookmarks[0]?.location : undefined);
    const start = startFromBookmark ?? normalizedProgress?.location;
    const startProgress = explicitBookmark?.percentage ?? normalizedProgress?.percentage;

    // 【修正】読み込み時にタイプを再判定（DB内の情報の誤りを補正）
    const detectedType = fileHandler.detectFileType(record.buffer);
    if (detectedType && detectedType !== info.type) {
      console.log(`タイプミスマッチを検出: ${info.type} -> ${detectedType}`);
      info.type = detectedType;
      storage.upsertBook(info);
    }

    renderers.hideCloudEmptyState();
    // isImageBook: zip または rar の場合
    const isImageBook = info.type === BOOK_TYPES.ZIP || info.type === BOOK_TYPES.RAR;
    if (!isImageBook) {
      // ... (既存のUI制御コード)
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.imageViewer) elements.imageViewer.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.remove(UI_CLASSES.HIDDEN);
        elements.viewer.classList.add(UI_CLASSES.VISIBLE);
      }
      if (elements.fullscreenReader) {
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL);
        elements.fullscreenReader.classList.remove(UI_CLASSES.EPUB_SCROLL_MODE);
        elements.fullscreenReader.classList.remove('show-mode-indicator');
      }

      showLoading();
      await new Promise(resolve => setTimeout(resolve, TIMING_CONFIG.DOM_RENDER_DELAY_MS));
      console.time('[libraryLoad] openEpub');
      await reader.openEpub(file, {
        location: start,
        percentage: startProgress,
        epubViewMode: normalizedProgress?.epubViewMode || epubViewMode,
        writingMode: normalizedProgress?.writingMode || writingMode,
        pageDirection: normalizedProgress?.pageDirection || pageDirection,
      });
      console.timeEnd('[libraryLoad] openEpub');
    } else {
      // ... (既存のUI制御コード)
      if (elements.emptyState) elements.emptyState.classList.add(UI_CLASSES.HIDDEN);
      if (elements.viewer) {
        elements.viewer.classList.add(UI_CLASSES.HIDDEN);
        elements.viewer.classList.remove(UI_CLASSES.VISIBLE);
      }
      if (elements.imageViewer) elements.imageViewer.classList.remove(UI_CLASSES.HIDDEN);

      // 通常保存された画像書庫でも、現在の端末メモリに対して大きすぎる場合はストリーミングに切替
      const streamingNeeded = (info.type === BOOK_TYPES.ZIP) && fileHandler.shouldUseStreaming(file);
      await reader.openImageBook(file, typeof start === "number" ? start : 0, info.type, { streaming: streamingNeeded });
    }

    // [修正] オープン処理の後に状態を再適用
    if (normalizedProgress) {
      await applyReadingState(normalizedProgress);
    }

    storage.addHistory(bookId);
    renderers.renderBookmarkMarkers();
    renderers.updateProgressBarDisplay();
    renderers.updateSearchButtonState();
    renderers.updateFloatingUIButtons();
    closeExclusiveMenus();
    if (floatVisible) {
      toggleFloatOverlay(false);
    }
  } catch (error) {
    console.error(error);
    alert(`ライブラリからの読み込みに失敗しました:\n\n${error.message}`);
  } finally {
    isBookLoading = false;
    hideLoading();
  }
}




// ========================================
// 進捗管理
// ========================================

function persistReadingState(update) {
  if (!currentBookId) return;
  const existing = storage.getProgress(currentBookId) ?? {};
  storage.setProgress(currentBookId, { ...existing, ...update });
}

function resetLocalSaveTracking() {
  lastSavedPercentage = null;
}

async function applyReadingState(progress) {
  // 書籍ごとの記録がない場合はリーダーの自動検出値を優先し、検出もなければデフォルト設定を使用
  const targetWritingMode = progress?.writingMode || reader.writingMode || defaultWritingMode;
  const targetPageDirection = progress?.pageDirection || reader.pageDirection || defaultPageDirection;
  const targetImageViewMode = progress?.imageViewMode || defaultImageViewMode;
  const targetEpubViewMode = progress?.epubViewMode || reader.epubViewMode || epubViewMode;

  // 1. 書字方向・開き方向の復元
  writingMode = targetWritingMode;
  if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;

  pageDirection = targetPageDirection;
  if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;

  // 1.5. 両方を適用（リーダー本体への反映）
  // 呼び出し元(handleFile/openFromLibrary)がloadingを管理するためスキップ
  // 初期化時の状態適用ではストレージ・クラウドへの再保存を抑制する（位置の上書きを防止）
  await applyReadingSettings(writingMode, pageDirection, { skipLoadingOverlay: true, ignoreForce: true });

  // 2. 表示モード（単ページ/見開き）の復元
  if (reader) {
    reader.imageViewMode = targetImageViewMode;
    renderers.updateSpreadModeButtonLabel();
  }

  // 2.5. 画像書庫の開き方向の復元
  // 画像書庫では pageDirection を imageReadingDirection として復元
  if (reader && reader.type !== BOOK_TYPES.EPUB) {
    reader.setImageReadingDirection(targetPageDirection);
    renderers.updateReadingDirectionButtonLabel();
    renderers.updateProgressBarDirection();
  }

  // 2.6. EPUB表示モードの復元
  if (reader && reader.type === BOOK_TYPES.EPUB) {
    // 初回ロード時は reader 側にすでに正しい値を渡して初期化しているため、強制上書き(force=true)でのパジネーション再構築を防ぐ。
    // UIの更新だけ行うため ignoreReaderUpdate を true にする。
    await applyEpubViewMode(targetEpubViewMode, false, true);
  }

  if (!progress) {
    // 新規書籍でも初期状態の表示を更新
    renderers.updateProgressBarDisplay();
    return;
  }

  // 3. テーマ・フォント等の復元
  if (progress.theme && progress.theme !== theme) {
    applyTheme(progress.theme);
  }
  if (Number.isFinite(progress.fontSize) && progress.fontSize !== fontSize) {
    applyFontSize(progress.fontSize);
  }
  if (progress.uiLanguage && progress.uiLanguage !== uiLanguage) {
    applyUiLanguage(progress.uiLanguage);
  }

  if (Number.isFinite(progress.percentage)) {
    lastSavedPercentage = progress.percentage;
  }

  // 最後に表示を確実に更新（しおりマーカー等）
  renderers.updateProgressBarDisplay();
}

function handleProgress(progress) {
  if (!currentBookId) return;

  const roundedPercentage = roundProgressPercentage(progress?.percentage);
  if (shouldPersistLocalProgress(roundedPercentage)) {
    storage.setProgress(currentBookId, {
      ...progress,
      percentage: roundedPercentage,
      writingMode,
      fontSize,
      theme,
      uiLanguage,
      pageDirection,
      epubViewMode,
      imageViewMode: reader?.imageViewMode,
    });
    lastSavedPercentage = roundedPercentage;
  }
  renderers.updateProgressBarDisplay();
}

function getEpubPaginationTotal() {
  const totalPages = reader.pagination?.pages?.length;
  if (totalPages) return totalPages;
  const totalLocations = reader.book?.locations?.total;
  if (totalLocations) return totalLocations;
  return null;
}

// 移行済み: updateProgressBarDisplay, renderBookmarkMarkers, renderFloatBookmarkMarkers

async function seekToPercentage(percentage) {
  if (!currentBookId || !currentBookInfo) return;

  if (currentBookInfo.type === BOOK_TYPES.EPUB) {
    // EPUBの場合はlocation（CFI）ベースでシーク
    console.log(`Seeking to ${percentage}%`);

    try {
      if (reader.usingPaginator && reader.pagination?.pages?.length) {
        const totalPages = reader.pagination.pages.length;
        const pageIndex = Math.max(0, Math.min(Math.round((percentage / 100) * totalPages) - 1, totalPages - 1));
        if (reader.pageController) {
          reader.pageController.goTo(pageIndex);
        } else {
          reader.renderEpubPage(pageIndex);
        }
        // UI側の進捗表示を即時更新
        ui.updateProgress(pageIndex, totalPages);
        return;
      }
      console.warn('Locations not generated yet');
    } catch (error) {
      console.error('Error seeking to percentage:', error);
    }
  } else {
    // 画像書籍の場合はページ数でシーク
    const totalPages = reader.imagePages?.length || 1;
    const pageIndex = Math.max(0, Math.min(Math.round((percentage / 100) * (totalPages - 1)), totalPages - 1));
    reader.goTo(pageIndex);
  }
}




async function handleBookReady(payload) {
  if (!currentBookInfo || !payload) return;

  const metadata = payload.metadata ?? payload;
  const toc = Array.isArray(payload.toc) ? payload.toc : [];
  currentToc = toc;

  // 方向判定とUI更新
  // 方向判定とUI更新
  if (currentBookInfo.type === BOOK_TYPES.EPUB) {
    const settings = storage.getSettings();
    const progress = storage.getProgress(currentBookId);

    // 優先順位: 1. 個別保存設定 > 2. メタデータ/自動判別 > 3. ユーザーデフォルト
    let targetPageDirection = progress?.pageDirection;
    let targetWritingMode = progress?.writingMode;
    let targetEpubViewMode = progress?.epubViewMode;

    // 1. 個別設定がない場合、メタデータまたはリーダーの自動判別値をチェック
    if (!targetPageDirection) {
      targetPageDirection = payload.direction || metadata.direction;
    }
    if (!targetWritingMode) {
      targetWritingMode = payload.writingMode;
    }

    // 2. まだ決まっていない場合、デフォルト設定を使用
    if (!targetPageDirection) {
      targetPageDirection = settings.defaultPageDirection;
    }
    if (!targetWritingMode) {
      targetWritingMode = settings.defaultWritingMode;
    }
    if (!targetEpubViewMode) {
      targetEpubViewMode = settings.epubViewMode;
    }

    // 適用
    if (!userOverrodeDirection) {
      // 本来の仕様では保存された progress が最優先だが、
      // ページ分割完了前に保存された default 値 (ltr) などのノイズを回避するため、
      // 保存値が default かつ リーダーが rtl を検出した場合は、検出値を優先する
      if (!progress?.pageDirection && payload.direction) {
        targetPageDirection = payload.direction;
      }
      if (!progress?.writingMode && payload.writingMode) {
        targetWritingMode = payload.writingMode;
      }

      pageDirection = targetPageDirection;
      writingMode = targetWritingMode || writingMode;
      epubViewMode = targetEpubViewMode || epubViewMode;

      if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;
      if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;
      if (elements.settingsEpubViewMode) elements.settingsEpubViewMode.value = epubViewMode;

      // 初期化時の状態適用 (リーダー側ではパジネーションはすでに走っているため ignoreReaderUpdate = true)
      await applyReadingSettings(writingMode, pageDirection, { skipLoadingOverlay: true, ignoreForce: true });
      await applyEpubViewMode(epubViewMode, false, true);
    }

    renderers.updateProgressBarDirection(); // 進捗バーの方向更新
  }

  const title = metadata.title || currentBookInfo.title;
  currentBookInfo.title = title;
  storage.upsertBook({ ...currentBookInfo, title });
  if (currentCloudBookId) {
    const author = metadata.creator || metadata.author || "";
    fileHandler.upsertCloudIndexEntry(currentCloudBookId, currentBookInfo, currentBookInfo?.contentHash, {
      storage,
      cloudSync,
      isCloudSyncEnabled: syncLogic.isCloudSyncEnabled,
      uiLanguage,
      overrides: {
        title,
        author,
      },
    }).catch((error) => {
      console.warn("クラウドメタデータの更新に失敗しました:", error);
    });
  }
  renderers.renderLibrary();
  renderers.renderToc(currentToc);

  // EPUBスクロールモードのクラスを設定（横書きのみ縦スクロール）
  const scheduleEpubScrollModeUpdate = (attempt = 0) => {
    if (reader?.writingMode != null) {
      renderers.updateEpubScrollMode();
      return;
    }
    if (attempt >= 5) {
      console.warn("[handleBookReady] Writing mode not resolved, skipping epub-scroll update");
      return;
    }
    setTimeout(() => scheduleEpubScrollModeUpdate(attempt + 1), TIMING_CONFIG.SCROLL_MODE_UPDATE_DELAY_MS);
  };
  scheduleEpubScrollModeUpdate();

  // locations生成は初期ロード時のメインスレッドブロックを避けるため無効化
  // 進捗表示はページベースの計算にフォールバックする
  if (currentBookInfo.type === BOOK_TYPES.EPUB) {

  }


}

// 移行済み: updateEpubScrollMode

// ========================================
// 目次管理
// ========================================

// 移行済み: renderToc, renderTocEntries

// ========================================
// しおり管理
// ========================================

// 移行済み: renderBookmarks

function addBookmark() {
  if (!currentBookId) {
    alert(t("openBookPrompt"));
    return;
  }

  const deviceSettings = storage.getSettings();
  const bookmark = reader.addBookmark(t("bookmarkDefault"), {
    deviceId: deviceSettings.deviceId,
    deviceColor: deviceSettings.deviceColor,
  });
  if (bookmark) {
    bookmark.updatedAt = Date.now();
    storage.addBookmark(currentBookId, bookmark);
    renderers.renderBookmarks(bookmarkMenuMode);
    renderers.renderBookmarkMarkers();

    requestCloudSyncIfNeeded(getProgressSnapshot());
  }
}

// ========================================
// ライブラリ・履歴
// ========================================

// 移行済み: renderLibrary, filterLibraryCards

// 移行済み: renderHistory

// ========================================
// テキスト検索（EPUB用）
// ========================================

async function performSearch(query) {
  console.log(`[Search] performSearch called target: "${query}"`);
  if (!query || !currentBookId || currentBookInfo?.type !== BOOK_TYPES.EPUB || !reader.book) {
    console.warn("[Search] Aborting: Missing query, book ID, EPUB type, or reader.book");
    return [];
  }

  if (elements.searchResults) {
    elements.searchResults.innerHTML = `<div class="search-loading">${t("searchLoading")}</div>`;
  }

  try {
    const searchResults = [];
    const spine = reader.book.spine;
    const locations = reader.book.locations;

    console.log(`[Search] Starting search across ${spine?.length || 0} spine items.`);

    // 各セクションを検索
    for (let i = 0; i < spine.length; i++) {
      const item = spine.get(i);

      try {
        console.log(`[Search] Loading section ${i}: ${item.href}`);
        // セクションを読み込む
        await item.load(reader.book.load.bind(reader.book));

        const doc = item.document || item.contents?.document;
        if (!doc) {
          console.warn(`[Search] Skipping section ${i}: No document available.`);
          continue;
        }

        // リーダー側のテキスト全抽出・セグメント計算機能を使用
        const spineItem = reader.spineItems?.[i];
        if (!spineItem) {
          item.unload();
          continue;
        }

        const matches = reader.findSearchMatchesInSpine(spineItem, query);

        // 結果を追加
        for (const match of matches) {
          // CFIを生成（セクションの開始位置を使用）
          const cfi = item.cfiBase;

          // パーセンテージを計算
          let percentage = 0;
          if (locations && locations.length > 0) {
            const sectionPercentage = locations.percentageFromCfi(cfi);
            percentage = Math.round(sectionPercentage * 100);
          } else {
            // locationsが利用できない場合は、spine内の位置で概算
            percentage = Math.round((i / spine.length) * 100);
          }

          searchResults.push({
            cfi,
            excerpt: match.excerpt,
            query,
            sectionLabel: item.href,
            percentage,
            sectionIndex: i,
            spineIndex: i,
            segmentIndex: match.segmentIndex,
          });
        }

        // メモリリークを防ぐためにセクションをアンロード
        item.unload();

      } catch (error) {
        console.warn(`[Search] Failed to search in section ${item.href}:`, error);
      }
    }

    console.log(`[Search] Search complete. Found ${searchResults.length} results.`);
    return searchResults;
  } catch (error) {
    console.error('[Search] Search processing failed entirely:', error);
    return [];
  }
}

// 移行済み: renderSearchResults

// ========================================
// モーダル制御
// ========================================

function isModalVisible(modal) {
  if (!modal) return false;
  if (modal.classList.contains(UI_CLASSES.BOOKMARK_MENU)) {
    return modal.classList.contains(UI_CLASSES.VISIBLE);
  }
  return !modal.classList.contains(UI_CLASSES.HIDDEN);
}

function openModal(modal) {
  if (!modal) return;
  // floatOverlay(blur) がモーダルより前面に残るのを防ぐ
  renderers.toggleFloatOverlay(false);
  if (elements.modalOverlay && modal.parentElement !== elements.modalOverlay) {
    elements.modalOverlay.appendChild(modal);
  }
  if (elements.modalOverlay) {
    elements.modalOverlay.classList.add(UI_CLASSES.VISIBLE);
  }
  if (modal.classList.contains(UI_CLASSES.BOOKMARK_MENU)) {
    modal.classList.add(UI_CLASSES.VISIBLE);
    ui.bookmarkMenuVisible = true;
  } else {
    modal.classList.remove(UI_CLASSES.HIDDEN);
  }

}

function closeModal(modal) {
  if (!modal) return;
  if (modal.classList.contains(UI_CLASSES.BOOKMARK_MENU)) {
    modal.classList.remove(UI_CLASSES.VISIBLE);
    ui.bookmarkMenuVisible = false;
  } else {
    modal.classList.add(UI_CLASSES.HIDDEN);
  }
  if (!elements.modalOverlay) return;
  const hasVisibleModal = Array.from(elements.modalOverlay.children).some((child) => {
    if (!(child instanceof HTMLElement)) return false;
    return isModalVisible(child);
  });
  if (!hasVisibleModal) {
    elements.modalOverlay.classList.remove(UI_CLASSES.VISIBLE);
  }
}

function closeExclusiveMenus() {
  closeModal(elements.bookmarkMenu);
  closeModal(elements.historyModal);
  closeModal(elements.searchModal);
  closeModal(elements.settingsModal);
  closeModal(elements.openFileModal);
  closeModal(elements.tocModal);
}

function openExclusiveMenu(modal) {
  closeExclusiveMenus();
  openModal(modal);
}

function openImageModal(src) {
  if (elements.modalImage) {
    elements.modalImage.src = src;
  }
  openModal(elements.imageModal);
}

// ========================================
// 設定
// ========================================

function applyTheme(newTheme) {
  theme = newTheme;
  document.body.dataset.theme = theme;
  reader.applyTheme(theme);
  storage.setSettings({ theme });
  persistReadingState({ theme });
  renderers.updateThemeToggleIcon();
  saveCurrentProgress({ force: true });
  requestCloudSyncIfNeeded({ force: true });
}

// 移行済み: updateThemeToggleIcon

function applyFontSize(nextSize) {
  if (!Number.isFinite(nextSize)) return;
  const clamped = Math.min(READER_CONFIG.FONT_SIZE_MAX, Math.max(READER_CONFIG.FONT_SIZE_MIN, Math.round(nextSize)));
  fontSize = clamped;
  reader.applyFontSize(fontSize);
  storage.setSettings({ fontSize });
  persistReadingState({ fontSize });
  saveCurrentProgress({ force: true });
  requestCloudSyncIfNeeded({ force: true });
}

function applyUiLanguage(nextLanguage) {
  if (!nextLanguage) return;
  uiLanguage = nextLanguage;
  storage.setSettings({ uiLanguage });
  document.documentElement.lang = uiLanguage === "en" ? "en" : "ja";
  elements.langJa?.classList.toggle(UI_CLASSES.ACTIVE, uiLanguage === "ja");
  elements.langEn?.classList.toggle(UI_CLASSES.ACTIVE, uiLanguage === "en");
  if (elements.langIcon) {
    elements.langIcon.src = uiLanguage === "ja" ? ASSET_PATHS.FLAG_JAPAN : ASSET_PATHS.FLAG_AMERICA;
  }
  persistReadingState({ uiLanguage });
  requestCloudSyncIfNeeded(getProgressSnapshot());

  const strings = getUiStrings(nextLanguage);
  document.title = strings.documentTitle;
  const appIconAlt = strings.appIconAlt ?? strings.documentTitle;
  if (elements.emptyStateIcon) elements.emptyStateIcon.alt = appIconAlt;
  if (elements.menuTitleImage) elements.menuTitleImage.alt = appIconAlt;
  if (elements.floatTitleImage) elements.floatTitleImage.alt = appIconAlt;
  if (elements.pageImage) elements.pageImage.alt = strings.pageImageAlt;
  if (elements.modalImage) elements.modalImage.alt = strings.modalImageAlt;
  const emptyTitle = elements.emptyState?.querySelector(DOM_SELECTORS.EMPTY_STATE_TITLE);
  const emptyDescription = elements.emptyState?.querySelector(DOM_SELECTORS.EMPTY_STATE_DESCRIPTION);
  if (emptyTitle) emptyTitle.textContent = strings.emptyTitle;
  if (emptyDescription) emptyDescription.textContent = strings.emptyDescription;
  if (elements.cloudAttachButton) elements.cloudAttachButton.textContent = strings.libraryAttachFile;
  if (elements.loadingText) elements.loadingText.textContent = strings.loadingText;
  if (elements.dropText) elements.dropText.textContent = strings.dropText;
  if (!currentBookId && currentCloudBookId) {
    const meta = storage.data.cloudIndex?.[currentCloudBookId];
    const state = storage.getCloudState(currentCloudBookId);
    renderers.showCloudEmptyState({
      cloudBookId: currentCloudBookId,
      title: meta?.title ?? strings.cloudOnlyTitle,
      progressPercentage: state?.progress ?? 0,
      lastTimestamp: state?.updatedAt ?? meta?.lastReadAt ?? meta?.updatedAt ?? 0,
    });
  }

  const setMenuLabel = (button, icon, text) => {
    const iconSpan = button?.querySelector(DOM_SELECTORS.MENU_ICON);
    if (iconSpan) iconSpan.textContent = icon;
    const label = button?.querySelector(DOM_SELECTORS.MENU_LABEL);
    if (label) label.textContent = text;
  };
  const setIconOnly = (button, icon) => {
    if (!button) return;
    button.textContent = icon;
  };
  const setFloatLabel = (button, icon, text) => {
    if (!button) return;
    button.textContent = `${icon} ${text}`;
  };
  setMenuLabel(elements.menuOpen, UI_ICONS.MENU_OPEN, strings.menuOpen);
  setMenuLabel(elements.menuLibrary, UI_ICONS.MENU_LIBRARY, strings.menuLibrary);
  setMenuLabel(elements.menuSearch, UI_ICONS.MENU_SEARCH, strings.menuSearch);
  setMenuLabel(elements.menuBookmarks, UI_ICONS.MENU_BOOKMARKS, strings.menuBookmarks);
  setMenuLabel(elements.menuHistory, UI_ICONS.MENU_HISTORY, strings.menuHistory);
  setMenuLabel(elements.menuSettings, UI_ICONS.SETTINGS, strings.menuSettings);
  if (elements.langJa) elements.langJa.textContent = strings.languageLabelJa;
  if (elements.langEn) elements.langEn.textContent = strings.languageLabelEn;
  if (elements.floatLangJaImg) elements.floatLangJaImg.alt = strings.languageOptionJa;
  if (elements.floatLangEnImg) elements.floatLangEnImg.alt = strings.languageOptionEn;
  setFloatLabel(elements.floatOpen, UI_ICONS.MENU_OPEN, strings.menuOpen);
  setFloatLabel(elements.floatPrevBook, UI_ICONS.AREA_LEFT, strings.menuPrevBook);
  setFloatLabel(elements.floatNextBook, UI_ICONS.AREA_RIGHT, strings.menuNextBook);
  setFloatLabel(elements.floatLibrary, UI_ICONS.MENU_LIBRARY, strings.menuLibrary);
  setFloatLabel(elements.floatSearch, UI_ICONS.MENU_SEARCH, strings.menuSearch);
  setFloatLabel(elements.floatBookmarks, UI_ICONS.MENU_BOOKMARKS, strings.menuBookmarks);
  setFloatLabel(elements.floatHistory, UI_ICONS.MENU_HISTORY, strings.menuHistory);

  if (elements.openToc) elements.openToc.textContent = strings.tocButton;
  if (elements.tocSectionTitle) elements.tocSectionTitle.textContent = strings.tocTitle;
  if (elements.floatSettings) {
    elements.floatSettings.textContent = UI_ICONS.SETTINGS;
    elements.floatSettings.setAttribute("aria-label", strings.menuSettings);
  }
  if (elements.openLangMenu) {
    elements.openLangMenu.textContent = UI_ICONS.LANGUAGE;
    elements.openLangMenu.setAttribute("aria-label", strings.languageMenuLabel);
  }
  if (elements.bookmarkMenuTitle) elements.bookmarkMenuTitle.textContent = strings.bookmarkTitle;
  if (elements.addBookmarkBtn) {
    elements.addBookmarkBtn.textContent = `${UI_ICONS.ADD} ${strings.addBookmark}`;
  }
  if (elements.searchModalTitle) elements.searchModalTitle.textContent = strings.searchTitle;
  if (elements.searchInput) elements.searchInput.placeholder = strings.searchPlaceholder;
  if (elements.searchBtn) {
    elements.searchBtn.textContent = `${UI_ICONS.MENU_SEARCH} ${strings.searchButton}`;
  }
  if (elements.tocModalTitle) elements.tocModalTitle.textContent = strings.tocTitle;
  if (elements.syncModalTitle) elements.syncModalTitle.textContent = strings.syncPromptTitle;
  if (elements.syncModalMessage) elements.syncModalMessage.textContent = strings.syncPromptMessage;
  if (elements.syncUseRemote) {
    elements.syncUseRemote.textContent = strings.syncPromptRemote.replace("{time}", "--");
  }
  if (elements.syncUseLocal) elements.syncUseLocal.textContent = strings.syncPromptLocal;
  if (elements.candidateModalTitle) elements.candidateModalTitle.textContent = strings.candidateModalTitle;
  if (elements.candidateModalMessage) {
    elements.candidateModalMessage.innerHTML = strings.candidateModalMessage.replace(/\n/g, "<br>");
  }
  if (elements.candidateUseLocal) elements.candidateUseLocal.textContent = strings.candidateUseLocal;
  setIconOnly(elements.closeBookmarkMenu, UI_ICONS.CLOSE);
  setIconOnly(elements.closeSearchModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeTocModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeFileModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeHistoryModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeSettingsModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeImageModal, UI_ICONS.CLOSE);
  setIconOnly(elements.closeCandidateModal, UI_ICONS.CLOSE);
  if (elements.closeCandidateModal) {
    elements.closeCandidateModal.setAttribute("aria-label", strings.closeButtonLabel);
  }
  // 巻ナビゲーションラベルの更新

  if (elements.openFileModalTitle) elements.openFileModalTitle.textContent = strings.openFileTitle;
  if (archiveWarningTypes.length > 0) {
    renderers.showArchiveWarnings(archiveWarningTypes);
  }
  if (elements.librarySectionTitle) elements.librarySectionTitle.textContent = strings.librarySectionTitle;
  if (elements.libraryViewGrid) {
    elements.libraryViewGrid.setAttribute("aria-label", strings.libraryViewGridLabel);
  }
  if (elements.libraryViewList) {
    elements.libraryViewList.setAttribute("aria-label", strings.libraryViewListLabel);
  }
  if (elements.librarySearchInput) {
    elements.librarySearchInput.placeholder = strings.library_search_placeholder;
  }
  if (elements.historyModalTitle) elements.historyModalTitle.textContent = strings.historyTitle;
  if (elements.settingsModalTitle) elements.settingsModalTitle.textContent = strings.settingsTitle;
  if (elements.settingsDisplayTitle) elements.settingsDisplayTitle.textContent = strings.settingsDisplayTitle;
  if (elements.settingsDeviceTitle) elements.settingsDeviceTitle.textContent = strings.settingsDeviceTitle;
  if (elements.settingsDefaultWritingModeLabel) {
    elements.settingsDefaultWritingModeLabel.textContent = strings.settingsDefaultWritingModeLabel;
  }
  if (elements.settingsDefaultPageDirectionLabel) {
    elements.settingsDefaultPageDirectionLabel.textContent = strings.settingsDefaultPageDirectionLabel;
  }
  if (elements.settingsDefaultImageViewModeLabel) elements.settingsDefaultImageViewModeLabel.textContent = strings.settingsDefaultImageViewModeLabel;
  if (elements.settingsEpubViewModeLabel) elements.settingsEpubViewModeLabel.textContent = strings.settingsEpubViewModeLabel;
  if (elements.progressDisplayModeLabel) elements.progressDisplayModeLabel.textContent = strings.progressDisplayModeLabel;
  if (elements.writingModeLabel) elements.writingModeLabel.textContent = strings.writingModeLabel;
  if (elements.pageDirectionLabel) elements.pageDirectionLabel.textContent = strings.pageDirectionLabel;
  if (elements.progressDisplayModeLabel) elements.progressDisplayModeLabel.textContent = strings.progressDisplayModeLabel;
  if (elements.deviceIdLabel) elements.deviceIdLabel.textContent = strings.deviceIdLabel;
  if (elements.deviceColorLabel) elements.deviceColorLabel.textContent = strings.deviceColorLabel;
  if (elements.deviceNameLabel) elements.deviceNameLabel.textContent = strings.deviceNameLabel;
  if (elements.settingsOneBookmarkPerBookLabel) {
    elements.settingsOneBookmarkPerBookLabel.textContent = strings.settingsOneBookmarkPerBookLabel;
  }
  if (elements.settingsOneBookmarkPerBook) {
    elements.settingsOneBookmarkPerBook.checked = !!oneBookmarkPerBook;
  }

  // デバイス情報の値をセット
  const deviceSettings = storage.getSettings();
  if (elements.deviceIdInput && deviceSettings.deviceId) {
    elements.deviceIdInput.value = deviceSettings.deviceId;
  }
  if (elements.deviceColorInput && deviceSettings.deviceColor) {
    elements.deviceColorInput.value = deviceSettings.deviceColor;
  }
  if (elements.deviceNameInput) {
    // storage.js の getDeviceInfo を使用
    elements.deviceNameInput.value = typeof getDeviceInfo === "function" ? getDeviceInfo() : "Unknown";
  }
  renderNotionSettingsStatus();

  if (elements.settingsAccountTitle) elements.settingsAccountTitle.textContent = strings.settingsAccountTitle;
  if (elements.settingsNotionTitle) elements.settingsNotionTitle.textContent = strings.settingsNotionTitle;
  if (elements.googleLoginButton) elements.googleLoginButton.textContent = strings.googleLoginLabel;
  if (elements.manualSyncButton) elements.manualSyncButton.textContent = strings.syncNowButton;
  if (elements.syncHint) elements.syncHint.textContent = strings.syncHint;
  if (elements.notionStatusLabel) elements.notionStatusLabel.textContent = strings.notionStatusLabel;
  if (elements.notionOauthUrlLabel) elements.notionOauthUrlLabel.textContent = strings.notionOauthUrlLabel;
  if (elements.notionWorkspaceLabel) elements.notionWorkspaceLabel.textContent = strings.notionWorkspaceLabel;
  if (elements.notionParentPageLabel) elements.notionParentPageLabel.textContent = strings.notionParentPageLabel;
  if (elements.notionDatabaseLabel) elements.notionDatabaseLabel.textContent = strings.notionDatabaseLabel;
  if (elements.notionConnectButton) elements.notionConnectButton.textContent = strings.notionConnectButton;
  if (elements.notionDisconnectButton) elements.notionDisconnectButton.textContent = strings.notionDisconnectButton;
  if (elements.notionHelpText) {
    elements.notionHelpText.textContent = tReplace(
      "notionHelpText",
      { url: getNotionUrlSample() },
      uiLanguage,
    );
  }
  if (elements.settingsSyncTitle) elements.settingsSyncTitle.textContent = strings.settingsSyncTitle;
  if (elements.settingsFirebaseTitle) elements.settingsFirebaseTitle.textContent = strings.settingsSyncTitle;
  if (elements.firebaseApiKeyLabel) elements.firebaseApiKeyLabel.textContent = strings.firebaseApiKeyLabel;
  if (elements.firebaseAuthDomainLabel) {
    elements.firebaseAuthDomainLabel.textContent = strings.firebaseAuthDomainLabel;
  }
  if (elements.firebaseProjectIdLabel) elements.firebaseProjectIdLabel.textContent = strings.firebaseProjectIdLabel;
  if (elements.firebaseStorageBucketLabel) {
    elements.firebaseStorageBucketLabel.textContent = strings.firebaseStorageBucketLabel;
  }
  if (elements.firebaseMessagingSenderIdLabel) {
    elements.firebaseMessagingSenderIdLabel.textContent = strings.firebaseMessagingSenderIdLabel;
  }
  if (elements.firebaseAppIdLabel) elements.firebaseAppIdLabel.textContent = strings.firebaseAppIdLabel;
  if (elements.firebaseMeasurementIdLabel) {
    elements.firebaseMeasurementIdLabel.textContent = strings.firebaseMeasurementIdLabel;
  }
  if (elements.syncStatus) {
    renderers.updateSyncStatusDisplay();
  }
  if (elements.settingsDataTitle) elements.settingsDataTitle.textContent = strings.settingsDataTitle;
  if (elements.exportDataBtn) elements.exportDataBtn.textContent = strings.exportData;
  if (elements.importDataLabel) {
    const input = elements.importDataLabel.querySelector(DOM_SELECTORS.IMPORT_DATA_INPUT);
    elements.importDataLabel.textContent = strings.importData;
    if (input) {
      elements.importDataLabel.appendChild(input);
    }
  }

  if (elements.themeSelect) {
    const options = elements.themeSelect.options;
    if (options[0]) options[0].textContent = strings.themeDark;
    if (options[1]) options[1].textContent = strings.themeLight;
  }
  if (elements.writingModeSelect) {
    const options = elements.writingModeSelect.options;
    if (options[0]) options[0].textContent = strings.writingModeHorizontal;
    if (options[1]) options[1].textContent = strings.writingModeVertical;
  }
  if (elements.pageDirectionSelect) {
    const options = elements.pageDirectionSelect.options;
    if (options[0]) options[0].textContent = strings.pageDirectionLtr;
    if (options[1]) options[1].textContent = strings.pageDirectionRtl;
  }
  if (elements.settingsDefaultWritingMode) {
    const options = elements.settingsDefaultWritingMode.options;
    if (options[0]) options[0].textContent = strings.writingModeHorizontal; // "横書き"
    if (options[1]) options[1].textContent = strings.writingModeVertical;   // "縦書き"
    elements.settingsDefaultWritingMode.value = defaultWritingMode;
  }
  if (elements.settingsDefaultPageDirection) {
    const options = elements.settingsDefaultPageDirection.options;
    if (options[0]) options[0].textContent = strings.pageDirectionRtl; // "右開き"
    if (options[1]) options[1].textContent = strings.pageDirectionLtr; // "左開き"
    elements.settingsDefaultPageDirection.value = defaultPageDirection;
  }
  if (elements.settingsDefaultImageViewMode) {
    const options = elements.settingsDefaultImageViewMode.options;
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === "single") options[i].text = strings.spreadModeSingle;
      if (options[i].value === "spread") options[i].text = strings.spreadModeDouble;
    }
  }

  if (elements.settingsEpubViewMode) {
    const options = elements.settingsEpubViewMode.options;
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === "paginated") options[i].text = strings.epubViewModePaginated;
      if (options[i].value === "scroll") options[i].text = strings.epubViewModeScroll;
    }
    elements.settingsEpubViewMode.value = epubViewMode;
  }

  if (elements.progressDisplayModeSelect) {
    const options = elements.progressDisplayModeSelect.options;
    if (options[0]) options[0].textContent = strings.progressDisplayPage;
    if (options[1]) options[1].textContent = strings.progressDisplayPercentage;
  }
  if (elements.fontPlus) elements.fontPlus.textContent = strings.fontIncreaseLabel;
  if (elements.fontMinus) elements.fontMinus.textContent = strings.fontDecreaseLabel;

  renderers.updateWritingModeToggleLabel();
  renderers.updateReadingDirectionEpubButtonLabel();
  renderers.updateSpreadModeButtonLabel();
  if (uiInitialized) {
    renderers.renderLibrary();
    renderers.renderHistory();
    renderers.renderBookmarks(bookmarkMenuMode);
    renderers.renderToc(currentToc);
    renderers.updateProgressBarDisplay();
    renderers.updateSearchButtonState();
    renderers.updateAuthStatusDisplay();
  }
}

// 移行済み: updateWritingModeToggleLabel

async function applyReadingSettings(nextWritingMode, nextPageDirection, options = {}) {
  const { skipLoadingOverlay = false, ignoreForce = false } = options;
  if (nextWritingMode) {
    writingMode = nextWritingMode;
  }
  if (nextPageDirection) {
    pageDirection = nextPageDirection;
  }

  // [修正] UIを即時更新 (重い処理の前に反映させる)
  if (elements.writingModeSelect) elements.writingModeSelect.value = writingMode;
  if (elements.pageDirectionSelect) elements.pageDirectionSelect.value = pageDirection;

  renderers.updateWritingModeToggleLabel();
  renderers.updateReadingDirectionEpubButtonLabel();
  renderers.updateFloatingUIButtons();

  // ローディング表示を追加し、レンダリングを待機
  // skipLoadingOverlay: 初回ブック読込中（handleBookReady経由）では
  // 呼び出し元がloadingを管理するためスキップする
  const isEpubOpen = currentBookInfo?.type === BOOK_TYPES.EPUB;
  const manageLoading = isEpubOpen && !options.skipLoadingOverlay;
  if (manageLoading) {
    showLoading();
    // スピナーが表示されるよう、ブラウザの描画サイクルを1回回す
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, TIMING_CONFIG.ANIMATION_FRAME_DELAY_MS)));
  }

  try {
    await reader.applyReadingDirection(writingMode, pageDirection);
    renderers.updateProgressBarDirection();
    renderers.updateEpubScrollMode();
    storage.setSettings({ writingMode, pageDirection });
    persistReadingState({ writingMode, pageDirection });
    if (!ignoreForce) {
      saveCurrentProgress({ force: true });
      requestCloudSyncIfNeeded({ force: true });
    }
  } catch (error) {
    console.error("Failed to apply reading settings:", error);
  } finally {
    if (manageLoading) {
      hideLoading();
    }
  }
}

function applyLibraryViewMode(mode) {
  libraryViewMode = mode;
  if (elements.libraryGrid) {
    elements.libraryGrid.dataset.view = mode;
  }
  elements.libraryViewGrid?.classList.toggle(UI_CLASSES.ACTIVE, mode === "grid");
  elements.libraryViewList?.classList.toggle(UI_CLASSES.ACTIVE, mode === "list");
  storage.setSettings({ libraryViewMode: mode });
}

function applyProgressDisplayMode(mode) {
  progressDisplayMode = mode;
  storage.setSettings({ progressDisplayMode: mode });
  renderers.updateProgressBarDisplay();
  renderers.renderBookmarkMarkers();
}

/**
 * EPUB表示モードの適用と保存
 */
async function applyEpubViewMode(mode, force = false, ignoreReaderUpdate = false) {
  const modeChanged = epubViewMode !== mode;
  if (!modeChanged && !force && (!reader || reader.epubViewMode === mode)) return;

  if (modeChanged) {
    epubViewMode = mode;
    storage.setSettings({ epubViewMode: mode });
  }

  if (reader && reader.type === BOOK_TYPES.EPUB) {
    // スクロールモード選択時は強制的に「横書き」にする
    let needsWritingModeUpdate = false;
    if (mode === 'scroll' && writingMode !== WRITING_MODES.HORIZONTAL) {
      writingMode = WRITING_MODES.HORIZONTAL;
      storage.setSettings({ writingMode });
      if (elements.writingModeSelect) {
        elements.writingModeSelect.value = writingMode;
      }
      needsWritingModeUpdate = true;
    }

    // 設定変更扱いとしてメニューを閉じる
    closeExclusiveMenus();

    if (ignoreReaderUpdate) {
      // 初期化時等、UIのみ更新しリーダーの再パジネーションは実行しない
      if (reader) reader.epubViewMode = mode;
    } else {
      // スクロールモード・ページめくりモードの切替時には再度パジネーションが必要になるため、
      // 現在位置を保存してからリパジネーションを実行する。
      showLoading();
      try {
        if (needsWritingModeUpdate) {
          // applyReadingSettingsの中でreader.applyReadingDirectionが呼ばれ、
          // そこで新しい epubViewMode に基づいたパジネーションが1回だけ実行される。
          await applyReadingSettings(writingMode, null);
        }

        // 設定変更扱いとして再描画・UIクラス適用・位置復元
        // reader.applyEpubViewMode内部で二重パジネーションのガードが行われる
        if (reader && reader.applyEpubViewMode) {
          await reader.applyEpubViewMode(mode, force);
        }

        // 個別書籍の状態としても保存
        persistReadingState({ epubViewMode: mode });
      } finally {
        hideLoading();
      }
    }
  }

  // スクロールモード時は縦横切替ボタンを無効化
  if (elements.toggleWritingMode) {
    if (mode === 'scroll') {
      elements.toggleWritingMode.classList.add('disabled');
      elements.toggleWritingMode.style.opacity = '0.5';
      elements.toggleWritingMode.style.cursor = 'not-allowed';
    } else {
      elements.toggleWritingMode.classList.remove('disabled');
      elements.toggleWritingMode.style.opacity = '';
      elements.toggleWritingMode.style.cursor = '';
    }
  }
}

/**
 * テーマ適用
 */


async function pushCurrentBookSync(options = {}) {
  const { force = false } = options;
  if (isBookLoading && !force) return false;
  // 送信前に現在の状態を強制保存
  saveCurrentProgress({ force: true });
  const didSync = await syncLogic.pushCurrentBookSync(currentBookId, currentCloudBookId);
  if (didSync) {
    updateCloudSyncSnapshot(getProgressSnapshot());
  }
  return didSync;
}

function isAutoSyncReady(authStatus = checkAuthStatus()) {
  if (!autoSyncEnabled || !currentCloudBookId) return false;
  if (!shouldEnableAutoSync(authStatus)) {
    syncAutoSyncPolicy(authStatus);
    return false;
  }
  return true;
}

async function pushCurrentBookSyncIfReady() {
  if (!isAutoSyncReady()) return;
  const authStatus = checkAuthStatus();
  if (!authStatus.authenticated) {
    syncAutoSyncPolicy(authStatus);
    return;
  }
  try {
    await pushCurrentBookSync();
  } catch (error) {
    console.error("Auto-sync failed:", error);
  }
}

async function pushCurrentBookSyncOnAction(options = {}) {
  const { force = false } = options;
  try {
    const progressSnapshot = getProgressSnapshot();
    saveCurrentProgress({ progressSnapshot, force });
    await requestCloudSyncIfNeeded({ progressSnapshot, force });
  } catch (error) {
    console.error("Auto-sync failed:", error);
  }
}

function getAutoSyncIntervalMs() {
  if (typeof document !== "undefined" && document.hidden) {
    return TIMING_CONFIG.BACKGROUND_SYNC_INTERVAL_MS;
  }
  return TIMING_CONFIG.PERIODIC_SYNC_MS;
}

function restartAutoSyncInterval() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
  if (!autoSyncEnabled) return;
  autoSyncInterval = setInterval(async () => {
    await pushCurrentBookSyncIfReady();
  }, getAutoSyncIntervalMs());
}

function toggleAutoSync(enabled) {
  autoSyncEnabled = enabled;
  storage.setSettings({ autoSyncEnabled: enabled });

  restartAutoSyncInterval();
}

function shouldEnableAutoSync() {
  return syncLogic.isCloudSyncEnabled();
}

function syncAutoSyncPolicy(authStatus = checkAuthStatus()) {
  const shouldEnable = shouldEnableAutoSync(authStatus);
  if (shouldEnable) {
    if (!autoSyncEnabled || !autoSyncInterval) {
      toggleAutoSync(true);
    }
  } else if (autoSyncEnabled) {
    toggleAutoSync(false);
  }
  return shouldEnable;
}

function scheduleAutoSyncPush() {
  void pushCurrentBookSyncOnAction({ force: true });
}

function exportData() {
  const data = storage.exportData();
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `epub-reader-backup-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  try {
    const text = await file.text();
    storage.importData(text);
    renderers.renderLibrary();
    renderers.renderHistory();
    alert("データを読み込みました");
  } catch (error) {
    alert("データの読み込みに失敗しました: " + error.message);
  }
}

const FILE_PICKER_ACCEPT_TYPES = Object.freeze([
  Object.freeze({ mime: MIME_TYPES.EPUB, extensions: SUPPORTED_FORMATS.EPUB }),
  Object.freeze({ mime: MIME_TYPES.CBZ, extensions: [`.${FILE_EXTENSIONS.CBZ}`] }),
  Object.freeze({ mime: MIME_TYPES.ZIP, extensions: [`.${FILE_EXTENSIONS.ZIP}`] }),
  Object.freeze({ mime: MIME_TYPES.RAR, extensions: [`.${FILE_EXTENSIONS.RAR}`] }),
  Object.freeze({ mime: MIME_TYPES.RAR_LEGACY, extensions: [`.${FILE_EXTENSIONS.RAR}`] }),
  Object.freeze({ mime: MIME_TYPES.CBR, extensions: [`.${FILE_EXTENSIONS.CBR}`] }),
]);

const FILE_INPUT_ACCEPT = Object.freeze([
  ...SUPPORTED_FORMATS.EPUB,
  ...SUPPORTED_FORMATS.IMAGE_ARCHIVE,
]);

function buildFilePickerOptions() {
  const accept = FILE_PICKER_ACCEPT_TYPES.reduce((map, entry) => {
    map[entry.mime] = entry.extensions;
    return map;
  }, {});
  return {
    types: [
      {
        accept,
      },
    ],
    excludeAcceptAllOption: false,
    multiple: true,
  };
}

function ensureLegacyFileInput() {
  const acceptValue = FILE_INPUT_ACCEPT.join(",");
  const existing = elements.fileInput ?? document.getElementById(DOM_IDS.LEGACY_FILE_INPUT);
  if (existing) {
    existing.accept = acceptValue;
    if (existing !== elements.fileInput && existing.dataset.listenerAttached !== "true") {
      existing.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) {
          handleFile(file);
        } else {
          pendingCloudBookId = null;
        }
        e.target.value = "";
      });
      existing.dataset.listenerAttached = "true";
    }
    return existing;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.id = DOM_IDS.LEGACY_FILE_INPUT;
  input.accept = acceptValue;
  input.style.display = "none";
  input.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    } else {
      pendingCloudBookId = null;
    }
    e.target.value = "";
  });
  input.dataset.listenerAttached = "true";
  document.body.appendChild(input);
  return input;
}

async function openFileDialog() {

  const openLegacyFileInput = () => {
    const input = ensureLegacyFileInput();
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch (e) {
        console.warn('showPicker failed, falling back to click:', e);
      }
    }
    input.click();
  };

  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const fileHandles = await window.showOpenFilePicker(buildFilePickerOptions());
      if (fileHandles.length === 0) return;

      const fileHandle = fileHandles[0];
      const file = await fileHandle.getFile();

      if (file) {
        await handleFile(file);
      }
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.warn('showOpenFilePicker failed, falling back to legacy input:', error);
    }
  }

  openLegacyFileInput();
}

/**
 * 削除マーク済み書籍を実際に削除する
 */
async function commitPendingDeletes() {
  if (pendingDeletes.size === 0) return;

  console.log(`[commitPendingDeletes] ${pendingDeletes.size}冊を削除します`);

  for (const { id, type } of pendingDeletes.values()) {
    try {
      if (type === 'local') {
        // ローカルファイル削除
        await deleteBook(id);
        // storageからも削除（リンクされたクラウドデータ含む）
        storage.removeBook(id);
      } else if (type === 'cloud') {
        // クラウドデータのみ削除
        storage.removeCloudData(id);
      }
      console.log(`[commitPendingDeletes] 削除完了 (${type}): ${id}`);
    } catch (error) {
      console.error(`[commitPendingDeletes] 削除に失敗 (${type}): ${id}`, error);
    }
  }

  // 削除マークをクリア
  pendingDeletes.clear();
}

function showLibrary() {
  // 削除マークをリセット（前回の状態をクリア）
  pendingDeletes.clear();

  openModal(elements.openFileModal);
  if (elements.librarySearchInput) {
    elements.librarySearchInput.value = "";
  }
  renderers.renderLibrary();

  // モーダルの閉じるボタンにイベントを追加
  const closeHandler = async () => {
    await commitPendingDeletes();
    closeModal(elements.openFileModal);
    elements.closeFileModal?.removeEventListener('click', closeHandler);
  };
  elements.closeFileModal?.addEventListener('click', closeHandler);

  // バックドロップクリックでも閉じる処理を追加
  const backdropHandler = async (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      await commitPendingDeletes();
      closeModal(elements.openFileModal);
      elements.openFileModal?.querySelector('.modal-backdrop')?.removeEventListener('click', backdropHandler);
    }
  };
  elements.openFileModal?.querySelector('.modal-backdrop')?.addEventListener('click', backdropHandler);
}

function showSearch() {
  if (!currentBookId || currentBookInfo?.type !== BOOK_TYPES.EPUB) {
    alert(t("searchEpubOnly"));
    return;
  }
  openExclusiveMenu(elements.searchModal);
  if (elements.searchInput) {
    elements.searchInput.value = '';
    elements.searchInput.focus();
  }
  if (elements.searchResults) {
    elements.searchResults.innerHTML = '';
  }
}

function showBookmarks() {
  bookmarkMenuMode = "all";
  renderers.renderBookmarks(bookmarkMenuMode);
  openExclusiveMenu(elements.bookmarkMenu);
}

function showHistory() {
  openExclusiveMenu(elements.historyModal);
  renderers.renderHistory();
}

function showSettings() {
  openExclusiveMenu(elements.settingsModal);
  const currentSettings = storage.getSettings();

  renderers.updateAuthStatusDisplay();
}

// ========================================
// イベントハンドラー
// ========================================

function setupEvents() {
  console.log('[setupEvents] Starting event setup...');
  console.log('[setupEvents] elements.menuOpen:', elements.menuOpen);
  console.log('[setupEvents] elements.leftMenu:', elements.leftMenu);

  // メニューアクション
  if (elements.menuOpen) {
    elements.menuOpen.addEventListener('click', (e) => {
      console.log('[menuOpen] Clicked!');
      e.stopPropagation();
      e.preventDefault();
      openFileDialog();
    });
    console.log('[setupEvents] menuOpen listener attached');
  } else {
    console.error('[setupEvents] elements.menuOpen is null or undefined!');
  }

  if (elements.menuLibrary) {
    elements.menuLibrary.addEventListener('click', () => {
      console.log('[menuLibrary] Clicked!');
      showLibrary();
    });
    console.log('[setupEvents] menuLibrary listener attached');
  } else {
    console.error('[setupEvents] elements.menuLibrary is null!');
  }

  if (elements.menuSearch) {
    elements.menuSearch.addEventListener('click', () => {
      console.log('[menuSearch] Clicked!');
      showSearch();
    });
  }

  if (elements.menuBookmarks) {
    elements.menuBookmarks.addEventListener('click', (e) => {
      console.log('[menuBookmarks] Clicked!');
      // イベントの伝播を防ぎ、背後の要素が誤認されるゴーストクリックを防止
      e.stopPropagation();
      e.preventDefault();
      showBookmarks();
    });
  }

  if (elements.menuHistory) {
    elements.menuHistory.addEventListener('click', () => {
      console.log('[menuHistory] Clicked!');
      showHistory();
    });
  }

  elements.floatOpen?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    openFileDialog();
  });

  elements.floatLibrary?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showLibrary();
  });

  elements.floatSearch?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showSearch();
  });

  elements.floatBookmarks?.addEventListener('click', () => {
    showBookmarks();
  });

  elements.floatHistory?.addEventListener('click', () => {
    showHistory();
  });

  elements.floatSettings?.addEventListener('click', () => {
    showSettings();
  });


  elements.menuSettings?.addEventListener('click', () => {
    showSettings();
  });


  elements.langJa?.addEventListener('click', () => applyUiLanguage("ja"));
  elements.langEn?.addEventListener('click', () => applyUiLanguage("en"));

  elements.toggleWritingMode?.addEventListener('click', async () => {
    // スクロールモード中は「縦書き」への切り替えを禁止
    if (epubViewMode === 'scroll') {
      alert(t("verticalScrollDisabled") || "シームレススクロール中は横書き固定となります");
      return;
    }

    const nextMode =
      writingMode === WRITING_MODES.VERTICAL ? WRITING_MODES.HORIZONTAL : WRITING_MODES.VERTICAL;
    await applyReadingSettings(nextMode, null);
    if (elements.writingModeSelect) {
      elements.writingModeSelect.value = writingMode;
    }
  });

  // 見開き/単ページ切替ボタン
  elements.toggleSpreadMode?.addEventListener('click', () => {
    reader.toggleImageViewMode();
    renderers.updateSpreadModeButtonLabel();
  });

  // 左開き/右開き切替ボタン (画像用)
  elements.toggleReadingDirectionImage?.addEventListener('click', () => {
    reader.toggleImageReadingDirection();
    renderers.updateReadingDirectionButtonLabel();
    renderers.updateProgressBarDirection();
  });

  // 左開き/右開き切替ボタン (EPUB用)
  elements.toggleReadingDirectionEpub?.addEventListener('click', async () => {
    userOverrodeDirection = true;
    const nextDirection =
      pageDirection === READING_DIRECTIONS.RTL ? READING_DIRECTIONS.LTR : READING_DIRECTIONS.RTL;
    await applyReadingSettings(null, nextDirection);
    if (elements.pageDirectionSelect) {
      elements.pageDirectionSelect.value = pageDirection;
    }
  });



  elements.fontPlus?.addEventListener('click', () => {
    applyFontSize((fontSize ?? UI_DEFAULTS.fontSize) + 1);
  });

  elements.fontMinus?.addEventListener('click', () => {
    applyFontSize((fontSize ?? UI_DEFAULTS.fontSize) - 1);
  });

  elements.toggleTheme?.addEventListener('click', () => {
    applyTheme(theme === "dark" ? "light" : "dark");
  });

  elements.toggleLanguage?.addEventListener('click', () => {
    applyUiLanguage(uiLanguage === "ja" ? "en" : "ja");
  });

  // 言語メニュー（フロートUI用・地球儀ボタン横）
  elements.openLangMenu?.addEventListener('click', () => {
    elements.floatLangMenu?.classList.toggle(UI_CLASSES.HIDDEN);
  });

  elements.floatLangJa?.addEventListener('click', () => {
    applyUiLanguage("ja");
    elements.floatLangMenu?.classList.add(UI_CLASSES.HIDDEN);
  });

  elements.floatLangEn?.addEventListener('click', () => {
    applyUiLanguage("en");
    elements.floatLangMenu?.classList.add(UI_CLASSES.HIDDEN);
  });

  elements.floatBackdrop?.addEventListener('click', (e) => {
    e.stopPropagation();
    renderers.toggleFloatOverlay(false);
  });

  elements.openToc?.addEventListener('click', () => {
    if (!currentBookInfo || currentBookInfo.type !== BOOK_TYPES.EPUB) return;
    openExclusiveMenu(elements.tocModal);
  });

  // ファイル選択
  elements.fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    } else {
      pendingCloudBookId = null;
    }
    e.target.value = "";
  });

  // しおり追加
  elements.addBookmarkBtn?.addEventListener('click', addBookmark);

  elements.libraryViewGrid?.addEventListener('click', () => applyLibraryViewMode("grid"));
  elements.libraryViewList?.addEventListener('click', () => applyLibraryViewMode("list"));

  // 進捗バーのページ入力
  let isEditingProgress = false;

  elements.currentPageInput?.addEventListener('focus', () => {
    isEditingProgress = true;
  });

  elements.currentPageInput?.addEventListener('blur', () => {
    isEditingProgress = false;
  });

  elements.currentPageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.target.blur(); // フォーカスを外してblurイベントをトリガー

      const value = parseInt(e.target.value, 10);
      if (!isNaN(value)) {
        if (progressDisplayMode === "page") {
          // ページ数モード
          if (currentBookInfo?.type === BOOK_TYPES.EPUB) {
            // EPUBの場合はページ数として扱う
            const totalPages = getEpubPaginationTotal();
            if (totalPages) {
              const percentage = (value / totalPages) * 100;
              seekToPercentage(Math.max(0, Math.min(percentage, 100)));
            } else {
              seekToPercentage(Math.max(0, Math.min(value, 100)));
            }
          } else if (currentBookInfo && (currentBookInfo.type === BOOK_TYPES.ZIP || currentBookInfo.type === BOOK_TYPES.RAR)) {
            // 画像書籍の場合はページ数として扱う
            const totalPages = reader.imagePages?.length || 1;
            const percentage = ((value - 1) / (totalPages - 1)) * 100;
            seekToPercentage(Math.max(0, Math.min(percentage, 100)));
          } else {
            // locations未生成のEPUBはパーセンテージとして扱う
            seekToPercentage(Math.max(0, Math.min(value, 100)));
          }
        } else {
          // パーセンテージモード
          seekToPercentage(Math.max(0, Math.min(value, 100)));
        }
      }
    }
  });

  // 設定
  elements.themeSelect?.addEventListener('change', (e) => {
    applyTheme(e.target.value);
  });

  elements.writingModeSelect?.addEventListener('change', async (e) => {
    if (epubViewMode === 'scroll' && e.target.value === WRITING_MODES.VERTICAL) {
      alert(t("verticalScrollDisabled") || "シームレススクロール中は横書き固定となります");
      e.target.value = WRITING_MODES.HORIZONTAL;
      return;
    }
    await applyReadingSettings(e.target.value, null);
  });

  elements.pageDirectionSelect?.addEventListener('change', async (e) => {
    userOverrodeDirection = true;
    await applyReadingSettings(null, e.target.value);
  });

  elements.settingsDefaultWritingMode?.addEventListener('change', (e) => {
    defaultWritingMode = e.target.value;
    storage.setSettings({ defaultWritingMode });
  });

  elements.settingsDefaultPageDirection?.addEventListener('change', (e) => {
    defaultPageDirection = e.target.value;
    storage.setSettings({ defaultPageDirection });
  });

  elements.settingsDefaultImageViewMode?.addEventListener('change', (e) => {
    defaultImageViewMode = e.target.value;
    storage.setSettings({ defaultImageViewMode });
  });

  elements.progressDisplayModeSelect?.addEventListener('change', (e) => {
    applyProgressDisplayMode(e.target.value);
  });

  elements.settingsOneBookmarkPerBook?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    oneBookmarkPerBook = enabled;
    storage.setSettings({ oneBookmarkPerBook: enabled });
  });

  // PWA Install Button
  elements.installButton?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to the install prompt: ${outcome}`);
    deferredPrompt = null;
    renderers.updateInstallButton(false);
  });

  elements.settingsEpubViewMode?.addEventListener('change', (e) => {
    applyEpubViewMode(e.target.value);
  });

  elements.googleLoginButton?.addEventListener('click', () => {
    const authStatus = checkAuthStatus();
    if (authStatus.authenticated) {
      logout();
      return;
    }
    // New Firebase Auth Login
    startGoogleLogin();
  });

  elements.notionOauthUrlInput?.addEventListener('input', (e) => {
    const nextValue = e.target.value.trim();
    const notionSettings = getNotionSettingsSnapshot();
    storage.setSettings({
      notionIntegration: {
        ...notionSettings,
        oauthUrl: nextValue,
      },
    });
  });

  elements.notionConnectButton?.addEventListener('click', handleNotionConnectClick);
  elements.notionDisconnectButton?.addEventListener('click', handleNotionDisconnectClick);

  // Manual sync button
  elements.manualSyncButton?.addEventListener('click', async () => {
    const authStatus = checkAuthStatus();
    if (!authStatus.authenticated) {
      if (elements.syncStatus) {
        elements.syncStatus.textContent = t('syncNeedsLoginStatus');
        renderers.setStatusClass(elements.syncStatus, UI_CLASSES.STATUS_ERROR);
      }
      return;
    }

    try {
      const settings = storage.getSettings();
      const resolvedSource = cloudSync.resolveSource(null, settings);
      if (resolvedSource !== SYNC_SOURCES.D1) {
        console.log('[manualSync] Enforcing D1 source for manual sync');
        storage.setSettings({ source: SYNC_SOURCES.D1 });
      }

      elements.manualSyncButton.disabled = true;
      elements.manualSyncButton.textContent = t('syncInProgress');
      if (elements.syncStatus) {
        elements.syncStatus.textContent = t('syncStarting');
        renderers.setStatusClass(elements.syncStatus, UI_CLASSES.STATUS_NEUTRAL);
      }

      // 送信前に現在の進捗を強制保存（最新状態を同期するため）
      saveCurrentProgress({ force: true });

      // クラウドからインデックスをプル
      await syncLogic.syncAllBooksFromCloud(uiInitialized, bookmarkMenuMode);

      // 開いている本があればその状態をプッシュ
      if (currentBookId && currentCloudBookId) {
        await syncLogic.pushCurrentBookSync(currentBookId, currentCloudBookId);
      }

      // SSOT: 同期完了後の最終的な永続化
      storage.save();

      if (elements.syncStatus) {
        elements.syncStatus.textContent = `${UI_ICONS.CHECK_MARK} ${t('syncCompleted')}`;
        renderers.setStatusClass(elements.syncStatus, UI_CLASSES.STATUS_SUCCESS);
        setTimeout(() => {
          elements.syncStatus.textContent = '';
          renderers.setStatusClass(elements.syncStatus, null);
        }, TIMING_CONFIG.STATUS_MESSAGE_DISPLAY_MS);
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
      if (elements.syncStatus) {
        let userMessage = t('syncFailed');
        let detailMessage = error.message;

        if (error.code === 'unavailable' ||
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('Network Error')) {
          userMessage = t('syncBlocked');
          detailMessage = t('syncBlockedDetail');
        } else if (error.code === 'permission-denied') {
          userMessage = t('syncPermissionError');
          detailMessage = t('syncPermissionDetail');
        }

        elements.syncStatus.textContent = `${UI_ICONS.ERROR_MARK} ${userMessage}`;
        renderers.setStatusClass(elements.syncStatus, UI_CLASSES.STATUS_ERROR);

        alert(`${userMessage}\n\n${detailMessage}\n\n${t('errorDetail')}: ${error.message}`);
      }
    } finally {
      if (elements.manualSyncButton) {
        elements.manualSyncButton.disabled = false;
        elements.manualSyncButton.textContent = t('syncNowButton');
      }
    }
  });

  elements.exportDataBtn?.addEventListener('click', exportData);

  elements.importDataInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importData(file);
  });

  // モーダル閉じる
  elements.closeFileModal?.addEventListener('click', () => closeModal(elements.openFileModal));
  elements.closeHistoryModal?.addEventListener('click', () => closeModal(elements.historyModal));
  elements.closeSettingsModal?.addEventListener('click', () => closeModal(elements.settingsModal));
  elements.closeImageModal?.addEventListener('click', () => closeModal(elements.imageModal));
  elements.closeSearchModal?.addEventListener('click', () => closeModal(elements.searchModal));
  elements.closeTocModal?.addEventListener('click', () => closeModal(elements.tocModal));
  elements.closeBookmarkMenu?.addEventListener('click', () => closeModal(elements.bookmarkMenu));
  elements.archiveWarningClose?.addEventListener('click', () => clearArchiveWarnings());

  // 検索機能
  const executeSearch = async () => {
    const query = elements.searchInput?.value?.trim();
    if (!query) {
      alert(t("searchMissingQuery"));
      return;
    }

    const results = await performSearch(query);
    renderers.renderSearchResults(results, query);
  };

  elements.searchBtn?.addEventListener('click', executeSearch);

  elements.searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      executeSearch();
    }
  });

  // モーダルバックドロップクリック
  [elements.openFileModal, elements.historyModal, elements.settingsModal, elements.imageModal, elements.searchModal, elements.tocModal].forEach(modal => {
    modal?.addEventListener('click', (e) => {
      if (e.target.classList.contains(UI_CLASSES.MODAL_BACKDROP) || e.target === modal) {
        closeModal(modal);
      }
    });
  });

  elements.modalOverlay?.addEventListener('click', (e) => {
    if (e.target !== elements.modalOverlay) return;
    e.stopPropagation();
    Array.from(elements.modalOverlay.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        closeModal(child);
      }
    });
  });

  // (※ epubScrollCenterClick のリスナーは二重トグルの原因となり削除済)

  // しおりメニューのバックドロップクリック
  elements.bookmarkMenu?.addEventListener('click', (e) => {
    // bookmarkMenuの直接クリック（背景部分）の場合は閉じる
    if (e.target === elements.bookmarkMenu) {
      closeModal(elements.bookmarkMenu);
    }
  });

  // 進捗バーパネルのクリックイベント伝播を止める（バックドロップに届かないように）
  elements.progressBarPanel?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 左メニューのクリックイベント伝播を止める
  elements.leftMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // ホイール操作でページ送り
  const wheelTarget = elements.fullscreenReader || elements.viewer;
  const wheelThrottleMs = 300;
  let lastWheelTime = 0;

  wheelTarget?.addEventListener('wheel', (event) => {
    // ズーム中はページ送りをスキップ（documentレベルのズームハンドラに任せる）
    if (reader.isZoomMode()) {
      return;
    }

    // EPUBのスクロールモード時はネイティブのスクロールを優先するため、ページめくりはしない
    if (epubViewMode === 'scroll' && reader && reader.type === BOOK_TYPES.EPUB) {
      return;
    }

    // モーダルが開いている場合は無視
    if (!elements.openFileModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.historyModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.settingsModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.imageModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.searchModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.syncModal?.classList.contains(UI_CLASSES.HIDDEN)) {
      return;
    }

    const targetElement = event.target instanceof Element ? event.target : null;
    if (targetElement?.closest(DOM_SELECTORS.CLICK_EXCLUDE_MENU)) {
      return;
    }

    event.preventDefault();

    const now = Date.now();
    if (now - lastWheelTime < wheelThrottleMs) {
      return;
    }

    // EPUBでスクロールモードの場合は、コンテナの端に到達しているか判定する
    if (epubViewMode === 'scroll' && reader && reader.type === BOOK_TYPES.EPUB && reader.viewer) {
      const viewer = reader.viewer;
      const isVertical = reader.writingMode === WRITING_MODES.VERTICAL;
      const isRtl = pageDirection === READING_DIRECTIONS.RTL;

      let isAtStart = false;
      let isAtEnd = false;
      // scrollLeft / scrollTop 等は小数点を含む場合があるため、余裕を持たせた判定(5px)を行う
      const threshold = 5;

      if (isVertical) {
        // 縦書き
        const scrollAbs = Math.abs(viewer.scrollLeft);
        const maxScroll = Math.max(0, viewer.scrollWidth - viewer.clientWidth);

        // writing-mode: vertical-rl の実装では scrollLeft が 0 の時が右端（開始）、そこから負に広がる
        if (viewer.scrollLeft === 0 || scrollAbs <= threshold) {
          isAtStart = true;
        } else if (scrollAbs >= maxScroll - threshold) {
          isAtEnd = true;
        }

        const wheelDir = event.deltaY > 0 ? 1 : (event.deltaY < 0 ? -1 : 0);

        // コンテナ端でなければネイティブスクロール（横）に変換
        if (wheelDir !== 0 && !isAtStart && !isAtEnd) {
          event.preventDefault();
          viewer.scrollBy({ left: -wheelDir * 60, behavior: 'auto' });
          return;
        } else if (wheelDir !== 0) {
          // 端にいる場合でも、さらにその方向へスクロールしようとした時だけページ遷移、逆ならスクロール
          if (wheelDir < 0) { // 上へ（前へ）
            if (isAtStart) {
              // スクロール端での自動遷移を廃止
              console.log('[Wheel] At start, ignoring scroll-up transition');
            } else {
              event.preventDefault();
              viewer.scrollBy({ left: -wheelDir * 60, behavior: 'auto' });
            }
          } else if (wheelDir > 0) { // 下へ（次へ）
            if (isAtEnd) {
              // スクロール端での自動遷移を廃止
              console.log('[Wheel] At end, ignoring scroll-down transition');
            } else {
              event.preventDefault();
              viewer.scrollBy({ left: -wheelDir * 60, behavior: 'auto' });
            }
          }
          return;
        }
      } else {
        // 横書き (上から下へスクロール)
        isAtStart = Math.floor(viewer.scrollTop) <= threshold;
        isAtEnd = Math.ceil(viewer.scrollTop) >= viewer.scrollHeight - viewer.clientHeight - threshold;

        const wheelDir = event.deltaY > 0 ? 1 : (event.deltaY < 0 ? -1 : 0);
        if (wheelDir !== 0) {
          // スロール開始位置で上（前）に戻ろうとした場合
          if (wheelDir < 0 && isAtStart) {
            // スクロール端での自動遷移を廃止
            console.log('[Wheel] At top, ignoring scroll-up transition');
          }
          // スクロール終端で下（次）に進もうとした場合
          else if (wheelDir > 0 && isAtEnd) {
            // スクロール端での自動遷移を廃止
            console.log('[Wheel] At bottom, ignoring scroll-down transition');
          }
        }
        return; // コンテナ端でなければネイティブスクロールに任せる
      }
    }

    // 通常のページめくりモード
    if (event.deltaY > 0) {
      reader.next();
    } else if (event.deltaY < 0) {
      reader.prev();
    }

    lastWheelTime = now;
  }, { passive: false });

  // キーボード操作
  document.addEventListener('keydown', (e) => {
    // モーダルが開いている場合は無視
    if (!elements.openFileModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.historyModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.settingsModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.imageModal?.classList.contains(UI_CLASSES.HIDDEN) ||
      !elements.searchModal?.classList.contains(UI_CLASSES.HIDDEN)) {
      return;
    }



    const isEpubScroll = epubViewMode === 'scroll' && reader && reader.type === BOOK_TYPES.EPUB;
    const isVertical = reader && reader.writingMode === WRITING_MODES.VERTICAL;
    const isRtl = pageDirection === READING_DIRECTIONS.RTL;

    switch (e.key) {
      case 'ArrowLeft':
        if (isEpubScroll && !isVertical) return; // 横書きのスクロールでは左右キーは無視
        if (isEpubScroll && isVertical) {
          // 縦書きスクロール時の左キー（通常は下のテキストへ＝次のページ方向）
          // （ネイティブスクロールに任せるためデフォルトアクションを妨げない）
          return;
        }
        if (pageDirection === READING_DIRECTIONS.RTL) {
          if (isEpubScroll && isVertical) return;
          reader.next(); // 右開きの場合、左キーで次ページ
        } else {
          if (isEpubScroll && isVertical) return;
          reader.prev();
        }
        break;
      case 'ArrowRight':
        if (isEpubScroll && !isVertical) return;
        if (isEpubScroll && isVertical) {
          return;
        }
        if (pageDirection === READING_DIRECTIONS.RTL) {
          if (isEpubScroll && isVertical) return;
          reader.prev(); // 右開きの場合、右キーで前ページ
        } else {
          if (isEpubScroll && isVertical) return;
          reader.next();
        }
        break;
// [BEFORE]
//      case 'ArrowUp':
//        if (isEpubScroll) return;
//        reader.prev();
//        break;
//      case 'ArrowDown':
//        if (isEpubScroll) return;
//        reader.next();
//        break;
// [AFTER]
// [BEFORE]
//      case 'ArrowUp':
//        if (isEpubScroll) return;
//        // 画像書庫の見開き表示時は単ページ進め/戻し（ズレ調整）
//        if (reader.isImageBook() && reader.imageViewMode === IMAGE_VIEW_MODES.SPREAD) {
//          if (reader.imageReadingDirection === READING_DIRECTIONS.RTL) {
//            reader.next(1); // 右開きなら上で進む
//          } else {
//            reader.prev(1); // 左開きなら上で戻る
//          }
//        } else {
//          reader.prev();
//        }
//        break;
//      case 'ArrowDown':
//        if (isEpubScroll) return;
//        // 画像書庫の見開き表示時は単ページ進め/戻し（ズレ調整）
//        if (reader.isImageBook() && reader.imageViewMode === IMAGE_VIEW_MODES.SPREAD) {
//          if (reader.imageReadingDirection === READING_DIRECTIONS.RTL) {
//            reader.prev(1); // 右開きなら下で戻る
//          } else {
//            reader.next(1); // 左開きなら下で進む
//          }
//        } else {
//          reader.next();
//        }
//        break;
// [AFTER]
      case 'ArrowUp':
        if (isEpubScroll) return;
        // 画像書庫の見開き表示時は単ページ戻り（ズレ調整）
        if (reader.isImageBook() && reader.imageViewMode === IMAGE_VIEW_MODES.SPREAD) {
          reader.prev(1);
        } else {
          reader.prev();
        }
        break;
      case 'ArrowDown':
        if (isEpubScroll) return;
        // 画像書庫の見開き表示時は単ページ進め（ズレ調整）
        if (reader.isImageBook() && reader.imageViewMode === IMAGE_VIEW_MODES.SPREAD) {
          reader.next(1);
        } else {
          reader.next();
        }
        break;
      case 'Enter':
        // 書籍を閲覧中のみ全画面を切り替える
        if (currentBookId) {
          e.preventDefault();
          toggleFullscreen();
        }
        break;
    }
  });

  window.addEventListener('pagehide', () => {
    void pushCurrentBookSyncOnAction({ force: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (!autoSyncEnabled) return;
    restartAutoSyncInterval();
  });
  // ズームボタン
  elements.toggleZoom?.addEventListener('click', handleToggleZoom);

  // 全画面切替ボタン
  elements.toggleFullscreen?.addEventListener('click', () => {
    toggleFullscreen();
  });

  // 全画面状態が変わった時にボタンラベルを更新
  // リペジネーションは window.resize イベント経由で自動的にトリガーされる
  // （ui.js の setupResizeHandler → onResize → reader.handleResize）
  document.addEventListener('fullscreenchange', () => {
    updateFullscreenButtonLabel();
  });

  // プログレスバー矢印
  elements.progressPrev?.addEventListener('click', () => {

    reader.prev(1); // 1ページずつ戻る
  });

  elements.progressNext?.addEventListener('click', () => {

    reader.next(1); // 1ページずつ進む
  });

  // ライブラリ検索入力欄
  elements.librarySearchInput?.addEventListener('input', (e) => {
    renderers.filterLibraryCards(e.target.value);
  });

  // ========================================
  // ドラッグ＆ドロップ (D&D) イベント
  // ========================================

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add(UI_CLASSES.IS_FILE_DRAGGING);
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 画面外または子要素への移動で判定が揺れるのを防ぐため、relatedTargetをチェック
    if (!e.relatedTarget) {
      document.body.classList.remove(UI_CLASSES.IS_FILE_DRAGGING);
    }
  });

  // オーバーレイ自体からも離脱判定（子要素対策）
  elements.dropOverlay?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove(UI_CLASSES.IS_FILE_DRAGGING);
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove(UI_CLASSES.IS_FILE_DRAGGING);

    const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
    if (droppedFiles.length > 0) {
      handleFile(droppedFiles[0]);
    }
  });

  // PWA Install Event Listeners
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    renderers.updateInstallButton(true);
    console.log('[PWA] beforeinstallprompt event fired');
  });

  window.addEventListener('appinstalled', (event) => {
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    renderers.updateInstallButton(false);
    console.log('[PWA] App was installed');
  });
}

// ========================================
// 初期化
// ========================================

function init() {
  console.log("Initializing Epub Reader...");
  console.log("[init] readyState:", document.readyState);
  console.log("[init] elements object:", elements);

  // ライブラリ読み込み確認
  console.log("JSZip:", typeof JSZip !== "undefined" ? UI_ICONS.CHECK_MARK : UI_ICONS.ERROR_MARK);
  console.log("ePub:", typeof ePub !== "undefined" ? UI_ICONS.CHECK_MARK : UI_ICONS.ERROR_MARK);

  // イベント設定
  setupEvents();

  // テーマ適用
  applyTheme(theme);
  if (!Number.isFinite(fontSize)) {
    const baseFont = Number.parseFloat(
      window.getComputedStyle(elements.viewer || document.body)?.fontSize
    );
    fontSize = Number.isFinite(baseFont) ? baseFont : UI_DEFAULTS.fontSize;
  }
  applyFontSize(fontSize);
  applyReadingSettings(writingMode, pageDirection);
  applyLibraryViewMode(libraryViewMode);
  applyProgressDisplayMode(progressDisplayMode);

  // 自動同期設定（ログイン時のみ有効）
  syncAutoSyncPolicy();

  // ライブラリレンダリング
  renderers.renderLibrary();

  // 検索ボタンの状態を更新
  renderers.updateSearchButtonState();

  // 全画面ボタンの初期ラベルを設定
  updateFullscreenButtonLabel();

  // WebNovel UI初期化
  setupWebNovelUI({ elements, openModal, closeModal, openExclusiveMenu, confirmModal: window.confirm, ui });

  console.log("Epub Reader initialized");
}

function initializeGoogleLogin() {
  try {
    initGoogleLogin({ prompt: false });
    googleLoginReady = true;
  } catch (error) {
    console.error("Google login initialization failed:", error);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register("./service-worker.js")
    .catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
}

function startApp() {
  init();
}

// 外部公開用 WebNovel読込関数
async function loadWebNovel(novelInfo, episodes, provider, episodeIndex = 0) {
  elements.emptyState?.classList.add(UI_CLASSES.HIDDEN);

  currentBookId = novelInfo.id;
  currentBookInfo = {
    id: novelInfo.id,
    title: novelInfo.title,
    author: novelInfo.author,
    url: novelInfo.url,
    providerName: novelInfo.providerName,
    type: BOOK_TYPES.WEB_NOVEL
  };

  closeModal(elements.webNovelTocModal);
  closeModal(elements.webNovelSearchModal);
  closeModal(elements.leftMenu);

  showLoading("読込中...");

  try {
    await reader.openWebNovel(novelInfo, episodes, provider, episodeIndex);
    renderers.updateBookInfo(novelInfo.title, novelInfo.author || "");

    // ライブラリ/履歴用にスタブ情報を保存
    const stubFile = new File(["webnovel_stub"], `webnovel_${novelInfo.id}.txt`, { type: MIME_TYPES.WEB_NOVEL });
    await saveFile(stubFile, currentBookId, {
      title: novelInfo.title,
      author: novelInfo.author,
      type: BOOK_TYPES.WEB_NOVEL,
      novelUrl: novelInfo.url,
      provider: novelInfo.providerName
    });
    renderers.renderHistory();
  } catch (e) {
    console.error(e);
    alert("エラー: " + e.message);
  } finally {
    hideLoading();
  }
}

// グローバルに公開（web-novel-ui.jsから呼べるようにする）
window.app = window.app || {};
window.app.loadWebNovel = loadWebNovel;

function startAfterDomReady() {
  registerServiceWorker();
  initializeGoogleLogin();
  startApp();
}

// auth:login リスナーを上部の初期化フローに移動したため、ここは削除

window.addEventListener("load", () => {
  if (!googleLoginReady) {
    initializeGoogleLogin();
  }
});

// DOMContentLoadedイベントを待ってから初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAfterDomReady);
} else {
  startAfterDomReady();
}

```

### assets/reader.js

```javascript
/**
 * reader.js - リーダーコントローラー
 * 
 * EPUB/画像書庫の表示とナビゲーションを管理します。
 */

import { EpubPaginator } from "../src/reader/epubPaginator.js";
import {
  CDN_URLS,
  ASSET_PATHS,
  READER_CONFIG,
  DOM_IDS,
  DOM_SELECTORS,
  UI_CLASSES,
  DATA_ATTRS,
  BOOK_TYPES,
  WRITING_MODES,
  READING_DIRECTIONS,
  IMAGE_VIEW_MODES,
  EPUB_VIEW_MODES,
  CSS_WRITING_MODES,
  UI_DEFAULTS,
  MEMORY_STRATEGY,
  READER_LOADING_PHASES,
  READER_LOADING_STATUSES,
} from "./constants.js";
import { createArchiveHandler, EpubArchiveHandler } from "./js/core/archive-handler.js";
import { calculateProgressPercentage } from "./js/core/progress-utils.js";
import { WebNovelViewer } from "./js/core/web-novel-viewer.js";

const TEXT_SEGMENT_STEP = READER_CONFIG.TEXT_SEGMENT_STEP;
const getMemoryStrategy = () => {
  if (typeof window !== "undefined" && window.EPUB_READER_CONFIG?.MEMORY_STRATEGY) {
    return window.EPUB_READER_CONFIG.MEMORY_STRATEGY;
  }
  return MEMORY_STRATEGY;
};
const getReaderLineHeight = () => READER_CONFIG.lineHeight ?? READER_CONFIG.DEFAULT_LINE_HEIGHT;
const normalizeRelativePath = (path) => {
  if (!path) return path;
  const normalized = path.replace(/\\/g, "/");
  const withoutQuery = normalized.split(/[?#]/)[0];
  try {
    const dummyBase = "http://dummy";
    const fullUrl = new URL(withoutQuery, dummyBase);
    return fullUrl.pathname.replace(/^\//, "");
  } catch (error) {
    const parts = withoutQuery.split("/").filter(p => p && p !== ".");
    const result = [];
    for (const part of parts) {
      if (part === ".." && result.length > 0) {
        result.pop();
      } else if (part !== "..") {
        result.push(part);
      }
    }
    return result.join("/");
  }
};
const safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};
const safeEncodeURI = (value) => {
  try {
    return encodeURI(value);
  } catch (error) {
    return value;
  }
};
const normalizeResourceEncoding = (value) => {
  if (!value) return value;
  const decoded = safeDecodeURIComponent(value);
  return safeEncodeURI(decoded);
};
const normalizeResourcePath = (url, spineItem) => {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  const normalized = url.replace(/\\/g, "/");
  const [pathPart] = normalized.split(/[?#]/);

  if (!spineItem?.href) {
    return normalizeRelativePath(pathPart);
  }

  const baseParts = spineItem.href.replace(/\\/g, "/").split("/").slice(0, -1);
  const base = baseParts.join("/");

  if (!base) {
    return normalizeRelativePath(pathPart);
  }

  if (pathPart.startsWith("/")) {
    return normalizeRelativePath(pathPart.replace(/^\/+/, ""));
  }

  const isExplicitRelative = pathPart.startsWith("./") || pathPart.startsWith("../");
  const hasDirectory = pathPart.includes("/");
  if (!isExplicitRelative && hasDirectory && !pathPart.startsWith(`${base}/`)) {
    return normalizeRelativePath(pathPart);
  }

  const shouldResolve = !pathPart.startsWith(`${base}/`) && pathPart !== base;
  const combined = shouldResolve ? `${base}/${pathPart}` : pathPart;
  return normalizeRelativePath(combined);
};
const normalizeResourceKey = (url, spineItem, book) => {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  const normalized = normalizeResourcePath(url, spineItem);
  const resolved = book?.path?.resolve ? book.path.resolve(normalized) : normalized;
  const encoded = normalizeResourceEncoding(resolved);
  return normalizeRelativePath(encoded);
};
const normalizeResourceComparisonKey = (url, spineItem, book) => {
  const normalized = normalizeResourceKey(url, spineItem, book);
  if (!normalized) return normalized;
  return normalized.replace(/\.[^./?#]+$/, (ext) => ext.toLowerCase());
};
const normalizeResourceFilenameKey = (filename) => {
  if (!filename) return filename;
  const encoded = normalizeResourceEncoding(filename);
  return encoded.replace(/\.[^./?#]+$/, (ext) => ext.toLowerCase());
};
const normalizeZipEntryKey = (value, { lowerCase = false } = {}) => {
  if (!value) return value;
  const decoded = safeDecodeURIComponent(value);
  const normalized = decoded.replace(/\\/g, "/");
  return lowerCase ? normalized.toLowerCase() : normalized;
};

class PageController {
  constructor(onChange) {
    this.onChange = onChange;
    this.currentIndex = 0;
    this.totalPages = 0;
  }

  setTotalPages(totalPages) {
    this.totalPages = Math.max(0, totalPages || 0);
    if (this.totalPages === 0) {
      this.currentIndex = 0;
      return;
    }
    this.currentIndex = Math.min(this.currentIndex, this.totalPages - 1);
  }

  goTo(index) {
    if (this.totalPages === 0) return;
    const clamped = Math.max(0, Math.min(index, this.totalPages - 1));
    this.currentIndex = clamped;
    this.onChange?.(clamped);
  }

  next() {
    this.goTo(this.currentIndex + 1);
  }

  prev() {
    this.goTo(this.currentIndex - 1);
  }
}

export class ReaderController {
  constructor({
    viewerId,
    webNovelViewerId,
    imageViewerId,
    imageElementId,
    pageIndicatorId,
    onProgress,
    onLoadingUpdate,
    onReady,
    onImageZoom,
    onRepaginationStart,
    onRepaginationEnd,
  }) {
    this.viewer = document.getElementById(viewerId);
    this.webNovelViewerContainer = document.getElementById(webNovelViewerId || DOM_IDS.WEB_NOVEL_VIEWER);
    this.imageViewer = document.getElementById(imageViewerId);
    this.imageElement = document.getElementById(imageElementId);
    this.pageIndicator = document.getElementById(pageIndicatorId);
    this.onProgress = onProgress;
    this.onLoadingUpdate = onLoadingUpdate;
    this.onReady = onReady;
    this.onImageZoom = onImageZoom;
    this.onRepaginationStart = onRepaginationStart;
    this.onRepaginationEnd = onRepaginationEnd;
    this.rendition = null;
    this.book = null;
    this.type = null; // BOOK_TYPES.EPUB | BOOK_TYPES.IMAGE
    this.archiveHandler = null;
    this.imagePages = [];
    this.imageIndex = 0;
    this.imageEntries = [];
    this.imagePageErrors = [];
    this.imageLoadToken = 0;
    this.imageArchiveSize = 0;
    this.imageViewMode = IMAGE_VIEW_MODES.SINGLE;
    this.imageReadingDirection = READING_DIRECTIONS.LTR; // READING_DIRECTIONS.LTR = 左開き, READING_DIRECTIONS.RTL = 右開き
    this.imageZoomed = false;
    this.repaginationRequestId = 0;
    this.theme = UI_DEFAULTS.theme;
    this.writingMode = WRITING_MODES.HORIZONTAL;
    this.pageDirection = READING_DIRECTIONS.LTR;
    this.epubViewMode = EPUB_VIEW_MODES.PAGINATED;
    this.preferredWritingMode = null;
    this.paginator = null;
    this.pagination = null;
    this.paginationPromise = null;
    this.paginationComplete = false;
    this.currentPageIndex = 0;
    this.usingPaginator = false;
    this.resourceUrlCache = new Map();
    this.zipFileKeyMap = null;
    this.resourceLoader = null;
    this.pageContainer = null;
    this.fontSize = null;
    this.spineItems = [];
    this.pageController = new PageController((index) => {
      this.renderEpubPage(index);
    });
    this.imageZoomBound = false;
    this.pageDimensionCache = {}; // [追加] 画像サイズ情報のキャッシュ
    this.toc = [];
    this.resizeTimer = null;

    // WebNovelViewer 初期化
    this.webNovelViewer = new WebNovelViewer({
      containerId: webNovelViewerId || DOM_IDS.WEB_NOVEL_VIEWER,
      onProgress: (info) => {
        if (this.onProgress) this.onProgress(info);
      }
    });

    // [New] Zoom State
    this.zoomScale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.isPinching = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.pinchStartDistance = 0;
    this.pinchStartScale = 1.0;
    this.transformFrame = null;
    this.pendingTransform = false;

    this._pendingScrollToSegment = null;
    this._pendingScrollSearchQuery = null;
    this._pendingScrollHighlight = true;

    // [New] Scroll position caching for Android/mobile backgrounding stability
    this._lastValidScrollLocation = null;
    this._lastValidScrollRatio = 0;

    // Bind global pan events
    this.bindPanEvents();
    this.bindZoomEvents();
    this.bindEpubScrollEvents();
    this.setupZoomSlider();
  }

  bindEpubScrollEvents() {
    if (!this.viewer) return;

    // epubScrollCenterClick の発火処理は ui.js 側と重複して二重トグルの原因となるため削除

    // スクロールモード時の現在位置の保存（進捗更新）
    // 既存のリスナーが蓄積されないよう、イベントを再登録するのではなく一度だけバインドするなどの工夫は ui.js 側で行うか、ここで管理
    if (!this._hasBoundScrollEvent) {
      this._hasBoundScrollEvent = true;
      let scrollTimeout;

      this.viewer.addEventListener('scroll', () => {
        // type が EPUB で、スクロールモードの場合のみ処理する
        if (this.type !== BOOK_TYPES.EPUB || this.epubViewMode !== EPUB_VIEW_MODES.SCROLL || !this.pagination) return;

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          if (!this.pagination || !this.pagination.pages) return;
          // スクロール停止後500msで進捗・現在位置を計算し、onProgressコールバックを発火
          this.updateProgressFromPagination(this.pagination.pages.length);
        }, 500);
      }, { passive: true });
    }
  }

  getReaderMaxWidthValue() {
    const root = document.documentElement;
    const cssValue = root
      ? getComputedStyle(root).getPropertyValue("--reader-max-width").trim()
      : "";
    return cssValue || READER_CONFIG.layout?.maxWidth || "";
  }

  resolveCssWidthPx(value, referenceElement = null) {
    if (!value) return null;
    const host = referenceElement || this.viewer || document.body;
    if (!host) return null;
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.width = value;
    host.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return Number.isFinite(width) && width > 0 ? width : null;
  }

  getEffectiveContentWidth(viewportWidth, maxWidthValue = "") {
    const resolvedMaxWidth = maxWidthValue || this.getReaderMaxWidthValue();
    const maxWidthPx = this.resolveCssWidthPx(resolvedMaxWidth);
    if (!maxWidthPx) return viewportWidth;
    return Math.min(viewportWidth, maxWidthPx);
  }

  emitLoadingUpdate({ phase, status, current, total } = {}) {
    if (!this.onLoadingUpdate || !phase || !status) return;
    const percentage =
      Number.isFinite(current) && Number.isFinite(total) && total > 0
        ? Math.round((current / total) * 100)
        : null;
    this.onLoadingUpdate({
      phase,
      status,
      current,
      total,
      percentage,
    });
  }

  resetReaderState() {
    if (this.rendition?.destroy) {
      try {
        this.rendition.destroy();
      } catch (error) {
        console.warn("Failed to destroy rendition:", error);
      }
    }
    if (this.book?.destroy) {
      try {
        this.book.destroy();
      } catch (error) {
        console.warn("Failed to destroy book:", error);
      }
    }
    this.rendition = null;
    this.book = null;
    this.type = null; // "epub" | "image" | "web_novel"
    this.archiveHandler = null;
    this.revokeImagePages();
    this.imagePages = [];
    this.imageIndex = 0;
    this.imageEntries = [];
    this.imagePageErrors = [];
    this.imageLoadToken = 0;
    this.imageZoomed = false;
    if (this.currentPaginationRun) {
      this.currentPaginationRun.cancelled = true;
      this.currentPaginationRun = null;
    }
    this._pendingScrollToSegment = null;
    this._pendingScrollSearchQuery = null;
    this._pendingScrollHighlight = true;
    this._isInitialReadyCalled = false;
    this._lastValidScrollLocation = null;
    this._lastValidScrollRatio = 0;
    this.toc = [];
    if (this.paginator?.destroy) {
      this.paginator.destroy();
    }
    this.paginator = null;
    this.pagination = null;
    this.paginationPromise = null;
    this.currentPageIndex = 0;
    this.usingPaginator = false;
    this.resourceUrlCache.forEach((url) => URL.revokeObjectURL(url));
    this.resourceUrlCache.clear();
    this.zipFileKeyMap = null;
    this.resourceLoader = null;
    this.pageContainer = null;
    this.spineItems = [];
    this.pageController = new PageController((index) => {
      this.renderEpubPage(index);
    });
    if (this.viewer) {
      this.viewer.innerHTML = "";
    }
    if (this.imageElement) {
      this.imageElement.src = "";
    }
    if (this.pageIndicator) {
      this.pageIndicator.textContent = "";
    }
    this.imageZoomBound = false;
    this.zoomScale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.isPinching = false;
    this.pinchStartDistance = 0;
    this.pinchStartScale = 1.0;
    if (typeof document !== 'undefined') {
      document.body.classList.remove(UI_CLASSES.IS_ZOOMED);
      const container = document.getElementById(DOM_IDS.FULLSCREEN_READER);
      if (container) {
        container.classList.remove(UI_CLASSES.EPUB_SCROLL);
        container.classList.remove(UI_CLASSES.EPUB_SCROLL_MODE);
        container.classList.remove('show-mode-indicator');
      }
      const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
      if (slider) slider.value = this.getZoomConfig().min;
    }
    this.updateTransform();

    if (this.webNovelViewer) {
      this.webNovelViewer.destroy();
    }
  }

  revokeImagePages() {
    if (!this.imagePages?.length) return;
    this.imagePages.forEach((page) => {
      if (typeof page === "string" && page.startsWith("blob:")) {
        URL.revokeObjectURL(page);
      }
    });
  }

  /**
   * リサイズ時の処理（Debounce付き）
   * 回転中などの連続発火を防ぐ
   */
  onResize() {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      this.handleResize();
    }, 200); // 200ms待機してから実行
  }

  /**
   * リサイズ時の処理
   * ビューポートサイズ変更時にページ分割を再計算
   */
  async handleResize() {
    // EPUB表示中でなければ何もしない
    if (this.type !== BOOK_TYPES.EPUB || !this.paginator) {
      return;
    }

    this.repaginationRequestId += 1;
    const myRequestId = this.repaginationRequestId;

    // ローディング表示（最新のリクエストのみ管理）
    this.onRepaginationStart?.();

    // 現在のページ位置を保存
    const currentLocator = this.getPageLocator(this.currentPageIndex);

    // リペジネーション実行
    const paginationMetrics = this.getPaginationViewportMetrics();
    const { hPad, vPad } = this.getPaddings();
    const edgePadding = `${vPad}px ${hPad}px`; // CSS形式 (上下 左右)

    const newSettings = {
      viewportWidth: paginationMetrics.viewportWidth,
      viewportHeight: paginationMetrics.viewportHeight,
      maxWidth: paginationMetrics.maxWidthValue,
      contentWidth: paginationMetrics.contentWidth,
      padding: edgePadding,
      lineHeight: paginationMetrics.lineHeight,
      joinSpineItems: this.epubViewMode === EPUB_VIEW_MODES.SCROLL,
    };

    try {
      await this.paginator.repaginate(newSettings);
      if (myRequestId !== this.repaginationRequestId) {
        console.debug(
          `handleResize: 古いリペジネーション結果を無視 (requestId=${myRequestId}, currentId=${this.repaginationRequestId})`
        );
        // 新しいリクエストがローディングを管理するので、ここでは解除しない
        return;
      }
      this.pagination = { pages: this.paginator.pages };
      this.pageController.setTotalPages(this.pagination.pages.length);

      // 元の位置に戻る
      if (currentLocator) {
        const newIndex = this.findPageContaining(
          currentLocator.spineIndex,
          currentLocator.segmentIndex
        );
        if (newIndex >= 0) {
          if (this.epubViewMode === EPUB_VIEW_MODES.SCROLL && currentLocator.segmentIndex > 0) {
            this._pendingScrollToSegment = currentLocator.segmentIndex;
            this._pendingScrollSearchQuery = currentLocator.visibleText || null;
            this._pendingScrollHighlight = false; // リサイズ時はハイライトさせない
          }
          this.pageController.goTo(newIndex);
        }
      }

      // ブラウザの再描画を確定させる
      void document.body.offsetHeight;
    } catch (error) {
      if (error?.name === "PaginationCancelledError") {
        console.debug("handleResize: リペジネーションがキャンセルされました");
        // 新しいリクエストがローディングを管理するので、ここでは解除しない
        return;
      }
      console.error("handleResize: リペジネーション失敗", error);
    }

    // 最新のリクエストの場合のみローディングを解除
    if (myRequestId === this.repaginationRequestId) {
      this.onRepaginationEnd?.();
    }
  }

  async ensureJSZip() {
    const isPlaceholder = (jszip) =>
      typeof jszip?.loadAsync === "function" && jszip.loadAsync.name === "missing";

    if (typeof JSZip !== "undefined") {
      if (typeof window !== "undefined" && !window.JSZip) {
        window.JSZip = JSZip;
      }
      if (isPlaceholder(JSZip)) {
        return this.loadJSZipFromCdn(isPlaceholder);
      }
      return JSZip;
    }
    if (typeof window !== "undefined" && window.JSZip) {
      if (isPlaceholder(window.JSZip)) {
        return this.loadJSZipFromCdn(isPlaceholder);
      }
      return window.JSZip;
    }
    console.log("Loading JSZip from local vendor...");
    await this.loadScript(ASSET_PATHS.VENDOR_JSZIP);
    const localJszip = typeof window !== "undefined" ? window.JSZip : null;
    if (!localJszip) {
      throw new Error("JSZipの読み込みに失敗しました。ベンダーファイルを確認してください。");
    }
    if (isPlaceholder(localJszip)) {
      console.warn("Local JSZip is a placeholder. Loading JSZip from CDN...");
      return this.loadJSZipFromCdn(isPlaceholder);
    }
    console.log("JSZip loaded successfully (local)");
    return localJszip;
  }

  getZipFileKeyMap() {
    if (this.zipFileKeyMap) {
      return this.zipFileKeyMap;
    }
    const zipFiles = this.book?.archive?.zip?.files;
    if (!zipFiles) {
      return null;
    }
    const map = new Map();
    for (const key of Object.keys(zipFiles)) {
      const normalized = normalizeZipEntryKey(key);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, key);
      }
      const lower = normalizeZipEntryKey(key, { lowerCase: true });
      if (lower && !map.has(lower)) {
        map.set(lower, key);
      }
    }
    this.zipFileKeyMap = map;
    return map;
  }

  async loadJSZipFromCdn(isPlaceholder) {
    // CDN URLs from constants.js (SSOT)
    const sources = [
      CDN_URLS.JSZIP,
      CDN_URLS.JSZIP_FALLBACK,
    ];

    for (const src of sources) {
      try {
        await this.loadScript(src);
        const cdnJszip = typeof window !== "undefined" ? window.JSZip : null;
        if (cdnJszip && !isPlaceholder(cdnJszip)) {
          console.log(`JSZip loaded successfully from CDN: ${src}`);
          return cdnJszip;
        }
      } catch (error) {
        console.warn(`Failed to load JSZip from CDN: ${src}`, error);
      }
    }

    throw new Error("JSZipの読み込みに失敗しました。ベンダーファイルがプレースホルダーのため、公式JSZipを配置するかCDNにアクセスできる環境で再試行してください。");
  }

  async ensureUnrar() {
    // ローカルの window.unrar があればそれを使う (後方互換性)
    if (typeof window !== "undefined") {
      const existing = window.unrar || window.Unrar || window.UnRAR;
      const isPlaceholder = (lib) =>
        typeof lib?.createExtractorFromData === "function" &&
        lib.createExtractorFromData.name === "missing";

      if (existing && !isPlaceholder(existing)) {
        return existing;
      }
    }

    // CDNから読み込む
    try {
      console.log("Loading node-unrar-js from CDN...");

      // CDN URLs from constants.js (SSOT)
      const JS_URL = CDN_URLS.UNRAR_JS;
      const WASM_URL = CDN_URLS.UNRAR_WASM;

      // 1. WASMバイナリを取得
      console.log(`Fetching WASM from: ${WASM_URL}`);
      const wasmPromise = fetch(WASM_URL).then(res => {
        if (!res.ok) throw new Error(`Failed to load WASM: ${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      });

      // 2. JSモジュールを読み込み
      console.log(`Importing JS from: ${JS_URL}`);
      const modulePromise = import(JS_URL);

      // 両方の完了を待つ
      const [wasmBinary, module] = await Promise.all([wasmPromise, modulePromise]);

      // エクスポートの取得 (esm.sh は Named Export または default に格納される)
      const createExtractor = module.createExtractorFromData || module.default?.createExtractorFromData;

      if (!createExtractor) {
        console.error("Loaded module exports:", module);
        throw new Error("createExtractorFromData がモジュール内に見つかりません。");
      }

      console.log("node-unrar-js loaded successfully.");

      // 3. ラッパーオブジェクトを返す (WASMを自動注入)
      return {
        createExtractorFromData: async (options) => {
          return createExtractor({
            ...options,
            wasmBinary: wasmBinary // 手動取得したバイナリを渡す
          });
        }
      };

    } catch (error) {
      console.error("RAR Library Load Error:", error);
      throw new Error(`RARライブラリの読み込みに失敗しました: ${error.message}`);
    }
  }

  async loadScript(src) {
    if (typeof document === "undefined") {
      throw new Error(`Script load requires document: ${src}`);
    }
    const existing = document.querySelector(`script[${DATA_ATTRS.READER_SRC}="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return;
      await new Promise((resolve, reject) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      });
      return;
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.readerSrc = src;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Web小説を開く
   * @param {Object} novelInfo {id, title, author}
   * @param {Array} episodes [{id, title, url}]
   * @param {WebNovelProvider} provider NarouProvider etc.
   * @param {Object|number} startLocation {location: episodeIndex, percentage}
   */
  async openWebNovel(novelInfo, episodes, provider, startLocation = 0) {
    this.resetReaderState();
    this.type = BOOK_TYPES.WEB_NOVEL;

    // 表示状態の初期化
    if (this.viewer) this.viewer.classList.add(UI_CLASSES.HIDDEN);
    if (this.imageViewer) this.imageViewer.classList.add(UI_CLASSES.HIDDEN);
    if (this.webNovelViewerContainer) {
      this.webNovelViewerContainer.classList.remove(UI_CLASSES.HIDDEN);
    }

    // WebNovelViewer に設定を適用
    if (this.webNovelViewer) {
      this.webNovelViewer.setWritingMode(this.writingMode === WRITING_MODES.VERTICAL ? 'vertical-rl' : 'horizontal-tb');
    }

    this.book = novelInfo; // book オブジェクトの代わりに情報を持たせる

    let episodeIndex = 0;
    let percentage = 0;
    if (typeof startLocation === 'object' && startLocation !== null) {
      episodeIndex = startLocation.location || 0;
      percentage = startLocation.percentage || 0;
    } else if (typeof startLocation === 'number') {
      episodeIndex = startLocation;
    }

    try {
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.EPUB_INIT, // 汎用名称として扱う
        status: READER_LOADING_STATUSES.CALCULATING_LAYOUT
      });

      await this.webNovelViewer.renderEpisode(novelInfo, episodes, episodeIndex, provider, percentage);

      this.onReady?.();
    } catch (e) {
      console.error("Failed to open web novel:", e);
      throw new Error("Web小説の読み込みに失敗しました。");
    }
  }

  async openEpub(file, options = {}) {
    this.resetReaderState();
    this.type = BOOK_TYPES.EPUB;
    this.usingPaginator = true;

    // 後方互換性とoptions展開
    const isObject = options !== null && typeof options === 'object' && !Array.isArray(options);
    const startLocation = isObject && ('location' in options || 'percentage' in options) ? options : options;

    if (isObject) {
      if (options.epubViewMode) this.epubViewMode = options.epubViewMode;
      if (options.writingMode) this.writingMode = options.writingMode;
      if (options.pageDirection) this.pageDirection = options.pageDirection;
    }

    // JSZipを先にロード
    const JSZipLib = await this.ensureJSZip();

    // JSZipがグローバルに設定されていることを確認（EPUB.jsが必要）
    if (typeof window !== 'undefined') {
      if (!window.JSZip) {
        window.JSZip = JSZipLib;
        console.log("Set window.JSZip explicitly for EPUB.js");
      }

      // グローバルスコープにも設定（一部のEPUB.jsバージョンが必要とする）
      if (typeof globalThis !== 'undefined' && !globalThis.JSZip) {
        globalThis.JSZip = JSZipLib;
        console.log("Set globalThis.JSZip for compatibility");
      }
    }

    // JSZipが正しくロードされたか確認
    console.log("JSZip status after loading:", {
      'window.JSZip': typeof window.JSZip,
      'JSZipLib': typeof JSZipLib,
      'has methods': typeof JSZipLib?.loadAsync === 'function'
    });

    // EPUB.jsがJSZipを認識できるか最終確認
    if (typeof window.JSZip === 'undefined' && typeof JSZipLib === 'undefined') {
      throw new Error("JSZipの読み込みに失敗しました。ページを再読み込みしてください。");
    }

    // EPUBライブラリの確認（複数の場所をチェック）
    let epubConstructor = null;

    if (typeof ePub !== "undefined") {
      epubConstructor = ePub;
      console.log("Found ePub in global scope");
    } else if (typeof window.ePub !== "undefined") {
      epubConstructor = window.ePub;
      console.log("Found window.ePub");
    } else if (typeof window.EPUBJS !== "undefined" && typeof window.EPUBJS.ePub !== "undefined") {
      epubConstructor = window.EPUBJS.ePub;
      console.log("Found window.EPUBJS.ePub");
    }

    if (!epubConstructor) {
      console.error("EPUB.js library not found in any expected location");
      console.error("Available globals:", Object.keys(window).filter(k => k.toLowerCase().includes('epub')));
      throw new Error("EPUB.jsライブラリが読み込まれていません。\\n\\nページを再読み込みしてください。\\n\\n問題が解決しない場合は、開発者ツールのコンソールを確認してください。");
    }

    // EPUB.js は File/Blob を直接受け取れるため、大容量ファイルで
    // 全バッファをメモリに展開しないよう file をそのまま渡す
    const bookData = file;
    console.log("Creating ePub instance with constructor:", typeof epubConstructor);
    // EPUB.jsのための最終的なJSZip確認
    console.log("JSZip check before creating book:", {
      'window.JSZip type': typeof window.JSZip,
      'window.JSZip exists': !!window.JSZip,
      'window.JSZip.loadAsync': typeof window.JSZip?.loadAsync
    });

    // EPUB.jsがグローバルスコープでJSZipを見つけられるようにする
    // これは一部のEPUB.jsバージョンで必要
    if (typeof JSZip === 'undefined' && window.JSZip) {
      try {
        // グローバルスコープに注入を試みる（strictモードでは動作しない可能性あり）
        globalThis.JSZip = window.JSZip;
        console.log("Injected JSZip into globalThis");
      } catch (e) {
        console.warn("Could not inject JSZip into globalThis:", e);
      }
    }

    try {
      this.book = epubConstructor(bookData);
      console.log("ePub book instance created successfully");
    } catch (error) {
      console.error("Failed to create ePub instance:", error);

      // JSZipの問題の場合、エラーを抑制してリトライ
      if (error.message && (error.message.includes('JSZip') || error.message.includes('not defined'))) {
        console.warn("JSZip error detected, attempting to continue anyway...");
        console.error("JSZip diagnostic info:", {
          'window.JSZip': typeof window.JSZip,
          'globalThis.JSZip': typeof globalThis.JSZip,
          'JSZipLib available': !!JSZipLib,
          'JSZipLib.loadAsync': typeof JSZipLib?.loadAsync,
          'error': error.message
        });

        // JSZipエラーでもbookインスタンスが作成されている可能性があるため続行を試みる
        // EPUB.jsの古いバージョンではエラーが出ても動作することがある
        try {
          this.book = epubConstructor(bookData);
          console.log("Retry succeeded: ePub book instance created");
        } catch (retryError) {
          console.error("Retry failed:", retryError);
          // エラーは表示せず、bookインスタンスの存在を確認
          if (!this.book) {
            // 最後の手段：エラーを無視して続行を試みる
            console.warn("Creating book instance despite errors...");
            this.book = epubConstructor(bookData);
          }
        }
      } else {
        throw new Error(`EPUBファイルの解析に失敗しました: ${error.message}`);
      }
    }

    if (!this.book) {
      throw new Error("EPUBファイルの解析に失敗しました（bookオブジェクトがnull）。");
    }

    console.log("ePub instance created:", this.book);

    // book.readyを待つ
    await this.book.ready;
    console.log("Book ready");

    // [追加] EPUB 独自解析ハンドラの初期化
    // OPF パスの正確な特定と EPUB 3 Navigation Document の手動解析を行う
    try {
      this.archiveHandler = new EpubArchiveHandler(file);
      await this.archiveHandler.init();
      console.log("[openEpub] EpubArchiveHandler initialized:", {
        rootPath: this.archiveHandler.rootPath,
        opfPath: this.archiveHandler.opfPath,
        spineCount: this.archiveHandler.spine.length,
        tocCount: this.archiveHandler.toc.length,
      });
    } catch (err) {
      console.warn("[openEpub] EpubArchiveHandler の初期化に失敗しました（従来ロジックで継続）:", err);
      this.archiveHandler = null;
    }

    // 目次を取得
    let toc = [];
    try {
      await this.book.loaded.navigation;
      toc = this.book.navigation?.toc ?? [];
      console.log("TOC loaded from EPUB.js:", toc.length, "items");
    } catch (err) {
      console.warn("EPUB.js による目次の取得に失敗しました:", err);
    }

    // [修正] EpubArchiveHandler がより完全な目次を持っていれば補完・代替する
    const archiveToc = this.archiveHandler?.toc ?? [];
    if (archiveToc.length > toc.length) {
      console.log(`[openEpub] EpubArchiveHandler から目次を補完します: EPUB.js(${toc.length}) → EpubArchiveHandler(${archiveToc.length})`);
      toc = archiveToc.map(item => ({
        label: item.label,
        href: item.href
      }));
    } else {
      console.log(`[openEpub] EPUB.js の目次を優先します (${toc.length} items)`);
    }
    this.toc = toc;

    // 縦書き・横書きを自動判別
    const detectedReading = await this.detectReadingDirectionFromBook();
    if (detectedReading?.pageDirection) {
      this.pageDirection = detectedReading.pageDirection;
      console.log("Detected page direction:", this.pageDirection);
    }
    if (this.preferredWritingMode) {
      this.writingMode = this.preferredWritingMode;
      console.log("Using preferred writing mode:", this.writingMode);
    } else if (detectedReading?.writingMode) {
      this.writingMode = detectedReading.writingMode;
      console.log("Detected writing mode:", this.writingMode);
    }

    // テーマを事前適用
    this.updateEpubTheme();

    try {
      // 開始位置を一時保存（逐次パジネーションの初回完了時に使用）
      this._pendingStartLocation = startLocation;
      let pagination = await this.buildPagination();
      // 中断・再パジネーションが発生した場合は最新の完了を待つ
      while (this.paginationPromise) {
        console.log("[openEpub] Waiting for re-pagination to complete...");
        pagination = await this.paginationPromise;
      }
      if (!pagination?.pages?.length) {
        throw new Error("EPUBのページ分割に失敗しました。");
      }

      // テキストベースの位置解決を優先するため、resolveStartPageIndexIfReady を使用する
      const resolvedPage = this.resolveStartPageIndexIfReady(startLocation, pagination.pages.length);
      const startPage = resolvedPage !== null ? resolvedPage : this.resolveStartPageIndex(startLocation, pagination.pages.length);
      this.pageController.setTotalPages(pagination.pages.length);
      this.pageController.goTo(startPage);

      // 初回のonReadyコールバック（メタデータと目次）
      if (!this._isInitialReadyCalled) {
        this._isInitialReadyCalled = true;
        this.onReady?.({
          metadata: this.book.package?.metadata,
          toc: this.toc,
        });
      }

      // locations生成は重い処理のため、ユーザー操作(検索)時にオンデマンドで実行する
      // （初期ロード時のメインスレッドブロックを回避）

      console.log("EPUB opened successfully");
    } catch (err) {
      console.error("EPUBの表示に失敗しました:", err);
      console.error("Error stack:", err.stack);
      throw new Error(`EPUBの表示に失敗しました: ${err.message}`);
    }
  }

  resolveStartPageIndex(startLocation, totalPages) {
    const maxIndex = Math.max(0, totalPages - 1);
    if (typeof startLocation === "number") {
      return Math.max(0, Math.min(startLocation, maxIndex));
    }
    if (startLocation && typeof startLocation === "object") {
      const directLocator = startLocation.location;
      let locator = startLocation;

      if (
        directLocator &&
        typeof directLocator === "object" &&
        typeof directLocator.spineIndex === "number" &&
        typeof directLocator.segmentIndex === "number"
      ) {
        locator = directLocator;
      } else if (typeof directLocator === "string" && directLocator.includes(":")) {
        // 文字列形式のCFI ("spineIndex:segmentIndex") をパース
        const parts = directLocator.split(":");
        const sp = parseInt(parts[0], 10);
        const sg = parseInt(parts[1], 10);
        if (!Number.isNaN(sp) && !Number.isNaN(sg)) {
          locator = { spineIndex: sp, segmentIndex: sg };
        }
      }

      if (
        typeof locator.spineIndex === "number" &&
        typeof locator.segmentIndex === "number"
      ) {
        const pageIndex = this.findPageContaining(
          locator.spineIndex,
          locator.segmentIndex,
          this.pagination?.pages ?? []
        );
        if (pageIndex >= 0) {
          // スクロールモードではセグメント位置を保持してDOM内スクロールに使用
          if (this.epubViewMode === EPUB_VIEW_MODES.SCROLL && locator.segmentIndex > 0) {
            this._pendingScrollToSegment = locator.segmentIndex;
            this._pendingScrollSearchQuery = startLocation.searchQuery || null;
          }
          return pageIndex;
        }
      }
      const explicitLocation = startLocation.location;
      if (typeof explicitLocation === "number") {
        return Math.max(0, Math.min(explicitLocation, maxIndex));
      }
      const percentage = startLocation.percentage;
      if (typeof percentage === "number") {
        const index = Math.round((percentage / 100) * totalPages) - 1;
        return Math.max(0, Math.min(index, maxIndex));
      }
    }
    return 0;
  }

  resolveStartPageIndexIfReady(startLocation, totalPages) {
    if (!startLocation || typeof startLocation !== "object") {
      return this.paginationComplete
        ? this.resolveStartPageIndex(startLocation, totalPages)
        : null;
    }

    const directLocator = startLocation.location;
    // テキストベースの解決を試みる（visibleText がある場合）
    const visibleText = startLocation.visibleText || directLocator?.visibleText;

    if (visibleText) {
      // テキストベースの解決には spineItems が必要。
      // resolveStartPageIndexIfReady が呼ばれる時点で spineItems がロードされている必要があるため、
      // まだ完了していない場合は null を返して buildPagination 側の完了を待つように促す
      if (!this.paginationComplete && this.paginationPromise) {
        console.log(`[位置復元デバッグ][resolveStartPageIndexIfReady] パジネーション完了を待機します (visibleTextあり)`);
        return null;
      }

      const spineIndex = directLocator?.spineIndex != null ? directLocator.spineIndex : null;
      if (spineIndex != null) {
        const segmentIndex = this.resolveLocationByText(spineIndex, visibleText, "resolveStart");
        if (segmentIndex !== null) {
          const pageIndex = this.findPageContaining(spineIndex, segmentIndex, this.pagination?.pages ?? []);
          if (pageIndex >= 0) {
            console.log(`[位置復元デバッグ][resolveStartPageIndexIfReady] テキスト解決により pageIndex=${pageIndex}, segmentIndex=${segmentIndex} を特定`);
            if (this.epubViewMode === EPUB_VIEW_MODES.SCROLL) {
              // スクロールモード: 検索結果ジャンプと同じ仕組み（即時ジャンプ）を使い、ピンポイントで位置を復元
              this._pendingScrollToSegment = segmentIndex;
            }
            // 検索キーワード（SSOT）として visibleText を共有し、レンダリング後に即時ジャンプを発火させる
            this._pendingScrollSearchQuery = visibleText;
            // 位置復元時はハイライトを表示させない
            this._pendingScrollHighlight = false;
            return pageIndex;
          }
        }
      }
    }

    let locator =
      directLocator &&
        typeof directLocator === "object" &&
        typeof directLocator.spineIndex === "number" &&
        typeof directLocator.segmentIndex === "number"
        ? directLocator
        : null;

    if (!locator && typeof directLocator === "string" && directLocator.includes(":")) {
      const parts = directLocator.split(":");
      const sp = parseInt(parts[0], 10);
      const sg = parseInt(parts[1], 10);
      if (!Number.isNaN(sp) && !Number.isNaN(sg)) {
        locator = { spineIndex: sp, segmentIndex: sg };
      }
    }
    if (locator) {
      const pageIndex = this.findPageContaining(
        locator.spineIndex,
        locator.segmentIndex,
        this.pagination?.pages ?? []
      );
      if (pageIndex >= 0) {
        // スクリム解除後の初期位置合わせ
        if (this.epubViewMode === EPUB_VIEW_MODES.SCROLL && locator.segmentIndex > 0) {
          this._pendingScrollToSegment = locator.segmentIndex;
        }
        // セグメントインデックス解決でも visibleText があれば優先
        if (visibleText) {
          this._pendingScrollSearchQuery = visibleText;
        } else {
          this._pendingScrollSearchQuery = startLocation.searchQuery || null;
        }
        return pageIndex;
      }
      return null;
    }
    return this.paginationComplete
      ? this.resolveStartPageIndex(startLocation, totalPages)
      : null;
  }
  isExternalLink(href) {
    if (!href) return false;
    return /^(https?:|mailto:|tel:|data:|blob:|ftp:)/i.test(href) || href.startsWith("//");
  }

  normalizeHrefPath(path) {
    if (!path) return "";
    const cleaned = path.split("?")[0].split("#")[0].trim();
    return cleaned.replace(/^\.\//, "");
  }

  resolveSpineIndexFromHref(href, fallbackSpineIndex = 0) {
    if (!href) return fallbackSpineIndex;
    const [pathPart] = href.split("#");
    const normalized = this.normalizeHrefPath(pathPart);
    if (!normalized) return fallbackSpineIndex;
    const directIndex = this.spineItems.findIndex((item) => item.href === normalized);
    if (directIndex >= 0) return directIndex;
    const matchIndex = this.spineItems.findIndex((item) =>
      item.href?.endsWith(`/${normalized}`) || item.href?.endsWith(normalized)
    );
    return matchIndex >= 0 ? matchIndex : fallbackSpineIndex;
  }

  getPaddings() {
    const width = this.viewer?.clientWidth || window.innerWidth;
    const height = this.viewer?.clientHeight || window.innerHeight;

    // 横: 現状維持 (幅の4% または 高さの5% の大きい方、最低16px)
    // これにより既存の「横幅」の感覚を維持します
    const hPad = Math.max(16, Math.round(width * 0.04), Math.round(height * 0.05));

    // 縦: 画面環境の99%を利用 -> 余白は合計1% (上下それぞれ0.5%)
    const vPad = Math.max(16, Math.round(height * 0.005));

    return { hPad, vPad };
  }

  getEdgePadding() {
    // 後方互換性のため残す（横パディングを返す）
    const { hPad } = this.getPaddings();
    return hPad;
  }

  getEpubPageLayoutValues() {
    const paddings = this.getPaddings();
    return {
      edgePadding: this.getEdgePadding(), // 後方互換性のため
      hPad: paddings.hPad,
      vPad: paddings.vPad,
      lineHeight: getReaderLineHeight(),
      maxWidthValue: this.getReaderMaxWidthValue(),
    };
  }

  applyEpubPageLayoutStyles(target, { edgePadding, hPad, vPad, lineHeight, maxWidthValue }) {
    if (!target) return;
    // 新しいパディング方式（vPad/hPadが指定されている場合）
    if (vPad !== undefined && hPad !== undefined) {
      target.style.padding = `${vPad}px ${hPad}px`; // 上下 左右
    } else {
      // 後方互換性
      target.style.padding = `${edgePadding}px`;
    }
    target.style.lineHeight = `${lineHeight}`;

    const isVertical = this.writingMode === WRITING_MODES.VERTICAL;
    const isScroll = this.epubViewMode === EPUB_VIEW_MODES.SCROLL;

    if (isVertical) {
      target.style.margin = "auto 0";
      if (maxWidthValue) {
        target.style.maxHeight = maxWidthValue; // 縦書き時の1行の長さ制約はheight
      } else {
        target.style.removeProperty("max-height");
      }
      target.style.removeProperty("max-width");

      if (isScroll) {
        target.style.height = "100%";
        target.style.width = "max-content"; // 横スクロールするため無限に伸びる
        target.style.minWidth = "100%";     // 最低でも画面幅は確保
        target.style.minHeight = "0";
      } else {
        target.style.height = "100%";
        target.style.width = "100%";
        target.style.minWidth = "0";
        target.style.minHeight = "0";
      }
    } else {
      target.style.margin = "0 auto";
      if (maxWidthValue) {
        target.style.maxWidth = maxWidthValue;
      } else {
        target.style.removeProperty("max-width");
      }
      target.style.removeProperty("max-height");

      if (isScroll) {
        target.style.width = "100%";
        target.style.height = "max-content"; // 縦スクロールするため無限に伸びる
        target.style.minHeight = "100%";     // 最低でも画面高さは確保
        target.style.minWidth = "0";
      } else {
        target.style.width = "100%";
        target.style.height = "100%";
        target.style.minHeight = "0";
        target.style.minWidth = "0";
      }
    }
    target.style.boxSizing = "border-box";
  }

  getPaginationViewportMetrics() {
    const viewer = this.viewer || document.body;
    const viewportWidth = viewer?.clientWidth || window.innerWidth;
    const viewportHeight = viewer?.clientHeight || window.innerHeight;
    const layout = this.getEpubPageLayoutValues();
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.left = "-99999px";
    probe.style.top = "0";
    this.applyEpubPageLayoutStyles(probe, layout);
    viewer.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    const contentWidth =
      Number.isFinite(rect.width) && rect.width > 0
        ? rect.width
        : this.getEffectiveContentWidth(viewportWidth, layout.maxWidthValue);
    return {
      viewportWidth,
      viewportHeight,
      contentWidth,
      ...layout,
    };
  }

  computeSegmentIndexForFragment(htmlString, fragmentId) {
    if (!htmlString || !fragmentId) return 0;

    const doc = new DOMParser().parseFromString(htmlString, "text/html");
    const body = doc.body;
    const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(fragmentId) : fragmentId;
    const target =
      body.querySelector(`#${escapedId}`) ||
      body.querySelector(`[name="${escapedId}"]`);
    if (!target) return 0;

    const segments = [];
    const walker = doc.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName?.toLowerCase();
            if (tag === "img" || tag === "svg" || tag === "video" || tag === "iframe") {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        const length = text.length;
        let start = 0;
        while (start < length) {
          const end = Math.min(length, start + TEXT_SEGMENT_STEP);
          segments.push({ type: "text", node, start, end });
          start = end;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        segments.push({ type: "element", node });
      }
      node = walker.nextNode();
    }

    const index = segments.findIndex((segment) => target.contains(segment.node));
    return index >= 0 ? index : 0;
  }

  findSearchMatchesInSpine(spineItem, query) {
    if (!spineItem || !spineItem.htmlString || !query) return [];

    const doc = new DOMParser().parseFromString(spineItem.htmlString, "text/html");
    const walker = doc.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName?.toLowerCase();
            if (tag === "img" || tag === "svg" || tag === "video" || tag === "iframe") {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let currentSegment = 0;
    let node = walker.nextNode();
    const segments = [];

    // ツリーを走査し、テキスト全体をつなぎ合わせた文字列を構築するとともに、
    // セグメント位置情報をマッピングする
    let fullText = "";

    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        const length = text.length;

        segments.push({
          type: "text",
          startCharOffset: fullText.length,
          endCharOffset: fullText.length + length,
          segmentIndexStart: currentSegment
        });

        fullText += text;
        currentSegment += Math.ceil(length / TEXT_SEGMENT_STEP);
      } else {
        // 画像等はテキストには追加されないが、セグメントを1つ消費する
        currentSegment += 1;
      }
      node = walker.nextNode();
    }

    // 空白の差異を吸収するあいまい検索（正規表現を使用） (SSOT)
    const searchRegex = this._getFlexibleSearchRegex(query);
    const matches = [];

    let regexMatch;
    while ((regexMatch = searchRegex.exec(fullText)) !== null && matches.length < 5) {
      const matchIndex = regexMatch.index;

      // 前後のコンテキストを取得（50文字ずつ）
      const start = Math.max(0, matchIndex - 50);
      const end = Math.min(fullText.length, matchIndex + regexMatch[0].length + 50);
      let excerpt = fullText.substring(start, end);
      excerpt = excerpt.replace(/\s+/g, ' ').trim();

      // matchIndex が属する segments を探す
      const segment = segments.find(seg => matchIndex >= seg.startCharOffset && matchIndex < seg.endCharOffset);
      let segmentIndex = 0;
      if (segment) {
        // セグメント内の文字オフセット
        const offsetInTextNode = matchIndex - segment.startCharOffset;
        segmentIndex = segment.segmentIndexStart + Math.floor(offsetInTextNode / TEXT_SEGMENT_STEP);
      }

      matches.push({
        excerpt,
        matchIndex,
        segmentIndex
      });
    }

    return matches;
  }

  /**
   * 保存されたテキスト情報を使用して、指定された章の中の正確な位置（セグメント）を解決する
   * @param {number} spineIndex 
   * @param {string} visibleText 
   * @param {string} debugTag ログ用のタグ
   * @returns {number|null} 解決されたセグメントインデックス。見つからない場合は null
   */
  resolveLocationByText(spineIndex, visibleText, debugTag = "General") {
    if (spineIndex == null || !visibleText) {
      console.warn(`[位置復元デバッグ][${debugTag}] 解決中止: spineIndex または visibleText がありません`, { spineIndex, visibleText });
      return null;
    }

    const spineItem = this.spineItems[spineIndex];
    console.log(`[位置復元デバッグ][${debugTag}] ステップ2: 検索対象`, {
      spineIndex,
      hasSpineItem: !!spineItem,
      hasHtmlString: !!spineItem?.htmlString,
      htmlStringLength: spineItem?.htmlString?.length,
    });

    if (!spineItem || !spineItem.htmlString) {
      console.error(`[位置復元デバッグ][${debugTag}] 解決失敗:spineItem または htmlString が取得できませんでした`);
      return null;
    }

    // クエリを短くして精度を調整 (30文字)
    const query = visibleText.substring(0, 30);
    console.log(`[位置復元デバッグ][${debugTag}] 文字列検索開始: "${query}"`);
    const matches = this.findSearchMatchesInSpine(spineItem, query);

    console.log(`[位置復元デバッグ][${debugTag}] ステップ3: 検索結果`, {
      query,
      matchCount: matches?.length ?? 0,
      firstMatch: matches?.[0] ?? null,
    });

    if (matches && matches.length > 0) {
      console.log(`[位置復元デバッグ][${debugTag}] 解決成功: segmentIndex=${matches[0].segmentIndex}`);
      return matches[0].segmentIndex;
    }

    console.warn(`[位置復元デバッグ][${debugTag}] 解決失敗: 指定されたテキストが本文内に見つかりませんでした`);
    return null;
  }


  findPageContaining(spineIndex, segmentIndex, pages = this.pagination?.pages ?? []) {
    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      if (page.spineIndex !== spineIndex) continue;
      const start = Number(String(page.withinSpineOffset).replace("s:", ""));
      const next = pages[i + 1];
      const end =
        next && next.spineIndex === spineIndex
          ? Number(String(next.withinSpineOffset).replace("s:", ""))
          : Infinity;
      if (segmentIndex >= start && segmentIndex < end) {
        return i;
      }
    }
    return -1;
  }

  getPageLocator(pageIndex) {
    const pages = this.pagination?.pages ?? [];
    const page = pages[pageIndex];
    if (!page || page.spineIndex == null || page.spineIndex < 0) return null;

    if (this.epubViewMode === "scroll" && this.pageContainer && this.currentPageIndex === pageIndex) {
      // スクロールモードの場合、表示中のスクロール位置から現在見ているセグメントを逆算する
      let segmentIndex = this._getCurrentScrollSegment(this.pageContainer);

      // [修正] Androidのバックグラウンド移行時などの計測失敗対策。
      // セグメント取得に失敗した、あるいは強制的に0（先頭）に戻ってしまった場合、
      // 同じ章であれば最後に確認された有効な位置を優先する。
      if (segmentIndex === null || segmentIndex === 0) {
        if (this._lastValidScrollLocation && this._lastValidScrollLocation.spineIndex === page.spineIndex) {
          if (segmentIndex === null || this._lastValidScrollLocation.segmentIndex > 0) {
            segmentIndex = this._lastValidScrollLocation.segmentIndex;
          }
        }
      }

      if (segmentIndex !== null) {
        const locator = { spineIndex: page.spineIndex, segmentIndex };
        // 位置復元用に、現在表示されているテキストの断片を保存する
        // スクロールモードでは常に現在のページなので pageIndex チェックは不要
        const visibleText = this.getCurrentVisibleText(50);
        if (visibleText) {
          locator.visibleText = visibleText;
        }
        return locator;
      }
    }

    const segmentIndex = Number(String(page.withinSpineOffset).replace("s:", ""));
    if (Number.isNaN(segmentIndex)) return null;

    const locator = { spineIndex: page.spineIndex, segmentIndex };

    // 位置復元用に、現在表示されているテキストの断片を保存する
    if (this.currentPageIndex === pageIndex) {
      const visibleText = this.getCurrentVisibleText(50);
      if (visibleText) {
        locator.visibleText = visibleText;
      }
    }

    return locator;
  }

  getFallbackLocator() {
    const pages = this.pagination?.pages ?? [];
    const first = pages.find((page) => page.spineIndex >= 0);
    if (!first) return null;
    const segmentIndex = Number(String(first.withinSpineOffset).replace("s:", ""));
    if (Number.isNaN(segmentIndex)) return null;
    return { spineIndex: first.spineIndex, segmentIndex };
  }

  goToSegment(spineIndex, segmentIndex, searchQuery, shouldHighlight = true) {
    if (!this.pagination?.pages?.length) return;
    const pageIndex = this.findPageContaining(spineIndex, segmentIndex);
    if (pageIndex >= 0) {
      // 指定位置までDOMスクロール/ハイライトするための情報を保持
      this._pendingScrollToSegment = segmentIndex;
      this._pendingScrollSearchQuery = searchQuery || null;
      this._pendingScrollHighlight = shouldHighlight;
      if (this.epubViewMode !== EPUB_VIEW_MODES.SCROLL) {
        // ページめくりモード: そのままページ遷移
        this.pageController.goTo(pageIndex);
      } else {
        // スクロールモード: 既にその章が表示されている場合は即座にスクロール
        if (this.currentPageIndex === pageIndex && this.pageContainer) {
          this._scrollToPositionInDOM(this.pageContainer, segmentIndex, searchQuery);
          // 情報をクリア
          this._pendingScrollToSegment = null;
          this._pendingScrollSearchQuery = null;
        } else {
          this.pageController.goTo(pageIndex);
        }
      }
    }
  }

  /**
   * 空白や改行の差異を吸収する「あいまい検索」用の正規表現を生成する (SSOT)
   * @param {string} query 
   * @param {string} flags 正規表現フラグ (デフォルト 'gi')
   * @returns {RegExp}
   */
  _getFlexibleSearchRegex(query, flags = 'gi') {
    if (!query) return /$./;
    // クエリ内の連続する空白を1つのスペースに変換後、トリム
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    // 各文字をエスケープし、文字間に任意の空白（改行含む）を許容
    const escapedChars = Array.from(normalizedQuery).map(char => {
      if (char === ' ') return '\\s+'; // スペース箇所は1文字以上の空白を要求
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    const pattern = escapedChars.join('\\s*');
    return new RegExp(pattern, flags);
  }

  /**
   * スクロールモード用: DOM内の指定位置までスクロールする。
   * searchQueryがある場合は実際のテキストをDOM内で検索してピンポイントでスクロール。
   * @param {boolean} shouldHighlight 
   * @param {number|null} targetSpineIndex [追加] 目標とする章のインデックス
   */
  _scrollToPositionInDOM(container, segmentIndex, searchQuery, shouldHighlight = true, targetSpineIndex = null) {
    if (!container) {
      console.warn("[ジャンプデバッグ] container がありません");
      return;
    }

    let targetElement = null;
    let matchDataArray = null;
    let targetContainer = container;

    // [修正] Join Mode の場合、まずは対象の章のコンテナに絞り込む
    if (targetSpineIndex != null) {
      const joinedItem = container.querySelector(`.joined-spine-item[data-spine-index="${targetSpineIndex}"]`);
      if (joinedItem) {
        targetContainer = joinedItem;
        console.log(`[ジャンプデバッグ] 対象の章コンテナを特定しました: spineIndex=${targetSpineIndex}`);
      }
    }

    console.log(`[ジャンプデバッグ] 実行開始: segmentIndex=${segmentIndex}, hasSearchQuery=${!!searchQuery}, targetSpineIndex=${targetSpineIndex}`);

    // 方法1: 検索テキストがある場合、DOM内をテキスト検索してピンポイントでスクロール
    if (searchQuery) {
      console.log(`[ジャンプデバッグ] テキスト検索による位置特定を試行中: "${searchQuery.substring(0, 20)}..."`);
      matchDataArray = this._findTextInDOM(targetContainer, searchQuery);
      if (matchDataArray && matchDataArray.length > 0) {
        // 最初に見つかった親要素をスクロールターゲットとする
        targetElement = matchDataArray[0].node.parentElement;
        console.log("[ジャンプデバッグ] テキスト検索に成功しました", { targetElement });
      } else {
        console.warn("[ジャンプデバッグ] テキスト検索に失敗しました");
      }
    }

    // 方法2: 検索テキストがない、または失敗した場合はセグメントインデックスから探す
    if (!targetElement && (segmentIndex > 0 || (targetSpineIndex != null && targetContainer !== container))) {
      console.log(`[ジャンプデバッグ] インデックスによる位置特定を試行中: segmentIndex=${segmentIndex}`);
      const walker = document.createTreeWalker(
        targetContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let currentSegment = 0;
      let node = walker.nextNode();
      let lastValidNode = node; // フォールバック用に最後に評価したノードを保持

      while (node) {
        const text = node.textContent || "";
        const length = text.length;
        const segmentsInNode = Math.ceil(length / TEXT_SEGMENT_STEP);
        if (currentSegment + segmentsInNode > segmentIndex) {
          targetElement = node.parentElement || node;
          break;
        }
        currentSegment += segmentsInNode;
        lastValidNode = node;
        node = walker.nextNode();
      }

      // 章の末尾を超えたなど、正確な位置が見つからなかった場合のフォールバック
      if (!targetElement && lastValidNode) {
        console.warn("[ジャンプデバッグ] 正確なインデックス位置が見つからなかったため、章の末尾付近へフォールバックします");
        targetElement = lastValidNode.parentElement || lastValidNode;
      }

      if (targetElement) {
        console.log("[ジャンプデバッグ] インデックスによる位置特定に成功(または近似位置へフォールバック)しました", { targetElement });
      } else {
        console.warn("[ジャンプデバッグ] インデックスによる位置特定に完全に失敗しました");
      }
    }

    // ページめくりモードではスクロールしない。ハイライトのみ。
    // スクロールするとページレイアウトが崩れるため。
    if (targetElement && targetElement.scrollIntoView && this.epubViewMode === EPUB_VIEW_MODES.SCROLL) {
      console.log("[ジャンプデバッグ] scrollIntoView を実行します (instant, center)");
      // ジャンプ先が画面の中央に来るように調整（視認性向上）
      targetElement.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      this._scrollTargetNode = targetElement; // リサイズ時の位置維持用
    }

    // 検索テキストがある場合は一時的に強調表示（モード問わず実行。フラグが有効な場合のみ）
    // ※ `matchDataArray`がない場合（フォールバック時）はハイライトできない
    if (searchQuery && matchDataArray && shouldHighlight) {
      this._applyTemporaryHighlight(matchDataArray, searchQuery);
    }

    // スクロールモードで対象が見つからなかった場合（コンテナ自体が空など）の最終フォールバック
    if (!targetElement && this.epubViewMode === "scroll") {
      console.warn("[ジャンプデバッグ] 最終的なターゲットが見つからなかったため、章の先頭へフォールバックします");
      this._scrollTargetNode = null;
      // フォールバック：先頭へ
      const isVerticalScroll = this.epubViewMode !== "scroll" && this.writingMode === WRITING_MODES.VERTICAL;
      if (this.viewer) {
        if (isVerticalScroll) {
          this.viewer.scrollLeft = 0;
        } else {
          this.viewer.scrollTop = 0;
        }
      }
    }
  }

  /**
   * 現在のスクロール位置（viewport）に見えている先頭のセグメントインデックスを計算する
   */
  _getCurrentScrollSegment(container) {
    if (!this.viewer || !container) return null;
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName?.toLowerCase();
            if (tag === "img" || tag === "svg" || tag === "video" || tag === "iframe") {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let currentSegment = 0;
    let node = walker.nextNode();
    const viewerRect = this.viewer.getBoundingClientRect();
    const isVertical = this.writingMode === WRITING_MODES.VERTICAL;

    while (node) {
      const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        let isVisible = false;

        if (isVertical) {
          // vertical-rl: 進行方向は右から左
          // 要素がviewportの右端より左側にあり、左端より右側にある場合に表示中とみなす
          if (rect.right >= viewerRect.left && rect.left <= viewerRect.right) {
            isVisible = true;
          }
        } else {
          // horizontal-tb: 進行方向は上から下
          if (rect.bottom >= viewerRect.top && rect.top <= viewerRect.bottom) {
            isVisible = true;
          }
        }

        if (isVisible) {
          return currentSegment;
        }
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        const length = text.length;
        currentSegment += Math.ceil(length / TEXT_SEGMENT_STEP);
      } else {
        currentSegment += 1;
      }
      node = walker.nextNode();
    }

    // 見つからなかった場合(DOM未生成時など)は安易に 0 を返さず null を返すことで、
    // 現在位置が誤って先頭に上書きされるのを防ぐ。
    return null;
  }

  /**
   * 現在の画面上に表示されている先頭付近のテキストを取得する
   * （モード切替時などに一時保存し、再描画後にテキスト検索で元の位置へ復帰させるため）
   */
  /**
   * 現在画面内に表示されているテキストを取得する
   * @param {number} maxLength 取得する最大文字数 (デフォルト50)
   * @returns {string|null} 抽出されたテキスト
   */
  getCurrentVisibleText(maxLength = 50) {
    if (!this.viewer || !this.pageContainer) return null;

    const walker = document.createTreeWalker(
      this.pageContainer,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          // ナビボタンや UI 要素のテキストを除外する
          const parent = node.parentElement || node;
          if (parent?.closest?.('.epub-scroll-nav-btn, .epub-scroll-nav-group, .scroll-nav-area')) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName?.toLowerCase();
            if (tag === "img" || tag === "svg" || tag === "video" || tag === "iframe") {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    const viewerRect = this.viewer.getBoundingClientRect();
    const isVertical = this.writingMode === WRITING_MODES.VERTICAL;
    const isScrollMode = this.epubViewMode === "scroll";

    let node = walker.nextNode();
    let textToFind = "";

    while (node) {
      const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        let isVisible = false;

        // 共通の可視判定ロジック
        if (isVertical) {
          // 縦書き: 進行方向は右から左
          if (rect.right >= viewerRect.left && rect.left <= viewerRect.right) {
            isVisible = true;
          }
        } else {
          // 横書き: 進行方向は上から下
          if (rect.bottom >= viewerRect.top && rect.top <= viewerRect.bottom) {
            isVisible = true;
          }
        }

        if (isVisible && node.nodeType === Node.TEXT_NODE) {
          // テキストを連結し、連続する空白を1つにまとめる
          const cleanText = node.textContent.replace(/\s+/g, ' ');
          textToFind += cleanText;

          if (textToFind.length >= maxLength + 20) {
            break;
          }
        }
      }
      node = walker.nextNode();
    }

    if (!textToFind) return null;

    // 最終的なクリーンアップ
    return textToFind.trim().substring(0, maxLength);
  }

  /**
   * DOM内で検索テキストを含む要素を見つける
   * タグを跨いだテキスト探索に対応
   */
  _findTextInDOM(container, searchText) {
    if (!container || !searchText) return null;

    // 1. テキストノードをすべて収集
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes = [];
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node);
      node = walker.nextNode();
    }

    if (textNodes.length === 0) return null;

    // 2. 全テキストノードの文字列を結合し、各ノードの開始位置を記録
    let fullText = "";
    const nodePositions = [];

    for (let index = 0; index < textNodes.length; index++) {
      const textNode = textNodes[index];
      const startPos = fullText.length;
      fullText += textNode.textContent;
      nodePositions.push({
        node: textNode,
        start: startPos,
        end: fullText.length
      });
    }

    // 空白文字（改行やスペース）の違いを吸収するため正規表現を組み立てる (共通ロジックを使用)
    const regex = this._getFlexibleSearchRegex(searchText, "i");

    // fullTextから対象文字列を正規表現検索
    const match = fullText.match(regex);

    if (!match) return null;

    // 3. 一致した位置に該当するノード群を返す
    const matchIndex = match.index;
    const matchEndIndex = matchIndex + match[0].length;
    const matchingNodes = [];

    for (let index = 0; index < nodePositions.length; index++) {
      const pos = nodePositions[index];
      // マッチ範囲とノード範囲が重なっているか判定
      // 重なり判定: ノードの終了位置がマッチ開始より後 ＆＆ ノードの開始位置がマッチ終了より前
      // タグまたぎで一部だけ引っかかるケースも拾う
      if (pos.end > matchIndex && pos.start < matchEndIndex) {
        // マッチが全体テキストのどこからどこまでかを、現在のノード内のローカルインデックスに変換
        const localStart = Math.max(0, matchIndex - pos.start);
        // ノードの長さか、マッチがこのノードで終わる位置か、小さい方を終了位置とする
        const localEnd = Math.min(pos.node.textContent.length, matchEndIndex - pos.start);

        // 空文字にならない場合のみ追加
        if (localStart < localEnd) {
          matchingNodes.push({
            node: pos.node,
            matchStart: localStart,
            matchEnd: localEnd
          });
        }
      }
    }

    return matchingNodes.length > 0 ? matchingNodes : null;
  }

  /**
   * 指定したテキストノード（配列）内の該当箇所を一時的にハイライトする
   */
  _applyTemporaryHighlight(matchDataArray, query) {
    if (!Array.isArray(matchDataArray) || matchDataArray.length === 0) return;

    const marksAndParents = [];

    // 各テキストノードの該当部分を <mark> タグで包む
    matchDataArray.forEach((matchData) => {
      const { node, matchStart, matchEnd } = matchData;
      const parent = node.parentElement;
      if (!parent) return;

      const fullText = node.textContent;
      const before = fullText.substring(0, matchStart);
      const matchText = fullText.substring(matchStart, matchEnd);
      const after = fullText.substring(matchEnd);

      const mark = document.createElement('mark');
      mark.className = 'search-jump-highlight';
      mark.textContent = matchText;
      // iframe内で外部CSSが効かない場合への備えとしてインラインスタイルも付与
      mark.style.backgroundColor = '#fef08a';
      mark.style.color = '#1f2937';
      mark.style.padding = '0 4px';
      mark.style.borderRadius = '4px';
      mark.style.boxShadow = '0 0 10px rgba(254, 240, 138, 0.8)';
      mark.style.transition = 'background 1s ease, box-shadow 1s ease';

      const fragment = document.createDocumentFragment();
      if (before) fragment.appendChild(document.createTextNode(before));
      fragment.appendChild(mark);
      if (after) fragment.appendChild(document.createTextNode(after));

      parent.replaceChild(fragment, node);
      marksAndParents.push({ mark, parent, before, matchText, after });
    });

    // 5秒後にハイライトを解除（マーク要素を削除してテキストに戻す）
    setTimeout(() => {
      marksAndParents.forEach(({ mark, parent, before, matchText, after }) => {
        if (!mark.parentNode) return;

        // トランジションで色を消す
        mark.style.backgroundColor = 'transparent';
        mark.style.boxShadow = 'none';

        setTimeout(() => {
          const combined = (before || "") + matchText + (after || "");
          const textNode = document.createTextNode(combined);
          if (mark.parentNode) {
            parent.replaceChild(textNode, mark);
            parent.normalize();
          }
        }, 1000); // 1秒かけて色を消した後にDOMから削除
      });
    }, 5000);
  }

  navigateToHref(href, fallbackSpineIndex = 0) {
    if (!href || !this.pagination?.pages?.length) return;
    const [pathPart, fragPart] = href.split("#");
    const spineIndex = this.resolveSpineIndexFromHref(pathPart || href, fallbackSpineIndex);
    let segmentIndex = 0;
    if (fragPart) {
      const spineItem = this.spineItems?.[spineIndex];
      segmentIndex = this.computeSegmentIndexForFragment(spineItem?.htmlString, fragPart);
    }

    let pageIndex = this.findPageContaining(spineIndex, segmentIndex);
    if (pageIndex < 0) {
      pageIndex = this.pagination.pages.findIndex((page) => page.spineIndex === spineIndex);
    }
    if (pageIndex >= 0) {
      this.pageController.goTo(pageIndex);
    }
  }

  interceptInternalLinks(container, page) {
    if (!container) return;
    const anchors = Array.from(container.querySelectorAll(DOM_SELECTORS.ANCHOR_WITH_HREF));
    if (!anchors.length) return;
    anchors.forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        const href = anchor.getAttribute("href");
        if (!href || this.isExternalLink(href)) return;
        event.preventDefault();
        event.stopPropagation();

        // [修正] Join Mode への対応: リンクが含まれるコンテナから spineIndex を特定
        const parentSpineContainer = anchor.closest('.joined-spine-item');
        const spineIndexContext = parentSpineContainer
          ? parseInt(parentSpineContainer.getAttribute('data-spine-index'), 10)
          : (page?.spineIndex ?? this.pagination?.pages?.[this.currentPageIndex]?.spineIndex ?? 0);

        this.navigateToHref(href, spineIndexContext);
      });
    });
  }

  /**
   * [追加] 目次情報を基に、spine item を章（グループ）ごとに分類する。
   * @returns {Array<Object>} グループ情報の配列。各要素は { name: string, startIndex: number, endIndices: Array<number> }
   */
  generateSpineGroupsFromToc() {
    if (!this.book?.spine || !this.toc) return null;

    const spineLength = this.book.spine.length;
    const groups = [];

    // book.spine から href のルックアップマップを構築する
    // （this.spineItems はまだ空の可能性があるため、book.spine を直接参照する）
    const spineHrefMap = new Map();
    for (let i = 0; i < spineLength; i++) {
      const spineItem = this.book.spine.get(i);
      if (spineItem?.href) {
        // 正規化された href とファイル名のみの両方でマッピング
        const href = spineItem.href;
        const resolvedHref = this.book?.path?.resolve
          ? this.book.path.resolve(href) : href;
        const filename = href.split('/').pop();
        spineHrefMap.set(href, i);
        spineHrefMap.set(resolvedHref, i);
        if (filename) spineHrefMap.set(filename, i);
      }
    }

    // TOC href から spineIndex を解決するローカル関数
    const resolveSpineIndex = (tocHref) => {
      if (!tocHref) return -1;
      const [pathPart] = tocHref.split('#');
      if (!pathPart) return -1;

      // そのままマッチ
      if (spineHrefMap.has(pathPart)) return spineHrefMap.get(pathPart);

      // book.path.resolve で解決してマッチ
      const resolved = this.book?.path?.resolve
        ? this.book.path.resolve(pathPart) : pathPart;
      if (spineHrefMap.has(resolved)) return spineHrefMap.get(resolved);

      // ファイル名のみで部分マッチ
      const filename = pathPart.split('/').pop();
      if (filename && spineHrefMap.has(filename)) return spineHrefMap.get(filename);

      return -1;
    };

    // 目次項目を spineIndex 順にソートして、各項目の開始位置を特定する
    // NOTE:
    //   サブ目次（subitems）には「挿絵」「節」など章境界ではない項目が含まれることがある。
    //   それを章区切りに使うと、挿絵ページで章が切れてしまうため、まずはトップレベルを優先する。
    // 目次項目を全階層から抽出
    const allEntries = [];
    const traverseToc = (items, depth = 0) => {
      items.forEach(item => {
        const spineIndex = resolveSpineIndex(item.href);
        if (spineIndex >= 0) {
          allEntries.push({ title: item.label, spineIndex, depth });
        }
        if (item.subitems && item.subitems.length > 0) {
          traverseToc(item.subitems, depth + 1);
        }
      });
    };
    traverseToc(this.toc, 0);

    const tocEntries = allEntries;

    // 重複を削除し、インデックス順にソート
    const sortedToc = tocEntries
      .sort((a, b) => a.spineIndex - b.spineIndex)
      .filter((entry, index, self) =>
        index === 0 || entry.spineIndex !== self[index - 1].spineIndex
      );

    if (sortedToc.length === 0) {
      // 目次がない場合は全章を一つのグループにする（以前の挙動）
      return [{ start: 0, end: spineLength - 1 }];
    }

    // 各セクション（章）の範囲を決定
    for (let i = 0; i < sortedToc.length; i++) {
      const start = sortedToc[i].spineIndex;
      const end = (i < sortedToc.length - 1)
        ? sortedToc[i + 1].spineIndex - 1
        : spineLength - 1;

      // start > end になるケース（同じファイルに複数の目次がある等）は無視
      if (start <= end) {
        groups.push({ start, end });
      }
    }

    // 最初の目次項目より前の spine items がある場合、それもグループ化する（表紙など）
    if (groups.length > 0 && groups[0].start > 0) {
      groups.unshift({ start: 0, end: groups[0].start - 1 });
    }

    console.log('[JoinMode] Spine Groups generated from TOC:', groups);
    return groups;
  }

  renderEpubPage(index, pagination = this.pagination) {
    if (!pagination?.pages?.length || !this.viewer) return;
    const clampedIndex = Math.max(0, Math.min(index, pagination.pages.length - 1));
    const page = pagination.pages[clampedIndex];
    if (!page) return;
    this.currentPageIndex = clampedIndex;
    this.viewer.innerHTML = `<div class="epub-page"></div>`;
    this.pageContainer = this.viewer.querySelector(DOM_SELECTORS.EPUB_PAGE);
    if (!this.pageContainer) return;

    // Join Mode か通常の単一ページ描画かを判定
    let combinedHtml = "";
    if (this.epubViewMode === EPUB_VIEW_MODES.SCROLL && page.isJoined) {
      // Join Modeでは、paginator側で非先頭spineをページ化しない実装のため、
      // pagination.pages だけで連結すると途中spine（挿絵ページ等）が欠落する。
      // そのため描画時は spineItems（SSOT）を基準に連結する。
      const currentSpineIndex = page.spineIndex;
      const group = this._spineGroups?.find(g => currentSpineIndex >= g.start && currentSpineIndex <= g.end);

      if (group) {
        for (let si = group.start; si <= group.end; si++) {
          const spineItem = this.spineItems?.[si];
          const fallbackPage = pagination.pages.find((p) => p.spineIndex === si);
          const htmlFragment = spineItem?.htmlString || fallbackPage?.htmlFragment || "";
          if (!htmlFragment) continue;
          combinedHtml += `<div class="joined-spine-item" data-spine-index="${si}">${htmlFragment}</div>`;
        }
      } else {
        combinedHtml = `<div class="joined-spine-item" data-spine-index="${page.spineIndex}">${page.htmlFragment || ""}</div>`;
      }
    } else {
      // Joined でない場合でも、単一の spine item をラップして描画（CSSの一貫性のため）
      combinedHtml = `<div class="joined-spine-item" data-spine-index="${page.spineIndex}">${page.htmlFragment || ""}</div>`;
    }

    // HTML内の src/srcset を data-src/data-srcset に一時退避させて 404 を防ぐ
    let safeHtml = combinedHtml;

    // src="..." を data-src="..." に置換 (blob: や data: で始まるもの、またはすでに data-src のものは除外)
    // (?<=[\s"']) によって、直前が空白文字または引用符の場合のみに限定し data-src= の誤判定を防ぐ
    safeHtml = safeHtml.replace(
      /(<img\s+[^>]*?)(?<=[\s"'])src\s*=\s*(["'])(?!blob:|data:)(.*?)\2/gi,
      '$1data-src=$2$3$2'
    );
    // srcset="..." を data-srcset="..." に置換
    safeHtml = safeHtml.replace(
      /(<img\s+[^>]*?)(?<=[\s"'])srcset\s*=\s*(["'])(?!blob:|data:)(.*?)\2/gi,
      '$1data-srcset=$2$3$2'
    );
    // SVGのimageタグのhref="..."を退避 (xlink:hrefなどに誤爆しないよう厳格化)
    safeHtml = safeHtml.replace(
      /(<image\s+[^>]*?)(?<=[\s"'])href\s*=\s*(["'])(?!blob:|data:)(.*?)\2/gi,
      '$1data-href=$2$3$2'
    );
    // SVGのimageタグのxlink:href="..."を退避
    safeHtml = safeHtml.replace(
      /(<image\s+[^>]*?)(?<=[\s"'])xlink:href\s*=\s*(["'])(?!blob:|data:)(.*?)\2/gi,
      '$1data-xlink-href=$2$3$2'
    );

    this.pageContainer.innerHTML = safeHtml;
    // --- [修正終了] ---

    this.pageContainer.querySelectorAll(DOM_SELECTORS.IMAGE_WITH_SVG).forEach((img) => {
      const className = img.getAttribute("class") || "";
      const isGaiji = className.toLowerCase().includes("gaiji");
      if (isGaiji) {
        img.classList.add(UI_CLASSES.GAIJI_IMAGE || "reader-gaiji-img");
      } else {
        img.classList.add(UI_CLASSES.FULLSCREEN_IMAGE || "reader-fullscreen-img");
      }
    });
    this.resolveImagesInRenderedPage(page);
    this.interceptInternalLinks(this.pageContainer, page);
    this.updateEpubTheme();
    this.injectImageZoom();
    this.updateProgressFromPagination(pagination.pages.length);

    if (this.pageContainer) {
      // セグメント指定がある場合（検索・しおりジャンプ）、該当テキスト位置までスクロール
      // ページめくりモード・スクロールモード共通
      const pendingSegment = this._pendingScrollToSegment;
      const pendingSearchQuery = this._pendingScrollSearchQuery;

      // レンダリング直後のため、requestAnimationFrame で確実に行う
      requestAnimationFrame(() => {
        if (!this.viewer || !this.pageContainer) return;

        if (pendingSegment != null || pendingSearchQuery) {
          const shouldHighlight = this._pendingScrollHighlight;
          // [修正] Join Mode 時に正しい章へ飛ぶよう spineIndex を渡す
          const targetSpineIndex = page?.spineIndex;
          this._scrollToPositionInDOM(this.pageContainer, pendingSegment, pendingSearchQuery, shouldHighlight, targetSpineIndex);
          this._pendingScrollToSegment = null;
          this._pendingScrollSearchQuery = null;
          this._pendingScrollHighlight = true; // デフォルトに戻す
        } else {
          this._scrollTargetNode = null;

          if (this.epubViewMode === "scroll") {
            const alignToEnd = this._scrollPositionOnNextRender === 'end';
            this._scrollPositionOnNextRender = null; // リセット
            this._currentAlignToEnd = alignToEnd;    // ResizeObserver用に保持

            const isVerticalScroll = this.epubViewMode !== "scroll" && this.writingMode === WRITING_MODES.VERTICAL;
            if (isVerticalScroll) {
              if (alignToEnd) {
                this.viewer.scrollLeft = -this.viewer.scrollWidth;
              } else {
                this.viewer.scrollLeft = 0;
              }
            } else {
              if (alignToEnd) {
                this.viewer.scrollTop = this.viewer.scrollHeight;
              } else {
                this.viewer.scrollTop = 0;
              }
            }
          }
        }

        if (this.epubViewMode === "scroll") {
          this.injectScrollNavigationButtons(this.pageContainer, clampedIndex, pagination.pages.length);
      if (this._resizeObserver) {
            this._resizeObserver.disconnect();
          }
          this._resizeObserver = new ResizeObserver(() => {
            if (!this.viewer) return;
            const isVerticalScroll = this.epubViewMode !== "scroll" && this.writingMode === WRITING_MODES.VERTICAL;
            if (this._scrollTargetNode) {
              // ジャンプ先のノードがある場合はそのノードの位置を維持
              this._scrollTargetNode.scrollIntoView({ block: "start", inline: "start", behavior: "instant" });
            } else if (this._currentAlignToEnd) {
              // 前のページから戻ってきた場合など、末尾合わせを維持する
              if (isVerticalScroll) {
                this.viewer.scrollLeft = -this.viewer.scrollWidth;
              } else {
                this.viewer.scrollTop = this.viewer.scrollHeight;
              }
            }
          });
          this._resizeObserver.observe(this.pageContainer);
        }
      });
    }
  }

  injectScrollNavigationButtons(container, currentIndex, totalPages) {
    // 既存のボタンを削除（重複生成・二重発火を防止）
    const existingGroups = container.querySelectorAll('.epub-scroll-nav-group, .epub-scroll-nav-btn');
    existingGroups.forEach(el => el.remove());

    const createButton = (textKey, defaultText, onClick) => {
      const btn = document.createElement('button');
      btn.textContent = (typeof window.t === 'function') ? window.t(textKey) : defaultText;
      btn.className = "epub-scroll-nav-btn";

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick(e);
      });
      return btn;
    };

    const createButtonGroup = () => {
      const group = document.createElement('div');
      group.className = "epub-scroll-nav-group";
      return group;
    };

    // ボタンのインスタンス生成
    const createPrevBtn = () => {
      if (currentIndex <= 0) return null;
      return createButton('areaPagePrev', '前のページ', () => {
        this._scrollPositionOnNextRender = 'end';
        this.pageController.prev();
      });
    };

    const createNextBtn = () => {
      if (currentIndex >= totalPages - 1) return null;
      return createButton('areaPageNext', '次のページ', () => {
        this._scrollPositionOnNextRender = 'start';
        this.pageController.next();
      });
    };

    // --- 上部（または右端）のボタングループ ---
    const topGroup = createButtonGroup();
    const topPrev = createPrevBtn();
    const topNext = createNextBtn();
    if (topPrev) topGroup.appendChild(topPrev);
    if (topNext) topGroup.appendChild(topNext);
    if (topGroup.childNodes.length > 0) {
      container.prepend(topGroup);
    }

    // --- 下部（または左端）のボタングループ ---
    const bottomGroup = createButtonGroup();
    const bottomPrev = createPrevBtn();
    const bottomNext = createNextBtn();
    if (bottomPrev) bottomGroup.appendChild(bottomPrev);
    if (bottomNext) bottomGroup.appendChild(bottomNext);
    if (bottomGroup.childNodes.length > 0) {
      container.appendChild(bottomGroup);
    }
  }

  _calculateCurrentPercentage(totalPages) {
    if (!totalPages || totalPages <= 0) return 0;

    let currentIndex = this.currentPageIndex;

    if (this.epubViewMode === "scroll" && this.viewer) {
      // スクロールモード: 章内スクロール位置を加味
      const isVertical = this.writingMode === WRITING_MODES.VERTICAL;
      let scrollRatio = 0;
      if (isVertical) {
        const maxScroll = Math.abs(this.viewer.scrollWidth - this.viewer.clientWidth);
        scrollRatio = maxScroll > 0 ? (Math.abs(this.viewer.scrollLeft) / maxScroll) : 0;
      } else {
        const maxScroll = Math.abs(this.viewer.scrollHeight - this.viewer.clientHeight);
        scrollRatio = maxScroll > 0 ? (Math.abs(this.viewer.scrollTop) / maxScroll) : 0;
      }

      // [修正] Androidバックグラウンド移行時の計測失敗（0リセット）対策
      if (scrollRatio === 0 && this._lastValidScrollRatio > 0) {
        // pagehide等の特殊なタイミングでは前回の比率を維持
        scrollRatio = this._lastValidScrollRatio;
      } else if (scrollRatio > 0) {
        this._lastValidScrollRatio = scrollRatio;
      }

      currentIndex = Math.min(this.currentPageIndex + scrollRatio, totalPages - 1);
    }

    return calculateProgressPercentage(currentIndex, totalPages);
  }

  updateProgressFromPagination(totalPages) {
    if (!totalPages) return;

    const percentage = this._calculateCurrentPercentage(totalPages);

    const locator = this.getPageLocator(this.currentPageIndex);

    // 有効な（章の先頭ではない）位置を取得できた場合はキャッシュに保存
    if (locator && (locator.segmentIndex > 0 || this.currentPageIndex > 0)) {
      this._lastValidScrollLocation = { ...locator };
    }

    const fallbackLocator = locator ? null : this.getFallbackLocator();
    this.onProgress?.({
      location: locator ?? fallbackLocator ?? null,
      percentage,
    });
  }

  async resolveImagesInRenderedPage(page) {
    if (!this.pageContainer || !this.resourceLoader) return;
    const images = Array.from(this.pageContainer.querySelectorAll(DOM_SELECTORS.IMAGE_WITH_SVG));
    if (!images.length) return;

    await Promise.all(
      images.map(async (img) => {
        // [修正] Join Mode への対応: 親要素から spineIndex を取得
        const parentSpineContainer = img.closest('.joined-spine-item');
        const spineIndex = parentSpineContainer
          ? parseInt(parentSpineContainer.getAttribute('data-spine-index'), 10)
          : (page?.spineIndex ?? -1);

        if (spineIndex < 0) return;
        const spineItem = this.spineItems[spineIndex];
        if (!spineItem) return;

        const tagName = img.tagName.toLowerCase();
        const isSvgImage = tagName === BOOK_TYPES.IMAGE;

        // SVG imageタグのフォールバック属性を取得
        const svgFallbackHref = isSvgImage ? img.getAttribute("data-href") : null;
        const svgFallbackXlinkHref = isSvgImage ? img.getAttribute("data-xlink-href") : null;

        const attrName = isSvgImage
          ? (img.getAttribute("href") || svgFallbackHref ? "href" : "xlink:href")
          : "src";

        // data-src もフォールバックとして取得
        const fallbackSrc = !isSvgImage
          ? (img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src"))
          : (svgFallbackHref || svgFallbackXlinkHref);

        const src = img.getAttribute(attrName) || fallbackSrc;

        if (!src || src.startsWith("blob:")) return;
        try {
          const resolved = await this.resourceLoader(src, spineItem);
          if (resolved) {
            if (isSvgImage) {
              if (attrName === "xlink:href" || svgFallbackXlinkHref) {
                img.setAttributeNS("http://www.w3.org/1999/xlink", "href", resolved);
                img.setAttribute("xlink:href", resolved);
              } else {
                img.setAttribute("href", resolved);
              }
            } else {
              img.setAttribute(attrName, resolved);
              if (attrName !== "src") {
                img.setAttribute("src", resolved);
              }
            }

            // [追加] 解決できたら一時退避用の属性を削除
            if (!isSvgImage && fallbackSrc) img.removeAttribute("data-src");
            if (isSvgImage && svgFallbackHref) img.removeAttribute("data-href");
            if (isSvgImage && svgFallbackXlinkHref) img.removeAttribute("data-xlink-href");
          }
          if (!isSvgImage) {
            // [修正] data-srcset にも対応
            let srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
            if (srcset) {
              const parts = await Promise.all(
                srcset.split(",").map(async (part) => {
                  const trimmed = part.trim();
                  if (!trimmed) return "";
                  const [url, descriptor] = trimmed.split(/\s+/, 2);
                  const resolvedUrl = await this.resourceLoader(url, spineItem);
                  return descriptor ? `${resolvedUrl} ${descriptor}` : resolvedUrl;
                })
              );
              img.setAttribute("srcset", parts.filter(Boolean).join(", "));
              // [追加] data-srcset を削除
              img.removeAttribute("data-srcset");
            }
          }
        } catch (error) {
          // ignore
        }
      })
    );
  }

  async buildPagination() {
    if (this.type !== BOOK_TYPES.EPUB || !this.book?.spine) {
      return null;
    }
    if (this.pagination) {
      console.log('[buildPagination] キャッシュ済みpaginationを返却 (pages:', this.pagination.pages?.length, ')');
      return this.pagination;
    }
    if (this.paginationPromise) {
      console.log('[buildPagination] 既存のpaginationPromiseを待機');
      return this.paginationPromise;
    }
    const timerName = `[buildPagination] total-${Date.now()}`;
    console.time(timerName);
    console.log('[buildPagination] 開始 (spine items:', this.book.spine.length, ')');

    const paginationMetrics = this.getPaginationViewportMetrics();
    const viewportWidth = paginationMetrics.viewportWidth;
    const viewportHeight = paginationMetrics.viewportHeight;
    const maxWidthValue = paginationMetrics.maxWidthValue;
    const contentWidth = paginationMetrics.contentWidth;
    const baseFontSize = Number.parseFloat(
      window.getComputedStyle(this.viewer || document.body)?.fontSize
    ) || 16;
    const isScrollMode = this.epubViewMode === "scroll";
    const writingMode =
      (!isScrollMode && this.writingMode === WRITING_MODES.VERTICAL)
        ? CSS_WRITING_MODES.VERTICAL
        : CSS_WRITING_MODES.HORIZONTAL;

    // 新しいパディング方式（vPad/hPadが指定されている場合）
    const { hPad, vPad } = this.getPaddings();
    const edgePadding = `${vPad}px ${hPad}px`; // CSS形式 (上下 左右)

    let firstPageResolver;
    this.firstPagePromise = new Promise(resolve => {
      firstPageResolver = resolve;
    });

    this.paginationPromise = (async () => {
      this.paginationComplete = false;
      const { hPad, vPad } = this.getPaddings();
      const edgePadding = `${vPad}px ${hPad}px`;
      const baseFontSize = Number.parseFloat(
        window.getComputedStyle(this.viewer || document.body)?.fontSize
      ) || 16;
      const isScrollMode = this.epubViewMode === "scroll";
      const writingMode = (!isScrollMode && this.writingMode === WRITING_MODES.VERTICAL)
        ? CSS_WRITING_MODES.VERTICAL
        : CSS_WRITING_MODES.HORIZONTAL;

      // 初回表示用のスケルトン pagination オブジェクトを作成
      this.pagination = { pages: [] };

      this.resourceLoader = (async (url, spineItem) => {
        if (!url) return url;
        if (/^(https?:|data:|blob:)/i.test(url)) return url;

        // [修正] EpubArchiveHandler が利用可能な場合、OPF ベースのパス解決を優先
        if (this.archiveHandler?.resolvePath) {
          const archivePath = this.archiveHandler.resolvePath(url, spineItem?.href);
          if (this.resourceUrlCache.has(archivePath)) return this.resourceUrlCache.get(archivePath);
          try {
            const blob = await this.archiveHandler.getFileBlob(archivePath);
            if (blob) {
              const blobUrl = URL.createObjectURL(blob);
              this.resourceUrlCache.set(archivePath, blobUrl);
              console.log(`[resourceLoader] Resolved via archiveHandler: ${url} -> ${archivePath}`);
              return blobUrl;
            }
          } catch (e) {
            // archiveHandler で見つからない場合は従来ロジックへフォールバック
          }
        }

        const resolvedUrl = normalizeResourceKey(url, spineItem, this.book);
        if (this.resourceUrlCache.has(resolvedUrl)) return this.resourceUrlCache.get(resolvedUrl);

        console.log(`[resourceLoader] Attempting complex fallback for: ${url} (resolved: ${resolvedUrl})`);

        try {
          const filename = url.split("/").pop();
          const candidateSeeds = [
            resolvedUrl,
            resolvedUrl?.replace(/^\//, ""),
            url,
            `OEBPS/${url}`,
            `OEBPS/${resolvedUrl}`,
            filename,
            `Images/${filename}`,
            `OEBPS/Images/${filename}`,
            safeDecodeURIComponent(url),
            safeDecodeURIComponent(resolvedUrl),
            safeEncodeURI(safeDecodeURIComponent(url)),
            safeEncodeURI(safeDecodeURIComponent(resolvedUrl)),
          ];
          const candidates = candidateSeeds
            .map((candidate) => normalizeResourceKey(candidate, spineItem, this.book))
            .filter((value, index, array) => value && array.indexOf(value) === index);

          let resourceItem = null;
          for (const candidate of candidates) {
            try {
              let item = this.book?.resources?.get?.(candidate);
              if (item && typeof item.then === 'function') item = await item;
              if (item) {
                resourceItem = item;
                break;
              }
            } catch (e) { }
          }

          if (!resourceItem && this.book?.package?.manifest) {
            try {
              const manifest = this.book.package.manifest;
              const targetFilename = normalizeResourceFilenameKey(filename);
              const resolvedComparisonKey = normalizeResourceComparisonKey(resolvedUrl, spineItem, null);
              const foundItem = Object.values(manifest).find(item => {
                if (!item.href) return false;
                const resolvedHref = this.book?.path?.resolve ? this.book.path.resolve(item.href) : item.href;
                const manifestKey = normalizeResourceComparisonKey(resolvedHref, spineItem, null);
                return manifestKey === resolvedComparisonKey || (targetFilename && manifestKey.endsWith("/" + targetFilename));
              });
              if (foundItem) {
                const resolvedHref = this.book?.path?.resolve ? this.book.path.resolve(foundItem.href) : foundItem.href;
                let item = this.book.resources.get(normalizeResourceKey(resolvedHref, spineItem, null));
                if (item && typeof item.then === 'function') item = await item;
                if (item) resourceItem = item;
              }
            } catch (e) { }
          }

          if (!resourceItem) {
            const zip = this.book?.archive?.zip;
            const zipFileKeyMap = this.getZipFileKeyMap();
            if (zip && zipFileKeyMap) {
              const zipKeys = [resolvedUrl, url, safeDecodeURIComponent(url), safeDecodeURIComponent(resolvedUrl)]
                .map((value) => normalizeZipEntryKey(value))
                .filter((value, index, array) => value && array.indexOf(value) === index);
              for (const key of zipKeys) {
                const lookupKey = normalizeZipEntryKey(key, { lowerCase: true });
                const realKey = zipFileKeyMap.get(key) ?? zipFileKeyMap.get(lookupKey);
                if (!realKey) continue;
                const fileEntry = zip.file(realKey);
                if (!fileEntry) continue;
                const blob = await fileEntry.async("blob");
                const objectUrl = URL.createObjectURL(blob);
                this.resourceUrlCache.set(resolvedUrl, objectUrl);
                return objectUrl;
              }
            }
          }

          if (!resourceItem) return url;
          if (typeof resourceItem === "string") return resourceItem;
          if (resourceItem instanceof Blob) {
            const objectUrl = URL.createObjectURL(resourceItem);
            this.resourceUrlCache.set(resolvedUrl, objectUrl);
            return objectUrl;
          }
          const type = resourceItem.mediaType || resourceItem.type || "";
          if (type.startsWith("image/") || type.includes("font")) {
            const blob = await resourceItem.getBlob();
            const objectUrl = URL.createObjectURL(blob);
            this.resourceUrlCache.set(resolvedUrl, objectUrl);
            return objectUrl;
          }
          if (resourceItem.getText) return await resourceItem.getText();
          if (resourceItem.getBlob) {
            const blob = await resourceItem.getBlob();
            const objectUrl = URL.createObjectURL(blob);
            this.resourceUrlCache.set(resolvedUrl, objectUrl);
            return objectUrl;
          }
          return url;
        } catch (error) {
          console.error("Failed to load resource:", resolvedUrl, error);
          return url;
        }
      });
      this.spineItems = [];
      this._spineGroups = this.generateSpineGroupsFromToc();

      // パジネーター初期化 (spineItems は後で追加される)
      this.paginator = new EpubPaginator([], this.resourceLoader, {
        viewportWidth: paginationMetrics.viewportWidth,
        viewportHeight: paginationMetrics.viewportHeight,
        contentWidth: paginationMetrics.contentWidth,
        maxWidth: maxWidthValue,
        fontSize: baseFontSize,
        lineHeight: paginationMetrics.lineHeight,
        writingMode,
        padding: edgePadding,
        epubViewMode: this.epubViewMode,
        joinSpineItems: this.epubViewMode === EPUB_VIEW_MODES.SCROLL,
        spineGroups: this._spineGroups, // [追加] 章の境界情報を渡す
      });

      // 以前のパジネーション実行があれば中断
      if (this.currentPaginationRun) {
        this.currentPaginationRun.cancelled = true;
      }
      const run = { cancelled: false };
      this.currentPaginationRun = run;

      // 逐次読み込みループ
      const progressiveGen = this.paginator.paginateProgressive(run);
      let isFirstChapterDone = false;
      let spineIndex = 0;

      // Spineの項目を1つずつロードしてパジネーションに渡す
      while (spineIndex < this.book.spine.length) {
        const item = this.book.spine.get(spineIndex);
        if (item) {
          try {
            await item.load(this.book.load.bind(this.book));
            const doc = item.document || item.contents?.document;
            const htmlString = doc?.body?.innerHTML ?? "";
            if (htmlString.trim()) {
              const newItem = {
                id: item.idref || item.id || `spine-${spineIndex}`,
                href: item.href,
                htmlString,
              };
              this.spineItems.push(newItem);
              this.paginator.spineItems.push(newItem);

              // 逐次計算の実行
              const result = await progressiveGen.next();
              // 中断チェック
              if (run.cancelled) {
                console.log("Pagination cancelled during loop.");
                return null;
              }
              if (result.value) {
                this.pagination.pages = result.value.pages;
                this.pageController.setTotalPages(this.pagination.pages.length);

                // 第1チャプターが完了したら即座に表示を開始
                if (!isFirstChapterDone) {
                  isFirstChapterDone = true;
                  // ローディング解除と初期表示
                  const startPage = this.resolveStartPageIndexIfReady(
                    this._pendingStartLocation,
                    this.pagination.pages.length
                  );
                  if (startPage !== null) {
                    this.pageController.goTo(startPage);
                  }

                  // メタデータと目次を通知（初回のみ、またはリパジネーション時は必要に応じて）
                  if (!this._isInitialReadyCalled) {
                    this._isInitialReadyCalled = true;
                    this.onReady?.({
                      metadata: this.book.package?.metadata,
                      toc: this.toc,
                      direction: this.pageDirection,
                      writingMode: this.writingMode,
                    });
                  }

                  firstPageResolver(this.pagination);
                } else {
                  // 2回目以降は現在のページがずれないように調整が必要な場合があるが、
                  // 基本的には pages が増えるだけなので、progress 表示などの更新を行う
                  this.updateProgressFromPagination(this.pagination.pages.length);
                }
              }
              if (result.done) break;
            }
          } catch (error) {
            console.warn("Failed to load spine item for pagination:", error);
          } finally {
            if (item.unload) item.unload();
          }
        }
        spineIndex++;
      }

      // 中断チェック
      if (run.cancelled) return null;

      if (!isFirstChapterDone) {
        firstPageResolver(this.pagination);
      }

      // 最終的な後処理（カバーページ追加など）
      const coverAdded = await this.addCoverPageIfNeeded(this.pagination);
      if (coverAdded) {
        // 表紙が追加されたことでインデックスが1つずれるため、現在の位置を維持するように調整
        this.currentPageIndex += 1;
        if (this.pageController) {
          this.pageController.currentIndex += 1;
        }
      }
      this.pageController.setTotalPages(this.pagination.pages.length);
      this.paginationComplete = true;
      console.timeEnd(timerName);
      console.log('[buildPagination] 完了 (pages:', this.pagination.pages.length, ')');

      this.paginationPromise = null;
      this.firstPagePromise = null;
      return this.pagination;
    })();

    return this.firstPagePromise;
  }

  async openImageBook(file, startPage = 0, bookType = null, options = {}) {
    this.resetReaderState();
    this.toc = [];
    void bookType;
    this.imageArchiveSize = file?.size ?? 0;
    this.emitLoadingUpdate({
      phase: READER_LOADING_PHASES.ARCHIVE_INIT,
      status: READER_LOADING_STATUSES.START,
    });
    const handler = await createArchiveHandler(file, {
      forceStreaming: options.streaming === true,
    });
    this.emitLoadingUpdate({
      phase: READER_LOADING_PHASES.ARCHIVE_INIT,
      status: READER_LOADING_STATUSES.COMPLETE,
    });
    this.archiveHandler = handler;
    // 画像書庫として扱う
    this.type = BOOK_TYPES.IMAGE;
    let images = [];

    try {
      const archiveLabel = handler.getArchiveLabel();
      console.log(`Processing ${archiveLabel} file: ${file.name}`);

      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.ARCHIVE_LIST,
        status: READER_LOADING_STATUSES.START,
      });
      const imageEntries = await handler.listImageEntries();
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.ARCHIVE_LIST,
        status: READER_LOADING_STATUSES.COMPLETE,
        current: imageEntries.length,
        total: imageEntries.length,
      });
      console.log(`Filtered ${imageEntries.length} image entries from ${archiveLabel}`);

      if (imageEntries.length === 0) {
        console.error("No image files found in archive.");
        const noImageError = new Error("画像が見つかりませんでした。アーカイブ内に画像ファイルが含まれているか確認してください。");
        if (typeof handler.reportArchiveError === "function") {
          await handler.reportArchiveError(file?.name ?? "", noImageError);
        }
        throw noImageError;
      }

      images = imageEntries.map(({ path, entry }) => ({ path, entry }));

      if (!images.length) {
        const noImageError = new Error("画像が見つかりませんでした。対応フォーマットの画像が含まれているか確認してください。");
        if (typeof handler.reportArchiveError === "function") {
          await handler.reportArchiveError(file?.name ?? "", noImageError);
        }
        throw noImageError;
      }

      // 階層対応 + ファイル名順に統一してソート
      images.sort((a, b) => {
        const normalize = (path) => path.replace(/\\/g, "/");
        const aPath = normalize(a.path);
        const bPath = normalize(b.path);

        // パス全体で自然順ソート（階層含む）
        return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: "base" });
      });

      console.log('Sorted image paths:', images.slice(0, 5).map(img => img.path));

      this.imageEntries = images;
      this.imagePages = new Array(images.length).fill(null);
      this.imagePageErrors = new Array(images.length).fill(null);

      const memoryStrategy = getMemoryStrategy();
      // ストリーミングモード時は最小限（1枚）のプリロードに制限
      const isStreamingMode = typeof handler.close === "function"; // StreamingZipHandler固有メソッド
      const basePreloadCount = isStreamingMode
        ? MEMORY_STRATEGY.imageStreamingPreloadCount
        : (memoryStrategy?.imagePreloadCount ?? MEMORY_STRATEGY.imagePreloadCount);
      const preloadCount = Math.min(basePreloadCount, images.length);
      console.log(`Preloading ${preloadCount} images to object URLs... (streaming=${isStreamingMode})`);
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.IMAGE_PRELOAD,
        status: READER_LOADING_STATUSES.START,
        current: 0,
        total: preloadCount,
      });

      for (let index = 0; index < preloadCount; index += 1) {
        await this.convertImageAtIndex(index, { reportError: true });
        this.emitLoadingUpdate({
          phase: READER_LOADING_PHASES.IMAGE_PRELOAD,
          status: READER_LOADING_STATUSES.PROGRESS,
          current: index + 1,
          total: preloadCount,
        });
      }

      this.imageIndex = Math.min(startPage, this.imagePages.length - 1);
      const loadedCount = this.imagePages.filter((page) => page !== null).length;
      console.log(`Preloaded ${loadedCount} images successfully`);

      if (loadedCount === 0) {
        await this.convertImageAtIndex(this.imageIndex, { reportError: true });
        if (!this.imagePages[this.imageIndex]) {
          console.error('All preloaded images failed to convert to object URLs');
          throw new Error("画像の読み込みに失敗しました。最初のページの変換に失敗しました。");
        }
      }

      this.renderImagePage();
      this.onReady?.({
        metadata: { title: file.name, creator: "画像書籍" },
        toc: [],
      });
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.READY,
        status: READER_LOADING_STATUSES.COMPLETE,
        current: this.imageIndex + 1,
        total: this.imagePages.length,
      });
    } catch (error) {
      console.error("Error opening image book:", error);
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.ARCHIVE_INIT,
        status: READER_LOADING_STATUSES.ERROR,
      });
      throw new Error(`画像書籍の読み込みに失敗しました: ${error.message}`);
    }
  }

  async convertImageAtIndex(index, { reportError, retry = false } = {}) {
    if (!this.imageEntries.length) return null;
    if (this.imagePages[index]) return this.imagePages[index];
    // retry フラグが立っている場合はエラーキャッシュをクリアして再試行を許可
    if (this.imagePageErrors[index] && !retry) return null;

    const image = this.imageEntries[index];
    if (!image) return null;

    try {
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.IMAGE_CONVERT,
        status: READER_LOADING_STATUSES.START,
        current: index + 1,
        total: this.imageEntries.length,
      });
      const handler = this.archiveHandler;
      if (!handler) {
        throw new Error("アーカイブハンドラが初期化されていません。");
      }

      const blob = await handler.getFileBlob(image.path);
      if (!blob || blob.size === 0) {
        throw new Error("画像データが空です。");
      }

      const objectUrl = URL.createObjectURL(blob);
      this.imagePages[index] = objectUrl;
      // 成功時はエラーをクリア（リトライ成功時のため）
      this.imagePageErrors[index] = null;
      this.manageImageCache(index);
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.IMAGE_CONVERT,
        status: READER_LOADING_STATUSES.COMPLETE,
        current: index + 1,
        total: this.imageEntries.length,
      });
      return objectUrl;
    } catch (error) {
      const pageNumber = index + 1;
      const message = `画像変換に失敗しました（${pageNumber}ページ目: ${image.path}）`;
      console.error(message, error);
      this.imagePageErrors[index] = message;
      this.emitLoadingUpdate({
        phase: READER_LOADING_PHASES.IMAGE_CONVERT,
        status: READER_LOADING_STATUSES.ERROR,
        current: index + 1,
        total: this.imageEntries.length,
      });
      if (reportError) {
        this.showImageConvertError(message);
      }
      return null;
    }
  }

  getImageCacheSize() {
    const memoryStrategy = getMemoryStrategy();
    const cacheSize = memoryStrategy?.CACHE_SIZE ?? MEMORY_STRATEGY.CACHE_SIZE;
    const largeCacheSize = memoryStrategy?.LARGE_CACHE_SIZE ?? MEMORY_STRATEGY.LARGE_CACHE_SIZE;
    const largeFileThreshold = memoryStrategy?.LARGE_FILE_THRESHOLD ?? MEMORY_STRATEGY.LARGE_FILE_THRESHOLD;
    if (this.imageArchiveSize >= largeFileThreshold) {
      return largeCacheSize;
    }
    return cacheSize;
  }

  manageImageCache(currentIndex) {
    if (!this.isImageBook() || !this.imagePages.length) return;
    const cacheSize = this.getImageCacheSize();
    if (!Number.isFinite(cacheSize) || cacheSize < 0) return;

    const minIndex = Math.max(0, currentIndex - cacheSize);
    const maxIndex = Math.min(this.imagePages.length - 1, currentIndex + cacheSize);

    this.imagePages.forEach((page, index) => {
      if (index >= minIndex && index <= maxIndex) return;
      if (typeof page === "string") {
        URL.revokeObjectURL(page);
      }
      if (page !== null) {
        this.imagePages[index] = null;
      }
    });
  }

  showImageConvertError(message) {
    if (this.imageElement) {
      this.imageElement.removeAttribute("src");
      this.imageElement.alt = message;
      this.imageElement.title = message;
    }
    if (typeof alert === "function") {
      alert(message);
    }
  }

  renderImagePage() {
    if (!this.imagePages.length) return;
    const targetIndex = this.imageIndex;

    // RTL モードクラスを適用
    if (this.imageViewer) {
      if (this.imageReadingDirection === READING_DIRECTIONS.RTL) {
        this.imageViewer.classList.add(UI_CLASSES.RTL_MODE);
      } else {
        this.imageViewer.classList.remove(UI_CLASSES.RTL_MODE);
      }
    }

    // 現在のページが横長かどうかチェック（非同期だが、すでにプリロード済みと仮定または簡易チェック）
    // 横長判定: プリロードされた画像データから判定するのは難しいが、
    // Imageオブジェクトを一時生成してチェックするか、キャッシュ済みの情報を利用する。
    // ここでは描画時に判定して動的にモード切替相当の処理を行うアプローチをとる。

    // 見開きモードの場合
    if (this.imageViewMode === IMAGE_VIEW_MODES.SPREAD && this.imageViewer) {
      // 横長チェックは renderSpreadPage 内で実施し、必要なら単ページ表示にフォールバック
      // ただし描画遅延を防ぐため、Imageオブジェクトを一時生成してサイズ取得を試みる
      this.checkWideAndRender(targetIndex);
    } else {
      // 単ページモード
      this.renderSinglePageWithStyle(targetIndex);
    }
  }

  async checkWideAndRender(index) {
    // 横長判定も renderSpreadPage 内で行うため、直接呼び出す
    await this.renderSpreadPage(index);
  }

  // ---------------------------------------------------------
  // [修正] 画像データを安全に取得するヘルパー（自動ロード機能付き）
  // ---------------------------------------------------------
  async getImageData(index) {
    if (index < 0 || index >= this.imagePages.length) return null;

    // ★追加: データがまだロードされていない（nullの）場合は、ここで変換処理を実行する
    // エラー済みの場合もリトライを試みる（一時的なエラーの可能性があるため）
    if (!this.imagePages[index]) {
      await this.convertImageAtIndex(index, { retry: true });
    }

    // imagePages[index] が Promise (アーカイブ読込待ち) の可能性があるため await する
    try {
      const src = await this.imagePages[index];
      return src;
    } catch (e) {
      console.error("Image load failed:", e);
      return null;
    }
  }

  // ---------------------------------------------------------
  // [修正] 画像サイズ判定（キャッシュ機能付き）
  // ---------------------------------------------------------
  async getPageDimensions(index) {
    // キャッシュがあればそれを返す（高速化）
    if (this.pageDimensionCache[index]) {
      return this.pageDimensionCache[index];
    }

    const src = await this.getImageData(index);
    if (!src) return { w: 0, h: 0 };

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = { w: img.naturalWidth, h: img.naturalHeight };
        // サイズをキャッシュに保存
        this.pageDimensionCache[index] = size;
        resolve(size);
      };
      img.onerror = () => {
        resolve({ w: 0, h: 0 });
      };
      img.src = src;
    });
  }

  async isImageWide(index) {
    // 範囲外チェック
    if (index < 0 || index >= this.imagePages.length) return false;

    // 画像データの取得
    const src = this.imagePages[index];
    if (!src) return false;

    // 画像サイズを取得するヘルパー
    const getSize = (url) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = url;
    });

    const currentSize = await getSize(src);

    // 判定ロジック: 単純に横幅が高さより大きいかどうか
    // (以前の 1.5倍ルールは廃止し、明確な「横長」定義を使用)
    return currentSize.w > currentSize.h;
  }

  renderSinglePageWithStyle(index, isWideSpread = false) {
    if (!this.imageElement) return;

    this.imageElement.src = this.imagePages[index] || "";
    this.imageElement.style.display = '';

    // 単ページでも画像書庫ならクリック無効化
    if (this.type !== BOOK_TYPES.EPUB) {
      this.imageElement.onclick = null;
      this.imageElement.style.pointerEvents = "none";
    }

    // 見開きコンテナ削除
    if (this.imageViewer) {
      const spreadContainer = this.imageViewer.querySelector(DOM_SELECTORS.SPREAD_CONTAINER);
      if (spreadContainer) spreadContainer.remove();
    }

    this.syncZoomedClass();
    this.updateTransform();

    this.loadImagePage(index);
    // プリロード
    const memoryStrategy = getMemoryStrategy();
    const preloadAheadCount = memoryStrategy.imagePreloadAheadCount;
    if (index + preloadAheadCount < this.imagePages.length) {
      this.loadImagePage(index + preloadAheadCount);
    }

    if (!isWideSpread) {
      this.updateProgress(index, false);
    }
  }

  updateProgress(targetIndex, isWideSpread) {
    if (this.pageIndicator) {
      this.pageIndicator.textContent = `${targetIndex + 1} / ${this.imagePages.length}`;
    }
    this.onProgress?.({
      location: targetIndex,
      percentage: calculateProgressPercentage(targetIndex, this.imagePages.length),
    });
  }

  // ---------------------------------------------------------
  // [修正] 見開き描画メソッド
  // ---------------------------------------------------------
  async renderSpreadPage(targetIndex) {
    if (!this.imageViewer || !this.imagePages.length) return;

    // 元の画像を非表示
    this.imageElement.style.display = 'none';

    // --- 修正箇所 ---
    // 以前のコードではここで this.imageViewer 自体のクラスを書き換えてしまうバグがありました
    let container = this.imageViewer.querySelector(DOM_SELECTORS.SPREAD_CONTAINER);
    if (!container) {
      // コンテナが存在しない場合は新規作成して追加する
      container = document.createElement('div');
      container.className = 'spread-container';
      this.imageViewer.appendChild(container);
    }

    // 画像書庫ならクリック無効
    if (this.type !== BOOK_TYPES.EPUB) {
      container.style.pointerEvents = "none";
    }

    this.syncZoomedClass();

    // 描画開始前に中身を空にする（プログレスバー移動時の残像防止）
    container.innerHTML = '';

    // 1. 現在のページの画像データとサイズを取得
    const page1Src = await this.getImageData(targetIndex);
    if (!page1Src) {
      // 画像がない（範囲外など）
      return;
    }

    // サイズ判定
    const isWide = await this.isImageWide(targetIndex);

    if (isWide) {
      // --- ワイド画像 (1枚表示) ---
      const img = document.createElement('img');
      img.src = page1Src;
      img.className = 'spread-page wide'; //.wide -> max-width: 100%
      if (this.type !== BOOK_TYPES.EPUB) img.style.pointerEvents = "none";
      container.appendChild(img);

      this.currentSpreadStep = 1;

    } else {
      // --- 通常画像 (ペア表示を試みる) ---

      // 次のページがあるか確認
      const nextIndex = targetIndex + 1;
      let showTwoPages = false;
      let page2Src = null;

      if (nextIndex < this.imagePages.length) {
        // 次のページのサイズも確認
        const isNextWide = await this.isImageWide(nextIndex);
        if (!isNextWide) {
          // 次も縦長ならペア成立
          page2Src = await this.getImageData(nextIndex);
          if (page2Src) {
            showTwoPages = true;
          }
        }
      }

      if (showTwoPages) {
        // 2枚表示
        this.currentSpreadStep = 2;

        // 【修正】CSS側(.rtl-mode)で表示順序を反転させるため、
        // JS側では常に DOM順序 = [現在ページ, 次ページ] として生成する。
        // これにより、RTL時は CSS flex-direction 等の効果で [次ページ] [現在ページ] と表示される。
        const leftImgSrc = page1Src;
        const rightImgSrc = page2Src;

        const leftImg = document.createElement('img');
        leftImg.src = leftImgSrc;
        leftImg.className = 'spread-page spread-left';
        if (this.type !== BOOK_TYPES.EPUB) leftImg.style.pointerEvents = "none";
        container.appendChild(leftImg);

        const rightImg = document.createElement('img');
        rightImg.src = rightImgSrc;
        rightImg.className = 'spread-page spread-right';
        if (this.type !== BOOK_TYPES.EPUB) rightImg.style.pointerEvents = "none";
        container.appendChild(rightImg);

      } else {
        // 1枚表示（ペア相手がいない、または次がワイド）
        const img1 = document.createElement('img');
        img1.src = page1Src;
        img1.className = 'spread-page single-view';
        if (this.type !== BOOK_TYPES.EPUB) img1.style.pointerEvents = "none";
        container.appendChild(img1);

        this.currentSpreadStep = 1;
      }
    }

    // プリロード
    const memoryStrategy = getMemoryStrategy();
    const preloadStep = this.currentSpreadStep || memoryStrategy.imagePreloadAheadCount;
    if (targetIndex + preloadStep < this.imagePages.length) {
      // 次の画像データだけ取得しておく（キャッシュ乗る）
      this.getPageDimensions(targetIndex + preloadStep);
    }

    this.updateProgress(targetIndex, isWide);
    this.updateTransform();
  }

  setImageViewMode(mode) {
    if (mode !== IMAGE_VIEW_MODES.SINGLE && mode !== IMAGE_VIEW_MODES.SPREAD) return;
    this.imageViewMode = mode;
    this.renderImagePage();
  }

  toggleImageViewMode() {
    this.setImageViewMode(
      this.imageViewMode === IMAGE_VIEW_MODES.SINGLE ? IMAGE_VIEW_MODES.SPREAD : IMAGE_VIEW_MODES.SINGLE
    );
    return this.imageViewMode;
  }

  // 左開き/右開き切替
  setImageReadingDirection(direction) {
    if (direction !== READING_DIRECTIONS.LTR && direction !== READING_DIRECTIONS.RTL) return;
    this.imageReadingDirection = direction;
    this.renderImagePage();
  }

  toggleImageReadingDirection() {
    this.setImageReadingDirection(
      this.imageReadingDirection === READING_DIRECTIONS.LTR ? READING_DIRECTIONS.RTL : READING_DIRECTIONS.LTR
    );
    return this.imageReadingDirection;
  }

  // ズーム切替（画像書庫用）
  toggleImageZoom() {
    return this.toggleZoom();
  }

  // ズーム解除
  resetImageZoom() {
    this.setZoomLevel(this.getZoomConfig().min);
  }

  isImageBook() {
    return this.type === BOOK_TYPES.IMAGE;
  }

  // 現在のページが横長かどうかを確認（Navigation用）
  async isCurrentPageWideSync() {
    if (!this.imagePages[this.imageIndex]) return false;
    // 既にキャッシュされていれば早い。キャッシュがなければ非同期になるが
    // ここでは簡易的に直近の判定結果を使いたいところ。
    // 一旦、毎回チェックする。
    return await this.isImageWide(this.imageIndex);
  }

  async loadImagePage(index) {
    const currentToken = ++this.imageLoadToken;
    if (this.imagePages[index]) {
      if (currentToken === this.imageLoadToken) {
        this.imageElement.src = this.imagePages[index];
        this.imageElement.alt = "ページ画像";
        this.imageElement.title = "";
      }
      return;
    }

    // エラー済みの場合もリトライを試みる（一時的なエラーの可能性があるため）
    const objectUrl = await this.convertImageAtIndex(index, { reportError: true, retry: true });
    if (!objectUrl) return;
    if (currentToken === this.imageLoadToken) {
      this.imageElement.src = objectUrl;
      this.imageElement.alt = "ページ画像";
      this.imageElement.title = "";
    }
  }



  async prev(step) {
    if (this.imageZoomed) return; // ズーム中はページめくり無効

    // Web小説の場合
    if (this.type === BOOK_TYPES.WEB_NOVEL) {
      const isEpisodeChanged = await this.webNovelViewer.prevEpisode();
      if (!isEpisodeChanged) {
        this.webNovelViewer.prev(); // スクロールのみ
      }
      return;
    }

    // EPUBの場合はPageControllerを使用
    if (this.type === BOOK_TYPES.EPUB) {
      if (this.epubViewMode === "scroll") {
        this._scrollPositionOnNextRender = 'end';
      }
      this.pageController?.prev();
      return;
    }

    if (this.render && this.render.prev && !this.isImageBook()) {
      this.render.prev();
      return;
    }

    let targetIndex;
    if (this.imageViewMode === IMAGE_VIEW_MODES.SPREAD) {
      // 戻る場合、戻り先のページが「ワイド」かどうかを事前にチェックする必要がある
      // 1つ前のページ(index-1)がワイドなら、そこは「1枚表示」だったはずなので -1 戻る
      // ワイドでないなら、そこは「2枚表示の右側(または左側)」だったはずなので -2 戻る
      // ただし、もし step が指定されている場合(1など)はどうするか？
      // prev(1) は「1枚戻る」を意図している。

      if (step !== undefined && step === 1) {
        targetIndex = Math.max(0, this.imageIndex - 1);
      } else {
        // スマート「戻る」判定
        // 1. 1つ前が横長なら「1枚表示」だった -> -1
        // 2. 1つ前が縦長の場合、そのさらに前(2つ前)とペアだったか確認
        //    ペア条件: 2つ前が存在し、かつ2つ前も縦長。 -> -2
        //    そうでなければ(2つ前が横長、あるいは存在しない) -> -1

        const prevIndex = this.imageIndex - 1;
        if (prevIndex < 0) {
          targetIndex = 0;
        } else {
          const isPrevWide = await this.isImageWide(prevIndex);
          if (isPrevWide) {
            targetIndex = prevIndex; // -1
          } else {
            // 1つ前は縦長。ペアか？
            const prevPrevIndex = this.imageIndex - 2;
            if (prevPrevIndex < 0) {
              targetIndex = prevIndex; // -1 (ペア相手なし)
            } else {
              const isPrevPrevWide = await this.isImageWide(prevPrevIndex);
              if (!isPrevPrevWide) {
                // 2つ前も縦長 -> ペア成立
                targetIndex = prevPrevIndex; // -2
              } else {
                // 2つ前は横長 -> 1つ前はペア相手に選ばれず単独表示(または次の横長とはペア組まない)だったはず
                // ※ renderSpreadPageのロジックでは「現在=縦, 次=横」なら「現在」は単独表示になる。
                // つまり prevPrev(Wide) -> prev(Tall) -> current(Tall) の並びなら
                // prevPrev は単独。 prev は current とペアにはならない(prevPrevの一部ではない)。
                // 待てよ、 prevPrev(Wide) | prev(Tall) | current...
                // prevPrevの次は prev。 prevPrevは単独表示。
                // 次に prev を表示する際、 prev(Tall) の次は current(Tall) なので prev+current ペアになるはず...？
                // ああ、ここが重要。「prevPrevがWide」だった場合、そこでページ区切り。
                // 次のページは prev から始まる。
                // prev(Tall) + next(Tall) ならペアになる。
                // なので、 prevPrev が Wide なら、 prev は新しいペアの先頭になれる。
                // つまり prev と prev+1 (current) がペアだった可能性がある。
                // しかし、今「current」にいるということは、current が表示先頭。
                // つまり prev は表示されていなかった。
                // ということは prev は current とペアではなかった（currentが先頭だから）。
                // もし prev と current がペアなら、今 current 単独で見ているのは変だが、
                // もし P-1(T) + current(W) なら P-1単独 -> current単独 となるので、今 current 閲覧中はありえる)
                //
                // 判定ロジック再考:
                // 「P-1 を先頭として renderSpreadPage した場合、 step はいくつか？」を判定すれば確実。
                // renderSpreadPage(P-1) をシミュレート。
                //   P-1 is Wide? No.
                //   Check P-1's Next (P-0 a.k.a current).
                //   If current is Wide?
                //     Yes -> P-1 step is 1. => 戻り先は P-1 (-1).
                //     No (current is Tall) -> P-1 step is 2. => 戻り先は P-1 (-2)? いや、P-1から始まって step2なら P-1, current が表示される。
                //     今 current にいるなら、本来 P-1 が表示されているべきペアだったのでは？
                //     ユーザーが手動で current に飛んだ場合などはありえるが、順送りなら P-1, current と表示されるはず。
                //     しかし「戻る」ボタンを押す状況では、今は current が先頭で見えている。
                //     つまり [P-2, P-1] の次ページとして current が来ていると仮定するのが自然。
                //     (P-1 と current がペアなら、今 current 単独で見ているのは変だが、
                //      もし P-1(T) + current(W) なら P-1単独 -> current単独 となるので、今 current 閲覧中はありえる)
                //
                // 結論:
                //   P-1(T) の場合:
                //     Check P-2.
                //     If P-2 exists AND P-2 is Tall -> They form a pair [P-2, P-1]. Return -2.
                //     Else (P-2 is Wide or None) -> P-1 stands alone [P-1]. Return -1.

                targetIndex = prevPrevIndex; // -2
              }
            }
          }
        }
      }
    } else {
      targetIndex = Math.max(0, this.imageIndex - (step || 1));
    }
    await this.goTo(targetIndex);
    this.manageImageCache(this.imageIndex);
  }

  async next(step) {
    if (this.imageZoomed) return; // ズーム中はページめくり無効

    // Web小説の場合
    if (this.type === BOOK_TYPES.WEB_NOVEL) {
      const isEpisodeChanged = await this.webNovelViewer.nextEpisode();
      if (!isEpisodeChanged) {
        this.webNovelViewer.next(); // スクロールのみ
      }
      return;
    }

    // EPUBの場合はPageControllerを使用
    if (this.type === BOOK_TYPES.EPUB) {
      if (this.epubViewMode === "scroll") {
        this._scrollPositionOnNextRender = 'start';
      }
      this.pageController?.next();
      return;
    }

    if (this.render && this.render.next && !this.isImageBook()) {
      this.render.next();
      return;
    }

    let targetIndex;
    if (this.imageViewMode === IMAGE_VIEW_MODES.SPREAD) {
      // 表示時に計算したステップ数分だけ進む
      // (ワイド表示なら+1、通常なら+2)
      // 引数 step が指定されている場合(1など)はそれを優先するか、
      // あるいは step が未指定(undefined)の場合のみ currentSpreadStep を使う。
      // UIからは next() (undefined) か next(1) が呼ばれる。

      const actualStep = step !== undefined ? step : (this.currentSpreadStep || 1);
      targetIndex = Math.min(this.imagePages.length - 1, this.imageIndex + actualStep);
    } else {
      targetIndex = Math.min(this.imagePages.length - 1, this.imageIndex + (step || 1));
    }
    await this.goTo(targetIndex);
    this.manageImageCache(this.imageIndex);
  }

  addBookmark(label = "しおり", { deviceId, deviceColor } = {}) {
    // Web小説の場合
    if (this.type === BOOK_TYPES.WEB_NOVEL) {
      if (!this.webNovelViewer || !this.webNovelViewer.episodes) return null;
      const episodeIndex = this.webNovelViewer.currentEpisodeIndex;
      const percentage = this.webNovelViewer.getScrollPercentage();

      const locator = {
        location: episodeIndex,
        percentage: percentage
      };

      const ep = this.webNovelViewer.episodes[episodeIndex];
      const visibleText = ep ? ep.title : "Web Novel Bookmark";

      const bookmark = {
        label,
        location: locator,
        visibleText,
        cfi: `wn:${episodeIndex}:${percentage}`,
        percentage: calculateProgressPercentage(episodeIndex, this.webNovelViewer.episodes.length),
        createdAt: Date.now(),
        bookType: BOOK_TYPES.WEB_NOVEL,
      };
      if (deviceId !== undefined) bookmark.deviceId = deviceId;
      if (deviceColor !== undefined) bookmark.deviceColor = deviceColor;
      return bookmark;
    }

    if (this.type === BOOK_TYPES.EPUB) {
      if (!this.pagination?.pages?.length) return null;
      // [BEFORE] const percentage = calculateProgressPercentage(this.currentPageIndex, this.pagination.pages.length);
      // [AFTER] スクロール位置を加味した共通の計算ロジックを使用
      const percentage = this._calculateCurrentPercentage(this.pagination.pages.length);
      const locator = this.getPageLocator(this.currentPageIndex) || this.getFallbackLocator();
      const visibleText = locator?.visibleText || this.getCurrentVisibleText(50);

      // ロケーターにテキストが含まれていない場合は追加（念のため）
      if (locator && !locator.visibleText && visibleText) {
        locator.visibleText = visibleText;
      }

      const cfi = locator ? `${locator.spineIndex}:${locator.segmentIndex}` : null;
      const bookmark = {
        label,
        location: locator,
        visibleText, // しおり直属にも持たせておく（互換性と利便性のため）
        cfi,
        percentage,
        createdAt: Date.now(),
        bookType: BOOK_TYPES.EPUB, // bookType として保存
      };
      if (deviceId !== undefined) bookmark.deviceId = deviceId;
      if (deviceColor !== undefined) bookmark.deviceColor = deviceColor;
      return bookmark;
    }

    // 画像書庫の場合
    const cfi = `image:${this.imageIndex}`;
    const bookmark = {
      label,
      location: this.imageIndex, // imageIndex を location として保存
      cfi,
      percentage: calculateProgressPercentage(this.imageIndex, this.imagePages.length),
      createdAt: Date.now(),
      bookType: this.type, // "image"
    };
    if (deviceId !== undefined) bookmark.deviceId = deviceId;
    if (deviceColor !== undefined) bookmark.deviceColor = deviceColor;
    return bookmark;
  }

  async goTo(bookmark) {
    // 0は有効なインデックスなので、null/undefinedのみ除外
    if (bookmark === null || bookmark === undefined) return;

    // 数値が渡された場合（next/prevからの呼び出しなど）は、現在のモードに合わせて移動
    if (typeof bookmark === "number") {
      if (this.type === BOOK_TYPES.EPUB) {
        this.pageController.goTo(bookmark);
      } else {
        // 画像書庫の場合、範囲チェックをして移動
        this.imageIndex = Math.max(0, Math.min(bookmark, this.imagePages.length - 1));
        this.renderImagePage();
        this.manageImageCache(this.imageIndex);
      }
      return;
    }

    // 以下、しおりオブジェクト（{ bookType: ..., location: ... }）の場合の処理

    // bookType または type で判定（互換性のため両方サポート）。
    // bookmarkオブジェクトにtypeが無い場合は現在のthis.typeをフォールバックとして使用
    const bookType = bookmark.bookType || bookmark.type || this.type;

    if (bookType === BOOK_TYPES.EPUB) {
      // 1. テキストベースの解決を優先（visibleTextがある場合）
      const visibleText = bookmark.visibleText || bookmark.location?.visibleText;
      const spineIndex = bookmark.location?.spineIndex;

      if (visibleText && spineIndex != null) {
        // パジネーション完了を待つ (しおり復旧時も重要)
        if (this.paginationPromise) {
          console.log(`[位置復元デバッグ][goTo] 全チャプター完了を待機中...`);
          await this.paginationPromise;
        }

        const segmentIndex = this.resolveLocationByText(spineIndex, visibleText, "goToBookmark");
        if (segmentIndex !== null) {
          console.log(`[位置復元デバッグ][goTo] テキスト解決成功: spineIndex=${spineIndex}, segmentIndex=${segmentIndex}`);
          const shouldHighlight = bookmark.shouldHighlight !== undefined ? bookmark.shouldHighlight : !!bookmark.searchQuery;
          this.goToSegment(spineIndex, segmentIndex, bookmark.searchQuery, shouldHighlight);
          return;
        }
      }

      // 2. 従来のインデックスベース解決
      if (
        bookmark.location &&
        typeof bookmark.location === "object" &&
        typeof bookmark.location.spineIndex === "number" &&
        typeof bookmark.location.segmentIndex === "number"
      ) {
        const shouldHighlight = bookmark.shouldHighlight !== undefined ? bookmark.shouldHighlight : !!bookmark.searchQuery;
        this.goToSegment(bookmark.location.spineIndex, bookmark.location.segmentIndex, bookmark.searchQuery, shouldHighlight);
        return;
      }
      if (typeof bookmark.location === "number" && this.pagination?.pages?.length) {
        this.pageController.goTo(bookmark.location);
        return;
      }
      if (typeof bookmark.percentage === "number" && this.pagination?.pages?.length) {
        const total = this.pagination.pages.length;
        // PERCENTAGE_BASE = 100
        // (currentIndex / (totalPages > 1 ? totalPages - 1 : 1)) * 100 = percentage
        // currentIndex = percentage / 100 * (total - 1)
        const exactIndex = (bookmark.percentage / 100) * (total > 1 ? total - 1 : 1);

        if (this.epubViewMode === "scroll") {
          // スクロールモードなら、整数部分のページに移動し、小数部分をスクロール位置として考慮できるようにする
          // (goToSegment内でも最終的な補正が行われるが、ここでpageIndexを特定する)
          const pageIndex = Math.max(0, Math.min(Math.floor(exactIndex), total - 1));
          this.pageController.goTo(pageIndex);
        } else {
          const index = Math.round(exactIndex);
          this.pageController.goTo(Math.max(0, Math.min(index, total - 1)));
        }
      }
    } else if (bookType !== BOOK_TYPES.EPUB) {
      // 画像書庫: location は imageIndex
      const targetIndex = typeof bookmark.location === "number"
        ? bookmark.location
        : Math.round((bookmark.percentage / 100) * this.imagePages.length) - 1;
      this.imageIndex = Math.max(0, Math.min(targetIndex, this.imagePages.length - 1));
      this.renderImagePage();
      this.manageImageCache(this.imageIndex);
    }
  }

  applyTheme(theme) {
    this.theme = theme;
    this.updateEpubTheme();
    document.body.dataset.theme = theme;
  }

  async applyFontSize(fontSize) {
    if (!Number.isFinite(fontSize)) return;
    this.fontSize = fontSize;
    if (this.viewer) {
      this.viewer.style.fontSize = `${fontSize}px`;
    }
    if (this.webNovelViewer) {
      this.webNovelViewer.setFontSize(`${fontSize}px`);
    }
    if (this.type === BOOK_TYPES.WEB_NOVEL) {
      return;
    }
    if (this.type !== BOOK_TYPES.EPUB) {
      return;
    }
    // パジネーションをリセットして再計算
    this.firstPagePromise = null;
    this.paginationPromise = null;
    this.pagination = null;

    // 現在の位置（ロケータ）を保存
    const locator = this.getPageLocator(this.currentPageIndex);

    await this.buildPagination();

    // 位置の復元
    if (locator) {
      this.goToSegment(locator.spineIndex, locator.segmentIndex, null, false);
    } else {
      this.pageController.goTo(this.currentPageIndex);
    }
  }

  async applyReadingDirection(writingMode, pageDirection) {
    // もし既に設定が同じなら何もしない（無限ループ防止）
    if (this.writingMode === writingMode && this.pageDirection === pageDirection) {
      console.log("[Reader] applyReadingDirection: No change detected, skipping repagination",
        { current: { wm: this.writingMode, pd: this.pageDirection }, requested: { wm: writingMode, pd: pageDirection } });
      return;
    }
    console.log("[Reader] applyReadingDirection: 設定変更あり → 再パジネーション実行",
      { current: { wm: this.writingMode, pd: this.pageDirection }, requested: { wm: writingMode, pd: pageDirection } });
    console.time('[applyReadingDirection] buildPagination');

    // 現在の位置情報をテキストとして事前に退避
    const currentSpineIndex = this.type === BOOK_TYPES.EPUB ? this.pagination?.pages?.[this.currentPageIndex]?.spineIndex : null;
    const visibleText = this.type === BOOK_TYPES.EPUB ? this.getCurrentVisibleText(50) : null;

    if (pageDirection) {
      this.pageDirection = pageDirection;
    }
    if (writingMode) {
      this.writingMode = writingMode;
      this.preferredWritingMode = writingMode;
    }

    if (this.type === BOOK_TYPES.WEB_NOVEL) {
      if (this.webNovelViewer) {
        this.webNovelViewer.setWritingMode(this.writingMode === WRITING_MODES.VERTICAL ? 'vertical-rl' : 'horizontal-tb');
      }
      return;
    }

    if (this.type !== BOOK_TYPES.EPUB) {
      return;
    }

    try {
      console.log("[Reader] applyReadingDirection:", { writingMode, pageDirection });

      // 実行中のパジネーションを中断
      if (this.currentPaginationRun) {
        this.currentPaginationRun.cancelled = true;
      }
      this.firstPagePromise = null;
      this.paginationPromise = null;
      this.pagination = null;

      // ページめくりモードとスクロールモードの切り替え時等に、確実に再描画させるためのリセット
      this.currentPageIndex = -1;
      if (this.pageContainer) {
        this.pageContainer.innerHTML = "";
      }

      // 再計算を開始（firstPagePromise = 最初のチャプター完了時に解決）
      await this.buildPagination();
      if (typeof timerName !== 'undefined') console.timeEnd(timerName);

      // 全チャプターのパジネーション完了を待ってから位置復元を行う
      if (this.paginationPromise) {
        console.log(`[位置復元デバッグ][applyReadingDirection] 全チャプター完了を待機中...`);
        await this.paginationPromise;
      }

      const pagination = this.pagination;
      if (pagination) {
        // 退避したテキストでの位置復元
        let restored = false;
        console.log(`[位置復元デバッグ][applyReadingDirection] ステップ1: 復元開始`, {
          currentSpineIndex,
          visibleText,
          spineItemsLength: this.spineItems.length,
          paginationPagesLength: pagination.pages?.length,
        });
        if (currentSpineIndex != null) {
          if (visibleText) {
            const segmentIndex = this.resolveLocationByText(currentSpineIndex, visibleText, "applyReadingDirection");
            if (segmentIndex !== null) {
              console.log(`[位置復元デバッグ][applyReadingDirection] ステップ4: ジャンプ実行`, {
                spineIndex: currentSpineIndex,
                segmentIndex: segmentIndex,
              });
              this.goToSegment(currentSpineIndex, segmentIndex, null, false);
              restored = true;
            }
          }
        }

        // 可視テキストが見つからなかった(画像のみなど)、あるいは検索に失敗した場合でも、
        // 少なくとも0ページ(表紙)ではなく「同じ章の先頭」に復帰させる
        if (!restored) {
          console.log(`[位置復元デバッグ][applyReadingDirection] フォールバック: 章の先頭に復帰`, { currentSpineIndex });
          this.goToSegment(currentSpineIndex, 0, null, false);
          restored = true;
        }
      }

      if (!restored) {
        console.log(`[位置復元デバッグ][applyReadingDirection] 最終フォールバック: ページ0に移動`);
        this.pageController.goTo(this.currentPageIndex >= 0 ? this.currentPageIndex : 0);
      }
    } catch (error) {
      console.timeEnd('[applyReadingDirection] buildPagination');
      console.error("[Reader] Failed to apply reading direction:", error);
    }
  }

  async applyEpubViewMode(mode, force = false) {
    const prevMode = this.epubViewMode;
    this.epubViewMode = mode;

    // UI クラスの切り替えは初期化時(早期リターン時)にも確実に効かせるため先に行う
    const container = document.getElementById(DOM_IDS.FULLSCREEN_READER);
    if (container) {
      if (mode === "scroll") {
        container.classList.add(UI_CLASSES.EPUB_SCROLL_MODE);
        // スクロールモードインジケーター用
        container.classList.add('show-mode-indicator');
      } else {
        container.classList.remove(UI_CLASSES.EPUB_SCROLL_MODE);
        container.classList.remove('show-mode-indicator');
      }
    }

    if (!force && prevMode === mode && (this.pagination || this.type !== BOOK_TYPES.EPUB)) {
      return;
    }

    // 現在の位置情報をテキストとして事前に退避
    const currentSpineIndex = this.type === BOOK_TYPES.EPUB ? this.pagination?.pages?.[this.currentPageIndex]?.spineIndex : null;
    const visibleText = this.type === BOOK_TYPES.EPUB ? this.getCurrentVisibleText(50) : null;
    console.log(`[位置復元デバッグ][applyEpubViewMode] ステップ0: テキスト取得`, {
      currentPageIndex: this.currentPageIndex,
      currentSpineIndex,
      visibleText,
      hasPageContainer: !!this.pageContainer,
      hasViewer: !!this.viewer,
    });

    console.log(`[Reader] applyEpubViewMode: ${mode} (force=${force})`);

    if (this.type !== BOOK_TYPES.EPUB) {
      return;
    }

    try {
      // 実行中のパジネーションを中断
      if (this.currentPaginationRun) {
        this.currentPaginationRun.cancelled = true;
      }
      this.firstPagePromise = null;
      this.paginationPromise = null;
      this.pagination = null;

      // モード切り替え時に、確実に画面全体を再構築させるためのリセット
      this.currentPageIndex = -1;
      if (this.pageContainer) {
        this.pageContainer.innerHTML = "";
      }

      // 再計算を実行（firstPagePromise = 最初のチャプター完了時に解決）
      await this.buildPagination();

      // 全チャプターのパジネーション完了を待ってから位置復元を行う
      // buildPagination は firstPagePromise（最初のチャプター完了）を返すため、
      // spineItems にはまだ全データが揃っていない。
      // paginationPromise は全チャプター完了で解決される。
      if (this.paginationPromise) {
        console.log(`[位置復元デバッグ][applyEpubViewMode] 全チャプター完了を待機中...`);
        await this.paginationPromise;
      }

      const pagination = this.pagination;
      if (pagination) {
        // 退避したテキストでの位置復元
        let restored = false;
        console.log(`[位置復元デバッグ][applyEpubViewMode] ステップ1: 復元開始`, {
          currentSpineIndex,
          visibleText,
          spineItemsLength: this.spineItems.length,
          paginationPagesLength: pagination.pages?.length,
        });
        if (currentSpineIndex != null) {
          if (visibleText) {
            const segmentIndex = this.resolveLocationByText(currentSpineIndex, visibleText, "applyEpubViewMode");
            if (segmentIndex !== null) {
              console.log(`[位置復元デバッグ][applyEpubViewMode] ステップ4: ジャンプ実行`, {
                spineIndex: currentSpineIndex,
                segmentIndex: segmentIndex,
              });
              this.goToSegment(currentSpineIndex, segmentIndex, null, false);
              restored = true;
            }
          }

          // 可視テキストが見つからなかった(画像のみなど)、あるいは検索に失敗した場合でも、
          // 少なくとも0ページ(表紙)ではなく「同じ章の先頭」に復帰させる
          if (!restored) {
            console.log(`[位置復元デバッグ][applyEpubViewMode] フォールバック: 章の先頭に復帰`, { currentSpineIndex });
            this.goToSegment(currentSpineIndex, 0, null, false);
            restored = true;
          }
        }

        if (!restored) {
          console.log(`[位置復元デバッグ][applyEpubViewMode] 最終フォールバック: ページ0に移動`);
          this.pageController.goTo(this.currentPageIndex >= 0 ? this.currentPageIndex : 0);
        }
      }
    } catch (error) {
      console.error("[Reader] Failed to apply epub view mode:", error);
    }
  }

  applyWritingModeToContents() {
    if (this.type !== BOOK_TYPES.EPUB) return;
    const isScrollMode = this.epubViewMode === "scroll";
    const isVertical = !isScrollMode && this.writingMode === WRITING_MODES.VERTICAL;
    const writingMode = isVertical ? CSS_WRITING_MODES.VERTICAL : CSS_WRITING_MODES.HORIZONTAL;
    const textOrientation = isVertical ? "mixed" : "initial";
    const contentDirection = READING_DIRECTIONS.LTR;

    // 両方に指定する（ビューアのスクロール方向CSSハックや全体レイアウト正常化用）
    [this.viewer, this.pageContainer].forEach((target) => {
      if (!target) return;
      target.style.setProperty("writing-mode", writingMode);
      // DOMの中身に影響する設定は pageContainer のみに限定
      if (target === this.pageContainer) {
        target.style.setProperty("text-orientation", textOrientation);
        target.style.setProperty("direction", contentDirection);
        target.style.setProperty("text-align", "start");
        target.style.setProperty("text-align-last", "start");
      }
    });
  }

  updateEpubTheme() {
    if (this.type !== BOOK_TYPES.EPUB) return;
    const isVertical = this.writingMode === WRITING_MODES.VERTICAL;
    const contentDirection = READING_DIRECTIONS.LTR;

    console.log("[updateEpubTheme] Applying theme:", {
      isVertical,
      theme: this.theme,
      writingMode: this.writingMode
    });

    // 縦書き・横書きともに縦スクロールで表示するため、
    // writing-modeはそのまま適用するが、レイアウトは縦スクロール用に最適化
    if (this.viewer) {
      this.viewer.style.background = "var(--reader-bg)";
      this.viewer.style.color = "var(--reader-text)";
      this.viewer.style.width = "100%";
      this.viewer.style.height = "100%";
    }
    if (this.pageContainer) {
      const layout = this.getEpubPageLayoutValues();
      this.applyEpubPageLayoutStyles(this.pageContainer, layout);
    }
    this.applyWritingModeToContents();
  }

  async addCoverPageIfNeeded(pagination) {
    if (!pagination?.pages?.length || !this.book) return false;
    // 重複追加を防ぐため、既に表紙が存在するかチェック
    if (pagination.pages[0]?.withinSpineOffset === "cover") return false;
    const coverUrl = await this.resolveCoverUrl();
    if (!coverUrl) return false;
    // imgタグのsrc属性を、renderEpubPageで使っている置換処理（とresolveImagesInRenderedPage）に
    // 拾ってもらえるように data-src にする、もしくは isSvgImageの様に一時退避させます。
    // 今回は他のページと同様のフローに乗せるため data-src を付与して初期化します。
    // （すでにBlob URLの場合はそのまま src に入れた方が手堅いため判定します）
    const isBlob = coverUrl.startsWith('blob:') || coverUrl.startsWith('data:');
    const srcAttr = isBlob ? `src="${coverUrl}"` : `data-src="${coverUrl}" src="about:blank"`;

    const htmlFragment = `
      <div class="epub-cover">
        <img ${srcAttr} alt="Cover" />
      </div>
    `;
    pagination.pages.unshift({
      spineIndex: -1,
      withinSpineOffset: "cover",
      htmlFragment,
      estimatedCharCount: htmlFragment.length,
    });
    return true;
  }

  async resolveCoverUrl() {
    if (typeof this.book.coverUrl === "function") {
      try {
        const url = await this.book.coverUrl();
        if (url) return url;
      } catch (error) {
        // ignore
      }
    }
    try {
      const coverPath = await this.book.loaded?.cover;
      if (coverPath && this.resourceLoader) {
        return await this.resourceLoader(coverPath);
      }
    } catch (error) {
      // ignore
    }
    return null;
  }

  async detectReadingDirectionFromBook() {
    if (!this.book?.spine) return null;
    const metadataDirection = this.book.package?.metadata?.direction;
    const spineDirection = this.book.spine?.direction;
    const pageDirection = metadataDirection || spineDirection || null;
    let writingMode = null;

    const spineItem = this.book.spine.get(0);
    if (spineItem) {
      try {
        await spineItem.load(this.book.load.bind(this.book));
        const doc = spineItem.document || spineItem.contents?.document;
        if (doc) {
          const inlineStyles = [
            doc.documentElement?.getAttribute("style"),
            doc.body?.getAttribute("style"),
          ]
            .filter(Boolean)
            .join(" ");
          const styleText = Array.from(doc.querySelectorAll(DOM_SELECTORS.STYLE))
            .map((style) => style.textContent || "")
            .join(" ");
          const combined = `${inlineStyles} ${styleText}`.toLowerCase();
          if (combined.includes(`writing-mode: ${WRITING_MODES.VERTICAL}`)) {
            writingMode = WRITING_MODES.VERTICAL;
          } else if (combined.includes(`writing-mode: ${WRITING_MODES.HORIZONTAL}`)) {
            writingMode = WRITING_MODES.HORIZONTAL;
          }
        }
      } catch (error) {
        console.warn("Failed to detect writing mode from spine:", error);
      }
    }

    return {
      writingMode,
      pageDirection,
    };
  }

  injectImageZoom() {
    /* Image zoom on click is disabled per user request
    if (this.type === BOOK_TYPES.EPUB) {
      this.viewer?.querySelectorAll(DOM_SELECTORS.IMAGE).forEach((img) => {
        img.style.cursor = "zoom-in";
        this.bindElementZoomHandlers(img, () => img.src);
      });
      return;
    }
    if (!this.rendition) return;
    */
  }

  bindImageZoomHandlers() {
    if (!this.imageElement || this.imageZoomBound) return;
    this.imageZoomBound = true;
    this.bindElementZoomHandlers(this.imageElement, () => this.imagePages[this.imageIndex]);
  }

  bindElementZoomHandlers(element, getSrc) {
    if (!element || element.dataset.zoomBound === "true") return;
    element.dataset.zoomBound = "true";
    let longPressTimer = null;
    let longPressFired = false;
    const startPress = (event) => {
      if (event.type === "mousedown" && event.button !== 0) return;
      longPressFired = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        this.onImageZoom?.(getSrc());
      }, 500);
    };
    const endPress = () => {
      clearTimeout(longPressTimer);
    };
    element.addEventListener("mousedown", startPress);
    element.addEventListener("touchstart", startPress, { passive: true });
    element.addEventListener("mouseup", endPress);
    element.addEventListener("mouseleave", endPress);
    element.addEventListener("touchend", endPress);
    element.addEventListener("touchcancel", endPress);
    element.addEventListener("click", () => {
      if (longPressFired) {
        longPressFired = false;
        return;
      }
      this.onImageZoom?.(getSrc());
    });
  }

  // ========================================
  // ズーム・パン・ドラッグ制御
  // ========================================

  getActiveViewer() {
    // 画像モードなら imageViewer
    if (this.isImageBook()) {
      return this.imageViewer;
    }
    // EPUBなら viewer
    return this.viewer;
  }

  getZoomTarget() {
    if (this.isImageBook()) {
      const spreadContainer = this.imageViewer?.querySelector(DOM_SELECTORS.SPREAD_CONTAINER);
      if (this.imageViewMode === IMAGE_VIEW_MODES.SPREAD && spreadContainer) {
        return spreadContainer;
      }
      return this.imageElement;
    }
    return this.viewer;
  }

  getZoomConfig() {
    const slider = typeof document !== 'undefined'
      ? document.getElementById(DOM_IDS.ZOOM_SLIDER)
      : null;
    const min = slider?.min ? parseFloat(slider.min) : 1.0;
    const max = slider?.max ? parseFloat(slider.max) : 3.0;
    const step = slider?.step ? parseFloat(slider.step) : 0.1;
    return {
      min: Number.isFinite(min) ? min : 1.0,
      max: Number.isFinite(max) ? max : 3.0,
      step: Number.isFinite(step) ? step : 0.1,
    };
  }

  isZoomMode() {
    return this.imageZoomed;
  }

  setupZoomSlider() {
    if (typeof document === 'undefined') return;
    const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
    if (slider) {
      // 既存のリスナーを確実にクリアするため、要素をクローンして置換
      const newSlider = slider.cloneNode(true);
      slider.parentNode.replaceChild(newSlider, slider);

      newSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.setZoomLevel(val);
      });
      console.log('[ReaderController] Zoom slider initialized');
    }
  }

  /**
   * イベントがリーダー表示領域内で発生したか判定
   * event.targetではなく座標で判定し、透明な上位レイヤー要素の影響を受けない
   */
  isEventInReaderArea(event) {
    const reader = document.getElementById(DOM_IDS.FULLSCREEN_READER);
    if (!reader) return false;
    const rect = reader.getBoundingClientRect();

    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  bindPanEvents() {
    if (typeof window === 'undefined') return;

    this.panStartX = 0;
    this.panStartY = 0;

    const startDrag = (x, y) => {
      // ズームモードでないならドラッグしない
      if (!this.imageZoomed || this.isPinching) return;

      this.isDragging = true;
      this.lastMouseX = x;
      this.lastMouseY = y;

      // カーソル変更
      document.body.classList.add(UI_CLASSES.IS_DRAGGING);
      const active = this.getActiveViewer();
      if (active) active.style.cursor = 'grabbing';
    };

    const moveDrag = (x, y) => {
      if (!this.isDragging || this.isPinching) return;

      const dx = x - this.lastMouseX;
      const dy = y - this.lastMouseY;

      this.panX += dx;
      this.panY += dy;

      this.lastMouseX = x;
      this.lastMouseY = y;

      this.updateTransform();
    };

    const endDrag = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.classList.remove(UI_CLASSES.IS_DRAGGING);
      const active = this.getActiveViewer();
      if (active) active.style.cursor = '';
    };

    // マウスイベント（リーダー領域内ならドラッグ開始）
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.isEventInReaderArea(e)) {
        startDrag(e.clientX, e.clientY);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        e.preventDefault();
        moveDrag(e.clientX, e.clientY);
      }
    });

    // マウスドラッグ終了（documentレベルで捕捉し、領域外でのmouseupも検知）
    document.addEventListener('mouseup', endDrag);

    const readerContainer = document.getElementById(DOM_IDS.FULLSCREEN_READER);
    if (!readerContainer) return;

    // タッチイベント (リーダーコンテナ領域にバインド)
    // Android等では clickOverlay が touchstart を受け取り readerContainer にバブリングする。
    // touchstart / touchmove / touchend / touchcancel を全て同じ要素（readerContainer）で
    // 一貫して監視することで、Android WebView でもパン操作を確実に捕捉する。
    const touchOpts = { passive: false };

    readerContainer.addEventListener('touchstart', (e) => {
      if (this.imageZoomed) {
        // ズーム操作UIへのタッチは無視
        if (e.target && typeof e.target.closest === 'function' && e.target.closest(DOM_SELECTORS.ZOOM_ALLOWED_TARGETS)) {
          return;
        }

        const isTouch = e.touches && e.touches.length > 0;
        if (isTouch || this.isEventInReaderArea(e)) {
          if (e.touches.length === 1) {
            e.preventDefault();
            e.stopPropagation();
            startDrag(e.touches[0].clientX, e.touches[0].clientY);
          }
        }
      }
    }, touchOpts);

    readerContainer.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length === 1 && !this.isPinching) {
        e.preventDefault();
        e.stopPropagation();
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, touchOpts);

    // [修正] touchend/touchcancel を readerContainer にバインド（旧: viewer）
    // 以前は viewer（#viewer 要素）にバインドしていたが、Android では
    // clickOverlay 上でタッチが開始されるため、touchend が viewer に到達せず
    // ドラッグ状態が解除されない問題があった。
    // readerContainer（#fullscreenReader）はすべての子要素を包含するため、
    // どの子要素でタッチが開始されても touchend を確実にキャッチできる。
    readerContainer.addEventListener('touchend', endDrag);
    readerContainer.addEventListener('touchcancel', endDrag);
  }

  bindZoomEvents() {
    if (typeof window === 'undefined') return;

    // ホイールズーム（documentレベルで捕捉）
    document.addEventListener('wheel', (event) => {
      const inArea = this.isEventInReaderArea(event);
      if (!inArea) return;

      const { step } = this.getZoomConfig();

      // ズームモード中はCtrlキー不要でホイールズーム有効
      // ズームモード外ではCtrl+ホイールでのみズーム開始
      if (!this.imageZoomed && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // 手前に回す(deltaY > 0) = ズームアウト、奥に回す(deltaY < 0) = ズームイン
      const direction = event.deltaY > 0 ? -1 : 1;
      const wheelStep = step * 2;
      const nextScale = this.zoomScale + direction * wheelStep;

      this.setZoomLevel(nextScale, { x: event.clientX, y: event.clientY });
    }, { passive: false });

    const readerContainer = document.getElementById(DOM_IDS.FULLSCREEN_READER);
    if (!readerContainer) return;

    // ピンチズーム（documentレベルで捕捉）
    const touchOpts = { passive: false };

    readerContainer.addEventListener('touchstart', (event) => {
      const isTouch = event.touches && event.touches.length > 0;
      if (!isTouch && !this.isEventInReaderArea(event)) return;

      if (event.touches && event.touches.length === 2) {
        event.preventDefault();
        event.stopPropagation();
        this.isPinching = true;
        this.isDragging = false;
        this.pinchStartDistance = this.getPinchDistance(event.touches);
        this.pinchStartScale = this.zoomScale;
        this.pinchCenterStart = this.getPinchCenter(event.touches);
      }
    }, touchOpts);

    readerContainer.addEventListener('touchmove', (event) => {
      if (this.isPinching && event.touches.length === 2) {
        event.preventDefault();
        event.stopPropagation();
        const distance = this.getPinchDistance(event.touches);
        const center = this.getPinchCenter(event.touches);

        if (this.pinchStartDistance > 0) {
          const scale = this.pinchStartScale * (distance / this.pinchStartDistance);
          this.setZoomLevel(scale, center);
        }
      }
    }, touchOpts);

    readerContainer.addEventListener('touchend', (event) => {
      if (event.touches.length < 2) {
        this.isPinching = false;
        this.pinchStartDistance = 0;
      }
    }, touchOpts);
    readerContainer.addEventListener('touchcancel', (event) => {
      if (event.touches.length < 2) {
        this.isPinching = false;
        this.pinchStartDistance = 0;
      }
    }, touchOpts);
  }

  getPinchCenter(touches) {
    const [t1, t2] = touches;
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  getPinchDistance(touches) {
    const [touch1, touch2] = touches;
    if (!touch1 || !touch2) return 0;
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.hypot(dx, dy);
  }

  syncZoomedClass() {
    // CSSクラスの同期のみ（imageZoomedフラグはtoggleZoom()で制御）
    if (this.imageViewer) {
      this.imageViewer.classList.toggle(UI_CLASSES.ZOOMED, this.imageZoomed);
    }
  }

  setZoomLevel(scale, center) {
    const oldScale = this.zoomScale;
    this.zoomScale = parseFloat(scale);
    const body = document.body;
    const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
    const { min, max } = this.getZoomConfig();

    // 範囲制限
    if (this.zoomScale < min) this.zoomScale = min;
    if (this.zoomScale > max) this.zoomScale = max;

    // 中心点指定がある場合のパン補正 (Zoom towards center)
    // center: { x, y } (clientX, clientY)
    if (center && Math.abs(this.zoomScale - oldScale) > 0.001) {
      let active = this.getActiveViewer();
      const target = this.getZoomTarget();
      // EPUBなど、ターゲット自体がViewerとして返される場合は親要素をコンテナ（ビューポート）とする
      if (active === target && active?.parentElement) {
        active = active.parentElement;
      }

      if (active) {
        const rect = active.getBoundingClientRect();
        // コンテナ内の相対座標
        const mouseX = center.x - rect.left;
        const mouseY = center.y - rect.top;

        // 計算式: newPan = mousePos - (mousePos - oldPan) * (newScale / oldScale)
        // transform-origin: 0 0 前提
        const ratio = this.zoomScale / oldScale;
        this.panX = mouseX - (mouseX - this.panX) * ratio;
        this.panY = mouseY - (mouseY - this.panY) * ratio;
      }
    } else if (Math.abs(this.zoomScale - oldScale) > 0.001 && !center && this.zoomScale > min) {
      // 中心指定がない場合は画面中央を基準にする
      let active = this.getActiveViewer();
      const target = this.getZoomTarget();
      if (active === target && active?.parentElement) {
        active = active.parentElement;
      }

      if (active) {
        const rect = active.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const ratio = this.zoomScale / oldScale;
        this.panX = centerX - (centerX - this.panX) * ratio;
        this.panY = centerY - (centerY - this.panY) * ratio;
      }
    }

    // スライダーの値を同期
    if (slider) slider.value = this.zoomScale;

    // ズームモードの入り切りはここでは行わない（toggleZoom()で制御）
    this.syncZoomedClass();
    this.onImageZoom?.(this.imageZoomed, this.zoomScale);
    this.updateTransform();
  }

  updateTransform() {
    if (this.pendingTransform) return;
    this.pendingTransform = true;
    this.transformFrame = requestAnimationFrame(() => {
      this.pendingTransform = false;
      this.applyTransform();
    });
  }

  applyTransform() {
    const target = this.getZoomTarget();
    if (!target) return;

    this.clampPan();
    if (this.zoomScale <= this.getZoomConfig().min && !this.imageZoomed) {
      // ズームモード外かつ最小倍率なら transform をリセット
      // （ズームモード中は flex-start 補正のため translate が必要）
      target.style.transform = '';
      this.syncZoomSlider();
      return;
    }

    const transformValue = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomScale})`;
    target.style.transform = transformValue;
    this.syncZoomSlider();
  }

  syncZoomSlider() {
    const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
    if (!slider) return;
    const currentValue = parseFloat(slider.value);
    if (!Number.isFinite(currentValue) || currentValue !== this.zoomScale) {
      slider.value = this.zoomScale;
    }
  }

  clampPan() {
    let container = this.getActiveViewer();
    const target = this.getZoomTarget();
    if (!container || !target) return;

    // EPUBなど、ターゲット自体がViewerの場合は親要素をコンテナとする
    if (container === target && container?.parentElement) {
      container = container.parentElement;
    }

    const containerRect = container.getBoundingClientRect();

    // ターゲットの元サイズ（scale=1.0）を取得
    // target.offsetWidth / offsetHeight は transform の影響を受けない（レイアウトサイズ）
    // ただし、getBoundingClientRect は transform の影響を受けるので注意
    const targetWidth = target.offsetWidth;
    const targetHeight = target.offsetHeight;

    // スケール後のサイズ
    const scaledWidth = targetWidth * this.zoomScale;
    const scaledHeight = targetHeight * this.zoomScale;

    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // 水平方向
    if (scaledWidth <= containerWidth) {
      // 画面より小さい場合は中央寄せ
      this.panX = (containerWidth - scaledWidth) / 2;
    } else {
      // 画面より大きい場合、端までスクロールできるようにする
      // 左上(0,0) ～ 右下(containerWidth - scaledWidth, containerHeight - scaledHeight)
      const minPanX = containerWidth - scaledWidth;
      const maxPanX = 0;
      this.panX = Math.min(maxPanX, Math.max(minPanX, this.panX));
    }

    // 垂直方向
    if (scaledHeight <= containerHeight) {
      this.panY = (containerHeight - scaledHeight) / 2;
    } else {
      const minPanY = containerHeight - scaledHeight;
      const maxPanY = 0;
      this.panY = Math.min(maxPanY, Math.max(minPanY, this.panY));
    }
  }

  toggleZoom() {
    const { min } = this.getZoomConfig();
    const body = document.body;
    const slider = document.getElementById(DOM_IDS.ZOOM_SLIDER);
    const backdrop = document.querySelector('#floatOverlay .float-backdrop');

    if (this.imageZoomed) {
      // ズームモードOFF: スケール・パンをリセット
      this.imageZoomed = false;
      this.zoomScale = min;
      this.panX = 0;
      this.panY = 0;
      body.classList.remove(UI_CLASSES.IS_ZOOMED);
      if (slider) slider.value = min;
      if (backdrop) backdrop.style.pointerEvents = '';
      this.syncZoomedClass();
      this.onImageZoom?.(this.imageZoomed, this.zoomScale);
      this.updateTransform();
      return false;
    }

    // ズームモードON: 1倍のまま開始（スライダーで拡大を促す）
    this.imageZoomed = true;
    body.classList.add(UI_CLASSES.IS_ZOOMED);
    if (backdrop) backdrop.style.pointerEvents = 'none';
    this.syncZoomedClass();

    // ズーム時は CSS で flex 中央配置が無効化される（flex-start）ため、
    // transform の translate で中央位置を補正する。
    // これにより clampPan() の計算と整合し、画面外へはみ出す問題を防ぐ。
    if (this.isImageBook()) {
      const container = this.imageViewer;
      const target = this.getZoomTarget();
      if (container && target) {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const tw = target.offsetWidth;
        const th = target.offsetHeight;
        this.panX = (cw - tw * this.zoomScale) / 2;
        this.panY = (ch - th * this.zoomScale) / 2;
      }
    }

    this.onImageZoom?.(this.imageZoomed, this.zoomScale);
    this.updateTransform();
    return true;
  }
}

```

### assets/ui.js

```javascript
import {
  DEBUG_GRID_CONFIG,
  INTERACTION_AREA_CODES,
  INTERACTION_AREA_LABELS,
  INTERACTION_GRID_CONFIG,
  TIMING_CONFIG,
  TOUCH_CONFIG,
  UI_CLASSES,
  UI_TIMING_CONFIG,
  DOM_IDS,
  DOM_SELECTORS,
  WRITING_MODES,
  READING_DIRECTIONS,
  EPUB_VIEW_MODES,
} from "./constants.js";

// UI制御モジュール：エリア判定、メニュー表示、進捗バー等

const getById = (id) => document.getElementById(id);

/**
 * 画面を15エリアに分割して判定
 * 
 * グリッド構造（下10%は進捗バー専用で除外）:
 * ┌─────┬─────┬─────┬─────┬─────┐
 * │ U1  │ U2  │ U3  │ U4  │ U5  │  ← 上30% (0-30%)
 * ├─────┼─────┼─────┼─────┼─────┤
 * │ M1  │ M2  │ M3  │ M4  │ M5  │  ← 中30% (30-60%)
 * ├─────┼─────┼─────┼─────┼─────┤
 * │ B1  │ B2  │ B3  │ B4  │ B5  │  ← 下30% (60-90%)
 * ├─────┴─────┴─────┴─────┴─────┤
 * │      進捗バー専用エリア       │  ← 最下10% (90-100%)
 * └─────────────────────────────┘
 *   20%   20%   20%   20%   20%
 * 
 * メニュー表示: M3（中央）
 * 縦書き時ページ移動: M1/M2(前), M4/M5(次) + 横スワイプ
 * 横書き時ページ移動: U3(前), B3(次) + 縦スワイプ
 */

export class UIController {
  constructor(options = {}) {
    this.onLeftMenu = options.onLeftMenu;
    this.onProgressBar = options.onProgressBar;
    this.onBookmarkMenu = options.onBookmarkMenu;
    this.onPagePrev = options.onPagePrev;
    this.onPageNext = options.onPageNext;
    this.onFloatToggle = options.onFloatToggle;
    this.onResize = options.onResize;  // リサイズコールバック追加
    this.isBookOpen = options.isBookOpen || (() => false);
    this.isPageNavigationEnabled = options.isPageNavigationEnabled || (() => false);
    this.isProgressBarAvailable = options.isProgressBarAvailable || (() => false);
    this.getWritingMode = options.getWritingMode || (() => WRITING_MODES.HORIZONTAL);
    this.isFloatVisible = options.isFloatVisible || (() => false);
    this.isImageBook = options.isImageBook || (() => false);
    this.isSpreadMode = options.isSpreadMode || (() => false);
    this.getReadingDirection = options.getReadingDirection || (() => READING_DIRECTIONS.LTR);
    this.getEpubViewMode = options.getEpubViewMode || (() => EPUB_VIEW_MODES.PAGINATED);

    this.leftMenuVisible = false;
    this.progressBarVisible = false;
    this.progressBarPinned = false;
    this.bookmarkMenuVisible = false;
    this.touchStartX = null;
    this.touchStartY = null;

    this.setupClickHandler();
    this.setupTouchHandlers();
    this.setupResizeHandler();
    this.setupZoomExitHandlers();
  }

  /**
   * リサイズハンドラーをセットアップ
   */
  setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        console.log(`Window resized: ${window.innerWidth}x${window.innerHeight}`);
        // リサイズコールバックを呼び出し
        this.onResize?.();
      }, TIMING_CONFIG.RESIZE_DEBOUNCE_MS);
    });
  }

  /**
   * ズーム中の「閉じる/戻る」操作をズーム解除に置き換える
   */
  setupZoomExitHandlers() {
    const zoomExitSelectors = [
      `#${DOM_IDS.MENU_LIBRARY}`,
      `#${DOM_IDS.FLOAT_LIBRARY}`,
    ];
    const selector = zoomExitSelectors.join(",");
    if (!selector) return;

    document.addEventListener('click', (e) => {
      if (!document.body.classList.contains(UI_CLASSES.IS_ZOOMED)) {
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (!target || !target.closest(selector)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const zoomToggle = getById(DOM_IDS.TOGGLE_ZOOM);
      zoomToggle?.click();
    }, true);
  }

  /**
   * クリック座標からエリアを判定
   * 下10%は進捗バー専用エリアとして除外
   */
  getClickArea(x, y, baseElement, viewport = window.visualViewport) {
    if (!baseElement || typeof baseElement.getBoundingClientRect !== "function") {
      return null;
    }
    const rect = baseElement.getBoundingClientRect();
    const areaRect = rect
      ? {
        left: rect.left + (viewport?.offsetLeft ?? 0),
        top: rect.top + (viewport?.offsetTop ?? 0),
        width: viewport?.width ?? rect.width,
        height: viewport?.height ?? rect.height
      }
      : {
        left: 0,
        top: 0,
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight
      };

    const xPercent = ((x - areaRect.left) / areaRect.width) * 100;
    const yPercent = ((y - areaRect.top) / areaRect.height) * 100;

    console.log(`Area size: ${areaRect.width}x${areaRect.height}, Click: (${x}, ${y}) = (${xPercent.toFixed(1)}%, ${yPercent.toFixed(1)}%)`);

    // 下10%は進捗バー専用エリア（クリック処理しない）
    if (yPercent > INTERACTION_GRID_CONFIG.PROGRESS_BAR_EXCLUDE_FROM) {
      console.log('Progress bar area - ignoring click');
      return null;
    }

    // 縦方向: U(0-30%), M(30-60%), B(60-90%)
    let vArea = 'U';
    if (yPercent >= INTERACTION_GRID_CONFIG.VERTICAL_BREAKPOINTS.TOP
      && yPercent < INTERACTION_GRID_CONFIG.VERTICAL_BREAKPOINTS.MIDDLE) {
      vArea = 'M';
    } else if (yPercent >= INTERACTION_GRID_CONFIG.VERTICAL_BREAKPOINTS.MIDDLE
      && yPercent < INTERACTION_GRID_CONFIG.VERTICAL_BREAKPOINTS.BOTTOM) {
      vArea = 'B';
    }

    // 横方向: 20%ずつ5分割
    const segmentWidth = 100 / INTERACTION_GRID_CONFIG.HORIZONTAL_SEGMENTS;
    const hArea = Math.min(
      INTERACTION_GRID_CONFIG.HORIZONTAL_SEGMENTS,
      Math.floor(xPercent / segmentWidth) + 1
    );

    return `${vArea}${hArea}`;
  }

  /**
   * クリックハンドラーをセットアップ
   */
  setupClickHandler() {
    let isProcessing = false;  // 連続クリックを防ぐフラグ

    // 統一されたクリックハンドラー
    const clickHandler = (e) => {
      if (document.body.classList.contains(UI_CLASSES.GOOGLE_AUTH_ACTIVE)) {
        return;
      }
      // ズーム中は一切のクリック操作を無効化（ボタン以外）
      if (document.body.classList.contains(UI_CLASSES.IS_ZOOMED)) {
        // 例外: ズームボタンなど特定要素は許可したいが、それはイベントバブリングで
        // ここに来る前に処理済みか、あるいはここで target チェックが必要。
        // ただし、style.css で pointer-events を制御しているので、
        // ここに来るイベントは基本的に「許可された要素」か「無効化漏れ」
        // 念のため、明確に許可リスト（ズームボタン等）以外は弾くのが安全
        if (!e.target.closest(DOM_SELECTORS.ZOOM_ALLOWED_TARGETS)) {
          return;
        }
      }
      // メニューやボタン内のクリックは無視
      if (e.target.closest(DOM_SELECTORS.CLICK_EXCLUDE_ALL)) {
        return;
      }

      // 処理中なら無視（連続クリックを防ぐ）
      if (isProcessing) {
        console.log('Click event ignored (already processing)');
        return;
      }

      isProcessing = true;

      const baseElement = getById(DOM_IDS.FULLSCREEN_READER);
      try {
        const area = this.getClickArea(e.clientX, e.clientY, baseElement);
        if (!area) {
          isProcessing = false;
          return;
        }
        console.log('Clicked area:', area, 'at', e.clientX, e.clientY);

        this.handleAreaClick(area, e);
      } catch (error) {
        console.error('Error handling click:', error);
      } finally {
        // 処理完了後、フラグをリセット
        setTimeout(() => {
          isProcessing = false;
        }, UI_TIMING_CONFIG.CLICK_PROCESS_RESET_MS);
      }
    };

    document.addEventListener('click', clickHandler);
    console.log('Click handler attached to document');
  }

  /**
   * タッチスワイプハンドラーをセットアップ
   */
  setupTouchHandlers() {
    const reader = getById(DOM_IDS.FULLSCREEN_READER);
    if (!reader) {
      return;
    }

    const minSwipeDistance = TOUCH_CONFIG.MIN_SWIPE_DISTANCE;
    const axisDifference = TOUCH_CONFIG.AXIS_DIFFERENCE;

    reader.addEventListener('touchstart', (e) => {
      if (this.isAnyMenuVisible()) {
        return;
      }
      // ズーム中はスワイプ無効
      if (document.body.classList.contains(UI_CLASSES.IS_ZOOMED)) {
        return;
      }

      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
    }, { passive: true });

    reader.addEventListener('touchend', (e) => {
      if (this.isAnyMenuVisible()) {
        this.touchStartX = null;
        this.touchStartY = null;
        return;
      }

      // ズーム中はスワイプ無効
      if (document.body.classList.contains(UI_CLASSES.IS_ZOOMED)) {
        this.touchStartX = null;
        this.touchStartY = null;
        return;
      }

      if (this.touchStartX === null || this.touchStartY === null) {
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (this.isBookOpen() && this.isPageNavigationEnabled()) {
        // [START] EPUBスクロールモード時はスワイプでのページ移動を無効化 (SSOT)
        // [修正] 画像書庫（ZIP/CBZ）の場合はスクロールモード設定に関わらずスワイプを有効にする
        if (!this.isImageBook() && this.getEpubViewMode?.() === EPUB_VIEW_MODES.SCROLL) {
          this.touchStartX = null;
          this.touchStartY = null;
          return;
        }
        // [END]

        const mode = this.getWritingMode?.() || WRITING_MODES.HORIZONTAL;
        // 画像書庫または縦書きモードなら横スワイプ
        if (mode === WRITING_MODES.VERTICAL || this.isImageBook?.()) {
          const direction = this.getReadingDirection?.() || READING_DIRECTIONS.RTL;
          if (absDeltaX >= minSwipeDistance && (absDeltaX - absDeltaY) >= axisDifference) {
            if (deltaX > 0) {
              // 右方向へのスワイプ
              if (direction === READING_DIRECTIONS.LTR) {
                this.onPagePrev?.(); // LTRなら「右スワイプ」で戻る
              } else {
                this.onPageNext?.(); // RTLなら「右スワイプ」で進む
              }
            } else {
              // 左方向へのスワイプ
              if (direction === READING_DIRECTIONS.LTR) {
                this.onPageNext?.(); // LTRなら「左スワイプ」で進む
              } else {
                this.onPagePrev?.(); // RTLなら「左スワイプ」で戻る
              }
            }
          }
        } else if (absDeltaY >= minSwipeDistance && (absDeltaY - absDeltaX) >= axisDifference) {
          if (deltaY > 0) {
            this.onPagePrev?.();
          } else {
            this.onPageNext?.();
          }
        }
      }

      this.touchStartX = null;
      this.touchStartY = null;
    }, { passive: true });
  }

  isAnyMenuVisible() {
    return this.leftMenuVisible || this.bookmarkMenuVisible || (this.progressBarVisible && !this.progressBarPinned);
  }

  /**
   * エリアクリックを処理
   */
  handleAreaClick(area, event) {
    // ズーム中は操作無効（ドラッグ優先）
    if (document.body.classList.contains(UI_CLASSES.IS_ZOOMED)) {
      return;
    }

    // フローティングメニューが表示されている場合
    if (this.isFloatVisible?.()) {
      // 機能なしエリア、またはM3（メニュー開閉）ならフローティングを閉じる
      const label = this.getFunctionLabel(area);
      if (!label || area === INTERACTION_AREA_CODES.MENU_TOGGLE) {
        this.onFloatToggle?.();
      }
      return;
    }

    // M3でメニュー表示
    if (area === INTERACTION_AREA_CODES.MENU_TOGGLE) {
      this.onFloatToggle?.();
      return;
    }

    if (!this.isBookOpen()) return;

    // 全モード共通: シームレススクロール時はエリアタップによるページ送りを無効化 (SSOT)
    // [修正] 画像書庫（ZIP/CBZ）の場合はスクロールモード設定に関わらずエリアタップを有効にする
    if (!this.isImageBook() && this.getEpubViewMode?.() === EPUB_VIEW_MODES.SCROLL) {
      return;
    }

    const writingMode = this.getWritingMode?.() || WRITING_MODES.HORIZONTAL;

    // 画像書庫または縦書き
    if (writingMode === WRITING_MODES.VERTICAL || this.isImageBook?.()) {
      const direction = this.getReadingDirection?.() || READING_DIRECTIONS.RTL;
      if (INTERACTION_AREA_CODES.VERTICAL_NAV.PREV.includes(area)) {
        if (direction === READING_DIRECTIONS.LTR) {
          this.onPagePrev?.(); // LTRなら左で戻る
        } else {
          this.onPageNext?.(); // RTLなら左で進む
        }
      } else if (INTERACTION_AREA_CODES.VERTICAL_NAV.NEXT.includes(area)) {
        if (direction === READING_DIRECTIONS.LTR) {
          this.onPageNext?.(); // LTRなら右で進む
        } else {
          this.onPagePrev?.(); // RTLなら右で戻る
        }
      }

      // 画像書庫かつ見開きモードの場合、U3/B3で1ページ移動（綴じ方向に依存しない）
      if (this.isImageBook?.() && this.isSpreadMode?.()) {
        if (area === INTERACTION_AREA_CODES.SPREAD_ADJUST.PREV_SINGLE) {
          console.log('Spread adjustment: Prev 1 page');
          // U3 (上中央) -> 常に1ページ戻る
          this.onPagePrev?.(1);
          return;
        } else if (area === INTERACTION_AREA_CODES.SPREAD_ADJUST.NEXT_SINGLE) {
          console.log('Spread adjustment: Next 1 page');
          // B3 (下中央) -> 常に1ページ進む
          this.onPageNext?.(1);
          return;
        }
      }
      return;
    }

    if (area === INTERACTION_AREA_CODES.HORIZONTAL_NAV.PREV) {
      this.onPagePrev?.();
    } else if (area === INTERACTION_AREA_CODES.HORIZONTAL_NAV.NEXT) {
      this.onPageNext?.();
    }
  }

  /**
   * 左メニューを表示
   */
  showLeftMenu() {
    console.log('showLeftMenu called');
    this.leftMenuVisible = true;
    this.onLeftMenu?.('show');

    const menu = getById(DOM_IDS.LEFT_MENU);
    const backdrop = getById(DOM_IDS.LEFT_MENU_BACKDROP);
    const overlay = getById(DOM_IDS.CLICK_OVERLAY);

    console.log('leftMenu element:', menu);
    if (menu) {
      menu.classList.add(UI_CLASSES.VISIBLE);
      console.log('Added visible class to leftMenu');
    } else {
      console.error('leftMenu element not found!');
    }

    // バックドロップを表示
    if (backdrop) {
      backdrop.classList.add(UI_CLASSES.VISIBLE);
      // バックドロップクリックでメニューを閉じる
      backdrop.addEventListener('click', () => this.closeAllMenus(), { once: true });
      console.log('Showed menu backdrop');
    }

    // オーバーレイを無効化
    if (overlay) {
      overlay.style.pointerEvents = 'none';
      console.log('Disabled overlay pointer events');
    }
  }

  /**
   * 進捗バーを表示
   */
  showProgressBar(options = {}) {
    return this.showProgressBarWithOptions(options);
  }

  showProgressBarWithOptions(options = {}) {
    const { persistent = false } = options;
    console.log('showProgressBar called');
    this.progressBarPinned = this.progressBarPinned || persistent;
    this.progressBarVisible = !persistent;
    this.onProgressBar?.('show');

    const bar = getById(DOM_IDS.PROGRESS_BAR_PANEL);
    const backdrop = getById(DOM_IDS.PROGRESS_BAR_BACKDROP);
    const overlay = getById(DOM_IDS.CLICK_OVERLAY);

    console.log('progressBarPanel element:', bar);
    if (bar) {
      bar.classList.add(UI_CLASSES.VISIBLE);
      console.log('Added visible class to progressBarPanel');
    } else {
      console.error('progressBarPanel element not found!');
    }

    if (!persistent) {
      // バックドロップを表示
      if (backdrop) {
        backdrop.classList.add(UI_CLASSES.VISIBLE);
        // バックドロップクリックで進捗バーを閉じる
        backdrop.addEventListener('click', () => this.closeAllMenus(), { once: true });
        console.log('Showed progress bar backdrop');
      }

      // オーバーレイを無効化
      if (overlay) {
        overlay.style.pointerEvents = 'none';
        console.log('Disabled overlay pointer events');
      }
    } else {
      if (backdrop) {
        backdrop.classList.remove(UI_CLASSES.VISIBLE);
      }
    }
  }

  /**
   * しおりメニューを表示
   */
  showBookmarkMenu() {
    console.log('showBookmarkMenu called');
    this.bookmarkMenuVisible = true;
    this.onBookmarkMenu?.('show');

    const menu = getById(DOM_IDS.BOOKMARK_MENU);
    const overlay = getById(DOM_IDS.CLICK_OVERLAY);

    console.log('bookmarkMenu element:', menu);
    if (menu) {
      menu.classList.add(UI_CLASSES.VISIBLE);
      console.log('Added visible class to bookmarkMenu');
    } else {
      console.error('bookmarkMenu element not found!');
    }

    // オーバーレイを無効化
    if (overlay) {
      overlay.style.pointerEvents = 'none';
      console.log('Disabled overlay pointer events');
    }
  }

  /**
   * 全てのメニューを閉じる
   */
  closeAllMenus() {
    this.leftMenuVisible = false;
    this.progressBarVisible = false;
    this.bookmarkMenuVisible = false;

    const leftMenu = getById(DOM_IDS.LEFT_MENU);
    const leftMenuBackdrop = getById(DOM_IDS.LEFT_MENU_BACKDROP);
    const progressBar = getById(DOM_IDS.PROGRESS_BAR_PANEL);
    const progressBarBackdrop = getById(DOM_IDS.PROGRESS_BAR_BACKDROP);
    const bookmarkMenu = getById(DOM_IDS.BOOKMARK_MENU);
    const overlay = getById(DOM_IDS.CLICK_OVERLAY);

    if (leftMenu) leftMenu.classList.remove(UI_CLASSES.VISIBLE);
    if (leftMenuBackdrop) leftMenuBackdrop.classList.remove(UI_CLASSES.VISIBLE);
    if (!this.progressBarPinned) {
      if (progressBar) progressBar.classList.remove(UI_CLASSES.VISIBLE);
      if (progressBarBackdrop) progressBarBackdrop.classList.remove(UI_CLASSES.VISIBLE);
    } else if (progressBarBackdrop) {
      progressBarBackdrop.classList.remove(UI_CLASSES.VISIBLE);
    }
    if (bookmarkMenu) bookmarkMenu.classList.remove(UI_CLASSES.VISIBLE);

    // オーバーレイを再度有効化（スクロールモード時はCSSで無効化されているため除外）
    if (overlay) {
      const isScrollMode = document.querySelector('.fullscreen-reader.epub-scroll-mode');
      if (!isScrollMode) {
        overlay.style.pointerEvents = 'auto';
        console.log('Re-enabled overlay pointer events');
      } else {
        // スクロールモード時はインラインスタイルをクリアしてCSSに委任
        overlay.style.pointerEvents = '';
      }
    }

    this.onLeftMenu?.('hide');
    this.onProgressBar?.('hide');
    this.onBookmarkMenu?.('hide');
  }

  /**
   * 進捗表示を更新
   */
  updateProgress(current, total, percentageOverride = null) {
    // 数値型に強制変換（オブジェクトが渡された場合の対策）
    const currentIndex = (typeof current === 'object' && current !== null) ? (current.index ?? current.pageIndex ?? 0) : Number(current || 0);
    const totalCount = (typeof total === 'object' && total !== null) ? (total.length ?? total.totalPages ?? 0) : Number(total || 0);

    // 1. ページ番号表示更新
    const currentInput = getById(DOM_IDS.CURRENT_PAGE_INPUT);
    const totalSpan = getById(DOM_IDS.TOTAL_PAGES);

    // ページ番号は章の番号なので、小数点以下は切り捨てる
    if (currentInput) currentInput.value = Math.floor(currentIndex) + 1; // 1-based

    // totalPages が undefined の場合や 0 の場合のガード
    const validTotal = (typeof totalCount === 'number' && totalCount > 0) ? totalCount : 0;
    if (totalSpan) totalSpan.textContent = isNaN(validTotal) ? 0 : validTotal;

    // 2. プログレスバー更新
    let percentage = 0;
    if (Number.isFinite(percentageOverride)) {
      percentage = percentageOverride;
    } else if (validTotal > 1) {
      percentage = (Math.min(currentIndex, validTotal - 1) / (validTotal - 1)) * 100;
    } else if (validTotal === 1) {
      percentage = 100;
    }

    if (isNaN(percentage)) percentage = 0;

    const fill = getById(DOM_IDS.PROGRESS_FILL);
    const thumb = getById(DOM_IDS.PROGRESS_THUMB);

    if (fill) fill.style.width = `${percentage}%`;
    if (thumb) thumb.style.left = `${percentage}%`;

    // 3. フローティングプログレスバー更新
    const floatFill = getById(DOM_IDS.FLOAT_PROGRESS_FILL);
    const floatThumb = getById(DOM_IDS.FLOAT_PROGRESS_THUMB);
    const floatPercent = getById(DOM_IDS.FLOAT_PROGRESS_PERCENT);

    if (floatFill) floatFill.style.width = `${percentage}%`;
    if (floatThumb) floatThumb.style.left = `${percentage}%`;
    if (floatPercent) floatPercent.textContent = `${Math.round(percentage)}%`;
  }

  /**
   * エリアのデバッグ表示（開発用）
   */
  showDebugGrid() {
    const overlay = document.createElement('div');
    overlay.id = 'debug-grid';
    overlay.className = UI_CLASSES.DEBUG_GRID;

    // グリッド線を描画
    const lines = [
      ...DEBUG_GRID_CONFIG.HORIZONTAL_LINES.map((percent) => ({
        type: WRITING_MODES.HORIZONTAL,
        percent,
        label: `${percent}%`,
      })),
      ...DEBUG_GRID_CONFIG.VERTICAL_LINES.map((percent) => ({
        type: WRITING_MODES.VERTICAL,
        percent,
        label: `${percent}%`,
      })),
    ];

    lines.forEach(line => {
      const el = document.createElement('div');
      el.className = UI_CLASSES.DEBUG_GRID_LINE;
      el.style.position = 'absolute';
      if (line.type === WRITING_MODES.HORIZONTAL) {
        el.style.top = `${line.percent}%`;
        el.style.left = '0';
        el.style.right = '0';
        el.style.height = `${DEBUG_GRID_CONFIG.LINE_THICKNESS_PX}px`;
      } else {
        el.style.left = `${line.percent}%`;
        el.style.top = '0';
        el.style.bottom = '0';
        el.style.width = `${DEBUG_GRID_CONFIG.LINE_THICKNESS_PX}px`;
      }
      overlay.appendChild(el);

      // ラベル
      const label = document.createElement('div');
      label.textContent = line.label;
      label.className = UI_CLASSES.DEBUG_GRID_LABEL;
      label.style.position = 'absolute';
      if (line.type === WRITING_MODES.HORIZONTAL) {
        label.style.top = `${line.percent}%`;
        label.style.left = '50%';
      } else {
        label.style.left = `${line.percent}%`;
        label.style.top = '50%';
      }
      label.style.transform = 'translate(-50%, -50%)';
      overlay.appendChild(label);
    });

    document.body.appendChild(overlay);

    // 10秒後に自動削除
    setTimeout(() => overlay.remove(), UI_TIMING_CONFIG.DEBUG_GRID_AUTO_HIDE_MS);
  }

  /**
   * エリアの機能ラベルを取得
   */
  getFunctionLabel(area) {
    if (area === INTERACTION_AREA_CODES.MENU_TOGGLE) {
      return INTERACTION_AREA_LABELS.MENU_TOGGLE;
    }

    const writingMode = this.getWritingMode?.() || WRITING_MODES.HORIZONTAL;
    const isImage = this.isImageBook?.();
    const isSpread = this.isSpreadMode?.();

    // 縦書き or 画像
    if (writingMode === WRITING_MODES.VERTICAL || isImage) {
      const direction = this.getReadingDirection?.() || READING_DIRECTIONS.RTL;
      if (INTERACTION_AREA_CODES.VERTICAL_NAV.PREV.includes(area)) {
        return direction === READING_DIRECTIONS.LTR
          ? INTERACTION_AREA_LABELS.PAGE_PREV
          : INTERACTION_AREA_LABELS.PAGE_NEXT;
      }
      if (INTERACTION_AREA_CODES.VERTICAL_NAV.NEXT.includes(area)) {
        return direction === READING_DIRECTIONS.LTR
          ? INTERACTION_AREA_LABELS.PAGE_NEXT
          : INTERACTION_AREA_LABELS.PAGE_PREV;
      }
      if (isSpread) {
        if (area === INTERACTION_AREA_CODES.SPREAD_ADJUST.PREV_SINGLE) {
          return INTERACTION_AREA_LABELS.PAGE_PREV_SINGLE;
        }
        if (area === INTERACTION_AREA_CODES.SPREAD_ADJUST.NEXT_SINGLE) {
          return INTERACTION_AREA_LABELS.PAGE_NEXT_SINGLE;
        }
      }
    } else {
      // 横書き
      if (area === INTERACTION_AREA_CODES.HORIZONTAL_NAV.PREV) {
        return INTERACTION_AREA_LABELS.PAGE_PREV;
      }
      if (area === INTERACTION_AREA_CODES.HORIZONTAL_NAV.NEXT) {
        return INTERACTION_AREA_LABELS.PAGE_NEXT;
      }
    }
    return null;
  }

}

/**
 * 進捗バー用のドラッグハンドラー
 */
export class ProgressBarHandler {
  constructor(options = {}) {
    this.container = options.container;
    this.thumb = options.thumb;
    this.onSeek = options.onSeek;
    this.getIsRtl = options.getIsRtl || (() => false);

    this.isDragging = false;
    this.setupDragHandlers();
  }

  setupDragHandlers() {
    if (!this.thumb || !this.container) return;

    // ツマミのドラッグ
    this.thumb.addEventListener('mousedown', this.handleDragStart.bind(this));
    document.addEventListener('mousemove', this.handleDragMove.bind(this));
    document.addEventListener('mouseup', this.handleDragEnd.bind(this));

    // タッチ対応
    this.thumb.style.touchAction = 'none';
    this.thumb.addEventListener('touchstart', this.handleDragStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.handleDragMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleDragEnd.bind(this), { passive: false });

    // 進捗トラックをクリックでジャンプ
    this.container.addEventListener('click', (e) => {
      // ツマミをクリックした場合は無視
      if (e.target === this.thumb) return;

      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let percentage = (x / rect.width) * 100;

      // RTLなら反転
      if (this.getIsRtl()) {
        percentage = 100 - percentage;
      }

      console.log('Track clicked at', percentage.toFixed(2) + '%');
      this.updatePosition(percentage);
      this.onSeek?.(percentage);
    });
  }

  handleDragStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.thumb.classList.add(UI_CLASSES.DRAGGING);
    console.log('Drag started');
  }

  handleDragMove(e) {
    if (!this.isDragging) return;

    e.preventDefault(); // スクロールを防ぐ

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = this.container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    let percentage = (x / rect.width) * 100;

    if (this.getIsRtl()) {
      percentage = 100 - percentage;
    }

    this.updatePosition(percentage);
    // ドラッグ中はシークしない（updatePositionのみ）
  }

  handleDragEnd(e) {
    if (!this.isDragging) return;

    e.preventDefault();

    // ドラッグ終了時に最終位置でシーク
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const rect = this.container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    let percentage = (x / rect.width) * 100;

    if (this.getIsRtl()) {
      percentage = 100 - percentage;
    }

    console.log('Drag ended at', percentage.toFixed(2) + '%');
    this.onSeek?.(percentage);

    this.isDragging = false;
    this.thumb.classList.remove(UI_CLASSES.DRAGGING);
  }

  updatePosition(percentage) {
    if (this.thumb) {
      this.thumb.style.left = `${percentage}%`;
    }
  }
}

```

### assets/style.css

```css
@import url("./css/01-tokens.css");
@import url("./css/02-reset.css");
@import url("./css/03-base.css");
@import url("./css/04-reader.css");
@import url("./css/05-float-ui.css");
@import url("./css/06-reader-extras.css");
@import url("./css/07-menu.css");
@import url("./css/08-progress.css");
@import url("./css/09-bookmark.css");
@import url("./css/10-modal.css");
@import url("./css/11-library.css");
@import url("./css/12-history.css");
@import url("./css/13-search.css");
@import url("./css/14-settings.css");
@import url("./css/15-responsive.css");
@import url("./css/16-candidate.css");
@import url("./css/17-loading.css");
@import url("./css/18-float-lang.css");
@import url("./css/19-zoom.css");

```

### docs/CORE_PRINCIPLES.md

```markdown
# AIコーディング基本原則

本ドキュメントは、AIによるコーディング作業において**常に遵守すべき基本原則**を定める。
すべての開発作業の開始時に本ドキュメントを読み込み、作業中も常に意識すること。

---

## 絶対遵守事項

以下の規則は**いかなる場合も違反してはならない**。

### 1. SSOT（Single Source of Truth）の厳守

**あなたは設定値・定数・識別子をコード内に直接記述してはならない。**

- 定数は専用ファイル（`constants/` 等）に集約しなければならない
- 同じ値が2箇所以上に存在してはならない
- 既存の定数定義を確認せずに新しい値を追加してはならない

**違反時の影響**: 値の変更時に修正漏れが発生し、動作不整合やバグの原因となる

### 2. 既存構造の保護

**あなたは既存のモジュール構造・初期化順序・依存関係を破壊してはならない。**

- 新規コードは既存のパターンに従って追加しなければならない
- 依存注入（`init(config)`等）のパターンが存在する場合、それを維持しなければならない
- ファイルの読み込み順序に依存する処理を変更してはならない

**違反時の影響**: 初期化エラー、未定義参照、機能の完全な破壊

### 3. コメントによる意図の明示

**あなたはコメントなしでコードを追加・変更してはならない。**

- 新規関数には目的・引数・戻り値を記述しなければならない
- 複雑なロジックには「なぜそうするのか」を記述しなければならない
- 既存コメントと矛盾する変更を行う場合、コメントも更新しなければならない

**違反時の影響**: 後続の修正で意図が伝わらず、誤った変更が行われる

### 4. 変更前の確認義務

**あなたはコードを変更する前に、その影響範囲を確認しなければならない。**

- 変更対象が他のファイルから参照されているか確認すること
- 関数のシグネチャを変更する場合、すべての呼び出し元を確認すること
- 定数やクラス名を変更する場合、全ファイルを検索すること

**違反時の影響**: 参照切れ、未定義エラー、予期しない動作

---

## 作業開始時の必須手順

新しい作業を開始する前に、以下を必ず実行すること。

### 1. プロジェクト構造の把握

```bash
# ディレクトリ構成を確認
ls -la
ls -la src/ assets/ # 等、主要ディレクトリ

# ドキュメントを確認
cat README.md
cat docs/ai-coding/*.md  # 本ガイドライン群
```

### 2. 既存パターンの確認

- 定数管理の方式（`constants/` の構成）
- モジュールの初期化パターン（`init()` の有無）
- コメントの書式（JSDoc、セクション区切り等）

### 3. 関連ガイドラインの参照

作業内容に応じて、以下の詳細ガイドを参照すること。

| 作業内容 | 参照ドキュメント |
|----------|------------------|
| 定数・設定値の追加 | [SSOT_GUIDE.md](./SSOT_GUIDE.md) |
| 新機能の追加 | [MODULE_GUIDE.md](./MODULE_GUIDE.md) |
| コメント・ドキュメント | [COMMENT_GUIDE.md](./COMMENT_GUIDE.md) |
| コード分割・リファクタリング | [REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md) |

---

## 禁止事項チェックリスト

作業完了時に以下を確認すること。

- [ ] マジックナンバー・ハードコーディングを追加していないか
- [ ] 既存の定数を参照せず、同じ値を新規に書いていないか
- [ ] 関数・変数の目的を示すコメントを書いたか
- [ ] 既存の初期化順序・依存関係を壊していないか
- [ ] 変更した箇所の参照元をすべて確認したか

---

## 例外の取り扱い

原則に従えない正当な理由がある場合：

1. **理由をコメントで明記**すること
2. **将来の修正方針**を記述すること
3. ユーザーに**例外である旨を報告**すること

```javascript
// TODO: 暫定的なハードコーディング
// 理由: APIの仕様確定待ち
// 方針: 仕様確定後にconstants/api.jsへ移動
const TEMP_ENDPOINT = "https://example.com/api";
```

---

## 本原則の位置づけ

- 本ドキュメントは**最上位の規則**である
- 他のガイドラインと矛盾する場合、本原則が優先される
- 不明点がある場合は、作業前にユーザーに確認すること

```

### docs/SSOT_GUIDE.md

```markdown
# SSOT（Single Source of Truth）実践ガイド

本ドキュメントは、コード内の定数・設定値・識別子を一元管理するための具体的な実践方法を定める。

---

## SSOTとは

**「すべての情報は唯一の場所で定義され、他はそこを参照する」** という原則。

```
❌ 悪い例：同じ値が複数箇所に存在
  app.js:    const API_URL = "https://api.example.com";
  sync.js:   const API_URL = "https://api.example.com";
  config.js: const API_URL = "https://api.example.com";

✅ 良い例：一箇所で定義し、他は参照
  constants/api.js: export const API_URL = "https://api.example.com";
  app.js:    import { API_URL } from "./constants/api.js";
  sync.js:   import { API_URL } from "./constants/api.js";
```

---

## SSOT化の対象

### 必須（絶対にSSOT化する）

| カテゴリ | 例 | 理由 |
|----------|-----|------|
| URL・エンドポイント | API URL, CDN パス | 環境変更時に一括修正が必要 |
| DOM ID・セレクタ | `#viewer`, `.modal` | HTML変更時に不整合が発生 |
| 設定値・閾値 | タイムアウト秒数, 上限値 | 調整時に漏れが発生 |
| 状態を表す文字列 | `"loading"`, `"error"` | タイポによるバグの温床 |
| ファイルパス | アセットパス, 出力先 | 構成変更時に追従が必要 |

### 推奨（SSOT化が望ましい）

| カテゴリ | 例 | 判断基準 |
|----------|-----|----------|
| UI表示文字列 | ボタンラベル, メッセージ | 多言語対応の可能性があれば |
| CSSクラス名 | `.active`, `.hidden` | JS/CSSの両方で使用する場合 |
| イベント名 | カスタムイベント | 複数ファイルで発火/購読する場合 |

### 例外（SSOT化不要）

| カテゴリ | 例 | 理由 |
|----------|-----|------|
| ローカル変数 | ループカウンタ | 関数内で完結 |
| 一時的な計算値 | 中間結果 | 再利用しない |
| 標準的な値 | `true`, `false`, `0`, `1` | 変更の可能性がない |

---

## 定数ファイルの構成パターン

### パターン1：カテゴリ別ファイル + バレル（推奨）

```
constants/
├── index.js          # 再エクスポート（バレル）
├── api.js            # API関連
├── ui.js             # UI関連（DOM ID, クラス名）
├── storage.js        # ストレージ関連
├── timing.js         # タイミング関連（タイムアウト等）
└── formats.js        # フォーマット関連（MIME, 拡張子）
```

```javascript
// constants/index.js（バレルファイル）
export * from "./api.js";
export * from "./ui.js";
export * from "./storage.js";
export * from "./timing.js";
export * from "./formats.js";
```

**利点**:
- カテゴリごとに探しやすい
- 必要な定数だけインポート可能
- 既存インポートを壊さずに分割可能

### パターン2：単一ファイル（小規模プロジェクト向け）

```javascript
// constants.js
export const API_URL = "...";
export const DOM_IDS = { ... };
export const TIMEOUTS = { ... };
```

**利点**: シンプル
**欠点**: 肥大化すると管理困難

---

## 定数の命名規則

### 基本規則

```javascript
// 単一値：UPPER_SNAKE_CASE
export const API_TIMEOUT_MS = 5000;
export const MAX_RETRY_COUNT = 3;

// 関連する値のグループ：オブジェクトでまとめる
export const THEME_MODES = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
});

// DOM ID・セレクタ：用途別オブジェクト
export const DOM_IDS = Object.freeze({
  VIEWER: "viewer",
  MODAL: "modal",
});

export const DOM_SELECTORS = Object.freeze({
  ACTIVE_ITEM: ".item.active",
  ALL_BUTTONS: "button[data-action]",
});
```

### Object.freeze() の使用

オブジェクト形式の定数は `Object.freeze()` で保護する。

```javascript
// ✅ 良い：変更を防止
export const STATES = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
});

// ❌ 悪い：後から変更可能になってしまう
export const STATES = {
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
};
```

---

## 定数追加時の手順

### 1. 既存定数の確認

```bash
# 既存の定数ファイルを確認
cat constants/index.js
cat constants/*.js

# 同じ値が既に存在しないか検索
grep -r "追加したい値" src/ assets/
```

### 2. 適切なカテゴリの選択

| 追加する定数 | 配置先 |
|--------------|--------|
| API URL, エンドポイント | `constants/api.js` |
| DOM ID, CSSクラス | `constants/ui.js` |
| タイムアウト, 間隔 | `constants/timing.js` |
| MIME, 拡張子 | `constants/formats.js` |
| 新カテゴリ | 新ファイル作成 + index.js更新 |

### 3. 定数の追加

```javascript
// constants/timing.js に追加する例

// ============================================
// 自動保存タイミング（新規追加）
// ============================================
/** 自動保存のデバウンス間隔（ミリ秒） */
export const AUTO_SAVE_DEBOUNCE_MS = 2000;
```

### 4. 利用側の更新

```javascript
// 利用側ファイル
import { AUTO_SAVE_DEBOUNCE_MS } from "./constants.js";

// 使用
setTimeout(save, AUTO_SAVE_DEBOUNCE_MS);
```

---

## ハードコーディングの発見と修正

### 発見方法

```bash
# マジックナンバーの検索
grep -rn "[0-9]\{3,\}" src/ --include="*.js" | grep -v "constants"

# 文字列リテラルの検索（DOM操作）
grep -rn 'getElementById\|querySelector' src/ --include="*.js"

# 直接書かれたURLの検索
grep -rn 'http://\|https://' src/ --include="*.js" | grep -v "constants"
```

### 修正パターン

```javascript
// Before: ハードコーディング
document.getElementById("viewer").classList.add("active");
setTimeout(callback, 5000);

// After: 定数参照
import { DOM_IDS, UI_CLASSES, TIMEOUTS } from "./constants.js";
document.getElementById(DOM_IDS.VIEWER).classList.add(UI_CLASSES.ACTIVE);
setTimeout(callback, TIMEOUTS.DEFAULT_MS);
```

---

## SSOT監査チェックリスト

定期的に以下を確認すること。

### コード内のハードコーディング

- [ ] URL・エンドポイントが直接書かれていないか
- [ ] DOM ID・セレクタが文字列リテラルで書かれていないか
- [ ] タイムアウト値が数値リテラルで書かれていないか
- [ ] 状態文字列（`"loading"` 等）が直接書かれていないか

### 定数ファイルの健全性

- [ ] 同じ値が複数の定数に定義されていないか
- [ ] 未使用の定数が残っていないか
- [ ] オブジェクト定数に `Object.freeze()` が適用されているか
- [ ] 各定数にコメント（用途説明）があるか

### バレルファイルの整合性

- [ ] 新規追加したファイルが `index.js` で再エクスポートされているか
- [ ] 削除したファイルが `index.js` から除去されているか

---

## 関連ドキュメント

- [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) - 基本原則
- [COMMENT_GUIDE.md](./COMMENT_GUIDE.md) - 定数へのコメント付与規則

```

### docs/MODULE_GUIDE.md

```markdown
# モジュール化・依存注入ガイド

本ドキュメントは、コードをモジュール化し、依存関係を安全に管理するための実践方法を定める。

---

## モジュール化の目的

1. **機能の独立性**: 各モジュールが単一の責務を持つ
2. **依存関係の明示**: 何が何に依存しているかが明確
3. **安全な変更**: 一部の変更が全体に波及しない
4. **テスト容易性**: モジュール単位でテスト可能

---

## 依存注入パターン

### 基本形：init(config) パターン

モジュールは外部依存を `init()` 関数で受け取る。

```javascript
/**
 * sync-logic.js - 同期ロジック
 * 
 * 外部依存はinit()で注入される。
 * 直接importによるグローバル依存は最小限にする。
 */

// 注入されるオブジェクト（モジュールスコープ）
let _storage = null;
let _cloudSync = null;
let _callbacks = {};

/**
 * モジュールの初期化
 * @param {Object} config - 設定オブジェクト
 * @param {Object} config.storage - ストレージサービス
 * @param {Object} config.cloudSync - クラウド同期サービス
 * @param {Object} config.callbacks - UIコールバック群
 */
export function init(config) {
  _storage = config.storage;
  _cloudSync = config.cloudSync;
  _callbacks = config.callbacks ?? {};
}

/**
 * 同期実行（注入された依存を使用）
 */
export async function syncData() {
  if (!_storage || !_cloudSync) {
    throw new Error("モジュールが初期化されていません");
  }
  // _storage, _cloudSync を使用した処理
}
```

### 呼び出し側（初期化の実行）

```javascript
// app.js - アプリケーションのエントリポイント
import * as syncLogic from "./sync-logic.js";
import { StorageService } from "./storage.js";
import { CloudSync } from "./cloudSync.js";

// 依存オブジェクトの生成
const storage = new StorageService();
const cloudSync = new CloudSync();

// モジュールの初期化（依存の注入）
syncLogic.init({
  storage,
  cloudSync,
  callbacks: {
    onSyncComplete: () => updateUI(),
    onSyncError: (err) => showError(err),
  },
});
```

---

## 初期化順序の重要性

### 依存グラフの把握

初期化には順序がある。依存される側から先に初期化する。

```
storage（依存なし）
    ↓
cloudSync（storageに依存）
    ↓
syncLogic（storage, cloudSyncに依存）
    ↓
ui（syncLogicに依存）
    ↓
renderers（storage, syncLogic, uiに依存）
```

### 初期化順序の記述例

```javascript
// app.js - 初期化セクション

// ============================================
// Phase 1: 基盤サービス（依存なし）
// ============================================
const storage = new StorageService(STORAGE_KEY);
const settings = storage.getSettings();

// ============================================
// Phase 2: 外部連携（storageに依存）
// ============================================
const cloudSync = new CloudSync();
cloudSync.init({ storage });

// ============================================
// Phase 3: ビジネスロジック（複数に依存）
// ============================================
syncLogic.init({
  storage,
  cloudSync,
  checkAuthStatus,
  callbacks: { ... },
});

// ============================================
// Phase 4: UI層（全てに依存）
// ============================================
const ui = new UIController();
renderers.init({
  storage,
  syncLogic,
  ui,
  state: appState,
  actions: appActions,
});
```

---

## モジュール境界の設計

### 単一責務の原則

各モジュールは1つの責務を持つ。

```
✅ 良い分割：
storage.js      → データ永続化のみ
cloudSync.js    → クラウド通信のみ
sync-logic.js   → 同期判断ロジックのみ
renderers.js    → UI描画のみ

❌ 悪い分割：
utils.js        → 雑多な関数の集合
helpers.js      → 何でも入りのファイル
```

### 循環依存の禁止

A → B → A のような循環依存を作ってはならない。

```javascript
// ❌ 循環依存（禁止）
// a.js
import { funcB } from "./b.js";
export function funcA() { funcB(); }

// b.js
import { funcA } from "./a.js";  // 循環！
export function funcB() { funcA(); }

// ✅ 解決策：共通モジュールに抽出、またはコールバックで解決
// a.js
export function funcA(callback) { callback(); }

// b.js
import { funcA } from "./a.js";
export function funcB() { ... }
funcA(funcB);  // コールバックとして渡す
```

---

## インターフェース定義

### JSDoc型定義の活用

モジュールが期待する依存の形をJSDocで明示する。

```javascript
/**
 * @typedef {Object} StorageInterface
 * @property {Object} data - 内部データ
 * @property {function(string): Object} getProgress - 進捗取得
 * @property {function(string, Object): void} setProgress - 進捗設定
 * @property {function(): Object} getSettings - 設定取得
 */

/**
 * @typedef {Object} SyncLogicConfig
 * @property {StorageInterface} storage - ストレージサービス
 * @property {Object} cloudSync - クラウド同期サービス
 * @property {function(): Object} checkAuthStatus - 認証確認関数
 */

/**
 * @param {SyncLogicConfig} config
 */
export function init(config) {
  // ...
}
```

### 最小インターフェースの原則

モジュールは必要最小限の依存だけを要求する。

```javascript
// ❌ 過剰な依存（storage全体を要求）
function formatProgress(storage) {
  return storage.getProgress(bookId).percentage + "%";
}

// ✅ 最小限の依存（必要な値だけを要求）
function formatProgress(percentage) {
  return percentage + "%";
}
```

---

## 新規モジュール追加の手順

### 1. 責務の明確化

```markdown
## 新モジュール: notification.js
- 責務: ユーザー通知の表示
- 依存: ui.js（DOM操作）, i18n.js（メッセージ）
- 公開API: show(), hide(), showError()
```

### 2. インターフェース設計

```javascript
/**
 * notification.js - 通知モジュール
 * 
 * 依存: init()で注入
 * - elements: DOM要素への参照
 * - t: 翻訳関数
 */

let _elements = null;
let _t = null;

/**
 * @param {Object} config
 * @param {Object} config.elements - DOM要素
 * @param {function(string): string} config.t - 翻訳関数
 */
export function init(config) {
  _elements = config.elements;
  _t = config.t;
}
```

### 3. 初期化順序への組み込み

```javascript
// app.js の初期化セクションに追加

// ============================================
// Phase 4: UI層
// ============================================
notification.init({
  elements: ui.elements,
  t: (key) => t(key, uiLanguage),
});
```

### 4. 依存グラフの更新

既存の依存関係ドキュメントがあれば更新する。

---

## 依存関係のドキュメント化

### 機能マップの作成

新規モジュールまたは大きな変更時は、依存関係を文書化する。

```markdown
# notification.js 機能マップ

## 依存注入（init で受け取る）
| 依存 | 型 | 用途 |
|------|-----|------|
| elements | Object | DOM要素への参照 |
| t | Function | 翻訳関数 |

## 公開API
| 関数 | 引数 | 戻り値 | 用途 |
|------|------|--------|------|
| init | config | void | 初期化 |
| show | message, type | void | 通知表示 |
| hide | - | void | 通知非表示 |

## 他モジュールからの参照
- app.js: エラー発生時に show() を呼び出し
- sync-logic.js: 同期完了時に show() を呼び出し
```

---

## トラブルシューティング

### 「undefined」エラーが発生する場合

1. `init()` が呼ばれているか確認
2. 初期化順序が正しいか確認
3. 必要な依存がすべて渡されているか確認

### モジュールの変更が反映されない場合

1. キャッシュのクリア
2. インポートパスの確認
3. バレルファイル（index.js）の再エクスポート確認

---

## 関連ドキュメント

- [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) - 基本原則
- [REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md) - モジュール分割時の安全手順
- [COMMENT_GUIDE.md](./COMMENT_GUIDE.md) - JSDoc記述規則

```

### docs/COMMENT_GUIDE.md

```markdown
# コメント・ドキュメント規約

本ドキュメントは、コード内のコメントおよびドキュメントの記述規則を定める。
適切なコメントは、AIによる後続の修正においてコードの破壊を防ぐ最重要の防衛線である。

---

## コメントの目的

1. **意図の伝達**: 「何をしているか」ではなく「なぜそうするか」
2. **制約の明示**: 変更してはいけない理由を伝える
3. **依存の記録**: 他のコードとの関係を明示する
4. **将来への引き継ぎ**: 次の修正者（AI含む）への情報提供

---

## ファイルヘッダーコメント

### 必須要素

すべてのソースファイルの先頭に以下を記述する。

```javascript
/**
 * ファイル名.js - 一行での役割説明
 *
 * 詳細な説明（2-3行）
 * このモジュールが担当する責務を記述する。
 *
 * 依存: 外部モジュールへの依存を列挙
 * 参照元: このファイルを使用する側を列挙（主要なもの）
 */
```

### 例

```javascript
/**
 * sync-logic.js - 同期ロジック
 *
 * クラウド同期に関するビジネスロジックを集約する。
 * UIとの連携はコールバック経由で行い、
 * ストレージやクラウド同期インスタンスは初期化時に注入される。
 *
 * 依存: constants.js, i18n.js, elements.js, file-handler.js
 * 参照元: app.js（初期化）, renderers.js（UI描画時）
 */
```

---

## セクション区切りコメント

### 形式

関連する機能をグループ化する際に使用する。

```javascript
// ============================================
// セクション名
// ============================================
```

### 使用例

```javascript
// ============================================
// 定数定義
// ============================================
const MAX_RETRY = 3;
const TIMEOUT_MS = 5000;

// ============================================
// 初期化
// ============================================
let _storage = null;
let _cloudSync = null;

export function init(config) {
  _storage = config.storage;
  _cloudSync = config.cloudSync;
}

// ============================================
// 公開API
// ============================================
export function syncData() { ... }
export function getSyncStatus() { ... }

// ============================================
// 内部ヘルパー
// ============================================
function validateConfig(config) { ... }
function formatTimestamp(ts) { ... }
```

---

## JSDoc コメント

### 関数のドキュメント

```javascript
/**
 * 関数の目的を一行で説明
 *
 * 必要に応じて詳細な説明を追加。
 * 特殊な動作や注意点があればここに記述。
 *
 * @param {型} 引数名 - 引数の説明
 * @param {型} [省略可能な引数] - デフォルト値がある場合
 * @returns {型} 戻り値の説明
 * @throws {Error} 例外が発生する条件
 *
 * @example
 * // 使用例（複雑な関数の場合）
 * const result = functionName(arg1, arg2);
 */
function functionName(arg1, arg2) {
  // ...
}
```

### 実践例

```javascript
/**
 * ライブラリエントリを構築
 *
 * クラウドとローカルのライブラリ情報を統合し、
 * 表示用のエントリリストを生成する。
 * 最終更新日時の降順でソートされる。
 *
 * @param {string} uiLanguage - UI言語コード（"ja" | "en"）
 * @returns {Array<LibraryEntry>} ソート済みのライブラリエントリ
 *
 * @typedef {Object} LibraryEntry
 * @property {string} type - "cloud" | "local"
 * @property {string|null} cloudBookId - クラウドID
 * @property {string|null} localBookId - ローカルID
 * @property {string} title - 書籍タイトル
 * @property {number} progressPercentage - 進捗（0-100）
 */
export function buildLibraryEntries(uiLanguage) {
  // ...
}
```

---

## 警告・注意コメント

### 変更禁止の明示

```javascript
// ⚠️ WARNING: この順序を変更してはならない
// 理由: storageの初期化がcloudSyncより先である必要がある
// 参照: docs/refactor/app-js-boundaries.md
const storage = new StorageService();
const cloudSync = new CloudSync({ storage });
```

### 依存関係の明示

```javascript
// ⚠️ DEPENDENCY: この関数は ui.js の elements.modal に依存
// elements.modal が存在しない場合、早期リターンする
function showModal(content) {
  if (!elements.modal) return;
  // ...
}
```

### 暫定実装の明示

```javascript
// TODO: 暫定実装 - APIv2リリース後に修正予定
// 現在はv1のレスポンス形式を前提としている
// 担当: API更新時に合わせて修正
function parseResponse(data) {
  return data.result; // v2では data.payload になる予定
}
```

---

## 参照元情報の付記（CSSおよびJS）

### CSS用（分割時の安全確保）

```css
/* =====================================
[REF]
- HTML: #viewer 内の img 要素に適用
- JS: reader.js で .zoomed クラスを付与
- STATE: 画像ズーム時のみ有効
- LAYER: z-index: 100（モーダルより下）
- SPLIT: GROUP（.viewer-container と同一ファイル必須）
===================================== */
.viewer-image.zoomed {
  transform: scale(2);
  z-index: 100;
}
```

### JS用（関数の依存明示）

```javascript
/**
 * 進捗バーを更新
 *
 * [REF]
 * - DOM: DOM_IDS.PROGRESS_FILL, DOM_IDS.PROGRESS_THUMB
 * - STATE: _state.pageDirection により RTL/LTR が切り替わる
 * - CALLER: app.js の onProgress コールバックから呼び出し
 */
function updateProgressBar(percentage) {
  // ...
}
```

---

## コメントの禁止事項

### 書いてはいけないコメント

```javascript
// ❌ コードをそのまま言い換えただけ
// iを1増やす
i++;

// ❌ 自明な処理の説明
// 配列をループ
for (const item of items) { ... }

// ❌ 古い情報を残したまま
// このAPIは非推奨（2023年に削除予定）← 実際は2024年で未削除
fetch(OLD_API_URL);
```

### 書くべきコメント

```javascript
// ✅ なぜその処理が必要かを説明
// Safari では passive イベントがデフォルトのため、明示的に指定
element.addEventListener("touchmove", handler, { passive: false });

// ✅ 非自明な値の根拠
// 300ms: iOS Safari のダブルタップ判定を避けるための遅延
const TAP_DELAY = 300;

// ✅ エッジケースの説明
// 空配列の場合は早期リターン（後続の reduce が例外を投げるため）
if (items.length === 0) return null;
```

---

## ドキュメントファイルの作成基準

### 作成が必要な場合

| 状況 | 作成するドキュメント |
|------|----------------------|
| 新規モジュール追加 | 機能マップ（`docs/refactor/モジュール名-map.md`） |
| 複雑な初期化順序 | 境界整理（`docs/refactor/初期化名-boundaries.md`） |
| 分割作業の実施 | 分割計画（作業前）+ 完了報告（作業後） |
| API/インターフェース変更 | 変更履歴（CHANGELOG.md または該当ドキュメント） |

### ドキュメントの基本構造

```markdown
# モジュール名 機能マップ

## 目的
このモジュールの責務を説明

## 依存関係
### 注入される依存
| 依存 | 型 | 用途 |
|------|-----|------|

### 参照するモジュール
- xxx.js: yyy関数を使用

### 参照されるモジュール
- zzz.js: このモジュールのaaa関数を呼び出し

## 公開API
| 関数 | 引数 | 戻り値 | 用途 |
|------|------|--------|------|

## 注意事項
- 変更時の注意点
- 既知の制約
```

---

## コメント更新の義務

### コード変更時のルール

1. **関数の動作を変更したら**、JSDocも更新すること
2. **依存関係を変更したら**、[REF]コメントも更新すること
3. **ファイルの責務を変更したら**、ヘッダーコメントも更新すること
4. **TODOを解消したら**、TODOコメントを削除すること

### 整合性チェック

コードとコメントの不整合は、誤った修正を誘発する最大の原因である。
コメントが古い場合は、**コメントを削除する方がまだ安全**である。

---

## 関連ドキュメント

- [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) - コメント必須の原則
- [MODULE_GUIDE.md](./MODULE_GUIDE.md) - JSDoc型定義の詳細
- [REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md) - 分割時の参照元コメント

```

### docs/REFACTOR_GUIDE.md

```markdown
# 分割・リファクタリング安全規則

本ドキュメントは、コードの分割・リファクタリング時に機能を破壊しないための手順と規則を定める。
コード分割は**設計作業ではなく、設計に基づく物理作業**である。

---

## 大原則

> **参照元を調べずにコードを分割してはならない**

コードは見た目以上に複雑な依存関係を持つ。
「動いているコード」を分割する際、以下を破壊しやすい：

- 読み込み順序
- 初期化順序
- 変数のスコープ
- CSS の評価順序（カスケード）

---

## フェーズ定義

分割・リファクタリングは必ず以下のフェーズに従って実施する。

### フェーズ0: 計画立案

**作業内容**: 分割の目的と範囲を明確化

```markdown
## 分割計画書
- 対象: storage.js
- 目的: 肥大化したファイルの責務分離
- 分割後の構成:
  - storage/core.js（永続化IO）
  - storage/library.js（ライブラリ管理）
  - storage/cloud.js（クラウド関連）
  - storage/index.js（再エクスポート）
- 既存APIの互換性: 維持する
```

### フェーズ1: 参照元調査（編集禁止）

**作業内容**: 依存関係の完全な把握

このフェーズでは**一切のコード編集を行わない**。

```bash
# 関数・変数の使用箇所を検索
grep -rn "functionName" src/ assets/

# インポート元を検索
grep -rn "from.*storage" src/ assets/

# クラス名・IDの使用箇所を検索
grep -rn "className\|#elementId" src/ assets/ *.html
```

**成果物**: 参照元マップ（どこから何が参照されているか）

### フェーズ2: 参照元情報の付記

**作業内容**: 調査結果をコメントとして記録

```javascript
/**
 * [REF] 参照元情報
 * - CALLER: app.js L123, sync-logic.js L456
 * - IMPORT: renderers.js, ui.js
 * - DEPENDS: _storage（init で注入）
 * - SPLIT: GROUP（core.js と同一ファイル必須）
 */
export function saveProgress(bookId, progress) {
  // ...
}
```

### フェーズ3: 分割計画の確定

**作業内容**: 具体的なファイル構成と移動計画

```markdown
## 移動計画

### storage/core.js へ移動
- constructor()
- load()
- save()
- exportData()
- importData()

### storage/library.js へ移動
- upsertBook()
- addBookmark()
- getBookmarks()
- removeBookmark()

### 移動順序
1. core.js を作成（他に依存されない関数から）
2. library.js を作成
3. index.js で再エクスポート
4. 既存の storage.js を削除
```

### フェーズ4: 物理分割（内容変更禁止）

**作業内容**: コードの移動のみ

**絶対禁止事項**:
- 関数名・変数名の変更
- ロジックの修正・改善
- フォーマットの変更
- 「ついでに」の修正

```javascript
// ✅ 正しい分割: 完全なコピー
// storage/core.js
export function load() {
  // 元のコードをそのままコピー
}

// ❌ 間違った分割: 変更を加えている
// storage/core.js
export function load() {
  // ここでリファクタリングしよう ← 禁止
}
```

### フェーズ5: インポートパスの更新

**作業内容**: 参照元のインポート文を更新

```javascript
// Before
import { saveProgress } from "./storage.js";

// After（バレルファイル経由の場合）
import { saveProgress } from "./storage/index.js";
// または
import { saveProgress } from "./storage.js"; // バレルファイルに同名維持
```

### フェーズ6: 検証

**作業内容**: 動作確認

- [ ] アプリケーションが起動するか
- [ ] 主要機能が動作するか
- [ ] コンソールにエラーが出ていないか
- [ ] 初期化順序が維持されているか

---

## CSS分割の特別規則

CSSは評価順序に強く依存するため、追加の規則が適用される。

### 参照元の種類（CSS固有）

| 区分 | 内容 | 例 |
|------|------|-----|
| HTML構造 | 静的DOMの構造・順序 | 親子・兄弟関係 |
| JS（状態） | class/attributeの付与・除去 | `.visible`, `body.xxx` |
| JS（変数） | CSS変数の操作 | `style.setProperty()` |
| CSS内部 | 上書き・モード・メディア | theme, @media |
| LAYER | z-index・重なり制御 | モーダル > コンテンツ |

### CSS参照元コメントの形式

```css
/* =====================================
[REF]
- HTML: #viewer 内の子要素に適用
- JS: ui.js で classList.add("active") 
- STATE: body.dark-theme 時に色が変化
- LAYER: z-index: 50（ヘッダーより上、モーダルより下）
- SPLIT: LAST（テーマ上書きのため最後に読み込み必須）
===================================== */
```

### SPLIT区分

| 区分 | 意味 | 扱い |
|------|------|------|
| SAFE | 単独ファイル化しても安全 | 自由に移動可 |
| GROUP | 特定ブロックと同一ファイル必須 | まとめて移動 |
| LAST | 必ず最後に評価される必要あり | 読み込み順を維持 |

### CSS分割の絶対条件

1. **セレクタを変更してはならない**
2. **プロパティ値を変更してはならない**
3. **元の出現順序を維持しなければならない**
4. **`!important` を追加・削除してはならない**

詳細は [CSS_GUIDE.md](./CSS_GUIDE.md) を参照。

---

## 危険な操作とその対策

### 危険度: 高

| 操作 | リスク | 対策 |
|------|--------|------|
| 初期化関数の移動 | 初期化順序の破壊 | 呼び出し元を全て確認、順序をドキュメント化 |
| グローバル変数の分割 | 参照切れ | 全使用箇所を洗い出し、一括で移行 |
| CSSの順序変更 | スタイル崩れ | 順序を絶対に変えない、SPLIT区分を確認 |

### 危険度: 中

| 操作 | リスク | 対策 |
|------|--------|------|
| 関数名の変更 | 呼び出し元の漏れ | 全ファイル検索、一括置換 |
| ファイル名の変更 | インポートパスの不整合 | 全インポート文を検索・更新 |
| デフォルト値の変更 | 暗黙の依存の破壊 | 呼び出し元の引数を確認 |

### 危険度: 低

| 操作 | リスク | 対策 |
|------|--------|------|
| コメントの追加 | なし | - |
| 内部変数名の変更 | スコープ内なら低い | 関数内で完結していることを確認 |

---

## 分割作業のチェックリスト

### 作業前

- [ ] 分割の目的を明文化したか
- [ ] 参照元調査を完了したか
- [ ] 参照元コメントを付記したか
- [ ] 分割計画書を作成したか
- [ ] 既存APIの互換性方針を決めたか

### 作業中

- [ ] コードの内容を変更していないか（移動のみ）
- [ ] 順序を変更していないか
- [ ] 「ついでに」の修正をしていないか

### 作業後

- [ ] アプリケーションが起動するか
- [ ] 主要機能が動作するか
- [ ] コンソールにエラーがないか
- [ ] 新規ファイルがバレルからエクスポートされているか
- [ ] ドキュメント（機能マップ等）を更新したか

---

## 分割後のドキュメント更新

分割完了後、以下のドキュメントを更新すること。

### 機能マップの更新/作成

```markdown
# storage/ 機能マップ（分割後）

## ファイル構成
- core.js: 永続化IO
- library.js: ライブラリCRUD
- cloud.js: クラウド連携
- index.js: 再エクスポート

## 依存関係
core.js ← library.js, cloud.js
         ↑
      index.js（公開）
```

### 変更履歴の記録

```markdown
## 2024-XX-XX storage.js 分割

### 変更内容
- storage.js を storage/ ディレクトリに分割
- 既存のインポートパスは index.js により互換性維持

### 影響範囲
- なし（APIは維持）

### 確認事項
- [x] 全機能の動作確認完了
```

---

## 中断・ロールバック手順

### 中断する場合

1. 作業中のファイルを一旦保存
2. 現在の状態をコミット（WIP: 作業中断）
3. 問題点を記録
4. ユーザーに報告

### ロールバックする場合

1. Git で変更前の状態に戻す
2. 何が問題だったかを記録
3. 計画を見直してから再開

```bash
# 直前のコミットに戻す
git checkout HEAD -- path/to/file

# 特定のコミットに戻す
git checkout <commit-hash> -- path/to/file
```

---

## 関連ドキュメント

- [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) - 基本原則
- [MODULE_GUIDE.md](./MODULE_GUIDE.md) - モジュール設計
- [COMMENT_GUIDE.md](./COMMENT_GUIDE.md) - 参照元コメントの書式
- [CSS_GUIDE.md](./CSS_GUIDE.md) - CSS分割の詳細規則

```

### docs/CSS_GUIDE.md

```markdown
# CSS分割・改修ガイド

本ドキュメントは、CSSの分割・整理・改修において**デザイン崩れや挙動変更を防ぐ**ための規則を定める。

---

## 基本思想

- CSSは**宣言順・構造・状態**に依存する
- 見た目が同じでも、CSSの評価条件が変わると挙動は破壊される
- CSS分割は「設計作業」ではなく、**設計に基づく物理作業**である

> **参照元を調べずにCSSを分割してはならない**

---

## 参照元の種類

CSSの「参照元」は単にHTML内のclass/idではない。以下のレイヤーに分散している。

| 区分 | 内容 | 代表例 |
|------|------|--------|
| HTML構造 | 静的DOMの構造・順序 | 親子・兄弟・隣接関係 |
| JS（状態） | class/attributeの付与・除去 | `.visible`, `body.xxx` |
| JS（変数） | CSS変数の操作 | `style.setProperty('--var')` |
| JS（生成） | DOMの動的生成 | `innerHTML`, `createElement` |
| 外部DOM | iframe・外部スクリプト | OAuth、埋め込み |
| CSS内部 | 上書き・モード・メディア | theme, state, @media |

**CSSは単独では完結しない**ことを常に前提とする。

---

## 参照元情報の付記形式

各スタイルブロックの直前に、参照元情報をコメントとして付記する。

```css
/* =====================================
[REF]
- HTML: 親子/兄弟/順序依存の有無
- JS: class操作/変数操作/DOM生成
- STATE: 状態クラス・モード依存
- LAYER: z-index・重なり制御
- SPLIT: SAFE | GROUP | LAST
===================================== */
.example-class {
  /* ... */
}
```

### 各項目の意味

| 項目 | 内容 |
|------|------|
| HTML | 静的要素か、DOM構造への依存有無 |
| JS | classList操作、CSS変数操作、動的生成への依存 |
| STATE | 状態クラス（表示/非表示/モード）、body直下クラスの影響 |
| LAYER | z-index管理、overlay/modal/menuとの前後関係 |
| SPLIT | `SAFE`=単独ファイル化可、`GROUP`=同一ファイル必須、`LAST`=後段評価必須 |

---

## 絶対禁止事項

以下を行った場合、**作業失敗とみなす**。

### 内容変更の禁止

- セレクタの変更・整理・統合
- プロパティ/値の変更（数値・単位・色含む）
- CSS変数の追加・削除・改名・集約
- 未使用判断による削除
- `@keyframes` の整理・統合
- `!important` の追加・削除
- 自動フォーマットの適用

### 順序変更の禁止

- CSSは**元の出現順を100%保持**すること
- 分割後も**同じ順序で評価される**ことを保証すること
- 状態上書き・モードCSSは必ず後段に配置すること

---

## 分割作業のフェーズ

### フェーズ1: 参照元調査（編集禁止）

- CSS編集禁止
- 参照元コメント付記のみ

```bash
# class操作の検索
grep -rn "classList" src/ assets/

# CSS変数操作の検索
grep -rn "setProperty\|getPropertyValue" src/ assets/

# 動的DOM生成の検索
grep -rn "innerHTML\|createElement" src/ assets/
```

### フェーズ2: 分割計画

- SPLIT区分に基づきファイル構成を決定
- 読み込み順を確定

```markdown
## 分割計画
1. base.css（リセット、基本要素）
2. layout.css（レイアウト構造）
3. components.css（UIコンポーネント）
4. state.css（状態上書き）← 必ず最後
```

### フェーズ3: 物理分割

- **内容変更なし**
- **順序維持**
- コピー&ペースト作業のみ

### フェーズ4: 検証

- 状態遷移の確認
- 重なり（z-index）の確認
- モード切替（テーマ等）の確認
- レスポンシブの確認

---

## 分割時のチェックリスト

### 作業前

- [ ] 参照元調査を完了したか
- [ ] 全スタイルブロックに[REF]コメントを付記したか
- [ ] 分割計画を文書化したか
- [ ] 読み込み順序を確定したか

### 作業中

- [ ] セレクタを変更していないか
- [ ] プロパティ値を変更していないか
- [ ] 出現順序を維持しているか
- [ ] 「ついでに」の最適化をしていないか

### 作業後

- [ ] 全状態でデザインが維持されているか
- [ ] z-indexの重なりが正しいか
- [ ] テーマ切替が動作するか
- [ ] レスポンシブが維持されているか

---

## 危険なパターンと対策

### モード・状態の上書きCSS

```css
/* 危険: 順序を変えると上書きが効かなくなる */
.button { background: blue; }
.button.active { background: red; }  /* 必ず後に配置 */
```

**対策**: SPLIT=LAST を付記し、分割時も順序を維持

### z-indexの階層

```css
/* 危険: z-indexは相対的な順序が重要 */
.header { z-index: 100; }
.modal { z-index: 200; }
.tooltip { z-index: 300; }
```

**対策**: LAYER情報を[REF]に明記し、関連するz-indexを同一ファイルに維持

### メディアクエリの位置

```css
/* 危険: メディアクエリは対象ルールより後に配置が必要 */
.container { width: 100%; }
@media (min-width: 768px) {
  .container { width: 750px; }
}
```

**対策**: メディアクエリを分離する場合、読み込み順序を必ず後にする

---

## AIへの注意事項

- CSSが巨大であるほど、参照元調査の価値は高い
- **「理由」が明示されていないとAIは最適化を行う傾向がある**
- 本ガイドは**AIの暴走を防ぐための設計書**として機能する

分割・整理で失敗する原因の大半は：

> 「どこで、なぜ、そのCSSが効いているか」を把握せずに触ること

参照元調査と条件定義を先に行えば、分割は安全な事務作業になる。

---

## 関連ドキュメント

- [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) - 基本原則
- [REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md) - 分割・リファクタリング全般
- [COMMENT_GUIDE.md](./COMMENT_GUIDE.md) - コメント規約

```

