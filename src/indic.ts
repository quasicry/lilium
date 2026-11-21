// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 梵文（Sanskrit）/ 巴利文（Pali）↔ 天城體 Devanagari（U+0900–U+097F）轉寫器。
 *
 * 【本版糾偏（依 ISO 15919 / IAST / 巴利三藏轉寫實證）】
 *  1. 修 OOM：`iastToDevanagari` 舊實作的輔音指標從不推進且誤把自身當「下一個單元」，
 *     任何含輔音的輸入都會無限遞迴。改爲迭代式（合字以 while 收集連續輔音）。
 *  2. 修「anusvāra / visarga / candrabindu 吞掉固有 a」：`devanagariToIast("संघ")` 舊得 `sṃgha`、
 *     `"बुद्धं"` 舊得 `buddhṃ`。正確爲 `saṃgha`（巴利一律 ṃ；ISO 嚴式 `saṅgha` 走
 *     pali-iso15919）/`buddhaṃ`——
 *     這兩個符號是音節「尾加成分」，不取消前面輔音的固有 a（與 Devanagari 編碼事實一致）。
 *  3. 巴利 niggahita：pali-iast（IAST 模式）回轉一律 ṃ——PTS/BJT
 *     校勘本正字不做同部位鼻音區分（bilara-data 44 萬段真值門禁實證：回轉嚴式
 *     破壞往返 612 條）；pali-iso15919（mode=iso）回轉保留 ISO 15919 嚴式鼻音化
 *     （ anusvāra 後接同組塞音 → 該組鼻音）。半母音/噝音/h 前及詞尾兩傳統皆保留 ṃ。
 *     法句經 ISO 嚴式拼法 `manopubbaṅgamā` 與 PTS 拼法 `manopubbaṃgamā` 並存，
 *     輸入端 ṁ/ṃ 等價；嚴式拼法經 pali-iso15919 方案處理。
 *  4. 巴利 niggahita 的兩種字形等價：PTS 用 `ṃ`（U+1E43 下點），
 *     Ānandajoti / SuttaCentral / ISO 15919 簡式用 `ṁ`（U+1E41 上點）。
 *     巴利模式下二視一同（舊版把 `ṁ` 當 candrabindu，對巴利是錯的）。
 *  5. 新增 ISO 15919 模式（與 IAST 的系統性差異，見 MODE 註釋）：
 *     ऋ→r̥ / ॠ→r̥̄ / ऌ→l̥ / ॡ→l̥̄、anusvāra→ṁ、candrabindu→m̐、ḷ→ळ、ṟ/ṉ/ḻ。
 *  6. 修 Harvard-Kyoto：舊表以 2 字符鍵 `ṭh`/`ḍh` 匹配單字符，永遠不命中，
 *     捲舌送氣（Th/Dh）全部錯轉。改爲最長匹配有序表。
 *  7. avagraha 三態分流：前文元音結尾 → ऽ 黏合
 *     （rāmo'sti 連聲型）；前文輔音結尾 → 透傳字面撇號 '（引號語義，
 *     'mikṣatvam' ityasya 型，且死輔音 virama 不被吞）；孤立/句讀後 →
 *     孤詞補 a（अ，'sti 檢字表型）。
 *     tokenizer 級配對偵測——同一詞邊界內
 *     出現第二個 '（'xxx' 包夾型）→ 撇號判定爲引號語義（quote 單元），正向
 *     輸出透傳字面撇號 '（死輔音 virama 不被 quote 抵消，त्वम्' 往返無損）；
 *     真孤詞（單 '）→ 維持孤詞補 a（अ）。取舍：前文元音結尾的 ' 恆爲連聲
 *     黏合（rāmo'sti），即引號內 'rāmo' 型的開引號緊貼前文元音時會被讀成
 *     ऽ——IAST 出版慣例引號外多有空白/句讀，實際語料極少命中，如實記錄。
 *
 * 算法要點（abugida 拼寫層正交轉寫，非語音 schwa-deletion）：
 *  - 輔音基底**不含** a；相鄰輔音之間自動插 virama（U+094D）形成合字；
 *    合字的最後一個輔音承接後隨的元音 / 符號。
 *  - 元音 `a` 在輔音（簇）後即固有 a，只消耗不輸出；其餘元音在輔音後發 matra。
 *
 * 純函數、無 Obsidian 依賴；所有函數不拋未捕獲異常（命令 / 即時上屏層守護）。
 */

import { ANN_RE, escapeRomanCp, registerScheme, type CharTableEntry, type TransliterationOptions, type TransliterationScheme } from "./translit-common";

const cp = (n: number): string => String.fromCodePoint(n);

/** 轉寫字母表模式 */
export type IndicMode = "iast" | "iso";

export interface IndicOptions extends TransliterationOptions {
  /** iast（默認）| iso（ISO 15919:2001） */
  mode?: IndicMode;
  /** 巴利模式：`ṁ` 亦視爲 niggahita；並默認啓用嚴式鼻音化 */
  pali?: boolean;
  /** 嚴式鼻音化（默認：巴利開、梵文關） */
  strictNasal?: boolean;
}

/* ---------------- 天城體輔音（基底，不含固有 a） ---------------- */
// prettier-ignore
const IAST_CONSONANT: Record<string, number> = {
  k: 0x0915, kh: 0x0916, g: 0x0917, gh: 0x0918, "ṅ": 0x0919,
  c: 0x091a, ch: 0x091b, j: 0x091c, jh: 0x091d, "ñ": 0x091e,
  "ṭ": 0x091f, "ṭh": 0x0920, "ḍ": 0x0921, "ḍh": 0x0922, "ṇ": 0x0923,
  t: 0x0924, th: 0x0925, d: 0x0926, dh: 0x0927, n: 0x0928,
  p: 0x092a, ph: 0x092b, b: 0x092c, bh: 0x092d, m: 0x092e,
  y: 0x092f, r: 0x0930, l: 0x0932, v: 0x0935,
  "ś": 0x0936, "ṣ": 0x0937, s: 0x0938, h: 0x0939,
};
/**
 * ISO 15919 補充字母（IAST 無）：
 *  - ळ(0x0933) ḷ：IAST 中 `ḷ` 是聲化元音 ऌ，故 ळ 僅在 ISO 模式可輸入（IAST 模式僅輸出）。
 *  - ऱ(0x0931) ṟ、ऩ(0x0929) ṉ、ऴ(0x0934) ḻ：達羅毗荼語系字母。
 */
// prettier-ignore
const ISO_CONSONANT: Record<string, number> = {
  "ḷ": 0x0933, "ṟ": 0x0931, "ṉ": 0x0929, "ḻ": 0x0934,
  // 達羅毗荼／梵文轉寫常用捩舌輔音：ड़(0x095C) ṛ、ढ़(0x095D) ṛh。
  // 與聲化元音 ऋ(r̥) / ऌ(l̥) 在 ISO 15919 下「同音兩形」，故 roman→native
  // 時須交由面板讓用戶選擇（見 detectRomanToNativeAmbiguities 的 vocalic 類）。
  "ṛ": 0x095c, "ṛh": 0x095d,
};

/**
 * `allowIso`：ISO 15919 補充字母是否啓用。
 * 巴利模式亦須啓用——巴利沒有聲化元音，其 `ḷ` 是**捲舌邊音 ळ(0x0933)**
 * （實證：saḷāyatana「六處」），若仍按 IAST 解成聲化元音 ऌ 則全錯。
 */
function consCode(key: string, mode: IndicMode, allowIso = mode === "iso"): number | undefined {
  return IAST_CONSONANT[key] ?? (allowIso ? ISO_CONSONANT[key] : undefined);
}
function consRoman(c: number, mode: IndicMode, allowIso = mode === "iso"): string | undefined {
  if (IAST_CONSONANT_REV[c] !== undefined) return IAST_CONSONANT_REV[c];
  return allowIso ? ISO_CONSONANT_REV[c] : undefined;
}
const IAST_CONSONANT_REV: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(IAST_CONSONANT)) m[v] = k;
  return m;
})();
const ISO_CONSONANT_REV: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(ISO_CONSONANT)) m[v] = k;
  return m;
})();
const CONS_KEYS = [...Object.keys(IAST_CONSONANT), ...Object.keys(ISO_CONSONANT)].sort((a, b) => b.length - a.length);
/** A5：IAST 輔音首碼碼點集（供 tokenizeIast 的 OM 詞首判定：前一碼點屬輔音則非 OM 詞首） */
const IAST_CONSONANT_START: Record<number, boolean> = (() => {
  const m: Record<number, boolean> = {};
  for (const k of Object.keys(IAST_CONSONANT)) m[k.codePointAt(0) ?? 0] = true;
  return m;
})();

/* ---------------- 元音 ---------------- */
// 普通元音（IAST 與 ISO 15919 共用獨立字母；ISO 15919 正規把 ए/ओ 寫作 ē/ō，本版採用正規寫法）
// prettier-ignore
const VOWEL_INDEP: Record<string, number> = {
  a: 0x0905, "ā": 0x0906, i: 0x0907, "ī": 0x0908, u: 0x0909, "ū": 0x090a,
  e: 0x090f, ai: 0x0910, o: 0x0913, au: 0x0914,
};
// prettier-ignore
const VOWEL_MATRA: Record<string, number> = {
  a: 0 /* 固有 a，不輸出 */, "ā": 0x093e, i: 0x093f, "ī": 0x0940, u: 0x0941, "ū": 0x0942,
  e: 0x0947, ai: 0x0948, o: 0x094b, au: 0x094c,
};
/**
 * 聲化元音（vocalic r / l）——IAST 與 ISO 15919 的**核心分歧**：
 *   IAST: ऋ ṛ / ॠ ṝ / ऌ ḷ / ॡ ḹ
 *   ISO : ऋ r̥ / ॠ r̥̄ / ऌ l̥ / ॡ l̥̄   （ISO 把 ṛ 保留給 ड़、ḷ 保留給 ळ）
 *
 * 【糾偏】獨立字母與 matra 的碼點**不在同一區間**，舊表錯把 U+090C/D/E
 * 當成 ṝ/ḷ/ḹ、把 U+0945/6 當成 ḷ/ḹ 的 matra（往返測試因「自洽」而無法發現，
 * 實爲錯映射；與參考實作 sanscript 逐條比對時暴露）。正確碼點（Unicode）：
 *   ऋ U+090B / ॠ U+0960 / ऌ U+090C / ॡ U+0961
 *   matra: ◌ृ U+0943 / ◌ॄ U+0944 / ◌ॢ U+0962 / ◌ॣ U+0963
 * （U+090D/E 實爲 ऍ/ऎ「candra e / short e」，U+0945/6 爲其 matra，皆非梵文音素。）
 */
const VOCALIC: Record<IndicMode, Record<string, number>> = {
  iast: { "ṛ": 0x090b, "ṝ": 0x0960, "ḷ": 0x090c, "ḹ": 0x0961 },
  iso: { "r̥": 0x090b, "r̥̄": 0x0960, "l̥": 0x090c, "l̥̄": 0x0961 },
};
const VOCALIC_MATRA: Record<IndicMode, Record<string, number>> = {
  iast: { "ṛ": 0x0943, "ṝ": 0x0944, "ḷ": 0x0962, "ḹ": 0x0963 },
  iso: { "r̥": 0x0943, "r̥̄": 0x0944, "l̥": 0x0962, "l̥̄": 0x0963 },
};
const VOWEL_INDEP_REV: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(VOWEL_INDEP)) if (v) m[v] = k;
  return m;
})();
const VOWEL_MATRA_REV: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(VOWEL_MATRA)) if (v) m[v] = k;
  return m;
})();
const VOCALIC_REV: Record<IndicMode, Record<number, string>> = {
  iast: rev(VOCALIC.iast),
  iso: rev(VOCALIC.iso),
};
const VOCALIC_MATRA_REV: Record<IndicMode, Record<number, string>> = {
  iast: rev(VOCALIC_MATRA.iast),
  iso: rev(VOCALIC_MATRA.iso),
};
function rev(t: Record<string, number>): Record<number, string> {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(t)) m[v] = k;
  return m;
}

function indepCode(key: string, mode: IndicMode): number | undefined {
  return VOWEL_INDEP[key] ?? VOCALIC[mode][key];
}
function matraCode(key: string, mode: IndicMode): number | undefined {
  const v = VOWEL_MATRA[key] ?? VOCALIC_MATRA[mode][key];
  return v || undefined; // a → 0（固有 a）視爲無
}
function indepRoman(c: number, mode: IndicMode): string | undefined {
  // ISO 15919 正規：ए→ē、ओ→ō（IAST 與輸入別名仍用 e/o）
  if (mode === "iso") {
    if (c === 0x090f) return "ē";
    if (c === 0x0913) return "ō";
  }
  return VOWEL_INDEP_REV[c] ?? VOCALIC_REV[mode][c];
}
function matraRoman(c: number, mode: IndicMode): string | undefined {
  // ISO 15919 正規：◌े→ē、◌ो→ō
  if (mode === "iso") {
    if (c === 0x0947) return "ē";
    if (c === 0x094b) return "ō";
  }
  return VOWEL_MATRA_REV[c] ?? VOCALIC_MATRA_REV[mode][c];
}

/* ---------------- 符號 ---------------- */
const CANDRABINDU = 0x0901; // ँ
const ANUSVARA = 0x0902; // ं
const VISARGA = 0x0903; // ः
const VIRAMA = 0x094d; // ्
const AVAGRAHA = 0x093d; // ऽ（分離符，梵文連聲省 a）

/** pali 模式的 niggahita 記號——回轉一律 ṃ（PTS/BJT 正字），
 *  與 sanskrit-iast 的 ṁ→ँ/ṃ→ं 分工對稱：pali-iast 不用 ṁ 出向（ṁ 僅作輸入別名），
 *  消除「ṁ→ं→ṃ」往返失真（romanToNative 收 ṁ/ṃ 等價，nativeToRoman 恆出 ṃ）。 */
const PALI_ANUS_ROMAN = { iast: "ṃ", iso: "ṃ" } as const;
const PALI_CANDRA_ROMAN = { iast: "m̐", iso: "m̐" } as const;

/** IAST：anusvāra→ṃ、candrabindu→ṁ；ISO 15919：anusvāra→ṁ、candrabindu→m̐（m + U+0310） */
const ANUS_ROMAN: Record<IndicMode, string> = { iast: "ṃ", iso: "ṁ" };
const CANDRA_ROMAN: Record<IndicMode, string> = { iast: "ṁ", iso: "m̐" };
const VISARGA_ROMAN = "ḥ";
const AVAGRAHA_ROMAN = "'";

/**
 * ISO 15919 嚴式鼻音化 / 巴利 niggahita sandhi：塞音 → 同組鼻音。
 * ṅ 前 k/kh/g/gh；ñ 前 c/ch/j/jh；ṇ 前 ṭ/ṭh/ḍ/ḍh；n 前 t/th/d/dh；m 前 p/ph/b/bh。
 */
// prettier-ignore
const CLASS_NASAL: Record<string, string> = {
  k: "ṅ", kh: "ṅ", g: "ṅ", gh: "ṅ",
  c: "ñ", ch: "ñ", j: "ñ", jh: "ñ",
  "ṭ": "ṇ", "ṭh": "ṇ", "ḍ": "ṇ", "ḍh": "ṇ",
  t: "n", th: "n", d: "n", dh: "n",
  p: "m", ph: "m", b: "m", bh: "m",
};

// 天城體數字
const DEVA_DIGITS: Record<number, string> = {
  0x0966: "0", 0x0967: "1", 0x0968: "2", 0x0969: "3", 0x096a: "4",
  0x096b: "5", 0x096c: "6", 0x096d: "7", 0x096e: "8", 0x096f: "9",
};
const ASCII_DIGITS: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const [k, v] of Object.entries(DEVA_DIGITS)) m[v] = Number(k);
  return m;
})();

/**
 * nukta 序列（基輔音＋U+093C）。CompositionExclusions.txt 明言
 * 0958..095B/095E 等「do not recompose during normalization」——NFC 後恆為分解形，
 * 舊版 093C 落透傳且前置輔音被補固有 a（實錘 क़्य → "ka़्ya"）。此表把
 * 「基輔音＋nukta」按 ISO 15919/IAST 慣例合併轉寫（R9：nukta 在 virama 之前）。
 */
const NUKTA_CONS_ROMAN: Record<number, string> = {
  0x0915: "q",   // क़ QA（0958）
  0x0916: "kh",  // ख़ KHHA（0959）
  0x0917: "gh",  // ग़ GHHA（095A）
  0x091B: "z",   // ज़ ZA（095B）
  0x0921: "ṛ",   // ड़ DDDHA（095C）＝ṛ（ISO 15919 規定；A4 糾偏，舊誤作 ḍh）
  0x0922: "ṛh",  // ढ़ RHA（095D）＝ṛh（ISO 15919 規定；A4 糾偏，舊用 U+1E5Bh 轉義拼法）
  0x092B: "f",   // फ़ FA（095E）
  0x092F: "y",   // य़ YYA（095F）
};

/**
 * 拉丁側 nukta 字母 → 「基輔音＋093C」分解序（規範形）。
 * ISO 15919：q kh gh z ṛ ṛh f y（ड़/ढ़ 按 ISO 15919 規定作 ṛ/ṛh；A4 糾偏）；
 * ITRANS 生態慣用 q/f/z 及 ḍh（ḍh→ड़ 輸入相容已由 NUKTA_LATIN 收錄）。
 */
const NUKTA_LATIN: Record<string, string> = {
  q: "\u0915\u093C",   // क़
  kh: "\u0916\u093C",  // ख़
  gh: "\u0917\u093C",  // ग़
  z: "\u091B\u093C",   // ज़
  "ṛ": "\u0921\u093C",  // ड़（ISO 15919 規定鍵；A4 糾偏，舊鍵 ḍh 與 ISO_CONSONANT 衝突）
  "ṛh": "\u0922\u093C", // ढ़（同上；A4 糾偏）
  f: "\u092B\u093C",   // फ़
  y: "\u092F\u093C",   // य़
};

/**
 * ITRANS 生態慣用 q/f/z 及 ḍh（ḍh→ड़ 輸入相容已由 NUKTA_LATIN 收錄）；ISO 15919 規定鍵 ṛ 已由 NUKTA_LATIN 收錄。
 */
