// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 藏文（Tibetan）Wylie ↔ Unicode 雙向轉寫器（純函數，無 Obsidian 依賴）。
 *
 * 方案：Wylie（T. V. Wylie, 1959），藏學界傳統通行標準，ASCII-only、可無損往返。
 *
 * 藏文 Unicode 區段 U+0F00–U+0FFF，書寫方向 horizontal-tb / LTR（非直排文字）。
 * 音節結構（碼位序列，字體負責合字形）：
 *   [前加字 g/d/b/m/'a] [上加字 r/l/s] 基字 [下加字 y/r/l/w] [元音符號] [後加字…]
 * 元音先行音節：a-chen（U+0F68）作基，後接元音符號（如 i→ཨི、oM→ཨོཾ）。
 * Unicode 無預組合碼位，故純字串替換可無損往返（拼寫層）。
 *
 * 已知邊界（標註爲原樣保留，不轉寫）：罕見複合堆疊超出本版有限表者視爲非藏文音節、
 * 原樣保留。U+0F85 PALUTA、U+0F86 LCI RTAGS、U+0F87 YANG RTAGS 已納入
 * 擴展方案無損 token 表（碼位 token，見 TIB_PUNCT）。
 */

import {
  CharTableEntry,
  TransliterationScheme,
  TransliterationOptions,
  registerScheme,
} from "./translit-common";

const cp = (n: number): string => String.fromCodePoint(n);

/** 基字 / 前加字 / 上加 / 下加：Wylie 字母 → Unicode 碼位 */
// prettier-ignore
const WYLIE_TO_CP: Record<string, number> = {
  k:0x0F40, kh:0x0F41, g:0x0F42, gh:0x0F43, ng:0x0F44,
  c:0x0F45, ch:0x0F46, j:0x0F47, jh:0x0F48, ny:0x0F49,
  T:0x0F4A, Th:0x0F4B, D:0x0F4C, Dh:0x0F4D, N:0x0F4E,
  t:0x0F4F, th:0x0F50, d:0x0F51, dh:0x0F52, n:0x0F53,
  p:0x0F54, ph:0x0F55, b:0x0F56, bh:0x0F57, m:0x0F58,
  ts:0x0F59, tsh:0x0F5A, dz:0x0F5B, dzh:0x0F5C, w:0x0F5D,
  zh:0x0F5E, z:0x0F5F, "'":0x0F60, y:0x0F61, r:0x0F62, l:0x0F63,
  sh:0x0F64, S:0x0F65, s:0x0F66, h:0x0F67, a:0x0F68, kS:0x0F69,
  kk:0x0F6B, R:0x0F6A,
};
/** 反向：碼位 → Wylie 字母 */
const CP_TO_WYLIE: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(WYLIE_TO_CP)) m[v] = k;
  return m;
})();
/** 最長匹配用的鍵（按長度降序） */
const WYLIE_KEYS = Object.keys(WYLIE_TO_CP).sort((a, b) => b.length - a.length);

/**
 * 下加字（subjoined）專用碼位。
 * 藏文堆疊中，下加字必須使用 subjoined 形式，字體才會正確渲染為下加字形：
 *   y → U+0FB1 SUBJOINED YA、r → U+0FB2 SUBJOINED RA、
 *   l → U+0FB3 SUBJOINED LA、w → U+0FAD SUBJOINED WA
 * 若誤用主字符（U+0F61/0F62/0F63/0F5D），字形會變成並列而非堆疊（排版錯誤）。
 * 上加字（r/l/s）則仍使用主字符（U+0F62/0F63/0F66），由字體渲染為上加。
 */
// prettier-ignore
const SUBJOINED_CP: Record<string, number> = { y: 0x0FB1, r: 0x0FB2, l: 0x0FB3, w: 0x0FAD };
/**
 * 下加字（subjoined）碼位全體：U+0F90–U+0FBC。
 * 藏文堆疊中「下加字」是整個 subjoined 區，不只是 y/r/l/w（U+0FB1/0xFB2/0xFB3/0x0FAD）。
 * 例如 ྡ（U+0xFA1，下加字 ta）、ྦ（下加字 ba）等絕大多數下加字都落在這個區段；
 * 舊實作只認 y/r/l/w，導致 པདྨ（pa+下加 da+ma）這類真實佛經音節被誤讀爲
 * 「pa + 獨立 da + ma」而吐錯 Wylie、且無法往返。本版擴展到整個 subjoined 區。
 */
const isSubjoinedCp = (c: number): boolean => c >= 0x0f90 && c <= 0x0fbc;
/** subjoined 區全體（U+0F90–U+0FBC）：部分文本會用 subjoined 形式寫上加字後的基字 */
const isSubjoinedBlockCp = (c: number): boolean => c >= 0x0f90 && c <= 0x0fbc;
/** 歸一化到主字符碼位（subjoined 區全體 = 主字母 + 0x50） */
const baseCpOf = (c: number): number => (isSubjoinedBlockCp(c) ? c - 0x50 : c);
/** 下加字碼位 → Wylie 基字母（整個 subjoined 區通用：ྡ→d、ྦ→b、0x0FB1→y…） */
const subjoinedToWylie = (c: number): string | undefined => {
  const base = baseCpOf(c);
  return CP_TO_WYLIE[base];
};

/** 元音符號 / 鼻音 / 止聲：Wylie 字符 → Unicode 碼位 */
// prettier-ignore
const WYLIE_VOWEL_TO_CP: Record<string, number> = {
  // B1：I/U 改爲分解序輸出（0F71+0F72 / 0F71+0F74，與 -I 政策一致；
  // BDRC ewts 規範輸出）。入向已支援組合序（NFKC 分解 0F73→0F71 0F72），
  // 表中碼位僅作解析側 placeholder（matchToken 可達），輸出經 VOWEL_TOKEN_SEQ 分解。
  A:0x0F71, I:0x0F73, U:0x0F75, E:0x0F7B, O:0x0F7D,
  M:0x0F7E, H:0x0F7F,
  r:0x0F76, l:0x0F78, L:0x0F79,
  // R 移出元音表——0F77 deprecated（NamesList 分解 0FB2+0F81→NFKC 0FB2+0F71+0F80），
  // EWTS 鍵 R 歸 fixed-form RA（0F6A）；0F77 解析由 NFKC 分解路徑承擔。
  i:0x0F72, u:0x0F74, e:0x0F7A, o:0x0F7C,
  // EWTS v2.0 §2，THL/BDRC 雙源確認：
  //   -i → U+0F80 REVERSED I、-I → U+0F71+U+0F80 長形分解序（0F81 deprecated，
  //   輸出側一律分解：-I 不進本表，見 buildTibetan 的特例分支）
  "-i":0x0F80,
  "-I":0x0F81, //解析側 placeholder（matchToken 可達）；輸出經 VOWEL_TOKEN_SEQ 分解 0F71+0F80
};
const CP_VOWEL_TO_WYLIE: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(WYLIE_VOWEL_TO_CP)) m[v] = k;
  return m;
})();
// 補：藏文鼻音符號在羅馬側同以 M（anusvāra，ṃ）表達。
//   U+0F82 NYI ZLA NAA DA（candrabindu with ornament）= 鼻音 → M
//   U+0F83 SNA LDAN（candrabindu）                    = 鼻音 → M
// 兩者都是「ṃ」的藏文寫法，與 U+0F7E RJES SU NGA RO（anusvāra）功能等價：
// Wylie 單一 M token 無法區分三者，故統一讀作 M、統一寫出 U+0F7E。
// 舊版把 U+0F83 誤映成 H（visarga）——那是 U+0F7F RNAM BCAD 的職能，
// 導致六字真言末音節 ཧཱུྃ 被錯讀成 hAuH（止聲）而非 hAuM（鼻音），屬真實佛經誤譯。
CP_VOWEL_TO_WYLIE[0x0f82] = "M";
CP_VOWEL_TO_WYLIE[0x0f83] = "M";
// U+0F80 REVERSED I ↔ EWTS「-i」（THL §2/BDRC 確認；0F81 deprecated 走分解）
CP_VOWEL_TO_WYLIE[0x0f80] = "-i";
// deprecated 聲化元音碼位（0F76-0F79/0F81）自 CP_VOWEL_TO_WYLIE 剔除——
// 輸出端 NFKC 分解（0F77→0FB2+0F71+0F80 等，BDRC normalizeUnicode 對齊），
// 再由分解後的 0F76? 不，分解後為 0FB2/0FB3+0F80/0F71+0F80，已由 -i/ra-ru 通路覆蓋。
delete CP_VOWEL_TO_WYLIE[0x0f76];
delete CP_VOWEL_TO_WYLIE[0x0f77];
delete CP_VOWEL_TO_WYLIE[0x0f78];
delete CP_VOWEL_TO_WYLIE[0x0f79];
delete CP_VOWEL_TO_WYLIE[0x0f81];

// 孤立元音標註鍵：真實藏文元音符號必須依附音節（Wylie 無孤立元音語法），
// 但檢字表/符號清單逐字符輸入時會出現孤立元音段（unicodeSyllableToWylie 舊版
// items.length===0 直接原樣透傳藏文）。
// 出向 <v-*> 顯式標註（與 <.>/<-> 標註家族同構）；入向還原為規範分解碼位序
// （precomposed 0F73/75/81 一律走 NFKC 分解，與輸出端 deprecated 單體政策一致）。
const ISOLATED_VOWEL_TO_TOKEN: Record<number, string> = {
  0x0f71: "<v-A>", 0x0f72: "<v-i>", 0x0f73: "<v-i>",  // 0F73=0F71+0F72 → <v-A><v-i> 展開
  0x0f74: "<v-u>", 0x0f75: "<v-u>",
  0x0f76: "<v-r-i>", 0x0f77: "<v-r-A-i>",
  0x0f78: "<v-l-i>", 0x0f79: "<v-l-A-i>",
  0x0f7a: "<v-e>", 0x0f7b: "<v-E>", 0x0f7c: "<v-o>", 0x0f7d: "<v-O>",
  0x0f7e: "<v-M>", 0x0f7f: "<v-H>", 0x0f80: "<v--i>", 0x0f81: "<v--i>",
  0x0f82: "<v-M>", 0x0f83: "<v-M>",
};
// 鼻音符號孤立差異鍵：音節內三 bindu 統一 M（0F7E 出向），孤立標註可無損區分字形
ISOLATED_VOWEL_TO_TOKEN[0x0f7e] = "<v-M>";
ISOLATED_VOWEL_TO_TOKEN[0x0f82] = "<v-Mc>";
ISOLATED_VOWEL_TO_TOKEN[0x0f83] = "<v-Ms>";
// 孤立下加字標註鍵 <s-*>：真實語境下加字永遠依附基字（Wylie 疊字連寫），
// 孤立碼位（符號清單輸入）舊版走「sub 基字寫法」出基字母，往返丟失下加語義。
const ISOLATED_SUB_TO_TOKEN: Record<number, string> = {};
for (let scp = 0x0f90; scp <= 0x0fbc; scp++) {
  const base = baseCpOf(scp);
  const bw = CP_TO_WYLIE[base];
  if (bw !== undefined) ISOLATED_SUB_TO_TOKEN[scp] = `<s-${bw}>`;
}
// 特例：0FBC SUBJOINED FIXED-FORM RA（baseCpOf 無 0F6A Wylie 鍵，迴圈生成不到）；
// EWTS fixed-form RA 鍵 R，孤立下加標註 <s-R>
// fixed-form 系 baseCpOf 統一折 0F6A——三碼位須各自鍵（EWTS fixed-form 鍵：W? THL 無官方鍵，用大寫 W/Y/R 區別）
ISOLATED_SUB_TO_TOKEN[0x0fba] = "<s-W>";
ISOLATED_SUB_TO_TOKEN[0x0fbb] = "<s-Y>";
ISOLATED_SUB_TO_TOKEN[0x0fbc] = "<s-R>";
const ISOLATED_SUB_TOKEN_TO_CP: Record<string, number> = {};
for (const [k, v] of Object.entries(ISOLATED_SUB_TO_TOKEN)) ISOLATED_SUB_TOKEN_TO_CP[v] = Number(k);

const ISOLATED_VOWEL_TOKEN_TO_SEQ: Record<string, number[]> = {
  "<v-A>": [0x0f71], "<v-i>": [0x0f72], "<v-u>": [0x0f74],
  "<v-e>": [0x0f7a], "<v-E>": [0x0f7b], "<v-o>": [0x0f7c], "<v-O>": [0x0f7d],
  "<v-M>": [0x0f7e], "<v-Mc>": [0x0f82], "<v-Ms>": [0x0f83],
  "<v-H>": [0x0f7f], "<v--i>": [0x0f80],
  "<v-r-i>": [0x0fb2, 0x0f80], "<v-r-A-i>": [0x0fb2, 0x0f71, 0x0f80],
  "<v-l-i>": [0x0fb3, 0x0f80], "<v-l-A-i>": [0x0fb3, 0x0f71, 0x0f80],
};

/**
* Wylie 元音 token → 輸出碼位序（支援多碼位分解序）。
*   · 單碼位 token：與 WYLIE_VOWEL_TO_CP 一致；
*   · `-I`（REVERSED II）：U+0F81 已 deprecated（NamesList「use of this character
*     is discouraged」），輸出側一律分解為 U+0F71+U+0F80（BDRC ewts-converter
*     normalizeUnicode 同規則：0F81→0F71 0F80）。輸入側 0F81 由 NFKC 分解承接。
*/
const VOWEL_TOKEN_SEQ: Record<string, number[]> = {
"-I": [0x0f71, 0x0f80],
  // B1：長 I/U 一律分解輸出（與 -I 政策一致；BDRC ewts 規範輸出），
  // 0F73/0F75 預組合碼位 deprecated（NamesList 分解 0F71 0F72 / 0F71 0F74）
  "I": [0x0f71, 0x0f72],
  "U": [0x0f71, 0x0f74],
  // deprecated 預組合聲化元音的規範分解輸出（BDRC ewts-converter
  // normalizeUnicode 同規則；NamesList：0F76=0FB2 0F80、0F77=0FB2 0F81（→0FB2 0F71 0F80）、
  // 0F78=0FB3 0F80、0F79=0FB3 0F81（→0FB3 0F71 0F80）；0F81 deprecated → 一律 0F71 0F80）
  r: [0x0fb2, 0x0f80],
  R: [0x0fb2, 0x0f71, 0x0f80],
  l: [0x0fb3, 0x0f80],
  L: [0x0fb3, 0x0f71, 0x0f80],
};
const vowelTokenToCps = (tok: string): string =>
VOWEL_TOKEN_SEQ[tok]
  ? VOWEL_TOKEN_SEQ[tok].map((c) => cp(c)).join("")
  : cp(WYLIE_VOWEL_TO_CP[tok]);
const WYLIE_VOWEL_KEYS = Object.keys(WYLIE_VOWEL_TO_CP).sort((a, b) => b.length - a.length);

// 結構集合（字串層）
const PREFIX = new Set(["g", "d", "b", "m", "'"]);
const SUPER = new Set(["r", "l", "s"]);
const SUB = new Set(["y", "r", "l", "w"]);
// 後加字（含梵文音寫中出現的捲舌音 ཎ N）：གུཎ guṇa 這類真實佛經詞的 ཎ 是後加字
// （帶自身固有 a、不寫出），缺 N 時 གུཎ 會被錯讀成「前加 g + 基 ཎ + u」的 gNu。
const SUFFIX = new Set(["g", "ng", "d", "n", "b", "m", "'", "r", "l", "s", "N"]);

// 結構集合（碼位層，由上面的映謝導出，避免硬編碼錯位）
const PREFIX_CP = new Set([...PREFIX].map((t) => WYLIE_TO_CP[t]));
const SUPER_CP = new Set([...SUPER].map((t) => WYLIE_TO_CP[t]));
const SUFFIX_CP = new Set([...SUFFIX].map((t) => WYLIE_TO_CP[t]));
/** 輔音碼位（含 subjoined 區全體，保證堆疊音節能被完整解析） */
const isConsonantCp = (c: number): boolean =>
  (c >= 0x0f40 && c <= 0x0f6c) || isSubjoinedBlockCp(c);

