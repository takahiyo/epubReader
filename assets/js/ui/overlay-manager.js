/**
 * assets/js/ui/overlay-manager.js
 * 
 * ローディングオーバーレイとアニメーションの制御を担当します。
 */

import { DOM_IDS, UI_CLASSES, ASSET_PATHS } from "../../constants.js";
import { elements } from "./elements.js";

let LOADER_ANIMATION_DATA = null;
let lottieInstance = null;

/**
 * Lottieアニメーションデータを非同期で読み込む
 */
async function loadLottieAnimationData() {
    if (LOADER_ANIMATION_DATA) return LOADER_ANIMATION_DATA;

    try {
        const response = await fetch(ASSET_PATHS.LOADER_ANIMATION);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        LOADER_ANIMATION_DATA = await response.json();
        return LOADER_ANIMATION_DATA;
    } catch (e) {
        console.warn('Failed to load Lottie animation data:', e);
        return null;
    }
}

/**
 * ローディングアニメーションを初期化
 */
export async function initLoadingAnimation() {
    const container = elements.lottieLoader;
    if (!container) return;

    // lottieが読み込まれているか確認（グローバルなlottie変数を期待）
    if (typeof lottie === 'undefined') {
        console.warn('Lottie library not loaded.');
        return;
    }

    // 外部JSONからLottieデータを読み込む
    const animationData = await loadLottieAnimationData();
    if (!animationData) {
        console.warn('Lottie animation data (LOADER_ANIMATION_DATA) is missing.');
        return;
    }

    // 背景レイヤー('bkgr')を削除して透過させる
    if (animationData.layers) {
        animationData.layers = animationData.layers.filter(layer => layer.nm !== 'bkgr');
    }

    try {
        lottieInstance = lottie.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: true,
            autoplay: false, // 表示されるまで再生しない
            animationData: animationData
        });
    } catch (e) {
        console.error('Failed to initialize Lottie animation:', e);
    }
}

/**
 * ローディング表示
 */
export function showLoading() {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.classList.add(UI_CLASSES.VISIBLE);
        lottieInstance?.play();
    }
}

/**
 * ローディング非表示
 */
export function hideLoading() {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.classList.remove(UI_CLASSES.VISIBLE);
        lottieInstance?.stop(); // 非表示時は停止してリソース節約
    }
}