function isConsonantDevanagari(c: number): boolean {
  // 主區間 U+0915–U+0939（क…ह，含 ळ U+0933）；外加 ISO 15919 補充輔音
  // ऱ U+0931 / ऴ U+0934 / ड़ U+095C / ढ़ U+095D（使 devanagariToIast 在
  // allowIso 時能正確轉出 ṟ/ḻ/ṛ/ṛh，而非靜默透傳殘碼）。
  return (c >= 0x0915 && c <= 0x0939) || c === 0x0931 || c === 0x0934 || c === 0x095c || c === 0x095d;
}
/** 獨立元音：U+0905–0914 之外，ॠ U+0960 / ॡ U+0961 亦屬之（見 VOCALIC 註） */
function isVowelIndep(c: number): boolean {
  return (c >= 0x0905 && c <= 0x0914) || c === 0x0960 || c === 0x0961;
}
/** 依存元音符號（matra）：U+093E–094C 之外，◌ॢ U+0962 / ◌ॣ U+0963 亦屬之 */
function isMatra(c: number): boolean {
  return (c >= 0x093e && c <= 0x094c) || c === 0x0962 || c === 0x0963;
}

/* ---------------- 分詞 ---------------- */
type Unit =
  | { t: "cons"; key: string }
  | { t: "nuktaCons"; key: string }
  | { t: "vowel"; key: string }
  | { t: "anus" }
  | { t: "visar" }
  | { t: "candra" }
  | { t: "avagraha" }
  | { t: "quote" }
  | { t: "om" }
  | { t: "esc"; cpValue: number }
  | { t: "other"; ch: string };

/**
 * \uXXXX 顯式標註解析（共用）。
 * 出向體例：統一 6 位大寫 hex（padStart(6)）——esc 後緊接 a-f 拉丁字母的歧義
 * 以「固定 6 位」消除（4/5 位變長體例下標註後接 a-f 開頭拉丁詞會被貪婪吞碼位）；
 * 入向規則：先試 6 位，無效回退 4 位。
 * 返回：解析成功回傳碼位；無匹配回傳 null。
 */
export function parseEscCp(rest: string): { cp: number; width: number } | null {
  // B2/r156：⟨U+XXXX⟩ 註記體例（roman 出向新慣例，translit-common escapeRomanCp）
  // ——與 esc 同樣原樣還原碼位；與 6/4 位 esc 同為顯式標註（舊 \uXXXX 輸入體例仍兼容）。
  const ann = ANN_RE.exec(rest);
  if (ann) {
    const v = parseInt(ann[1], 16);
    if (v <= 0x10FFFF) return { cp: v, width: ann[0].length };
  }
  let m = /^\\u([0-9A-Fa-f]{6})/.exec(rest);
  if (m) {
    // 出向統一 6 位（BMP 補零）——6 位值域不限 ≥0x10000（BMP 標註 000944 型），
    // 但須 ≤0x10FFFF 防崩潰。
    const v = parseInt(m[1], 16);
    if (v <= 0x10FFFF) return { cp: v, width: 8 };
  }
  m = /^\\u([0-9A-Fa-f]{4})/.exec(rest);
  if (m) return { cp: parseInt(m[1], 16), width: 6 };
  return null;
}

