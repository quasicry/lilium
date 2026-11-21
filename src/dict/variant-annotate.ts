import { docCreateEl, docCreateFragment } from "../dom-win";
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 詞條正文異體字標註
 *
 * 用 VARIANT_COMMON（1,003 筆，OpenCC + book-proofreading）把詞條正文裡的
 * 異體字標出來，讓使用者一眼看出「這個字是某個通行字的異體」。
 *
 * ⚠️ 安全約束（這是本檔存在的全部理由）：
 *  詞條 HTML 經過 sanitizeHtml() 消毒後才進來。這裡**絕對不碰 HTML 字串**——
 *  一律用 TreeWalker 走文字節點、用 createElement + textContent 建元素、
 *  用 insertBefore 重排。任何「改 innerHTML 再塞回去」的寫法都會在消毒之後
 *  重新打開一個注入孔，等於把 sanitize 白做了。
 *  所以這裡只有 DOM API，沒有字串拼接。
 */
import { loadVariantCommon } from './data/collation-chars.lazy';

/** 不進去標註的容器：程式碼、樣式、腳本、連結（避免破壞可點性） */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'A', 'TEXTAREA', 'INPUT']);

export interface AnnotateResult {
  /** 標註了幾個字 */
  count: number;
  /** 命中過哪些異體字（去重，供 UI 匯總顯示） */
  found: string[];
}

/**
 * 就地標註（會改變 root 的 DOM 樹）。
 * 冪等：已經在 .li-var 裡的文字節點會被跳過，重複呼叫不會無限增生。
 */
export function annotateVariants(root: HTMLElement, tipFor: (ch: string, common: string) => string): AnnotateResult {
  const map = loadVariantCommon();
  const found = new Set<string>();
  let count = 0;
  // 詞條是渲染在 iframe（srcdoc）裡的，必須用 root 自己的 document 建節點，
  // 否則會把主視窗 document 的節點塞進 iframe（現代瀏覽器會自動 adopt，但明確指定更穩）。
  const doc = root.ownerDocument || document;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      let p: Node | null = node.parentElement;
      while (p) {
        if (p.nodeType === 1) {
          const el = p as HTMLElement;
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          if (el.classList?.contains('li-var')) return NodeFilter.FILTER_REJECT;
        }
        p = p.parentElement;
      }
      // 只要這個節點裡有任一字是異體字就接受
      for (const ch of node.nodeValue) if (map[ch] && map[ch] !== ch) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_REJECT;
    },
  });

  // 先收集再改動：TreeWalker 在遍歷期間修改樹會漏掉節點
  const targets: Text[] = [];
  let cur = walker.nextNode();
  while (cur) {
    targets.push(cur as Text);
    cur = walker.nextNode();
  }

  for (const textNode of targets) {
    const src = textNode.nodeValue || '';
    const frag = docCreateFragment(doc);
    let buf = '';
    const flush = () => {
      if (!buf) return;
      frag.appendChild(doc.createTextNode(buf));
      buf = '';
    };
    for (const ch of src) {
      const common = map[ch];
      if (common && common !== ch) {
        flush();
        const span = docCreateEl(doc, "span");
        span.className = 'li-var';
        span.textContent = ch;               // ← textContent，不是 innerHTML
        span.setAttribute('data-tip', tipFor(ch, common));
        span.setAttribute('data-common', common);
        frag.appendChild(span);
        found.add(ch);
        count++;
      } else {
        buf += ch;
      }
    }
    flush();
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return { count, found: [...found] };
}
