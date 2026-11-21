// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 直排座標服務（階段 3）單元校驗。
 *
 * 驗證範圍：
 *   1. computePopupPlacement 純函式：直排 rl/lr、翻側、置中、橫排下方/翻上/貼底
 *   2. 參數防護：NaN / 負值 / Infinity / 缺失 rect 一律降級為安全值
 *   3. axisFromWritingMode / columnOrderFromWritingMode 別名相容
 *   4. getReadingAnchor / isVerticalContext（mock DOM）：類名、inline、computed、
 *      16 層遍歷、窄高啟發式
 *   5. 與 UD 原 hover-lookup 定位邏輯的對比：直排下不再遮擋閱讀流
 *
 * 執行：node test/vertical-anchor.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-vanchor-"));

execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "src", "shared", "vertical-anchor.ts"),
  "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "vanchor.mjs")}`, "--log-level=silent",
]);
const V = await import(path.join(TMP, "vanchor.mjs"));

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const {
  computePopupPlacement, axisFromWritingMode, columnOrderFromWritingMode,
  isVerticalContext, getReadingAnchor, POPUP_GAP, VIEWPORT_MARGIN,
} = V;

const W = 1200, H = 800;
const anchor = (left, top, right, bottom, axis = "horizontal", columnOrder = "rl") => ({
  rect: { left, top, right, bottom }, axis, columnOrder,
});

/* ────────────────────────────────────────────────────────────
 * 【1】直排定位：換列方向側優先
 * ──────────────────────────────────────────────────────────── */
console.log("\n【1】直排定位 —— 換列方向側優先");

test("vertical-rl：彈窗置於詞的左側（換列方向側）", () => {
  // 詞在直排列上：x∈[900,920]，y∈[100,260]（窄高）
  const p = computePopupPlacement(anchor(900, 100, 920, 260, "vertical", "rl"), 300, 80, W, H);
  assert.strictEqual(p.placement, "left", `placement=${p.placement}`);
  assert.strictEqual(p.left, 900 - POPUP_GAP - 300, "左側 = left - gap - w");
  assert.strictEqual(p.top, 100, "垂直對齊錨點頂部");
});

test("vertical-lr：彈窗置於詞的右側（換列方向側）", () => {
  const p = computePopupPlacement(anchor(100, 100, 120, 260, "vertical", "lr"), 300, 80, W, H);
  assert.strictEqual(p.placement, "right", `placement=${p.placement}`);
  assert.strictEqual(p.left, 120 + POPUP_GAP, "右側 = right + gap");
  assert.strictEqual(p.top, 100);
});

test("直排彈窗不遮擋閱讀流：左側放置時右緣 ≤ 詞左緣", () => {
  const a = anchor(900, 100, 920, 260, "vertical", "rl");
  const p = computePopupPlacement(a, 300, 80, W, H);
  assert.ok(p.left + 300 <= a.rect.left, "彈窗右緣不越過詞左緣（不遮擋本列）");
});

test("直排首列（貼右緣）→ 左側有空間，仍置左", () => {
  const p = computePopupPlacement(anchor(1160, 60, 1180, 200, "vertical", "rl"), 300, 80, W, H);
  assert.strictEqual(p.placement, "left");
  assert.strictEqual(p.left, 1160 - POPUP_GAP - 300);
});

/* ────────────────────────────────────────────────────────────
 * 【2】直排翻側與置中
 * ──────────────────────────────────────────────────────────── */
console.log("\n【2】直排翻側與置中");

test("vertical-rl 但左側空間不足 → 翻到右側", () => {
  // 詞貼左緣 x∈[20,40]，左側只剩 20-8=12px，放不下 300 寬
  const p = computePopupPlacement(anchor(20, 100, 40, 260, "vertical", "rl"), 300, 80, W, H);
  assert.strictEqual(p.placement, "right", `placement=${p.placement}`);
  assert.strictEqual(p.left, 40 + POPUP_GAP);
});

test("vertical-lr 但右側空間不足 → 翻到左側", () => {
  const p = computePopupPlacement(anchor(1160, 100, 1180, 260, "vertical", "lr"), 300, 80, W, H);
  assert.strictEqual(p.placement, "left", `placement=${p.placement}`);
  assert.strictEqual(p.left, 1160 - POPUP_GAP - 300);
});

