/* ---------- 蘭札體語料門禁（104 字＋36 詞＋6 句） ----------
 * 語料 test/data/ranjana-corpus.json（r44n 抓取存檔）。
 * 三條標準：IAST 是 IAST、蘭札（Devanagari 編碼）是蘭札、杜絕原樣透傳、往返一致。
 * 豁免：無（Aksharamukha 擴展記法項已自語料移除）。
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
const corpus = JSON.parse(readFileSync(join(ROOT, "test", "data", "ranjana-corpus.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "li-ran-"));
execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
  join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { iastToDevanagari, devanagariToIast } = await import(url.pathToFileURL(join(TMP, "lib.mjs")).href);

const X_APPROX = new Set([
  
  ]);
const norm = (s) => s.replace(/\.\./g, "||").replace(/\./g, "|").replace(/ +([।॥])/g, "$1");

let pass = 0, fail = 0, passthrough = 0;
const fails = [];
const rt = (kind, iast, deva) => {
  const got = iastToDevanagari(iast, { mode: "iast" });
  if (got === iast) { passthrough++; fails.push(`${kind} 透傳: ${iast}`); return; }
  if (got !== deva) { fail++; fails.push(`${kind} r2n: ${iast} want=${deva} got=${got}`); } else pass++;
  const back = devanagariToIast(got, { mode: "iast" });
  const re = iastToDevanagari(back, { mode: "iast" });
  if (re !== got) { fail++; fails.push(`${kind} 往返: ${iast} want=${got} got2=${re}`); } else pass++;
};
for (const [i0, d0] of corpus.chars) {
  if (X_APPROX.has(i0)) continue;
  rt("char", norm(i0), norm(d0));
}
for (const [i0, d0] of corpus.words) {
  const i = norm(i0), d = norm(d0);
  if (/^[|]+$/.test(i)) { // 純句讀：只驗不透傳＋往返
    rt("punct", i, d); continue;
  }
  rt("word", i, d);
}
for (const [i0, d0] of corpus.sentences) rt("sentence", norm(i0), norm(d0));

console.log(`ranjana-gate: ${pass} pass / ${fail} fail / 透傳 ${passthrough}（豁免 X-近似 ${X_APPROX.size} 條）`);
if (fail || passthrough) { for (const f of fails) console.error("GATE-FAIL: " + f); process.exit(1); }
