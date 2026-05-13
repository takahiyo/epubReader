/**
 * web-novel-provider.js
 *
 * Web小説（なろう・カクヨム等）からデータを取得するための基底クラス。
 * CORSの回避ロジックや、共通パターンのHTMLパースなどを提供します。
 */

import { WORKERS_CONFIG } from "../../constants/runtime-config.js";

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

        // プロキシリスト（自前Worker を最優先、パブリックプロキシはフォールバック）
        // buildUrl: 各プロキシのURL組み立てロジック
        const proxies = [
            {
                name: 'BookReader Worker',
                buildUrl: (targetUrl) => `${WORKERS_CONFIG.PROXY_ENDPOINT}?url=${encodeURIComponent(targetUrl)}`,
            },
            {
                name: 'allorigins',
                buildUrl: (targetUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
            },
            {
                name: 'codetabs',
                buildUrl: (targetUrl) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
            },
            {
                name: 'corsproxy.io',
                buildUrl: (targetUrl) => `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
            },
        ];

        try {
            // 1. 直接取得を試みる (ブックマークなどで同一オリジンや拡張機能環境の場合)
            const res = await fetch(url);
            if (res.ok) {
                console.log(`[WebNovelProvider] Direct fetch successful for: ${url}`);
                return await res.text();
            }
        } catch (error) {
            console.warn(`[WebNovelProvider] Direct fetch failed for ${url}. Trying proxies...`);
        }

        // 2. プロキシ経由で順次試行
        for (const proxy of proxies) {
            const proxyUrl = proxy.buildUrl(url);
            console.log(`[WebNovelProvider] Trying proxy [${proxy.name}]: ${proxyUrl}`);
            try {
                const res = await fetch(proxyUrl);
                if (res.ok) {
                    const text = await res.text();
                    // 403 Forbidden などのテキストが含まれていないか、またある程度の長さ（100文字以上）があるかをチェック
                    if (text.length > 100 && !text.includes('403 Forbidden') && !text.includes('Access denied')) {
                        console.log(`[WebNovelProvider] Proxy fetch successful with: ${proxy.name}`);
                        return text;
                    }
                    console.warn(`[WebNovelProvider] Proxy ${proxy.name} returned error or suspicious content (length: ${text.length}).`);
                }
            } catch (err) {
                console.warn(`[WebNovelProvider] Proxy ${proxy.name} failed:`, err.message);
            }
        }

        throw new Error(`Failed to fetch ${url} even through multiple proxies.`);
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
     * @param {string} query
     * @param {string} target 'all', 'title', 'author', 'summary', 'keyword'
     */
    async search(query, target = 'all') {
        console.log(`[NarouProvider] Searching for: ${query}, target: ${target}`);
        // なろうAPI (https://dev.syosetu.com/man/api/) を使用して検索
        // order=hyoka: 総合評価の高い順
        let url = `https://api.syosetu.com/novelapi/api/?out=json&word=${encodeURIComponent(query)}&lim=20&order=hyoka`;
        
        if (target === 'title') url += '&title=1';
        else if (target === 'author') url += '&wname=1';
        else if (target === 'summary') url += '&ex=1';
        else if (target === 'keyword') url += '&keyword=1';
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

    /**
     * 目次とメタ情報を取得
     * @param {string} novelUrl 
     * @param {object} novelInfo 検索結果からの追加情報（タイトル、作者などのフォールバック用）
     */
    async getTableOfContents(novelUrl, novelInfo = {}) {
        console.log(`[NarouProvider] Getting TOC for: ${novelUrl}`);
        try {
            const html = await this.fetchHtml(novelUrl);
            console.log(`[NarouProvider] HTML preview:`, html.substring(0, 300).replace(/\n/g, ' '));
            const doc = this.parseHtml(html);

            const titleEl = doc.querySelector('.novel_title') || doc.querySelector('#novel_title') || doc.querySelector('.p-novel__title');
            const authorEl = doc.querySelector('.novel_writername') || doc.querySelector('.p-novel__author') || doc.querySelector('.p-novel__author a') || doc.querySelector('#novel_writername');

            const title = titleEl ? titleEl.textContent.trim() : (novelInfo.title || 'Unknown Title');
            const author = authorEl ? authorEl.textContent.replace('作者：', '').trim() : (novelInfo.author || 'Unknown Author');
            console.log(`[NarouProvider] Parsed TOC title: "${title}", author: "${author}"`);

            const episodes = [];
            const ncodeMatch = novelUrl.match(/ncode\.syosetu\.com\/([^/]+)/);
            const ncode = ncodeMatch ? ncodeMatch[1].toLowerCase() : null;

            const allLinks = doc.querySelectorAll('a');
            console.log(`[NarouProvider] Total links found in HTML: ${allLinks.length}`);
            
            allLinks.forEach(linkEl => {
                const href = linkEl.getAttribute('href');
                if (!href || href.includes('javascript:')) return;

                let epId = null;
                // ncodeが判明している場合は厳密にチェック。
                if (ncode) {
                    const prefix = `/${ncode}/`;
                    // URLが "/n7787eq/" を含むかチェック
                    const lowerHref = href.toLowerCase();
                    const idx = lowerHref.indexOf(prefix);
                    if (idx !== -1) {
                        // "/n7787eq/1/" -> "1/" の部分を取り出す
                        const remainder = lowerHref.substring(idx + prefix.length);
                        const numMatch = remainder.match(/^(\d+)(?:[/?#]|$)/);
                        if (numMatch) {
                            epId = `${ncode}-${numMatch[1]}`;
                        }
                    }
                } else {
                    const epMatch = href.match(/\/([^/]+)\/(\d+)(?:[/?#]|$)/);
                    if (epMatch && epMatch[1].toLowerCase().startsWith('n')) {
                        epId = `${epMatch[1].toLowerCase()}-${epMatch[2]}`;
                    }
                }

                if (epId) {
                    const epTitle = linkEl.textContent.trim();
                    const fullUrl = new URL(href, 'https://ncode.syosetu.com').href;

                    // 重複排除と空タイトル除外（"次へ"等のページネーションリンクはepIdがないためここで弾かれるはずだが念のため）
                    if (epTitle && epTitle !== '次へ' && epTitle !== '最後へ' && !episodes.find(e => e.url === fullUrl)) {
                        episodes.push({
                            id: epId,
                            title: epTitle,
                            url: fullUrl
                        });
                    }
                }
            });

            // 短編（目次がなく直接本文のページ）の対応
            if (episodes.length === 0) {
                const honbun = doc.querySelector('#novel_honbun') || doc.querySelector('.p-novel__body');
                if (honbun) {
                    console.log(`[NarouProvider] No TOC found but honbun exists. Treating as a short story.`);
                    episodes.push({
                        id: 'short',
                        title: title || '本編',
                        url: novelUrl
                    });
                }
            }

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

    /**
     * カクヨムスクレイピング検索
     * @param {string} query 
     * @param {string} target 'all', 'title', 'author', 'summary', 'keyword'
     */
    async search(query, target = 'all') {
        console.log(`[KakuyomuProvider] Searching for: ${query}, target: ${target}`);
        try {
            const url = `https://kakuyomu.jp/search?q=${encodeURIComponent(query)}`;
            const html = await this.fetchHtml(url);
            console.log(`[KakuyomuProvider] Fetched HTML length: ${html.length}`);
            if (html.length < 1000) {
                console.warn(`[KakuyomuProvider] HTML content suspicious (too short):`, html);
            }
            const doc = this.parseHtml(html);

            const results = [];
            // カクヨムの検索結果のデザインが変わったため（Next.js移行後など）、タイトルリンクを直接探す
            const titleLinks = doc.querySelectorAll('h3 a[href^="/works/"], .widget-workCard-title a');
            console.log(`[KakuyomuProvider] Found ${titleLinks.length} title links.`);

            titleLinks.forEach(titleEl => {
                const title = titleEl.textContent.trim();
                const href = titleEl.getAttribute('href'); // e.g. /works/1177354054897486829

                // 親要素をたどって作者のリンクを探す
                let authorEl = null;
                const parentH3 = titleEl.closest('h3');
                const parentCard = titleEl.closest('.widget-workCard, [class*="WorkCard"], article');

                if (parentH3 && parentH3.parentElement) {
                    authorEl = parentH3.parentElement.querySelector('a[href^="/users/"]');
                } else if (parentCard) {
                    authorEl = parentCard.querySelector('.widget-workCard-authorLabel a, a[href^="/users/"]');
                }

                const author = authorEl ? authorEl.textContent.trim() : 'Unknown Author';

                const match = href.match(/\/works\/(\d+)/);
                if (match) {
                    const id = match[1];
                    // 重複追加の防止
                    if (!results.find(r => r.id === id)) {
                        results.push({
                            id,
                            title,
                            author,
                            url: `https://kakuyomu.jp${href}`
                        });
                    }
                }
            });

            // カクヨムはAPIがないため取得後にフィルタリング（タイトル、作者名のみ対応）
            let filteredResults = results;
            if (target === 'title') {
                filteredResults = results.filter(r => r.title.toLowerCase().includes(query.toLowerCase()));
            } else if (target === 'author') {
                filteredResults = results.filter(r => r.author.toLowerCase().includes(query.toLowerCase()));
            }
            // summary, keyword等については、一覧からあらすじ等が取得できないため現状のまま返す

            return filteredResults;
        } catch (error) {
            console.error(`[KakuyomuProvider] Error searching for "${query}":`, error);
            throw error;
        }
    }

    async getTableOfContents(novelUrl, novelInfo = {}) {
        console.log(`[KakuyomuProvider] Getting TOC for: ${novelUrl}`);
        try {
            const html = await this.fetchHtml(novelUrl);
            const doc = this.parseHtml(html);

            const titleEl = doc.querySelector('#workTitle');
            const authorEl = doc.querySelector('#workAuthor a');

            const title = titleEl ? titleEl.textContent.trim() : (novelInfo.title || 'Unknown Title');
            const author = authorEl ? authorEl.textContent.trim() : (novelInfo.author || 'Unknown Author');
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
