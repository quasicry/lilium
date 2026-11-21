// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — DOM point → word detection.
 * Companion to word-detection.ts: converts a viewport coordinate into a word
 * via caretRangeFromPoint (Chromium) / caretPositionFromPoint (Firefox),
 * then Intl.Segmenter word-boundary expansion (ntsiris wordDetection pattern).
 */

export interface DomWordHit {
  word: string;
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  /** 詞所在的 DOM 元素；供直排上下文判定（lilium 座標服務接入，見 vertical-anchor.ts） */
  element?: HTMLElement | null;
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
 * 每個 locale 一份 Segmenter（與 word-detection.ts 同源緩存策略）。
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

const WORD_EDGE = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

function normWord(s: string): string {
  return s.replace(WORD_EDGE, '').trim();
}

function caretRangeFromPoint(doc: Document, x: number, y: number): { node: Node; offset: number } | null {
  const anyDoc = doc as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof anyDoc.caretRangeFromPoint === 'function') {
    const r = anyDoc.caretRangeFromPoint(x, y);
    if (r && r.startContainer.nodeType === Node.TEXT_NODE) {
      return { node: r.startContainer, offset: r.startOffset };
    }
    return null;
  }
  if (typeof anyDoc.caretPositionFromPoint === 'function') {
    const p = anyDoc.caretPositionFromPoint(x, y);
    if (p && p.offsetNode.nodeType === Node.TEXT_NODE) return { node: p.offsetNode, offset: p.offset };
    return null;
  }
  return null;
}

/** Word + its client rect at a viewport point, or null */
export function getWordAtOffsetFromPoint(doc: Document, x: number, y: number, locale?: string): DomWordHit | null {
  const pos = caretRangeFromPoint(doc, x, y);
  if (!pos) return null;
  const textNode = pos.node as Text;
  const text = textNode.textContent || '';
  if (!text) return null;

  const segmenter = getSegmenter(locale);
  let word: string | null = null;

  if (segmenter) {
    for (const seg of segmenter.segment(text)) {
      const start = seg.index;
      const end = start + seg.segment.length;
      // include the "cursor at word end" boundary case (ntsiris :80-94)
      const inside = pos.offset >= start && pos.offset < end;
      const atEnd = pos.offset === end && end > start;
      if (inside || atEnd) {
        if (seg.isWordLike === false) return null;
        word = normWord(seg.segment);
        break;
      }
    }
  } else {
    // fallback scan
    let start = pos.offset;
    let end = pos.offset;
    if (!WORD_CHAR.test(text[start] || '') && !WORD_CHAR.test(text[start - 1] || '')) return null;
    while (start > 0 && WORD_CHAR.test(text[start - 1] || '')) start--;
    while (end < text.length && WORD_CHAR.test(text[end] || '')) end++;
    word = normWord(text.slice(start, end));
  }

  if (!word) return null;

  // measure the word's rect via a temporary range
  const idx = text.toLowerCase().indexOf(word.toLowerCase());
  if (idx < 0) return null;
  const range = doc.createRange();
  try {
    range.setStart(textNode, idx);
    range.setEnd(textNode, idx + word.length);
  } catch {
    return null;
  }
  const rects = range.getClientRects();
  const r = rects.length ? rects[0] : range.getBoundingClientRect();
  if (!r || (!r.width && !r.height)) return null;
  return {
    word,
    rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
    // lilium: 直排上下文判定需要真實元素（writing-mode 可能宣告在任何祖先層）
    element: (textNode.parentElement) ?? null,
  };
}
