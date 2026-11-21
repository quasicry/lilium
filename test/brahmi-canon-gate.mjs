// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 婆羅米文語料真值門禁（IAST ↔ Brahmi 雙向閉環）——brahmi 方案。
 *
 * ── 語料來源（../corpus/brahmi/，不入 git）──────────────────────────────
 *   1. UD_Prakrit-DIPI/pra_dipi-ud-test.conllu
 *      —— Universal Dependencies「Digitising Imperial Prakrit Inscriptions」
 *      樹庫 dev 分支（CC BY-SA 4.0），阿育王銘文全句 IAST 標註（印刷體、
 *      非 OCR）；提供 sentence 級樣本＋詞形/詞元雙軌詞表。
 *   2. hultzsch-searchable.txt
 *      —— Hultzsch, Corpus Inscriptionum Indicarum Vol. I (1925)，
 *      《Inscriptions of Asoka》，archive.org 公版掃描（public domain）
 *      的 djvu 全文 OCR；提供大規模 Ashokan Prakrit 詞彙池。
 *   3. test/data/brahmi-authoritative-words.json（已入庫）
 *      —— 589 詞權威雙向語料（IAST↔Brahmi 碼位級），含 Hultzsch 詞彙、
 *      Wikipedia 直接引用的婆羅米 Unicode 段落、indic-transliteration
 *      brahmi.toml（MIT）交叉核對；attested 權威字形逐詞斷言。
 *
 * ── 門禁內容：雙向閉環 ────────────────────────────────────────────────
 *   閉環 A（羅馬→婆羅米→羅馬）：roman --brahmiRomanToNative--> Brahmi
 *        --brahmiNativeToRoman--> roman，與原文經 canon 歸一後比對
 *        （兩側同一函式）。
 *   閉環 B（權威字形斷言）：authoritative-words 逐詞另驗
 *        brahmiRomanToNative(rom) === native 權威碼位字形（非僅閉環恆等）。
 *   canon 規則（僅歸一非正字差異）：
 *   · NFC 正規化（變音組合字兩種編碼序等價）；
 *   · 大小寫折疊（Brahmi 無大小寫概念；詞首專名大寫經引擎歸一小寫匹配，
 *     toLowerCase 兜底避免誤報）；
 *   · 右單引號 → 左單引號（OCR 排版引號差異，非正字差異）；
 *   · 空白 collapse＋trim。
 *   語料過濾（雜訊詞，跳過並計數）：
 *   · UD 詞表：取 conllu FORM 與 LEMMA 兩軌全部詞（排除 MWT 合併行）；
 *   · Hultzsch OCR：抽取拉丁字母＋變音符 token，僅保留含母音之字母串
 *     （OCR 噪音多為符號碎片；無母音串如「Th」「Kr」一律視雜訊跳過）。
 *
 * 執行：node test/brahmi-canon-gate.mjs
 * 末行輸出「brahmi-canon-gate: 通过 N/M」式計數行。
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
/* 語料目錄在 lilium-handoff 之外（../corpus/brahmi/），絕對路徑引用、不拷入 R */
const CORPUS = path.resolve(ROOT, "..", "corpus", "brahmi");
const UD_CONLLU = path.join(CORPUS, "UD_Prakrit-DIPI", "pra_dipi-ud-test.conllu");
const HULTZSCH_TXT = path.join(CORPUS, "hultzsch-searchable.txt");
const AUTH_JSON = path.join(ROOT, "test", "data", "brahmi-authoritative-words.json");

/* 與 sanskrit-canon-gate 同法：esbuild 現場 bundle lib-export.ts 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-brahmicorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { brahmiRomanToNative, brahmiNativeToRoman } = lib;

const toNative = (s) => brahmiRomanToNative(s);
const toRoman = (s) => brahmiNativeToRoman(s);

/* ── canon 歸一（兩側同一函式）────────────────────────────────────────
 * · NFC 正規化；右單引號折疊；大小寫折疊（Brahmi 無大小寫概念）；
 *   空白 collapse＋trim。
 */
const canon = (s) =>
  s.normalize("NFC").replace(/\u2019/g, "'").toLowerCase().replace(/\s+/g, " ").trim();

/* ── 雜訊過濾（Hultzsch OCR）：僅接受含母音的拉丁字母串（含變音符）────
 * OCR 噪音多為符號碎片、無母音縮寫（Th、Kr 型）與純英文敘述混入；
 * 含母音字母串即是 Prakrit 詞彙池的有效候選。
 */
const WORD_RE = /^[a-z\u00e0-\u024f\u1e00-\u1eff-]+$/;
const isCandidate = (w) => w.length >= 2 && WORD_RE.test(w) && /[aeiouy]/.test(w);