/** tsheg（音節分隔符，U+0F0B）：藏文以此分界音節，解析與生成都必須在此切段 */
const TSHEG = 0x0f0b;
const isVowelCp = (c: number): boolean =>
  (c >= 0x0f71 && c <= 0x0f7f) || (c >= 0x0f80 && c <= 0x0f87);

const TIB_FIRST = 0x0f00;
const TIB_LAST = 0x0fff;
const isTibetanChar = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= TIB_FIRST && c <= TIB_LAST;
};

export const isTibetanUnicode = (text: string): boolean => {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x0f40 && c <= 0x0f6c) || (c >= 0x0f71 && c <= 0x0f87)) return true;
    if (isSubjoinedBlockCp(c)) return true;
    // 區段寬判定——符號/標點/數字（0F00-0F3F 開篇符 ༀ、 daß mark 等）
    // 單獨成詞時舊判定 false，面板 gate 整詞 skipped（引擎實可轉，真機實錘）。
    if ((c >= 0x0f00 && c <= 0x0f3f) || (c >= 0x0f6d && c <= 0x0fff)) return true;
  }
  return false;
};

/** Wylie 側偵測：含藏文輔音或典型 Wylie 結構特徵 */
/** 彎引號 → ASCII 撇號：手機輸入法/自動更正把 ' 寫成 ‘/’（實錘 mkha’/mtha’ 整詞透傳） */
const normalizeWylieApostrophe = (text: string): string => text.replace(/[\u2018\u2019]/g, "'");

export const looksLikeWylie = (raw: string): boolean => {
  const text = normalizeWylieApostrophe(raw);
  if (!text) return false;
  if (isTibetanUnicode(text)) return false; // 已是藏文
  // 含其它文種（漢/蒙/滿/彝）則不判 Wylie
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x1800 && c <= 0x18af) || (c >= 0xa000 && c <= 0xa4cf))
      return false;
  }
  return /\b([kghcdjtnpbmyrlshzSTND]|ng|ts|kh|ch|jh|ny|th|dh|ph|bh|tsh|dz|dzh|zh|sh|kS|kk|wa|ra|la|sa|ha|a|i|u|e|o)\b/i.test(
    text
  );
};

/** 在 s 的 i 位置取最長匹配的 Wylie 記號（輔音優先，元音其次） */
function matchToken(s: string, i: number): { tok: string; isVowel: boolean } | null {
  for (const k of WYLIE_KEYS) if (s.startsWith(k, i)) return { tok: k, isVowel: false };
  for (const k of WYLIE_VOWEL_KEYS) if (s.startsWith(k, i)) return { tok: k, isVowel: true };
  return null;
}

interface Parsed {
  prefix: string | null;
  super: string | null;
  root: string | null;
  /** 下加字（1~2 個）：與 native 方向 subN ≤ 2 對稱 */
  subs: string[];
  /** `+` 顯式下疊標註：明示指定的堆疊結構，字形一律 subjoined（不受
   *  subs[0] 主碼位規則影響——顯式標註優先於拼式規範化） */
  subForced: boolean;
  vowel: string | null;
  /** 第二元音（疊元音）：梵咒音節會同時帶兩個元音符號，如 hūṃ ཧཱུྂ = ha + AA + U + bindu、
   *  hrīḥ = ha + ra + II + visarga。舊版只存一個元音，導致 U 被靜默丟棄（真實佛經丟字）。 */
  vowel2: string | null;
  anus: boolean;
  visar: boolean;
  /** 隨鼻符 / 止聲是否出現在後加字之後（如 'gaM）；是則須寫在最末 */
  anusAfterSuffix: boolean;
  suffixes: string[];
  /** T-3：fixed-form RA（EWTS 鍵 R → U+0F6A）連寫數（0–2） */
  fixedR: number;
  vowelInit: boolean;
  /**
   * 最後一個後加字自身所帶的元音（寫在全部後加字之後）。
   * 藏文常見兩種情形，舊版只用一個 boolean「元音在後加字之後」表達，無法區分：
   *   · 梵文堆疊音寫 padme（པདྨེ = p + 下加 d + 下加 m + 詞尾 e）→ Wylie「padme」
   *   · 第二後加字 -'i / -'u / -'o / -'e（ཀིའུ = ki + 'u、དགའོ = dga + 'o）
   * 舊版把前者誤當後加字、把後者的元音誤當「疊元音」，導致 200+ 條真實藏文詞
   * （botok 31,060 詞表）往返不一致。
   */
  /** 元音位於下加字之前（梵咒堆疊 shAkya / bilba 型）：Unicode 須先寫元音再寫下加字 */
  vowelBeforeSubs: boolean;
  vowelSuf: string | null;
  /**
   * 後加字之後的 a-chen（語氣詞 'am / 'o / 'e / 'u 的 a-chung 自帶 a）。
   * Wylie ba'am = ba（基+固有 a）+ '（a-chung 後加）+ a（a-chen）+ m——'am 的
   * a 是 a-chung 攜帶的 a-chen，須在後加字之後輸出 U+0F68，否則 ba'am 無法
   * 還原（59,834 條詞典語料高頻結構）。
   */
  chenAfterSuffix: boolean;
  /** r47：EWTS halanta「?」/ SYLLABLE OM「oM」/ TSA -PHRU「^」旗標 */
  halanta?: boolean;
  om?: boolean;
  tsaphru?: boolean;
}

