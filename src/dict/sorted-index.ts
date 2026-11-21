// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 排序鍵索引與二分查找。
 *
 * 為什麼需要它（效能修復）：
 *   二種格式的讀取器原本都用 `entries.find()` / `for (const e of entries)` 做精確查詢，
 *   對一部 10 萬詞頭的詞典，每次查詞都是 10 萬次字串比較；`prefix('', 20000)` 建 BK 樹時
 *   更是整表掃描加 10 萬次 `toLowerCase()`。詞頭陣列在二種格式裡**本來就是字典序**
 *   （MDict key block 有序），因此可以直接二分。
 *
 * 複雜度：精確查詢 O(n) → O(log n)；前綴查詢定位 O(log n) + 輸出 O(k)。
 *
 * 設計要點：
 *   - 只存「排序後的 (鍵, 原下標)」兩條平行陣列，不複製 entries 本身，記憶體開銷 O(n)。
 *   - 重複鍵用 `equalRange` 取區間（MDict 允許同一詞頭出現多次，`lookupAll` 依賴此行為）。
 *   - 比較一律用「原始碼位」順序（`<`），與辭典檔案內的排序一致；
 *     大小寫不敏感/去標點的匹配另建獨立索引（見 `SortedKeyIndex.withNormalizer`），
 *     不影響精確查詢的語義。
 */

/** 二分：第一個 `keys[i] >= target` 的位置 */
export function lowerBound(keys: readonly string[], target: string): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 二分：第一個 `keys[i] > target` 的位置 */
export function upperBound(keys: readonly string[], target: string): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 值等於 target 的區間 [start, end)；不存在時 start === end */
export function equalRange(keys: readonly string[], target: string): [number, number] {
  const start = lowerBound(keys, target);
  if (start >= keys.length || keys[start] !== target) return [start, start];
  return [start, upperBound(keys, target)];
}

/** 前綴區間 [start, end)：keys 必須已排序；空前綴回傳整個範圍 */
export function prefixRange(keys: readonly string[], prefix: string): [number, number] {
  if (!prefix) return [0, keys.length];
  const start = lowerBound(keys, prefix);
  if (start >= keys.length) return [keys.length, keys.length];
  // 上界：把前綴最後一個碼位 +1（'abc' → 'abd'），避免對長鍵做逐字比較
  const next = prefixEnd(prefix);
  return [start, lowerBound(keys, next)];
}

/** 給定前綴，回傳「緊接其後」的最小字串（'abc' → 'abd'、'ab\uFFFF' → 'ab\uFFFF\u0000'） */
export function prefixEnd(prefix: string): string {
  if (!prefix) return prefix;
  const last = prefix.charCodeAt(prefix.length - 1);
  if (last >= 0xffff) return prefix + '\u0000';
  return prefix.slice(0, -1) + String.fromCharCode(last + 1);
}

/** 判斷 keys 是否已排序（防呆：某些詞典檔案的詞頭順序可能不符合規範） */
export function isSorted(keys: readonly string[]): boolean {
  for (let i = 1; i < keys.length; i++) {
    if (keys[i - 1] > keys[i]) return false;
  }
  return true;
}

/**
 * 詞頭索引：把「原始鍵陣列」變成可二分的結構。
 *
 * @param keys      原始鍵（按下標對應到 entries）
 * @param normalize 可選的正規化函式；提供時會額外建一條正規化索引供模糊匹配
 */
export class SortedKeyIndex {
  /** 排序後的鍵 */
  readonly sortedKeys: string[];
  /** sortedKeys[i] 對應的原始下標 */
  readonly originalIndex: Int32Array;
  /** 正規化鍵索引（懶建；僅在需要模糊匹配時才付出成本） */
  private normIndex: { keys: string[]; idx: Int32Array } | null = null;
  private readonly keys: readonly string[];
  private readonly normalize: ((k: string) => string) | null;

