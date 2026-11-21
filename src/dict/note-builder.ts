// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — lookup → note/flashcard export.
 * Inspired by dictionary-plus's flashcards.ts (SR markers compatible with the
 * Obsidian Spaced Repetition plugin) and phibr0's LocalDictionaryBuilder.
 */

export interface FlashcardOptions {
  /** enable <!--SR:--> markers for the Spaced Repetition plugin */
  spacedRepetition: boolean;
  initialInterval: number;
  initialEase: number;
}

export const DEFAULT_FLASHCARD_OPTIONS: FlashcardOptions = {
  spacedRepetition: true,
  initialInterval: 3,
  initialEase: 250,
};

export interface NoteBuildInput {
  word: string;
  hits: Array<{ dictName: string; html: string; keyText: string }>;
  /** strip HTML to plain markdown-ish text */
  htmlToMarkdown: (html: string) => string;
}

/** Build `word::answer` flashcard lines (SR-marker compatible) */
export function buildFlashcardLines(
  input: NoteBuildInput,
  options: Partial<FlashcardOptions> = {},
): string[] {
  const opts = Object.assign({}, DEFAULT_FLASHCARD_OPTIONS, options);
  const lines: string[] = [];
  const marker = opts.spacedRepetition
    ? `<!--SR:!${new Date().toISOString().slice(0, 10)}!${opts.initialInterval}!0!${opts.initialEase}-->\n`
    : '';
  for (const hit of input.hits) {
    const answer = input
      .htmlToMarkdown(hit.html)
      .replace(/\s+/g, ' ')
      .replace(/::/g, '\\::')
      .trim()
      .slice(0, 600);
    if (!answer) continue;
    lines.push(`${input.word} — ${hit.dictName}::${answer}${opts.spacedRepetition ? ' ' + marker.trimEnd() : ''}`);
  }
  return lines;
}

/** Build a full markdown note for a lookup */
export function buildLookupNote(input: NoteBuildInput): string {
  const { word, hits, htmlToMarkdown } = input;
  // 樣式渲染分支：htmlToMarkdown 為恒等（view 傳入 styled html 已 inline 化）時直接嵌 HTML——
  // Obsidian 筆記 sanitize <style>/<link>，inline style 是唯一雙視圖存活載體。
  const identity = htmlToMarkdown === identityHtml;
  const out: string[] = [];
  out.push(`---`);
  out.push(`word: ${yamlSafe(word)}`);
  out.push(`created: ${new Date().toISOString()}`);
  out.push(`sources: [${Array.from(new Set(hits.map((h) => h.dictName))).map(yamlSafe).join(', ')}]`);
  out.push(`---`);
  out.push('');
  out.push(`# ${word}`);
  out.push('');
  let lastDict = '';
  for (const hit of hits) {
    if (hit.dictName !== lastDict) {
      out.push(`## ${hit.dictName}`);
      out.push('');
      lastDict = hit.dictName;
    }
    if (identity) {
      out.push(hit.html);
    } else {
      out.push(htmlToMarkdown(hit.html));
    }
    out.push('');
  }
  return out.join('\n');
}

