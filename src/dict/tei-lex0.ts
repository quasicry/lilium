// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — TEI Lex-0 reader（模塊③ 辭典橋）。
 *
 * Lex-0 = TEI 官方詞典最小基線模型（bcdh/tei-lex-0；「0」＝零級最小起點）。
 * 本 reader 把 Lex-0 實例（<TEI> 文件，內含 <entry> 集）解析為 li 條目模型，
 * 與 XDXF reader 同形：純字串/正則解析、不 import obsidian、Node 可直接測。
 *
 * 設計決策：
 *  1. 掃描掛載而非落盤轉換——.xml 放 dictionaries/ 掃描即掛載，stableId 全套復用。
 *  2. 正則分組拍平，不用 DOMParser（linkedom 沙箱無 DOMParser，批次一實錘）。
 *     條目級分塊：單 entry 解析異常只丟該條＋warning，不毀整典。
 *  3. xr 交叉引用兩段式：導入期只記 data-target，查詢期由渲染層補連結。
 *
 * 安全：條目 html 一律由拍平文本 esc() 生成，零 raw XML 直通。
 *
 * 處置的元素集（lex-0 baseline）：
 *   entry/entryFree/form/orth/pron/sense/hom/num/def/cit/quote/translation/bibl/
 *   note/metamark/gramGrp/gram/usg/etym/xr/ref/pc/seg
 * 未識別元素 → 拍平 itertext ＋ warning 計數。
 */

import { prefixRange } from './sorted-index';

/** 單條目：keys = [lemma, …variants]；entryType 記 entry@type。 */
export interface Lex0Article {
  keys: string[];
  html: string;
  entryType?: string;
  xmlId?: string;
}

export interface Lex0Meta {
  title: string;
  description?: string;
  lang?: string;
}

export interface Lex0Warnings {
  /** 未識別元素名 → 出現次數（topN 供導入報告） */
  unknownElements: Map<string, number>;
  /** 缺 lemma/orth 的條目數 */
  missingHeadword: number;
  /** 解析中途丟棄的條目數 */
  droppedEntries: number;
}

// --------------------------------------------------------------- 工具

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 數字字元實體還原（&#xHH; 十六進位／&#DD; 十進位）。
 *  非法值（非十六進位、0、超出碼位範圍、代理對半區）原樣保留不動。 */
function decodeNumericEntities(s: string): string {
  return s.replace(/&(?:#x([0-9A-Fa-f]+)|#([0-9]+));/g, (m, hex?: string, dec?: string) => {
    const cp = hex ? parseInt(hex, 16) : parseInt(dec!, 10);
    if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return m;
    return String.fromCodePoint(cp);
  });
}

