/**
 * file-picker.js
 * 
 * ファイルピッカー呼び出しのUI依存ロジックを管理する。
 * 動作環境に応じて、モダンAPI (showOpenFilePicker) と
 * 従来方式 (<input type="file">) を切り替える。
 */

import { isQuest3, SUPPORTED_FORMATS } from "../../constants.js";

let dependencies = {
    UI_CONSTANTS: null,
};

/**
 * @typedef {Object} FilePickerDeps
 * @property {typeof import('../constants/ui.js')} UI_CONSTANTS
 */

/**
 * モジュールの依存関係を初期化する
 * @param {FilePickerDeps} deps
 */
export function init(deps) {
    dependencies.UI_CONSTANTS = deps.UI_CONSTANTS;
}

/**
 * ファイルピッカーを開き、選択されたファイルの配列を返す
 * @param {Object} options 
 * @returns {Promise<File[]>}
 */
export const openFilePicker = async (options = {}) => {
    // Quest 環境: showOpenFilePicker も制限付きピッカーを表示するため、
    // input type="file" を accept 属性なしで使い、ACTION_GET_CONTENT 経由の
    // 広いアプリ選択（ファイラー・共有フォルダ等）を狙う
    if (isQuest3()) {
        return await executeFallbackPicker(options);
    }

    // 非Quest: モダンな File System Access API を試行
    if (window.showOpenFilePicker) {
        try {
            const pickerOptions = {
                multiple: options.multiple !== false,
                excludeAcceptAllOption: false,
                types: [
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
            console.warn('[filePicker] showOpenFilePicker failed or cancelled:', e);
            if (e.name === 'AbortError') return [];
            // エラー時は従来のフォールバックへ
        }
    }
    
    return await executeModernPicker(options);
};

/**
 * Fallback Mode: <input type="file"> を動的生成して発火
 * @returns {Promise<File[]>}
 */
const executeFallbackPicker = (options = {}) => {
    return new Promise((resolve) => {
        const inputId = dependencies.UI_CONSTANTS?.DOM_IDS?.FALLBACK_INPUT_ID || '__quest3_file_picker_input';
        
        let input = document.getElementById(inputId);
        if (input) {
            input.remove();
        }

        input = document.createElement('input');
        input.type = 'file';
        input.id = inputId;
        input.style.display = 'none';
        
        // 【重要】複数選択を無効化。
        // Android/Quest OS では multiple があるとメディアピッカーが強制され、
        // 外部ファイラー（AnExplorer等）が選択肢から消えるケースがあるため。
        input.multiple = false;

        // 以前の正常動作時（commit c3b4dcfb）に近い拡張子リストを設定。
        // MIMEタイプと拡張子を混ぜて、OSに「適切なアプリ」を探させる。
        const formats = [
            ...SUPPORTED_FORMATS.EPUB,
            ...SUPPORTED_FORMATS.IMAGE_ARCHIVE,
            ...SUPPORTED_FORMATS.WEB_NOVEL,
            'application/epub+zip',
            'application/zip'
        ].join(',');
        input.accept = formats;

        console.log('[Quest3Picker] Triggering picker with:', {
            accept: input.accept,
            multiple: input.multiple,
            userAgent: navigator.userAgent
        });

        const handleFocus = () => {
            console.log('[Quest3Picker] Window focused, checking for file selection...');
            // キャンセル検知用
            setTimeout(() => {
                if (input) {
                    console.log('[Quest3Picker] No change event detected, cleaning up.');
                    input.remove();
                    resolve([]);
                }
            }, 1000); // 復帰後のタイムアウトを少し長めに設定
            window.removeEventListener('focus', handleFocus);
        };

        input.addEventListener('change', (e) => {
            console.log('[Quest3Picker] Change event fired!');
            window.removeEventListener('focus', handleFocus);
            const files = Array.from(e.target.files || []);
            console.log('[Quest3Picker] Files selected:', files.map(f => f.name));
            input.remove();
            resolve(files);
        });

        window.addEventListener('focus', handleFocus);
        document.body.appendChild(input);
        
        console.log('[Quest3Picker] Executing input.click()...');
        input.click();
    });
};

/**
 * Modern Mode: 既存のレガシーインプット利用（Windows等フリーズ回避用）
 * 実際にはshowOpenFilePickerの代わりに以前app.jsにあった入力要素のクリックを利用
 * @returns {Promise<File[]>}
 */
const executeModernPicker = (options = {}) => {
    return new Promise((resolve) => {
        // [REF] logic moved from app.js:ensureLegacyFileInput and openFileDialog
        const inputId = dependencies.UI_CONSTANTS?.DOM_IDS?.LEGACY_FILE_INPUT || 'legacy-file-input-fallback';
        
        let input = document.getElementById(inputId);
        if (!input) {
            input = document.createElement("input");
            input.type = "file";
            input.id = inputId;
            // Windowsのファイルピッカーフリーズ対策: accept属性を設定しない
            input.style.display = "none";
            document.body.appendChild(input);
        } else {
            // 既存のリスナーがあれば上書きできないので一旦クローンしてリスナーをクリア
            const newTarget = input.cloneNode(true);
            input.parentNode.replaceChild(newTarget, input);
            input = newTarget;
        }

        if (options.multiple !== false) {
            input.multiple = true;
        } else {
            input.removeAttribute('multiple');
        }

        const handleFocus = () => {
            setTimeout(() => {
                window.removeEventListener('focus', handleFocus);
                // changeがない場合はキャンセル
                // 既存のinputは使い回すためremoveしないが、resolveは空で返す
                resolve([]);
            }, 300);
        };

        input.addEventListener("change", (e) => {
            window.removeEventListener('focus', handleFocus);
            const files = Array.from(e.target.files || []);
            e.target.value = ""; // リセット
            resolve(files);
        }, { once: true });

        window.addEventListener('focus', handleFocus);
        
        input.click();
    });
};
