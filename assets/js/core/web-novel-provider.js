/**
 * web-novel-provider.js
 *
 * Web小説（なろう・カクヨム等）からデータを取得するための基底クラス。
 * CORSの回避ロジックや、共通パターンのHTMLパースなどを提供します。
 */

export class WebNovelProvider {
    constructor(options = {}) {
        // オプション（プロキシURLなど）
        this.options = {
            corsProxy: 'https://api.codetabs.com/v1/proxy?quest=',
            ...options
        };
    }

    /**
     * プロバイダーの識別子（サブクラスでオーバーライド）
     * @returns {string} (例: "narou", "kakuyomu")
     */
    get id() {
        return 'base';
    }

    /**
     * プロバイダーの表示名（サブクラスでオーバーライド）
     * @returns {string} (例: "小説家になろう")
     */
    get name() {
        return 'Base Provider';
    }

    /**
     * URLからHTMLテキストを取得する。
     * まず直接fetchを試し、CORSエラーならプロキシ経由で再試行する。
     * @param {string} url - 取得先URL
     * @returns {Promise<string>} HTMLテキスト
     */
    async fetchHtml(url) {
        console.log(`[WebNovelProvider] Fetching HTML from: ${url}`);
        try {
            // 1. 直接取得を試みる
            const res = await fetch(url);
            if (res.ok) {
                console.log(`[WebNovelProvider] Direct fetch successful for: ${url}`);
                return await res.text();
            }
            throw new Error(`Direct fetch failed with status: ${res.status}`);
        } catch (error) {
            console.warn(`[WebNovelProvider] Direct fetch failed for ${url}. Trying proxy...`, error);
            // 2. プロキシ経由で取得
            const proxyUrl = this.options.corsProxy + encodeURIComponent(url);
            console.log(`[WebNovelProvider] Using proxy: ${proxyUrl}`);
            const res = await fetch(proxyUrl);
            if (res.ok) {
                console.log(`[WebNovelProvider] Proxy fetch successful for: ${url}`);
                return await res.text();
            }
            throw new Error(`Proxy fetch failed for ${url} with status: ${res.status}`);
        }
    }

    /**
     * HTMLテキストからDOMパーサーを使ってDocumentを生成する
     * @param {string} html 
     * @returns {Document}
     */
    parseHtml(html) {
        const parser = new DOMParser();
        return parser.parseFromString(html, "text/html");
    }

    /**
     * キーワードから作品を検索する（サブクラスで実装）
     * @param {string} query 
     * @returns {Promise<Array<{id: string, title: string, author: string, url: string}>>}
     */
    async search(query) {
        throw new Error('search() must be implemented by subclass');
    }

    /**
     * 作品URLから目次（エピソード一覧）を取得する（サブクラスで実装）
     * @param {string} novelUrl 
     * @returns {Promise<{title: string, author: string, episodes: Array<{id: string, title: string, url: string}>}>}
     */
    async getTableOfContents(novelUrl) {
        throw new Error('getTableOfContents() must be implemented by subclass');
    }

    /**
     * エピソードURLから本文を取得する（サブクラスで実装）
     * @param {string} episodeUrl 
     * @returns {Promise<{title: string, htmlContent: string}>}
     */
    async getEpisodeContent(episodeUrl) {
        throw new Error('getEpisodeContent() must be implemented by subclass');
    }
}

/**
 * 小説家になろう用プロバイダー
 */
export class NarouProvider extends WebNovelProvider {
    get id() { return 'narou'; }
    get name() { return '小説家になろう'; }

