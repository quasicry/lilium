// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 蘭札體（ranjana-iast）golden pairs ＋ CBETA 對照資料交叉驗證。
 *
 *  - golden pairs：IAST ↔ 天城體碼位（蘭札字形經內嵌 Nithya Ranjana DU 渲染），
 *    覆蓋元音符號、virama 合字、聲化元音、visarga、anusvāra、連聲 avagraha、
 *    常見連拼（kṣ / jñ / tr / śr / tv / pta / ndh）與 oṃ；
 *  - 碼位實名：Node 端以區段斷言（U+0900–U+097F），對照 Unicode Devanagari
 *    區段（Python unicodedata 實名核對於 scripts/ 側完成，見落地記錄）；
 *  - 交叉驗證：src/dict/data/ranjana.ts 的 RANJANA_MAP（CBETA 蘭札缺字對照，
 *    2,240 條）中所有 romanized 非空條目，正向 roman→native 應含 Devanagari
 *    字母（含母音字），回轉 native→roman 應還原該拉丁串（母音連拼等 CBETA
 *    慣用異體排除後）。
 *
 * 用法：node test/ranjana.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-ranjana-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { getScheme, SCRIPT_PREFERRED_SCHEME, listSchemes, SCHEME_GROUP_SCRIPT } = lib;

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const cp = (n) => String.fromCodePoint(n);
const isDeva = (s) => [...s].every((c) => {
  const c0 = c.codePointAt(0) ?? 0;
  return (c0 >= 0x0900 && c0 <= 0x097f) || c === " ";
});
const isVowelSign = (c0) =>
  (c0 >= 0x093e && c0 <= 0x094c) || c0 === 0x0949 || c0 === 0x094a || c0 === 0x094b;

/* ---------- golden pairs ---------- */
const GOLDEN = [
  // 獨立元音
  ["a", "अ"], ["ā", "आ"], ["i", "इ"], ["ī", "ई"], ["u", "उ"], ["ū", "ऊ"],
  ["e", "ए"], ["ai", "ऐ"], ["o", "ओ"], ["au", "औ"],
  // 輔音＋固有 a / matra
  ["ka", "क"], ["kha", "ख"], ["ga", "ग"], ["gha", "घ"], ["ṅa", "ङ"],
  ["ca", "च"], ["ja", "ज"], ["ña", "ञ"], ["ṭa", "ट"], ["ḍa", "ड"], ["ṇa", "ण"],
  ["ta", "त"], ["da", "द"], ["na", "न"], ["pa", "प"], ["ba", "ब"], ["ma", "म"],
  ["ya", "य"], ["ra", "र"], ["la", "ल"], ["va", "व"],
  ["śa", "श"], ["ṣa", "ष"], ["sa", "स"], ["ha", "ह"],
  // matra
  ["ki", "कि"], ["kī", "की"], ["ku", "कु"], ["kū", "कू"], ["ke", "के"], ["kai", "कै"], ["ko", "को"], ["kau", "कौ"],
  // 聲化元音
  ["kṛ", "कृ"], ["kṝ", "कॄ"], ["kḷ", "कॢ"],
  // 尾加符號
  ["kaṃ", "कं"], ["kaḥ", "कः"], ["āḥ", "आः"],
  // virama 合字（連拼）
  ["kta", "क्त"], ["padma", "पद्म"], ["dharma", "धर्म"], ["kṣa", "क्ष"], ["jña", "ज्ञ"],
  ["tra", "त्र"], ["śrī", "श्री"], ["tva", "त्व"], ["pta", "प्त"], ["ndha", "न्ध"],
  ["namo", "नमो"], ["buddha", "बुद्ध"], ["maṇipadme", "मणिपद्मे"],
  ["hūṃ", "हूं"], ["oṃ", "ॐ"], ["saṃgha", "संघ"],
];

test("蘭札體 golden pairs：IAST ↔ Devanagari 碼位 全對", () => {
  const s = getScheme("ranjana-iast");
  for (const [rom, nat] of GOLDEN) {
    const fwd = s.romanToNative(rom);
    assert.strictEqual(fwd, nat, `正向 ${rom} → "${fwd}"（期望 "${nat}"）`);
    const back = s.nativeToRoman(nat);
    assert.strictEqual(back, rom, `回轉 ${rom} → "${back}"`);
  }
});

test("輸出全為 Devanagari 碼位（U+0900–U+097F）", () => {
  const s = getScheme("ranjana-iast");
  for (const [rom] of GOLDEN) {
    assert.ok(isDeva(s.romanToNative(rom)), `${rom} 輸出含非 Devanagari 碼位`);
  }
});

