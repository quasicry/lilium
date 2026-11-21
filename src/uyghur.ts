// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 維吾爾文轉寫器：UEY（阿拉伯字母）↔ ULY（拉丁字母）主方案，
 *
 * 設計原則：
 *  - ULY→UEY 時，詞首/音節邊界元音自動補 hamza（ئ，U+0626）。
 *  - 二合字母 ch/gh/ng/sh/zh 優先匹配。
 *  - 大小寫不敏感；未知字符原樣透傳。
 *  - 純函數、無 Obsidian 依賴；不拋未捕獲異常。
 */

import {
  registerScheme,
  type CharTableEntry,
  type TransliterationScheme,
} from "./translit-common";
import type { TranslitAmbiguity } from "./indic";

/* ---------------- ULY ↔ UEY 映射 ---------------- */

// 單字母映射（ULY → UEY 獨立字母）
const ULY_TO_UEY_SINGLE: Record<string, string> = {
  a: "ا", // 元音 a；詞首需加 hamza
  e: "ە", // 元音 e
  b: "ب",
  p: "پ",
  t: "ت",
  j: "ج",
  x: "خ",
  d: "د",
  r: "ر",
  z: "ز",
  s: "س",
  f: "ف",
  q: "ق",
  k: "ك",
  g: "گ",
  l: "ل",
  m: "م",
  n: "ن",
  h: "ھ",
  o: "و", // 元音 o；詞首需加 hamza
  u: "ۇ", // 元音 u
  ö: "ۆ",
  ü: "ۈ",
  w: "ۋ",
  ë: "ې",
  i: "ى",
  y: "ي",
};

// 二合字母（優先匹配）
const ULY_TO_UEY_DIGRAPH: Record<string, string> = {
  ch: "چ",
  gh: "غ",
  ng: "ڭ",
  sh: "ش",
  zh: "ژ",
};

// 所有 ULY token，最長在前
const ULY_KEYS = Object.keys({ ...ULY_TO_UEY_SINGLE, ...ULY_TO_UEY_DIGRAPH }).sort(
  (a, b) => b.length - a.length
);

// 反向：UEY 字母 → ULY
const UEY_TO_ULY: Record<string, string> = {
  ا: "a",
  ئ: "'", // 孤立 hamza（後不接元音字母）：不靜默丟棄，轉寫成隔音撇號以保住字符
  ب: "b",
  پ: "p",
  ت: "t",
  ج: "j",
  چ: "ch",
  خ: "x",
  د: "d",
  ر: "r",
  ز: "z",
  ژ: "zh",
  س: "s",
  ش: "sh",
  غ: "gh",
  ف: "f",
  ق: "q",
  ك: "k",
  گ: "g",
  ڭ: "ng",
  ل: "l",
  م: "m",
  ن: "n",
  ھ: "h",
  // U+0648 waw：UEY 中為元音 o（詞首寫作 ئو）。
  // 輔音 w 在現代 UEY 正字法用 U+06CB（ۋ），與本表 ULY→UEY 的 `w → ۋ` 自洽；
  // 若此處讀 w，則 dost→دوست→dwst、bol→بول→bwl 等大量真實詞往返失真。
  و: "o",
  ۆ: "ö",
  ۇ: "u",
  ۈ: "ü",
  ۋ: "w",
  ې: "ë",
  ە: "e",
  ى: "i",
  ي: "y",
};

// 帶 hamza 的詞首元音組合：hamza + 元音字母 → ULY 元音
const UEY_HAMZA_VOWEL_TO_ULY: Record<string, string> = {
  ئا: "a",
  ئە: "e",
  ئو: "o",
  ئۇ: "u",
  ئۆ: "ö",
  ئۈ: "ü",
  ئې: "ë",
  ئى: "i",
};

// 元音字母集合（不含 hamza）
const UEY_VOWEL_LETTERS = new Set(["ا", "ە", "و", "ۇ", "ۆ", "ۈ", "ې", "ى"]);

