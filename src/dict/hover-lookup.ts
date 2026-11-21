import { docCreateEl } from "../dom-win";
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — hover lookup popup (v1.3 flagship).
 * Assembled from the best patterns in the ecosystem:
 *  - word detection: Intl.Segmenter + caretRangeFromPoint (ntsiris wordDetection)
 *  - scheduling: 450ms delay with pending-singleton (lexibridge VirtualLinkHoverScheduler)
 *  - positioning: below-cursor with viewport flip (ntsiris popup.ts)
 *  - lifecycle: pin-on-click, leave grace period, race-guarded responses (ntsiris main.ts)
 */

import { getWordAtOffsetFromPoint } from './word-detection-dom';
// lilium: 直排座標服務（階段 3）——取代原本純水平的 position() 邏輯
// lilium: 直排座標服務（階段 3）——統一指向 lilium 的 shared/vertical-anchor
import { applyPopupPosition, observeWritingModeChanges } from '../shared/vertical-anchor';

const HOVER_DELAY_MS = 450;
const LEAVE_GRACE_MS = 200;
// lilium: POPUP_OFFSET 已由 vertical-anchor.ts 的 POPUP_GAP(=6) 承接

export type TriggerKey = 'off' | 'ctrl' | 'alt' | 'shift' | 'meta';

export interface HoverLookupOptions {
  enabled: boolean;
  trigger: TriggerKey;
  maxWordLength: number;
  /**
   * 當前筆記的 Intl.Segmenter locale（由 DictFeature 按文種提供）。
   * 返回 undefined 時沿用運行時默認斷詞（與舊行爲一致）。
   * 這是「寫作系統 ⇄ 辭典」聯動的入口：蒙古文筆記查蒙古詞、漢文筆記查漢詞，
   * 詞界都按當前文種切。
   */
  localeProvider?: () => string | undefined;
  onLookup: (word: string, popup: HoverPopupHandle) => void;
  /** 排查修復：固定提示文案（i18n 由呼叫端注入——本檔禁硬編碼語言）。 */
  pinHintProvider?: () => string;
}

export interface HoverPopupHandle {
  setBody(html: string): void;
  setLoading(): void;
  setError(msg: string): void;
}

interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export class HoverLookupController {
  private opts: HoverLookupOptions;
  private doc: Document | null = null;
  private popupEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private anchorRect: RectLike | null = null;
  /** lilium: 詞所在元素，供直排上下文判定；無則退化為橫排行為 */
  private anchorEl: HTMLElement | null = null;
  /** lilium: 直排↔橫排切換監聽的取消函式 */
  private layoutWatcher: (() => void) | null = null;
  private pinned = false;
  private hoverTimer: number | null = null;
  private leaveTimer: number | null = null;
  private currentWord = '';
  private listeners: Array<() => void> = [];
  /** lookup token for race protection (ntsiris pattern) */
  private lookupToken = 0;

  constructor(opts: HoverLookupOptions) {
    this.opts = opts;
  }

  attach(doc: Document): void {
    this.detach();
    this.doc = doc;
    const onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    const onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide();
    };
    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('mousedown', onMouseDown, true);
    doc.addEventListener('keydown', onKey, true);
    this.listeners.push(() => doc.removeEventListener('mousemove', onMouseMove, true));
    this.listeners.push(() => doc.removeEventListener('mousedown', onMouseDown, true));
    this.listeners.push(() => doc.removeEventListener('keydown', onKey, true));
  }

  detach(): void {
    // lilium 先撤掉排版切換監聽，避免在 detach 後仍觸發 position()
    if (this.layoutWatcher) { this.layoutWatcher(); this.layoutWatcher = null; }
    for (const off of this.listeners) off();
    this.listeners = [];
    this.hide();
    this.doc = null;
  }

  setOptions(opts: Partial<HoverLookupOptions>): void {
    this.opts = { ...this.opts, ...opts };
    if (!this.opts.enabled) this.hide();
  }

  private modifierHeld(e: MouseEvent): boolean {
    const t = this.opts.trigger;
    if (t === 'off') return false;
    if (t === 'ctrl') return e.ctrlKey || e.metaKey;
    if (t === 'alt') return e.altKey;
    if (t === 'shift') return e.shiftKey;
    if (t === 'meta') return e.metaKey;
    return false;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.opts.enabled) return;
    // mouse inside our own popup keeps it alive
    if (this.popupEl && (e.target === this.popupEl || this.popupEl.contains(e.target as Node))) {
      return;
    }
    if (this.pinned) return;
    if (!this.modifierHeld(e)) {
      // cursor left the word: schedule hide with grace
      if (this.popupEl && !this.leaveTimer) {
        this.leaveTimer = window.setTimeout(() => {
          this.leaveTimer = null;
          if (!this.pinned) this.hide();
        }, LEAVE_GRACE_MS);
      }
      return;
    }
    if (this.leaveTimer) {
      window.clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
    if (this.hoverTimer !== null) window.clearTimeout(this.hoverTimer);
    const x = e.clientX;
    const y = e.clientY;
    const doc = this.doc;
    if (!doc) return;
    this.hoverTimer = window.setTimeout(() => {
      this.hoverTimer = null;
      this.triggerAt(x, y, doc);
    }, HOVER_DELAY_MS);
  }

  /** Detect the word at a viewport point and start lookup */
  private triggerAt(x: number, y: number, doc: Document): void {
    const locale = this.opts.localeProvider?.();
    const hit = getWordAtOffsetFromPoint(doc, x, y, locale);
    if (!hit) return;
    if (hit.word.length > this.opts.maxWordLength) return;
    if (hit.word === this.currentWord && this.popupEl) return; // same word, keep popup
    this.currentWord = hit.word;
    this.anchorRect = hit.rect;
    this.anchorEl = hit.element ?? null;
    // lilium: 直排↔橫排切換後重新量測並重定位（lilium 兩種排版皆可寫，切換會改變佈局）
    if (this.anchorEl && !this.layoutWatcher) {
      this.layoutWatcher = observeWritingModeChanges(this.anchorEl, (a) => {
        // 切換後詞的位置會變，必須用新矩形而非快取的舊值
        if (a) {
          this.anchorRect = {
            left: a.rect.left, right: a.rect.right, top: a.rect.top, bottom: a.rect.bottom,
            width: a.rect.right - a.rect.left, height: a.rect.bottom - a.rect.top,
          };
        }
        this.position();
      });
    }
    // r59 批次乙：死代碼刪除——158 行已賦值，此處重複賦值無效果
    this.showPopup();
    const token = ++this.lookupToken;
    this.opts.onLookup(hit.word, {
      setLoading: () => {
        if (token === this.lookupToken) this.setBodyHtml('<div class="udh-loading">…</div>');
      },
      setBody: (html) => {
        if (token === this.lookupToken) this.setBodyHtml(html);
      },
      setError: (msg) => {
        // 動態文本（取詞/異常訊息）不得直接拼進 innerHTML——
        // 與本檔 renderHits 的 esc() 同模式，守住「不向 innerHTML 拼接動態文本」紀律。
        if (token === this.lookupToken) {
          const safe = String(msg)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
          this.setBodyHtml(`<div class="udh-error">${safe}</div>`);
        }
      },
    });
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.popupEl) return;
    if (this.popupEl.contains(e.target as Node)) {
      this.pinned = true; // click inside popup pins it
      return;
    }
    if (!this.modifierHeld(e)) this.hide();
  }

  private ensurePopup(): HTMLElement {
    const doc = this.doc || document;
    if (!this.popupEl || !doc.contains(this.popupEl)) {
      this.popupEl = docCreateEl(doc, "div");
      this.popupEl.className = 'li-hover-popup';
      this.bodyEl = docCreateEl(doc, "div");
      this.bodyEl.className = 'li-hover-body';
      const pinHint = docCreateEl(doc, "div");
      pinHint.className = 'li-hover-pin-hint';
      // r54 排查修復：文案走 i18n（pinHintProvider 注入），不再硬編碼簡中。
      pinHint.textContent = this.opts.pinHintProvider?.() ?? '点击弹窗固定 · esc 关闭';
      this.popupEl.appendChild(this.bodyEl);
      this.popupEl.appendChild(pinHint);
      doc.body.appendChild(this.popupEl);
    }
    if (!this.bodyEl) {
      this.bodyEl = this.popupEl.querySelector('.li-hover-body');
    }
    return this.popupEl;
  }

  private showPopup(): void {
    const el = this.ensurePopup();
    el.addClass('li-u-invisible');
    el.classList.add('is-visible');
  }

  private setBodyHtml(html: string): void {
    if (this.bodyEl) {
      // 離屏 <template> 解析後整體轉移：與 innerHTML 直設渲染等價
      // （template 的 body 語境解析結果一致，子節點順序不變、無事件綁定丟失——
      // 本彈窗內容不掛任何 inline 事件）。
      // 唯一 innerHTML 作用於**未掛載的 template**，非活文檔注入；html 僅來自
      // renderHits（動態文本全 esc()）/本檔字面模板（setError 已轉義），setBody
      // 回調唯一外部入口為 plugin.ts renderHits 管線——審計 v2.9.148。
       
      const parsed = new (this.doc || document).defaultView!.DOMParser().parseFromString(html, "text/html");
      const tpl = parsed.body; // 離屏解析（DOMParser 文檔永不掛載），等價 template 離屏解析
      this.bodyEl.replaceChildren(...Array.from(tpl.childNodes));
    }
    this.position();
  }

  /**
   * lilium: 交由直排座標服務計算（階段 3）。
   *
   * 原邏輯（below-anchor + viewport flip，ntsiris popup.ts:216-245）為純水平設計，
   * 在直排下會把彈窗壓在同列後續文字上。新邏輯：
   *   - 橫排：座標與原邏輯逐像素一致（test/vertical-anchor.mjs 零回歸門禁）
   *   - 直排：置於換列方向側（vertical-rl → 左，vertical-lr → 右），不遮閱讀流
   *   - 錨點溢出視口時額外鉗制（修正原邏輯的溢出缺陷）
   *   - 直排↔橫排切換後自動重新定位（body 類 / CSS 變數 / resize 監聽）
   * `POPUP_OFFSET` 常數已由 vertical-anchor.ts 的 POPUP_GAP 承接，此處不再使用。
   */
  private position(): void {
    if (!this.popupEl || !this.anchorRect) return;
    // 錨點失效（切換佈局後 DOM 重建、元素被移除）→ 隱藏而非錯位顯示
    if (!applyPopupPosition(this.popupEl, this.anchorRect, this.anchorEl)) {
      this.hide();
    }
  }

  hide(): void {
    if (this.hoverTimer !== null) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (this.leaveTimer !== null) {
      window.clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
    if (this.layoutWatcher) { this.layoutWatcher(); this.layoutWatcher = null; }
    this.popupEl?.remove();
    this.popupEl = null;
    this.bodyEl = null;
    this.anchorRect = null;
    this.pinned = false;
    this.currentWord = '';
  }

  /** Render compact hits into the popup (service LookupHit[] → html) */
  static renderHits(hits: Array<{ dictName: string; keyText: string; html: string }>, maxPerDict = 2): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parts: string[] = [];
    let lastDict = '';
    let shown = 0;
    for (const h of hits) {
      if (h.dictName !== lastDict) {
        if (lastDict) parts.push('</div>');
        parts.push(`<div class="udh-dict">${esc(h.dictName)}</div><div class="udh-defs">`);
        lastDict = h.dictName;
        shown = 0;
      }
      if (shown >= maxPerDict) continue;
      // compact: strip to text
      const text = h.html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // r54 排查修復：碼位級截斷（Array.from）——原 UTF-16 code unit slice 可切在
      // 代理對中間出孤立代理（SMP 文種字形顯示 �）。
      const cps = Array.from(text);
      const text2 = (cps.length > 220 ? cps.slice(0, 220).join('') : text);
      parts.push(`<div class="udh-def">${esc(text2)}${cps.length >= 220 ? '…' : ''}</div>`);
      shown++;
    }
    if (lastDict) parts.push('</div>');
    return parts.join('');
  }
}
