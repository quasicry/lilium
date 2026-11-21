// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 八思巴文（'Phags-pa，Unicode U+A840–U+A87F）↔ 羅馬字轉寫器
 * （純函數，無 Obsidian 依賴）。
 *
 * 【歷史地位】八思巴文是元世祖忽必烈命國師八思巴（'Phags-pa bLa-chen）以藏文
 *  字母為基礎創制的「蒙古新字」，1269 年頒行，為元朝國字（方字/元國字）。
 *  垂直書寫 top-to-bottom、列序自左向右（vertical-lr，同傳統蒙古文——事實上
 *  蒙古文直寫傳統正是八思巴文確立下來的）。需要 OpenType shaping（位置變體）。
 *
 * 【羅馬字標準】Poppe–Coblin 音值式轉寫（最通行）：
 *  輔音 ka→k kha→kh ga→g nga→ŋ ca→c cha→ch ja→j nya→ny ta→t tha→th da→d
 *  na→n pa→p pha→ph ba→b ma→m tsa→ts tsha→tsh dza→dz wa→w zha→zh za→z
 *  small a→ʼ（喉塞）ya→y ra→r la→l sha→sh sa→s ha→h qa→q xa→x fa→f gga→γ；
 *  梵文擴充 tta→ṭ ttha→ṭh dda→ḍ nna→ṇ；
 *  母音 a i u e o ee。
 *
 * 【一碼一形 vs 多碼一音】八思巴文是字母文字（非 abugida），多數字母一碼位
 *  對一拉丁 token；但 Unicode 為漢語/梵語/藏語的互補分布另編了碼位——
 *  梵文捲舌四字母（A869–A86C）、漢語 Alternate/Voiceless/Aspirated/Voiced
 *  四字母（A86D–A870）、附標（subjoined/superjoined）字母（A867/A868/A871/A872）。
 *  為保證 1:1 可逆，這些碼位各取**互不衝突**的拉丁 token：
 *   - 附標字母：ʷ(A867) ʸ(A868) ʳ(A871)——後置於母音後的 w/y/r 聲母；
 *     藏文 ra-go 超置字母 A872 → r\u030A（頭上加圈，別於 ʳ）。
 *   - 漢語變體：ý(A86D alternate ya)、ś(A86E voiceless sha)、ẖ(A86F voiced ha)、
 *     fʰ(A870 aspirated fa)。
 *  每個 token 仍可鍵入還原，往返無損。
 *
 * 【變體選擇符】6 個標準化變體序列（Unicode SVS，base+U+FE00）標記蒙古語拼寫
 *  的反向字形：A856 small a、A85C ha、A85E i、A85F u、A860 e、A868 subjoined ya。
 *  同蒙古文 FVS 哲學：默認「標記保留」——nativeToRoman 在字母 token 後輸出
 *  `<vs>` 標記，romanToNative 認得 `<vs>` 並重新附上 U+FE00，往返無損。
 *
 * 【分詞】U+202F NNBSP 分隔詞內音節、U+0020 分隔詞（Core Spec §14 Phags-pa（18.0）
 *  Syllable Division 現代語境建議；碼位依 17.0 NamesList 逐位核對，見下【碼位依據】——
 *  兩處版本依據統一標註，小節號不確切故只標章不標節）；透傳由 translit-run.ts
 *  空白清單保證（r35＋r43 固化）。
 *
 * 【隔音號】U+A78F ꞏ（sinological dot，Latin small letter raised dot）作隔音號，
 *  羅馬字側鍵 "-"（連字符，學術轉寫隔音慣例）。
 *
 * 【碼位依據】Unicode 17.0 NamesList UA840 逐碼位核對（字母名與語言註記）；
 *  未定義碼位：A861 之後僅按 NamesList 所列（A87F 前無 gap——A840–A873、
 *  A874–A877 連續賦字，A878–A87F 未賦）。
 *
 * 字體：Noto Sans PhagsPa（SIL OFL 1.1，隨插件內嵌）。
 */

import {
  registerScheme,
  type CharTableEntry,
  type TransliterationOptions,
  type TransliterationScheme,
} from "./translit-common";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 字母表（羅馬字鍵 → 八思巴碼位） ---------------- */

