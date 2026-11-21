// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 統一模糊／前綴降級鏈。
 *
 * 問題：修復格式的模糊策略各做各的，而且不一致——
 *   - MDict：`lookup()` 內部無條件跑 `lookupFuzzy`（忽略大小寫與標點）
 *   且設定裡的 `fuzzyFallback` 開關根本沒有被任何查詢路徑讀取（死設定）。
 *
 * 方案：把「查不到時該試什麼」抽成一條共用降級鏈，各格式共用同一套語義，
 * 並由 `DictService.fuzzyFallback` 統一開關：
 *
 *   ① exact          原樣精確比對
 *   ② case           大小寫不敏感
 *   ③ normalized     去標點／空白／連字號後比對（"well-being" ⇄ "wellbeing"）
 *   ④ prefix         正規化前綴展開（查 "wellbeing" 命中 "well-being" 這類）
 *   ⑤ 原生前綴       原樣前綴（補捉 ③ 無法處理的用例）
 *
 * 候選詞排序：先按階段（越靠前越可信），同階段按「長度差 → 字典序」，
 * 讓最短、最接近使用者輸入的詞頭排在最前。
 */

/** 共用詞頭正規化：NFKC → 去標點/空白/連字號 → 小寫 */
export function normalizeHeadword(word: string): string {
  let k = word.normalize('NFKC');
  k = k.replace(/[().,\-&、 '/\\@_$!·・]/g, '');
  return k.toLowerCase().trim();
}

/** 降級階段；數值越小越可信 */
export type FuzzyStage = 'exact' | 'case' | 'normalized' | 'prefix' | 'native-prefix';

const STAGE_RANK: Record<FuzzyStage, number> = {
  exact: 0,
  case: 1,
  normalized: 2,
  prefix: 3,
  'native-prefix': 4,
};

export interface FuzzyCandidate {
  /** 建議的詞頭 */
  word: string;
  /** 命中階段 */
  stage: FuzzyStage;
  /** 與輸入的編輯距離（0 = 完全相同或僅正規化差異） */
  distance: number;
}

export interface FuzzyOptions {
  /** 大小寫不敏感，默認 true */
  caseInsensitive?: boolean;
  /** 標點/空白不敏感，默認 true */
  normalized?: boolean;
  /** 前綴展開，默認 true */
  prefix?: boolean;
  /** 每階段最多取幾個候選，默認 12 */
  perStageLimit?: number;
  /** 總候選上限，默認 8 */
  maxResults?: number;
}

/**
 * 各格式讀取器要提供的能力（由 service.ts 的配接器實作）。
 * 只需回傳「詞頭字串」，不必回傳完整條目——降級鏈只負責找出該查哪個詞。
 */
export interface HeadwordSource {
  /** 原樣精確比對命中的詞頭 */
  exact(word: string): string[];
  /** 大小寫不敏感命中 */
  caseInsensitive(word: string, limit: number): string[];
  /** 正規化後相等 */
  normalized(word: string, limit: number): string[];
  /** 正規化後前綴匹配 */
  prefix(word: string, limit: number): string[];
}

/** Levenshtein 距離（用於候選排序；只在候選很少時呼叫，不會成為瓶頸） */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // B5：按碼位（code point）而非 UTF-16 碼元比較——emoji/代理對詞頭距離正確
  const A = Array.from(a);
  const B = Array.from(b);
  let prev = new Array<number>(B.length + 1);
  let cur = new Array<number>(B.length + 1);
  for (let j = 0; j <= B.length; j++) prev[j] = j;
  for (let i = 1; i <= A.length; i++) {
    cur[0] = i;
    const ca = A[i - 1];
    for (let j = 1; j <= B.length; j++) {
      const cost = ca === B[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[B.length];
}

/**
 * 執行降級鏈，回傳排序後的候選詞頭（不含 exact 階段——呼叫端通常已先查過精確）。
 *
 * @param src   格式讀取器提供的詞頭來源
 * @param word  使用者輸入
 */
export function resolveCandidates(
  src: HeadwordSource,
  word: string,
  opts: FuzzyOptions = {},
): FuzzyCandidate[] {
  const perStage = opts.perStageLimit ?? 12;
  const max = opts.maxResults ?? 8;
  const wantCase = opts.caseInsensitive !== false;
  const wantNorm = opts.normalized !== false;
  const wantPrefix = opts.prefix !== false;

  const seen = new Set<string>();
  const out: FuzzyCandidate[] = [];
  const trimmed = word.trim();
  if (!trimmed) return out;

  const push = (cands: string[], stage: FuzzyStage) => {
    for (const w of cands) {
      if (!w || seen.has(w)) continue;
      seen.add(w);
      out.push({ word: w, stage, distance: stage === 'case' ? 0 : editDistance(trimmed.toLowerCase(), w.toLowerCase()) });
      if (out.length >= max * 3) return;
    }
  };

  // ② 大小寫不敏感
  if (wantCase) push(src.caseInsensitive(trimmed, perStage), 'case');
  if (out.length >= max) return finish(out, max, trimmed);

  // ③ 去標點/空白後相等
  if (wantNorm) push(src.normalized(trimmed, perStage), 'normalized');
  if (out.length >= max) return finish(out, max, trimmed);

  // ④ 正規化前綴展開
  if (wantPrefix) push(src.prefix(trimmed, perStage), 'prefix');
  if (out.length >= max) return finish(out, max, trimmed);

  // ⑤ 原樣前綴（補捉正規化反而破壞匹配的用例，如含必要連字號的詞頭）
  if (wantPrefix) push(src.exact(trimmed), 'native-prefix');

  return finish(out, max, trimmed);
}

/** 排序（階段 → 長度差 → 編輯距離 → 字典序）並截斷 */
function finish(list: FuzzyCandidate[], max: number, input: string): FuzzyCandidate[] {
  const target = input.length;
  list.sort((a, b) => {
    const r = STAGE_RANK[a.stage] - STAGE_RANK[b.stage];
    if (r) return r;
    const la = Math.abs(a.word.length - target);
    const lb = Math.abs(b.word.length - target);
    if (la !== lb) return la - lb;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
  });
  return list.slice(0, max);
}
