// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * MD 文檔各文種字符全量審計門禁（r73）。
 *
 * 語料：MD 文檔（天城擴充A/吠陀/悉曇/婆羅米/藏文/瑪欽/索永布/Zanabazar/
 * 八思巴/蒙古/Modi 數字誤入段），逐碼位全量 1058 token：
 *   1. 出向全拉丁化（nativeToRoman 不得殘留任何原生區段字符）
 *   2. 回轉往返無損（romanToNative(nativeToRoman(ch)) === ch）
 * 豁免（設計聲明）：
 *   - 藏文 0F77/0F79：deprecated 單體往返歸引擎政策分解序（r72 裁定，與 0F81 同款）
 *   - 蒙古 1810–1819 數字：出向 ASCII 可讀、入向顯式 <num:*> token（M-3 裁定；
 *     裸 ASCII 數字不入向防年份誤轉）
 *   - 悉曇 115DC/115DD（warbler ru/rū 無宿主單字符）：matra 無宿主情境歸
 *     檢字表聲明（輸入 ru/rū 自動輸出 warbler 形）
 * 修復：未收錄碼位一律 \uXXXX 顯式標註（全拉丁化；各方案入向 esc 對稱還原，
 * 4–6 位十六進位可變長度）。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-mdgate-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { getScheme } = await import(path.join(TMP, "lib.mjs"));

const MD_PATH = path.join(__dirname, "data", "md-translit-corpus.json");
const corpus = JSON.parse(fs.readFileSync(MD_PATH, "utf8"));
const nrm = (a) => Array.from(a).map((c) => c.codePointAt(0).toString(16)).join(",");
const NATIVE_RANGES = [
  [0x0900, 0x097f], [0x1cd0, 0x1cff], [0xa8e0, 0xa8ff], [0x11000, 0x1107f],
  [0x11580, 0x115ff], [0x0f00, 0x0fff], [0x11c00, 0x11cff], [0x11a50, 0x11aff],
  [0x11a00, 0x11a4f], [0xa840, 0xa87f], [0x1800, 0x18af], [0x11b00, 0x11b3f],
];
function hasNative(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    for (const [lo, hi] of NATIVE_RANGES) if (c >= lo && c <= hi) return true;
  }
  return false;
}
const EXEMPT = new Set([
  "tibetan-wylie:0xf77", "tibetan-wylie:0xf79",
  "mongolian:0x1810", "mongolian:0x1811", "mongolian:0x1812", "mongolian:0x1813",
  "mongolian:0x1814", "mongolian:0x1815", "mongolian:0x1816", "mongolian:0x1817",
  "mongolian:0x1818", "mongolian:0x1819",
  "siddham-iast:0x115dc", "siddham-iast:0x115dd",
]);
let pass = 0, fail = 0;
const failures = [];
for (const block of corpus) {
  const sc = getScheme(block.scheme);
  for (const cpv of block.cps) {
    const ch = String.fromCodePoint(cpv);
    const rom = sc.nativeToRoman(ch);
    if (hasNative(rom)) { fail++; failures.push(`${block.scheme} 出向殘留 0x${cpv.toString(16)} → ${JSON.stringify(rom)}`); continue; }
    const back = sc.romanToNative(rom);
    if (nrm(back) === nrm(ch)) { pass++; continue; }
    if (EXEMPT.has(`${block.scheme}:0x${cpv.toString(16)}`)) { pass++; continue; }
    fail++;
    failures.push(`${block.scheme} 往返 0x${cpv.toString(16)}: ${JSON.stringify(ch)} → ${JSON.stringify(rom)} → ${JSON.stringify(back)}`);
  }
}
console.log(`md-corpus-gate: ${pass} 通過 / ${fail} 失敗`);
if (fail) { for (const f of failures.slice(0, 20)) console.log(`  ✗ ${f}`); process.exit(1); }
console.log("  ✅ 全部通過（MD 文檔全量 token：出向全拉丁化＋往返無損）");
