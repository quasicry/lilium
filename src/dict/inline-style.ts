// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * MDX 詞條複製樣式內聯——「複製到筆記」帶樣式。
 *
 * 背景：MDX 辭典（廣韻等）條目樣式全在 MDD 附屬 CSS（如 廣韻.css），正文僅 class 引用。
 * Obsidian 筆記 sanitize <link>/<style>，class 離開面板 iframe 即無樣式來源；
 * **唯一在筆記編輯＋閱讀雙視圖存活的樣式載體＝inline style 屬性**。
 *
 * 原理：把辭典配套 CSS 解析成（選擇器末段 class/id → 聲明塊）映射，DOMParser 展開
 * 為每個元素的 inline style；僅支援廣韻.css 這類簡單格式（.cls/#id/元素+單鏈後代，
 * color/background/font 系屬性），偽類/媒體查詢放棄。資源 URL 由調用方先行改寫。
 * 黑系硬編色在夜間模式下洗為 inherit（複製體不做主題探測，保守保留原色）。
 */

export interface CssRuleEntry {
  /** 選擇器末段類名（.zr → zr）；無類的元素選擇器用 tag 名 */
  key: string;
  byClass: boolean;
  decls: string;
}

/** 解析簡單 CSS：僅取 {} 規則塊，選擇器以逗號拆分；偽類/媒體/導入整條丟棄。 */
export function parseSimpleCss(css: string): CssRuleEntry[] {
  const out: CssRuleEntry[] = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(\{[^{}]*\}|[^{}])*\}/g, '').replace(/@import[^;]+;/g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    const sel = m[1].trim();
    const decls = m[2].replace(/\s+/g, ' ').trim();
    if (!sel || !decls || /(:|@|>|\+|~|\[)/.test(sel)) continue;
    for (const raw of sel.split(',')) {
      const parts = raw.trim().split(/\s+/);
      const last = parts[parts.length - 1] || '';
      const cls = /\.([A-Za-z0-9_-]+)/.exec(last);
      const tag = /^([a-zA-Z][a-zA-Z0-9]*)$/.exec(last);
      if (cls) out.push({ key: cls[1], byClass: true, decls });
      else if (tag) out.push({ key: tag[1].toLowerCase(), byClass: false, decls });
    }
  }
  return out;
}

/**
 * 展開：html 字串 → 每元素 inline style（合并已有 style；CSS 聲明在前、原 style 在後＝原樣優先）。
 * 返回展開後的 body innerHTML。解析失敗（空規則/解析異常）原樣返回。
 */
export function inlineStyles(html: string, cssList: string[]): string {
  try {
    const entries = cssList.flatMap((c) => parseSimpleCss(c));
    if (!entries.length) return html;
    const doc = new DOMParser().parseFromString(`<div id="li-is-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('li-is-root');
    if (!root) return html;
    const els = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const el of els) {
      const matched = entries.filter(
        (e) =>
          (e.byClass && el.classList.contains(e.key)) ||
          (!e.byClass && el.tagName.toLowerCase() === e.key),
      );
      const prior = el.getAttribute('style');
      // inline-block＋固定高但無 line-height 的徽章（廣韻 .zr 序號等）——
      // 桌面有 Calibri 行盒恰填滿；移動端 fallback 字體行高 normal>height，數字基線
      // 隨字體 ascent 漂移跑出橢圓。補 line-height=height 鎖死行盒，任何字體皆居中。
      // line-height=height 仍不夠——小圓徽章（height≤24px）內 FONT-SIZE
      // 大於內容高時（廣韻 .zr：12pt=16px 字、內容高 10px），glyph ink 依字體 ascent/descent
      // 撐滿行盒，Calibri 小 x-height 掩蓋問題，CJK 等 fallback 字體數字視覺貼底/溢出橢圓。
      // 改幾何居中：inline-flex＋align/justify center＋padding 歸零＋字號壓至 height×0.625，
      // 不依賴任何字體度量；!important 同級後位聲明覆寫 prior 的 PADDING-*/FONT-SIZE。
      const styleText = `${matched.map((e) => e.decls).join(';')};${prior || ''}`;
      if (/inline-block/i.test(styleText) && !/(^|;)\s*line-height\s*:/i.test(styleText)) {
        const h = /(?:^|;)\s*(?!line-|min-|max-)(?:height|HEIGHT)\s*:\s*(\d+(?:\.\d+)?)(px|pt)?\s*(?:;|$)/.exec(styleText);
        if (h) {
          const px = h[2] === 'pt' ? Math.round(parseFloat(h[1]) * 96 / 72) : parseFloat(h[1]);
          matched.push({ key: '', byClass: true, decls: `line-height:${px}px` });
          // 小圓徽章：字號大於內容高者改 flex 幾何居中（廣韻序號橢圓跑位根修）
          if (px <= 24 && /border-radius/i.test(styleText)) {
            matched.push({
              key: '',
              byClass: true,
              decls: `display:inline-flex;align-items:center;justify-content:center;padding:0;line-height:1;font-size:${Math.round(px * 0.625)}px !important`,
            });
          }
        }
      }
      if (!matched.length) continue;
      const add = matched.map((e) => e.decls).join(';');
      el.setAttribute('style', prior ? `${add};${prior}` : add);
    }
    return root.innerHTML;
  } catch {
    return html;
  }
}

/** 深色系判定（供 B 洗色共用）：sRGB 亮度 < 0.45 視為深色系硬編。 */
export function isDarkColor(color: string): boolean {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  if (!m) return false;
  const [r, g, b] = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] < 0.45;
}
