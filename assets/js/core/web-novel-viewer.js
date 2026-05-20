/**
 * web-novel-viewer.js
 * 
 * Web小説（テキストHTML）専用のビューアクラス。
 * EPUB/画像リーダーと並列に動作し、単一のエピソード（話）のテキストを描画・管理します。
 */

export class WebNovelViewer {
    constructor(options = {}) {
        this.containerId = options.containerId || 'webNovelViewer';
        this.container = document.getElementById(this.containerId);

        // 現在の表示状態
        this.novelInfo = null;
        this.episodes = [];
        this.currentEpisodeIndex = 0;
        this.provider = null; // NarouProvider or KakuyomuProvider
        this.onProgress = options.onProgress || (() => { });
        this.onNextEpisode = options.onNextEpisode || (() => { });
        this.onPrevEpisode = options.onPrevEpisode || (() => { });

        this.writingMode = 'horizontal-tb';

        if (!this.container) {
            console.warn(`[WebNovelViewer] Container #${this.containerId} not found. Creating...`);
            this.container = document.createElement('div');
            this.container.id = this.containerId;
            this.container.className = 'viewer hidden';
            // スクロール用スタイル
            this.container.style.overflowY = 'auto';
            this.container.style.padding = '20px';
            this.container.style.height = '100%';
            this.container.style.boxSizing = 'border-box';
            this.container.style.fontSize = '1rem';
            this.container.style.lineHeight = '1.8';
            document.body.appendChild(this.container);

            // スクロールイベントで進捗を報告
            this.container.addEventListener('scroll', () => {
                this.reportProgress();
            });
        }
    }

    /**
     * 単一話のHTMLコンテンツを描画する
     */
    async renderEpisode(novelInfo, episodes, episodeIndex, provider, startPercentage = 0) {
        this.novelInfo = novelInfo;
        this.episodes = episodes;
        this.currentEpisodeIndex = episodeIndex;
        this.provider = provider;

        const ep = this.episodes[episodeIndex];
        if (!ep) throw new Error('Episode not found');

        // ローディング表示などのUI処理は呼び出し元で行う前提
        const content = await this.provider.getEpisodeContent(ep.url, ep.title);

        // コンテナをクリア
        this.container.innerHTML = '';

        // タイトルと本文を構築
        const titleEl = document.createElement('h2');
        titleEl.textContent = content.title;
        titleEl.style.marginBottom = '1.5em';
        titleEl.style.borderBottom = '1px solid currentColor';
        titleEl.style.paddingBottom = '0.5em';

        const bodyEl = document.createElement('div');
        bodyEl.className = 'web-novel-body';
        bodyEl.innerHTML = content.htmlContent;

        // 縦書き/横書き対応設定（CSS変数は上位で制御されている想定）
        this.container.style.writingMode = this.writingMode;

        // ナビゲーションボタンの作成
        const createNav = () => {
            const nav = document.createElement('div');
            nav.className = 'web-novel-nav';
            nav.style.display = 'flex';
            nav.style.justifyContent = 'space-between';
            nav.style.marginTop = '2em';
            nav.style.marginBottom = '2em';
            nav.style.padding = '0 1em';

            const prevBtn = document.createElement('button');
            prevBtn.textContent = '前の話';
            prevBtn.className = 'web-novel-nav-btn';
            prevBtn.style.padding = '8px 16px';
            prevBtn.style.cursor = 'pointer';
            if (episodeIndex > 0) {
                prevBtn.onclick = () => this.onPrevEpisode();
            } else {
                prevBtn.disabled = true;
                prevBtn.style.opacity = '0.5';
            }

            const nextBtn = document.createElement('button');
            nextBtn.textContent = '次の話';
            nextBtn.className = 'web-novel-nav-btn';
            nextBtn.style.padding = '8px 16px';
            nextBtn.style.cursor = 'pointer';
            if (episodeIndex < episodes.length - 1) {
                nextBtn.onclick = () => this.onNextEpisode();
            } else {
                nextBtn.disabled = true;
                nextBtn.style.opacity = '0.5';
            }

            nav.appendChild(prevBtn);
            nav.appendChild(nextBtn);
            return nav;
        };

        this.container.appendChild(createNav());
        this.container.appendChild(titleEl);
        this.container.appendChild(bodyEl);
        this.container.appendChild(createNav());

        // スクロール位置の復元
        requestAnimationFrame(() => {
            this.scrollToPercentage(startPercentage);
            this.reportProgress();
        });
    }