function tokenizeIast(text: string, mode: IndicMode, pali: boolean): Unit[] {
  // ISO 15919 正規把 ए/ओ 寫作 ē/ō（本版輸出採 IAST 風的 e/o，見文件頭）；
  // 爲與生態文本互通，輸入端把 ē/ō 視同 e/o。
  if (mode === "iso") text = text.replace(/ē/g, "e").replace(/ō/g, "o");
  const units: Unit[] = [];
  const allowIso = mode === "iso" || pali;
  // 聲化元音必須**先於**輔音匹配：ISO 15919 的 r̥ / l̥ 由「r/l + U+0325」組成，
  // 若先比對輔音會把 r̥ 拆成 र + ◌̥（實證：kr̥ṣṇa 錯成 क्र̥ष्ण）。
  const vocKeys = Object.keys(VOCALIC[mode])
    .filter((k) => !(pali && (k === "ḷ" || k === "ḹ")))
    .sort((a, b) => b.length - a.length);
  const plainVowelKeys = Object.keys(VOWEL_INDEP).sort((a, b) => b.length - a.length);
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let matched = false;
    // 聲化元音（IAST ṛ/ṝ/ḷ/ḹ；ISO r̥/r̥̄/l̥/l̥̄）
    for (const key of vocKeys) {
      if (rest.startsWith(key)) {
        units.push({ t: "vowel", key });
        i += key.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // 梵文組合隨鼻符「m + U+0303（組合長音符）/ m + U+0310（組合梵氣音符）」
    // ——以輔音字母 m 起首，必須**先於**輔音匹配，否則被拆成 म + ◌̃ 或 म् + ◌̃
    // （實證：m̃ → म्̃——virama U+094D 後掛組合符，渲染不成立；कँ → kam̐ → कम̐，
    // 隨鼻符錯落於 म 上）。直接映射：U+0303 → anusvāra ं、U+0310 → candrabindu ँ。
    // ISO 15919 的 candrabindu 本寫作 m̐（m + U+0310），梵文 IAST 語料亦見組合符寫法——
    // 兩模式（iast/iso）一律收。
    // A3：僅在「m 不屬死輔音（前一碼位非 U+0325/U+0331 組合短音符）」時才映射——
    // ISO 的聲化元音 r̥/l̥（r/l + U+0325）與 l̥̄ 尾的 U+0331 若被拆開，
    // 中間的 m 會被誤併成隨鼻符（rm̥̐ 類殘語料丟 virama 實錘）。此情境下
    // m 是普通輔音，交由下方輔音分支處理（組合符由「other」分支透傳）。
    if (text[i] === "m" && (text[i + 1] === "\u0303" || text[i + 1] === "\u0310")) {
      const prevCpM = i > 0 ? (text[i - 1].codePointAt(0) ?? 0) : 0;
      if (prevCpM !== 0x0325 && prevCpM !== 0x0331) {
        units.push({ t: text[i + 1] === "\u0303" ? "anus" : "candra" });
        i += 2;
        continue;
      }
    }
    // 輔音基底（最長匹配）
    for (const key of CONS_KEYS) {
      if (rest.startsWith(key)) {
        if (!IAST_CONSONANT[key] && !allowIso) break; // ISO 專用字母在非 ISO 且非巴利模式不收
        units.push({ t: "cons", key });
        i += key.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // nukta 字母 q/z/f/ṛh/gh/kh（ḍh）——ISO 15919/ITRANS 慣用，
    // 輸出「基輔音＋093C」分解序（CompositionExclusions 規範形）
    for (const key of Object.keys(NUKTA_LATIN).sort((a, b) => b.length - a.length)) {
      if (rest.startsWith(key)) {
        units.push({ t: "nuktaCons", key });
        i += key.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // OM 符號——必須**先於**普通元音匹配（否則 oṃ 的 o 被吃成
    // vowel o + anus ṃ 兩單元 → ओं 兩碼位，無法閉合到單碼位 ॐ）。
    // A5 糾偏：僅詞首（i===0）或前一字元非 IAST 輔音字母時才命中 OM 分支；
    // 輔音後的 oṃ（如 koṃ）是「o matra + anusvāra」，不得併成 ॐ（舊版 koṃ 錯成 क्ॐ）。
    const prevCp0 = i > 0 ? (text[i - 1].codePointAt(0) ?? 0) : 0;
    const prevIsCons0 = Object.prototype.hasOwnProperty.call(IAST_CONSONANT_START, prevCp0);
    if (text.startsWith("oṃ", i) && !prevIsCons0) { units.push({ t: "om" }); i += 2; continue; }
    // 普通元音（最長匹配，含單字符 a）
    for (const key of plainVowelKeys) {
      if (rest.startsWith(key)) {
        units.push({ t: "vowel", key });
        i += key.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // 符號
    const ch = text[i];
    // pali 下 ṁ/ṃ 等價入向（PTS 寫 ṃ、SuttaCentral/ISO 簡式寫 ṁ）——
    // pali-iso15919 舊版 iso 模式只認 ṁ，ṃ 輸入透傳成字面天城字母（saṃgha→'सṃघ' 實錘）。
    // 非 pali 的梵文 iso 仍嚴格 ṁ（ISO 15919：anusvāra=ṁ、candrabindu=m̐，二者有別）。
    if (ch === ANUS_ROMAN[mode] || (pali && (ch === "ṁ" || ch === "ṃ"))) {
      units.push({ t: "anus" });
      i++;
      continue;
    }
    if (ch === VISARGA_ROMAN) { units.push({ t: "visar" }); i++; continue; }
    if (mode === "iast" && (ch === CANDRA_ROMAN.iast || ch === "~")) { units.push({ t: "candra" }); i++; continue; }
    if (ch === AVAGRAHA_ROMAN) {
      // tokenizer 級配對偵測：從本撇號向後掃描至
      // 下一詞邊界（空白 / 句讀 / danda）之前，若存在另一個 '（'xxx' 包夾型）
      // → 本撇號是引號語義（開引號或閉引號，'mikṣatvam' ityasya 型），標記
      // quote 單元，正向輸出透傳字面撇號 '（不改 virama 判定——quote 型
      // 不抵消死輔音 virama）。無配對 ' 的真孤詞（'sti 型）維持 avagraha
      // 孤詞補 a（अ）路徑。連聲黏合（rāmo'sti，前文元音結尾）不受影響：
      // 配對偵測只在下游三態分流的「孤立/句讀後」分支覆蓋開引號情境，
      // 前文元音結尾的 ' 仍恆為連聲黏合（取舍：引號內 'rāmo' 型的開引號
      // 若緊貼前文元音，會被讀成連聲 ऽ——如實記錄，IAST 出版慣例引號外
      // 多有空白或句讀，實際語料極少命中）。
      // 配對掃描放寬詞邊界——GRETIL 引號包夾常是
      // 多詞詞組（'yuddhe pratiṣṭā paramārjunasya'），跨空格／連字號配對
      // 才能命中。放寬**僅限開引號情境**：本撇號孤立（字串開頭）或前實質
      // 字符為句讀/非字母時，掃描允許跨越空格、-、—、/，上限 300 字元
      // （防 O(n²) 與遠距誤配）。若前實質字符是字母（dharmo'bhi、rāmo 'sti
      // 的連聲/黏合情境），維持甲-2 的嚴格同詞邊界掃描——否則連聲 ' 會跨
      // 空格誤配後文引號成 quote 透傳（r41 金剛經第 27 對實錘回歸）。
      // 句讀級分隔（. , ; : ! ? |、換行）仍終止兩種掃描；真孤詞維持
      // avagraha 孤詞補 a（अ）路徑；前文元音結尾恆為連聲黏合的取捨不變。
      let j = i + 1;
      let paired = false;
      // 回看**緊貼**前字符與後一字符：兩側皆緊貼字母（dharmo'bhi、te'pi、
      // anāgate'dhvani 型詞內 sandhi 附著）→ 甲-2 嚴格同詞邊界掃描（avagraha
      // 語義，金剛經第 27 對實錘：跨空格會誤配後文引號成 quote 透傳）；
      // 其餘情境（前有空格的開引號、閉引號後接空白）→ 放寬掃描可跨空格 /
      // - / — / /（引號內部排版分隔）。判準用「緊貼」不跳空白：GRETIL 開引號
      // 前恆有空白（evaṃ 'yuddhe 型），緊貼與否即可乾淨分流兩情境。
      const afterLetter = /[\p{L}\p{M}]/u.test(text[i - 1] ?? "");
      const beforeLetter = /[\p{L}\p{M}]/u.test(text[i + 1] ?? "");
      const attachedSandhi = afterLetter && beforeLetter;
      const STOP = /[.,;:!?|\n\r\u2028\u2029]/; // 句讀級終止
      while (j < text.length && j - i <= 300) {
        const cj = text[j];
        if (cj === "'") { paired = true; break; }
        if (STOP.test(cj)) break;
        // attachedSandhi：任何空白或句讀即終止（甲-2 嚴格語義）；
        // 其餘情境（開引號）：僅句讀級終止，空格 / - / — / / 及字母皆可跨越
        if (attachedSandhi && /[\s.,;:!?|/—…-]/.test(cj)) break;
        j++;
      }
      units.push(paired ? { t: "quote" } : { t: "avagraha" });
      i++;
      continue;
    }
    // 大寫 OM/AUM 獨立詞（oṃ 小寫已在元音前命中）；|| 先於 | 匹配（防吃單豎）。
    if (text.startsWith("OM", i) || text.startsWith("AUM", i)) {
      units.push({ t: "om" });
      i += text.startsWith("OM", i) ? 2 : 3;
      continue;
    }
    // \uXXXX 標註 token（未收錄碼位的顯式標註；大小寫皆收，出向統一大寫十六進位）
    // B2/r156：⟨U+XXXX⟩ 註記（roman 出向新體例）同路徑——parseEscCp 已雙體例解析。
    {
      const esc = parseEscCp(text.slice(i));
      if (esc !== null) { units.push({ t: "esc", cpValue: esc.cp }); i += esc.width; continue; }
    }
    if (text.startsWith("||", i)) { units.push({ t: "other", ch: "||" }); i += 2; continue; }
    if (ch === "|") { units.push({ t: "other", ch: "|" }); i++; continue; }
    units.push({ t: "other", ch });
    i += ch.length;
  }
  return units;
}

/* ---------------- 羅馬 → 天城體 ---------------- */

/** IAST / ISO → 天城體 Devanagari（拼寫層，可無損往返） */
export function iastToDevanagari(input: string, opts?: IndicOptions): string {
  const mode = opts?.mode ?? "iast";
  const pali = !!opts?.pali;
  const allowIso = mode === "iso" || pali;
  const units = tokenizeIast(input, mode, pali);
  let out = "";
  let idx = 0;
  while (idx < units.length) {
    const u = units[idx];
    idx++;
    if (u.t === "esc") {
      // \uXXXX 標註還原（未收錄碼位的顯式標註，往返無損）
      out += cp(u.cpValue);
      continue;
    }
    if (u.t === "nuktaCons") {
      // nukta 字母輸出分解序；合字連接與死輔音 virama 同普通輔音
      out += NUKTA_LATIN[u.key] ?? "";
      while (idx < units.length && (units[idx].t === "cons" || units[idx].t === "nuktaCons")) {
        const nx = units[idx] as { t: "cons" | "nuktaCons"; key: string };
        out += cp(VIRAMA) + (nx.t === "nuktaCons" ? NUKTA_LATIN[nx.key] ?? "" : cp(consCode(nx.key, mode, allowIso) ?? 0));
        idx++;
      }
      let gotSuffix = false;
      const n = units[idx];
      if (n) {
        if (n.t === "vowel") {
          const m = matraCode(n.key, mode);
          if (m) out += cp(m);
          idx++;
          gotSuffix = true;
        } else if (n.t === "anus") { out += cp(VIRAMA) + cp(ANUSVARA); idx++; gotSuffix = true; }
        else if (n.t === "visar") { out += cp(VISARGA); idx++; gotSuffix = true; }
        else if (n.t === "candra") { out += cp(VIRAMA) + cp(CANDRABINDU); idx++; gotSuffix = true; }
        // A3：死輔音位收到 esc(candrabindu/anusvāra) 標註（同 cons 分支——
        // mm̐ 形出向殘碼；兩分支同構，改一處另一處照舊）。
        else if (n.t === "esc" && !gotSuffix &&
                 ((n as { cpValue: number }).cpValue === CANDRABINDU ||
                  (n as { cpValue: number }).cpValue === ANUSVARA ||
                  (n as { cpValue: number }).cpValue === VISARGA)) {
          const ecv2 = (n as { cpValue: number }).cpValue;
          out += cp(VIRAMA) + cp(ecv2); idx++; gotSuffix = true;
        }
        // 顯式 esc(virama)（出向無鍵合字前件對稱標註）——還原 virama 本體，
        // 並標記已承接尾碼（否則死輔音 !gotSuffix 分支再補一支 → 雙 virama 實錘）。
        else if (n.t === "esc" && (n as { cpValue: number }).cpValue === VIRAMA) { out += cp(VIRAMA); idx++; gotSuffix = true; }
      }
      if (!gotSuffix) {
        const n2 = units[idx];
        // quote（引號語義撇號）在死輔音後透傳——前輔音
        // 仍補 virama（त्वम्'），quote 型不抵消 virama（與連聲 avagraha 相反）。
        if (n2 && n2.t === "quote") { out += cp(VIRAMA) + "'"; idx++; }
        // 同 cons 死輔音規則——avagraha 僅連聲黏合型（前文元音結尾）
        // 抵消 virama；透傳字面撇號型不抵消。
        else if (!n2 || n2.t !== "avagraha" || !(isVowelIndep(out.codePointAt(out.length - 1) ?? 0) || isMatra(out.codePointAt(out.length - 1) ?? 0))) out += cp(VIRAMA);
      }
      continue;
    }
    if (u.t === "cons") {
      out += cp(consCode(u.key, mode, allowIso) ?? 0);
      // 合字：連續輔音之間插 virama，最後一個輔音承接後隨元音 / 符號
      while (idx < units.length && units[idx].t === "cons") {
        const nx = units[idx] as { t: "cons"; key: string };
        out += cp(VIRAMA) + cp(consCode(nx.key, mode, allowIso) ?? 0);
        idx++;
      }
      let gotSuffix = false;
      const n = units[idx];
      if (n) {
        if (n.t === "vowel") {
          const m = matraCode(n.key, mode);
          if (m) out += cp(m); // a → 固有 a，不輸出
          idx++;
          gotSuffix = true;
        } else if (n.t === "anus") { out += cp(VIRAMA) + cp(ANUSVARA); idx++; gotSuffix = true; }
        else if (n.t === "visar") { out += cp(VISARGA); idx++; gotSuffix = true; }
        else if (n.t === "candra") { out += cp(VIRAMA) + cp(CANDRABINDU); idx++; gotSuffix = true; }
        // A3：死輔音位收到 esc(candrabindu/anusvāra) 標註（mm̐ 形出向殘碼：
        // 該方案不表達 candrabindu → 出向 esc 保位，入向須在死輔音分支消費，
        // 補 virama ＋承接尾碼——不消費則頂層 esc 分支先輸出 ँ，死輔音再補
        // virama →「 virama 在 ँ 之後」順序反轉且丟死輔音語義（mm̐→मँ 實錘）。
        else if (n.t === "esc" && !gotSuffix &&
                 ((n as { cpValue: number }).cpValue === CANDRABINDU ||
                  (n as { cpValue: number }).cpValue === ANUSVARA ||
                  (n as { cpValue: number }).cpValue === VISARGA)) {
          const ecv = (n as { cpValue: number }).cpValue;
          out += cp(VIRAMA) + cp(ecv); idx++; gotSuffix = true;
        }
        // 顯式 esc(virama)——還原 virama 本體並標記已承接尾碼（雙 virama 防杜）
        else if (n.t === "esc" && (n as { cpValue: number }).cpValue === VIRAMA) { out += cp(VIRAMA); idx++; gotSuffix = true; }
      }
      // 詞尾輔音（其後無元音 / 尾附符號，即「死輔音」）補 virama：
      // bhagavat → भगवत्、arhat → अर्हत्。固有 a 一律顯式寫作 a（ka＝क、
      // k＝क्），故「無 a 的裸輔音」即死輔音，往返可還原。
      // 舊條件僅及「後接空白或字串結束」，致 भगवत्। 一類（virama 後接標點）
      // 的 virama 丟失；此處放寬爲「除 avagraha 外一律補」，avagraha 恆接
      // 元音（te'pi＝तेऽपि），不屬死輔音情境。
      // 巴利詞一律以元音或 niggahita 結尾，故此規則對巴利無影響。
      if (!gotSuffix) {
        const n2 = units[idx];
        // quote（引號語義撇號）在死輔音後透傳——前輔音
        // 仍補 virama（त्वम्'），quote 型不抵消 virama（與連聲 avagraha 相反）。
        if (n2 && n2.t === "quote") { out += cp(VIRAMA) + "'"; idx++; }
        // avagraha 僅在黏合成 ऽ（連聲型）時抵消死輔音 virama
        //（te'pi → तेऽपि）；透傳字面撇號（引號語義，tvam' ityādi 型）不抵消，
        // 前輔音仍須補 virama（त्वम्'），否則 virama 被吞（實錘 tvam' → त्वमऽ）。
        // 「下一單元是 avagraha 且前文以元音結尾」即連聲黏合型（與下方
        // iastToDevanagari 的 avagraha 三態分流同判準）。
        else if (!n2 || n2.t !== "avagraha" || !(isVowelIndep(out.codePointAt(out.length - 1) ?? 0) || isMatra(out.codePointAt(out.length - 1) ?? 0))) out += cp(VIRAMA);
      }
    } else if (u.t === "vowel") {
      out += cp(indepCode(u.key, mode) ?? 0);
    } else if (u.t === "anus") { out += cp(ANUSVARA); }
    else if (u.t === "visar") { out += cp(VISARGA); }
    else if (u.t === "candra") { out += cp(CANDRABINDU); }
    else if (u.t === "quote") {
      // tokenizer 配對偵測判定爲引號語義的撇號——
      // 恆透傳字面撇號 '。死輔音情境的 virama 已由上方 !gotSuffix 分支
      // 補出（त्वम्'，quote 型不抵消 virama）；元音後（閉引號 'rāmo' gacchati
      // 型）直接透傳，不併成 ऽ。
      out += "'";
    }
    else if (u.t === "avagraha") {
      // avagraha 語義決斷（三態分流）：
      //  ① 前文為元音（字母或 matra 碼位）結尾 → ऽ 黏合（rāmo 'sti 型連聲；
      //     IAST 排版的「空格+'」是拉丁側慣例，原生側無空格，黏合）。
      //  ② 前文為輔音碼位結尾 → 透傳字面撇號 '（引號語義，如 'mikṣatvam' ityasya
      //     的閉引號；前輔音已由死輔音規則補 virama，往返可還原 tvam'）。
      //  ③ 孤立（字串開頭）或句讀後 → 維持孤詞補 a（अ）路徑（'sti 型檢字表孤詞、
      //     句讀後真新詞）。判定前剝除排版空格，空白不算前詞完結。
      // 非連聲情境（「'」後非輔音，如檢字表獨立 .a / 詞尾 .a）維持 ऽ 正字形。
      const nx = units[idx];
      const nextIsCons = !!nx && nx.t === "cons";
      const trimmed = out.replace(/ +$/, "");
      const trimmedCps = Array.from(trimmed);
      // 死輔音 virama（U+094D）屬「輔音字群結尾」——跳過 virama 回看其前碼位
      const lastCpRaw = trimmedCps.length ? (trimmedCps[trimmedCps.length - 1].codePointAt(0) ?? 0) : 0;
      const prevCp = trimmedCps.length >= 2 ? (trimmedCps[trimmedCps.length - 2].codePointAt(0) ?? 0) : 0;
      const lastCp = lastCpRaw === 0x094d ? prevCp : lastCpRaw;
      if (isConsonantDevanagari(lastCp)) {
        // 輔音後恆透傳字面撇號（引號語義）——閉引號 'mikṣatvam' 後多接空白
        //（nextIsCons=false），故輔音判準必須先於 nextIsCons 判準；
        // 梵文正字法 ऽ 恆接元音（連聲省 a），輔音後的 ' 不可能是 avagraha。
        out += "'"; // 透傳字面撇號；前輔音已由死輔音規則補 virama（त्वम्'）。
      } else if (nextIsCons && (isVowelIndep(lastCp) || isMatra(lastCp))) {
        out += cp(AVAGRAHA); // ऽ：黏前詞尾（rāmo 'sti 型，含空格+' 排版）
      } else if (!nextIsCons) {
        out += cp(AVAGRAHA); // ऽ 正字形（非「'+輔音」情境：檢字表獨立 '、詞尾 '）
      } else {
        out += cp(0x0905); // अ：孤立（無前文）/ 句讀後＝真新詞（孤詞補 a）
      }
    }
    else {
      if (u.t === "om") { out += cp(0x0950); continue; } // oṃ/OM/AUM → ॐ
      // IAST 排版句讀還原（|| 先判，防單豎吃雙豎）
      // danda 緊貼前詞輸出（`यै॥`）——IAST 出版慣例
      // 的 `yai ||` 前置空格屬拉丁側排版，原生側慣例無空格，吞掉 danda 前空格；
      // 但前文已是 danda（`|| śrīḥ ||` 呼號型，`॥ श्रीः ॥`）時空格是語義分隔，保留。
      if (u.t === "other" && (u.ch === "||" || u.ch === "|")) {
        const lastCp = out.codePointAt(out.length - 1) ?? 0;
        if (out.endsWith(" ") && lastCp !== 0x0964 && lastCp !== 0x0965) out = out.slice(0, -1);
        out += cp(u.ch === "||" ? 0x0965 : 0x0964); continue;
      }
      const d = ASCII_DIGITS[u.ch];
      out += d ? cp(Number(d)) : u.ch;
    }
  }
  return out;
}

/* ---------------- 天城體 → 羅馬 ---------------- */

/** 天城體 Devanagari → IAST / ISO 15919 */
export function devanagariToIast(input: string, opts?: IndicOptions): string {
  const mode = opts?.mode ?? "iast";
  // pali 回轉預設**不**嚴式——巴利 PTS/BJT 正字 anusvāra 一律寫 ṃ/ṁ，
  // 不做同部位鼻音區分；回轉嚴式（ं+प→m）會丟失 ṃ 記號破壞往返（bilara-data
  // 破壞往返 612 條）。嚴式鼻音化屬梵文/ISO 15919 場景（nasalAfter 僅存在回轉方向，
  // pali-iso15919 回轉保留嚴式）。
  const strictNasal = opts?.strictNasal ?? (mode === "iso" && !!opts?.pali);
  const pali = !!opts?.pali;
  const allowIso = mode === "iso" || pali;
  let out = "";
  // 單碼位 nukta 字母（0958/095B/095E：qa/za/fa）預分解為「基輔音＋093C」——
  // CompositionExclusions 保證 NFC 不重組，分解序才是規範形；統一入口後走
  // NUKTA_CONS_ROMAN 合併分支。
  // f2-B：0959/095A/095F（KHHA/GHHA/YYA）**不入**本預分解——其拉丁鍵 kh/gh/y
  // 與基輔音鍵完全同形（kha→ख、gha→ग、ya→य），併流出向後往返必丟 nukta
  // （0959→"kha"→ख 實錘）。改走與 0929/0931/0934 同構的 \uXXXX esc 標註路徑：
  // 落入 0915–0939 輔音區間但 NUKTA_CONS_ROMAN 不再收其鍵 → consRoman 查無鍵？
  // 不——三碼位本身在輔音區間內，須在輔音分支前**顯式攔截**輸出 esc 標註
  //（見下方 f2-B 分支），入向 parseEscCp 原樣還原，往返無損。
  input = input
    .replace(/[\u0958\u095B\u095E]/g, (ch) => {
      const base: Record<string, string> = {
        "\u0958": "\u0915",
        "\u095B": "\u091B", "\u095E": "\u092B",
      };
      return base[ch] + "\u093C";
    })
    .normalize("NFC");
  const cps = Array.from(input);
  let i = 0;
  while (i < cps.length) {
    const ch = cps[i];
    const c = ch.codePointAt(0) ?? 0;
    if (c === AVAGRAHA) { out += AVAGRAHA_ROMAN; i++; continue; }
    // OM 符號（ॐ）與句讀——舊版無分支透傳殘留（bhagavadgīte
    // 語料 ॐ/।/॥ 殘留）。IAST 學界慣例 oṃ；句讀 ASCII | / ||（ISO 15919 同此）。
    if (c === 0x0950) { out += "oṃ"; i++; continue; }
    // 吠陀聲調 0951 UDATTA / 0952 ANUDATTA——spec 明言拉丁轉寫
    // 「should simply use the generic combining marks U+0300/U+0301」（0953/0954
    // 已 discouraged；0951/0952 同理映射通用組合符，不透傳殘碼）
    if (c === 0x0951) { out += "\u0301"; i++; continue; }
    if (c === 0x0952) { out += "\u0300"; i++; continue; }
    // IAST 出版慣例 danda 前有空格（`yai ||`）——
    // 前字符為字母（含變音符）才補空格；數字/標點（`॥१॥` 型）緊貼；行首不補。
    if (c === 0x0964 || c === 0x0965) {
      const prev = out.slice(-1);
      if (prev && /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(prev)) out += " ";
      out += c === 0x0965 ? "||" : "|"; i++; continue;
    }
    if (isVowelIndep(c)) {
      // 區段內已收錄與未收錄以 indepRoman 命中與否分流——無鍵者 \uXXXX 顯式標註（全拉丁化）
      out += indepRoman(c, mode) ?? escapeRomanCp(c);
      i++;
    } else if (isConsonantDevanagari(c)) {
      const consMissing = consRoman(c, mode, allowIso) === undefined;
      const base = consMissing ? escapeRomanCp(c) : consRoman(c, mode, allowIso);
      const nxt = i + 1 < cps.length ? cps[i + 1] : "";
      const nc = nxt.codePointAt(0) ?? 0;
      // f2-B：0959/095A/095F（KHHA/GHHA/YYA）顯式 esc 標註——其 nukta 形無法與
      // 基輔音鍵區分（kh/gh/y 同形），併流出向必丟 nukta（0959→"kha"→ख 實錘）。
      // 與 0929/0931/0934 同構走 \uXXXX 標註路徑（入向 parseEscCp 原樣還原），
      // 整段 esc（含後續 matra/bindu 接續）一次標註到碼位層，往返無損。
      // 注意：0959/095A/095F 是組合排除碼位（NFC 分解為 0916/0917/092F＋093C），
      // 故本分支檢測的是**分解形**「基輔音＋093C」對（c 即基輔音碼位）。
      if (
        nc === 0x093c &&
        (c === 0x0916 || c === 0x0917 || c === 0x092f)
      ) {
        // 還原為原單碼位（0916→0959、0917→095A、092F→095F）輸出 esc 標註
        const orig = c === 0x0916 ? 0x0959 : c === 0x0917 ? 0x095A : 0x095F;
        out += escapeRomanCp(orig);
        i += 2;
        continue;
      }
      // 基輔音＋nukta → 合併轉寫（NFC 分解形；見 NUKTA_CONS_ROMAN）
      if (nc === 0x093c && NUKTA_CONS_ROMAN[c]) {
        // nukta 之後可能跟 virama（R9 序）/matra/bindu，與普通輔音同一套接續處理：
        // 把合併後的羅馬音當 base，跳過 nukta，交由後續分支處理 nxt+1。
        const nuktaMissing = NUKTA_CONS_ROMAN[c] === undefined;
        const merged = NUKTA_CONS_ROMAN[c] ?? escapeRomanCp(c);
        const nn = i + 2 < cps.length ? cps[i + 2] : "";
        const nnc = nn.codePointAt(0) ?? 0;
        if (nnc === VIRAMA) { out += merged; i += 3; continue; }
        if (isMatra(nnc)) { out += merged + (matraRoman(nnc, mode) ?? nn); i += 3; continue; }
        if (nnc === ANUSVARA) { out += merged + (nuktaMissing ? "" : "a") + (nuktaMissing ? "" : nasalAfter(cps, i + 3, mode, strictNasal, pali)); i += 3; continue; }
        if (nnc === VISARGA) { out += merged + (nuktaMissing ? "" : "a" + VISARGA_ROMAN); i += 3; continue; }
        if (nnc === CANDRABINDU) { out += merged + (nuktaMissing ? "" : "a" + (pali ? PALI_CANDRA_ROMAN[mode] : CANDRA_ROMAN[mode])); i += 3; continue; }
        out += merged + (nuktaMissing ? "" : "a"); i += 3; continue;
      }
      if (nc === VIRAMA) {
        // 合字前件：不帶 a（virama 由後一輔音承接）
        // 基輔音無鍵時 virama 亦 esc 保位——入向 esc(virama) 抑制後輔音固有 a
        // 後一輔音亦無鍵時（k्ऩ 型）——若 virama 不顯式輸出，入向 k 會補固有 a（कऩ 實錘）
        const nxtCons = i + 2 < cps.length ? cps[i + 2].codePointAt(0) ?? 0 : 0;
        const nxtMissing = isConsonantDevanagari(nxtCons) && consRoman(nxtCons, mode, allowIso) === undefined;
        out += base + ((consMissing || nxtMissing) ? escapeRomanCp(nc) : "");
        i += 2;
      } else if (isMatra(nc)) {
        // 該方案不表達的 matra：原樣保留爲殘碼（而非靜默丟棄），使呼叫端
        // 與測試能分辨「方案本不表達」與「轉寫 bug」。
        // 基輔音無鍵（consMissing＝base 已 esc）時，matra 失去宿主——
        // matraRoman 附標鍵入向會被獨立元音化，故一併 esc 保位（連續 esc 入向逐碼位還原）。
        out += base + (consMissing ? escapeRomanCp(nc) : (matraRoman(nc, mode) ?? nxt));
        i += 2;
      } else if (nc === ANUSVARA) {
        // anusvāra 是音節「尾加成分」，**不取消**固有 a（舊版漏了 a → sṃgha / buddhṃ）
        out += base + (consMissing ? escapeRomanCp(nc) : "a" + nasalAfter(cps, i + 2, mode, strictNasal, pali));
        i += 2;
      } else if (nc === VISARGA) {
        out += base + (consMissing ? escapeRomanCp(nc) : "a" + VISARGA_ROMAN);
        i += 2;
      } else if (nc === CANDRABINDU) {
        out += base + (consMissing ? escapeRomanCp(nc) : "a" + (pali ? PALI_CANDRA_ROMAN[mode] : CANDRA_ROMAN[mode]));
        i += 2;
      } else {
        out += base + (consMissing ? "" : "a"); // 固有 a
        i++;
      }
    } else if (c === ANUSVARA) {
      // pali 回轉恆用 ṃ；梵文嚴式仍在 nasalAfter 內分流
      out += pali ? PALI_ANUS_ROMAN[mode] : nasalAfter(cps, i + 1, mode, strictNasal);
      i++;
    } else if (c === VISARGA) { out += VISARGA_ROMAN; i++; }
    else if (c === CANDRABINDU) { out += pali ? PALI_CANDRA_ROMAN[mode] : CANDRA_ROMAN[mode]; i++; }
    else if (c >= 0x0966 && c <= 0x096f) { out += DEVA_DIGITS[c]; i++; }
    else if ((c >= 0x0900 && c <= 0x097f) || (c >= 0x1cd0 && c <= 0x1cff) || (c >= 0xa8e0 && c <= 0xa8ff)) {
      // 天城/吠陀區段未收錄碼位 → \uXXXX 顯式標註（符號清單輸入不再殘留原文字符，
      // 往返無損；已收錄碼位均於上方分支消費，落此者即無鍵字符）
      out += escapeRomanCp(c);
      i++;
    }
    else { out += ch; i++; }
  }
  return out;
}

/* ---------------- 轉寫歧義偵測（面板備選用） ---------------- */

/** 歧義類別（決定面板備選標籤與啓用範圍）；zh＝維吾爾 ULY z+h 二合固有歧義；apos＝維吾爾 n+g+h 三音素隔音撇號寫法歧義 */
export type TranslitAmbiguityKind =
  | "aspirated" | "nasal" | "vocalic" | "zh" | "apos"
  // H 類：UEY → ULY 方向、詞中 0647+ئ 結構——
  // 0647 可讀輔音 h（後接音節 i）或元音 ë＋隔音（zë'ipu 型）。
  | "heh"
  // M 類：蒙古文學術拉丁 → 原生方向的三類兩讀——
  // lh（藏語借詞 LHA vs 漢語借詞 LA+HAA）、ng（規範 ᠩ vs 舊式 ᠨᠭ）、
  // galik（Galik 同形碼位 x=KHA/SHA、z=ZA/TSA）。
  | "mnglLha" | "mnglNg" | "mnglGalik"
  // r50e：Ali Gali 同音碼位（ḥ×4/c×3/d×3/i/u/y/ṭ/t/ṣ/zh/z 各 2）反向取樣——
  // 正字（正字序第一，21244 體例）vs Todo/AG 專碼位（字典形），面板按鈕逐位選擇。
  | "agHomophone"
  // K 類：Kharoshthi CAUDA（U+10A39） roman 反查主鍵二選一——
  // 校勘記號 ⟒（引擎慣例）vs 辭典轉寫慣例 ̱（U+0331，Las̱a/Bhag̱arka 實證）。
  | "kharoCauda"
  // Z 類：Zanabazar 鼻音符號併碼——11A35 CANDRABINDU（預設）vs
  // 11A38 ANUSVARA，藏文 Wylie 慣例均寫 ṃ，roman→native 入向二選一。
  | "zanabNasal"
  // B2 類：nukta 基輔音兩讀——基輔音（kh→ख）可另讀 nukta 形（kh→ख़）；
  // 羅馬字面 kh 無法區分二形，交由用戶選擇（enableNukta 啓用）。
  | "nukta"
  // W 類：藏文 Wylie 拼式歧義——同一藏文音節有多個自洽往返的 Wylie 拼式
  // （སངस sangs/sngas、དགེ dge/deg 型），出向引擎按「結構最簡」打分選一；
  // 拼式面按鈕讓用戶改選次優讀法（字串級替換 roman 輸出）。
  | "tibSpelling";

export interface TranslitAmbiguity {
  /** 在原生輸出（按碼點）中的位置索引 */
  index: number;
  /** 歧義類別 */
  kind: TranslitAmbiguityKind;
  /** 預設解讀（單一字元，或送氣單輔音） */
  primary: string;
  /** 替代解讀（基輔音＋virama＋ha 合字，或鼻音符號互換，或捩舌輔音） */
  alternative: string;
  /** r50e：N 選一全候選（agHomophone 用；variants[0]＝primary、variants[n]＝choice n；
   *  未設時＝傳統二選一（primary/alternative）） */
  variants?: string[];
  /** 人類可讀說明（中文） */
  note: string;
}

/**
 * A 類：送氣單輔音 → 基輔音（用於「送氣單輔音 vs 基輔音＋ha 合字」歧義備選）。
 * 梵文每個送氣輔音既有專用碼點（如 ख U+0916 kha），也可寫成「基輔音 + virama + ha」
 * （क्ह）的合字；兩者在羅馬字下都轉寫為同一串（如 kha），故 roman→native 本質有歧義。
 * 這類歧義貫穿全部八套梵文方案（轉寫層級固有，非引擎 bug），應交由使用者在面板選擇，
 * 而非由引擎擅自擇一。
 */
export const ASPIRATED_TO_BASE: Readonly<Record<number, number>> = {
  0x0916: 0x0915, // ख kha → क
  0x0918: 0x0917, // घ gha → ग
  0x091b: 0x091a, // छ cha → च
  0x091d: 0x091c, // झ jha → ज
  0x0920: 0x091f, // ठ ṭha → ट
  0x0922: 0x0921, // ढ ḍha → ड
  0x0925: 0x0924, // थ tha → त
  0x0927: 0x0926, // ध dha → द
  0x092b: 0x092a, // फ pha → प
  0x092d: 0x092c, // भ bha → ब（BA；舊值 0x092b 誤作 pha，經 unicodedata 驗證修正）
};

/**
 * N 類：anusvāra ⇄ candrabindu 互換（鼻音符號歧義）。
 * 兩者在天城體是不同碼點（ं U+0902 / ँ U+0901），羅馬字也通常是不同 token
 * （IAST ṃ/ṁ、HK M/~、ITRANS M/.N、WX M/z…），但真實文獻常以同一字形（ṁ 或 ~）
 * 同時表示二者，故 roman→native 時二者可互讀，應交由用戶選擇。
 */
const NASAL_PAIR: ReadonlyArray<[number, number]> = [
  [ANUSVARA, CANDRABINDU], // ं ⇄ ँ
];

/**
 * V 類：聲化元音 ⇄ 捩舌輔音（ISO 15919 / 巴利下「同音兩形」歧義）。
 *  - ऋ(U+090B, ISO r̥ 聲化 r) ⇄ ड़(U+095C, ISO ṛ 捩舌 r)
 *  - ऌ(U+090C, ISO l̥ 聲化 l) ⇄ ळ(U+0933, ISO ḷ 捩舌 l)
 * 二者在 ISO 15919 下都讀近「r / l」，僅書寫層（聲化 vs 輔音）不同；用戶貼入
 * 羅馬字時常混淆，故 roman→native 應交由面板選擇。
 * 此類僅在「能表達捩舌輔音」的方案啓用（ISO 15919 與巴利 IAST/ISO；
 * 純 IAST 不表達 ड़/ढ़/ळ，故不啓用，避免給出該方案無法輸出的備選）。
 */
const VOCALIC_RETROFLEX: Readonly<Record<number, number>> = {
  0x090b: 0x095c, // ऋ → ड़
  0x090c: 0x0933, // ऌ → ळ
  0x095c: 0x090b, // ड़ → ऋ
  0x0933: 0x090c, // ळ → ऌ
};

export interface DetectAmbiguityOptions {
  /** 是否啓用 V 類（聲化元音 ⇄ 捩舌輔音）。預設 false。 */
  enableVocalic?: boolean;
  /** 是否啓用 P 類（維吾爾 n+g+h 隔音撇號寫法）。預設 false。 */
  enableApos?: boolean;
  /** 是否啓用 B2 類（nukta 基輔音 kh→ख/ख़ 兩讀）。預設 false（避免污染純梵文文本）。 */
  enableNukta?: boolean;
}

/**
 * B2 類：nukta 可附基輔音集——基輔音 ⇄ 基輔音＋U+093C（nukta）兩讀。
 * NUKTA_CONS_ROMAN 的 kh/gh 與基輔音同串（舊 ḍh 同理），出向羅馬字不可區分
 * nukta 形，故以歧義提示補償（kh→क/ख़ 兩選）。
 */
const NUKTA_AMBIG_BASE: ReadonlyArray<number> = [
  0x0915, // क ⇄ क़
  0x0916, // ख ⇄ ख़
  0x0917, // ग ⇄ ग़
  0x091b, // ज ⇄ ज़
  0x0921, // ड ⇄ ड़
  0x0922, // ढ ⇄ ढ़
  0x092b, // फ ⇄ फ़
  0x092f, // य ⇄ य़
];

/**
 * P 類偵測：ULY 輸出中的 `g'` + `h` 雙隔音（n+g+h 三音素，
 * 如 rokkin'g'ham）提供「詞典規範 n'gh」備選。雙撇號是唯一往返無損拼寫
 * （單撇號 n'gh 正向被讀成 n+gh 二合丟 ھ），但辭典 R[2] 用規範化單撇號
 * 拼寫——用戶核對辭典條目時字面一致更直观，故交由用戶逐詞選擇。
 * 觸發範圍嚴格限定：僅 ULY 文本含 `g'h`（撇號-g-撇號後接 h）時，誤報面為零。
 */
export function detectUyghurAposAmbiguities(ulyText: string): TranslitAmbiguity[] {
  const out: TranslitAmbiguity[] = [];
  const cps = Array.from(ulyText);
  for (let i = 0; i < cps.length - 2; i++) {
    if (cps[i] === "g" && cps[i + 1] === "'" && cps[i + 2] === "h") {
      out.push({
        index: i, kind: "apos",
        primary: "g'h",
        alternative: "gh",
        note: "n+g+h 三音素：rokkin'g'ham（雙撇號，往返無損）也可寫成詞典規範 rokkin'gham（單撇號；單獨轉回 UEY 會丟 ھ）",
      });
      i += 2;
    }
  }
  return out;
}

/**
 * 掃描「羅馬字 → 原生文字」的輸出，標出三類可作兩讀的位置：
 *  - aspirated：送氣單輔音 / 基輔音＋ha 合字（全部八套）
 *  - nasal：anusvāra / candrabindu（全部八套）
 *  - vocalic：聲化元音 / 捩舌輔音（僅 ISO 15919 與巴利，enableVocalic）
 * @returns 每個歧義位置一筆（含 kind / primary / alternative 三種原生寫法）
 */
export function detectRomanToNativeAmbiguities(
  nativeText: string,
  opts: DetectAmbiguityOptions = {},
): TranslitAmbiguity[] {
  const enableVocalic = !!opts.enableVocalic;
  const enableNukta = !!opts.enableNukta;
  const cps = Array.from(nativeText);
  const out: TranslitAmbiguity[] = [];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i].codePointAt(0) ?? 0;
    // Z 類：維吾爾 ULY z+h 二合（ژ，U+0698）。zh 輸入既可讀合讀音素 ژ（借詞
    // zhurnal/tamozhna），也可讀 z+h 兩音素（阿拉伯-波斯詞源 izhar/mezhep）——
    // ULY 字面不可判別（語料學實證見 docs/UYGHUR-UEY-ULY-VERIFY.md）。
    // 僅在輸入含維吾爾 UEY（阿拉伯字母區）時啓用，避免污染其他文種輸出。
    if (c === 0x0698 && /[\u0600-\u06FF]/.test(nativeText) && cps.some((x) => x !== "ژ" && /[\u0620-\u064A\u0660-\u066F\u066E-\u06D3]/.test(x))) {
      out.push({
        index: i, kind: "zh", primary: cps[i],
        alternative: "ز\u06BE", // z（U+0632）＋ h（U+06BE）
        note: `維吾爾 zh 二合：${cps[i]}（ژ 合讀）也可寫成 زھ（z+h 兩音素，如 izhar/mezhep 型）`,
      });
      continue;
    }
    // B2 類：nukta 基輔音兩讀（enableNukta 啓用；先於 A 類，使 kh→ख/ख़ 可兩選）
    if (enableNukta && NUKTA_AMBIG_BASE.includes(c)) {
      out.push({
        index: i, kind: "nukta", primary: cps[i],
        alternative: cps[i] + "\u093C",
        note: `nukta 兩讀：${cps[i]}（基輔音）也可寫成 ${cps[i]}\u093C（nukta 形，如 kh→ख/ख़）`,
      });
      continue;
    }
    // A 類：送氣單輔音
    const base = ASPIRATED_TO_BASE[c];
    if (base !== undefined) {
      out.push({
        index: i, kind: "aspirated", primary: cps[i],
        alternative: String.fromCodePoint(base) + String.fromCodePoint(VIRAMA) + String.fromCodePoint(0x0939),
        note: `送氣單輔音 ${cps[i]} 也可寫成基輔音＋ha 合字`,
      });
      continue;
    }
    // N 類：鼻音符號互換
    const nasalAlt = NASAL_PAIR.find(([a, b]) => a === c || b === c);
    if (nasalAlt) {
      const alt = nasalAlt[0] === c ? nasalAlt[1] : nasalAlt[0];
      out.push({
        index: i, kind: "nasal", primary: cps[i], alternative: String.fromCodePoint(alt),
        note: `鼻音符號 ${cps[i]} 也可寫成 ${String.fromCodePoint(alt)}（anusvāra ⇄ candrabindu）`,
      });
      continue;
    }
    // V 類：聲化元音 ⇄ 捩舌輔音（僅 ISO 15919 / 巴利）
    if (enableVocalic) {
      const vAlt = VOCALIC_RETROFLEX[c];
      if (vAlt !== undefined) {
        out.push({
          index: i, kind: "vocalic", primary: cps[i], alternative: String.fromCodePoint(vAlt),
          note: `聲化元音 / 捩舌輔音 ${cps[i]} 在 ISO·巴利下也可寫成 ${String.fromCodePoint(vAlt)}`,
        });
        continue;
      }
    }
  }
  return out;
}

/**
 * M 類：蒙古文學術拉丁 → 原生方向的三類兩讀。
 * 僅在輸出含蒙古文區段（U+1800–U+18AF）時掃描，避免污染其他文種：
 *  - mnglLha：`lh` token 輸出 LHA(U+1840)——藏語 ལྷ 借詞專用字母，但漢語借詞
 *    （ᠯᠾᠬᠠᠪᠠ 型，語料實證）應寫 LA(U+182F)+HAA(U+183E) 兩字母；
 *  - mnglNg：規範 ANG(U+1829) 亦可寫舊式 NA+GA 兩字母（r29 語料 23/5501 詞實證並存）；
 *  - mnglGalik：Galik 同形碼位 x=KHA(U+183B，亦可讀 SHA)/z=ZA(U+183D，亦可讀 TSA)。
 * @returns 每個歧義位置一筆（primary＝規範/預設寫法，alternative＝備選寫法）
 */
export function detectMongolianAmbiguities(nativeText: string): TranslitAmbiguity[] {
  if (!/[\u1800-\u18AF]/.test(nativeText)) return [];
  const cps = Array.from(nativeText);
  const out: TranslitAmbiguity[] = [];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i].codePointAt(0) ?? 0;
    if (c === 0x1840) {
      out.push({
        index: i, kind: "mnglLha", primary: cps[i],
        alternative: String.fromCodePoint(0x182f) + String.fromCodePoint(0x183e),
        note: "LHA（藏語借詞 ལྷ 專用字母，如 lhasa）也可寫成 LA+HAA 兩字母（漢語借詞，如 ᠯᠾᠬᠠᠪᠠ 型）",
      });
    } else if (c === 0x1829) {
      out.push({
        index: i, kind: "mnglNg", primary: cps[i],
        alternative: String.fromCodePoint(0x1828) + String.fromCodePoint(0x182d),
        note: "規範 ᠩ（ng 連寫）也可寫成舊式 ᠨᠭ 兩字母（r29 長文語料實證並存）",
      });
    } else if (c === 0x183b || c === 0x183d) {
      const reading = c === 0x183b ? "KHA" : "ZA";
      const altReading = c === 0x183b ? "SHA" : "TSA";
      const altCp = c === 0x183b ? 0x1831 : 0x183c;
      out.push({
        index: i, kind: "mnglGalik", primary: cps[i],
        alternative: String.fromCodePoint(altCp),
        note: `Galik 同形：此碼位學術讀 ${reading}，蒙科立傳統亦可讀 ${altReading}`,
      });
    }
  }
  return out;
}

/**
 * K 類：Kharoshthi CAUDA（U+10A39）roman 反查主鍵選擇。
 * KHARO_SIGNS 有兩個正向鍵（⟒ 校勘記號 / ̱ 辭典慣例 U+0331）都映射 10A39，
 * 但 nativeToRoman 反查只出先到鍵 ⟒——用辭典慣例鍵入的文本往返後拼法改變。
 * 僅在輸出含 Kharoshthi 區段（U+10A00–10A5F）時掃描。
 * primary＝⟒（引擎現狀）；alternative＝̱（辭典慣例，往返閉環）。
 */
export function detectKharoshthiCaudaAmbiguities(romanOut: string): TranslitAmbiguity[] {
  // 輸入是 native→roman 方向的羅馬字輸出。實測：REV_SIGNS 反查 10A39 出
  // ̱（U+0331 辭典慣例鍵）——primary＝̱（現狀，往返閉環）；alternative＝⟒
  // （校勘記號鍵，用戶鍵入 ⟒ 者可保拼法一致）。
  if (!romanOut.includes("\u0331")) return []; // primary ̱ 現狀
  const cps = Array.from(romanOut);
  const out: TranslitAmbiguity[] = [];
  for (let i = 0; i < cps.length; i++) {
    if (cps[i] === "\u0331") {
      out.push({
        index: i, kind: "kharoCauda", primary: cps[i],
        alternative: "\u27d2", // ⟒(U+27D2) 校勘記號鍵——注意非 U+2792，相似字元視覺陷阱
        note: "CAUDA（10A39）羅馬字鍵：̱（辭典轉寫慣例，現狀預設）或 ⟒（校勘記號）——選擇影響羅馬字輸出拼法",
      });
    }
  }
  return out;
}

/**
 * Z 類：Zanabazar 鼻音符號併碼入向選擇。
 * 11A35 CANDRABINDU 與 11A38 ANUSVARA 藏文 Wylie 慣例均寫 ṃ；r44 出向統一併 ṃ，
 * 入向只能歸 11A35（11A38 無法還原，碼位級往返有損）。
 * 僅在輸出含 Zanabazar 區段（U+11A00–11A4F）時掃描 roman 源中的 ṃ。
 * primary＝11A35（現狀）；alternative＝11A38（原生輸出端替換，即 native→native 碼位改寫）。
 * 注意：此類偵測輸入是「roman 源文本」（toNative 方向的 src），輸出的 index 對齊
 * 轉寫後 native 輸出的碼點序——由呼叫端逐 ṃ 計數對位。
 */
export function detectZanabazarNasalAmbiguities(romanSrc: string, nativeOut: string): TranslitAmbiguity[] {
  // 注意：regex \u 固定 4 位 hex——5 位（\u11A4F）會靜默錯位。
  // 門控改碼點比較。
  const inZb = Array.from(nativeOut).some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return c >= 0x11a00 && c <= 0x11a4f;
  });
  if (!inZb) return [];
  if (!romanSrc.includes("\u1E43")) return []; // ṃ
  const cps = Array.from(nativeOut);
  const out: TranslitAmbiguity[] = [];
  // nativeOut 中 11A35（出向併碼結果）逐個提供 11A38 備選
  for (let i = 0; i < cps.length; i++) {
    if ((cps[i].codePointAt(0) ?? 0) === 0x11a35) {
      out.push({
        index: i, kind: "zanabNasal", primary: cps[i],
        alternative: String.fromCodePoint(0x11a38),
        note: "鼻音符號：11A35 CANDRABINDU（sna ldan，預設）或 11A38 ANUSVARA——藏文 Wylie 慣例均寫 ṃ，請擇一",
      });
    }
  }
  return out;
}

/**
 * G 類（r50e）：Ali Gali 同音碼位反向取樣。
 * 同一 IAST 值多碼位（ḥ×4/c×3/d×3/i/u/y/ṭ/t/ṣ/zh/z 各 2），出向資訊合併後
 * 反向只能取一；正字序第一（canonical，21244 體例）與 Todo/AG 專碼位（字典形）
 * 兩檔由面板按鈕逐位置選擇。僅在輸出含 Ali Gali 專碼位區段（U+1880–U+18AA）時掃描。
 * primary＝canonical 形（引擎默認輸出）；alternative＝專碼位形。
 */
export function detectAliGaliHomophoneAmbiguities(nativeOut: string): TranslitAmbiguity[] {
  const inAg = Array.from(nativeOut).some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return c >= 0x1880 && c <= 0x18aa;
  });
  if (!inAg) return [];
  // r50e：同音組全候選（canonical 碼位序第一；按鈕三/四選一）。
  // 每組＝[正字形, ...同組其餘碼位（碼位序）]；同組全形體並列（ḥ×4 含 1882/1883/1884）。
  // 拼合形（ᢖᠠ᠋ za、ᠠ᠋ᢁ aḥ、ᠣᠸᠠ o）無專碼位單形，不入本表——見檢字表 note。
  const HOMOPHONE_GROUPS: Record<number, number[]> = {
    0x1881: [0x1881, 0x1882, 0x1883, 0x1884], // ḥ：VISARGA/DAMARU/UBADAMA/倒置（×4）
    0x1882: [0x1881, 0x1882, 0x1883, 0x1884],
    0x1883: [0x1881, 0x1882, 0x1883, 0x1884],
    0x1884: [0x1881, 0x1882, 0x1883, 0x1884],
    0x188b: [0x188b, 0x1853, 0x189c], // c ×3
    0x1853: [0x188b, 0x1853, 0x189c],
    0x189c: [0x188b, 0x1853, 0x189c],
    0x1891: [0x1891, 0x1898, 0x18a1], // d ×3
    0x1898: [0x1891, 0x1898, 0x18a1],
    0x18a1: [0x1891, 0x1898, 0x18a1],
    0x1890: [0x1890, 0x18a0], // t
    0x18a0: [0x1890, 0x18a0],
    0x1888: [0x1888, 0x1845], // i
    0x1845: [0x1888, 0x1845],
    0x1826: [0x1826, 0x1849], // u
    0x1849: [0x1826, 0x1849],
    0x1855: [0x1855, 0x18a7], // y
    0x18a7: [0x1855, 0x18a7],
    0x189e: [0x189e, 0x188c], // ṭ
    0x188c: [0x189e, 0x188c],
    0x1894: [0x1894, 0x18a2], // ṣ
    0x18a2: [0x1894, 0x18a2],
    0x1895: [0x1895, 0x18a4], // zh
    0x18a4: [0x1895, 0x18a4],
    0x1899: [0x1899, 0x18a5], // z
    0x18a5: [0x1899, 0x18a5],
    0x188a: [0x188a, 0x189b], // ṅ（188A 正字/189B）
    0x189b: [0x188a, 0x189b],
  };
  const cps = Array.from(nativeOut);
  const out: TranslitAmbiguity[] = [];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i].codePointAt(0) ?? 0;
    const grp = HOMOPHONE_GROUPS[c];
    if (grp) {
      const variants = grp.map((n) => String.fromCodePoint(n));
      out.push({
        index: i, kind: "agHomophone", primary: variants[0],
        alternative: variants[1],
        variants,
        note: "Ali Gali 同音碼位：正字形或同組專碼位字形，請擇一（N 選一）",
      });
    }
  }
  return out;
}