/** 解析單個 Wylie 音節爲結構（最長匹配 + 前加/上加/下加/元音先行消歧） */
function parseWylieSyllable(syl: string): Parsed | null {
  if (!syl) return null;
  let i = 0;
  const m0 = matchToken(syl, 0);
  if (!m0) return null;

  // 前加字：必須後接「上加+基字」或「基字（真輔音，非 a-chen）」
  // 關鍵：若緊跟的是下加字（y/r/l/w），則 m0 自己就是基字而非前加字
  // （Wylie 下加字寫在基字之後：bla = b + 下加 l，不是「前加 b + 基 la」）
  let prefix: string | null = null;
  const isFollowingSub = (() => {
    if (!PREFIX.has(m0.tok) || syl.length <= m0.tok.length) return false;
    const rest = syl.slice(m0.tok.length);
    const m1 = matchToken(rest, 0);
    if (!m1 || m1.isVowel || !SUB.has(m1.tok)) return false;
    // m1 之後若還有基字，m1 更可能是上加字（r/l/s 亦屬上加字集合），m0 仍作前加字
    // 例：brgyud = 前加 b + 上加 r + 基 g；bla = 基 b + 下加 l（l 後無基字）
    const m2 = matchToken(rest, m1.tok.length);
    const hasRootAfter = !!m2 && !m2.isVowel && m2.tok !== "a";
    return !hasRootAfter;
  })();
  if (PREFIX.has(m0.tok) && syl.length > m0.tok.length && !isFollowingSub) {
    const rest = syl.slice(m0.tok.length);
    const m1 = matchToken(rest, 0);
    const nextRoot = m1 && !m1.isVowel && m1.tok !== "a";
    const nextSuperRoot =
      m1 && SUPER.has(m1.tok) && (() => {
        const m2 = matchToken(rest, m1.tok.length);
        return !!m2 && !m2.isVowel && m2.tok !== "a";
      })();

    // 梵文音寫排除：m0 後跟送氣鍵（dh/bh/gh/jh/Dh/dzh）時不作前加字——
    // 「ddha / mbha / mrdha」型梵咒堆疊中第一輔音實爲基字、送氣鍵實爲下加成分
    // （ddha＝基 d＋下加 d＋下加 ha＝0F51 0FA1 0FB7）。規範藏文無「前加＋送氣基」
    // 搭配（botok 詞表實證），放行會把 ddha 誤讀成 prefix-d＋root-dh，
    // 回轉產生 0F51+0F51+0FB7 的錯誤堆疊字形，與真實佛經語料往返不等。
    const mAsp = (() => {
      if (!nextRoot) return false;
      const rest2 = syl.slice(m0.tok.length);
      const t1 = matchToken(rest2, 0);
      return !!t1 && ASPIRATED_BASE[t1.tok] !== undefined;
    })();
    if ((nextRoot || nextSuperRoot) && !mAsp) {
      prefix = m0.tok;
      i = m0.tok.length;
    }
  }

  // 上加字：後須接真輔音基字
  let sup: string | null = null;
  const ms = matchToken(syl, i);
  if (ms && SUPER.has(ms.tok) && syl.length > i + ms.tok.length) {
    const mroot = matchToken(syl, i + ms.tok.length);
    if (mroot && !mroot.isVowel && mroot.tok !== "a") {
      sup = ms.tok;
      i += ms.tok.length;
    }
  }

  // 基字 或 元音先行（a-chen 作基）
  let root: string | null = null;
  let vowelInit = false;
  const mr = matchToken(syl, i);
  if (mr && mr.isVowel) {
    vowelInit = true; // a-chen 作基，元音符號隨後（不消耗）
  } else if (mr && mr.tok === "a") {
    root = "a";
    i += mr.tok.length;
  } else if (mr && !mr.isVowel) {
    root = mr.tok;
    i += mr.tok.length;
  } else {
    return null;
  }

  // 固有 a 消歧（梵咒堆疊 padme / karko / padma 型）：
  // 當基字帶 ≥2 個下加字、且元音落在最末時，Wylie 會把基字的固有 a 寫在基字之後、
  // 下加字之前（པདྨེ → padme、ཀརྐོ → karko）。此處須先跳過該 a 再取下加字，
  // 否則 a 之後的輔音被誤當後加字，整段解析失敗（romanToNative 原樣吐回拉丁串）。
  // 判據：a 之後恰好還有 ≥2 個輔音記號，且整段以元音符號收尾——
  // G-T2 對稱擴充：無元音收尾（純堆疊 padma/karma/kalpa/karka）也放行——
  // 出向 G-T2 對 firstStackIsBase 堆疊寫 padma 型拼式，入向須能吃回（舊判據
  // 只認元音收尾，padma 解析失敗整段透傳；pdma 錯誤拼式反而能解析）。
  // 單下加 bla/sga 型（a 屬堆疊整體、寫在末尾）不受影響——n>=2 條件排除了
  // 「a 只有一個後隨輔音」的真下加音節。
  const ma0 = matchToken(syl, i);
  if (ma0 && ma0.tok === "a") {
    let j = i + 1;
    let n = 0;
    const rest: string[] = [];
    for (;;) {
      // `+` 顯式下疊標註（p+ra 體例）穿透：不是輔音也不是元音，跳過不中斷統計
      if (syl[j] === "+") { j += 1; continue; }
      const t = matchToken(syl, j);
      if (!t || t.isVowel || t.tok === "a") break;
      rest.push(t.tok);
      n++;
      j += t.tok.length;
      if (n >= 2) break;
    }
    const tail = matchToken(syl, j);
    const tailIsVowelEnd = tail && tail.isVowel && j + tail.tok.length === syl.length;
    // G-T2 對稱：a-chung 屬格收尾（padma'i/karma'i 型）也放行——a 後為
    // 「' + 元音」且到串尾，即 a-chung 屬格結構（-'i/-'u/-'o/-'e）。
    let tailIsAchungVowelEnd = false;
    if (tail && tail.tok === "'") {
      const v = matchToken(syl, j + 1);
      tailIsAchungVowelEnd = !!v && v.isVowel && j + 1 + v.tok.length === syl.length;
    }
    // 拼式同構消歧（j 到串尾＝無元音收尾，padma / skabs 型）：a 之後的 2 個
    // 輔音既可讀作「下加堆疊」（པདྨ padma、ཀརྨ karma——梵源詞規範拼式）
    // 也可讀作「後加字 + 尾固有 a」（སྐབས skabs、སངས sangs——藏文詞規範拼式）。
    // 區分判據＝藏文規範音節結構：第二後加字只有 s——「b s / g s / m s / d s」
    // 是唯一合法雙後加收尾（skabs/sangs/rnams/thams 全屬此類），其餘組合
    // （d m / r m / l p——第二個不是 s）雙後加不合法，只能是下加堆疊。
    const achungTail = tailIsVowelEnd || tailIsAchungVowelEnd;
    const secondIsS = rest.length === 2 && rest[1] === "s";
    // root 可作前加字（g/d/b/m/'）且 rest[0] 可作根輔音：a 留作音節核、
    // rest 走「前加重構 + 根 + 後加」讀法——basd＝བསད（prefix-b + sa + d，
    // 語料三主碼位 0F56 0F66 0F51）、gand＝ga+na+da 連寫（0F42 0F53 0F51）。
    // padma（p 非前加字）不受影響，仍跳 a 進堆疊。
    const rootIsPrefixable = PREFIX.has(root ?? "");
    const rest0IsRootable = rest.length > 0 &&
      (WYLIE_TO_CP[rest[0]] !== undefined && !PREFIX.has(rest[0]));
    if (n >= 2 && (achungTail || (!secondIsS && j === syl.length)) &&
        !(rootIsPrefixable && rest0IsRootable && !achungTail)) i += 1;
  }
  // 下加字：1~2 個。
  // 舊版只取 1 個，與 native 方向（subN ≤ 2）不對稱，導致真實佛經 / 梵咒堆疊的
  // Wylie 無法還原成藏文——romanToNative 直接原樣吐回拉丁串（丟轉換）：
  //   ཀརྐ་ཊ krka Ta、ཀརྨ krma、ཀལྤ klpa、ཁྱིམ་ཕྱྭ phywa、ཀསྨིར ksmir
  // 這些都是 botok 31,060 條真實藏文詞表中的詞。
  const subs: string[] = [];
  let subForced = false; // `+` 顯式標註曾出現（字形全 subjoined）
  let forceSub = false; // EWTS `+` 顯式下疊標註：p+ra 的 r 強制為下加字（並列連寫消歧）
// `+` 顯式標註時下加上限放寬至 3（與 native 方向 krmsu 型 3 下加堆疊語料對稱；
// 無 `+` 時維持 2——規範藏文與 botok 詞表語料上限）。
const subMax = syl.includes("+") ? 5 : 2;
while (subs.length < subMax) {
    // `+` 顯式下疊標註：下一輔音強制進 subs（EWTS 體例，p+ra = པྲ 堆疊）。
    // 用於梵咒連寫的「並列 vs 堆疊」消歧：用戶/歧義面板以 `+` 自由指定堆疊結構。
    if (syl[i] === "+") {
      forceSub = true;
      subForced = true;
      i += 1;
      continue;
    }
    // 基字元音（固有 a 或長音 A 等）後隨 `+`（pa+rmi / pA+rmi 型：元音歸基、
    // 下加強制）→ 該元音屬基字，跳過讓 `+` 標註的下加字可達
    // （無 `+` 時元音之後的輔音維持舊消歧邏輯）。
    const mPre = matchToken(syl, i);
    if (mPre && mPre.isVowel && syl[i + 1] === "+") { i += mPre.tok.length; continue; }
    const msu = matchToken(syl, i);
    if (!msu || msu.isVowel || msu.tok === "a") break;
    // a-chung（'）不作下加字——ba'am 的 ' 是 a-chung 後加字，舊版被誤吃成
    // 下加字，整段解析失敗原樣吐回。r/l/s 等身兼 SUFFIX 與真下加，不能一刀切。
    if (msu.tok === "'" && !forceSub) break;
    subs.push(msu.tok);
    i += msu.tok.length;
    forceSub = false;
  }

  // 跳過詞尾固有 a（不寫出 a-chen）
  const ma = matchToken(syl, i);
  if (ma && ma.tok === "a") i += ma.tok.length;
  // B1：單一長元音 I/U 的折疊在此不處理——vowel 槽宣告在下方。
  // 折疊改由下方「後加字與元音」迴圈後的 vowel2 折疊段完成（kAI = k + A + I → k + I），
  // 避免「0F71+0F71+0F72」雙 AA 疊元音丟碼（見該段註釋）。

  // 後加字與元音：
  //  · 元音在後加字之前 → 基字（含下加字）的元音，寫在後加字之前（bcom、khru）
  //  · 元音在後加字之後 → 最末後加字自身的元音（vowelSuf），寫在全部後加字之後
  //    —— 舊版把它當「疊元音」處理，導致 ཁེའུ khe'u 被轉成 ཁེུའ（元音順序錯亂）。
  let vowel: string | null = null;
  let vowel2: string | null = null;
  let vowelSuf: string | null = null;
  let anus = false;
  let anusAfterSuffix = false;
  let visar = false;
  const suffixes: string[] = [];
  // 後加字之後的 a-chen（語氣詞 'am 的 a-chung 自帶 a）
  let chenAfterSuffix = false;
  // EWTS 專用 token（halanta「?」/ oM「oM」/ tsa-phru「^」）——可出現在
  // 音節尾（k?、ka^、oM），解析側記旗標、buildTibetan 出向寫碼位。
  let halanta = false;
  let om = false;
  let tsaphru = false;
  // A1：oM 僅在音節首（解析至此尚無任何基字成分）匹配——「oM」是 EWTS 的
  // SYLLABLE OM 獨立 token，不是音節內的組合成分。若放行任意位置匹配，
  // 「oMoM」會被併成單音節、第二個 oM 被吞（buildTibetan 只輸出一個 0F00），
  // 往返變「aoM」≠ 輸入。限定 i===0 後，第二個 oM 落入殘留 → parseWylieSyllable
  // 返 null → wylieToTibetan 的逐段解析退回透傳，不丟轉換。
  // （oMaM 不受影響：解析失敗原樣透傳本就是既有行為。）
  const omAtStart = i === 0 && syl.startsWith("oM", i);
  for (;;) {
    // 特殊 token 先於 matchToken（「?」「^」非 Wylie 字母鍵，matchToken 返 null）
    if (syl[i] === "?") { halanta = true; i += 1; continue; }
    if (omAtStart && syl.startsWith("oM", i)) { om = true; i += 2; continue; }
    if (syl[i] === "^") { tsaphru = true; i += 1; continue; }
    const mv = matchToken(syl, i);
    if (!mv) break;
    if (mv.isVowel) {
      if (mv.tok === "M") {
        anus = true;
        anusAfterSuffix = suffixes.length > 0;
      } else if (mv.tok === "H") {
        visar = true;
      } else if (suffixes.length > 0 && vowelSuf === null) {
        vowelSuf = mv.tok;
      } else if (vowel === null) {
        vowel = mv.tok;
      } else if (vowel2 === null) {
        // 疊元音：梵咒音節（hūṃ 的 AA+U）第二個元音符號，舊版會靜默丟棄
        vowel2 = mv.tok;
      } else break;
      i += mv.tok.length;
      continue;
    }
    // 語氣詞 'am 的 a——ba'am = ba + ' + a + m。此 a 是 Wylie 對「a-chung
    // 語氣詞」的拼式寫法（THL 規範 'am / 'o），無對應碼位；不吃掉它解析失敗
    // （'a 不是 SUFFIX token，循環 break 殘留）。'o / 'e / 'u 走 vowelSuf 不受影響。
    if (mv.tok === "a" && suffixes.length > 0 && suffixes[suffixes.length - 1] === "'") {
      chenAfterSuffix = true;
      i += mv.tok.length;
      continue;
    }
    if (SUFFIX.has(mv.tok)) {
      suffixes.push(mv.tok);
      i += mv.tok.length;
      continue;
    }
    break;
  }
  // B1：長元音 I/U 的分解序折疊。kAI = k + 固有 a(A) + I（解析面把
  // 分解序 0F71+0F72 寫成 Wylie「AI」）——此時 vowel=A、vowel2=I 兩槽都被佔用，
  // 出向會寫「0F71+0F71+0F72」雙 AA 疊元音（多出 0F71、字形錯亂、往返失真）。
  // 折疊條件：vowel 恰為固有 a（A）、vowel2 恰為 I/U、再無其他殘留語義——
  // 即「AI/AU」整體就是單一長元音的分解拼寫，折回 vowel=I/U。真疊元音梵咒
  // （AA+U，hūṃ 型）第二元音不是 I/U，不受影響。
  if (vowel === "A" && (vowel2 === "I" || vowel2 === "U") && !vowelSuf && !anus && !visar) {
    vowel = vowel2;
    vowel2 = null;
  }

  let vowelBeforeSubs = false;
  {
    const chen = matchToken(syl, i);
    if (chen && chen.tok === "a" && suffixes.length > 0 &&
        suffixes[suffixes.length - 1] === "'" && i + 1 === syl.length) {
      chenAfterSuffix = true;
      i += 1;
    }
  }
  // T-3：fixed-form RA（EWTS 鍵 R→U+0F6A）——基字後獨立輔音記號
  let fixedR = 0;
  if (syl.startsWith("R", i)) { i += 1; fixedR = 1; if (syl.startsWith("R", i)) { i += 1; fixedR = 2; } }
  if (i < syl.length) {
    // 梵咒堆疊：基字元音之後仍可有 1~2 個下加字，末尾再補固有 a
    // （ཤཱཀྱ shAkya、བིལྦ bilba、བེརྒ berga）。判據：殘留恰爲
    // 「0~2 個輔音記號 + 詞尾 a」。缺此規則時 Śākyamuni ཤཱཀྱ་མུ་ནེ
    // 這類最高頻佛號的 Wylie 無法還原成藏文（往返丟字）。
    if (vowel !== null && vowel2 === null && !anus && !visar && subs.length === 0) {
      const extra: string[] = [];
      let j = i;
      while (extra.length < 2) {
        const t = matchToken(syl, j);
        if (!t || t.isVowel || t.tok === "a") break;
        extra.push(t.tok);
        j += t.tok.length;
      }
      const tailA = matchToken(syl, j);
      // 詞尾元音：固有 a 或長音 A（ཝཱཀྐ wAkkA 型——A 在堆疊段之後的長音，
      // 舊版只認小寫 a，大寫 A 整段解析失敗透傳）
      if (tailA && (tailA.tok === "a" || tailA.tok === "A") && j + 1 === syl.length &&
          suffixes.length + extra.length >= 1 && suffixes.length + extra.length <= 2) {
        // 已收進後加字者一併改判爲下加字（berga：r 被誤收爲後加字）
        subs.push(...suffixes, ...extra);
        suffixes.length = 0;
        vowelBeforeSubs = true;
        i = j + 1;
      }
    }
    // G-T2 對稱：無顯式元音的純堆疊（padma/karma/kalpa/karka 型——root='pa'
    // 已含固有 a，殘留「後加位輔音 + 尾 a」）：已收進後加字者與殘留輔音一併
    // 改判下加字（d+m 全下加＝པདྨ 堆疊）。舊判據要求 vowel!==null，規範拼式
    // padma 解析失敗整段透傳；錯誤拼式 pdma 反而能解析（往返不一致實錘）。
    // 尾 a 是出向 G-T2 規則寫出的基字固有 a 連寫尾巴，解析吞掉、不寫碼位
    // （與 chenAfterSuffix 同理）。
    else if (vowel === null && vowel2 === null && !anus && !visar && subs.length === 0) {
      const extra: string[] = [];
      let j = i;
      // root 後連寫固有 a（376 區消歧未跳、落到此處的 padma/karma 型）：
      // 跳過該 a 繼續收其後的堆疊輔音。skabs 型不走此處——其輔音已進
      // suffixes（subs.length===0 條件排除了雙後加讀法）。
      if (j < syl.length && syl[j] === "a") j += 1;
      while (extra.length < 2) {
        const t = matchToken(syl, j);
        // a-chung（'）不作下加字、不收進 extra——留給屬格收尾判定
        if (!t || t.isVowel || t.tok === "a" || t.tok === "'") break;
        extra.push(t.tok);
        j += t.tok.length;
      }
      // root='pa' 連寫讀法（padma/karma 整段形態）：殘留輔音已進 suffixes、
      // i 停在連寫固有 a 上——主迴圈 break 於 a。此時 tailA 為屬格 ' 或 null，
      // 收尾形態由 i 位置判定（見下方第三分支）。
      const tailA = j < syl.length ? matchToken(syl, j) : null;
      // 收尾形態：純堆疊尾 a（padma）、a-chung 屬格收尾（padma'u 型），
      // 或「尾 a + a-chung 屬格」雙寫（padma'i——root a 連寫＋堆疊尾 a＋屬格 'i）。
      // 屬格尾「'+元音」不吞，留在解析流由主迴圈正常收（' 進 suffixes、元音進 vowel）。
      let tailOk = false;
      let tailEnd = -1;
      let keepAchung = false;
      let achungVowel: string | null = null;
      if (extra.length === 0 && j > i && syl[i] === "a") {
        // root='pa' 連寫固有 a 讀法：i 停在 a（d m 等已進 suffixes）、其後為
        // 堆疊尾 a（padma，j===len 時尾型即此）、或「尾 a + ' + 元音」（padma'i）。
        if (j >= syl.length) {
          tailOk = true; tailEnd = i + 1;
        } else {
          const ta = matchToken(syl, j);
          if (ta && ta.tok === "a") {
            if (j + 1 === syl.length) { tailOk = true; tailEnd = j + 1; }
            else {
              const ap = matchToken(syl, j + 1);
              if (ap && ap.tok === "'") {
                const v = matchToken(syl, j + 2);
                if (v && v.isVowel && j + 2 + v.tok.length === syl.length) {
                  tailOk = true; tailEnd = j + 2 + v.tok.length; keepAchung = true; achungVowel = v.tok;
                }
              }
            }
          }
          else if (ta && ta.tok === "'") {
            const v = matchToken(syl, j + 1);
            if (v && v.isVowel && j + 1 + v.tok.length === syl.length) {
              tailOk = true; tailEnd = j + 1 + v.tok.length; keepAchung = true; achungVowel = v.tok;
            }
          }
        }
        if (tailOk) {
          subs.push(...suffixes);
          suffixes.length = 0;
          if (keepAchung && achungVowel) {
            suffixes.push("'");
            vowelSuf = achungVowel;
          }
          i = tailEnd;
          if (i < syl.length) return null;
        }
      } else if (tailA && tailA.tok === "a") {
        if (j + 1 === syl.length) { tailOk = true; tailEnd = j + 1; }
        else {
          const ap = matchToken(syl, j + 1);
          if (ap && ap.tok === "'") {
            const v = matchToken(syl, j + 2);
            if (v && v.isVowel && j + 2 + v.tok.length === syl.length) {
              tailOk = true; tailEnd = j + 2 + v.tok.length; keepAchung = true; achungVowel = v.tok;
            }
          }
        }
      }
      else if (tailA && tailA.tok === "'") {
        const v = matchToken(syl, j + 1);
        if (v && v.isVowel && j + 1 + v.tok.length === syl.length) {
          tailOk = true; tailEnd = j + 1 + v.tok.length; keepAchung = true; achungVowel = v.tok;
        }
      }
      // 判據收窄：僅「root token 自帶連寫固有 a（root='pa' 型）」的純堆疊才改判
      // （padma/karma——root a 已寫，殘留輔音只能是下加）。root 不含 a 的音節
      // （sngags/zhags/rnams——尾 a 是音節核固有 a 規範寫法）不觸發，g/s/m 維持後加。
      // 收窄二：suffixes+extra **全部**都是合法後加字時不改判——gand（གནད
      // ga+後加 n+後加 d）、hammA（ha+後加 m+ma）、sngags 型的後加讀法是
      // 語料字形，堆疊改判會把後加字寫成下加（字形漂移）。僅當殘留輔音中
      // 存在**非後加字**（padma 的 d——後加讀法非法，只能是下加）才改判。
      const nonSuffixInResidue = [...suffixes, ...extra].some((t) => !SUFFIX.has(t));
      if (tailOk && nonSuffixInResidue &&
          suffixes.length + extra.length >= 2 && suffixes.length + extra.length <= 2) {
        subs.push(...suffixes, ...extra);
        suffixes.length = 0;
        if (keepAchung && achungVowel) {
          // 屬格尾「'+元音」就地收結構：a-chung 進 suffixes、元音存 vowelSuf
          // （最末後加字自身的元音，寫在全部後加字之後＝padma'i 的 i）。
          suffixes.push("'");
          vowelSuf = achungVowel;
        }
        i = tailEnd;
      }
    }
    if (i < syl.length) return null; // 殘留未解析 → 非合法 Wylie 音節
  }
  return {
    prefix, super: sup, root, subs, subForced, vowel, vowel2,
    anus, visar, anusAfterSuffix, suffixes, vowelInit, vowelSuf, vowelBeforeSubs,
    chenAfterSuffix, halanta, om, tsaphru, fixedR,
  };
}

/**
 * 濁送氣音（梵文 bh / dh / gh / jh / dzh / Dh）的 Wylie 寫法。
 *
 * 藏文 Unicode 另收「全形單字母」གྷ ཈ ཌྷ དྷ བྷ ཛྷ（U+0F43/0F48/0F4D/0F52/0F57/0F5C），
 * 但真實語料（botok 31,060 條藏文詞表）中這些全形字母出現 **0 次**——
 * 藏文表記濁送氣音一律用「基字 + 下加 ha（U+0FB7）」堆疊（བྷ = U+0F56 U+0FB7）。
 * 舊版把 Wylie `bh` 直接映到全形單字母 U+0F57，造成兩個真實缺陷：
 *   · 真實佛經詞 བྷ → Wylie bha → བྷ（碼位被換掉，往返不一致）；
 *   · 使用者輸入 Wylie「bha」得到的是罕見全形字母，而非佛經通用的堆疊寫法。
 * 故本版改爲輸出「基字 + 下加 ha」堆疊。
 */
const ASPIRATED_BASE: Record<string, string> = {
  gh: "g", jh: "j", Dh: "D", dh: "d", bh: "b", dzh: "dz",
};
const SUBJOINED_HA = 0x0fb7;

/**
 * 藏文區的 Unicode **保留（未分配）碼位**——任何字體都不可能有字形。
 *
 * 本表的存在理由：WYLIE_TO_CP 把 Wylie `jh` 映到 U+0F48，但藏文並未編碼全形
 * JHA（JA＝U+0F47，U+0F48 保留，接下來是 NYA＝U+0F49）。藏語沒有 jha 音位，
 * jh 一律寫作「ཇ + 下加 ha」（引擎經 ASPIRATED_BASE 也是這麼輸出），所以這個
 * 碼位在真實文本裡永不出現；它一旦被放進檢字表就只能是豆腐塊。
 *
 * 引擎不受影響（走 ASPIRATED_BASE 取基字），此表只用於檢字表的列舉過濾。
 */
const TIBETAN_RESERVED_CP: ReadonlySet<number> = new Set([0x0f48]);

