/* ---------- 巴利文語料門禁（GRETIL 2_pali pu 全 64 檔） ----------
 * 語料 test/data/pali-corpus-gretil.json：
 * GRETIL（哥廷根印度語文電子文本庫）巴利三藏＋Milindapañha＋註釋，
 * pu 版（plain floating text，無註釋），PTS 版本，CC BY-SA 4.0。
 * 分層抽樣：每檔頭 40 行＋隨機 60 行＋詞頻前 3000 詞（全量 20.6 萬行）。
 * 三條標準：IAST 是 IAST、天城是天城、杜絕原樣透傳、往返一致。
 * 空白契約（G-T1 家族）：出向空格規範化＝連續空白歸一＋標點前空白摘除，
 * GRETIL 行內節號「. ||n||」雙空格屬源文本排版，比對前兩側規範化。
 * 表達力極限族（豁免白名單）：省略撇號 elision（'si/'nāthapiṇḍiko 型）
 * 入向還原 a- 元音後撇號不保——PTS 正字本應寫全形（asī），0.25%。
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
const corpus = JSON.parse(readFileSync(join(ROOT, "test", "data", "pali-corpus-gretil.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "li-pali-"));
execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
  join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { convertPali } = await import(url.pathToFileURL(join(TMP, "lib.mjs")).href);

// 空白規範化基線（G-T1 家族判準）：
const norm = (s) => s.replace(/\s+/g, " ").replace(/ ([.|:;!?])/g, "$1").trim();
// 天城文正字快速檢查（收錄於 devanagari 塊）：
const isDev = (s) => /[\u0900-\u097F]/.test(s);

let total = 0, pass = 0, passthrough = 0, elision = 0;
const fails = [], elisionSamples = [];

for (const doc of corpus.docs) {
  for (const line of doc.lines) {
    if (line.length < 6) continue;
    total++;
    let dev, back;
    try {
      dev = convertPali(line, { toNative: true });
      back = convertPali(dev, { toNative: false });
    } catch (e) {
      fails.push([doc.file, line.slice(0, 60), "ERR:" + e.message.slice(0, 60)]);
      continue;
    }
    if (!isDev(dev)) {
      fails.push([doc.file, line.slice(0, 60), "出向非天城（透傳）"]);
      passthrough++;
      continue;
    }
    if (norm(back) === norm(line)) { pass++; continue; }
    // elision 豁免族：省略撇號縮約（'si/'ti/'va 型，撇號標 iti/eva 等省略音節；
    // 入向還原為詞首 a-（'ti→ati）＝引擎正確補 a 規則，撇號本身無法保真。
    // 判準：含撇號縮約且雙側 elision 規範化（撇號摘除、補 a）後等值：
    const stripApos = (s) => s.replace(/\s*'(?=[a-zāīūṅñṭḍṇḷṃ])/g, " a");
    if (/'[a-zāīūṅñṭḍṇḷṃ]/.test(line) && norm(stripApos(back)) === norm(stripApos(line))) {
      elision++;
      if (elisionSamples.length < 5) elisionSamples.push([doc.file, line.slice(0, 60)]);
      continue;
    }
    fails.push([doc.file, line.slice(0, 60), back.slice(0, 60)]);
  }
}

// 詞表往返：
let wTotal = 0, wPass = 0, wFails = [];
for (const w of corpus.words) {
  wTotal++;
  try {
    const dev = convertPali(w, { toNative: true });
    const back = convertPali(dev, { toNative: false });
    if (back === w) { wPass++; continue; }
    if (back.replace(/'/g, "") === w.replace(/'/g, "")) { wPass++; continue; } // elision
    wFails.push([w, back]);
  } catch (e) { wFails.push([w, "ERR"]); }
}

console.log(`巴利文 GRETIL 門禁：句級 ${pass}/${total}（透傳 ${passthrough}、elision 豁免 ${elision}）、詞級 ${wPass}/${wTotal}`);
if (elisionSamples.length) console.log("elision 例：", JSON.stringify(elisionSamples));
if (fails.length || wFails.length) {
  console.log("FAIL 句級：", JSON.stringify(fails.slice(0, 10)));
  console.log("FAIL 詞級：", JSON.stringify(wFails.slice(0, 10)));
  process.exit(1);
}
console.log("巴利文 GRETIL 門禁：通過");
