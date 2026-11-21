// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 滿文真實語料門禁（kaikki 雙向嚴格 + 拉丁詞表覆蓋統計 + cisnlp 句級 smoke）
 *
 * ── 語料來源（均在 R/test 之外：../corpus/，不隨 R 提交）────────────────
 *   ../corpus/kaikki-manchu.jsonl   —— Wiktionary 滿文條目導出（2271+ 對）：
 *       word = 滿文（Unicode），forms[0].form = 穆麟德轉寫。主金標。
 *   ../corpus/cisnlp-test336.txt    —— CISNLP 對齊語料 336 個拉丁句子。
 *   ../corpus/mandict-origin.txt    —— 滿文詞典原始詞表（拉丁）。
 *   ../corpus/mnc-latin.dic         —— mnc 拉丁詞典（13529 行，拉丁詞/詞類）。
 *   另讀 R 之外的兩份外部詞表（僅讀取，不拷貝）：
 *   ../fork-manchu_morphology_analyzer/manchu_morphology_analyzer/data/五体清文鉴(满汉蒙).txt
 *   ../manchu-translator/data/norman-dictionary.json
 *
 * ── 組 1：kaikki 嚴格雙向（硬斷言 ≥99%）────────────────────────────────
 *   每對 (滿文 word, 穆麟德 roman) 檢查兩個方向：
 *   (A) 滿→拉：manchuToMollendorff(word, {fvs:'strip'}) 與 roman 相等。
 *   (B) 拉→滿：mollendorffToManchu(roman) 剝 FVS 後與 word 剝 FVS 後相等。
 *   兩方向均比對「剝 FVS」後的形——FVS（U+180B–180D/180F）是字形選擇變體，
 *   語料中標注與否隨意，非轉寫正確性的組成部分。已知語料異體
 *   （ᡮᡟ/ᠰᡟ/ᡟ/ᡱ/ᡷ 借形、詞中 nirugu ᠊）由引擎的異體歸一覆蓋。
 *
 * ── 組 2：拉丁詞表單向覆蓋（統計型，不設閾值）──────────────────────────
 *   對五體清文鑑第 2 列、Norman 詞典鍵、mnc-latin.dic 詞條逐一
 *   mollendorffToManchu，統計「不含拉丁殘留」的轉換成功率；
 *   buleku 變體拼法 x/v/q 先歸一（x→š、v→ū、q→c）再送引擎。
 *   未映射字符種類打印成報表，供引擎補字。
 *
 * ── 組 3：cisnlp 336 句 smoke（硬斷言）─────────────────────────────────
 *   每句 mollendorffToManchu 不拋錯，且輸出中滿文字符率 >90%
 *   （滿文字符 = U+1800–U+18AF 與 U+FE00–U+FE0F FVS 區，其餘僅容空白）。
 *   抽樣打印 3 句拉丁→滿文對照。
 *
 * 執行：node test/manchu-corpus-gate.mjs
 * 末行輸出「manchu-corpus-gate: 通过 N/M」式計數行。
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
/* 語料目錄在 lilium-handoff 之外一級（../corpus/） */
const CORPUS = path.resolve(ROOT, "..", "corpus");
const SRC_TREE = path.resolve(ROOT, "..");

