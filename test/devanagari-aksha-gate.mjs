/* ---------- 天城體語料門禁（121 字＋36 詞＋6 句，IAST 進出） ----------
 * 語料 test/data/devanagari-aksharamukha-corpus.json。
 * 三條標準：拉丁是拉丁、天城體是天城體、杜絕原樣透傳、往返一致。
 * 豁免：
 * ① X-近似（自標 Approximate equivalent）：ĕ/ŏ/æ/ô、南印 ḻa/ṟa/ṉa、
 *    nukta 異讀 qa/ġa/za/fa/ẏ/ẏa、拼出 CV kĕ/kŏ/kæ/kô、ḵ——單向壓縮映射；n2r 端對
 *    缺項字符輸出 \uXXXX esc 標註（lilium 透傳審計慣例）＝表達力極限不扭曲映射（鐵律）。
 * ② 句讀慣例歸一：'.'/'..' ↔ '।'/'॥'，lilium IAST 出向統一 '|'||'（danda 出版慣例）；
 *    danda 緊貼前詞（indic.ts 出版慣例）→ 語料端存檔時去 danda 前空格。
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
const corpus = JSON.parse(readFileSync(join(ROOT, "test", "data", "devanagari-aksharamukha-corpus.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "li-deva-"));
execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
  join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { iastToDevanagari, devanagariToIast } = await import(url.pathToFileURL(join(TMP, "lib.mjs")).href);

const EXEMPT_CHARS = new Set([
  "ĕ","ŏ","æ","ô","ḻa","ṟa","ṉa","qa","ġa","za","fa","ẏ","ẏa","kĕ","kŏ","kæ","kô","ḵ",
]);
const norm = (s) => s.replace(/\.\./g, "||").replace(/\./g, "|");

let pass = 0, fail = 0, passthrough = 0;
const fails = [];
const LAT = /[a-zA-Zāīūēōṛṝḷḹśṣṅñṃḥ]/;
const rt = (kind, iast, nat) => {
  const i = norm(iast), n = norm(nat);
  if (/^[|]+$/.test(i)) { // 純句讀：慣例符非文種字符，只驗往返（比照 siddham-gate punct 慣例）
    const r2n = iastToDevanagari(i);
    const n2r = devanagariToIast(n);
    if (r2n === n && n2r === i) pass++; else { fail++; fails.push(`punct: ${iast} r2n=${r2n} n2r=${n2r}`); }
    return;
  }
  const r2n = iastToDevanagari(i);
  const n2r = devanagariToIast(n);
  if (r2n === i) { passthrough++; fails.push(`${kind} 透傳: ${iast}`); return; }
  if (r2n === n && n2r === i) { pass++; } else { fail++; fails.push(`${kind}: ${iast} | want=${nat} r2n=${r2n} n2r=${n2r}`); }
  if (LAT.test(r2n)) { passthrough++; fails.push(`${kind} r2n 拉丁殘留: ${iast} → ${r2n}`); }
};
for (const [i0, d0] of corpus.chars) {
  if (EXEMPT_CHARS.has(i0)) continue;
  rt("char", i0, d0);
}
for (const [i0, d0] of corpus.words) rt("word", i0, d0);
for (const [i0, d0] of corpus.sentences) rt("sentence", i0, d0);

console.log(`devanagari-gate: ${pass} pass / ${fail} fail / 透傳 ${passthrough}（豁免 X-近似 17 條＋句讀/danda 慣例歸一）`);
if (fail || passthrough) { for (const f of fails) console.error("GATE-FAIL: " + f); process.exit(1); }
