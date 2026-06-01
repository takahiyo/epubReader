/**
 * picker-quest3.js
 * 
 * Quest 3 専用ピッカーモジュール。
 * Quest 3 の Scoped Storage 制限を回避するため、専用モーダルを開き、
 * ネットワーク取得（FetchAPI）、ローカルファイルフォールバック、OPFS（ライブラリ）の3つの入口を提供する。
 */
import { createFileInput } from './picker-base.js';
import { fetchFileFromNetwork, getNetworkHistory, addNetworkHistory } from './network-loader.js';
import { showLoading, hideLoading } from '../../ui/overlay-manager.js';
import { elements } from '../../ui/elements.js';

let modalResolve = null;

export const openFilePicker = async (options = {}, dependencies = {}) => {
    return new Promise((resolve) => {
        // すでに開いている場合はキャンセル
        if (modalResolve) {
            modalResolve([]);
        }
        modalResolve = resolve;
        
        setupQuest3Modal();
        openModal();
    });
};

const openModal = () => {
    if (elements.quest3PickerModal) {
        elements.quest3PickerModal.classList.remove('hidden');
        renderHistory();
    } else {
        console.error('[picker-quest3] Modal element not found');
        cleanupAndResolve([]);
    }
};

const closeModal = () => {
    if (elements.quest3PickerModal) {
        elements.quest3PickerModal.classList.add('hidden');
    }
};

const cleanupAndResolve = (files) => {
    closeModal();
    if (modalResolve) {
        modalResolve(files);
        modalResolve = null;
    }
};

const renderHistory = () => {
    if (!elements.networkHistory) return;
    const history = getNetworkHistory();
    elements.networkHistory.innerHTML = '';
    
    if (history.length === 0) {
        elements.networkHistory.innerHTML = '<span style="color:var(--text-secondary);font-size:0.9rem;">履歴はありません</span>';
        return;
    }
    
    history.forEach(url => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.style.cssText = 'padding: 8px; border-bottom: 1px solid var(--border); cursor: pointer; word-break: break-all; color: var(--accent); font-size: 0.9rem;';
        item.textContent = url;
        item.addEventListener('click', () => {
            if (elements.networkUrlInput) {
                elements.networkUrlInput.value = url;
            }
        });
        elements.networkHistory.appendChild(item);
    });
};

// 初回呼び出し時のみイベントリスナーを設定するフラグ
let isModalSetup = false;

const setupQuest3Modal = () => {
    if (isModalSetup) return;
    isModalSetup = true;

    // 閉じるボタン
    if (elements.closeQuest3Picker) {
        elements.closeQuest3Picker.addEventListener('click', () => cleanupAndResolve([]));
    }
    // バックドロップ
    const backdrop = elements.quest3PickerModal?.querySelector('.modal-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => cleanupAndResolve([]));
    }

    // ネットワークから取得ボタン
    if (elements.networkFetchBtn) {
        elements.networkFetchBtn.addEventListener('click', async () => {
            const url = elements.networkUrlInput?.value?.trim();
            if (!url) {
                alert('URLを入力してください');
                return;
            }

            const user = elements.networkAuthUser?.value || '';
            const pass = elements.networkAuthPass?.value || '';

            try {
                showLoading();
                const file = await fetchFileFromNetwork(url, {
                    user,
                    pass,
                    // TODO: プログレスバーUIを出すことも可能
                });
                
                addNetworkHistory(url);
                hideLoading();
                cleanupAndResolve([file]);
            } catch (err) {
                hideLoading();
                alert(`ダウンロードに失敗しました: ${err.message}\nCORS設定等を確認してください。`);
            }
        });
    }

    // ローカルファイルを選択（フォールバック input type="file"）
    if (elements.quest3LocalFileBtn) {
        elements.quest3LocalFileBtn.addEventListener('click', () => {
            const randomId = `q3_picker_${Math.floor(Math.random() * 10000)}`;
            const input = createFileInput(randomId, '', false, true);

            const handleFocus = () => {
                setTimeout(() => {
                    window.removeEventListener('focus', handleFocus);
                    if (input.parentNode) input.remove();
                    // input.click()後、ファイル未選択でフォーカスが戻っても
                    // モーダルは閉じないようにするか、閉じるか。ここではそのままにする
                }, 1000);
            };

            input.addEventListener('change', (e) => {
                window.removeEventListener('focus', handleFocus);
                const files = Array.from(e.target.files || []);
                input.remove();
                cleanupAndResolve(files);
            }, { once: true });

            window.addEventListener('focus', handleFocus);
            input.click();
        });
    }

    // ライブラリから選択
    if (elements.quest3LibraryBtn) {
        elements.quest3LibraryBtn.addEventListener('click', () => {
            cleanupAndResolve([]); // 空配列を返してピッカー処理を終了
            // app.js側のグローバル関数(showLibrary)を呼ぶなど
            // モジュールからは少し汚いがUIのイベント発火で代用する
            const menuLibrary = document.getElementById('menuLibrary');
            if (menuLibrary) menuLibrary.click();
        });
    }
};
