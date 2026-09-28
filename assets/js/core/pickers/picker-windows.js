/**
 * picker-windows.js
 * 
 * Windows等デスクトップ環境用ピッカー。
 * モダンな File System Access API (showOpenFilePicker) を優先し、
 * 非対応ブラウザではフォールバックする。
 */
import { createFileInput, openLegacyFilePicker } from './picker-base.js';

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
    const inputId = dependencies.UI_CONSTANTS?.DOM_IDS?.LEGACY_FILE_INPUT || 'legacy-file-input-fallback';
    const input = createFileInput(inputId, '', options.multiple !== false, true);
    return openLegacyFilePicker(input);
};
