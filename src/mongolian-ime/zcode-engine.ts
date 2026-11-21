// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * ZCode 蒙古文輸入法規則引擎——**欄位優先**實作，測試保留。
 *
 * 來源：zmongol/mongol_editor_package-main — lib/src/utils/zcode_logic.dart
 *       MIT License, Copyright (c) 2025 Zmongol Editor Contributors
 *       https://github.com/zmongol/mongol_editor_package-main
 *
 * ─── 與上游的關係 ───
 * 上游（Dart）的資料流是：拉丁 → 字形碼位（Sibe/Manchu 區）→ 上屏。
 * 本移植**保留全部規則判定**，但把「輸出字形碼位」改為「**輸出欄位索引**」：
 *
 *   上游：  latin --規則--> 字形碼位字串
 *   本檔：  latin --規則--> [鍵, 欄] 序列  --glyph-map--> 標準 Unicode + FVS
 *
 * 為何要改：ZCode 的 Sibe/Manchu 字形碼位無法被標準字型（Noto Sans Mongolian）
 * 正確渲染；而「同一字母不同欄對應不同 FVS」的資訊，只有保留欄位索引才不失真。
 *
 * ─── 保真原則 ───
 * 上游每一條規則（含註解中的補丁痕跡、已知無作用代碼）均逐條對應，不擅自優化。
 * 任何判定式改動都可能引入新錯誤，故與上游保持 1:1 結構對應。
 *
 * 純函數模組，無 Obsidian 依賴。
 */

import { ZCODE_TABLE, ZCODE_DICT, ZCODE_COLS } from "./zcode-tables.generated";

// ───────────────────────── 欄位索引常數 ─────────────────────────

/** 孤立形（單字母成詞） */
export const ZCODE_COL_ISOLATE = 0;
/** 保留欄（上游未在主流程使用） */
export const ZCODE_COL_RESERVED1 = 1;
/** g 的 debisger 形（a/o/v 後） */
export const ZCODE_COL_G_DEBISGER = 2;
/** 詞首形（initial，默認） */
export const ZCODE_COL_INIT = 3;
/** 詞首形變體（b/p/k/f 在 o/u 前；h/g 在 e/i/w 前） */
export const ZCODE_COL_INIT_V2 = 4;
/** 詞首形變體（h/g 在 u 前） */
export const ZCODE_COL_INIT_V3 = 5;
/** 詞中形（medial，默認） */
export const ZCODE_COL_MED = 6;
/** 詞中形變體（b/p/k/f 在 o/u 前；n/d 在元音前；h/g 在 e/i/w 前） */
export const ZCODE_COL_MED_V2 = 7;
/** 詞中形變體（h/g 在 u 前；g 的陽性回溯） */
export const ZCODE_COL_MED_V3 = 8;
/** 詞尾形（final，默認） */
export const ZCODE_COL_FINAL = 9;
/** 詞尾形變體（a/e 在 n/m/l/y/r 後；i/o/u 在唇音/喉音後） */
export const ZCODE_COL_FINAL_V2 = 10;
/** 詞尾形變體（a/e 在 n/m/l/y/r 後；g 在 n 後） */
export const ZCODE_COL_FINAL_V3 = 11;

/** 12 欄語義表（供文檔與偵錯） */
export const ZCODE_COLUMN_SEMANTICS: readonly string[] = [
  "isolate 孤立形",
  "reserved 保留",
  "g debisger（a/o/v 後）",
  "initial 詞首（默認）",
  "initial-2（b/p/k/f 在 o/u 前；h/g 在 e/i/w 前）",
  "initial-3（h/g 在 u 前）",
  "medial 詞中（默認）",
  "medial-2（b/p/k/f 在 o/u 前；n/d 在元音前；h/g 在 e/i/w 前）",
  "medial-3（h/g 在 u 前；g 陽性回溯）",
  "final 詞尾（默認）",
  "final-2（a/e 在 n/m/l/y/r 後；i/o/u 在唇音/喉音後）",
  "final-3（a/e 在 n/m/l/y/r 後；g 在 n 後）",
];