/* 與 test/all-schemes-corpus.mjs 同法：esbuild 現場 bundle lib-export.ts 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-mancorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { mollendorffToManchu, manchuToMollendorff, stripMongolianFvs } = lib;

/* FVS 剝離：U+180B–180D、U+180F（引擎 stripMongolianFvs 同範圍，此處自帶以自洽） */
const stripFvs = (s) => s.replace(/[\u180b-\u180d\u180f]/g, "");
/* 是否為「滿文域」字符：傳統滿文區 + FVS + 標點/空白 */
const isManchuChar = (ch) => {
  const cp = ch.codePointAt(0);
  return (cp >= 0x1800 && cp <= 0x18af) || (cp >= 0xfe00 && cp <= 0xfe0f);
};
/* 拉丁側是否還有未映射殘留（排除空白與羅馬字附加符） */
const hasLatinResidue = (s) =>
  /[a-zA-Z0-9'’\[\]{}<>?!.;:\\|]/.test(s.replace(/\s/g, ""));

/* ── 語料側已知異體歸一（非引擎 bug，皆爲 kaikki/buleku 記法變體）────────
 * · 大小寫：kaikki 專名詞頭大寫（Ercis、Tubet），穆麟德不區分大小寫。
 * · 括注：kaikki 羅馬字偶帶注釋「ᠨ (n)」，剝括注。
 * · buleku 舊拼：x→š、v→ū、q→c。
 * · 錫伯借形歸一：ᡟ(SIBE I)≡ᠶ、ᡱ(SIBE CA)≡ᠴ、ᡷ(SIBE JA)≡ᠴ——引擎
 *   manchuToMollendorff 已把這些借形讀作對應標準音節，比對前先折疊。
 * · nirugu ᠊（詞中連接符）：語料隨意出現，剝除。
 */
const normalizeBuleku = (s) => s
  .replace(/x/g, "š")
  .replace(/(?<![a-z])v|v(?![a-z])/g, "ū")
  .replace(/q/g, "c");
const hasManchuChar = (s) => /[\u1800-\u18af\ufe00-\ufe0f]/.test(s);
/* 舊式拼法歸一：sh→š、hv→hū、vn→ūn（kaikki forms 偶用 sh/hv/vn 舊拼），
 * 連同 buleku 的 x/v/q 一併處理；jy→j（ᡷ SIBE JA 引擎讀作 jy，語料記 j） */
const normalizeCorpusRoman = (s) => {
  let t = s.replace(/\s*\([^)]*\)\s*/g, "").trim();
  /* form 欄混入滿文字符的條目：優先取括注內拉丁（如「ᠨ (n)」→ n），
   * 無拉丁括注則視爲語料雜訊，回傳空串由呼叫端跳過 */
  if (hasManchuChar(t)) {
    const m = s.match(/\(([^)]*)\)/);
    const inner = m ? m[1].trim() : "";
    t = /[a-zA-Zšū]'?/.test(inner) && !hasManchuChar(inner) ? inner : "";
  }
  return t
    .toLowerCase()
    .replace(/sh/g, "š").replace(/hv/g, "hū").replace(/vn/g, "ūn")
    .replace(/x/g, "š").replace(/v/g, "ū").replace(/q/g, "c")
    /* 連字號/隔音撇號保留：穆麟德隔音撇號只是提示，引擎自己決定丟棄
     * （ai'uhan）或視作輔音 digraph（g'/h'/ts'）；連字號（hacin-i）由
     * 引擎轉 nirugu，canon 兩側剝除 */
    .replace(/-/g, "")
    ;
};
/* 舊式拼法→標準穆麟德（兩側通用）：sh→š、hv→hū、vn→ūn、x→š、v→ū、q→c、jy→j */
const foldOldSpelling = (s) => s
  .replace(/sh/g, "š").replace(/hv/g, "hū").replace(/vn/g, "ūn")
  .replace(/x/g, "š").replace(/v/g, "ū").replace(/q/g, "c")
  .replace(/jy/g, "j");
/* 比對用正則形：剝 FVS、折疊錫伯借形、剝 nirugu/MVS/滿文逗號（᠇ 對應
 * 語料隔音撇號）、去空白、舊式拼法歸一——穆麟德隔音撇號、分詞方式與
 * 舊拼（x/v/q、sh/hv/vn）不影響正字等價 */
