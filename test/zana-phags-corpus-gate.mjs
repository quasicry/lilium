// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* Zanabazar ＋ PhagsPa 單字表與句子語料門禁（Aksharamukha 官方資料）
 *
 *   zanabazar-aksharamukha-syllabary.txt   11530 項（syllabary 646+34+18 ＋ conjuncts2 15 檔）
 *   phagspa-aksharamukha-syllabary.txt      6162 項（syllabary 418+38+11 ＋ conjuncts2 15 檔）
 *   zanabazar-aksharamukha-sentences.txt    《緣起偈》句子語料（官方 API Velthuis→ZanabazarSquare）
 *   phagspa-aksharamukha.txt                《緣起偈》句子語料（官方 API Velthuis→PhagsPa；^ 殘留已清）
 *
 * 逐項／逐行 native→roman→native 恆等（phagspa 用 phagspa-poppe scheme）。
 *
 * 語料正規化註記：PhagsPa syllabary 中 36 項「t(A848)+s(A85B) 疊字並列」已正規化為
 * tsa 單字母（A850）——兩形出向 roman 同為 "ts"（Poppe 體系真實一對多歧義，
 * Unicode 並列無專碼、Poppe 拼法無區分），正規化無資訊損。
 * 另：phagspa-aksharamukha.txt 之 Velthuis "hu^m" 轉換殘留 "^" 已清（官方 API 瑕疵）。 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-zpsyl-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

const DATA = path.join(ROOT, "test", "data");
let passed = 0;
let total = 0;

function checkLines(label, file, conv, convBack, minLines) {
  total++;
  const lines = fs.readFileSync(path.join(DATA, file), "utf-8").split("\n").filter(l => l.length > 0);
  try {
    assert.ok(lines.length >= minLines, `行數 ${lines.length} >= ${minLines}`);
    const fails = [];
    for (const nat of lines) {
      if (convBack(conv(nat)) !== nat) fails.push(nat);
    }
    assert.strictEqual(fails.length, 0, `失敗 ${fails.length} 項`);
    passed++;
    console.log(`  [${total}] ${label}: ${lines.length}/${lines.length} ok`);
  } catch (e) {
    console.error(`  [${total}] ${label}: FAIL`);
    throw e;
  }
}

function checkSentence(label, file, scheme) {
  total++;
  const txt = fs.readFileSync(path.join(DATA, file), "utf-8");
  try {
    const r1 = lib.transliterateText(txt, scheme, false);
    const r2 = lib.transliterateText(r1.text, scheme, true);
    assert.strictEqual(r2.text, txt, "雙向恆等");
    passed++;
    console.log(`  [${total}] ${label}: 雙向恆等 ok`);
  } catch (e) {
    console.error(`  [${total}] ${label}: FAIL`);
    throw e;
  }
}

checkLines("zanabazar syllabary", "zanabazar-aksharamukha-syllabary.txt",
  lib.zanabazarNativeToRoman, lib.zanabazarRomanToNative, 11000);
const ph = lib.getScheme("phagspa-poppe");
checkLines("phagspa syllabary", "phagspa-aksharamukha-syllabary.txt",
  s => ph.nativeToRoman(s), s => ph.romanToNative(s), 6000);
checkSentence("zanabazar 句子語料", "zanabazar-aksharamukha-sentences.txt", "zanabazar");
checkSentence("phagspa 句子語料", "phagspa-aksharamukha.txt", "phagspa-poppe");

console.log(`zana-phags-corpus-gate: 通过 ${passed}/${total}`);
if (passed !== total) process.exit(1);
