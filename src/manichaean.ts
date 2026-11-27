// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 摩尼文（Manichaean）↔ 拉丁轉寫轉換器（純函數，無 Obsidian 依賴）。
 *
 * 編碼依據：Unicode 14.0 區段 U+10AC0–U+10AFF（51 碼位：31 字母＋2 縮寫符＋5 數字＋7 標點）。
 * 轉寫依據：Everson & Durkin-Meisterernst & Pournader & Afshar,
 * *Second revised proposal for encoding the Manichaean script in the SMP of the UCS*,
 * UTC L2/11-123R（§3 Names and ordering 的 Latin 欄、§4 縮寫符、§4.1 VS-1 變體、§5 數字、§7 標點）。
 * 核心規範：The Unicode Standard Ch 10 §10.5「Manichaean」（10.5.1 U+10AC0–U+10AFF）——
 * 連寫整形（Table 10-4~7 雙連/右連/左連/不連四組）、兩個強制連字（SADHE+YODH/NUN，Table 10-8）、
 * ALEPH 通常僅右連 BETH/BHETH（偶 GIMEL），斷連以 U+200C ZWNJ（透傳保留，見 VS_VARIANTS 段註釋）、
 * 詞形圖形延伸可用 U+0640 ARABIC TATWEEL（透傳保留）、標點語義（10AF2 大單位/節末、10AF3 小單位/
 * 半節末、10AF4 句內子單位、10AF0/10AF1/10AF5 標題題注起訖、10AF6 行填充省略號）。
 * Unicode 18.0 復核（2026）：本區塊 18.0 無新增碼位；StandardizedVariants-18.0.0 之
 * Manichaean 五條 VS-1（10AC5/10AC6/10AD6/10AD7/10AE1 FE00，isolate 限定、10AD6 另列 final）
 * 與本方案 VS_VARIANTS 一致——無碼位層變更。
 *
 * 摩尼文＝RTL 連寫字母文字，源出 Aramaic，經 Syriac 演化；摩尼教東傳後以此書寫
 * 中古波斯語／帕提亞語／粟特語／回鶻語等（吐魯番摩尼教文獻主流文字）。
 * 與回鶻文（olduyghur.ts）同源異流：回鶻文源自粟特草書，摩尼文保留 Aramaic
 * 的獨立字母身份——**轉寫慣例的「字形身份」（如 ṭ＝Tau 變體）正是
 * 摩尼文獨立碼位所承載的層**。
 *
 * 本方案特點：
 *   · 拉丁側依 L2/11-123R §3 記法（ʾ b β g γ d h w z ž j j̈ x y k k̇ k̈ l δ θ m n s ʿ ʿ̈ p f c q q̇ q̈ r š ś t）；
 *   · 五個顯著字形變體（DALETH/HE/MEM/NUN/RESH）以 VS-1（U+FE00）標記保留，
 *     拉丁側以 `<v1>` 後綴輸出——同 Mongolian FVS 的標記保留哲學，往返無損；
 *   · 縮寫符（ABOVE/BELOW）以 `<abv>`/`<blw>` 標記輸出（dots:"mark" 同構）；
 *   · 數字系（1/5/10/20/100 加法組合）原樣透傳（值語義由 native 碼位承載）；
 *   · 標點 7 個採 ASCII 對應（* / :: / .. / . / , 等）雙向映射。
 */

import {
  CharTableEntry,
  TransliterationScheme,
  TransliterationOptions,
  registerScheme,
} from "./translit-common";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 區段與碼位 ---------------- */

export const MANICHAEAN_FIRST = 0x10ac0;
export const MANICHAEAN_LAST = 0x10aff;
const ABBV_FIRST = 0x10ae5;
const ABBV_LAST = 0x10ae6;
const NUM_FIRST = 0x10aeb;
const NUM_LAST = 0x10aef;
const PUNCT_FIRST = 0x10af0;
const PUNCT_LAST = 0x10af6;

