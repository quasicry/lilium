/**
 * CBETA TEI P5 經文 → TEI Lex-0 辭典轉換核心（bundle 內用）。
 *
 * CBETA xml-p5/xml-p5a 是 TEI P5 文獻編碼（經文全文），非辭典格式；本模塊把
 * 經文段落合成詞頭轉成 lilium 可導入的 Lex-0（<entry> 結構）。分層詞頭：
 *   L1 卷層   —「經名·卷N」整卷一條
 *   L2 段層   —「經名¶卷N§K」卷內第 K 段一條（<p>；<lg> 偈頌併入所在段）
 *   L3 偈頌層 —「經名¶偈頌§K」整首 <lg> 一條
 * 合成碼 ¶/§ 避免與真實經文用字衝突。校注（note）p5 經文全在 standOff 區、
 * body 內零 note（p5/p5a 樣本實勘），正文只剝 anchor 標記即可。
 * 異文 <app><lem> 取底本讀法；<g ref> 透傳——reader 端自動解 charDecl 碼位，
 * 本模塊不處理 gaiji。與 tools/cbeta2lex0.mjs（CLI）同管線，兩路線共用。
 */

/** 詞頭層級。 */
export type CbetaLevel = 1 | 2 | 3;

export interface CbetaConvertOptions {
  /** 詞頭層級（默認全部三層）。 */
  levels?: number[];
  /** 每批段落轉換後讓幀（分幀防凍 UI）；不傳＝同步一次性完成。 */
  yieldFn?: () => Promise<void>;
  /** 進度回調（done／total 段）。 */
  onProgress?: (done: number, total: number) => void;
  /** 中止信號——回傳 true 即停止（已轉換部分仍回傳）。 */
  shouldAbort?: () => boolean;
}

export interface CbetaConvertResult {
  /** Lex-0 XML 全文（可直接 new File 餵 importDictFiles）。 */
  xml: string;
  /** 條目數。 */
  entryCount: number;
  /** 經名（取 teiHeader title level="m"）。 */
  title: string;
  /** 中止與否（中止時 xml 為已轉換部分）。 */
  aborted: boolean;
}

const escXml = (s: string): string =>
  s.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** TEI → 純文本清洗（單段 XML → 可讀經文）。 */
export function cleanSegment(xml: string): string {
  return xml
    // 異文：取 lem 底本讀法，rdg 棄（校勘結構不進辭典正文）
    .replace(/<app\b[^>]*>[\s\S]*?<lem\b[^>]*>([\s\S]*?)<\/lem>[\s\S]*?<\/app>/g, '$1')
    // 校注/引文註（body 內若有）剝除
    .replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '')
    // 版面標記剝除
    .replace(/<lb\b[^>]*\/>/g, '')
    .replace(/<pb\b[^>]*\/>/g, '')
    .replace(/<cb\b[^>]*\/>/g, '')
    .replace(/<anchor\b[^>]*\/>/g, '')
    .replace(/<space\b[^>]*\/>/g, ' ')
    // 偈頌行邊界→空格（詞條正文不分行的可讀性）
    .replace(/<\/l>/g, ' ')
    // 其餘標籤拍平（<g ref> 保留＝reader 端解字）
    .replace(/<\/?(?!g[\s>])[a-zA-Z][^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Segment {
  tag: 'p' | 'lg';
  xml: string;
}

/** 從 TEI 文本抽經文結構（卷→段→偈頌）。 */
export function parseSutra(xml: string): { title: string; juanNo: string; charDecl: string; segments: Segment[]; lgs: Segment[] } {
  const title = xml.match(/<title level="m"[^>]*>([^<]+)<\/title>/)?.[1]?.trim() || '未知經';
  const juanNo = xml.match(/<cb:juan\b[^>]*\bn="([^"]*)"/)?.[1] || '1';
  const bodyStart = xml.indexOf('<body>');
  const bodyEnd = xml.lastIndexOf('</body>');
  if (bodyStart < 0 || bodyEnd < 0) throw new Error('no <body> — not a TEI text?');
  const body = xml.slice(bodyStart + 6, bodyEnd);
  const charDecl = xml.match(/<charDecl>[\s\S]*?<\/charDecl>/)?.[0] || '';

  // 頂層 <p>／<lg> 配對掃描（同型嵌套由計數保證；嵌套 <lg> 留給段落文本拍平）。
  const segments: Segment[] = [];
  const re = /<p\b[^>]*>|<lg\b[^>]*>|<\/p>|<\/lg>/g;
  const stack: { tag: 'p' | 'lg'; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[0].startsWith('<p') || m[0].startsWith('<lg')) {
      stack.push({ tag: m[0].startsWith('<p') ? 'p' : 'lg', start: m.index });
    } else if (stack.length) {
      const el = stack.pop()!;
      const closeEnd = m.index + m[0].length;
      segments.push({ tag: el.tag, xml: body.slice(el.start, closeEnd) });
      re.lastIndex = closeEnd;
    }
  }
  const topLevel = segments.filter((s) => s.tag === 'p');
  const lgs: Segment[] = [];
  for (const s of segments) {
    if (s.tag === 'lg') lgs.push(s);
    for (const lm of s.xml.matchAll(/<lg\b[^>]*>[\s\S]*?<\/lg>/g)) lgs.push({ tag: 'lg', xml: lm[0] });
  }
  return { title, juanNo, charDecl, segments: topLevel, lgs };
}

