// UI制御モジュール：エリア判定、メニュー表示、進捗バー等

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
 * 縦書き時ページ移動: M2(前), M4(次) + 横スワイプ
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
    this.isBookOpen = options.isBookOpen || (() => false);
    this.isPageNavigationEnabled = options.isPageNavigationEnabled || (() => false);
    this.isProgressBarAvailable = options.isProgressBarAvailable || (() => false);
    this.getWritingMode = options.getWritingMode || (() => "horizontal");
    this.isFloatVisible = options.isFloatVisible || (() => false);
    this.isImageBook = options.isImageBook || (() => false);
    this.isSpreadMode = options.isSpreadMode || (() => false);

    this.leftMenuVisible = false;
    this.progressBarVisible = false;
    this.progressBarPinned = false;
    this.bookmarkMenuVisible = false;
    this.touchStartX = null;
    this.touchStartY = null;

    this.gridOverlay = null;
    this.longPressTimer = null;

    this.setupClickHandler();
    this.setupTouchHandlers();
    this.setupResizeHandler();
    this.createGridOverlay();
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
      }, 250);
    });
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
    if (yPercent > 90) {
      console.log('Progress bar area - ignoring click');
      return null;
    }

    // 縦方向: U(0-30%), M(30-60%), B(60-90%)
    let vArea = 'U';
    if (yPercent >= 30 && yPercent < 60) vArea = 'M';
    else if (yPercent >= 60) vArea = 'B';

    // 横方向: 20%ずつ5分割
    let hArea;
    if (xPercent < 20) {
      hArea = 1;
    } else if (xPercent < 40) {
      hArea = 2;
    } else if (xPercent < 60) {
      hArea = 3;
    } else if (xPercent < 80) {
      hArea = 4;
    } else {
      hArea = 5;
    }

    return `${vArea}${hArea}`;
  }

  /**
   * クリックハンドラーをセットアップ
   */
  setupClickHandler() {
    let isProcessing = false;  // 連続クリックを防ぐフラグ

    // 統一されたクリックハンドラー
    const clickHandler = (e) => {
      if (document.body.classList.contains("google-auth-active")) {
        return;
      }
      // メニューやボタン内のクリックは無視
      if (e.target.closest('.left-menu, .progress-bar-panel, .bookmark-menu, .modal, .float-buttons, #floatProgressBar')) {
        return;
      }

      // 処理中なら無視（連続クリックを防ぐ）
      if (isProcessing) {
        console.log('Click event ignored (already processing)');
        return;
      }

      isProcessing = true;

      const baseElement = document.getElementById('fullscreenReader');
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
        // 処理完了後、フラグをリセット（100ms後）
        setTimeout(() => {
          isProcessing = false;
        }, 100);
      }
    };

    document.addEventListener('click', clickHandler);
    console.log('Click handler attached to document');
  }

  /**
   * タッチスワイプハンドラーをセットアップ
   */
  setupTouchHandlers() {
    const reader = document.getElementById('fullscreenReader');
    if (!reader) {
      return;
    }

    const minSwipeDistance = 40;
    const axisDifference = 20;

    reader.addEventListener('touchstart', (e) => {
      if (this.isAnyMenuVisible()) {
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

      if (this.touchStartX === null || this.touchStartY === null) {
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (this.isBookOpen() && this.isPageNavigationEnabled()) {
        const mode = this.getWritingMode?.() || "horizontal";
        // 画像書庫または縦書きモードなら横スワイプ
        if (mode === "vertical" || this.isImageBook?.()) {
          if (absDeltaX >= minSwipeDistance && (absDeltaX - absDeltaY) >= axisDifference) {
            if (deltaX > 0) {
              this.onPagePrev?.();
            } else {
              this.onPageNext?.();
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
    // フローティングメニューが表示されている場合
    if (this.isFloatVisible?.()) {
      // 機能なしエリア、またはM3（メニュー開閉）ならフローティングを閉じる
      const label = this.getFunctionLabel(area);
      if (!label || area === "M3") {
        this.onFloatToggle?.();
      }
      return;
    }

    // M3でメニュー表示
    if (area === 'M3') {
      this.onFloatToggle?.();
      return;
    }

    if (!this.isBookOpen()) return;

    const writingMode = this.getWritingMode?.() || "horizontal";

    // 画像書庫または縦書き
    if (writingMode === "vertical" || this.isImageBook?.()) {
      if (area === "M2") {
        this.onPagePrev?.();
      } else if (area === "M4") {
        this.onPageNext?.();
      }

      // 画像書庫かつ見開きモードの場合、U3/B3で1ページ移動
      if (this.isImageBook?.() && this.isSpreadMode?.()) {
        if (area === "U3") {
          this.onPagePrev?.(1);
        } else if (area === "B3") {
          this.onPageNext?.(1);
        }
      }
      return;
    }

    // 横書き
    if (area === "U3") {
      this.onPagePrev?.();
    } else if (area === "B3") {
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

    const menu = document.getElementById('leftMenu');
    const backdrop = document.getElementById('leftMenuBackdrop');
    const overlay = document.getElementById('clickOverlay');

    console.log('leftMenu element:', menu);
    if (menu) {
      menu.classList.add('visible');
      console.log('Added visible class to leftMenu');
    } else {
      console.error('leftMenu element not found!');
    }

    // バックドロップを表示
    if (backdrop) {
      backdrop.classList.add('visible');
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

    const bar = document.getElementById('progressBarPanel');
    const backdrop = document.getElementById('progressBarBackdrop');
    const overlay = document.getElementById('clickOverlay');

    console.log('progressBarPanel element:', bar);
    if (bar) {
      bar.classList.add('visible');
      console.log('Added visible class to progressBarPanel');
    } else {
      console.error('progressBarPanel element not found!');
    }

    if (!persistent) {
      // バックドロップを表示
      if (backdrop) {
        backdrop.classList.add('visible');
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
        backdrop.classList.remove('visible');
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

    const menu = document.getElementById('bookmarkMenu');
    const overlay = document.getElementById('clickOverlay');

    console.log('bookmarkMenu element:', menu);
    if (menu) {
      menu.classList.add('visible');
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

    const leftMenu = document.getElementById('leftMenu');
    const leftMenuBackdrop = document.getElementById('leftMenuBackdrop');
    const progressBar = document.getElementById('progressBarPanel');
    const progressBarBackdrop = document.getElementById('progressBarBackdrop');
    const bookmarkMenu = document.getElementById('bookmarkMenu');
    const overlay = document.getElementById('clickOverlay');

    if (leftMenu) leftMenu.classList.remove('visible');
    if (leftMenuBackdrop) leftMenuBackdrop.classList.remove('visible');
    if (!this.progressBarPinned) {
      if (progressBar) progressBar.classList.remove('visible');
      if (progressBarBackdrop) progressBarBackdrop.classList.remove('visible');
    } else if (progressBarBackdrop) {
      progressBarBackdrop.classList.remove('visible');
    }
    if (bookmarkMenu) bookmarkMenu.classList.remove('visible');

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
   * エリアのデバッグ表示（開発用）
   */
  showDebugGrid() {
    const overlay = document.createElement('div');
    overlay.id = 'debug-grid';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9999;
    `;

    // グリッド線を描画
    const lines = [
      { type: 'horizontal', percent: 10, label: '10%' },
      { type: 'horizontal', percent: 90, label: '90%' },
      { type: 'vertical', percent: 20, label: '20%' },
      { type: 'vertical', percent: 40, label: '40%' },
      { type: 'vertical', percent: 60, label: '60%' },
      { type: 'vertical', percent: 80, label: '80%' },
    ];

    lines.forEach(line => {
      const el = document.createElement('div');
      el.style.cssText = `
        position: absolute;
        background: rgba(255, 0, 0, 0.3);
        ${line.type === 'horizontal' ?
          `top: ${line.percent}%; left: 0; right: 0; height: 2px;` :
          `left: ${line.percent}%; top: 0; bottom: 0; width: 2px;`
        }
      `;
      overlay.appendChild(el);

      // ラベル
      const label = document.createElement('div');
      label.textContent = line.label;
      label.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 2px 4px;
        font-size: 10px;
        ${line.type === 'horizontal' ?
          `top: ${line.percent}%; left: 50%;` :
          `left: ${line.percent}%; top: 50%;`
        }
        transform: translate(-50%, -50%);
      `;
      overlay.appendChild(label);
    });

    document.body.appendChild(overlay);

    // 10秒後に自動削除
    setTimeout(() => overlay.remove(), 10000);
  }

  /**
   * クリックエリア可視化グリッドを生成
   */
  createGridOverlay() {
    this.gridOverlay = document.createElement('div');
    this.gridOverlay.className = 'area-grid-overlay';
    this.gridOverlay.style.pointerEvents = 'none'; // 初期状態は操作不可

    // 3x5グリッド (U1-U5, M1-M5, B1-B5)
    const areas = [];
    ['U', 'M', 'B'].forEach(row => {
      for (let i = 1; i <= 5; i++) {
        areas.push(`${row}${i}`);
      }
    });

    areas.forEach(area => {
      const cell = document.createElement('div');
      cell.className = 'area-cell';
      cell.dataset.area = area;

      // 長押しイベント
      const start = (e) => this.startGridLongPress(area, cell, e);
      const end = (e) => this.endGridLongPress(e);

      cell.addEventListener('mousedown', start);
      cell.addEventListener('touchstart', start, { passive: false });
      cell.addEventListener('mouseup', end);
      cell.addEventListener('touchend', end);
      cell.addEventListener('mouseleave', end);

      this.gridOverlay.appendChild(cell);
    });

    // fullscreenReaderに追加
    const container = document.getElementById('fullscreenReader') || document.body;
    container.appendChild(this.gridOverlay);
  }

  /**
   * エリアの機能ラベルを取得
   */
  getFunctionLabel(area) {
    if (area === "M3") return "メニュー開閉";

    const writingMode = this.getWritingMode?.() || "horizontal";
    const isImage = this.isImageBook?.();
    const isSpread = this.isSpreadMode?.();

    // 縦書き or 画像
    if (writingMode === "vertical" || isImage) {
      if (area === "M2") return "前のページ";
      if (area === "M4") return "次のページ";
      if (isSpread) {
        if (area === "U3") return "前のページ (1枚)";
        if (area === "B3") return "次のページ (1枚)";
      }
    } else {
      // 横書き
      if (area === "U3") return "前のページ";
      if (area === "B3") return "次のページ";
    }
    return null;
  }

  /**
   * グリッド長押し開始
   */
  startGridLongPress(area, cell, e) {
    // 機能がないエリアは無視
    const labelText = this.getFunctionLabel(area);
    if (!labelText) return;

    this.isLongProcessing = true;
    this.longPressTimer = setTimeout(() => {
      // 長押し成立：全ラベルを表示状態にトグル
      this.toggleAllGridLabels();
      this.isLongProcessing = false;
    }, 500);
  }

  /**
   * グリッド長押し終了
   */
  endGridLongPress(e) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * 全グリッドラベルの表示切替
   */
  toggleAllGridLabels() {
    if (!this.gridOverlay) return;

    const cells = this.gridOverlay.querySelectorAll('.area-cell.has-function');
    const isAnyShown = Array.from(cells).some(c => c.classList.contains('show-label'));

    cells.forEach(cell => {
      if (isAnyShown) {
        cell.classList.remove('show-label');
      } else {
        cell.classList.add('show-label');
      }
    });
  }

  /**
   * グリッドオーバーレイ表示（フローティング表示時）
   */
  showClickAreas() {
    if (!this.gridOverlay) return;

    // 機能があるセルに色をつける
    const cells = this.gridOverlay.querySelectorAll('.area-cell');
    cells.forEach(cell => {
      const area = cell.dataset.area;
      const labelText = this.getFunctionLabel(area);

      let label = cell.querySelector('.area-label');
      if (labelText) {
        cell.classList.add('has-function');
        if (!label) {
          label = document.createElement('div');
          label.className = 'area-label';
          cell.appendChild(label);
        }
        label.textContent = labelText;
      } else {
        cell.classList.remove('has-function', 'show-label');
        if (label) label.remove();
      }
    });

    this.gridOverlay.classList.add('visible');
  }

  /**
   * グリッドオーバーレイ非表示
   */
  hideClickAreas() {
    if (!this.gridOverlay) return;
    this.gridOverlay.classList.remove('visible');
    const cells = this.gridOverlay.querySelectorAll('.area-cell');
    cells.forEach(cell => cell.classList.remove('show-label'));
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
    this.thumb.addEventListener('touchstart', this.handleDragStart.bind(this));
    document.addEventListener('touchmove', this.handleDragMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleDragEnd.bind(this));

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
    this.thumb.classList.add('dragging');
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
    this.thumb.classList.remove('dragging');
  }

  updatePosition(percentage) {
    if (this.thumb) {
      this.thumb.style.left = `${percentage}%`;
    }
  }
}
