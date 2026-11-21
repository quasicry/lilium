// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * ZCode 字形 → 標準蒙古文 Unicode 映射層（M2）。
 *
 * 兩條路徑：
 *   **路徑 A（首選，精確）**：用 ZCode 規則引擎決定「哪個鍵用哪一欄」，
 *     再查 `KEY_COL_TO_STD` 得 [標準字母, FVS]。→ 見 `glyphSeqToStandardViaKeys`
 *   **路徑 B（回退，穩健）**：對輸入中的 ZCode 字形碼位做通用還原。
 *     → 見 `glyphToStandardUnicode`
 *
 * 為何需要兩條路徑：路徑 A 需要「原始拉丁輸入」才知各字元用哪一欄；
 * 若拿到的是既有的字形編碼文字（無原始輸入），只能用路徑 B 就近還原。
 *
 * ⚠️ 完全依賴 Noto Sans Mongolian（OFL-1.1）。
 */

import { KEY_COL_TO_STD, FVS1, FVS2, FVS3 } from "./glyph-map.generated";

export { FVS1, FVS2, FVS3 };
export const FVS4 = 0x180f;
export const MVS = 0x180e;

/** 是否為 ZCode 字形碼位（Sibe/Manchu 擴充區 U+1865–U+18AA） */
export function isZCodeGlyph(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp >= 0x1865 && cp <= 0x18aa;
}

/** 是否為標準蒙古文 Unicode（核心字母 + 擴充 + FVS/MVS） */
export function isStandardMongolian(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (cp >= 0x1820 && cp <= 0x18af) || (cp >= 0x180b && cp <= 0x180e);
}

/**
 * 路徑 A：以「輸入鍵 + 欄位」序列合成標準蒙古文 Unicode。
 *
 * @param pairs `[輸入鍵, 欄位索引][]` 序列，由 zcode-engine 產生
 * @returns 標準蒙古文 Unicode 字串
 */
export function keyColSeqToStandard(pairs: ReadonlyArray<readonly [string, number]>): string {
  let out = "";
  for (const [key, col] of pairs) {
    const row = KEY_COL_TO_STD[key];
    if (!row) continue;
    const entry = row[col];
    if (!entry) continue;
    const [base, fvs] = entry;
    out += String.fromCodePoint(base);
    if (fvs !== null) out += String.fromCodePoint(fvs);
  }
  return out;
}

/**
 * ZCode 字形碼位 → 標準字母的通用回表（路徑 B 用）。
 *
 * 值 `null` 表示該碼位是**構形段**（無獨立字母），路徑 B 無法完整還原，
 * 此時保守剝離（寧缺勿錯，避免產生錯誤字母）。
 */
