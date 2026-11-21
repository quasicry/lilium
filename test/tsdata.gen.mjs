#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * src/tsdata/ 資料層的自驗證（**獨立腳本，不被 test/run.mjs 載入**）
 *
 * 用法：node test/tsdata.gen.mjs
 *
 * 驗證什麼
 * --------
 * 1. **全碼位比對**（0x0..0x10FFFF，共 1 114 112 個）：把 UCD 原始 .txt 直接展開成
 *    逐碼位真值，與生成的兩級查表逐個對比。抽樣比對會漏掉「只在某個塊邊界算錯」
 *    的錯誤，所以這裡走滿全部碼位，必須 100% 一致。
 * 2. **已知值抽查**：對照調研報告 B.3.1 的實測表（U+3002=Tu、U+1820=R、U+11580=U…），
 *    確保真值本身沒被解析錯（否則「錯的真值對錯的表」也會全綠）。
 * 3. **幂等**：以 `--check` 重跑兩個 gen 腳本，確認輸出與既有檔案逐位元組相同。
 * 4. **溯源標頭**：版本號／來源 URL／授權宣告缺一不可（FONT-LICENSES.md / NOTICE.md 要求）。
 * 5. **punct.gen.ts**：三態表的必要覆蓋與條款一致性（LI-TS-101/102/104/105）。
 *
 * 為什麼不併進 test/run.mjs：run.mjs 由主控與另一個 Worker 獨佔，資料層的驗證
 * 不應與其基線互相干擾；本檔保持可獨立執行。
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  UCD_DIR,
  loadGeneratedTs,
  parseUcd,
  reportVerification,
  verifyAllCodePoints,
} from "../scripts/ucd/ucd-lib.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

const VO_SRC = path.join(UCD_DIR, "VerticalOrientation-18.0.0.txt");
const LB_SRC = path.join(UCD_DIR, "LineBreak-18.0.0.txt");
const VO_OUT = path.join(ROOT, "src", "tsdata", "vo.gen.ts");
const LB_OUT = path.join(ROOT, "src", "tsdata", "lb.gen.ts");
const PUNCT_OUT = path.join(ROOT, "src", "tsdata", "punct.gen.ts");

const vo = await loadGeneratedTs(VO_OUT);
const lb = await loadGeneratedTs(LB_OUT);
const punct = await loadGeneratedTs(PUNCT_OUT);

console.log("\n— vo.gen.ts（UAX #50 Vertical_Orientation）—");

// 真值由原始 .txt 展開；值域碼直接取生成檔的常數，確保兩邊用同一套編碼。
const voTruth = parseUcd(readFileSync(VO_SRC, "utf8"), (v) => {
  const code = vo.VerticalOrientation[v];
  assert.notStrictEqual(code, undefined, `vo 值 ${v} 未出現在生成檔的值域常數裡`);
  return code;
});

test("vo 全碼位比對（原始 .txt vs 兩級查表）", () => {
  assert.ok(reportVerification("vo", verifyAllCodePoints(voTruth.classes, vo.getVerticalOrientation)));
});

test("vo 已知值抽查（對照調研 B.3.1 實測表）", () => {
  const expect = {
    0x3002: "Tu", 0x3001: "Tu", 0xff0c: "Tu", 0xff01: "Tu", 0xff1f: "Tu",
    0xff1a: "Tr", 0xff1b: "Tr", 0x300c: "Tr", 0xff5e: "Tr",
    0x2014: "R", 0x2e3a: "R", 0x2026: "R", 0x00b7: "R", 0x002f: "R", 0x1820: "R",
    0xff0f: "U", 0x11580: "U", 0xfe10: "U",
  };
  for (const [cp, name] of Object.entries(expect)) {
    const got = vo.getVerticalOrientation(Number(cp));
    assert.strictEqual(got, vo.VerticalOrientation[name], `U+${Number(cp).toString(16).toUpperCase()} 應為 ${name}`);
  }
});

test("vo 未列出碼位回傳 @missing 預設值 R", () => {
  // U+10FFFE..U+10FFFF 未被任何條目覆蓋，應落回 @missing: 0000..10FFFF; R
  assert.strictEqual(vo.getVerticalOrientation(0x10fffe), vo.VerticalOrientation.R);
  assert.strictEqual(vo.getVerticalOrientation(0xffff), vo.VerticalOrientation.R);
  assert.strictEqual(vo.getVerticalOrientation(0x10ffff), vo.VerticalOrientation.R);
});

test("vo 溯源標頭：版本號 / 來源 URL / 授權宣告", () => {
  const src = readFileSync(VO_OUT, "utf8");
  for (const needle of [
    "本檔由 scripts/gen-vo.mjs 生成，請勿手改",
    "Unicode 版本",
    "https://www.unicode.org/Public/UCD/latest/ucd/VerticalOrientation-18.0.0.txt",
    "scripts/ucd/VerticalOrientation-18.0.0.txt",
    "https://www.unicode.org/terms_of_use.html",
    "Unicode®, Inc.",
    "UAX #50",
    "LI-TS-201",
  ]) {
    assert.ok(src.includes(needle), `vo.gen.ts 檔頭缺少：${needle}`);
  }
  assert.strictEqual(vo.VO_UNICODE_VERSION, voTruth.unicodeVersion);
  assert.match(vo.VO_SOURCE_DATE, /^\d{4}-\d{2}-\d{2}$/);
});