test("兩側皆不足（極窄視口）→ 水平置中且不越界", () => {
  const p = computePopupPlacement(anchor(150, 100, 170, 260, "vertical", "rl"), 300, 80, 340, H);
  assert.strictEqual(p.placement, "center", `placement=${p.placement}`);
  assert.ok(p.left >= VIEWPORT_MARGIN, "left 不左越界");
  assert.ok(p.left + 300 <= 340 - VIEWPORT_MARGIN, "right 不右越界");
});

test("直排 top 被鉗制在視口內（錨點貼底）", () => {
  const p = computePopupPlacement(anchor(900, 780, 920, 900, "vertical", "rl"), 300, 80, W, H);
  assert.ok(p.top <= H - 80 - VIEWPORT_MARGIN, `top=${p.top} 應鉗制`);
  assert.ok(p.top >= VIEWPORT_MARGIN);
});

/* ────────────────────────────────────────────────────────────
 * 【3】橫排行為（必須與 UD 原邏輯一致，不回歸）
 * ──────────────────────────────────────────────────────────── */
console.log("\n【3】橫排行為（不回歸 UD 原邏輯）");

test("橫排：優先置於詞的下方", () => {
  const p = computePopupPlacement(anchor(200, 100, 280, 120), 300, 80, W, H);
  assert.strictEqual(p.placement, "below");
  assert.strictEqual(p.top, 120 + POPUP_GAP);
  assert.strictEqual(p.left, 200, "左緣對齊詞左緣（UD 原邏輯）");
});

test("橫排：下方不足 → 翻到上方", () => {
  const p = computePopupPlacement(anchor(200, 740, 280, 760), 300, 80, W, H);
  assert.strictEqual(p.placement, "above", `placement=${p.placement}`);
  assert.strictEqual(p.top, 740 - POPUP_GAP - 80);
});

test("橫排：上下皆不足 → 貼視口底部", () => {
  const p = computePopupPlacement(anchor(200, 10, 280, 30), 300, 760, W, H);
  assert.ok(p.top >= VIEWPORT_MARGIN, `top=${p.top}`);
  assert.ok(p.top + 760 <= H - VIEWPORT_MARGIN + 0.001, "不超出視口底部");
});

test("橫排：left 被鉗制在視口內（詞貼右緣）", () => {
  const p = computePopupPlacement(anchor(1150, 100, 1190, 120), 300, 80, W, H);
  assert.ok(p.left >= VIEWPORT_MARGIN);
  assert.ok(p.left + 300 <= W - VIEWPORT_MARGIN, "不超出視口右緣");
});

/* ────────────────────────────────────────────────────────────
 * 【4】參數防護
 * ──────────────────────────────────────────────────────────── */
console.log("\n【4】參數防護（NaN / 負值 / Infinity / 缺失）");

test("popupW = NaN → 降級為 300", () => {
  const p = computePopupPlacement(anchor(900, 100, 920, 260, "vertical", "rl"), NaN, 80, W, H);
  assert.strictEqual(p.left, 900 - POPUP_GAP - 300);
});

test("popupW = -50（負值）→ 降級為 300", () => {
  const p = computePopupPlacement(anchor(900, 100, 920, 260, "vertical", "rl"), -50, 80, W, H);
  assert.strictEqual(p.left, 900 - POPUP_GAP - 300);
});

test("vw/vh = Infinity → 降級為 1024/768", () => {
  const p = computePopupPlacement(anchor(100, 100, 120, 260, "vertical", "rl"), 300, 80, Infinity, Infinity);
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top), "輸出必須是有限數");
});

test("rect 含 NaN → 降級為 0，不產生 NaN 輸出", () => {
  const a = { rect: { left: NaN, top: NaN, right: NaN, bottom: NaN }, axis: "vertical", columnOrder: "rl" };
  const p = computePopupPlacement(a, 300, 80, W, H);
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top), `left=${p.left} top=${p.top}`);
  assert.ok(p.left >= VIEWPORT_MARGIN);
});

test("全部參數為 undefined → 仍回傳有限安全值", () => {
  const p = computePopupPlacement(
    { rect: undefined, axis: "horizontal", columnOrder: "rl" },
    undefined, undefined, undefined, undefined
  );
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top));
  assert.ok(p.left >= VIEWPORT_MARGIN && p.top >= VIEWPORT_MARGIN);
});

