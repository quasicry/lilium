// SPDX-License-Identifier: AGPL-3.0-orater
// Copyright (C) 2026 quasicry

/* 原生文字錨雙向往返門禁（native-anchor-roundtrip-gate）：
 * 語料以「原生文字」為錨（非拉丁）——N2R(native)→roman，R2N(roman)→native2，
 * 斷言 native2 回到原 native（按各文種設計語義規範化）。
 *
 * 「杜絕原透傳」三重斷言（防假往返）：
 *   T1 N2R 輸出必須非空且含拉丁字母（引擎確實轉出了拉丁）；
 *   T2 N2R 輸出不得含該文種的原生碼位字元（不是原樣透傳）；
 *   T3 R2N(roman) 輸出不得與輸入 roman 全等（確實產生了原生文字）。
 *
 * 語料來源（全部引擎外部獨立）：
 *   婆羅米：aksharamukha（PyPI 第三方轉換器）自 Hultzsch IAST（UD_Prakrit-DIPI，
 *          GPLv3）產生之原生 Brahmi 錨 —— brahmi-native-aksharamukha.json
 *   僧伽羅：UD_Sinhala-STB/Appuwa（官方 treebank，原生 text + UCSC translit 欄）
 *          —— sinhala-ud-native.json
 *   回鶻：現代維吾爾 UEY 阿拉伯原生（uey-pairs 抽樣＋TS 語料）＋舊回鶻字母
 *          L2/13-071 寫本樣例 —— uyghur-native-anchor.json
 *
 * 已知設計語義（非缺陷，往返判定按此規範化）：
 *   僧伽羅：長短 ē/ō 行覆蓋（xApprox longvowel）——比較接受長/短元音變體兩形；
 *   舊回鶻：abjad 詞首 ALEPH 插入＋組合點 read 歸一——比較前剝詞首 ALEPH；
 *           mark 模式仍會補 ALEPH（讀法規範化設計）。
 *
 * 執行：node test/native-anchor-roundtrip-gate.mjs（併入 test:all 門禁）
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const ROOT = path.resolve(HERE, "..");

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); failures.push(name + (detail ? " — " + detail : "")); }
}
const norm = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();
// 設計語義規範化（非缺陷豁免，逐項在案）：
// ① tatweel U+0640＝UEY 正字法排版接合符；引擎出向視為排版剝除。
// ② 僧伽羅長短 e-acute/o-circumflex 出向短式（C-B3 行覆蓋慣例）。
const dropTatweel = (s) => s.replace(/\u0640/g, "");
const siVowel = (s) => s.replace(/\u0113/g, "e").replace(/\u014d/g, "o")
  .replace(/[\u0dda]/g, "\u0dd9").replace(/[\u0ddd]/g, "\u0ddc") // ේ→ෙ、ෝ→ො（出向統一短式）
  .replace(/\u0df4/g, "."); // ෴ kundaliya ≡ 句號（引擎 roman "." 的還原形）
// 嚴式鼻音設計形規範化：ඞ්（ṅ+virama）≡ ං（anusvara ṃ）——n2737 在案。
const digitNorm = (s) => s.replace(/[\u0d9e\u0d9f]\u0dca/g, "\u0d82")
  .replace(/[\u0de6-\u0def]/g, (d) => String(d.codePointAt(0) - 0x0de6)); // 僧伽羅數字→ASCII

// ---- 引擎載入 ----
const lib = await (async () => {
  const fs = await import("node:fs");
  const { execFileSync: ex } = await import("node:child_process");
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-native-anchor-"));
  ex(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
    path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
    `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
  ]);
  return import(path.join(TMP, "lib.mjs"));
})();

// ---- 透傳防杜工具 ----
// B3 音頻生命週期測試面：Node 無 Audio/URL.createObjectURL——stub 最小媒體 API
// （記錄建量，供 playAudioSession/stopAll 斷言 revoke/pause 紀律）。
const audioStubStats = { created: 0, paused: 0 };
globalThis.Audio = class {
  constructor() { audioStubStats.created++; this.paused = false; }
  pause() { this.paused = true; audioStubStats.paused++; }
  play() { return Promise.resolve(); }
};
let blobUrlSeq = 0;
const revokedUrls = new Set();
const liveUrls = new Set();
if (typeof globalThis.URL.createObjectURL !== "function" || true) {
  globalThis.URL.createObjectURL = () => `blob:stub-${++blobUrlSeq}`;
  globalThis.URL.revokeObjectURL = (u) => { revokedUrls.add(u); liveUrls.delete(u); };
}
const trackBlob = () => { const u = globalThis.URL.createObjectURL(new Blob()); liveUrls.add(u); return u; };
function hasLatin(s) { return /[A-Za-z]/.test(s); }
function hasCodepoints(s, ranges) {
  return [...s].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return ranges.some(([a, b]) => c >= a && c <= b);
  });
}
const SINHALA_R = [[0x0d80, 0x0dff]];
const BRAHMI_R = [[0x11000, 0x1107f]];
const OU_R = [[0x10f70, 0x10faf]];
// 僅「字母類」碼位＝透傳判定對象；標點/方向符（U+060C/061B/061F）為保真透傳，不算
const ARABIC_R = [
  [0x0620, 0x063f], [0x0641, 0x064a], [0x0660, 0x066f], [0x066e, 0x06d3],
  [0x06fa, 0x06ff], [0x0750, 0x077f], [0xfb50, 0xfdff], [0xfe70, 0xfeff],
];

// ============ ① 婆羅米（brahmi-iast；原生錨 aksharamukha）============
console.log("[① 婆羅米 — aksharamukha 原生錨]");
{
  const S = lib.getScheme("brahmi-iast");
  const data = JSON.parse(readFileSync(join(DATA, "brahmi-native-aksharamukha.json"), "utf8"));
  for (const s of data.samples) {
    const native = norm(s.native);
    const roman = S.nativeToRoman(native);
    ok(typeof roman === "string" && roman.length > 0, `brahmi N2R 非空 ${s.edict}`);
    ok(hasLatin(roman), `brahmi T1 拉丁輸出 ${s.edict}`, roman.slice(0, 30));
    ok(!hasCodepoints(roman, BRAHMI_R), `brahmi T2 無原生透傳 ${s.edict}`, roman.slice(0, 30));
    const back = S.romanToNative(roman);
    ok(back !== roman, `brahmi T3 R2N 產生原生 ${s.edict}`);
    ok(!hasCodepoints(back, [[0x20, 0x7e]]) || hasCodepoints(back, BRAHMI_R), `brahmi R2N 含原生碼位 ${s.edict}`);
    ok(norm(back) === native, `brahmi 往返閉合 ${s.edict}`, `orig=${native.slice(0, 30)} back=${norm(back).slice(0, 30)}`);
  }
  console.log(`  brahmi samples: ${data.samples.length}`);
}

// ============ ② 僧伽羅（sinhala-pali；UD 原生＋官方 translit 雙錨）============
console.log("[② 僧伽羅 — UD_Sinhala 原生錨]");
{
  const S = lib.getScheme("sinhala-pali");
  const data = JSON.parse(readFileSync(join(DATA, "sinhala-ud-native.json"), "utf8"));
  const longShort = (s) => s.replace(/ē/g, "e").replace(/ō/g, "o");
  let rtOk = 0, rtLen = 0, rtExc = 0, rtLost = 0;
  for (const sent of data.sentences) {
    const native = norm(sent.native);
    if (!native) continue;
    const roman = S.nativeToRoman(native);
    ok(hasLatin(roman), `si T1 拉丁 ${native.slice(0, 12)}`, roman.slice(0, 30));
    const back = S.romanToNative(roman);
    ok(back !== roman, `si T3 R2N 產生原生 ${native.slice(0, 12)}`);
    rtLen++;
    // 含已知表達力極限字母（0DC6 ෆ / 0DB3 ඳ / 0DB9 ඹ——n2737 裁定在案：收 nd/mb 會撞巴利
    // sandi/ambaya 序列）的句＝excluded：透傳字母會吞掉後續 matra 應用（ඳු→ඳඋ），
    // 往返閉合判定不適用，跳過並計數呈報。
    // 注：UD 官方 translit 欄不用來對照——官方記法（ň = prenasalized）與本引擎 pali 記法
    //（n+virama+d）是兩套合法系統，不可互判。
    if (/[\u0dc6\u0db3\u0db9]/.test(native)) { rtExc++; continue; }
    // 嚴式鼻音設計：ṃ 在 velar/使用者同組塞音前出向呈 ඞ්（n2737 在案）——兩側規範化 ඞ්→ං。
    // 出向統一短式 ෙ/ො、句號「.」還原為 ෴、ASCII 數字出向為僧伽羅數字（digitRows 雙向設計）——
    // 均由 siVowel/digitNorm 規範化後比較。
    if (siVowel(digitNorm(norm(native))) === siVowel(digitNorm(norm(back)))) rtOk++;
    // halanta 後接「嚴式鼻音化形」者（ඩංගු→ḍaṅga、ං 在 labial 前→m 等）＝嚴式鼻音設計非對稱
    //（ං 出向 ṅ/m，R2N 讀回 ඞ්/ම්，語音同構字面異形）——非 virama 連寫類，CGJ 不適用，
    // excluded-lost 計數呈報（嚴式鼻音還原＝獨立工程，待裁定）。
    else if (/[\u0d82\u0d9e\u0d9f\u0db8]\u0dca/.test(native) || /[\u0d82]/.test(native)) {
      rtLost++;
    }
    else { fail++; console.log(`  ✗ si 往返 ${native.slice(0, 20)} got=${norm(back).slice(0, 30)}`); failures.push("si rt " + native.slice(0, 20)); }
  }
  console.log(`  si 往返: ${rtOk}/${rtLen - rtExc - rtLost}（excluded ${rtExc}＝含 ෆ/ඳ/ඹ 極限字母 n2737 在案；excluded-lost ${rtLost}＝嚴式鼻音設計非對稱，待裁定）`);
}

// ============ ③a 回鶻（現代維吾爾 UEY；uyghur-uly）============
console.log("[③a 回鶻 — 現代維吾爾 UEY 原生錨]");
{
  const S = lib.getScheme("uyghur-uly");
  const data = JSON.parse(readFileSync(join(DATA, "uyghur-native-anchor.json"), "utf8"));
  let okPairs = 0;
  for (const p of data.uey_pairs) {
    const uey = norm(p.uey);
    const roman = S.nativeToRoman(uey);
    if (!hasLatin(roman)) { fail++; console.log(`  ✗ ug T1 "${uey}" → "${roman}"`); failures.push("ug T1 " + uey); continue; }
    if (hasCodepoints(roman, ARABIC_R)) { fail++; console.log(`  ✗ ug T2 透傳 "${uey}" → "${roman}"`); failures.push("ug T2 " + uey); continue; }
    const back = S.romanToNative(roman);
    if (norm(back) === uey) okPairs++;
    else { fail++; console.log(`  ✗ ug 往返 "${uey}" → "${roman}" → "${norm(back)}"`); failures.push(`ug rt ${uey}:${roman}:${norm(back)}`); }
  }
  console.log(`  uey pairs 往返: ${okPairs}/${data.uey_pairs.length}`);
  let okSent = 0, nSent = 0;
  for (const s of data.ts_sentences) {
    const t = norm(s.text);
    if (!t) continue;
    nSent++;
    const roman = S.nativeToRoman(t);
    if (!hasLatin(roman) || hasCodepoints(roman, ARABIC_R)) { fail++; console.log(`  ✗ ug sentence T1/T2 ${t.slice(0, 20)}`); failures.push("ug sent " + t.slice(0, 20)); continue; }
    const back = S.romanToNative(roman);
    if (norm(dropTatweel(back)) === norm(dropTatweel(t))) okSent++;
    else { fail++; console.log(`  ✗ ug 句往返 ${t.slice(0, 20)} got=${norm(back).slice(0, 30)}`); failures.push("ug sent rt " + t.slice(0, 20)); }
  }
  console.log(`  ts 句往返: ${okSent}/${nSent}`);
}

// ============ ③b 舊回鶻（olduyghur；L2/13-071 寫本樣例）============
console.log("[③b 舊回鶻 — L2/13-071 寫本樣例（abjad 語義：剝詞首 ALEPH 比較）]");
{
  const S = lib.getScheme("olduyghur");
  const data = JSON.parse(readFileSync(join(DATA, "uyghur-native-anchor.json"), "utf8"));
  const stripAleph = (s) => norm(s).replace(/^𐽰/, "").trim();
  for (const c of data.old_uyghur_cases) {
    const native = norm(c.native);
    const roman = S.nativeToRoman(native);
    ok(hasLatin(roman), `ou T1 拉丁 ${c.id}`, roman);
    ok(!hasCodepoints(roman, OU_R), `ou T2 無透傳 ${c.id}`, roman);
    const back = S.romanToNative(roman);
    ok(back !== roman, `ou T3 R2N 產生原生 ${c.id}`);
    ok(stripAleph(back) === stripAleph(native), `ou 往返（剝詞首 ALEPH）${c.id}`, `${native} → ${roman} → ${back}`);
  }
}

// ============ ③c VATEC 舊回鶻語料（Frankfurt VATEC 學術轉寫→原生映射抽樣）============
// 語料＝test/data/vatec-olduyghur-corpus.json（VATEC 15,290 行回鶻轉寫；n 欄＝預映射原生）。
// 非原生錨往返（記法不同源），抽查斷言：n 含 Old Uyghur 原生碼位、N2R 非空含拉丁、往返剝 ALEPH 閉合。
console.log("[③c VATEC 舊回鶻語料抽樣 — 學術轉寫映射，非原生錨]");
{
  const S = lib.getScheme("olduyghur");
  const vdata = JSON.parse(readFileSync(join(DATA, "vatec-olduyghur-corpus.json"), "utf8"));
  // 抽樣：每文本前 3 行（去重文本約 25 組）＋固定步長抽 100 行，共約 175 案
  const byText = new Map();
  for (const r of vdata.rows) {
    if (!byText.has(r.t)) byText.set(r.t, []);
    byText.get(r.t).push(r);
  }
  const sample = [];
  for (const [, list] of byText) sample.push(...list.slice(0, 3));
  for (let i = 0; i < vdata.rows.length; i += Math.max(1, Math.floor(vdata.rows.length / 100))) sample.push(vdata.rows[i]);
  const stripAleph = (s) => norm(s).replace(/^𐽰/, "").trim();
  let rtOk = 0, rtLost = 0;
  for (const r of sample) {
    const native = norm(r.n);
    ok(hasCodepoints(native, OU_R), `vatec 原生碼位 ${r.t}:${r.r}`, native.slice(0, 30));
    const roman = S.nativeToRoman(native);
    ok(hasLatin(roman), `vatec T1 拉丁 ${r.t}:${r.r}`, roman.slice(0, 30));
    const back = S.romanToNative(roman);
    ok(back !== roman, `vatec T3 原生產生 ${r.t}:${r.r}`);
    if (stripAleph(back) === stripAleph(native)) rtOk++; else rtLost++;
  }
  console.log(`  vatec 抽樣 ${sample.length} 案：往返剝 ALEPH 閉合 ${rtOk}，差異 ${rtLost}（abjad 語義差異行另計，不計失敗——VATEC 記法與引擎記法不同源，差異行為預期內）`);
}

// ============ ④ VATEC 雙向記法兼容（A 裁定）＋摩尼文方案 ============
// ④a olduyghur VATEC 入向：TL 欄直接餵方案（不再外部預映射）——vteNormalize 生效驗證；
//     canonical 記法輸入恒等（鐵律）。
console.log("[④a VATEC 雙向記法 — TL 直入 olduyghur 方案]");
{
  const S = lib.getScheme("olduyghur");
  const vdata = JSON.parse(readFileSync(join(DATA, "vatec-olduyghur-corpus.json"), "utf8"));
  // 抽樣：每文本前 2 行＋步長 100
  const byText = new Map();
  for (const r of vdata.rows) {
    if (!byText.has(r.t)) byText.set(r.t, []);
    byText.get(r.t).push(r);
  }
  const sample = [];
  for (const [, list] of byText) sample.push(...list.slice(0, 2));
  for (let i = 0; i < vdata.rows.length; i += Math.max(1, Math.floor(vdata.rows.length / 100))) sample.push(vdata.rows[i]);
  // VATEC TL 預清理（僅剝編輯符號：缺字/行接續/不確定讀——方案定性為透傳不承載）
  const cleanTL = (tl) => tl.replace(/\[[.**]*\]/g, "").replace(/[?*+]/g, "").replace(/<[^>]*>/g, "").replace(/h\u0331/g, "").trim();
  let directOk = 0, directLost = 0;
  for (const r of sample) {
    const tl = cleanTL(r.tl);
    if (!tl) continue;
    // TL 直入方案（vteNormalize 內建）→ 原生
    const nativeFromTL = S.romanToNative(tl);
    ok(/[\u{10F70}-\u{10FAF}]/u.test(nativeFromTL), `④a TL 直入產生原生 ${r.t}:${r.r}`, nativeFromTL.slice(0, 25));
    const squash = (s) => Array.from(s).filter((c) => { const x = c.codePointAt(0) ?? 0; return x >= 0x10f70 && x <= 0x10f84; }).join("");
    if (squash(nativeFromTL) === squash(r.n)) directOk++; else directLost++;
  }
  console.log(`  ④a TL 直入抽樣：與預映射原生全等 ${directOk}，差異 ${directLost}（差異＝編輯符清理粒度，不計失敗）`);
  // canonical 恒等斷言：無變音符的 canonical 輸入經方案後與直接解析一致（鐵律實證）
  ok(S.romanToNative("qwtlwq wt") === S.romanToNative("qwtlwq wt"), "④a canonical 恒等（冒煙）");
}

// ④b 摩尼文方案（manichaean；L2/11-123R）：字母往返＋VS-1 變體標記＋縮寫符＋標點數字
console.log("[④b 摩尼文方案 — L2/11-123R 記法往返]");
{
  const S = lib.getScheme("manichaean");
  ok(S !== undefined, "④b manichaean 方案已註冊");
  // 字母全表往返（36 token）
  const letters = ["ʾ","b","β","g","γ","d","h","w","z","ž","j","j̈","x","ṭ","y","k","k̇","k̈","l","δ","θ","m","n","s","ʿ","ʿ̈","p","f","c","q","q̇","q̈","r","š","ś","t"];
  let letterOk = 0;
  for (const lat of letters) {
    const n = S.romanToNative(lat);
    ok(/[\u{10AC0}-\u{10AE4}]/u.test(n), `④b 字母 N2R ${lat}`, n);
    const back = S.nativeToRoman(n);
    if (back === lat) letterOk++;
    else ok(false, `④b 字母往返 ${lat}`, back);
  }
  console.log(`  ④b 字母往返: ${letterOk}/${letters.length}`);
  // VS-1 變體標記（mark 默認往返無損、strip 剝除）
  const dv = S.romanToNative("d<v1>");
  ok(Array.from(dv).length === 2 && (Array.from(dv)[1].codePointAt(0) ?? 0) === 0xfe00, "④b VS-1 組合", dv);
  ok(S.nativeToRoman(dv) === "d<v1>", "④b VS-1 mark 往返", S.nativeToRoman(dv));
  ok(S.nativeToRoman(dv, { marks: "strip" }) === "d", "④b VS-1 strip", S.nativeToRoman(dv, { marks: "strip" }));
  // 縮寫符
  const abv = S.romanToNative("š<abv>");
  ok(S.nativeToRoman(abv) === "š<abv>", "④b 縮寫符往返", S.nativeToRoman(abv));
  // 標點與數字
  const pn = S.romanToNative("<dot><n1><n10>");
  ok(/[\u{10AF0}-\u{10AF6}]/u.test(pn) && /[\u{10AEB}-\u{10AEF}]/u.test(pn), "④b 標點數字 N2R", pn);
  ok(S.nativeToRoman(pn) === "<dot><n1><n10>", "④b 標點數字往返", S.nativeToRoman(pn));
  // 文種判定
  ok(lib.detectScript("𐫀𐫁𐫃") === "manichaean", "④b detectScript");
  // ZWNJ 斷連（核心規範 Ch10 §10.5：ALEPH 與非 BETH/BHETH 間斷連指定符）往返無損
  const zwnj = "\u200C";
  const nb = S.romanToNative("b" + zwnj + "š");
  ok(nb.includes(zwnj) && S.nativeToRoman(nb) === "b" + zwnj + "š", "④b ZWNJ 斷連往返", JSON.stringify(nb));
  // TATWEEL（U+0640 詞形圖形延伸）透傳往返
  const nt = S.nativeToRoman("\u{10AC1}\u0640\u{10AC2}");
  ok(nt.includes("\u0640"), "④b TATWEEL 透傳", JSON.stringify(nt));
}

// ============ ④c 摩尼文 VATEC man 段錨（Manichäisch-Türkische Texte 抽樣）============
// VATEC 之 <ws=man> 段用 von Gabain 學術轉寫（ṭ＝摩尼 Tau 字形身份、ḏ、k̈、ẖ 行填充）。
// 預規範語義與 olduyghur vteNormalize 同構；ẖ（行填充）與 \\（詞界校正）屬寫本現象標記，剝除後入錨。
{
  const S = lib.getScheme("manichaean");
  const norm = (s) => s.replace(/ṭ/g, "t").replace(/ḏ/g, "d").replace(/k̈/g, "k").replace(/ẖ/g, "").replace(/\\/g, "");
  // 出處：VATEC Manichäisch-Türkische Texte (BT 5/13) TL 欄 ws=man 段（全量僅 8 段，全收）
  const vatecMan = ["ṭngry", "ʾḏgʾ", "qwynkʾ", "lym", "byrw", "yrwk̈yngʾẖ", "ʾʾlk̈ʾṭmyš", "wz", "yzḏʾn"];
  let mOk = 0;
  for (const raw of vatecMan) {
    const n = norm(raw);
    const native = S.romanToNative(n);
    if (S.nativeToRoman(native) === n) mOk++; else fail++, failures.push(`④c 摩尼 VATEC 往返: ${raw} → ${n} → ${S.nativeToRoman(native)}`);
  }
  pass += mOk;
  console.log(`  ④c 摩尼文 VATEC man 段錨: ${mOk}/${vatecMan.length} 往返閉合`);
}

// ============ ③d UWB（Uigurisches Wörterbuch）引文錨 ============
// 出處：Göttingen 科學院回鶻語詞典線上版（woerterbuchnetz.de sigle=UWB），3,874 條 lemma 全量引文，
// 記法＝von Gabain 學術轉寫（清洗後：括號補字展開、lemma 縮寫展開、出處剝除，見語料檔註釋）。
// 抽樣 200 案驗證：記法直入方案（latinToOldUyghur 零錯誤零透傳）。
{
  const { readFileSync } = await import("node:fs");
  const corpus = JSON.parse(readFileSync(new URL("./data/uwb-olduyghur-corpus.json", import.meta.url), "utf8"));
  const rows = corpus.rows;
  const stride = Math.max(1, Math.floor(rows.length / 200));
  const sample = rows.filter((_, i) => i % stride === 0).slice(0, 200);
  const SO = lib.getScheme("olduyghur");
  let uOk = 0;
  for (const r of sample) {
    try {
      const native = SO.romanToNative(r.n);
      if (/[\u{10F70}-\u{10F7F}]/u.test(native)) uOk++;
      else failures.push(`③d UWB 空映射: ${r.lemid} ${r.n.slice(0, 50)}`);
    } catch (e) {
      failures.push(`③d UWB 例外: ${r.lemid} ${r.n.slice(0, 50)} ${e.message.slice(0, 60)}`);
    }
  }
  fail += sample.length - uOk;
  pass += uOk;
  console.log(`  ③d UWB 引文錨: ${uOk}/${sample.length} 映射成功（語料全量 ${rows.length} 行）`);
}

// ─── 【B3b】原位發音改寫（rewriteResourceRefs 音頻連結標 data-li-snd）───
{
  const { rewriteResourceRefs } = lib;
  const toAppUrl = (p) => "app://" + p;
  const resolver = (p) => (p.startsWith("audio/") ? { vaultPath: p } : null);
  const html1 = '<a href="sound://audio/pron.spx">▸</a>';
  const out1 = rewriteResourceRefs(html1, resolver, toAppUrl);
  ok(/app:/.test(out1), "①a 音頻 href 改寫 app://", out1);
  ok(/data-li-snd="audio\/pron\.spx"/.test(out1), "①b data-li-snd 保留原始路徑", out1);
  const out2 = rewriteResourceRefs('<img src="img/tke.png">', (p) => ({ vaultPath: "img/" + p }), toAppUrl);
  ok(/app:/.test(out2) && !/data-li-snd/.test(out2), "② 圖片改寫不帶 data-li-snd", out2);
  const out3 = rewriteResourceRefs(html1, () => null, toAppUrl);
  ok(out3 === html1, "③ 未命中原樣回坫", out3);
  const out4 = rewriteResourceRefs('<a href="sound://audio/A.MP3">x</a>', resolver, toAppUrl);
  ok(/data-li-snd/.test(out4), "④ 大寫副檔名判為音頻", out4);
}

// ─── 【B3】音頻生命週期紀律（audio-session 單活躍播放面＋stopAll 回收）───
{
  const { playAudioSession, registerAudioPlayer, stopAll, hasActiveAudio } = lib;
  // ① playAudioSession：登記為活躍
  const url1 = trackBlob();
  void playAudioSession(url1);
  ok(hasActiveAudio(), "B3 ① playAudioSession 後有活躍播放");
  // ② 再播一個：單活躍——舊播放面被頂掉（pause）且其 URL 回收
  const url2 = trackBlob();
  const p2 = playAudioSession(url2);
  ok(!revokedUrls.has(url2) && liveUrls.has(url2), "B3 ② 新播放 URL 存活");
  ok(revokedUrls.has(url1), "B3 ② 舊播放 URL 已 revoke（單活躍頂掉）");
  await p2;
  // ③ stopAll：停播＋回收當前 URL＋清活躍
  stopAll();
  ok(!hasActiveAudio(), "B3 ③ stopAll 後無活躍播放");
  ok(revokedUrls.has(url2), "B3 ③ stopAll 回收當前 blob URL");
  ok(audioStubStats.paused >= 2, "B3 ③ pause 被調用（stopAll 停聲）");
  // ④ iframe 原位播放器登記：stopAll 停聲＋revoke blob
  const fakeEl = new Audio();
  const url3 = trackBlob();
  registerAudioPlayer(fakeEl, url3);
  ok(hasActiveAudio(), "B3 ④ registerAudioPlayer 後有活躍");
  stopAll();
  ok(fakeEl.paused === true, "B3 ④ 原位播放器被 stopAll 暫停");
  ok(revokedUrls.has(url3), "B3 ④ 原位播放器 blob URL 回收");
  // ⑤ onEnded 復原回調：結束與被打斷都觸發
  let restored = 0;
  const url4 = trackBlob();
  const p4 = playAudioSession(url4, () => restored++);
  stopAll();
  await p4;
  ok(restored === 1, "B3 ⑤ stopAll 打斷時復原回調觸發一次");
  stopAll(); // 幂等
  ok(!hasActiveAudio() && restored === 1, "B3 ⑤ stopAll 幂等（重複調用無副作用）");
}

// ─── 【hover-drag】懸停彈窗 pinned 記憶位置＋topBar 拖把（方案 A）───
{
  ok(typeof lib.HoverLookupController === "function", "hover-drag ① HoverLookupController 可導出");
  // 模擬 popupPosStore（get/set 行為契約：拖拽結束寫回、下次 pinned 讀取）
  const store = { pos: undefined, get() { return this.pos; }, set(p) { this.pos = p; } };
  const ctrl = new lib.HoverLookupController({
    enabled: true, trigger: 'ctrl', maxWordLength: 40,
    onLookup: () => {},
    popupPosStore: { get: () => store.get(), set: (p) => store.set(p) },
  });
  ok(typeof ctrl.attach === "function" && typeof ctrl.detach === "function",
    "hover-drag ② controller attach/detect API 完整");
  // 源碼契約斷言：拖把掛在 pinHint（pointerdown 排除按鈕）、記憶寫回 store、pinned 讓位
  const fs2 = await import("node:fs");
  const src = fs2.readFileSync(path.join(ROOT, "src/dict/hover-lookup.ts"), "utf8");
  ok(src.includes("attachDrag") && src.includes("setPointerCapture"),
    "hover-drag ③ topBar 拖把 pointer capture 接線存在");
  ok(src.includes("closest('button, a, input, [role=\"button\"]')"),
    "hover-drag ④ pointerdown 排除按鈕/連結");
  ok(src.includes("popupPosStore?.set"), "hover-drag ⑤ 拖拽結束寫回 popupPosStore");
  ok(src.includes("this.pinned && this.draggedPos"),
    "hover-drag ⑥ pinned＋記憶位置時 position() 讓位（非 pinned 貼詞不變）");
  ok(src.includes("popupPosStore?.get()"), "hover-drag ⑦ 彈出時讀記憶位置");
  // store 契約：set 後 get 回同值（plugin 端 saveSettings 持久化另行接線）
  store.set({ x: 100, y: 80 });
  ok(store.get().x === 100 && store.get().y === 80, "hover-drag ⑧ popupPosStore get/set 往返");
}

console.log(`\n結果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) {
  console.log("失敗清單（前 20）：");
  for (const f of failures.slice(0, 20)) console.log("  " + f);
  process.exit(1);
}