/** XML 實體還原（僅文本節點用；輸出前一律再 esc()）。含數字實體（&#x…;/&#…;）。 */
function unescEntities(s: string): string {
  return decodeNumericEntities(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 剝掉全部標籤、解 XML 實體，得純文本（拍平用）。 */
function textOf(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:#x[0-9A-Fa-f]+|#\d+);/g, decodeNumericEntities)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 取屬性值（name 須為合法屬性名）。 */
/**
 * <choice>（TEI 3.4/11.3 校勘語義群）規範形挑選：
 * 按子元素名優先取規範形——corr > expan > reg >（其餘首個）。
 * 文本正確性優先：被替代的 orig/sic/abbr 文本不輸出（否則校勘字並排產生錯誤文本）。
 */
const CHOICE_REGULARIZING = ['corr', 'expan', 'reg'];

/** 多個 <unclear> 時取 cert 屬性最高者（high > medium > low > 無）。 */
const CERT_RANK: Record<string, number> = { high: 3, medium: 2, moderate: 2, low: 1 };
function certRank(tag: string): number {
  return CERT_RANK[attr(tag, 'cert') || ''] ?? 0;
}

function attr(tag: string, name: string): string | undefined {
  // C6：\b 對 name 前接 '-'/':' 等字元失效（可誤中子串）。iOS 16.4 以下不支援
  // lookbehind（MOB-REGEX 閘），改手動錨點：逐位置檢查 name 起點前一字符不屬屬性名字元集。
  // 屬性名字元集（等價 [-0-9A-Za-z_:]）：前一字符落在集合內＝name 是更長標記的子串，跳過該命中
  const isBadPrev = (ch: string | undefined): boolean =>
    ch !== undefined && /[0-9A-Za-z_:-]/.test(ch);
  const needle = `${name}="`;
  let from = 0;
  for (;;) {
    const idx = tag.indexOf(needle, from);
    if (idx < 0) return undefined;
    if (!isBadPrev(idx > 0 ? tag[idx - 1] : undefined)) {
      const end = tag.indexOf('"', idx + needle.length);
      return end < 0 ? undefined : tag.slice(idx + needle.length, end);
    }
    from = idx + 1;
  }
}

// --------------------------------------------------------------- 條目內渲染

const GRAM_LABEL: Record<string, string> = {
  pos: 'pos',
  mwe: 'mwe',
  number: 'num.',
  gender: 'gen.',
  case: 'case',
  tense: 'tense',
  person: 'pers.',
  mood: 'mood',
  voice: 'voice',
};

function gramText(gramXml: string): string {
  const t = textOf(gramXml);
  if (t) return t;
  const type = attr(gramXml.match(/<gram\b[^>]*>/)?.[0] || '', 'type') || '';
  const value = attr(gramXml.match(/<gram\b[^>]*>/)?.[0] || '', 'value');
  const label = GRAM_LABEL[type] || type;
  return [label, value].filter(Boolean).join('=');
}

/**
 * 條目內遞迴渲染器：把 Lex-0 片段轉為 li-lex0-* html。
 * 嵌套 sense 與嵌套 entry（homonymic/related）都在此處理。
 */
class EntryRenderer {
  private parts: string[] = [];

  /** 當前 entry 的 headword 純文本（oRef/pRef 佔位渲染用）。 */
  entryHw = '';

  /** 當前 entry 的 xml:id → 發音文本（pRef target 解析用，TEI 10.4）。 */
  pronById = new Map<string, string>();

  constructor(private warnings: Lex0Warnings, private charDecl?: Map<string, CharDeclInfo>) {}

  result(): string {
    return this.parts.join('\n');
  }

  /** 條目頂部詞頭列：orth + pron + gram 徽章。 */
  renderHeadword(formsXml: string): string {
    const bits: string[] = [];
    // lemma orth（可含 <seg> 分段——Flussschifffahrt 型）
    const lemmaRe = /<form\b[^>]*type="lemma"[^>]*>([\s\S]*?)<\/form>/g;
    let lm: RegExpExecArray | null;
    let first = true;
    // TEI examples 實錘：裸 <form><orth>…</orth></form>（無 type="lemma"）也要渲染詞頭
    if (!/<form\b[^>]*type="lemma"/.test(formsXml)) {
      const bare = formsXml.match(/<form\b[^>]*>\s*<orth\b[^>]*>([\s\S]*?)<\/orth>/);
      if (bare) {
        const o = textOf(bare[1]);
        if (o) bits.push(`<span class="li-lex0-hw">${esc(o)}</span>`);
      }
    }
    while ((lm = lemmaRe.exec(formsXml))) {
      const block = lm[1];
      const orthRe = /<orth\b[^>]*>([\s\S]*?)<\/orth>|<orth\b[^>]*\/>/g;
      let om: RegExpExecArray | null;
      while ((om = orthRe.exec(block))) {
        let orth: string;
        if (om[1] !== undefined) {
          orth = textOf(om[1]);
        } else {
          // 自閉合 <orth value="leleti"/>：詞形在 value（或 expand）屬性（MSS.leleti 實錘）
          orth = attr(om[0], 'value') || attr(om[0], 'expand') || '';
        }
        if (orth) {
          bits.push(
            first ? `<span class="li-lex0-hw">${esc(orth)}</span>` : `<span class="li-lex0-variant">${esc(orth)}</span>`,
          );
        }
        first = false;
      }
      const pron = block.match(/<pron\b[^>]*>([\s\S]*?)<\/pron>/);
      if (pron) bits.push(`<span class="li-lex0-pron">${esc(textOf(pron[1]))}</span>`);
    }
    return bits.join(' ');
  }

  /** 條目頂部 gramGrp（不在任何 form/sense 內的）。 */
  renderTopGrams(bodyXml: string): string {
    const grams: string[] = [];
    const re = /<gramGrp\b[^>]*>([\s\S]*?)<\/gramGrp>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bodyXml))) grams.push(gramText(m[1]));
    return grams
      .filter(Boolean)
      .map((g) => `<span class="li-lex0-pos">${esc(g)}</span>`)
      .join(' ');
  }

  /** 遞迴渲染 body 片段；深度控制防失控嵌套。 */
  renderBody(xml: string, depth = 0, senseNo = ''): void {
    if (depth > 8) return;
    let i = 0;
    while (i < xml.length) {
      const lt = xml.indexOf('<', i);
      if (lt < 0) {
        const text = xml.slice(i).replace(/\s+/g, ' ').trim();
        if (text) this.parts.push(`<span class="li-lex0-pc">${esc(unescEntities(text))}</span>`);
        break;
      }
      const text = xml.slice(i, lt).replace(/\s+/g, ' ').trim();
      if (text) this.parts.push(`<span class="li-lex0-pc">${esc(unescEntities(text))}</span>`);
      if (xml.startsWith('<!--', lt)) {
        const end = xml.indexOf('-->', lt);
        i = end < 0 ? xml.length : end + 3;
        continue;
      }
      const tagM = xml.slice(lt).match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/);
      if (!tagM) {
        // '<' 非標籤開頭（如「<」字符）——按文本處理
        this.parts.push(`<span class="li-lex0-pc">${esc('<')}</span>`);
        i = lt + 1;
        continue;
      }
      const tag = tagM[1];
      const openTag = tagM[0];
      const selfClosing = tagM[2] === '/';
      const openEnd = lt + openTag.length;
      if (selfClosing) {
        // 自閉合元素默認無輸出；<g ref> 例外（charDecl 圖形/文字映射，koktai 式自閉合引用）
        if (tag === 'g') {
          const refId = (openTag.match(/\bref="#?([^"\s>]+)"/)?.[1] || '').replace(/^#/, '');
          const info = this.charDecl?.get(refId);
          // altTexts（非 standard mapping 備選文本）導出 data-galt 供上層 UI——不改變現有視覺輸出
          const galt = info?.altTexts?.length ? ` data-galt="${esc(info.altTexts.join('|'))}"` : '';
          if (info?.text) this.parts.push(`<span class="li-lex0-g" data-gref="${esc(refId)}"${galt}>${esc(info.text)}</span>`);
          else if (info?.graphic) this.parts.push(`<img class="li-lex0-g-img" src="${esc(info.graphic)}" alt="${esc(refId)}"${galt}>`);
        }
        i = openEnd;
        continue;
      }
      // 找匹配閉合標籤（含同級同名嵌套）
      const close = findMatching(xml, openEnd, tag);
      if (close === null) {
        // 未閉合：拍平其後文本直到下一個頂層標籤（保守：直接取到文末，textOf 剝淨）
        this.handleLeaf(tag, xml.slice(openEnd));
        break;
      }
      const inner = xml.slice(openEnd, close.start);
      i = close.end;
      this.handleElement(tag, openTag, inner, depth, senseNo);
    }
  }

  /** choice 內頂層子元素（不含嵌套同名）：{ tag, openTag, inner }。 */
  private topLevelChildren(xml: string): { tag: string; openTag: string; inner: string }[] {
    const out: { tag: string; openTag: string; inner: string }[] = [];
    let i = 0;
    while (i < xml.length) {
      const lt = xml.indexOf('<', i);
      if (lt < 0) break;
      const tagM = xml.slice(lt).match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/);
      if (!tagM) { i = lt + 1; continue; }
      const tag = tagM[1];
      const openTag = tagM[0];
      const openEnd = lt + openTag.length;
      if (tagM[2] === '/') { i = openEnd; continue; }
      const close = findMatching(xml, openEnd, tag);
      if (close === null) break;
      out.push({ tag, openTag, inner: xml.slice(openEnd, close.start) });
      i = close.end;
    }
    return out;
  }

  private handleElement(tag: string, openTag: string, inner: string, depth: number, senseNo: string): void {
    switch (tag) {
      case 'sense': {
        const id = attr(openTag, 'xml:id');
        const n = attr(openTag, 'n') || '';
        // 無 n 屬性（官方 DLPC 條目即如此）不顯示 '?' 偽序號；有上級編號時保留父鏈
        const label = n ? (senseNo ? `${senseNo}.${n}` : n) : senseNo;
        this.parts.push(`<div class="li-lex0-sense" data-sense-id="${esc(id || '')}">`);
        if (label) this.parts.push(`<span class="li-lex0-sense-no">${esc(label)}</span>`);
        const before = this.parts.length;
        this.renderBody(inner, depth + 1, label);
        if (this.parts.length === before) this.parts.pop(); // 空 sense 不留殼
        this.parts.push('</div>');
        return;
      }
      case 'hom': {
        // P2-2：TEI <hom> 同形詞分組殼——遞迴編號模式照 sense（n 屬性；父鏈保留）。
        // 顯示「n.」序號＋殼 div；空 hom 不留殼。
        const id = attr(openTag, 'xml:id');
        const n = attr(openTag, 'n') || '';
        const label = n ? (senseNo ? `${senseNo}.${n}` : `${n}.`) : '';
        this.parts.push(`<div class="li-lex0-hom"${id ? ` data-hom-id="${esc(id)}"` : ''}>`);
        if (label) this.parts.push(`<span class="li-lex0-hom-no">${esc(label)}</span>`);
        const before = this.parts.length;
        // C3：hom 內 sense 編號繼承 hom 序號（父鏈）——hom n=1 下 sense n=1 顯示 1.1；
        // hom 無 n 時維持外層 senseNo。
        this.renderBody(inner, depth + 1, label ? label.replace(/\.$/, '') : senseNo);
        if (this.parts.length === before) this.parts.pop(); // 空 hom 不留殼
        this.parts.push('</div>');
        return;
      }
      case 'entry': {
        // 嵌套條目（homonymic/related）：作為縮進子條目塊
        const type = attr(openTag, 'type') || 'relatedEntry';
        const hw = this.renderHeadword(inner);
        if (hw) this.entryHw = hw.replace(/<[^>]+>/g, '');
        this.parts.push(`<div class="li-lex0-subentry" data-entry-type="${esc(type)}">`);
        if (hw) this.parts.push(`<div class="li-lex0-subentry-hw">${hw}</div>`);
        const before = this.parts.length;
        this.renderBody(inner, depth + 1, senseNo);
        if (this.parts.length === before && !hw) this.parts.pop();
        this.parts.push('</div>');
        return;
      }
      case 'def': {
        const lang = attr(openTag, 'xml:lang');
        const mark = lang ? ` <span class="li-lex0-lang">[${esc(lang)}]</span>` : '';
        // 遞迴渲染以保留 <g ref> 字形映射（koktai 注音符號 PUA 實錘）
        const before = this.parts.length;
        this.renderBody(inner, depth + 1, senseNo);
        const bodyHtml = this.parts.slice(before).join('');
        this.parts.length = before;
        this.parts.push(`<div class="li-lex0-def">${bodyHtml}${mark}</div>`);
        return;
      }
      case 'cit': {
        const type = attr(openTag, 'type') || '';
        const lang = attr(openTag, 'xml:lang');
        if (type !== 'translation' && type !== 'translationEquivalent') {
          // TEI examples 實錘：裸 <cit><quote>（無 type，umfahren 實錘）也是例句
          const quote = inner.match(/<quote\b[^>]*>([\s\S]*?)<\/quote>/);
          if (quote) {
            // TEI 10.4：quote 內的 oRef/pRef（自閉合）替換為詞頭/pRef 發音佔位文本，避免 textOf 剝標籤時丟失
            const hw = this.entryHw || '～';
            const qRaw = quote[1]
              .replace(/<oRef\b[^>]*\/>|<oRef\b[^>]*>[\s\S]*?<\/oRef>/g, hw)
              .replace(/<pRef\b[^>]*\/>|<pRef\b[^>]*>[\s\S]*?<\/pRef>/g, (m: string) => {
                const t = (m.match(/target="#([^"]+)"/) || [])[1] || '';
                return this.pronById.get(t) || hw;
              })
              // TEI 9.3.1.2：quote 內 oVar/pVar 為配對元素帶內文——textOf 會剝殼留內文
              // （不丟文本），但為了保住斜體語義，先以私有佔位符包住內文；
              // esc() 之後再把佔位符換回 span（私有區字元不經 esc，零 raw XML 直通）
              .replace(/<oVar\b[^>]*>([\s\S]*?)<\/oVar>/g, (m: string, t: string) => {
                const ty = attr(m, 'type') || '';
                return `\u0001${ty ? `\u0005data-type\u0006${esc(ty)}\u0007` : ''}\u0008${t}\u0002`;
              })
              .replace(/<pVar\b[^>]*>([\s\S]*?)<\/pVar>/g, (m: string, t: string) => {
                const ty = attr(m, 'type') || '';
                return `\u0003${ty ? `\u0005data-type\u0006${esc(ty)}\u0007` : ''}\u0008${t}\u0004`;
              });
            const q = textOf(qRaw);
            const qEsc = esc(q)
              .replace(/\u0001/g, '<span class="li-lex0-ovar"')
              .replace(/\u0002/g, '</span>')
              .replace(/\u0003/g, '<span class="li-lex0-pvar"')
              .replace(/\u0004/g, '</span>')
              .replace(/\u0005/g, ' ')
              .replace(/\u0006/g, '="')
              .replace(/\u0007/g, '"')
              .replace(/\u0008/g, '>');
            this.parts.push(`<div class="li-lex0-ex">${qEsc}</div>`);
          }
          const tr = inner.match(/<cit\b[^>]*type="translation"[^>]*>[\s\S]*?<quote\b[^>]*>([\s\S]*?)<\/quote>/);
          if (tr) {
            const tlang = lang ? ` <span class="li-lex0-lang">[${esc(lang)}]</span>` : '';
            this.parts.push(`<div class="li-lex0-tr">${esc(textOf(tr[1]))}${tlang}</div>`);
          }
          const bibl = inner.match(/<bibl\b[^>]*>([\s\S]*?)<\/bibl>/);
          if (bibl) this.parts.push(`<div class="li-lex0-bibl">— ${esc(textOf(bibl[1]))}</div>`);
        } else if (type === 'translation' || type === 'translationEquivalent') {
          // translationEquivalent：<cit type="translationEquivalent" xml:lang="fr"><form><orth>chien</orth></form></cit>
          const orthM = inner.match(/<orth\b[^>]*>([\s\S]*?)<\/orth>/);
          const body = orthM ? textOf(orthM[1]) : textOf(inner);
          if (body) {
            const tlang = lang ? ` <span class="li-lex0-lang">[${esc(lang)}]</span>` : '';
            this.parts.push(`<div class="li-lex0-tr">${esc(body)}${tlang}</div>`);
          }
        } else {
          // 其它 cit 型：拍平
          const t = textOf(inner);
          if (t) this.parts.push(`<div class="li-lex0-pc">${esc(t)}</div>`);
        }
        return;
      }
      case 'quote':
      case 'num':
      case 'metamark':
      case 'pc':
      case 'seg':
        return; // 已由上層語境處理（cit/entry）；單獨出現時忽略殼
      case 'gramGrp': {
        const g = gramText(inner);
        if (g) this.parts.push(`<span class="li-lex0-pos">${esc(g)}</span>`);
        return;
      }
      case 'usg': {
        const t = textOf(inner);
        if (t) this.parts.push(`<span class="li-lex0-usg">${esc(t)}</span>`);
        return;
      }
      case 'lbl': {
        // 縮寫/語法標籤（官方語料 27 處：condensedLemmas、:1、+ 等）——與正文樣式區分
        const lt = attr(openTag, 'type') || '';
        const t = textOf(inner);
        if (t) this.parts.push(`<span class="li-lex0-lbl"${lt ? ` data-lbl-type="${esc(lt)}"` : ''}>${esc(t)}</span>`);
        return;
      }
      case 'note': {
        const t = textOf(inner);
        if (t) this.parts.push(`<div class="li-lex0-note">${esc(t)}</div>`);
        return;
      }
      case 'etym': {
        const t = textOf(inner);
        if (t) this.parts.push(`<details class="li-lex0-etym"><summary>etymology</summary><div>${esc(t)}</div></details>`);
        return;
      }
      case 're': {
        // TEI dictionaries <re>（related entry 相關條目交叉引用）——比照 <xr> 兩段式：
        // 導入期只記 data-target（內部 <ref target="…"> 優先，退化取 re 自身 target 屬性），
        // 查詢期由 view.ts 既按 .li-lex0-ref class 選擇補連結（零額外代碼）。re@type 作 data-xr-type。
        const reType = attr(openTag, 'type') || '';
        const refM = inner.match(/<ref\b[^>]*>/)?.[0] || '';
        const tid = attr(refM, 'target') || attr(openTag, 'target') || '';
        const refMatch = inner.match(/<ref\b[^>]*>([\s\S]*?)<\/ref>/);
        const refText = refMatch ? textOf(refMatch[1]) : textOf(inner);
        if (!refText) return;
        const tidAttr = tid ? ` data-target="${esc(tid)}"` : '';
        this.parts.push(
          `<span class="li-lex0-re"><span class="li-lex0-xr-label">related entry</span> ` +
            `<span class="li-lex0-ref"${tidAttr}${reType ? ` data-xr-type="${esc(reType)}"` : ''}>${esc(refText)}</span></span>`,
        );
        return;
      }
      case 'tr': {
        // TEI dictionaries <tr>（translation equivalent 翻譯等價）——比照 cit type=translation 渲染。
        // cit 內的 tr 仍由 cit 情境消費；此 case 處理獨立/容內出現的 tr。
        const lang = attr(openTag, 'xml:lang');
        const t = textOf(inner);
        if (!t) return;
        const tlang = lang ? ` <span class="li-lex0-lang">[${esc(lang)}]</span>` : '';
        this.parts.push(`<div class="li-lex0-tr">${esc(t)}${tlang}</div>`);
        return;
      }
      case 'trans': {
        // TEI dictionaries <trans>（translation information 容器）——透明殼轉 div，
        // 內容（tr/cit/desc/bibl…）遞迴渲染；空 trans 不留殼。
        this.parts.push(`<div class="li-lex0-trans">`);
        const before = this.parts.length;
        this.renderBody(inner, depth + 1, senseNo);
        if (this.parts.length === before) this.parts.pop();
        else this.parts.push('</div>');
        return;
      }
      case 'xr': {
        const type = attr(openTag, 'type') || 'related';
        const refM = inner.match(/<ref\b[^>]*>([\s\S]*?)<\/ref>/);
        const refText = refM ? textOf(refM[1]) : textOf(inner);
        if (!refText) return;
        const target = (refM && refM[0].match(/<ref\b[^>]*>/)?.[0]) || '';
        const tid = attr(target, 'target') || '';
        // 兩段式：導入期只記 data-target，查詢期由 Lex0Dict 補 headword 連結
        const tidAttr = tid ? ` data-target="${esc(tid)}"` : '';
        this.parts.push(
          `<span class="li-lex0-xr"><span class="li-lex0-xr-label">${esc(type)}</span> ` +
            `<span class="li-lex0-ref"${tidAttr} data-xr-type="${esc(type)}">${esc(refText)}</span></span>`,
        );
        return;
      }
      case 'g': {
                // TEI <g ref="#xml:id"> 字形引用（koktai PUA 異體字）——
        // charDecl standard mapping 文本優先；無文本有圖片則 <img>；皆無退化拍平
        const refId = (openTag.match(/\bref="#?([^"\s>]+)"/)?.[1] || '').replace(/^#/, '');
        const info = this.charDecl?.get(refId);
        // altTexts（非 standard mapping 備選文本）導出 data-galt 供上層 UI——不改變現有視覺輸出
        const galt = info?.altTexts?.length ? ` data-galt="${esc(info.altTexts.join('|'))}"` : '';
        if (info?.text) this.parts.push(`<span class="li-lex0-g" data-gref="${esc(refId)}"${galt}>${esc(info.text)}</span>`);
        else if (info?.graphic) this.parts.push(`<img class="li-lex0-g-img" src="${esc(info.graphic)}" alt="${esc(refId)}"${galt}>`);
        else this.parts.push(`<span class="li-lex0-pc">${esc(textOf(inner))}</span>`);
        return;
      }
      case 'orth':
      case 'pron': {
        // 殼忽略、內文遞迴渲染（保留 <g ref> 字形映射；頂部詞頭已由 renderHeadword 消費 lemma form）
        const pid = attr(openTag, 'xml:id');
        if (pid) this.pronById.set(pid, textOf(inner));
        const before = this.parts.length;
        this.renderBody(inner, depth + 1, senseNo);
        const bodyHtml = this.parts.slice(before).join('');
        this.parts.length = before;
        const t = textOf(inner) || attr(openTag, 'value') || attr(openTag, 'expand') || '';
        // 有子元素渲染結果（含 g 映射）用富渲染；純文本退化原樣
        if (bodyHtml && /li-lex0-g/.test(bodyHtml)) this.parts.push(`<span class="li-lex0-pc">${bodyHtml}</span>`);
        else if (t) this.parts.push(`<span class="li-lex0-pc">${esc(t)}</span>`);
        return;
      }
      case 'form': {
        // 非 lemma form（variant/inflected）：不吞子樞——遞迴渲染內容（orth/pron/lbl/gramGrp）
        const ftype = attr(openTag, 'type') || '';
        if (ftype === 'lemma') return; // lemma 已由 renderHeadword 渲染
        this.parts.push(`<span class="li-lex0-form"${ftype ? ` data-form-type="${esc(ftype)}"` : ''}>`);
        const before = this.parts.length;
        this.renderBody(inner, depth + 1, senseNo);
        if (this.parts.length === before) this.parts.pop(); // 空 form 不留殼
        else this.parts.push('</span>');
        return;
      }
      case 'entryFree': {
        // P2-2：entryFree 內嵌於條目體時（罕見）——透明容器，遞迴渲染不另開殼
        this.renderBody(inner, depth, senseNo);
        return;
      }
      case 'teiHeader':
      case 'standOff':
        return;
      case 'oRef': {
        // 詞頭引用（例句中指向當前 headword）——TEI 10.4：渲染為詞頭佔位
        const t = attr(openTag, 'target') || '';
        const type = attr(openTag, 'type') || '';
        this.parts.push(`<span class="li-lex0-oref"${t ? ` data-target="${esc(t)}"` : ''}${type ? ` data-oref-type="${esc(type)}"` : ''}>${esc(this.entryHw || '～')}</span>`);
        return;
      }
      case 'pRef': {
        // 發音引用（例句中指向某 pron，如 umfahren 兩讀）——TEI 10.4：斜體詞頭佔位
        const t = attr(openTag, 'target') || '';
        this.parts.push(`<span class="li-lex0-pref"${t ? ` data-target="${esc(t)}"` : ''}>${esc(this.entryHw || '…')}</span>`);
        return;
      }
      case 'choice': {
        // TEI 校勘語義群（orig/reg、abbr/expan、sic/corr、多 unclear@cert）——
        // 文本正確性優先：只輸出單一規範形文本，被替代文本（orig/sic/abbr）不輸出
        // （拍平會把刪字與添字並排產生錯誤文本）。無已知配對型則退化取首個子元素文本。
        const kids = this.topLevelChildren(inner);
        if (!kids.length) return;
        let chosen = kids[0];
        // 多 unclear：取 cert 最高者
        if (kids.every((k) => k.tag === 'unclear') && kids.length > 1) {
          chosen = kids.reduce((best, k) => (certRank(k.openTag) > certRank(best.openTag) ? k : best));
        } else {
          for (const want of CHOICE_REGULARIZING) {
            const hit = kids.find((k) => k.tag === want);
            if (hit) { chosen = hit; break; }
          }
        }
        const ctype = kids.every((k) => k.tag === 'unclear')
          ? 'unclear'
          : chosen.tag;
        const before = this.parts.length;
        // 遞迴渲染選中子元素——choice 內 <g ref> 字形映射天然保留（koktai 實錘）
        this.renderBody(chosen.inner, depth + 1, senseNo);
        const bodyHtml = this.parts.slice(before).join('');
        this.parts.length = before;
        if (bodyHtml && /li-lex0-g/.test(bodyHtml)) {
          this.parts.push(`<span class="li-lex0-choice" data-choice-type="${esc(ctype)}">${bodyHtml}</span>`);
        } else {
          const t = textOf(chosen.inner);
          if (t) this.parts.push(`<span class="li-lex0-choice" data-choice-type="${esc(ctype)}">${esc(t)}</span>`);
        }
        return;
      }
      case 'oVar': {
        // TEI 9.3.1.2 orthographic-variant reference（例句內異體參照）——比照 oRef 佔位模式
        const type = attr(openTag, 'type') || '';
        const t = textOf(inner);
        if (!t) return;
        this.parts.push(`<span class="li-lex0-ovar"${type ? ` data-type="${esc(type)}"` : ''}>${esc(t)}</span>`);
        return;
      }
      case 'pVar': {
        // TEI 9.3.1.2 pronunciation-variant reference（例句內讀音變體參照）——比照 pRef 佔位模式
        const type = attr(openTag, 'type') || '';
        const t = textOf(inner);
        if (!t) return;
        this.parts.push(`<span class="li-lex0-pvar"${type ? ` data-type="${esc(type)}"` : ''}>${esc(t)}</span>`);
        return;
      }
      case 'hyph': {
        // 音節連字號點：渲染保留 | 分隔（TEI 10.3.1）
        const t = textOf(inner);
        if (t) this.parts.push(`<span class="li-lex0-hyph">${esc(t)}</span>`);
        return;
      }
      default: {
        const w = this.warnings.unknownElements;
        w.set(tag, (w.get(tag) || 0) + 1);
        const t = textOf(inner);
        if (t) this.parts.push(`<span class="li-lex0-pc">${esc(t)}</span>`);
        return;
      }
    }
  }

  private handleLeaf(tag: string, restXml: string): void {
    const t = textOf(restXml);
    if (t) this.parts.push(`<span class="li-lex0-pc">${esc(t)}</span>`);
    if (tag !== 'pc') {
      const w = this.warnings.unknownElements;
      w.set(tag, (w.get(tag) || 1));
    }
  }
}