/** 字母碼位（U+10AC0–U+10AE4） */
export const MANI_LETTER = {
  ALEPH: 0x10ac0,
  BETH: 0x10ac1,
  BHETH: 0x10ac2,
  GIMEL: 0x10ac3,
  GHIMEL: 0x10ac4,
  DALETH: 0x10ac5,
  HE: 0x10ac6,
  WAW: 0x10ac7,
  UD: 0x10ac8,
  ZAYIN: 0x10ac9,
  ZHAYIN: 0x10aca,
  JAYIN: 0x10acb,
  JHAYIN: 0x10acc,
  HETH: 0x10acd,
  TETH: 0x10ace,
  YODH: 0x10acf,
  KAPH: 0x10ad0,
  XAPH: 0x10ad1,
  KHAPH: 0x10ad2,
  LAMEDH: 0x10ad3,
  DHAMEDH: 0x10ad4,
  THAMEDH: 0x10ad5,
  MEM: 0x10ad6,
  NUN: 0x10ad7,
  SAMEKH: 0x10ad8,
  AYIN: 0x10ad9,
  AAYIN: 0x10ada,
  PE: 0x10adb,
  FE: 0x10adc,
  SADHE: 0x10add,
  QOPH: 0x10ade,
  XOPH: 0x10adf,
  QHOPH: 0x10ae0,
  RESH: 0x10ae1,
  SHIN: 0x10ae2,
  SSHIN: 0x10ae3,
  TAW: 0x10ae4,
} as const;

/** 縮寫符碼位（U+10AE5–U+10AE6） */
export const MANI_ABBV = {
  ABOVE: 0x10ae5,
  BELOW: 0x10ae6,
} as const;

/** 數字碼位（U+10AEB–U+10AEF） */
export const MANI_NUM = {
  ONE: 0x10aeb,
  FIVE: 0x10aec,
  TEN: 0x10aed,
  TWENTY: 0x10aee,
  ONE_HUNDRED: 0x10aef,
} as const;

/* ---------------- 基礎映射表 ---------------- */

/**
 * 拉丁 → 字母碼位（L2/11-123R §3 Latin 欄）。
 * 鍵集注意：
 *   · x＝HETH、k̇＝XAPH（k+U+0307）、k̈＝KHAPH（k+U+0308）、q̇＝XOPH（q+U+0307）、
 *     q̈＝QHOPH（q+U+0308）、c＝SADHE、ʿ＝AYIN、ʿ̈＝AAYIN（ʿ+U+0308）、
 *     j̈＝JHAYIN（j+U+0308）、β＝BHETH、γ＝GHIMEL、δ＝DHAMEDH、θ＝THAMEDH、
 *     ž＝ZHAYIN、ś＝SSHIN、š＝SHIN、ṭ＝TETH（t+U+0323）。
 *   · 五個 VS-1 變體字母的「變體後」形態不另立 token——變體以 `<v1>` 後綴
 *     標記保留（見 VS_VARIANTS）。
 *   · d 與 DALETH 一一對應（摩尼文有獨立 DALETH/TAW 對立，與回鶻文 TAW 兼表不同——
 *     這正是「字形身份」層的實證差異）。
 */
const LATIN_TO_LETTER: Record<string, number> = {
  "ʾ": MANI_LETTER.ALEPH,
  b: MANI_LETTER.BETH,
  "β": MANI_LETTER.BHETH,
  g: MANI_LETTER.GIMEL,
  "γ": MANI_LETTER.GHIMEL,
  d: MANI_LETTER.DALETH,
  h: MANI_LETTER.HE,
  w: MANI_LETTER.WAW,
  z: MANI_LETTER.ZAYIN,
  "ž": MANI_LETTER.ZHAYIN,
  j: MANI_LETTER.JAYIN,
  "j̈": MANI_LETTER.JHAYIN,
  x: MANI_LETTER.HETH,
  "ṭ": MANI_LETTER.TETH,
  y: MANI_LETTER.YODH,
  k: MANI_LETTER.KAPH,
  "k̇": MANI_LETTER.XAPH,
  "k̈": MANI_LETTER.KHAPH,
  l: MANI_LETTER.LAMEDH,
  "δ": MANI_LETTER.DHAMEDH,
  "θ": MANI_LETTER.THAMEDH,
  m: MANI_LETTER.MEM,
  n: MANI_LETTER.NUN,
  s: MANI_LETTER.SAMEKH,
  "ʿ": MANI_LETTER.AYIN,
  "ʿ̈": MANI_LETTER.AAYIN,
  p: MANI_LETTER.PE,
  f: MANI_LETTER.FE,
  c: MANI_LETTER.SADHE,
  q: MANI_LETTER.QOPH,
  "q̇": MANI_LETTER.XOPH,
  "q̈": MANI_LETTER.QHOPH,
  r: MANI_LETTER.RESH,
  "š": MANI_LETTER.SHIN,
  "ś": MANI_LETTER.SSHIN,
  t: MANI_LETTER.TAW,
};