// UEY 全字母集合（輔音 + 元音 + hamza 載體）：判斷 heh 的「詞首」時，
// 前一字符是否為字母（區分開頭/空格/標點/括號等非字母詞界）。
const UEY_LETTERS = new Set([
  "ب", "پ", "ت", "ج", "چ", "خ", "د", "ر", "ز", "ژ", "س", "ش",
  "غ", "ف", "ق", "ك", "گ", "ڭ", "ل", "م", "ن", "ھ", "و", "ۋ", "ي", "ه",
  ...UEY_VOWEL_LETTERS,
  "ئ",
]);

/**
 * ULY 隔音符（撇號）。ULY 規範用它切開會被誤讀成二合字母的音節邊界，例如：
 *  - `n'g`（ن+گ，兩音素分屬相鄰音節）對比 `ng`（ڭ，單音素）
 *  - `me'eraj`（مەئەراج，元音間隔音）
 * 用戶可能鍵入三種撇號（ASCII '、U+02BC ʼ、U+2019 ’），一併接受。
 */
const ULY_APOSTROPHES = new Set(["'", "ʼ", "’"]);

/** ULY → UEY */
export function ulyToUey(input: string): string {
  let out = "";
  let i = 0;
  const lower = input.toLowerCase();
  // 隔音符已代寫 hamza 載體（ئ）時，緊隨其後的元音不得再加 hamza，
  // 否則 me'eraj → مەئئەراج（多一個 ئ）而往返失真。
  let hamzaWritten = false;
  while (i < lower.length) {
    const rest = lower.slice(i);
    // 隔音符：後接元音 → 輸出 hamza 載體 ئ（UEY 的元音隔音寫法）；
    //         後接輔音 → 不輸出任何字符，僅阻止 n+g 被誤讀成二合字母 ng。
      // 注意：`nxt` 可能爲空（隔音符位於詞尾），isUlyVowel("") 必須爲 false，
      // 否則會無中生有地多寫一個 hamza（ئ）。下面以 nxt !== "" 顯式短路。
      if (ULY_APOSTROPHES.has(lower[i])) {
        const nxt = lower[i + 1] ?? "";
        if (nxt !== "" && isUlyVowel(nxt)) {
        out += "ئ";
        hamzaWritten = true;
      } else if (nxt !== "" && isUlyLetter(nxt) && i > 0 && isUlyVowel(lower[i - 1])) {
        // uy：元音間隔音撇號後接輔音＝hamza 載體 ئ（n'e'met→نەئمەت）。
        // 原行為一律丟棄撇號 → UEY 端 ئ 往返丟字符（語料實錘：نەئمەت→ne'met→نەمەت）。
        // 後接輔音但前面非元音（n'g 分音符號）維持原行為：僅阻 ng 二合，不輸出。
        out += "ئ";
        hamzaWritten = true;
      }
      i++;
      continue;
    }
    let matched = false;
    for (const key of ULY_KEYS) {
      if (rest.startsWith(key)) {
        const uey = ULY_TO_UEY_DIGRAPH[key] ?? ULY_TO_UEY_SINGLE[key];
        // 元音是否需要 hamza？
        if (ULY_TO_UEY_SINGLE[key] && isUlyVowel(key)) {
          // 詞首或前一個字符不是 ULY 字母（音節邊界）
          const prev = lower[i - 1] ?? "";
          const needsHamza = !hamzaWritten && (i === 0 || !isUlyLetter(prev));
          out += needsHamza ? "ئ" + uey : uey;
        } else {
          out += uey;
        }
        hamzaWritten = false;
        i += key.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 標點轉換（可選）
      const ch = lower[i];
      if (ch === ",") out += "،";
      else if (ch === "?") out += "؟";
      // `.` 撤銷映射「。」——原規則讓 roman 端的
      // 西文句點單向變中文句號，UEY 原文 `.` 往返不閉環（語料 1,971 字符實錘 9 處）。
      // 維吾爾文慣用 `.`／`؛`，`.` 雙向原樣保留；`,` `?` 映射維持（UEY 端有對應碼位، ؟）。
      else out += input[i]; // 保留原始大小寫/字符
      i++;
    }
  }
  return out;
}

/**
 * NFKC 歸一化——把「從 PDF/網頁複製」產生的阿拉伯呈現形
 * （U+FB50–FEFF，shaping 引擎固化：ﺩ→د、ﻻ→لا 等）折回基本區規範碼位，
 * 再走映射；否則呈現形不在轉寫表鍵中，按「未知字符透傳」殘留（實測 25 行
 * 詩歌語料殘留 15 種 294 字符）。
 */
function nfkc(input: string): string {
  // U+0640 tatweel（kashida 拉長符）純排版裝飾、非音位；PDF/字體常把它插在
  // hamza 與元音之間（ئـە），會阻斷「hamza+元音」合併規則並殘留透傳。
  // 歸一化時一併剔除——語義零損失（實測新語料 muئـەللىم → mu'ellim）。
  return input.normalize("NFKC").replace(/\u0640/g, "");
}

/** UEY → ULY */
export function ueyToUly(input: string): string {
  input = nfkc(input);
  let out = "";
  const chars = Array.from(input);
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    const next = chars[i + 1] ?? "";
    /**
     * ن + گ（U+06AF gaf，非 ڭ U+06AD ngaf）：兩個獨立音素分屬相鄰音節
     * （如 ۋېنگرىيە Wëngriye／ئىنگىلىزچە in'gilizche）。
     * ULY 中 `ng` 是單音素（ڭ），故必須寫隔音符 `n'g`；
     * 否則 ngr → ۋېڭرىيە，往返失真（實測真實詞彙命中）。
     */
    if (ch === "ن" && next === "گ") {
      out += "n'";
      i++;
      continue;
    }
    /**
     * ن + غ（U+063A ghaf）同規則補齊——n 與 gh 分屬相鄰音節
     * （如 ۋىجدانغا wijdan'gha「心靈＋方向格」：wijdan 音節尾 n、gha 音節首 gh）。
     * ULY 中 `ngh` 三字母可切 ng+h（ڭھ）或 n+gh（نغ），貪婪引擎會誤切 ng+h；
     * 不寫隔音符則 UEY→ULY→UEY 斷裂（ۋىجدانغا → wijdangha → ۋىجداڭھا，
     * 與 ۋىجداڭھا 撞串、信息丟失）。隔音符須寫在 n 後
     * （`n'gh`），與 ن+گ 的 `n'g` 完全對稱；غ 隨後由 UEY_TO_ULY 正常映射 gh。
     */
    if (ch === "ن" && next === "غ") {
      out += "n'";
      i++;
      continue;
    }
    /**
     * ز/س/گ + ھ（z/s/g + h 兩音素）同規則補齊——
     * ULY 的 zh/sh/gh 是二合單音素（ژ/ش/غ），貪婪引擎會把 z+ھ 吞成 zh：
     * ئىزھار（izhar 表白）→ izhar → ئىژار（-zh-，語義丟失）、
     * نەسھەت（neshet）→ neshet → نەشەت、ئۆزھال（özhal）→ ئۆژال。
     * 隔音符寫在 z/s/g 後（iz'har / nes'het / öz'hal / rokkin'g'ham），
     * 正向 ulyToUey 對 z'/s'/g' 已正確輸出 زھ/سھ/گھ，
     * 故僅補反向即可封閉；與 ن+گ / ن+غ 規則完全對稱。
     * 三連 ن+گ+ھ 的雙撇號是**必要**而非冗餘——
     * 單撇號 `n'gh` 正向會被讀成 n+gh 二合（نغ，丟 ھ），無法還原 ن+گ+ھ；
     * 只有 `n'g'h`（rokkin'g'ham）才能正向輸出 نگھ。實測：
     * ulyToUey("rokkin'gham")=روككىنغام ✗、ulyToUey("rokkin'g'ham")=روككىنگھام ✓。
     * 辭典 R[2] 的 rokkin'gham 是其自身的規範化拼寫（規範化比對去撇號後一致）。
     */
    if ((ch === "ز" || ch === "س" || ch === "گ") && next === "ھ") {
      out += UEY_TO_ULY[ch] + "'";
      i++;
      continue;
    }
    if (ch === "ئ" && UEY_VOWEL_LETTERS.has(next)) {
      // hamza + 元音 → 對應 ULY 元音
      const v = UEY_HAMZA_VOWEL_TO_ULY[ch + next] ?? next;
      /**
       * 詞中兩個元音之間的 hamza 是 UEY 的元音隔音符（ساموئا Samoa／مەئەراج me'eraj），
       * 對應 ULY 的隔音撇號；若直接丟棄，則 samo'a → samoa → ساموا，往返失真。
       * 詞首的 hamza 只是元音載體（ئىنگىلىزچە），不產生撇號。
       * **輔音後**的 ئ+元音 也須寫隔音撇號——ULY 官方正字
       * سۈنئىي = sün'iy（n+ئى 音節界，撇號切開 n.i 防誤讀 niy）；
       * 原規則只認「前一字符是元音」，輔音後漏撇號 → süniy 反向拼成 سۈنىي（hamza 永久丟失）。
       * 語料實錘：سۈنئىي → süniy → سۈنىي。反向 romanToNative 的撇號通路早已支援（sün'iy ✓）。
       */
      const prev = chars[i - 1] ?? "";
      if (prev && UEY_LETTERS.has(prev)) out += "'";
      out += v;
      i += 2;
      continue;
    }
    /**
     * U+0647（阿拉伯 heh）上下文消歧——PDF 複製把兩種字母固化到同一碼位：
     * 詞尾 ە（U+06D5 ae）的 shaping 目標形 ﻩ → NFKC 折成 0647，語義是元音 e；
     * 詞首/詞中 ھ（U+06BE）在很多字體畫成 heh initial/medial 形（FEEB 等）→ 同折成
     * 0647，語義是輔音 h（實測語料：ﻫﻪﺑﺒﻪﺕ=muhәbbәt 的 ﻫ、ﻫﺎﻟﯩﻨﻰ=halini 的 ﻫ）。
     * 規則：0647 後緊跟「將轉為元音的字符」（ا ە و ۇ ۈ ې ى 或 ئ+元音 或 0647）→
     * 它是輔音 h；否則（後接輔音/詞尾）→ 自成音節核，是元音 e。
     * 驗證：dilrﻩba（ﻩ 後=ب 輔音）→e ✓；muﻫﻪbbet（ﻫ 後=ﻪ→e）→h ✓；
     * ﻫﺎﻟﯩﻨﻰ（ﻫ 後=ا）→h ✓。
     */
    if (ch === "ه") {
      const nn = chars[i + 1] ?? "";
      const nextIsVowelish =
        UEY_VOWEL_LETTERS.has(nn) ||
        nn === "ه" || // 連續 heh：當前是 h（h+e 組合，如 ﻫﻪ）
        (nn === "ئ" && UEY_VOWEL_LETTERS.has(chars[i + 2] ?? ""));
      /**
       * 詞首優先判 h：UEY 正字法詞首元音必帶 hamza 載體 ئ（ئا/ئە/ئې…），
       * 裸 0647 開頭幾乎不可能是元音 e，而是輔音 h 的 initial 形折回
       * （實測 ﻫﯧﻤﯩﺪ hemid：ﻫ 後=ﻪ 元音，舊規則誤判成 hëmid）。
       * 「詞首」= 前一字符為非字母（字串開頭/空格/標點/括號等）；
       * 非詞首維持原規則不變（rehme رەھمە 詞中 0647 後接 06BE 輔音 → e 不受影響）。
       */
      const prevHeh = chars[i - 1] ?? "";
      const isWordInitial =
        prevHeh === "" || !UEY_LETTERS.has(prevHeh);
      out += (isWordInitial || nextIsVowelish) ? "h" : "e";
      i++;
      continue;
    }
    const mapped = UEY_TO_ULY[ch];
    if (mapped !== undefined) {
      out += mapped;
    } else {
      // 標點反向
      if (ch === "،") out += ",";
      else if (ch === "؟") out += "?";
      else if (ch === "。") out += ".";
      else out += ch;
    }
    i++;
  }
  return out;
}

