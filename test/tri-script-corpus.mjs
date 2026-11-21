// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * marchen／zanabazar／soyombo 權威語料雙向往返門禁。
 *
 * 語料：test/tri-script-samples.json（Wikipedia 樣例句實文 token，每文種 30；
 * 權威基準＝Unicode NamesList 11A00/11A50/11C90 區塊註記）。
 * 專項：
 *   1. wiki token 全量往返（native→roman→native 無損）
 *   2. 顯式 SUBJOINER 疊字：鍵語法（ka+sa+ta 型）與原生碼位串（SUBJOINER U+11A47/
 *      U+11A99 顯式；marchen 隱式 subjoined U+11C92–U+11CAF）雙向
 *   3. 獨立元音組合 token（<a-*> 顯式鍵，NamesList「LETTER A used for representing
 *      independent vowels in combination with vowel signs」）
 * 語料擴充：TRI_CORPUS 環境變數指定全量語料檔（wiki 抓取產物，不入 git）。
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-tricorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { getScheme } = await import(path.join(TMP, "lib.mjs"));

const SCHEME_IDS = ["marchen", "zanabazar", "soyombo"];
let pass = 0, fail = 0;
const failures = [];
function check(cond, label, detail) {
  if (cond) { pass++; } else { fail++; failures.push(`${label}${detail ? " — " + detail : ""}`); }
}

// 1＋3：語料 token 往返
const samples = JSON.parse(fs.readFileSync(path.join(__dirname, "tri-script-samples.json"), "utf8"));
for (const id of SCHEME_IDS) {
  const sc = getScheme(id);
  for (const t of samples[id]) {
    const rom = sc.nativeToRoman(t);
    const back = sc.romanToNative(rom);
    check(back === t, `${id} token 往返`, `${JSON.stringify(t)} → ${JSON.stringify(rom)} → ${JSON.stringify(back)}`);
  }
}

// 2a：疊字鍵語法往返
const subjoinKeys = [
  ["marchen", "ma+sa+ta"], ["marchen", "ma+sa"], ["marchen", "ka+la+wa+ra"],
  ["zanabazar", "ka+sa+ta"], ["zanabazar", "ma+ya+ra"], ["zanabazar", "ka+la"],
  ["soyombo", "ma+sa+ta"], ["soyombo", "ka+la+va"], ["soyombo", "pa+ta"],
  ["zanabazar", "ka+sa+ta+pa"], ["soyombo", "ma+sa+ta+pa"],
];
for (const [id, rom] of subjoinKeys) {
  const sc = getScheme(id);
  const nat = sc.romanToNative(rom);
  const back = sc.nativeToRoman(nat);
  check(back === rom, `${id} 疊字鍵 ${rom}`, `→ ${JSON.stringify(nat)} → ${JSON.stringify(back)}`);
}

// 2b：顯式 SUBJOINER 原生碼位串往返
const SUBJ = "\u11A47";
const expl = [
  ["soyombo", `𑩜${"\u11A99"}𑩮${"\u11A99"}𑩝`],   // sa+ta+ma（U+11A99 SOYOMBO SUBJOINER）
  ["zanabazar", `𑨋${SUBJ}𑨮${SUBJ}𑨆`],             // ka+sa+ga（U+11A47 SUBJOINER）
  ["marchen", "𑨆\u11C92𑨋"],                          // ma+subjoined-ka（隱式 subjoined 碼位）
];
for (const [id, nat] of expl) {
  const sc = getScheme(id);
  const rom = sc.nativeToRoman(nat);
  const back = sc.romanToNative(rom);
  check(back === nat, `${id} 顯式 SUBJOINER 原生串`, `${JSON.stringify(nat)} → ${rom} → ${JSON.stringify(back)}`);
}

// 可選全量語料（不入 git）
if (process.env.TRI_CORPUS) {
  const corpus = JSON.parse(fs.readFileSync(process.env.TRI_CORPUS, "utf8"));
  for (const [id, toks] of Object.entries(corpus)) {
    const sc = getScheme(id);
    for (const t of toks) {
      const rom = sc.nativeToRoman(t);
      const back = sc.romanToNative(rom);
      check(back === t, `${id} 全量語料 token`, `${JSON.stringify(t)} → ${JSON.stringify(rom)} → ${JSON.stringify(back)}`);
    }
  }
}

console.log(`tri-script-corpus: ${pass} 通過 / ${fail} 失敗`);
for (const f of failures.slice(0, 20)) console.log("  ✗", f);
if (fail > 0) process.exit(1);
