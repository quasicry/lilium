// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 梵文 8 套轉寫方案 —— 權威參考交叉對比語料生成器（native → 本引擎 roman）
 *
 * 產出：把「天城體原生字串 → 本引擎羅馬字」對照表傾倒為 JSON，
 * 交由 Python 端 sanscript（indic-transliteration）生成黃金參考。
 *
 * ⚠ 語料定義統一由 test/_sanskrit-corpus.mjs 提供（buildCorpus / SS_SCHEME），
 *   本檔**不得**另抄一份——否則生成器與回歸測試的語料會漂移，黃金參考隨之失效。
 *   回歸測試 test/sanskrit-cross-reference.mjs 亦吃同一份 buildCorpus，三邊同源。
 *
 * 用法：node test/sanskrit-cross-corpus.mjs <outDir>
 *   或設 ROMAN_DUMP=<outDir>
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-crossgen-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { listSchemes } = lib;
const { SS_SCHEME, buildCorpus } = await import(path.join(ROOT, "test", "_sanskrit-corpus.mjs"));

const norm = (s) => s.normalize("NFC");

const schemes = listSchemes().filter((s) => s.id.startsWith("sanskrit-"));
const order = ["sanskrit-iast","sanskrit-iso15919","sanskrit-hk","sanskrit-itrans","sanskrit-velthuis","sanskrit-wx","sanskrit-kolkata","sanskrit-slp1"];
schemes.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));

const outDir = process.argv[2] || process.env.ROMAN_DUMP || path.join(TMP, "cross");
fs.mkdirSync(outDir, { recursive: true });

let grand = 0;
for (const s of schemes) {
  const corpus = buildCorpus(s);
  const cases = [];
  for (const str of corpus) {
    const rom = norm(s.nativeToRoman(str));
    cases.push([str, rom]);
  }
  grand += cases.length;
  fs.writeFileSync(path.join(outDir, `${s.id}.json`), JSON.stringify({ scheme: s.id, ssScheme: SS_SCHEME[s.id], cases }));
}
console.log(`生成完畢：${schemes.length} 套方案，共 ${grand} 條語料 → ${outDir}`);
for (const s of schemes) {
  const j = JSON.parse(fs.readFileSync(path.join(outDir, `${s.id}.json`), "utf8"));
  console.log(`  ${s.id.padEnd(20)} ${SS_SCHEME[s.id].padEnd(11)} ${j.cases.length} 條`);
}