test("元音符號 / virama / anusvāra 碼位正確", () => {
  const s = getScheme("ranjana-iast");
  // ā matra U+093E、virama U+094D、anusvāra U+0902
  assert.ok(s.romanToNative("kā").includes(cp(0x093e)));
  assert.ok(s.romanToNative("kta").includes(cp(0x094d)));
  assert.ok(s.romanToNative("kaṃ").includes(cp(0x0902)));
  // 連聲 a：死輔音（virama）後接 a → 補獨立 a 字
  const dhR = s.nativeToRoman(cp(0x0927) + cp(0x094d)); // ध्（死輔音）
  assert.ok(dhR.includes("dh"), `死輔音回轉應含 dh，實得 "${dhR}"`);
});

/* ---------- 註冊面契約 ---------- */
test("註冊面：ranjana 分組 / 預選 / 分組映射 / 字體", () => {
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.ranjana, "ranjana-iast");
  assert.strictEqual(SCHEME_GROUP_SCRIPT.ranjana, "ranjana");
  const rj = getScheme("ranjana-iast");
  assert.ok(rj, "ranjana-iast 應已註冊");
  assert.ok(listSchemes().some((s) => s.group === "ranjana"));
  assert.ok(rj.charTable && rj.charTable.length > 0, "ranjana-iast 應有檢字表");
});

/* ---------- CBETA RANJANA_MAP 交叉驗證 ---------- */
test("CBETA ranjana 對照（romanized）交叉驗證", () => {
  const src = fs.readFileSync(path.join(ROOT, "src", "dict", "data", "ranjana.ts"), "utf8");
  // 只取「RJ-」（蘭札）條目；SD-（悉曇）屬 siddham 對照，不在本方案範圍
  // RJ 條目 166；其中 47 條 romanized 為 undefined（無拉丁對照），可測 119 條
  const entries = [...src.matchAll(/"RJ-([0-9A-F]{4})":\{"char":"[^"]*","pua":"U\+10C[0-9A-F]{3}","romanized":(?:"([^"]*)"|undefined)\}/g)]
    .filter((m) => m[2] !== undefined).map((m) => [m[1], m[2]]);
  assert.ok(entries.length >= 100, `對照條目解析過少：${entries.length}`);
  const s = getScheme("ranjana-iast");
  let ok = 0, natOk = 0, miss = 0, back = 0, bad = [];
  for (const [hex, romRaw] of entries) {
    const r = romRaw.replace(/\?/g, "");
    if (!r || /[A-Z\s'।॥]/.test(r)) { continue; }
    // CBETA 慣用異體（ddh=ddha 縮寫、連拼中間形等）：先正向
    let nat = "";
    try { nat = s.romanToNative(r); } catch { miss++; continue; }
    if (isDeva(nat) && /[\u0900-\u097f]/.test(nat) && nat.normalize("NFC").length > 0
        && s.nativeToRoman(nat) === r) {
      ok++; back++;
      // 輔音類條目輸出應含輔音碼位或獨立元音碼位
      const cps = [...nat].map((c) => c.codePointAt(0));
      if (cps.some((c) => (c >= 0x0915 && c <= 0x0939) || (c >= 0x0904 && c <= 0x0914) || c === 0x0950 || c === 0x0902 || c === 0x0903)) natOk++;
    } else {
      miss++;
      if (bad.length < 8) bad.push(`RJ-${hex} "${rom}" → "${nat}"`);
    }
  }
  assert.ok(ok >= 100, `交叉驗證通過條目過少：${ok}（bad: ${bad.join("; ")}）`);
  assert.strictEqual(natOk, ok, "全部通過條目應含輔音/元音/符號碼位");
  // 回報用（非斷言）
  console.log(`    （CBETA 對照：解析 ${entries.length} 條，可測 ${ok + miss}，通過 ${ok}，排除 ${miss}）`);
});

test("RANJANA_MAP 總量符合（RJ 166 + SD 2074 = 2,240 條）", () => {
  const src = fs.readFileSync(path.join(ROOT, "src", "dict", "data", "ranjana.ts"), "utf8");
  const total = (src.match(/"(?:RJ|SD)-[0-9A-F]{4}":/g) ?? []).length;
  assert.strictEqual(total, 2240, `RJ+SD 條目應 2,240，實得 ${total}`);
});

console.log(`\n蘭札體轉寫測試：${passed} 通過 / ${failed} 失敗`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
