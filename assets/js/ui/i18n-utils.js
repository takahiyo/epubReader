/**
 * assets/js/ui/i18n-utils.js
 * 
 * 多言語化とエラー処理関連のユーティリティモジュールです。
 */

import { translate, ERROR_MESSAGE_MATCHERS } from "../../i18n.js";

/**
 * i18n.js からインポートした関数をラップ
 * @param {string} key 
 * @param {string} uiLanguage 
 * @returns {string} 翻訳後の文字列
 */
export function t(key, uiLanguage) {
    return translate(key, uiLanguage);
}

/**
 * エラーオブジェクトのメッセージから定義済みのエラーコードを特定します
 * @param {Error} error 
 * @returns {string|null} エラーコード
 */
export function resolveErrorCode(error) {
    if (!error?.message) return null;
    const entries = Object.entries(ERROR_MESSAGE_MATCHERS);
    for (const [code, matchers] of entries) {
        if (matchers.some((matcher) => error.message.includes(matcher))) {
            return code;
        }
    }
    return null;
}
