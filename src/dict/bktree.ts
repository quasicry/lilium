// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — BK-Tree for fuzzy "did you mean" suggestions.
 * Same algorithm as medict's Go bktree (levenshtein distance, tolerance 2),
 * but built lazily over the service's headword lists instead of at load.
 *
 * We build per-dictionary trees on first fuzzy query and cache them; headword
 * lists are already in memory so this adds only tree-node overhead.
 */

export class BKTree {
  private root: BKNode | null = null;
  readonly size: number;

  constructor(words: string[], private indices?: Map<string, number>) {
    this.size = words.length;
    for (let i = 0; i < words.length; i++) {
      this.add(words[i], i);
    }
  }

  add(word: string, idx: number): void {
    if (!this.root) {
      this.root = { word, indices: [idx], children: new Map() };
      return;
    }
    let node = this.root;
    for (;;) {
      const d = levenshteinBounded(word, node.word, Infinity);
      if (d === 0) {
        node.indices.push(idx);
        return;
      }
      const child = node.children.get(d);
      if (!child) {
        node.children.set(d, { word, indices: [idx], children: new Map() });
        return;
      }
      node = child;
    }
  }

  /** All words within `tolerance` edit distance of `query` */
  search(query: string, tolerance: number, limit = 20): Array<{ word: string; index: number; distance: number }> {
    if (!this.root) return [];
    const out: Array<{ word: string; index: number; distance: number }> = [];
    // BK property: a child at edge distance e from node can contain a match only
    // if |d(query, node) - e| <= tolerance. Use the TRUE distance (no aggressive
    // cutoff) so the band invariant holds; common-prefix trimming keeps it fast.
    const walk = (node: BKNode): void => {
      const d = levenshteinBounded(query, node.word, Infinity);
      if (d <= tolerance) {
        for (const idx of node.indices) {
          out.push({ word: node.word, index: idx, distance: d });
          if (out.length >= limit * 3) return;
        }
      }
      for (const [edge, child] of node.children) {
        if (Math.abs(d - edge) <= tolerance) {
          walk(child);
          if (out.length >= limit * 3) return;
        }
      }
    };
    walk(this.root);
    out.sort((a, b) => a.distance - b.distance);
    return out.slice(0, limit);
  }
}

interface BKNode {
  word: string;
  indices: number[];
  children: Map<number, BKNode>;
}

/** Levenshtein with early cutoff */
export function levenshteinBounded(a: string, b: string, maxDist: number): number {
  if (a === b) return 0;
  // trim common prefix/suffix — makes uncapped tree walks cheap
  let s = 0;
  const minLen = Math.min(a.length, b.length);
  while (s < minLen && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  a = a.slice(s, ea);
  b = b.slice(s, eb);
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  let prev = new Uint16Array(lb + 1);
  let curr = new Uint16Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1; // early cutoff
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[lb];
}