/** 找匹配閉合標籤，跳過註釋並計同名嵌套深度。 */
function findMatching(xml: string, from: number, tag: string): { start: number; end: number } | null {
  const scan = new RegExp(`<!--|<${tag}\\b[^>]*>|</${tag}\\s*>`, 'g');
  scan.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = scan.exec(xml))) {
    if (m[0].startsWith('<!--')) {
      const end = xml.indexOf('-->', m.index);
      scan.lastIndex = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0) return { start: m.index, end: scan.lastIndex };
    } else if (!m[0].endsWith('/>')) {
      depth++;
    }
  }
  return null;
}

// --------------------------------------------------------------- Reader

/** charDecl/glyphDecl 表值：standard mapping 主 text＋其他 type 備選 altTexts＋圖形 */
type CharDeclInfo = { text?: string; graphic?: string; altTexts?: string[] };

export class Lex0Reader {
  readonly meta: Lex0Meta;
  readonly articles: Lex0Article[] = [];
  readonly warnings: Lex0Warnings = { unknownElements: new Map(), missingHeadword: 0, droppedEntries: 0 };
  private index: Map<string, number[]> = new Map();
  private sortedKeys: string[] | null = null;
  /** xml:id → 首鍵（xr 兩段式查詢期解析用；條目註冊時同步填） */
  readonly idToKey: Map<string, string> = new Map();