test("任何輸入下彈窗都不飛出視口（模糊式 200 組隨機）", () => {
  let seed = 20260912;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 200; i++) {
    const vw = 300 + rnd() * 1600, vh = 200 + rnd() * 1200;
    const l = rnd() * vw * 1.2 - 40, t = rnd() * vh * 1.2 - 40;
    const a = anchor(l, t, l + 20, t + 160, rnd() > 0.5 ? "vertical" : "horizontal", rnd() > 0.5 ? "rl" : "lr");
    const pw = 100 + rnd() * 400, ph = 40 + rnd() * 300;
    const p = computePopupPlacement(a, pw, ph, vw, vh);
    assert.ok(Number.isFinite(p.left), `i=${i} left 非有限`);
    assert.ok(Number.isFinite(p.top), `i=${i} top 非有限`);
    assert.ok(p.left >= VIEWPORT_MARGIN - 0.001, `i=${i} left=${p.left} 越界`);
    assert.ok(p.top >= VIEWPORT_MARGIN - 0.001, `i=${i} top=${p.top} 越界`);
    assert.ok(p.top <= Math.max(VIEWPORT_MARGIN, vh - ph - VIEWPORT_MARGIN) + 0.001, `i=${i} top 超出底部`);
    assert.ok(p.left <= Math.max(VIEWPORT_MARGIN, vw - pw - VIEWPORT_MARGIN) + 0.001, `i=${i} left 超出右緣`);
  }
});

/* ────────────────────────────────────────────────────────────
 * 【5】writing-mode 解析
 * ──────────────────────────────────────────────────────────── */
console.log("\n【5】writing-mode 別名解析");

test("axisFromWritingMode：標準值", () => {
  assert.strictEqual(axisFromWritingMode("vertical-rl"), "vertical");
  assert.strictEqual(axisFromWritingMode("vertical-lr"), "vertical");
  assert.strictEqual(axisFromWritingMode("horizontal-tb"), "horizontal");
});

test("axisFromWritingMode：舊式別名與大小寫/空白", () => {
  assert.strictEqual(axisFromWritingMode("tb-rl"), "vertical");
  assert.strictEqual(axisFromWritingMode("tb-lr"), "vertical");
  assert.strictEqual(axisFromWritingMode("lr-tb"), "horizontal");
  assert.strictEqual(axisFromWritingMode("  VERTICAL-RL  "), "vertical");
});

test("axisFromWritingMode：空值與未知值回傳 null", () => {
  assert.strictEqual(axisFromWritingMode(""), null);
  assert.strictEqual(axisFromWritingMode(null), null);
  assert.strictEqual(axisFromWritingMode(undefined), null);
  assert.strictEqual(axisFromWritingMode("sideways-rl"), null, "sideways 不在支援範圍");
});

test("columnOrderFromWritingMode：lr / rl 判定", () => {
  assert.strictEqual(columnOrderFromWritingMode("vertical-rl"), "rl");
  assert.strictEqual(columnOrderFromWritingMode("vertical-lr"), "lr");
  assert.strictEqual(columnOrderFromWritingMode("tb-lr"), "lr");
  assert.strictEqual(columnOrderFromWritingMode("horizontal-tb"), "rl", "橫排無意義，回傳 rl 預設");
  assert.strictEqual(columnOrderFromWritingMode(null), "rl", "空值安全降級");
});

/* ────────────────────────────────────────────────────────────
 * 【6】DOM 判定（mock）
 * ──────────────────────────────────────────────────────────── */
console.log("\n【6】DOM 上下文判定（mock DOM）");

/** 建立 mock 元素；wm = computed writing-mode，styleWm = inline style */
function mkEl({ rect = { left: 100, top: 100, right: 120, bottom: 260 }, cls = [], wm = "", styleWm = "", parent = null, noRect = false } = {}) {
  const el = {
    __wm: wm,
    classList: { contains: (c) => cls.includes(c) },
    style: styleWm ? { writingMode: styleWm } : {},
    parentElement: parent,
  };
  if (!noRect) {
    el.getBoundingClientRect = () => ({
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: rect.right - rect.left, height: rect.bottom - rect.top,
    });
  }
  return el;
}