/**
 * 把歧義位置套用為 alternative（choices[k] === 1 表示選 alternative；預設 0＝primary）。
 * @returns 套用選擇後的原生文字（無歧義時原樣返回）
 */
export function applyTranslitAmbiguities(
  nativeText: string,
  ambig: TranslitAmbiguity[],
  choices: number[],
): string {
  if (!ambig.length) return nativeText;
  const cps = Array.from(nativeText);
  const map = new Map<number, string>();
  ambig.forEach((a, k) => {
    // r50e：variants 存在＝N 選一（choice 0=primary 不動、n=variants[n]）；未設＝傳統二選一
    const pick = a.variants ? a.variants[choices[k]] : (choices[k] === 1 ? a.alternative : undefined);
    if (pick !== undefined && pick !== cps[a.index]) map.set(a.index, pick);
  });
  return cps.map((ch, i) => map.get(i) ?? ch).join("");
}

/**
 * 字串級歧義套用——primary/alternative 為多字元字串（如 ULY 隔音
 * 撇號寫法 g'h ⇄ gh），按碼點序列匹配 primary 並整段替換為 alternative。
 * 與 applyTranslitAmbiguities（單碼點索引版）互補：P 類（apos）用本函式。
 * @returns 套用選擇後的文本（無歧義時原樣返回）
 */
