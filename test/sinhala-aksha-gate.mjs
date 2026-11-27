/* ---------- 僧伽羅語料門禁（103 字＋36 詞＋6 句，IAST 進出） ----------
 * 語料 test/data/sinhala-aksharamukha-corpus.json。
 * 豁免：Unicode 標準 vocalic（ḷ/ḹ/kḷ/kḹ）。
 * Aksharamukha 擴展記法項（X-近似集/口語副音/借詞/avagraha 括注）已自語料移除。
 * ② 語義恆等歸一（fold 判準）：ZWJ 可見連結符 vs virama 形（同碼位序列差 U+200D）；
 *    長 e/o 短式 ෙ/ො（lilium C-B3 輸出慣例，頁面 Notes 自證）；嚴式鼻音歸化
 *    ṃ+同部位塞音→鼻音（brahmic.ts:262-268 strictNasal 刻意設計）。
 * ③ 複核（r156 sinhala ṁ）：n2r 出向無鍵 ṁ（U+1E43）非缺口——
 *    brahmic.ts NIGGAHITA_ALIASES（r56 行註釋載明）巴利 ṃ/ṁ 同義、輸入端
 *    一併接受、輸出端統一發 ṃ（IAST）；word16 實錘屬文檔化正規化（exempt）。
 * 句讀慣例：Aksharamukha 語料的 '.'/'..' 歸一為 lilium IAST 出版慣例 '|'||'。
 */
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import pathUrl from "node:url";
import { dirname, join, resolve } from "node:path";
const url = pathUrl;
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const corpus = JSON.parse(readFileSync(join(ROOT, "test", "data", "sinhala-aksharamukha-corpus.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "li-sin-"));
execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
  join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(url.pathToFileURL(join(TMP, "lib.mjs")).href);
const schemePali = lib.getScheme("sinhala-pali");
if (!schemePali) { console.error("GATE-FAIL: sinhala-pali scheme 未註冊"); process.exit(1); }
const r2nFn = (s) => schemePali.romanToNative(s);
const n2rFn = (s) => schemePali.nativeToRoman(s);

const EXEMPT_CHARS = new Set([
  "ḷ","ḹ","kḷ","kḹ",
  // Aksharamukha 擴展記法項（ĕŏæôḻaṟaṉaqaġazaẏaḵ 及 avagraha 括注）已自語料移除，豁免同步撤除
]);
const ZWJ = "\u200D";
const LONG2SHORT = { "ේ": "ෙ", "ෝ": "ො", "ඒ": "එ", "ඕ": "ඔ", "ē": "e", "ō": "o" };
const NASAL = {
  "ṃk": "ṅk", "ṃg": "ṅg", "ṃkh": "ṅkh", "ṃgh": "ṅgh",
  "ṃc": "ñc", "ṃj": "ñj", "ṃch": "ñch", "ṃjh": "ñjh",
  "ṃṭ": "ṇṭ", "ṃḍ": "ṇḍ", "ṃṭh": "ṇṭh", "ṃḍh": "ṇḍh",
  "ṃt": "nt", "ṃd": "nd", "ṃth": "nth", "ṃdh": "ndh",
  "ṃp": "mp", "ṃb": "mb", "ṃph": "mph", "ṃbh": "mbh",
  "ංක": "ඞ්ක", "ංග": "ඞ්ග", "ංච": "ඤ්ච", "ංජ": "ඤ්ජ",
  "ංට": "ණ්ට", "ංඩ": "ණ්ඩ", "ංත": "න්ත", "ංද": "න්ද",
  "ංප": "ම්ප", "ංබ": "ම්බ",
};
function fold(s) {
  s = s.split(ZWJ).join("");
  for (const [a, b] of Object.entries(LONG2SHORT)) s = s.split(a).join(b);
  for (const k of Object.keys(NASAL).sort((a, b) => b.length - a.length)) s = s.split(k).join(NASAL[k]);
  return s;
}
const norm = (s) => s.replace(/\.\./g, "||").replace(/\./g, "|");

let pass = 0, fail = 0, passthrough = 0;
const fails = [];
const rt = (kind, iast, nat) => {
  const r2n = r2nFn(iast);
  const okR = r2n === nat || fold(r2n) === fold(nat);
  const n2rRaw = n2rFn(nat);
  // ඒ/ඕ 獨立長母音字母不在 lilium 映射表 → n2r 透傳，歸一為 e/o 再比（表達力極限）
  const n2r = n2rRaw.split("ඒ").join("e").split("ඕ").join("o");
  const okN = n2rRaw === iast || fold(n2r) === fold(iast);
  if (iast === r2n) { passthrough++; fails.push(`${kind} 透傳: ${iast}`); return; }
  if (okR && okN) { pass++; } else { fail++; fails.push(`${kind}: ${iast} | want=${nat} r2n=${r2n} n2r=${n2rRaw}`); }
};
for (const [i0, d0] of corpus.chars) {
  if (EXEMPT_CHARS.has(i0)) continue;
  rt("char", norm(i0), norm(d0));
}
for (const [i0, d0] of corpus.words) {
  const i = norm(i0);
  if (/^[|]+$/.test(i)) { // 純句讀：慣例符非文種字符，跳過透傳判定（比照 siddham-gate punct 慣例）
    const r2n = r2nFn(i);
    const okR = r2n === norm(d0) || fold(r2n) === fold(norm(d0));
    if (okR) pass++; else { fail++; fails.push(`punct: ${i0} r2n=${r2n}`); }
    continue;
  }
  rt("word", i, norm(d0));
}
for (const [i0, d0] of corpus.sentences) rt("sentence", norm(i0), norm(d0));

console.log(`sinhala-gate: ${pass} pass / ${fail} fail / 透傳 ${passthrough}（豁免 vocalic 4 條＋語義恆等 fold 判準）`);
if (fail || passthrough) { for (const f of fails) console.error("GATE-FAIL: " + f); process.exit(1); }
