// UI制御モジュール：エリア判定、メニュー表示、進捗バー等

/**
 * 画面を15エリアに分割して判定
 * 
 * グリッド構造:
 * ┌─────┬──────────────────────┬─────┐
 * │ U1  │    U2 (未使用)       │ U3  │  ← 上10%
 * ├─────┼─────┬────┬────┬─────┼─────┤
 * │     │     │    │    │     │     │
 * │ M1  │ M2  │ M3 │ M4 │ M5  │  M1 │  ← 中80%
 * │     │     │    │    │     │     │
 * ├─────┼─────┴────┴────┴─────┼─────┤
 * │ B1  │    B2            B3  │ B1  │  ← 下10%
 * └─────┴──────────────────────┴─────┘
 *   左20%    中60%              右20%
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
    
    this.leftMenuVisible = false;
    this.progressBarVisible = false;
    this.progressBarPinned = false;
    this.bookmarkMenuVisible = false;
    this.touchStartX = null;
    this.touchStartY = null;
    
    this.setupClickHandler();
    this.setupTouchHandlers();
    this.setupResizeHandler();
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
    
    // 縦方向: U(0-10%), M(10-90%), B(90-100%)
    let vArea = 'M';
    if (yPercent < 10) vArea = 'U';
    if (yPercent > 90) vArea = 'B';
    
    // 横方向の判定
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
    
    // U2は1-5を統合、B2は2-4を統合
    if (vArea === 'U' && hArea >= 2 && hArea <= 4) {
      hArea = 2;
    }
    if (vArea === 'B' && hArea >= 2 && hArea <= 4) {
      hArea = 2;
    }
    
    // 左右のM1, M5は上下のU1, U3, B1, B3と統合
    if ((hArea === 1 || hArea === 5)) {
      hArea = 1; // 左右端は全て1として扱う
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
      const area = this.getClickArea(e.clientX, e.clientY, baseElement);
      if (!area) {
        isProcessing = false;
        return;
      }
      console.log('Clicked area:', area, 'at', e.clientX, e.clientY);
      
      this.handleAreaClick(area, e);
      
      // 処理完了後、フラグをリセット（100ms後）
      setTimeout(() => {
        isProcessing = false;
      }, 100);
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
        if (mode === "vertical") {
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
    console.log('handleAreaClick called:', area);
    console.log('Menu states:', {
      leftMenuVisible: this.leftMenuVisible,
      progressBarVisible: this.progressBarVisible,
      bookmarkMenuVisible: this.bookmarkMenuVisible
    });

    if (this.isFloatVisible?.()) return;
    
    if (area === 'M3') {
      console.log('Toggling float overlay...');
      this.onFloatToggle?.();
      return;
    }

    const writingMode = this.getWritingMode?.() || "horizontal";
    console.log('Writing mode:', writingMode, 'Area:', area);
    
    if (writingMode === "vertical") {
      // 縦書き: 上(U2)で前ページ、下(B2)で次ページ
      if (area === "U2") {
        console.log('Vertical mode: U2 -> prev page');
        this.onPagePrev?.();
      }
      if (area === "B2") {
        console.log('Vertical mode: B2 -> next page');
        this.onPageNext?.();
      }
      return;
    }

    // 横書き: 左(M2)で前ページ、右(M4)で次ページ
    if (area === "M2") {
      console.log('Horizontal mode: M2 -> prev page');
      this.onPagePrev?.();
    }
    if (area === "M4") {
      console.log('Horizontal mode: M4 -> next page');
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
}

/**
 * 進捗バー用のドラッグハンドラー
 */
export class ProgressBarHandler {
  constructor(options = {}) {
    this.container = options.container;
    this.thumb = options.thumb;
    this.onSeek = options.onSeek;
    
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
      const percentage = (x / rect.width) * 100;
      
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
    const percentage = (x / rect.width) * 100;
    
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
    const percentage = (x / rect.width) * 100;
    
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
