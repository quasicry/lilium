// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * Marchen（སྨར་ཆེན་，U+11C70–U+11CBF）↔ Wylie 式拉丁轉寫
 * （純函數，無 Obsidian 依賴）。
 *
 * 【歷史地位】苯教傳統文字，用於書寫藏語與已消亡的象雄語（Zhang-zhung）。
 *  源自藏文，Unicode 9.0（2016）編碼。倖存古文獻極少（一枚 Tsurpu 寺印章、
 *  Dolanji gYung-drung Bon 寺銘文等），現代苯教文獻仍使用。
 *
 * 【羅馬字標準】Wylie 同構映射：Marchen 三十輔音與藏文字母一一對應
 *  （N4491 Comparative Table：ka↔ཀ、kha↔ཁ…），故轉寫鍵直接沿用
 *  Wylie（1959 學界標準）——ka kha ga nga ca cha ja nya ta tha da na
 *  pa pha ba ma tsa tsha dza wa zha za 'a ya ra la sha sa ha a。
 *
 * 【核心差異：無 tshek】與藏文相反，Marchen **不用音節分隔符**
 *  （N4491 原文：「Unlike the Tibetan script, a tsheg mark is not used to
 *  separate syllables…It is suggested that U+200B Zero Width Space be used」；
 *  Unicode 18 Core Spec §14.5 重申）。設計裁定：
 *  - roman→native：Wylie 空格（音節邊界）→ U+200B ZWSP；
 *  - native→roman：ZWSP → 空格；無 ZWSP 的連寫串按「基輔音帶隱含 a、
 *    元音符覆寫」逐碼位輸出，**不做音節強切分**（正字寬鬆，切分歧義
 *    不破壞往返無損——碼位級一一映射，語義切分留給讀者/歧義面板）。
 *
 * 【疊字模型】隱式（stackModel: implicit）：下加輔音為獨立碼位
 *  U+11C92–U+11CAF（30 個，11CA8 未賦值），romen 端以藏文 Wylie 同構的
 *  `+X` 後綴表示。上下文無需顯式連接符（對照 Zanabazar U+11A47 顯式模型）。
 *
 * 【標點】11C70 head mark（=藏文 0F04 ༄）、11C71 shad（=藏文 0F0D །）。
 *  roman 端沿用藏文慣例 `||`（yig mgo）/`|`（shad）？不——八思巴已用
 *  `||`/`|` 表 danda；Marchen 採 `<hm>`/`<sh>` 標記避免歧義（Wylie 無
 *  官方 head mark 轉寫，擴展標記與藏文 ext 的 ⟨…⟩ 哲學一致）。
 *
 * 【碼位依據】Unicode 18.0.0 NamesList 11C70 節逐碼位核對。
 * 字體：Noto Sans Marchen（SIL OFL 1.1，隨插件內嵌）。
 */

import {
  registerScheme,
  type CharTableEntry,
  type TransliterationOptions,
  type TransliterationScheme,
} from "./translit-common";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 字母表（Wylie 鍵 → Marchen 碼位） ---------------- */

/** 三十基輔音：11C72–11C8F，與藏文字母序一一對應 */
const BASE_CP: Record<string, number> = {
  "ka": 0x11c72, "kha": 0x11c73, "ga": 0x11c74, "nga": 0x11c75,
  "ca": 0x11c76, "cha": 0x11c77, "ja": 0x11c78, "nya": 0x11c79,
  "ta": 0x11c7a, "tha": 0x11c7b, "da": 0x11c7c, "na": 0x11c7d,
  "pa": 0x11c7e, "pha": 0x11c7f, "ba": 0x11c80, "ma": 0x11c81,
  "tsa": 0x11c82, "tsha": 0x11c83, "dza": 0x11c84, "wa": 0x11c85,
  "zha": 0x11c86, "za": 0x11c87, "'a": 0x11c88, "ya": 0x11c89,
  "ra": 0x11c8a, "la": 0x11c8b, "sha": 0x11c8c, "sa": 0x11c8d,
  "ha": 0x11c8e, "a": 0x11c8f,
};