export function applyStringAmbiguities(
  text: string,
  ambig: TranslitAmbiguity[],
  choices: number[],
): string {
  if (!ambig.length) return text;
  let out = text;
  // 從後往前替換，避免前段替換位移後段索引
  for (let k = ambig.length - 1; k >= 0; k--) {
    if (choices[k] !== 1) continue;
    const a = ambig[k];
    const at = out.indexOf(a.primary, a.index > 0 ? Math.max(0, a.index - 8) : 0);
    if (at >= 0) out = out.slice(0, at) + a.alternative + out.slice(at + a.primary.length);
  }
  return out;
}

/** 依歧義內容自動選用套用器：P 類（apos）字串級，其餘碼點索引級 */
export function applyAmbiguitiesAuto(
  text: string,
  ambig: TranslitAmbiguity[],
  choices: number[],
): string {
  if (!ambig.length) return text;
  // apos／kharoCauda（r46）：字串級——CAUDA 選擇作用在羅馬字輸出（⟒→̱），
  // 非原生碼位替換；其餘為碼點索引級。
  return ambig.some((a) => a.kind === "apos" || a.kind === "kharoCauda" || a.kind === "tibSpelling")
    ? applyStringAmbiguities(text, ambig, choices)
    : applyTranslitAmbiguities(text, ambig, choices);
}

/** anusvāra 後的鼻音寫法：嚴式時後接同組塞音 → 該組鼻音，否則 ṃ / ṁ */
function nasalAfter(cps: string[], from: number, mode: IndicMode, strictNasal: boolean, pali = false): string {
  /* pali 回轉恆用 ṃ（PALI_ANUS_ROMAN）——ṁ→ं→ṃ 失真即出向側
   * 誤用梵文表（iso→ṁ）所致；嚴式鼻音化（同組塞音→該組鼻音）仍按 strictNasal。 */
  const anus = pali ? PALI_ANUS_ROMAN[mode] : ANUS_ROMAN[mode];
  if (!strictNasal) return anus;
  const nd = from < cps.length ? cps[from] : "";
  const ndc = nd.codePointAt(0) ?? 0;
  if (!isConsonantDevanagari(ndc)) return anus;
  const r = consRoman(ndc, mode, true);
  return (r && CLASS_NASAL[r]) || anus;
}

/* ---------------- 文種檢測 ---------------- */

export function looksLikeDevanagari(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (isConsonantDevanagari(c) || isVowelIndep(c) || isMatra(c)) return true;
    // 區段寬判定——符號/數字/組合符號（ॐ anusvara visarga candrabindu、
    // 數字 ०-९、vedic 標記等）單獨成詞時舊判定 false，長文本面板 gate 把
    // 引擎已能轉換的詞整詞 skipped（真機實錘：逐字符清單 15/25 行透傳）。
    // 0900-097F 全區段＋Vedic 1CD0-1CFF／A8E0-A8FF 含任一字符即視為天城文本。
    if (
      (c >= 0x0900 && c <= 0x097F) ||
      (c >= 0x1CD0 && c <= 0x1CFF) ||
      (c >= 0xA8E0 && c <= 0xA8FF)
    ) {
      return true;
    }
  }
  return false;
}

export function looksLikeIast(text: string): boolean {
  if (looksLikeDevanagari(text)) return false;
  // IAST / ISO 15919 特徵字符（帶變音符，普通拉丁不含）
  return /[āīūṛṝḷḹṭḍṇṣśḥṃṁṅñṟṉḻēō]/.test(text) || text.includes("̥" /* U+0325，ISO 15919 的 r̥/l̥ */);
}

/* ---------------- 自動互轉 ---------------- */

/** 自動互轉（梵文；IAST 模式） */
export function convertSanskrit(input: string, opts?: IndicOptions): string {
  const mode = opts?.mode ?? "iast";
  return looksLikeDevanagari(input) ? devanagariToIast(input, { ...opts, mode }) : iastToDevanagari(input, { ...opts, mode });
}
/** 自動互轉（巴利；niggahita sandhi + ṁ/ṃ 等價） */
export function convertPali(input: string, opts?: IndicOptions): string {
  const o: IndicOptions = { ...opts, pali: true, mode: opts?.mode ?? "iast" };
  return looksLikeDevanagari(input) ? devanagariToIast(input, o) : iastToDevanagari(input, o);
}

/* ---------------- 備選方案：Harvard-Kyoto（ASCII 版 IAST，一對一） ---------------- */
/**
 * HK 有序映射表（最長優先）。
 * 【糾偏】舊表以 `ṭh`/`ḍh` 等 2 字符鍵去匹配逐字符遍歷的單字符，永不命中，
 * 導致捲舌送氣（Th/Dh）與長聲化元音（RR/LL）全部錯轉。
 * 【糾偏 2】聲化 ḷ / ḹ 依 Harvard-Kyoto 原定義作 `lR` / `lRR`（舊作 L / LL，
 * 與 sanscript 的 hk 表及 HK 文獻不符；且 L 在 HK 中不表音，實爲錯映射）。
 * 注意 `lR` 必須排在 `l` 之前——HK_REV 已按長度排序，故無前綴遮蔽問題。
 */
const HK_TABLE: Array<[string, string]> = [
  ["ṝ", "RR"], ["ḹ", "lRR"], ["ṭh", "Th"], ["ḍh", "Dh"],
  ["ā", "A"], ["ī", "I"], ["ū", "U"], ["ṛ", "R"], ["ḷ", "lR"],
  ["ṃ", "M"], ["ḥ", "H"], ["ṅ", "G"], ["ñ", "J"], ["ṁ", "~"],
  ["ṭ", "T"], ["ḍ", "D"], ["ṇ", "N"], ["ś", "z"], ["ṣ", "S"],
];
const HK_REV: Array<[string, string]> = HK_TABLE.map(([a, b]): [string, string] => [b, a]).sort((a, b) => b[0].length - a[0].length);

/** IAST → HK（純 ASCII） */
export function iastToHk(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    let hit = "";
    for (const [iast, hk] of HK_TABLE) {
      if (input.startsWith(iast, i)) { hit = hk; i += iast.length; break; }
    }
    if (hit) out += hit;
    else { out += input[i]; i++; }
  }
  return out;
}
/** HK → IAST */
export function hkToIast(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    // \uXXXX／⟨U+XXXX⟩ 顯式標註透傳（下層 tokenizeIast esc 分支還原；HK 的大小寫字母轉換不得吃掉標註 hex）
    // B2/r156：⟨U+XXXX⟩ 同體例透傳——U（hex 內）HK 鍵表會誤拆（U+0900→ऊ+०९०० 實錘）。
    {
      const esc = parseEscCp(input.slice(i));
      if (esc !== null) { out += input.slice(i, i + esc.width); i += esc.width; continue; }
    }
    let hit = "";
    for (const [hk, iast] of HK_REV) {
      if (input.startsWith(hk, i)) { hit = iast; i += hk.length; break; }
    }
    if (hit) out += hit;
    else { out += input[i]; i++; }
  }
  return out;
}

/* ---------------- ITRANS（梵咒鍵盤輸入的主流 ASCII 轉寫） ---------------- */
/**
 * ITRANS 5.30（Avinash Chopde）標準的 ASCII 羅馬轉寫。它是梵文 / 佛經真言鍵盤輸入的
 * 事實標準（ibus / scim / m17n 的 itrans 表），與 IAST 的系統性差異：
 *  - 捲舌以 T / Th / D / Dh / N 表示（IAST 爲 ṭ/ṭh/ḍ/ḍh/ṇ）；
 *  - 噝音以 sh（श）/ Sh（ष）表示（IAST 爲 ś/ṣ）；
 *  - 聲化元音以 RRi / RRI / LLi / LLI（IAST 爲 ṛ/ṝ/ḷ/ḹ）；
 *  - 複合輔音 kSh（क्ष）、j~na / GY / dny（ज्ञ）；
 *  - anusvāra=M、visarga=H、candrabindu=.N、virama=.h、avagraha=.a、OM / AUM=ॐ。
 * 元音符號與 IAST 共用同一套（a 固有、其餘發 matra），故直接複用 indepCode / matraCode。
 */
const ITRANS_CONS: Record<string, number> = {
  k: 0x0915, kh: 0x0916, g: 0x0917, gh: 0x0918, "~N": 0x0919,
  ch: 0x091a, Ch: 0x091b, j: 0x091c, jh: 0x091d, "~n": 0x091e,
  T: 0x091f, Th: 0x0920, D: 0x0921, Dh: 0x0922, N: 0x0923,
  t: 0x0924, th: 0x0925, d: 0x0926, dh: 0x0927, n: 0x0928,
  p: 0x092a, ph: 0x092b, b: 0x092c, bh: 0x092d, m: 0x092e,
  y: 0x092f, r: 0x0930, l: 0x0932, v: 0x0935,
  // B1 糾偏：ITRANS 5.30 標準 w＝व（與 v 同碼位，w/v 等價；舊表漏收致 wa 誤透傳）
  w: 0x0935,
  sh: 0x0936, Sh: 0x0937, s: 0x0938, h: 0x0939, L: 0x0933,
};
const ITRANS_CONS_REV: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(ITRANS_CONS)) m[v] = k;
  // B1：w/v 等價（同碼位 0x0935），ITRANS_CONS 先到鍵 v 佔 REV；反向表後到鍵覆寫
  // 爲 ITRANS 5.30 出版慣例的 v（wa 型輸入仍可，但出向統一 v，避免語料往返改拼）。
  return m;
})();
ITRANS_CONS_REV[0x0935] = "v";
const ITRANS_VOWEL: Record<string, string> = {
  a: "a", A: "ā", i: "i", I: "ī", u: "u", U: "ū",
  RRi: "ṛ", RRI: "ṝ", LLi: "ḷ", LLI: "ḹ",
  e: "e", ai: "ai", o: "o", au: "au",
};
/** ITRANS 元音 token → IAST key 對應的獨立 / matra 碼點（複用現有表） */
function itransVowelCodepoints(iastKey: string): { indep: number; matra: number } {
  const indep = VOWEL_INDEP[iastKey] ?? VOCALIC.iast[iastKey] ?? 0;
  const matra = VOWEL_MATRA[iastKey] ?? VOCALIC_MATRA.iast[iastKey] ?? 0;
  return { indep, matra };
}
const ITRANS_INDEP_REV: Record<number, string> = {};
const ITRANS_MATRA_REV: Record<number, string> = {};
for (const [tok, iastKey] of Object.entries(ITRANS_VOWEL)) {
  const { indep, matra } = itransVowelCodepoints(iastKey);
  if (indep) ITRANS_INDEP_REV[indep] = tok;
  if (matra) ITRANS_MATRA_REV[matra] = tok;
}
/** 複合輔音 → 連續輔音碼點（叢集組裝邏輯會自動補 virama 形成 क्ष / ज्ञ） */
const ITRANS_COMPOUND: Record<string, number[]> = {
  kSh: [0x0915, 0x0937],
  "j~na": [0x091c, 0x091e],
  GY: [0x091c, 0x091e],
  dny: [0x091c, 0x091e],
};
/** 最長優先匹配順序（長 token 在前，避免 kSh→k 後誤吞 S、Ch→c+h 等） */
const ITRANS_ORDER: string[] = [
  // 4-char
  "j~na",
  // 3-char
  "kSh", "dny", "RRi", "RRI", "LLi", "LLI", "AUM",
  // 2-char（含送氣、鼻音、複合、符號）
  "ai", "au", "kh", "gh", "ph", "bh", "th", "dh",
  "~N", "ch", "Ch", "jh", "~n", "Th", "Dh",
  "GY", "OM", ".h", ".N", ".a", "Sh", "sh",
  // 1-char
  "A", "I", "U", "a", "i", "u", "e", "o",
  "k", "g", "c", "j", "T", "D", "N", "t", "d", "n",
  "p", "b", "m", "y", "r", "l", "v", "w", "s", "h", "L", "M", "H",
];
type ItransUnit =
  | { t: "cons"; cp: number }
  | { t: "vowel"; key: string }
  | { t: "om" }
  | { t: "anus" }
  | { t: "visar" }
  | { t: "candra" }
  | { t: "avagraha" }
  | { t: "virama" }
  | { t: "esc"; cpValue: number }
  | { t: "other"; ch: string };
