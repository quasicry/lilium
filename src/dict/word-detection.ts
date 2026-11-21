// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — multilingual word detection.
 * Ported from ntsiris/obsidian-popup-dictionary wordDetection.ts (MIT):
 * uses Intl.Segmenter (granularity "word") so CJK/Thai/Khmer scripts work
 * without spaces, falling back to a Unicode-property regex when the runtime
 * lacks Segmenter.
 */

export interface WordHit {
  word: string;
  /** character offsets within the source text */
  from: number;
  to: number;
}

interface SegmentData {
  segment: string;
  index: number;
  isWordLike?: boolean;
}
interface SegmenterLike {
  segment(input: string): Iterable<SegmentData>;
}
interface SegmenterCtor {
  new (locales?: string | string[], options?: { granularity?: 'grapheme' | 'word' | 'sentence' }): SegmenterLike;
}

/**
 * 每個 locale 一份 Segmenter（Intl.Segmenter 構造成本高，且按 locale 緩存
 * 才能讓「寫作系統 ⇄ 辭典」聯動在不同文種間即時切換詞界）。
 * key=undefined 表示運行時默認 locale（與舊行爲一致）。
 */
const segmenterCache = new Map<string | undefined, SegmenterLike | null>();

function getSegmenter(locale?: string): SegmenterLike | null {
  if (segmenterCache.has(locale)) return segmenterCache.get(locale)!;
  const ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  let seg: SegmenterLike | null = null;
  if (ctor) {
    try {
      seg = new ctor(locale, { granularity: 'word' });
    } catch {
      // 運行時未裝該 locale 的詞表 → 回退默認 locale，不再拋錯
      try {
        seg = new ctor(undefined, { granularity: 'word' });
      } catch {
        seg = null;
      }
    }
  }
  segmenterCache.set(locale, seg);
  return seg;
}

/** Letters, numbers and combining marks (u flag enables \p escapes) */
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const WORD_EDGE = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

export function normalizeLookupTerm(value: string): string {
  return value.replace(WORD_EDGE, '').trim();
}

/**
 * Expand the character at `offset` (or the whole selection) into a full word.
 * Returns null when the position is not inside a word.
 */
export function getWordAtOffset(text: string, offset: number, locale?: string): WordHit | null {
  if (!text || offset < 0 || offset > text.length) return null;

  const segmenter = getSegmenter(locale);
  if (segmenter) {
    // B3：以鉗制後的 cursor 判段（offset===text.length 時點中最後一段）——
    // cursor 一旦隨走訪被覆寫為段尾，會退化成「上一段尾」判斷，故鉗制值須常駐不變。
    const cursor = Math.min(offset, text.length - 1);
    // walk back to a word-like segment containing the cursor
    const segments = Array.from(segmenter.segment(text));
    for (const seg of segments) {
      const start = seg.index;
      const end = start + seg.segment.length;
      if (cursor >= start && cursor < end) {
        if (seg.isWordLike === false) return null;
        const word = normalizeLookupTerm(seg.segment);
        if (!word) return null;
        const wFrom = start + seg.segment.indexOf(word);
        return { word, from: wFrom, to: wFrom + word.length };
      }
    }
    return null;
  }

  // Fallback: Unicode-aware manual scan for space-delimited scripts
  let start = Math.min(offset, text.length - 1);
  let end = start + 1;
  while (start > 0 && !WORD_CHAR.test(text[start] || '')) start--;
  if (!WORD_CHAR.test(text[start] || '') && !WORD_CHAR.test(text[end] || '')) return null;
  while (start > 0 && WORD_CHAR.test(text[start - 1] || '')) start--;
  while (end < text.length && WORD_CHAR.test(text[end] || '')) end++;
  const word = normalizeLookupTerm(text.slice(start, end));
  if (!word) return null;
  return { word, from: start, to: start + word.length };
}

/** Extract all word-like tokens from a text (for future in-note term marking) */
export function tokenizeText(text: string, locale?: string): string[] {
  const segmenter = getSegmenter(locale);
  if (segmenter) {
    const out: string[] = [];
    for (const seg of segmenter.segment(text)) {
      if (seg.isWordLike !== false) {
        const w = normalizeLookupTerm(seg.segment);
        if (w) out.push(w);
      }
    }
    return out;
  }
  const re = /[\p{L}\p{N}\p{M}]+(?:['’.-][\p{L}\p{N}\p{M}]+)*/gu;
  return text.match(re) || [];
}