/** 「唇音」組：b/p/k/f —— 用於「在 o/u 前變形」規則 */
const LIPS = new Set(["b", "p", "k", "f"]);
/** 「喉音」組：h/g —— 用於「在 e/i/w/u 前變形」規則 */
const GUTTURAL = new Set(["h", "g"]);
/** N/T/D 組（上游 Middle 規則 3） */
const NTD = new Set(["N", "T", "D"]);
/** 元音集（含上游規則中出現的變體字母） */
const VOWELS_EXT = new Set(["a", "e", "i", "o", "v", "u", "w", "A", "E", "U"]);

/** 取表中某字母某欄；無此字母或空欄時返回 "" */
function cell(letter: string, col: number): string {
  const r = ZCODE_TABLE[letter];
  if (!r) return "";
  const v = r[col];
  return typeof v === "string" ? v : "";
}

/** 12 欄全表取用 */
function row(letter: string): readonly string[] | undefined {
  return ZCODE_TABLE[letter];
}

/** 是否為已知輸入鍵 */
export function isZCodeKey(ch: string): boolean {
  return ch in ZCODE_TABLE;
}

/** 一個「鍵 + 欄」單元 */
export interface KeyColUnit {
  /** 輸入鍵（單一字母） */
  key: string;
  /** 使用的欄位索引（0–11） */
  col: number;
}

// ───────────────────────── 詞首 / 詞尾（欄位版） ─────────────────────────

/**
 * 求詞首欄位與詞尾欄位（詞尾可有多個候選）。
 * 對應上游 `ZCode.FirstAndLast(String latin)`（第 157–347 行）。
 */
export function firstAndLastCols(latin: string): { first: number; last: number[] } {
  let firstCol = -1;
  let lastCols: number[] = [];

  if (latin.length < 2) return { first: firstCol, last: lastCols };

  const firstStr = latin.substring(0, 1);
  const secondStr = latin.substring(1, 2);
  const lastStr = latin.substring(latin.length - 1, latin.length);
  const prelastStr = latin.substring(latin.length - 2, latin.length - 1);

  if (!row(firstStr)) return { first: firstCol, last: lastCols };

  firstCol = ZCODE_COL_INIT;
  let x = firstStr;

  // 1. solving b,p,k,f before o,u
  if (LIPS.has(x)) {
    const y = secondStr;
    if (y === "o" || y === "u" || y === "v" || y === "U") firstCol = ZCODE_COL_INIT_V2;
  }
  // 2. solving h,g before e,i,w
  if (GUTTURAL.has(x)) {
    const y = secondStr;
    if (y === "e" || y === "i" || y === "w") firstCol = ZCODE_COL_INIT_V2;
  }
  // 3. solving h,g before u
  if (GUTTURAL.has(x)) {
    const y = secondStr;
    if (y === "u" || y === "U") firstCol = ZCODE_COL_INIT_V3;
  }

  // solving last letter
  if (row(lastStr)) {
    const pTemp = cell(lastStr, ZCODE_COL_FINAL);
    if (pTemp.length > 0) lastCols.push(ZCODE_COL_FINAL);
  }

  x = prelastStr;

  // 1. solving a after b,p,k,f    test haha  baba
  if (LIPS.has(x) && lastStr === "a") lastCols = [ZCODE_COL_FINAL_V2];
  // 2. solving e after h,g
  if (GUTTURAL.has(x) && lastStr === "e") lastCols = [ZCODE_COL_FINAL];
  // 3. solving i after b,p,k,f,h,g
  if ((LIPS.has(x) || GUTTURAL.has(x)) && lastStr === "i") lastCols = [ZCODE_COL_FINAL_V2];
  // 4. solving o after b,p,k,f
  if (LIPS.has(x) && (lastStr === "o" || lastStr === "v")) lastCols = [ZCODE_COL_FINAL_V2];
  // 5. solving u after b,p,k,f,h,g
  if ((LIPS.has(x) || GUTTURAL.has(x)) && lastStr === "u") lastCols = [ZCODE_COL_FINAL_V2];
  // 6. solving g after i,e,u,U
  if (x === "i" || x === "e" || x === "u" || x === "U") {
    if (lastStr === "g") {
      if (x === "i") {
        // 上游此處為「空迴圈」（僅掃描但不賦值），行為上無作用；保留結構以維持行為一致。
        for (let j = 1; j < latin.length - 2; j++) {
          const z = latin.substring(latin.length - 2 - j, latin.length - 1 - j);
          if (z === "a" || z === "o" || z === "v") {
            // 上游迴圈體為空
          }
        }
        lastCols = [ZCODE_COL_FINAL];
      } else {
        lastCols = [ZCODE_COL_FINAL_V3];
      }
    }
  }
  // 7. solving g after n
  if (x === "n" && lastStr === "g") lastCols = [ZCODE_COL_FINAL_V3];
  // 8. solving a, e after n, m, l, y, r
  if ((x === "n" || x === "m" || x === "l" || x === "y" || x === "r") && (lastStr === "a" || lastStr === "e")) {
    lastCols = [ZCODE_COL_FINAL_V3];
  }
  // 9. solving e after c, v, z, q, d
  if ((x === "c" || x === "v" || x === "z" || x === "q" || x === "d") && lastStr === "e") {
    lastCols = [ZCODE_COL_FINAL_V2];
  }
  // 10. solving a, after h, g
  if (GUTTURAL.has(x) && lastStr === "a") lastCols = [ZCODE_COL_FINAL_V3];
  // 11. solving a, after n, m, h, g, for isolated na, ma, ha, ga
  if (x === "n" || x === "m" || x === "h" || x === "g") {
    if (lastStr === "a" && latin.length === 2) lastCols = [ZCODE_COL_FINAL];
  }

  return { first: firstCol, last: lastCols };
}