const origGCS = globalThis.getComputedStyle;
globalThis.getComputedStyle = (el) => ({
  getPropertyValue: (p) => (p === "writing-mode" ? (el && el.__wm) || "" : ""),
  writingMode: (el && el.__wm) || "",
});

test("null / 非物件 → isVerticalContext 回傳 false，不拋錯", () => {
  assert.strictEqual(isVerticalContext(null), false);
  assert.strictEqual(isVerticalContext(undefined), false);
  assert.strictEqual(isVerticalContext("div"), false);
});

test("元素自身 computed writing-mode: vertical-rl → 直排", () => {
  const el = mkEl({ wm: "vertical-rl" });
  assert.strictEqual(isVerticalContext(el), true);
  const a = getReadingAnchor(el);
  assert.strictEqual(a.axis, "vertical");
  assert.strictEqual(a.columnOrder, "rl");
});

test("元素自身 vertical-lr → columnOrder = lr", () => {
  const a = getReadingAnchor(mkEl({ wm: "vertical-lr" }));
  assert.strictEqual(a.axis, "vertical");
  assert.strictEqual(a.columnOrder, "lr");
});

test("父層直排 → 子元素判定為直排（向上遍歷）", () => {
  const parent = mkEl({ wm: "vertical-rl" });
  const child = mkEl({ wm: "horizontal-tb", parent });
  // 子元素明確宣告 horizontal-tb → 應立即停止，判定為橫排
  assert.strictEqual(isVerticalContext(child), false, "明確 horizontal-tb 應覆寫外層");
});

test("外層直排、子層無宣告 → 繼承直排", () => {
  const parent = mkEl({ wm: "vertical-rl" });
  const child = mkEl({ parent });
  assert.strictEqual(isVerticalContext(child), true, "向上遍歷應找到父層的 vertical-rl");
});

test("li 直排舞台類名 .li-stage-vertical（無 writing-mode）→ 直排", () => {
  const stage = mkEl({ cls: ["li-stage-vertical"] });
  const word = mkEl({ parent: stage });
  assert.strictEqual(isVerticalContext(word), true, "CSS 類驅動的直排舞台應被識別");
  assert.strictEqual(getReadingAnchor(word).columnOrder, "rl");
});

test(".li-stage-horizontal 明確覆寫 → 橫排", () => {
  const stage = mkEl({ cls: ["li-stage-horizontal"] });
  assert.strictEqual(isVerticalContext(mkEl({ parent: stage })), false);
});

test("inline style writing-mode 兜底（computed 不可用時）", () => {
  const el = mkEl({ styleWm: "vertical-rl" });
  const g = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => { throw new Error("no computed style"); };
  try {
    assert.strictEqual(isVerticalContext(el), true, "computed 拋錯時應由 inline style 兜底");
  } finally {
    globalThis.getComputedStyle = g;
  }
});

test("16 層遍歷上限：深層不誤判為外層直排", () => {
  let cur = mkEl({ wm: "vertical-rl" });
  // 用寬扁 rect 建構鏈條，避免觸發「窄高 → 直排」形狀啟發式，
  // 確保測的是遍歷深度上限本身
  for (let i = 0; i < 20; i++) cur = mkEl({ rect: { left: 100, top: 100, right: 300, bottom: 140 }, parent: cur });
  // 距直排祖先 20 層，超過 16 層上限 → 不應判定為直排
  const a = getReadingAnchor(cur);
  assert.ok(a, "應回傳錨點");
  assert.strictEqual(a.axis, "horizontal", "超過 16 層應停止遍歷，不誤判");
});

test("16 層以內可正確繼承（對照組）", () => {
  let cur = mkEl({ wm: "vertical-rl" });
  for (let i = 0; i < 15; i++) cur = mkEl({ rect: { left: 100, top: 100, right: 300, bottom: 140 }, parent: cur });
  assert.strictEqual(getReadingAnchor(cur).axis, "vertical", "15 層內應繼承到直排");
});

test("窄高形狀啟發式（無任何 writing-mode 宣告）", () => {
  const narrow = mkEl({ rect: { left: 500, top: 100, right: 520, bottom: 400 } }); // 20×300
  assert.strictEqual(isVerticalContext(narrow), true, "窄高（h/w≥3 且 w≤64）視為直排");
  const wide = mkEl({ rect: { left: 100, top: 100, right: 300, bottom: 140 } }); // 200×40
  assert.strictEqual(isVerticalContext(wide), false, "寬扁視為橫排");
});