/**
 * UD（字 ʾwd「and」的專用字母）與縮寫符序列：
 *   · `<ud>` → UD 碼位（L2/11-123R §4：專拼 ud 'and'，ASCII 無自然鍵）；
 *   · š+w 等常見縮寫組合由作者直接輸入字母＋`<abv>`/`<blw>` 標記（見下）。
 */
const SPECIAL_SEQUENCES: Record<string, string> = {
  "<ud>": cp(MANI_LETTER.UD),
};

/** 縮寫符的無損標記（與 olduyghur `<dN>`、蒙古文 `<fN>` 同構） */
const ABBV_MARK: Record<number, string> = {
  [MANI_ABBV.ABOVE]: "<abv>",
  [MANI_ABBV.BELOW]: "<blw>",
};
const MARK_TO_ABBV: Record<string, number> = {
  "<abv>": MANI_ABBV.ABOVE,
  "<blw>": MANI_ABBV.BELOW,
};
const ABBV_MARK_RE = /^<(abv|blw)>/;

/**
 * 五個顯著字形變體（L2/11-123R §4.1）：DALETH/HE/MEM/NUN/RESH + VS-1（U+FE00）。
 * 提案明文「not predictable／significant to researchers」——非排版變體，屬
 * 寫本字形身份層，故標記保留（同蒙古文 FVS 哲學：mark 默認往返無損，strip 剝除）。
 */
const VS_VARIANTS = new Set<number>([
  MANI_LETTER.DALETH,
  MANI_LETTER.HE,
  MANI_LETTER.MEM,
  MANI_LETTER.NUN,
  MANI_LETTER.RESH,
]);
const VS1 = 0xfe00;
const VS1_MARK = "<v1>";

/**
 * 格式字符透傳（核心規範 Ch10 §10.5 依據）：
 *   · U+200C ZWNJ——ALEPH 通常僅右連 BETH/BHETH（偶 GIMEL），與其他字母間須以
 *     ZWNJ 斷連；規範明文指定。入向/出向均原樣透傳（往返無損，gate ④b 固化）。
 *   · U+0640 ARABIC TATWEEL——詞形圖形延伸（規範明文可借用于摩尼文）；同樣透傳。
 * 兩者非本方案 token，解析器不識別即天然原樣通過，行為與規範一致。
 */

/** 字母碼位 → 拉丁（反查，先到先得；含別名鍵不覆蓋主鍵） */
const LETTER_TO_LATIN: Record<string, string> = (() => {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(LATIN_TO_LETTER)) {
    if (rev[cp(v)] === undefined) rev[cp(v)] = k;
  }
  return rev;
})();

/** 所有拉丁 token（含變音符鍵），最長在前 */
const LETTER_KEYS = Object.keys(LATIN_TO_LETTER).sort((a, b) => b.length - a.length);
const SPECIAL_KEYS = Object.keys(SPECIAL_SEQUENCES).sort((a, b) => b.length - a.length);

/* ---------------- 標點與數字 ---------------- */

/** 標點 → ASCII 對應（雙向；§7 標點系統；語義依核心規範 Ch10 §10.5「Punctuation」段） */
const LATIN_TO_PUNCT: Record<string, number> = {
  // 標題起訖
  "<star>": 0x10af0,
  // 標題/題注起訖
  "<fleuron>": 0x10af1,
  // 散文大單位／韻文一節末
  "<ddwd>": 0x10af2,
  // 散文小單位／韻文半節末
  "<dwd>": 0x10af3,
  // 句內子單位／列舉單位
  "<dot>": 0x10af4,
  "<twodots>": 0x10af5,
  // 行填充（省略號式）
  "<filler>": 0x10af6,
};
const PUNCT_TO_LATIN: Record<string, string> = (() => {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(LATIN_TO_PUNCT)) rev[cp(v)] = k;
  return rev;
})();
const PUNCT_KEYS = Object.keys(LATIN_TO_PUNCT).sort((a, b) => b.length - a.length);