function emitItrans(tok: string): ItransUnit[] {
  if (ITRANS_COMPOUND[tok]) return ITRANS_COMPOUND[tok].map((c) => ({ t: "cons", cp: c }));
  if (tok === "OM" || tok === "AUM") return [{ t: "om" }];
  if (ITRANS_CONS[tok]) return [{ t: "cons", cp: ITRANS_CONS[tok] }];
  if (ITRANS_VOWEL[tok]) return [{ t: "vowel", key: ITRANS_VOWEL[tok] }];
  if (tok === ".h") return [{ t: "virama" }];
  if (tok === ".N") return [{ t: "candra" }];
  if (tok === ".a") return [{ t: "avagraha" }];
  if (tok === "M") return [{ t: "anus" }];
  if (tok === "H") return [{ t: "visar" }];
  // 撇號：ITRANS 規範 avagraha 用 .a，' 非合法字符——但用戶實務
  // 會把 IAST 慣例的 rAmo 'sti 直接輸入；視同 avagraha（走詞首補 a 邏輯），
  // 不透傳裸撇號。
  if (tok === "'") return [{ t: "avagraha" }];
  return [{ t: "other", ch: tok }];
}
function tokenizeItrans(input: string): ItransUnit[] {
  const units: ItransUnit[] = [];
  let i = 0;
  while (i < input.length) {
    let matched: ItransUnit[] | null = null;
    let len = 0;
    for (const tok of ITRANS_ORDER) {
      if (input.startsWith(tok, i)) {
        matched = emitItrans(tok);
        len = tok.length;
        break;
      }
    }
    if (matched) {
      units.push(...matched);
      i += len;
    } else if (input[i] === "'") {
      // 撇號：ITRANS 無 ' 字符，用戶 IAST 慣例輸入——視同 avagraha
      units.push({ t: "avagraha" });
      i++;
    } else {
      // \uXXXX 顯式標註（出向無鍵輔音 esc 對稱還原）——先於 other 兜底
      const esc = parseEscCp(input.slice(i));
      if (esc !== null) {
        units.push({ t: "esc", cpValue: esc.cp });
        i += esc.width;
      } else {
        units.push({ t: "other", ch: input[i] });
        i++;
      }
    }
  }
  return units;
}
/** ITRANS（ASCII）→ 天城體 Devanagari */
export function itransToDevanagari(input: string): string {
  const units = tokenizeItrans(input);
  let out = "";
  let idx = 0;
  while (idx < units.length) {
    const u = units[idx];
    idx++;
    if (u.t === "cons") {
      out += cp(u.cp);
      while (idx < units.length && units[idx].t === "cons") {
        const nx = units[idx] as { t: "cons"; cp: number };
        out += cp(VIRAMA) + cp(nx.cp);
        idx++;
      }
      const n = units[idx];
      if (n) {
        if (n.t === "vowel") {
          const m = matraCode(n.key, "iast");
          if (m) out += cp(m);
          idx++;
        } else if (n.t === "anus") { out += cp(ANUSVARA); idx++; }
        else if (n.t === "visar") { out += cp(VISARGA); idx++; }
        else if (n.t === "candra") { out += cp(CANDRABINDU); idx++; }
        else if (n.t === "virama") { out += cp(VIRAMA); idx++; }
      }
      // 注意：ITRANS 遵循鍵盤輸入習慣——詞尾輔音帶固有 a（不補 virama），
      // 與 IAST「詞尾輔音視爲死輔音」的慣例不同。故此處不補 virama。
    } else if (u.t === "vowel") {
      out += cp(indepCode(u.key, "iast") ?? 0);
    } else if (u.t === "om") { out += cp(0x0950); }
    else if (u.t === "anus") { out += cp(ANUSVARA); }
    else if (u.t === "visar") { out += cp(VISARGA); }
    else if (u.t === "candra") { out += cp(CANDRABINDU); }
    else if (u.t === "avagraha") {
      // avagraha 語義決斷：梵文連聲正字法中 avagraha ऽ **必須黏前詞尾**
      //（rāmaḥ+asti → rāmo 'sti → रामोऽस्ति；IAST 排版帶空格是拉丁側慣例，
      // 原生側無空格）。因此「' + 輔音」且輸出前文有實質內容（元音/virama/
      // 輔音等字母結尾）→ ऽ 黏合；僅字串開頭（無前文可黏，如檢字表獨立詞）
      // 才還原省略音位 अ（'sti 型孤詞）。標點/空白結尾視為前詞已完結——
      // 但連聲撇號排版就是「空格+'」，故空白不算完結；句讀（.,;:!?）才算。
      // 獨立 .a（檢字表）/詞尾 .a 維持 ऽ 正字形。
      const nx = units[idx];
      const nextIsCons = !!nx && nx.t === "cons";
      const prev = out.slice(-1);
      if (!nextIsCons) {
        out += cp(AVAGRAHA);
      } else if (prev === "") {
        out += cp(0x0905); // अ：無前文可黏（孤詞）
      } else if (/[.,;:!?"']/.test(prev)) {
        out += cp(0x0905); // अ：句讀後＝真新詞
      } else {
        out += cp(AVAGRAHA); // ऽ：黏前詞尾（含空格+' 的排版型）
      }
    }
    else if (u.t === "esc") { out += cp(u.cpValue); }
    else if (u.t === "other") {
      // IAST 排版句讀還原（|| 先於 | 判，防單豎吃雙豎）
      // danda 緊貼前詞輸出（`यै॥`）——IAST 出版慣例
      // 的 `yai ||` 前置空格屬拉丁側排版，原生側慣例無空格，故吞掉 danda 前空格；
      // 行首 danda（無前文）不處理。
      if (u.ch === "||" || u.ch === "|") {
        if (out.endsWith(" ")) out = out.slice(0, -1);
        out += cp(u.ch === "||" ? 0x0965 : 0x0964);
      }
      else out += u.ch;
    }
  }
  return out;
}
/** 天城體 Devanagari → ITRANS（ASCII） */
export function devanagariToItrans(input: string): string {
  let out = "";
  const cps = Array.from(input);
  let i = 0;
  while (i < cps.length) {
    const ch = cps[i];
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x0950) { out += "OM"; i++; continue; }
    if (c === AVAGRAHA) { out += ".a"; i++; continue; }
    if (isVowelIndep(c)) { out += ITRANS_INDEP_REV[c] ?? ch; i++; }
    else if (isConsonantDevanagari(c)) {
      // r73j：無鍵輔音（達羅毗荼 ऩऱऴ ऱ 等）→ \uXXXX esc（iast 同體例），**不補固有 a**——
      // 透傳+補a 會讓入向把「透傳字符+letter a」切成「字符+獨立元音 अ」（實錘 416 缺陷：
      // ऩ→"ऩa"→ऩ+अ），esc 後無鍵字符不接 a、不接 matra，入向 parseEscCp 對稱還原。
      const consKey = ITRANS_CONS_REV[c] ?? consRoman(c, "iast");
      if (consKey === undefined) {
        out += escapeRomanCp(c);
        i++;
        // 無鍵輔音後接 matra——matra 失去宿主，附標鍵（ā/i…）入向會被
        // 獨立元音化（आ），故 matra 一併 esc 保位（連續 esc 入向逐碼位還原）
        const nxt2 = i < cps.length ? cps[i].codePointAt(0) ?? 0 : 0;
        if (isMatra(nxt2)) {
          out += escapeRomanCp(nxt2);
          i++;
        }
        continue;
      }
      const base = consKey;
      const nxt = i + 1 < cps.length ? cps[i + 1] : "";
      const nc = nxt.codePointAt(0) ?? 0;
      if (nc === VIRAMA) {
        // 合字（virama 後接輔音）：不帶 a，由後一輔音承接 → 只寫 base；
        // 死輔音（virama 後爲詞尾 / 空白 / 標點）：ITRANS 的詞尾輔音帶固有 a，
        // 故必須顯式寫出 halant token「.h」，否則 त् 與 त 同形，往返丟失 virama
        // （實證：प्रचोदयात् → prachodayAt → प्रचोदयात）。
        const after = i + 2 < cps.length ? (cps[i + 2].codePointAt(0) ?? 0) : 0;
        // 後一輔音無鍵（base 已 esc）——virama 顯式 esc，否則入向 k 補固有 a（कऩ 實錘）
        const afterMissing = isConsonantDevanagari(after) && ITRANS_CONS_REV[after] === undefined;
        out += base + (isConsonantDevanagari(after) ? (afterMissing ? escapeRomanCp(VIRAMA) : "") : ".h");
        i += 2;
      }
      else if (isMatra(nc)) { out += base + (ITRANS_MATRA_REV[nc] ?? nxt); i += 2; }
      else if (nc === ANUSVARA) { out += base + "a" + "M"; i += 2; }
      else if (nc === VISARGA) { out += base + "a" + "H"; i += 2; }
      else if (nc === CANDRABINDU) { out += base + "a" + ".N"; i += 2; }
      else { out += base + "a"; i++; } // 尾輔音補固有 a（與前向「不補 virama」互逆，確保往返）
    } else if (c === ANUSVARA) { out += "M"; i++; }
    else if (c === VISARGA) { out += "H"; i++; }
    else if (c === CANDRABINDU) { out += ".N"; i++; }
    else if (c >= 0x0966 && c <= 0x096f) { out += DEVA_DIGITS[c]; i++; }
    else { out += ch; i++; }
  }
  return out;
}
/** ITRANS 專屬「像羅馬字」偵測：含 itrans 特有 token（與 HK 大寫方案區隔） */
function looksLikeItrans(text: string): boolean {
  return /RRi|RRI|LLi|LLI|kSh|j~na|dny|~N|~n|Ch|Th|Dh|Sh|\.h|\.N|\.a/.test(text) && !looksLikeDevanagari(text);
}
export function buildItransCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  for (const [tok, iastKey] of Object.entries(ITRANS_VOWEL)) {
    const { indep, matra } = itransVowelCodepoints(iastKey);
    rows.push({ native: cp(indep) + (matra ? cp(matra) : ""), roman: tok, note: "元音（a 爲固有，不輸出符號）", section: "元音" });
  }
  let itransConsIdx = 0;
  for (const [tok, c] of Object.entries(ITRANS_CONS)) {
    // 類別說明只掛節首一行。
    rows.push({ native: cp(c), roman: tok, note: itransConsIdx === 0 ? "輔音基底（ka＝क；合字中 k 不帶 a）" : undefined, section: "輔音" });
    itransConsIdx++;
  }
  let itransCmpIdx = 0;
  for (const [tok, cs] of Object.entries(ITRANS_COMPOUND)) {
    rows.push({ native: cs.map(cp).join(""), roman: tok, note: itransCmpIdx === 0 ? "複合輔音" : undefined, section: "輔音" });
    itransCmpIdx++;
  }
  rows.push({ native: cp(0x0950), roman: "OM", note: "Om（ॐ）", section: "符號" });
  rows.push({ native: cp(0x0950), roman: "AUM", note: "Om（ॐ，OM 的長寫）", section: "符號" });
  rows.push({ native: cp(ANUSVARA), roman: "M", note: "anusvāra（ṃ）", section: "符號" });
  rows.push({ native: cp(VISARGA), roman: "H", note: "visarga（ḥ）", section: "符號" });
  rows.push({ native: cp(CANDRABINDU), roman: ".N", note: "candrabindu（m̐）", section: "符號" });
  rows.push({ native: cp(VIRAMA), roman: ".h", note: "virama（去除固有 a）", section: "符號" });
  rows.push({ native: cp(AVAGRAHA), roman: ".a", note: "avagraha（ऽ）", section: "符號" });
  // 檢字表覆蓋審計：itrans 表同補天城數字列（引擎雙向有鍵）
  for (let d = 0x0966; d <= 0x096f; d++) {
    rows.push({ native: cp(d), roman: String(d - 0x0966), note: d === 0x0966 ? "天城數字 ०-९ ↔ 0-9（雙向逐位映射）" : undefined, section: "符號" });
  }
  return rows;
}

/* ---------------- 檢字表數據（設定 UI 用） ---------------- */
function buildCharTable(mode: IndicMode, pali = false): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  let consIdx = 0;
  for (const [k, v] of Object.entries(IAST_CONSONANT)) {
    // 類別說明只掛節首一行（sectionNote），行級 note 留給逐字差異。
    // 檢字表審計誠實化：輔音單鍵詞尾補 virama（天城體拼寫規則，引擎實輸；
    // 表列裸輔音＝虛構引擎能力——ḹ 教訓）
    rows.push({ native: cp(v) + cp(0x094d), roman: k,
      note: (consIdx === 0 ? "輔音基底（ka＝क）；" : "") + "詞尾補 virama（阿育王/天城體正字法）；後接元音＝固有 a 或附標",
      section: "輔音" });
    consIdx++;
  }
  if (mode === "iso") {
    for (const [k, v] of Object.entries(ISO_CONSONANT)) {
      rows.push({ native: cp(v), roman: k, note: "ISO 15919 補充輔音", section: "輔音" });
    }
  }
  if (pali) {
    // 巴利無聲化元音：ḷ 在巴利是**捲舌邊音輔音**（ळ U+0933），非梵文的聲化元音
    // ऌ。引擎於 pali 模式即如此轉換（實證 saḷāyatana「六處」），故檢字表須列出，
    // 否則「引擎能轉、表格漏列」。
    // ḹ（ऴ U+0934）**不列**：巴利音系無此音（文献零出現），引擎 pali 模式 ḹ
    // 無映射（ISO_CONSONANT 僅 ḷ/ṟ/ṉ/ḻ）而原樣透傳——表列即虛構引擎能力（A 級
    // 不一致修復：表格聲稱須與引擎實況一致）。
    // 注意：ISO 模式已於上方 ISO_CONSONANT 包含 ळ，故此處需去重，
    // 否則 pali-iso15919 表會出現「ळ|ḷ」重複列（審計發現）。
    if (!rows.some((r) => r.native === cp(0x0933))) {
      rows.push({ native: cp(0x0933) + cp(0x094d), roman: "ḷ", note: "巴利捲舌邊音（ळ；梵文 IAST 作聲化元音 ऌ）；詞尾補 virama（同輔音段拼寫規則）", section: "輔音" });
    }
  }
  for (const [k, v] of Object.entries(VOWEL_INDEP)) {
    const matra = VOWEL_MATRA[k];
    // ISO 15919 正規把 ए/ओ 的羅馬字寫作 ē/ō（輸出與檢字表一致）
    const romanKey = mode === "iso" && k === "e" ? "ē" : mode === "iso" && k === "o" ? "ō" : k;
    // 檢字表審計誠實化：native＝引擎單鍵實輸（獨立元音字母）；舊「獨立+matra」
    // 為展示組合——附標形僅在輔音後出現，碼位移入 note。
    rows.push({
      native: cp(v),
      roman: romanKey,
      note: matra ? `詞首單鍵輸出獨立形；音節內輔音後輸出附標 U+${matra.toString(16).toUpperCase()}` : "元音 a（固有 a，不輸出 matra）",
      section: "元音",
    });
  }
  // 巴利模式排除 ḷ/ḹ 聲化元音列——pali 音系 ḷ=捲舌邊音（已於輔音段列 ळ），
    // ḹ 無映射原樣透傳；列於聲化元音段＝虛構引擎能力（ḹ 教訓重演，vocalicKeys 同款排除）。
    for (const [k, v] of Object.entries(VOCALIC[mode])) {
    // 巴利模式排除 ḷ/ḹ 聲化元音列——pali 音系 ḷ=捲舌邊音（已於輔音段列 ळ）、
    // ḹ 無映射原樣透傳；列於聲化元音段＝虛構引擎能力（ḹ 教訓重演，vocalicKeys 同款排除）。
    if (pali && (k === "ḷ" || k === "ḹ")) continue;
    // 檢字表審計誠實化：native＝引擎單鍵實輸（獨立形）；附標碼位移 note
    rows.push({ native: cp(v), roman: k, note: `聲化元音：詞首單鍵輸出獨立形；音節內輔音後輸出附標 U+${VOCALIC_MATRA[mode][k].toString(16).toUpperCase()}`, section: "元音" });
  }
  rows.push({ native: cp(ANUSVARA), roman: pali ? PALI_ANUS_ROMAN[mode] : ANUS_ROMAN[mode], note: "anusvāra（niggahita；不取消固有 a）", section: "符號" });
  rows.push({ native: cp(VISARGA), roman: VISARGA_ROMAN, note: "visarga 止聲", section: "符號" });
  rows.push({ native: cp(CANDRABINDU), roman: pali ? PALI_CANDRA_ROMAN[mode] : CANDRA_ROMAN[mode], note: "candrabindu", section: "符號" });
  // 檢字表審計：avagraha 鍵三態分流（前文元音結尾→ऽ 黏合；前文輔音/孤立→透傳或補 a）——
// 單鍵輸入透傳＝引擎正確行為（上下文相依），note 如實說明。
  // 檢字表覆蓋審計：天城數字 ०-९（U+0966–096F）引擎雙向有鍵（DEVA_DIGITS），
  // 舊表漏列——補十列（聲稱須與引擎實況一致）。
  for (let d = 0x0966; d <= 0x096f; d++) {
    rows.push({ native: cp(d), roman: String(d - 0x0966), note: d === 0x0966 ? "天城數字 ०-९ ↔ 0-9（雙向逐位映射）" : undefined, section: "符號" });
  }
  rows.push({ native: "—", roman: AVAGRAHA_ROMAN, note: "上下文相依鍵（無固定單鍵輸出）：avagraha ऽ U+093D 三態分流——前文元音結尾黏合 ऽ（rāmo'sti）、孤立/句讀後補 अ、引號語境透傳；單鍵輸入透傳為正確行為", section: "符號" });
  rows.push({ native: "—", roman: "（合字）", note: "說明列（非獨立輸入鍵）：virama U+094D 去除固有 a，由叢集長鍵或詞尾規則產生", section: "符號" });
  // 18.0 §12.1 對照註記（Unicode 18.0 精讀，2026-11-20）
  rows.push({ native: "—", roman: "（吠陀吟誦）", note: "說明列：Sāmaveda 吟誦符 A8E0–A8F1（組合數字 0–9＋KA，直接疊於音節上方、緊隨所修飾音節；可雙疊，如 A8E3+A8EC）；A8F2 spacing candrabindu 低於 U+0901；A8F8–A8FB 編輯符（pushpika 親緣雙 danda、caret 零寬插補、headstroke 須與旁字頭筆斷開以計缺字數）——本引擎均 \\uXXXX 透傳往返", section: "符號" });
  rows.push({ native: "—", roman: "（吠陀聲調）", note: "說明列：Vedic Extensions 1CD0–1CFF——udātta/anudātta/svarita 聲調符緊隨所修飾元音（visarga 三聲調可標）；1CD3 nihshvasa 為分節斷符（禁停處分段）；1CF2 ardhavisarga、1CF3 jihvamuliya/upadhmaniya；Devanagari Extended-A 11B00–11B5F Bhale Mīṇḍu 耆那吉祥符（序列：頭符 11B00/11B01＋bhale 11B02–06＋mīṇḍu 11B09 或 0966，後接 0965）不在本引擎鍵域，\\uXXXX 透傳往返無損", section: "符號" });
  return rows;
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */
const charTable = buildCharTable("iast");
const charTableIso = buildCharTable("iso");
const charTablePali = buildCharTable("iast", true);
const charTablePaliIso = buildCharTable("iso", true);

const SANSKRIT_LABEL = { zh: "梵文 IAST", "zh-TW": "梵文 IAST", en: "Sanskrit (IAST)", bo: "སང་སྐྲིད་(IAST)", ug: "سانسكرىت (IAST)", sa: "संस्कृतम्", hi: "संस्कृत" };
const PALI_LABEL = { zh: "巴利文 IAST", "zh-TW": "巴利文 IAST", en: "Pali (IAST)", bo: "པཱ་ལི་(IAST)", ug: "پالى (IAST)" };

const sanskritIast: TransliterationScheme = {
  id: "sanskrit-iast",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: SANSKRIT_LABEL,
  group: "sanskrit",
  primary: true,
  description: "梵文天城體 ↔ IAST（學術傳統標準，可無損往返；ṛ/ṝ/ḷ/ḹ 爲聲化元音）",
  romanToNative: (i, o) => iastToDevanagari(i, { ...o, mode: "iast" }),
  nativeToRoman: (i, o) => devanagariToIast(i, { ...o, mode: "iast" }),
  looksLikeNative: looksLikeDevanagari,
  looksLikeRoman: looksLikeIast,
  convert: (i, o) => convertSanskrit(i, { ...o, mode: "iast" }),
  charTable,
};

