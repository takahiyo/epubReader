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

        // 以前の入力があれば削除
        if (input) input.remove();

        // 【対策】IDをランダム化してブラウザのキャッシュ（前回のピッカータイプ保持）を回避
        const randomId = `q3_picker_${Math.floor(Math.random() * 10000)}`;
        
        input = document.createElement('input');
        input.type = 'file';
        input.id = randomId;
        
        // 【対策】display: none ではなく、物理的に存在するが隠れている状態にする。
        // 一部のブラウザでは非表示要素からの click 発火を制限したり、
        // インテントの優先度を下げたりするため。
        Object.assign(input.style, {
            position: 'fixed',
            top: '-100px',
            left: '-100px',
            width: '1px',
            height: '1px',
            opacity: '0',
            pointerEvents: 'none'
        });
        
        // 複数選択は無効（メディアピッカー強制回避のため）
        input.multiple = false;

        // 【ユーザー提案】拡張子指定をあえて行わない（または最小限にする）。
        // ブラウザが「特定のファイル用」と判断して制限付きピッカーを出すのを防ぐ。
        // 空文字にする、あるいは最も汎用的な */* のみにする。
        input.accept = ''; 

        console.log(`[Quest3Picker] Triggering BROAD picker (ID: ${randomId})`);

        const handleFocus = () => {
            setTimeout(() => {
                if (input) {
                    input.remove();
                    resolve([]);
                }
            }, 1000);
            window.removeEventListener('focus', handleFocus);
        };

        input.addEventListener('change', (e) => {
            window.removeEventListener('focus', handleFocus);
            const files = Array.from(e.target.files || []);
            console.log('[Quest3Picker] Files selected:', files.map(f => f.name));
            input.remove();
            resolve(files);
        });

        window.addEventListener('focus', handleFocus);
        document.body.appendChild(input);
        
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