export const GLYPH_FALLBACK: Record<number, number | null> = {
  0x1865: null, // SIBE HA — 詞頭段
  0x1867: null, // SIBE SHA — 詞尾段
  0x1868: null, // SIBE TA — 詞尾段
  0x186a: null, // SIBE JA — 牙形段
  0x186b: null, // SIBE FA — 詞頭段
  0x186c: null, // SIBE GAA — 詞頭段
  0x186d: null, // SIBE HAA — 詞頭段

  0x186e: 0x1834, // SIBE TSA        → ᠴ
  0x186f: 0x1828, // SIBE ZA         → ᠨ
  0x1870: 0x1828, // SIBE RAA        → ᠨ
  0x1871: 0x1828, // SIBE CHA        → ᠨ
  0x1872: 0x182a, // SIBE ZHA        → ᠪ
  0x1873: 0x182a, // MANCHU I        → ᠪ
  0x1874: 0x182a, // MANCHU KA       → ᠪ
  0x1875: 0x182b, // MANCHU RA       → ᠫ
  0x1876: 0x182b, // MANCHU FA       → ᠫ
  0x1877: 0x182b, // MANCHU ZHA      → ᠫ
  0x1878: 0x182c, // CHA WITH 2 DOTS → ᠬ
  0x1887: 0x1820, // ALI GALI A      → ᠠ
  0x1888: 0x182d, // ALI GALI I      → ᠭ
  0x1889: 0x182d, // ALI GALI KA     → ᠭ
  0x188a: 0x182d, // ALI GALI NGA    → ᠭ
  0x188b: 0x182d, // ALI GALI CA     → ᠭ
  0x188c: 0x182e, // ALI GALI TTA    → ᠮ
  0x188d: 0x182e, // ALI GALI TTHA   → ᠮ
  0x188e: 0x182e, // ALI GALI DDA    → ᠮ
  0x188f: 0x182f, // ALI GALI NNA    → ᠯ
  0x1890: 0x182f, // ALI GALI TA     → ᠯ
  0x1891: 0x182f, // ALI GALI DA     → ᠯ
  0x1893: 0x1830, // ALI GALI PHA    → ᠰ
  0x1894: 0x1830, // ALI GALI SSA    → ᠰ
  0x1896: 0x1831, // ALI GALI ZA     → ᠱ
  0x1897: 0x1831, // ALI GALI AH     → ᠱ
  0x1898: 0x1832, // MONGOLIAN LETTER TODO ALI GALI TA → ᠲ (TA)；注：Unicode 名前缀 "Todo" 指托忒文(Todo script)变体，非「待辦」
  0x1899: 0x1833, // MONGOLIAN LETTER TODO ALI GALI ZHA → ᠳ (DA)；ZCode 老码表规定映射，路径 B 回退还原用
  0x189a: 0x1834, // MANCHU ALI GALI GHA → ᠴ
  0x189b: 0x1835, // MANCHU ALI GALI NGA → ᠵ
  0x189c: 0x1836, // MANCHU ALI GALI CA  → ᠶ
  0x189d: 0x1837, // MANCHU ALI GALI JHA → ᠷ
  0x189e: 0x1837, // MANCHU ALI GALI TTA → ᠷ
  0x189f: 0x1838, // MANCHU ALI GALI DDHA → ᠸ
  0x18a0: 0x1839, // MANCHU ALI GALI TA  → ᠹ
  0x18a1: 0x1839, // MANCHU ALI GALI DHA → ᠹ
  0x18a2: 0x1839, // MANCHU ALI GALI SSA → ᠹ
  0x18a3: 0x183a, // MANCHU ALI GALI CYA → ᠺ
  0x18a4: 0x183a, // MANCHU ALI GALI ZHA → ᠺ
  0x18a5: 0x183a, // MANCHU ALI GALI ZA  → ᠺ
  0x18a6: 0x183c, // ALI GALI HALF U     → ᠼ
  0x18a7: 0x183d, // ALI GALI HALF YA    → ᠽ
  0x18a8: 0x183f, // MANCHU ALI GALI BHA → ᠿ
  0x18aa: 0x1840, // MANCHU ALI GALI LHA → ᡀ
};

/**
 * 路徑 B：ZCode 字形碼位字串 → 標準蒙古文 Unicode（就近還原）。
 *
 * 說明：構形段（`null`）會被剝離——這在**孤立字形**（如單獨的詞頭段）上是資訊損失，
 * 但對**完整字形序列**（詞首+詞中+詞尾）通常能還原主要字母。精確轉換請用路徑 A。
 */
export function glyphToStandardUnicode(glyphSeq: string): string {
  if (!glyphSeq) return "";
  let out = "";
  for (const ch of glyphSeq) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x1865 || cp > 0x18aa) {
      out += ch; // 非 ZCode 字形 → 原樣
      continue;
    }
    const base = GLYPH_FALLBACK[cp];
    if (base === undefined || base === null) continue; // 構形段 → 剝離
    out += String.fromCodePoint(base);
  }
  return out;
}

/** FVS 判斷 */
export function isFvs(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (cp >= 0x180b && cp <= 0x180d) || cp === 0x180f;
}

/** 移除所有 FVS（用於「乾淨文字」輸出） */
export function stripFvs(text: string): string {
  let out = "";
  for (const ch of text) if (!isFvs(ch)) out += ch;
  return out;
}
