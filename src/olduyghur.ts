// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 回鶻文（Old Uyghur）↔ 拉丁轉寫轉換器（純函數，無 Obsidian 依賴）。
 *
 * 編碼依據：Unicode 14.0（2021-09）新增區段 U+10F70–U+10FAF，共 26 個已分配碼位：
 * 18 字母 + 4 組合點 + 4 標點（U+10F8A–U+10FAF 保留未分配）。
 * 轉寫依據：Annemarie von Gabain, Anshuman Pandey, *Final proposal to encode Old Uyghur in Unicode*,
 * UTC L2/20-191（§6.6 字母表 Latin 欄、§8.1 元音、§8.2 加點區分）。
 *
 * 回鶻文源自粟特文草書，是蒙古文／滿文的祖先；屬「matres lectionis」式 abjad：
 * 𐽰 aleph / 𐽳 waw / 𐽶 yodh 既作輔音又作元音載體，靠二合、三合字母表記突厥語
 * 的八元音系統（a/ä、i/ï、o/u、ö/ü）。因此轉寫**不可能**做到「任意回鶻文 ↔ 任意
 * 拉丁拼寫」雙射——本方案與藏文 Wylie、維吾爾 ULY 採同一哲學：
 *   · 拉丁側用**規範形式**（a ä i o ö ī ū），native 側的多讀法歸一到規範形式；
 *   · 組合點預設按學界讀法輸出（q/ž），另提供 `dots:"mark"` 無損模式。
 * 詳見 docs/OLD-UYGHUR-RESEARCH.md。
 */

import {
  CharTableEntry,
  TransliterationScheme,
  TransliterationOptions,
  registerScheme,
} from "./translit-common";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 區段與碼位 ---------------- */

export const OLD_UYGHUR_FIRST = 0x10f70;
export const OLD_UYGHUR_LAST = 0x10faf;
const DOT_FIRST = 0x10f82;
const DOT_LAST = 0x10f85;
const PUNCT_FIRST = 0x10f86;
const PUNCT_LAST = 0x10f89;

/** 字母碼位（U+10F70–U+10F81） */
export const OU_LETTER = {
  ALEPH: 0x10f70,
  BETH: 0x10f71,
  GIMEL_HETH: 0x10f72,
  WAW: 0x10f73,
  ZAYIN: 0x10f74,
  FINAL_HETH: 0x10f75,
  YODH: 0x10f76,
  KAPH: 0x10f77,
  LAMEDH: 0x10f78,
  MEM: 0x10f79,
  NUN: 0x10f7a,
  SAMEKH: 0x10f7b,
  PE: 0x10f7c,
  SADHE: 0x10f7d,
  RESH: 0x10f7e,
  SHIN: 0x10f7f,
  TAW: 0x10f80,
  LESH: 0x10f81,
} as const;

/** 組合點碼位（U+10F82–U+10F85） */
export const OU_DOT = {
  ABOVE: 0x10f82,
  BELOW: 0x10f83,
  TWO_ABOVE: 0x10f84,
  TWO_BELOW: 0x10f85,
} as const;

/* ---------------- 基礎映射表 ---------------- */

/**
 * 拉丁 → 字母碼位（L2/20-191 §6.6 的 Latin 欄）。
 * 【調研裁定（l→LESH、δ→LAMEDH 不互換）】Pandey L2/20-191 原文實證：
 *  §6.6 字母表 Latin 欄逐行作「LAMEDH 𐽸 dual δ」「LESH 𐾁 dual l」；
 *  §5.1.6 明文「The letter 𐾁 represents the sound /l/」且 LESH 源自
 *  SOGDIAN LETTER LESH（U+10F44，'hooked r'，非 lamedh 變體）。
 *  故 l→LESH、δ→LAMEDH 與提案一致；學界另有以 lh/ł 記 LESH 之慣例（罕見鉤形
 *  字母的區別性轉寫），屬記法分歧非碼位互換，僅註明不改碼。
 */
