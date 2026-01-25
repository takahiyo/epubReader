// ============================================
// 操作判定設定
// ============================================
export const INTERACTION_GRID_CONFIG = Object.freeze({
  VERTICAL_BREAKPOINTS: Object.freeze({
    TOP: 30,
    MIDDLE: 60,
    BOTTOM: 90,
  }),
  PROGRESS_BAR_EXCLUDE_FROM: 90,
  HORIZONTAL_SEGMENTS: 5,
});

// ============================================
// 操作エリアコード/ラベル定義
// ============================================
/**
 * INTERACTION_GRID_CONFIG に基づく操作エリアのSSOT。
 * 変更時はこの定義と UI 側の参照先を更新してください。
 *
 * グリッド構造（INTERACTION_GRID_CONFIG 由来）:
 * ┌─────┬─────┬─────┬─────┬─────┐
 * │ U1  │ U2  │ U3  │ U4  │ U5  │
 * ├─────┼─────┼─────┼─────┼─────┤
 * │ M1  │ M2  │ M3  │ M4  │ M5  │
 * ├─────┼─────┼─────┼─────┼─────┤
 * │ B1  │ B2  │ B3  │ B4  │ B5  │
 * └─────┴─────┴─────┴─────┴─────┘
 */
export const INTERACTION_AREA_CODES = Object.freeze({
  MENU_TOGGLE: "M3",
  VERTICAL_NAV: Object.freeze({
    PREV: Object.freeze(["M1", "M2"]),
    NEXT: Object.freeze(["M4", "M5"]),
  }),
  HORIZONTAL_NAV: Object.freeze({
    PREV: "U3",
    NEXT: "B3",
  }),
  SPREAD_ADJUST: Object.freeze({
    PREV_SINGLE: "U3",
    NEXT_SINGLE: "B3",
  }),
});

export const INTERACTION_AREA_LABELS = Object.freeze({
  MENU_TOGGLE: "areaMenuToggle",
  PAGE_PREV: "areaPagePrev",
  PAGE_NEXT: "areaPageNext",
  PAGE_PREV_SINGLE: "areaPagePrevSingle",
  PAGE_NEXT_SINGLE: "areaPageNextSingle",
});

export const TOUCH_CONFIG = Object.freeze({
  MIN_SWIPE_DISTANCE: 40,
  AXIS_DIFFERENCE: 20,
});

export const PROGRESS_CONFIG = Object.freeze({
  MAX_PERCENT: 100,
});

export const DEBUG_GRID_CONFIG = Object.freeze({
  HORIZONTAL_LINES: Object.freeze([10, 90]),
  VERTICAL_LINES: Object.freeze([20, 40, 60, 80]),
  LINE_THICKNESS_PX: 2,
});
