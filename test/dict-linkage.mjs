// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 辭典「寫作系統 ⇄ 辭典」聯動 — 純函數單元測試（Part 2）。
 *
 * 驗證：
 *  - segmenterLocaleFor：依文種回傳 Intl.Segmenter 應用的 BCP47 locale
 *    （CJK/日/韓/阿拉伯/…有具體 locale；蒙古/滿/藏/拉丁等回傳 undefined 沿用默認）
 *  - scriptLangCode：文種 → 簡短語言碼（詞典優先匹配用）
 *  - getWordAtOffset(locale)：傳入文種 locale 不拋錯，且對 CJK 仍切出合法詞
 *
 * 用法：node test/dict-linkage.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });
const esbuild = path.join(ROOT, "node_modules", ".bin", "esbuild");

const langOut = path.join(TMP, "languages-link.mjs");
const wdOut = path.join(TMP, "word-detection-link.mjs");
execFileSync(esbuild, [path.join(ROOT, "src", "languages.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${langOut}`], { stdio: "pipe" });
execFileSync(esbuild, [path.join(ROOT, "src", "dict", "word-detection.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${wdOut}`], { stdio: "pipe" });

const { segmenterLocaleFor, scriptLangCode } = await import(langOut);
const { getWordAtOffset } = await import(wdOut);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓ " + m); };
const bad = (m, e) => { fail++; console.error("  ✗ " + m + " — " + (e?.message ?? e)); };
async function test(name, fn) {
  try { await fn(); ok(name); } catch (e) { bad(name, e); }
}

console.log("\n[dict-linkage] 寫作系統 ⇄ 辭典 聯動：文種 → 斷詞 locale / 語言碼");

await test("segmenterLocaleFor：CJK/日/韓 回傳具體 locale", () => {
  assert.strictEqual(segmenterLocaleFor("han"), "zh-Hans");
  assert.strictEqual(segmenterLocaleFor("hant"), "zh-Hant");
  assert.strictEqual(segmenterLocaleFor("ja"), "ja");
  assert.strictEqual(segmenterLocaleFor("ko"), "ko");
});

await test("segmenterLocaleFor：阿拉伯/希伯來/天城體/巴利/維吾爾/僧伽羅 回傳 locale", () => {
  assert.strictEqual(segmenterLocaleFor("arabic"), "ar");
  assert.strictEqual(segmenterLocaleFor("hebrew"), "he");
  assert.strictEqual(segmenterLocaleFor("sanskrit"), "sa");
  assert.strictEqual(segmenterLocaleFor("pali"), "pi");
  assert.strictEqual(segmenterLocaleFor("uyghur"), "ug");
  assert.strictEqual(segmenterLocaleFor("sinhala"), "si");
});

await test("segmenterLocaleFor：蒙古/滿/回鶻/錫伯/藏/拉丁 回傳 undefined（沿用默認 Segmenter）", () => {
  assert.strictEqual(segmenterLocaleFor("mongolian"), undefined);
  assert.strictEqual(segmenterLocaleFor("manchu"), undefined);
  assert.strictEqual(segmenterLocaleFor("olduyghur"), undefined);
  assert.strictEqual(segmenterLocaleFor("xibe"), undefined);
  assert.strictEqual(segmenterLocaleFor("tibetan"), undefined);
  assert.strictEqual(segmenterLocaleFor("latin"), undefined);
});

await test("scriptLangCode：文種 → 簡短語言碼", () => {
  assert.strictEqual(scriptLangCode("han"), "zh");
  assert.strictEqual(scriptLangCode("hant"), "zh");
  assert.strictEqual(scriptLangCode("ja"), "ja");
  assert.strictEqual(scriptLangCode("mongolian"), "mn");
  assert.strictEqual(scriptLangCode("manchu"), "mn");
  assert.strictEqual(scriptLangCode("tibetan"), "bo");
  assert.strictEqual(scriptLangCode("sanskrit"), "sa");
  assert.strictEqual(scriptLangCode("pali"), "pi");
  assert.strictEqual(scriptLangCode("latin"), "en");
});

await test("getWordAtOffset(locale)：傳 locale 不拋錯，CJK 切出合法詞", () => {
  const text = "漢字詞語垂直書寫測試";
  const hit = getWordAtOffset(text, 2, segmenterLocaleFor("han"));
  assert.ok(hit, "應切出詞");
  assert.ok(text.includes(hit.word), `「${hit.word}」應為原文子串`);
});

await test("getWordAtOffset：未傳 locale（默認行爲）仍可用", () => {
  const text = "查詞聯動";
  const hit = getWordAtOffset(text, 1);
  assert.ok(hit, "默認模式應切出詞");
  assert.ok(text.includes(hit.word));
});

console.log(`\n[dict-linkage] 結果：${pass} 通過 / ${fail} 失敗`);
if (fail > 0) { console.error("[dict-linkage] ❌ 有失敗"); process.exit(1); }
console.log("[dict-linkage] 全部通過 ✅");
