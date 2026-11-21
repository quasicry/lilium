// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 轉寫方案正確性測試：
 * 1. 滿文 Möllendorff ↔ Unicode 純函數往返（manju 樣本、標點、特殊字母 ū/š/ž）
 * 4. 導出字體嵌入憑證：蒙文字體棧 + fontFaceCssForExport 呼叫鏈
 * 用法：node test/translit.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-translit-"));
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "src/manchu.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "manchu.mjs")}`, "--log-level=silent",
]);
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const manchu = await import(path.join(TMP, "manchu.mjs"));
const lib = await import(path.join(TMP, "lib.mjs"));

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};
const cp = (n) => String.fromCodePoint(n);

console.log("=== 轉寫方案正確性測試 ===");

test("滿文：manju → Unicode ᠮᠠᠨᠵᡠ", () => {
  const out = manchu.mollendorffToManchu("manju");
  assert.equal(out, cp(0x182e) + cp(0x1820) + cp(0x1828) + cp(0x1835) + cp(0x1860));
});
test("滿文：Unicode ᠮᠠᠨᠵᡠ → manju（往返一致）", () => {
  const back = manchu.manchuToMollendorff(manchu.mollendorffToManchu("manju"));
  assert.equal(back, "manju");
});
test("滿文：特殊字母 ū/š/ž 與雙字母 ts'/dz", () => {
  const fwd = manchu.mollendorffToManchu("šū dz");
  assert.ok(fwd.includes(cp(0x1867)) && fwd.includes(cp(0x1861)) && fwd.includes(cp(0x186f)), "š/ū/dz 應映射");
  const back = manchu.manchuToMollendorff(fwd);
  assert.ok(back.includes("š"), "往返保留 š");
});
test("滿文：標點（, . ? !）映射到滿文標點碼位", () => {
  const out = manchu.mollendorffToManchu("a, b.");
  assert.ok(out.includes(cp(0x1808)), "逗號 → U+1808");
  assert.ok(out.includes(cp(0x1809)), "句號 → U+1809");
});
test("滿文：混合文本（非轉寫字符原樣保留）", () => {
  const out = manchu.mollendorffToManchu("manju 123");
  assert.ok(out.includes("1") && out.includes("2") && out.includes("3"), "數字原樣保留");
});
// 導出 fontStack 斷言已撤：resolveEffective/buildTypesetCss 已隨排版引擎退役，字體棧現由 groupFontStack（translit-ui.ts）承擔，由 char-table-gate / font-name.mjs 體系覆蓋。
// 導出字體嵌入憑證斷言已隨 src/export.ts 退役撤除（導出模組遷附錄；反向斷言置 run.mjs 體系）。

/* ---------- 滿文變體選擇符（FVS）與借音字母 ---------- */
const FVS1 = "\u{180B}", FVS2 = "\u{180C}", FVS4 = "\u{180F}";
const M_T = "\u{1868}", M_K = "\u{1874}", M_G = "\u{1864}"; // ᡨ / ᡴ / ᢉ

test("滿文 FVS：t/d + FVS1 不再靜默丟失（舊版往返被破壞）", () => {
  for (const [ch, latin] of [[M_T, "t"], ["\u{1869}", "d"]]) {
    const src = ch + FVS1;
    const out = lib.manchuToMollendorff(src);
    assert.equal(out, `${latin}<f1>`, out);
    assert.equal(lib.mollendorffToManchu(out), src, "往返應還原 FVS1");
  }
});
test("滿文 FVS：k/g/h + FVS 不再泄漏不可見控制符到拉丁文本", () => {
  for (const ch of [M_K, M_G, "\u{1865}"]) {
    const out = lib.manchuToMollendorff(ch + FVS1);
    assert.ok(!out.includes(FVS1), `不得含 U+180B：${[...out].map((c) => c.codePointAt(0).toString(16))}`);
    assert.ok(out.endsWith("<f1>"), out);
    assert.equal(lib.mollendorffToManchu(out), ch + FVS1, "往返無損");
  }
  assert.equal(lib.manchuToMollendorff(M_K + FVS2), "k<f2>");
  assert.equal(lib.manchuToMollendorff(M_K + FVS4), "k<f4>");
});
test("滿文 FVS：strip / keep 模式", () => {
  assert.equal(lib.manchuToMollendorff(M_K + FVS1, { fvs: "strip" }), "k", "strip → 純拉丁");
  const kept = lib.manchuToMollendorff(M_K + FVS1, { fvs: "keep" });
  assert.ok(kept.includes(FVS1), "keep → 原樣保留 FVS");
});
test("滿文 FVS：工具函數（has/count/strip）與混排往返", () => {
  assert.equal(lib.hasMongolianFvs("a" + FVS1), true);
  assert.equal(lib.hasMongolianFvs("manju"), false);
  assert.equal(lib.countMongolianFvs("a" + FVS1 + FVS2 + "b"), 2);
  assert.equal(lib.stripMongolianFvs("a" + FVS1 + "b"), "ab");
  const src = "\u{182E}\u{1820}\u{1828}\u{1835}\u{1860}" + M_K + FVS1; // ᠮᠠᠨᠵᡠ + k+FVS1
  assert.equal(lib.mollendorffToManchu(lib.manchuToMollendorff(src)), src, "混排往返無損");
});
test("滿文 Ali Gali 借音字母：可偵測＋Möllendorff 不臆造（顯式碼位標註）", () => {
  const ag = "\u{18A0}"; // MONGOLIAN LETTER MANCHU ALI GALI TA
  assert.equal(lib.hasAliGali(ag), true);
  assert.equal(lib.hasAliGali("\u{182E}\u{1820}\u{1828}\u{1835}\u{1860}"), false);
  // 體例：Ali Gali 無 Möllendorff 覆蓋 → ⟨U+18A0⟩ 顯式標註（往返可還原），不臆造轉寫
  const out = lib.manchuToMollendorff(ag);
  assert.ok(out.includes("⟨U+18A0⟩"), out);
  assert.ok(lib.hasAliGali(lib.mollendorffToManchu(out)) || lib.mollendorffToManchu(out).includes("\u{18A0}"), "標註可還原");
});
test("蒙古文/滿文：無字根區，等價問題落在 FVS", () => {
  assert.equal(typeof lib.isMongolianFvs, "function", "蒙滿以 FVS 承擔等價職責");
  assert.equal(lib.isMongolianFvs("\u{180E}"), false, "U+180E 是 MVS 元音分隔符，非 FVS");
});

console.log(`\n結果: ${passed} 通過, ${failed} 失敗`);
if (failed) process.exit(1);