function buildTibetan(p: Parsed): string {
  let out = "";
  /**
   * 梵文堆疊音寫：當「無基字元音、元音落在最末後加字之後、後加字不含 འ」時，
   * 那些後加字其實是下加字，必須以 subjoined 碼位輸出，否則堆疊丟失。
   *   པདྨེ padme → 舊版 པདམེ（ད མ 並列，堆疊丟失）→ 本版 པྡྨེ ✓
   * 排除後加字 འ：-'i / -'u / -'o / -'e 是藏文「第二後加字」結構（ནའི、དགའོ），
   * འ 必須維持主字符，寫成 subjoined ྰ 會變成錯誤的堆疊字形。
   */
  const stackSuffix =
    p.vowelSuf !== null && p.vowel === null && p.vowel2 === null &&
    p.suffixes.length > 0 && !p.suffixes.includes("'");
  if (p.prefix) out += cp(WYLIE_TO_CP[p.prefix]);
  if (p.super) out += cp(WYLIE_TO_CP[p.super]);
  // 元音先行：a-chen（U+0F68）作基（有元音符號時爲靜默基，仍須寫出）
  if (p.vowelInit) out += cp(0x0f68);
  else if (p.root) {
    const asp = ASPIRATED_BASE[p.root];
    const rootBase = WYLIE_TO_CP[asp ?? p.root];
    /**
     * 上加字（r/l/s）之後的基字必須用 subjoined 碼位（主碼位 + 0x50）：
     *   སྟ = ས(U+0F66 上加) + ྟ(U+0F9F 下加形)；སྒ = ས + ྒ(U+0F92)。
     * 若基字誤寫成主字符（ས + ག），有兩個後果：
     *   1. 字體不會渲染成上加堆疊（排版錯誤）；
     *   2. 回讀時基字被當成「後加字」，Wylie 失真：
     *      sga → སག → "sag"、sda → སད → "sad"、sma → སམ → "sam"、
     *      rga/rnga/rda/rna/rba/rma、lga/lda/lba 等同理（基字落在後加字集合內者）。
     * 實測真實詞典語料 31,060 條中，此錯誤影響上萬條。
     */
    out += cp(p.super ? rootBase + 0x50 : rootBase);
    if (asp) out += cp(SUBJOINED_HA);
  } else return ""; // 無基字，解析異常
  // 下加字必須用 subjoined 碼位，否則字體不會堆疊（排版錯誤）。
  // y/r/l/w 用專用 subjoined 碼位（U+0FB1/0xFB2/0x0FB3/0x0FAD），
  // 其餘輔音 = 主碼位 + 0x50（U+0F90–U+0FAF 整個 subjoined 區）。
  // 元音位置：多數音節元音在下加字後；梵咒堆疊（shAkya）則元音緊跟基字、
  // 在下加字之前。vowelSuf（最末後加字自身的元音，如 padme 的 e、khe'u 的 u）
  // 一律寫在全部後加字之後。
  const writeMainVowels = () => {
    if (p.vowel) out += vowelTokenToCps(p.vowel);
    // 疊元音（梵咒 hūṃ = AA + U）：緊接第一元音符號之後寫出
    if (p.vowel2) out += vowelTokenToCps(p.vowel2);
  };
  if (p.vowelBeforeSubs) writeMainVowels();
  for (const sub of p.subs) {
    // 送氣鍵（dh/bh/gh/jh/Dh/dzh）作下加（梵咒 ddha/mbha 堆疊）：展開爲
    // 「sub(基) + sub(ha 0FB7)」兩碼位（ddha＝0FA1+0FB7），與真實佛經語料
    // 逐碼位一致；WYLIE_TO_CP 的送氣全形（0F52→0FA2）字形不同、不用。
    const aspSub = ASPIRATED_BASE[sub];
    if (aspSub !== undefined) {
      out += cp(WYLIE_TO_CP[aspSub] + 0x50);
      out += cp(SUBJOINED_HA);
      continue;
    }
    const base = WYLIE_TO_CP[sub];
    // 堆疊中段（後面還有下加）的 r/l/s 寫**主碼位**（ཀརྨ＝0F40 0F62 0FA8、
    // སརྦ＝0F66 0F62 0FA6、རཏྣ＝0F62 0F9F 0FA3 規範字形——上加字母組
    // r/l/s 位於堆疊中間時規範用主碼位形）；subjoined 碼位（0FB2/0FB3）
    // 用於堆疊最末位（badzra 末位 r＝0FB2）。中段用 subjoined 會使 N2R
    // 走非規範讀法（krma/srba 型拼式），破壞兩 a 出向恆等。其餘輔音
    // （hammA 語料 m＝sub 形）維持 subjoined——語料字形原樣恆等。
    const hasLaterSub = p.subs.indexOf(sub, p.subs.indexOf(sub) + 1) >= 0;
    const isLastSub = p.subs[p.subs.length - 1] === sub && p.subs.filter(x => x === sub).length === 1;
    // 中段（非最末位）字形依語料主流定讞（tibetan-sanskrit-pairs 49,834 條
    // 同音節三層堆疊統計）：la/ra/ba/da/kha/pha/a/sa 中段用**主碼位**（majority），
    // dza/ka/pa/ma/dha/wa 中段用 subjoined（sub majority）——與真實佛經
    // 語料字形逐碼位一致；單一下加（最末位）一律 subjoined。
    // 中段（非最末位）字形依語料主流定讞：梵咒連寫語料實證——
    // mangga＝0F58 0F44 0F92（nga 中段主碼位）、badzra＝0F56 0F5B 0FB2
    // （dza 中段主碼位）、ཀརྨ＝0F40 0F62 0FA8（ra 中段主碼位）、
    // སརྦ＝0F66 0F62 0FA6；規範藏文 རྒྱལ 型 ya 中段用 subjoined。
    // 語料字形實證定讞：三層堆疊 subs[0]（第一下加）用主碼位、其餘下加
    // 用 subjoined——badzra 0F5B（dz main）+0FB2、indra 0F53（n main）+
    // 0FA1+0FB2、bazla 0F5F（za main）+0FB3、manta 0F53+0F9F、maNDa
    // 0F4E+0F9C、padma 0F51+0FA8、karma/sarba/kalpa/karka 同構。
    // 例外：ratna 語料 ta sub（0F9F）——ta 不適用，維持例外清單。
    const isFirstSub = p.subs[0] === sub && !isLastSub;
    const midSuper = isFirstSub && !SUB0_SUBSET.has(sub) && !p.subForced;
    const subCp =
      midSuper ? base :
      sub === "y" ? 0x0fb1 :
      sub === "r" ? 0x0fb2 :
      sub === "l" ? 0x0fb3 :
      sub === "w" ? 0x0fad :
      base + 0x50;
    out += cp(subCp);
  }
  if (!p.vowelBeforeSubs) writeMainVowels();
  // T-3：fixed-form RA（0F6A）——隨堆疊之後寫出
  for (let k = 0; k < (p.fixedR ?? 0); k++) out += cp(0x0f6a);
  if (p.anus && !p.anusAfterSuffix) out += cp(0x0f7e);
  if (p.visar) out += cp(0x0f7f);
  for (const sf of p.suffixes) {
    const base = WYLIE_TO_CP[sf];
    out += cp(stackSuffix ? base + 0x50 : base);
  }
  if (p.vowelSuf) out += vowelTokenToCps(p.vowelSuf);
  // chenAfterSuffix（語氣詞 'am 的 a）**不寫任何碼位**——Wylie 的 'am 中
  // a 只是 a-chung 語氣詞的拼式寫法（THL 規範），藏文碼位就是 འ（U+0F60）
  // 本身，後接後加字；寫 0F68 會變出錯誤的 a-chen。此標記僅用於讓
  // parseWylieSyllable 能吃掉這個 a、令解析成功。
  if (p.anus && p.anusAfterSuffix) out += cp(0x0f7e);
  // halanta / oM / tsa-phru 出向
  if (p.halanta) out += cp(0x0f84);
  if (p.om) out += cp(0x0f00);
  if (p.tsaphru) out += cp(0x0f39);
  return out;
}

/**
 * 音節分隔符正規化：Wylie 的空白 ↔ 藏文 tsheg（U+0F0B）。
 * 這是往返一致的關鍵：藏文以 tsheg 分界音節，Wylie 以空白分界，二者一一對應。
 * G-T1 規則：**恰 1 個空格**→tsheg；≥2 空格或含換行的空白段→
 * 原樣透傳（換行是段落結構，非音節分隔；多空格是排版間距，非音節邊界）。
 */
const TIB_SEP_RE = /([་།༎\s]+)/;
const isSeparatorRun = (s: string): boolean => /^[་།༎\s]+$/.test(s);
const normalizeSeparator = (sep: string): string => {
  // G-T1 規則：純空白段——恰 1 個空格→tsheg；≥2 空格→原樣透傳
  // （多空格是排版間距，非音節邊界）；含換行→原樣透傳（換行是段落結構，
  // 行尾不插 tsheg）。
  if (/^[ \t]+$/.test(sep)) return sep === " " ? cp(TSHEG) : sep;
  if (/^\s+$/.test(sep)) return sep;
  // 混排段（顯式 tsheg/shad 與空白並存）：恰 1 個空格去空白（空格對顯式
  // tsheg 是冗餘，"k-i ་la" 往返基線）；**≥2 連續空格原樣透傳**（排版
  // 間距語義與純空白段一致，G-T1b）；shad 保留不吞。實現＝≥2 空格 run
  // 以不可見碼位佔位保護，去完單空格後還原。
  return sep.replace(/[ \t]+/g, (m) => (m.length >= 2 ? m : ""));
};

/**
 * 三層堆疊「中段」用主碼位的輔音集合（語料字形實證定讞）：
 * la/ra/ba/da/kha/pha/a/sa（tibetan-sanskrit-pairs 同音節三層堆疊統計
 * 主碼位為主流）＋nga/dza（梵咒連寫 mangga=0F44、badzra=0F5B 主碼位實證）。
 * 不收 dza 以外的 ka/pa/ma/dha/wa（ka 2082:400、pa 1180:142、ma 472:23
 * subjoined 為主流；hammA 語料 ma 中段＝subjoined 0FA8 實證）。
 */
const MID_MAIN_SUBS = new Set(["l", "r", "b", "d", "k", "kh", "ph", "a", "s", "sh", "g", "ng", "dz", "dh", "T", "D"]);
/** subs[0] 例外：語料第一下加仍用 subjoined 的輔音（ratna ta＝0F9F 實證） */
const SUB0_SUBSET = new Set(["t", "y", "w", "ny", "sh"]);

/** Wylie → 藏文 Unicode */
export function wylieToTibetan(input: string): string {
  // 彎引號正規化（手機輸入法常態）：’/'  在 Wylie 中皆為 'a-chung，入口統一為 ASCII 撇號
  input = normalizeWylieApostrophe(input);
  // NO_TSHEG（`<->`）：分段解析但段間**不插 tsheg**（梵咒無 tsheg 連寫的反向還原）
  if (input.includes(NO_TSHEG)) {
    return input.split(NO_TSHEG).map((seg) => wylieToTibetan(seg)).join("");
  }
  // <sp>（原生空格顯式 token，G-T1c）：前置切分——段間精確輸出 U+0020 真空格
  // （可黏連在字母間 ka<sp>ga，故不能走段內 token 回映射；與 NO_TSHEG 前置
  // 切分同模式）。各段遞歸解析，防止 <sp> 內字符被當分隔段/音節字符。
  if (input.includes(NATIVE_SPACE)) {
    return input
      .split(NATIVE_SPACE)
      .map((seg) => wylieToTibetan(seg))
      .join(" ");
  }
  const parts = input.split(TIB_SEP_RE);
  return parts
    .map((part) => {
      if (part === "") return part;
      if (isSeparatorRun(part)) return normalizeSeparator(part);
      const syl = part.trim();
      if (!syl) return part;
      // EWTS 專用 token 回映射（與 tibetanToWylie 出向對稱）
      if (syl === "?") return cp(0x0f84);
      // 「?」前綴剝離：出向對孤立元音段可能產生「?<v-*>…」連寫（halanta
      // 與孤立標註同段出在 sep-run 內），入向先剝離段首連續「?」還原為 0F84
      // 串，剩段重入 wylieToTibetan（剩段無 sep 干擾，與整段解析同語義）——
      // 否則整段送 parseWylieSyllable 失敗透傳，往返丟還原（fuzz 實錘）。
      if (syl.startsWith("?") && syl.length > 1) {
        const n = syl.length - syl.replace(/^\?+/, "").length;
        const rest = wylieToTibetan(syl.slice(n));
        return cp(0x0f84).repeat(n) + rest;
      }
      if (syl === "oM") return cp(0x0f00);
      if (syl === "^") return cp(0x0f39);
      // A1：oM 連寫切分——「oMoM / oM^」中的每個 oM 各自是 SYLLABLE OM 獨立
      // token（tibetanToWylie 出向逐碼位輸出 "oM"，連寫成 "oMoM"；入向若整段
      // 送音節解析會被吞併成一個音節、丟第二個 oM，往返變 "aoM" 實錘）。
      // 出向 token 前若有殘留（a-chen 音節 "aoM" 的 a），殘留部分另行解析，
      // oM 段照常寫 0F00——與 tibetanToWylie(0F68+0F00)="aoM" 對稱閉合。
      if (syl.startsWith("oM")) {
        // 殘尾僅允許空或 EWTS 特殊 token（? / ^）——其他殘留（oMaM 的 "aM"）
        // 維持舊路徑：整段送音節解析、失敗即原樣透傳，不擴大改動面。
        const m = /^((?:oM)+)([\s\S]*)$/.exec(syl);
        const tail = m ? m[2] : "";
        if (m && (tail === "" || /^[?^]+$/.test(tail))) {
          let tailOut = "";
          let tokOk = true;
          for (const tch of tail) {
            if (tch === "?") tailOut += cp(0x0f84);
            else if (tch === "^") tailOut += cp(0x0f39);
            else tokOk = false;
          }
          if (tokOk) return cp(0x0f00).repeat(m[1].length / 2) + tailOut;
        }
      }
      // 孤立元音標註 <v-*> 回映射（與出向對稱；precomposed 一律分解序）
      // <s-*>/<v-*> 孤立標註段（可混排）逐 token 掃描回映射
      if (syl.startsWith("<s-") || syl.startsWith("<v-")) {
        let vi = 0;
        let vout = "";
        let vok = true;
        while (vi < syl.length && vok) {
          const hit = Object.keys(ISOLATED_SUB_TOKEN_TO_CP)
            .concat(Object.keys(ISOLATED_VOWEL_TOKEN_TO_SEQ))
            .filter((t) => syl.startsWith(t, vi))
            .sort((a, b) => b.length - a.length)[0];
          if (hit === undefined) { vok = false; break; }
          const subCp = ISOLATED_SUB_TOKEN_TO_CP[hit];
          vout += subCp !== undefined ? cp(subCp) : ISOLATED_VOWEL_TOKEN_TO_SEQ[hit].map((c) => cp(c)).join("");
          vi += hit.length;
        }
        if (vok && vi === syl.length) return vout;
        return part; // 未匹配完整：原樣保留
      }
      const parsed = parseWylieSyllable(syl);
      if (!parsed || (!parsed.root && !parsed.vowelInit)) return part; // 無法解析：原樣保留
      return buildTibetan(parsed);
    })
    .join("");
}