test("缺 getBoundingClientRect → 回傳 null，不拋錯", () => {
  assert.strictEqual(getReadingAnchor(mkEl({ noRect: true })), null);
});

test("getBoundingClientRect 拋錯 → 回傳 null", () => {
  const el = { classList: { contains: () => false }, style: {}, parentElement: null,
    getBoundingClientRect: () => { throw new Error("layout not ready"); } };
  assert.strictEqual(getReadingAnchor(el), null);
});

test("rect 含 NaN → 正規化為 0，不污染後續計算", () => {
  const el = mkEl({ wm: "vertical-rl" });
  el.getBoundingClientRect = () => ({ left: NaN, top: NaN, right: NaN, bottom: NaN });
  const a = getReadingAnchor(el);
  assert.strictEqual(a.rect.left, 0);
  assert.strictEqual(a.rect.top, 0);
  const p = computePopupPlacement(a, 300, 80, W, H);
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top));
});

globalThis.getComputedStyle = origGCS;

/* ────────────────────────────────────────────────────────────
 * 【7】與 UD 原邏輯對比（核心價值驗證）
 * ──────────────────────────────────────────────────────────── */
console.log("\n【7】與 UD 原定位邏輯對比");

/** 重現 UD hover-lookup.ts:193-216 的 position() 計算（POPUP_OFFSET=6） */
function udOriginalPosition(a, pw, ph, vw, vh) {
  let left = a.left;
  if (left + pw > vw - 8) left = Math.max(8, a.right - pw);
  if (left < 8) left = 8;
  let top = a.bottom + 6;
  if (top + ph > vh - 8) top = a.top - ph - 6;
  if (top < 8) top = Math.max(8, vh - ph - 8);
  return { left, top };
}

test("直排下：UD 原邏輯會遮住同列後續文字，新邏輯不會", () => {
  // 直排列上的詞：x∈[900,920]，詞高 160（約 8 字），同列後續文字在 y>260
  const a = anchor(900, 100, 920, 260, "vertical", "rl");
  const r = { left: a.rect.left, top: a.rect.top, right: a.rect.right, bottom: a.rect.bottom };
  const old = udOriginalPosition(r, 300, 80, W, H);
  const neu = computePopupPlacement(a, 300, 80, W, H);

  // 原邏輯：top = 260+6 = 266，落在同列後續文字上（y 266~346）→ 遮擋
  assert.strictEqual(old.top, 266, "UD 原邏輯置於詞下方");
  const oldOverlapsColumn = old.top < a.rect.bottom + 40 && old.left + 300 > a.rect.left;
  assert.ok(oldOverlapsColumn, "原邏輯確實壓在同列閱讀流上（這是待修問題）");

  // 新邏輯：置於詞左側，水平錯開 → 完全不與本列重疊
  const newOverlapsColumn = neu.left + 300 > a.rect.left && neu.left < a.rect.right;
  assert.ok(!newOverlapsColumn, `新邏輯應水平錯開，實得 left=${neu.left}`);
  assert.strictEqual(neu.placement, "left");
});

test("橫排下：新邏輯與 UD 原邏輯座標一致（零回歸）", () => {
  const cases = [
    [anchor(200, 100, 280, 120), 300, 80, W, H],
    [anchor(200, 740, 280, 760), 300, 80, W, H],
    [anchor(1150, 100, 1190, 120), 300, 80, W, H],
    [anchor(20, 100, 90, 120), 400, 60, W, H],
  ];
  for (const [a, pw, ph, vw, vh] of cases) {
    const r = { left: a.rect.left, top: a.rect.top, right: a.rect.right, bottom: a.rect.bottom };
    const old = udOriginalPosition(r, pw, ph, vw, vh);
    const neu = computePopupPlacement(a, pw, ph, vw, vh);
    assert.strictEqual(neu.left, old.left, `left 不一致：新 ${neu.left} vs 舊 ${old.left}`);
    assert.strictEqual(neu.top, old.top, `top 不一致：新 ${neu.top} vs 舊 ${old.top}`);
  }
});