function isUlyVowel(ch: string): boolean {
  // 空串必須返回 false：JS 的 "abc".includes("") 恆爲 true，
  // 若不短路會讓詞尾隔音符被誤判成「後接元音」而多寫 hamza（ئ）。
  return ch.length === 1 && "aeiouöüë".includes(ch);
}

function isUlyLetter(ch: string): boolean {
  return /[a-zöüë]/.test(ch);
}

/** 自動方向轉換 */
export function convertUyghur(input: string): string {
  return isUeyUnicode(input) ? ueyToUly(input) : ulyToUey(input);
}

/**
 * H 類歧義偵測——UEY → ULY 方向、詞中 0647+ئ+元音 結構。
 *
 * 背景：PDF 呈現形把詞尾 ە（元音 e/ë）與詞中 ھ（輔音 h）折到同一碼位 U+0647
 * （規則按「後接元音類 → h」判讀）。但「0647 + ئ + 元音」在碼位層同構於：
 *  - 輔音 h + 音節：z + h + i（zhipu 型，r10b 默認讀法，輸出無隔音撇號——
 *    hamza 分支只在前一字符是元音時才寫撇號，prev=0647 不觸發）；
 *  - 元音 ë 音節 + 隔音：zë + ' + i（zë'ipu 型，原詞是 ە+ئى 時成立）。
 * 呈現形字形信息 NFKC 時已丟，規則層不可判定，交由用戶按詞源定稿。
 *
 * 實現：源側掃描「非詞首 0647，後接 ئ+元音」；用 prefix 的 ueyToUly 求該 h
 * 在 ULY 輸出中的碼點索引（ueyToUly 規則僅向前看 ≤2 字符，前綴轉寫安全）。
 * primary ＝ 默認輸出 `h<v>`；alternative ＝ `ë'<v>`（字串級替換，同 P 類走
 * applyStringAmbiguities）。
 *
 * @param src 原始 UEY 輸入（未規範化，含呈現形；函數內部自行 NFKC 對齊）
 * @param ulyOut ueyToUly(src) 的輸出
 * @returns 每個歧義位置一筆（kind: "heh"）
 */
