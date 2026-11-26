// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* Script Matrix 語料門禁（Aksharamukha script-matrix 14 方案字元表逐項往返）
 *
 * 語料：test/data/script-matrix/*.txt（Aksharamukha script_mapping.json 匯出，
 * 每行「類別\t子類\t字元」）。涵蓋 lilium 全部 14 個有 matrix 語料的方案：
 *   brahmi / tamilbrahmi / siddham / marchen / soyombo / zanabazarsquare /
 *   phagspa / tibetan / tibetanloc / sinhala / kharoshthi / mongolian /
 *   iastpali / isopali（roman 形態，反向測試）
 *
 * 斷言：逐項 roundtrip **冪等穩定**——native→roman→native→roman→native 第二輪
 * native 與第一輪相同（正規化形式收斂，允許首輪預組→堆疊等字形正規化）。
 *
 * 語料雜訊清理註記：ASCII 數字/拉丁參照列、天城體參照列（siddhamdevanagari）、
 * 修飾字母 02B0-02FF 雜訊（˂ʽ）、marchen 疊母音組合（a+aa 同 token 一對多）、
 * isopali ṁ→ṃ 記法正規化（ISO 兩記法同指 anusvara，lilium 出向統一 ṃ）。
 *
 * 引擎修復記錄：tibetan 5 個預組梵文反轉字（0F43/0F4D/0F52/0F57/0F5C）出向
 * 正規化為堆疊序（與 ASPIRATED_BASE 回向決策對稱），roman 輸出不變，往返閉合。
 *
 * 透傳辨識（roundtrip 恆等的盲區）：native 檔出向 == 輸入代表「原樣透傳」，
 * 需與真轉換區分。白名單 37 項＝方案轉寫範圍外字元的防誤轉保守透傳：
 *   sinhala 14（prenasalized 相容形 ඟඦඬඳඹ、長母音相容形 ඒඕ、ඇඈ、罕見母音符
 *     ෟෳැෑ、ඁ——ISO 15919 無標準對應）；
 *   （marchen 借用藏文數字 ༠-༩ 原透傳 10 項——已補數字鍵 0xF20-0xF29 ↔ ASCII 0-9，
 *     白名單自 37 降至 27）；
 *   kharoshthi 5（元音附標 10A01-06 單獨出現，僅作修飾無獨立 roman 鍵）；
 *   iastpali 5＋isopali 3（罕見組合記號 ̈ ẏ ḵ ẖ ḫ，Pali 語音系無此音）。
 * 超出白名單計數即紅燈（防止靜默退化）。
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-mx-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

const NATIVE = {
  "brahmi.txt": "brahmi-iast", "tamilbrahmi.txt": "brahmi-iast",
  "siddham.txt": "siddham-iast", "marchen.txt": "marchen",
  "soyombo.txt": "soyombo", "zanabazarsquare.txt": "zanabazar",
  "phagspa.txt": "phagspa-poppe", "tibetan.txt": "tibetan-wylie",
  "tibetanloc.txt": "tibetan-wylie", "sinhala.txt": "sinhala-iso15919",
  "kharoshthi.txt": "gandhari-iast", "mongolian.txt": "mongolian",
};
const ROMAN = { "iastpali.txt": "pali-iast", "isopali.txt": "pali-iso15919" };

const DATA = path.join(ROOT, "test", "data", "script-matrix");
let passed = 0;
let total = 0;
let passthrough = 0;
const allFails = [];
const PASSTHROUGH_LIMIT = 27; // 見頭註「透傳辨識」（marchen 數字鍵補上後自 37 降）

for (const [file, sid] of Object.entries({ ...NATIVE, ...ROMAN })) {
  total++;
  const sc = lib.getScheme(sid);
  assert.ok(sc, `${sid} getScheme`);
  const lines = fs.readFileSync(path.join(DATA, file), "utf-8").split("\n").filter(Boolean);
  assert.ok(lines.length >= 30, `${file} 行數 ${lines.length} >= 30`);
  const native = file in NATIVE;
  let fail = 0;
  for (const line of lines) {
    const ch = line.split("\t")[2];
    if (!ch) continue;
    try {
      if (native) {
        const rom = sc.nativeToRoman(ch);
        if (rom === ch) { passthrough++; continue; } // 透傳白名單項（見頭註）
        const back = sc.romanToNative(rom);
        const rom2 = sc.nativeToRoman(back);
        const back2 = sc.romanToNative(rom2);
        if (back2 !== back) { fail++; allFails.push(`${file}: ${[...ch].map(c => c.codePointAt(0).toString(16)).join(" ")} -> ${JSON.stringify(rom)}`); }
      } else {
        const nat = sc.romanToNative(ch);
        if (nat === ch) { passthrough++; continue; } // roman 端無對應鍵（罕見組合記號）
        const back = sc.nativeToRoman(nat);
        const nat2 = sc.romanToNative(back);
        const back2 = sc.nativeToRoman(nat2);
        if (back2 !== back) { fail++; allFails.push(`${file}: ${JSON.stringify(ch)}`); }
      }
    } catch (e) { fail++; allFails.push(`${file}: THROW ${(e).message.slice(0, 60)}`); }
  }
  if (fail === 0) { passed++; console.log(`  [${total}] ${file} (${sid}): ${lines.length}/${lines.length} ok`); }
  else console.error(`  [${total}] ${file} (${sid}): 失敗 ${fail}/${lines.length}`);
}

if (passthrough > PASSTHROUGH_LIMIT) {
  console.error(`script-matrix-gate: 透傳 ${passthrough} 超白名單 ${PASSTHROUGH_LIMIT}`);
  process.exit(1);
}
if (allFails.length) {
  for (const f of allFails.slice(0, 15)) console.error("  " + f);
  console.error(`script-matrix-gate: 失敗 ${allFails.length} 項`);
  process.exit(1);
}
console.log(`script-matrix-gate: 通过 ${passed}/${total}（透傳白名單 ${passthrough}/${PASSTHROUGH_LIMIT}）`);