console.log("\n— lb.gen.ts（UAX #14 Line_Break）—");

const lbTruth = parseUcd(readFileSync(LB_SRC, "utf8"), (v) => {
  const code = lb.LineBreakClass[v];
  assert.notStrictEqual(code, undefined, `Line_Break 類別 ${v} 未出現在生成檔的常數裡`);
  return code;
});

test("lb 全碼位比對（原始 .txt vs 兩級查表）", () => {
  assert.ok(reportVerification("lb", verifyAllCodePoints(lbTruth.classes, lb.getLineBreakClass)));
});

test("lb 已知值抽查（CL/OP/NS/GL/ID/CJ 等）", () => {
  const expect = {
    0x3002: "CL", 0xff08: "OP", 0x300c: "OP", 0xff1a: "NS", 0x00a0: "GL",
    0x4e00: "ID", 0x3041: "CJ", 0x30a1: "CJ", 0x0020: "SP", 0x2014: "B2", 0x2026: "IN",
  };
  for (const [cp, name] of Object.entries(expect)) {
    const got = lb.getLineBreakClass(Number(cp));
    assert.strictEqual(got, lb.LineBreakClass[name], `U+${Number(cp).toString(16).toUpperCase()} 應為 ${name}`);
  }
});

test("lb 類別表涵蓋 UAX #14 全部 49 個原始類別，且投影後不超過 32 碼", () => {
  const names = Object.keys(lb.LineBreakClass);
  assert.strictEqual(names.length, 49, `應有 49 個原始類別名，實得 ${names.length}`);
  for (const n of ["CL", "OP", "NS", "GL", "ID", "CJ", "AL", "BA", "BB", "BK", "CM", "QU", "WJ", "ZW"]) {
    assert.ok(n in lb.LineBreakClass, `缺少類別 ${n}`);
  }
  const codes = new Set(Object.values(lb.LineBreakClass));
  assert.ok(codes.size <= 32, `投影後類別碼應 ≤ 32，實得 ${codes.size}`);
  assert.strictEqual(lb.LB_CLASS_NAMES.length, codes.size);
  // 投影關係：AI/SG/XX/CB → AL，JL/JV/JT → ID，CR/LF/NL → BK，ZWJ → CM
  assert.strictEqual(lb.LineBreakClass.AI, lb.LineBreakClass.AL);
  assert.strictEqual(lb.LineBreakClass.XX, lb.LineBreakClass.AL);
  assert.strictEqual(lb.LineBreakClass.JL, lb.LineBreakClass.ID);
  assert.strictEqual(lb.LineBreakClass.CR, lb.LineBreakClass.BK);
  assert.strictEqual(lb.LineBreakClass.ZWJ, lb.LineBreakClass.CM);
});

test("lb 溯源標頭：版本號 / 來源 URL / 授權宣告", () => {
  const src = readFileSync(LB_OUT, "utf8");
  for (const needle of [
    "本檔由 scripts/gen-lb.mjs 生成，請勿手改",
    "Unicode 版本",
    "https://www.unicode.org/Public/UCD/latest/ucd/LineBreak-18.0.0.txt",
    "https://www.unicode.org/terms_of_use.html",
    "Unicode®, Inc.",
    "UAX #14",
    "LI-TS-402",
  ]) {
    assert.ok(src.includes(needle), `lb.gen.ts 檔頭缺少：${needle}`);
  }
  assert.strictEqual(lb.LB_UNICODE_VERSION, lbTruth.unicodeVersion);
});

console.log("\n— punct.gen.ts（clreq 標點三態，人工整理）—");

const REQUIRED_COVERAGE = [
  0x2014, 0x2026, 0x3001, 0x3002, 0xff0c, 0xff1a, 0xff1b, 0xff1f, 0xff01,
  0x300c, 0x300d, 0x300e, 0x300f, 0xff08, 0xff09, 0x00b7,
];

test("punct 涵蓋標準要求的所有碼位", () => {
  for (const cp of REQUIRED_COVERAGE) {
    assert.ok(punct.punctRule(cp) !== undefined, `缺少 U+${cp.toString(16).toUpperCase()}`);
  }
});

