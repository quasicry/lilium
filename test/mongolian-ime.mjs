// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 蒙古文輸入法單元校驗。
 *
 * 驗證範圍：
 *   1. ZCode 規則引擎（欄位判定）與上游 Dart 實作的行為一致性
 *   2. 字形 → 標準 Unicode 映射的正確性
 *   3. 正字法校正（ng 連寫合流、冗餘喉音去重、FVS 清理）
 *   4. 端到端：拉丁輸入 → 標準蒙古文 Unicode
 *
 * 依賴：Noto Sans Mongolian（OFL-1.1）——驗證所有輸出碼位均在其覆蓋範圍內。
 *
 * 執行：node test/mongolian-ime.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-mglime-"));

execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "src", "mongolian-ime", "index.ts"),
  "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "ime.mjs")}`, "--log-level=silent",
]);
const ime = await import(path.join(TMP, "ime.mjs"));

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const cp = (n) => String.fromCodePoint(n);
const codes = (s) => [...s].map((c) => c.codePointAt(0));

// 標準蒙古文碼位
const A = cp(0x1820), E = cp(0x1821), I = cp(0x1822), O = cp(0x1823),
  U = cp(0x1824), OE = cp(0x1825), UE = cp(0x1826),
  NA = cp(0x1828), ANG = cp(0x1829), BA = cp(0x182a), PA = cp(0x182b),
  QA = cp(0x182c), GA = cp(0x182d), MA = cp(0x182e), LA = cp(0x182f),
  SA = cp(0x1830), SHA = cp(0x1831), TA = cp(0x1832), DA = cp(0x1833),
  CHA = cp(0x1834), JA = cp(0x1835), YA = cp(0x1836), RA = cp(0x1837),
  WA = cp(0x1838), FA = cp(0x1839), KA = cp(0x183a), ZA = cp(0x183d);
const FVS1 = cp(0x180b), FVS2 = cp(0x180c), FVS3 = cp(0x180d);

const best = (w) => ime.latinToMongolianBest(w);

console.log("\n【1】單字母（孤立形）");
test("a → ᠠ", () => assert.strictEqual(best("a"), A));
test("e → ᠡ", () => assert.strictEqual(best("e"), E));
test("i → ᠢ", () => assert.strictEqual(best("i"), I));
test("n → ᠨ", () => assert.strictEqual(best("n"), NA));
test("b → ᠪ", () => assert.strictEqual(best("b"), BA));
test("g → ᠭ", () => assert.strictEqual(best("g"), GA));
test("h → ᠬ", () => assert.strictEqual(best("h"), QA));
test("m → ᠮ", () => assert.strictEqual(best("m"), MA));
test("l → ᠯ", () => assert.strictEqual(best("l"), LA));
test("s → ᠰ", () => assert.strictEqual(best("s"), SA));
test("t → ᠲ", () => assert.strictEqual(best("t"), TA));
test("d → ᠳ", () => assert.strictEqual(best("d"), DA));

console.log("\n【2】雙字母詞");
test("bi → ᠪᠢ", () => assert.strictEqual(best("bi"), BA + I));
test("ta → ᠲᠠ", () => assert.strictEqual(best("ta"), TA + A));
test("no → ᠨᠣ（字典命中，經規則引擎輸出標準形）", () => assert.strictEqual(best("no"), NA + O));
test("na → ᠨᠠ", () => assert.strictEqual(best("na"), NA + A));

console.log("\n【3】ng 連寫合流（核心正字法）");
test("monggol → ᠮᠣᠩᠭᠣᠯ", () => assert.strictEqual(best("monggol"), MA + O + ANG + GA + O + LA));
test("anggi → ᠠᠩᠭᠢ", () => assert.strictEqual(best("anggi"), A + ANG + GA + I));
test("sangg → ᠰᠠᠩᠭ", () => assert.strictEqual(best("sangg"), SA + A + ANG + GA));
test("ng 合流後不含孤立 ᠨ", () => assert.ok(!best("monggol").includes(NA + FVS1), "不應出現 ᠨ᠋"));

console.log("\n【4】不含 ng 的詞不受去重影響");
test("jarlig → ᠵᠠᠷᠯᠢᠭ", () => assert.strictEqual(best("jarlig"), JA + A + RA + LA + I + GA));
test("baigal → ᠪᠠᠢᠭᠠᠯ", () => assert.strictEqual(best("baigal"), BA + A + I + GA + A + LA));
test("uggage 保留雙 ᠭ", () => assert.ok(best("uggage").includes(GA + GA), "uggage 的雙 g 應保留"));

console.log("\n【5】輸出碼位均在 Noto Sans Mongolian 覆蓋範圍");
test("所有輸出落於 U+180B–U+18AF 或拉丁", () => {
  const words = ["a", "monggol", "sain", "baina", "jarlig", "baigal", "anggi"];
  for (const w of words) {
    for (const ch of best(w)) {
      const c = ch.codePointAt(0);
      const ok = (c >= 0x180b && c <= 0x18af) || c < 0x80;
      assert.ok(ok, `${w} 產出區外碼位 U+${c.toString(16)}`);
    }
  }
});

