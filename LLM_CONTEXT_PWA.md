# LLM向け PWA・コンテキスト 

本ドキュメントは **NotebookLM・外部LLM** がリポジトリを横断解析するための**単一ソース**です。
前半に要約、後半に**現行アプリの全ソース全文**を含みます。

## 結合に含まれるファイル一覧
- `manifest.json`
- `sw.js`
- `index.html`
- `assets/sw-cache-config.json`
- `assets/constants.js`
- `assets/config.js`
- `assets/constants/pwa.js`
- `assets/constants/app-info.js`
- `assets/constants/runtime-config.js`
- `assets/app.js`
- `assets/ui.js`
- `assets/storage.js`
- `docs/CORE_PRINCIPLES.md`
- `FULLSCREEN_REPAGINATION_DEBUG.md`

## 後半: 全ソースコード
以下、各ファイルは `### 相対パス` の見出しの直後にコードブロックで**全文**を記載する。

---


> [!NOTE]
> このファイルはPWAおよび画面制御（リサイズ/全画面）に関連するコードのみを抽出した軽量版です。

---

### manifest.json

```json
{
    "id": "/",
    "name": "BookReader",
    "short_name": "BookReader",
    "description": "ブラウザで動く軽量なEPUB/画像書庫リーダー",
    "lang": "ja",
    "categories": [
        "books",
        "utilities"
    ],
    "start_url": "./index.html",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#ffffff",
    "theme_color": "#2c3e50",
    "icons": [
        {
            "src": "assets/icon_BookReader_192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any maskable"
        },
        {
            "src": "assets/icon_BookReader_512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any maskable"
        }
    ]
}
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

### index.html

```html
<!doctype html>
<html lang="ja">

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
      <div class="image-viewer-loader"></div>
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

  <!-- ファイル選択（非表示） accept属性はWindowsでフリーズを引き起こすため設定しない -->
  <input type="file" id="fileInput" class="file-input-hidden" />

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
        <button id="share-log-btn" type="button"></button>
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

### assets/sw-cache-config.json

```json
{
  "cacheName": "bookreader-v8",
  "assets": [
    "./",
    "./index.html",
    "./manifest.json",
    "./assets/sw-cache-config.json",
    "./assets/css/01-tokens.css",
    "./assets/css/02-reset.css",
    "./assets/css/03-base.css",
    "./assets/css/04-reader.css",
    "./assets/css/05-float-ui.css",
    "./assets/css/06-reader-extras.css",
    "./assets/css/07-menu.css",
    "./assets/css/08-progress.css",
    "./assets/css/09-bookmark.css",
    "./assets/css/10-modal.css",
    "./assets/css/11-library.css",
    "./assets/css/12-history.css",
    "./assets/css/13-search.css",
    "./assets/css/14-settings.css",
    "./assets/css/15-responsive.css",
    "./assets/css/16-candidate.css",
    "./assets/css/17-loading.css",
    "./assets/css/18-float-lang.css",
    "./assets/css/19-zoom.css",
    "./assets/login.css",
    "./assets/app.js",
    "./assets/constants.js",
    "./assets/i18n.js",
    "./assets/i18n/index.js",
    "./assets/i18n/ja.js",
    "./assets/i18n/en.js",
    "./assets/config.js",
    "./assets/ui.js",
    "./assets/reader.js",
    "./assets/storage.js",
    "./assets/auth.js",
    "./assets/cloudSync.js",
    "./assets/fileStore.js",
    "./assets/firebaseConfig.js",
    "./assets/onedriveAuth.js",
    "./assets/bookreader.png",
    "./assets/BookReader_Titlle.png",
    "./assets/menu-title.svg",
    "./assets/Flag_Japan.svg",
    "./assets/Flag_America.svg",
    "./assets/icon_BookReader_192.png",
    "./assets/icon_BookReader_512.png",
    "./assets/vendor/jszip.min.js",
    "./assets/vendor/unrar.js",
    "./assets/vendor/unrar.wasm",
    "./assets/animations/loader_book.json",
    "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js",
    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js",
    "https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js",
    "https://esm.sh/node-unrar-js@2.0.2",
    "https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/dist/js/unrar.wasm",
    "https://cdn.jsdelivr.net/npm/@zip.js/zip.js/dist/zip.min.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  ]
}

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

### assets/constants/pwa.js

```javascript
// ============================================
// PWA / Service Worker 設定
// ============================================
export const PWA_CONFIG = Object.freeze({
  CACHE_NAME: "bookreader-v8",
  THEME_COLOR: "#2c3e50",
  BACKGROUND_COLOR: "#ffffff",
});