/** 三十下加輔音：11C92–11CAF（11CA8 未賦值 gap），序與基輔音對應 */
const SUBJOINED_CP: Record<string, number> = {
  "ka": 0x11c92, "kha": 0x11c93, "ga": 0x11c94, "nga": 0x11c95,
  "ca": 0x11c96, "cha": 0x11c97, "ja": 0x11c98, "nya": 0x11c99,
  "ta": 0x11c9a, "tha": 0x11c9b, "da": 0x11c9c, "na": 0x11c9d,
  "pa": 0x11c9e, "pha": 0x11c9f, "ba": 0x11ca0, "ma": 0x11ca1,
  "tsa": 0x11ca2, "tsha": 0x11ca3, "dza": 0x11ca4, "wa": 0x11ca5,
  "zha": 0x11ca6, "za": 0x11ca7, "ya": 0x11ca9, "ra": 0x11caa,
  "la": 0x11cab, "sha": 0x11cac, "sa": 0x11cad, "ha": 0x11cae,
  "a": 0x11caf,
};

/** 下加輔音碼位 → Wylie 鍵（nativeToRoman 用） */
const SUBJOINED_REV: Record<number, string> = {};
for (const [k, v] of Object.entries(SUBJOINED_CP)) SUBJOINED_REV[v] = k;

/** 基輔音碼位 → Wylie 鍵 */
const BASE_REV: Record<number, string> = {};
for (const [k, v] of Object.entries(BASE_CP)) BASE_REV[v] = k;

/** 元音符：11CB0–11CB4。Wylie 慣例：i/u/e/o；aa＝AA 元音符號（U+11CB0），與 a-chung（U+11C88 LETTER -A）不同。 */
const VOWEL_CP: Record<string, number> = {
  "aa": 0x11cb0, "i": 0x11cb1, "u": 0x11cb2, "e": 0x11cb3, "o": 0x11cb4,
};
const VOWEL_REV: Record<number, string> = {};
for (const [k, v] of Object.entries(VOWEL_CP)) VOWEL_REV[v] = k;

/** 鼻音附標：11CB5 anusvara ṃ、11CB6 candrabindu m̈（Wylie 同藏文慣例 ṃ / m̈? ——
 *  藏文 ext 用 ṃ（anusvara）；candrabindu 藏文 Wylie 慣例亦作 ṃ，此處以
 *  `ṃ`＝anusvara、`m̐`＝candrabindu 區分（組合符，鍵入可還原）。 */
const SIGN_CP: Record<string, number> = { "ṃ": 0x11cb5, "m̐": 0x11cb6 };
const SIGN_REV: Record<number, string> = {};
for (const [k, v] of Object.entries(SIGN_CP)) SIGN_REV[v] = k;

/** 數字：Marchen 無獨立數字系統，文獻沿用藏文數字 U+0F20–U+0F29
 *  （官方 Aksharamukha marchen 方案同此映射）。roman 端 ↔ ASCII 0–9
 *  （比照藏文擴展方案 tibetan-wylie 的數字慣例：TIB_DIGIT_TO_ASCII）。 */
const DIGIT_CP: Record<string, number> = {};
for (let d = 0; d <= 9; d++) DIGIT_CP[String(d)] = 0x0f20 + d;
const DIGIT_REV: Record<number, string> = {};
for (const [k, v] of Object.entries(DIGIT_CP)) DIGIT_REV[v] = k;

/** 標點：head mark `<hm>`、shad `<sh>`（Wylie 無官方轉寫，擴展標記） */
const PUNCT_CP: Record<string, number> = { "<hm>": 0x11c70, "<sh>": 0x11c71 };
const PUNCT_REV: Record<number, string> = {};
for (const [k, v] of Object.entries(PUNCT_CP)) PUNCT_REV[v] = k;

/** 碼位 → 最長匹配 token 表（native→roman 的反向索引，一次建成） */
const NATIVE_REV: Record<number, string> = {
  ...BASE_REV,
  ...VOWEL_REV,
  ...SIGN_REV,
  ...PUNCT_REV,
  ...DIGIT_REV,
  ...Object.fromEntries(Object.entries(SUBJOINED_REV).map(([cpStr, key]) => [Number(cpStr), `+${key}`])),
};

/** 音節邊界（ZWSP，N4491 官方建議） */
const ZWSP = "\u200b";

/* ---------------- roman → native ---------------- */

/**
 * Wylie 式羅馬字 → Marchen Unicode。
 * 語法：輔音 token（最長匹配，ka…a；'a 的撇號）；`+X` 下加；元音 i/u/e/o/aa；
 * ṃ/m̐ 鼻音；`<hm>`/`<sh>` 標點；空格 → ZWSP（音節邊界，N4491 官方建議）；
 * 換行原樣。未知 token 透傳（罕見字符策略：不丟失、不亂碼）。
 */
