// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — CSS isolation via selector prefixing.
 * Port of GoldenDict\'s isolateCSS (dictionary.cc:280): prefixes every selector
 * with a scope id so multiple dictionaries\' styles can coexist on one page.
 * Handles @media (recursive), @font-face/@import (passed through), @page (dropped).
 *
 * 接入消費端。
 *  · 導入期（dict/plugin.ts attachCompanions）：辭典配套 CSS 經本函式作用域化後
 *    才寫進資產目錄，故資產檔裡存的已是帶前綴的版本；
 *  · 渲染期（dict/view.ts fillFrame）：正文包進同 id 的包裹元素，讓前綴命中。
 * 好處：辭典 CSS 只能作用於自己的包裹元素，無法劫持插件的 frame CSS 與
 * body／html／:root 層級樣式。
 * 相容：改版前已導入的詞典，其 CSS 未帶前綴，仍作用於 body 並由包裹元素繼承，
 * 行為與改版前完全一致（只是拿不到隔離收益）——不會有舊詞典樣式失效。
 */

/** 辭典文章的 CSS 作用域 id；導入期與渲染期必須用同一個（故收斂在此）。 */
export function dictScopeId(dictId: string): string {
  return `li-dict-${dictId.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function isolateCSS(css: string, scopeId: string): string {
  const scope = `#${scopeId} `;
  let out = '';
  let i = 0;
  const len = css.length;

  const skipComment = (pos: number): number => {
    const end = css.indexOf('*/', pos);
    return end === -1 ? len : end + 2;
  };

  while (i < len) {
    // skip comments
    if (css.startsWith('/*', i)) {
      i = skipComment(i);
      continue;
    }
    // find next block or at-rule
    const braceIdx = css.indexOf('{', i);
    if (braceIdx === -1) {
      out += css.slice(i);
      break;
    }
    const selector = css.slice(i, braceIdx).trim();

    if (selector.startsWith('@')) {
      const at = selector.split(/\s/)[0].toLowerCase();
      if (at === '@font-face' || at === '@import' || at === '@charset' || at === '@namespace') {
        // pass through whole block/statement
        const end = findMatchingBrace(css, braceIdx);
        out += css.slice(i, end);
        i = end;
        continue;
      }
      if (at === '@page') {
        // drop
        i = findMatchingBrace(css, braceIdx);
        continue;
      }
      if (at === '@media' || at === '@supports' || at === '@layer' || at === '@scope') {
        // recurse into the inner block with same scope
        const end = findMatchingBrace(css, braceIdx);
        const inner = css.slice(braceIdx + 1, end - 1);
        out += selector + '{' + isolateCSS(inner, scopeId) + '}';
        i = end;
        continue;
      }
      // unknown at-rule: pass through
      const end2 = findMatchingBrace(css, braceIdx);
      out += css.slice(i, end2);
      i = end2;
      continue;
    }

    // normal rule: prefix each comma-separated selector
    const end = findMatchingBrace(css, braceIdx);
    const body = css.slice(braceIdx, end); // includes braces
    const scopedSelectors = selector
      .split(',')
      .map((sel) => {
        const t = sel.trim();
        if (!t) return t;
        // 二次前綴防護：
        //  · 已帶 #li-dict- 前綴（重複導入二次 isolate）→ 原樣保留；
        //  · html/body/:root 開頭：body.foo 若整個換成 #scopeId.foo 會把
        //    「後代關係」漂移成「同一元素」——正文包裹元素是 <div id=scopeId>
        //    而非 body，#scopeId.foo 永遠命中不了。改為後代形態
        //    #scopeId body.foo（body 即 iframe 的 <body>，包裹元素是其後代），
        //    純 body/:root 則保持原樣（繼承鏈已覆蓋，見 view.ts 包裹層註釋）。
        if (t.includes('#' + scopeId)) return t;
        const rootM = t.match(/^(html|body|:root)\b/i);
        if (rootM) {
          const rest = t.slice(rootM[0].length);
          if (/^[\s>+~]*$/.test(rest)) return t; // 純 root 選擇器：原樣
          return `#${scopeId} ${t}`;
        }
        return scope + t;
      })
      .join(', ');
    out += scopedSelectors + ' ' + body + ' ';
    i = end;
  }
  return out;
}

function findMatchingBrace(css: string, openBraceIdx: number): number {
  let depth = 0;
  let i = openBraceIdx;
  let inStr: string | null = null;
  while (i < css.length) {
    const ch = css[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return css.length;
}