/* ────────────────────────────────────────────────────────────
 * 【8】applyPopupPosition 便捷封裝（UD position() 的替身）
 * ──────────────────────────────────────────────────────────── */
console.log("\n【8】applyPopupPosition 便捷封裝");

const { applyPopupPosition } = V;

/** mock 彈窗元素 */
function mkPopup({ w = 300, h = 80, vw = W, vh = H } = {}) {
  const el = {
    style: {},
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h }),
    ownerDocument: { defaultView: { innerWidth: vw, innerHeight: vh } },
  };
  return el;
}

test("直排錨點 → 寫入左側座標，並標註 data-placement", () => {
  const g = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el) => ({
    getPropertyValue: (p) => (p === "writing-mode" ? (el && el.__wm) || "" : ""),
    writingMode: (el && el.__wm) || "",
  });
  try {
    const anchorEl = mkEl({ wm: "vertical-rl", rect: { left: 900, top: 100, right: 920, bottom: 260 } });
    const popup = mkPopup({ w: 300, h: 80 });
    const p = applyPopupPosition(popup, { left: 900, top: 100, right: 920, bottom: 260 }, anchorEl);
    assert.strictEqual(p.placement, "left");
    assert.strictEqual(popup.style.left, `${900 - POPUP_GAP - 300}px`);
    assert.strictEqual(popup.style.top, "100px");
    assert.strictEqual(popup.style.visibility, "visible");
    assert.strictEqual(popup.dataset.placement, "left", "data-placement 供 CSS 微調箭頭方向");
  } finally {
    globalThis.getComputedStyle = g;
  }
});

test("橫排錨點 → 寫入下方座標（與 UD 原邏輯一致）", () => {
  const popup = mkPopup({ w: 300, h: 80 });
  const r = { left: 200, top: 100, right: 280, bottom: 120 };
  applyPopupPosition(popup, r, null);
  assert.strictEqual(popup.style.left, "200px");
  assert.strictEqual(popup.style.top, `${120 + POPUP_GAP}px`);
  assert.strictEqual(popup.dataset.placement, "below");
});

test("不傳 anchorEl → 退化為橫排，不拋錯", () => {
  const popup = mkPopup();
  const p = applyPopupPosition(popup, { left: 100, top: 100, right: 180, bottom: 120 });
  assert.strictEqual(p.placement, "below");
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top));
});

test("popupEl 為 null / anchorRect 為 null → 回傳 null，不拋錯", () => {
  assert.strictEqual(applyPopupPosition(null, { left: 0, top: 0, right: 1, bottom: 1 }), null);
  assert.strictEqual(applyPopupPosition(mkPopup(), null), null);
});

test("錨點失效（元素 detached）→ 回傳 null 且隱藏彈窗", () => {
  const popup = mkPopup();
  const staleEl = { isConnected: false, style: {}, classList: { contains: () => false },
    parentElement: null, getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0 }) };
  const p = applyPopupPosition(popup, { left: 100, top: 100, right: 180, bottom: 120 }, staleEl);
  assert.strictEqual(p, null, "失效錨點應回傳 null");
  assert.strictEqual(popup.style.visibility, "hidden", "並隱藏彈窗");
});

test("錨點失效（rect 尺寸歸零）→ 回傳 null", () => {
  const live = { isConnected: true, style: {}, classList: { contains: () => false },
    parentElement: null, getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0 }) };
  assert.strictEqual(
    applyPopupPosition(mkPopup(), { left: 0, top: 0, right: 0, bottom: 0 }, live), null);
});

test("錨點失效（rect 為 NaN）→ 回傳 null，不產生 NaN 座標", () => {
  const live = { isConnected: true, style: {}, classList: { contains: () => false }, parentElement: null,
    getBoundingClientRect: () => ({ left: NaN, top: NaN, right: NaN, bottom: NaN }) };
  const popup = mkPopup();
  const p = applyPopupPosition(popup, { left: NaN, top: NaN, right: NaN, bottom: NaN }, live);
  assert.strictEqual(p, null, "NaN 矩形視為失效");
  assert.ok(!("left" in popup.style), "不應寫入任何座標");
});

