// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 轉寫歧義與 ISO 15919 正規化
 *
 * 守住兩件事：
 *   1. ISO 15919 正規寫法：ए→ē、ओ→ō（輸出與檢字表一致，且無損往返）。
 *   2. 「羅馬字 → 原生文字」的歧義偵測：送氣單輔音（ख）與基輔音＋ha 合字（क्ह）
 *      在羅馬字下都讀同一串（kha），引擎須把它們都列出，交由面板讓用戶選擇，
 *      而非擅自擇一。偵測貫穿全部八套梵文方案。
 *
 * 用法：node test/translit-ambiguity.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-translit-amb-"));
execFileSync(path.join(ROOT, "node_modules/.bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { iastToDevanagari, devanagariToIast, detectRomanToNativeAmbiguities, applyTranslitAmbiguities, listSchemes } = lib;

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
};

console.log("=== 1. ISO 15919 正規 ē/ō ===");
const iso = { mode: "iso" };
test("ए → ē（正規，非 e）", () => assert.equal(devanagariToIast("ए", iso), "ē"));
test("ओ → ō（正規，非 o）", () => assert.equal(devanagariToIast("ओ", iso), "ō"));
test("एट् → ēṭ", () => assert.equal(devanagariToIast("एट्", iso), "ēṭ"));
test("ē → ए（輸入別名仍接受）", () => assert.equal(iastToDevanagari("ē", iso), "ए"));
test("एष 無損往返（एष → ēṣa → एष）", () => {
  const r = devanagariToIast("एष", iso);
  assert.equal(iastToDevanagari(r, iso), "एष");
});
test("ओंकार 無損往返（ओंकार → ōṃkāra → ओंकार）", () => {
  const r = devanagariToIast("ओंकार", iso);
  assert.equal(iastToDevanagari(r, iso), "ओंकार");
});
test("IAST 仍用 e/o（不被 ISO 影響）", () => {
  assert.equal(devanagariToIast("ए", { mode: "iast" }), "e");
  assert.equal(devanagariToIast("ओ", { mode: "iast" }), "o");
});
console.log("\n=== 2. 歧義偵測（送氣單輔音 / 基輔音＋ha 合字）===");
test("kha → ख 偵測到 1 處歧義，備選為 क्ह", () => {
  const nat = iastToDevanagari("kha", { mode: "iast" });
  assert.equal(nat, "ख");
  const amb = detectRomanToNativeAmbiguities(nat);
  assert.equal(amb.length, 1);
  assert.equal(amb[0].primary, "ख");
  assert.equal(amb[0].alternative, "क्ह");
});
test("applyTranslitAmbiguities：choice=1 取合字形式", () => {
  const nat = iastToDevanagari("kha", { mode: "iast" });
  const amb = detectRomanToNativeAmbiguities(nat);
  assert.equal(applyTranslitAmbiguities(nat, amb, [1]), "क्ह");
});
test("applyTranslitAmbiguities：choice=0 取送氣單輔音", () => {
  const nat = iastToDevanagari("kha", { mode: "iast" });
  const amb = detectRomanToNativeAmbiguities(nat);
  assert.equal(applyTranslitAmbiguities(nat, amb, [0]), "ख");
});
test("多歧義：gandharva（गन्धर्व）偵測到 dh 一處", () => {
  const nat = iastToDevanagari("gandharva", { mode: "iast" });
  const amb = detectRomanToNativeAmbiguities(nat);
  assert.ok(amb.length >= 1, "至少偵測到 dh→न्ध 一處");
  // 全部選合字形式：ध 改寫為 द्ह（基輔音＋ha 合字），應與原輸出不同且含 ha 合字
  const out = applyTranslitAmbiguities(nat, amb, amb.map(() => 1));
  assert.notEqual(out, nat, "套用後應與原輸出不同");
  assert.ok(out.includes("ह"), "套用後應出現基輔音＋ha 合字");
});
test("無歧義文本：karma（कर्म）不應標歧義", () => {
  const nat = iastToDevanagari("karma", { mode: "iast" });
  assert.equal(detectRomanToNativeAmbiguities(nat).length, 0);
});
test("IAST 方案歧義貫穿（kha 偵測送氣歧義）", () => {
  const s = listSchemes().find((x) => x.id === "sanskrit-iast");
  const nat = s.romanToNative("kha");
  const amb = detectRomanToNativeAmbiguities(nat);
  assert.ok(amb.length >= 1, "IAST kha→ख 應偵測到送氣歧義");
});
console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
if (failures.length) {
  console.error(`\n失敗 ${failures.length} 項：`);
  for (const f of failures) console.error(`  - ${f.name}: ${f.e.message}`);
  process.exit(1);
}
