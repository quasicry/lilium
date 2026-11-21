// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 變體容錯查詢
 *
 * 古籍／佛典詞頭常以異體字或繁體著錄（「廼」「學」「旃」…），
 * 用者卻往往輸入通行字或簡體，於是一部收了該詞的詞典就是查不到。
 * 校勘字表（VARIANT_COMMON 1,003 筆 + ZH_T2S_EXT 4,158 筆）本來就在
 * main.js 裡，這裡把它順手變成查詢端的降級層——
 * 精確未命中時，先把查詢詞正規化成可能的詞頭寫法再查一次。
 *
 * 設計取捨：
 *  · 只產生「全形正規化」與「單字位替換」兩類候選，不做組合爆炸。
 *    多字詞若有 n 個異體位，全組合是 2^n；這裡最多取前 8 個候選。
 *  · 候選不含原詞本身（精確階段已查過），避免重複結果。
 *  · 純字串運算，沒有 DOM、沒有 await，可以放心放在查詢熱路徑上。
 */
import { loadVariantCommon, loadZhT2sExt, loadZhS2tExt } from './data/collation-chars.lazy';

/** 一次查詢最多試幾個正規化候選 */
const MAX_CANDIDATES = 8;

function mapChars(s: string, map: Record<string, string>): string {
  let out = '';
  let changed = false;
  for (const ch of s) {
    const v = map[ch];
    if (v && v !== ch) { out += v; changed = true; } else { out += ch; }
  }
  return changed ? out : '';
}

/**
 * 產生查詢詞的變體寫法候選（不含原詞）。
 * 順序：全形異體 → 全形繁簡（雙向）→ 單字位替換。
 */
export function variantCandidates(word: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([word]);
  const push = (s: string) => {
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  if (!word || word.length > 40) return out;

  const vcommon = loadVariantCommon();
  const t2s = loadZhT2sExt();
  const s2t = loadZhS2tExt();

  // 1) 全形正規化：整詞一次套同一張表
  push(mapChars(word, vcommon));
  push(mapChars(word, t2s));
  push(mapChars(word, s2t));

  // 2) 單字位替換：只動一個字，其餘保持原樣。
  //    這是古籍最常見的狀況（詞頭只有一個字用了異體）。
  if (out.length < MAX_CANDIDATES) {
    const chars = [...word];
    for (let i = 0; i < chars.length && out.length < MAX_CANDIDATES; i++) {
      for (const map of [vcommon, t2s, s2t]) {
        const v = map[chars[i]];
        if (!v || v === chars[i]) continue;
        const next = chars.slice();
        next[i] = v;
        push(next.join(''));
        if (out.length >= MAX_CANDIDATES) break;
      }
    }
  }
  return out.slice(0, MAX_CANDIDATES);
}