  /** charDecl 表——xml:id → { text: standard mapping 文本, altTexts: 其他 mapping type 備選, graphic: 圖片 url }（<g ref> 渲染用） */
  readonly charDecl: Map<string, CharDeclInfo> = new Map();

  constructor(xmlText: string) {
    this.meta = Lex0Reader.parseMeta(xmlText);
    this.parseCharDecl(xmlText);
    this.articles = this.parseEntries(xmlText);
    this.buildIndex();
  }

  /** 分批構建——每 batch 條讓出主線程一幀（啟動卡頓防範：44k 條 koktai 同幀全做＝凍 UI ~5s）。 */
  static async buildAsync(
    xmlText: string,
    batch = 500,
    yieldFn: () => Promise<void> = () => new Promise((r) => window.setTimeout(r, 0)), // B6：popout window 相容
  ): Promise<Lex0Reader> {
    const rd = Object.create(Lex0Reader.prototype) as Lex0Reader;
    (rd as unknown as { meta: Lex0Meta }).meta = Lex0Reader.parseMeta(xmlText);
    (rd as unknown as { warnings: Lex0Warnings }).warnings = { unknownElements: new Map(), missingHeadword: 0, droppedEntries: 0 };
    (rd as unknown as { charDecl: Map<string, CharDeclInfo> }).charDecl = new Map();
    rd.parseCharDecl(xmlText);
    // parseEntries 內部 buildArticle 逐條同步；外層按已產出條數讓幀——
    // 拆法：逐 entry 調 buildArticle 太侵入，改為 parseEntries 一次性（內部無 yield 點）
    // 不夠，故直接複用 parseEntries 產出後**索引構建**分批；條目解析仍一幀——
    // 治本靠序列化緩存（首次解析後落盤，其後啟動走還原路徑 648ms vs 5.1s）。
    (rd as unknown as { articles: Lex0Article[] }).articles = rd.parseEntries(xmlText);
    await rd.buildIndexAsync(batch, yieldFn);
    return rd;
  }

