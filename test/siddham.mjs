// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 悉曇體（Siddham）轉寫方案測試。
 *
 * 驗證：
 *  - siddham-iast / siddham-hk / siddham-itrans 三方案已註冊（group=siddham）；
 *  - IAST ⇄ 悉曇體 無損往返（梵咒真言：namo / maṇipadme / buddha / oṃ 等）；
 *  - HK / ITRANS（純 ASCII 鍵盤輸入）⇄ 悉曇體 往返；
 *  - 輔音合字（virama U+115BF）正確生成；
 *  - looksLikeNative / looksLikeRoman 方向判定；
 *  - 蘭札體（ranjana）專屬方案 ranjana-iast（SCRIPT_PREFERRED_SCHEME 預選；輸出 Devanagari 碼位）。
 *
 * 用法：node test/siddham.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-siddham-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const {
  listSchemes,
  getScheme,
  iastToSiddham,
  siddhamToIast,
  devanagariToSiddham,
  siddhamToDevanagari,
  looksLikeSiddham,
  SCRIPT_PREFERRED_SCHEME,
} = lib;

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

test("悉曇體三方案已註冊（group=siddham）", () => {
  const ids = listSchemes().filter((s) => s.group === "siddham").map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ["siddham-hk", "siddham-iast", "siddham-itrans"]);
  assert.strictEqual(getScheme("siddham-iast").primary, true);
  assert.strictEqual(getScheme("siddham-hk").altOf, "siddham-iast");
  assert.strictEqual(getScheme("siddham-itrans").altOf, "siddham-iast");
});

test("IAST → 悉曇體 輸出悉曇碼位（U+11580–U+115FF）", () => {
  const out = iastToSiddham("namo");
  for (const ch of out) {
    const c = ch.codePointAt(0) ?? 0;
    assert.ok(c >= 0x11580 && c <= 0x115ff, `應全爲悉曇碼位，實得 U+${c.toString(16)}`);
  }
  assert.ok(looksLikeSiddham(out));
});

test("IAST ⇄ 悉曇體 無損往返（多組真言）", () => {
  const cases = [
    "namo",
    "namo bhagavate",
    "maṇipadme",
    "maṇipadme hūṃ",
    "buddha",
    "bodhicitta",
    "oṃ",
    "sarvatathāgata",
    "vajrasattva",
  ];
  for (const s of cases) {
    const back = siddhamToIast(iastToSiddham(s));
    assert.strictEqual(back, s, `往返不符：輸入 "${s}" → 回 "${back}"`);
  }
});

test("輔音合字（virama U+115BF）正確生成", () => {
  const out = iastToSiddham("padme");
  // padme = pa + d(合字 virama) + ma + e；應含 U+115BF
  assert.ok(out.includes(String.fromCodePoint(0x115bf)), "缺少悉曇 virama（合字）");
  assert.strictEqual(siddhamToIast(out), "padme");
});

test("HK（純 ASCII）⇄ 悉曇體 往返", () => {
  const hk = "maNipadme huM";
  const native = iastToSiddham(hkToIastLocal(hk));
  const back = iastToHkRound(native);
  assert.strictEqual(back, hk, `HK 往返不符：回 "${back}"`);
});

test("ITRANS（鍵盤輸入）⇄ 悉曇體 往返", () => {
  const itr = "oM maNi padme huM";
  const scheme = getScheme("siddham-itrans");
  const native = scheme.romanToNative(itr);
  const back = scheme.nativeToRoman(native);
  assert.strictEqual(back, itr, `ITRANS 往返不符：回 "${back}"`);
});

test("looksLikeNative / looksLikeRoman 方向判定", () => {
  const native = iastToSiddham("maṇipadme");
  const scheme = getScheme("siddham-iast");
  assert.strictEqual(scheme.looksLikeNative(native), true, "悉曇碼位應判爲 native");
  assert.strictEqual(scheme.looksLikeNative("maṇipadme"), false, "純羅馬字不應判爲 native");
  assert.strictEqual(scheme.looksLikeRoman("maṇipadme"), true, "帶變音符的 IAST 應判爲 roman");
  assert.strictEqual(scheme.looksLikeRoman(native), false, "悉曇碼位不應判爲 roman");
});

test("remap 與天城體引擎互逆（devanagariToSiddham / siddhamToDevanagari）", () => {
  const deva = lib.iastToDevanagari("maṇipadme hūṃ");
  const sid = devanagariToSiddham(deva);
  assert.strictEqual(siddhamToDevanagari(sid), deva, "remap 非互逆");
});

test("蘭札體（ranjana）專屬方案 ranjana-iast 已註冊（預選）", () => {
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.ranjana, "ranjana-iast");
  const rj = getScheme("ranjana-iast");
  assert.ok(rj, "ranjana-iast 應已註冊");
  assert.strictEqual(rj.group, "ranjana");
  assert.strictEqual(rj.primary, true);
  // 輸出走 Devanagari 碼位（U+0900–U+097F），由內嵌 Nithya Ranjana DU 渲染爲蘭札字形
  const out = rj.romanToNative("maṇipadme hūṃ");
  for (const ch of out) {
    const c = ch.codePointAt(0) ?? 0;
    assert.ok((c >= 0x0900 && c <= 0x097f) || c === 0x20, `應全爲 Devanagari 碼位，實得 U+${c.toString(16)}`);
  }
  assert.strictEqual(rj.nativeToRoman(out), "maṇipadme hūṃ", "往返無損");
  // 與 sanskrit-iast 同構：同輸入輸出一致
  const sk = getScheme("sanskrit-iast");
  assert.strictEqual(out, sk.romanToNative("maṇipadme hūṃ"));
});

// HK 往返需經 hkToIast / iastToHk；本測試直接在 lib 取用
function iastToHkRound(native) {
  return lib.iastToHk(siddhamToIast(native));
}
function hkToIastLocal(s) {
  return lib.hkToIast(s);
}

console.log(`\n悉曇體轉寫測試：${passed} 通過 / ${failed} 失敗`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