export function detectUyghurHehAmbiguities(src: string, ulyOut: string): TranslitAmbiguity[] {
  const out: TranslitAmbiguity[] = [];
  const norm = Array.from(src.normalize("NFKC").replace(/\u0640/g, ""));
  const outCps = Array.from(ulyOut);
  for (let i = 0; i < norm.length - 2; i++) {
    if (norm[i] !== "ه") continue;
    if (norm[i + 1] !== "ئ" || !UEY_VOWEL_LETTERS.has(norm[i + 2])) continue;
    // 非詞首：前一字符是 UEY 字母（詞首裸 0647 已由 r12 A8 規則優先判 h，無歧義面）
    const prev = i > 0 ? norm[i - 1] : "";
    if (!prev || !UEY_LETTERS.has(prev)) continue;
    const v = UEY_HAMZA_VOWEL_TO_ULY["ئ" + norm[i + 2]] ?? norm[i + 2];
    // 前綴轉寫定位輸出中的 h：prefix = norm[0..i)（不含 0647）
    const prefixOut = ueyToUly(norm.slice(0, i).join(""));
    const idx = Array.from(prefixOut).length;
    if (idx >= outCps.length || outCps[idx] !== "h") continue; // 防禦：定位失敗則跳過
    const vowel = outCps[idx + 1] ?? v;
    out.push({
      index: idx, kind: "heh",
      primary: "h" + vowel,
      alternative: "ë'" + vowel,
      note: `詞中 heh＋隔音 hamza：可讀輔音 h（默認 zhipu 型）或元音 ë＋隔音（zë'ipu 型）`,
    });
    i += 2;
  }
  return out;
}