/** 輔音：核心 22 + small a + qa/xa/fa/gga + 梵文捲舌 + 漢語變體（Poppe–Coblin 音值式） */
const PHAGSPA_CONSONANT: Record<string, number> = {
  // 核心 U+A840–A855（ka…za）
  k: 0xa840, kh: 0xa841, g: 0xa842, "ŋ": 0xa843,
  c: 0xa844, ch: 0xa845, j: 0xa846, ny: 0xa847,
  t: 0xa848, th: 0xa849, d: 0xa84a, n: 0xa84b,
  p: 0xa84c, ph: 0xa84d, b: 0xa84e, m: 0xa84f,
  ts: 0xa850, tsh: 0xa851, dz: 0xa852, w: 0xa853,
  zh: 0xa854, z: 0xa855,
  // small a：喉塞音 ʼ（蒙古語詞首母音標記；SVS FE00 反向字形）
  "ʼ": 0xa856,
  // ya…ha（A857–A85C）
  y: 0xa857, r: 0xa858, l: 0xa859, sh: 0xa85a, s: 0xa85b, h: 0xa85c,
  // 蒙古 / 維吾爾專用（A862–A865）
  q: 0xa862, x: 0xa863, f: 0xa864, "γ": 0xa865,
  // 梵文捲舌（A869–A86C）
  "ṭ": 0xa869, "ṭh": 0xa86a, "ḍ": 0xa86b, "ṇ": 0xa86c,
  // 漢語 Alternate / Voiceless / Voiced / Aspirated 變體（A86D–A870）——
  // 與基礎字母同音位但字形/音值有別，1:1 可逆起見取獨立 token
  "ý": 0xa86d, // alternate ya（字形異於 A857）
  "ś": 0xa86e, // voiceless sha（清聲母，異於 A85A sha）
  "ẖ": 0xa86f, // voiced ha（濁聲母，異於 A85C ha）
  "fʰ": 0xa870, // aspirated fa（送氣，異於 A864 fa）
};

/** 獨立 / 附屬字母：母音與附標輔音 */
const PHAGSPA_VOWEL: Record<string, number> = {
  a: 0xa85d, // letter A（零母音 / 固有 a）
  i: 0xa85e, u: 0xa85f, e: 0xa860, o: 0xa861,
  ee: 0xa866, // 蒙古語 ee（圓唇前母音長音）
};

/** 附標字母（subjoined / superjoined）——後置於母音的 w/y/r 聲母與藏文 ra-go */
const PHAGSPA_SUBJOINED: Record<string, number> = {
  "ʷ": 0xa867, // subjoined wa（漢語 -wa 音節尾聲母）
  "ʸ": 0xa868, // subjoined ya（SVS FE00 反向字形，蒙古語拼寫用）
  "ʳ": 0xa871, // subjoined ra（梵文 r 聲母 / 藏文 r 詞根）
  "r\u030A": 0xa872, // superfixed ra（藏文 ra-go 疊置，Tibetan 專用）
};

/** 符號：candrabindu（梵語鼻化，對應天城體 anusvāra/candrabindu） */
const PHAGSPA_SIGN: Record<string, number> = {
  "ṃ": 0xa873,
};

/** 標點：卷首符（Tibetan yig mgo 對應）與 shad */
const PHAGSPA_PUNCT: Record<string, number> = {
  "❈": 0xa874, // single head mark（單卷首符）
  "❉": 0xa875, // double head mark（雙卷首符）
  ".": 0xa876, // shad（單 shad）
  "||": 0xa877, // double shad（雙 shad）
  "-": 0xa78f, // sinological dot ꞏ（隔音號；Latin small letter raised dot U+A78F）
};

/**
 * 蒙古文標點（U+1800–1809）——八思巴文獻排版慣用，nativeToRoman 側映射。
 * n2622＋Unicode 18.0 NamesList 實錘修正三處語義錯配：
 *  - birga（章節起首）是 U+1800；U+1805 是 FOUR DOTS（章節之末）——原 <birga>→1805
 *    錯碼位，已改 1800（與 mongolian.ts、UA840 A874→1800 對應一致）。
 *  - U+1808 是 MANCHU COMMA（滿文逗號，mongolian.ts <mcomma>），非「句號變體」——
 *    正名 <mcomma>；滿文句號 U+1809 補收 <mfullstop>。
 *  - U+1804 是 MONGOLIAN COLON（冒號），非「雙句號」——正名 <mcolon>。
 * ᠂ 逗號 → ","（romanToNative 反向認 "," 回 U+1802，往返無損）；
 * ᠃ 句號 → "<mstop>"——區分鍵（定案）：此前併入 "."/"||" 屬多對一不可逆；
 *   "."/"||" 仍專屬八思巴 shad 系。U+1806 補收 <sophy>（soft hyphen，印刷本
 *   換列斷詞續行，n2622 提及場景）。
 */
