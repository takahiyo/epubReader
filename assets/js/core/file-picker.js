/**
 * file-picker.js
 * 
 * ファイルピッカー呼び出しのUI依存ロジックを管理するルーター。
 * 動作環境を判定し、それぞれの環境に最適なピッカーモジュールへ処理を委譲する。
 */

import { detectPlatform, PLATFORM_TYPES } from '../../constants.js';
import { openFilePicker as quest3Picker } from './pickers/picker-quest3.js';
import { openFilePicker as androidPicker } from './pickers/picker-android.js';
import { openFilePicker as windowsPicker } from './pickers/picker-windows.js';

let dependencies = {
    UI_CONSTANTS: null,
};

const PICKER_MAP = {
    [PLATFORM_TYPES.QUEST3]: quest3Picker, // Quest 3: showOpenFilePicker → input fallback（全ファイル選択可）
    [PLATFORM_TYPES.ANDROID]: androidPicker,
    [PLATFORM_TYPES.WINDOWS]: windowsPicker,
    [PLATFORM_TYPES.IOS]: androidPicker, // iOSも現状はAndroid同様レガシーinputを利用する
    [PLATFORM_TYPES.IPAD]: androidPicker, // iPadも現状はレガシーinputを利用する
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
    const platform = detectPlatform();
    const picker = PICKER_MAP[platform] || windowsPicker; // 判定できない環境はWindows(汎用)ピッカーを利用
    console.log(`[filePicker] Platform detected: ${platform}, using specific picker module.`);
    
    return picker(options, dependencies);
};