test("LI-TS-102：直排的 ：；？！ 恆 1 em 且不可調整", () => {
  for (const cp of [0xff1a, 0xff1b, 0xff1f, 0xff01]) {
    const rule = punct.punctRule(cp);
    assert.ok(rule, `缺少 U+${cp.toString(16).toUpperCase()}`);
    assert.strictEqual(rule.rotateVertical, false, "LI-TS-101：點號直排不旋轉");
    assert.ok(punct.isPunctNonAdjustable(cp, true, "zh-Hans"), "直排應不可調整");
    assert.ok(punct.isPunctNonAdjustable(cp, true, "zh-Hant"), "直排應不可調整");
    assert.strictEqual(punct.punctFixedEm(cp, true, "zh-Hans"), 1);
    assert.strictEqual(punct.punctFixedEm(cp, true, "zh-Hant"), 1);
    // 橫排規則與直排相反：§6.3.2.1 的橫排不可調整者只有「港台式問號、驚嘆號」，
    // 冒號／分號在橫排兩地區都可調整——把直排規則誤用到橫排正是 LI-TS-102 的既有 bug。
    assert.strictEqual(punct.isPunctNonAdjustable(cp, false, "zh-Hans"), false);
    assert.strictEqual(
      punct.isPunctNonAdjustable(cp, false, "zh-Hant"),
      cp === 0xff1f || cp === 0xff01,
      `U+${cp.toString(16).toUpperCase()} 的橫排港台可調整性不符 §6.3.2.1`,
    );
  }
});

test("LI-TS-101：破折號／省略號／引號／括號直排右旋 90°", () => {
  for (const cp of [0x2014, 0x2e3a, 0x2026, 0x22ef, 0x300c, 0x300d, 0x300e, 0x300f, 0xff08, 0xff09]) {
    assert.strictEqual(punct.punctRule(cp).rotateVertical, true, `U+${cp.toString(16).toUpperCase()} 應右旋`);
  }
  for (const cp of [0x3001, 0x3002, 0xff0c, 0xff0f, 0x00b7]) {
    assert.strictEqual(punct.punctRule(cp).rotateVertical, false, `U+${cp.toString(16).toUpperCase()} 不應旋轉`);
  }
});

test("LI-TS-103：不可分離集合（⸺ 單碼位 + 三組雙碼位序列）", () => {
  assert.strictEqual(punct.punctRule(0x2e3a).unbreakable, true);
  const seq = punct.UNBREAKABLE_SEQUENCES.map(([a, b]) => `${a}-${b}`);
  assert.ok(seq.includes(`${0x2014}-${0x2014}`), "缺少 ——");
  assert.ok(seq.includes(`${0x2026}-${0x2026}`), "缺少 ……");
  assert.ok(seq.includes(`${0x22ef}-${0x22ef}`), "缺少 ⋯⋯");
});

test("LI-TS-104：U+00B7 間隔號直排不旋轉 + 港台 1em / 大陸 0.5em 二態", () => {
  assert.strictEqual(punct.punctRule(0x00b7).rotateVertical, false);
  assert.ok(punct.isPunctNonAdjustable(0x00b7, true, "zh-Hans"));
  assert.ok(punct.isPunctNonAdjustable(0x00b7, false, "zh-Hant"));
  assert.strictEqual(punct.punctFixedEm(0x00b7, true, "zh-Hans"), 0.5);
  assert.strictEqual(punct.punctFixedEm(0x00b7, true, "zh-Hant"), 1);
  assert.strictEqual(punct.punctFixedEm(0x00b7, false, "zh-Hant"), 1);
});

test("LI-TS-105：直排引號 SVS 用 VS2（U+FE01），不是 FE0E/FE0F", () => {
  assert.strictEqual(punct.VERTICAL_QUOTE_VS, 0xfe01);
  assert.notStrictEqual(punct.VERTICAL_QUOTE_VS, 0xfe0e);
  assert.notStrictEqual(punct.VERTICAL_QUOTE_VS, 0xfe0f);
  for (const [base_, vs] of punct.VERTICAL_QUOTE_SVS) {
    assert.ok([0x2018, 0x2019, 0x201c, 0x201d].includes(base_));
    assert.strictEqual(vs, 0xfe01);
  }
  assert.strictEqual(punct.VERTICAL_QUOTE_SVS.length, 4);
});

test("punct 未列出碼位回傳 undefined（＝可分離、不旋轉、可調整）", () => {
  assert.strictEqual(punct.punctRule(0x0041), undefined);
  assert.strictEqual(punct.isPunctNonAdjustable(0x0041, true, "zh-Hans"), false);
  assert.strictEqual(punct.punctFixedEm(0x0041, true, "zh-Hans"), null);
});

test("punct 檔頭標註人工整理與規範溯源", () => {
  const src = readFileSync(PUNCT_OUT, "utf8");
  for (const needle of [
    "人工整理",
    "https://www.w3.org/TR/clreq/",
    "LI-TS-101",
    "LI-TS-102",
    "LI-TS-103",
    "LI-TS-104",
    "LI-TS-105",
  ]) {
    assert.ok(src.includes(needle), `punct.gen.ts 檔頭缺少：${needle}`);
  }
});

console.log("\n— 幂等（重跑 gen 腳本，輸出必須逐位元組相同）—");

for (const script of ["gen-vo.mjs", "gen-lb.mjs"]) {
  test(`${script} --check：重新生成內容與既有檔案一致`, () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", script), "--check"], { encoding: "utf8" });
    assert.strictEqual(r.status, 0, `失敗：${r.stdout}${r.stderr}`);
  });
}

console.log(`\n資料層驗證：${passed} 通過 / ${failures.length} 失敗`);
if (failures.length > 0) {
  for (const f of failures) console.error(`\n✗ ${f.name}\n${f.e.stack}`);
  process.exit(1);
}
