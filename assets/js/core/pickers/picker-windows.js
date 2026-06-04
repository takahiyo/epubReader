/**
 * picker-windows.js
 * 
 * Windows等デスクトップ環境用ピッカー。
 * モダンな File System Access API (showOpenFilePicker) を優先し、
 * 非対応ブラウザではフォールバックする。
 */
import { createFileInput } from './picker-base.js';

export const openFilePicker = async (options = {}, dependencies = {}) => {
    // モダン API の試行
    if (window.showOpenFilePicker) {
        try {
            const pickerOptions = {
                multiple: options.multiple !== false,
                excludeAcceptAllOption: false,
                types: options.types || [
                    {
                        description: 'Book Files',
                        accept: {
                            'application/epub+zip': ['.epub'],
                            'application/zip': ['.zip', '.cbz'],
                            'application/x-rar-compressed': ['.rar', '.cbr'],
                            'text/plain': ['.txt'],
                            'text/html': ['.html']
                        }
                    }
                ]
            };
            const handles = await window.showOpenFilePicker(pickerOptions);
            return await Promise.all(handles.map(h => h.getFile()));
        } catch (e) {
            console.warn('[picker-windows] showOpenFilePicker failed or cancelled:', e);
            if (e.name === 'AbortError') return [];
            // エラー時はフォールバックへ
        }
    }
    
    // フォールバック: input type="file"
    return new Promise((resolve) => {
        const inputId = dependencies.UI_CONSTANTS?.DOM_IDS?.LEGACY_FILE_INPUT || 'legacy-file-input-fallback';
        
        // Windowsのファイルピッカーフリーズ対策: display:none は createFileInput で hiddenStyle:true として実装済み
        // acceptsは設定しない
        const input = createFileInput(inputId, '', options.multiple !== false, true);

        // [BEFORE]
        // const handleFocus = () => {
        //     setTimeout(() => {
        //         window.removeEventListener('focus', handleFocus);
        //         resolve([]);
        //     }, 300);
        // };
        // [AFTER]
        const handleFocus = () => {
            // タッチデバイス（Questやモバイル）の場合は、OSの処理遅延を考慮して3秒の猶予を設ける
            const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            const timeoutDelay = isTouch ? 3000 : 300;
            setTimeout(() => {
                window.removeEventListener('focus', handleFocus);
                resolve([]);
            }, timeoutDelay);
        };

        input.addEventListener("change", (e) => {
            window.removeEventListener('focus', handleFocus);
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            resolve(files);
        }, { once: true });

        window.addEventListener('focus', handleFocus);
        
        input.click();
    });
};
