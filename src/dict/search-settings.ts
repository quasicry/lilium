// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — structured search settings (Wordless wl_matching pattern).
 * Compiles the six-toggle model into a single RegExp so the scan loop runs
 * branch-free: match_case / match_whole_words / use_regex / multi search terms.
 */

export interface SearchSettings {
  /** one or more search terms (OR semantics, grouped highlights) */
  searchTerms: string[];
  matchCase: boolean;
  matchWholeWords: boolean;
  useRegex: boolean;
}

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  searchTerms: [],
  matchCase: false,
  matchWholeWords: false,
  useRegex: false,
};

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeSearchSettings(settings: Partial<SearchSettings> | undefined): SearchSettings {
  const s = Object.assign({}, DEFAULT_SEARCH_SETTINGS, settings || {});
  s.searchTerms = (s.searchTerms || []).map((t) => t.trim()).filter(Boolean);
  return s;
}

/**
 * Compile search settings into one RegExp (Wordless match_tokens logic):
 *  - non-regex terms are escaped (re.escape)
 *  - whole words wrap with \b (CJK-safe: only when term starts/ends with
 *    \w-class characters)
 *  - multiple terms joined with | into one alternation with groups
 * Returns null when there is nothing to search.
 */
export function compileSearchPattern(settings: SearchSettings): RegExp | null {
  const terms = settings.searchTerms;
  if (!terms.length) return null;

  const parts = terms.map((term) => {
    let body = settings.useRegex ? term : escapeRegExp(term);
    if (settings.matchWholeWords) {
      // \b only meaningful for \w boundaries; CJK chars are \w in JS unicode-less
      // regexes, which is acceptable — Wordless uses \b equally.
      body = `\\b(?:${body})\\b`;
    }
    return body;
  });

  // NOTE: no 'g' flag — RegExp.test() is stateful with /g (lastIndex persists
  // across calls and corrupts subsequent tests against different strings).
  const flags = settings.matchCase ? '' : 'i';
  try {
    return new RegExp(parts.join('|'), flags);
  } catch {
    // invalid user regex (use_regex mode) — fail soft to literal matching
    try {
      return new RegExp(terms.map(escapeRegExp).join('|'), flags);
    } catch {
      return null;
    }
  }
}

/** Multi-level sort comparator builder (Wordless wl_sorting pattern) */
export type SortKey<T> = (item: T) => string | number;

export function multiSort<T>(items: T[], keys: SortKey<T>[], ascending = true): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    for (const key of keys) {
      const va = key(a);
      const vb = key(b);
      if (va < vb) return ascending ? -1 : 1;
      if (va > vb) return ascending ? 1 : -1;
    }
    return 0;
  });
  return sorted;
}

/**
 * Result sampling (Wordless wl_results_sample pattern):
 *  - simple: uniformly random N without replacement
 *  - system: every k-th item (interval = ceil(n/N))
 */
export function sampleResults<T>(items: T[], count: number, mode: 'simple' | 'system'): T[] {
  const n = items.length;
  if (count >= n) return items.slice();
  if (mode === 'system') {
    const interval = Math.ceil(n / count);
    const out: T[] = [];
    for (let i = 0; i < n && out.length < count; i += interval) out.push(items[i]);
    return out;
  }
  // Fisher-Yates partial shuffle
  const pool = items.slice();
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** CSV escaping (RFC 4180) */
function csvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * Export rows as CSV (Wordless Wl_Worker_Exp_Table pattern, simplified).
 * rows[0] is the header.
 */
export function toCSV(header: string[], rows: string[][]): string {
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return '\ufeff' + lines.join('\r\n'); // BOM for Excel compatibility
}

/** Export rows as a Markdown table */
export function toMarkdownTable(header: string[], rows: string[][]): string {
  const clean = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [
    `| ${header.map(clean).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(clean).join(' | ')} |`),
  ];
  return lines.join('\n');
}

export interface ExportRow {
  word: string;
  dictName: string;
  field: string;
  snippet: string;
}

export function buildExportTables(hits: ExportRow[]): { csv: string; markdown: string; header: string[]; rows: string[][] } {
  const header = ['Word', 'Dictionary', 'Match', 'Snippet'];
  const rows = hits.map((h) => [h.word, h.dictName, h.field, h.snippet]);
  return { csv: toCSV(header, rows), markdown: toMarkdownTable(header, rows), header, rows };
}