export function marchenRomanToNative(input: string, _opts?: TransliterationOptions): string {
  // 建最長匹配詞典：輔音（含 'a）＋元音＋鼻音＋標點
  const TOKENS: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(BASE_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(VOWEL_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(SIGN_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(PUNCT_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(DIGIT_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(SUBJOINED_CP)) TOKENS.push([`+${k}`, cp(v)]);
  // 最長優先（kha 先於 ka、+kha 先於 +ka、<hm> 整體）
  TOKENS.sort((a, b) => b[0].length - a[0].length);
  const lookup = new Map(TOKENS);

  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " ") {
      // 詞/音節邊界 → ZWSP（N4491 官方建議）
      out += ZWSP;
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\t" || ch === "\r") {
      out += ch;
      i++;
      continue;
    }
    let matched = false;
    // 嘗試最長匹配（上限 8：+tsha / <hm>）
    for (let L = Math.min(8, input.length - i); L >= 1; L--) {
      const t = lookup.get(input.slice(i, i + L));
      if (t !== undefined) {
        out += t;
        i += L;
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (ch === "+") {
        // '+' 只屬下加語法；'+' 後非下加 token（如 ka+i+ra 的 '+i'、裸 '+++'）＝
        // 畸形序列——吞 '+' 直出後續 token（Zanabazar 同構先例 r-h：SUBJ 後非輔音
        // broken cluster，字面 '+' 殘留 native 為渲染缺陷，故不透傳）。
        i++;
        continue;
      }
      out += ch; // 透傳（罕見字符策略）
      i++;
    }
  }
  return out;
}

/* ---------------- native → roman ---------------- */

/**
 * Marchen Unicode → Wylie 式羅馬字。
 * 逐碼位映射（基輔音/下加/元音/鼻音/標點），ZWSP → 空格，
 * 區塊外字符透傳。不做音節強切分（無 tshek 語言，切分歧義不影響往返無損）。
 */
export function marchenNativeToRoman(input: string, _opts?: TransliterationOptions): string {
  let out = "";
  let prevSj = false; // 前一碼位是否為下加輔音（11C92–11CAF，11CA8 未賦值）
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x200b) {
      out += " ";
      prevSj = false;
      continue;
    }
    const t = NATIVE_REV[c];
    // 出向 '+' 分界（入向「吞 +」鏡像；Zanabazar r-i ② 同構）：下加後接元音/鼻音
    // 附標時補 '+'（⟨ka,SJ-ra,I⟩→ka+ra+i 規範形式，防 '+rai' 黏連）。
    const isVowelOrSign = c in VOWEL_REV || c in SIGN_REV;
    if (isVowelOrSign && prevSj) out += "+";
    out += t ?? ch;
    prevSj = c >= 0x11c92 && c <= 0x11caf;
  }
  return out;
}

/* ---------------- 自動方向判定 ---------------- */

/** 是否像 Marchen 原生文字（11C70 區塊任一碼位，含 ZWSP 跟隨判定） */
export function looksLikeMarchen(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x11c70 && c <= 0x11cb6) return true; // 0x11CB7–11CBF 未分配（Cn），不納入
  }
  return false;
}