    setWritingMode(mode) {
        this.writingMode = mode;
        if (this.container) {
            this.container.style.writingMode = mode;
        }
    }

    setFontSize(sizeStr) {
        if (this.container) {
            this.container.style.fontSize = sizeStr;
        }
    }

    next() {
        // 1話分進むのではなく、まずはスクロールを下（横書き）または左（縦書き）に進める
        // スクロールが末尾なら次の話へ遷移するのが望ましいが、最初はスクロールのみ
        if (this.writingMode === 'vertical-rl') {
            this.container.scrollBy({ left: -window.innerWidth * 0.8, behavior: 'smooth' });
        } else {
            this.container.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
        }
        this.reportProgress();
    }

    prev() {
        if (this.writingMode === 'vertical-rl') {
            this.container.scrollBy({ left: window.innerWidth * 0.8, behavior: 'smooth' });
        } else {
            this.container.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
        }
        this.reportProgress();
    }

    /**
     * 次の話へ進む
     */
    async nextEpisode() {
        if (this.currentEpisodeIndex < this.episodes.length - 1) {
            await this.renderEpisode(
                this.novelInfo,
                this.episodes,
                this.currentEpisodeIndex + 1,
                this.provider,
                0
            );
            return true;
        }
        return false;
    }

    /**
     * 前の話へ戻る
     */
    async prevEpisode() {
        if (this.currentEpisodeIndex > 0) {
            // 前の話に戻る時は末尾から開始
            await this.renderEpisode(
                this.novelInfo,
                this.episodes,
                this.currentEpisodeIndex - 1,
                this.provider,
                1
            );
            return true;
        }
        return false;
    }

    /**
     * 現在のスクロール位置をパーセンテージ(0-1)で取得
     */
    getScrollPercentage() {
        if (!this.container) return 0;

        if (this.writingMode === 'vertical-rl') {
            // 縦書き（右から左へスクロール）
            const maxScroll = this.container.scrollWidth - this.container.clientWidth;
            if (maxScroll <= 0) return 0;
            // scrollLeftは0からマイナス方向に進むことが多い（ブラウザ依存）ためMath.absを使用
            return Math.abs(this.container.scrollLeft) / maxScroll;
        } else {
            // 横書き（上から下へスクロール）
            const maxScroll = this.container.scrollHeight - this.container.clientHeight;
            if (maxScroll <= 0) return 0;
            return this.container.scrollTop / maxScroll;
        }
    }

    /**
     * 指定したパーセンテージ(0-1)にスクロール
     */
    scrollToPercentage(percentage) {
        if (!this.container) return;

        // 0〜1の範囲にクリップ
        percentage = Math.max(0, Math.min(1, percentage));

        if (this.writingMode === 'vertical-rl') {
            const maxScroll = this.container.scrollWidth - this.container.clientWidth;
            // ブラウザによって右端が0だったり、左方向がマイナスだったりするが
            // 一般的に rtl では scrollLeft は 0 からマイナスになる（Chrome等）
            // あるいは 0 からプラス（Safari一部）など差異があるが、簡易実装
            this.container.scrollLeft = - (maxScroll * percentage);
        } else {
            const maxScroll = this.container.scrollHeight - this.container.clientHeight;
            this.container.scrollTop = maxScroll * percentage;
        }
    }

    reportProgress() {
        // 読書進捗
        if (this.onProgress) {
            const scrollPercent = this.getScrollPercentage();
            const overallPercent = this.episodes.length > 0 ? (this.currentEpisodeIndex / this.episodes.length) * 100 : 0;
            this.onProgress({
                location: {
                    location: this.currentEpisodeIndex,
                    percentage: scrollPercent
                },
                percentage: overallPercent
            });
        }
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.novelInfo = null;
        this.episodes = [];
        this.provider = null;
    }
}
