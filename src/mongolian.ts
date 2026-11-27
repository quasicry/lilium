// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 傳統蒙古文（Traditional Mongolian）學術拉丁轉寫 ↔ Unicode 傳統蒙古文 轉換器
 * （純函數，無 Obsidian 依賴）。
 *
 * 羅馬字側採用「學界學術轉寫」（Lessing / Janhunen / Wikipedia *Mongolian script*
 * 字母表）作為可逆 1:1 正規層
 * （x 同時是 Galik kha 與 sha、z 同時是 ZA 與 tsa、c/z 與 č/ǰ 等）。
 * 以保證 1:1 可逆（ §「羅馬字標準選擇」）。
 *
 * 與滿文（manchu.ts）的關係：兩者共用 Unicode 蒙古文區段（U+1800–U+18AF），但
 * **取不同的碼位**——滿文用 Manchu/Sibe 專屬碼位（U+185D/U+1860/U+1873 …），
 * 本檔用標準蒙古文核心字母（U+1820–U+1842）。蒙古文是字母文字（非 abugida），
 * 每個字母在 Unicode 只有一個碼位，詞首/詞中/詞尾/孤立字形由 OpenType 字型引擎
 * 依上下文自動選擇，轉寫時同一字母永遠對應同一拉丁 token，不因位置改碼。
 *
 * 變體選擇符（FVS，U+180B–180D / U+180F）與元音分隔符（MVS，U+180E）：
 * 同「一碼多形」問題，默認策略是標記保留（`<f1>`…`<f4>` / `<mvs>`）——與滿文
 * 同一哲學：默認往返無損，需要乾淨拉丁文本時再 `fvs:"strip"`。
 *
 * 取「位置變體 + 上下文規則」演算法結構，
 * 但把碼位正規化為標準蒙古文 Unicode（使用 Sibe/Manchu 擴充
 * 字母 U+1860+，為特定字型專屬編碼，標準字型無法正確渲染，故不沿用）。
 */

import {
  CharTableEntry,
  TransliterationScheme,
  TransliterationOptions,
  escapeRomanCp,
  registerScheme,
} from "./translit-common";
import { isMongolianFvs, FVS_CODEPOINTS } from "./manchu";
import { parseEscCp } from "./indic";
import { applyOrthography } from "./mongolian-ime/orthography";
import { containsZCodeGlyphs, zcodeGlyphsToStandardUnicode } from "./mongolian-ime/ime-engine";

const cp = (n: number): string => String.fromCodePoint(n);

/** 蒙古文元音分隔符 MVS（U+180E）——詞尾分隔的 a/e、u-a 分隔元音序列用 */
export const MVS_CODEPOINT = 0x180e;

/** FVS / MVS 在拉丁側的標記正則 */
const FVS_MARK_RE = /^<f([1-4])>/;
const MVS_MARK_RE = /^<mvs>/;

export type MongolianFvsMode = "mark" | "strip" | "keep";
export interface MongolianTranslitOptions {
  /** FVS / MVS 處理策略（同滿文）：mark 標記保留（默認，往返無損）/ strip 剝離 / keep 原樣 */
  fvs?: MongolianFvsMode;
}
const fvsModeOf = (opts?: MongolianTranslitOptions): MongolianFvsMode => opts?.fvs ?? "mark";

/**
 * 學術拉丁轉寫 → Unicode 傳統蒙古文（標準核心字母 U+1820–U+1842）。
 * token 集合：a e i o u ö ü ē n ng b p q g m l s š t d č ǰ y r w f k x ts z h zr lh zh ch
 * 多字元 token（ng/ts/zr/zh/lh）最長匹配優先。
 */
