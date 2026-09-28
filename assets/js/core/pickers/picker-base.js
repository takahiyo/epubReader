/**
 * picker-base.js
 * 
 * すべての環境別ピッカーモジュールが実装すべきインターフェース
 */

export const PickerInterface = {
    /**
     * @param {Object} options 
     * @param {Object} dependencies 
     * @returns {Promise<File[]>}
     */
    openFilePicker: async (options, dependencies) => {
        throw new Error('Not implemented');
    }
};

/**
 * 従来の <input type="file"> 要素を生成・管理するユーティリティ
 */
export const createFileInput = (id, accept = '', multiple = false, hiddenStyle = true) => {
    let input = document.getElementById(id);
    if (input) {
        // イベントリスナーをクリアするためにクローン
        const newTarget = input.cloneNode(true);
        input.parentNode.replaceChild(newTarget, input);
        input = newTarget;
    } else {
        input = document.createElement('input');
        input.type = 'file';
        input.id = id;
        document.body.appendChild(input);
    }
    
    if (hiddenStyle) {
        Object.assign(input.style, {
            position: 'fixed',
            top: '-100px',
            left: '-100px',
            width: '1px',
            height: '1px',
            opacity: '0',
            pointerEvents: 'none'
        });
    }

    if (multiple) {
        input.multiple = true;
    } else {
        input.removeAttribute('multiple');
    }

    if (accept) {
        input.accept = accept;
    } else {
        input.removeAttribute('accept');
    }
    
    return input;
};

/**
 * Wait for the native file result, including slow cloud-provider downloads.
 * Focus returning is not cancellation; only the input's cancel event is definitive.
 * @returns {Promise<File[]>} Selected files, or an empty list on cancellation.
 */
export function openLegacyFilePicker(input) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            input.removeEventListener('change', change);
            input.removeEventListener('cancel', cancel);
        };
        const finish = (files) => {
            cleanup();
            input.value = '';
            resolve(files);
        };
        const change = () => finish(Array.from(input.files ?? []));
        const cancel = () => finish([]);
        input.value = '';
        input.addEventListener('change', change);
        input.addEventListener('cancel', cancel);
        try { input.click(); } catch (error) { cleanup(); reject(error); }
    });
}
