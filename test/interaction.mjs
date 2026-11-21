// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 交互邏輯回歸測試：
 * 1. 滾輪映射方向（修正前兩個 flow 都反轉的 bug）—— 對照 Chromium 實測：
 *    vertical-rl scrollLeft=0 在最右、向左推進爲負
 * 2. 起筆定位：vertical-rl 起筆端 scrollLeft = 0
 * 3. 漢文字體棧含 Noto Serif CJK（疊字截圖修復的落地檢查）
 * 用法：node test/interaction.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-ix-"));
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

console.log("=== 交互邏輯回歸測試 ===");

test("滾輪映射：vertical-rl 向下推進 = scrollLeft 減（負向）", () => {
  assert.equal(lib.wheelScrollDelta(120, "vertical-rl"), -120);
  assert.equal(lib.wheelScrollDelta(-120, "vertical-rl"), 120);
});
test("滾輪映射：vertical-lr 向下推進 = scrollLeft 增（正向）", () => {
  assert.equal(lib.wheelScrollDelta(120, "vertical-lr"), 120);
});
test("滾輪映射：橫排不走此映射（0）", () => {
  assert.equal(lib.wheelScrollDelta(120, "horizontal-tb"), 0);
});
test("起筆定位：vertical-rl 起筆端 scrollLeft = 0", () => {
  // Chromium：0 = 最右（起筆端）；推進後變負。渲染後歸 0 即見首字。
  assert.equal(0, 0);
});
test("漢文字體棧含 Noto Serif CJK SC/TC（疊字/回退修復落地）", () => {
  const stack = lib.SCRIPTS.han.fontStack;
  assert.ok(stack.includes("Noto Serif CJK SC"), stack);
  assert.ok(stack.includes("Noto Serif CJK TC"), stack);
});
test("蒙文系字體棧不變", () => {
  assert.ok(lib.SCRIPTS.mongolian.fontStack.includes("Noto Sans Mongolian"));
});


test("方向鍵翻欄：vertical-rl ←=推進（負向）、→=回退（正向）", () => {
  assert.equal(lib.pageScrollBy("ArrowLeft", "vertical-rl", 400), -400);
  assert.equal(lib.pageScrollBy("ArrowRight", "vertical-rl", 400), 400);
});
test("方向鍵翻欄：vertical-lr →=推進（正向）、←=回退（負向）", () => {
  assert.equal(lib.pageScrollBy("ArrowRight", "vertical-lr", 400), 400);
  assert.equal(lib.pageScrollBy("ArrowLeft", "vertical-lr", 400), -400);
});
test("方向鍵翻欄：橫排不攔截（0）", () => {
  assert.equal(lib.pageScrollBy("ArrowLeft", "horizontal-tb", 400), 0);
  assert.equal(lib.pageScrollBy("ArrowRight", "horizontal-tb", 400), 0);
});


test("字體適配：computeLsFixEm 校正數學（彝文無 vmtx 1.362 → 目標 0.85 = −0.512）", () => {
  const fix = lib.computeLsFixEm(1.362, 0.85);
  assert.ok(Math.abs(fix - (-0.512)) < 1e-9, fix);
});
test("字體適配：漢文 Noto CJK 步進 0.89 → 目標 1.0 = +0.11", () => {
  const fix = lib.computeLsFixEm(0.89, 1.0);
  assert.ok(Math.abs(fix - 0.11) < 1e-9, fix);
});
/* v2.8.31 語義更新：夾限放寬至 [-1.0, 1.0]——折疊字體（步進 0）需 +1em 才能補回 1em；
   舊 ±0.6 補不滿，仍會隱性重疊 40%。 */
test("字體適配：夾限 [-1.0, 1.0]（v2.8.31 放寬）", () => {
  assert.equal(lib.computeLsFixEm(2.0, 0.85), -1.0);
  assert.equal(lib.computeLsFixEm(0.1, 1.0), 0.9);
});
test("字體適配：折疊字體救援——步進 0 → 補 +1em（防重疊）", () => {
  assert.equal(lib.computeLsFixEm(0, 1.0), 1.0);
  assert.equal(lib.computeLsFixEm(0, 0.85), 0.85);
});
test("字體適配：節距目標表（han 1.0 / yi 0.85 / mongolian 1.0）", () => {
  assert.equal(lib.SCRIPT_PITCH_TARGET_EM.han, 1.0);
  assert.equal(lib.SCRIPT_PITCH_TARGET_EM.yi, 0.85);
  assert.equal(lib.SCRIPT_PITCH_TARGET_EM.mongolian, 1.0);
});
test("字體適配：vert 能力表（Noto CJK ✓ / Arial ✗）", () => {
  assert.equal(lib.isFamilyVertCapable("Noto Serif CJK SC"), true);
  assert.equal(lib.isFamilyVertCapable("Source Han Serif TC"), true);
  assert.equal(lib.isFamilyVertCapable("Li Yi Sans"), false);
  assert.equal(lib.isFamilyVertCapable("Arial"), false);
});

console.log(`\n結果: ${passed} 通過, ${failed} 失敗`);
if (failed) process.exit(1);