const LATIN_TO_MONGOLIAN: Record<string, string> = {
  // 元音（7 核心 + 1 Galik ē）
  a: cp(0x1820), e: cp(0x1821), i: cp(0x1822), o: cp(0x1823),
  u: cp(0x1824), "ö": cp(0x1825), "ü": cp(0x1826), "ē": cp(0x1827),
  // B-M2，裁定降級：EE 長元音（U+1827）現代正字高頻，但**不設 "ee" 輸入別名鍵**——
  // 語料中既有 e+e（0x1821×2）相鄰序列，入向最長匹配會把 "ee" 誤併為 U+1827，破壞往返
  // （長語料 5,501 詞實錘）。檢字表註明：鍵入請用 ē；ee 說明見 buildMongolianCharTable。
  // 輔音（U+1828–U+1842）
  n: cp(0x1828), "ng": cp(0x1829), b: cp(0x182a), p: cp(0x182b),
  q: cp(0x182c), g: cp(0x182d), m: cp(0x182e), l: cp(0x182f),
  s: cp(0x1830), "š": cp(0x1831), t: cp(0x1832), d: cp(0x1833),
  "č": cp(0x1834), "ǰ": cp(0x1835), y: cp(0x1836), r: cp(0x1837),
  w: cp(0x1838), f: cp(0x1839), k: cp(0x183a), x: cp(0x183b),
  "ts": cp(0x183c), z: cp(0x183d), h: cp(0x183e), "zr": cp(0x183f),
  "lh": cp(0x1840), "zh": cp(0x1841), "ch": cp(0x1834), "chi": cp(0x1842),
  // Poppe 體例別名：學術文獻常用 γ（mongγol 型）與 j 表 0x182D GA／0x1835 JA——
  // 嚴式鍵恆為 g/ǰ（反表不收 γ/j，出向嚴式歸一）；γ/j 輸入側別名經 ALIASES 排除反表。
  "γ": cp(0x182d), "j": cp(0x1835),
};

/** Unicode 傳統蒙古文 → 學術拉丁轉寫（反向映射，單碼位對單 token） */
const MONGOLIAN_TO_LATIN: Record<string, string> = (() => {
  const rev: Record<string, string> = {};
  // 別名 token（ch=č 寬式、chi=CHI）不進反表——反向歸一為嚴式 token（č/ǰ…）
  const ALIASES = new Set(["ch", "chi", "γ", "j"]);
  for (const [k, v] of Object.entries(LATIN_TO_MONGOLIAN)) {
    if (ALIASES.has(k)) continue;
    if (v in rev) throw new Error(`蒙古文映射衝突：${v} 對應多個拉丁 token`);
    rev[v] = k;
  }
  return rev;
})();

/** （x 同時是 Galik kha 與 sha、z 同時是
 *  ZA 與 tsa、c/z 與 č/ǰ 等），非 1:1 可逆；故羅馬字側固定採學術轉寫，不接收
 *  §「羅馬字標準選擇」）。 */

const VOWELS = new Set(["a", "e", "i", "o", "u", "ö", "ü", "ē"]);
const MONGOLIAN_BLOCK = (c: number): boolean => c >= 0x1800 && c <= 0x18af;

function isMvs(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) === MVS_CODEPOINT;
}