/** 組單一 Lex-0 條目。 */
function entry(orth: string, def: string): string {
  return `<entry><form><orth>${escXml(orth)}</orth></form><sense><def>${def}</def></sense></entry>`;
}

/**
 * 經文 → Lex-0 XML（分幀可中止）。轉換產物直接 new File 餵 importDictFiles，
 * 無中間檔；gaiji 由 reader 端解字（charDecl 透傳）。
 */
export async function convertCbetaToLex0(teiXml: string, opts: CbetaConvertOptions = {}): Promise<CbetaConvertResult> {
  const levels = opts.levels && opts.levels.length ? opts.levels : [1, 2, 3];
  const parsed = parseSutra(teiXml);
  const entries: string[] = [];

  // 正文拍平預清洗（每段一次；L1/L2 共用）
  const cleaned: string[] = [];
  let done = 0;
  for (const s of parsed.segments) {
    cleaned.push(cleanSegment(s.xml));
    done++;
    if (opts.onProgress && done % 20 === 0) opts.onProgress(done, parsed.segments.length);
    if (opts.yieldFn && done % 20 === 0) {
      await opts.yieldFn();
      if (opts.shouldAbort?.()) {
        return finish(parsed, entries, levels, cleaned, true);
      }
    }
  }

  if (levels.includes(1)) {
    const text = cleaned.filter(Boolean).join('\n');
    if (text) entries.push(entry(`${parsed.title}·卷${parsed.juanNo}`, text));
  }
  if (levels.includes(2)) {
    cleaned.forEach((text, i) => {
      if (text) entries.push(entry(`${parsed.title}¶卷${parsed.juanNo}§${i + 1}`, text));
    });
  }
  if (levels.includes(3)) {
    let li = 0;
    for (const lg of parsed.lgs) {
      const text = cleanSegment(lg.xml);
      if (text) entries.push(entry(`${parsed.title}¶偈頌§${++li}`, text));
      if (opts.yieldFn && li % 20 === 0) {
        await opts.yieldFn();
        if (opts.shouldAbort?.()) {
          return finish(parsed, entries, levels, cleaned, true);
        }
      }
    }
  }
  if (opts.onProgress) opts.onProgress(parsed.segments.length, parsed.segments.length);
  return finish(parsed, entries, levels, cleaned, false);
}

function finish(
  parsed: ReturnType<typeof parseSutra>,
  entries: string[],
  levels: number[],
  cleaned: string[],
  aborted: boolean,
): CbetaConvertResult {
  const charDeclBlock = parsed.charDecl ? `<encodingDesc>${parsed.charDecl}</encodingDesc>\n` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0">
<teiHeader><fileDesc><titleStmt><title>${escXml(parsed.title)}（CBETA 轉辭典）</title></titleStmt></fileDesc></teiHeader>
${charDeclBlock}<text><body>
${entries.join('\n')}
</body></text></TEI>`;
  void levels;
  void cleaned;
  return { xml, entryCount: entries.length, title: parsed.title, aborted };
}
