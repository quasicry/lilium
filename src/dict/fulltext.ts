// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — full-text search engine.
 *
 * Strategy:
 *  - Keyword-first: word index (Map of normalized key → entries) for instant
 *    headword search across large dictionaries.
 *  - Content search: streaming scan via MdictReader.iterateContent() with
 *    progress reporting, cancellation, early exit after N matches per dict.
 *    Results limited to keep UI responsive (default 60 per dictionary).
 *    content search reads articles lazily with the same limits.
 */

import { MdictReader } from './mdict';
import { compileSearchPattern, normalizeSearchSettings, SearchSettings } from './search-settings';

/**
 * A6（ReDoS fail-closed）：全文掃描是同步逐條 exec，嵌套量詞等災難構型會單核凍結
 * UI。語法層靜態偵測已知的指數/高回溯風險構型，命中即拒搜（寧可漏搜不凍結）：
 *  1. 量詞直接套量詞（(x*)*、(x+)+、x{2,}{3,} 等）——指數回溯的主要來源；
 *  2. 量詞套含交替的組（(a|a)*、(a|b)+ 帶可重疊分支）——同型回溯炸彈；
 *  3. 超長查詢（>500 字元）——回溯步數與長度同增。
 * 掃描僅讀 pattern 字串、不執行正則，零 ReDoS 風險；單純字面查詢（大多數用法）
 * 不含這些構型，永不誤傷。
 */
