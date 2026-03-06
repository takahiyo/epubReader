import { NarouProvider, KakuyomuProvider } from "../core/web-novel-provider.js";
import { UI_CLASSES } from "../../constants/ui.js";

export function setupWebNovelUI({ elements, openModal, closeModal, openExclusiveMenu, confirmModal, ui }) {
    const providers = {
        narou: new NarouProvider(),
        kakuyomu: new KakuyomuProvider()
    };

    let currentEpisodes = [];
    let currentNovelInfo = null;
    let currentProvider = null;

    // 開くボタンのイベントリスナー
    const openSearchModal = () => {
        if (ui && typeof ui.closeAllMenus === 'function') {
            ui.closeAllMenus();
        } else {
            if (elements.floatOverlay && !elements.floatOverlay.classList.contains(UI_CLASSES.HIDDEN)) {
                elements.floatOverlay.classList.remove(UI_CLASSES.ACTIVE);
                setTimeout(() => elements.floatOverlay.classList.add(UI_CLASSES.HIDDEN), 300);
            }
            if (elements.leftMenu) {
                elements.leftMenu.classList.remove(UI_CLASSES.ACTIVE);
                if (elements.leftMenuBackdrop) elements.leftMenuBackdrop.classList.remove(UI_CLASSES.ACTIVE);
            }
        }
        openExclusiveMenu(elements.webNovelSearchModal);
    };

    if (elements.menuWebNovel) {
        elements.menuWebNovel.addEventListener("click", openSearchModal);
    }
    if (elements.floatWebNovel) {
        elements.floatWebNovel.addEventListener("click", openSearchModal);
    }

    // 閉じるボタンのイベントリスナー
    if (elements.closeWebNovelSearchModal) {
        elements.closeWebNovelSearchModal.addEventListener("click", () => closeModal(elements.webNovelSearchModal));
    }
    if (elements.closeWebNovelTocModal) {
        elements.closeWebNovelTocModal.addEventListener("click", () => closeModal(elements.webNovelTocModal));
    }

    // 検索処理
    if (elements.webNovelSearchBtn && elements.webNovelSearchInput) {
        elements.webNovelSearchBtn.addEventListener("click", async () => {
            const query = elements.webNovelSearchInput.value.trim();
            if (!query) return;

            const useNarou = elements.webNovelSourceNarou ? elements.webNovelSourceNarou.checked : true;
            const useKakuyomu = elements.webNovelSourceKakuyomu ? elements.webNovelSourceKakuyomu.checked : true;

            if (!useNarou && !useKakuyomu) {
                alert("検索対象を選択してください。");
                return;
            }

            elements.webNovelSearchBtn.disabled = true;
            elements.webNovelSearchBtn.textContent = "検索中...";
            elements.webNovelSearchResults.innerHTML = "<p>検索しています...</p>";

            try {
                // プロバイダーで検索（必要に応じて並列）
                const searchTasks = [];
                if (useNarou) searchTasks.push(providers.narou.search(query).catch(e => { console.error(e); return []; }));
                if (useKakuyomu) searchTasks.push(providers.kakuyomu.search(query).catch(e => { console.error(e); return []; }));

                const results = await Promise.all(searchTasks);

                let combined = [];
                let taskIdx = 0;
                if (useNarou) {
                    combined = [...combined, ...results[taskIdx++].map(r => ({ ...r, provider: 'narou', providerName: '小説家になろう' }))];
                }
                if (useKakuyomu) {
                    combined = [...combined, ...results[taskIdx++].map(r => ({ ...r, provider: 'kakuyomu', providerName: 'カクヨム' }))];
                }

                renderSearchResults(combined);
            } catch (err) {
                console.error("Search failed:", err);
                elements.webNovelSearchResults.innerHTML = "<p>検索に失敗しました。</p>";
            } finally {
                elements.webNovelSearchBtn.disabled = false;
                elements.webNovelSearchBtn.textContent = "検索";
            }
        });

        elements.webNovelSearchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                elements.webNovelSearchBtn.click();
            }
        });
    }

    function renderSearchResults(results) {
        if (!elements.webNovelSearchResults) return;
        elements.webNovelSearchResults.innerHTML = "";

        if (results.length === 0) {
            elements.webNovelSearchResults.innerHTML = "<p>見つかりませんでした。</p>";
            return;
        }

        results.forEach(novel => {
            const card = document.createElement("div");
            card.className = "library-item"; // 再利用
            card.innerHTML = `
                <div class="library-item-placeholder" style="background:var(--bg-panel); color:var(--text-primary); border: 1px solid var(--border);">
                    <div style="font-size:2rem; margin-bottom:0.5rem;">${novel.provider === 'narou' ? '📖' : '🖋️'}</div>
                    <div style="font-size:0.8rem; opacity:0.8;">${novel.providerName}</div>
                </div>
                <div class="library-item-info">
                    <h5 class="library-item-title">${novel.title}</h5>
                    <p class="library-item-meta">${novel.author}</p>
                    ${novel.rating ? `<p class="library-item-meta" style="color:var(--accent-color); font-weight:bold;">★ ${Number(novel.rating).toLocaleString()} pt ${novel.reviewCount ? `(${Number(novel.reviewCount).toLocaleString()} reviews)` : ''}</p>` : ''}
                </div>
            `;

            card.addEventListener("click", () => openToc(novel));
            elements.webNovelSearchResults.appendChild(card);
        });
    }

    async function openToc(novel) {
        closeModal(elements.webNovelSearchModal);
        elements.webNovelTocList.innerHTML = "<p>目次を読み込んでいます...</p>";
        elements.webNovelTocAuthor.textContent = `${novel.author} (${novel.providerName})`;
        if (elements.webNovelTocModalTitle) elements.webNovelTocModalTitle.textContent = novel.title;
        openExclusiveMenu(elements.webNovelTocModal);

        const provider = providers[novel.provider];
        try {
            const tocData = await provider.getTableOfContents(novel.url);

            currentNovelInfo = { id: novel.id, title: tocData.title, author: tocData.author, url: novel.url };
            currentEpisodes = tocData.episodes;
            currentProvider = provider;

            renderTocList(tocData.episodes);
        } catch (err) {
            console.error("Failed to load TOC:", err);
            elements.webNovelTocList.innerHTML = "<p>目次の取得に失敗しました。</p>";
        }
    }

    function renderTocList(episodes) {
        elements.webNovelTocList.innerHTML = "";
        if (episodes.length === 0) {
            elements.webNovelTocList.innerHTML = "<p>エピソードが見つかりません。</p>";
            return;
        }

        episodes.forEach((ep, index) => {
            const li = document.createElement("li");
            li.className = "history-item"; // 再利用
            li.innerHTML = `
                <div class="history-info">
                    <span class="history-title">${ep.title}</span>
                </div>
            `;
            li.addEventListener("click", () => {
                closeModal(elements.webNovelTocModal);
                if (window.app && window.app.loadWebNovel) {
                    window.app.loadWebNovel(currentNovelInfo, currentEpisodes, currentProvider, index);
                }
            });
            elements.webNovelTocList.appendChild(li);
        });
    }

    // 戻るボタンのイベントリスナー
    if (elements.backToWebNovelSearch) {
        elements.backToWebNovelSearch.addEventListener("click", () => {
            closeModal(elements.webNovelTocModal);
            openModal(elements.webNovelSearchModal);
        });
    }

    // ライブラリに追加ボタン
    if (elements.webNovelAddToLibraryBtn) {
        elements.webNovelAddToLibraryBtn.addEventListener("click", async () => {
            if (!currentNovelInfo || !currentEpisodes) return;

            // TODO: fileStore.jsにWeb Novel用のスタブを保存する処理を呼び出す
            console.log("Adding to library:", currentNovelInfo);
            // closeWebNovelTocModal()
            // toast("ライブラリに追加しました")
        });
    }
}