/** 學術拉丁轉寫 → Unicode 傳統蒙古文（含 <f1>…<f4> / <mvs> 標記還原） */
export function mongolianToUnicode(latin: string, opts?: MongolianTranslitOptions): string {
  const mode = fvsModeOf(opts);
  // 無顯式 FVS/MVS 標記時，輸出端掛 IME 正字法校正（ng 連寫／冗餘喉音／冗餘 FVS）；
  // 有顯式標記則跳過校正——<f1>… 標記契約（往返無損）優先，NA+FVS+G 不得被合流成 ANG。
  const ortho = !/[<]f[1-4][>]|[<]mvs[>]/.test(latin);
  const word = latin.normalize("NFC");
  let result = "";
  let i = 0;
  while (i < word.length) {
    if (mode === "mark" && word[i] === "<") {
      const fm = FVS_MARK_RE.exec(word.slice(i));
      if (fm) { result += cp(FVS_CODEPOINTS[fm[1]]); i += fm[0].length; continue; }
      const mm = MVS_MARK_RE.exec(word.slice(i));
      if (mm) { result += cp(MVS_CODEPOINT); i += mm[0].length; continue; }
      // M-1：<nnbsp> 標記還原 NNBSP（往返閉環）
      if (word.startsWith("<nnbsp>", i)) { result += cp(NNBSP_CODEPOINT); i += 7; continue; }
      // M-2：標點 token 還原（最長匹配）
      let ptok: string | null = null;
      for (const t of MONG_PUNCT.map(([, x]) => x)) {
        if (word.startsWith(t, i) && (ptok === null || t.length > ptok.length)) ptok = t;
      }
      if (ptok !== null) { result += cp(MONG_PUNCT_TOKEN_TO_CP.get(ptok) ?? 0); i += ptok.length; continue; }
    }
    // M-3：數字——裸 ASCII 數字入向（蒙文方案＋native 方向＝
    // 轉寫意圖明確，0123456790 透傳實錘；防誤轉改由顯式選方案方向承擔）。
    // 顯式 <num:0-9> token 保留（混合語料精確標記）。
    if (word.startsWith("<num:", i)) {
      const close = word.indexOf(">", i);
      const inner = word.slice(i + 5, close);
      if (/^[0-9]+$/.test(inner)) {
        for (const d of inner) result += ASCII_TO_MONG_DIGIT[d];
        i = close + 1; continue;
      }
    }
    const dch = word[i];
    if (dch >= "0" && dch <= "9") {
      result += ASCII_TO_MONG_DIGIT[dch] ?? dch;
      i += 1; continue;
    }
    // \uXXXX 標註還原（未收錄碼位的顯式標註，往返無損）
    // esc 解析改共用 parseEscCp（{4,6} 貪婪吞後續 a-f 拉丁字母——
    // 真機實錘：\u300Ači → 0x30139E Invalid code point 崩潰，mongolian-corpus-gate 曝光）
    const escM = parseEscCp(word.slice(i));
    if (escM !== null) { result += String.fromCodePoint(escM.cp); i += escM.width; continue; }
    let found = false;
    for (let len = 3; len >= 1; len--) {
      const sub = word.slice(i, i + len);
      if (sub in LATIN_TO_MONGOLIAN) {
        result += LATIN_TO_MONGOLIAN[sub];
        i += len;
        found = true;
        break;
      }
    }
    if (!found) {
      // 撇號：拉丁輸入的隔音撇號非蒙古文字符（真機實錘透傳黏出
      // ᠨᠠᠢᠮᠠᠨ 'ᠮᠣᠷᠢ）——丟棄，不透傳。
      if (word[i] === "'") { i += 1; continue; }
      result += word[i]; i += 1;
    }
  }
  return ortho ? applyOrthography(result) : result;
}

/**
 * M-2/M-3/M-4：標點・數字・nirugu（Ch.13 §13.5 原文用途；
 * token 採 ⟨…⟩ 標註風格，與藏文 ext 一致，雙向無損）。
 */
const MONG_PUNCT: Array<[number, string]> = [
  [0x1800, "<birga>"],      // BIRGA：段落/紙葉正面之始
  [0x1801, "<ellipsis>"],
  [0x1802, "<comma>"],
  [0x1803, "<fullstop>"],
  [0x1804, "<colon>"],
  [0x1805, "<fourdots>"],   // 章節之末
  [0x1806, "<sophy>"],      // TODO SOFT HYPHEN：第二行行首斷詞續行
  [0x1807, "<syll>"],       // SIBE SYLLABLE BOUNDARY MARKER
  [0x1808, "<mcomma>"],     // MANCHU COMMA
  [0x1809, "<mfullstop>"],  // MANCHU FULL STOP
  [0x180a, "<nirugu>"],     // NIRUGU：詞幹延伸符（字體拉伸；非斷行連字符）
];
const MONG_PUNCT_CP_TO_TOKEN = new Map<number, string>(MONG_PUNCT);
const MONG_PUNCT_TOKEN_TO_CP = new Map<string, number>(MONG_PUNCT.map(([c, t]) => [t, c]));
// M-3：數字 1810–1819 ↔ 0–9（「derived from the Tibetan digits」；
// 垂直排版中數字自左向右橫跨欄寫，屬字型/排版層，轉寫僅碼位映射）
const MONG_DIGIT_TO_ASCII: Record<number, string> = {};
const ASCII_TO_MONG_DIGIT: Record<string, string> = {};
for (let d = 0; d <= 9; d++) {
  MONG_DIGIT_TO_ASCII[0x1810 + d] = String(d);
  ASCII_TO_MONG_DIGIT[String(d)] = cp(0x1810 + d);
}
// M-1 更正：MVS（U+180E）自 Unicode 6.3 起 deprecated 的是「行斷控制」舊職能；
// 其分隔元音職能曾由 U+202F NNBSP 接管（L2/19-112 路線）。**Unicode 16.0 起
// （18.0 §13.5 沿襲）分離後綴小間隔職能正式移回 MVS**：NNBSP 僅存
// Script_Extensions=Mong 供向後兼容，MVS 除防斷行外還觸發後隨分離後綴的特殊
// shaping。本檔策略：**雙保留、不歸一**——MVS 與 NNBSP 各有獨立標記（<mvs>/<nnbsp>），
// 往返各自閉環，不存在任何「單向歸一為 MVS」的代碼路徑（與 16.0 後官方立場一致）。
const NNBSP_CODEPOINT = 0x202f;

