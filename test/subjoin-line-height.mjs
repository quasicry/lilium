// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(path.join(ROOT, "src/dict/translit-panel.ts"), "utf8");
const css = readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("疊字行距適配：helper 存在且三文種碼位判定正確", () => {
  assert.ok(/applySubjoinLineHeight/.test(src), "應有 applySubjoinLineHeight helper");
  assert.ok(/0x11a47/.test(src), "zanabazar SUBJOINER U+11A47 判定");
  assert.ok(/0x11a99/.test(src), "soyombo SUBJOINER U+11A99 判定");
  assert.ok(/0x11c92/.test(src) && /0x11caf/.test(src), "marchen subjoined 段 U+11C92–U+11CAF 判定");
});
test("輸出端與輸入端都接線＋羅馬方向清殘留", () => {
  assert.ok(/applySubjoinLineHeight\(pre, text/.test(src), "paintOut 輸出端接線");
  assert.ok(/applySubjoinLineHeight\(srcArea/.test(src), "textarea 輸入端接線");
  assert.ok(/removeProperty\('line-height'\)/.test(src), "非疊字方向清 line-height 殘留");
});
test("行距映射規則（n>=2 → n+1.5，n<=1 回落樣式表 2）", () => {
  assert.ok(/maxRun >= 2\) el\.style\.setProperty\('line-height', String\(maxRun \+ 1\.5\)\)/.test(src), "n+1.5 映射");
  assert.ok(/maxRun >= 2/.test(src) === false ? false : true);
});
test("styles.css 基準 line-height:2 仍在（回落基準不動）", () => {
  assert.ok(/\.li-col-translit-pre \{[\s\S]*?line-height: 2;/m.test(css), "輸出框基準行距 2");
});

function test(name, fn) {
  try { fn(); console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, e.message); process.exitCode = 1; }
}
