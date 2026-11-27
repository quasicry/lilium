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
  /**
   * pinned 彈窗記憶位置（方案 A：全彈窗共用一個記憶點）。
   * get：拖拽後的記憶位置；set：拖拽結束寫回。undefined＝尚無記憶（貼詞定位）。
   * 存取由呼叫端（plugin settings）承擔持久化；本檔不直接碰 data.json。
   */
  popupPosStore?: {
    get(): { x: number; y: number } | undefined;
    set(pos: { x: number; y: number }): void;
  };
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
  /** 拖拽中狀態（pointermove/up 掛 doc capture，pointerup 後清） */
  private drag: { offX: number; offY: number } | null = null;
  /** 拖拽後記憶的彈窗視口位置；pinned 顯示期間 position() 讓位給它 */
  private draggedPos: { x: number; y: number } | null = null;
  /**
   * 多彈窗並存：pin 過的彈窗在新查詢時「脫管」為獨立殘留窗——DOM 保留（事件
   * 已掛在元素上）、不隨後續懸停 hide、由 Esc 統一清除。方案裁定：
   * 點彈窗外不關閉任何 pin 窗；關閉只有兩個途徑＝Esc、detach（插件卸載）。
   */
  private detached: Array<{ el: HTMLElement }> = [];
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
      if (e.key === 'Escape') this.hideAll();
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
    this.hideAll();
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
    // 多彈窗並存：主窗已 pin（用戶點過彈窗）→ 脫管為殘留窗，主窗讓位給新查詢
    if (this.pinned && this.popupEl) {
      this.detached.push({ el: this.popupEl });
      this.popupEl = null;
      this.bodyEl = null;
      this.anchorRect = null;
      this.anchorEl = null;
      this.pinned = false;
      this.draggedPos = null;
      this.layoutWatcher?.();
      this.layoutWatcher = null;
    }
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
    // 158 行已賦值，此處重複賦值無效果
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
    if (this.popupEl && this.popupEl.contains(e.target as Node)) {
      this.pinned = true; // click inside popup pins it
      return;
    }
    // 多彈窗並存裁定：點彈窗外不關閉（pin 窗/殘留窗都留）；關閉只靠 Esc。
    // modifierHeld 檢查撤除——trigger 鍵僅用於「觸發懸停查詢」，不再兼關閉。
    void this.modifierHeld;
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
      // 排查修復：文案走 i18n（pinHintProvider 注入），不再硬編碼簡中。
      pinHint.textContent = this.opts.pinHintProvider?.() ?? '點擊彈窗固定 · esc 關閉';
      // topBar 拖把（方案 A）：pinHint 兼任——pinned 彈窗可拖拽自訂位置，
      // 記憶於 popupPosStore（跨詞共用）。pointerdown 排除按鈕（現無按鈕，規則防未來）。
      pinHint.addClass('li-hover-drag-handle');
      this.attachDrag(pinHint, doc);
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
    // 方案 A：曾拖拽過（記憶位置存在）→ 本次彈出先落在記憶點（pinned 生效後
    // position() 讓位）。未拖拽過＝undefined，維持貼詞定位（canonical 零變化）。
    const memo = this.opts.popupPosStore?.get();
    if (memo) this.draggedPos = { x: memo.x, y: memo.y };
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
      // 回調唯一外部入口為 plugin.ts renderHits 管線——審計。
       
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
  /**
   * B1 content bounds 偵測：找當前筆記「可讀文本欄」的視口座標水平邊界，
   * 供彈窗水平夾逼（不壓側欄/邊距）。偵測策略（從錨點元素向上找最近的可讀容器）：
   *   1. Obsidian 正文容器候選：.cm-scroller（編輯態）/.markdown-preview-view（閱讀態）
   *   2. 候選不可用（popout/測試環境）→ null（不夾逼，維持原視口 clamp）
   * 只取水平邊界；垂直方向彈窗本就貼詞定位，無需夾逼。
   */
  private detectContentBounds(): { left: number; right: number } | null {
    try {
      const el = this.anchorEl;
      if (!el || !el.isConnected) return null;
      const scroller = el.closest<HTMLElement>(".cm-scroller, .markdown-preview-view");
      if (!scroller) return null;
      const r = scroller.getBoundingClientRect();
      if (!Number.isFinite(r.left) || !Number.isFinite(r.right) || r.right - r.left < 40) return null;
      return { left: r.left, right: r.right };
    } catch {
      return null;
    }
  }

  /**
   * topBar 拖把拖拽（方案 A）：pointerdown 於把手（按鈕除外）啟動，
   * pointer capture 全程追蹤；pointermove 直改 fixed left/top 並記錄視口位置，
   * pointerup 寫回 popupPosStore（A 裁定：全彈窗共用一個記憶點）。
   * 移動端 Pointer Events 一手覆蓋（touch-action: none 於 CSS）。
   */
  private attachDrag(handle: HTMLElement, _doc: Document): void {
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!this.popupEl) return;
      // pointerdown 排除按鈕：把手內未來若加鈕，點鈕不啟動拖拽
      const t = e.target as HTMLElement;
      if (t.closest('button, a, input, [role="button"]')) return;
      const r = this.popupEl.getBoundingClientRect();
      this.drag = { offX: e.clientX - r.left, offY: e.clientY - r.top };
      handle.addClass('is-dragging');
      try { handle.setPointerCapture(e.pointerId); } catch { /* 容錯：capture 失敗仍可拖 */ }
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.drag || !this.popupEl) return;
      // 視口夾逼（防拖出屏外）：留 24px 可抓邊
      const vw = (this.doc?.defaultView ?? window).innerWidth;
      const vh = (this.doc?.defaultView ?? window).innerHeight;
      const x = Math.min(Math.max(e.clientX - this.drag.offX, 8), vw - 32);
      const y = Math.min(Math.max(e.clientY - this.drag.offY, 8), vh - 24);
      // 拖拽定位＝覆寫 position() 的計算結果：left/top 給實測座標，right/bottom 清權重
      //（官方審核規範：樣式設定走 setCssStyles，不直寫 style 屬性）。
      this.popupEl.setCssStyles({
        left: `${x}px`,
        top: `${y}px`,
        right: 'auto',
        bottom: 'auto',
      });
      this.draggedPos = { x, y };
    });
    const endDrag = (e: PointerEvent) => {
      if (!this.drag) return;
      this.drag = null;
      handle.removeClass('is-dragging');
      try { handle.releasePointerCapture(e.pointerId); } catch { /* 已釋放 */ }
      // 記憶（方案 A 裁定）：寫回呼叫端 settings（不 pin 也記，下次 pinned 用）
      if (this.draggedPos) this.opts.popupPosStore?.set(this.draggedPos);
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  private position(): void {
    if (!this.popupEl || !this.anchorRect) return;
    // 方案 A：拖拽過的 pinned 彈窗保持自訂位置（不隨內容更新被拉回貼詞）；
    // 記憶位置套用前做視口夾逼（螢幕變更防出界）。首次拖拽前行為逐字不變。
    if (this.pinned && this.draggedPos) {
      const vw = (this.doc?.defaultView ?? window).innerWidth;
      const vh = (this.doc?.defaultView ?? window).innerHeight;
      const x = Math.min(Math.max(this.draggedPos.x, 8), Math.max(vw - 32, 8));
      const y = Math.min(Math.max(this.draggedPos.y, 8), Math.max(vh - 24, 8));
      // 記憶位置套用：與拖拽即時段同一組屬性（官方審核規範：樣式設定走 setCssStyles）。
      this.popupEl.setCssStyles({
        left: `${x}px`,
        top: `${y}px`,
        right: 'auto',
        bottom: 'auto',
      });
      return;
    }
    // 錨點失效（切換佈局後 DOM 重建、元素被移除）→ 隱藏而非錯位顯示
    if (!applyPopupPosition(this.popupEl, this.anchorRect, this.anchorEl, this.detectContentBounds() ?? undefined)) {
      this.hide();
    }
  }

  /** Esc 統一關閉：殘留窗全部＋主窗 */
  hideAll(): void {
    for (const d of this.detached) d.el.remove();
    this.detached = [];
    this.hide();
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
    this.drag = null;
    this.draggedPos = null;
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
      // 排查修復：碼位級截斷（Array.from）——原 UTF-16 code unit slice 可切在
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