  /** A4：移除辭典時釋放索引與條目，避免大辭典資料駐留。冪等。 */
  dispose(): void {
    this.index.clear();
    this.idToKey.clear();
    this.sortedKeys = null;
    this.articles.length = 0;
  }

  private buildIndex(): void {
    this.idToKey.clear();
    this.index.clear();
    this.articles.forEach((a, i) => {
      if (a.xmlId && !this.idToKey.has(a.xmlId)) this.idToKey.set(a.xmlId, a.keys[0] || '');
      for (const k of a.keys) {
        const key = k.toLowerCase().trim();
        let arr = this.index.get(key);
        if (!arr) this.index.set(key, (arr = []));
        arr.push(i);
      }
    });
  }

  private async buildIndexAsync(batch: number, yieldFn: () => Promise<void>): Promise<void> {
    this.idToKey.clear();
    this.index.clear();
    const idx = this.index; // B10：原斷言與宣告型別相同（無效），移除
    for (let i = 0; i < this.articles.length; i++) {
      const a = this.articles[i];
      if (a.xmlId && !this.idToKey.has(a.xmlId)) this.idToKey.set(a.xmlId, a.keys[0] || '');
      for (const k of a.keys) {
        const key = k.toLowerCase().trim();
        let arr = idx.get(key);
        if (!arr) idx.set(key, (arr = []));
        arr.push(i);
      }
      if (i % batch === batch - 1) await yieldFn();
    }
  }