// ───────────────────────── 詞中（欄位版） ─────────────────────────

/**
 * 求詞中各位置的欄位。
 * 對應上游 `ZCode.Middle(String str, bool isForML)`（第 349–509 行）。
 *
 * @returns 陣列，第 k 項對應 `latin[k+1]`（即詞中起始於索引 1）的欄位索引
 */
export function middleCols(latin: string, isForML: boolean): number[] {
  const cols: number[] = [];
  const maxLength = isForML ? latin.length : latin.length - 1;

  for (let i = 1; i < maxLength; i++) {
    const x = latin.substring(i, i + 1);
    if (!row(x)) {
      cols.push(-1);
      continue;
    }

    let m = ZCODE_COL_MED;

    // 1. solving g debisger after a or o
    const yy = latin.substring(i - 1, i);
    if (yy === "a" || yy === "o" || yy === "v") {
      if (x === "g") m = ZCODE_COL_G_DEBISGER;
    }
    // 2. solving g not after a or o
    if (yy !== "a" && yy !== "o" && yy !== "v") {
      if (x === "g") m = ZCODE_COL_MED_V2;
    }
    // 3. solving N,T before egshig
    if (NTD.has(x)) m = ZCODE_COL_MED_V2;
    // 4. solving u for second position, test bumbur bum
    if (x === "u" && i === 1) m = ZCODE_COL_MED_V2;
    // 5. solving i after a, e, o
    if (x === "i") {
      const y = latin.substring(i - 1, i);
      if (y === "a" || y === "e" || y === "o" || y === "v") m = ZCODE_COL_MED_V2;
    }

    if (i !== latin.length - 1) {
      // 6. solving b,p,k,f before o,u
      if (LIPS.has(x)) {
        const y = latin.substring(i + 1, i + 2);
        if (y === "o" || y === "u" || y === "v" || y === "U") m = ZCODE_COL_MED_V2;
      }
      // 7. solving n,d before egshig
      if (x === "n" || x === "d") {
        const y = latin.substring(i + 1, i + 2);
        if (VOWELS_EXT.has(y)) m = ZCODE_COL_MED_V2;
      }
      // 8. solving g before a or o
      if (x === "g") {
        const y = latin.substring(i + 1, i + 2);
        if (y === "a" || y === "o" || y === "v") m = ZCODE_COL_MED;
      }
      // 9. solving h, g before e, i, w
      if (GUTTURAL.has(x)) {
        const y = latin.substring(i + 1, i + 2);
        if (y === "e" || y === "i" || y === "w") m = ZCODE_COL_MED_V2;
      }
      // 10. solving h, g before u
      if (GUTTURAL.has(x)) {
        const y = latin.substring(i + 1, i + 2);
        if (y === "u") m = ZCODE_COL_MED_V3;
      }
      // 11. solving g after Positive or Negative i traceback and not before a,e,i,o,u
      //     test yabogsan uggugsen jarlig jerlig baigal
      if (x === "g") {
        const y = latin.substring(i - 1, i);
        const w = latin.substring(i + 1, i + 2);
        if (y === "i" && w !== "a" && w !== "e" && w !== "i" && w !== "o" && w !== "v" && w !== "u") {
          // 2021.08.09; increase max limit for j by 1
          // previously is j <= i, changed to j <= i + 1
          for (let j = 1; j <= i + 1; j++) {
            const z = latin.substring(i + 1 - j, i + 2 - j);
            if (z === "a" || z === "o" || z === "v" || z === "A") m = ZCODE_COL_G_DEBISGER;
          }
        }
      }

      // The following logic is not used when generating word for ML
      if (!isForML) {
        // 12. h, g before a, for second last letter
        if (GUTTURAL.has(x)) {
          const y = latin.substring(i + 1, i + 2);
          if (y === "a" && i === latin.length - 2) m = ZCODE_COL_FINAL_V2;
        }
        // 13. n before a, e, for second last letter    test yabona
        if (x === "n") {
          const y = latin.substring(i + 1, i + 2);
          if ((y === "a" || y === "e") && i === latin.length - 2) m = ZCODE_COL_FINAL_V2;
        }
        // 14. m, l, y, r before a, e
        if (x === "m" || x === "l" || x === "y" || x === "r") {
          const y = latin.substring(i + 1, i + 2);
          if ((y === "a" || y === "e") && i === latin.length - 2) m = ZCODE_COL_FINAL;
        }
      }
    }

    cols.push(m);
  }

  return cols;
}

