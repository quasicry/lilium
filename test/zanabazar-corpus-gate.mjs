// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* Zanabazar Square 真實語料門禁
 *
 * ── 語料來源 ────────────────────────────────────────────────────────────
 *   test/data/zanabazar-corpus.txt —— 外部語料站
 *   (describe/ZanabazarSquare) 梵文《緣起偈》＋巴利《緣起偈》
 *   原生文全文。344 碼位，體積小，
 *   隨 repo 提交（非外部 corpus 目錄）。
 *
 * ── 斷言 ────────────────────────────────────────────────────────────────
 *   (1) 全文 native→roman→native（transliterateText 長文掃描全鏈）逐碼位相等。
 *       歷史三缺陷皆由本語料實錘：<a-o> 獨立元音組合缺 romanTokenRe（切碎成
 *       head mark+virama 亂序）、tshek「空格↔11A41」與語料 0x20 分詞慣例互撞
 *       （往返互吞）、<ts> 顯式 token 缺 parser 詞表。修復後恆等。
 *   (2) 全文 roman→native→roman 亦相等（反向對稱無損）。
 *   (3) 鍵級抽查：oṃ=<a-o>ṃ、tshek=<ts> 雙向。
 *
 * 執行：node test/zanabazar-corpus-gate.mjs（可單跑）；run.mjs 已併入。
 * 末行輸出「zanabazar-corpus-gate: 通过 N/M」式計數行。
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* 與 manchu-corpus-gate.mjs 同法：esbuild 現場 bundle lib-export.ts 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-zancorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { transliterateText } = lib;

const native = fs.readFileSync(path.join(ROOT, "test", "data", "zanabazar-corpus.txt"), "utf-8");

let passed = 0;
let total = 0;

// (1) native → roman → native 恆等（長文掃描全鏈）
total++;
const r1 = transliterateText(native, "zanabazar", false);
const back = transliterateText(r1.text, "zanabazar", true);
try {
  assert.strictEqual(back.text, native, "native→roman→native 逐碼位相等");
  passed++;
  console.log("  [1] native→roman→native 恆等: ok");
} catch (e) {
  console.error("  [1] native→roman→native 恆等: FAIL");
  const a = [...native];
  const b = [...back.text];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.error(
        `    首個差異 @${i}: orig=${a[i]?.codePointAt(0)?.toString(16)} back=${b[i]?.codePointAt(0)?.toString(16)}`
      );
      break;
    }
  }
  throw e;
}

// (2) roman → native → roman 恆等
total++;
const r2 = transliterateText(r1.text, "zanabazar", true);
const back2 = transliterateText(r2.text, "zanabazar", false);
try {
  assert.strictEqual(back2.text, r1.text, "roman→native→roman 逐碼位相等");
  passed++;
  console.log("  [2] roman→native→roman 恆等: ok");
} catch (e) {
  console.error("  [2] roman→native→roman 恆等: FAIL");
  throw e;
}

// (3) 鍵級抽查：oṃ 與 tshek 顯式 token
total++;
const om = transliterateText("<a-o>ṃ", "zanabazar", true);
assert.strictEqual(
  [...om.text].map(c => c.codePointAt(0).toString(16)).join(" "),
  "11a00 11a06 11a35",
  "<a-o>ṃ → A + O-sign + candrabindu"
);
const ts = transliterateText("ka<ts>ka", "zanabazar", true);
assert.strictEqual(
  [...ts.text].map(c => c.codePointAt(0).toString(16)).join(" "),
  "11a0b 11a41 11a0b",
  "ka<ts>ka → ka + tshek + ka"
);
passed++;
console.log("  [3] <a-o>ṃ / <ts> 鍵級抽查: ok");

console.log(`zanabazar-corpus-gate: 通过 ${passed}/${total}`);
if (passed !== total) process.exit(1);