/** 數字雙向（值語義：1/5/10/20/100 加法組合，方向 RTL 由文字層處理） */
const LATIN_TO_NUM: Record<string, number> = {
  "<n1>": MANI_NUM.ONE,
  "<n5>": MANI_NUM.FIVE,
  "<n10>": MANI_NUM.TEN,
  "<n20>": MANI_NUM.TWENTY,
  "<n100>": MANI_NUM.ONE_HUNDRED,
};
const NUM_TO_LATIN: Record<string, string> = (() => {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(LATIN_TO_NUM)) rev[cp(v)] = k;
  return rev;
})();
const NUM_KEYS = Object.keys(LATIN_TO_NUM).sort((a, b) => b.length - a.length);

/* ---------------- 處理選項 ---------------- */

export interface ManichaeanTranslitOptions {
  /**
   * 字形變體（VS-1）與縮寫符處理策略：
   * - `mark`（默認）：`<v1>`／`<abv>`／`<blw>` 標記輸出，往返無損；
   * - `strip`：剝離變體與縮寫符信息，只輸出基礎字母讀法。
   */
  marks?: "mark" | "strip";
}
const markModeOf = (opts?: ManichaeanTranslitOptions): "mark" | "strip" =>
  (opts)?.marks ?? "mark";

/* ---------------- 判定輔助 ---------------- */

function isManichaeanLetter(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= MANICHAEAN_FIRST && c <= MANI_LETTER.TAW;
}
function isManichaeanAbbv(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= ABBV_FIRST && c <= ABBV_LAST;
}

export function isManichaeanUnicode(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (
      (c >= MANICHAEAN_FIRST && c <= MANI_LETTER.TAW) ||
      (c >= ABBV_FIRST && c <= ABBV_LAST) ||
      (c >= NUM_FIRST && c <= NUM_LAST) ||
      (c >= PUNCT_FIRST && c <= PUNCT_LAST)
    ) {
      return true;
    }
  }
  return false;
}

export function looksLikeManichaeanLatin(text: string): boolean {
  return /[βγδθžšś]|ʾ|ʿ|<ud>|<abv>|<blw>|<v1>|<n[1510]0?>|<star>|<dot>/.test(text);
}

/* ---------------- 拉丁 → 摩尼文 ---------------- */