const LATIN_TO_LETTER: Record<string, number> = {
  "ʾ": OU_LETTER.ALEPH,
  "β": OU_LETTER.BETH,
  "γ": OU_LETTER.GIMEL_HETH,
  w: OU_LETTER.WAW,
  z: OU_LETTER.ZAYIN,
  x: OU_LETTER.FINAL_HETH,
  y: OU_LETTER.YODH,
  k: OU_LETTER.KAPH,
  "δ": OU_LETTER.LAMEDH,
  m: OU_LETTER.MEM,
  n: OU_LETTER.NUN,
  s: OU_LETTER.SAMEKH,
  p: OU_LETTER.PE,
  c: OU_LETTER.SADHE,
  r: OU_LETTER.RESH,
  "š": OU_LETTER.SHIN,
  t: OU_LETTER.TAW,
  // d→TAW（L2/20-191 §5.1.16 實錘：「daleth is not a distinctive letter in Old Uyghur,
  // the name is used in reference to the phoneme /d/」——回鶻文無獨立 d 字母，/d/ 由
  // taw（t/d 兼表）書寫；L2/13-071 §4.2 yindam/yintam 寫本 t/d 混用為同一現象。
  // 反向 TAW→t（先到先得），d 僅輸入側別名，同 NG 別名單向哲學。
  d: OU_LETTER.TAW,
  l: OU_LETTER.LESH,
};

/** P2-6：ng/ŋ 的輸出序列（NUN + KAPH，n+g 學界轉寫之回鶻文正字） */
const NG_SEQUENCE = cp(OU_LETTER.NUN) + cp(OU_LETTER.KAPH);

/**
 * P2-6：鼻音叢輸入別名（L2/20-191 學界轉寫 n+g 以 NUN+KAPH 二合書寫，如
 * 「tängri」；ASCII 'g' 無專鍵、透傳即混入拉丁殘字，ŋ 無鍵透傳）。
 * 獨立於 LATIN_TO_LETTER：鍵表須維持「一碼位一鍵」的單射性（LETTER_TO_LATIN
 * 反查靠先到先得，若併入別名鍵會讓 ŋ 蓋過 n 的反查）。別名經 NG_ALIASES
 * 在單碼位鍵表**之前**比對（'ng' 長鍵天然優先於 n+g 分拆）。
 */
const NG_ALIASES: Record<string, string> = {
  ng: NG_SEQUENCE,
  "ŋ": NG_SEQUENCE,
};
const NG_ALIAS_KEYS = Object.keys(NG_ALIASES).sort((a, b) => b.length - a.length);

/** 字母碼位 → 拉丁（反查，含字母用途注釋於 buildOldUyghurCharTable） */
const LETTER_TO_LATIN: Record<string, string> = (() => {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(LATIN_TO_LETTER)) {
    // 別名鍵（d→TAW）不覆蓋主鍵反查：TAW 出向恆 t（t/d 兼表，主鍵為準）
    if (rev[cp(v)] === undefined) rev[cp(v)] = k;
  }
  return rev;
})();

/** 所有拉丁字母 token（含變音符號），最長在前 */
const LETTER_KEYS = Object.keys(LATIN_TO_LETTER).sort((a, b) => b.length - a.length);

/**
 * 「字母 + 組合點」的讀法與無點形式**不同**者（L2/20-191 §8.2）。
 * 僅收錄會改變讀音的兩組：詞尾 heth 加點讀 q（無點讀 x）、zayin 加兩點讀 ž（無點讀 z）。
 * 其餘加點（𐽺+點仍讀 n、𐽿+兩點仍讀 š、𐽲+點仍讀 γ）**不改變讀音**，
 * 因而不列於此：read 模式下它們會連同 `<dN>` 標記輸出，組合點信息不丟失
 * （若列於此表，反而會把點靜默丟掉——違反數據完整性原則）。
 */
const DOTTED_READ: Record<string, string> = {
  [cp(OU_LETTER.FINAL_HETH) + cp(OU_DOT.ABOVE)]: "q",
  [cp(OU_LETTER.FINAL_HETH) + cp(OU_DOT.TWO_ABOVE)]: "q",
  [cp(OU_LETTER.ZAYIN) + cp(OU_DOT.BELOW)]: "ž",
  [cp(OU_LETTER.ZAYIN) + cp(OU_DOT.TWO_BELOW)]: "ž",
};

/** 區分讀法的拉丁 token → 「字母 + 組合點」（轉回時寫標準加點形式） */
const READ_TO_DOTTED: Record<string, string> = {
  q: cp(OU_LETTER.FINAL_HETH) + cp(OU_DOT.TWO_ABOVE),
  "ž": cp(OU_LETTER.ZAYIN) + cp(OU_DOT.TWO_BELOW),
};