const sanskritIso: TransliterationScheme = {
  id: "sanskrit-iso15919",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "梵文 ISO 15919",
    "zh-TW": "梵文 ISO 15919",
    ja: "梵字（ISO 15919）", ko: "범어(ISO 15919)",
    en: "Sanskrit (ISO 15919)",
    bo: "སང་སྐྲིད་(ISO 15919)",
    ug: "سانسكرىت (ISO 15919)",
  fr: "Sanskrit (ISO 15919)", de: "Sanskrit (ISO 15919)", },
  group: "sanskrit",
  primary: false,
  hiddenFromPicker: true, // 只收選擇面不收引擎（功能保留）
  altOf: "sanskrit-iast",
  description: "ISO 15919:2001（正規寫法）——與 IAST 的差異：ए ē / ओ ō、ऋ r̥ / ॠ r̥̄ / ऌ l̥ / ॡ l̥̄、anusvāra ṁ、candrabindu m̐、ḷ ळ",
  romanToNative: (i, o) => iastToDevanagari(i, { ...o, mode: "iso" }),
  nativeToRoman: (i, o) => devanagariToIast(i, { ...o, mode: "iso" }),
  looksLikeNative: looksLikeDevanagari,
  looksLikeRoman: looksLikeIast,
  convert: (i, o) => convertSanskrit(i, { ...o, mode: "iso" }),
  charTable: charTableIso,
};

const paliIast: TransliterationScheme = {
  id: "pali-iast",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: PALI_LABEL,
  group: "pali",
  primary: true,
  description: "巴利文 ↔ 天城體：IAST 受限字符集；niggahita 回轉一律 ṃ（PTS/BJT 正字，r50 A-P1）；ṁ 與 ṃ 等價",
  romanToNative: (i, o) => iastToDevanagari(i, { ...o, mode: "iast", pali: true }),
  nativeToRoman: (i, o) => devanagariToIast(i, { ...o, mode: "iast", pali: true }),
  looksLikeNative: looksLikeDevanagari,
  looksLikeRoman: looksLikeIast,
  convert: convertPali,
  charTable: charTablePali,
};

const paliIso: TransliterationScheme = {
  id: "pali-iso15919",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "巴利文 ISO 15919",
    "zh-TW": "巴利文 ISO 15919",
    ja: "パーリ語（ISO 15919）", ko: "팔리어(ISO 15919)",
    en: "Pali (ISO 15919)",
    bo: "པཱ་ལི་(ISO 15919)",
    ug: "پالى (ISO 15919)",
  fr: "Pali (ISO 15919)", de: "Pali (ISO 15919)", },
  group: "pali",
  primary: false,
  hiddenFromPicker: true, // 只收選擇面不收引擎（功能保留）
  altOf: "pali-iast",
  description: "巴利文 ↔ 天城體：ISO 15919 字母表（niggahita 記作 ṁ）+ 嚴式鼻音化",
  romanToNative: (i, o) => iastToDevanagari(i, { ...o, mode: "iso", pali: true }),
  nativeToRoman: (i, o) => devanagariToIast(i, { ...o, mode: "iso", pali: true }),
  looksLikeNative: looksLikeDevanagari,
  looksLikeRoman: looksLikeIast,
  convert: (i, o) => convertPali(i, { ...o, mode: "iso" }),
  charTable: charTablePaliIso,
};

const sanskritHk: TransliterationScheme = {
  id: "sanskrit-hk",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: { zh: "梵文 HK（ASCII 備選）", "zh-TW": "梵文 HK（ASCII 備選）", ja: "梵字 HK（ASCII）", ko: "범어 HK(ASCII)", en: "Sanskrit (Harvard-Kyoto)", bo: "སང་སྐྲིད་(HK)", ug: "سانسكرىت (HK)", fr: "Sanskrit (Harvard-Kyoto)", de: "Sanskrit (Harvard-Kyoto)", },
  group: "sanskrit",
  primary: false,
  hiddenFromPicker: true,
  altOf: "sanskrit-iast",
  description: "Harvard-Kyoto：IAST 的純 ASCII 替代（一對一），兼容舊文獻（T/Th/D/Dh 爲捲舌）",
  romanToNative: (i, o) => iastToDevanagari(hkToIast(i), { ...o, mode: "iast" }),
  nativeToRoman: (i, o) => iastToHk(devanagariToIast(i, { ...o, mode: "iast" })),
  looksLikeNative: looksLikeDevanagari,
  looksLikeRoman: (t) => /[A-Z]/.test(t) && !looksLikeDevanagari(t),
  convert: (i, o) => (looksLikeDevanagari(i)
    ? iastToHk(devanagariToIast(i, { ...o, mode: "iast" }))
    : iastToDevanagari(hkToIast(i), { ...o, mode: "iast" })),
  // HK 檢字表的 roman 列必須是 HK 拼寫（非 IAST），故以 iastToHk 重映射 IAST 表。
  charTable: charTable.map((e) => ({ ...e, roman: iastToHk(e.roman) })),
};

const sanskritItrans: TransliterationScheme = {
  id: "sanskrit-itrans",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  // ITRANS 的 .h（visarga）/.a（avagraha）/.N 等 dot 標記是詞內音標，掃描層不作詞界
  romanKeepChars: ".",
  label: { zh: "梵文 ITRANS（鍵盤輸入）", "zh-TW": "梵文 ITRANS（鍵盤輸入）", ja: "梵字 ITRANS（入力用）", ko: "범어 ITRANS(입력용)", en: "Sanskrit (ITRANS)", bo: "སང་སྐྲིད་(ITRANS)", ug: "سانسكرىت (ITRANS)", fr: "Sanskrit (ITRANS)", de: "Sanskrit (ITRANS)", },
  group: "sanskrit",
  primary: false,
  hiddenFromPicker: true,
  altOf: "sanskrit-iast",
  description: "ITRANS 5.30：梵咒鍵盤輸入的事實標準（ASCII）。T/Th/D/Dh/N 爲捲舌、sh/Sh 爲 ś/ṣ、RRi/RRI/LLi/LLI 爲聲化元音；kSh（क्ष）、j~na（ज्ञ）、M/H/.N/.h/OM。與 IAST 可互轉。",
  romanToNative: (i, _o) => itransToDevanagari(i),
  nativeToRoman: (i, _o) => devanagariToItrans(i),
  looksLikeNative: looksLikeDevanagari,
  looksLikeRoman: looksLikeItrans,
  convert: (i, _o) => (looksLikeDevanagari(i) ? devanagariToItrans(i) : itransToDevanagari(i)),
  charTable: buildItransCharTable(),
};

registerScheme(sanskritIast);
registerScheme(sanskritIso);
registerScheme(paliIast);
registerScheme(paliIso);
registerScheme(sanskritHk);
registerScheme(sanskritItrans);

/* ============================================================================
 * 通用 ASCII 方案組裝器（Velthuis / WX / National Library at Kolkata / SLP1）
 * ----------------------------------------------------------------------------
 * 這四套梵文轉寫與 ITRANS 同構：每個音素單一 token、abugida 拼寫層（輔音帶固有
 * a、連續輔音間隱含 virama）。與 HK（經 IAST 樞紐）不同，本組裝器**直接**把 token
 * 映射到天城體碼點，理由：
 *  - ळ(0x0933) 在 IAST 模式不可表達（IAST 把 ḷ 解作聲化元音 ऌ），經 IAST 樞紐會靜默
 *    錯轉；直接映射可正確處理 ळ / ऌ / ॡ 三者。
 *  - 大小寫是這四套方案的**核心語義**（WX/SKP1 的 k≠K、t≠T≠w≠W；HK/ITRANS 同），
 *    獨立映射表使大小寫差異可被 `sanskrit-roundtrip` 的大小寫探針精確鎖定。
 * 映射表取自權威來源：Velthuis＝Velthuis 手冊 / Wikipedia；WX＝IIT Kanpur WX
 * notation（Wikipedia）；Kolkata＝NLK（IAST 延伸：ए→ē、ओ→ō、不含 ॠ/ऌ/ॡ）；
 * SLP1＝Cologne iast/slp1_iast.txt（引擎既有 iast-slp1.ts 資料，本處取其輔音／
 * 元音字母表，並顯式區分 x→ऌ、X→ॡ、L→ळ——IAST 因 ḷ 一字多義而無法區分）。
 * ========================================================================== */