  /* ---------------- 序列化緩存（tar.gz 冷解析一次、啟動還原 ~0.65s vs 5.1s） ---------------- */

  /** 序列化為可 gzip 落盤的緊湊結構（articles＋charDecl＋meta；索引查詢期惰性重建） */
  serialize(): string {
    return JSON.stringify({
      v: 1,
      meta: this.meta,
      warnings: { missingHeadword: this.warnings.missingHeadword, droppedEntries: this.warnings.droppedEntries },
      charDecl: [...this.charDecl],
      articles: this.articles,
    });
  }

  /** 從 serialize() 產物還原（索引惰性：首次 lookup/prefix 前調 ensureIndex） */
  static deserialize(json: string): Lex0Reader {
    const o = JSON.parse(json) as {
      v: number;
      meta: Lex0Meta;
      warnings: { missingHeadword: number; droppedEntries: number };
      charDecl: Array<[string, CharDeclInfo]>;
      articles: Lex0Article[];
    };
    if (o.v !== 1) throw new Error(`lex0 cache version mismatch: ${o.v}`);
    const rd = Object.create(Lex0Reader.prototype) as Lex0Reader;
    (rd as unknown as { meta: Lex0Meta }).meta = o.meta;
    (rd as unknown as { warnings: Lex0Warnings }).warnings = {
      unknownElements: new Map(), missingHeadword: o.warnings.missingHeadword, droppedEntries: o.warnings.droppedEntries,
    };
    (rd as unknown as { charDecl: Map<string, CharDeclInfo> }).charDecl = new Map(o.charDecl);
    (rd as unknown as { articles: Lex0Article[] }).articles = o.articles;
    (rd as unknown as { idToKey: Map<string, string> }).idToKey = new Map();
    (rd as unknown as { index: Map<string, number[]> }).index = new Map();
    return rd;
  }

  /** 惰性索引構建（deserialize 後首次查詢前；44k 條 ~50ms，可同步） */
  ensureIndex(): void {
    if (this.index.size || !this.articles.length) return;
    this.buildIndex();
  }

  static parseMeta(xml: string): Lex0Meta {
    const meta: Lex0Meta = { title: 'TEI Lex-0 Dictionary' };
    const title = xml.match(/<titleStmt>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/);
    if (title) meta.title = textOf(title[1]) || meta.title;
    const desc = xml.match(/<availability[\s\S]*?<licence\b[^>]*target="([^"]*)"/);
    if (desc) meta.description = desc[1];
    return meta;
  }

