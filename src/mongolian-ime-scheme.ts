// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 蒙古文輸入法——轉寫方案註冊層（測試保留）。
 *
 * 本模組把輸入法引擎（src/mongolian-ime/）註冊為一條
 * `TransliterationScheme`，使其自動獲得：
 *   - 檢字表（字符對照表）
 *   - 跨文字轉換樞紐（若需與其他文種互轉）
 *
 * 與 `mongolian.ts`（學術拉丁方案）的定位差異：
 *   | 方案 id            | 定位        | 輸入風格                    | 可逆性 |
 *   |--------------------|-------------|-----------------------------|--------|
 *   | `mongolian`        | 學術轉寫    | 嚴格 1:1、標記 FVS/MVS      | 完全可逆 |
 *   | `mongolian-ime`    | 輸入法      | 寬鬆打字、自動正字法校正    | 不保證 |
 * 兩者並存，用戶按用途選；即時上屏推薦 `mongolian-ime`。
 *
 * 著作權：ZCode 演算法移植自 zmongol/mongol_editor_package（MIT）。
 */

import { registerScheme } from "./translit-common";
import type { CharTableEntry, TransliterationOptions, TransliterationScheme } from "./translit-common";
import {
  latinToMongolian,
  latinToMongolianBest,
  looksLikeMongolianSyllable,
  looksLikeMongolianSyllableTriggered,
  containsZCodeGlyphs,
  containsStandardMongolian,
  zcodeGlyphsToStandardUnicode,
  latinToKeyColSeqs,
} from "./mongolian-ime";

/** 用於檢字表：由 52 鍵 × 首/中/末欄位導出代表字形 */
function buildImeCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  // 以單鍵 + 元音構成可讀樣本，逐鍵展示其蒙古文構形
  const sampleKeys = [
    "a", "e", "i", "o", "u", "v", "w",
    "n", "b", "p", "h", "g", "m", "l", "s", "x", "t", "d",
    "c", "j", "y", "r", "z", "k", "f",
  ];
  for (const k of sampleKeys) {
    let native: string;
    try {
      native = latinToMongolianBest(k + "a") || "";
    } catch {
      native = "";
    }
    if (native && native !== k + "a") {
      rows.push({
        native,
        roman: k,
        note: `${k}a 之形（依前後音節自動選形）`,
        section: "輸入鍵",
      });
    }
  }
  rows.push({
    native: "—",
    roman: "首字母大寫",
    note: "`Monggol␣` 轉為蒙古文；`monggol␣` 保持原樣。蒙古文無大小寫，故用大寫表意圖",
    section: "輸入規則",
  });
  rows.push({
    native: "—",
    roman: "ng / q / g",
    note: "ng 自動連寫合流為 ᠩ；q=ᠬ(U+182C)、g=ᠭ(U+182D)，永不因元音和諧改寫",
    section: "輸入規則",
  });
  rows.push({
    native: "—",
    roman: "FVS 自動",
    note: "依音節位置自動插入變體選擇符（FVS1–4），無需手工輸入；冗餘 FVS 自動清理",
    section: "輸入規則",
  });
  return rows;
}

/** 蒙古文輸入法方案 */
const mongolianIme: TransliterationScheme = {
  id: "mongolian-ime",
  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "蒙古文（输入法 · 拉丁打字）",
    "zh-TW": "蒙古文（輸入法 · 拉丁打字）",
    en: "Mongolian (IME · Latin typing)",
    ja: "モンゴル文字（IME・ラテン入力）",
    ko: "몽골어 (입력기 · 라틴 타이핑)",
    mn: "ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ (IME)",
    bo: "སོག་པོ་ཡིག（ཨང་ཀིའི་ཡིག་འཇུག）",
    ug: "موڭغۇلچە (كىرگۈزگۈچ)",
  fr: "Mongol (IME · saisie latine)", de: "Mongolisch (IME · lateinische Eingabe)", },
  group: "mongolian",
  primary: false,
  altOf: "mongolian",
  description:
    "拉丁字母直接打蒙古文（ZCode 相容）；自動選形、ng 連寫合流、FVS 自動插入。即時上屏建議用「首字母大寫」觸發（Monggol␣→ᠮᠣᠩᠭᠣᠯ）",
  romanToNative: (input: string) => latinToMongolianBest(input),
  nativeToRoman: (input: string) => {
    // 輸入法不保證 1:1 可逆；此處提供「舊編碼升級」語義：
    // 字形 → 標準 Unicode（而非還原拉丁）
    return containsZCodeGlyphs(input) ? zcodeGlyphsToStandardUnicode(input) : input;
  },
  looksLikeNative: (text: string) =>
    containsStandardMongolian(text) || containsZCodeGlyphs(text),
  looksLikeRoman: looksLikeMongolianSyllable,
  convert: (input: string) => {
    if (containsZCodeGlyphs(input)) return zcodeGlyphsToStandardUnicode(input);
    if (containsStandardMongolian(input)) return input;
    return latinToMongolianBest(input);
  },
  charTable: buildImeCharTable(),
  hiddenFromPicker: true, // 功能保留（命令／即時上屏／檢字表）但不再提供選擇；恢復＝刪本旗標
  skipAutoCommands: true, // 三個 IME 專命令已撤除（能力休眠保留於本註冊面：面板／檢字表）
};

registerScheme(mongolianIme);

/**
 * 即時上屏專用判定：供 realtime-tailor 層使用。
 * 與方案的 `looksLikeRoman` 分離，因為即時上屏需要更嚴的哨兵門禁。
 */
export function isImeTriggerWord(text: string): boolean {
  return looksLikeMongolianSyllableTriggered(text);
}

export { latinToMongolian, latinToMongolianBest, latinToKeyColSeqs };
export type { TransliterationOptions };