// ============================================
// Service Worker キャッシュ対象アセット
// ============================================
export const SW_CACHE_ASSETS = Object.freeze([
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/sw-cache-config.json",
  "./assets/css/01-tokens.css",
  "./assets/css/02-reset.css",
  "./assets/css/03-base.css",
  "./assets/css/04-reader.css",
  "./assets/css/05-float-ui.css",
  "./assets/css/06-reader-extras.css",
  "./assets/css/07-menu.css",
  "./assets/css/08-progress.css",
  "./assets/css/09-bookmark.css",
  "./assets/css/10-modal.css",
  "./assets/css/11-library.css",
  "./assets/css/12-history.css",
  "./assets/css/13-search.css",
  "./assets/css/14-settings.css",
  "./assets/css/15-responsive.css",
  "./assets/css/16-candidate.css",
  "./assets/css/17-loading.css",
  "./assets/css/18-float-lang.css",
  "./assets/css/19-zoom.css",
  "./assets/login.css",
  "./assets/app.js",
  "./assets/constants.js",
  "./assets/i18n.js",
  "./assets/i18n/index.js",
  "./assets/i18n/ja.js",
  "./assets/i18n/en.js",
  "./assets/config.js",
  "./assets/ui.js",
  "./assets/reader.js",
  "./assets/storage.js",
  "./assets/auth.js",
  "./assets/cloudSync.js",
  "./assets/fileStore.js",
  "./assets/firebaseConfig.js",
  "./assets/onedriveAuth.js",
  "./assets/bookreader.png",
  "./assets/BookReader_Titlle.png",
  "./assets/menu-title.svg",
  "./assets/Flag_Japan.svg",
  "./assets/Flag_America.svg",
  "./assets/icon_BookReader_192.png",
  "./assets/icon_BookReader_512.png",
  "./assets/vendor/jszip.min.js",
  "./assets/vendor/unrar.js",
  "./assets/vendor/unrar.wasm",
  "./assets/animations/loader_book.json",
]);

```

### assets/constants/app-info.js

```javascript
/**
 * アプリケーション情報 (SSOT)
 */
export const APP_INFO = Object.freeze({
  NAME: "BookReader",
  SHORT_NAME: "BookReader",
  DESCRIPTION: "ブラウザで動く軽量なEPUB/画像リーダー",
  VERSION: "1.0.0",
  DOCUMENT_TITLE: "Epub Reader",
});

```

### assets/constants/runtime-config.js

```javascript
/**
 * 実行時/ビルド時のランタイム設定 (SSOT)
 *
 * - ビルド時: ここで定義したデフォルト値を使用します。
 * - 実行時: window.APP_CONFIG などで注入された値で上書きします。
 *   例) index.html やサーバー側テンプレートで
 *       window.APP_CONFIG = {
 *         firebase: {...},
 *         googleAuth: {...},
 *         workers: {...}
 *       };
 *   例) assets/config.js から window.APP_CONFIG に注入
 */
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyD2xMk1bbez1Y2crBcgzxUhghU9bFnU1gI",
  authDomain: "bookreader-1d3a3.firebaseapp.com",
  projectId: "bookreader-1d3a3",
  storageBucket: "bookreader-1d3a3.firebasestorage.app",
  messagingSenderId: "920141070828",
  appId: "1:920141070828:web:619c658ec726be091c00c9",
  measurementId: "G-V68746259D",
});

export const WORKERS_CONFIG = Object.freeze({
  SYNC_ENDPOINT: "https://bookreader-dev.taka-hiyo.workers.dev",
});

export const GOOGLE_AUTH_CONFIG = Object.freeze({
  CLIENT_ID:
    "672654349618-h1252pqs19d076dkf3uteme7upau16kp.apps.googleusercontent.com",
});

export const UA_KEYWORDS = Object.freeze({
    QUEST_3: 'Quest 3',
    OCULUS: 'OculusBrowser',
    VR: 'VR',
    MOBILE: 'Mobile'
});

/**
 * Quest 3 環境であるかを判定する
 * @returns {boolean}
 */
