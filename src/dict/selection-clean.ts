// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — selection sanitizing for PDF/highlight sources.
 * Ported from popup-dictionary-hata main.js _pdfNormalize (MIT-style cleanup):
 * NUL/zero-width removal, U+2010 hyphen normalization, soft-hyphen line-break
 * de-hyphenation, NFKC ligature folding, and a heuristic for glyph-positioned
 * PDFs (fragment sizing decides whether to join with or without spaces).
 */

// eslint-disable-next-line no-control-regex, no-misleading-character-class -- 不可見字符清洗必需＋顯式碼點集合誤報。
const INVISIBLE = /[\x00\u200b\u200c\u200d\u2060\ufeff]/g;

/** Normalize one line/fragment: invisibles, hyphens, ligatures. */
export function normalizeFragment(s: string): string {
  let out = s
    .replace(INVISIBLE, '')
    .replace(/\u2010|\u2011/g, '-') // hyphen variants → ASCII hyphen
    .replace(/\u00ad/g, ''); // soft hyphen
  // NFKC folds ligatures ﬁ→fi, ﬂ→fl, ﬀ→ff, ﬃ→ffi, ﬄ→ffl and full-width forms
  out = out.normalize('NFKC');
  return out;
}

/**
 * Clean a selection that may come from a PDF:
 *  - remove invisibles & hyphen variants
 *  - rejoin words broken across lines by soft/regular hyphens
 *  - collapse whitespace
 */
export function cleanSelection(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n?/g, '\n');
  text = normalizeFragment(text);

  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length <= 1) {
    return text.replace(/\s+/g, ' ').trim();
  }

  // rejoin lines: if a line ends with '-', join the next line without space
  let joined = '';
  let noSpaceNext = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (
      next !== undefined &&
      /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]-$/.test(line) && // ends with hyphen after a letter
      /^[a-z\u00e0-\u024f\u0370-\u03ff\u0400-\u04ff]/.test(next) && // next starts lowercase (mid-word break)
      line.length > 1
    ) {
      joined += line.slice(0, -1); // de-hyphenate; next line joins without space
      noSpaceNext = true;
      continue;
    }
    if (joined && !noSpaceNext) joined += ' ';
    joined += line;
    noSpaceNext = false;
  }
  // fix artifacts: "exampl es" style splits are NOT fixable generically; but
  // hyphen-joined words already merged above.
  joined = joined.replace(/\s+/g, ' ').trim();
  return joined;
}

/**
 * Heuristic from hata: when fragments look like glyph-positioned PDF output
 * (most fragments ≤2 chars), text should be joined WITHOUT spaces.
 */
export function shouldJoinWithoutSpaces(fragments: string[]): boolean {
  if (!fragments.length) return false;
  if (fragments.length < 4) return false;
  const tiny = fragments.filter((f) => f.length <= 2).length;
  return tiny / fragments.length >= 0.7;
}

/** Decide if a selection spans multiple real lines using selection rect geometry */
export function isRealMultiLineSelection(rects: Array<{ top: number; height: number }>): boolean {
  if (rects.length === 0) return false;
  const maxH = Math.max(...rects.map((r) => r.height));
  const minTop = Math.min(...rects.map((r) => r.top));
  const maxBottom = Math.max(...rects.map((r) => r.top + r.height));
  // taller than 1.9× the largest glyph line-height ⇒ multiple lines
  return maxBottom - minTop > maxH * 1.9;
}