    /**
     * なろうAPIを用いた検索
     */
    async search(query) {
        console.log(`[NarouProvider] Searching for: ${query}`);
        // なろうAPI (https://dev.syosetu.com/man/api/) を使用して検索
        // order=totalpoint: 総合評価の高い順
        const url = `https://api.syosetu.com/novelapi/api/?out=json&word=${encodeURIComponent(query)}&lim=20&order=totalpoint`;
        try {
            const res = await fetch(url);
            const text = await res.text();
            try {
                const data = JSON.parse(text);
                if (!Array.isArray(data)) {
                    console.error("[NarouProvider] Unexpected API response format (direct):", data);
                    throw new Error("Unexpected API response format");
                }
                const items = data.slice(1);
                console.log(`[NarouProvider] Direct search found ${items.length} items.`);
                return items.map(item => ({
                    id: item.ncode.toLowerCase(),
                    title: item.title,
                    author: item.writer,
                    url: `https://ncode.syosetu.com/${item.ncode.toLowerCase()}/`,
                    rating: item.global_point,
                    reviewCount: item.all_hyoka_cnt
                }));
            } catch (parseError) {
                console.error("[NarouProvider] Failed to parse JSON (direct):", text.substring(0, 100));
                throw parseError;
            }
        } catch (error) {
            console.warn(`[NarouProvider] Direct fetch failed for search. Trying proxy...`, error);
            const proxyUrl = this.options.corsProxy + encodeURIComponent(url);
            console.log(`[NarouProvider] Using proxy: ${proxyUrl}`);
            const res = await fetch(proxyUrl);
            const text = await res.text();
            try {
                const data = JSON.parse(text);
                if (!Array.isArray(data)) {
                    console.error("[NarouProvider] Unexpected API response format (proxy):", data);
                    throw new Error("Unexpected API response format via proxy");
                }
                const items = data.slice(1);
                console.log(`[NarouProvider] Proxy search found ${items.length} items.`);
                return items.map(item => ({
                    id: item.ncode.toLowerCase(),
                    title: item.title,
                    author: item.writer,
                    url: `https://ncode.syosetu.com/${item.ncode.toLowerCase()}/`,
                    rating: item.global_point,
                    reviewCount: item.all_hyoka_cnt
                }));
            } catch (parseError) {
                console.error("[NarouProvider] Failed to parse JSON (proxy):", text.substring(0, 100));
                throw parseError;
            }
        }
    }

    async getTableOfContents(novelUrl) {
        console.log(`[NarouProvider] Getting TOC for: ${novelUrl}`);
        try {
            const html = await this.fetchHtml(novelUrl);
            const doc = this.parseHtml(html);

            const titleEl = doc.querySelector('.novel_title') || doc.querySelector('.p-novel__title');
            const authorEl = doc.querySelector('.novel_writername') || doc.querySelector('.p-novel__author') || doc.querySelector('.p-novel__author a');

            const title = titleEl ? titleEl.textContent.trim() : 'Unknown Title';
            const author = authorEl ? authorEl.textContent.replace('作者：', '').trim() : 'Unknown Author';
            console.log(`[NarouProvider] Parsed TOC title: "${title}", author: "${author}"`);

            const episodes = [];
            // pc版旧レイアウトと新レイアウト両対応
            // 旧: .subtitle
            // 新: .p-eplist__subtitle
            const episodeNodes = doc.querySelectorAll('.subtitle, .p-eplist__subtitle, .p-eplist__sublist');

            episodeNodes.forEach(node => {
                const linkEl = node.tagName === 'A' ? node : node.querySelector('a');
                if (linkEl) {
                    const href = linkEl.getAttribute('href');
                    if (!href || href.includes('javascript:')) return;

                    const epTitle = linkEl.textContent.trim();
                    const fullUrl = new URL(href, 'https://ncode.syosetu.com').href;

                    // /ncode/epnum/ からID抽出
                    const match = href.match(/\/([^/]+)\/(\d+)\/?/);
                    const epId = match ? `${match[1]}-${match[2]}` : href;

                    // 重複排除 (同じエピソードが複数回ヒットすることを防ぐ)
                    if (!episodes.find(e => e.url === fullUrl)) {
                        episodes.push({
                            id: epId,
                            title: epTitle,
                            url: fullUrl
                        });
                    }
                }
            });
            console.log(`[NarouProvider] Found ${episodes.length} episodes.`);
            return { title, author, episodes };
        } catch (error) {
            console.error(`[NarouProvider] Error getting TOC for ${novelUrl}:`, error);
            throw error;
        }
    }

    async getEpisodeContent(episodeUrl) {
        console.log(`[NarouProvider] Getting content for episode: ${episodeUrl}`);
        try {
            const html = await this.fetchHtml(episodeUrl);
            const doc = this.parseHtml(html);

            const subtitleEl = doc.querySelector('.novel_subtitle') || doc.querySelector('.p-novel__subtitle');
            const title = subtitleEl ? subtitleEl.textContent.trim() : 'Episode';

            // 本文コンテナ
            const contentEl = doc.querySelector('#novel_honbun') || doc.querySelector('.js-novel-text');
            let htmlContent = '';

            if (contentEl) {
                // 不要なスクリプト等を除去
                const scripts = contentEl.querySelectorAll('script');
                scripts.forEach(s => s.remove());
                // <br>等は維持したいのでinnerHTMLを使用
                htmlContent = contentEl.innerHTML;
                console.log(`[NarouProvider] Parsed episode title: "${title}", length: ${htmlContent.length} chars.`);
            } else {
                console.warn(`[NarouProvider] Could not find content element for episode: ${episodeUrl}`);
            }

            return { title, htmlContent };
        } catch (error) {
            console.error(`[NarouProvider] Error getting content for ${episodeUrl}:`, error);
            throw error;
        }
    }
}

/**
 * カクヨム用プロバイダー
 */