/** Unicode 傳統蒙古文 → 學術拉丁轉寫（FVS / MVS 按 fvs 選項處理） */
export function unicodeToMongolian(mongolian: string, opts?: MongolianTranslitOptions): string {
  const mode = fvsModeOf(opts);
  const text = mongolian.normalize("NFC");
  let result = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isMongolianFvs(ch)) {
      if (mode !== "strip") {
        const n = Object.entries(FVS_CODEPOINTS).find(([, c]) => c === ch.codePointAt(0))?.[0];
        result += mode === "mark" ? `<f${n}>` : ch;
      }
      i += 1;
      continue;
    }
    if (isMvs(ch)) {
      if (mode !== "strip") result += mode === "mark" ? "<mvs>" : ch;
      i += 1;
      continue;
    }
    // M-1 更正：MVS 自 Unicode 6.3 deprecated，正字建議改用 NNBSP（U+202F）；
    // 但為保「標記往返無損」契約（語料 MVS、NNBSP 並存），兩者**雙保留不歸一**：
    // native→roman 各以獨立 <mvs>/<nnbsp> 標記保留；roman→native 各自還原，互不混寫。
    const cVal = ch.codePointAt(0) ?? 0;
    if (cVal === NNBSP_CODEPOINT) {
      if (mode !== "strip") result += mode === "mark" ? "<nnbsp>" : ch;
      i += 1;
      continue;
    }
    // M-2：傳統標點 token
    const ptok = MONG_PUNCT_CP_TO_TOKEN.get(cVal);
    if (ptok !== undefined) { result += ptok; i += 1; continue; }
    // M-3：數字
    const digit = MONG_DIGIT_TO_ASCII[cVal];
    if (digit !== undefined) { result += digit; i += 1; continue; }
    let found = false;
    const sub = ch;
    if (sub in MONGOLIAN_TO_LATIN) {
      result += MONGOLIAN_TO_LATIN[sub];
      i += 1;
      found = true;
    }
    if (!found) {
      // B3/r156：孤立代理對單元先行守衛——codePointAt 對孤立代理對返回其代理
      // 碼位值，舊邏輯會把 emoji 連跑（d83d+dd42 d83d+dd42）拆成孤立 d83d 並
      // 吃掉 low surrogate（i+=2 以 high surrogate 為「一碼位」），輸出 ill-formed
      // 且鏈式不可逆。孤立代理對本就是無效 Unicode：一律原樣透傳、不註記，
      // 與 manchu C2 守衛及其餘方案的 passthrough 行為一致。
      const cu = text.charCodeAt(i);
      if (cu >= 0xd800 && cu <= 0xdfff) {
        result += text[i];
        i += 1;
        continue;
      }
      // 區段內未收錄碼位（Sibe／滿文托忒／AliGali 擴充、Modi 數字誤入等）
      // → ⟨U+XXXX⟩ 註記標出（B2體例統一；入向 parseEscCp 對稱還原）
      // 註記僅限蒙文相關區段——區段外字符（拉丁連字號、CJK 標點、emoji 等）
      // 行為是透傳，標註化會破壞 roman 連字號詞（monggol-un 實錘）。
      // SMP 補充平面字符（合法代理對，如 Modi 數字 11B00+ 誤入）——
      // per-UTF-16-unit 迴圈拆裂高代理，須以 codePointAt 取完整碼位再判區段。
      const fullCp = text.codePointAt(i) ?? cVal;
      const isSurrogate = fullCp > 0xffff;
      const inMongBlock =
        (fullCp >= 0x1800 && fullCp <= 0x18af) || (fullCp >= 0x11660 && fullCp <= 0x1167f) ||
        (fullCp >= 0x11b00 && fullCp <= 0x11bff); // Modi 數字誤入（r73 原設計標註）
      if (inMongBlock) {
        result += escapeRomanCp(fullCp);
        i += isSurrogate ? 2 : 1;
        continue;
      }
      result += ch;
      i += isSurrogate ? 2 : 1;
    }
  }
  return result;
}