/** charDecl 收集（koktai PUA 異體字實錘）——無 DOM，正則逐 <char>／<glyph> 塊。
 *  TEI 規範（魯伯納《TEI 使用指南》6.5 節 CBETA 缺字標準範例）缺字標為
 *  <glyph xml:id="…">，此前只收 <char> 全漏——現 char|glyph 同式收錄，
 *  既有 char 塊行為零變化。mapping type="standard" 仍為主 text；
 *  其他 type（cbeta/regular/cbetaNo 等）按序收進 altTexts（排除 standard 重複）。 */
  private parseCharDecl(xml: string): void {
    const charRe = /<(char|glyph)\b[^>]*xml:id="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = charRe.exec(xml))) {
      const id = m[2];
      const block = m[3];
      const info: CharDeclInfo = {};
      const std = block.match(/<mapping\b[^>]*type="standard"[^>]*>([\s\S]*?)<\/mapping>/);
      if (std) info.text = textOf(std[1]);
      const fig = block.match(/<graphic\b[^>]*url="([^"]*)"/);
      if (fig) info.graphic = fig[1];
      const altTexts: string[] = [];
      const mapRe = /<mapping\b([^>]*)>([\s\S]*?)<\/mapping>/g;
      let mm: RegExpExecArray | null;
      while ((mm = mapRe.exec(block))) {
        const attrs = mm[1];
        if (/\btype="standard"/.test(attrs)) continue;
        const t = textOf(mm[2]);
        if (t && t !== info.text && !altTexts.includes(t)) altTexts.push(t);
      }
      if (altTexts.length) info.altTexts = altTexts;
      if (info.text || info.graphic || info.altTexts) this.charDecl.set(id, info);
    }
  }

  /** TEI 根內逐個頂層 <entry> 分塊；容器 wordFamily 展開其子 entry。
   *  P2-2：<entryFree>（TEI 辭典寬鬆模型，entry 的超集容器）也當條目掃——
   *  用同一 buildArticle 重入解析（entryFree 內的 entry 子塊已隨母容器渲染，不重複建條）。 */
  private parseEntries(xml: string): Lex0Article[] {
    const out: Lex0Article[] = [];
    const consumed: { start: number; end: number }[] = [];
    // A1：entry 區間先行掃描——頂層 entryFree 不重複建條的關鍵。
    // 先記下所有頂層 entry 區間，entryFree 掃描時「位於任一 entry 區間內」即跳過
    // （內部 entry 已隨母 entry 建條，重掃會鍵污染＋entryCount 虛高，probe27 實錘）。
    const entryRanges: { start: number; end: number }[] = [];
    {
      const pre = /<entry\b[^>]*>/g;
      let pm: RegExpExecArray | null;
      while ((pm = pre.exec(xml))) {
        const openEnd = pm.index + pm[0].length;
        const close = findMatching(xml, openEnd, 'entry');
        if (close) entryRanges.push({ start: pm.index, end: close.end });
        else entryRanges.push({ start: pm.index, end: openEnd }); // 未閉合：至少擋住開標籤點
      }
    }
    // 先消費頂層 entryFree：整塊照 entry 餵 buildArticle（區間記入 consumed，
    // 內部 entry 子塊已隨母容器渲染，下面的 entry 掃描不重複建條）
    {
      const efRe = /<entryFree\b[^>]*>/g;
      let em: RegExpExecArray | null;
      while ((em = efRe.exec(xml))) {
        if (consumed.some((c) => em!.index >= c.start && em!.index < c.end)) continue;
        // A1：位於任一 entry 區間內的 entryFree 是嵌套子塊——跳過，隨母 entry 渲染
        if (entryRanges.some((r) => em!.index > r.start && em!.index < r.end)) continue;
        const openEnd = em.index + em[0].length;
        const close = findMatching(xml, openEnd, 'entryFree');
        if (!close) { this.warnings.droppedEntries++; continue; }
        const a = this.buildArticle(xml.slice(em.index, close.end), xml);
        if (a) {
          // entryFree 整塊成功建條 → 區間記入 consumed（內部 entry 子塊不重複建條）
          consumed.push({ start: em.index, end: close.end });
          out.push(a);
        } else {
          // A1/C4：entryFree 建條失敗但內部 entry 在 entry 掃描會接手建條——
          // 不計 droppedEntries（非真丟條），交由下方 entry 掃描逐條建條。
        }
      }
    }
    const re = /<entry\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      // 跳過已消費區間（嵌套 entry 已隨母條/wordFamily 渲染，不重複建條）
      const mIdx = m.index;
      if (consumed.some((c) => mIdx >= c.start && mIdx < c.end)) continue;
      const openEnd = m.index + m[0].length;
      const close = findMatching(xml, openEnd, 'entry');
      if (!close) {
        this.warnings.droppedEntries++;
        continue;
      }
      consumed.push({ start: m.index, end: close.end });
      const block = xml.slice(openEnd, close.start);
      const openTag = m[0];
      const type = attr(openTag, 'type') || '';
      // 容器型：wordFamily 只展開子 entry（本身不產條目）
      if (type === 'wordFamily') {
        const sub = /<entry\b[^>]*>[\s\S]*?<\/entry>/g;
        let sm: RegExpExecArray | null;
        while ((sm = sub.exec(block))) {
          const a = this.buildArticle(sm[0], xml);
          if (a) {
            a.html = `<div class="li-lex0-family">family: ${esc(this.familyName(block))}</div>` + a.html;
            out.push(a);
          }
        }
        continue;
      }
      const a = this.buildArticle(xml.slice(m.index, close.end), xml);
      if (a) {
        out.push(a);
        consumed.push({ start: m.index, end: close.end });
        continue;
      }
      // homonymicEntry 省略自有 form（Lex-0 condensed 慣例，官方語料 7 條實錘）——
      // 鍵繼承前一支已掛載條目（同位緊鄰的同形詞組群共享詞頭）
      const blockXml = xml.slice(m.index, close.end);
      const bType = attr(blockXml.match(/<entry\b[^>]*>/)?.[0] || '', 'type') || '';
      if ((bType === 'homonymicEntry' || bType === 'relatedEntry') && out.length) {
        // 繼承目標：尾端往前找同基名（ED.aid_v←ED.aid_n；strip 詞性後綴段）的條目，fallback 前一條
        const myId = attr(blockXml.match(/<entry\b[^>]*>/)?.[0] || '', 'xml:id') || '';
        const myBase = myId.replace(/[._-]?[a-z0-9]+$/i, '');
        let prev = out[out.length - 1];
        let bestLen = Infinity;
        for (let k = out.length - 1; k >= 0; k--) {
          const c = out[k];
          if (!c.xmlId || !c.xmlId.startsWith(myBase)) continue;
          // 取最短前綴匹配（ED.aid_n 勝過 ED.aid_n.1.in_aid_of）；精確等於 myBase 最優
          const len = c.xmlId === myBase ? -1 : c.xmlId.length;
          if (len < bestLen) { prev = c; bestLen = len; if (len === -1) break; }
        }
        const renderer = new EntryRenderer(this.warnings, this.charDecl);
        const hw = renderer.renderHeadword(blockXml) || `<span class="li-lex0-hw">${esc(prev.keys[0] || '')}</span>`;
        renderer.entryHw = prev.keys[0] || renderer.entryHw; // TEI 10.4：oRef/pRef 佔位用
        const body = renderer.renderTopGrams(blockXml);
        renderer.renderBody(blockXml, 0, '');
        let html = renderer.result();
        if (html.trim()) {
          const entryLang = attr(blockXml.match(/<entry\b[^>]*>/)?.[0] || '', 'xml:lang') || '';
          html =
            `<div class="li-lex0-entry"${entryLang ? ` data-lang="${esc(entryLang)}"` : ''}>` +
            `<div class="li-lex0-hw-line">${hw}${body ? ' ' + body : ''}</div>` +
            html +
            `</div>`;
          const xmlId = attr(blockXml.match(/<entry\b[^>]*>/)?.[0] || '', 'xml:id');
          out.push({ keys: [...prev.keys], html, entryType: bType, xmlId: xmlId || undefined });
        }
      }
    }
    // C4：entryFree 建條失敗但內部 entry 於上方接手成功（建條成功區間覆蓋 entryFree 區間）
    // 時，該 entryFree 在 A1 前版本計入的 droppedEntries 已虛高——回收：掃描成功區間
    // 完整覆蓋的 entryFree 起點，凡「失敗 entryFree ⊂ 成功 entry」者由 droppedEntries 抵扣。
    // 實作：A1 掃描已不計失敗 entryFree（else 空分支），此處僅保留註釋說明；
    // buildArticle 內部解析異常仍如實計數（真丟條）。
    void consumed;
    return out;
  }

  private familyName(block: string): string {
    const orth = block.match(/<orth\b[^>]*>([\s\S]*?)<\/orth>/);
    return orth ? textOf(orth[1]) : '(word family)';
  }

  /** 單條目 → article；keys=[lemma…, variant…]；解析異常丟條計數。 */
  private buildArticle(entryXml: string, docXml: string): Lex0Article | null {
    try {
      const openTag = entryXml.match(/<entry\b[^>]*>/)?.[0] || '';
      const xmlId = attr(openTag, 'xml:id');
      const entryLang = attr(openTag, 'xml:lang') || '';
      const type = attr(openTag, 'type');
      // 條目體：剝掉嵌套 entry 後的主體（headword 取最頂層 form；體渲染含嵌套）
      const renderer = new EntryRenderer(this.warnings, this.charDecl);
      const hw = renderer.renderHeadword(entryXml);
      renderer.entryHw = textOf(hw) || renderer.entryHw; // TEI 10.4：oRef/pRef 佔位用
      const body = renderer.renderTopGrams(entryXml);
      renderer.renderBody(entryXml, 0, '');
      let html = renderer.result();
      if (!html.trim()) return null;
      html =
        `<div class="li-lex0-entry"${entryLang ? ` data-lang="${esc(entryLang)}"` : ''}>` +
        `<div class="li-lex0-hw-line">${hw}${body ? ' ' + body : ''}</div>` +
        html +
        `</div>`;
      // keys：lemma orth + variant orth + inflected expand
      const keys: string[] = [];
      const lemmaRe = /<form\b[^>]*type="lemma"[^>]*>([\s\S]*?)<\/form>/g;
      let lm: RegExpExecArray | null;
      while ((lm = lemmaRe.exec(entryXml))) {
        // 內文式優先；自閉合 <orth value="leleti"/>（MSS.leleti 實錘）退而取 value/expand 屬性
        const orthM = lm[1].match(/<orth\b[^>]*>([\s\S]*?)<\/orth>/);
        const orthOpen = lm[1].match(/<orth\b[^>]*>/)?.[0] || '';
        const k = (orthM ? textOf(orthM[1]) : '') || attr(orthOpen, 'value') || attr(orthOpen, 'expand') || '';
        if (k && !keys.includes(k)) keys.push(k);
        // segmented lemma（<seg>Fluss</seg><seg>schifffahrt</seg>）：追加無空格拼接鍵
        if (k && k.includes(' ') && /<orth\b[^>]*segmented/.test(lm[1])) {
          const joined = k.replace(/ /g, '');
          if (joined && !keys.includes(joined)) keys.push(joined);
        }
      }
      // variant / inflected forms（頂層 form，type 非 lemma）。
      // inflected 慣例：<orth extent="suffix" expand="abecedy">-y</orth>——expand 屬性
      // 是完整詞形（正確索引鍵），自闭合/带属性 orth 不带内文时优先取 expand。
      const topForms = stripNestedEntries(entryXml);
      const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/g;
      let fm: RegExpExecArray | null;
      while ((fm = formRe.exec(topForms))) {
        const openF = `<form${fm[1]}>`;
        const ftype = attr(openF, 'type') || '';
        if (ftype === 'lemma') continue;
        const orthOpen = fm[2].match(/<orth\b[^>]*>/)?.[0] || '';
        const expand = attr(orthOpen, 'expand') || '';
        // 一個 form 可含多個 orth 變體（koktai：type="full" 帶注音＋type="no-zhuyin" 純字）——全部收鍵
        const allOrths: string[] = [];
        if (expand) allOrths.push(expand);
        const orthAllRe = /<orth\b([^>]*)>([\s\S]*?)<\/orth>/g;
        let om2: RegExpExecArray | null;
        while ((om2 = orthAllRe.exec(fm[2]))) {
          const inner = textOf(om2[2]) || attr(`<orth${om2[1]}>`, 'value') || '';
          if (inner) allOrths.push(inner);
        }
        if (!allOrths.length) {
          const sv = attr(orthOpen, 'value') || '';
          if (sv) allOrths.push(sv);
        }
        for (const k of allOrths) {
          if (k && !keys.includes(k)) keys.push(k);
        }
        // segmented orth（<seg>Fluss</seg><seg>schifffahrt</seg>）：追加無空格拼接鍵
        const segInner = fm[2].match(/<orth\b[^>]*segmented[^>]*>([\s\S]*?)<\/orth>/)?.[1] || '';
        if (segInner.includes(' ')) {
          const joined = textOf(segInner).replace(/ /g, '');
          if (joined && !keys.includes(joined)) keys.push(joined);
        }
      }
      if (!keys.length) {
        this.warnings.missingHeadword++;
        return null;
      }
      void docXml;
      return { keys, html, entryType: type || undefined, xmlId: xmlId || undefined };
    } catch {
      this.warnings.droppedEntries++;
      return null;
    }
  }

  get title(): string {
    return this.meta.title;
  }

  get entryCount(): number {
    return this.articles.length;
  }

  lookupAll(word: string): Lex0Article[] {
    this.ensureIndex(); // v0.1.44：deserialize 還原後索引惰性重建
    const idxs = this.index.get(word.toLowerCase().trim());
    if (!idxs) return [];
    return idxs.map((i) => this.articles[i]);
  }

  prefix(word: string, limit = 30): string[] {
    this.ensureIndex(); // v0.1.44：同上
    const w = word.toLowerCase().trim();
    if (!this.sortedKeys) this.sortedKeys = Array.from(this.index.keys()).sort();
    const [s, e] = prefixRange(this.sortedKeys, w);
    const out: string[] = [];
    const end = Math.min(e, s + limit);
    for (let i = s; i < end; i++) out.push(this.sortedKeys[i]);
    return out;
  }
}

/** 剝掉嵌套 <entry>…</entry>（供頂層 form 提取）。
 *  注意：entryXml 自身以 <entry 開頭——lazy 匹配會把整條剝掉，
 *  故從首個開標籤之後起剝，並保留開標籤本體。 */
function stripNestedEntries(entryXml: string): string {
  const open = entryXml.match(/<entry\b[^>]*>/)?.[0] || '';
  const head = entryXml.slice(0, open.length);
  let s = entryXml.slice(open.length);
  for (;;) {
    const next = s.replace(/<entry\b[^>]*>[\s\S]*?<\/entry>/, '<li-entry-stripped/>');
    if (next === s) break;
    s = next;
  }
  return head + s;
}
