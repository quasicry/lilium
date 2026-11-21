// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 蒙古文輸入法模組（mongolian-ime）統一出口。
 *
 * 模組分工：
 *   zcode-tables.generated.ts — ZCode 12 欄位置變體表（自動生成）
 *   zcode-engine.ts           — 上下文規則引擎（欄位優先）
 *   glyph-map.generated.ts    — 鍵 × 欄 → 標準 Unicode 映射（自動生成）
 *   glyph-map.ts              — 字形碼位 ↔ 標準 Unicode 轉換
 *   orthography.ts            — 正字法校正（ng 合流等）
 *   ime-engine.ts             — 對外主入口
 *
 * 僅作測試使用
 * 授權說明：ZCode 規則移植自 MIT 授權之 zmongol/mongol_editor_package-main，
 * 原著作權聲明見 NOTICE.md。
 */

export {
  // 引擎主入口
  latinToMongolian,
  latinToMongolianBest,
  looksLikeMongolianLatin,
  looksLikeMongolianSyllable,
  looksLikeMongolianSyllableTriggered,
  containsZCodeGlyphs,
  containsStandardMongolian,
  zcodeGlyphsToStandardUnicode,
  toCleanMongolian,
  checkVowelHarmony,
  type ImeCandidate,
} from "./ime-engine";

export {
  // 規則引擎
  latinToKeyColSeqs,
  firstAndLastCols,
  middleCols,
  keyColSeqToGlyphs,
  execute,
  lookupDict,
  dictEntries,
  isZCodeKey,
  ZCODE_COLS,
  ZCODE_COLUMN_SEMANTICS,
  type KeyColUnit,
} from "./zcode-engine";

export {
  // 映射層
  keyColSeqToStandard,
  glyphToStandardUnicode,
  isZCodeGlyph,
  isStandardMongolian,
  isFvs,
  stripFvs,
  GLYPH_FALLBACK,
  FVS1,
  FVS2,
  FVS3,
  FVS4,
  MVS,
} from "./glyph-map";

export {
  // 正字法
  applyOrthography,
  applyNgLigature,
  dropRedundantGaAfterNg,
  dropRedundantFvs,
  countFvs,
  ANG,
} from "./orthography";