interface AsciiSchemeDef {
  /** 輔音基底 token → cp（含固有 a 語義；連續輔音間組裝器自動插 virama） */
  cons: Record<string, number>;
  /** 獨立元音 token → cp */
  vowelIndep: Record<string, number>;
  /** matra token → cp（'a' → 0，固有 a 不輸出） */
  matra: Record<string, number>;
  /** 尾附符號（anusvāra / visarga / candrabindu）token → cp，形式 base+a+token */
  postSign: Record<string, number>;
  /** 獨立符號（virama / avagraha / Om）token → cp */
  standSign: Record<string, number>;
  /** 擴展（非標準 cp，如 WX eV=ऎ、kZa=क़）token → cp 序列 */
  ext?: Record<string, number[]>;
}
interface AsciiSchemeMeta {
  id: string;
  label: Record<string, string>;
  description: string;
  altOf?: string;
  /** 從選擇面隱藏（功能保留），透傳到 TransliterationScheme */
  hiddenFromPicker?: boolean;
  /** f2-A：全方案通用 esc 標註 token（\uXXXX）原子化（透傳到 TransliterationScheme） */
  escAnnotationToken?: boolean;
  /** 方案 roman 專屬詞內標點（透傳到 TransliterationScheme，掃描層不作詞界） */
  romanKeepChars?: string;
}
function makeAsciiScheme(def: AsciiSchemeDef, meta: AsciiSchemeMeta): TransliterationScheme {
  const consRev: Record<number, string> = {};
  for (const [k, v] of Object.entries(def.cons)) consRev[v] = k;
  const indepRev: Record<number, string> = {};
  for (const [k, v] of Object.entries(def.vowelIndep)) indepRev[v] = k;
  const matraRev: Record<number, string> = {};
  for (const [k, v] of Object.entries(def.matra)) if (v) matraRev[v] = k;
  const postSignRev: Record<number, string> = {};
  for (const [k, v] of Object.entries(def.postSign)) postSignRev[v] = k;
  const standSignRev: Record<number, string> = {};
  for (const [k, v] of Object.entries(def.standSign)) standSignRev[v] = k;
  // 單碼點擴展用查表；多碼點擴展（如 क़＝क+nukta，U+0958 在 NFC 下必分解）
  // 用序列匹配，否則會被輔音分支先吃掉，變成「ka」+「kZa」的錯切分。
  const extRev: Record<number, string> = {};
  const extSeq: Array<[number[], string]> = [];
  for (const [k, v] of Object.entries(def.ext ?? {})) {
    if (v.length === 1) extRev[v[0]] = k;
    else extSeq.push([v, k]);
  }
  extSeq.sort((a, b) => b[0].length - a[0].length);
  const order = Array.from(new Set<string>([
    ...Object.keys(def.cons), ...Object.keys(def.vowelIndep), ...Object.keys(def.matra),
    ...Object.keys(def.postSign), ...Object.keys(def.standSign), ...Object.keys(def.ext ?? {}),
  ])).sort((a, b) => b.length - a.length);

  const isCons = (c: number) => c >= 0x0915 && c <= 0x0939;
  const isIndep = (c: number) => (c >= 0x0905 && c <= 0x0914) || c === 0x0960 || c === 0x0961;
  const isMatra = (c: number) => (c >= 0x093e && c <= 0x094c) || c === 0x0962 || c === 0x0963;

  function tokenize(text: string): string[] {
    const toks: string[] = [];
    let i = 0;
    while (i < text.length) {
      let hit = "";
      for (const tok of order) {
        if (text.startsWith(tok, i)) { hit = tok; break; }
      }
      if (hit) { toks.push(hit); i += hit.length; }
      else { toks.push(text[i]); i += text[i].length; }
    }
    return toks;
  }
  function romanToNative(input: string): string {
    const toks = tokenize(input.normalize("NFC"));
    let out = "";
    let i = 0;
    while (i < toks.length) {
      const tok = toks[i];
      if (def.cons[tok] !== undefined) {
        out += cp(def.cons[tok]);
        i++;
        while (i < toks.length && def.cons[toks[i]] !== undefined) {
          out += cp(VIRAMA) + cp(def.cons[toks[i]]); i++;
        }
        if (i < toks.length) {
          const n = toks[i];
          if (def.matra[n] !== undefined) { if (def.matra[n]) out += cp(def.matra[n]); i++; }
          else if (def.postSign[n] !== undefined) { out += cp(def.postSign[n]); i++; }
          else if (def.standSign[n] !== undefined) { out += cp(def.standSign[n]); i++; }
          else if (def.ext && def.ext[n]) { out += def.ext[n].map(cp).join(""); i++; }
          else {
            // 死輔音：本組裝器採「固有 a 一律顯式寫出」範式（ka＝क、k＝क्，
            // 與 IAST / sanscript 的 Velthuis·WX·SLP1 一致），故裸輔音後無
            // 元音即補 virama —— 與 nativeToRoman「合字不寫 virama」互逆，
            // 確保 प्रचोदयात् ⇄ ...pracodayAt 之類詞尾死輔音無損往返。
            out += cp(VIRAMA); // 不消費 n（空白/標點由下一輪透傳）
          }
        } else {
          out += cp(VIRAMA); // 字串結束：死輔音
        }
      } else if (def.vowelIndep[tok] !== undefined) {
        out += cp(def.vowelIndep[tok]); i++;
      } else if (def.matra[tok] !== undefined) {
        out += tok; i++; // 孤立 matra（罕見）透傳
      } else if (def.postSign[tok] !== undefined) {
        out += cp(def.postSign[tok]); i++;
      } else if (def.standSign[tok] !== undefined) {
        out += cp(def.standSign[tok]); i++;
      } else if (def.ext && def.ext[tok]) {
        out += def.ext[tok].map(cp).join(""); i++;
      } else if (tok === "'") {
        // 撇號（語義對齊）：Velthuis/WX/Kolkata/SLP1 無撇號字符——
        // 連聲排版（raamo 'sti / raamo'sti）原生形必須 ऽ 黏前詞尾；僅字串
        // 開頭或句讀後（真新詞）還原音位 अ。與 IAST/HK decoder 同語義。
        const prev = out.slice(-1);
        if (prev === "" || /[.,;:!?"]/.test(prev)) out += cp(0x0905); // अ
        else out += cp(AVAGRAHA); // ऽ：黏前詞尾
        i++;
      } else {
        out += tok; i++;
      }
    }
    return out;
  }
  function nativeToRoman(input: string): string {
    const cps = Array.from(input.normalize("NFC"));
    let out = "";
    let i = 0;
    while (i < cps.length) {
      const c = cps[i].codePointAt(0) ?? 0;
      const nxt = i + 1 < cps.length ? (cps[i + 1].codePointAt(0) ?? 0) : 0;
      if (standSignRev[c] !== undefined) { out += standSignRev[c]; i++; continue; }
      if (extRev[c] !== undefined) { out += extRev[c]; i++; continue; }
      let extHit = false;
      for (const [seq, tok] of extSeq) {
        if (seq.length > 1 && cps.length - i >= seq.length &&
            seq.every((sc, j) => (cps[i + j].codePointAt(0) ?? 0) === sc)) {
          out += tok; i += seq.length; extHit = true; break;
        }
      }
      if (extHit) continue;
      if (isIndep(c)) { out += indepRev[c] ?? cps[i]; i++; continue; }
      if (isCons(c)) {
        const base = consRev[c] ?? cps[i];
        // 合字：virama 不寫出，由 romanToNative 的「連續輔音自動插 virama」還原
        if (nxt === VIRAMA) { out += base; i += 2; continue; }
        // 該方案不表達的 matra 原樣保留爲殘碼，避免靜默丟失
        if (isMatra(nxt)) { out += base + (matraRev[nxt] ?? cps[i + 1]); i += 2; continue; }
        if (postSignRev[nxt] !== undefined) { out += base + "a" + postSignRev[nxt]; i += 2; continue; }
        out += base + "a"; i++; continue; // 尾輔音補固有 a（與前向「不補 virama」互逆）
      }
      if (c === ANUSVARA && postSignRev[ANUSVARA] !== undefined) { out += postSignRev[ANUSVARA]; i++; continue; }
      if (c === VISARGA && postSignRev[VISARGA] !== undefined) { out += postSignRev[VISARGA]; i++; continue; }
      if (c === CANDRABINDU && postSignRev[CANDRABINDU] !== undefined) { out += postSignRev[CANDRABINDU]; i++; continue; }
      if (c === VIRAMA && standSignRev[VIRAMA] !== undefined) { out += standSignRev[VIRAMA]; i++; continue; }
      if (c >= 0x0966 && c <= 0x096f) { out += DEVA_DIGITS[c]; i++; continue; }
      out += cps[i]; i++;
    }
    return out;
  }
  function looksLikeRoman(t: string): boolean {
    return !looksLikeDevanagari(t) && /\S/.test(t) && order.some((tok) => t.includes(tok));
  }
  function buildCharTable(): CharTableEntry[] {
    const rows: CharTableEntry[] = [];
    for (const [tok, v] of Object.entries(def.cons)) rows.push({ native: cp(v), roman: tok, note: "輔音基底（ka＝क；合字中 k 不帶 a）", section: "輔音" });
    for (const [tok, v] of Object.entries(def.vowelIndep)) {
      const m = def.matra[tok];
      rows.push({ native: cp(v) + (m ? cp(m) : ""), roman: tok, note: m ? "獨立元音 + matra" : "元音 a（固有 a，不輸出 matra）", section: "元音" });
    }
    for (const [tok, v] of Object.entries(def.postSign)) rows.push({ native: cp(v), roman: tok, note: "尾附符號（base+a+token）", section: "符號" });
    for (const [tok, v] of Object.entries(def.standSign)) {
      // virama 在「固有 a 顯式寫出」範式下由拼寫層自動產生（k＝क्），無獨立
      // 羅馬字形可比對，故按 IAST 檢字表慣例記爲注解條目（否則會被一致性測試
      // 當成錯映射）。
      if (v === VIRAMA) rows.push({ native: cp(v), roman: "（合字／詞尾不寫 a）", note: `virama（${tok} 亦可顯式輸入）`, section: "符號" });
      else rows.push({ native: cp(v), roman: tok, note: "獨立符號", section: "符號" });
    }
    for (const [tok, v] of Object.entries(def.ext ?? {})) rows.push({ native: v.map(cp).join(""), roman: tok, note: "擴展字母", section: "擴展" });
    return rows;
  }
  const scheme: TransliterationScheme = {
    id: meta.id,
    label: meta.label,
    hiddenFromPicker: meta.hiddenFromPicker,
    escAnnotationToken: meta.escAnnotationToken,
  romanKeepChars: meta.romanKeepChars,
    group: "sanskrit",
    primary: false,
    altOf: meta.altOf,
    description: meta.description,
    romanToNative,
    nativeToRoman,
    looksLikeNative: looksLikeDevanagari,
    looksLikeRoman,
    convert: (i) => (looksLikeDevanagari(i) ? nativeToRoman(i) : romanToNative(i)),
    charTable: buildCharTable(),
  };
  return scheme;
}

/* ---------------- Velthuis（Thomas Velthuis，1983；ASCII，LaTeX/devanāgarī） ---------------- */
const VELTHUIS_DEF: AsciiSchemeDef = {
  cons: {
    "k": 0x0915, "kh": 0x0916, "g": 0x0917, "gh": 0x0918, '"n': 0x0919,
    "c": 0x091a, "ch": 0x091b, "j": 0x091c, "jh": 0x091d, "~n": 0x091e,
    ".t": 0x091f, ".th": 0x0920, ".d": 0x0921, ".dh": 0x0922, ".n": 0x0923,
    "t": 0x0924, "th": 0x0925, "d": 0x0926, "dh": 0x0927, "n": 0x0928,
    "p": 0x092a, "ph": 0x092b, "b": 0x092c, "bh": 0x092d, "m": 0x092e,
    "y": 0x092f, "r": 0x0930, "l": 0x0932, "v": 0x0935,
    '"s': 0x0936, ".s": 0x0937, "s": 0x0938, "h": 0x0939,
    // ळ：sanscript / lipyantara 的 Velthuis 表作 L（本版從之；另有 La 寫法）。
    "L": 0x0933,
  },
  vowelIndep: {
    "a": 0x0905, "aa": 0x0906, "i": 0x0907, "ii": 0x0908, "u": 0x0909, "uu": 0x090a,
    "e": 0x090f, "ai": 0x0910, "o": 0x0913, "au": 0x0914,
    ".r": 0x090b, ".rr": 0x0960, ".R": 0x0960, ".l": 0x090c, ".ll": 0x0961, ".L": 0x0961,
  },
  matra: {
    "a": 0, "aa": 0x093e, "i": 0x093f, "ii": 0x0940, "u": 0x0941, "uu": 0x0942,
    "e": 0x0947, "ai": 0x0948, "o": 0x094b, "au": 0x094c,
    ".r": 0x0943, ".rr": 0x0944, ".R": 0x0944, ".l": 0x0962, ".ll": 0x0963, ".L": 0x0963,
  },
  // candrabindu：依 Velthuis 原規範（INRIA devnag 手冊："／ transcribes a candrabindu"）
  // 作「/」；sanscript 的 ~m 爲相容輸入別名。postSignRev 取最後寫入者，故 / 置末使輸出爲 /。
  // sanscript 的 Velthuis 表把 candrabindu 寫作 ~m、ॠ 寫作 .rr、ॡ 寫作 .ll，
  // 均與 Velthuis 原規範（/、.R、.L）不符；本版回正並保留 sanscript 形式作輸入別名。
  postSign: { ".m": 0x0902, ".h": 0x0903, "~m": 0x0901, "/": 0x0901 },
  standSign: { "&": 0x094d, ".a": 0x093d, "O": 0x0950 },
};
const sanskritVelthuis = makeAsciiScheme(VELTHUIS_DEF, {
  id: "sanskrit-velthuis",
  // velthuis roman 的 dot 標記（.m/.n/.t 等）與雙撇號（quote-s）是詞內音標，掃描層不作詞界
  romanKeepChars: '."',

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: { zh: "梵文 Velthuis（ASCII）", "zh-TW": "梵文 Velthuis（ASCII）", ja: "梵字 Velthuis（ASCII）", ko: "범어 Velthuis(ASCII)", en: "Sanskrit (Velthuis)", bo: "སང་སྐྲིད་(Velthuis)", ug: "سانسكرىت (Velthuis)", fr: "Sanskrit (Velthuis)", de: "Sanskrit (Velthuis)", },
  description: "Velthuis（1983，ASCII）：長元音雙寫（aa/ii/uu）、聲化元音 .R/.L（.rr/.ll 相容）、送氣 kh 用小寫 h、捲舌 .t/.th/.d/.dh/.n、ś=\"s、ṣ=.s、ळ=L；anusvāra .m、visarga .h、candrabindu /（~m 相容）、avagraha .a。固有 a 顯式寫出（ka＝क、k＝क्），可無損往返。",
  altOf: "sanskrit-iast",
  hiddenFromPicker: true,
});

/* ---------------- WX notation（IIT Kanpur；NLP 事實標準，前綴碼） ---------------- */
const WX_DEF: AsciiSchemeDef = {
  cons: {
    "k": 0x0915, "K": 0x0916, "g": 0x0917, "G": 0x0918, "f": 0x0919,
    "c": 0x091a, "C": 0x091b, "j": 0x091c, "J": 0x091d, "F": 0x091e,
    "t": 0x091f, "T": 0x0920, "d": 0x0921, "D": 0x0922, "N": 0x0923,
    "w": 0x0924, "W": 0x0925, "x": 0x0926, "X": 0x0927, "n": 0x0928,
    "p": 0x092a, "P": 0x092b, "b": 0x092c, "B": 0x092d, "m": 0x092e,
    "y": 0x092f, "r": 0x0930, "l": 0x0932, "v": 0x0935,
    "S": 0x0936, "R": 0x0937, "s": 0x0938, "h": 0x0939,
    "lY": 0x0933,
  },
  vowelIndep: {
    "a": 0x0905, "A": 0x0906, "i": 0x0907, "I": 0x0908, "u": 0x0909, "U": 0x090a,
    "e": 0x090f, "E": 0x0910, "o": 0x0913, "O": 0x0914,
    "q": 0x090b, "Q": 0x0960, "L": 0x090c,
  },
  matra: {
    "a": 0, "A": 0x093e, "i": 0x093f, "I": 0x0940, "u": 0x0941, "U": 0x0942,
    "e": 0x0947, "E": 0x0948, "o": 0x094b, "O": 0x094c,
    "q": 0x0943, "Q": 0x0944, "L": 0x0962,
  },
  postSign: { "M": 0x0902, "H": 0x0903, "z": 0x0901 },
  // avagraha(ऽ)＝「Z」：WX 原始規範（Bharati/Chaitanya/Sangal 1996《NLP: A Paninian
  // Perspective》附錄 B）明定 avagraha ＝ Z，例 वमतोऽन्तः ＝ vamawoZnwaH。「'」亦作輸入
  // 容許（部分實作如 sanscript 用 '），但**輸出依規範取 Z**。standSignRev 取最後寫入者，
  // 故把 Z 放最後使其成為輸出別名。注意 Z 同時是 nukta 算子（क़＝kZa）：解析器對
  // kZa 等多碼點 ext 採最長匹配（order 按長度降序），故 kZa→क़ 與 kaZa→कऽअ 不會混淆。
  // 〔審計記錄〕曾依 sanscript 的 WX 表把本處改成僅「'」，但 sanscript 的 WX 表本身
  // 不合規（ळ 作 l̤a 而非 lY、ऎ 作 è 而非 eV、nukta 漏天城體），故其「'」不可作權威；
  // 依原始規範回退為 Z。
  standSign: { "'": 0x093d, "Z": 0x093d },
  // 注意：U+0958（क़）屬 Unicode「組合排除」字符——NFC 會把它**拆回**
  // क + nukta(U+093C) 而不重組，故本處以分解形建表，才能與引擎的
  // normalize("NFC") 對齊（實測：0x0958 入 → NFC → 0915 093C）。
  ext: { "eV": [0x090e], "kZa": [0x0915, 0x093c] },
};
const sanskritWx = makeAsciiScheme(WX_DEF, {
  id: "sanskrit-wx",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: { zh: "梵文 WX（ASCII）", "zh-TW": "梵文 WX（ASCII）", ja: "梵字 WX（ASCII）", ko: "범어 WX(ASCII)", en: "Sanskrit (WX)", bo: "སང་སྐྲིད་(WX)", ug: "سانسكرىت (WX)", fr: "Sanskrit (WX)", de: "Sanskrit (WX)", },
  description: "WX notation（IIT Kanpur）：前綴碼、每音素單 token。小寫＝無送氣／短元音、大寫＝送氣／長元音；捲舌 t/T/d/D/N、齒音 w/W/x/X/n；ś=S、ṣ=R；anusvāra M、visarga H、candrabindu z、avagraha Z（依 WX 規範；' 亦接受）、nukta Z（क़=kZa，與 avagraha 同符但作前置算子）；ळ=lY。大小寫敏感，可無損往返。",
  altOf: "sanskrit-iast",
  hiddenFromPicker: true,
});

/* ---------------- National Library at Kolkata（NLK；IAST 延伸） ---------------- */
const KOLKATA_DEF: AsciiSchemeDef = {
  cons: {
    "k": 0x0915, "kh": 0x0916, "g": 0x0917, "gh": 0x0918, "ṅ": 0x0919,
    "c": 0x091a, "ch": 0x091b, "j": 0x091c, "jh": 0x091d, "ñ": 0x091e,
    "ṭ": 0x091f, "ṭh": 0x0920, "ḍ": 0x0921, "ḍh": 0x0922, "ṇ": 0x0923,
    "t": 0x0924, "th": 0x0925, "d": 0x0926, "dh": 0x0927, "n": 0x0928,
    "p": 0x092a, "ph": 0x092b, "b": 0x092c, "bh": 0x092d, "m": 0x092e,
    "y": 0x092f, "r": 0x0930, "l": 0x0932, "v": 0x0935,
    "ś": 0x0936, "ṣ": 0x0937, "s": 0x0938, "h": 0x0939,
    "ḻ": 0x0933,
  },
  vowelIndep: {
    "a": 0x0905, "ā": 0x0906, "i": 0x0907, "ī": 0x0908, "u": 0x0909, "ū": 0x090a,
    // 依 sanscript 的 kolkata_v2：聲化元音 ऋ ṛ / ॠ ṝ / ऌ ḷ / ॡ ḹ 齊備
    "ṛ": 0x090b, "ṝ": 0x0960, "ḷ": 0x090c, "ḹ": 0x0961,
    "ē": 0x090f, "ai": 0x0910, "ō": 0x0913, "au": 0x0914,
  },
  matra: {
    "a": 0, "ā": 0x093e, "i": 0x093f, "ī": 0x0940, "u": 0x0941, "ū": 0x0942,
    "ṛ": 0x0943, "ṝ": 0x0944, "ḷ": 0x0962, "ḹ": 0x0963,
    "ē": 0x0947, "ai": 0x0948, "ō": 0x094b, "au": 0x094c,
  },
  // candrabindu：NLK / sanscript kolkata_v2 作「~」，故輸出採 ~；ṁ 保留為輸入別名。
  // 注意順序：makeAsciiScheme 的 postSignRev 取最後寫入者，故把 ~ 放最後使輸出為 ~。
  postSign: { "ṃ": 0x0902, "ḥ": 0x0903, "ṁ": 0x0901, "~": 0x0901 },
  standSign: { "'": 0x093d },
};
const sanskritKolkata = makeAsciiScheme(KOLKATA_DEF, {
  id: "sanskrit-kolkata",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: { zh: "梵文 Kolkata（NLK）", "zh-TW": "梵文 Kolkata（NLK）", ja: "梵字 Kolkata（NLK）", ko: "범어 Kolkata(NLK)", en: "Sanskrit (Nat. Lib. Kolkata)", bo: "སང་སྐྲིད་(Kolkata)", ug: "سانسكرىت (Kolkata)", fr: "Sanskrit (Nat. Lib. Kolkata)", de: "Sanskrit (Nat. Lib. Kolkata)", },
  description: "National Library at Kolkata（NLK）：IAST 延伸——ए→ē、ओ→ō、anusvāra ṃ、visarga ḥ、candrabindu ṁ、ळ→ḻ；聲化元音 ṛ/ṝ/ḷ/ḹ 齊備。固有 a 顯式寫出（ka＝क、k＝क्），可無損往返。",
  altOf: "sanskrit-iast",
  hiddenFromPicker: true,
});

/* ---------------- SLP1（Sanskrit Library Phonetic Basic；Cologne 詞典編碼） ---------------- */
const SLP1_DEF: AsciiSchemeDef = {
  cons: {
    "k": 0x0915, "K": 0x0916, "g": 0x0917, "G": 0x0918, "N": 0x0919,
    // ञ：SLP1 作 Y（Cologne iast-slp1 表「Y」→ñ，sanscript slp1 同）
    "c": 0x091a, "C": 0x091b, "j": 0x091c, "J": 0x091d, "Y": 0x091e,
    "w": 0x091f, "W": 0x0920, "q": 0x0921, "Q": 0x0922, "R": 0x0923,
    "t": 0x0924, "T": 0x0925, "d": 0x0926, "D": 0x0927, "n": 0x0928,
    "p": 0x092a, "P": 0x092b, "b": 0x092c, "B": 0x092d, "m": 0x092e,
    "y": 0x092f, "r": 0x0930, "l": 0x0932, "v": 0x0935,
    "S": 0x0936, "z": 0x0937, "s": 0x0938, "h": 0x0939,
    "L": 0x0933,
  },
  vowelIndep: {
    "a": 0x0905, "A": 0x0906, "i": 0x0907, "I": 0x0908, "u": 0x0909, "U": 0x090a,
    "f": 0x090b, "F": 0x0960, "x": 0x090c, "X": 0x0961,
    "e": 0x090f, "E": 0x0910, "o": 0x0913, "O": 0x0914,
  },
  matra: {
    "a": 0, "A": 0x093e, "i": 0x093f, "I": 0x0940, "u": 0x0941, "U": 0x0942,
    "f": 0x0943, "F": 0x0944, "x": 0x0962, "X": 0x0963,
    "e": 0x0947, "E": 0x0948, "o": 0x094b, "O": 0x094c,
  },
  postSign: { "M": 0x0902, "H": 0x0903, "~": 0x0901 },
  standSign: { "'": 0x093d },
};
const sanskritSlp1 = makeAsciiScheme(SLP1_DEF, {
  id: "sanskrit-slp1",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: { zh: "梵文 SLP1（Cologne）", "zh-TW": "梵文 SLP1（Cologne）", ja: "梵字 SLP1（Cologne）", ko: "범어 SLP1(Cologne)", en: "Sanskrit (SLP1)", bo: "སང་སྐྲིད་(SLP1)", ug: "سانسكرىت (SLP1)", fr: "Sanskrit (SLP1)", de: "Sanskrit (SLP1)", },
  description: "SLP1（Sanskrit Library Phonetic Basic）：Cologne/Monier-Williams 辭典內部編碼。大小寫敏感：k≠K、t≠T≠w≠W、f≠F≠x≠X、l≠L；ṅ=N、ñ=Y、ṇ=R、ṭ=w、ḍ=q、ळ=L、ś=S、ṣ=z。candrabindu ~、avagraha '。固有 a 顯式寫出（ka＝क、k＝क्），可無損往返。",
  altOf: "sanskrit-iast",
  hiddenFromPicker: true,
});

registerScheme(sanskritVelthuis);
registerScheme(sanskritWx);
registerScheme(sanskritKolkata);
registerScheme(sanskritSlp1);

/* ============================================================================
 * 蘭札體（Rañjanā / Lantsa）IAST 方案
 * ----------------------------------------------------------------------------
 * 蘭札體尚無標準 Unicode（L2/2023-23028 提案審議中）；本插件內嵌的
 * Nithya Ranjana DU 字型採 **Devanagari 碼位（U+0900–U+097F）** 存梵文、
 * 由字型渲染爲蘭札字形。故本方案的輸出碼位與 sanskrit-iast 完全相同，
 * 引擎直接復用 indic.ts 已驗證的天城體拼寫層（元音符號、virama 合字、
 * 連聲 avagraha 三態、常見連拼全數繼承），不重寫、不重映射。
 *
 * 爲何仍獨立註冊（而非只靠 SCRIPT_PREFERRED_SCHEME 預選）：
 *  - 檢字表分組需有「蘭札」自己的分組與 primary 方案，設定 UI 的
 *    文種字體棧（Nithya Ranjana DU）才能對齐到本組（SCHEME_GROUP_SCRIPT）；
 *  - 方案 label 明示「經 Devanagari 碼位＋內嵌字型」，用戶不會誤以爲
 *    輸出是 Unicode 蘭札碼位。
 * 取捨：與 sanskrit-iast 輸出碼位相同 → 兩方案 convert 互為同構，此爲
 * 既有碼位承載方式（Devanagari 代碼位）的必然結果，已記入檔頭註釋。
 * ========================================================================== */
const RANJANA_LABEL = {
  zh: "兰札体 IAST（Devanagari 码位）",
  "zh-TW": "蘭札體 IAST（Devanagari 碼位）",
  en: "Lantsa / Rañjanā (IAST, Devanagari codepoints)",
  sa: "रञ्जना",
};

const ranjanaIast: TransliterationScheme = {
  id: "ranjana-iast",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: RANJANA_LABEL,
  group: "ranjana",
  primary: true,
  description:
    "蘭札體 ↔ IAST：蘭札體尚無標準 Unicode，輸出走 Devanagari 碼位（U+0900–U+097F），由內嵌 Nithya Ranjana DU 字型渲染爲蘭札字形；拼寫引擎與 sanskrit-iast 同構（元音符號、virama 合字、連聲 avagraha）。",
  romanToNative: (i, o) => iastToDevanagari(i, { ...o, mode: "iast" }),
  nativeToRoman: (i, o) => devanagariToIast(i, { ...o, mode: "iast" }),
  looksLikeNative: looksLikeDevanagari,
  looksLikeRoman: looksLikeIast,
  convert: (i, o) => convertSanskrit(i, { ...o, mode: "iast" }),
  charTable,
};

registerScheme(ranjanaIast);
