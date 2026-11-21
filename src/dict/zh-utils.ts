// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — Chinese text utilities.
 *
 * Features ported from MDict PC (closed-source, mdict.cn) behavior level:
 *  - To Simplified / To Traditional Chinese view conversion (menu: Chinese Conversion)
 *    — data from OpenCC TSCharacters/STCharacters (Apache-2.0), char-level.
 *  - "Fix Chinese Line Wrap" — MDict repairs hard-wrapped CJK text in entries;
 *    we join a CJK char that is followed by a newline + more CJK (not a layout
 *    boundary) so wrapped entries render as flowing text.
 * Both are pure string transforms applied before sanitize/render.
 */
// 懶載入
import { loadZhT2s, loadZhS2t } from './data/zh-convert.lazy';

export type ZhConvertMode = 'none' | 't2s' | 's2t';

function mapChars(text: string, map: Record<string, string>): string {
  let out = '';
  for (const ch of text) {
    out += map[ch] || ch;
  }
  return out;
}

/** Traditional → Simplified (MDict "To Simplified Chinese") */
export function toSimplified(text: string): string {
  return mapChars(text, loadZhT2s());
}

/** Simplified → Traditional (MDict "To Traditional Chinese") */
export function toTraditional(text: string): string {
  return mapChars(text, loadZhS2t());
}

/** Apply a conversion mode to HTML/text */
export function convertChinese(text: string, mode: ZhConvertMode): string {
  if (mode === 't2s') return toSimplified(text);
  if (mode === 's2t') return toTraditional(text);
  return text;
}

const CJK = /[\u2e80-\u2fdf\u3000-\u303f\u31c0-\u31ef\u3200-\u32ff\u3300-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff66-\uff9f\u{20000}-\u{2ebef}\u{2f800}-\u{2fa1f}]/u;

/**
 * MDict "Fix Chinese Line Wrap": join CJK runs broken by hard newlines or <br>.
 * - <br> between CJK on both sides → removed (hard-wrap artifact in mdx entries)
 * - newline inside a text node between CJK on both sides → removed
 * - fullwidth comma allows joining (mid-sentence); sentence enders keep the break
 * - never joins across structural tags (</p>, <div>…) or after sentence enders
 */
export function fixChineseLineWrap(html: string): string {
  const leftCore = `${CJK.source}|[，,]`;
  const skipJoin = (a: string) => '。！？；：、》」』）】…'.includes(a);

  // Pass 1: <br> (with optional surrounding whitespace) between CJK-ish chars
  // (String.raw keeps CJK.source's \u{...} escapes intact for the RegExp ctor)
  let out = html.replace(
    new RegExp(String.raw`(${leftCore})((?:\s*<br\s*/?>\s*)+)(?=${CJK.source})`, 'giu'),
    (m: string, a: string) => (skipJoin(a) ? m : a),
  );

  // Pass 2: bare newlines inside text nodes (CJK on both sides)
  out = out.replace(
    /([^<>{}]+)(<[^>]+>|$)/g,
    (whole: string, text: string, tail: string) => {
      const fixed = text.replace(
        new RegExp(`(${leftCore})(?:\\r?\\n)+(${CJK.source})`, 'gu'),
        (m2: string, a: string, b: string) => (skipJoin(a) ? m2 : a + b),
      );
      return fixed + tail;
    },
  );
  return out;
}
