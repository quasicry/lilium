// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — global HTML sanitizer for dictionary content.
 *
 * Dictionary articles are third-party HTML (MDX/StarDict/XDXF/dictd) and may
 * contain scripts, external references or event handlers. We render into a
 * sandboxed iframe *and* pre-sanitize here for defense in depth.
 */

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'acronym', 'address', 'area', 'article', 'aside', 'b', 'bdi', 'bdo',
  'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del',
  'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'kbd',
  'li', 'main', 'mark', 'nav', 'ol', 'p', 'picture', 'pre', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'section', 'small', 'span', 'strike', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr',
  'u', 'ul', 'var', 'wbr', 'font', 'center', 'big', 'tt',
  // XDXF semantic tags rendered to HTML before sanitization
]);

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'srcset', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan',
  'class', 'id', 'style', 'dir', 'lang', 'align', 'valign', 'border', 'cellpadding',
  'cellspacing', 'bgcolor', 'color', 'face', 'size', 'start', 'type', 'target',
  'coords', 'shape', 'span', 'loading', 'decoding',
  // 原位發音根治：音頻連結攜原始資源路徑（宿主側點擊直呼管線，免 app:// 正則還原）
  'data-li-snd',
]);

const URL_ATTRS = new Set(['href', 'src', 'srcset', 'background']);

function safeUrl(value: string): string | null {
  // 先剝除全部 C0 控制字元與空白再測 scheme：HTML 屬性值中的 tab/LF/CR
  // 會被瀏覽器 URL 解析剝除（'jav\tascript:' ⇒ javascript:），黑名單錨定
  // 開頭就會被中間插空白繞過；剝除後的 v 才是瀏覽器實際看到的 scheme 形態。
  // （srcset 由調用端逐候選拆分後各自過本函數，見 processAttrs。）
  // eslint-disable-next-line no-control-regex -- C0 剝除是本函數職責本身
  const v = value.replace(/[\u0000-\u0020]+/g, "");
  if (/^(javascript|data\s*:\s*text\/html|vbscript):/i.test(v)) return null;
  if (/^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(v)) return v;
  // data:image/svg+xml 一律拒（fail-closed）：SVG 可攜 script/外部引用，img 內嵌雖
  // 理論沙箱，但 WebView 行為依平台不可證（移動端尤甚）——縱深防禦不賭沙箱。
  // 資產目錄的 .svg 圖走 readBinary 內聯通路（view.ts inlineData），不經本函數，不受影響。
  if (/^data:image\/svg/i.test(v)) return null;
  return v;
}

/** Sanitize an HTML string. Uses DOMParser; returns safe HTML. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // remove whole dangerous elements
  doc.querySelectorAll('script,style,iframe,object,embed,form,base,meta,link').forEach((el) => {
    el.remove();
  });

  // walk all elements and filter attributes
  doc.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    // html/head 元素是 DOMParser 自建的文檔骨架（body 的祖先）——拍平/移除會連帶
    // 摧毀 body 使下方 doc.body.innerHTML 拋 null（TEI Lex-0 條目實錘）。
    // 內容裡不應出現它們；即使出現也無屬性外溢風險，跳過即可。
    if (tag === 'html' || tag === 'head' || tag === 'body') return;
    // remove any element with suspicious tag names that survived (e.g. <applet>)
    if (!ALLOWED_TAGS.has(tag)) {
      // unwrap: replace with children
      const parent = el.parentElement;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      } else {
        el.remove();
      }
      return;
    }
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      // strip all event handlers
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (!ALLOWED_ATTRS.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRS.has(name)) {
        // srcset 語法＝逗號分隔多組「URL descriptor」——整值只檢第一個 URL
        // 會放行後續候選（^ 錨定），逐候選拆分各自過 safeUrl。
        if (name === 'srcset') {
          const candidates = attr.value.split(',');
          let bad = false;
          const checked = candidates.map((c) => {
            const url = c.trim().split(/\s+/)[0] || '';
            if (!url || safeUrl(url) === null) { bad = true; return c; }
            return c;
          });
          if (bad) { el.removeAttribute(attr.name); continue; }
          el.setAttribute(attr.name, checked.join(','));
          continue;
        }
        const safe = safeUrl(attr.value);
        if (safe === null) {
          el.removeAttribute(attr.name);
        } else {
          el.setAttribute(attr.name, safe);
        }
      }
      // style 值禁止 url() 與 expression()——防遠端載入
      // （隱私/追蹤：style 內 url() 可觸發遠端請求）。含任一即整體剝除該
      // style 屬性（fail-closed：inline style 僅裝飾用途，誤殺代價低）。
      // 此前僅剝除 url(javascript:…)，現擴大為任何 url( 。
      if (name === 'style' && /expression\s*\(|url\s*\(/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return doc.body.innerHTML;
}

/**
 * ③ MDX 內嵌 <style> 注入 frame head：抽出條目 HTML 內全部 <style> 的 CSS 文本
 * （逐塊拼接），供渲染層注入 srcdoc iframe 的 <head>；原 <style> 元素隨後仍由
 * sanitizeHtml 統一剝除。匯出筆記路徑（note-builder）不調用本函數——維持剝除。
 * 防注入：抽出的 CSS 剝 </style 斷序列（防提前閉合注入 head），其餘原樣。
 */
export function extractStyleBlocks(html: string): { html: string; css: string } {
  const chunks: string[] = [];
  const stripped = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css: string) => {
    chunks.push(sanitizeCssRemote(css.replace(/<\/?style/gi, '')));
    return '';
  });
  return { html: stripped, css: chunks.join('\n') };
}

/**
 * B1：抽出的 inline CSS 遠端 URL 過濾——與 sanitizeHtml style 屬性同源的
 * fail-closed 語義：
 *  - @import 一律剝除（含 @import url(...) 與 @import "…" 兩形；遠端字體/CSS
 *    引入可觸發第三方請求，誤殺代價低）。
 *  - url() 內 http(s):// 剝成 none；相對路徑/data:/app: 保留（資源內聯通路負責）。
 */
export function sanitizeCssRemote(css: string): string {
  let out = css.replace(/@import\b[^;]*;?/gi, '');
  out = out.replace(/url\s*\(\s*(['"]?)\s*(https?:\/\/[^)'"]+)\1\s*\)/gi, 'none');
  return out;
}

/** Sanitize for use in a text node context (attribute values etc.) */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
