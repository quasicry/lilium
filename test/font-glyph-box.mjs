// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 字形直排包圍盒單測
 *
 * 守的東西：**「這款字體的點號在直排下偏向哪邊」可以用字形真實位置回答**，
 * 不必再靠家族名裡有沒有 "SC"/"TC" 字樣去猜。`punct-center.ts` 的地區分叉
 * 因此有了度量版判據。
 *
 * 這裡特別用力守住幾件容易悄悄壞掉的事：
 *
 *  1. **必須取 `vert` 替換後的字形**。Noto Sans SC 的「。」原始字形（uni3002）
 *     在字格**左下**（bbox 中心 ≈ −0.305），直排替換成 uniFE12 後才到**右上**
 *     （≈ +0.308）。用原字形量會得到**符號相反**的結論 —— 這是本模組最
 *     致命的錯法，且不會報錯。
 *
 *  2. **`idRangeOffset` 是相對自身位置的位元組偏移**（cmap format 4）。
 *     寫錯會靜默讀到垃圾 glyphId，表現為「量出來的偏移亂跳」。
 *
 *  3. **`loca` 有 short/long 兩式**，由 `head.indexToLocFormat`（offset 50）
 *     決定；short 式存的是「實際偏移 ÷ 2」。搞反會讀到錯字形的盒。
 *
 *  4. **讀不到必須回 `null`，絕不猜**。CFF 輪廓（無 glyf）、非 sfnt、
 *     碼位無字形 —— 都要走降級，由呼叫端退回名稱判據。
 *
 *  5. **只保證水平分量**。垂直方向 bbox 中心 ≠ 墨跡重心（逗號可差 0.2em），
 *     本模組刻意不提供垂直值，別讓後來的人「順手加一下」。
 *
 * 用法：node test/font-glyph-box.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-glyph-box-"));
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  "--outfile=" + path.join(TMP, "lib.mjs"), "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/* ------------------------------------------------------------------ */
/* 降級路徑：讀不到就回 null（合成資料）                                  */
/* ------------------------------------------------------------------ */

test("[L3] 非 sfnt／垃圾資料 → null（不猜、不拋）", () => {
  assert.strictEqual(lib.readVertGlyphOffsetX(new Uint8Array(0), 0x3002), null);
  assert.strictEqual(lib.readVertGlyphOffsetX(new Uint8Array([1, 2, 3, 4, 5]), 0x3002), null);
  // 隨機位元組：不該拋錯，只能是 null
  const junk = new Uint8Array(4096);
  for (let i = 0; i < junk.length; i++) junk[i] = (i * 37) & 0xff;
  assert.strictEqual(lib.readVertGlyphOffsetX(junk, 0x3002), null);
});

test("[L3] ArrayBuffer 與 Uint8Array 兩種入參都要能吃", () => {
  const u8 = new Uint8Array(64);
  assert.strictEqual(lib.readVertGlyphOffsetX(u8, 0x3002), null);
  assert.strictEqual(lib.readVertGlyphOffsetX(u8.buffer, 0x3002), null);
});

/* ------------------------------------------------------------------ */
/* 真機 golden：卷內 Noto Sans SC                                       */
/* ------------------------------------------------------------------ */

const REAL_FONT = path.join(ROOT, "fonts-src/cn-mainland/Noto-Sans-SC.ttf");
const hasReal = fs.existsSync(REAL_FONT);

if (hasReal) {
  const bytes = fs.readFileSync(REAL_FONT);

  // 參照值：fontTools（BoundsPen 量輪廓）對 `vert` 替換後字形算出的 bbox 中心
  const EXPECT = {
    0x3002: 0.308, // 。→ uniFE12
    0x3001: 0.311, // 、→ uniFE11
    0xff0c: 0.249, // ，→ uniFE10
    0xff1a: 0.224, // ：→ uniFE13
  };
  // 真實渲染墨跡重心（fonts-src/cn-mainland/_ink.json，直排實測）
  const INK = { 0x3002: 0.296, 0x3001: 0.3, 0xff0c: 0.262, 0xff1a: 0.218 };

  test("[L3][真機] 直排字形 bbox 水平中心（Noto Sans SC）", () => {
    for (const [cp, want] of Object.entries(EXPECT)) {
      const got = lib.readVertGlyphOffsetX(bytes, Number(cp));
      assert.ok(got !== null, `U+${Number(cp).toString(16)} 應量得到`);
      assert.ok(Math.abs(got - want) < 0.03,
        `U+${Number(cp).toString(16)} bbox 中心 ${got.toFixed(3)} 應 ≈ ${want}（差 ${Math.abs(got - want).toFixed(3)}）`);
    }
  });

  test("[L3][真機] 水平分量須逼近真實渲染墨跡（判族的可靠性依據）", () => {
    for (const [cp, ink] of Object.entries(INK)) {
      const got = lib.readVertGlyphOffsetX(bytes, Number(cp));
      assert.ok(got !== null);
      assert.ok(Math.abs(got - ink) < 0.05,
        `U+${Number(cp).toString(16)} bbox ${got.toFixed(3)} vs 墨跡 ${ink} — 差 ${Math.abs(got - ink).toFixed(3)} 應 <0.05`);
    }
  });

  test("[L3][真機] 反向驗證：不得取用未替換的原始字形（符號相反）", () => {
    // 「。」的原始字形在字格左下（≈ −0.305），直排替換後才到右上。
    // 若忘了走 GSUB vert，這裡會是負值 —— 那會把判族整個帶反。
    const got = lib.readVertGlyphOffsetX(bytes, 0x3002);
    assert.ok(got > 0.15, `。直排字形須偏右（實測 ${got?.toFixed(3)}）；負值代表用了未替換的原始字形`);
  });

  test("[L3][真機] 偏右族判讀：。、，皆 > 0.15 → 屬主流 SC 族", () => {
    for (const cp of [0x3002, 0x3001, 0xff0c]) {
      const got = lib.readVertGlyphOffsetX(bytes, cp);
      assert.ok(got !== null && got > 0.15, `U+${cp.toString(16)} 偏移 ${got?.toFixed(3)} 應 >0.15`);
    }
  });

  test("[L3][真機] 缺字碼位 → null（不猜）", () => {
    // 藏文 U+0F48 等卷內字體沒有的碼位：Noto Sans SC 亦無
    assert.strictEqual(lib.readVertGlyphOffsetX(bytes, 0x0f48), null);
  });
} else {
  console.log("  · 略過真機 golden：fonts-src/cn-mainland/Noto-Sans-SC.ttf 不存在");
}

console.log(`\n字形直排包圍盒：${passed} 通過 / ${failures.length} 失敗`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failures.length ? 1 : 0);