/** 藏文 Unicode → Wylie（枚舉根位置，最早合法解析優先） */
export function tibetanToWylie(input: string, pref: TibAmbigPref = "auto"): string {
  // NFKC——輸入可能含藏文兼容碼位（U+0F73/0F75/0F81，某些字體/PDF 產生），
  // 分解為組合序（U+0F71+0F72 等）才命中轉寫表的組合序鍵；規範碼位不受影響。
  // deprecated 聲化元音單體（0F76-0F79/0F81）先按 NamesList 規範分解，
  // 再 NFKC——否則「0FB2+0F76」會被 NFKC 展成 0FB2+0FB2+0F80（雙 ra 失真）。
  input = input
    // 預組梵文反轉字（U+0F43/0F4D/0F52/0F57/0F5C）正規化為堆疊序（基字+0FB7）——
    // 引擎決策一貫輸出堆疊形式（回向 ASPIRATED_BASE 亦然），預組碼位經此正規化後
    // 出向 roman 不變（gha 等），往返閉合至同一 native 形式（字形等價）。
    .replace(/\u0F43/g, cp(0x0f42) + cp(0x0fb7))
    .replace(/\u0F4D/g, cp(0x0f4c) + cp(0x0fb7))
    .replace(/\u0F52/g, cp(0x0f51) + cp(0x0fb7))
    .replace(/\u0F57/g, cp(0x0f56) + cp(0x0fb7))
    .replace(/\u0F5C/g, cp(0x0f5b) + cp(0x0fb7))
    .replace(/\u0F76/g, cp(0x0fb2) + cp(0x0f80))
    .replace(/\u0F77/g, cp(0x0fb2) + cp(0x0f71) + cp(0x0f80))
    .replace(/\u0F78/g, cp(0x0fb3) + cp(0x0f80))
    .replace(/\u0F79/g, cp(0x0fb3) + cp(0x0f71) + cp(0x0f80))
    .replace(/\u0F81/g, cp(0x0f71) + cp(0x0f80))
    .normalize("NFKC");
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (!buf) return;
    const w = unicodeSyllableToWylie(buf, true, pref);
    // 閉合預檢：n2r 候選可能選出 r2n 解析不了的鍵序（實錘 f56 fb2 f80
    // f40 fb5 f7f → 'bra-ikSH'，r2n 透傳丟字）——候選自身 wylieToTibetan 閉合
    // 但多候選鍵序串接後 r2n 詞法（r-i 邊界）黏死。預檢：wylieToTibetan(w)
    // 碼位多重集與 buf 折疊一致才採納；否則 fallback splitNoTsheg（段間
    // NO_TSHEG 保證 r2n 邊界）。
    const backT = wylieToTibetan(w);
    if (backT === buf || syllableKey(backT) === syllableKey(buf)) {
      out.push(w);
      buf = "";
      return;
    }
    // splitNoTsheg 對「自洽候選含黏連 r-i 邊界」的串可能也切不出（回溯貪吃
    // 最短段被 subjoined 段界卡死）——fallback 逐碼位貪吃：每步取最短自洽前綴。
    const split0 = splitNoTsheg(buf, pref) ?? greedySplit(buf, pref);
    out.push(split0 ?? w);
    buf = "";
  };
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    // tsheg 是音節邊界：必須在此切段，否則相鄰音節會被誤併成一個音節而丟字
    if (c === TSHEG) {
      flush();
      out.push(" ");
      continue;
    }
    // 藏文原生真空格（U+0020）：出向輸出 <sp> 顯式 token——若輸出裸空格，
    // 入向會被 G-T1 映射回 tsheg（真空格被誤轉，G-T1c）
    if (c === 0x20) {
      flush();
      out.push(NATIVE_SPACE);
      continue;
    }
    // 只有輔音（含 a-chen / 下加字）與元音符號進入音節緩衝；
    // 標點、數字、符號一律切段後原樣保留，既不丟字也不會污染音節解析
    if (c === 0x0f84 || c === 0x0f00 || c === 0x0f39) {
      // EWTS 專用 token（THL/BDRC 確認）——必須先於 isVowelCp 判斷
      //（0F84 落在 0F80–0F87 元音區間，後判會被當元音丟字）
      flush();
      out.push(c === 0x0f84 ? "?" : c === 0x0f00 ? "oM" : "^");
    }
    else if (isConsonantCp(c) || isVowelCp(c) || c === 0x0f68) buf += ch;
    else {
      flush();
      out.push(ch);
    }
  }
  flush();
  return out.join("");
}

/** 音節指紋：歸一化後的「輔音 + 元音」碼位序列（順序敏感），用於自洽校驗比對 */
const syllableKey = (s: string): string =>
  Array.from(s)
    .map((c) => c.codePointAt(0) ?? 0)
    // 預組合梵文反轉字（0F69 KSA 等）展開爲堆疊序（同 tibetanToWylie 入口
    // 0F43 規範分解先例）——使「基+下加」碼位段與「預組合碼位」候選的音節指紋
    // 對齊（實錘：splitNoTsheg/greedySplit 對 f40 fb5 f7f 段判據失敗＝
    // wylieToTibetan('kSH') 返回預組 f69、鍵序缺 sub 標記與 buf 不等）。
    .flatMap((c) => (c === 0x0f69 ? [0x0f40, 0x0fb5] : [c]))
    // 鼻音 bindu（U+0F82）與 SNA LDAN（U+0F83）皆歸一爲 anusvara（U+0F7E）：
    // 出向表 CP_VOWEL_TO_WYLIE[0x0f83]="M"（r47 語義：SNA LDAN 佛經咒語中讀
    // visarga 但拼寫歸 anusvara），故 0F83 須與 0F82 同歸 0F7E，不能歸 0F7F。
    .map((c) => (c === 0x0f82 ? 0x0f7e : c === 0x0f83 ? 0x0f7e : c))
    .flatMap((c) => (c === 0x0f00 ? [0x0f68, 0x0f7c, 0x0f7e] : [c])) // r73：SYLLABLE OM（0F00＝a-chen+o+M 的 EWTS oM 正字形）展開，使「a-chen+o+bindu 音節」與 oM 自洽往返
    .filter((c) => isConsonantCp(c) || isVowelCp(c))
    .map((c) => baseCpOf(c).toString(16))
    .join(",");

/**
 * Wylie 側的「音節邊界但**不寫 tsheg**」標記。
 *
 * 藏文轉寫梵咒時常省略音節間的 tsheg（དུཿཁཾ duḥkham、མཱལཏི mālati、
 * ལོཀེཤྭརཿ lokeśvara），而 Wylie 以空白 ↔ tsheg 一一對應，無法表達
 * 「有邊界而無 tsheg」。故引入此標記：解析時分段處理、段間不插 tsheg，
 * 往返完全一致。選用尖括號標註形式（與擴展 Wylie 的 ⟨…⟩ 標點標註同風格），
 * 避免與 URL、路徑中的 `/` 或 Wylie 的 `-` 分詞符相撞。
 */
const NO_TSHEG = "<->";
/** 原生空格顯式 token：出向藏文真空格（U+0020，非 tsheg）→ "<sp>"，入向 "<sp>" → U+0020。
 * 藏文語義：單空格在 Wylie 端是音節分隔（入向映射 tsheg），故「輸出真空格」
 * 必須顯式標註才能往返——防止真空格被誤轉為 tsheg（G-T1c）。 */
const NATIVE_SPACE = "<sp>";

/**
 * 逐碼位貪吃切分：splitNoTsheg 的回溯在「最短自洽前綴的尾碼位是
 * subjoined」等情境會整段返回 null——此 fallback 每步取**最短自洽前綴**，
 * 全串無自洽前綴（i=0 即無解）才返回 null。段界與 splitNoTsheg 同款
 * （下加字不切頭、NO_TSHEG 串接）。
 */
function greedySplit(syl: string, pref: TibAmbigPref = "auto"): string | null {
  const cps = Array.from(syl);
  const n = cps.length;
  if (n < 2) return null;
  const parts: string[] = [];
  let i = 0;
  while (i < n) {
    if (isSubjoinedCp(cps[i].codePointAt(0) ?? 0)) return null; // 段首下加字＝無法歸段
    let found = -1;
    for (let j = i + 1; j <= n; j++) {
      const seg = cps.slice(i, j).join("");
      const w = unicodeSyllableToWylie(seg, false, pref);
      if (w === seg) continue;
      if (selfCheckKey(w, seg) !== syllableKey(seg)) continue; // r59 批次乙：memo
      // 段界前瞻：下一碼位若為 subjoined，此段未含其基字，繼續延長
      if (j < n && isSubjoinedCp(cps[j].codePointAt(0) ?? 0)) continue;
      found = j;
      break;
    }
    if (found < 0) return null;
    parts.push(unicodeSyllableToWylie(cps.slice(i, found).join(""), false, pref));
    i = found;
  }
  return parts.join(NO_TSHEG);
}

/**
 * 梵咒「無 tsheg 連寫」的音節切分（回溯 + 記憶化）。
 *
 * 一串省略 tsheg 的梵咒含多個基字，而藏文音節結構〔前加〕〔上加〕基字
 * 〔下加〕〔元音〕〔後加…〕只允許一個基字，故整段必然解析失敗——舊版會退而
 * 返回**未通過自洽校驗**的候選（དུཿཁཾ → dkhuHM → དཁུཾཿ），往返失真。
 *
 * 此處把碼位序列切成若干**各自能自洽往返**的段，段間以 NO_TSHEG 標記。
 * 由左至右取「最短可解析段」，符合梵咒逐字母對音的實際讀法
 * （མཱལཏི → མཱ + ལ + ཏི = mA<->la<->ti「mālati」，而非 mAl<->ti）。
 */
/**
 * r59 批次乙：自洽校驗用「wylieToTibetan → syllableKey」結果記憶化。
 * splitNoTsheg/greedySplit/候選枚舉對同一音節段反覆呼叫同鍵組合，
 * 此處以段字串＋Wylie 串為鍵快取 syllableKey(wylieToTibetan(w))，
 * 會話生命週期有效（純函數、無外部狀態；上限截斷防長會話無界增長）。
 */
const SELF_CHECK_MEMO = new Map<string, string>();
const SELF_CHECK_MEMO_MAX = 65536;
function selfCheckKey(w: string, seg: string): string {
  const ck = `${seg}\u0000${w}`;
  let v = SELF_CHECK_MEMO.get(ck);
  if (v === undefined) {
    v = syllableKey(wylieToTibetan(w));
    if (SELF_CHECK_MEMO.size >= SELF_CHECK_MEMO_MAX) SELF_CHECK_MEMO.clear();
    SELF_CHECK_MEMO.set(ck, v);
  }
  return v;
}

function splitNoTsheg(syl: string, pref: TibAmbigPref = "auto"): string | null {
  const cps = Array.from(syl);
  const n = cps.length;
  if (n < 2) return null;
  const MAX_SEG = 128; // 梵咒連寫上限（8→32；r44j：32→128——實錘 67 節長咒超 32 上限致切分歧義不收斂）
  const memo = new Map<string, string | null>();
  const walk = (i: number, depth: number): string | null => {
    if (i === n) return "";
    if (depth >= MAX_SEG) return null;
    // 下加字（subjoined，U+0F90–U+0FBC）不能自成音節段，必須歸入前一段：
    // 否則 ཤྭ（lokeśvara 的 śva）會被切成 ཤ + ྭ，後者被當「非標準 subjoined
    // 基字」轉成主字符 ཝ（U+0F5D），往返失真（實測 ལོཀེཤྭརཿ → ལོཀེཤཝརཿ）。
    if (isSubjoinedCp(cps[i].codePointAt(0) ?? 0)) return null;
    // C1：memo key 改字串鍵（r44j）——數值編碼 depth*(n+1)+i 依賴 MAX_SEG≤32
    // 的兩域不相交上界；MAX_SEG=128 後字串鍵無碰撞疑慮。
    const key = depth + ":" + i;
    if (memo.has(key)) return memo.get(key) ?? null;
    let res: string | null = null;
    for (let j = i + 1; j <= n; j++) {
      const seg = cps.slice(i, j).join("");
      const w = unicodeSyllableToWylie(seg, false, pref);
      if (w === seg) continue; // 該段無法解析
      if (selfCheckKey(w, seg) !== syllableKey(seg)) continue; // 不自洽（r59 批次乙：memo）
      const rest = walk(j, depth + 1);
      if (rest !== null) {
        res = rest === "" ? w : w + NO_TSHEG + rest;
        break;
      }
    }
    memo.set(key, res);
    return res;
  };
  return walk(0, 0);
}

/**
 * 藏文音節 → Wylie。
 *
 * 藏文 Unicode 音節結構本身存在歧義（同一碼位序列可有多種合法讀法，如
 * སངས 既可讀 sangs 也可讀 sngas；དགེ 既可讀 dge 也可讀 deg），單靠正字法
 * 啓發式無法穩定消歧。此處改用**自洽往返校驗**：枚舉所有合法的
 * 〔前加字?〕〔上加字?〕基字〔下加字?〕〔元音〕〔後加字…〕結構，把每個候選
 * Wylie 串再轉回藏文，與原碼位序列比對——只有能還原的讀法才被採納。
 * 這樣保證「藏文 → Wylie → 藏文」必定回到原字，從機制上杜絕拼寫錯讀。
 * 若多個候選都自洽，優先「結構最簡單」（少前加 / 少上加）、有下加字者加分。
 */
/**
 * 拼式歧義偏好（歧義面板）：出向多自洽候選時的拼式風格選擇。
 * "auto"＝維持引擎打分（結構最簡原則）；其餘值見面板 select。
 * 模組級（面板單線程安全；由 nativeToRoman 從 opts.tibAmbig 每次調用注入）。
 */
export type TibAmbigPref =
  | "auto" | "vowel-left" | "vowel-root" | "long-split" | "long-compact"
  | "parallel" | "stacked";
/* r59 批次乙：原模組級 let TIB_AMBIG_PREF 由 nativeToRoman 每次調用注入/還原——
 * 改為沿 allowSplit 先例參數透傳（消除模組級可變狀態；外部行為不變：
 * nativeToRoman 把 opts.tibAmbig 一路傳到 unicodeSyllableToWylie 的 prefScore）。 */

