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

        const platform = detectPlatform();
        const isQuest = platform === PLATFORM_TYPES.QUEST3;
        const useBroadPicker = isQuest || options.broad;

        // [BEFORE]
        // // 指定がない場合、または空の場合はデフォルトの電子書籍/書庫フォーマットを指定して
        // // Androidの「カメラ」「写真」インテントが起動するのを防ぐ
        // if (!acceptString) {
        //     acceptString = '.epub,.zip,.cbz,.rar,.cbr,application/epub+zip,application/zip,application/x-cbz,application/x-cbr,application/vnd.rar,application/x-rar-compressed';
        // }
        // 
        // const input = createFileInput(inputId, acceptString, options.multiple !== false, true);
        // [AFTER]
        // Quest 3の場合は、OSの制限付きメディアピッカーを回避して
        // クラウドストレージ等も選択できる多機能ピッカーを起動するため、
        // acceptを*/*にする。
        if (useBroadPicker) {
            acceptString = '*/*';
            console.log(`[picker-android] Quest 3 or broad option detected. Forcing acceptString to '*/*' for system picker.`);
        } else if (!acceptString) {
            acceptString = '.epub,.zip,.cbz,.rar,.cbr,application/epub+zip,application/zip,application/x-cbz,application/x-cbr,application/vnd.rar,application/x-rar-compressed';
        }
        
        const isMultiple = useBroadPicker ? false : (options.multiple !== false);
        const input = createFileInput(inputId, acceptString, isMultiple, true);

        const startTime = Date.now();
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
