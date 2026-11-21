// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — PNG share renderer.
 * Renders lookup hits into an offscreen canvas (word header + article cards)
 * without DOM access — pure canvas 2D so it works on mobile too.
 */

import { LookupHit } from './service';
import { t, LangCode } from '../i18n';

const W = 900;
const PAD = 36;
const CARD_GAP = 18;

interface DrawnSpan {
  text: string;
  color: string;
  bg: string | null;
  bold: boolean;
  size: number;
}

interface DrawnLine {
  spans: DrawnSpan[];
  gap: number;
}

interface DrawnCard {
  lines: string[];
  dictName: string;
  rich?: DrawnLine[];
  images?: Array<{ src: string; lineIdx: number }>;
}

function escapeStrip(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const INLINE_COLOR_RE = /(?:^|;)\s*color\s*:\s*([^;]+)/;
const INLINE_BG_RE = /(?:^|;)\s*(?:background(?:-color)?|BACKGROUND)\s*:\s*([^;]+)/;
/** 驗證並規範化 CSS 顏色（去 !important；非法值回 null——canvas fillStyle 賦無效值會靜默保留舊值造成色條）。 */
function safeColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.replace(/\s*!important\s*/i, '').trim();
  // C4：白名單驗證——hex / rgb(a) / hsl(a) / CSS 命名色；其餘一律拒絕
  //（canvas fillStyle 對無效值靜默保留舊值；不用 CSS.supports 以免依賴 DOM 環境）。
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^rgba?\(/i.test(v)) return v;
  if (/^hsla?\(/i.test(v)) return v;
  if (/^[a-zA-Z]+$/.test(v)) return v;
  return null;
}
const INLINE_FW_RE = /(?:^|;)\s*font-weight\s*:\s*([^;]+)/;
const INLINE_FS_RE = /(?:^|;)\s*font-size\s*:\s*([\d.]+)\s*(px|pt|em|rem)?/i;

function flattenInline(el: Element, carry: { color: string | null; bg: string | null; bold: boolean; size: number | null }): { color: string | null; bg: string | null; bold: boolean; size: number | null } {
  const style = el.getAttribute('style') || '';
  const out = { ...carry };
  const cm = INLINE_COLOR_RE.exec(style);
  if (cm && !/^(inherit|currentColor)$/i.test(cm[1].trim())) {
    const c = safeColor(cm[1]);
    if (c) out.color = c;
  }
  const bm = INLINE_BG_RE.exec(style);
  if (bm && !/^(none|transparent|inherit)$/i.test(bm[1].trim())) {
    const c = safeColor(bm[1]);
    if (c) out.bg = c;
  }
  const wm = INLINE_FW_RE.exec(style);
  if (wm && /^(bold|[6-9]00)$/i.test(wm[1].trim())) out.bold = true;
  const tag = el.tagName.toLowerCase();
  if (tag === 'b' || tag === 'strong') out.bold = true;
  const sm = INLINE_FS_RE.exec(style);
  if (sm) {
    const n = parseFloat(sm[1]);
    const unit = (sm[2] || 'px').toLowerCase();
    out.size = unit === 'pt' ? (n * 4) / 3 : unit === 'em' || unit === 'rem' ? n * 15 : n;
  }
  return out;
}

/** styled html → 富文本行（inline style color/bg/weight/size）＋ vault 圖片列表。 */
function extractRich(html: string): { lines: DrawnLine[]; images: Array<{ src: string; lineIdx: number }> } {
  const lines: DrawnLine[] = [];
  const images: Array<{ src: string; lineIdx: number }> = [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(`<div id="li-png-root">${html}</div>`, 'text/html');
  } catch {
    return { lines, images };
  }
  const root = doc.getElementById('li-png-root');
  if (!root) return { lines, images };
  const pushLine = (spans: DrawnSpan[], gap = 6) => {
    if (spans.some((s) => s.text.trim())) lines.push({ spans, gap });
  };
  const walk = (el: Element, carry: { color: string | null; bg: string | null; bold: boolean; size: number | null }) => {
    const tag = el.tagName.toLowerCase();
    const style = flattenInline(el, carry);
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (src && !/^(data:|https?:)/.test(src)) images.push({ src: decodeURIComponent(src), lineIdx: lines.length });
      return;
    }
    if (tag === 'br') {
      pushLine([]);
      return;
    }
    const blockish = /^(div|p|li|tr|h[1-6]|blockquote|section)$/.test(tag);
    if (blockish) {
      // 行頭：bg 條（zr 橙底白字型）自己起一個 span 行
      if (tag === 'li') {
        walkChildren(el, style, (spans) => pushLine(spans));
        return;
      }
      const spans: DrawnSpan[] = [];
      collectSpans(el, style, spans, images, lines.length);
      pushLine(spans, tag.startsWith('h') ? 14 : 8);
      return;
    }
    // inline 節點：包一個虛擬行（僅當 root 直下 text）
    const spans: DrawnSpan[] = [];
    collectSpans(el, style, spans, images, lines.length);
    pushLine(spans);
  };
  const walkChildren = (el: Element, carry: { color: string | null; bg: string | null; bold: boolean; size: number | null }, lineOut?: (spans: DrawnSpan[]) => void) => {
    if (/position\s*:\s*absolute/i.test(el.getAttribute('style') || '')) return;
    if (el.classList.contains('zitou') || el.classList.contains('zitou2')) return;
    let cur: DrawnSpan[] = [];
    const flush = () => {
      if (lineOut) lineOut(cur);
      else pushLine(cur);
      cur = [];
    };
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        const txt = (node.textContent || '').replace(/\s+/g, ' ');
        if (txt.trim()) cur.push({ text: txt, color: carry.color || '#2a2f36', bg: carry.bg, bold: carry.bold, size: carry.size || 15 });
      } else if (node.nodeType === 1) {
        const c = node as Element;
        if (c.tagName.toLowerCase() === 'br') {
          flush();
          continue;
        }
        if (c.tagName.toLowerCase() === 'img') {
          const src = c.getAttribute('src') || '';
          if (src && !/^(data:|https?:)/.test(src)) images.push({ src: decodeURIComponent(src), lineIdx: lines.length });
          continue;
        }
        const sub = flattenInline(c, carry);
        collectSpans(c, sub, cur, images, lines.length);
      }
    }
    flush();
  };
  const collectSpans = (el: Element, carry: { color: string | null; bg: string | null; bold: boolean; size: number | null }, out: DrawnSpan[], imgs: Array<{ src: string; lineIdx: number }>, lineIdx: number) => {
    // POSITION:absolute（廣韻 zitou/zitou2 裝飾字頭，absolute 在配套 CSS class 裡）在 canvas 無定位語義——跳過，避免疊印
    if (/position\s*:\s*absolute/i.test(el.getAttribute('style') || '')) return;
    if (el.classList.contains('zitou') || el.classList.contains('zitou2')) return;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        const txt = (node.textContent || '').replace(/\s+/g, ' ');
        if (txt.trim()) out.push({ text: txt, color: carry.color || '#2a2f36', bg: carry.bg, bold: carry.bold, size: carry.size || 15 });
      } else if (node.nodeType === 1) {
        const c = node as Element;
        if (c.tagName.toLowerCase() === 'img') {
          const src = c.getAttribute('src') || '';
          if (src && !/^(data:|https?:)/.test(src)) imgs.push({ src: decodeURIComponent(src), lineIdx });
          continue;
        }
        if (c.tagName.toLowerCase() === 'br') {
          out.push({ text: '\n', color: carry.color || '#2a2f36', bg: null, bold: false, size: carry.size || 15 });
          continue;
        }
        collectSpans(c, flattenInline(c, carry), out, imgs, lineIdx);
      }
    }
  };
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 1) walk(node as Element, { color: null, bg: null, bold: false, size: null });
    else if (node.nodeType === 3 && (node.textContent || '').trim()) {
      pushLine([{ text: (node.textContent || '').replace(/\s+/g, ' '), color: '#2a2f36', bg: null, bold: false, size: 15 }]);
    }
  }
  return { lines, images };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    let line = '';
    for (const ch of rawLine) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

