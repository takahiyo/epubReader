/**
 * picker-android.js
 * 
 * Android環境用ピッカー。
 * Androidでは showOpenFilePicker が利用できないケースが多く、
 * OSネイティブの Storage Access Framework (SAF) が立ち上がる
 * 従来の <input type="file"> が最もクラウドストレージ（Google Drive等）と親和性が高い。
 */
import { createFileInput } from './picker-base.js';

export const openFilePicker = async (options = {}, dependencies = {}) => {
    return new Promise((resolve) => {
        const inputId = dependencies.UI_CONSTANTS?.DOM_IDS?.LEGACY_FILE_INPUT || 'legacy-file-input-fallback';
        
        // Androidのファイルピッカーでクラウド（pCloud, Google Drive等）も選べるようにするため、
        // 適切なaccept属性を設定するか、あえて空にして全てを許可する。
        // ここでは options の拡張子からMIMEタイプを生成するか、指定なしとする。
        const input = createFileInput(inputId, '', options.multiple !== false, true);

        const handleFocus = () => {
            setTimeout(() => {
                window.removeEventListener('focus', handleFocus);
                // changeがない場合はキャンセル扱い
                resolve([]);
            }, 500);
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