const PHAGSPA_MONGOL_PUNCT_TO_ROMAN: Record<number, string> = {
  0x1802: ",",
  0x1803: "<mstop>",
  0x1804: "<mcolon>",
  0x1805: "<fourdots>",
  0x1806: "<sophy>",
  0x1808: "<mcomma>",
  0x1809: "<mfullstop>",
  0x1800: "<birga>",
};

/** 長度降序的鍵序列（最長鍵優先：tsh 不被 ts 拆、ṭh 不被 ṭ 拆、|| 不被 | 拆） */
const sortedKeys = (m: Record<string, number>): string[] =>
  Object.keys(m).sort((a, b) => b.length - a.length);

const consKeys = sortedKeys(PHAGSPA_CONSONANT);
const vowelKeys = sortedKeys(PHAGSPA_VOWEL);
const subKeys = sortedKeys(PHAGSPA_SUBJOINED);
const signKeys = sortedKeys(PHAGSPA_SIGN);
const punctKeys = sortedKeys(PHAGSPA_PUNCT);
const ALL_KEYS = [...consKeys, ...vowelKeys, ...subKeys, ...signKeys, ...punctKeys]
  .sort((a, b) => b.length - a.length);
// r59 批次乙：五表合併預建一次（原在 phagsPaRomanToNative 迴圈內逐字符展開五張表）
const PHAGSPA_ALL_MAP: Record<string, number> = {
  ...PHAGSPA_CONSONANT, ...PHAGSPA_VOWEL, ...PHAGSPA_SUBJOINED, ...PHAGSPA_SIGN, ...PHAGSPA_PUNCT,
};

/* ---------------- 反查表（八思巴碼位 → 羅馬字） ---------------- */

function buildReverse(map: Record<string, number>): Map<number, string> {
  const m = new Map<number, string>();
  for (const [roman, code] of Object.entries(map)) {
    if (m.has(code)) throw new Error(`八思巴映射衝突：U+${code.toString(16)} 對應多個拉丁 token`);
    m.set(code, roman);
  }
  return m;
}
const REV_CONSONANT = buildReverse(PHAGSPA_CONSONANT);
const REV_VOWEL = buildReverse(PHAGSPA_VOWEL);
const REV_SUBJOINED = buildReverse(PHAGSPA_SUBJOINED);
const REV_SIGN = buildReverse(PHAGSPA_SIGN);
const REV_PUNCT = buildReverse(PHAGSPA_PUNCT);

/** 標準化變體序列的基底碼位（base + U+FE00） */
const SVS_BASES = new Set([0xa856, 0xa85c, 0xa85e, 0xa85f, 0xa860, 0xa868]);

const PHAGSPA_BLOCK = (c: number): boolean => c >= 0xa840 && c <= 0xa87f;
const VS = 0xfe00;

/* 【上下文自動鏡像】Unicode 18 Core Spec §14.4 Mirrored Variants（Table 14-8/14-9）：
 *  梵文捲舌系列 tta/ttha/dda/nna（A869–A86C）莖軸在左，其後直接或經另一鏡像字母
 *  出現 6 鏡像候選字母時，渲染系統應**自動**選鏡像字形；VS1（U+FE00）語義是
 *  「反轉預期」——上下文預期鏡像時 VS1 反而取消鏡像。
 *  純字形層判定，不改變轉寫往返（數據不加碼位）。 */
const MIRROR_TRIGGERS = new Set([0xa869, 0xa86a, 0xa86b, 0xa86c]);

/**
 * 判定八思巴文本中某鏡像候選字符在上下文中應否顯示鏡像字形。
 * @param codepoints 原文本碼位陣列
 * @param i 當前字符索引（codepoints[i] 必為 6 鏡像候選之一）
 * @returns true＝該字符應鏡像顯示（上下文預期且未帶 VS1）
 */