function unicodeSyllableToWylie(
  syl: string,
  allowSplit = true,
  pref: TibAmbigPref = "auto",
  /** W 類（r67）：非空時收集全部自洽候選（勝者定案邏輯不變，供拼式歧義面板按鈕用） */
  collect?: Array<{ text: string; ok: boolean; score: number }>,
): string {
  const cps = Array.from(syl).map((c) => c.codePointAt(0) ?? 0);
  const vowels = cps.filter(isVowelCp);
  // 數字、標點等「既非輔音亦非元音」的字符不參與音節解析，此時整段原樣保留，避免丟字
  const others = cps.filter((c) => !isConsonantCp(c) && !isVowelCp(c));
  if (others.length > 0) return syl;

  const items = cps
    .filter(isConsonantCp)
    .map((c) => ({ cp: baseCpOf(c), sub: isSubjoinedCp(c) }));
  // 孤立下加字段（無任何主碼位輔音依附；真實藏文不會出現，符號清單輸入會）
  // → <s-*> 顯式標註鍵，往返無損（舊版走「sub 基字」路徑出基字母，丟失下加語義）。
  const allSub = cps.length > 0 && cps.every((c) => isSubjoinedCp(c) || isVowelCp(c)) && cps.some((c) => isSubjoinedCp(c));
  if (allSub) {
    // 修復：下加字**後隨元音符號**時，出 EWTS 基字鍵拼元音（0FB2+0F80 → "r-i"，
    // 與 tibetanToWylie 入口 0F76 規範分解輸出一致；<s-*> 標註僅保留給真孤立下加字）。
    // T-3/T-4 斷言（BDRC normalizeUnicode 對齊）實錘。
    const hasVowelAfterSub = cps.some((c) => isVowelCp(c));
    let sout = "";
    let sok = true;
    for (const c of cps) {
      let tok: string | undefined;
      if (isSubjoinedCp(c)) {
        const base = baseCpOf(c);
        const bw = CP_TO_WYLIE[base];
        tok = hasVowelAfterSub ? (bw !== undefined ? bw : undefined) : ISOLATED_SUB_TO_TOKEN[c];
      } else if (hasVowelAfterSub) {
        // 後隨元音出 EWTS 鍵（0F80→"-i"），與基字拼合成 r-i 形
        tok = CP_VOWEL_TO_WYLIE[c];
      } else {
        tok = ISOLATED_VOWEL_TO_TOKEN[c];
      }
      if (tok === undefined) { sok = false; break; } // 未知碼位：回落既有路徑
      sout += tok;
    }
    if (sok && sout) return sout;
  }
  if (items.length === 0) {
    // 孤立元音段（無輔音依附）→ <v-*> 顯式標註鍵（舊版原樣透傳藏文，
    // precomposed 複合元音（0F73 等）
    // 逐碼位展開（0F73 → <v-A><v-i>，與 deprecated 分解政策一致）。
    if (vowels.length > 0) {
      let vout = "";
      for (const c of cps) {
        if (!isVowelCp(c)) continue;
        const tok = ISOLATED_VOWEL_TO_TOKEN[c];
        if (tok === undefined) return syl; // 未知元音碼位：維持透傳（不虛構能力）
        vout += tok;
      }
      return vout;
    }
    return syl;
  }

  const target = syllableKey(syl);
  /**
   * 元音符號的插入位置（其之前有幾個輔音）。
   * 舊版只判斷「末位是否元音」，無法表達「元音在後加字之後、但基字另有元音」
   * 的 -'i / -'u / -'o / -'e 第二後加字結構（ཀིའུ = ka + i + འ + u），
   * 把 ki'u 錯誤拼成 k'iu，導致 200+ 條真實藏文詞往返不一致。
   */
  let consSeen = 0;
  const vowelList: Array<{ w: string; after: number }> = [];
  for (const c of cps) {
    if (isConsonantCp(c)) consSeen++;
    else if (isVowelCp(c)) vowelList.push({ w: CP_VOWEL_TO_WYLIE[c] ?? "", after: consSeen });
  }
  // 末位是元音 → 該元音屬於最末後加字（padme 的 e）
  const trailingVowel = vowelList.length > 0 && isVowelCp(cps[cps.length - 1]);

  interface Cand { text: string; ok: boolean; score: number }
  const cands: Cand[] = [];

  for (const usePrefix of [false, true]) {
    for (const useSuper of [false, true]) {
      let i = 0;
      let w = "";

      if (usePrefix) {
        if (items.length < 2 || items[0].sub || !PREFIX_CP.has(items[0].cp)) continue;
        const s = CP_TO_WYLIE[items[0].cp];
        if (s === undefined) continue;
        w += s;
        i = 1;
      }
      if (useSuper) {
        if (i >= items.length || items[i].sub || !SUPER_CP.has(items[i].cp)) continue;
        const s = CP_TO_WYLIE[items[i].cp];
        if (s === undefined) continue;
        w += s;
        i++;
      }
      // 基字：一般不是下加字；但支援「非標準 subjoined 基字寫法」
      // （部分輸入法/舊數據用 subjoined 形式寫基字），此時取主碼位作基字。
      if (i >= items.length) continue;
      const rootCp = items[i].cp;
      const rootWasSub = items[i].sub; // 基字本身是 subjoined 形（上加+基堆疊）
      if (rootCp === 0x0f68) {
        // a-chen：純 a-chen 寫 a；作靜默基時由末尾元音符號體現
        if (vowels.length === 0) w += "a";
      } else {
        const rw = CP_TO_WYLIE[rootCp];
        if (rw === undefined) continue;
        w += rw;
      }
      i++;
      // 記下基字結束位置：補寫固有 a 時可能要插在基字之後（見下方 needInherentA）
      const rootEnd = w.length;
      // 基字（含前加 / 上加）之後已消耗的輔音數：元音符號插入位置的分段依據
      const rootCons = i;

      // 下加字（可 1~2 個）：subjoined 區全體 U+0F90–U+0FBC，不限 y/r/l/w。
      // 亦接受「主字符下加」寫法——真實佛經文本（如六字真言 པདྨེ = U+0F54 U+0F51
      // U+0FA8 U+0F7A）常把第一個下加輔音寫成主碼位（ད U+0F51），只讓末位用
      // subjoined（ྨ U+0FA8）。判據：本身是 subjoined，**或其後還跟著 subjoined**
      // （則它同屬堆疊，而非後加字）。舊版只認 subjoined，導致 པདྨེ 完全讀不出
      // Wylie（原樣吐回藏文），六字真言無法轉寫。
      let hasSub = false;
      let subN = 0;
      let subBad = false;
      let subStr = "";
      // 堆疊首元素是否為「基字位寫法」（非真下加字）——梵咒堆疊特有寫法
      // （པདྨེ 的 ད、བིལྦ 的 ལ），用於判定是否須補固有 a（見下方 finalA 段）。
      let firstStackIsBase = false;
      // 首個下加字屬「基字母 subjoined 形」（U+0F90–0FB0，如 ྦ subjoined PA）
      // → 該讀法把上層基字誤當真基（སྤྱི 讀成 sapyi：基 s + 下加 py）。規範藏文
      // 第一個下加只可能是 y/r/l/w（U+0FB1–0FB4）或 w 系（U+0FBA–0FBC）；
      // 0F90–0FB0 區的下加只出現在「上加字 + 基字」堆疊（基字 subjoined 形）。
      // 梵咒主字符下加寫法（པདྨེ 的 ད U+0F51 主碼位）不受影響（另有 firstStackIsBase）。
      let firstSubIsBaseForm = false;
      while (i < items.length && subN < 5) {
        const cur = items[i];
        const nextIsSub = i + 1 < items.length && items[i + 1].sub;
        if (!cur.sub && !nextIsSub) break;
        if (!cur.sub) {
          // 主碼位屬上加字集合（r/l/s）時，這是「上加 + 基」規範堆疊
          // （བརྩི = prefix b + 上加 r + 基 ts），**不是**梵咒「主字符下加」
          // 寫法，不降分——否則 brtsi 被誤傷、bartsi 錯誤勝出。
          const isSuperPos = SUPER_CP.has(cur.cp);
          if (!isSuperPos) firstStackIsBase = true;
          else if (nextIsSub) {
            // r/l/s 主碼位後接 sub 下加（ཀརྨ f62+fA8 型：上加 r 後接的
            // 不是基字主碼位而是下加）＝梵咒「主碼位堆疊首」寫法，同 པདྨ
            // f51 主碼位首堆疊——固有 a 寫兩個（karma 規範拼式）。
            firstStackIsBase = true;
          }
          if (false) {
            // SUPER 主碼位（r/l/s）被當**下加**（bartsi：基 b + 下加 r + 下加 ts）
            // ——藏文規範無「下加 r/l/s 再疊下加」組合，此讀法非規範，降分。
            firstSubIsBaseForm = true;
          }
        } else if (subN === 0 &&
                   (![0x0f5d, 0x0f61, 0x0f62, 0x0f63].includes(cur.cp) ||
                    (nextIsSub && [0x0f62, 0x0f63, 0x0f65].includes(cur.cp)))) {
          // cur.cp 已由 baseCpOf 折疊回主碼位：規範首下加只有 w(0F5D)/y(0F61)/
          // r(0F62)/l(0F63)；其餘（如 ྦ subjoined PA 折回 0F54）是「上加+基」
          // 堆疊的基字 subjoined 形，標記該讀法為非規範（見打分處降 5 分）。
          firstSubIsBaseForm = true;
        }
        const sw = subjoinedToWylie(cur.cp);
        if (sw === undefined) { subBad = true; break; }
        // subN≥3 的梵咒多層堆疊，出向拼式須以 `+` 連接——無 `+` 的
        // 拼式入向 subMax=2 無法還原（karmsyu 透傳實錘）。≤2 時維持常規拼式。
        subStr += (subN >= 2 ? "+" : "") + sw;
        hasSub = true;
        subN++;
        i++;
      }
      if (subBad) continue;

      // 剩餘必須全爲後加字，且 ≤ 2 個（藏文最多兩個後加字）
      const suffixItems = items.slice(i);
      if (suffixItems.length > 2) continue;
      if (suffixItems.some((x) => x.sub || !SUFFIX_CP.has(x.cp))) continue;
      // 藏文第二後加字（yang 'jug 再後加字）有嚴格搭配限制，非任意兩輔音可疊：
      //   · 再後加 s 只能接在 g / ng / b / m / ' 之後（-gs -ngs -bs -ms -'s）
      //   · 再後加 d 只能接在 n / r / l / s 之後（-nd -rd -ld -sd）
      // 不套用此規則會讀錯真實佛經音節：
      //   ལདན 會被讀成 ladn（基 l + 後加 d,n）而非規範 ldan（上加 l + 基 d + 後加 n）；
      //   འདས 會被讀成 'ads（基 ' + 後加 d,s）而非規範 'das（前加 ' + 基 d + 後加 s）。
      if (suffixItems.length === 2) {
        const firstW = CP_TO_WYLIE[suffixItems[0].cp];
        const secondW = CP_TO_WYLIE[suffixItems[1].cp];
        const okS = secondW === "s" && ["g", "ng", "b", "m", "'"].includes(firstW);
        const okD = secondW === "d" && ["n", "r", "l", "s"].includes(firstW);
        // -'m（a-chung + m，語氣詞 འམ 'am）——真實佛經高頻（བའམ ba'am、
        // ཡའམ ya'am）。不在此放行時，ba'am 候選被殺，唯一存活候選把 a-chung
        // 誤讀成基字（b'am），往返雖閉合但拼式不合 Wylie 規範。自洽校驗兜底，
        // 不會引入誤傷（'bam 不自洽）。
        const okM = secondW === "m" && firstW === "'";
        if (!(okS || okD || okM)) continue;
      }

      // 固有 a 的寫法：
      //  · 無顯式元音 → 寫在最末（bla、rgya、bsgrubs 等）
      //  · 有顯式元音，且「≥2 個下加字 + 元音落在最末 + 無後加字」→ Wylie 把基字
      //    連同固有 a 一併書寫，a **緊跟基字**（而非追加在末尾）：
      //      པདྨེ = pa + 下加 d + 下加 m + 詞尾元音 e → padme（六字真言）
      //    只有 1 個下加字者元音符號直接取代固有 a，不可補寫，否則讀錯真實佛經：
      //      བློ blo → blo（非 blao）、སྐྱི kyi → kyi（非 kyai）、མཚོ mtsho → mtsho
      let finalA = false; // 無顯式元音時，固有 a 寫在下加字之後（bla/sga 型）
      // a-chung（འ U+0F60）作後加字時，其前音節固有 a 須寫出——
      // 標準 Wylie：པའི→pa'i、བའམ→ba'am、སོའི→so'i（-'i/-'u/-'o/-'e 屬格等
      // 高頻結構）。缺此規則引擎輸出 p'i（且回轉產生錯誤碼位 པྰི 0F71），
      // 翻譯名義大集 49,834 對語料實測 ~5.8K 條受影響。有顯式元音時元音
      // 落在 a-chung 之後（-pa'i 的 i），固有 a 仍須寫——故不論 vowels 有無。
      const achungSuffix = suffixItems.some((x) => x.cp === 0x0f60);
      if (rootCp !== 0x0f68) {
        if (vowels.length === 0) {
          finalA = true;
        } else if (subN >= 2 && trailingVowel &&
                   (suffixItems.length === 0 || achungSuffix) && !useSuper) {
          // 固有 a 補寫（padme/padma'i 型）僅限無上加字場合——上加 s＋下加組合
          // （སྤྲོ spro、སྤྱི spyi）的固有 a 被元音取代，補寫成 sapro/sapyi 是錯的；
          // padme（པདྨེ）梵咒堆疊無上加字，不受影響。G-T2 對稱擴充：a-chung 屬格
          // 後綴（པདྨའི padma'i、ཀརྨའི karma'i）同構補寫——基音節無顯式元音
          // （元音落在 a-chung 之後＝vSuf），root a 緊跟基字、堆疊尾 a 照寫。
          w = w.slice(0, rootEnd) + "a" + w.slice(rootEnd);
        }
      }
      // a-chung 後加時，若**基音節自身無顯式元音**（元音全落在 a-chung 之後，
      // 屬格 -'i/-'u/-'o/-'e），須補寫基音節固有 a：པའི→pa'i、བླའི→bla'i、བའམ→ba'am；
      // 基音節有顯式元音者不補（固有 a 已被元音取代）：སོའི→so'i、སྤུའི→spu'i、
      // ཁྲུའུ→khru'u。寫出位置與 finalA 相同（下加字之後）——བླའི 的 a 在 l 之後。
      const baseVowelExists = vowelList.some((v) => v.after <= i);
      const achungA = achungSuffix && rootCp !== 0x0f68 && !baseVowelExists;
      // 元音分三段（依元音符號在碼位序列中的插入位置）：
      //   vAfterRoot：緊跟基字（བིལྦ bilba 的 i、ཤཱཀྱ shAkya 的 A）
      //   vAfterSub ：下加字之後、後加字之前（ཁྲུའུ khru'u 的第一個 u）
      //   vSuf      ：最末後加字之後（padme 的 e、khe'u 的第二個 u）
      // 舊版只分「全部在前 / 全部在後」，導致 200+ 條真實藏文詞（含佛號
      // ཤཱཀྱ་མུ་ནེ Śākyamuni）往返不一致。
      const vAfterRoot = vowelList.filter((v) => v.after <= rootCons).map((v) => v.w).join("");
      const vAfterSub = vowelList
        .filter((v) => v.after > rootCons && v.after <= i)
        .map((v) => v.w)
        .join("");
      const vSuf = vowelList.filter((v) => v.after > i).map((v) => v.w).join("");
      w += vAfterRoot;
      w += subStr;
      // G-T2（往返一致）：無顯式元音時固有 a 的寫出位置——
      //  · 主字符下加寫法（firstStackIsBase，梵咒文本 སྒ/བྲ 型之外的
      //    པདྨ/ཀརྨ/ཀལྤ/ཀརྐ 寫法：首堆疊元素用主碼位）→ 規範拼式寫兩個 a：
      //    基字固有 a 連寫（padma 的第一個 a，緊跟基字）＋最末下加字的固有 a
      //    收尾（padma 的第二個 a，與 shAkya/berga 的「堆疊末尾固有 a」同源，
      //    入向 526 段規則對稱）。舊版只寫一個 a 在下加之後（pdma 型）與
      //    規範拼式不一致：pdma'i 回轉 པྡྨ（錯誤堆疊）、規範拼式 padma
      //    解析失敗透傳。
      //  · 真下加堆疊（首堆疊元素是 subjoined 形，sga/bra/bla）→ a 維持
      //    寫在下加字之後（現行行為，bla/sga 規範）。
            // firstSubIsBaseForm 不觸發兩 a：真下加堆疊（nta/bla 型）固有 a 規範
      // 寫在末尾，舊版一 a 行為正確；兩 a 僅對主碼位首堆疊
      // （firstStackIsBase，梵咒 པདྨ/ཀརྨ 寫法）。
      if (finalA && firstStackIsBase) {
        w = w.slice(0, rootEnd) + "a" + w.slice(rootEnd);
        w += "a";
      } else if (finalA || achungA) {
        w += "a";
      }
      w += vAfterSub;
      for (let si = 0; si < suffixItems.length; si++) {
        const sf = suffixItems[si];
        // a-chung 作後加字時，若其後**還有**後加字（語氣詞 'am、'o、'u 結構：
        // བའམ ba'am、ནའོ na'o），須寫「'a」（a-chung 自帶的 a）——單獨收尾的
        // a-chung（屬格 pa'i、mtha'）只寫「'」。
        if (sf.cp === 0x0f60 && si < suffixItems.length - 1) {
          w += "'a";
          continue;
        }
        const s = CP_TO_WYLIE[sf.cp];
        if (s === undefined) continue;
        w += s;
      }
      w += vSuf;
      // 梵咒堆疊末尾的固有 a：基字帶 ≥2 下加字、元音落在基字上（不在最末）時，
      // 最末下加字自帶固有 a，Wylie 須寫出（བིལྦ bilba、བེརྒ berga、
      // ཤཱཀྱ shAkya）。缺此規則該音節會少一個 a，往返不等。
      if (vowels.length > 0 && subN >= 2 && !trailingVowel && suffixItems.length === 0) {
        w += "a";
      }

      // 自洽校驗：再轉回藏文，比對完整歸一化碼位序列（含元音符號，順序敏感）
      //
      // 打分沿用「結構最簡單」原則：有下加字（真實堆疊）者加分，前加 / 上加
      // 各減 1（結構越簡單越可能是規範讀法）。上加字與前加字不加分——否則
      // སངས 會被讀成 sngas（上加 s + 基 ng）而失去規範的 sangs（前加 s + 基 ng）。
      // ལདན → ldan 而非 ladn 由上面的「第二後加字合法性」排除，不靠打分。
      cands.push({
        text: w,
        ok: selfCheckKey(w, syl) === target, // r59 批次乙：memo（原逐候選重算 wylieToTibetan+syllableKey）
        // firstStackIsBase（主字符下加寫法）非規範讀法降 5 分（spyi>sapyi）；
        // 但出向兩 a 讀法（finalA && firstStackIsBase 寫雙 a：sarba/karma 型）
        // 是恆等閉環唯一出向，且拼式含連寫 a，不降分。
        score: ((hasSub || rootWasSub) ? 4 : 0) - (usePrefix ? 1 : 0) - (useSuper ? 1 : 0) -
          (firstStackIsBase ? (vowels.length === 0 && w.slice(rootEnd, rootEnd + 1) === "a" ? 0 : 5) : 0) -
          (firstSubIsBaseForm ? 5 : 0) -
          // 3+ 下加堆疊（`+` 拼式）＝梵咒連寫非規範讀法，僅無 2 下加內
          // 讀法時勝出——規範藏文語料（subN≤2）行為完全不變。
          (subN >= 3 ? 100 : 0) -
          // G-T2 規範拼式偏好：無顯式元音的主字符下加堆疊，固有 a 應連寫在
          // 基字內（padma/karma/kalpa/karka＝THL/EWTS 規範）；a 寫在下加之後
          // 的 pdma 型拼式是非規範變體，降 1 分讓規範拼式同分勝出。
          (firstStackIsBase && vowels.length === 0 && !achungSuffix &&
           w.slice(rootEnd, rootEnd + 1) !== "a" ? 1 : 0),
      });
      if (collect) collect.push(cands[cands.length - 1]);
    }
  }

  if (cands.length === 0) {
    // cands 空＝整段連結構候選都沒有（如梵咒連寫 ཤཱཀ：ka 非後加字→無合法單音節讀法）。
    // 這正是「省略 tsheg 的梵咒連寫」最典型形態，須先嘗試 splitNoTsheg 切分，
    // 切分失敗才原樣保留（舊版此處直接 return syl，切分分支永不可達→整段透傳）。
    if (allowSplit) {
      const split0 = splitNoTsheg(syl, pref);
      if (split0 !== null) return split0;
    }
    return syl; // 無合法解析：原樣保留
  }
  const pool = cands.filter((c) => c.ok);
  if (pool.length > 0) {
    const sorted = pool.slice().sort((a, b) => b.score - a.score);
    // 拼式歧義面板偏好（r44c）：多候選同分/近分時依用戶選擇的拼式風格重排。
    // 特徵判定用候選回轉藏文的碼位（subjoined 主字符比、元音符號位置）與
    // Wylie 文本字面（長音緊湊 A / 分解 <v-A>）。
    const prefScore = (t: string): number => {
      if (pref === "auto") return 0;
      const nat = wylieToTibetan(t);
      const cps = Array.from(nat).map((c) => c.codePointAt(0) ?? 0);
      const nSub = cps.filter((c) => c >= 0x0f90 && c <= 0x0fbc).length;
      const vowelIdx = cps.findIndex((c) => c >= 0x0f71 && c <= 0x0f81);
      const lastMain = cps.reduce((acc, c, k) => ((c >= 0x0f40 && c <= 0x0f6f) ? k : acc), -1);
      switch (pref) {
        case "stacked": return nSub * 100;
        case "parallel": return -nSub * 100;
        case "vowel-left": return lastMain >= 0 && vowelIdx >= 0 && vowelIdx < lastMain ? 100 : 0;
        case "vowel-root": return lastMain >= 0 && vowelIdx >= 0 && vowelIdx >= lastMain ? 100 : 0;
        case "long-compact": return /A(?!.*<v-)/.test(t) ? 100 : 0;
        case "long-split": return t.includes("<v-") ? 100 : 0;
        default: return 0;
      }
    };
    if (pref !== "auto") {
      // 多音節層歧義（nirde/nairde 元音歸屬、rma 並列 vs ra<->ma）：整段候選
      // 與 splitNoTsheg 切分讀法都納入 pref 比較——切分讀法只有一種時也參賽。
      if (allowSplit) {
        const split = splitNoTsheg(syl, pref);
        if (split !== null) sorted.push({ text: split, ok: true, score: 0 });
      }
    }
    if (sorted.length > 1) {
      sorted.sort((a, b) => (prefScore(b.text) - prefScore(a.text)) || (b.score - a.score));
    }
    return sorted[0].text;
  }
  /**
   * 全部候選都不自洽 → 極可能是「省略 tsheg 的梵咒連寫」。
   * 嘗試切分（見 splitNoTsheg）；切分成功則輸出帶 NO_TSHEG 標記的多音節 Wylie，
   * 往返完全一致。切分也失敗才退回舊行為（取評分最高的候選）——保留舊行為
   * 是爲了不改變既有語料上已驗證的輸出。
   */
  if (allowSplit) {
    const split = splitNoTsheg(syl, pref);
    if (split !== null) return split;
  }
  return cands.slice().sort((a, b) => b.score - a.score)[0].text;
}

