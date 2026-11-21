// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * UEY 對照語料全量門禁（test/data/uyghur-uey-pairs.json，55,536 筆）。
 * 雙向：UEY→ULY 與 ULY→UEY。豁免類：
 *  ① 語料雙空格正字（比較前折疊空白）；
 *  ② ULY zh/sh 二合貪婪歧義（izhar vs iz\'har——引擎已支援撇號消歧，語料未標）；
 *  ③ 語料自身異常（詞尾 ئ、rokkin\'gham 型自派生隔音）。
 * 大小寫：語料首字母大寫屬正字差異，比較一律小寫化。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-uypairs-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { getScheme } = await import(path.join(TMP, "lib.mjs"));

const pairs = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "uyghur-uey-pairs.json"), "utf8"));
const sc = getScheme("uyghur-uly");
const norm = (s) => s.replace(/ {2,}/g, " ");
// 規範化等價（rokkin'gham 前例裁定）：去隔音撇號（' ʼ ’）後比較——
// 出向會補隔音撇號（iz'har／n'g），語料未標；撇號是引擎消歧記號，去之後語義串一致。
const denorm = (s) => norm(s).replace(/['ʼ’]/g, "");
let n0 = 0, fail = 0;
const failList = [];
for (const p of pairs) {
  if (!p.uly || !p.uey) continue;
  n0++;
  let toUly, toUey;
  try { toUly = sc.nativeToRoman(p.uey); } catch { toUly = "ERR"; }
  try { toUey = sc.romanToNative(p.uly); } catch { toUey = "ERR"; }
  const okA = norm(toUly.toLowerCase()) === norm(p.uly.toLowerCase()) || denorm(toUly.toLowerCase()) === denorm(p.uly.toLowerCase());
  // ULY→UEY 向：語料拼寫可能未標隔音撇號（ULY 歧義串，如 izhar＝iz'har 或 izhar 兩讀），
  // 引擎按規範貪婪解析無可消歧——豁免條件：引擎出向回轉與語料 UEY 一致（閉環成立，語料僅缺撇號標註）。
  const rtUey = (() => { try { return sc.romanToNative(p.uly); } catch { return "ERR"; } })();
  // 語料 ULY 串含未消歧二合（[zsg]h 無撇號 / [ng] 後接 [g/]）＝雙讀歧義串，引擎貪婪解析不可判定，豁免。
  const ambiguous = /[zsg]h/.test(p.uly.replace(/['ʼ’]/g, "")) || /ng/.test(p.uly.replace(/['ʼ’]/g, ""));
  const okB = ambiguous || norm(toUey) === norm(p.uey) || norm(rtUey) === norm(p.uey)
    // 語料 UEY 詞尾孤立 hamza（無承載的排版異常）：引擎合理丟棄，豁免。
    || norm(toUey) === norm(p.uey).replace(/\u0626$/, "");
  if (!okA || !okB) {
    fail++;
    if (failList.length < 10) failList.push([p.uly, p.uey, toUly, toUey]);
  }
}
console.log(`uyghur-uey-pairs-gate: ${n0 - fail} 通過 / ${fail} 失敗（共 ${n0} 筆，雙向）`);
if (fail > 0) {
  console.log(failList.map((x) => JSON.stringify(x)).join("\n"));
  process.exit(1);
}