/** 組合點的無損標記（mark 模式）：與滿文 FVS 的 `<f1>`…`<f4>` 同一哲學 */
const DOT_MARK: Record<number, string> = {
  [OU_DOT.ABOVE]: "<d1>",
  [OU_DOT.BELOW]: "<d2>",
  [OU_DOT.TWO_ABOVE]: "<d3>",
  [OU_DOT.TWO_BELOW]: "<d4>",
};
const MARK_TO_DOT: Record<string, number> = {
  "<d1>": OU_DOT.ABOVE,
  "<d2>": OU_DOT.BELOW,
  "<d3>": OU_DOT.TWO_ABOVE,
  "<d4>": OU_DOT.TWO_BELOW,
};
const DOT_MARK_RE = /^<d([1-4])>/;

/* ---------------- 元音（matres lectionis） ---------------- */

const A = cp(OU_LETTER.ALEPH);
const W = cp(OU_LETTER.WAW);
const Y = cp(OU_LETTER.YODH);

/**
 * 元音 → 回鶻文（L2/20-191 §8.1）。
 * 詞首與詞中寫法不同：詞首需以 𐽰 aleph 起頭（除 ä 本身即單 aleph）。
 */
const VOWEL_INITIAL: Record<string, string> = {
  "ä": A,
  a: A + A,
  e: A + A,
  i: A + Y,
  "ï": A + Y,
  "ī": A + Y + Y,
  o: A + W,
  u: A + W,
  "ū": A + W + W,
  "ö": A + W + Y,
  "ü": A + W + Y,
};
const VOWEL_MEDIAL: Record<string, string> = {
  "ä": A,
  a: A,
  e: A,
  i: Y,
  "ï": Y,
  "ī": Y + Y,
  o: W,
  u: W,
  "ū": W + W,
  "ö": W + Y,
  "ü": W + Y,
};

/** 回鶻文元音序列 → 拉丁（最長優先；與上表互逆，故往返一致） */
const VOWEL_SEQ_TO_LATIN: [string, string][] = [
  [A + W + Y, "ö"],
  [A + Y + Y, "ī"],
  [A + W + W, "ū"],
  [A + A, "a"],
  [A + Y, "i"],
  [A + W, "o"],
  [Y + Y, "ī"],
  [W + Y, "ö"],
  [W + W, "ū"],
];

/** 元音載體字母（aleph / waw / yodh）：既可表元音，又可作輔音 */
const CARRIER = new Set([A, W, Y]);
/** 載體字母作輔音時的讀法 */
const CARRIER_CONSONANT: Record<string, string> = { [A]: "ʾ", [W]: "w", [Y]: "y" };
/** 載體字母作元音時的規範讀法 */
const CARRIER_VOWEL: Record<string, string> = { [A]: "a", [W]: "o", [Y]: "i" };

/** 是否爲「非載體」的純輔音字母（其後出現的載體字母應讀作元音） */
function isPlainConsonant(ch: string): boolean {
  return isOldUyghurLetter(ch) && !CARRIER.has(ch);
}

/**
 * 取 i 之前**第一個非組合點**字符。
 * 必須跳過組合點：𐽵𐾄𐽶（q + 兩點上 + 𐽶）中，𐽶 的前一個字符是組合點 𐾄，
 * 若直接判 isPlainConsonant(𐾄) 會得到 false，把 𐽶 誤讀成輔音 y（實測 qiz → qyz）。
 */
function prevBase(chars: string[], i: number): string {
  for (let j = i - 1; j >= 0; j--) {
    if (!isOldUyghurDot(chars[j])) return chars[j];
  }
  return "";
}

/** 拉丁元音 token（最長在前） */
const VOWEL_KEYS = Object.keys(VOWEL_INITIAL).sort((a, b) => b.length - a.length);

/* ---------------- 標點 ---------------- */

const LATIN_TO_PUNCT: Record<string, number> = {
  "|": 0x10f86,
  "||": 0x10f87,
  ":": 0x10f88,
  "::": 0x10f89,
};
const PUNCT_TO_LATIN: Record<string, string> = (() => {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(LATIN_TO_PUNCT)) rev[cp(v)] = k;
  return rev;
})();
const PUNCT_KEYS = Object.keys(LATIN_TO_PUNCT).sort((a, b) => b.length - a.length);

/* ---------------- 選項 ---------------- */

