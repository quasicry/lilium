#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 地區集群（region-cluster）：`PunctRegion` 四態與地區感知函式的獨立單測。
 *
 * 為什麼獨立於 test/run.mjs：與 test/ts-linebreak.mjs 同一約定——直排標點資料層
 * （`src/tsdata/punct.gen.ts`）的純函式單測，由主控與另一個 Worker 獨佔打包。
 *
 * 斷言分組
 * --------
 * A. `PunctRegion` 四態 + `scriptIdToPunctRegion`（HK 經 languages.ts 歸 hant）
 * B. `punctFixedEm`（ja/ko 回落 zh-Hant ＝ 全寬 1em）
 * C. `isPunctNonAdjustable`（ja/ko 地區感知；與 zh-Hant 的 horizontal 列表區分）
 * D. `verticalQuoteEquivalent` 分派：ja 走 UAX #50 §3.2.4（mapping A），
 *    其餘（zh-Hans/zh-Hant/ko）走中文嵌套（mapping B，clreq §5.2）
 * E. `verticalQuoteJaEquivalent` + `VERTICAL_QUOTE_JA_EQUIVALENT` 常數（mapping A）
 *
 * 反向驗證：對 ja/ko 餵與 zh-Hant 不同的 horizontal 列表（如 U+FF01），
 * 確認地區確實改變判定，而非「恆真」。
 */
import assert from "node:assert";
import { unlinkSync } from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const tmpGen = join(__dirname, ".punct-region.bundle.mjs");
await build({
  entryPoints: [join(ROOT, "src", "tsdata", "punct.gen.ts")],
  bundle: true, format: "esm", platform: "node", outfile: tmpGen, logLevel: "silent",
});
const PG = await import("file://" + tmpGen);

const {
  PunctRegion: _PunctRegion,
  scriptIdToPunctRegion,
  punctFixedEm,
  isPunctNonAdjustable,
  verticalQuoteEquivalent,
  verticalQuoteJaEquivalent,
  VERTICAL_QUOTE_JA_EQUIVALENT,
  VERTICAL_QUOTE_CN_EQUIVALENT,
} = PG;

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

/* ---------- A. PunctRegion 四態 + scriptIdToPunctRegion ---------- */
test("scriptIdToPunctRegion：四態地區集群（HK 歸 hant）", () => {
  assert.strictEqual(scriptIdToPunctRegion("han"), "zh-Hans");
  assert.strictEqual(scriptIdToPunctRegion("hant"), "zh-Hant");
  assert.strictEqual(scriptIdToPunctRegion("ja"), "ja");
  assert.strictEqual(scriptIdToPunctRegion("ko"), "ko");
  // 非中日韓文種：回傳 null（不套 CJK 標點規則）
  assert.strictEqual(scriptIdToPunctRegion("mong"), null);
  assert.strictEqual(scriptIdToPunctRegion("manchu"), null);
  assert.strictEqual(scriptIdToPunctRegion("latin"), null);
});

/* ---------- B. punctFixedEm（ja/ko 回落 zh-Hant） ---------- */
test("punctFixedEm：ja/ko 全寬＝1em（回落 zh-Hant，與 v2.8.45 同）", () => {
  // 冒號 U+FF1A：直排固定 1em（zhHans/zhHant 均 1）
  assert.strictEqual(punctFixedEm(0xff1a, true, "ja"), 1);
  assert.strictEqual(punctFixedEm(0xff1a, true, "ko"), 1);
  assert.strictEqual(punctFixedEm(0xff1a, true, "zh-Hant"), 1);
  // 間隔號 U+00B7：zhHans 0.5 / zhHant 1；ja/ko 均回落 zhHant
  assert.strictEqual(punctFixedEm(0x00b7, true, "zh-Hans"), 0.5);
  assert.strictEqual(punctFixedEm(0x00b7, true, "zh-Hant"), 1);
  assert.strictEqual(punctFixedEm(0x00b7, true, "ja"), 1);
  assert.strictEqual(punctFixedEm(0x00b7, true, "ko"), 1);
  // 可調整者（如句號）無論地區皆 null
  assert.strictEqual(punctFixedEm(0x3002, true, "ja"), null);
  assert.strictEqual(punctFixedEm(0x3002, true, "ko"), null);
});

