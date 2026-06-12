/**
 * picker-android.js
 * 
 * Android環境用ピッカー。
 * Androidでは showOpenFilePicker が利用できないケースが多く、
 * OSネイティブの Storage Access Framework (SAF) が立ち上がる
 * 従来の <input type="file"> が最もクラウドストレージ（Google Drive等）と親和性が高い。
 */
// [BEFORE]
// import { createFileInput } from './picker-base.js';
// import { detectPlatform, PLATFORM_TYPES } from '../../constants.js';
// [AFTER]
import { createFileInput } from './picker-base.js';
import { detectPlatform, PLATFORM_TYPES } from '../../../constants.js';

export const openFilePicker = async (options = {}, dependencies = {}) => {
    return new Promise((resolve) => {
        const inputId = dependencies.UI_CONSTANTS?.DOM_IDS?.LEGACY_FILE_INPUT || 'legacy-file-input-fallback';
        
        // optionsから accept 文字列を組み立てる
        let acceptString = '';
        if (options.types && options.types.length > 0) {
            const accepts = [];
            options.types.forEach(t => {
                if (t.accept) {
                    Object.entries(t.accept).forEach(([mime, extensions]) => {
                        accepts.push(mime);
                        if (Array.isArray(extensions)) {
                            accepts.push(...extensions);
                        }
                    });
                }
            });
            acceptString = accepts.join(',');
        }

        // [BEFORE]
        // const platform = detectPlatform();
        // const isQuest = platform === PLATFORM_TYPES.QUEST3;
        // const useBroadPicker = isQuest || options.broad;
        // [AFTER]
        const platform = detectPlatform();
        const isQuest = platform === PLATFORM_TYPES.QUEST3;
        const useBroadPicker = isQuest || options.broad;

        // [BEFORE]
        // if (useBroadPicker) {
        //     acceptString = '';
        //     console.log(`[picker-android] Quest 3 or broad option detected. Forcing acceptString to '' (empty) for system picker.`);
        // } else if (!acceptString) {
        //     acceptString = '.epub,.zip,.cbz,.rar,.cbr,application/epub+zip,application/zip,application/x-cbz,application/x-cbr,application/vnd.rar,application/x-rar-compressed';
        // }
        // すべてのAndroid/iOS/iPad環境で acceptString を空にして、
        // Storage Access Framework (SAF) のフルシステムピッカーを起動します。
        // これにより共有フォルダやクラウドストレージ（Google Drive等）のファイルも選択可能になります。
        // 一部端末でカメラ等の選択肢が追加表示される場合がありますが、SAF経由で「ファイル」または
        // 「ドキュメント」を選ぶことで共有ストレージにアクセスできます。
        acceptString = '';
        console.log(`[picker-android] Forcing acceptString to '' (empty) to enable SAF full system picker.`);
        
        // [BEFORE]
        // const isMultiple = options.multiple !== false;
        // const input = createFileInput(inputId, acceptString, isMultiple, true);
        // [AFTER]
        // Quest 3で高度なピッカー（左ペインあり）を起動するためには、multiple属性（複数選択）を有効にする必要があります。
        const isMultiple = options.multiple !== false;
        const input = createFileInput(inputId, acceptString, isMultiple, true);

        const startTime = Date.now();
        
        // 画面のデバッグログを更新
        const debugPickerLog = document.getElementById("debugPickerLog");
        if (debugPickerLog) {
            debugPickerLog.textContent = `android (isQuest:${isQuest}, multiple:${isMultiple}, accept:'${acceptString}')`;
        }

        console.log(`[picker-android] Picker launched at ${new Date(startTime).toLocaleTimeString()}`);

        const handleFocus = () => {
            console.log(`[picker-android] Window focus regained after ${Date.now() - startTime}ms`);
            // [BEFORE]
            // setTimeout(() => {
            //     window.removeEventListener('focus', handleFocus);
            //     // changeがない場合はキャンセル扱い
            //     resolve([]);
            // }, 500);
            // [AFTER]
            setTimeout(() => {
                window.removeEventListener('focus', handleFocus);
                console.log(`[picker-android] Timeout reached. Resolving as cancelled (empty).`);
                resolve([]);
            }, 3000);
        };

        input.addEventListener("change", (e) => {
            window.removeEventListener('focus', handleFocus);
            const files = Array.from(e.target.files || []);
            console.log(`[picker-android] Change event fired after ${Date.now() - startTime}ms. Files:`, files.map(f => f.name));
            e.target.value = ""; // リセット
            resolve(files);
        }, { once: true });

        window.addEventListener('focus', handleFocus);
        
        input.click();
    });
};