/* ── 語料收集 ────────────────────────────────────────────────────────── */
function* udItems() {
  let raw;
  try {
    raw = fs.readFileSync(UD_CONLLU, "utf8");
  } catch {
    return;
  }
  const sents = [...raw.matchAll(/^# text = (.+)$/gm)].map((m) => m[1]);
  const words = new Set();
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const f = line.split("\t");
    /* 僅取單詞行（排除 2-3 型 MWT 合併行）；FORM 與 LEMMA 兩軌皆收 */
    if (f.length === 10 && /^\d+$/.test(f[0])) { words.add(f[1]); words.add(f[2]); }
  }
  for (const s of sents) yield { kind: "ud-sentence", text: s };
  for (const w of [...words].sort()) yield { kind: "ud-word", text: w };
}

function* hultzschItems() {
  let raw;
  try {
    raw = fs.readFileSync(HULTZSCH_TXT, "utf8");
  } catch {
    return;
  }
  const toks = raw.match(/[A-Za-z\u00c0-\u024f\u1e00-\u1eff'’-]+/g) || [];
  const seen = new Set();
  for (const t of toks) {
    const w = canon(t).replace(/^[-']+|[-']+$/g, "");
    if (!isCandidate(w)) continue;
    seen.add(w);
  }
  for (const w of [...seen].sort()) yield { kind: "hultzsch-word", text: w };
}

/* ── 環境變數 BRAHMI_GATE_LIMIT 可設掃描上限，預設全量 ──────────────── */
const LIMIT = process.env.BRAHMI_GATE_LIMIT ? Number(process.env.BRAHMI_GATE_LIMIT) : Infinity;

/* ── 失敗分類（嚴禁改斷言硬湊；逐例分類回報供引擎修正）───────────────── */
const failClass = { case: 0, vowelSign: 0, virama: 0, sign: 0, cluster: 0, unmapped: 0, other: 0 };
const classifyFail = (orig, back) => {
  const o = canon(orig), b = canon(back);
  if (o.replace(/-/g, "") === b.replace(/-/g, "")) return "cluster";
  if (o.replace(/[āīū]/g, (c) => c.normalize("NFD")[0]) === b.replace(/[āīū]/g, (c) => c.normalize("NFD")[0])) return "vowelSign";
  if (o.replace(/ṃ|ṁ|m̐|ḥ/g, "") === b.replace(/ṃ|ṁ|m̐|ḥ/g, "")) return "sign";
  if (o.replace(/./gs, "") === b) return "unmapped";
  return "other";
};

const stats = { total: 0, noise: 0, pass: 0, fail: 0 };
const failSamples = [];

function check(kind, text) {
  stats.total++;
  const back = toRoman(toNative(text));
  if (canon(text) === canon(back)) { stats.pass++; return; }
  stats.fail++;
  failClass[classifyFail(text, back)]++;
  if (failSamples.length < 30) failSamples.push({ kind, orig: text, native: toNative(text), back });
}

/* ── 閉環 A：語料雙向閉環 ───────────────────────────────────────────── */
for (const it of udItems()) {
  if (stats.total >= LIMIT) break;
  check(it.kind, it.text);
}
const afterUd = stats.total;
for (const it of hultzschItems()) {
  if (stats.total - afterUd >= LIMIT) break;
  check(it.kind, it.text);
}

/* ── 閉環 B：權威字形斷言（rom → native 逐詞精確比對，非僅閉環恆等）──── */
let authTotal = 0, authPass = 0;
let authData;
try {
  authData = JSON.parse(fs.readFileSync(AUTH_JSON, "utf8"));
} catch {
  authData = null;
}
const authFailSamples = [];
if (authData?.words) {
  for (const e of authData.words) {
    authTotal++;
    const native = toNative(e.rom);
    if (native === e.native && canon(toRoman(native)) === canon(e.rom)) authPass++;
    else if (authFailSamples.length < 30) authFailSamples.push({ rom: e.rom, expect: e.native, got: native });
  }
}

/* ── 回報 ───────────────────────────────────────────────────────────── */
console.log("brahmi-canon-gate 語料來源檢查：");
const missing = [];
if (!fs.existsSync(UD_CONLLU)) missing.push(UD_CONLLU);
if (!fs.existsSync(HULTZSCH_TXT)) missing.push(HULTZSCH_TXT);
if (missing.length) console.log(`  缺語料（請依 corpus/README.md 重新下載）：${missing.join(", ")}`);

console.log(`閉環 A（IAST↔Brahmi 往返）：總計 ${stats.total}，通過 ${stats.pass}，失敗 ${stats.fail}`);
console.log(`  · ud-sentence/ud-word（UD_Prakrit-DIPI）：前 ${afterUd} 項`);
console.log(`  · hultzsch-word（CII vol.1 OCR 詞彙池）：後 ${stats.total - afterUd} 項`);
if (stats.fail) {
  console.log(`  失敗分類：${Object.entries(failClass).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(", ")}`);
  for (const s of failSamples) console.log(`    [${s.kind}] ${JSON.stringify(s.orig)} → ${JSON.stringify(s.native)} → ${JSON.stringify(s.back)}`);
}
if (authData?.words) {
  console.log(`閉環 B（權威字形斷言）：總計 ${authTotal}，通過 ${authPass}，失敗 ${authTotal - authPass}`);
  for (const s of authFailSamples) console.log(`    ${JSON.stringify(s)}`);
} else {
  console.log("閉環 B（權威字形斷言）：語料缺檔，跳過");
}

/* 門檻：雙向閉環 ≥99.5%，權威字形斷言 100%（權威語料即真值，不容折扣） */
const RATE = 99.5;
const okA = stats.total > 0 && (stats.pass / stats.total) * 100 >= RATE;
const okB = !authData?.words || authPass === authTotal;
const totalAll = stats.total + (authData?.words ? authTotal : 0);
const passAll = stats.pass + (authData?.words ? authPass : 0);
console.log(`brahmi-canon-gate: ${okA && okB ? "通过" : "未通过"} ${passAll}/${totalAll}${okA && okB ? "" : `（閉環通過率須 ≥${RATE}%；權威字形須 100%）`}`);
process.exit(okA && okB ? 0 : 1);
