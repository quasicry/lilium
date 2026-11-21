// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* W9-E：轉寫方案文種字體在（辭典）面板 / markdown 預覽的齊備性回歸
 *
 * 守的是需求 1：所有轉寫方案分組的原生文字，在辭典面板的轉寫結果
 * （含校勘面板長文本轉寫、轉寫檢字表）、以及 markdown 預覽裡，都必須套到
 * 一個「真實存在、且由 lilium 隨插件內嵌」的字體 family；否則就會缺字回退成豆腐塊。
 *
 * 具體鎖三件事：
 *  1. 每個轉寫分組都有 SCHEME_GROUP_SCRIPT 映射（漏映射 → groupFontStack 回 null → 豆腐）
 *  2. 每個分組的 groupFontStack 非 null，且其棧首 family 落在 li 內嵌字體族集合內
 *  3. listSchemes() 裡出現的每個 group 都被 SCHEME_GROUP_SCRIPT 覆蓋
 *     （任何一個方案 group 漏登 → 該方案檢字表 / 輸出是豆腐）
 *
 * 用法：node test/w9e-panel-fonts.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-w9e-"));
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const {
  listSchemes, SCHEME_GROUP_SCRIPT, groupFontStack, SCRIPTS, SCRIPT_IDS,
  BUNDLED_NOTO_FONT_FILES, BUNDLED_SIDDHAM_LANTSA_FONT_FILES,
} = lib;

// lilium 隨插件內嵌的全部字體族（CDN 下載項 + 內嵌 base64 項），
// 這些在插件啟動時被 ensureBundledFonts 落盤並由 FontManager 註冊 @font-face。
const BUNDLED_FAMILIES = new Set([
  ...BUNDLED_NOTO_FONT_FILES.map((f) => f.family),
  ...BUNDLED_SIDDHAM_LANTSA_FONT_FILES.map((f) => f.family),
]);

// 與 fonts.ts FONT_CATALOG 對齊的「可下載後安裝」族集合（與內嵌項取聯集，
// 任一命中即視為「字體真實可用」）。直接掃源碼，避免與 FONT_CATALOG 維護兩份。
// lilium 無 src/fonts.ts（lilith 遺留路徑）——容錯：缺檔即空集合，僅依內嵌清單判定
let CATALOG_FAMILIES = new Set();
try {
  const fontsSrc = fs.readFileSync(path.join(ROOT, "src", "fonts.ts"), "utf8");
  CATALOG_FAMILIES = new Set(
    [...fontsSrc.matchAll(/family:\s*"([^"]+)"/g)].map((m) => m[1])
  );
} catch { /* no src/fonts.ts in this tree */ }

const AVAILABLE_FAMILIES = new Set([...BUNDLED_FAMILIES, ...CATALOG_FAMILIES]);

const firstFamily = (stack) =>
  stack.split(",")[0].trim().replace(/^"|"$/g, "");

test("[W9-E] 10 個轉寫分組全部有 SCHEME_GROUP_SCRIPT 映射", () => {
  const groups = ["tibetan", "sanskrit", "pali", "siddham", "aligali",
    "sinhala", "uyghur", "olduyghur", "mongolian", "manchu"];
  for (const g of groups) {
    assert.ok(SCHEME_GROUP_SCRIPT[g], `分組 ${g} 缺少 SCHEME_GROUP_SCRIPT 映射`);
    assert.ok(SCRIPT_IDS.includes(SCHEME_GROUP_SCRIPT[g]),
      `分組 ${g} 映射到的文種 ${SCHEME_GROUP_SCRIPT[g]} 不存在於 SCRIPTS`);
  }
});

test("[W9-E] 每個分組 groupFontStack 非 null，且棧首 family 是 li 內嵌/可安裝字體", () => {
  for (const [group, script] of Object.entries(SCHEME_GROUP_SCRIPT)) {
    const stack = groupFontStack(group);
    assert.ok(stack && stack.length > 0, `分組 ${group} 的 groupFontStack 為空（會豆腐）`);
    const head = firstFamily(stack);
    assert.ok(AVAILABLE_FAMILIES.has(head),
      `分組 ${group} 棧首 "${head}" 不在 li 內嵌/可安裝字體集合裡（面板會豆腐）`);
    // 該文種字體棧本身也必須以可用字體開頭（雙重保險）
    const head0 = SCRIPTS[script].fontStack[0];
    assert.ok(AVAILABLE_FAMILIES.has(head0),
      `文種 ${script} 字體棧首 "${head0}" 不可用`);
  }
});

test("[W9-E] listSchemes() 出現的每個 group 都被 SCHEME_GROUP_SCRIPT 覆蓋", () => {
  const schemeGroups = new Set(listSchemes().map((s) => s.group));
  for (const g of schemeGroups) {
    assert.ok(SCHEME_GROUP_SCRIPT[g],
      `方案分組 ${g} 未出現在 SCHEME_GROUP_SCRIPT（檢字表 / 輸出會豆腐）`);
    assert.ok(groupFontStack(g), `方案分組 ${g} 的 groupFontStack 為 null`);
  }
});

test("[W9-E] 重點文種字體齊備：藏/梵(天城)/悉曇/蘭札/蒙古/滿/回鶻", () => {
  const expect = {
    tibetan: "Noto Serif Tibetan",
    sanskrit: "Noto Sans Devanagari",
    pali: "Noto Sans Devanagari",
    siddham: "Noto Sans Siddham",
    ranjana: "Nithya Ranjana DU",
    mongolian: "Noto Sans Mongolian",
    manchu: "Noto Sans Mongolian",
    olduyghur: "Noto Serif Old Uyghur",
    sinhala: "Noto Sans Sinhala",
  };
  for (const [script, fam] of Object.entries(expect)) {
    assert.ok(SCRIPT_IDS.includes(script), `文種 ${script} 不存在`);
    const stack = SCRIPTS[script].fontStack.join(", ");
    assert.ok(stack.includes(fam), `${script} 字體棧未含內嵌字體 ${fam}`);
    assert.ok(BUNDLED_FAMILIES.has(fam), `${fam} 必須由 li 內嵌（否則離線即豆腐）`);
  }
});

test("[W9-E] styles.css 的 W9-E 字體類定義存在且對齊內嵌 family", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.ok(css.includes("/* W9-E fonts */"), "styles.css 缺少 W9-E 字體錨點");
  for (const cls of ["li-font-siddham", "li-font-ranjana", "li-font-tibetan",
    "li-font-sanskrit", "li-font-mongolian", "li-font-manchu", "li-font-olduyghur",
    "li-font-sinhala", "li-font-hebrew", "li-font-arabic", "li-font-uyghur", "li-native-font"]) {
    assert.ok(css.includes(`.${cls}`), `styles.css 缺少字體類 .${cls}`);
  }
  assert.ok(css.includes('"Nithya Ranjana DU"'), "蘭札類未對齊內嵌族名 Nithya Ranjana DU");
  assert.ok(css.includes('"Noto Sans Siddham"'), "悉曇類未對齊內嵌族名 Noto Sans Siddham");
});

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
if (failures.length) {
  console.error("\n失敗明細：");
  for (const f of failures) console.error(`  ✗ ${f.name}\n    ${f.e.message}`);
  process.exit(1);
}
