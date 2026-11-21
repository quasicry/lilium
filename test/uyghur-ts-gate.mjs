/* ---------- 維吾爾文語料門禁（sy.ts.cn/topic/shuangyu/106.shtml 全書） ----------
 * 語料 test/data/uyghur-corpus-ts.json：
 * 2025 新疆兩會電子書維吾爾語版，API /api/articles-by-ids（POST id_list+_token）
 * 全書 22 篇維文原文 23.6 萬字符 → 255 段/標題句＋詞表（去重）。
 * 三條標準：ULY 是 ULY、UEY（阿拉伯文）是 UEY、杜絕原樣透傳、往返一致。
 * 語義恆等判準（src/uyghur.ts 定案）：tatweel（U+0640）純排版裝飾、U+3000 等空白
 * 寬度——引擎正向 NFKC 歸一化剔除，非音位語義零損失，比對前兩側歸一。
 * 歧義豁免（語料端剝離，表達力極限族）：拉丁/數字內嵌段（G219/S101/PM10 等
 * ULY↔UEY 判定歧義）、「»ى」型 hamza 後綴歸屬、孤立後綴詞（无宿主 ىدىن 型）。
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import pathUrl from "node:url";
import { dirname, join, resolve } from "node:path";
const url = pathUrl;

const __dirname = dirname(url.fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const corpus = JSON.parse(readFileSync(join(ROOT, "test", "data", "uyghur-corpus-ts.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "li-uyg-"));
execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
  join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { ulyToUey, ueyToUly } = await import(url.pathToFileURL(join(TMP, "lib.mjs")).href);

const fold = (s) => s.replace(/\u0640/g, "").normalize("NFKC");
const SEM_EQ = (a, b) => fold(a) === fold(b);

let pass = 0, fail = 0, passthrough = 0, sem = 0;
const fails = [];
const rt = (kind, uey) => {
  const uly = ueyToUly(uey);
  if (uly === uey) { passthrough++; fails.push(`${kind} 透傳: ${uey.slice(0, 40)}`); return; }
  const back = ulyToUey(uly);
  if (back === uey) pass++;
  else if (SEM_EQ(back, uey)) { sem++; pass++; }
  else { fail++; fails.push(`${kind} 往返: want=${uey.slice(0, 50)} got=${back.slice(0, 50)}`); }
};
for (const s of corpus.sentences) rt("sentence", s.text);
for (const w of corpus.words) rt("word", w);

console.log(`uyghur-ts-gate: ${pass} pass / ${fail} fail / 透傳 ${passthrough}（語義恆等 ${sem}＝tatweel/空白 NFKC 歸一化）`);
if (fail || passthrough) { for (const f of fails) console.error("GATE-FAIL: " + f); process.exit(1); }