export type OldUyghurDotMode = "read" | "mark" | "strip";
export interface OldUyghurTranslitOptions {
  /**
   * 組合點處理策略：
   * - `read`（默認）：按學界讀法輸出（𐽵+點 → q、𐽴+點 → ž），最便於閱讀與引用；
   *   代價是「同讀異寫」的組合點被歸一（如 𐽺+點 → n，與 𐽺 同）。
   * - `mark`：組合點以 `<d1>`…`<d4>` 標記輸出，**往返完全無損**；
   * - `strip`：剝離組合點，只輸出基礎字母讀法。
   */
  dots?: OldUyghurDotMode;
  /**
   * 拉丁記法風格：
   * - `"canonical"`（默認）：L2/20-191 規範記法——q/ž/w/β/δ 風格，**現行行為不變**；
   * - `"gabain"`：von Gabain 學術慣例——
   *   q→q̈（U+0308）、ž→z̤（U+0324）、waw 輔音→v、δ→d。
   * 僅影響 R2N 出向；N2R 入向一律先經 gabainNormalize 預規範化（對 canonical
   * 記法輸入恒等，見下）。
   */
  style?: "canonical" | "gabain";
}
const dotModeOf = (opts?: OldUyghurTranslitOptions): OldUyghurDotMode =>
  (opts)?.dots ?? "read";

/* ---------------- 判定輔助 ---------------- */

function isOldUyghurLetter(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= OLD_UYGHUR_FIRST && c <= OU_LETTER.LESH;
}
function isOldUyghurDot(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= DOT_FIRST && c <= DOT_LAST;
}
function isOldUyghurPunct(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= PUNCT_FIRST && c <= PUNCT_LAST;
}

/** native 側：是否處於詞首（開頭／空白／標點之後） */
function nativeAtWordStart(chars: string[], i: number): boolean {
  if (i === 0) return true;
  const p = chars[i - 1];
  if (/\s/.test(p)) return true;
  if (isOldUyghurPunct(p)) return true;
  return false;
}

