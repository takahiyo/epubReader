/**
 * picker-quest3.js
 * 
 * Quest 3 専用ピッカーモジュール。
 * まず File System Access API (showOpenFilePicker) を試行し、
 * 非対応・失敗時は <input type="file"> にフォールバックする。
 * accept 制限なし・multiple 有効で SAF フルシステムピッカーを起動する。
 */
import { createFileInput, openLegacyFilePicker } from './picker-base.js';

export const openFilePicker = async (options = {}, dependencies = {}) => {
    // モダン API の試行
    if (window.showOpenFilePicker) {
        try {
            const pickerOptions = {
                multiple: true,
                excludeAcceptAllOption: false,
                startIn: 'documents',
            };
            const handles = await window.showOpenFilePicker(pickerOptions);
            return await Promise.all(handles.map(h => h.getFile()));
        } catch (e) {
            console.warn('[picker-quest3] showOpenFilePicker failed or cancelled:', e);
            if (e.name === 'AbortError') return [];
        }
    }

    // フォールバック: input type="file" (accept制限なし、multiple)
    const inputId = dependencies.UI_CONSTANTS?.DOM_IDS?.LEGACY_FILE_INPUT || 'legacy-file-input-fallback';
    const input = createFileInput(inputId, '', options.multiple !== false, true);
    return openLegacyFilePicker(input);
};