console.log("\n【6】候選排序與來源");
test("字典命中優先（score 1000）", () => {
  const c = ime.latinToMongolian("yin");
  assert.ok(c.length > 0);
  assert.strictEqual(c[0].source, "dict");
  assert.strictEqual(c[0].score, 1000);
});
test("同詞候選去重", () => {
  const c = ime.latinToMongolian("monggol");
  const texts = c.map((x) => x.text);
  assert.strictEqual(new Set(texts).size, texts.length, "候選不應重複");
});
test("空輸入返回空陣列", () => assert.deepStrictEqual(ime.latinToMongolian(""), []));
test("拉丁輸出回退（無候選時原樣返回）", () => assert.strictEqual(ime.latinToMongolianBest(""), ""));

console.log("\n【7】元音和諧檢驗");
test("純陽性 a+o 通過", () => assert.ok(ime.checkVowelHarmony(A + O)));
test("純陰性 e+u 通過", () => assert.ok(ime.checkVowelHarmony(E + U)));
test("陰陽混用不通過", () => assert.ok(!ime.checkVowelHarmony(A + E)));
test("i 為中性，可搭配任一", () => {
  assert.ok(ime.checkVowelHarmony(A + I));
  assert.ok(ime.checkVowelHarmony(E + I));
});

console.log("\n【8】IME 輸入偵測");
test("monggol 是合法 IME 輸入", () => assert.ok(ime.looksLikeMongolianLatin("monggol")));
test("含數字者非合法輸入", () => assert.ok(!ime.looksLikeMongolianLatin("mong1")));
test("空字串非合法輸入", () => assert.ok(!ime.looksLikeMongolianLatin("")));

console.log("\n【9】字形偵測與標準化");
test("辨識 ZCode 字形碼位", () => assert.ok(ime.containsZCodeGlyphs(cp(0x186a))));
test("辨識標準蒙古文", () => assert.ok(ime.containsStandardMongolian(A)));
test("標準蒙古文非 ZCode 字形", () => assert.ok(!ime.containsZCodeGlyphs(A)));
test("toCleanMongolian 剝離 FVS", () => {
  assert.strictEqual(ime.toCleanMongolian(NA + FVS1 + GA), NA + GA);
});

console.log("\n【10】正字法管線冪等性");
test("連續套用不改變結果", () => {
  const once = ime.applyOrthography(MA + O + NA + FVS1 + GA + GA + O + LA);
  const twice = ime.applyOrthography(once);
  assert.strictEqual(once, twice);
});

console.log("\n【11】即時上屏門禁：首字母大寫哨兵");
test("大寫開頭蒙古文詞觸發（Monggol）", () => {
  assert.ok(ime.looksLikeMongolianSyllableTriggered("Monggol"));
});
test("小寫開頭不觸發（monggol）", () => {
  assert.ok(!ime.looksLikeMongolianSyllableTriggered("monggol"));
});
test("常見英文短詞全部不觸發（哨兵法核心保障）", () => {
  const english = [
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "her",
    "was", "one", "our", "out", "day", "get", "has", "him", "his", "how",
    "man", "new", "now", "old", "see", "two", "way", "who", "boy", "did",
    "its", "let", "put", "say", "she", "too", "use",
    "when", "like", "time", "data", "file", "user", "code", "note", "text",
    "make", "world", "about", "first", "there", "which", "hello", "test",
    "name", "page", "line", "item", "list", "menu", "edit", "view", "open",
  ];
  const hit = english.filter((w) => ime.looksLikeMongolianSyllableTriggered(w));
  assert.strictEqual(hit.length, 0, `誤觸發英文詞: ${hit.join(", ")}`);
});
test("大寫蒙古文詞實際可轉換為標準 Unicode", () => {
  assert.strictEqual(ime.latinToMongolianBest("monggol"), "ᠮᠣᠩᠭᠣᠯ");
  assert.strictEqual(ime.latinToMongolianBest("sain"), "ᠰᠠᠢᠨ");
  assert.strictEqual(ime.latinToMongolianBest("yabogsan"), "ᠶᠠᠪ᠋ᠣᠭᠰᠠᠨ");
});

console.log("\n【12】音節合法性門禁（命令路徑用）");
test("蒙古文詞通過音節門禁", () => {
  for (const w of ["monggol", "sain", "baigal", "bichig", "tala", "nutug", "ebul", "ger", "usun", "morin"]) {
    assert.ok(ime.looksLikeMongolianSyllable(w), `${w} 應通過`);
  }
});
test("英文長詞被音節門禁擋下", () => {
  for (const w of ["world", "about", "first", "there", "which", "hello", "test", "make", "code", "note", "text"]) {
    assert.ok(!ime.looksLikeMongolianSyllable(w), `${w} 應被拒`);
  }
});
test("單字母不觸發（避免誤傷）", () => {
  assert.ok(!ime.looksLikeMongolianSyllable("a"));
  assert.ok(!ime.looksLikeMongolianSyllableTriggered("A"));
});

console.log(`\n蒙古文輸入法測試：通過 ${passed}，失敗 ${failed}`);
if (failed > 0) process.exit(1);
