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
    
    this.leftMenuVisible = false;
    this.progressBarVisible = false;
    this.bookmarkMenuVisible = false;
    
    this.setupClickHandler();
  }
  
  /**
   * クリック座標からエリアを判定
   */
  getClickArea(x, y) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const xPercent = (x / width) * 100;
    const yPercent = (y / height) * 100;
    
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
    // クリックオーバーレイとドキュメント全体でリスニング
    const clickHandler = (e) => {
      // メニュー内のクリックは無視
      if (e.target.closest('.left-menu, .progress-bar-panel, .bookmark-menu')) {
        return;
      }
      
      const area = this.getClickArea(e.clientX, e.clientY);
      console.log('Clicked area:', area, 'at', e.clientX, e.clientY);
      
      this.handleAreaClick(area, e);
    };
    
    // オーバーレイにイベントリスナーを追加
    const overlay = document.getElementById('clickOverlay');
    if (overlay) {
      overlay.addEventListener('click', clickHandler);
    }
    
    // ドキュメント全体にも追加（空状態や画像ビューア時用）
    document.addEventListener('click', clickHandler);
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
    
    // メニューが開いている場合は閉じる
    if (this.leftMenuVisible || this.progressBarVisible || this.bookmarkMenuVisible) {
      console.log('Closing menus...');
      this.closeAllMenus();
      return;
    }
    
    // エリア別の処理
    switch (area) {
      case 'U1':
      case 'M1':
      case 'B1':
        // 左端 → 左メニュー表示
        console.log('Showing left menu...');
        this.showLeftMenu();
        break;
        
      case 'M2':
        // 中央左 → 前ページ
        console.log('Previous page...');
        this.onPagePrev?.();
        break;
        
      case 'M3':
        // 中央 → しおりメニュー表示
        console.log('Showing bookmark menu...');
        this.showBookmarkMenu();
        break;
        
      case 'M4':
        // 中央右 → 次ページ
        console.log('Next page...');
        this.onPageNext?.();
        break;
        
      case 'B2':
        // 下端 → 進捗バー表示
        console.log('Showing progress bar...');
        this.showProgressBar();
        break;
        
      default:
        // その他のエリアは何もしない
        console.log('Area ignored:', area);
        break;
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
    const overlay = document.getElementById('clickOverlay');
    
    console.log('leftMenu element:', menu);
    if (menu) {
      menu.classList.add('visible');
      console.log('Added visible class to leftMenu');
    } else {
      console.error('leftMenu element not found!');
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
  showProgressBar() {
    console.log('showProgressBar called');
    this.progressBarVisible = true;
    this.onProgressBar?.('show');
    
    const bar = document.getElementById('progressBarPanel');
    const overlay = document.getElementById('clickOverlay');
    
    console.log('progressBarPanel element:', bar);
    if (bar) {
      bar.classList.add('visible');
      console.log('Added visible class to progressBarPanel');
    } else {
      console.error('progressBarPanel element not found!');
    }
    
    // オーバーレイを無効化
    if (overlay) {
      overlay.style.pointerEvents = 'none';
      console.log('Disabled overlay pointer events');
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
    const progressBar = document.getElementById('progressBarPanel');
    const bookmarkMenu = document.getElementById('bookmarkMenu');
    const overlay = document.getElementById('clickOverlay');
    
    if (leftMenu) leftMenu.classList.remove('visible');
    if (progressBar) progressBar.classList.remove('visible');
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
    
    this.thumb.addEventListener('mousedown', this.handleDragStart.bind(this));
    document.addEventListener('mousemove', this.handleDragMove.bind(this));
    document.addEventListener('mouseup', this.handleDragEnd.bind(this));
    
    // タッチ対応
    this.thumb.addEventListener('touchstart', this.handleDragStart.bind(this));
    document.addEventListener('touchmove', this.handleDragMove.bind(this));
    document.addEventListener('touchend', this.handleDragEnd.bind(this));
  }
  
  handleDragStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.thumb.classList.add('dragging');
  }
  
  handleDragMove(e) {
    if (!this.isDragging) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = this.container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = (x / rect.width) * 100;
    
    this.updatePosition(percentage);
    this.onSeek?.(percentage);
  }
  
  handleDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.thumb.classList.remove('dragging');
  }
  
  updatePosition(percentage) {
    if (this.thumb) {
      this.thumb.style.left = `${percentage}%`;
    }
  }
}
