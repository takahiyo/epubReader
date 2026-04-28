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
    // 1. モダンな File System Access API を試行 (もしサポートされていればこれが最良)
    if (window.showOpenFilePicker) {
        try {
            // SUPPORTED_FORMATS.EPUB 等から種類を生成
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

    if (isQuest3()) {
        return await executeFallbackPicker(options);
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
        
        if (options.multiple !== false) {
            input.multiple = true;
        }

        // 拡張子の制限設定
        // Quest 3 OSアップデート対策: 拡張子を絞ると制限されたピッカーが出るため、*/* で標準ピッカーを強制する
        input.accept = '*/*';

        const handleFocus = () => {
            // キャンセル検知用: ウィンドウフォーカス復帰後しばらくして
            // change イベントが発火しなければキャンセルとみなす
            setTimeout(() => {
                if (input) {
                    input.remove();
                    resolve([]); // 空の配列を返してキャンセル扱いとする
                }
            }, 300);
            window.removeEventListener('focus', handleFocus);
        };

        input.addEventListener('change', (e) => {
            window.removeEventListener('focus', handleFocus);
            const files = Array.from(e.target.files || []);
            input.remove();
            resolve(files);
        });

        // iOS/Quest等でファイル選択ダイアログが閉じた後の復帰検知
        window.addEventListener('focus', handleFocus);

        document.body.appendChild(input);
        
        // ユーザージェスチャから直接呼ばれている前提でclick発火
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
