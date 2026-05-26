const isNumericLabel = (label) => {
    const trimmed = label.trim();
    if (!trimmed) return false;
    const pattern = /^[0-9０-９一二三四五六七八九十百千万〇零IVXLCDMivxlcdm\u2160-\u217f\u2460-\u2473\u2474-\u247d\u3220-\u3229\s]+$/;
    return pattern.test(trimmed);
};

// 混在判定ロジック
const checkHasNonNumericLabel = (items) => {
    if (!Array.isArray(items)) return false;
    for (const item of items) {
        const label = (item.label ?? item.title ?? "").toString().trim();
        if (label && !isNumericLabel(label)) {
            return true;
        }
        if (item.subitems?.length) {
            if (checkHasNonNumericLabel(item.subitems)) return true;
        }
    }
    return false;
};

// フィルタリングを適用した目次項目のシミュレーション描画
const simulateRenderToc = (items, filterNumerics) => {
    const rendered = [];
    const traverse = (itemsList) => {
        if (!Array.isArray(itemsList)) return;
        itemsList.forEach((item) => {
            const label = (item.label ?? item.title ?? "").toString().trim();
            if (filterNumerics && isNumericLabel(label)) {
                if (item.subitems?.length) {
                    traverse(item.subitems);
                }
                return;
            }
            rendered.push(label);
            if (item.subitems?.length) {
                traverse(item.subitems);
            }
        });
    };
    traverse(items);
    return rendered;
};

// --- テスト実行 ---

// テストケース 1: 章タイトルと数字が混在（今回のEPUBのようなフラット構造）
const tocMix = [
    { label: "○ 平田 洋 介 の 独白" },
    { label: "○ 嵐 の 前 の 静けさ" },
    { label: "１" },
    { label: "○ クラス 内 投票" },
    { label: "１" },
    { label: "２" }
];

// テストケース 2: 書籍側が意図した「数字のみ」の目次
const tocPureNumeric = [
    { label: "1" },
    { label: "2" },
    { label: "3" }
];

// テストケース 3: ネストされた目次で混在
const tocNestedMix = [
    {
        label: "第一章 始まり",
        subitems: [
            { label: "1" },
            { label: "2" }
        ]
    },
    {
        label: "第二章 展開",
        subitems: [
            { label: "1" }
        ]
    }
];

let failed = 0;

// テスト 1 の検証
const hasNonNumeric1 = checkHasNonNumericLabel(tocMix);
const result1 = simulateRenderToc(tocMix, hasNonNumeric1);
console.log("Test 1 (Mixed):", result1);
if (!hasNonNumeric1) { failed++; console.error("Test 1 failed: should detect non-numeric labels"); }
if (result1.includes("１") || result1.includes("２")) { failed++; console.error("Test 1 failed: should filter out '１' and '２'"); }

// テスト 2 の検証
const hasNonNumeric2 = checkHasNonNumericLabel(tocPureNumeric);
const result2 = simulateRenderToc(tocPureNumeric, hasNonNumeric2);
console.log("Test 2 (Pure Numeric):", result2);
if (hasNonNumeric2) { failed++; console.error("Test 2 failed: should NOT detect non-numeric labels"); }
if (result2.length !== 3 || !result2.includes("1") || !result2.includes("2") || !result2.includes("3")) {
    failed++;
    console.error("Test 2 failed: should keep all numeric labels since they are not mixed");
}

// テスト 3 の検証
const hasNonNumeric3 = checkHasNonNumericLabel(tocNestedMix);
const result3 = simulateRenderToc(tocNestedMix, hasNonNumeric3);
console.log("Test 3 (Nested Mixed):", result3);
if (!hasNonNumeric3) { failed++; console.error("Test 3 failed: should detect non-numeric labels in nested TOC"); }
if (result3.includes("1") || result3.includes("2")) { failed++; console.error("Test 3 failed: should filter out '1' and '2'"); }

if (failed > 0) {
    console.error(`Safety check tests failed with ${failed} errors.`);
    process.exit(1);
} else {
    console.log("All safety check tests passed!");
}