export class KakuyomuProvider extends WebNovelProvider {
    get id() { return 'kakuyomu'; }
    get name() { return 'カクヨム'; }

    async search(query) {
        console.log(`[KakuyomuProvider] Searching for: ${query}`);
        try {
            const url = `https://kakuyomu.jp/search?q=${encodeURIComponent(query)}`;
            const html = await this.fetchHtml(url);
            console.log(`[KakuyomuProvider] Fetched HTML length: ${html.length}`);
            if (html.length < 1000) {
                console.warn(`[KakuyomuProvider] HTML content suspicious (too short):`, html);
            }
            const doc = this.parseHtml(html);

            const results = [];
            // カクヨムの検索結果のカード
            // 最近のデザイン変更に対応するため、複数のセレクタを試す
            const cards = doc.querySelectorAll('.widget-workCard, [class*="WorkCard"], article');
            console.log(`[KakuyomuProvider] Found ${cards.length} work cards.`);

            cards.forEach(card => {
                const titleEl = card.querySelector('.widget-workCard-title a');
                const authorEl = card.querySelector('.widget-workCard-authorLabel a') || card.querySelector('a[href^="/users/"]');

                if (titleEl) {
                    const title = titleEl.textContent.trim();
                    const author = authorEl ? authorEl.textContent.trim() : 'Unknown Author';
                    const href = titleEl.getAttribute('href'); // e.g. /works/1177354054897486829

                    const match = href.match(/\/works\/(\d+)/);
                    if (match) {
                        const id = match[1];
                        results.push({
                            id,
                            title,
                            author,
                            url: `https://kakuyomu.jp${href}`
                        });
                    }
                }
            });

            return results;
        } catch (error) {
            console.error(`[KakuyomuProvider] Error searching for "${query}":`, error);
            throw error;
        }
    }

    async getTableOfContents(novelUrl) {
        console.log(`[KakuyomuProvider] Getting TOC for: ${novelUrl}`);
        try {
            const html = await this.fetchHtml(novelUrl);
            const doc = this.parseHtml(html);

            const titleEl = doc.querySelector('#workTitle');
            const authorEl = doc.querySelector('#workAuthor a');

            const title = titleEl ? titleEl.textContent.trim() : 'Unknown Title';
            const author = authorEl ? authorEl.textContent.trim() : 'Unknown Author';
            console.log(`[KakuyomuProvider] Parsed TOC title: "${title}", author: "${author}"`);

            const episodes = [];
            // 各話のリンクは widget-toc-episode クラスの中など
            const episodeNodes = doc.querySelectorAll('.widget-toc-episode');

            episodeNodes.forEach(node => {
                const linkEl = node.querySelector('a');
                if (linkEl) {
                    const href = linkEl.getAttribute('href');
                    const epTitleEl = linkEl.querySelector('span'); // タイトルテキスト
                    const epTitle = epTitleEl ? epTitleEl.textContent.trim() : linkEl.textContent.trim();

                    const fullUrl = new URL(href, 'https://kakuyomu.jp').href;

                    // /works/117.. /episodes/227.. からID抽出
                    const match = href.match(/\/works\/(\d+)\/episodes\/(\d+)/);
                    const epId = match ? `${match[1]}-${match[2]}` : href;

                    episodes.push({
                        id: epId,
                        title: epTitle,
                        url: fullUrl
                    });
                }
            });

            console.log(`[KakuyomuProvider] Found ${episodes.length} episodes.`);
            return { title, author, episodes };
        } catch (error) {
            console.error(`[KakuyomuProvider] Error getting TOC for ${novelUrl}:`, error);
            throw error;
        }
    }

    async getEpisodeContent(episodeUrl) {
        console.log(`[KakuyomuProvider] Getting content for episode: ${episodeUrl}`);
        try {
            const html = await this.fetchHtml(episodeUrl);
            const doc = this.parseHtml(html);

            const titleEl = doc.querySelector('.widget-episodeTitle');
            const title = titleEl ? titleEl.textContent.trim() : 'Episode';

            // 本文コンテナ
            const contentEl = doc.querySelector('.widget-episodeBody');
            let htmlContent = '';

            if (contentEl) {
                // 不要なスクリプト等を除去
                const scripts = contentEl.querySelectorAll('script');
                scripts.forEach(s => s.remove());
                htmlContent = contentEl.innerHTML;
                console.log(`[KakuyomuProvider] Parsed episode title: "${title}", length: ${htmlContent.length} chars.`);
            } else {
                console.warn(`[KakuyomuProvider] Could not find content element for episode: ${episodeUrl}`);
            }

            return { title, htmlContent };
        } catch (error) {
            console.error(`[KakuyomuProvider] Error getting content for ${episodeUrl}:`, error);
            throw error;
        }
    }
}
