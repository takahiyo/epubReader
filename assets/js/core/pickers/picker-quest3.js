/**
 * picker-quest3.js
 * 
 * Quest 3 専用ピッカーモジュール。
 * Quest 3 の Scoped Storage 制限を回避するため、専用モーダルを開き、
 * ローカルファイル選択（全ファイル対応）とライブラリの2つの入口を提供する。
 */
import { createFileInput } from './picker-base.js';
import { elements } from '../../ui/elements.js';

let modalResolve = null;

export const openFilePicker = async (options = {}, dependencies = {}) => {
    return new Promise((resolve) => {
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

let isModalSetup = false;

const setupQuest3Modal = () => {
    if (isModalSetup) return;
    isModalSetup = true;

    if (elements.closeQuest3Picker) {
        elements.closeQuest3Picker.addEventListener('click', () => cleanupAndResolve([]));
    }
    const backdrop = elements.quest3PickerModal?.querySelector('.modal-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => cleanupAndResolve([]));
    }

    // ローカルファイルを選択（全ファイル対応、accept制限なし）
    if (elements.quest3LocalFileBtn) {
        elements.quest3LocalFileBtn.addEventListener('click', () => {
            const randomId = `q3_picker_${Math.floor(Math.random() * 10000)}`;
            const input = createFileInput(randomId, '', false, true);

            const handleFocus = () => {
                setTimeout(() => {
                    window.removeEventListener('focus', handleFocus);
                    if (input.parentNode) input.remove();
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
            cleanupAndResolve([]);
            const menuLibrary = document.getElementById('menuLibrary');
            if (menuLibrary) menuLibrary.click();
        });
    }
};
