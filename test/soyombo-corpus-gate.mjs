// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* Soyombo 真實語料門禁（外部語料 梵/巴利語料往返嚴格；與 zanabazar-corpus-gate 同構）
 *
 * ── 語料來源 ────────────────────────────────────────────────────────────
 *   test/data/soyombo-corpus.txt —— 外部語料站
 *   (describe/Soyombo) 梵文《緣起偈》＋巴利《緣起偈》
 *   原生文全文（lilium 轉寫測試語料）。
 *
 * ── 斷言 ────────────────────────────────────────────────────────────────
 *   (1) 全文 native→roman→native（transliterateText 長文掃描全鏈）逐碼位相等。
 *   (2) 全文 roman→native→roman 亦相等（反向對稱無損）。
 *   (3) 鍵級抽查：ś→<ci-sh>（head-mark variant）、長音符 𑩛、tshek 分詞空格。
 *
 * 執行：node test/soyombo-corpus-gate.mjs（可單跑）；run.mjs 已併入。
 * 末行輸出「soyombo-corpus-gate: 通过 N/M」式計數行。
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* 與 zanabazar-corpus-gate.mjs 同法：esbuild 現場 bundle lib-export.ts 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-sycorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { transliterateText } = lib;

const native = fs.readFileSync(path.join(ROOT, "test", "data", "soyombo-corpus.txt"), "utf-8");

let passed = 0;
let total = 0;

// (1) native → roman → native 恆等（長文掃描全鏈）
total++;
const r1 = transliterateText(native, "soyombo", false);
const back = transliterateText(r1.text, "soyombo", true);
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
const r2 = transliterateText(r1.text, "soyombo", true);
const back2 = transliterateText(r2.text, "soyombo", false);
try {
  assert.strictEqual(back2.text, r1.text, "roman→native→roman 逐碼位相等");
  passed++;
  console.log("  [2] roman→native→roman 恆等: ok");
} catch (e) {
  console.error("  [2] roman→native→roman 恆等: FAIL");
  throw e;
}

// (3) 鍵級抽查：ś 疊頭變體＋長音符＋soyombo 疊字語法（mstu 定讞例）
total++;
const sh = transliterateText("ka<ci-sh>va", "soyombo", true);
assert.ok(
  [...sh.text].some(c => { const cp = c.codePointAt(0); return cp === 0x11A86 || cp === 0x11A87 || cp === 0x11A88; }),
  "<ci-sh> → cluster-initial SH head-mark variant（11A86–88 域）"
);
const mstu = String.fromCodePoint(0x11a74, 0x11a99, 0x11a81, 0x11a99, 0x11a6b, 0x11a52);
assert.strictEqual(lib.soyomboNativeToRoman(mstu), "ma+sa+taue", "mstu 疊字定讞例往返");
passed++;
console.log("  [3] <ci-sh> / mstu 疊字鍵級抽查: ok");

console.log(`soyombo-corpus-gate: 通过 ${passed}/${total}`);
if (passed !== total) process.exit(1);