/* ---------------- 文種檢測 ---------------- */

const UEY_VOWEL_MARKERS = new Set([
  0x0626, // hamza on carrier
  0x067e, 0x0686, 0x0698, 0x06af, 0x06ad,
  0x06c6, 0x06c7, 0x06c8, 0x06cb, 0x06d0, 0x06d5,
]);

/**
 * 基礎 UEY 輔音字母（與阿拉伯語共享的碼位，無專屬區段特徵）。
 * 「دوستلار／بولسا／بىر」這類不含任何維文專屬字母的詞，靠本集合
 * 才能被 isUeyUnicode 認出——否則長文本轉寫的 looksLikeNative 閘門
 * 會把它們整詞略過（真機實錘：59 詞 skip 8 全屬此型）。
 */
const UEY_BASE_CONSONANTS = new Set([
  0x0627, // ا
  0x0628, // ب
  0x062A, // ت
  0x062C, // ج
  0x062E, // خ
  0x062F, // د
  0x0631, // ر
  0x0632, // ز
  0x0633, // س
  0x0634, // ش
  0x063A, // غ
  0x0641, // ف
  0x0642, // ق
  0x0643, // ك
  0x0644, // ل
  0x0645, // م
  0x0646, // ن
  0x06BE, // ھ
  0x0647, // ه 阿拉伯 heh（語料實際出現；引擎映射 h，補收）
  0x0649, // ى alef maksura（引擎映射 i，補收；與 0626/ UEY 正字 ى 相鄰碼位）
  0x064A, // ي
  0x0648, // و（UEY 中作元音 o）
]);