/** 拉丁側：是否處於詞首 */
function latinAtWordStart(chars: string[], i: number): boolean {
  if (i === 0) return true;
  const p = chars[i - 1];
  if (/[\s|.:;,!?()[\]{}"']/.test(p)) return true;
  return false;
}

/* ---------------- Annemarie von Gabain 記法預規範化 ---------------- */

/**
 * TL 欄（von Gabain 慣例）→ 引擎 canonical 記法的預規範化。
 *
 * 【恒等性保證】本函數只處理「引擎 canonical 記法不會產生的序列」——
 * 對既有 canonical 輸入逐字不變（鐵律：現行行為零變化）。逐項依據：
 *   1. ṭ（t+U+0323）→ t：Annemarie von Gabain 摩尼文 Tau 變體標記（konv 明文 Ausnahme）；
 *      字形身份層在 10F70 區無對應碼位（Unicode 合併），歸一到 t。
 *   2. q̈（q+U+0308）→ q：Annemarie von Gabain 讀法消歧標記＝引擎 q（heth+兩點上讀法）同義。
 *   3. z̤（z+U+0324）→ ž：Annemarie von Gabain 的 zayin 加兩下點讀 ž＝引擎 ž（zayin+兩點下）同義。
 *   4. k̈（k+U+0308）→ k：kaph 變體標記，讀法同 k。
 *   5. ḏ（d+U+0331）→ d：Annemarie von Gabain 雙寫強調記法之一（-ḏ-），剝變音符保 d。
 *   6. v → w：Annemarie von Gabain 以 v 記詞中 waw（yʿvyz→yavız 實證）；引擎記法無 v 字母，
 *      無撞鍵風險，此為唯一字母級替換。
 *   7. ʿ（U+02BF ayin）→ 剝：外語詞標記，引擎無對應碼位。
 *   8. ẖ（h+U+0331）→ 剝：Annemarie von Gabain 行填充符（konv 明文）。
 *   9. 孤立變音符（U+0307/0304/0308/0323/0324/0331 殘餘）→ 剝：清理殼。
 *  10. 雙寫強調 -x- → x：剝兩側連接號（konv：Doppelschreibung zur Emphase）。
 *
 * 【寫本現象標記】Annemarie von Gabain 的缺字/校勘符號（[....]、[**]、?、+ 行接續）屬編輯符號
 * 非語言內容——**保留在輸入串中**由主解析透傳（方括號/問號/加號非引擎 token），
 * 不在本函數剝除（用戶可自行清理）；此註釋僅記載定性。
 */
const GABAIN_COMBINING: Record<string, string> = {
  // t + U+0323 → t（Tau 變體歸一）
  "t\u0323": "t",
  // q + U+0308 → q（讀法消歧＝引擎 q）
  "q\u0308": "q",
  // z + U+0324 → ž（zayin 兩下點讀 ž）
  "z\u0324": "\u017e",
  // k + U+0308 → k
  "k\u0308": "k",
  // d + U+0331 → d
  "d\u0331": "d",
};

const GABAIN_ORPHAN_COMBINING = new Set(["\u0307", "\u0304", "\u0308", "\u0323", "\u0324", "\u0331"]);

function gabainNormalize(input: string): string {
  // 逐字符掃描：先吃「字母+組合變音符」組合，再處理孤兒變音符與 v→w。
  const chars = Array.from(input);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const nxt = chars[i + 1] ?? "";
    const pair = GABAIN_COMBINING[ch + nxt];
    if (pair !== undefined) {
      out += pair;
      i += 1;
      continue;
    }
    if (GABAIN_ORPHAN_COMBINING.has(nxt) && !GABAIN_ORPHAN_COMBINING.has(ch)) {
      // 字母後跟未被收錄的組合變音符：剝變音符保字母（保守：僅當組合無定義）
      out += ch;
      i += 1;
      continue;
    }
    if (GABAIN_ORPHAN_COMBINING.has(ch)) {
      // 孤兒變音符（前無字母或已處理）：剝
      continue;
    }
    if (ch === "\u02bf") continue; // ʿ ayin：剝
    if (ch === "v") { out += "w"; continue; } // Gabain waw 輔音
    out += ch;
  }
  return out;
}

/* ---------------- 拉丁 → 回鶻文 ---------------- */

/** 拉丁轉寫 → 回鶻文 Unicode */
export function latinToOldUyghur(input: string, _opts?: OldUyghurTranslitOptions): string {
  // 記法兼容——入口預規範化（對 canonical 記法輸入恒等，見 gabainNormalize 註釋）
  input = gabainNormalize(input);
  // 注：拉丁側不區分 dots 模式——`<d1>`…`<d4>` 標記在 read 模式下也會輸出
  // （用於保存「不改變讀音」的加點），故反向一律解析，否則往返丟點。
  // P1-1 性能修復：原實現在迴圈內 `chars.slice(i).join("")` 做全尾拷貝（O(n²)，
  // 10 萬字符同步凍結數十秒）。所有前綴鍵的最長長度為 4（DOT_MARK `<d1>`…`<d4>`），
  // 故只需取有界前視窗口 window（≤4 字符）做 startsWith / 正則匹配即可，
  // 複雜度降為 O(n)。MAX_KEY_LEN 由各鍵表自動推導，鍵表擴充時不必手改。
  const MAX_KEY_LEN = Math.max(
    ...PUNCT_KEYS.map((k) => k.length),
    ...VOWEL_KEYS.map((k) => k.length),
    ...LETTER_KEYS.map((k) => k.length),
    ...Object.keys(MARK_TO_DOT).map((k) => k.length),
  );
  const chars = Array.from(input.toLowerCase());
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const rest = chars.slice(i, i + MAX_KEY_LEN).join("");

    // 標點（|| / :: 優先）
    let matched = false;
    for (const key of PUNCT_KEYS) {
      if (rest.startsWith(key)) {
        out += cp(LATIN_TO_PUNCT[key]);
        i += key.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // 組合點標記 `<d1>`…`<d4>`：任何模式下都解析（read 模式下未改變讀音的
    // 加點也以此形式輸出，故反向必須能還原，否則往返丟點）
    if (chars[i] === "<") {
      const m = DOT_MARK_RE.exec(rest);
      if (m) {
        out += cp(MARK_TO_DOT[`<d${m[1]}>`]);
        i += m[0].length;
        continue;
      }
    }

    // 區分讀法：q → 𐽵+兩點上；ž → 𐽴+兩點下
    const dotted = READ_TO_DOTTED[chars[i]];
    if (dotted !== undefined) {
      out += dotted;
      i += 1;
      continue;
    }

    // 元音（詞首 / 詞中寫法不同）
    // P2-6：ng/ŋ 別名 → NUN+KAPH 序（須在元音與單碼位鍵表之前；'ng' 長鍵
    // 優先於 n+g 分拆，n+g 與 ng 同為 NUN+KAPH 故語義等價、往返無歧義）
    const ngHit = NG_ALIAS_KEYS.find((k) => rest.startsWith(k));
    if (ngHit !== undefined) {
      out += NG_ALIASES[ngHit];
      i += ngHit.length;
      continue;
    }
    let vk = "";
    for (const key of VOWEL_KEYS) {
      if (rest.startsWith(key)) { vk = key; break; }
    }
    if (vk && VOWEL_INITIAL[vk] !== undefined) {
      out += latinAtWordStart(chars, i) ? VOWEL_INITIAL[vk] : VOWEL_MEDIAL[vk];
      i += vk.length;
      continue;
    }

    // 輔音字母
    let lk = "";
    for (const key of LETTER_KEYS) {
      if (rest.startsWith(key)) { lk = key; break; }
    }
    if (lk) {
      out += cp(LATIN_TO_LETTER[lk]);
      i += lk.length;
      continue;
    }

    // P3-1：透傳亦用 lowered 形——全串已 toLowerCase，透傳若取原始 input[i]
    // 會造成大小寫混雜輸出（'TÄŋGRI'→'𐾀𐽰ŋG𐽾𐽶'）；統一取 chars[i] 保持一致。
    out += chars[i];
    i += 1;
  }
  return out;
}

/* ---------------- 回鶻文 → 拉丁 ---------------- */

/** 回鶻文 Unicode → 拉丁轉寫 */
export function oldUyghurToLatin(input: string, opts?: OldUyghurTranslitOptions): string {
  const mode = dotModeOf(opts);
  const style = opts?.style ?? "canonical";
  let result = oldUyghurToLatinCanonical(input, mode);
  // Gabain 出向風格（style:"gabain"）——von Gabain 慣例後處理：
  //   q→q̈（U+0308 讀法消歧標記）、ž→z̤（U+0324）、waw 輔音→v、δ→d。
  // canonical（默認）路徑完全不變（鐵律）。
  if (style === "gabain") {
    result = result
      .replace(/q/g, "q\u0308")
      .replace(/\u017e/g, "z\u0324")
      .replace(/δ/g, "d");
    // waw 輔音→v：waw 作元音載體（o/u）與詞首輔音保持 w；此處後處理無上下文，
    // 採 Gabain 慣例整體 v（其 TL 欄詞首亦偶作 w，但主體記法為 v）。
    result = result.replace(/w/g, "v");
  }
  return result;
}

/** canonical 記法出向（原 oldUyghurToLatin 主體，逐字未動） */
function oldUyghurToLatinCanonical(input: string, mode: OldUyghurDotMode): string {
  const chars = Array.from(input);
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];

    // 標點
    const p = PUNCT_TO_LATIN[ch];
    if (p !== undefined) { out += p; i += 1; continue; }

    // 孤立組合點（正常情況下應緊跟字母；此處保底輸出標記）
    if (isOldUyghurDot(ch)) {
      if (mode === "mark") out += DOT_MARK[ch.codePointAt(0) ?? 0] ?? "";
      i += 1;
      continue;
    }

    // 字母 + 組合點：有獨立讀法（q/ž）時輸出讀法；否則保留 `<dN>` 標記，不丟點
    const nxt = chars[i + 1] ?? "";
    if (isOldUyghurLetter(ch) && isOldUyghurDot(nxt)) {
      const base = LETTER_TO_LATIN[ch] ?? ch;
      const pair = DOTTED_READ[ch + nxt];
      const mark = DOT_MARK[nxt.codePointAt(0) ?? 0] ?? "";
      if (mode === "strip") out += pair ?? base;
      else if (mode === "mark" || pair === undefined) out += base + mark;
      else out += pair;
      i += 2;
      continue;
    }

    // 元音序列（三合優先 → 二合；VOWEL_SEQ_TO_LATIN 已按長度降序排列）
    let vLen = 0;
    let vLat = "";
    for (const [seq, lat] of VOWEL_SEQ_TO_LATIN) {
      const n = Array.from(seq).length;
      if (chars.slice(i, i + n).join("") === seq) { vLat = lat; vLen = n; break; }
    }
    if (vLen > 0) {
      out += vLat;
      i += vLen;
      continue;
    }

    // 單字母：元音載體依上下文判讀元音／輔音
    const base = LETTER_TO_LATIN[ch];
    if (base !== undefined) {
      if (ch === A) {
        // 詞首單 aleph = ä（L2/20-191 §8.1）；詞中 aleph = a
        out += nativeAtWordStart(chars, i) ? "ä" : "a";
      } else if (ch === W || ch === Y) {
        /**
         * waw / yodh 的元音／輔音判讀：
         * 前面是純輔音字母 → 該輔音需要元音，故讀元音（𐽹𐽶 = mi、𐽹𐽳 = mo）；
         * 否則（詞首、元音之後）→ 讀輔音（𐽶𐽹 = ym、𐽳 詞首 = w）。
         * 提案 §8.3 的實例 𐽶𐽹𐽰 = yma、𐾀𐽶𐽺𐾁𐽲 = tïnlaγ 即適用此規則。
         */
        out += isPlainConsonant(prevBase(chars, i))
          ? CARRIER_VOWEL[ch]
          : CARRIER_CONSONANT[ch];
      } else {
        out += base;
      }
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/* ---------------- 自動方向 ---------------- */

export function isOldUyghurUnicode(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= OLD_UYGHUR_FIRST && c <= OLD_UYGHUR_LAST) return true;
  }
  return false;
}

/** 回鶻文拉丁轉寫特徵：含本方案專用變音字母，或不屬其他文種的普通拉丁詞 */
export function looksLikeOldUyghurLatin(text: string): boolean {
  if (isOldUyghurUnicode(text)) return false;
  return /[ʾβγδšžāīūöüïä]/.test(text.toLowerCase());
}

/** 自動轉換：回鶻文 ⇄ 拉丁 */
export function convertOldUyghur(input: string, opts?: OldUyghurTranslitOptions): string {
  return isOldUyghurUnicode(input) ? oldUyghurToLatin(input, opts) : latinToOldUyghur(input, opts);
}

/* ---------------- 檢字表 ---------------- */

function buildOldUyghurCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  const notes: Record<string, string> = {
    "ʾ": "aleph；亦作元音載體（詞首 ä / 詞中 a）",
    "β": "beth；讀 β／w／v",
    "γ": "gimel-heth；讀 γ／x／q，加點亦讀 γ",
    w: "waw；亦作元音載體 o／u",
    z: "zayin；加兩點下讀 ž",
    x: "final heth（詞尾形）；加點讀 q",
    y: "yodh；亦作元音載體 i／ï",
    k: "kaph；讀 k／g",
    "δ": "lamedh；讀 δ／d（L2/20-191 §6.6 Latin 欄＝δ，通轉字母）",
    m: "mem",
    n: "nun；加點仍讀 n（區分形）",
    s: "samekh",
    p: "pe；讀 p／b",
    c: "sadhe；讀 č",
    r: "resh",
    "š": "shin；加兩點下明確讀 š",
    t: "taw；讀 t／d",
    l: "lesh（'hooked r'，源出 Sogdian LESH）；L2/20-191 §5.1.6／§6.6 定音值 /l、Latin 欄＝l；另有文獻以 lh/ł 記之（記法分歧，非碼位互換）",
  };
  for (const [k, v] of Object.entries(LATIN_TO_LETTER)) {
    rows.push({ native: cp(v), roman: k, note: notes[k], section: "字母" });
  }
  for (const [roman, seq] of Object.entries(READ_TO_DOTTED)) {
    rows.push({ native: seq, roman, note: "字母 + 組合點的區分讀法", section: "組合點" });
  }
  for (const [mark, code] of Object.entries(MARK_TO_DOT)) {
    // 檢字表審計誠實化：native＝引擎實輸（裸組合符）；舊「◌」前綴為展示輔助——
    // 移入 note（引擎輸出不含 U+25CC DOTTED CIRCLE）。
    rows.push({ native: cp(code), roman: mark, note: "組合點標記（dots:\"mark\" 模式，往返無損）；展示時渲染於字母上（虛線圓圈 U+25CC 僅為排版輔助，引擎不輸出）", section: "組合點" });
  }
  /**
   * 只列**規範元音**（有獨立寫法、可嚴格往返）。
   * `e / ï / u / ü` 在回鶻文中與 `a / i / o / ö` 同形（L2/20-191 §8.1），
   * 僅作輸入別名（轉寫時歸一到規範形式），故不單列為檢字表條目——
   * 否則「ü ↔ 𐽳𐽶」這類條目會被引擎讀成 ö，看似錯映射實則是 abjad 同形歸一。
   */
  const CANONICAL_VOWELS = ["a", "ä", "i", "o", "ö", "ī", "ū"];
  const vowelNote: Record<string, string> = {
    "ä": "詞首單 aleph", a: "詞首 𐽰𐽰／詞中 𐽰",
    i: "詞首 𐽰𐽶／詞中 𐽶",
    "ī": "長音：詞首 𐽰𐽶𐽶／詞中 𐽶𐽶",
    o: "詞首 𐽰𐽳／詞中 𐽳",
    "ū": "長音：詞首 𐽰𐽳𐽳／詞中 𐽳𐽳",
    "ö": "詞首 𐽰𐽳𐽶／詞中 𐽳𐽶",
  };
  for (const k of CANONICAL_VOWELS) {
    rows.push({ native: VOWEL_INITIAL[k], roman: k, note: vowelNote[k], section: "元音（詞首）" });
    rows.push({ native: VOWEL_MEDIAL[k], roman: k, note: vowelNote[k], section: "元音（詞中）" });
  }
  rows.push({
    native: "—", roman: "e / ï / u / ü",
    note: "與 a / i / o / ö 同形，作輸入別名接受，轉寫時歸一到規範形式（e→a、ï→i、u→o、ü→ö）——Pandey L2/20-191 §8.1：aleph/waw/yodh 兼表多元音，歧義由上下文決定，引擎取規範讀法（qut→qot 屬此歸一）",
    section: "拼寫規則",
  });
  for (const [k, v] of Object.entries(LATIN_TO_PUNCT)) {
    rows.push({ native: cp(v), roman: k, section: "標點" });
  }
  rows.push({
    native: "—", roman: "dots:\"mark\"",
    note: "組合點以 <d1>…<d4> 標記輸出，往返完全無損（默認 read：按學界讀法 q/ž）",
    section: "拼寫規則",
  });
  // 去重：同一 (native, roman) 只留第一筆。如 ä 的詞首／詞中同形（皆單 aleph 𐽰），
  // 會被迴圈推成兩筆完全相同的 (𐽰, ä)，純屬冗餘——檢字表「無冗餘」要求刪除其一。
  const seen = new Set<string>();
  const deduped: CharTableEntry[] = [];
  for (const r of rows) {
    const key = r.native + "" + r.roman;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

/* ---------------- 註冊 ---------------- */

const oldUyghurScheme: TransliterationScheme = {
  id: "olduyghur",
  label: {
    zh: "回鹘文（拉丁 ↔ Unicode）",
    "zh-TW": "回鶻文（拉丁 ↔ Unicode）",
    ja: "古ウイグル文字（ラテン ↔ Unicode）", ko: "고대 위구르 문자(라틴 ↔ Unicode)",
    en: "Old Uyghur (Latin ↔ Unicode)",
    bo: "ཡུ་གུར་རྙིང་།(Latin↔Unicode)",
    ug: "Qedimki Uyghur (Latin↔Unicode)",
  fr: "Vieux ouïghour (latin ↔ Unicode)", de: "Altuyghurisch (Latein ↔ Unicode)", },
  group: "olduyghur",
  primary: true,
  description:
    "回鶻文（U+10F70–U+10FAF，Unicode 14.0）↔ 學界拉丁轉寫；依 Unicode L2/20-191。組合點預設按讀法輸出（q/ž），可選 <d1>…<d4> 無損標記",
  romanToNative: (input: string, opts?: TransliterationOptions) =>
    latinToOldUyghur(input, opts as OldUyghurTranslitOptions | undefined),
  nativeToRoman: (input: string, opts?: TransliterationOptions) =>
    oldUyghurToLatin(input, opts as OldUyghurTranslitOptions | undefined),
  looksLikeNative: isOldUyghurUnicode,
  looksLikeRoman: looksLikeOldUyghurLatin,
  convert: (input: string, opts?: TransliterationOptions) =>
    convertOldUyghur(input, opts as OldUyghurTranslitOptions | undefined),
  charTable: buildOldUyghurCharTable(),
  // 檢字表審計：`:`/`::`（ASCII 詞界 trigger）、`<d1>`–`<d4>`（<> trigger）
  // 面板長文掃描會拆散透傳——charTable 同源動態生成原子 token。
  romanTokenRe: new RegExp(
    "^(?:" +
      buildOldUyghurCharTable()
        .map((r) => r.roman)
        .filter((r) => /[^A-Za-z\u00C0-\u024F]/.test(r))
        .sort((a, b) => b.length - a.length)
        .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")$"
  ),
};

registerScheme(oldUyghurScheme);