const WYLISH_MARCHEN_RE = /(^|\s|[-+])(ka|kha|ga|nga|ca|cha|ja|nya|ta|tha|da|na|pa|pha|ba|ma|tsa|tsha|dza|wa|zha|za|'a|ya|ra|la|sha|sa|ha|a)(?=\s|$|[-+])/; // B9：字元類內 + 無需跳脫、- 移至首位

/** 是否像 Marchen/Wylie 式羅馬字（含 Marchen 專有 `<hm>`/`<sh>` 標記） */
export function looksLikeMarchenRoman(text: string): boolean {
  if (/<(hm|sh)>/.test(text)) return true;
  if (!/[a-z'+]/i.test(text)) return false;
  return WYLISH_MARCHEN_RE.test(text);
}

/* ---------------- 轉寫總入口 ---------------- */

export function convertMarchen(text: string, opts?: TransliterationOptions): string {
  return looksLikeMarchen(text) ? marchenNativeToRoman(text, opts) : marchenRomanToNative(text, opts);
}

/* ---------------- 檢字表 ---------------- */

function buildMarchenCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  const sections: Array<[string, Record<string, number>]> = [
    ["輔音", BASE_CP],
    ["下加輔音", SUBJOINED_CP],
    ["元音符號", VOWEL_CP],
    ["各種符號", SIGN_CP],
    ["標點", PUNCT_CP],
  ];
  const notes: Record<string, string> = {
    "輔音": "三十基輔音 11C72–11C8F，與藏文字母一一對應（N4491 比較表）；Wylie 同構轉寫",
    "下加輔音": "三十下加形式 11C92–11CAF（11CA8 未賦值）；roman 端 `+X` 表示；隱式疊字模型（stackModel: implicit）",
    "元音符號": "11CB0 aa（AA 元音符號 U+11CB0，非 a-chung）＋11CB1–11CB4 i/u/e/o；附於基輔音覆寫隱含 a",
    "各種符號": "11CB5 anusvara ṃ、11CB6 candrabindu m̐",
    "標點": "11C70 head mark（=藏文 U+0F04 ༄）、11C71 shad（=藏文 U+0F0D །）",
  };
  for (const [sec, map] of sections) {
    let first = true;
    for (const [k, v] of Object.entries(map)) {
      // 檢字表審計：下加輔音真鍵為「+X」（SUBJOINED_CP 鍵 ka＝展示縮寫，
      // 面板輸入 ka 轉出基輔音 11C72 而非下加形——鍵列須與引擎實鍵一致）
      const roman = sec === "下加輔音" ? "+" + k : k;
      rows.push({
        native: cp(v),
        roman,
        note: first ? notes[sec] : undefined,
        section: sec,
      });
      first = false;
    }
  }
  rows.push({
    native: "—",
    roman: "（空格）",
    note: "音節邊界：roman 端空格 ↔ native 端 U+200B ZWSP（N4491 官方建議）。Marchen 無 tshek（音節分隔符）——與藏文的核心差異（Unicode 18 §14.5）",
    section: "拼寫規則",
  });
  rows.push({
    native: "—",
    roman: "+（疊字連接）",
    note: "音節尾輔音：Marchen 無 virama 碼位（U+11CA8 未賦值，N4XX2 確認文種無音節界符號）——裸 CVC 尾輔音（如 ran）無 Unicode 表達，屬文種限制；疊字請用 ra+na（下加連接）形式",
    section: "拼寫規則",
  });
  return rows;
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */

const marchenCharTable = buildMarchenCharTable();

const marchen: TransliterationScheme = {
  id: "marchen",
  label: {
    zh: "玛钦文（Wylie ↔ Unicode）",
    "zh-TW": "瑪欽文（Wylie ↔ Unicode）",
    en: "Marchen (Wylie ↔ Unicode)",
    bo: "སྨར་ཆེན(Wylie↔Unicode)",
    ug: "Marchen (Wylie↔Unicode)",
    mn: "Marchen (Wylie↔Unicode)",
    ja: "マチェン文字（Wylie ↔ Unicode）",
    ko: "마첸 문자(Wylie ↔ Unicode)",
    sa: "मार्चेन्(Wylie↔Unicode)",
    hi: "मार्चेन (Wylie↔Unicode)",
  fr: "Marchen (Wylie ↔ Unicode)", de: "Marchen (Wylie ↔ Unicode)", },
  group: "marchen",
  primary: true,
  description:
    "苯教 Marchen（U+11C70–U+11CBF）↔ Wylie 同構轉寫；無 tshek——音節邊界以 U+200B ZWSP 顯式化（N4491 官方建議）；下加輔音隱式疊字模型",
  romanToNative: (input: string, _opts?: TransliterationOptions) => marchenRomanToNative(input),
  nativeToRoman: (input: string, _opts?: TransliterationOptions) => marchenNativeToRoman(input),
  looksLikeNative: looksLikeMarchen,
  looksLikeRoman: looksLikeMarchenRoman,
  convert: (input: string, _opts?: TransliterationOptions) => convertMarchen(input),
  charTable: marchenCharTable,
  // 檢字表審計：下加輔音真鍵「+X」含詞界 trigger '+'，不聲明 tokenRe 會被
  // 面板切詞拆散原樣透傳。鍵集與 charTable 同源動態生成（最長優先、^…$ 錨定）。
  romanTokenRe: new RegExp(
    "^(?:" +
      marchenCharTable
        .map((r) => r.roman)
        .filter((r) => /^[+\-'<]/.test(r))
        .sort((a, b) => b.length - a.length)
        .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")$"
  ),
  // 與藏文同為隱式疊字模型（subjoined 獨立碼位 11C92–11CAF，無 subjoiner）
  stackModel: { mode: "implicit" },
};

registerScheme(marchen);