export function unsafeRegexReason(source: string): string | null {
  if (source.length > 500) return 'too-long';
  // 剝除字符類（[...]）與跳脫——字符類內的量詞語義不同，避免誤報。
  const stripped = source.replace(/\\./g, '␀').replace(/\[(?:[^\]\\]|\\.)*\]/g, '␂');
  // 量詞直接套量詞：相鄰量詞（x++、x*+、a{2,}{3,}）——指數回溯主因。
  // 字符類的有界量詞（␂{2}＝([0-9]{2}) 剝類後）再套量詞是線性構型，先折疊成一個佔位單元再判嵌套——否則 ([0-9]{2})+ 被誤判 nested-quantifier。
  const folded = stripped.replace(/␂\{\d+(?:,\d*)?\}/g, '␀');
  if (/[+*}]\s*[{+*]/.test(folded)) return 'nested-quantifier';
  // 嵌套量詞：量詞（裸 +/*）組內收尾、外層再量化——(a+)+ 型。
  // 有界 {n,m} 組內收尾（如 (␂{2})+＝([0-9]{2})+ 剝類＋折疊後＝(␀)+）：
  // 有界×量詞為多項式風險、非指數，依白名單放行。
  if (/\((?:[^()\\]|\\.)*[+*]\s*\)\s*[{+*]/.test(folded)) return 'nested-quantifier';
  // 量詞套交替組（r59 白名單）：僅當分支可重疊（同一分支文本重複，如 (a|a)*）
  // 才有指數回溯風險；(ab)+、(foo|bar)+、([0-9]{2})+ 等線性構型放行。
  const qGroup = /\(([^()]*)\)\s*[{+*]/.exec(stripped);
  if (qGroup) {
    const inner = qGroup[1];
    // 裸 +/* 緊跟組閉合（如 (a+)+）＝嵌套量詞，拒；{n}/{n,m} 有界量詞
    // （如 (␂{2})+＝([0-9]{2})+ 剝類後）為多項式風險，依白名單放行。
    if (/[+*]\s*$/.test(inner)) return 'nested-quantifier';
    // 嵌套括號組（((a|b))+ 型）：內層結構未展開無法安全判定，保守拒搜。
    if (inner.includes('(')) return 'nested-quantifier';
    const branches = inner.split('|').map((b) => b.trim()).filter(Boolean);
    if (new Set(branches).size < branches.length) return 'quantified-alternation';
  }
  return null;
}

export interface FullTextHit {
  keyText: string;
  /** snippet around the match (plain text) */
  snippet: string;
  /** where the match was found */
  field: 'key' | 'content';
}

export interface FullTextProgress {
  dictName: string;
  scanned: number;
  total: number;
}

export interface FullTextHandle {
  promise: Promise<Map<string, FullTextHit[]>>;
  cancel(): void;
}

export interface SearchableDict {
  id: string;
  name: string;
  searchHeadwords(query: string, limit: number): FullTextHit[];
  searchContent(query: string, limit: number, onProgress?: (scanned: number, total: number) => void, cancelled?: () => boolean): FullTextHit[];
  /** pattern-based search (Wordless structured model); falls back to query string when absent */
  searchContentWithSettings?(pattern: RegExp, limit: number, onProgress?: (scanned: number, total: number) => void, cancelled?: () => boolean): FullTextHit[];
  size(): number;
}

const SNIPPET_RADIUS = 60;

/** Snippet around the first pattern match; matches wrapped in \u0001..\u0002 markers */
export function makeSnippetPattern(text: string, pattern: RegExp): string {
  const plain = text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const m = re.exec(plain);
  if (!m || m.index === undefined) return plain.slice(0, 120);
  const start = Math.max(0, m.index - 60);
  const end = Math.min(plain.length, m.index + m[0].length + 60);
  return (
    (start > 0 ? '…' : '') +
    plain.slice(start, m.index) + '\u0001' + m[0] + '\u0002' +
    plain.slice(m.index + m[0].length, end) +
    (end < plain.length ? '…' : '')
  );
}

export function makeSnippet(text: string, query: string): string {
  const plain = text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return plain.slice(0, SNIPPET_RADIUS * 2) + (plain.length > SNIPPET_RADIUS * 2 ? '…' : '');
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(plain.length, idx + query.length + SNIPPET_RADIUS);
  return (start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
}

/** r59 批次乙：大小寫不敏感字面搜尋——整文 toLowerCase（每條都配置新字串）改
* 單一 i-flag RegExp.test（零配置）。字面 escape 防 query 內正則元字符誤匹配。 */
function makeCaseInsensitiveRe(query: string): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export class MdictSearch implements SearchableDict {
  constructor(public id: string, public name: string, private reader: MdictReader) {}

  searchContentWithSettings(pattern: RegExp, limit: number, onProgress?: (s: number, t: number) => void, cancelled?: () => boolean): FullTextHit[] {
    const hits: FullTextHit[] = [];
    const total = this.reader.entryCount;
    let scanned = 0;
    for (const item of this.reader.iterateContent()) {
      scanned++;
      if (onProgress && scanned % 500 === 0) onProgress(scanned, total);
      if (cancelled && cancelled()) break;
      pattern.lastIndex = 0;
      if (pattern.test(item.text)) {
        hits.push({ keyText: item.keyText, snippet: makeSnippetPattern(item.text, pattern), field: 'content' });
        if (hits.length >= limit) break;
      }
    }
    onProgress?.(scanned, total);
    return hits;
  }

  size(): number {
    return this.reader.entryCount;
  }

  searchHeadwords(query: string, limit: number): FullTextHit[] {
    // r59 批次乙：線性掃描風險標記（brief ⑧）——searchHeadwords 是子串匹配
    // （includes 語義），reader.entries 的字典序索引（SortedKeyIndex）無法加速
    // 子串查找，資料結構維持現狀不硬改。熱點（44k 條級逐條 keyText.toLowerCase()
    // 的字串配置）由 i-flag RegExp 消除。
    const re = makeCaseInsensitiveRe(query);
    const hits: FullTextHit[] = [];
    for (const e of this.reader.entries) {
      if (re.test(e.keyText)) {
        hits.push({ keyText: e.keyText, snippet: '', field: 'key' });
        if (hits.length >= limit) break;
      }
    }
    return hits;
  }

  searchContent(query: string, limit: number, onProgress?: (s: number, t: number) => void, cancelled?: () => boolean): FullTextHit[] {
    const re = makeCaseInsensitiveRe(query); // r59 批次乙：免逐條整文 toLowerCase
    const hits: FullTextHit[] = [];
    const total = this.reader.entryCount;
    let scanned = 0;
    for (const item of this.reader.iterateContent()) {
      scanned++;
      if (onProgress && scanned % 500 === 0) onProgress(scanned, total);
      if (cancelled && cancelled()) break;
      if (re.test(item.text)) {
        hits.push({ keyText: item.keyText, snippet: makeSnippet(item.text, query), field: 'content' });
        if (hits.length >= limit) break;
      }
    }
    onProgress?.(scanned, total);
    return hits;
  }
}



export class Lex0Search implements SearchableDict {
  constructor(public id: string, public name: string, private reader: import('./tei-lex0').Lex0Reader) {}

  size(): number {
    return this.reader.entryCount;
  }

  searchHeadwords(query: string, limit: number): FullTextHit[] {
    const re = makeCaseInsensitiveRe(query); // r59 批次乙
    const hits: FullTextHit[] = [];
    for (const a of this.reader.articles) {
      if (a.keys.some((k) => re.test(k))) {
        hits.push({ keyText: a.keys[0] || '', snippet: '', field: 'key' });
        if (hits.length >= limit) break;
      }
    }
    return hits;
  }

  searchContent(query: string, limit: number, onProgress?: (s: number, t: number) => void, cancelled?: () => boolean): FullTextHit[] {
    const re = makeCaseInsensitiveRe(query); // r59 批次乙：免逐條整文 toLowerCase
    const hits: FullTextHit[] = [];
    const total = this.reader.articles.length;
    let scanned = 0;
    for (const a of this.reader.articles) {
      scanned++;
      if (onProgress && scanned % 500 === 0) onProgress(scanned, total);
      if (cancelled && cancelled()) break;
      if (re.test(a.html)) {
        hits.push({ keyText: a.keys[0] || '', snippet: makeSnippet(a.html, query), field: 'content' });
        if (hits.length >= limit) break;
      }
    }
    onProgress?.(scanned, total);
    return hits;
  }
}


export interface FullTextOptions {
  headwords: boolean;
  content: boolean;
  perDictLimit: number;
  /** structured search settings (Wordless six-toggle model) */
  searchSettings?: Partial<SearchSettings>;
  onProgress?: (p: FullTextProgress) => void;
}

export const DEFAULT_FT_OPTIONS: FullTextOptions = {
  headwords: true,
  content: true,
  perDictLimit: 60,
};

/** Run full-text search across multiple SearchableDicts sequentially with cancellation */
export function runFullTextSearch(
  dicts: SearchableDict[],
  query: string,
  options: Partial<FullTextOptions> = {},
): FullTextHandle {
  const opts = Object.assign({}, DEFAULT_FT_OPTIONS, options);
  const settings = normalizeSearchSettings({
    ...opts.searchSettings,
    searchTerms: [query],
  });
  const pattern = compileSearchPattern(settings);
  let cancelled = false;
  const promise = (async (): Promise<Map<string, FullTextHit[]>> => {
    const results = new Map<string, FullTextHit[]>();
    for (const d of dicts) {
      if (cancelled) break;
      const hits: FullTextHit[] = [];
      if (opts.headwords) {
        hits.push(...d.searchHeadwords(query, opts.perDictLimit));
      }
      if (!cancelled && opts.content && hits.length < opts.perDictLimit) {
        const remaining = opts.perDictLimit - hits.length;
        const contentHits = d.searchContentWithSettings && pattern
          ? d.searchContentWithSettings(pattern, remaining, (scanned, total) => {
              opts.onProgress?.({ dictName: d.name, scanned, total });
            }, () => cancelled)
          : d.searchContent(query, remaining, (scanned, total) => {
              opts.onProgress?.({ dictName: d.name, scanned, total });
            }, () => cancelled);
        hits.push(...contentHits);
      }
      opts.onProgress?.({ dictName: d.name, scanned: d.size(), total: d.size() });
      if (hits.length) results.set(d.id, hits.slice(0, opts.perDictLimit));
    }
    return results;
  })();
  return { promise, cancel: () => (cancelled = true) };
}