// ───────────────────────── 主流程（欄位版） ─────────────────────────

/**
 * 拉丁輸入 → [鍵, 欄] 序列候選清單。
 *
 * 對應上游 `ZCode.Excute(String latin)`（第 580–609 行），但輸出欄位索引。
 * 詞尾多候選時，每一候選產生一組序列。
 */
export function latinToKeyColSeqs(latin: string): KeyColUnit[][] {
  const out: KeyColUnit[][] = [];
  const n = latin.length;
  if (n === 0) return out;

  // 單字母成詞 → 孤立形
  if (n === 1) {
    if (row(latin)) out.push([{ key: latin, col: ZCODE_COL_ISOLATE }]);
    return out;
  }

  const fl = firstAndLastCols(latin);
  if (fl.first < 0) return out;

  const midCols = middleCols(latin, false);

  // 組裝：[詞首] + [詞中...] + [詞尾]
  const build = (lastCol: number): KeyColUnit[] => {
    const seq: KeyColUnit[] = [{ key: latin[0], col: fl.first }];
    for (let i = 1; i < n - 1; i++) {
      seq.push({ key: latin[i], col: midCols[i - 1] });
    }
    seq.push({ key: latin[n - 1], col: lastCol });
    return seq;
  };

  if (fl.last.length > 0) {
    for (const lc of fl.last) out.push(build(lc));
  } else {
    // 無詞尾候選時，僅輸出詞首 + 詞中（上游行為：result.add(resultFirst)）
    const seq: KeyColUnit[] = [{ key: latin[0], col: fl.first }];
    for (let i = 1; i < n - 1; i++) seq.push({ key: latin[i], col: midCols[i - 1] });
    out.push(seq);
  }

  return out;
}

/** 把 [鍵, 欄] 序列還原為 ZCode 字形碼位字串（用於與上游對拍測試） */
export function keyColSeqToGlyphs(seq: ReadonlyArray<KeyColUnit>): string {
  let s = "";
  for (const u of seq) s += cell(u.key, u.col);
  return s;
}

/**
 * 上游兼容介面：拉丁 → 字形碼位候選字串。
 * 供測試與既有 `Excute` 行為對照使用。
 */
export function execute(latin: string): string[] {
  const seqs = latinToKeyColSeqs(latin);
  const res = seqs.map(keyColSeqToGlyphs).filter((s) => s.length > 0);
  return res.length > 0 ? res : [cell(latin, ZCODE_COL_ISOLATE)];
}

/** 整詞例外字典查詢（專有名詞／縮寫直接上屏） */
export function lookupDict(latin: string): string | undefined {
  return ZCODE_DICT[latin];
}

/** 例外字典條目（供 UI 提示） */
export function dictEntries(): Array<[string, string]> {
  return Object.entries(ZCODE_DICT);
}

export { ZCODE_COLS };