/** Render hits to a PNG Uint8Array. encode via canvas.toBlob. */
export async function renderToPng(
  word: string,
  hits: Array<Pick<LookupHit, 'dictName' | 'html'> & { keyText?: string }>,
  _assetUrl: (vaultPath: string) => string,
  readVaultBinary?: (vaultPath: string) => Promise<ArrayBuffer>,
  uiLang?: LangCode,
): Promise<Uint8Array> {
  const meas = createEl('canvas').getContext('2d')!;
  // Doulos SIL 內嵌字體：canvas 渲染前須確保 @font-face 已載入（document.fonts.load），
  // 否則首幀測寬/繪製仍回退系統字體（IPA 音標豆腐）。載入失敗不攔截——回退原字體棧。
  try { await (document as Document & { fonts: FontFaceSet }).fonts.load('15px "Doulos SIL"'); } catch { /* 回退系統字體 */ }
  const bodyFont = '15px -apple-system, "Segoe UI", "Noto Sans SC", "Doulos SIL", sans-serif';
  const dictFont = '600 12px -apple-system, "Doulos SIL", sans-serif';
  const wordFont = '700 30px -apple-system, "Noto Sans SC", "Doulos SIL", sans-serif';

  meas.font = bodyFont;
  const innerW = W - PAD * 2 - 24;

  // prepare card text
  const cards: DrawnCard[] = [];
  let lastDict = '';
  for (const hit of hits.slice(0, 8)) {
    if (hit.dictName !== lastDict) {
      lastDict = hit.dictName;
    }
    const text = escapeStrip(hit.html) || hit.keyText || '';
    const lines = wrap(meas, text, innerW).slice(0, 40);
    // 樣式渲染分支：inline style 富文本行＋vault 圖片（廣韻 zr/zitou 等在 PNG 復現）
    let rich: DrawnLine[] | undefined;
    let images: Array<{ src: string; lineIdx: number }> | undefined;
    if (/style="/i.test(hit.html) || /<img/i.test(hit.html)) {
      const ex = extractRich(hit.html);
      if (ex.lines.length) rich = ex.lines;
      if (ex.images.length) images = ex.images;
    }
    cards.push({ lines, dictName: hit.dictName, rich, images });
  }

  // measure total height
  meas.font = bodyFont;
  const lineH = 22;
  let height = PAD + 48 + 16; // header
  for (const card of cards) {
    const richN = card.rich ? card.rich.reduce((a, l) => a + Math.max(1, Math.ceil(l.spans.reduce((w, s) => w + s.text.length, 0) / 46)), 0) : 0;
    const imgN = card.images ? card.images.length : 0;
    const rowN = Math.max(card.lines.length, richN) + imgN;
    height += 30 + rowN * lineH + imgN * 24 + 20 + CARD_GAP;
  }
  height += PAD;
  height = Math.min(height, 8000);

  const canvas = createEl('canvas');
  // 2x for crispness
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, height);
  // subtle border
  ctx.strokeStyle = '#e8e8e8';
  ctx.strokeRect(0.5, 0.5, W - 1, height - 1);

  // header band
  ctx.fillStyle = '#f6f7fb';
  ctx.fillRect(0, 0, W, 88);
  ctx.fillStyle = '#1f2328';
  ctx.font = wordFont;
  ctx.fillText(truncate(ctx, word, W - PAD * 2 - 120), PAD, 52);
  ctx.font = dictFont;
  ctx.fillStyle = '#8a929e';
  const dictsUsed = new Set(hits.map((h) => h.dictName)).size;
  // A6：分享圖語言隨界面語言（uiLang 參數，回退 zh-TW）——文案用 i18n dict.results
  const resultsLine = t(uiLang || 'zh-TW', 'dict.results', { n: hits.length, d: dictsUsed });
  ctx.fillText(`${resultsLine} · lilium`, PAD, 74);

  // cards
  let y = 104 + 16;
  lastDict = '';
  for (const card of cards) {
    // dict badge
    if (card.dictName !== lastDict) {
      lastDict = card.dictName;
      ctx.font = dictFont;
      const badgeW = ctx.measureText(card.dictName).width + 20;
      ctx.fillStyle = '#eef1f6';
      roundRect(ctx, PAD, y, badgeW, 22, 5);
      ctx.fill();
      ctx.fillStyle = '#5b6472';
      ctx.fillText(card.dictName, PAD + 10, y + 15);
      y += 30;
    }
    // body：rich（inline 樣式）優先，fallback 純文本。
    // 流式排版：span 逐個測寬、超出右邊界換行；行高由行內最大字號決定（解決大字號交疊）。
    const bodyTop = y;
    const maxX = W - PAD - 12;
    const layoutLine = (spans: DrawnSpan[]): number => {
      // 返回繪製的行數；字號鉗制 11..26（廣韻 zitou 巨字號在圖中壓回可讀尺寸）
      let rows = 0;
      let x = PAD + 12;
      let rowMax = 0;
      const drawRow = () => {
        if (rowMax > 0) { y += rowMax + 6; rows++; }
        x = PAD + 12;
        rowMax = 0;
      };
      for (const span of spans) {
        if (span.text === '\n') { drawRow(); continue; }
        const size = Math.min(17, Math.max(13, span.size && span.size > 0 ? span.size : 15)); // 字號統一鉗 13..17——辭典自帶 inline 字號差異過大（zitou 巨字/小注 9px），PNG 內統一可讀尺寸
        ctx.font = `${span.bold ? '700' : '400'} ${Math.round(size)}px -apple-system, "Segoe UI", "Noto Sans SC", "Doulos SIL", sans-serif`;
        let text = span.text;
        // 長 span 單字層切（超過可用寬的連續文本按寬度切）
        while (text.length) {
          let take = text.length;
          while (take > 1 && ctx.measureText(text.slice(0, take)).width > maxX - x) take = Math.max(1, Math.floor(take * (maxX - x) / Math.max(1, ctx.measureText(text.slice(0, take)).width)));
          const seg = text.slice(0, take);
          const tw = ctx.measureText(seg).width;
          if (x > PAD + 12 && x + tw > maxX) drawRow();
          if (span.bg) {
            ctx.fillStyle = span.bg;
            ctx.fillRect(x - 2, y + 2, tw + 4, Math.max(18, size + 4));
          }
          ctx.fillStyle = span.color || '#2a2f36';
          ctx.fillText(seg, x, y + Math.max(16, size + 1));
          x += tw;
          rowMax = Math.max(rowMax, Math.max(18, size + 4));
          text = text.slice(take);
          if (x >= maxX) drawRow();
        }
      }
      drawRow();
      return Math.max(rows, 1);
    };
    if (card.rich && card.rich.length) {
      /* 圖片在原位——img.lineIdx 記錄的是提取時的行索引，逐行渲染後即時畫該行錨定的圖片，
         不再全部追加到卡片末尾（舊行為圖片全部擠在卡尾）。 */
      const imgsByLine = new Map<number, Array<{ src: string }>>();
      for (const img of card.images || []) {
        const arr = imgsByLine.get(img.lineIdx) || [];
        arr.push(img);
        imgsByLine.set(img.lineIdx, arr);
      }
      const drawImagesAt = async (lineIdx: number): Promise<number> => {
        let n = 0;
        for (const img of imgsByLine.get(lineIdx) || []) {
          if (y > height - PAD - 60) break;
          try {
            if (readVaultBinary) {
              const buf = await readVaultBinary(img.src);
              const blob = new Blob([buf], { type: 'image/png' });
              const bmp = await createImageBitmap(blob);
              const ih = Math.min(bmp.height, 48);
              const iw = (bmp.width / bmp.height) * ih;
              ctx.drawImage(bmp, PAD + 12, y, iw, ih);
              y += ih + 6;
              n++;
            }
          } catch { /* 讀圖失敗跳過 */ }
        }
        imgsByLine.delete(lineIdx);
        return n;
      };
      for (let li = 0; li < card.rich.length; li++) {
        if (y > height - PAD - 40) break;
        layoutLine(card.rich[li].spans);
        await drawImagesAt(li);
      }
      // 殘餘未錨定圖片（lineIdx 超出行數）——卡尾補畫
      for (const [ , arr] of imgsByLine) {
        for (const img of arr) {
          if (y > height - PAD - 60) break;
          try {
            if (readVaultBinary) {
              const buf = await readVaultBinary(img.src);
              const blob = new Blob([buf], { type: 'image/png' });
              const bmp = await createImageBitmap(blob);
              const ih = Math.min(bmp.height, 48);
              const iw = (bmp.width / bmp.height) * ih;
              ctx.drawImage(bmp, PAD + 12, y, iw, ih);
              y += ih + 6;
            }
          } catch { /* 讀圖失敗跳過 */ }
        }
      }
    } else {
      ctx.font = bodyFont;
      ctx.fillStyle = '#2a2f36';
      let i = 0;
      for (const line of card.lines) {
        ctx.fillText(line, PAD + 12, y + 16 + i * lineH);
        i++;
      }
      y += card.lines.length * lineH;
    }
    y += 20;
    // card border
    const cardH = y - bodyTop - 20;
    ctx.strokeStyle = '#eceef2';
    ctx.strokeRect(PAD, bodyTop - 6, W - PAD * 2, cardH + 26);
    y += CARD_GAP;
    if (y > height - PAD - 40) break;
  }

  // footer
  ctx.font = dictFont;
  ctx.fillStyle = '#b3bac4';
  ctx.fillText(new Date().toLocaleString(), PAD, height - PAD / 2);

  // 收縮畫布：實際內容高 y 可能遠小於預估 height——裁掉下方空白
  const usedH = Math.min(height, Math.round(y + PAD));
  let outCanvas = canvas;
  if (usedH < height - 40) {
    outCanvas = createEl('canvas');
    outCanvas.width = W * scale;
    outCanvas.height = usedH * scale;
    const octx = outCanvas.getContext('2d')!;
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    octx.drawImage(canvas, 0, 0);
  }
  const blob = await new Promise<Blob | null>((resolve) => outCanvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('canvas.toBlob failed');
  const buf = new Uint8Array(await blob.arrayBuffer());
  return buf;
}

function truncate(ctx: CanvasRenderingContext2D, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1);
  return out + '…';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
