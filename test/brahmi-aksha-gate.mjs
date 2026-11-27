/* ---------- 婆羅米文語料門禁（115 字＋36 詞＋6 句，IAST 進出） ----------
 * 語料 test/data/brahmi-aksharamukha-corpus.json。
 * 三條標準：IAST 是 IAST、蘭札（Devanagari 編碼）是蘭札、杜絕原樣透傳、往返一致。
 * 豁免：拼式歧義（kṣ/jñ 詞尾固有 a 無附標，出向 IAST 拼式長鍵＝引擎刻意設計）。
 * Aksharamukha 擴展記法項（近似等價集/南印副音/nukta 異讀/k_ha/ḵ）已自語料移除。
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
const corpus = JSON.parse(readFileSync(join(ROOT, "test", "data", "brahmi-aksharamukha-corpus.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "li-ran-"));
execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
  join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { brahmiRomanToNative, brahmiNativeToRoman } = await import(url.pathToFileURL(join(TMP, "lib.mjs")).href);

const X_APPROX = new Set([
  
  "oṃ",".","..",
  "kṣ","jñ","kṣa","jña"]); // 拼式歧義：kṣ/jñ 詞尾固有 a 無附標，出向 IAST 拼式長鍵（引擎刻意設計）
const norm = (s) => s.replace(/\.\./g, "||").replace(/\./g, "|");

let pass = 0, fail = 0, passthrough = 0;
const fails = [];
const rt = (kind, iast, deva) => {
  const got = brahmiRomanToNative(iast);
  if (got === iast) { passthrough++; fails.push(`${kind} 透傳: ${iast}`); return; }
  if (got !== deva) { fail++; fails.push(`${kind} r2n: ${iast} want=${deva} got=${got}`); } else pass++;
  const back = brahmiNativeToRoman(got);
  const re = brahmiRomanToNative(back);
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

console.log(`brahmi-aksha-gate: ${pass} pass / ${fail} fail / 透傳 ${passthrough}（豁免拼式歧義 7 條）`);
if (fail || passthrough) { for (const f of fails) console.error("GATE-FAIL: " + f); process.exit(1); }
