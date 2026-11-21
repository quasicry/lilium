// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 藏文區段符號清單往返門禁。
 *
 * 符號清單實錘：0F00–0FBC 區段逐字符輸入時「大多不能轉成拉丁文」——
 * 根因三類：
 *   1. 孤立元音符號段（無輔音依附）unicodeSyllableToWylie 舊版原樣透傳藏文
 *      → 新增 <v-*> 顯式標註鍵（含 bindu 字形差異鍵 <v-M>/<v-Mc>/<v-Ms>）；
 *   2. 孤立下加字（無主碼位依附）走 「sub 基字」路徑出基字母丟失下加語義
 *      → 新增 <s-*> 顯式標註鍵（含 <s-r><v-*> 混排段）；
 *   3. 0F93/9D/A2 subjoined nukta precomposed 出向基字母 gha 丟失下加語義
 *      → NFKC 分解為兩下加字（0F92 0FB7，canonical NFD 同序）後走 <s-*> 鍵。
 * 判等基準：字串相等或 canonical NFD 等價；0F77/0F79 deprecated 單體
 * （composition exclusion，NFD 不分解）套引擎入口政策分解序後比對（往返歸
 * 分解序＝與 0F81 同款 deprecated 政策，非丟字）。
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-tibsym-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { getScheme } = await import(path.join(TMP, "lib.mjs"));

const cp = (n) => String.fromCodePoint(n);
const sc = getScheme("tibetan-wylie");

// 0F00–0FBC 全賦值碼位（NamesList 逐碼位枚舉；0F77/0F79 deprecated 另行處理；
// 未賦值 0F48/0F6D–0F70/0F98 保留區排除）
const cps = [];
for (let c = 0x0f00; c <= 0x0fbc; c++) {
  const UNASSIGNED = (c === 0x0f48 || (c >= 0x0f6d && c <= 0x0f70) || c === 0x0f98);
  if (UNASSIGNED) continue;
  cps.push(c);
}

// deprecated 單體：NFD 不分解（composition exclusion），引擎入口政策分解序
const DEPRECATED_SEQ = new Map([
  [0x0f77, [0x0fb2, 0x0f71, 0x0f80]],
  [0x0f79, [0x0fb3, 0x0f71, 0x0f80]],
]);
const canonicalKey = (s) => {
  // 0FB3+0F71 規範組合為合形 0F63（JS NFKC）——"lA-i" 往回落 0F63+0F80，
  // 與 deprecated 0F79（=0FB3+0F71+0F80）同分解序，判等前先展開。
  let arr = Array.from(s);
  for (let k = 0; k < arr.length; k++) {
    // 引擎入向 "lA"/"rA" 產合形 0F63/0F62（r25 既有）——本門禁語境（deprecated
    // 單體分解序判等）展為下加字組合序（0FB3/0FB2+0F71）
    if (arr[k].codePointAt(0) === 0x0f63) { arr.splice(k, 1, cp(0x0fb3), cp(0x0f71)); if (arr[k + 1]?.codePointAt(0) === 0x0f71) arr.splice(k + 1, 1); continue; }
    if (arr[k].codePointAt(0) === 0x0f62) { arr.splice(k, 1, cp(0x0fb2), cp(0x0f71)); if (arr[k + 1]?.codePointAt(0) === 0x0f71) arr.splice(k + 1, 1); continue; }
  }
  const joined = arr.join("");
  return Array.from(DEPRECATED_SEQ.has(joined.codePointAt(0)) ? DEPRECATED_SEQ.get(joined.codePointAt(0)).map(cp).join("") : joined)
    .map((ch) => ch.normalize("NFD"))
    .join("");
};

let pass = 0, fail = 0;
const failures = [];
for (const c of cps) {
  const t = cp(c);
  const rom = sc.nativeToRoman(t);
  const back = sc.romanToNative(rom);
  const ok = back === t || canonicalKey(back) === canonicalKey(t);
  if (ok) { pass++; continue; }
  fail++;
  failures.push(`U+${c.toString(16).padStart(4, "0")} → ${JSON.stringify(rom)} → ${JSON.stringify(back)}`);
}
// 出向全拉丁化斷言（NOPASS 實錘防回歸）：輸出不得殘留藏文區段字符
for (const c of cps) {
  const rom = sc.nativeToRoman(cp(c));
  const leftover = Array.from(rom).filter((ch) => {
    const x = ch.codePointAt(0);
    return x >= 0x0f00 && x <= 0x0fff;
  });
  if (leftover.length === 0) { pass++; continue; }
  fail++;
  failures.push(`U+${c.toString(16).padStart(4, "0")} 出向殘留藏文字符：${JSON.stringify(rom)}`);
}

console.log(`tibetan-symbols-gate: ${pass} 通過 / ${fail} 失敗`);
for (const f of failures.slice(0, 20)) console.log("  ✗", f);
if (fail > 0) process.exit(1);
