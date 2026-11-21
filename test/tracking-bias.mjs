// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 按文種字距偏置回歸測試：
 * - 漢文 +0.06em（默認字距偏緊 → 舒展）
 * （彝文字體與方案已移除，原彝文偏置規則一併下架）
 * - 用戶自訂字距時偏置跳過；RTL 橫排不套用；蒙文系偏置 0
 * 像素實證：artifacts/typography-shots/（彝文間距比 0.9→0.27，漢文 0.069→0.105）
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-bias-"));
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
const eff = (id, typo) => lib.resolveEffective(lib.SCRIPTS[id], { ...lib.DEFAULT_TYPOGRAPHY, ...typo }, lib.DEFAULT_PAGE);
const D = lib.DEFAULT_TYPOGRAPHY.letterSpacingEm;

console.log("=== 按文種字距偏置測試 ===");

test("漢文：默認字距 +0.06em → 舒展", () => {
  assert.ok(Math.abs(eff("han").typo.letterSpacingEm - (D + 0.06)) < 1e-9);
});
test("蒙文系（mongolian/manchu/xibe）：偏置 0（有 vmtx）", () => {
  for (const id of ["mongolian", "manchu", "xibe"]) {
    assert.ok(Math.abs(eff(id).typo.letterSpacingEm - D) < 1e-9, id);
  }
});
test("日/韓：偏置 0（系統字體有 vmtx）", () => {
  for (const id of ["ja", "ko"]) {
    assert.ok(Math.abs(eff(id).typo.letterSpacingEm - D) < 1e-9, id);
  }
});
test("用戶自訂字距 → 偏置跳過（尊重用戶）", () => {
  assert.equal(eff("han", { letterSpacingEm: 0.15 }).typo.letterSpacingEm, 0.15);
  assert.equal(eff("mongolian", { letterSpacingEm: 0.0 }).typo.letterSpacingEm, 0.0);
});
test("RTL 橫排（阿拉伯/希伯來）不套用偏置", () => {
  assert.equal(eff("arabic").typo.letterSpacingEm, D);
  assert.equal(eff("hebrew").typo.letterSpacingEm, D);
});
test("偏置限幅 [−0.6, 0.3] 內", () => {
  const v = eff("han").typo.letterSpacingEm;
  assert.ok(v >= -0.6 && v <= 0.3);
});

console.log(`\n結果: ${passed} 通過, ${failed} 失敗`);
if (failed) process.exit(1);
