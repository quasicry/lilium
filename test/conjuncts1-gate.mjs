// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* conjuncts1 語料門禁（Aksharamukha conjuncts1 資源——conjuncts2 的互補集）
 *
 * 語料：test/data/conjuncts1/conjuncts1-{Brahmi,Kharoshthi,Marchen}.txt
 *   源＝aksharamukha-back/resources/conjuncts1/conjuncts_<Script>_<vowel>.json
 *   （15 母音 × 3 文種 = 45 檔，去重展開）。Brahmi/Kharoshthi/Marchen 僅存於
 *   conjuncts1（Tibetan/Soyombo/Zanabazar/PhagsPa 等在 conjuncts2，互補無重疊）。
 *   Brahmi 10,946 ＋ Kharoshthi 10,075 ＋ Marchen 5,973 = 26,994 項。
 *
 * 斷言：逐項 roundtrip 冪等穩定（native→roman→native→roman→native 第二輪恆等）
 *   ＋轉換有效性（出向不得原樣透傳，白名單 0——本批語料全部真轉換）。
 *
 * 引擎修復記錄：brahmi.ts romanToNative 輔音叢集分支的音節尾加成分消費後未重置
 * lastWasConsonant，出口誤補 virama（kṣṃ→𑀓𑁆𑀱𑀁𑁆）——已修（消費後置 false）。
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-cj1-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

const CHECKS = {
  "conjuncts1-Brahmi.txt": "brahmi-iast",
  "conjuncts1-Kharoshthi.txt": "gandhari-iast",
  "conjuncts1-Marchen.txt": "marchen",
};
const MIN_LINES = { "conjuncts1-Brahmi.txt": 10900, "conjuncts1-Kharoshthi.txt": 10000, "conjuncts1-Marchen.txt": 5900 };

const DIR = path.join(ROOT, "test", "data", "conjuncts1");
let total = 0, ok = 0, passthrough = 0, fail = 0;
const failSamples = [];

for (const [file, sid] of Object.entries(CHECKS)) {
  const sc = lib.getScheme(sid);
  assert.ok(sc, `${sid} getScheme`);
  const lines = fs.readFileSync(path.join(DIR, file), "utf-8").split("\n").filter(l => l.trim());
  assert.ok(lines.length >= MIN_LINES[file], `${file} 行數 ${lines.length} < ${MIN_LINES[file]}`);
  for (const w of lines) {
    total++;
    const rom = sc.nativeToRoman(w);
    if (rom === w) { passthrough++; continue; }
    const back = sc.romanToNative(rom);
    const rom2 = sc.nativeToRoman(back);
    const back2 = sc.romanToNative(rom2);
    if (back2 === back) ok++;
    else {
      fail++;
      if (failSamples.length < 10) failSamples.push(`${file}: ${[...w].map(c => c.codePointAt(0).toString(16)).join(" ")} -> ${JSON.stringify(rom)}`);
    }
  }
}

if (fail > 0) {
  for (const s of failSamples) console.error("  " + s);
  console.error(`conjuncts1-gate: 失敗 ${fail}/${total}`);
  process.exit(1);
}
if (passthrough > 0) {
  console.error(`conjuncts1-gate: 透傳 ${passthrough}（本語料白名單 0）`);
  process.exit(1);
}
console.log(`conjuncts1-gate: 通过 ${ok}/${total}`);
