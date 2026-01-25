/**
 * i18n/index.js - 国際化 (Internationalization) モジュール
 *
 * UI文字列取得ロジックの集約ポイント。
 */

import { UI_STRINGS_JA } from "./ja.js";
import { UI_STRINGS_EN } from "./en.js";

// ============================================
// UI文字列定義
// ============================================
export const UI_STRINGS = Object.freeze({
  ja: UI_STRINGS_JA,
  en: UI_STRINGS_EN,
});

// ============================================
// デフォルト言語
// ============================================
export const DEFAULT_LANGUAGE = "en";

// ============================================
// サポート言語リスト
// ============================================
export const SUPPORTED_LANGUAGES = Object.freeze(Object.keys(UI_STRINGS));

// ============================================
// ヘルパー関数
// ============================================

/**
 * 指定言語のUI文字列を取得
 * @param {string} language - 言語コード ("ja" | "en")
 * @returns {Object} UI文字列オブジェクト
 */
export function getUiStrings(language = DEFAULT_LANGUAGE) {
  return UI_STRINGS[language] ?? UI_STRINGS[DEFAULT_LANGUAGE];
}

/**
 * 指定キーの翻訳文字列を取得
 * @param {string} key - 翻訳キー
 * @param {string} language - 言語コード
 * @returns {string} 翻訳文字列
 */
export function t(key, language = DEFAULT_LANGUAGE) {
  const strings = getUiStrings(language);
  return strings[key] ?? key;
}

/**
 * プレースホルダーを置換した翻訳文字列を取得
 * @param {string} key - 翻訳キー
 * @param {Object} replacements - 置換マップ { placeholder: value }
 * @param {string} language - 言語コード
 * @returns {string} 置換済み翻訳文字列
 */
export function tReplace(key, replacements = {}, language = DEFAULT_LANGUAGE) {
  let text = t(key, language);
  Object.entries(replacements).forEach(([placeholder, value]) => {
    text = text.replace(`{${placeholder}}`, value);
  });
  return text;
}

/**
 * ブラウザの言語設定から最適な言語を検出
 * @returns {string} 言語コード
 */
export function detectBrowserLanguage() {
  if (typeof navigator === "undefined") return DEFAULT_LANGUAGE;
  const browserLang = navigator.language?.split("-")[0];
  return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : DEFAULT_LANGUAGE;
}

/**
 * 相対時間の表示用文字列を取得
 * @param {number} timestamp - UNIX timestamp (ms)
 * @param {string} language - 言語コード
 * @returns {string} 相対時間の文字列
 */
export function formatRelativeTime(timestamp, language = DEFAULT_LANGUAGE) {
  if (!timestamp) return "";
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return t("timeJustNow", language);
  }
  if (diffMinutes < 60) {
    return tReplace("timeMinutesAgo", { n: diffMinutes }, language);
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return tReplace("timeHoursAgo", { n: diffHours }, language);
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return tReplace("timeDaysAgo", { n: diffDays }, language);
  }
  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 4) {
    return tReplace("timeWeeksAgo", { n: diffWeeks }, language);
  }
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) {
    return tReplace("timeMonthsAgo", { n: diffMonths }, language);
  }
  const diffYears = Math.max(1, Math.round(diffMonths / 12));
  return tReplace("timeYearsAgo", { n: diffYears }, language);
}