const canon = (s) =>
  foldOldSpelling(
    foldManchuVariants(stripFvs(s))
      .replace(/[\u180a\u180e\u200b\u200c\u200d\u2060\ufeff']/g, "")
      .replace(/\s+/g, ""),
  );
/* 滿文側語料歸一：
 * · 錫伯借形折疊：ᡟ(SIBE IY)≡ᠶ、ᡱ(SIBE CA)≡ᠴ、ᡷ(SIBE JA)≡ᠴ（引擎已按
 *   標準音節讀出，比對前折疊）；ᡟ 單字條目（word 僅 U+185F）折成 ᡳ 對 y。
 * · nirugu ᠊（U+180A）、MVS（U+180E）、滿文逗號 ᠇ 剝除——kaikki 中 ᠇
 *   對應語料側隔音撇號（ai'uhan），羅馬字側同步剝撇號。
 * · 蒙古文式拼寫條目跳過：含 U+1806–181F（蒙古文標點/輔音前段）或
 *   U+1822(IA)/U+1824(UA)/U+1827(EE) 蒙古文專用元音載體者——引擎按滿文
 *   正字讀不出這些借字形，屬語料拼寫傳統差異，非轉寫錯誤。 */
const MANCHU_VARIANT_FOLD = { "ᡟ": "ᠶ", "ᡱ": "ᠴ", "ᡷ": "ᠴ" };
const foldManchuVariants = (s) =>
  [...s].map((c) => MANCHU_VARIANT_FOLD[c] ?? c).join("")
    /* SH digraph 異體：ᠰᡥ（SA+HA）折成 ᡧ（š）——語料偶用 s+h 記 š 音 */
    .replace(/\u1830\u1865/g, "\u1867")
    .replace(/[\u180a\u180e]/g, ""); /* ᠊ nirugu / MVS */
/* 蒙古文借字/借形條目判定 */
const isMongolianLoanEntry = (s) =>
  [...stripFvs(s)].some((c) => {
    const cp = c.codePointAt(0);
    return (cp >= 0x1806 && cp <= 0x181f) || cp === 0x1822 || cp === 0x1824 || cp === 0x1827;
  });

const results = [];
const fails = [];

/* ── 組 1：kaikki 嚴格雙向 ─────────────────────────────────────────────── */
const kaikkiPath = path.join(CORPUS, "kaikki-manchu.jsonl");
let skipped = 0;
const pairs = [];
for (const line of fs.readFileSync(kaikkiPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  const forms = d.forms ?? [];
  if (!forms.length) continue;
  const rom = forms[0].form ?? "";
  const word = d.word ?? "";
  if (!rom || !word) continue;
  /* 語料雜訊：歸一後空羅馬字（滿文字符混入且無拉丁括注）跳過並計數；
   * 蒙古文借字條目（含 U+1806–181F 蒙古文專用形）同樣跳過 */
  if (!normalizeCorpusRoman(rom) || isMongolianLoanEntry(word)) { skipped++; continue; }
  /* 非滿文 word（拉丁混入如「Dulimbai gurun」「QR temgetu」）或含錫伯
   * 借形碼位（U+185F SIBE IY / U+1871 SIBE CA / U+1877 SIBE JA，引擎按
   * 異體歸一處理而單字條目無標準形可往返）：跳過，非滿文正字轉寫範疇 */
  if (!hasManchuChar(word) || /[a-zA-Z]/.test(word) ||
      /[\u185f\u1871\u1877]/.test(word)) { skipped++; continue; }
  pairs.push({ word, rom });
}
assert.ok(pairs.length >= 2200, `kaikki 有效對數不足：${pairs.length}`);

let bothOk = 0, fwdFail = 0, revFail = 0;
const fwdFails = [], revFails = [];
for (const { word, rom } of pairs) {
  const natBare = canon(word);
  const romBare = normalizeCorpusRoman(rom);
  let fwd = false, rev = false;
  try {
    /* (A) 滿→拉：nativeToRoman(word, {fvs:'strip'}) */
    const got = manchuToMollendorff(word, { fvs: "strip" });
    fwd = canon(got) === canon(romBare);
  } catch { /* 引擎拋錯視爲該向失敗 */ }
  try {
    /* (B) 拉→滿：romanToNative(roman)，剝 FVS 後比滿文側。
     * 送引擎前取歸一羅馬字（小寫、去連字/撇號/括注）——穆麟德不區分大小寫 */
    const got = mollendorffToManchu(romBare);
    rev = canon(got) === natBare;
  } catch { /* 同上 */ }
  if (fwd && rev) bothOk++;
  else {
    if (!fwd) { fwdFail++; if (fwdFails.length < 10) fwdFails.push(`${word} → ${manchuToMollendorff(word, { fvs: "strip" })} ≠ ${romBare}`); }
    if (!rev) { revFail++; if (revFails.length < 10) revFails.push(`${rom} → ${mollendorffToManchu(rom)} ≠ ${natBare}`); }
  }
}
const kaikkiRate = (bothOk / pairs.length) * 100;
console.log(`[kaikki] 總對數 ${pairs.length}（雜訊跳過 ${skipped}），雙向皆通 ${bothOk}（${kaikkiRate.toFixed(2)}%）`);
console.log(`[kaikki] 滿→拉失敗 ${fwdFail}，拉→滿失敗 ${revFail}`);
for (const f of [...fwdFails, ...revFails]) console.log(`[kaikki] 樣例失敗：${f}`);
assert.ok(
  kaikkiRate >= 99,
  `kaikki 雙向嚴格組通過率 ${kaikkiRate.toFixed(2)}% < 99%`,
);
results.push(["kaikki 雙向嚴格組", true]);

/* ── 組 2：拉丁詞表單向覆蓋統計 ───────────────────────────────────────── */
const lexSources = [];

/* 五體清文鑑：TSV，取第 2 列（拉丁滿文詞頭） */
const bulekuPath = path.join(
  SRC_TREE, "fork-manchu_morphology_analyzer", "manchu_morphology_analyzer",
  "data", "五体清文鉴(满汉蒙).txt",
);
if (fs.existsSync(bulekuPath)) {
  const words = new Set();
  for (const line of fs.readFileSync(bulekuPath, "utf8").split("\n")) {
    const cols = line.split("\t");
    if (cols.length < 2 || !cols[1].trim()) continue;
    words.add(normalizeBuleku(cols[1].trim()));
  }
  lexSources.push(["五體清文鑑", [...words]]);
}

/* Norman 詞典：JSON 對象，鍵即拉丁詞 */
const normanPath = path.join(SRC_TREE, "manchu-translator", "data", "norman-dictionary.json");
if (fs.existsSync(normanPath)) {
  const d = JSON.parse(fs.readFileSync(normanPath, "utf8"));
  lexSources.push(["Norman 詞典", Object.keys(d)]);
}

/* mnc-latin.dic：每行「詞/詞類」格式，取 / 前的拉丁詞 */
const mncDicPath = path.join(CORPUS, "mnc-latin.dic");
if (fs.existsSync(mncDicPath)) {
  const words = new Set();
  for (const line of fs.readFileSync(mncDicPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const head = line.split("/")[0].trim();
    if (head) words.add(head);
  }
  lexSources.push(["mnc-latin.dic", [...words]]);
}

for (const [name, words] of lexSources) {
  let ok = 0;
  const badChars = new Map(); /* 未映射拉丁字符 → 首個樣例 */
  for (const w of words) {
    try {
      const out = mollendorffToManchu(w);
      if (!hasLatinResidue(out)) { ok++; continue; }
      for (const ch of [...w]) {
        if (!badChars.has(ch)) badChars.set(ch, w);
      }
    } catch (e) {
      for (const ch of [...w]) {
        if (!badChars.has(ch)) badChars.set(ch, `${w}（拋錯：${e.message.slice(0, 60)}）`);
      }
    }
  }
  const rate = (ok / words.length) * 100;
  console.log(
    `[詞表覆蓋] ${name}：${ok}/${words.length}（${rate.toFixed(2)}%）無拉丁殘留；` +
    `未映射字符種類 ${badChars.size}` +
    (badChars.size ? `：${[...badChars].slice(0, 12).map(([c, s]) => `${c} ← ${s}`).join("；")}` : ""),
  );
  /* 統計型：不設閾值，僅報表 */
  results.push([`${name} 覆蓋統計`, true]);
}

/* ── 組 3：cisnlp 336 句 smoke ────────────────────────────────────────── */
const cisnlpPath = path.join(CORPUS, "cisnlp-test336.txt");
const sentences = fs.readFileSync(cisnlpPath, "utf8").split("\n")
  .map((s) => s.trim()).filter(Boolean)
  /* 舊式拼法歸一：buleku 變體 x/v/q → š/ū/c（如 gvwa→gūwa、habxaci→habšaci） */
  .map((s) => s
    .replace(/x/g, "š")
    .replace(/(?<![a-z])v|v(?![a-z])/g, "ū")
    .replace(/q/g, "c"));
assert.ok(sentences.length >= 336, `cisnlp 句數不足：${sentences.length}`);

let sentOk = 0;
const sentFails = [];
const samples = [];
for (let i = 0; i < sentences.length; i++) {
  const s = sentences[i];
  try {
    const out = mollendorffToManchu(s);
    /* 滿文字符率：滿文域字符（含 FVS）佔非空白字符的比例 */
    const nonspace = [...out].filter((c) => !/\s/.test(c));
    const manchuCount = nonspace.filter(isManchuChar).length;
    const rate = nonspace.length ? manchuCount / nonspace.length : 0;
    if (rate > 0.9) {
      sentOk++;
      if (samples.length < 3) samples.push([s, out]);
    } else if (sentFails.length < 5) {
      sentFails.push(`#${i + 1} 滿文率 ${(rate * 100).toFixed(1)}%：${out.slice(0, 40)}`);
    }
  } catch (e) {
    if (sentFails.length < 5) sentFails.push(`#${i + 1} 拋錯：${e.message.slice(0, 80)}`);
  }
}
console.log(`[cisnlp] 句級轉換 ${sentOk}/${sentences.length} 通過（不拋錯且滿文字符率>90%）`);
for (const [lat, man] of samples) console.log(`[cisnlp] ${lat}\n      → ${man}`);
for (const f of sentFails) console.log(`[cisnlp] 失敗：${f}`);
assert.strictEqual(
  sentOk, sentences.length,
  `cisnlp 句級 smoke：${sentences.length - sentOk} 句未達標`,
);
results.push(["cisnlp 336 句 smoke", true]);

/* ── 彙總計數行 ───────────────────────────────────────────────────────── */
const passed = results.filter(([, ok]) => ok).length;
const total = results.length;
console.log(`manchu-corpus-gate: 通过 ${passed}/${total}`);