/** 自動判定輸入是傳統蒙古文還是拉丁轉寫 */
export function detectMongolianScript(text: string): "mongolscript" | "mulinde" {
  const latin = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZöüščǰē";
  for (const ch of text.slice(0, 5)) {
    if (latin.includes(ch)) return "mulinde";
  }
  return "mongolscript";
}

/** 自動轉換：傳統蒙古文 ⇄ 學術拉丁 */
export function convertMongolian(text: string, opts?: MongolianTranslitOptions): string {
  // ①字形 → 升級標準 Unicode（優先）②蒙古文 → 拉丁 ③拉丁 → 蒙古文
  if (containsZCodeGlyphs(text)) return zcodeGlyphsToStandardUnicode(text);
  return detectMongolianScript(text) === "mongolscript"
    ? unicodeToMongolian(text, opts)
    : mongolianToUnicode(text, opts);
}

/** 是否含有 Unicode 傳統蒙古文區段字符（蒙古文核心字母 U+1820–U+1842 及擴充） */
export function looksLikeMongolianUnicode(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (MONGOLIAN_BLOCK(c)) return true;
    // birga 段（U+11660–U+1167F）——引擎可轉（birga 鍵），舊判定漏收整詞 skipped
    if (c >= 0x11660 && c <= 0x1167F) return true;
  }
  return false;
}

/** 是否像蒙古文學術拉丁轉寫（含字母，且非純 ASCII 標點） */
// B-M3：原第二條件 /[a-zöüščǰē]/ 是第一條件 [a-z] 的子集，形同虛設（恆真但無害）。
// 修正須保留 && 語義（防英文/拼音整句誤判方向）：第二條件改為
// 「含特徵字符 öüščǰē，或整體皆屬蒙古學術轉寫字符集」——單詞級文本仍判拉丁，
// 帶數字/一般標點的普通文本不再放行，特徵字符偵測真正起作用。
// 特徵類含 š(0161)/č(010D)/ǰ(01F0)/ē(0113)；純變音符文本無 ASCII 字母，由
// 「整體皆屬轉寫字符集」分支放行（|| 前項被 && 前項擋住時後項仍獨立收窄）。
export function looksLikeMongolianRoman(text: string): boolean {
  return /[a-z]/i.test(text) &&
    (/[öüščǰēščǰē]/i.test(text) || /^[a-zöüščǰēščǰē''<>/: -]+$/i.test(text));
}
/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */

function buildMongolianCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  for (const [k, v] of Object.entries(LATIN_TO_MONGOLIAN)) {
    const section = VOWELS.has(k) ? "元音" : k.length > 1 ? "複合字母" : "輔音";
    rows.push({ native: v, roman: k, section });
  }
  rows.push({ native: "—", roman: "ng", note: "小舌鼻音 ᠩ，單一碼位（非 n+g）", section: "拼寫規則" });
  rows.push({ native: "—", roman: "q / g", note: "原生 qa(U+182C)/ga(U+182D) 永爲 q/g，不因前後元音和諧改 k", section: "拼寫規則" });
  rows.push({ native: "—", roman: "<f1>…<f4>", note: "變體選擇符 FVS 標記（往返無損，strip 模式可剝離）", section: "拼寫規則" });
  rows.push({ native: "—", roman: "<mvs>", note: "元音分隔符 MVS(U+180E) 標記（詞尾分隔 a/e、u-a 序列）", section: "拼寫規則" });
  rows.push({ native: "—", roman: "ch / chi / ts", note: "ch=ČA(U+1834，本族)；chi=CHI(U+1842，借詞)；ts=TSA(U+183C)", section: "拼寫規則" });
  rows.push({ native: "—", roman: "x→KHA / z→ZA", note: "學術層 x=Galik kha(U+183B)、z=ZA(U+183D)，保證 1:1 可逆", section: "拼寫規則" });
  // 檢字表覆蓋審計：標點/數字由「—」彙總說明列升級為實列（引擎逐碼位有鍵，
  // 聲稱須與引擎實況一致）。
  const punctNotes: Record<string, string> = {
    "<birga>": "BIRGA：段落/紙葉正面之始", "<ellipsis>": "刪節號", "<comma>": "逗號",
    "<fullstop>": "句號", "<colon>": "冒號", "<fourdots>": "四點（章節之末）",
    "<sophy>": "TODO SOFT HYPHEN：第二行行首斷詞續行", "<syll>": "SIBE 音節界標",
    "<mcomma>": "滿文逗號", "<mfullstop>": "滿文句號",
    "<nirugu>": "NIRUGU：詞幹延伸符（字體拉伸用，非斷行連字符）",
  };
  for (const [c, tok] of MONG_PUNCT) {
    rows.push({ native: cp(c), roman: tok, note: punctNotes[tok], section: "標點・數字" });
  }
  for (let d = 0x1810; d <= 0x1819; d++) {
    rows.push({ native: cp(d), roman: String(d - 0x1810), note: d === 0x1810 ? "蒙文數字 ᠐-᠙ ↔ 0-9：裸 ASCII 數字雙向轉換＋顯式 <num:…> token 保留（混合語料精確標記）" : undefined, section: "標點・數字" });
  }
  rows.push({ native: "—", roman: "ē (U+1827)", note: "長元音 EE 對應此碼位（現代正字高頻）；鍵入請用 ē——不設 ee 輸入別名，避免與語料既有 e+e 相鄰序列的最長匹配切分衝突", section: "拼寫規則" });
  rows.push({ native: "—", roman: "γ / j（別名）", note: "Poppe 體例別名：γ=j 同 g（U+182D GA）、j 同 ǰ（U+1835 JA）——學術文獻 mongγol 型輸入友好；出向恆嚴式 g/ǰ（歸一，往返字面以 g/ǰ 為準）", section: "拼寫規則" });
  rows.push({ native: "—", roman: "<mvs>/<nnbsp>", note: "MVS(180E，Unicode 6.3 起 deprecated，正字建議 NNBSP) 與 NNBSP(202F)：雙保留不歸一，各有 <mvs>/<nnbsp> 無損標記", section: "拼寫規則" });
  return rows;
}

const mongolianAcademic: TransliterationScheme = {
  id: "mongolian",
  label: {
    zh: "蒙古文（拉丁 ↔ Unicode）",
    "zh-TW": "蒙古文（拉丁 ↔ Unicode）",
    mn: "ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ",
    en: "Mongolian (Latin ↔ Unicode)",
    ja: "モンゴル文字（ラテン↔Unicode）", ko: "몽골 문자(라틴 ↔ Unicode)",
  fr: "Mongol (latin ↔ Unicode)", de: "Mongolisch (Latein ↔ Unicode)", },
  group: "mongolian",
  primary: true,
  description: "傳統蒙古文學術拉丁轉寫 ↔ Unicode（U+1820–U+1842）；FVS/MVS 以 <f1>…<f4>/<mvs> 標記，往返無損；輸出端掛 IME 正字法校正",
  romanToNative: (input: string, opts?: TransliterationOptions) =>
    mongolianToUnicode(input, (opts as { fvs?: MongolianFvsMode } | undefined) ?? undefined),
  nativeToRoman: (input: string, opts?: TransliterationOptions) =>
    unicodeToMongolian(input, (opts as { fvs?: MongolianFvsMode } | undefined) ?? undefined),
  looksLikeNative: looksLikeMongolianUnicode,
  looksLikeRoman: looksLikeMongolianRoman,
  convert: (input: string, opts?: TransliterationOptions) =>
    convertMongolian(input, (opts as { fvs?: MongolianFvsMode } | undefined) ?? undefined),
  charTable: buildMongolianCharTable(),
  // 面板掃描層原子 token——<num:…> 數字入向 token（< 是詞界 trigger，
  // 逐詞切分把 "<num:0123456790>" 切碎實錘）；nativeAtomRe＝蒙文標點字符序列
  //（1800-180A 是 TRIGGER_CHARS，native→roman 掃描層直接透傳不出 <birga> 實錘）。
  romanTokenRe: /^<num:[0-9]{1,12}>$/,
  nativeAtomRe: /^[\u1800-\u180A]+$/,
};

registerScheme(mongolianAcademic);