test("錨點仍連接且有尺寸 → 正常定位，不誤判為失效", () => {
  const live = { isConnected: true, style: {}, classList: { contains: () => false }, parentElement: null,
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 180, bottom: 120 }) };
  const p = applyPopupPosition(mkPopup(), { left: 100, top: 100, right: 180, bottom: 120 }, live);
  assert.ok(p, "有效錨點應回傳座標");
  assert.strictEqual(p.placement, "below");
});

test("彈窗量測失敗（無 getBoundingClientRect）→ 用預設 300×80", () => {
  const popup = { style: {}, dataset: {}, ownerDocument: { defaultView: { innerWidth: W, innerHeight: H } } };
  const p = applyPopupPosition(popup, { left: 900, top: 100, right: 920, bottom: 260 }, null);
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top));
  assert.strictEqual(popup.style.top, `${260 + POPUP_GAP}px`, "以預設高度計算橫排下方");
});

test("style 為唯讀（拋錯）→ 不拋出，仍回傳座標", () => {
  const popup = mkPopup();
  Object.defineProperty(popup, "style", { get() { throw new Error("readonly"); } });
  const p = applyPopupPosition(popup, { left: 100, top: 100, right: 180, bottom: 120 });
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top));
});

test("零回歸：隨機橫排錨點（皆在視口內），與 UD 原 position() 完全一致", () => {
  let seed = 987654321;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 300; i++) {
    const vw = 320 + rnd() * 1400, vh = 240 + rnd() * 1000;
    const pw = 120 + rnd() * 360, ph = 40 + rnd() * 260;
    // 錨點限制在視口安全區內（真實場景：詞可見且距邊緣 ≥ 8px 才會被 hover）。
    // 超出安全區時新邏輯會額外鉗制，屬刻意改進，見下一個測試。
    const ww = 30 + rnd() * 120, hh = 16 + rnd() * 24;
    const l = 8 + rnd() * Math.max(1, vw - ww - 16);
    const t = 8 + rnd() * Math.max(1, vh - hh - 16);
    const r = { left: l, top: t, right: l + ww, bottom: t + hh };
    const old = udOriginalPosition(r, pw, ph, vw, vh);
    const popup = mkPopup({ w: pw, h: ph, vw, vh });
    const neu = applyPopupPosition(popup, r, null);
    assert.strictEqual(neu.left, old.left, `i=${i} left ${neu.left} vs ${old.left}`);
    assert.strictEqual(neu.top, old.top, `i=${i} top ${neu.top} vs ${old.top}`);
  }
});

test("改進點：錨點溢出視口時，新邏輯鉗制在視口內（UD 原邏輯會溢出）", () => {
  // 詞部分在視口外（如長詞被截斷、或錨點測量落在滾動邊界）
  const r = { left: 1240, top: 100, right: 1330, bottom: 120 };
  const pw = 300, vw = 1200, vh = 800;
  const old = udOriginalPosition(r, pw, 80, vw, vh);
  const popup = mkPopup({ w: pw, h: 80, vw, vh });
  const neu = applyPopupPosition(popup, r, null);
  assert.ok(old.left + pw > vw - 8, "前置：UD 原邏輯確實溢出視口（這是待修缺陷）");
  assert.ok(neu.left + pw <= vw - VIEWPORT_MARGIN + 0.001,
    `新邏輯應鉗制：left=${neu.left} + ${pw} 應 ≤ ${vw - VIEWPORT_MARGIN}`);
});

/* ────────────────────────────────────────────────────────────
 * 【9】直排 ↔ 橫排切換的狀態一致性（li 兩者皆可寫）
 * ──────────────────────────────────────────────────────────── */
console.log("\n【9】直排↔橫排切換的狀態一致性");

const { isAnchorStale, observeWritingModeChanges } = V;

test("isAnchorStale：元素已移除 → true", () => {
  assert.strictEqual(isAnchorStale({ isConnected: false }, { left: 0, top: 0, right: 10, bottom: 10 }), true);
});

test("isAnchorStale：元素仍在文檔 → false", () => {
  assert.strictEqual(isAnchorStale({ isConnected: true }, { left: 0, top: 0, right: 10, bottom: 10 }), false);
});

test("isAnchorStale：未提供元素（null）→ false（交由呼叫方決定）", () => {
  assert.strictEqual(isAnchorStale(null, { left: 0, top: 0, right: 10, bottom: 10 }), false);
});