/* ---------- C. isPunctNonAdjustable（ja/ko 地區感知） ---------- */
test("isPunctNonAdjustable：ja/ko 地區感知", () => {
  // 冒號直排：兩地區皆不可調整
  assert.strictEqual(isPunctNonAdjustable(0xff1a, true, "ja"), true);
  assert.strictEqual(isPunctNonAdjustable(0xff1a, true, "ko"), true);
  // 驚嘆號 U+FF01：橫排僅 zh-Hant 不可調整；ja/ko 回落（不在列表）→ false（地區感知）
  assert.strictEqual(isPunctNonAdjustable(0xff01, false, "zh-Hant"), true);
  assert.strictEqual(isPunctNonAdjustable(0xff01, false, "ja"), false);
  assert.strictEqual(isPunctNonAdjustable(0xff01, false, "ko"), false);
  // 反向：把地區設成 zh-Hant 又餵可調整者，確認不是恆 true
  assert.strictEqual(isPunctNonAdjustable(0x3002, false, "zh-Hant"), false);
});

/* ---------- D. verticalQuoteEquivalent 分派（mapping A vs B） ---------- */
test("verticalQuoteEquivalent：ja 走 mapping A、其餘走 mapping B", () => {
  // mapping B（中文嵌套，clreq §5.2）：”→「(300C)、‘→『(300E)
  assert.strictEqual(verticalQuoteEquivalent(0x201c, "zh-Hans"), 0x300c);
  assert.strictEqual(verticalQuoteEquivalent(0x2018, "zh-Hant"), 0x300e);
  assert.strictEqual(verticalQuoteEquivalent(0x201c, "ko"), 0x300c);
  assert.strictEqual(verticalQuoteEquivalent(0x2019, "zh-Hans"), 0x300f);
  // mapping A（日文，UAX #50 §3.2.4）：”(201C)→『(300E)、‘(2018)→「(300C)
  assert.strictEqual(verticalQuoteEquivalent(0x201c, "ja"), 0x300e);
  assert.strictEqual(verticalQuoteEquivalent(0x2018, "ja"), 0x300c);
  assert.strictEqual(verticalQuoteEquivalent(0x201d, "ja"), 0x300f);
  assert.strictEqual(verticalQuoteEquivalent(0x2019, "ja"), 0x300d);
  // 非引號基底：undefined
  assert.strictEqual(verticalQuoteEquivalent(0x3002, "ja"), undefined);
  assert.strictEqual(verticalQuoteEquivalent(0x3002, "zh-Hans"), undefined);
});

/* ---------- E. verticalQuoteJaEquivalent + 常數（mapping A） ---------- */
test("verticalQuoteJaEquivalent / VERTICAL_QUOTE_JA_EQUIVALENT：mapping A", () => {
  assert.strictEqual(verticalQuoteJaEquivalent(0x201c), 0x300e); // “ → 『
  assert.strictEqual(verticalQuoteJaEquivalent(0x201d), 0x300f); // ” → 』
  assert.strictEqual(verticalQuoteJaEquivalent(0x2018), 0x300c); // ‘ → 「
  assert.strictEqual(verticalQuoteJaEquivalent(0x2019), 0x300d); // ’ → 」
  // 常數等同 mapping A 記錄
  assert.deepStrictEqual(VERTICAL_QUOTE_JA_EQUIVALENT, {
    0x2018: 0x300c, 0x2019: 0x300d, 0x201c: 0x300e, 0x201d: 0x300f,
  });
  // CN（mapping B）與 JA（mapping A）確實相反（非同一張表）
  assert.notDeepStrictEqual(VERTICAL_QUOTE_JA_EQUIVALENT, VERTICAL_QUOTE_CN_EQUIVALENT);
  assert.strictEqual(VERTICAL_QUOTE_CN_EQUIVALENT[0x201c], 0x300c);
  assert.strictEqual(VERTICAL_QUOTE_JA_EQUIVALENT[0x201c], 0x300e);
});

/* ---------- 收尾 ---------- */
try { unlinkSync(tmpGen); } catch { /* 忽略清理失敗 */ }

console.log(`\n[punct-region] ${passed} 通過 / ${failures.length} 失敗`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.e.message}`);
  process.exit(1);
}