/** 拉丁轉寫 → 摩尼文 Unicode。 */
export function latinToManichaean(input: string, opts?: ManichaeanTranslitOptions): string {
  const mode = markModeOf(opts);
  const MAX_KEY_LEN = Math.max(
    ...LETTER_KEYS.map((k) => k.length),
    ...SPECIAL_KEYS.map((k) => k.length),
    ...PUNCT_KEYS.map((k) => k.length),
    ...NUM_KEYS.map((k) => k.length),
    ...Object.keys(MARK_TO_ABBV).map((k) => k.length),
  );
  const chars = Array.from(input);
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const rest = chars.slice(i, i + MAX_KEY_LEN).join("");

    // 標點
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

    // EDBMT 體例別名（Durkin-Meisterernst Database of Manichaean Texts 記法）：
    // `,`＝縮寫雙點（詞首/詞中/詞尾皆可：rw,n、why,、,hry!r；EDBMT 65 頁全量無獨立逗號用法）→ 縮寫符 BELOW。
    // 摩尼文無 ASCII 逗號原生碼位（此前 `,` 為字面透傳降級容錯）——吸收後 `,`→
    // BELOW 碼位→`<blw>` 記法閉合，往返無損性不降級。輸出側仍用規範 `<blw>` 標記。
    if (rest.startsWith(",")) {  // 詞首 `,hry!r` 亦映射（EDBMT 全量 `,` 恆為縮寫雙點）
      out += cp(MANI_ABBV.BELOW);
      i += 1;
      continue;
    }

    // 縮寫符標記 <abv>/<blw>
    const am = ABBV_MARK_RE.exec(rest);
    if (am) {
      out += cp(MARK_TO_ABBV[am[0]]);
      i += am[0].length;
      continue;
    }

    // 特殊序列 <ud>
    let hit = false;
    for (const key of SPECIAL_KEYS) {
      if (rest.startsWith(key)) {
        out += SPECIAL_SEQUENCES[key];
        i += key.length;
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // 數字
    for (const key of NUM_KEYS) {
      if (rest.startsWith(key)) {
        out += cp(LATIN_TO_NUM[key]);
        i += key.length;
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // 變體標記 <v1>：附著於前一字母（VS-1 組合）
    if (rest.startsWith(VS1_MARK)) {
      if (mode !== "strip") out += cp(VS1);
      i += VS1_MARK.length;
      continue;
    }

    // 輔音字母（含變音符鍵，最長優先）
    let lk = "";
    for (const key of LETTER_KEYS) {
      if (rest.startsWith(key)) { lk = key; break; }
    }
    if (lk) {
      out += cp(LATIN_TO_LETTER[lk]);
      i += lk.length;
      continue;
    }

    out += chars[i];
    i += 1;
  }
  return out;
}

/* ---------------- 摩尼文 → 拉丁 ---------------- */

/** 摩尼文 Unicode → 拉丁轉寫。 */
export function manichaeanToLatin(input: string, opts?: ManichaeanTranslitOptions): string {
  const mode = markModeOf(opts);
  const chars = Array.from(input);
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];

    // 標點
    const p = PUNCT_TO_LATIN[ch];
    if (p !== undefined) { out += p; i += 1; continue; }

    // 數字
    const n = NUM_TO_LATIN[ch];
    if (n !== undefined) { out += n; i += 1; continue; }

    // 字母＋縮寫符（字母後緊跟 10AE5/10AE6）
    if (isManichaeanLetter(ch)) {
      const base = LETTER_TO_LATIN[ch] ?? ch;
      out += base;
      // 緊跟縮寫符／VS-1
      let j = i + 1;
      while (j < chars.length) {
        const cj = chars[j];
        if (isManichaeanAbbv(cj)) {
          if (mode !== "strip") out += ABBV_MARK[cj.codePointAt(0) ?? 0] ?? "";
          j += 1;
          continue;
        }
        if ((cj.codePointAt(0) ?? 0) === VS1 && VS_VARIANTS.has(ch.codePointAt(0) ?? 0)) {
          if (mode !== "strip") out += VS1_MARK;
          j += 1;
          continue;
        }
        break;
      }
      i = j;
      continue;
    }

    // 孤立縮寫符（保底輸出標記）
    if (isManichaeanAbbv(ch)) {
      if (mode !== "strip") out += ABBV_MARK[ch.codePointAt(0) ?? 0] ?? "";
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/* ---------------- 自動方向 ---------------- */

export function convertManichaean(input: string, opts?: ManichaeanTranslitOptions): string {
  return isManichaeanUnicode(input)
    ? manichaeanToLatin(input, opts)
    : latinToManichaean(input, opts);
}

/* ---------------- 檢字表 ---------------- */

function buildManichaeanCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  const notes: Record<string, string> = {
    "ʾ": "aleph；多在 BETH/BHETH 後連寫（L2/11-123R §4）",
    b: "beth",
    "β": "bheth（beth＋兩點）",
    g: "gimel",
    "γ": "ghimel（gimel＋兩點）",
    d: "daleth（有獨立 TAW 對立——與回鶻文 TAW 兼表不同）",
    h: "he（非連寫）",
    w: "waw",
    z: "zayin",
    "ž": "zhayin（zayin＋兩點）",
    j: "jayin（非連寫）",
    "j̈": "jhayin（jayin＋兩點，非連寫）",
    x: "heth",
    "ṭ": "teth（t＋下點記法）",
    y: "yodh",
    k: "kaph",
    "k̇": "xaph（kaph＋一點）",
    "k̈": "khaph（kaph＋兩點）",
    l: "lamedh",
    "δ": "dhamedh（lamedh＋兩點）",
    "θ": "thamedh（≈δδ）",
    m: "mem",
    n: "nun",
    s: "samekh",
    "ʿ": "ayin",
    "ʿ̈": "aayin（ayin＋兩點）",
    p: "pe",
    f: "fe（pe＋一點）",
    c: "sadhe",
    q: "qoph",
    "q̇": "xoph（qoph＋一點）",
    "q̈": "qhoph（qoph＋兩點）",
    r: "resh",
    "š": "shin（非連寫）",
    "ś": "sshin（shin＋兩點，非連寫）",
    t: "taw",
  };
  for (const [k, v] of Object.entries(LATIN_TO_LETTER)) {
    rows.push({ native: cp(v), roman: k, note: notes[k], section: "字母" });
  }
  rows.push({ native: cp(MANI_LETTER.UD), roman: "<ud>", note: "專拼 ud 'and' 的字母", section: "字母" });
  for (const [mark, code] of Object.entries(MARK_TO_ABBV)) {
    rows.push({ native: cp(code), roman: mark, note: "縮寫符（拼寫縮略標記）", section: "縮寫符" });
  }
  rows.push({ native: cp(VS1), roman: VS1_MARK, note: "字形變體選擇（僅 DALETH/HE/MEM/NUN/RESH 五字母；顯著變體，標記保留）", section: "字形變體" });
  for (const [mark, code] of Object.entries(LATIN_TO_NUM)) {
    rows.push({ native: cp(code), roman: mark, note: "摩尼數字（加法組合：1/5/10/20/100）", section: "數字" });
  }
  for (const [mark, code] of Object.entries(LATIN_TO_PUNCT)) {
    const names: Record<string, string> = {
      "<star>": "星號（標題起訖）", "<fleuron>": "花飾（標題/題注起訖）",
      "<ddwd>": "點內雙點（大段落）", "<dwd>": "點內點（小段落/半行）",
      "<dot>": "單點（句內單位）", "<twodots>": "雙點（豎排花飾）",
      "<filler>": "行填充符",
    };
    rows.push({ native: cp(code), roman: mark, note: names[mark] ?? "標點", section: "標點" });
  }
  return rows;
}

/* ---------------- 註冊 ---------------- */

const manichaeanScheme: TransliterationScheme = {
  id: "manichaean",
  label: {
    zh: "摩尼文（拉丁 ↔ Unicode）",
    "zh-TW": "摩尼文（拉丁 ↔ Unicode）",
    ja: "マニ文字（ラテン ↔ Unicode）", ko: "마니 문자(라틴 ↔ Unicode)",
    en: "Manichaean (Latin ↔ Unicode)",
    bo: "མ་ནི་ཡའི་ཡི་གེ།(Latin↔Unicode)",
    fr: "Manichéen (latin ↔ Unicode)", de: "Manichäisch (Latein ↔ Unicode)",
  },
  group: "manichaean",
  primary: true,
  description:
    "摩尼文（U+10AC0–U+10AFF，Unicode 14.0）↔ 學界拉丁轉寫；依 Unicode L2/11-123R。字形變體（VS-1）與縮寫符以 <v1>/<abv>/<blw> 標記保留（strip 可剝）",
  romanToNative: (input: string, opts?: TransliterationOptions) =>
    latinToManichaean(input, opts as ManichaeanTranslitOptions | undefined),
  nativeToRoman: (input: string, opts?: TransliterationOptions) =>
    manichaeanToLatin(input, opts as ManichaeanTranslitOptions | undefined),
  looksLikeNative: isManichaeanUnicode,
  looksLikeRoman: looksLikeManichaeanLatin,
  convert: (input: string, opts?: TransliterationOptions) =>
    convertManichaean(input, opts as ManichaeanTranslitOptions | undefined),
  charTable: buildManichaeanCharTable(),
  romanTokenRe: new RegExp(
    "^(?:" +
      buildManichaeanCharTable()
        .map((r) => r.roman)
        .filter((r) => /[^A-Za-z\u00C0-\u024F]/.test(r))
        .sort((a, b) => b.length - a.length)
        .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")$"
  ),
};

registerScheme(manichaeanScheme);
