// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 蒙古文正字法後處理（M3.5）——把「規則引擎的逐字輸出」校正為標準書面拼寫。
 *
 * 為何需要：ZCode 的規則引擎是「逐字元」的——它在輸入 `monggol` 時，
 * 對 `n` 依「在元音前」規則取 FVS 形，對兩個 `g` 各取一個字形。
 * 但**標準書面蒙古文**的拼寫慣例是：
 *
 *   monggol  →  ᠮᠣᠩᠭᠣᠯ   （6 字元）
 *   而非       ᠮᠣᠨ᠋ᠭᠭᠣᠯ （7 字元）
 *
 * 差異在於：
 *   ① `n` 後接 `g` 時，`ng` 應合寫為單一 `ᠩ`(U+1829)；
 *   ② `ng` + `g` 的第二個 `g` 屬於音節界限，標準拼寫中不合併但要確保字形正確。
 *
 * 本模組只做「**字形序列層**」的校正，不改動詞法規則本身。
 */

import { FVS1, FVS2, FVS3 } from "./glyph-map.generated";

/** `ᠩ` ANG（ng 連寫） */
export const ANG = 0x1829;
/** `ᠨ` NA */
export const NA = 0x1828;
/** `ᠭ` GA */
export const GA = 0x182d;
/** `ᠬ` QA */
export const QA = 0x182c;

/** 判斷是否為 FVS 碼位 */
function isFvsCp(cp: number): boolean {
  return (cp >= 0x180b && cp <= 0x180d) || cp === 0x180f;
}

/**
 * 把 `ᠨ`(n) + FVS + `ᠭ`(g) 的序列校正為 `ᠩ`(ng) + `ᠭ`(g)。
 *
 * 這是**詞內 n+g 的音位合流**：蒙古文拼寫中，音節尾的 n 遇後綴 g 時
 * 寫作 ᠩ（ng），而非 ᠨ+FVS。
 *
 * @param codepoints 碼位陣列（可含 FVS）
 * @returns 校正後碼位陣列
 */
export function applyNgLigature(codepoints: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < codepoints.length) {
    const cp = codepoints[i];
    // 匹配：ᠨ [FVS?] ᠭ  →  ᠩ ᠭ
    if (cp === NA) {
      let j = i + 1;
      if (j < codepoints.length && isFvsCp(codepoints[j])) j += 1;
      if (j < codepoints.length && (codepoints[j] === GA || codepoints[j] === QA)) {
        out.push(ANG); // 合為 ng
        i = j;
        continue;
      }
    }
    out.push(cp);
    i += 1;
  }
  return out;
}

/**
 * 移除「重複相鄰的同字母」中的冗餘 FVS。
 *
 * 場景：`monggol` 中 ng 後的 g 與 o 之間的規則是穩定的，
 * 但若規則引擎為第二個 g 附加了 FVS，標準拼寫通常不需要。
 */
export function dropRedundantFvs(codepoints: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < codepoints.length; i++) {
    const cp = codepoints[i];
    if (isFvsCp(cp)) {
      // 若前後字母相同（如 g FVS g），FVS 無區別意義 → 丟棄
      const prev = out.length > 0 ? out[out.length - 1] : -1;
      const next = i + 1 < codepoints.length ? codepoints[i + 1] : -1;
      if (prev === next && prev !== -1) continue;
    }
    out.push(cp);
  }
  return out;
}

/**
 * 移除「ng + g」中的冗餘 g。
 *
 * 背景：ZCode 的輸入鍵與書面拼寫並非一一對應。以 `monggol`（蒙古）為例：
 *   - 輸入鍵有兩個 g（mon**g**·**g**ol）；
 *   - 標準書面拼寫只有一個 `ᠭ`：`ᠮᠣᠩᠭᠣᠯ`。
 * 因為前一個 g 已與 n 合流為 `ᠩ`(ng)，其後的 g 才是音節首的 `ᠭ`。
 *
 * 判別條件：`ᠩ`(ng) 緊接 `ᠭ`/`ᠬ` 時，若再緊接**同一個**輔音，則保留一個。
 * 此規則僅在 ng 之後生效，不影響 `uggage`（ᠤᠭᠭᠠᠭᠡ）等無 ng 的詞。
 */
export function dropRedundantGaAfterNg(codepoints: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < codepoints.length; i++) {
    const cp = codepoints[i];
    // 檢查是否為「ng 之後的重複喉音」
    if ((cp === GA || cp === QA) && out.length >= 2) {
      const prev = out[out.length - 1];
      const prevPrev = out[out.length - 2];
      // out 末兩項為 [..., ng, ga] 且當前 cp 與 ga 相同 → 丟棄當前
      if (prev === cp && prevPrev === ANG) continue;
      // 亦處理 [..., ng(經FVS), ga, ga]
      if (prevPrev === GA && prev === cp && out.length >= 3 && out[out.length - 3] === ANG) continue;
    }
    out.push(cp);
  }
  return out;
}

/**
 * 完整正字法校正管線。
 *
 * 順序：① ng 連寫合流 → ② ng 後冗餘喉音去重 → ③ 冗餘 FVS 清理
 */
export function applyOrthography(text: string): string {
  let cps = [...text].map((c) => c.codePointAt(0)!);
  cps = applyNgLigature(cps);
  cps = dropRedundantGaAfterNg(cps);
  cps = dropRedundantFvs(cps);
  return cps.map((c) => String.fromCodePoint(c)).join("");
}

/** 統計 FVS 數（供評分） */
export function countFvs(text: string): number {
  let n = 0;
  for (const ch of text) if (isFvsCp(ch.codePointAt(0)!)) n += 1;
  return n;
}

export { FVS1, FVS2, FVS3 };