export function phagsPaContextMirror(codepoints: number[], i: number): boolean {
  const c = codepoints[i];
  if (!SVS_BASES.has(c)) return false;
  // 已帶 VS1 → 顯式反轉預期，不作上下文判定（顯示交給字體的標準 SVS）
  if (codepoints[i + 1] === VS) return false;
  // 回溯最近的八思巴字母（跳過 VS 與組合點類附標）
  for (let j = i - 1; j >= 0; j--) {
    const p = codepoints[j];
    if (p === VS) continue;
    if (MIRROR_TRIGGERS.has(p)) return true;
    if (PHAGSPA_BLOCK(p)) return false;
    // 非八思巴區塊字符（空格/標點/拉丁）打斷音節單元
    return false;
  }
  return false;
}

/** 是否像八思巴文原生文字（U+A840–U+A87F 任一碼位；含變體選擇符跟隨判定） */
export function looksLikePhagsPaUnicode(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (PHAGSPA_BLOCK(c)) return true;
  }
  return false;
}

/**
 * 是否像八思巴 Poppe 式羅馬轉寫。
 * r59：比照 mongolian.ts looksLikeMongolianRoman（B-M3）收窄——原「含任一 ASCII 字母」
 * 對英文/拼音整句恆真，auto 方向易誤判。改為「含轉寫特徵字符（ŋ γ ś ẖ ʼ ʷ ʸ ʳ ṃ ṭ ḍ ṇ ḥ ṣ ṅ ý
 * 及組合 r\u030A），或整體皆屬轉寫字符集（字母＋特徵＋方案標點 token）」。
 * 純 ASCII 字母的普通文本不再放行；帶特徵字符的單詞級轉寫仍判拉丁。
 */