test("isAnchorStale：rect 為 null → true", () => {
  assert.strictEqual(isAnchorStale({ isConnected: true }, null), true);
});

test("isAnchorStale：零寬或零高 → true", () => {
  assert.strictEqual(isAnchorStale({ isConnected: true }, { left: 5, top: 5, right: 5, bottom: 20 }), true, "零寬");
  assert.strictEqual(isAnchorStale({ isConnected: true }, { left: 5, top: 5, right: 30, bottom: 5 }), true, "零高");
});

test("li body 類：li-editor-vertical-active → 直排", () => {
  const g = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el) => ({
    getPropertyValue: (p) => (p === "writing-mode" ? (el && el.__wm) || "" : ""),
    writingMode: (el && el.__wm) || "",
  });
  try {
    const body = mkEl({ cls: ["li-editor-vertical-active"] });
    const el = mkEl({ rect: { left: 100, top: 100, right: 300, bottom: 140 } });
    Object.defineProperty(el, "ownerDocument", { value: { body }, configurable: true });
    assert.strictEqual(isVerticalContext(el), true, "直排模式類應被識別");
    assert.strictEqual(getReadingAnchor(el).columnOrder, "rl", "預設 vertical-rl");
  } finally {
    globalThis.getComputedStyle = g;
  }
});

test("li body 類：horizontal-active 優先於 vertical-active（橫排文種在直排模式下）", () => {
  const g = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "", writingMode: "" });
  try {
    const body = mkEl({ cls: ["li-editor-vertical-active", "li-editor-horizontal-active"] });
    const el = mkEl({ rect: { left: 100, top: 100, right: 300, bottom: 140 } });
    Object.defineProperty(el, "ownerDocument", { value: { body }, configurable: true });
    assert.strictEqual(isVerticalContext(el), false,
      "兩個類同時存在＝直排模式下開橫排文種，應走橫排");
  } finally {
    globalThis.getComputedStyle = g;
  }
});

test("li CSS 變數：--li-editor-writing-mode = horizontal-tb → 橫排", () => {
  const g = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el) => ({
    getPropertyValue: (p) => {
      if (p === "--li-editor-writing-mode") return (el && el.__var) || "";
      return (el && el.__wm) || "";
    },
    writingMode: (el && el.__wm) || "",
  });
  try {
    const body = mkEl({ cls: ["li-editor-vertical-active"] });
    body.__var = "horizontal-tb";
    const el = mkEl({ rect: { left: 100, top: 100, right: 300, bottom: 140 } });
    Object.defineProperty(el, "ownerDocument", { value: { body }, configurable: true });
    assert.strictEqual(isVerticalContext(el), false, "變數說 horizontal-tb 就該走橫排");
  } finally {
    globalThis.getComputedStyle = g;
  }
});

test("computed 回傳未解析 var() 時，改讀 CSS 變數", () => {
  const g = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el) => ({
    getPropertyValue: (p) => {
      if (p === "writing-mode") return "var(--li-editor-writing-mode)";
      if (p === "--li-editor-writing-mode") return (el && el.__var) || "";
      return "";
    },
    writingMode: "var(--li-editor-writing-mode)",
  });
  try {
    const el = mkEl({ rect: { left: 100, top: 100, right: 120, bottom: 300 } });
    el.__var = "vertical-rl";
    assert.strictEqual(isVerticalContext(el), true, "應解析 CSS 變數得到直排");
  } finally {
    globalThis.getComputedStyle = g;
  }
});

test("observeWritingModeChanges：無 MutationObserver 環境也不拋錯，回傳可呼叫的 disposer", () => {
  const el = mkEl({ wm: "vertical-rl" });
  const d = observeWritingModeChanges(el, () => {});
  assert.strictEqual(typeof d, "function");
  d(); d(); // 重複呼叫安全
});

test("observeWritingModeChanges：el 為 null → 回傳空 disposer", () => {
  const d = observeWritingModeChanges(null, () => {});
  assert.strictEqual(typeof d, "function");
  d();
});

/* ──────────────────────────────────────────────────────────── */
console.log(`\n${"─".repeat(56)}`);
console.log(`直排座標服務：${passed} 通過，${failed} 失敗`);
if (failed > 0) process.exit(1);