  constructor(keys: readonly string[], normalize?: (k: string) => string) {
    this.keys = keys;
    this.normalize = normalize || null;

    const n = keys.length;
    // 直接建普通陣列排序（原本先建 Int32Array 再 Array.from 轉出，白建一次）；
    // 註：keys 含孤立代理對時，<' 比較按 UTF-16 碼元序，prefixEnd 對孤立代理
    // 尾部回傳 last+1 的高代理字元，prefixRange 仍能正確圈出區間（隱式依賴此語意）。
    const arr = new Array<number>(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    arr.sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0));
    this.originalIndex = Int32Array.from(arr);
    this.sortedKeys = new Array<string>(n);
    for (let i = 0; i < n; i++) this.sortedKeys[i] = keys[arr[i]];
  }

  get size(): number {
    return this.sortedKeys.length;
  }

  /** 精確匹配：回傳所有命中的原始下標（重複鍵會全部回傳） */
  exact(word: string): number[] {
    const [s, e] = equalRange(this.sortedKeys, word);
    if (s === e) return [];
    const out: number[] = [];
    for (let i = s; i < e; i++) out.push(this.originalIndex[i]);
    return out;
  }

  /** 精確匹配（只要第一個）：比 exact 少一次陣列配置，熱路徑用 */
  exactFirst(word: string): number {
    const i = lowerBound(this.sortedKeys, word);
    if (i >= this.sortedKeys.length || this.sortedKeys[i] !== word) return -1;
    return this.originalIndex[i];
  }

  /** 前綴查詢：回傳前 limit 個原始下標（按字典序） */
  prefix(prefix: string, limit = 30): number[] {
    const [s, e] = prefixRange(this.sortedKeys, prefix);
    const out: number[] = [];
    const end = Math.min(e, s + limit);
    for (let i = s; i < end; i++) out.push(this.originalIndex[i]);
    return out;
  }

  /** 前綴查詢：直接回傳鍵字串（避免呼叫端再查一次） */
  prefixKeys(prefix: string, limit = 30): string[] {
    const [s, e] = prefixRange(this.sortedKeys, prefix);
    const out: string[] = [];
    const end = Math.min(e, s + limit);
    for (let i = s; i < end; i++) out.push(this.sortedKeys[i]);
    return out;
  }

  /** 懶建正規化索引：只有真的走到模糊匹配才付 O(n log n) */
  private ensureNorm(): { keys: string[]; idx: Int32Array } | null {
    if (!this.normalize) return null;
    if (this.normIndex) return this.normIndex;
    // v0.1.76-r6 預算化：正規化每鍵只算一次（O(n) 次 regex），再按預算鍵排序——
    // 比較器內每對鍵重複算 norm 是 O(n log n) 次正規化，10 萬詞頭首次模糊查詢
    // 同步主線程多付約百萬次 regex。
    const n = this.keys.length;
    const norm = this.normalize;
    const normed = new Array<string>(n);
    for (let i = 0; i < n; i++) normed[i] = norm(this.keys[i]);
    const order = new Array<number>(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => (normed[a] < normed[b] ? -1 : normed[a] > normed[b] ? 1 : 0));
    const keys = new Array<string>(n);
    for (let i = 0; i < n; i++) keys[i] = normed[order[i]];
    this.normIndex = { keys, idx: Int32Array.from(order) };
    return this.normIndex;
  }

  /**
   * 正規化匹配（大小寫/標點不敏感）：回傳前 limit 個原始下標。
   * 正規化鍵相同的會有多筆（例如 "well-being" 與 "wellbeing"），全部回傳。
   *
   * 傳入的詞會**再跑一次** normalizer——正規化函式皆為冪等，
   * 這樣呼叫端不必自己先正規化，可避免「傳原文進來查不到」這類誤用。
   */
  normalized(word: string, limit = 8): number[] {
    const ni = this.ensureNorm();
    if (!ni) return [];
    const normWord = this.normalize!(word);
    if (!normWord) return [];
    const [s, e] = equalRange(ni.keys, normWord);
    const out: number[] = [];
    const end = Math.min(e, s + limit);
    for (let i = s; i < end; i++) out.push(ni.idx[i]);
    return out;
  }

  /**
   * 正規化前綴匹配：用於「查不到時展開候選」——
   * 取正規化後以 normWord 開頭的前 limit 個詞頭。
   */
  normalizedPrefix(word: string, limit = 20): number[] {
    const ni = this.ensureNorm();
    if (!ni) return [];
    const normWord = this.normalize!(word);
    if (!normWord) return [];
    const [s, e] = prefixRange(ni.keys, normWord);
    const out: number[] = [];
    const end = Math.min(e, s + limit);
    for (let i = s; i < end; i++) out.push(ni.idx[i]);
    return out;
  }

  /** 取出全部鍵（按字典序）——供 BK 樹等需要全表的功能使用，避免重複排序 */
  allKeysSorted(): string[] {
    return this.sortedKeys;
  }

  /** 釋放正規化索引（辭典移除時呼叫） */
  invalidate(): void {
    this.normIndex = null;
  }
}