export function isUeyUnicode(text: string): boolean {
  // 先 NFKC 再判定。PDF/網頁複製產生的阿拉伯呈現形（U+FB50–FEFF）
  // 不在下方基本區集合中，全呈現形詞（如 ﻧﻪﻣﺎﻧﮕﺎﻧﺪﯨﻦ）會被誤判非 UEY，
  // 長文逐詞通路的 looksLikeNative 閘門整詞擋下透傳（實測語料五 665 詞
  // skip 54、9 行整行殘留；NFKC 後折回基本區，665/665 全轉）。
  // 轉換通路（ueyToUly）本就 NFKC，判定與轉換自此同一歸一化基準。
  for (const ch of text.normalize("NFKC")) {
    const c = ch.codePointAt(0) ?? 0;
    if (UEY_VOWEL_MARKERS.has(c) || UEY_BASE_CONSONANTS.has(c)) return true;
    // 阿拉伯標點/tatweel（، ؟ ٫ ٠-٩ ـ）單字符成詞時舊判定 false，
    // 引擎有映射（, → ،、? → ؟）或透傳設計，面板 gate 整詞 skipped。
    if ((c >= 0x0600 && c <= 0x06FF)) return true;
  }
  return false;
}

export function looksLikeUly(text: string): boolean {
  if (isUeyUnicode(text)) return false;
  // 維文拉丁特徵：二合字母、變音元音
  return /\b(ch|gh|ng|sh|zh|ö|ü|ë)\b|^[\s\wöüë,.]+$/.test(text.toLowerCase());
}

/* ---------------- 檢字表 ---------------- */

function buildUeyCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  // 輔音
  const consonants = [
    ["ب", "b"], ["پ", "p"], ["ت", "t"], ["ج", "j"], ["چ", "ch"],
    ["خ", "x"], ["د", "d"], ["ر", "r"], ["ز", "z"], ["ژ", "zh"],
    ["س", "s"], ["ش", "sh"], ["غ", "gh"], ["ف", "f"], ["ق", "q"],
    ["ك", "k"], ["گ", "g"], ["ڭ", "ng"], ["ل", "l"], ["م", "m"],
    ["ن", "n"], ["ھ", "h"], ["ۋ", "w"], ["ي", "y"],
  ] as const;
  for (const [n, r] of consonants) {
    rows.push({ native: n, roman: r, section: "輔音" });
  }
  // 元音（帶 hamza 詞首形式）。
  // 註：و（U+0648 waw）在現代 UEY 正字法中讀**元音 o**（詞首寫作 ئو），
  // 輔音 w 用 ۋ（U+06CB）；舊版讀 w 會使 dost→دوست→dwst、bol→بول→bwl 失真。
  const vowels = [
    ["ئا", "a"], ["ئە", "e"], ["ئو", "o"], ["ئۇ", "u"],
    ["ئۆ", "ö"], ["ئۈ", "ü"], ["ئې", "ë"], ["ئى", "i"],
  ] as const;
  for (const [n, r] of vowels) {
    rows.push({ native: n, roman: r, section: "元音（詞首）" });
  }
  // 詞中元音（不帶 hamza 載體）
  const medial = [
    ["ا", "a"], ["ە", "e"], ["و", "o"], ["ۇ", "u"],
    ["ۆ", "ö"], ["ۈ", "ü"], ["ې", "ë"], ["ى", "i"],
  ] as const;
  for (const [n, r] of medial) {
    rows.push({ native: n, roman: r, section: "元音（詞中）" });
  }
  /**
   * 隔音符（撇號）是「拼寫規則」而非固定一對一字母：
   *  - 撇號 + 元音 → UEY 寫出 hamza 載體（samo'a → ساموئا）
   *  - 撇號 + 輔音 → UEY 不寫任何字符，只在 ULY 側切開音節
   *    （n'g → ن+گ 兩音素；對比 ng → ڭ 單音素，wën'griye → ۋېنگرىيە）
   * 故檢字表列完整音段而非孤立撇號，避免「表上說 ' ↔ ئ、引擎其實依上下文處理」
   * 的假對應。
   */
  rows.push({
    native: "ئا", roman: "'a",
    note: "隔音符 + 元音：ULY 撇號後接元音時寫出 hamza 載體（samo'a → ساموئا、me'eraj → مەئەراج）",
    section: "拼寫規則",
  });
  rows.push({
    native: "نگ", roman: "n'g",
    note: "隔音符 + 輔音：撇號後接輔音時 UEY 不寫字符，僅切開音節（wën'griye → ۋېنگرىيە）；與單音素 ng → ڭ 對立",
    section: "拼寫規則",
  });
  // 檢字表覆蓋審計：U+0647 阿語 heh 上下文消歧說明列（加寬的實轉路徑；
  // PDF 複製 shaping 固化碼位，引擎依上下文折回 ە 元音或 ھ 輔音 h）
  rows.push({
    native: "—", roman: "h / e（0647 消歧）",
    note: "U+0647 阿語 heh（PDF 複製把 ە/ھ 的 shaping 目標形折回同一碼位）：後接元音字符→讀作元音 e（=ە U+06D5）；詞首裸 0647→讀作輔音 h（=ھ U+06BE）；表上 h/e 實列以正字碼位 ھ/ە 為準",
    section: "拼寫規則",
  });
  // 標點：長文本詞界標點映射（punctMap）同步收入檢字表供核對
  const puncts = [
    [",", "\u060C"], ["?", "\u061F"], [";", "\u061B"], [".", "."],
  ] as const;
  for (const [r, n] of puncts) {
    rows.push({
      native: n, roman: r,
      note: r === "." ? "句號兩側同形（UEY 實務用拉丁句點）" : "UEY 正字法標點（阿語體）",
      section: "標點",
    });
  }
  return rows;
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */

const ueyCharTable = buildUeyCharTable();

const uyghurUly: TransliterationScheme = {
  id: "uyghur-uly",
  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "维吾尔文（ULY ↔ UEY）",
    "zh-TW": "維吾爾文（ULY ↔ UEY）",
    ja: "ウイグル文字（ULY ↔ UEY）", ko: "위구르 문자(ULY ↔ UEY)",
    en: "Uyghur (ULY = Uyghur Latin Yëziqi ↔ UEY = Uyghur Ereb Yëziqi)",
    bo: "ཡུ་གུར།(ULY↔UEY)",
    ug: "ئۇيغۇر (ULY↔UEY)",
  fr: "Ouïghour (ULY ↔ UEY)", de: "Uyghurisch (ULY ↔ UEY)", },
  group: "uyghur",
  primary: true,
  description: "維吾爾拉丁字母 ULY ↔ 維吾爾阿拉伯字母 UEY（官方正字法）。ULY＝Uyghur Latin Yëziqi（維吾爾拉丁文字）；UEY＝Uyghur Ereb Yëziqi（維吾爾阿拉伯字母文字正字法）。",
  romanToNative: ulyToUey,
  nativeToRoman: ueyToUly,
  looksLikeNative: isUeyUnicode,
  looksLikeRoman: looksLikeUly,
  convert: convertUyghur,
  charTable: ueyCharTable,
  /** UEY 正字法標點：逗號/問號/分號/冒號用阿語體；句號用拉丁「.」（ UEY 實務）。
   *  C-U2：本表與 ulyToUey / ueyToUly 內聯裸 ASCII 標點映射（,→،、?→؟）同一體例、雙向一致。 */
  punctMap: { ",": "\u060C", "?": "\u061F", ";": "\u061B" },
};

registerScheme(uyghurUly);
