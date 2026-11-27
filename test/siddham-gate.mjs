/* ---------- 悉曇體語料門禁（103 字＋36 詞＋6 句，IAST 進出） ----------
 * 語料 test/data/siddham-corpus.json（r44n 抓取存檔）。
 * 三條標準：IAST 是 IAST、蘭札（Devanagari 編碼）是蘭札、杜絕原樣透傳、往返一致。
 * 豁免：語義恆等異形（組合符 ॢ/ॣ vs 拼出形、OM 專用碼位 vs 拼出形）。
 * 外部語料擴展記法項（X-近似集/南印副音/nukta 異讀/k_ha/ḵ）已自語料移除。
 * 句讀慣例：外部語料的 '.'/'..' 歸一為 lilium IAST 出版慣例 '|'||'。
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

const X_APPROX = new Set([
  
  ]);
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

console.log(`siddham-gate: ${pass} pass / ${fail} fail / 透傳 ${passthrough}（豁免語義恆等 3 條）`);
if (fail || passthrough) { for (const f of fails) console.error("GATE-FAIL: " + f); process.exit(1); }
