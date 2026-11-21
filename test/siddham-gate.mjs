/* ---------- 悉曇體語料門禁（Aksharamukha describe/Siddham：121 字＋36 詞＋6 句，IAST 進出） ----------
 * 語料 test/data/siddham-corpus.json（r44n 抓取存檔）。
 * 三條標準：IAST 是 IAST、蘭札（Devanagari 編碼）是蘭札、杜絕原樣透傳、往返一致。
 * 豁免：Aksharamukha「X : Approximate equivalent」近似等價集（ĕ/ŏ/æ/ô、南印
 * 副音、nukta 異讀、k_ha、ḵ）——單向壓縮映射非雙向可逆，表達力極限不扭曲映射（鐵律）。
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
const corpus = JSON.parse(readFileSync(join(ROOT, "test", "data", "siddham-corpus.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "li-ran-"));
execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
  join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { iastToSiddham, siddhamToIast } = await import(url.pathToFileURL(join(TMP, "lib.mjs")).href);

const X_APPROX = new Set(["ĕ","ŏ","æ","ǣ","ô","kĕ","kŏ","kæ","kǣ","kô",
  "ḻa","ṟa","ṉa","l̤a","qa","k͟ha","ġa","za","r̤a","r̤ha","fa","ẏa",
  "n̆ga","n̆ja","n̆ḍa","n̆da","m̆ba","k_ha","ḵ"]);
const SEM = new Set(["kḷ", "kḹ", "oṃ"]); // 語義恆等異形：組合符 ॢ/ॣ vs 拼出形、OM 專用碼位 vs 拼出形
const norm = (s) => s.replace(/\.\./g, "||").replace(/\./g, "|");

let pass = 0, fail = 0, passthrough = 0;
const fails = [];
const rt = (kind, iast, deva) => {
  const got = iastToSiddham(iast, { mode: "iast" });
  if (got === iast) { passthrough++; fails.push(`${kind} 透傳: ${iast}`); return; }
  if (got !== deva) { fail++; fails.push(`${kind} r2n: ${iast} want=${deva} got=${got}`); } else pass++;
  const back = siddhamToIast(got, { mode: "iast" });
  const re = iastToSiddham(back, { mode: "iast" });
  if (re !== got) { fail++; fails.push(`${kind} 往返: ${iast} want=${got} got2=${re}`); } else pass++;
};
for (const [i0, d0] of corpus.chars) {
  if (X_APPROX.has(i0) || SEM.has(i0)) continue;
  rt("char", norm(i0), norm(d0));
}
for (const [i0, d0] of corpus.words) {
  const i = norm(i0), d = norm(d0);
  if (SEM.has(i0)) continue;
  if (/^[|]+$/.test(i)) { // 純句讀：只驗不透傳＋往返
    rt("punct", i, d); continue;
  }
  rt("word", i, d);
}
for (const [i0, d0] of corpus.sentences) rt("sentence", norm(i0), norm(d0));

console.log(`siddham-gate: ${pass} pass / ${fail} fail / 透傳 ${passthrough}（豁免 X-近似 29＋語義恆等 3 條）`);
if (fail || passthrough) { for (const f of fails) console.error("GATE-FAIL: " + f); process.exit(1); }