/** Minimal HTML → Markdown for common dictionary markup */
export function htmlToMarkdownBasic(html: string): string {
  let md = html;
  md = md.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  md = md.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  // images → markdown
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, (_m, src) => `![](${src})`);
  // audio refs → link
  md = md.replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, ' 🔊 ');
  // headings
  md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m: string, l: string, t: string) => `\n${'#'.repeat(Number(l))} ${strip(t)}\n`);
  // list items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, t: string) => `\n- ${strip(t)}`);
  // bold/italic
  md = md.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, (_m: string, _t: string, c: string) => `**${strip(c)}**`);
  md = md.replace(/<(i|em)[^>]*>([\s\S]*?)<\/\1>/gi, (_m: string, _t: string, c: string) => `*${strip(c)}*`);
  // br / p / div → newlines
  md = md.replace(/<br\s*\/?>/gi, '\n');
  // ⑤ 表格 → Markdown table：先於通用剝標籤處理 tr/td/th（含表頭分隔行）。
  // 邊角保底：跨行（rowspan/嵌套塊級）單元格內容拍平為單行文本；單元格內
  // 豎線轉義防破表。無 <th> 時以首行充當表頭（MD 表格必須有分隔行）。
  md = md.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_m, tbl: string) => {
    const rows: string[][] = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(tbl))) {
      const cells: string[] = [];
      const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1]))) {
        // 拍平單元格：剝標籤、實體還原、壓縮空白、轉義豎線
        const flat = cm[3]
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\|/g, '\\|')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(flat);
        // C1：colspan 補空欄——MD 表格無合併儲存格語義，跨欄格補等量空欄對齊列寬
        const span = Math.max(1, Math.min(64, parseInt((cm[2].match(/colspan\s*=\s*"?(\d+)/i) || [])[1] || '1', 10) || 1));
        for (let s = 1; s < span; s++) cells.push('');
      }
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return '\n' + strip(tbl) + '\n'; // 無法成表 → 拍平保底
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]) => { while (r.length < width) r.push(''); return r; };
    const [head, ...body] = rows.map(pad);
    const sep = Array.from({ length: width }, () => '---').join(' | ');
    const line = (r: string[]) => `| ${r.join(' | ')} |`;
    return '\n' + line(head) + '\n' + sep + '\n' + body.map(line).join('\n') + '\n';
  });
  md = md.replace(/<\/(p|div|tr|h[1-6]|blockquote)>/gi, '\n');
  // P2-5：ruby → 漢(注音)；sup/sub → Obsidian MD 慣例 ^x^ / ~x~（先於通用剝標籤）
  md = md.replace(/<ruby[^>]*>([\s\S]*?)<\/ruby>/gi, (_m, inner: string) => {
    // C2：前置 fallback——無 <rt> 捕獲時 base 不帶 rt 殘塊（先剝 <rt>…</rt> 整塊）
    const rtM = inner.match(/<rt\b[^>]*>([\s\S]*?)<\/rt>/i);
    const base = (rtM ? inner.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/i, '') : inner)
      .replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, '')
      .replace(/<[^>]+>/g, '').trim();
    const rt = (rtM?.[1] || '').replace(/<[^>]+>/g, '').trim();
    return rt ? `${base}(${rt})` : base;
  });
  md = md.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_m, t: string) => `^${t.replace(/<[^>]+>/g, '').trim()}^`);
  md = md.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_m, t: string) => `~${t.replace(/<[^>]+>/g, '').trim()}~`);
  // strip remaining tags
  md = md.replace(/<[^>]+>/g, '');
  md = md
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  md = md.replace(/[ \t]+/g, ' ');
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

/** 恒等轉換（styled html 直嵌筆記的標記函數）。 */
export function identityHtml(html: string): string {
  return html;
}

/** B10：frontmatter YAML 值含 [:,[],] 特殊字元時雙引號包裹＋內部雙引號轉義 */
function yamlSafe(v: string): string {
  return /[:,[,]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

/**
 * 廣韻 MDX 詞條匯出筆記的塊級歸位（序號跑位＋序號1 換行修復）。
 * 真機實錘（Obsidian 預覽風.md）：MDX 詞條原文在序號錨點前後散佈 `<link href="廣韻.css">`
 * 與空錨點行，Obsidian 的 HTML 塊切分點隨 `<link>`/空行飄移——序號1 段被切成獨立
 * el-p（橢圓掉到段內第二行＝與內容換行），序號2 起錨點行被併進上一條詞條內容塊
 * （橢圓與自己的音標/釋義脫鉤＝跑位）。
 * 修法（確定性後處理，只影響筆記匯出，面板渲染不受影響）：
 * ①剝 `<link …>`（CSS 已 inline 化，Obsidian 亦 sanitize 此標籤，殘留只壞塊切分）；
 * ②按序號錨點 `<a name="_hkqN">` 把每條詞條包進獨立 `<div>`——序號必然塊首、
 *   與後續音標/釋義同塊同行。
 */
export function normalizeEntryBlocks(html: string): string {
  let out = html.replace(/<link\b[^>]*>/gi, '');
  const re = /<a\s+[^>]*name="_hkq\d+"[^>]*>/gi;
  const marks: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) marks.push(m.index);
  if (marks.length >= 2) {
    const parts: string[] = [out.slice(0, marks[0])];
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1] : out.length;
      parts.push(`<div class="li-gy-entry">${out.slice(marks[i], end)}</div>`);
    }
    // 塊間以空行分隔——單 \n 時 Obsidian 把相鄰 li-gy-entry 視為
    // 同一 HTML 塊（CommonMark type-6 塊止於空行），序號 2 起的條目 div 緊貼上一條
    // 內容，部分環境（字體/縮放/移動端 WebView）下序號錨點不在塊首而跑位。
    // 空行分隔後每條詞條為獨立 HTML 塊，序號必然塊首＝所屬內容行首。
    out = parts.join('\n\n');
  }
  return out;
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}