/**
 * W 類（r67）：藏文 Wylie 拼式歧義偵測——藏文→羅馬字方向的逐位置按鈕。
 *
 * 藏文 Unicode 音節結構存在多讀（སངས 可讀 sangs 也可讀 sngas——兩讀都能
 * 自洽往返回原碼位），引擎按「結構最簡」打分自動選一。本偵測器枚舉每個
 * 音節的全部自洽候選：自洽候選 ≥2 且候選間碼位語義不同（非同一拼式的
 * 等價變體）時報告歧義，面板以按鈕提供勝者（primary）與次優（alternative）。
 *
 * @returns 歧義清單（kind: "tibSpelling"，字串級套用；同形拼式只報首現）
 */
export function detectTibetanWylieAmbiguities(src: string): Array<{
  index: number;
  kind: "tibSpelling";
  primary: string;
  alternative: string;
  note: string;
}> {
  const out: Array<{ index: number; kind: "tibSpelling"; primary: string; alternative: string; note: string }> = [];
  // 同形拼式去重（applyStringAmbiguities 字串級替換按首現定位；同形同歧義一起改）
  const seen = new Set<string>();
  const parts = src.split(/([་།༎༔༎༏༑༸༴\s]+)/);
  for (const part of parts) {
    if (!part || !/[^\s་།༔༎༏༑༸༴]/.test(part)) continue; // 分隔符與空白跳過
    const syl = part.trim();
    if (!syl || !isTibetanSyllable(syl)) continue;
    const collect: Array<{ text: string; ok: boolean; score: number }> = [];
    unicodeSyllableToWylie(syl, true, "auto", collect);
    const okCands = collect
      .filter((c) => c.ok)
      .sort((a, b) => b.score - a.score)
      .map((c) => c.text);
    // 去重後 ≥2 個不同拼式才算歧義（同一 text 的多候選＝等價變體，非真歧義）
    const uniq = [...new Set(okCands)];
    if (uniq.length < 2 || seen.has(uniq[0])) continue;
    seen.add(uniq[0]);
    out.push({
      index: 0,
      kind: "tibSpelling",
      primary: uniq[0],
      alternative: uniq[1],
      note: `藏文拼式歧義：${syl} 可讀 ${uniq[0]} 或 ${uniq[1]}（均自洽往返）`,
    });
  }
  return out;
}

/** 藏文音節判據：僅含藏文輔音/元音符號碼位（0F40–0FBC＋元音區） */
function isTibetanSyllable(syl: string): boolean {
  let hasCons = false;
  for (const ch of syl) {
    const c = ch.codePointAt(0) ?? 0;
    const isCons = (c >= 0x0f40 && c <= 0x0f6f) || (c >= 0x0f90 && c <= 0x0fbc);
    const isVow = c >= 0x0f71 && c <= 0x0f84;
    if (!isCons && !isVow) return false;
    if (isCons) hasCons = true;
  }
  return hasCons;
}

/** 自動互轉：藏文 Unicode ↔ Wylie（按輸入判定方向） */
export function convertTibetan(input: string): string {
  if (isTibetanUnicode(input)) return tibetanToWylie(input);
  return wylieToTibetan(input);
}

/* ------------------------------------------------------------------ *
 * 擴展方案：Wylie + 數字 / 標點的無損標註轉寫
 * 藏文數字與常用標點在純 Wylie 中無對應，故用 ASCII 數字與 ⟨…⟩ 標註
 * token 無損表達（不與任何 Wylie 字母 token 衝突），保證往返一致。
 * ------------------------------------------------------------------ */

/** 藏文數字 U+0F20–U+0F29 ↔ ASCII 0–9 */
const TIB_DIGIT_TO_ASCII: Record<number, string> = {};
const ASCII_TO_TIB_DIGIT: Record<string, string> = {};
for (let d = 0; d <= 9; d++) {
  TIB_DIGIT_TO_ASCII[0x0f20 + d] = String(d);
  ASCII_TO_TIB_DIGIT[String(d)] = cp(0x0f20 + d);
}
// （spec §13.4「the value of a half-number is 0.5 less than the number within
// which it appears」；0F2A=0.5 … 0F33=9.5 半九=9.5；18.0 實例：⟨0F24 0F2C⟩=42.5）：
// THL EWTS §3.B 未給鍵，比照
// Unicode 轉義慣例以 ⟨\u0F2A⟩ 形式標註，往返無損。
const TIB_HALF_DIGIT_TO_ASCII: Record<number, string> = {};
const ASCII_TO_TIB_HALF_DIGIT: Record<string, string> = {};
for (let d = 0; d <= 9; d++) {
  TIB_HALF_DIGIT_TO_ASCII[0x0f2a + d] = String(d) + ".5";
  ASCII_TO_TIB_HALF_DIGIT[String(d) + ".5"] = cp(0x0f2a + d);
}

/** 藏文標點 ↔ 標註 token（尖括號包裹，避免與 Wylie 字母衝突） */
// prettier-ignore
const TIB_PUNCT: Array<[number, string]> = [
  [0x0f04, "<*>"],  // ༄ 篇章起始
  [0x0f05, "<**>"], // ༅
  [0x0f06, "<+>"],  // ༆
  [0x0f07, "<@>"],  // ༇
  [0x0f08, "<#>"],  // ༈ 段落分隔
  [0x0f09, "<$>"],  // ༉
  [0x0f0a, "<%>"],  // ༊
  [0x0f0c, "<;>"],  // ༌
  [0x0f0d, "<.>"],  // ། shad（句讀）
  [0x0f0e, "<..>"], // ༎ nyis shad
  [0x0f0f, "<,>"],  // ༏
  [0x0f10, "<^>"],  // ༐
  [0x0f11, "<!>"],  // ༑
  [0x0f12, "<?>"],  // ༒
  [0x0f14, "<|>"],  // ༔
  [0x0f3a, "(("],   // ༺
  [0x0f3b, "))"],   // ༻
  [0x0f3c, "{{"],   // ༼
  [0x0f3d, "}}"],   // ༽
  // 補收（THL EWTS §6：有鍵者用 EWTS 鍵，無鍵者用 \u 轉義標註，往返無損）：
  [0x0f34, "="],      // BSDUS RTAGS（EWTS 鍵 =）
  [0x0f35, "~X"],     // NGAS BZUNG NYI ZLA（EWTS 鍵 ~X）
  [0x0f37, "X"],      // NGAS BZUNG SGOR RTAGS（EWTS 鍵 X）
  [0x0f3e, "\\u0F3E"], // YAR TSHES
  [0x0f3f, "\\u0F3F"], // MAR TSHES
  [0x0f01, "\\u0F01"], // GTER YIG MGO TRUNCATED A（EWTS 無鍵）
  [0x0f02, "\\u0F02"], [0x0f03, "\\u0F03"],
  [0x0f38, "\\u0F38"], // CHE MGO
  [0x0f13, "\\u0F13"],
  [0x0f15, "\\u0F15"], [0x0f16, "\\u0F16"], [0x0f17, "\\u0F17"],
  [0x0f18, "\\u0F18"], [0x0f19, "\\u0F19"],
  [0x0f1a, "\\u0F1A"], [0x0f1b, "\\u0F1B"], [0x0f1c, "\\u0F1C"],
  [0x0f1d, "\\u0F1D"], [0x0f1e, "\\u0F1E"], [0x0f1f, "\\u0F1F"],
  [0x0f36, "\\u0F36"], // CARET -DZUD RTAGS BZHI MIG CAN
  [0x0f6b, "kka"], // KKA（EWTS 無鍵；r44f-fix 配鍵 kka＝k+sub-ka 堆疊分解寫法，
                   // r2n("kka")=0F6B 已閉合——原 \u0F6B 原樣嵌入致二階往返丟字）
  [0x0f6c, "\\u0F6C"], // RRA
  [0x0f88, "\\u0F88"], // LCE TSA CAN
  [0x0f89, "\\u0F89"], // MCHU CAN
  [0x0f8a, "\\u0F8A"], // GRU CAN RGYINGS
  [0x0f8b, "\\u0F8B"], // GRU MED RGYINGS
  [0x0f8d, "\\u0F8D"], // SUBJOINED LCE TSA CAN
  [0x0f8e, "\\u0F8E"], [0x0f8f, "\\u0F8F"],
  [0x0f8c, "\\u0F8C"], // SIGN INVERTED MCHU CAN
  [0x0fbe, "\\u0FBE"], [0x0fbf, "\\u0FBF"],
  [0x0fc0, "\\u0FC0"], [0x0fc1, "\\u0FC1"], [0x0fc2, "\\u0FC2"], [0x0fc3, "\\u0FC3"],
  [0x0fc4, "\\u0FC4"], [0x0fc5, "\\u0FC5"], [0x0fc6, "\\u0FC6"], [0x0fc7, "\\u0FC7"],
  [0x0fc8, "\\u0FC8"], [0x0fc9, "\\u0FC9"], [0x0fca, "\\u0FCA"], [0x0fcb, "\\u0FCB"],
  [0x0fcc, "\\u0FCC"], [0x0fcf, "\\u0FCF"],
  [0x0fd5, "\\u0FD5"], [0x0fd6, "\\u0FD6"], // svasti 卍 左右旋
  [0x0fd7, "\\u0FD7"], [0x0fd8, "\\u0FD8"],
  // 裝飾/占卜符號（UCD 18.0 已分配、引擎原樣透傳無損；配碼位鍵供鍵盤輸入）
  [0x0fce, "\\u0FCE"], // ࿎ WHEEL OF TIME 拇指印
  [0x0fd0, "\\u0FD0"], // ࿐ 佛教符號（右旋）
  [0x0fd1, "\\u0FD1"], // ࿑ 佛教符號（左旋）
  [0x0fd2, "\\u0FD2"], // ࿒ 佛教符號 vajra
  [0x0fd3, "\\u0FD3"], // ࿓ 佛教符號 dharmachakra
  [0x0fd4, "\\u0FD4"], // ࿔ 佛教符號 dharmachakra（右旋）
  [0x0fd9, "\\u0FD9"], // ࿙ 占卜符號左
  [0x0fda, "\\u0FDA"], // ࿚ 占卜符號右
  // 頭飾符號納入無損 token 表——EWTS 未給鍵，比照 §6 無鍵慣例
  // 以碼位 token 標註（與 TIB_PUNCT ⟨\\u0Fxx⟩ 體例一致），確保雙向往返。
  [0x0f85, "\\u0F85"], // PALUTA
  [0x0f86, "\\u0F86"], // LCI RTAGS
  [0x0f87, "\\u0F87"], // YANG RTAGS
];
const PUNCT_CP_TO_TOKEN = new Map<number, string>(TIB_PUNCT);
const PUNCT_TOKEN_TO_CP = new Map<string, number>(TIB_PUNCT.map(([c, t]) => [t, c]));
/** 標註 token 按長度降序，供最長匹配 */
const PUNCT_TOKENS = TIB_PUNCT.map(([, t]) => t).sort((a, b) => b.length - a.length);


/** 面板掃描層「原子 token」正則（romanTokenRe 用）——
 * 藏文標註 token 全集：尖括號標註、\uXXXX 碼位、括號/符號鍵（(( )) {{ }} = ~X X ? ^）、
 * 分解序元音鍵（-i -I r-i l-i lA-i）、半數字（d.5）。與 PUNCT_TOKENS 同步生成，
 * 最長優先排序由正則交替的先後序保證（sort by length desc）。token 皆 ≤ 12 字符。 */
const TIB_ATOM_TOKENS: string[] = [
  ...PUNCT_TOKENS,
  // 標註鍵全家——缺收時 romanTokenRe 最長前綴掃描會先命中短鍵
  //（"<v--i>" 被切出尾段 "-i" 命中分解序元音鍵，標註被切碎轉成乱碼實錘）
  ...Object.keys(ISOLATED_VOWEL_TOKEN_TO_SEQ),
  ...Object.keys(ISOLATED_SUB_TOKEN_TO_CP),
  "-i", "-I", "r-i", "l-i", "lA-i",
  // 引擎獨立判斷鍵（wylieToTibetan syl=== 分支，不在 TIB_PUNCT）：
  // ? = HALANTA 0F84、^ = TSA -PHRU 0F39、' = a-chung 0F60（單鍵）
  "?", "^", "'",
  ...Array.from({ length: 10 }, (_, d) => `${d}.5`),
].sort((a, b) => b.length - a.length);
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TIB_TOKEN_SOURCE = TIB_ATOM_TOKENS.map(esc).join("|");

