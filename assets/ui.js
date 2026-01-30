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

      // 画像書庫かつ見開きモードの場合、U3/B3で1ページ移動
      if (this.isImageBook?.() && this.isSpreadMode?.()) {
        const direction = this.getReadingDirection();
        if (area === INTERACTION_AREA_CODES.SPREAD_ADJUST.PREV_SINGLE) {
          console.log('Spread adjustment: Prev 1 page');
          // U3 (上中央) -> 1ページ戻る
          if (direction === READING_DIRECTIONS.RTL) {
            this.onPageNext?.(1); // RTLの「戻る」は物理的に左(Index増) = next()
          } else {
            this.onPagePrev?.(1); // LTRの「戻る」は物理的に左(Index減) = prev()
          }
          return;
        } else if (area === INTERACTION_AREA_CODES.SPREAD_ADJUST.NEXT_SINGLE) {
          console.log('Spread adjustment: Next 1 page');
          // B3 (下中央) -> 1ページ進む
          if (direction === READING_DIRECTIONS.RTL) {
            this.onPagePrev?.(1); // RTLの「進む」は物理的に右(Index減) = prev()
          } else {
            this.onPageNext?.(1); // LTRの「進む」は物理的に右(Index増) = next()
          }
          return;
        }
      }
      return;
    }

    // 横書き
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

    // オーバーレイを再度有効化
    if (overlay) {
      overlay.style.pointerEvents = 'all';
      console.log('Re-enabled overlay pointer events');
    }

    this.onLeftMenu?.('hide');
    this.onProgressBar?.('hide');
    this.onBookmarkMenu?.('hide');
  }

  /**
   * 進捗表示を更新
   */
  updateProgress(current, total) {
    // 数値型に強制変換（オブジェクトが渡された場合の対策）
    const currentIndex = (typeof current === 'object' && current !== null) ? (current.index ?? current.pageIndex ?? 0) : Number(current || 0);
    const totalCount = (typeof total === 'object' && total !== null) ? (total.length ?? total.totalPages ?? 0) : Number(total || 0);

    // 1. ページ番号表示更新
    const currentInput = getById(DOM_IDS.CURRENT_PAGE_INPUT);
    const totalSpan = getById(DOM_IDS.TOTAL_PAGES);

    if (currentInput) currentInput.value = (isNaN(currentIndex) ? 0 : currentIndex) + 1; // 1-based

    // totalPages が undefined の場合や 0 の場合のガード
    const validTotal = (typeof totalCount === 'number' && totalCount > 0) ? totalCount : 0;
    if (totalSpan) totalSpan.textContent = isNaN(validTotal) ? 0 : validTotal;

    // 2. プログレスバー更新
    let percentage = 0;
    if (validTotal > 1) {
      percentage = (Math.min(currentIndex, validTotal - 1) / (validTotal - 1)) * 100;
    } else if (validTotal === 1) {
      percentage = 100;
    }

    if (isNaN(percentage)) percentage = 0;

    const fill = getById(DOM_IDS.PROGRESS_FILL);
    const thumb = getById(DOM_IDS.PROGRESS_THUMB);

    // RTL時は、CSS側（transform: scaleX(-1)）で反転させるため、
    // ここで反転させると二重反転になる可能性がある。
    // しかし、数値表示（floatPercent）などは反転させない。

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