export function looksLikePhagsPaRoman(text: string): boolean {
  // 轉寫特徵/允許碼位表（含組合 ring above U+030A 與尾組合符）；逐碼位檢查，
  // 避免字元類中組合字符與裸基字並排的歧義（官方審核 no-misleading-character-class）
  const FEATS = new Set(["\u014B", "\u03B3", "\u015B", "\u1E96", "\u02BC", "\u02B7", "\u02B8", "\u02B3",
    "\u030A", "\u1E43", "\u1E6D", "\u1E0D", "\u1E47", "\u1E25", "\u1E63", "\u1E45", "\u00FD",
    "\u0301", "\u0303", "\u0304", "\u0306", "\u0307", "\u0308", "\u030C", "\u0323", "\u0331"]);
  const BASE = /[a-z'\u2019<>{}|/:\s.,-]/i;
  const cps = [...text];
  const hasFeat = cps.some((c) => FEATS.has(c));
  const hasLetter = cps.some((c) => /[a-z]/i.test(c));
  if (!hasLetter && !hasFeat) return false;
  return hasFeat || cps.every((c) => FEATS.has(c) || BASE.test(c));
}

/* ---------------- romanToNative ---------------- */

/** position 起最長鍵匹配，回傳 [鍵, 碼位] 或 null */
function matchAt(input: string, pos: number, keys: string[], map: Record<string, number>): [string, number] | null {
  for (const k of keys) if (k.length && input.startsWith(k, pos)) return [k, map[k]];
  return null;
}

/**
 * Poppe 式羅馬轉寫 → 八思巴文。
 * 最長鍵優先；`<vs>` 標記還原為 U+FE00（標準化變體序列）；未命中原樣保留。
 */
export function phagsPaRomanToNative(input: string, _opts?: TransliterationOptions): string {
  const src = input.normalize("NFC");
  let out = "";
  let i = 0;
  while (i < src.length) {
    // <vs> 標記 → U+FE00（附於前一字母；單獨出現亦保留無損）
    if (src.startsWith("<vs>", i)) {
      out += cp(VS);
      i += 4;
      continue;
    }
    // <birga> 標記 → U+1800（蒙古文 birga，章節起首標記；r56 修正：原誤 1805 four dots）
    if (src.startsWith("<birga>", i)) {
      out += cp(0x1800);
      i += 7;
      continue;
    }
    // 蒙文標點區分鍵 → 各自原碼位（見 MONGOL 表註 r56 正名）
    if (src.startsWith("<mstop>", i)) {
      out += cp(0x1803);
      i += 7;
      continue;
    }
    if (src.startsWith("<mcolon>", i)) {
      out += cp(0x1804);
      i += 8;
      continue;
    }
    if (src.startsWith("<fourdots>", i)) {
      out += cp(0x1805);
      i += 10;
      continue;
    }
    if (src.startsWith("<sophy>", i)) {
      out += cp(0x1806);
      i += 7;
      continue;
    }
    if (src.startsWith("<mcomma>", i)) {
      out += cp(0x1808);
      i += 8;
      continue;
    }
    if (src.startsWith("<mfullstop>", i)) {
      out += cp(0x1809);
      i += 11;
      continue;
    }
    // 舊鍵相容別名（前語義錯配，保留映射使舊文本往返不破壞；鍵不再輸出）
    if (src.startsWith("<mstop2>", i)) {
      out += cp(0x1808);
      i += 8;
      continue;
    }
    if (src.startsWith("<mdstop>", i)) {
      out += cp(0x1804);
      i += 8;
      continue;
    }
    // 羅馬逗號 → 蒙古文逗號 U+1802（八思巴文獻標點往返）
    if (src[i] === ",") {
      out += cp(0x1802);
      i += 1;
      continue;
    }
    const c = matchAt(src, i, ALL_KEYS, PHAGSPA_ALL_MAP);
    if (c) {
      out += cp(c[1]);
      i += c[0].length;
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

/* ---------------- nativeToRoman ---------------- */

/**
 * 八思巴文 → Poppe 式羅馬轉寫。
 * 一碼位一 token；U+FE00 變體選擇符以 `<vs>` 標記保留（僅在 6 個標準 SVS 基底
 * 之後輸出；游離 FE00 原樣透傳）；未命中原樣保留。
 */
export function phagsPaNativeToRoman(input: string, _opts?: TransliterationOptions): string {
  const text = input.normalize("NFC");
  const codes = [...text].map((ch) => ch.codePointAt(0)!);
  let out = "";
  for (let i = 0; i < codes.length; i++) {
    const n = codes[i];
    // 變體選擇符：前一字元是 SVS 基底且剛輸出了其 token → 標記保留
    if (n === VS) {
      const prev = i > 0 ? codes[i - 1] : 0;
      if (SVS_BASES.has(prev)) out += "<vs>";
      else out += cp(n); // 游離 VS 透傳（往返無損）
      continue;
    }
    const t = REV_CONSONANT.get(n) ?? REV_VOWEL.get(n) ?? REV_SUBJOINED.get(n)
      ?? REV_SIGN.get(n) ?? REV_PUNCT.get(n) ?? PHAGSPA_MONGOL_PUNCT_TO_ROMAN[n];
    if (t !== undefined) { out += t; continue; }
    out += String.fromCodePoint(n);
  }
  return out;
}

/* ---------------- 自動判定 / 自動互轉 ---------------- */

/** 自動轉換：八思巴文 ⇄ Poppe 式羅馬轉寫 */
export function convertPhagsPa(text: string, opts?: TransliterationOptions): string {
  return looksLikePhagsPaUnicode(text)
    ? phagsPaNativeToRoman(text, opts)
    : phagsPaRomanToNative(text, opts);
}

/* ---------------- 檢字表 ---------------- */

function buildPhagsPaCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  const push = (roman: string, code: number, section: string, note?: string): void => {
    rows.push({ roman, native: cp(code), section, note });
  };
  for (const [r, c] of Object.entries(PHAGSPA_VOWEL)) push(r, c, "母音");
  for (const [r, c] of Object.entries(PHAGSPA_CONSONANT)) {
    const note =
      r === "ʼ" ? "small a：喉塞音（詞首母音標記）" :
      r === "γ" ? "gga：蒙古語小舌濁擦音（A862 qa 之反轉造字）" :
      r === "ý" ? "漢語 Alternate ya（字形異於 A857 ya）" :
      r === "ś" ? "漢語 Voiceless sha（清聲母）" :
      r === "ẖ" ? "漢語 Voiced ha（濁聲母）" :
      r === "fʰ" ? "漢語 Aspirated fa（送氣）" :
      ["ṭ", "ṭh", "ḍ", "ṇ"].includes(r) ? "梵文捲舌音（Sanskrit 擴充）" :
      undefined;
    push(r, c, "輔音", note);
  }
  push("ʷ", 0xa867, "附標輔音", "subjoined wa（母音後聲母，漢/梵/藏用）");
  push("ʸ", 0xa868, "附標輔音", "subjoined ya（SVS FE00 反向字形）");
  push("ʳ", 0xa871, "附標輔音", "subjoined ra");
  push("r\u030A", 0xa872, "附標輔音", "superfixed ra（藏文 ra-go 疊置）");
  push("ṃ", 0xa873, "符號", "candrabindu（梵語鼻化；對應藏文 sna ldan 0F83／anusvāra 0F7E／蒙古 ali gali anusvara one 1880）");
  push("❈", 0xa874, "標點", "single head mark（卷首符，Tibetan 用）");
  push("❉", 0xa875, "標點", "double head mark（雙卷首符）");
  push(".", 0xa876, "標點", "shad（單 shad）");
  push("||", 0xa877, "標點", "double shad（雙 shad）");
  push("-", 0xa78f, "標點", "sinological dot ꞏ（隔音號）");
  push(",", 0x1802, "標點", "蒙古文逗號 U+1802（八思巴文獻標點）");
  push("<mstop>", 0x1803, "標點", "蒙古文句號 U+1803（shad 排版變體；區分鍵，往返恆等）");
  push("<mcolon>", 0x1804, "標點", "蒙古文冒號 U+1804（區分鍵，往返恆等）");
  push("<fourdots>", 0x1805, "標點", "蒙古文四點 U+1805（章節之末）");
  push("<sophy>", 0x1806, "標點", "蒙古文 soft hyphen U+1806（第二行行首斷詞續行）");
  push("<mcomma>", 0x1808, "標點", "滿文逗號 U+1808（區分鍵，往返恆等）");
  push("<mfullstop>", 0x1809, "標點", "滿文句號 U+1809（區分鍵，往返恆等）");
  push("<birga>", 0x1800, "標點", "蒙古文 birga U+1800（章節起首標記）");
  // 拼寫規則註記（同 mongolian.ts 體例）
  rows.push({ native: "—", roman: "<vs>", note: "標準化變體序列 U+FE00 標記（6 個標準 SVS：A856/A85C/A85E/A85F/A860/A868 反向字形），往返無損", section: "拼寫規則" });
   rows.push({ native: "—", roman: "<birga>", note: "蒙古文 birga 章節起首標記 U+1800，往返無損", section: "拼寫規則" });
  rows.push({ native: "—", roman: "單雙卷首符", note: "A874/A875 多數文本互換僅為字形變體；個別文本對立使用（雙＝篇首、單＝新列首）——n2622 語料學註記", section: "拼寫規則" });
  rows.push({ native: "—", roman: "長鍵優先", note: "tsh/ts、kh/k、ch/c、ph/p、sh/s、zh/z、ṭh/ṭ 以最長鍵匹配，不拆散", section: "拼寫規則" });
  rows.push({ native: "—", roman: "ee", note: "A866 為蒙古語專用長母音 ee（獨立碼位）", section: "拼寫規則" });
  return rows;
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */

const phagsPaCharTable = buildPhagsPaCharTable();

const phagspaPoppe: TransliterationScheme = {
  id: "phagspa-poppe",
  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "八思巴文（Poppe 拉丁 ↔ Unicode）",
    "zh-TW": "八思巴文（Poppe 拉丁 ↔ Unicode）",
    en: "'Phags-pa (Poppe Latin ↔ Unicode)",
    ja: "パスパ文字（ポッペ転写 ↔ Unicode）", ko: "파스파 문자(포페 전자 ↔ Unicode)",
    bo: "ཧོར་ཡིག",
  fr: "'Phags-pa (latin Poppe ↔ Unicode)", de: "'Phags-pa (Poppe-Latein ↔ Unicode)", },
  group: "phagspa",
  primary: true,
  description:
    "八思巴文（'Phags-pa，U+A840–A87F）Poppe–Coblin 音值式轉寫 ↔ Unicode。" +
    "元朝國字，垂直書寫、列序自左向右；SVS U+FE00 以 <vs> 標記往返無損。",
  romanToNative: (input: string, opts?: TransliterationOptions) =>
    phagsPaRomanToNative(input, opts),
  nativeToRoman: (input: string, opts?: TransliterationOptions) =>
    phagsPaNativeToRoman(input, opts),
  looksLikeNative: looksLikePhagsPaUnicode,
  looksLikeRoman: looksLikePhagsPaRoman,
  convert: (input: string, opts?: TransliterationOptions) =>
    convertPhagsPa(input, opts),
  charTable: phagsPaCharTable,
};

registerScheme(phagspaPoppe);
