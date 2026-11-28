#!/usr/bin/env node
/**
 * cbeta2lex0.mjs — CBETA TEI P5 經文 → TEI Lex-0 辭典轉換器（CLI）。
 *
 * CBETA xml-p5/xml-p5a 是 TEI P5 文獻編碼（經文全文），非辭典格式；本工具把
 * 經文段落合成詞頭轉成 lilium 可導入的 Lex-0（<entry> 結構）。分層詞頭：
 *   L1 卷層   —「經名·卷N」整卷一條
 *   L2 段層   —「經名¶卷N§K」卷內第 K 段一條（<p>；<lg> 偈頌併入所在段）
 *   L3 偈頌層 —「經名¶偈頌§K」整首 <lg> 一條
 * 合成碼 ¶/§ 避免與真實經文用字衝突。校注（note）p5 經文全在 standOff 區、
 * body 內零 note（p5/p5a 樣本實勘），正文只剝 anchor 標記即可。
 * 異文 <app><lem> 取底本讀法；<g ref> 透傳——lilium reader（8a77c29 起）
 * 自動解 charDecl 碼位，本工具不處理 gaiji。
 *
 * 用法：node tools/cbeta2lex0.mjs <輸入.xml|目錄> [-o 輸出.lex0.xml] [--levels 1,2,3]
 *
 * 依賴：Node ≥ 18，零外部依賴。
 */
import fs from 'node:fs';
import path from 'node:path';

/** TEI → 純文本清洗（單段 XML → 可讀經文）。 */
export function cleanSegment(xml) {
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

/** 從 TEI 文本抽經文結構（卷→段→偈頌）。 */
export function parseSutra(xml) {
  const title = xml.match(/<title level="m"[^>]*>([^<]+)<\/title>/)?.[1]?.trim() || '未知經';
  const juanNo = xml.match(/<cb:juan\b[^>]*\bn="([^"]*)"/)?.[1] || '1';
  const bodyStart = xml.indexOf('<body>');
  const bodyEnd = xml.lastIndexOf('</body>');
  if (bodyStart < 0 || bodyEnd < 0) throw new Error('no <body> — not a TEI text?');
  const body = xml.slice(bodyStart + 6, bodyEnd);
  const charDecl = xml.match(/<charDecl>[\s\S]*?<\/charDecl>/)?.[0] || '';

  // 頂層 <p>（含嵌套 <lg> 一併入段）；<lg> 另行抽出供 L3。
  const segments = [];
  const re = /<p\b[^>]*>|<lg\b[^>]*>|<\/p>|<\/lg>/g;
  const stack = [];
  let m;
  while ((m = re.exec(body))) {
    if (m[0].startsWith('<p') || m[0].startsWith('<lg')) {
      stack.push({ tag: m[0].startsWith('<p') ? 'p' : 'lg', open: m[0], start: m.index, inner: '' });
    } else if (stack.length) {
      const el = stack.pop();
      const closeStart = m.index;
      // 同型嵌套由 findMatching 式計數保證——此處僅處理頂層配對；嵌套 <lg> 在 <p> 內時
      // regex 配對會把內層 </lg> 留給外層段落文本（cleanSegment 拍平處理，可接受）。
      el.xml = body.slice(el.start, closeStart) + m[0];
      segments.push(el);
      re.lastIndex = closeStart + m[0].length;
    }
  }
  const topLevel = segments.filter((s) => s.tag === 'p');
  const lgs = [];
  for (const s of segments) {
    if (s.tag === 'lg') lgs.push(s);
    for (const lm of s.xml.matchAll(/<lg\b[^>]*>[\s\S]*?<\/lg>/g)) lgs.push({ tag: 'lg', xml: lm[0] });
  }
  return { title, juanNo, charDecl, segments: topLevel, lgs };
}

/** 組 Lex-0 XML（level 1/2/3）。 */
export function toLex0(parsed, levels = [1, 2, 3]) {
  const { title, juanNo, charDecl, segments, lgs } = parsed;
  const esc = (s) => s.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/</g, (m, o, str) => {
    // 保留 g/entry/form/orth/sense/def 標籤，其餘已由 cleanSegment 拍平——此處只轉裸 <
    return m;
  });
  const entries = [];

  if (levels.includes(1)) {
    const text = segments.map((s) => cleanSegment(s.xml)).filter(Boolean).join('\n');
    if (text) entries.push(`<entry><form><orth>${esc(title)}·卷${juanNo}</orth></form><sense><def>${text}</def></sense></entry>`);
  }
  if (levels.includes(2)) {
    segments.forEach((s, i) => {
      const text = cleanSegment(s.xml);
      if (text) entries.push(`<entry><form><orth>${esc(title)}¶卷${juanNo}§${i + 1}</orth></form><sense><def>${text}</def></sense></entry>`);
    });
  }
  if (levels.includes(3)) {
    lgs.forEach((lg, i) => {
      const text = cleanSegment(lg.xml);
      if (text) entries.push(`<entry><form><orth>${esc(title)}¶偈頌§${i + 1}</orth></form><sense><def>${text}</def></sense></entry>`);
    });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0">
<teiHeader><fileDesc><titleStmt><title>${esc(title)}（CBETA 轉辭典）</title></titleStmt></fileDesc></teiHeader>
${charDecl ? `<encodingDesc>${charDecl}</encodingDesc>\n` : ''}<text><body>
${entries.join('\n')}
</body></text></TEI>`;
}

function main(argv) {
  const args = argv.slice(2);
  const inputArg = args.find((a) => !a.startsWith('-'));
  if (!inputArg) {
    console.error('用法: node tools/cbeta2lex0.mjs <輸入.xml|目錄> [-o 輸出.lex0.xml] [--levels 1,2,3]');
    process.exit(1);
  }
  const outIdx = args.indexOf('-o');
  const outArg = outIdx >= 0 ? args[outIdx + 1] : null;
  const lvIdx = args.indexOf('--levels');
  const lvArg = lvIdx >= 0 ? args[lvIdx + 1] : null;
  const levels = lvArg ? lvArg.split(',').map(Number) : [1, 2, 3];

  const inputs = [];
  const stat = fs.statSync(inputArg);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(inputArg).filter((f) => f.endsWith('.xml')).sort()) {
      inputs.push(path.join(inputArg, f));
    }
  } else inputs.push(inputArg);

  let ok = 0, fail = 0;
  for (const file of inputs) {
    try {
      const xml = fs.readFileSync(file, 'utf8');
      const parsed = parseSutra(xml);
      const lex0 = toLex0(parsed, levels);
      const base = path.basename(file, '.xml');
      const out = outArg && inputs.length === 1
        ? outArg
        : (outArg ? path.join(outArg, `${base}.lex0.xml`) : `${base}.lex0.xml`);
      if (outArg && inputs.length > 1) fs.mkdirSync(outArg, { recursive: true });
      fs.writeFileSync(out, lex0, 'utf8');
      const n = (lex0.match(/<entry>/g) || []).length;
      console.log(`✓ ${path.basename(file)} → ${out}（${n} 條）`);
      ok++;
    } catch (e) {
      console.error(`✗ ${path.basename(file)}: ${e.message}`);
      fail++;
    }
  }
  console.log(`完成: ${ok} 成功, ${fail} 失敗`);
  if (fail) process.exit(1);
}

import { pathToFileURL } from 'node:url';

function isMain() {
  try {
    const real = fs.realpathSync(process.argv[1] || '');
    return import.meta.url === pathToFileURL(real).href;
  } catch {
    return false;
  }
}
if (isMain()) main(process.argv);