/** 藏文（含數字/標點）→ 擴展 Wylie */
export function tibetanExtToWylie(input: string, pref: TibAmbigPref = "auto"): string {
  let out = "";
  let buf = "";
  const flush = () => {
    if (!buf) return;
    out += tibetanToWylie(buf, pref);
    buf = "";
  };
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    const digit = TIB_DIGIT_TO_ASCII[c];
    if (digit !== undefined) {
      flush();
      out += digit;
      continue;
    }
    // 半數字（0F2A–0F33 ↔ 0.5…9.5）
    const hdigit = TIB_HALF_DIGIT_TO_ASCII[c];
    if (hdigit !== undefined) {
      flush();
      out += hdigit;
      continue;
    }
    const tok = PUNCT_CP_TO_TOKEN.get(c);
    if (tok !== undefined) {
      flush();
      out += tok;
      continue;
    }
    if (isTibetanChar(ch) || isSubjoinedBlockCp(c)) buf += ch;
    else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

/** 擴展 Wylie → 藏文（含數字/標點） */
export function wylieExtToTibetan(input: string): string {
  let out = "";
  let buf = "";
  const flush = () => {
    if (!buf) return;
    out += wylieToTibetan(buf);
    buf = "";
  };
  let i = 0;
  while (i < input.length) {
    const tok = PUNCT_TOKENS.find((t) => input.startsWith(t, i));
    if (tok !== undefined) {
      flush();
      out += cp(PUNCT_TOKEN_TO_CP.get(tok) ?? 0);
      i += tok.length;
      continue;
    }
    // 半數字 token（「0.5」…「9.5」，兩字元長，先於單字元數字匹配）
    const htok = Object.keys(ASCII_TO_TIB_HALF_DIGIT).find((t) => input.startsWith(t, i));
    if (htok !== undefined) {
      flush();
      out += ASCII_TO_TIB_HALF_DIGIT[htok];
      i += htok.length;
      continue;
    }
    const ch = input[i];
    const digit = ASCII_TO_TIB_DIGIT[ch];
    if (digit !== undefined) {
      flush();
      out += digit;
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/** 擴展方案自動互轉 */
export function convertTibetanExt(input: string): string {
  if (isTibetanUnicode(input)) return tibetanExtToWylie(input);
  return wylieExtToTibetan(input);
}

/* ---------------- 檢字表 ---------------- */

const SECTION_CONS = "輔音（基字 / 上加 / 下加）";
const SECTION_VOWEL = "元音・鼻音・止聲";
const SECTION_STRUCT = "結構說明";
const SECTION_DIGIT = "數字（擴展方案）";
const SECTION_PUNCT = "標點（擴展方案）";

function buildTibetanCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  for (const [k, v] of Object.entries(WYLIE_TO_CP)) {
    // 濁送氣音：Wylie `dh` 等對應「基字 + 下加 ha」堆疊（དྷ），而非 Unicode
    // 全形單字母（དྷ）。檢字表須與引擎實際輸出一致，否則用戶按表輸入會得到
    // 與表列不同的碼位（真實藏文語料全形字母 0 出現，堆疊寫法才正確）。
    const asp = ASPIRATED_BASE[k];
    rows.push(
      asp
        ? { native: cp(WYLIE_TO_CP[asp]) + cp(SUBJOINED_HA), roman: k, section: SECTION_CONS }
        : { native: cp(v), roman: k, section: SECTION_CONS }
    );
  }
  // Unicode 另收的全形濁送氣單字母（གྷ ཌྷ དྷ བྷ ཛྷ）在真實藏文語料中 0 出現，
  // Wylie 無獨立 token；引擎將其等價歸一爲堆疊寫法（音值相同），此處標註說明。
  //
  // 跳過 Unicode 保留碼位。舊表把 Wylie `jh` 映到 U+0F48，但藏文區
  // **沒有編碼全形 JHA**——JA 是 U+0F47，下一個 U+0F48 是保留碼位，直接跳到
  // NYA U+0F49（藏語無 jha 音位，jh 一律寫作「ཇ + 下加 ha」）。U+0F48 在任何
  // 字體裡都不可能有字形，檢字表這一格必然是豆腐塊。故不列此行。
  for (const [k, v] of Object.entries(WYLIE_TO_CP)) {
    if (!ASPIRATED_BASE[k]) continue;
    if (TIBETAN_RESERVED_CP.has(v)) continue;
    rows.push({
      native: cp(v),
      roman: k + "（全形，無獨立鍵）",
      note: "說明列：全形單字母 U+" + v.toString(16).toUpperCase() + "（梵文對音用，真實文本 0 出現）；鍵 " + k + " 實際輸出「基字+下加 ha」堆疊形（輔音區已列）",
      section: SECTION_STRUCT,
    });
  }
  // 下加字單列：與主字符不同碼位，避免用戶按主字符輸入導致堆疊失敗
  for (const [k, v] of Object.entries(SUBJOINED_CP)) {
    // roman 欄＝真鍵（單獨 y/r/l/w 輸入基字形，下加形須堆疊語境如 kya/gra），
    // native 欄列 subjoined 碼位供辨識——說明入 note，標籤不混入鍵欄。
    rows.push({ native: cp(v), roman: "堆疊語境中的 " + k, note: "說明列：下加字形 U+" + v.toString(16).toUpperCase() + "——單鍵 " + k + " 出基字形，堆疊語境（kya/gra/bla/dwa）才產生此碼位", section: SECTION_CONS });
  }
  for (const [k, v] of Object.entries(WYLIE_VOWEL_TO_CP)) {
    // 分解序 token（I/U/r/l/L/-I 等）的 native 欄與引擎嚴式輸出同步
    //（VOWEL_TOKEN_SEQ 分解序），避免檢字表列預組合碼位、引擎吐分解序的描述差
    const nativeLabel = VOWEL_TOKEN_SEQ[k] ? vowelTokenToCps(k) : cp(v);
    // deprecated 聲化元音 r/l/L/R 的入向組合鍵是「基字+-i」形式
    //（如 r-i、l-i、lA-i）——單獨 r/l 是輔音鍵，charTable roman 標籤同步引擎實際鍵
    const romanLabel = k === "L" ? "lA-i" : ["r", "l"].includes(k) ? `${k}-i` : k;
    // native 欄＝入向鍵實際輸出（引擎實跑）——r-i 系引擎吐「基字+元音符號」
    //（f62,f80），舊表列 subjoined 展示形（fb2,f80）＝表列虛構引擎能力（ḹ 教訓）。
    const nativeActual = wylieExtToTibetan(romanLabel);
    const finalNative = nativeActual !== romanLabel ? nativeActual : nativeLabel;
    rows.push({ native: finalNative, roman: romanLabel, section: SECTION_VOWEL });
  }
  rows.push({ native: cp(TSHEG), roman: "␣（詞間空格）", note: "說明列：詞間空格 ↔ tsheg（音節分隔符）——多詞輸入時空格經 punctMap 轉為 tsheg", section: SECTION_STRUCT });
  rows.push({
    native: "—", roman: NO_TSHEG,
    note: "音節邊界但**不寫 tsheg**：梵咒連寫（省略 tsheg）用，如 དུཿཁཾ → duH<->khM、མཱལཏི → mA<->la<->ti",
    section: SECTION_STRUCT,
  });
  // EWTS 專用 token 補列（THL EWTS v2.0/BDRC）
  rows.push({ native: cp(0x0f84), roman: "?", note: "HALANTA（srog med）＝EWTS「?」（H 已被 visarga 佔用）", section: SECTION_VOWEL });
  rows.push({ native: cp(0x0f80), roman: "-i", note: "REVERSED I（EWTS §2；-I 分解輸出 0F71+0F80）", section: SECTION_VOWEL });
  rows.push({ native: cp(0x0f00), roman: "oM", note: "SYLLABLE OM（EWTS §4.C）", section: SECTION_VOWEL });
  rows.push({ native: cp(0x0f39), roman: "^", note: "TSA -PHRU（EWTS §6.E；f/v 的標記成分）", section: SECTION_VOWEL });
  // FIXED-FORM RA 說明併入主迴圈 R 列（刪重複補列）
  const rRow = rows.find((r) => r.roman === "R");
  if (rRow) rRow.note = "FIXED-FORM RA（EWTS 鍵 R；0F6C RRA 無 EWTS 鍵）";
  rows.push({ native: "—", roman: "0.5…9.5", note: "說明列：半數字 0F2A–0F33（半零＝9.5；值＝該位數字−0.5）；實際輸入鍵為 d.5 形（如 0.5、3.5）", section: SECTION_DIGIT });
  rows.push({ native: "—", roman: "上加 r/l/s 寫在基字前", note: "說明列：上加字組合示例 rta / lta / sta", section: SECTION_STRUCT });
  rows.push({ native: "—", roman: "下加 y/r/l/w 寫在基字後", note: "說明列：下加字組合示例 kya / gra / bla / dwa", section: SECTION_STRUCT });
  // `+` 顯式下疊標註說明——用戶可自由指定堆疊結構（並列 vs 堆疊消歧）
  rows.push({ native: "—", roman: "X+Y（顯式下疊）", note: "說明列：+ 把其後輔音強制為下加字——p+ra 出 པྲ（堆疊）、不帶 + 的 pra 同形；梵咒連寫歧義時用 + 自由指定堆疊：pa+rmi / pA+rmi 出完整堆疊（元音歸基＋下加強制）、p+r+m+i 三層堆疊（+ 標註時下加上限 3）；歧義面板「拼式歧義」select 可選自動／元音歸屬兩向／堆疊／並列／長音兩式", section: SECTION_STRUCT });
  rows.push({ native: "—", roman: "前加 g/d/b/m/' 寫在最前", note: "說明列：前加字組合示例 dge / bka / mdo", section: SECTION_STRUCT });
  for (const [c, t] of TIB_PUNCT) {
    rows.push({ native: cp(c), roman: t, section: SECTION_PUNCT });
  }
  for (let d = 0; d <= 9; d++) {
    rows.push({ native: cp(0x0f20 + d), roman: String(d), section: SECTION_DIGIT });
  }
  // 孤立元音／孤立下加字標註說明列（引擎實鍵如實列示）
  rows.push({
    native: "—",
    roman: "<v-A|e|i|u|E|o|O|M|Mc|Ms|H|-i|r-i|l-i|r-A-i|l-A-i>",
    note: "孤立元音標註：元音符號不依附輔音時（符號清單輸入）出 <v-*> 顯式 token；入向還原規範分解碼位序；<v-M>/<v-Mc>/<v-Ms> 區分 0F7E/0F82/0F83 三 bindu 字形",
    section: SECTION_STRUCT,
  });
  rows.push({
    native: "—",
    roman: "<s-ka…ha|W|Y|R>",
    note: "孤立下加字標註：下加字不依附基字時（符號清單輸入）出 <s-*> 顯式 token（真實藏文下加字永遠以疊字連寫 kka 型輸入）；fixed-form 系 <s-W>/<s-Y>/<s-R> 對應 0FBA/0FBB/0FBC",
    section: SECTION_STRUCT,
  });
  return rows;
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */

const tibetanCharTable = buildTibetanCharTable();

const tibetanWylie: TransliterationScheme = {
  id: "tibetan-wylie",
  label: {
    zh: "藏文（Wylie ↔ Unicode）",
    "zh-TW": "藏文（Wylie ↔ Unicode）",
    en: "Tibetan (Wylie ↔ Unicode)",
    bo: "བོད་ཡིག(Wylie↔Unicode)",
    ug: "Tibet (Wylie↔Unicode)",
    mn: "Төвд (Wylie↔Unicode)",
    ja: "チベット文字（Wylie ↔ Unicode）",
    ko: "티베트 문자(Wylie ↔ Unicode)",
  fr: "Tibétain (Wylie ↔ Unicode)", de: "Tibetisch (Wylie ↔ Unicode)", },
  group: "tibetan",
  primary: true,
  description:
    "Wylie 轉寫（1959 學界標準）↔ 藏文 Unicode；上加/下加/前加字與音節邊界（tsheg）完整處理，下加字採用正確的 subjoined 碼位；數字與標點以 ASCII/⟨…⟩ 標註無損轉寫（併入擴展引擎，ext 對純 Wylie 行為與原引擎逐字符相同）",
  romanToNative: (input: string, _opts?: TransliterationOptions) => wylieExtToTibetan(input),
  nativeToRoman: (input: string, opts?: TransliterationOptions) => {
    // r59 批次乙：歧義偏好改參數透傳（原模組級 TIB_AMBIG_PREF 注入/還原）
    const p = opts?.tibAmbig as TibAmbigPref | undefined;
    return tibetanExtToWylie(input, p ?? "auto");
  },
  looksLikeNative: isTibetanUnicode,
  looksLikeRoman: looksLikeWylie,
  convert: (input: string, _opts?: TransliterationOptions) => convertTibetanExt(input),
  charTable: tibetanCharTable,
  // 空格→tsheg：G-T1 規則由引擎空白連續段判定實作（恰 1 空格→tsheg；≥2 空格
  // 或含換行→原樣透傳），punctMap 僅聲明單空格映射值（引擎 opt-in 判鍵存在）。
  // '\n'→原樣：換行是段落結構，行尾不插 tsheg。
  punctMap: { " ": "་", "\n": "\n" },
  // 藏文疊字為隱式模型（語序推斷＋subjoined 專碼位 U+0F90–U+0FBC）——
  // 顯式聲明供引擎/未來方案（explicit-subjoiner：Zanabazar 11A47）對照，行為不變。
  stackModel: { mode: "implicit" },
  // 檢字表標註 token（<.> <..> <*> 等、\uXXXX 碼位）整體免切詞——含 . < >
  // \ 等詞界 trigger 字符，逐詞掃描會切碎且碎片無拉丁字母被 gate 拒（真機實錘透傳）
  romanTokenRe: new RegExp("^(?:" + TIB_TOKEN_SOURCE + ")$"),
};

const tibetanWylieExt: TransliterationScheme = {
  id: "tibetan-wylie-ext",
  label: {
    zh: "藏文（Wylie 扩展：含數字・標點標註）",
    "zh-TW": "藏文（Wylie 擴展：含數字・標點標註）",
    en: "Tibetan (Extended Wylie: digits & punctuation)",
    bo: "བོད་ཡིག(Wylie རྒྱས་པ།)",
    ug: "Tibet (Wylie kengaytilgen)",
    mn: "Төвд (Wylie кенгэйтилгэн)",
    ja: "チベット文字（Wylie 拡張）",
    ko: "티베트 문자(Wylie 확장)",
  fr: "Tibétain (Wylie étendu : chiffres et ponctuation)", de: "Tibetisch (erweitertes Wylie: Ziffern und Interpunktion)", },
  group: "tibetan",
  primary: false,
  altOf: "tibetan-wylie",
  // 擴展引擎已併入 tibetan-wylie（對純 Wylie 行為逐字符相同），本方案
  // 保留引擎供 getScheme/程序內互轉，不再出選擇面（旗標制，功能保留）。
  hiddenFromPicker: true,
  description: "在 Wylie 基礎上以 ASCII 數字與 ⟨…⟩ 標註 token 無損表達藏文數字與標點，完整往返不丟字符",
  // 檢字表 token（<.> <..> <*> 等尖括號標註、\uXXXX 碼位標註）整體免切詞
  romanTokenRe: new RegExp("^(?:" + TIB_TOKEN_SOURCE + ")$"),
  romanToNative: (input: string, _opts?: TransliterationOptions) => wylieExtToTibetan(input),
  nativeToRoman: (input: string, _opts?: TransliterationOptions) => tibetanExtToWylie(input),
  looksLikeNative: isTibetanUnicode,
  looksLikeRoman: looksLikeWylie,
  convert: (input: string, _opts?: TransliterationOptions) => convertTibetanExt(input),
  charTable: tibetanCharTable,
};

registerScheme(tibetanWylie);
registerScheme(tibetanWylieExt);