export const isQuest3 = () => {
    const ua = navigator.userAgent;
    return ua.includes(UA_KEYWORDS.OCULUS) && ua.includes(UA_KEYWORDS.QUEST_3);
};

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
import { calculateProgressPercentage, normalizePageIndex, roundProgressPercentage, generateShareText } from "./js/core/progress-utils.js";
import * as syncLogic from "./js/core/sync-logic.js";
import { filePicker } from "./js/core/index.js";
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
  SHARE_MARKDOWN_TEMPLATE,
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
let isSyncResolving = false;
let pendingCloudBookId = null;
let deferredPrompt = null;

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

// UI_STRINGS は i18n.js からインポート済み


// 初期化実行（非同期Lottie読み込み対応）
document.addEventListener('DOMContentLoaded', async () => {
  await initLoadingAnimation();
  
  // Quest 3 Horizon OS対策: PWA実行時にウィンドウサイズを強制し、システムによる縦固定バグをバイパスする
  if (window.matchMedia('(display-mode: standalone)').matches) {
    try {
      window.resizeTo(1920, 1080);
    } catch (e) {
      console.warn("[app] OS Resize Blocked", e);
    }
  }

  // ズームスライダーの初期化をDOM準備後に行う
  if (reader && typeof reader.setupZoomSlider === 'function') {
    reader.setupZoomSlider();
  }
});


function t(key) {
  return translate(key, uiLanguage);
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

// ファイルピッカーの初期化
filePicker.init({
  UI_CONSTANTS: { DOM_IDS, DOM_SELECTORS }
});

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
// UI ヘルパー
// ========================================

/**
 * プレミアムアイコン（画像）を取得
 */
const getPremiumIcon = (path, size = 20) => {
  const img = document.createElement("img");
  img.src = path;
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  img.style.verticalAlign = "middle";
  img.style.objectFit = "contain";
  return img;
};

/**
 * 2枚1組のプレミアムアイコン（画像）をクロップして取得
 */
const getPremiumIconCropped = (path, isRight, size = 20) => {
  const container = document.createElement("div");
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;
  container.style.overflow = "hidden";
  container.style.display = "inline-flex";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";
  container.style.verticalAlign = "middle";

  const img = document.createElement("img");
  img.src = path;
  img.style.width = `${size * 2}px`;
  img.style.height = `${size}px`;
  img.style.maxWidth = "none";
  img.style.objectFit = "cover";
  img.style.objectPosition = isRight ? "right" : "left";

  container.appendChild(img);
  return container;
};

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
  if (!currentBookId || isBookLoading || isSyncResolving) return;

  // リーダーが未初期化（ページ分割前）の場合は保存をスキップして位置の上書きを防ぐ
  if (getCurrentTotalPages() <= 0) return;

  let progressData = null;

/**
 * 読書録を共有する
 */
async function handleShareReadingLog() {
  if (!currentBookId || !currentBookInfo) {
    console.warn("[share] No book loaded");
    return;
  }

  try {
    const progress = storage.getProgress(currentBookId) || {};
    const shareText = generateShareText({
      title: currentBookInfo.title,
      percentage: progress.percentage || 0
    }, SHARE_MARKDOWN_TEMPLATE);

    if (navigator.share) {
      await navigator.share({
        title: currentBookInfo.title,
        text: shareText
      });
      console.log("[share] Shared successfully");
    } else {
      // フォールバック: クリップボード
      await navigator.clipboard.writeText(shareText);
      alert(t("share_success_clipboard"));
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("[share] Share cancelled by user");
    } else {
      console.error("[share] Error sharing:", error);
      alert(t("error_generic"));
    }
  }
}

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
  
  // プレミアムアイコン
  const iconElement = getPremiumIconCropped(PREMIUM_ICONS.FULLSCREEN_ENTER, isFullscreen, 24);
  elements.toggleFullscreen.replaceChildren(iconElement);
  
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

async function handleFile(file, overrideBookId = null) {
  clearArchiveWarnings();
  await pushCurrentBookSyncOnAction();
  showLoading();
  userOverrodeDirection = false;
  isSyncResolving = true; // ロック開始
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
      alert(translate('errorFileLoadFailed', uiLanguage));
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

    // Quest 3 OSバグ（リサイズハンドル消失）対策: 1GB超の場合はDistant Modeへの変更を促す
    if (isArchiveBook && file.size > 1024 * 1024 * 1024) {
      const isQuest = /Quest|Oculus/i.test(navigator.userAgent);
      if (isQuest) {
        alert(translate('largeFileDistantMode', uiLanguage));
      }
    }

    // 巨大RAR警告: モバイル等で巨大なRAR(非ストリーミング)は展開不能な可能性がある
    if (type === BOOK_TYPES.RAR && file.size > 500 * 1024 * 1024) {
      const env = fileHandler.detectEnvironment();
      if (env.isLowEnd || /Android|iPhone|iPad/i.test(navigator.userAgent)) {
         console.warn("[RarHandler] Large RAR on mobile detected.");
         // 重要：RARは現状ストリーミング非対応のため500MB超は非常に不安定
      }
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

    // スタブ再選択時は overrideBookId を優先
    if (overrideBookId && id !== overrideBookId) {
      console.log(`[handleFile] Forcing id from ${id} to ${overrideBookId} due to stub reselect`);
      id = overrideBookId;
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
    isSyncResolving = false; // ジャンプ完了後にロック解除
  } catch (error) {
    isSyncResolving = false; // エラー時もロック解除
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
    if (iconSpan) {
      const iconMap = {
        [UI_ICONS.MENU_OPEN]: PREMIUM_ICONS.OPEN,
        [UI_ICONS.MENU_LIBRARY]: PREMIUM_ICONS.LIBRARY,
        [UI_ICONS.MENU_SEARCH]: PREMIUM_ICONS.SEARCH,
        [UI_ICONS.MENU_BOOKMARKS]: PREMIUM_ICONS.BOOKMARKS,
        [UI_ICONS.MENU_HISTORY]: PREMIUM_ICONS.BOOKMARKS, // 代用
        [UI_ICONS.SETTINGS]: PREMIUM_ICONS.SETTINGS,
      };
      const premiumPath = iconMap[icon];
      if (premiumPath) {
        iconSpan.replaceChildren(getPremiumIcon(premiumPath, 24));
      } else {
        iconSpan.textContent = icon;
      }
    }
    const label = button?.querySelector(DOM_SELECTORS.MENU_LABEL);
    if (label) label.textContent = text;
  };
  const setIconOnly = (button, icon) => {
    if (!button) return;
    button.textContent = icon;
  };
  const setFloatLabel = (button, icon, text) => {
    if (!button) return;
    const iconMap = {
      [UI_ICONS.MENU_OPEN]: PREMIUM_ICONS.OPEN,
      [UI_ICONS.MENU_LIBRARY]: PREMIUM_ICONS.LIBRARY,
      [UI_ICONS.MENU_SEARCH]: PREMIUM_ICONS.SEARCH,
      [UI_ICONS.MENU_BOOKMARKS]: PREMIUM_ICONS.BOOKMARKS,
      [UI_ICONS.MENU_HISTORY]: PREMIUM_ICONS.BOOKMARKS, // 代用
      [UI_ICONS.SETTINGS]: PREMIUM_ICONS.SETTINGS,
    };
    const premiumPath = iconMap[icon];
    if (premiumPath) {
      const img = getPremiumIcon(premiumPath, 20);
      const label = document.createTextNode(` ${text}`);
      button.replaceChildren(img, label);
    } else {
      button.textContent = `${icon} ${text}`;
    }
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
    elements.floatSettings.replaceChildren(getPremiumIcon(PREMIUM_ICONS.SETTINGS, 24));
    elements.floatSettings.setAttribute("aria-label", strings.menuSettings);
  }
  if (elements.openLangMenu) {
    elements.openLangMenu.replaceChildren(getPremiumIcon(PREMIUM_ICONS.LANGUAGE, 24));
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
  if (elements.settingsAccountTitle) elements.settingsAccountTitle.textContent = strings.settingsAccountTitle;
  if (elements.googleLoginButton) elements.googleLoginButton.textContent = strings.googleLoginLabel;
  if (elements.manualSyncButton) elements.manualSyncButton.textContent = strings.syncNowButton;
  if (elements.syncHint) elements.syncHint.textContent = strings.syncHint;
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

// [REF] logic to be moved to file-picker.js:openFilePicker
// (ensureLegacyFileInput and previous openFileDialog implementation were moved to file-picker.js)
async function openFileDialog() {
  console.log('[openFileDialog] called');
  
  // filePickerモジュールへの委譲
  const files = await filePicker.openFilePicker();
  
  if (files && files.length > 0) {
    const file = files[0];
    console.log('[openFileDialog] file selected via filePicker:', file?.name, file?.type, file?.size);
    handleFile(file);
  } else {
    console.log('[openFileDialog] file selection cancelled or no file selected');
    pendingCloudBookId = null;
  }
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

  // 読書録共有ボタン
  elements.shareLogButton?.addEventListener('click', handleShareReadingLog);

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

### FULLSCREEN_REPAGINATION_DEBUG.md

```markdown
# 全画面切替時のリペジネーション修正 - トラブルシューティング記録

## 問題
全画面（Fullscreen API）切替時にEPUBの文章量再計算（リペジネーション）が失敗する。

## 試行 1: fullscreenchange で debouncedResizeHandler() を呼ぶ (commit 330a5f0)

### 変更内容
```javascript
document.addEventListener('fullscreenchange', () => {
  updateFullscreenButtonLabel();
  debouncedResizeHandler();
});
```

### 結果: 失敗 — PaginationCancelledError

### 原因分析
`fullscreenchange` はビューポート変更**前**に発火する。そのため:

1. T=0ms: `fullscreenchange` 発火 → `debouncedResizeHandler()` 呼び出し（タイマー開始）
2. T=0+ε: `window.resize` 発火 → `ui.js` デバウンス開始 (250ms)
3. T=250ms: debouncedResizeHandler タイマー発火 → `handleResize(requestId=1)` 開始
4. T=250+ε: ui.js デバウンス発火 → `onResize` → `debouncedResizeHandler()` 再呼び出し（タイマーリセット）
5. T=500ms: debouncedResizeHandler タイマー発火 → `handleResize(requestId=2)` 開始 → requestId=1 をキャンセル

2重トリガーにより、先のリペジネーションが必ずキャンセルされる。

### コンソール証跡
```
// Enter fullscreen:
app.js:495 [onResize] handleResize (debounced 250ms)              ← fullscreenchange経由
reader.js:399 handleResize: リペジネーション開始 (requestId=1)
ui.js:79 Window resized: 2005x1440                                 ← window.resize発火
app.js:495 [onResize] handleResize (debounced 250ms)               ← window.resize経由
reader.js:399 handleResize: リペジネーション開始 (requestId=2)       ← requestId=1キャンセル
reader.js:444 handleResize: リペジネーション失敗 PaginationCancelledError

// Exit fullscreen:
app.js:495 [onResize] handleResize (debounced 250ms)
reader.js:399 handleResize: リペジネーション開始 (requestId=3)       ← requestId=2キャンセル
reader.js:444 handleResize: リペジネーション失敗 PaginationCancelledError
ui.js:79 Window resized: 713x578
app.js:495 [onResize] handleResize (debounced 250ms)
reader.js:399 handleResize: リペジネーション開始 (requestId=4)       ← requestId=3キャンセル
reader.js:444 handleResize: リペジネーション失敗 PaginationCancelledError
```

### 調査結果
- [x] `updateEpubTheme` は `repaginate()` を呼ばない（CSS適用のみ）
- [x] `EpubPaginator.runPagination()` が前の実行を `cancelled=true` でキャンセルする仕組み
- [x] `fullscreenchange` からの呼び出しは有害（`window.resize`と2重トリガーになる）
- [x] 解決策: `fullscreenchange`では`window.resize`未発火時のみフォールバック

---

## 試行 2: requestAnimationFrame + resize未発火フォールバック

### 変更内容
```javascript
let prevInnerWidth = window.innerWidth;
let prevInnerHeight = window.innerHeight;
document.addEventListener('fullscreenchange', () => {
  updateFullscreenButtonLabel();
  requestAnimationFrame(() => {
    const widthChanged = window.innerWidth !== prevInnerWidth;
    const heightChanged = window.innerHeight !== prevInnerHeight;
    prevInnerWidth = window.innerWidth;
    prevInnerHeight = window.innerHeight;
    if (widthChanged || heightChanged) {
      return; // window.resize が発火するはず → そちらに任せる
    }
    debouncedResizeHandler(); // resize 未発火時のフォールバック
  });
});
```

### 方針
- `window.resize` が発火する（ビューポートサイズ変更あり）場合: 既存の ui.js → onResize → debouncedResizeHandler パスに任せる
- `window.resize` が発火しない場合のみ: フォールバックとして debouncedResizeHandler を呼ぶ
- `requestAnimationFrame` でビューポート変更確定後にチェック

### 結果: (テスト待ち)

---

```

