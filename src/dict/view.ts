// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — Obsidian sidebar view.
 * multi-select dict scope, full-text & content search, bookmarks,
 * history, dict info editor, PNG share, dictionary manager panel.
 * S2 樣板：lookup / manage 兩面板已抽取為 panels.ts（LookupPanel / ManagePanel）。
 * S2 樣板：其餘面板照 LookupPanel 模式漸進抽取（bookmarks / history / corpus /
 * collation 暫留本檔，行為不變）。
 */

import { ASSET_FOLDER } from './loader';
import { docCreateEl } from '../dom-win';
import { decodeSpeexToWav } from './speex-decoder';
import { paliToSanskrit, looksLikePali, restoreRanjanaCodes, normalizeBuddhistChinese } from './buddhist';
import { rewriteResourceRefs } from './mdd-assets';
import { annotateVariants } from './variant-annotate';
import { liNotice } from '../ui-hig';
import { unsafeRegexReason } from './fulltext';
import { ItemView, WorkspaceLeaf, debounce, Menu, normalizePath, type EventRef } from 'obsidian';
import { inlineStyles } from './inline-style';
import { LILIUM_ICON_ID } from '../brand-lilium-icon';
import { attachVvFit } from './viewport-fit';
import { DictFeature } from './plugin';
import { sanitizeHtml, extractStyleBlocks } from './sanitize';
import { LookupHit, LiDict } from './service';
import { FullTextHandle } from './fulltext';
import { renderToPng } from './share';
import { fileTimestamp, exportMarkdownToVault } from './export';
import { convertChinese, fixChineseLineWrap, } from './zh-utils';
import { buildExternalSourceLinks } from './externals';
import { cssStringLiteral } from '../font-name';
import { bundledFontFaceCssForFrame, bundledFontFamilyTail } from '../bundled-fonts';
// 辭典文章 CSS 作用域 id（與導入期作用域化共用同一個，見 css-isolate.ts）。
import { dictScopeId } from './css-isolate';
import { buildBuddhistAwareLinks } from './buddhist-links';
import { buildLookupNote, identityHtml, normalizeEntryBlocks } from './note-builder';
import { requestUrl } from 'obsidian';
import { buildExportTables, sampleResults } from './search-settings';
import { renderTranslitPanel, resetTranslitSessionState } from './translit-panel';
import { Modal, App } from 'obsidian';
import { BookmarksPanel, HistoryPanel, LookupPanel, ManagePanel, type DictPanelCtx } from './panels';

export const VIEW_TYPE_UNIVERSAL_DICT = 'lilium-dict-view';

/* ==========================================================================
 * W8 焦點快照／還原
 * --------------------------------------------------------------------------
 * 辭典面板的 renderShell() 是「整塊重建」語義（contentEl.empty() 後重長），
 * 而它被呼叫的頻率遠比想像中高：查詞、切頁籤、開關詞典、導入完成……。
 * 每次重建都換掉輸入框的 DOM 實體，於是使用者的焦點與游標一起消失，
 * 瀏覽器再把新建的輸入框「捲進視野」——表現出來就是搜尋框自己動了一下。
 *
 * 這裡用「重建前快照、重建後還原」把狀態接回去；配合 renderSearch() 的同面板
 * DOM 復用（見該處），多數情況根本不會重建，雙保險。
 * ========================================================================== */

/** A3：原位 audio 播放器的 Blob URL 記錄（連結元素 → createObjectURL 產物），供重複點擊時 revoke。 */
const audioBlobUrls = new WeakMap<HTMLAnchorElement, string>();

interface FocusSnapshot {
  /** 首個 class 名（用來在重建後找回對應元素）。 */
  key: string;
  start: number | null;
  end: number | null;
  /** 容器滾動位置：focus() 會把元素捲進視野，這裡事後校正回來。 */
  scrollTop: number;
}

export function captureFocus(root: HTMLElement): FocusSnapshot | null {
  try {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !root.contains(el)) return null;
    const input = el as HTMLInputElement;
    return {
      key: (el.className || el.tagName || '').toString().split(/\s+/)[0] || '',
      start: typeof input.selectionStart === 'number' ? input.selectionStart : null,
      end: typeof input.selectionEnd === 'number' ? input.selectionEnd : null,
      scrollTop: root.scrollTop,
    };
  } catch {
    return null;
  }
}

export function restoreFocus(root: HTMLElement, snap: FocusSnapshot | null): void {
  if (!snap || !snap.key) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const el = root.querySelector('.' + snap.key) as HTMLInputElement | null;
    if (!el) return;
    // preventScroll：先別讓瀏覽器自己捲，下面統一還原成原本的 scrollTop。
    el.focus({ preventScroll: true });
    if (snap.start !== null && typeof el.setSelectionRange === 'function') {
      el.setSelectionRange(snap.start, snap.end ?? snap.start);
    }
    if (root.scrollTop !== snap.scrollTop) root.scrollTop = snap.scrollTop;
  } catch {
    /* 焦點還原是體驗增量，失敗不該打斷渲染 */
  }
}

export type Panel = 'lookup' | 'bookmarks' | 'history' | 'manage' | 'translit';

export class LiDictView extends ItemView {
  /** S8：引導卡會話內關閉標記（不持久化——零 schema 變更）。 */
  private onboardDismissed = false;
  private plugin: DictFeature;
  private query = '';
  private panel: Panel = 'lookup';
  /** W9-F：辭典 二級子分頁的當前/上次選中子項（查詢/歷史/書籤/管理）。top 不在 dict 時保留上次值。 */
  private subTab: Panel = 'lookup';
  private lastResults: Array<LookupHit & { dictId: string }> = [];
  private lastWord = '';
  private suggestions: string[] = [];
  private selectedIndex = -1;
  private ftHandle: FullTextHandle | null = null;
  /* 盤點補缺 B：全文搜尋選項跨重渲染記憶 */
  private ftOpt = { matchCase: false, wholeWords: false, useRegex: false };

  constructor(leaf: WorkspaceLeaf, plugin: DictFeature) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_UNIVERSAL_DICT;
  }

  getDisplayText(): string {
    return "Lilium";
  }

  getIcon(): string {
    // 蘭札體品牌圖示（與 ribbon 同機制：onload addIcon('lilium-brand')），
    // 取代內建 book-marked——同一面板兩處 icon 不再不一致。
    return LILIUM_ICON_ID;
  }

  async onOpen(): Promise<void> {
    this.renderShell();
    // 移動端軟鍵盤適配——覆蓋式鍵盤不縮 layout viewport，
    // 以 visualViewport 觀測收斂 .li-root（見 src/dict/viewport-fit.ts 頭註）。
    this.vvDetach = attachVvFit(this.contentEl, window);
    // 廣韻樣式晝夜自然過渡：主題切換（css-change）時按 lastResults 重填現存 frame，
    // 讓 darkCss（.zitou 洗色等）即時跟上；色彩 transition 由 UD_FRAME_CSS 的 body 過渡承擔。
    this.themeEv = this.plugin.app.workspace.on('css-change', () => this.refreshThemeFrames());
    this.registerEvent(this.themeEv);
  }

  async onClose(): Promise<void> {
    this.ftHandle?.cancel();
    this.vvDetach?.();
    this.vvDetach = null;
    if (this.themeEv) { this.plugin.app.workspace.offref(this.themeEv); this.themeEv = null; }
    // A5：onClose 必須斷開最後一個 ResizeObserver（fillFrame 只在「下一次 fill」時才
    // 斷舊例——關閉面板後 observer 連同其閉包（持 plugin/DOM 引用）會永久洩漏）；
    // 同處清 lastResults/pendingFrames，大辭典條目 HTML 不再跨面板生命週期常駐。
    // B10：debounce 在面板關閉後仍可能於 120ms 內觸發——cancel() 消掉關閉後活動。
    this.updateSuggestionsDebounced.cancel();
    for (const ro of this.frameRos.values()) ro.disconnect();
    this.frameRos.clear();
    this.frameLoadHandlers.clear(); // V-F4：load handler 記錄隨 frame 一併清空
    this.lastResults = [];
    this.pendingFrames = [];
    // 卡頓修復（legacy flat 分幀填充）：面板關閉後不再為舊 DOM 續排 fill 幀。
    this.flatFillCancelled = true;
    // B11：面板關閉即清轉寫面板的模組級會話狀態（大文本不跨生命週期駐留）。
    resetTranslitSessionState();
  }

  /** 卡頓修復：legacy flat 路徑（collapsible=false 或單命中）分幀 fill 的取消旗標。 */
  private flatFillCancelled = false;
  private flatFillScheduled = false;

  /**
   * 卡頓修復：legacy flat 渲染原先在單幀內同步 fillFrame 全部命中 iframe
   * （srcdoc 解析＋資源內聯每塊數十-數百 ms，N 塊同幀＝單幀卡死）。
   * 改為首塊同步（保證首屏立現），其餘建空殼＋dataset.filled 未設，
   * 用 requestIdleCallback（不支援則退 rAF）每幀/每空閒段填一塊。
   * 行為語義不變：全部最終都填，僅錯峰。
   */
  private queueFlatFill(
    items: Array<{ frame: HTMLIFrameElement; hit: LookupHit & { dictId: string } }>,
  ): void {
    const w = window as unknown as {
      requestIdleCallback?: (cb: (deadline: IdleDeadline) => void) => number;
      requestAnimationFrame: (cb: () => void) => number;
    };
    let idx = 0;
    const fillNext = (): void => {
      if (this.flatFillCancelled) { this.flatFillScheduled = false; return; }
      if (idx >= items.length) { this.flatFillScheduled = false; return; }
      const { frame, hit } = items[idx++];
      const fr = frame as HTMLIFrameElement & { dataset: Record<string, string> };
      if (fr.isConnected && !fr.dataset.filled) {
        fr.dataset.filled = '1';
        this.fillFrame(fr, hit.html, hit.keyText, hit.dictId);
      }
      if (idx >= items.length) { this.flatFillScheduled = false; return; }
      // 每次只排下一個：分幀逐塊，避免 N 塊同幀。
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => fillNext());
      else w.requestAnimationFrame(() => fillNext());
    };
    if (this.flatFillScheduled) this.flatFillCancelled = true; // 前一輪未跑完即被新查詢覆蓋 → 取消舊隊列
    this.flatFillCancelled = false;
    this.flatFillScheduled = true;
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => fillNext());
    else w.requestAnimationFrame(() => fillNext());
  }

  private vvDetach: (() => void) | null = null;

  private themeEv: EventRef | null = null;

  /** A3：↓MD 匯出檔名淨化——keyText 來自辭典條目，含 / : .. 等會拆層或寫出預期
   * 目錄之外（對照分享 PNG 同款 replace(/[/:*?"<>|]/g,'_')慣例，另防 '..' 上跳）。 */
  private mdFileName(keyText: string | undefined): string {
    const raw = keyText && keyText.trim() ? keyText : fileTimestamp();
    const safe = raw.replace(/[/:*?"<>|]/g, '_').replace(/\.\.+/g, '_').slice(0, 120) || fileTimestamp();
    return `${safe}-${fileTimestamp()}.md`;
  }

  /** A3：兩處 ↓MD 按鈕共用——淨化檔名後寫入筆記目錄。 */
  private async exportHitMarkdown(hit: LookupHit & { dictId: string }): Promise<void> {
    const styled = await this.copyStyledHtml(hit, hit.dictId, 'data');
    const file = `lilium/筆記/notes/${this.mdFileName((hit as { keyText?: string }).keyText)}`;
    await (this.plugin as unknown as { ensureFolder(p: string): Promise<void> }).ensureFolder(file);
    await this.plugin.app.vault.adapter.write(normalizePath(file), styled);
  }

  /** 主題切換：對所有現存詞條 frame 以原參數重跑 fillFrame（晝夜樣式即時過渡）。 */
  private refreshThemeFrames(): void {
    try {
      const frames = Array.from(this.contentEl.querySelectorAll<HTMLIFrameElement>('iframe.li-frame'));
      if (!frames.length || !this.lastResults.length) return;
      // C3：優先走 frame dataset.hitIndex 配對（結構化渲染時 renderResults 已掛），
      // 位置順序僅作 legacy 退路——避免「frames 順序 == lastResults 順序」的隱式耦合
      //（未來在 lastResults 之外插入 iframe.li-frame 即錯位重填）。
      const hits = this.lastResults;
      let i = 0;
      for (const f of frames) {
        const idx = f.dataset.hitIndex !== undefined ? Number(f.dataset.hitIndex) : i;
        const hit = Number.isInteger(idx) ? hits[idx] : undefined;
        i++;
        // V-F4：lazy 契約——只重填已填充（dataset.filled）的 frame；
        // 折疊未展開的空殼 frame 交由首次展開時的 fillFrame 按當下主題填，不在此破契約。
        const filled = (f as HTMLIFrameElement & { dataset: Record<string, string> }).dataset.filled;
        if (!hit || !f.isConnected || !filled) continue;
        this.fillFrame(f, hit.html, hit.keyText, hit.dictId);
      }
    } catch { /* 主題切換重填失敗不阻斷 */ }
  }

  // ------------------------------------------------------------------ shell

  /** 由掃描完成回調觸發整塊重建（原 private；掃描尾部需刷新計數快照） */
  renderShell(): void {
    const root = this.contentEl;
    // W8：記住重建前的焦點與游標位置，重建後原樣還原。
    // renderShell() 會 contentEl.empty() 整塊重建（查詞、切頁籤、開關詞典、
    // 導入完成……全部都呼叫它），輸入框 DOM 一換實體焦點就丟，瀏覽器再把
    // 新元素捲進視野——這就是「搜尋框位置會變動」體感的來源。
    const focusSnap = captureFocus(root);
    root.empty();
    root.addClass('li-root');

    // 佛學模式提示橫幅已移除（使用者指示不再展示；三表遷出後文案也已失真）。
    // showBuddhistBanner 設定項與 i18n 鍵保留（向後相容舊 data.json / 測試斷言），僅不再渲染。

    root.createDiv({ cls: 'li-header' }, (h) => {
      // B40b：版本戳——可在 DevTools/console 確認實際載入的構建（防移動端快取舊包）
      // B8：不再硬編碼——取 manifest.version（構建時由 esbuild define 注入），交付漏改不可能。
      (h as HTMLElement).dataset.build = BUILD_VERSION;
      h.createDiv({ cls: 'li-title-row' }, (row) => {
        // B39：撤「lilium」文字標題——改放辭典/轉寫兩個 SVG 圖示按鈕
        // （選中跟隨主題 accent 色；下方文字頁籤 li-tabs 頂層兩鈕同步撤除，見 renderTabs）。
        const topNow = this.activeTop();
        // B41a-f（2026-10-25 六輪迭代終案）：SVG 三條通路（setIcon 內建 id／inline path／
        // addIcon+setIcon 官方註冊庫）桌面全綠但用戶移動端回報全敗（「只剩純色」），且
        // CSS media 掃查、is-mobile 模擬、樣式表掃描均無異常——遠端無移動真機可除錯。
        // 終案采本 codebase 已被移動端長期驗證的 A2 通路：textContent 靜態字元圖示
        // （同書籤 '★/☆'、分享 '🖼'——字元渲染由系統字型保證，零 svg 管線依賴）。
        // 辭典＝📖、轉寫＝🌐；選中態＝主題 accent 色字元，無背景框。
        const mkIcon = (glyph: string, label: string, target: 'dict' | 'translit') => {
          const b = row.createEl('button', {
            cls: 'li-top-icon' + (topNow === target ? ' is-active' : ''),
            attr: { 'aria-label': label, 'title': label },
          });
          b.textContent = glyph; // A2 同款：靜態字元圖示（移動端可靠）
          b.addEventListener('click', () => {
            if (target === 'dict') this.switchPanel(this.subTab);
            else this.switchPanel(target);
          });
        };
        // B41g：📚 換 📖（打開的書，辭典語義更貼切、更精緻）；🌐 不動。
        mkIcon('📖', this.plugin.T('dict.tab.dict'), 'dict');
        mkIcon('🌐', this.plugin.T('dict.tab.translit'), 'translit');
        row.createSpan({ cls: 'li-count', text: this.scopeLabel() });
        // 原「⚙ 打開辭典管理」按鈕已移除 —— 管理入口本來就在
        // 「辭典」頁籤下的「管理」子分頁（dict.tab.manage，見 renderTopTabs），
        // 右上角這顆只是同一個面板的第二個入口，屬冗餘。
        // W9-B：在主區（獨立標籤頁）開啟辭典面板，方便大屏對讀。
        const openBtn = row.createEl('button', {
          cls: 'li-icon-btn',
          attr: { 'aria-label': this.plugin.T('rdr.openInMain') },
          text: '↗',
        });
        openBtn.addEventListener('click', () => {
          const leaf = this.plugin.app.workspace.getLeaf('tab');
          void leaf.setViewState({ type: VIEW_TYPE_UNIVERSAL_DICT, active: true });
        });
      });
      this.renderTabs(h);
      this.renderSearch(h);
      // 範圍 chips（載入的電子辭典清單）是「辭典」頁籤專屬；
      // 語料/轉寫/校勘 三個頁籤不再顯示。
      if (this.activeTop() === 'dict') this.renderScopeChips(h);
      this.sortHeaderSlots(h);
    });

    // S8：首開引導卡——尚未載入任何辭典時給出兩個明確出口（掃描／設置）。
    // 會話內可關閉；載入辭典後自動不再出現（零 schema 變更）。
    // B12：辭典首開引導卡只屬於「辭典」頁籤——轉寫頁籤不應出現辭典掃描提示。
    if (this.activeTop() === 'dict' && !this.plugin.service.all.length && !this.onboardDismissed) {
      const card = root.createDiv({ cls: 'li-onboard' });
      card.createDiv({ cls: 'li-onboard-text', text: this.plugin.T('dict.onboard.empty') });
      const actions = card.createDiv({ cls: 'li-onboard-actions' });
      const scan = actions.createEl('button', { cls: 'li-mini-btn mod-cta', text: this.plugin.T('dict.set.scanBtn') });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
      scan.addEventListener('click', async () => {
        await this.plugin.rescanAndLoadGuarded(true);
        this.renderShell();
      });
      const openSet = actions.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.onboard.add') });
      openSet.addEventListener('click', () => this.plugin.openSettings());
        const close = card.createEl('button', { cls: 'li-onboard-close', attr: { 'aria-label': 'Close' } });
      close.textContent = '✕';
      close.addEventListener('click', () => {
        this.onboardDismissed = true;
        card.remove();
      });
    }

    const body = root.createDiv({ cls: 'li-body' });
    // S2 樣板：面板渲染改走 panels.ts 的 build(host, ctx)；
    // S2 續篇：bookmarks/history 亦已抽取；corpus/collation 因狀態耦合深暫留 view.ts。
    // W9-F：辭典 為分組父頁籤，其下掛二級子分頁；leaf 由 activeTop() 推導。
    const leaf = this.activeTop() === 'dict' ? this.subTab : this.panel;
    if (leaf === 'lookup') new LookupPanel().build(body, this.panelCtx());
    else if (leaf === 'bookmarks') new BookmarksPanel().build(body, this.panelCtx());
    else if (leaf === 'history') new HistoryPanel().build(body, this.panelCtx());
    else if (leaf === 'translit') renderTranslitPanel(body, this, this.plugin);
    else new ManagePanel().build(body, this.panelCtx());

    // 焦點還原放最後：上面的面板 build 可能又觸發 renderShell（遞迴），
    // 等到 DOM 定案才還原，才不會被下一次重建洗掉。
    restoreFocus(root, focusSnap);
  }

  /**
   * 供外部（指令 / 「互校」按鈕 / 語料面板）切到指定頁籤。
   * 校勘併入後，跨功能不再需要 activate 另一個 leaf，直接切頁籤即可。
   * W9-F：若目標是 辭典 子分頁（查詢/歷史/書籤/管理），同步記住 subTab。
   */
  showPanel(panel: Panel): void {
    if (this.isDictChild(panel)) this.subTab = panel;
    this.panel = panel;
    this.renderShell();
  }

  /** W9-F：查詢/歷史/書籤/管理 是 辭典 的二級子分頁。 */
  private isDictChild(p: Panel): boolean {
    return p === 'lookup' || p === 'bookmarks' || p === 'history' || p === 'manage';
  }

  /** W9-F：由當前 leaf 推導頂層頁籤——dict 子項歸到 'dict'，其餘即自身。 */
  private activeTop(): 'dict' | 'translit' {
    return this.isDictChild(this.panel) ? 'dict' : (this.panel as 'translit');
  }

  private scopeLabel(): string {
    const scoped = this.plugin.service.scoped.length;
    const total = this.plugin.service.enabled.length;
    return `${scoped}/${total} ${this.plugin.T('dict.unit.dicts')}`;
  }

  /**
   * header 槽位固定。renderTabs/renderSearch/renderScopeChips 都用
   * 「remove 舊的＋createDiv 尾插」——單獨重渲染任一列時它會被 append 到 header
   * 末尾，列順序漂移＝搜尋框位置不確定（真機實錘：search y 96↔169 跳動）。
   * 此處依既定槽位順序重排，DOM 順序永遠一致，視覺位置即固定。
   */
  private sortHeaderSlots(h: HTMLElement): void {
    const order = ['.li-title-row', '.li-tabs', '.li-subtabs', '.li-search-row', '.li-ft-row', '.li-ft-options', '.li-chips'];
    for (const cls of order) {
      const el = h.querySelector(cls);
      if (el) h.appendChild(el);
    }
  }

  private renderTabs(h: HTMLElement): void {
    const old = h.querySelector('.li-tabs');
    if (old) old.remove();
    const oldSub = h.querySelector('.li-subtabs');
    if (oldSub) oldSub.remove();

    const top = this.activeTop();
    // B39：頂層「辭典/轉寫」文字頁籤撤下——由標題行兩個 SVG 圖示按鈕代替
    // （li-tabs 底色條隨之撤除；li-tab CSS 留作他處/向後相容）。

    // W9-F：辭典 二級子分頁——查詢/歷史/書籤/管理。原「查詢 lilium 辭典」的速查能力歸入此處。
    if (top === 'dict') {
      const sub = h.createDiv({ cls: 'li-subtabs' });
      const subDefs: Array<[Panel, string]> = [
        ['lookup', this.plugin.T('dict.tab.lookup')],
        ['history', this.plugin.T('dict.tab.history')],
        ['bookmarks', `${this.plugin.T('dict.tab.bookmarks')} (${this.plugin.store.data.bookmarks.length})`],
        ['manage', this.plugin.T('dict.tab.manage')],
      ];
      for (const [p, label] of subDefs) {
        const st = sub.createEl('button', {
          cls: 'li-subtab' + (this.panel === p ? ' is-active' : ''),
          text: label,
        });
        st.addEventListener('click', () => this.switchPanel(p));
      }
    }
    this.sortHeaderSlots(h);
  }

  private switchPanel(panel: Panel): void {
    if (this.isDictChild(panel)) this.subTab = panel;
    this.panel = panel;
    this.renderShell();
  }

  /**
   * S2：組裝面板渲染上下文（DictPanelCtx）。每次渲染即時快照——面板拿到的是
   * 當下的 view 狀態與動作，面板本身不持有 view 引用（照實依賴，不預留）。
   */
  /**
   * 書籤匯出 MD：逐書籤詞 lookup→copyStyledHtml（imgMode 'data'＝data URI 內嵌，
   * 與筆記/匯出通路同形態）→normalizeEntryBlocks 包塊，合併為單一 MD 寫入
   * lilium/Shares/（沿用 exportMarkdownToVault 落點＋防碰撞檔名慣例）。
   */
  private async exportBookmarksMarkdown(): Promise<void> {
    const items = this.plugin.store.data.bookmarks;
    if (!items.length) {
      liNotice(this.plugin.T('dict.bookmarks.exportEmpty'));
      return;
    }
    const lines: string[] = [
      `# ${this.plugin.T('dict.bookmarks.title')} (${items.length})`,
      '',
      `${this.plugin.T('dict.bookmarks.exportDate')}: ${new Date().toLocaleString()}`,
      '',
    ];
    let exported = 0;
    for (const b of items) {
      const hits = this.plugin.service.lookupAll(b.word);
      lines.push(`---`, '', `## ${b.word}`, '');
      const meta: string[] = [];
      if (hits.length) meta.push(hits[0].dictName);
      meta.push(new Date(b.createdAt).toLocaleDateString());
      lines.push(`> ${meta.join(' · ')}`, '');
      if (hits.length) {
        const styled = normalizeEntryBlocks(await this.copyStyledHtml(hits[0], hits[0].dictId ?? b.dictId, 'data'));
        lines.push(styled, '');
        exported++;
      } else {
        lines.push(this.plugin.T('dict.bookmarks.exportMiss', { word: b.word }), '');
      }
    }
    await exportMarkdownToVault(
      this.plugin,
      `${this.plugin.T('dict.bookmarks.exportFile')}-${fileTimestamp()}.md`,
      lines,
      'dict.bookmarks.exportDone',
    );
    if (exported < items.length) liNotice(this.plugin.T('dict.bookmarks.exportPartial', { ok: String(exported), total: String(items.length) }));
  }

  private panelCtx(): DictPanelCtx {
    return {
      plugin: this.plugin,
      T: (key, vars) => this.plugin.T(key, vars),
      lastResults: this.lastResults,
      lastWord: this.lastWord,
      doLookup: (word) => this.doLookup(word),
      switchPanel: (panel) => this.switchPanel(panel),
      showPanel: (panel) => this.showPanel(panel),
      renderShell: () => this.renderShell(),
      showDictInfo: (d) => this.showDictInfo(d),
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
      reorderDict: (id, delta) => this.reorderDict(id, delta),
      renderResults: (articles, word, hits) => this.renderResults(articles, word, hits),
      fillFrame: (frame, html, keyText, dictId) => this.fillFrame(frame, html, keyText, dictId),
      exportBookmarks: () => this.exportBookmarksMarkdown(),
    };
  }

  // ------------------------------------------------------------ search area

  private renderSearch(h: HTMLElement): void {
    const old = h.querySelector('.li-search-row, .li-ft-row');
    if (old) old.remove();

    // W9-F：頂層在 dict 時，搜尋列取決於子分頁（查詢→搜尋框，管理→全文搜尋）。
    const leaf = this.activeTop() === 'dict' ? this.subTab : this.panel;
    if (leaf === 'lookup') {
      // V-F14：原 W8「面板沒換就沿用既有搜尋列」復用分支為死碼——上方已無條件
      // remove 舊搜尋列，此處再 querySelector('.li-search-row') 必為 null，
      // 復用分支永不成立，故移除（行為不變：每次都重建）。
      const searchRow = h.createDiv({ cls: 'li-search-row' });
      const searchWrap = searchRow.createDiv({ cls: 'li-search-wrap' });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
      const input = searchWrap.createEl('input', {
        cls: 'li-search',
        attr: { type: 'text', placeholder: this.plugin.T('dict.search.placeholder'), spellcheck: 'false' },
      }) as HTMLInputElement;
      input.value = this.query;
      const clearBtn = searchWrap.createEl('button', { cls: 'li-clear', attr: { 'aria-label': this.plugin.T('dict.aria.clear') } });
      clearBtn.textContent = '✕'; // A2：靜態圖標改 textContent（原 innerHTML，bot 合規）
      clearBtn.toggleClass('li-u-hidden', !(this.query));
      const suggest = searchRow.createDiv({ cls: 'li-suggest' });
      suggest.addClass('li-u-hidden');
      // 搜尋按鈕（與管理頁全文搜尋同款 mod-cta li-ft-btn），點擊＝Enter 同路徑 doLookup。
      const searchBtn = searchRow.createEl('button', { cls: 'mod-cta li-ft-btn li-search-btn', text: this.plugin.T('dict.ft.search') });
      searchBtn.addEventListener('click', () => {
        suggest.addClass('li-u-hidden');
        this.doLookup(this.query);
      });

      input.addEventListener('input', () => {
        this.query = input.value;
        clearBtn.toggleClass('li-u-hidden', !(this.query));
        this.updateSuggestionsDebounced(this.query, suggest, input);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = suggest.querySelectorAll('.li-suggest-item');
          if (!items.length) return;
          this.selectedIndex =
            e.key === 'ArrowDown'
              ? Math.min(this.selectedIndex + 1, items.length - 1)
              : Math.max(this.selectedIndex - 1, -1);
          items.forEach((it, i) => it.toggleClass('is-active', i === this.selectedIndex));
          if (this.selectedIndex >= 0) {
            input.value = items[this.selectedIndex].textContent || '';
            this.query = input.value;
          }
        } else if (e.key === 'Enter') {
          suggest.addClass('li-u-hidden');
          this.doLookup(this.query);
        } else if (e.key === 'Escape') {
          suggest.addClass('li-u-hidden');
        }
      });
      clearBtn.addEventListener('click', () => {
        input.value = '';
        this.query = '';
        clearBtn.addClass('li-u-hidden');
        suggest.addClass('li-u-hidden');
        input.focus();
      });
      // preventScroll：初次掛載才搶焦點（面板切換到「查詞」時），且不讓瀏覽器
      // 為了顯示輸入框去捲動面板——那一下捲動就是位置「跑掉」的體感。
      window.setTimeout(() => input.focus({ preventScroll: true }), 30);
    } else if (leaf === 'manage') {
      const ftRow = h.createDiv({ cls: 'li-ft-row' });
      const ftWrap = ftRow.createDiv({ cls: 'li-search-wrap' });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
      const ftInput = ftWrap.createEl('input', {
        cls: 'li-search',
        attr: { type: 'text', placeholder: this.plugin.T('dict.ft.placeholder'), spellcheck: 'false' },
      }) as HTMLInputElement;
      /* 盤點補缺 A：清除鈕——與查詢框同款 li-clear ✕。 */
      const ftClear = ftWrap.createEl('button', { cls: 'li-clear', attr: { 'aria-label': this.plugin.T('dict.aria.clear') } });
      ftClear.textContent = '✕';
      ftClear.toggleClass('li-u-hidden', !(ftInput.value));
      ftClear.addEventListener('click', () => {
        ftInput.value = '';
        ftInput.dispatchEvent(new Event('input'));
        ftClear.addClass('li-u-hidden');
        ftInput.focus({ preventScroll: true });
      });
      ftInput.addEventListener('input', () => {
        ftClear.toggleClass('li-u-hidden', !(ftInput.value));
      });
      // Wordless six-toggle options row
      const optRow = h.createDiv({ cls: 'li-ft-options' });
      // 狀態存 this.ftOpt（跨重渲染記憶）；mkToggle 直接讀寫。
      const ftOpts = this.ftOpt;
      let matchCase = ftOpts.matchCase, wholeWords = ftOpts.wholeWords, useRegex = ftOpts.useRegex;
      // B36：原版閉包捕 initial（恆 false）——第二次點擊仍 onChange(!false)=true，
      // is-active 只加不減，「可選中不可取消」。改為狀態隨點擊翻轉的正常雙態。
      const mkToggle = (label: string, initial: boolean, onChange: (v: boolean) => void) => {
        const b = optRow.createEl('button', { cls: 'li-chip li-ft-opt' + (initial ? ' is-active' : ''), text: label });
        let on = initial;
        b.addEventListener('click', () => {
          on = !on;
          onChange(on);
          b.toggleClass('is-active', on);
        });
      };
      mkToggle(this.plugin.T('dict.ft.matchCase'), matchCase, (v) => { matchCase = v; ftOpts.matchCase = v; });
      mkToggle(this.plugin.T('dict.ft.wholeWords'), wholeWords, (v) => { wholeWords = v; ftOpts.wholeWords = v; });
      mkToggle(this.plugin.T('dict.ft.regex'), useRegex, (v) => { useRegex = v; ftOpts.useRegex = v; });
      optRow.createSpan({ cls: 'li-ft-hint', text: this.plugin.T('dict.ft.sep') });

      ftInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && ftInput.value.trim()) {
          void this.doFullText(ftInput.value.trim(), { matchCase, wholeWords, useRegex });
        }
      });
      const scanBtn = ftRow.createEl('button', { cls: 'mod-cta li-ft-btn', text: this.plugin.T('dict.ft.search') });
      scanBtn.addEventListener('click', () => {
        if (ftInput.value.trim()) void this.doFullText(ftInput.value.trim(), { matchCase, wholeWords, useRegex });
      });
    }
    // 單獨重渲染（如 renderResults 後）也固定槽位，防止 search-row 尾插漂移。
    this.sortHeaderSlots(h);
  }

  private renderScopeChips(h: HTMLElement): void {
    const old = h.querySelector('.li-chips');
    if (old) old.remove();
    // 此清單是辭典功能專屬——非「辭典」頁籤直接不渲染。
    // 防回歸放在方法內（而非只靠呼叫端）：局部重繪路徑也會走到這裡。
    const dicts = this.plugin.service.enabled;
    if (this.activeTop() !== 'dict' || !dicts.length) return;
    const chips = h.createDiv({ cls: 'li-chips' });

    // All chip: clears selection
    const allActive = this.plugin.service.activeDictIds.size === 0;
    const allChip = chips.createEl('button', {
      cls: 'li-chip' + (allActive ? ' is-active' : ''),
      text: this.plugin.T('dict.all'),
    });
    allChip.addEventListener('click', () => {
      this.plugin.service.activeDictIds.clear();
      this.renderShell();
    });

    for (const d of dicts) {
      const active = this.plugin.service.activeDictIds.has(d.meta.id);
      const group = this.plugin.service.groupOf(d);
      const chip = chips.createEl('button', {
        cls: 'li-chip' + (active ? ' is-active' : ''),
        text: (group ? `${group}·` : '') + this.plugin.service.displayName(d),
        attr: { title: `${this.plugin.T('dict.chip.title', { format: d.meta.format.toUpperCase(), n: d.meta.entryCount })}` },
      });
      chip.addEventListener('click', () => {
        const ids = this.plugin.service.activeDictIds;
        if (ids.has(d.meta.id)) ids.delete(d.meta.id);
        else ids.add(d.meta.id);
        this.renderShell();
      });
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const menu = new Menu();
        menu.addItem((mi) =>
          mi.setTitle(this.plugin.T('dict.chip.onlyThis')).onClick(() => {
            this.plugin.service.activeDictIds = new Set([d.meta.id]);
            this.renderShell();
          }),
        );
        menu.addItem((mi) =>
          mi.setTitle(this.plugin.T('dict.chip.info')).onClick(() => this.showDictInfo(d)),
        );
        menu.addItem((mi) =>
          mi.setTitle(this.plugin.T('dict.chip.moveUp')).onClick(async () => this.reorderDict(d.meta.id, -1)),
        );
        menu.addItem((mi) =>
          mi.setTitle(this.plugin.service.isEnabled(d) ? this.plugin.T('dict.chip.disable') : this.plugin.T('dict.chip.enable')).onClick(
            async () => {
              const cur = this.plugin.service.isEnabled(d);
              await this.plugin.store.setOverride(d.meta.id, { enabled: !cur });
              this.renderShell();
            },
          ),
        );
        menu.addSeparator();
        menu.addItem((mi) =>
          mi.setTitle(this.plugin.T('dict.chip.delete')).onClick(async () => {
            await this.plugin.deleteDictionary(d.meta.id);
            this.renderShell();
          }),
        );
        menu.showAtMouseEvent(e);
      });
    }
  }

  private async reorderDict(id: string, delta: number): Promise<void> {
    const all = this.plugin.service.all;
    const ids = all.map((d) => d.meta.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // persist order as override.order indexes
    for (let k = 0; k < ids.length; k++) {
      await this.plugin.store.setOverride(ids[k], { order: k });
    }
    this.renderShell();
  }

  // ------------------------------------------------------------- lookup panel

  // S2 樣板：lookup 面板本體已抽取至 panels.ts（LookupPanel.build）。
  // renderResults / fillFrame 仍留本檔：doLookup（bookmarks / history / corpus /
  // collation 亦呼叫）共用，經 DictPanelCtx 提供給面板。

  // -------------------------------------------------------------- suggestions

  private updateSuggestionsDebounced = debounce((q: string, suggest: HTMLElement, input: HTMLInputElement) => {
    this.updateSuggestions(q, suggest, input);
  }, 120, true);

  private updateSuggestions(q: string, suggest: HTMLElement, input: HTMLInputElement): void {
    this.selectedIndex = -1;
    if (!q || q.length < 1) {
      suggest.addClass('li-u-hidden');
      return;
    }
    const words = this.plugin.service.prefixAll(q, 8).filter((w) => w.toLowerCase() !== q.toLowerCase());
    this.suggestions = words;
    if (!words.length) {
      suggest.addClass('li-u-hidden');
      return;
    }
    suggest.empty();
    words.forEach((w) => {
      const item = suggest.createDiv({ cls: 'li-suggest-item', text: w });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = w;
        this.query = w;
        suggest.addClass('li-u-hidden');
        this.doLookup(w);
      });
    });
    suggest.removeClass('li-u-hidden');
  }

  // ------------------------------------------------------------------ lookup

  lookupWord(word: string): void {
    this.panel = 'lookup';
    this.subTab = 'lookup';
    this.query = word;
    this.renderShell();
    this.doLookup(word);
  }

  private doLookup(word: string, opts?: { tocDictId?: string }): void {
    if (!word || !word.trim()) return;
    word = word.trim();
    // 從歷史/書籤等非查詢面板跳轉時，panel/subTab 切成 lookup 但
    // renderShell 不跑 → header 搜尋列還是 history 變體（搜尋框「隱藏」）。
    // 面板來的 doLookup 不像 lookupWord 先 renderShell，此處補齊：只有真的
    // 從別的面板跳來才重建（查詢面板內部路徑零重建、零焦點抖動）。
    const needsShell = this.panel !== 'lookup' || this.subTab !== 'lookup';
    this.panel = 'lookup';
    this.subTab = 'lookup';
    if (needsShell) this.renderShell();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const articles = this.contentEl.querySelector('.li-articles') as HTMLElement | null;
    if (!articles) {
      this.renderShell();
      // A5：重試必須攜帶 opts（TOC 入口等），否則攔截語義在重試路徑丟失。
      window.requestAnimationFrame(() => this.doLookup(word, opts));
      return;
    }

    // stale-result guard (Mynary lookupSequence pattern)
    const token = this.plugin.lookupSequence.begin();

    let hits = this.plugin.service.lookupAll(word);
    // 卡頓修復：lower/cap 重試僅當真的產生不同字串——
    // 非漢語/非拉丁文（藏文/UEY/蒙文…）無大小寫概念，此前每次未命中都多跑兩遍
    // 完整降級鏈（variant→fuzzy→lemma），主線程三倍耗時。
    if (!hits.length) {
      const lower = word.toLowerCase();
      const cap = word.charAt(0).toUpperCase() + word.slice(1);
      const retries = [...new Set([lower, cap])].filter((w) => w !== word);
      for (const w of retries) {
        hits = [...hits, ...this.plugin.service.lookupAll(w)];
      }
    }

    if (!this.plugin.lookupSequence.isCurrent(token)) return; // a newer lookup superseded this one
    this.lastResults = hits;
    this.lastWord = word;
    void this.plugin.pushRecent(word);
    void this.plugin.store.pushHistory(word, hits.length, this.plugin.settings.historyLimit);
    // MDict 目錄頁彈窗（三藏法數「00 總目錄」）。特徵：條目以
    // entry:// 鏈接為主體（>80 條）、幾乎無 <p> 正文——整頁塞 iframe 動輒
    // 4000px+，瀏覽困難。改開 Modal：分頁顯示＋可滾動。普通詞條零影響。
    // A5b：TOC 內容按典隔離——聯查 hits 可能多部典同時命中。
    // 有 tocDictId（典內 TOC 入口按鈕）→ 維持現行為：只取該典的 TOC-like 命中，
    // 命中即開 modal（按鈕入口本身語義就是「開本典目錄」）。
    // 無 opts（歷史/書籤/搜尋框等普通入口）→ 只有「全部命中皆 TOC-like」才攔截，
    // 否則正常渲染——避免一部典的目錄頁吞掉另一部典的正常釋義。
    const tocHits = hits.filter((h) =>
      isTocLikeHtml(h.html) && (!opts?.tocDictId || h.dictId === opts.tocDictId));
    const tocIntercept = opts?.tocDictId
      ? tocHits.length > 0
      : tocHits.length > 0 && tocHits.length === hits.length;
    if (tocIntercept) {
      openTocModal(this.plugin.app, word, tocHits, (w) => this.doLookup(w));
      return;
    }
    this.renderResults(articles, word, hits, token);
    this.renderTabs(this.contentEl.querySelector('.li-header') as HTMLElement);
  }

  private renderResults(articles: HTMLElement, word: string, hits: Array<LookupHit & { dictId: string }>, token?: number): void {
    articles.empty();
    articles.scrollTop = 0;

    const head = articles.createDiv({ cls: 'li-result-head' });
    const headRow = head.createDiv({ cls: 'li-word-row' });
    headRow.createDiv({ cls: 'li-word', text: word });
    // bookmark star
    const starred = this.plugin.store.isBookmarked(word);
    const starBtn = headRow.createEl('button', {
      cls: 'li-star' + (starred ? ' is-on' : ''),
      attr: { 'aria-label': starred ? this.plugin.T('dict.removeBookmark') : this.plugin.T('dict.addBookmark') },
    });
    starBtn.textContent = starred ? '★' : '☆'; // A2：靜態圖標改 textContent
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    starBtn.addEventListener('click', async () => {
      const on = await this.plugin.store.toggleBookmark(word);
      starBtn.textContent = on ? '★' : '☆'; // A2：靜態圖標改 textContent
      starBtn.toggleClass('is-on', on);
      liNotice(on ? this.plugin.T('dict.bookmark.added') : this.plugin.T('dict.bookmark.removed'));
    });
    // share PNG
    const shareBtn = headRow.createEl('button', {
      cls: 'li-icon-btn',
      attr: { 'aria-label': this.plugin.T('dict.share.png') },
    });
    shareBtn.textContent = '🖼'; // A2：靜態圖標改 textContent
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    shareBtn.addEventListener('click', async () => {
      if (!hits.length || shareBtn.disabled) return;
      shareBtn.disabled = true; // V-F13：連點防護——PNG 生成＋寫檔期間禁用，避免重複生成/同名覆寫
      try {
        liNotice(this.plugin.T('dict.share.generating'));
        // 樣式渲染分支：每 hit 先過 copyStyledHtml（inline CSS＋vault 圖片路徑）再進渲染
        const styled = await Promise.all(hits.map(async (h) => ({ dictName: h.dictName, keyText: h.keyText, html: await this.copyStyledHtml(h, (h as { dictId?: string }).dictId, 'vault') })));
        const pngData = await renderToPng(word, styled, this.plugin.service.assetUrl.bind(this.plugin.service), async (p: string) => this.plugin.app.vault.adapter.readBinary(normalizePath(decodeURIComponent(p))));
        // B30：分享圖存 lilium/圖片
        const folder = 'lilium/圖片';
        await (this.plugin as unknown as { ensureFolder(p: string): Promise<void> }).ensureFolder(folder);
        const file = `${folder}/${word.replace(/[/:*?"<>|]/g, '_')}-${fileTimestamp()}.png`;
        await this.plugin.app.vault.createBinary(
          normalizePath(file),
          pngData.buffer.slice(pngData.byteOffset, pngData.byteOffset + pngData.byteLength) as ArrayBuffer,
        );
        liNotice(this.plugin.T('dict.share.saved', { file }));
      } catch (e) {
        liNotice(this.plugin.T('dict.share.failed', { err: e instanceof Error ? e.message : String(e) }), 6000);
      } finally {
        shareBtn.disabled = false;
      }
    });

    // note & flashcard generation (dictionary-plus inspired)
    const genRow = headRow.createDiv({ cls: 'li-gen-row' });
    const noteBtn = genRow.createEl('button', {
      cls: 'li-mini-btn', text: this.plugin.T('dict.note.tab'),
      attr: { 'aria-label': this.plugin.T('dict.note.gen') },
    });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    noteBtn.addEventListener('click', async () => {
      // 樣式渲染分支：每 hit 先過 copyStyledHtml（inline CSS＋vault 圖片路徑）再組筆記（inline HTML 於 Obsidian 編輯/閱讀皆存活）
      const styled = await Promise.all(hits.map(async (h) => ({ dictName: h.dictName, keyText: h.keyText, html: normalizeEntryBlocks(await this.copyStyledHtml(h, (h as { dictId?: string }).dictId, 'data')) })));
      const note = buildLookupNote({ word, hits: styled, htmlToMarkdown: identityHtml });
      // B30：筆記存 lilium/筆記（安裝時預建資料夾樹）；檔名含時間戳（與 ↓MD 匯出
      // mdFileName 同慣例）——同詞多次匯出各存一檔，不覆蓋舊筆記。
      const folder = 'lilium/筆記';
      await (this.plugin as unknown as { ensureFolder(p: string): Promise<void> }).ensureFolder(folder);
      const file = `${folder}/${word.replace(/[/:*?"<>|]/g, '_')}-${fileTimestamp()}.md`;
      await this.plugin.app.vault.create(normalizePath(file), note);
      liNotice(this.plugin.T('dict.note.saved', { file }));
    });
    // note-builder.buildFlashcardLines 保留（導出 API 面，向後相容）。

    head.createDiv({
      cls: 'li-hitcount',
      text: hits.length
        ? this.plugin.T('dict.results', { n: hits.length, d: new Set(hits.map((h) => h.dictName)).size })
        : this.plugin.T('dict.noResults'),
    });

    // external source links (dictionary-plus inspired)
    if (this.plugin.settings.showExternalLinks && hits.length) {
      const linksRow = head.createDiv({ cls: 'li-extlinks' });
      linksRow.createSpan({ cls: 'li-extlinks-label', text: this.plugin.T('dict.extlinks') });
      // 排查修復：佛學外鏈歸「佛學模式」單一開關管轄——先前未門控，
      // 原生模式（buddhistMode=off）下也會追加 CBETA/SAT 等 6 條鏈接，
      // 與 buddhist-links.ts 檔頭自述「佛學模式下…追加」相矛盾。
      const baseLinks = buildExternalSourceLinks(word);
      const linksToShow = this.plugin.settings.buddhistMode
        ? buildBuddhistAwareLinks(word, baseLinks)
        : baseLinks;
      for (const link of linksToShow) {
        const a = linksRow.createEl('a', { cls: 'li-extlink', text: link.label, attr: { href: link.url } });
        a.addEventListener('click', (e) => {
          e.preventDefault();
          window.open(link.url);
        });
      }
    }

    // 巴利詞顯示梵文對應（DPD 48,921 條映射）
    if (this.plugin.settings.buddhistMode) {
      try {
        const sk = paliToSanskrit(word);
        if (sk || looksLikePali(word)) {
          const plRow = head.createDiv({ cls: 'li-extlinks' });
          plRow.createSpan({ cls: 'li-extlinks-label', text: this.plugin.T('dict.paliSanskrit') });
          if (sk) {
            plRow.createSpan({ cls: 'li-extlink', text: this.plugin.T('dict.paliSanskrit.map', { sk }) });
          }
                const sc = plRow.createEl('a', { cls: 'li-extlink', text: 'Suttacentral ↗', attr: { href: `https://suttacentral.net/search?query=${encodeURIComponent(word)}` } });
          sc.addEventListener('click', (e) => { e.preventDefault(); window.open(`https://suttacentral.net/search?query=${encodeURIComponent(word)}`); });
        }
      } catch { /* module unavailable */ }
    }

    // Wiktionary 外鏈的常駐渲染在上方
    // linksRow（:772 起），不受本拆除影響。

    if (!hits.length) {
      const none = articles.createDiv({ cls: 'li-none' });
      none.createDiv({ cls: 'li-none-icon', text: '🔍' });
      none.createEl('p', { text: this.plugin.T('dict.lookup.noneInDict', { word }) });
      // "did you mean" via BK-tree (medict pattern)
      // 卡頓修復：BK-tree 首次建樹（20k 詞＋無 cutoff DP）同步主線程可達
      // 秒級——延後一幀讓「無結果」先渲染；token 防新查詢搶跑。
      const noneEl = none;
      const suggestToken = token;
      window.requestAnimationFrame(() => {
        if (suggestToken !== undefined && !this.plugin.lookupSequence.isCurrent(suggestToken)) return;
        const suggestions = this.plugin.service.suggestSimilar(word, 6);
        if (suggestions.length) {
          const sug = noneEl.createDiv({ cls: 'li-suggest-similar' });
          sug.createSpan({ cls: 'li-none-hint', text: this.plugin.T('dict.didYouMean') });
          for (const s of suggestions) {
            const b = sug.createEl('button', { cls: 'li-recent-item', text: s.word });
            b.addEventListener('click', () => this.doLookup(s.word));
          }
        } else {
          noneEl.createEl('p', { cls: 'li-none-hint', text: this.plugin.T('dict.tryFulltext') });
        }
      });
      return;
    }

    let lastDict = '';
    // 卡頓修復：legacy flat 路徑分幀填充——先建空殼，再 queueFlatFill 逐幀 fill。
    const flatQueue: Array<{ frame: HTMLIFrameElement; hit: LookupHit & { dictId: string } }> = [];
    let flatSyncDone = false;
    // MDict union-view pattern: each dictionary result is a collapsible block,
    // only the first expanded by default, with expand/collapse-all buttons.
    const collapsible = this.plugin.settings.collapsibleBlocks;
    if (collapsible && hits.length > 1) {
      const bar = articles.createDiv({ cls: 'li-block-bar' });
      const expandAll = bar.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.expandAll'), attr: { 'aria-label': 'Expand all dictionary blocks' } });
      const collapseAll = bar.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.collapseAll'), attr: { 'aria-label': 'Collapse all dictionary blocks' } });
      expandAll.addEventListener('click', () => {
        articles.querySelectorAll('.li-mdx-block').forEach((b) => {
          b.addClass('is-open');
          // lazy 填充補位：折疊塊展開時的 fillFrame 只掛在 headRow click 上，
          // 「全部展開」此前只切 CSS class 不觸發填充——所有非首塊展開後永遠空白。
          const fr = b.querySelector('iframe');
          const idx = b.getAttribute('data-block-index');
          if (fr && !fr.dataset.filled) {
            const hitData = this.lastResults?.[Number(idx)];
            if (hitData) {
              fr.dataset.filled = '1';
              this.fillFrame(fr, hitData.html, hitData.keyText, hitData.dictId);
            }
          }
        });
      });
      collapseAll.addEventListener('click', () => {
        articles.querySelectorAll('.li-mdx-block').forEach((b) => b.removeClass('is-open'));
      });
    }
    let blockIndex = 0;
    for (const [hitIndex, hit] of hits.entries()) { // V-F13：帶索引，hits.indexOf(hit) 於迴圈內 O(n²)
      const dictChanged = hit.dictName !== lastDict;
      if (collapsible) {
        // MDict-style collapsible dictionary block
        const block = articles.createDiv({ cls: 'li-mdx-block' + (blockIndex === 0 ? ' is-open' : '') });
        block.setAttribute('data-block-index', String(blockIndex));
        const headRow = block.createDiv({ cls: 'li-mdx-head' });
        const arrow = headRow.createSpan({ cls: 'li-mdx-arrow', text: blockIndex === 0 ? '▾' : '▸' });
        headRow.createSpan({ cls: 'li-dict-badge', text: hit.dictName });
        const fmtTag = this.plugin.service.get(hit.dictId)?.meta.format;
        if (fmtTag) headRow.createSpan({ cls: 'li-mdx-fmt', text: fmtTag.toUpperCase() });
        headRow.createSpan({ cls: 'li-mdx-key', text: hit.keyText });
        const body = block.createDiv({ cls: 'li-mdx-body' });
        const card = body.createDiv({ cls: 'li-card' });
        const frame = card.createEl('iframe', {
          cls: 'li-frame',
          attr: {
            sandbox: 'allow-same-origin',
            csp: "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: asset: app://local capacitor: https: http:; font-src data: app://local; media-src data: app://local blob:",
          },
        });
        // 移動端卡頓修復：折疊塊 lazy 載入——非首塊收起時不同步填 iframe
        // （srcdoc 解析＋資源內聯在移動端每塊數十-數百 ms，N 部辭典同幀全填＝單幀卡死）；
        // 首次展開時才 fillFrame。
        if (blockIndex === 0) {
          this.fillFrame(frame, hit.html, hit.keyText, hit.dictId);
          (frame as HTMLIFrameElement & { dataset: Record<string, string> }).dataset.filled = '1';
        }
        headRow.addEventListener('click', () => {
          const open = block.hasClass('is-open');
          block.toggleClass('is-open', !open);
          arrow.setText(open ? '▸' : '▾');
          if (!open) {
            const fr = frame as HTMLIFrameElement & { dataset: Record<string, string> };
            if (!fr.dataset.filled) {
              fr.dataset.filled = '1';
              this.fillFrame(fr, hit.html, hit.keyText, hit.dictId);
            }
          }
        });
        // 目錄入口宿主按鈕（移動端修復）。移動端 WebView（Capacitor）對
        // srcdoc iframe 內 body click 事件透傳不可靠（B41a-f 同類前科）→ iframe 內
        // 「總目錄」鏈接點了無反應，TOC 彈窗走不到。此按鈕在 iframe 外（宿主 DOM），
        // 平台無關。檢測：詞條 HTML 含 entry:// 鏈接且鏈接文本含「總目錄/目錄」。
        {
          const tocMatch = hit.html.match(/<a\s+href="entry:\/\/([^"]+)"[^>]*>([^<]{0,8}目錄[^<]{0,4})<\/a>/i);
          if (tocMatch) {
            let tocWord = tocMatch[1].replace(/^(entry:\/\/)+/i, '').trim();
            try { tocWord = decodeURIComponent(tocWord); } catch { /* 保留原字面 */ }
            const tocLabel = (tocMatch[2] || '').trim() || '總目錄';
            const tocBtn = headRow.createEl('button', {
              cls: 'li-mini-btn li-toc-entry-btn li-toc-entry-btn--mini',
              text: 'TOC', // 文案固定 TOC（原顯示鏈接原文如「總目錄」，過大；目標詞移入 aria-label）
              attr: { 'aria-label': `${tocLabel}（${tocWord}）`, title: `${tocLabel}（${tocWord}）` },
            });
            tocBtn.addEventListener('click', (e) => {
              e.stopPropagation(); // 不觸發 headRow 折疊
              this.doLookup(tocWord, { tocDictId: hit.dictId }); // 只開本典 TOC（目標若是目錄頁 → isTocLikeHtml 偵測開彈窗）
            });
          }
        }
        // 發音宿主按鈕（移動端修復）：詞條 HTML 含 sound:// 音頻鏈接時，標題列放純三角形 ▶
        // 無背景框按鈕，點擊宿主側取音頻直接播（iframe 內事件在移動端 WebView 不可靠——
        // B41a-f 前科同配方：宿主 DOM 平台無關；宿主 Audio.play 不經 iframe 事件鏈）。
        // 多發音檔：每個 sound:// 鏈接各一顆 ▶（按檔名去重），失敗/缺檔任何路徑皆復原 ▶。
        {
          const seenSnd = new Set<string>();
          const sndFiles: string[] = [];
          const sndRe = /<a\b[^>]*href="sound:\/\/([^"]+\.(?:mp3|wav|ogg|m4a|aac|flac|spx))"[^>]*>/gi;
          let sm: RegExpExecArray | null;
          while ((sm = sndRe.exec(hit.html))) {
            try {
              const f = decodeURIComponent(sm[1]);
              if (!seenSnd.has(f)) { seenSnd.add(f); sndFiles.push(f); }
            } catch { /* 保留原字面 */ }
          }
          for (const sndFile of sndFiles) {
            const playBtn = headRow.createEl('button', {
              cls: 'li-mdx-play-btn',
              text: '▶',
              attr: { 'aria-label': `play audio ${sndFile}`, title: sndFile },
            });
            // 復原收口：任何失敗路徑（缺檔/讀取錯/解碼錯/play 拒絕）統一走 restore
            let playing = false;
            const restore = () => { playing = false; playBtn.setText('▶'); };
            // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
            playBtn.addEventListener('click', async (e) => {
              e.stopPropagation(); // 不觸發 headRow 折疊
              if (playing) return;
              playing = true;
              playBtn.setText('▮▮');
              try {
                let asset = this.plugin.service.resolveAsset(sndFile);
                if (!asset) {
                  // 壓平命名兜底：資產根按 basename 探實檔
                  const p = await this.probeAssetFilePublic(sndFile.split(/[\\/]/).pop() || '');
                  if (p) asset = { mddKey: sndFile, vaultPath: p, kind: 'audio', size: 0 };
                }
                if (!asset) { liNotice(this.plugin.T('dict.audio.missing', { word: hit.keyText })); restore(); return; }
                const buf = await this.plugin.app.vault.adapter.readBinary(asset.vaultPath);
                let bytes: Uint8Array = new Uint8Array(buf);
                let mime = 'audio/ogg';
                if (/\.spx$/i.test(asset.vaultPath)) {
                  const { wav } = await decodeSpeexToWav(bytes);
                  bytes = new Uint8Array(wav);
                  mime = 'audio/wav';
                } else {
                  const ext = (asset.vaultPath.split('.').pop() || 'ogg').toLowerCase();
                  mime = ext === 'wav' ? 'audio/wav' : ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : ext === 'aac' ? 'audio/aac' : ext === 'flac' ? 'audio/flac' : 'audio/ogg';
                }
                const url = URL.createObjectURL(new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mime }));
                const audio = new Audio(url);
                audio.onended = () => { URL.revokeObjectURL(url); restore(); };
                audio.onerror = () => { URL.revokeObjectURL(url); restore(); liNotice(this.plugin.T('dict.audio.missing', { word: hit.keyText })); };
                await audio.play();
                // play() resolve 後若 audio 已 ended（極短音頻競態），onended 已復原；未 ended 則保持 ▮▮。
              } catch (err) {
                liNotice(this.plugin.T('dict.audio.missing', { word: hit.keyText }) + ' [' + (err instanceof Error ? err.message : String(err)) + ']');
                restore();
              }
            });
          }
        }
        const actions = card.createDiv({ cls: 'li-actions' });
        const copyBtn = actions.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.copy') });
        copyBtn.addEventListener('click', () => {
          const api = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
          if (!api?.writeText) { liNotice(this.plugin.T('dict.copyFail')); return; }
          void this.copyStyledHtml(hit, hit.dictId)
            .then((styled) => api.writeText(styled))
            .then(() => liNotice(this.plugin.T('dict.copyDone')))
            .catch(() => liNotice(this.plugin.T('dict.copyFail')));
        });
        (frame).dataset.hitIndex = String(hitIndex);
        blockIndex++;
      } else {
        // legacy flat rendering
        if (dictChanged) {
          const sep = articles.createDiv({ cls: 'li-dict-sep' });
          sep.createSpan({ cls: 'li-dict-badge', text: hit.dictName });
          const fmtTag2 = this.plugin.service.get(hit.dictId)?.meta.format;
          if (fmtTag2) sep.createSpan({ cls: 'li-mdx-fmt', text: fmtTag2.toUpperCase() });
          lastDict = hit.dictName;
        }
        const card = articles.createDiv({ cls: 'li-card' });
        const frame = card.createEl('iframe', {
          cls: 'li-frame',
          attr: {
            sandbox: 'allow-same-origin',
            csp: "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: asset: app://local capacitor: https: http:; font-src data: app://local; media-src data: app://local blob:",
          },
        });
        // 卡頓修復：legacy flat 分幀填充——首塊同步 fill（首屏立現），
        // 其餘建空殼（dataset.filled 未設）交 queueFlatFill 逐幀填，語義不變全最終都填。
        if (flatQueue.length === 0 && flatSyncDone === false) {
          flatSyncDone = true;
          this.fillFrame(frame, hit.html, hit.keyText, hit.dictId);
          (frame as HTMLIFrameElement & { dataset: Record<string, string> }).dataset.filled = '1';
        } else {
          flatQueue.push({ frame, hit });
        }
        const actions = card.createDiv({ cls: 'li-actions' });
        const copyBtn = actions.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.copy') });
        copyBtn.addEventListener('click', () => {
          const api = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
          if (!api?.writeText) { liNotice(this.plugin.T('dict.copyFail')); return; }
          void this.copyStyledHtml(hit, hit.dictId)
            .then((styled) => api.writeText(styled))
            .then(() => liNotice(this.plugin.T('dict.copyDone')))
            .catch(() => liNotice(this.plugin.T('dict.copyFail')));
        });
        (frame).dataset.hitIndex = String(hitIndex);
      }
    }
    // 卡頓修復：循環收尾排隊分幀 fill（單命中時 flatQueue 為空、已同步填畢，零排程開銷）。
    if (flatQueue.length) this.queueFlatFill(flatQueue);
  }

  /**
   * 複製帶樣式——辭典配套 CSS 解析展開為 inline style 後再寫剪貼板。
   * Obsidian 筆記 sanitize <link>/<style>，inline style 是唯一在編輯+閱讀雙視圖存活的樣式載體。
   * css 資產讀取失敗時降級為原始 html（行為與舊版一致）。
   */
  private async copyStyledHtml(hit: { html: string }, dictId?: string, imgMode: 'appurl' | 'vault' | 'data' = 'appurl'): Promise<string> {
    try {
      const service = this.plugin.service;
      const dict = service.get(dictId || '');
      // ① 樣式：配套 CSS 展開為 inline style
      const cssAssets = (dict?.meta.assets || []).filter((a) => a.kind === 'css');
      let out = hit.html;
      if (cssAssets.length) {
        const cssList: string[] = [];
        for (const a of cssAssets) {
          try { cssList.push(await this.plugin.app.vault.adapter.read(a.vaultPath)); } catch { /* missing css */ }
        }
        out = inlineStyles(out, cssList);
      }
      // ② 圖片：MDD 提取資產（tke.png 等）→ vault 相對路徑（筆記閱讀/編輯皆渲染）。
      // resolveAsset 未命中（壓平命名/索引缺）→ 按資產目錄 basename 探測實檔兜底。
      const dictAssetDirs = new Set<string>((dict?.meta.assets || []).map((a: { vaultPath: string }) => a.vaultPath.split('/').slice(0, -1).join('/')).filter(Boolean));
      const probeAssetFile = async (name: string): Promise<string | null> => {
        for (const dir of dictAssetDirs) {
          const cand = `${dir}/${name}`;
          try { if (await this.plugin.app.vault.adapter.exists(cand)) return cand; } catch { /* skip */ }
        }
        /* 資產根全域兜底——dict.meta.assets 可能只登記 css（mdd 提取目錄未登記），
           同名檔案實際在 <資產根>/<其他子目錄>（如 mdx-廣韻/tke.png）。掃資產根各子目錄。 */
        try {
          const root = ASSET_FOLDER;
          const listing = await this.plugin.app.vault.adapter.list(root);
          for (const sub of listing.folders || []) {
            const cand = `${sub}/${name}`;
            try { if (await this.plugin.app.vault.adapter.exists(cand)) return cand; } catch { /* skip */ }
          }
        } catch { /* no asset root */ }
        return null;
      };
      // B9：拓寬 src 形態——單/雙引號、大寫屬名（SRC）、無引號屬值（i 旗標＋['"]? 捕獲）。
      // 捕獲：p1＝src 前綴（含開頭引號，若有）、src＝屬值、p3＝結尾引號（無引號時為空串）。
      const imgRe = /(<img\b[^>]*\ssrc\s*=\s*["']?)([^":]+?)(["']?)(?=[\s>])/gi;
      const imgJobs: Array<Promise<void>> = [];
      const imgFix: Array<{ token: string; html: string }> = [];
      let imgIdx = 0;
      // imgMode='data'（筆記/↓MD）：readBinary→base64 data: URI 內嵌——實測 styled HTML 塊內
      //   wikilink ![[..]] 不解析（成純文本）、app:// 被 md 渲染 sanitize 剝 src（getAttribute null、loaded=0），
      //   唯一可渲染形態＝data: URI（≤256KB 小圖內嵌；大圖退回 vault 相對路徑，源碼可讀）；
      // imgMode='appurl'（複製剪貼板 HTML）：src → app:// 資源 URL（粘貼後絕對路徑可渲染）；
      // imgMode='vault'（生成圖片）：保 encodeURI(vaultPath)（readBinary 通路）。
      const imgOut = (p1: string, vaultPath: string, p3: string): string => {
        if (imgMode === 'vault') return `${p1}${encodeURI(vaultPath)}${p3}`;
        if (imgMode === 'data') return `${p1}${encodeURI(vaultPath)}${p3}`; // 佔位：data 內嵌走 imgFix 異步替換
        return `${p1}${this.plugin.service.assetUrl(vaultPath)}${p3}`;
      };
      // data 模式：異步讀 binary→base64 內嵌；>256KB 或讀取失敗退回 vault 相對路徑。
      const inlineData = async (vaultPath: string): Promise<string | null> => {
        try {
          if (imgMode !== 'data') return null;
          const ck = 'vault:' + vaultPath;
          const hit0 = inlineDataCache.get(ck);
          if (hit0) { // V-F9：命中刷新到尾（真 LRU）——原僅插入序 FIFO，熱資源會被冷資源擠出
            inlineDataCache.delete(ck);
            inlineDataCache.set(ck, hit0);
            return hit0;
          }
          const buf = await this.plugin.app.vault.adapter.readBinary(normalizePath(vaultPath));
          if (buf.byteLength > 256 * 1024) return encodeURI(vaultPath);
          const ext = vaultPath.split('.').pop()?.toLowerCase() || 'png';
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/png';
          const bytes = new Uint8Array(buf);
          const d = `data:${mime};base64,${bytesToBase64(bytes)}`; // C5：共用 bytesToBase64
          if (inlineDataCache.size >= 128) { // 卡頓修復：LRU 逐條淘汰（Map 插入序＝訪問序），不再整桶 clear 打掉熱資源
            const oldest = inlineDataCache.keys().next();
            if (!oldest.done) inlineDataCache.delete(oldest.value);
          }
          inlineDataCache.set(ck, d);
          return d;
        } catch { return encodeURI(vaultPath); }
      };
      out = out.replace(imgRe, (m: string, p1: string, src: string, p3: string) => {
        let direct: string | null = null;
        try {
          const asset = service.resolveAsset(src);
          if (asset && imgMode !== 'data') direct = imgOut(p1, asset.vaultPath, p3);
          else if (asset) {
            const token0 = `\u0000LI-IMG-${imgIdx++}\u0000`;
            imgJobs.push((async () => {
              const d = await inlineData(asset.vaultPath);
              imgFix.push({ token: token0, html: d ? `${p1}${d}${p3}` : m });
            })());
            return token0;
          }
        } catch { /* fallthrough */ }
        if (direct) return direct;
        const token = `\u0000LI-IMG-${imgIdx++}\u0000`;
        imgJobs.push((async () => {
          try {
            const p = await probeAssetFile(src);
            if (!p) { imgFix.push({ token, html: m }); return; }
            if (imgMode === 'data') {
              const d = await inlineData(p);
              imgFix.push({ token, html: d ? `${p1}${d}${p3}` : m });
            } else imgFix.push({ token, html: imgOut(p1, p, p3) });
          } catch { imgFix.push({ token, html: m }); }
        })());
        return token;
      });
      if (imgJobs.length) {
        await Promise.all(imgJobs);
        out = replaceTokens(out, imgFix, nulTokenRe("LI-IMG")); // C1：共用回填（函數式替換防 $ 序列解讀）
      }
      // ③ 發音：sound://xxx.spx → 資產存在則解碼 WAV 落盤後替換為 <audio controls>；缺檔保留原鏈接（點擊 Notice）
      const audioRe = /<a\b[^>]*href="sound:\/\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const jobs: Array<Promise<void>> = [];
      const replaced: Array<{ token: string; html: string }> = [];
      let idx = 0;
      out = out.replace(audioRe, (m: string, file: string, inner: string) => {
        const token = `\u0000LI-AUDIO-${idx++}\u0000`;
        jobs.push((async () => {
          try {
            let asset = service.resolveAsset(decodeURIComponent(file));
            if (!asset) {
              // 壓平命名兜底：資產目錄按 basename 探實檔
              const p = await probeAssetFile(decodeURIComponent(file).split(/[\\/]/).pop() || '');
              if (p) asset = { mddKey: file, vaultPath: p, kind: 'audio', size: 0 };
            }
            if (!asset) { replaced.push({ token, html: m }); return; } // 缺檔：原樣回填（img 圖示在 a 內，不可丟）
            const buf = await this.plugin.app.vault.adapter.readBinary(asset.vaultPath);
            let wavBytes: Uint8Array | null = null;
            if (/\.spx$/i.test(asset.vaultPath)) {
              const bytes = new Uint8Array(buf);
              const res = await decodeSpeexToWav(bytes);
              wavBytes = new Uint8Array(res.wav);
            }
            // 音頻直接內嵌匯出 MD（data URI）——不落盤副本（Shares/audio 與資產旁 .converted.wav 均廢除）＝零重複。
            // spx 瀏覽器不解碼，仍須轉 wav 後內嵌。
            const mimeA = (() => {
              const ext = (wavBytes ? 'wav' : (asset.vaultPath.split('.').pop() || 'ogg').toLowerCase());
              return ext === 'wav' ? 'audio/wav' : ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : ext === 'aac' ? 'audio/aac' : ext === 'flac' ? 'audio/flac' : 'audio/ogg';
            })();
            const audioBytes = wavBytes || new Uint8Array(buf);
            const outRef = `data:${mimeA};base64,${bytesToBase64(audioBytes)}`;
            replaced.push({ token, html: `<audio controls src="${outRef}" style="vertical-align:middle">${inner}</audio>` });
          } catch { replaced.push({ token, html: m }); } // 解碼/落盤失敗原樣回填
        })());
        return token;
      });
      if (jobs.length) {
        await Promise.all(jobs);
        out = replaceTokens(out, replaced, nulTokenRe("LI-AUDIO")); // C1：共用回填（A1 函數式替換；NUL 以 fromCharCode 動態構造，語義同 \u0000 字面）
      }
      // 出口接線 normalizeEntryBlocks——「複製」「↓ MD」兩通路統一剝 <link>＋
      // 按序號錨點包塊（v0.1.45 修復函數當時只寫未接線，用戶症狀復現實錘：匯出 MD 仍含
      // <link>、無 li-gy-entry 包裹）。
      out = normalizeEntryBlocks(out);
      return out;
    } catch {
      return hit.html;
    }
  }

  /* 廣韻等 mdd 提取資產 basename 索引（tke.png → <資產根>/mdx-廣韻/tke.png）。
     meta.assets 可能只登記 css（提取目錄未登記），srcdoc iframe 內相對 src 載不到 → 破圖。
     fillFrame 的 resolver 兜底查此索引；首查未備時 fill 推遲到索引就緒。 */
  private assetBasemap: Map<string, string> | null = null;
  /** r62：app:// 資源 URL → vault 相對路徑映射（fillFrame 的 toUrl 填充；
   *  inlineFrameAssets 內聯時據此走 adapter.readBinary——requestUrl 不支持 app://）。 */
  private frameAssetPaths = new Map<string, string>();
  /** B8：當前詞條 iframe body 的 ResizeObserver（fillFrame 換新前 disconnect 舊例，防洩漏）。 */
  // V-F1：per-frame ResizeObserver 管理——單槽 frameRo 會在 fillFrame 換新時
  // disconnect 上一幀的 observer（expandAll/queueFlatFill 多 iframe 時首幀高度
  // 跟隨被殺＋N-1 個 RO 殘留），改為按 frame 各自持有、各自斷開。
  private frameRos = new Map<HTMLIFrameElement, ResizeObserver>();
  /** 斷開並移除指定 frame 的 ResizeObserver；順手清掃已分離 frame 的殘留 RO。 */
  private detachFrameRo(frame: HTMLIFrameElement | null): void {
    if (frame) {
      const ro = this.frameRos.get(frame);
      if (ro) { ro.disconnect(); this.frameRos.delete(frame); }
    }
    for (const [f, ro] of this.frameRos) {
      if (!f.isConnected) { ro.disconnect(); this.frameRos.delete(f); }
    }
  }
  private pendingFrames: Array<{ frame: HTMLIFrameElement; html: string; keyText: string; dictId?: string }> = [];

  /** 發音宿主按鈕兜底：資產根全域按 basename 探實檔（copyStyledHtml 內 probeAssetFile 的公用版）。 */
  private async probeAssetFilePublic(name: string): Promise<string | null> {
    try {
      const root = ASSET_FOLDER;
      const listing = await this.plugin.app.vault.adapter.list(root);
      for (const sub of listing.folders || []) {
        const cand = `${sub}/${name}`;
        try { if (await this.plugin.app.vault.adapter.exists(cand)) return cand; } catch { /* skip */ }
      }
    } catch { /* no asset root */ }
    return null;
  }

  private async ensureAssetBasemap(): Promise<Map<string, string>> {
    if (this.assetBasemap) return this.assetBasemap;
    const map = new Map<string, string>();
    try {
      const root = ASSET_FOLDER;
      const listing = await this.plugin.app.vault.adapter.list(root);
      for (const sub of listing.folders || []) {
        try {
          const subLs = await this.plugin.app.vault.adapter.list(sub);
          for (const f of subLs.files || []) map.set(f.split('/').pop() || '', f);
        } catch { /* skip */ }
      }
    } catch { /* no asset root */ }
    this.assetBasemap = map;
    return map;
  }

  private flushPendingFrames(): void {
    const q = this.pendingFrames;
    this.pendingFrames = [];
    for (const f of q) this.fillFrame(f.frame, f.html, f.keyText, f.dictId);
  }

  /** V-F4：per-frame load handler 記錄——fillFrame 對同一 iframe 重填（主題切換）
   * 時先移除舊 handler 再掛新的，避免 listener 逐次累積重複執行。 */
  private frameLoadHandlers = new Map<HTMLIFrameElement, () => void>();

  private fillFrame(frame: HTMLIFrameElement, html: string, keyText: string, dictId?: string): void {
    // B8/V-F1：舊 iframe 被面板重建拋棄時，其 body 上的 ResizeObserver 仍持有引用——
    // 只斷開本 frame 自己的舊 observer（per-frame 槽），不再波及他幀；
    // 已分離 frame 的殘留 RO 一併清掃。
    this.detachFrameRo(frame);
    // V-F4：同 frame 重填前先移除上一次掛的 load handler（否則逐次累積）。
    const prevLoad = this.frameLoadHandlers.get(frame);
    if (prevLoad) {
      frame.removeEventListener('load', prevLoad);
      this.frameLoadHandlers.delete(frame);
    }
    if (!this.assetBasemap) {
      this.pendingFrames.push({ frame, html, keyText, dictId });
      void this.ensureAssetBasemap().then(() => this.flushPendingFrames());
      return;
    }
    const iframe = frame;
    // rewrite resource refs through the shared asset resolver（meta.assets miss → basename 索引兜底）
    const resolver = (p: string) => {
      const asset = this.plugin.service.resolveAsset(p);
      if (asset) return { vaultPath: asset.vaultPath };
      const base = p.split(/[\\/]/).pop() || '';
      const hit = this.assetBasemap?.get(base);
      return hit ? { vaultPath: hit } : null;
    };
    const toUrl = (vaultPath: string) => {
      // 記錄 app:// URL → vaultPath 映射，供 inlineFrameAssets 宿主側讀檔
      // （requestUrl 不支持 app:// protocol——「ClientRequest only supports http: and
      // https:」，實機實錘；映射後走 adapter.readBinary 內聯，修詞條圖片空白）。
      const url = this.plugin.service.assetUrl(vaultPath);
      this.frameAssetPaths.set(url, vaultPath);
      return url;
    };
     
    
    let processed: string;
    try {
      processed = rewriteResourceRefs(html, resolver, toUrl);
    } catch {
      processed = html;
    }
    // MDict-ported view transforms: Chinese conversion + CJK line-wrap repair
    // 佛學模式：CBETA 缺字碼還原 + 佛典異體歸一（在繁簡轉換前）
    // 追加：蘭札體缺字碼 RJ-Cxxxx → 拉丁轉寫（咒語音譯段對照）
    if (this.plugin.settings.buddhistMode) {
      try {
        processed = restoreRanjanaCodes(processed, 'roman');
        processed = normalizeBuddhistChinese(processed);
      } catch { /* module unavailable */ }
    }
    const zhMode = (this.plugin.settings.zhConvert || 'none');
    if (zhMode !== 'none') processed = convertChinese(processed, zhMode);
    if (this.plugin.settings.fixZhLineWrap) processed = fixChineseLineWrap(processed);
    // TEI charDecl <graphic url>：<img class="li-lex0-g-img" src="相對路徑">——srcdoc iframe
    // 載不到相對路徑，須在 sanitize 前按 basename 匹配詞典 image 資產改寫成 app:// 資源 URL
    //（inlineFrameAssets 隨後統一轉 data: 內聯）。無匹配保留原 src（缺圖）。
    {
      const dictEarly = this.plugin.service.get(
        dictId || this.lastResults.find((r) => r.keyText === keyText)?.dictId || '',
      );
      const imgAssets = (dictEarly?.meta.assets || []).filter((a) => a.kind === 'image');
      if (imgAssets.length > 0) {
        processed = processed.replace(
          /(<img\b[^>]*class="[^"]*li-lex0-g-img[^"]*"[^>]*src=")([^"]*)"/g,
          (m: string, p1: string, src: string) => {
            const base = src.split('/').pop() || '';
            const hit = imgAssets.find((a) => (a.mddKey.split('/').pop() || '') === base);
            return hit ? `${p1}${toUrl(hit.vaultPath)}"` : m;
          },
        );
      } else {
        // TEI 缺字圖形資產缺失（如 koktai img/ 未隨包發佈）：把 li-lex0-g-img 破圖替換為
        // 佔位字形框（□＋gRef 尾碼）。
        processed = processed.replace(
          /<img\b[^>]*class="[^"]*li-lex0-g-img[^"]*"[^>]*>/g,
          (m: string) => {
            const ref = /(?:alt|data-gref)="([^"]*)"/.exec(m)?.[1]
              || (/([A-Za-z0-9_-]+)\.png$/i.exec(m)?.[1] ?? '');
            return `<span class="li-lex0-g-missing" title="${ref}">□</span>`;
          },
        );
      }
      // V-F8：原於此處寫入 img onerror 屬性做「載入失敗→佔位框」兜底，但
      // sanitizeHtml 白名單會剝除事件屬性，該字串從未生效（死代碼）——移除。
      // 對已改寫但載入失敗的破圖，inlineFrameAssets 內聯失敗時保留原 URL，
      // 瀏覽器顯示原生破圖樣式；不做後綁（iframe 內 DOM 事件需逐圖繫，成本大於收益）。
    }
    // 詞條內「目錄」entry:// 鏈接移除——區塊標題列已有宿主 TOC 按鈕，
    // 同一跳轉在 iframe 內再顯示一次屬功能重複，且 iframe 內點擊在移動端 WebView 本就
    // 不可靠（建按鈕的動機）。移除條件與按鈕檢測同源（鏈接文本含「目錄」），
    // 只刪 <a> 標籤本身、保留其所在行其餘內容。誤刪面已實測排除：三藏法數 1,779 條
    // 目錄鏈接全為 <A HREF="entry://00 總目錄">總目錄</a> 單一形態；廣韻 22,036 條
    // entry:// 鏈接無一文本含「目錄」；目錄頁詞條（00 總目錄）自身鏈接文本均為詞頭、不受影響。
    processed = processed.replace(
      /<a\s[^>]*href\s*=\s*(?:"entry:\/\/[^"]*"|'entry:\/\/[^']*'|entry:\/\/[^\s>]*)[^>]*>[^<]*目錄[^<]*<\/a>/gi,
      '',
    );
    // ③ MDX 內嵌 <style>：先抽出 CSS（供 frame head 注入），原 <style> 元素
    // 由 sanitizeHtml 統一剝除（匯出筆記路徑不調用本函數，維持剝除）。
    const { html: styleStripped, css: inlineCss } = extractStyleBlocks(processed);
    processed = styleStripped;
    const safe = sanitizeHtml(processed);
    // companion css for this dict (injected into every frame)
    // bugfix: 用調用方傳入的 dictId 精確定位辭典，避免同 keyText 跨辭典誤配 CSS
    const dict = this.plugin.service.get(
      dictId || this.lastResults.find((r) => r.keyText === keyText)?.dictId || '',
    );
    const cssAssets = (dict?.meta.assets || []).filter((a) => a.kind === 'css');
    const cssLinks = cssAssets
      .map((a) => `<link rel="stylesheet" href="${toUrl(a.vaultPath)}">`)
      .join('\n');
    const fontFace = (dict?.meta.assets || [])
      .filter((a) => a.kind === 'font')
      .map(
        (a) => {
          // 用字體自報 family 對齊 @font-face 名。
          // 此前 `lilium-<mddKey>` 自造名與詞條/CSS 引用的真實名（如 Calibri）對不上，
          // 字體進 iframe 卻從未被應用（document.fonts status=unloaded 實錘）。
          // 兜底：解析失敗/非字體資產（fontFamily 空）回退 lilium-<mddKey> 舊行為。
          const fam = a.fontFamily || `lilium-${a.mddKey.replace(/[^a-z0-9]/gi, '')}`;
          return `@font-face { font-family: ${cssStringLiteral(fam)}; src: url('${toUrl(a.vaultPath)}'); }`;
        },
      )
      .join('\n');
    // 辭典配套 CSS 已在導入時作用域化（選擇器加 #li-dict-<id> 前綴，見
    // css-isolate.ts / plugin.ts attachCompanions），正文需包進同 id 的包裹元素
    // 才能命中。無 css 資產時不包——避免多一層無謂的 div 影響既有 frame 樣式。
    // 舊辭典（CSS 未作用域化）包了也不會失效：其規則作用於 body，由包裹元素繼承。
    const scopeId = dict ? dictScopeId(dict.meta.id) : '';
    const bodyInner = cssAssets.length > 0 && scopeId ? `<div id="${scopeId}">${safe}</div>` : safe;
    // B29：宿主暗色時注入兜底樣式——配套 CSS 硬編黑字者在暗色下改為淺色
    // （僅當其 color 為純黑系時反轉；用 color-scheme + 覆蓋層實作，不碰配套 CSS 本體）。
    const dark = document.body.classList.contains('theme-dark')
      || (document.body.classList.contains('theme-light') === false
          && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const darkCss = dark
      ? `body { background: transparent !important; color: var(--text-normal, #dcddde) !important; }
         body :where(h1,h2,h3,h4,h5,h6) { color: var(--text-normal, #dcddde) !important; }
         body :where(table,th,td,blockquote,pre) { background: transparent !important; color: inherit !important; border-color: var(--background-modifier-border, #444) !important; }
         body :where(a) { color: var(--text-accent, #7aa2f7) !important; }
         /* 所查詞字頭（.zitou #000033 / .zitou2 #990000 硬編深色）夜間洗淺——僅 dark 模板內生效，白天模式不受影響 */
         body :where(.zitou) { color: var(--text-normal, #dcddde) !important; }
         body :where(img):not([src^="data:image/gif"]) { filter: brightness(.85) contrast(1.05); }
         html { color-scheme: dark; }${scopeId ? `#${scopeId}, #${scopeId} :where(div,span,p,section,article) { background-color: transparent !important; }` : ''}`
      : '';
    // lilium 內嵌字體注入 iframe：iframe 是獨立文檔，主文檔 @font-face 不可見；
    // data: URL 內聯（srcdoc 內 app:// URL 載入失敗，見 load handler 註釋）。
    // 按詞條文本過濾族——避免每個 iframe 內聯全量 3.2MB base64（效能修復）。
    const bundledFaceCss = bundledFontFaceCssForFrame(processed);
    const bundledTail = bundledFontFamilyTail(processed);
    const doc = `<!DOCTYPE html><html class="${dark ? 'li-dark' : 'li-light'}"><head><meta charset="utf-8">${cssLinks}<style>${bundledFaceCss}${inlineCss}${fontFace}${UD_FRAME_CSS}${darkCss}body{font-family:var(--font-text, sans-serif), ${bundledTail}, sans-serif;}</style></head>
<body>${bodyInner}</body></html>`;
    // V-F4：註冊 load handler 並記錄——重填時先移除舊 handler（見 fillFrame 開頭），
    // 避免同一 iframe 多次 fill 後 listener 逐次累積重複執行。
    let loadFired = false;
    const loadHandler = () => {
      loadFired = true;
      try {
        const body = iframe.contentDocument?.body;
        if (!body) return;
        // 資源內聯：srcdoc iframe 內無法載入 app:// 資源 URL（Obsidian 1.14
        // 跨 origin 阻擋，img/audio/font 全部 error event）——宿主 fetch 後轉
        // data: URL 內聯進去。失敗靜默保留原 URL。
        void this.inlineFrameAssets(iframe);
        // 異體字標註。
        // 只能放在 srcdoc 載入完成之後——此時 body 才是消毒後的真實 DOM。
        // annotateVariants() 全程用 DOM API（TreeWalker + createElement + textContent），
        // 不碰 HTML 字串，所以不會在 sanitizeHtml() 之後重新打開注入孔。
        if (this.plugin.settings.annotateVariants) {
          try {
             
            
            annotateVariants(body, (ch, common) => `${ch} → ${common}（異體字）`);
          } catch { /* 標註失敗不影響詞條本身 */ }
        }
        // 高度跟隨詞條內容：無 640 硬上限（長詞條如廣韻被截斷）；ResizeObserver 持續跟隨
        // （字體/圖片資源內聯完成、圖像載入後 scrollHeight 變化都能即時反映）。
        const fitFrame = () => {
          try {
            const h2 = Math.min(body.scrollHeight + 8, 4000);
            if (Math.abs((parseFloat(iframe.style.height) || 0) - h2) > 2) iframe.setCssStyles({ height: `${h2}px` });
          } catch { /* iframe 已分離 */ }
        };
        fitFrame();
        // 重入安全：loadHandler 可能因移動端 load 保險被手動補跑——先斷舊 RO 再建新，防重複 observe 疊加。
        const prevRo = this.frameRos.get(iframe);
        if (prevRo) prevRo.disconnect();
        const ro = new ResizeObserver(fitFrame);
        ro.observe(body);
        this.frameRos.set(iframe, ro); // V-F1：per-frame 槽記錄，重填/關閉時各自 disconnect
        iframe.addEventListener('load', fitFrame, { once: true });
        // 移動端 iframe 內合成 click 可能被宿主手勢層攔截——handler 同時掛 touchend，
        // touchHandled 旗標防 click 合成後雙觸發；IIFE 內所有分支共用。
        let liTouchHandled = false;
        const liEntryHandler = (e: MouseEvent) => { if (liTouchHandled) return; void (async (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          const a = target.closest('a');
          if (a) {
            e.preventDefault();
            const href = a.getAttribute('href') || '';
            if (/^https?:/i.test(href)) window.open(href);
            // 發音連結（sound:// 改寫後的 app:// 音頻；P2-3 擴 data: URL 內聯音頻）——
            // 點擊在連結原位插入 <audio controls> 播放器（可暫停/重播，非一次性 Audio()）。
            else if (/^data:audio\//i.test(href) || (/^app:\/\//i.test(href) && /\.(mp3|wav|ogg|m4a|aac|flac|spx)$/i.test(href.split('?')[0]))) {
              e.stopImmediatePropagation();
              try {
                // A3：Blob URL 洩漏防範——同連結重複點擊時，先 revoke 前次建立的 URL
                // 並移除舊播放器（切換而非再插一個）；data:audio 分支同樣處理。
                const prevUrl = audioBlobUrls.get(a);
                if (prevUrl) {
                  try { URL.revokeObjectURL(prevUrl); } catch { /* 已 revoke */ }
                  audioBlobUrls.delete(a);
                  a.parentElement?.querySelectorAll(':scope > audio.li-inline-audio').forEach((old) => old.remove());
                }
                // P2-3：data:audio URL 內聯直用——不經 requestUrl 抓取（宿主側無法取回 iframe 內 data: 亦無必要）
                if (/^data:audio\//i.test(href)) {
                  const audio = docCreateEl(iframe.contentDocument!, 'audio');
                  audio.controls = true;
                  audio.className = 'li-inline-audio li-audio-clip';
                  audio.src = href;
                  a.insertAdjacentElement('afterend', audio);
                  return;
                }
                let blob: Blob;
                try {
                  const res = await requestUrl(href); // B7：app:// 宿主側抓取改 obsidian requestUrl（srcdoc iframe 內 fetch 不可靠）
                  if (res.status >= 400) throw new Error('HTTP ' + res.status);
                  blob = new Blob([res.arrayBuffer], { type: res.headers['content-type'] || '' });
                } catch (eReq) {
                  // Fallback：Obsidian 1.14+ requestUrl 對 app:// 立即拋錯——解 href 的 vault 相對路徑走 adapter.readBinary。
                  // href 形態 app://<id>/home/…/<vault>/<path>?…——取 vault 根之後的相對路徑（decodeURIComponent 還原中文）。
                  let rel = '';
                  try {
                    const m = href.match(/\/Vaults\/[^/]+\/(.+?)(?:\?|$)/) || href.match(/app:\/\/[^/]+\/(?:[^/]+\/)*?lilium-test\/(.+?)(?:\?|$)/);
                    if (m) rel = decodeURIComponent(m[1]);
                  } catch { /* 保留空 */ }
                  if (!rel) {
                    // 兜底：按各辭典 meta.assets 的 vaultPath 與 href 尾段檔名比對
                    try {
                      const tail = decodeURIComponent(href.split('?')[0].split('/').pop() || '');
                      for (const d of this.plugin.service.all) {
                        const am = (d as unknown as { meta?: { assets?: Record<string, { mddKey?: string; vaultPath?: string }> } }).meta?.assets;
                        if (!am) continue;
                        const hitA = Object.values(am).find(v => v.vaultPath && v.vaultPath.endsWith('/' + tail));
                        if (hitA?.vaultPath) { rel = hitA.vaultPath; break; }
                      }
                    } catch { /* 兜底失敗走原拋錯 */ }
                  }
                  if (!rel) throw eReq;
                  const buf = await this.plugin.app.vault.adapter.readBinary(rel);
                  blob = new Blob([buf], { type: rel.endsWith('.wav') ? 'audio/wav' : rel.endsWith('.mp3') ? 'audio/mpeg' : 'audio/ogg' });
                }
                // .spx（Ogg Speex）瀏覽器不解碼——vendor libspeex wasm 轉 WAV 再播
                if (/.spx$/i.test(href.split('?')[0])) {
                  const bytes = new Uint8Array(await blob.arrayBuffer());
                  
                  // 統一內嵌路線：wasm 內嵌進 main.js（base64）——
                  // Obsidian 官方插件安裝只分發 main.js/manifest/styles.css，vendor 目錄不會被安裝，
                  // 故不再讀磁碟 vendor 檔；wasm 唯一來源＝內嵌常量（單檔自足）。
                  
                  const { wav } = await decodeSpeexToWav(bytes);
                  blob = new Blob([wav], { type: 'audio/wav' });
                }
                // P2-3：原位插入播放器——Blob URL 掛 <audio controls> 於連結後方（可暫停/重播）
                const audioEl = docCreateEl(a.ownerDocument, 'audio');
                audioEl.setAttribute('controls', '');
                const objUrl = URL.createObjectURL(blob);
                audioBlobUrls.set(a, objUrl); // A3：記錄供同連結下次點擊 revoke
                audioEl.src = objUrl;
                audioEl.className = 'li-inline-audio';
                audioEl.classList.add('li-audio-clip'); // iframe doc 元素無 Obsidian addClass 原型擴充，改原生 classList
                a.insertAdjacentElement('afterend', audioEl);
                // V-F12：play() 可能被瀏覽器拒絕（自動播放政策、資源載入失敗等），
                // fire-and-forget 下拒絕會成 unhandled rejection；發不出聲不該打斷閱讀，靜默吞掉即可。
                void audioEl.play().catch(() => {});
              } catch (err) {
                // 發音文件缺失——按要求 Notice 提示（不再靜默）；spx 解碼失敗一併提示
                try {
                  
                  liNotice(this.plugin.T('dict.audio.missing', { word: keyText || (a.textContent || '').trim() }) + (/spx/i.test(href) ? ' [' + String(err && err.message || err) + ']' : ''));
                } catch { /* Notice 失敗靜默 */ }
              }
            }
            // sound:// 原始連結（resolver 未命中的發音引用）＝無發音文件 → Notice
            else if (/^sound:\/\//i.test(href)) {
              e.stopImmediatePropagation();
              try {
                
                liNotice(this.plugin.T('dict.audio.missing', { word: keyText || (a.textContent || '').trim() }));
              } catch { /* Notice 失敗靜默 */ }
            }
            // B38：MDict entry:// 詞條內跳轉——取出目標詞，
            // 走插件現有查詢管線重渲染面板（目錄頁/交叉引用可用）。
            // 常見形式：entry://詞條名；entry://entry://…（嵌套，剝乾淨）；含 URL 編碼。
            else if (/^entry:\/\//i.test(href)) {
              let targetWord = href.replace(/^(entry:\/\/)+/i, '').trim();
              try { targetWord = decodeURIComponent(targetWord); } catch { /* 保留原字面 */ }
              if (targetWord) {
                // 查詢在宿主文檔上下文跑（doLookup 會整面板重渲染）；Notice 反饋查無
                const found = this.plugin.service.lookupAll(targetWord);
                if (found.length) {
                  this.doLookup(targetWord);
                } else {
                  
                  liNotice(this.plugin.T('dict.entryJump.miss', { word: targetWord }));
                }
              }
            }
            // ④ bword:// 詞條內跳轉（MDict 常見 scheme）——同 entry:// 管線查詢重渲染。
            else if (/^bword:/i.test(href)) {
              let targetWord = href.replace(/^bword:\/\//i, '').replace(/^bword:/i, '').trim();
              try { targetWord = decodeURIComponent(targetWord); } catch { /* 保留原字面 */ }
              if (targetWord) {
                const found = this.plugin.service.lookupAll(targetWord);
                if (found.length) {
                  this.doLookup(targetWord);
                } else {
                  
                  liNotice(this.plugin.T('dict.entryJump.miss', { word: targetWord }));
                }
              }
            }
            // P2-4：TEI xr data-target（.li-lex0-ref / .li-lex0-oref / .li-lex0-pref）——
            // 點擊取 data-target（#xml:id 或詞形）→ 現有查詢管線 doLookup，與 entry:// 同體驗。
            // A2：#xml:id 型 target 必然查無（lookupAll 的鍵是詞頭不是 xml:id）——
            // 先經 Lex0Reader.idToKey（xml:id → 詞頭，導入期註冊）解析為詞頭再查；
            // 查無 idToKey 仍剝 # 原字查詢，落 dict.entryJump.miss。
            else if (target.closest('.li-lex0-ref, .li-lex0-oref, .li-lex0-pref')) {
              e.stopImmediatePropagation();
              const el = target.closest('.li-lex0-ref, .li-lex0-oref, .li-lex0-pref') as HTMLElement;
              const dt = el.getAttribute('data-target') || '';
              let targetWord = dt || (el.textContent || '').trim();
              if (dt.startsWith('#')) {
                let id = dt.slice(1);
                try { id = decodeURIComponent(id); } catch { /* 保留原字面 */ }
                let hw: string | null = null;
                for (const d of this.plugin.service.all) {
                  const rd = (d as unknown as { reader?: { idToKey?: Map<string, string> } }).reader;
                  const k = rd?.idToKey?.get(id);
                  if (k) { hw = k; break; }
                }
                targetWord = hw || id;
              } else {
                try { targetWord = decodeURIComponent(targetWord); } catch { /* 保留原字面 */ }
              }
              if (targetWord) {
                const found = this.plugin.service.lookupAll(targetWord);
                if (found.length) {
                  this.doLookup(targetWord);
                } else {
                   
                  
                  liNotice(this.plugin.T('dict.entryJump.miss', { word: targetWord }));
                }
              }
            }
          }
        })(e); };
        body.addEventListener('click', liEntryHandler);
        // 移動端：touchend 觸發同 handler；之後短窗內吞掉合成 click 防雙發
        body.addEventListener('touchend', (ev: TouchEvent) => {
          const target = (ev.target as HTMLElement);
          const fake = new MouseEvent('click', { bubbles: true, cancelable: true });
          // 先派發（旗標此刻未置位，handler 正常執行），再置旗標吞掉瀏覽器後續原生合成 click 防雙發
          if (target) { const handled = target.dispatchEvent(fake); if (fake.defaultPrevented) { ev.preventDefault(); liTouchHandled = true; window.setTimeout(() => { liTouchHandled = false; }, 500); } void handled; }
        }, { passive: false });
      } catch {
        /* cross-origin */
      }
    };
    this.frameLoadHandlers.set(iframe, loadHandler); // V-F4：記錄供重填時對稱移除
    iframe.addEventListener('load', loadHandler);
    iframe.srcdoc = doc;
    // 移動端詞條空白防禦：部分 WebView（Capacitor）對 srcdoc iframe 的 load 事件
    // 存在不出/遲到前科（B41a-f 同族）——load 不發＝loadHandler 全跳＝inlineFrameAssets
    // 與 fitFrame 都不跑：圖片不內聯、高度恆 0＝「區塊內容顯示空白」。
    // 保險：短延遲後 body 已有子節點而 load 仍未發→手動補跑一次（各步驟重入安全：
    // inlineFrameAssets 逐節點改寫、fitFrame 幂等；RO/事件掛載用 wired 標記防重複）。
    window.setTimeout(() => {
      if (loadFired) return;
      try {
        const body = iframe.contentDocument?.body;
        if (body && body.childElementCount > 0) loadHandler();
      } catch { /* 已分離 */ }
    }, 300);
  }

  /**
   * srcdoc iframe 內資源內聯。
   * app:// URL 在 srcdoc iframe 中一律載入失敗（跨 origin）；宿主 fetch 後轉
   * data: URL 逐個替換。覆蓋：img[src]、audio/video source、
   * link[rel=stylesheet]（CSS 內 url() 一併內聯）、style 內 @font-face url()。
   */
  private async inlineFrameAssets(iframe: HTMLIFrameElement): Promise<void> {
    const doc = iframe.contentDocument;
    if (!doc) return;
    // 移動端卡頓修復：data URI 模組級緩存——同一資源（喇叭圖示/發音 wav）
    // 在多 iframe、多次查詢間被反覆 fetch+base64（廣韻 wav 數百 KB×每 hit iframe），
    // 移動端 CPU 弱 → 卡頓主因。緩存後每資源僅內聯一次。
    const toData = async (url: string, mime?: string): Promise<string | null> => {
      try {
        const cached = inlineDataCache.get(url);
        if (cached) { // V-F9：同上——命中刷新到尾（真 LRU）
          inlineDataCache.delete(url);
          inlineDataCache.set(url, cached);
          return cached;
        }
        let buf: Uint8Array | null = null;
        let contentType = mime;
        // app:// 資源先查 URL→vaultPath 映射走 adapter.readBinary——
        // requestUrl 不支持 app:// protocol（「ClientRequest only supports http: and
        // https:」實機實錘），B7 改造後所有 app:// 內聯全數靜默失敗＝詞條圖片空白真兇。
        const vaultPath = this.frameAssetPaths.get(url);
        if (vaultPath) {
          try {
            buf = new Uint8Array(await this.plugin.app.vault.adapter.readBinary(normalizePath(vaultPath)));
          } catch { /* fallthrough to requestUrl */ }
        }
        if (buf === null) {
          const res = await requestUrl(url); // B7：改 obsidian requestUrl
          if (res.status >= 400) return null;
          contentType = contentType || res.headers['content-type'];
          buf = new Uint8Array(res.arrayBuffer);
        }
        if (!contentType) contentType = 'application/octet-stream';
        // >2MB 不內聯（移動端內存壓力；大音頻保持 app:// 引用）
        if (buf.length > 2 * 1024 * 1024) return null;
        const d = `data:${contentType};base64,${bytesToBase64(buf)}`; // C5：共用 bytesToBase64
        if (inlineDataCache.size >= 128) { // 卡頓修復：LRU 逐條淘汰（Map 插入序＝訪問序），不再整桶 clear 打掉熱資源
          const oldest = inlineDataCache.keys().next();
          if (!oldest.done) inlineDataCache.delete(oldest.value);
        }
        inlineDataCache.set(url, d);
        return d;
      } catch {
        return null;
      }
    };
    const jobs: Promise<void>[] = [];
    // 圖片
    doc.querySelectorAll('img[src^="app://"]').forEach((img) => {
      const src = img.getAttribute('src') || '';
      jobs.push(toData(src).then((d) => { if (d) img.setAttribute('src', d); }));
    });
    // 音頻/視頻 source 與 audio/video[src]
    doc.querySelectorAll('audio[src^="app://"], video[src^="app://"], source[src^="app://"]').forEach((el) => {
      const src = el.getAttribute('src') || '';
      jobs.push(toData(src).then((d) => { if (d) el.setAttribute('src', d); }));
    });
    // stylesheet link → <style>（連同 CSS 內 url() 內聯）
    doc.querySelectorAll('link[rel="stylesheet"][href^="app://"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      jobs.push((async () => {
        try {
          let css: string;
          // app:// CSS 先查 URL→vaultPath 映射走 adapter.readBinary——
          // requestUrl 不支持 app://（同圖片資源根因，此前詞典配套 CSS 全部內聯失敗＝詞條樣式盡失）。
          const vp = this.frameAssetPaths.get(href);
          if (vp) {
            css = new TextDecoder().decode(
              await this.plugin.app.vault.adapter.readBinary(normalizePath(vp)),
            );
          } else {
            const res = await requestUrl(href); // B7：改 obsidian requestUrl
            if (res.status >= 400) return;
            css = res.text;
          }
          const urls = [...css.matchAll(/url\(\s*['"]?(app:\/\/[^'")\s]+)['"]?\s*\)/g)];
          for (const m of urls) {
            const d = await toData(m[1]);
            if (d) css = css.split(m[1]).join(d);
          }
          const style = docCreateEl(doc, 'style');
          style.textContent = css;
          link.replaceWith(style);
        } catch { /* 保留原 link */ }
      })());
    });
    // style 內 @font-face / url()
    doc.querySelectorAll('style').forEach((style) => {
      const css = style.textContent || '';
      const urls = [...css.matchAll(/url\(\s*['"]?(app:\/\/[^'")\s]+)['"]?\s*\)/g)];
      if (!urls.length) return;
      jobs.push((async () => {
        let out = css;
        for (const m of urls) {
          const d = await toData(m[1]);
          if (d) out = out.split(m[1]).join(d);
        }
        style.textContent = out;
      })());
    });
    await Promise.allSettled(jobs);
  }

  // -------------------------------------------------------------- bookmarks

  showBookmarks(): void {
    this.panel = 'bookmarks';
    this.subTab = 'bookmarks';
    this.renderShell();
  }

  // ---------------------------------------------------------------- history

  showHistory(): void {
    this.panel = 'history';
    this.subTab = 'history';
    this.renderShell();
  }

  // ----------------------------------------------------------------- manage

  focusFullText(): void {
    this.panel = 'manage';
    this.subTab = 'manage';
    this.renderShell();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const input = this.contentEl.querySelector('.li-ft-row input') as HTMLInputElement | null;
    input?.focus();
  }

  // S2 樣板：manage 面板本體已抽取至 panels.ts（ManagePanel.build）；
  // showDictInfo / reorderDict 因 renderScopeChips 亦使用而留在本檔。

  // ------------------------------------------------------------ dict info editor

  private showDictInfo(d: LiDict): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const modalBody = this.contentEl.querySelector('.li-articles') as HTMLElement | null;
    if (!modalBody) return;
    // inline editor panel replacing the manage list
    const el = this.contentEl.querySelector('.li-articles') as HTMLElement;
    el.empty();
    el.createEl('h3', { cls: 'li-panel-title', text: this.plugin.T('dict.manage.infoTitle', { name: d.meta.name }) });

    const form = el.createDiv({ cls: 'li-info-form' });
    const override = this.plugin.store.getOverride(d.meta.id);

    const mkField = (label: string, value: string, onChange: (v: string) => void, isTextarea = false): HTMLElement => {
      const field = form.createDiv({ cls: 'li-field' });
      field.createEl('label', { text: label });
      if (isTextarea) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
        const ta = field.createEl('textarea', { cls: 'li-input', attr: { rows: '4' } }) as HTMLTextAreaElement;
        ta.value = value;
        ta.addEventListener('change', () => onChange(ta.value));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
        const inp = field.createEl('input', { cls: 'li-input', attr: { type: 'text' } }) as HTMLInputElement;
        inp.value = value;
        inp.addEventListener('change', () => onChange(inp.value));
      }
      return field;
    };

    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    mkField(this.plugin.T('dict.manage.displayName'), override.displayName || d.meta.name, (v) =>
      this.plugin.store.setOverride(d.meta.id, { displayName: v }).then(() => liNotice('已保存显示名')),
    );
    // group with datalist
    const groupField = form.createDiv({ cls: 'li-field' });
    groupField.createEl('label', { text: this.plugin.T('dict.manage.group') });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const groupInput = groupField.createEl('input', {
      cls: 'li-input',
      attr: { type: 'text', list: 'li-groups-list', value: override.group, placeholder: this.plugin.T('dict.manage.groupPlaceholder') },
    }) as HTMLInputElement;
    const datalist = groupField.createEl('datalist', { attr: { id: 'li-groups-list' } });
    for (const g of this.plugin.store.data.groups) datalist.createEl('option', { value: g });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    groupInput.addEventListener('change', async () => {
      const g = groupInput.value.trim();
      if (g && !this.plugin.store.data.groups.includes(g)) await this.plugin.store.addGroup(g);
      await this.plugin.store.setOverride(d.meta.id, { group: g });
      liNotice(this.plugin.T('dict.manage.savedGroup'));
    });

    const ro = (label: string, value: string, ta = false) => {
      const f = mkField(label, value, () => {}, ta);
      f.classList.add('is-readonly');
    };
    ro(this.plugin.T('dict.manage.info.id'), d.meta.id);
    ro(this.plugin.T('dict.manage.info.format'), d.meta.format.toUpperCase());
    ro(this.plugin.T('dict.manage.info.entries'), `${d.meta.entryCount.toLocaleString()}`);
    if (d.meta.mddEntryCount !== undefined) {
      ro(this.plugin.T('dict.manage.info.mdd'), `${d.meta.mddEntryCount.toLocaleString()}`);
    }
    ro(this.plugin.T('dict.manage.info.source'), d.meta.files.join(', '));
    ro(this.plugin.T('dict.manage.info.desc'), d.meta.description || '', true);

    // assets summary
    if (d.meta.assets?.length) {
      const sec = el.createDiv({ cls: 'li-asset-summary' });
      sec.createEl('h4', { text: this.plugin.T('dict.manage.assetsExtracted', { n: d.meta.assets.length }) });
      const byKind = new Map<string, number>();
      for (const a of d.meta.assets) byKind.set(a.kind, (byKind.get(a.kind) || 0) + 1);
      const chips = sec.createDiv({ cls: 'li-chips' });
      for (const [kind, n] of byKind) chips.createSpan({ cls: 'li-chip', text: `${kind} × ${n}` });
    }

    // raw mdict header
    const headerInfo = this.plugin.dictHeaderInfo(d.meta.id);
    if (headerInfo && Object.keys(headerInfo).length) {
      const sec = el.createDiv({ cls: 'li-asset-summary' });
      sec.createEl('h4', { text: this.plugin.T('dict.manage.mdxHeader') });
      const table = sec.createEl('table', { cls: 'li-format-table' });
      for (const [k, v] of Object.entries(headerInfo)) {
        const tr = table.createEl('tr');
        tr.createEl('td', { text: k });
        tr.createEl('td', { text: v });
      }
    }

    const back = el.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.manage.back') });
    back.addEventListener('click', () => this.renderShell());
  }

  // ------------------------------------------------------------- full-text

  private async doFullText(query: string, opts?: { matchCase?: boolean; wholeWords?: boolean; useRegex?: boolean }): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const el = this.contentEl.querySelector('.li-articles') as HTMLElement | null;
    if (!el) return;
    /* 盤點補缺 D：無效正則即時報錯（原為靜默 0 結果）。 */
    if (opts?.useRegex) {
      try {
        new RegExp(query);
      } catch (e) {
        el.empty();
        el.createEl('p', { cls: 'li-none-hint', text: this.plugin.T('dict.ft.badRegex', { err: String((e as Error)?.message ?? e) }) });
        return;
      }
      // A6（ReDoS fail-closed）：全文掃描是同步 for-of 逐條 exec，災難正則（嵌套
      // 量詞）會單核凍結 UI。語法有效但含已知危險構型者拒搜；另限查詢長度。
      const risk = unsafeRegexReason(query);
      if (risk) {
        el.empty();
        el.createEl('p', { cls: 'li-none-hint', text: this.plugin.T('dict.ft.unsafeRegex') });
        return;
      }
      if (query.length > 500) {
        el.empty();
        el.createEl('p', { cls: 'li-none-hint', text: this.plugin.T('dict.ft.regexTooLong') });
        return;
      }
    }
    this.ftHandle?.cancel();
    el.empty();
    el.createEl('h3', { cls: 'li-panel-title', text: this.plugin.T('dict.manage.fulltextTitle', { query }) });

    const progressBar = el.createDiv({ cls: 'li-progress' });
    const progressText = progressBar.createSpan({ cls: 'li-progress-text', text: this.plugin.T('dict.manage.searching') });
    const barOuter = progressBar.createDiv({ cls: 'li-progress-bar' });
    const barInner = barOuter.createDiv({ cls: 'li-progress-inner', text: '' });

    const resultsEl = el.createDiv();
    const cancelBtn = el.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.manage.cancel') });

    let lastPct = -1;
    this.ftHandle = this.plugin.service.fullTextSearch(query, {
      perDictLimit: this.plugin.settings.fullTextLimit,
      searchSettings: {
        matchCase: opts?.matchCase ?? false,
        matchWholeWords: opts?.wholeWords ?? false,
        useRegex: opts?.useRegex ?? false,
      },
      onProgress: (p) => {
        const pct = p.total ? Math.round((p.scanned / p.total) * 100) : 0;
        if (pct !== lastPct) {
          lastPct = pct;
          progressText.textContent = `${p.dictName}: ${p.scanned.toLocaleString()} / ${p.total.toLocaleString()}`;
          barInner.setCssStyles({ width: `${pct}%` });
        }
      },
    });

    cancelBtn.addEventListener('click', () => this.ftHandle?.cancel());

    const results = await this.ftHandle.promise;
    progressBar.remove();
    cancelBtn.remove();
    resultsEl.empty();

    let total = 0;
    for (const hits of results.values()) total += hits.length;
    if (!total) {
      resultsEl.createEl('p', { cls: 'li-none-hint', text: this.plugin.T('dict.ft.noMatch', { query }) });
      return;
    }
    resultsEl.createEl('p', { cls: 'li-hits-total', text: this.plugin.T('dict.ft.resultsTotal', { n: total }) });

    // tool row: sample + export (Wordless results post-processing pattern)
    const flat: Array<{ word: string; dictName: string; field: string; snippet: string }> = [];
    const dicts0 = new Map(this.plugin.service.all.map((d) => [d.meta.id, d]));
    for (const [dictId, hits] of results) {
      const dn = dicts0.get(dictId) ? this.plugin.service.displayName(dicts0.get(dictId)!) : dictId;
      for (const h of hits) flat.push({ word: h.keyText, dictName: dn, field: h.field, snippet: h.snippet });
    }

    const tools = resultsEl.createDiv({ cls: 'li-ft-tools' });
    const sampleBtn = tools.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.manage.sample50') });
    sampleBtn.addEventListener('click', () => {
      const sampled = sampleResults(flat, Math.min(50, flat.length), 'simple');
      renderHitList(sampled, true);
      liNotice(this.plugin.T('dict.manage.sampled', { n: sampled.length }));
    });
    const exportCsvBtn = tools.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.ft.exportCsv') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    exportCsvBtn.addEventListener('click', async () => {
      const t = buildExportTables(flat);
      const file = `lilium/Shares/fulltext-${fileTimestamp()}.csv`;
      await (this.plugin as unknown as { ensureFolder(p: string): Promise<void> }).ensureFolder(file);
      await this.plugin.app.vault.adapter.write(normalizePath(file), t.csv);
      liNotice(this.plugin.T('dict.manage.exportCsv', { file }));
    });
    const exportMdBtn = tools.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.ft.exportMd') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    exportMdBtn.addEventListener('click', async () => {
      const t = buildExportTables(flat);
      const file = `lilium/Shares/fulltext-${fileTimestamp()}.md`;
      await (this.plugin as unknown as { ensureFolder(p: string): Promise<void> }).ensureFolder(file);
      await this.plugin.app.vault.adapter.write(normalizePath(file), t.markdown);
      liNotice(this.plugin.T('dict.manage.exportMd', { file }));
    });

    const listContainer = resultsEl.createDiv();
    const renderHitList = (rows: Array<{ word: string; dictName: string; field: string; snippet: string }>, showDictEach = false) => {
      listContainer.empty();
      let lastDict = '';
      for (const row of rows) {
        if (showDictEach && row.dictName !== lastDict) {
          const sec = listContainer.createDiv({ cls: 'li-dict-sep' });
          sec.createSpan({ cls: 'li-dict-badge', text: row.dictName });
          lastDict = row.dictName;
        }
        const item = listContainer.createDiv({ cls: 'li-ft-item' });
        /* 盤點補缺 C：每項帶辭典來源小標——不換全部分組也能看出出處。 */
        if (row.dictName) item.createSpan({ cls: 'li-ft-tag', text: row.dictName });
        const wordBtn = item.createEl('button', { cls: 'li-ft-word', text: row.word });
        wordBtn.addEventListener('click', () => this.doLookup(row.word));
        if (row.field === 'content' && row.snippet) {
          // pattern markers \u0001..\u0002 → <mark>
          const sn = item.createDiv({ cls: 'li-ft-snippet' });
          const raw = row.snippet;
          // eslint-disable-next-line no-control-regex -- 字典解析/文本清洗必需的控制字符匹配（\x00 剝除/分隔符），無 ReDoS（無嵌套量詞）——審計批次三。
          const parts = raw.split(/[\u0001\u0002]/);
          for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 1) sn.createEl('mark', { text: parts[i] });
            else sn.appendText(parts[i]);
          }
        } else {
          item.createSpan({ cls: 'li-ft-tag', text: this.plugin.T('dict.ft.tag.match') });
        }
      }
    };
    /* 盤點補缺 F：長列表分批——先顯示前 200 條，「顯示全部」按鈕展開。 */
    const PAGE = 200;
    if (flat.length > PAGE) {
      renderHitList(flat.slice(0, PAGE));
      const moreBtn = resultsEl.createEl('button', { cls: 'li-mini-btn', text: this.plugin.T('dict.ft.showAll', { n: flat.length.toLocaleString() }) });
      moreBtn.addEventListener('click', () => {
        renderHitList(flat);
        moreBtn.remove();
      });
    } else {
      renderHitList(flat);
    }
  }
}

/** inlineFrameAssets data URI 模組級緩存（跨 iframe/查詢復用；v0.1.20 移動端卡頓修復） */
/** C1：LI-IMG / LI-AUDIO 佔位 token 回填共用——函數式替換（防 $ 序列解讀）＋清除未命中殘留 token。 */
/** NUL 包夾 token 回填正則：以 fromCharCode 動態構造（語義同 \u0000 字面；避免控制字符正則字面） */
function nulTokenRe(kind: string): RegExp {
  const NUL = String.fromCharCode(0);
  return new RegExp(NUL + kind + "-\\d+" + NUL, "g");
}
function replaceTokens(out: string, tokens: Array<{ token: string; html: string }>, leftoverRe: RegExp): string {
  for (const r of tokens) out = out.replace(r.token, () => r.html);
  return out.replace(leftoverRe, '');
}

/** C5：bytes → base64（分塊 String.fromCharCode 防 call stack 爆棧）——img inlineData 與 iframe toData 共用。 */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let o = 0; o < bytes.length; o += CH) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(o, o + CH)));
  return btoa(bin);
}

const inlineDataCache = new Map<string, string>();

/** CSS injected into each article iframe */
export const UD_FRAME_CSS = `body { transition: color .35s ease, background-color .35s ease; }\n
  /* B29：夜間模式下詞條文字仍黑色——配套 CSS 常硬編 color，
     覆蓋掉繼承的 var(--text-normal)。兜底：color-scheme 強制跟隨宿主＋未指定色者繼承面板文字色。 */
  :root { color-scheme: light dark; }
  body { color: var(--text-normal, #ddd); }
  body {
    margin: 0; padding: 8px 12px;
    font-family: var(--font-interface, -apple-system, sans-serif);
    font-size: 14.5px; line-height: 1.65;
    color: var(--text-normal); background: transparent;
    word-wrap: break-word;
  }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  audio { width: 100%; margin: 4px 0; }
  table { border-collapse: collapse; margin: 6px 0; max-width: 100%; }
  td, th { border: 1px solid var(--background-modifier-border); padding: 4px 8px; }
  a { color: var(--link-color, var(--text-accent, LinkText)); text-decoration: none; }
  a:hover { text-decoration: underline; }
  blockquote { margin: 6px 0; padding: 2px 10px; border-left: 3px solid var(--background-modifier-border); color: var(--text-muted); }
  pre, code { font-family: var(--font-mono, monospace); font-size: 0.92em; }
  .sd-phonetic { color: var(--text-muted); font-family: var(--font-mono, monospace); font-size: 0.95em; }
  .sd-plain { white-space: pre-wrap; }
  b, strong { font-weight: 650; }
  hr { border: none; border-top: 1px solid var(--background-modifier-border); }
  /* B4：異體字標註。
     標註是消毒之後用 DOM API 加的（見 variant-annotate.ts），
     這裡只負責「看起來是什麼樣子」——淡底 + 點線下劃線，不干擾閱讀。 */
  .li-var {
    border-bottom: 1px dotted currentColor;
    background: var(--background-modifier-hover, rgb(124 111 100 / 12%));
    border-radius: 2px;
    cursor: help;
  }
  /* iframe 裡也支援 data-tip（詞條面板那一套 tooltip 規則掛在 .li-root 下，
     這裡的 DOM 在 iframe 內，沒有 .li-root 祖先，所以得自己來一份） */
  .li-var[data-tip] { position: relative; }
  .li-var[data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute;
    left: 50%;
    bottom: calc(100% + 2px);
    transform: translateX(-50%);
    z-index: 40;
    width: max-content;
    max-width: 220px;
    padding: 3px 7px;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border, CanvasText);
    background: var(--background-secondary, Canvas);
    color: var(--text-normal, CanvasText);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    white-space: normal;
    pointer-events: none;
  }
`;


// ------------------------------------------------------------------ TOC modal
// MDict 目錄頁彈窗（三藏法數「00 總目錄」點擊後整頁 4000px+ 難瀏覽）。

/** 目錄頁特徵：entry:// 鏈接為主體（>80 條）且幾乎無 <p> 正文段落。
 *  B6：長正文（如經文全文大量 entry:// 引用、極少分段）也會落入
 *  「高 entry:// + 低 <p>」形態而被誤劫去 modal。真 TOC（如三藏法數）除 entry://
 *  密集外，還有短行鏈接條目密集的形態——正文頁通常伴隨大量非鏈接內容。
 *  加負向條件：HTML 體量相對 entry:// 密度過大（每條 entry 平均攤到的字節
 *  遠超一行目錄條目）視為正文。目錄行 `…href="entry://…">標題</a><br>` 一行
 *  約 60-120 字節；正文頁每條引用常伴數百字節段落。閾值取 400B/條，
 *  目錄頁（~100B/條）不觸發，正文頁輕易超過。 */
export function isTocLikeHtml(html: string): boolean {
  if (!html) return false;
  const entryLinks = (html.match(/entry:\/\//gi) || []).length;
  if (entryLinks < 80) return false;
  const paras = (html.match(/<p\b/gi) || []).length;
  if (paras > 2) return false;
  // 負向條件：正文頁體量/條目比遠高於目錄頁（每條 entry 平均字節 > 400）
  if (html.length / entryLinks > 400) return false;
  return true;
}

/** 從目錄頁 HTML 抽取（章節標題, [詞條名]）結構——分頁渲染資料源。 */
function parseTocSections(html: string): Array<{ title: string; words: string[] }> {
  const sections: Array<{ title: string; words: string[] }> = [];
  // B5：上限 20 會把長章節標題（>20 字符）整段丟掉，導致該標題下
  // 的詞條被錯組進前一節。放寬到 60（modal 章節下拉標籤可容納，超長自會截斷顯示）。
  const re = /<b[^>]*>([^<]{1,60})<\/b>|<a\s+href="entry:\/\/([^"]+)"/gi;
  let cur: { title: string; words: string[] } | null = null;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) {
      cur = { title: m[1].trim(), words: [] };
      sections.push(cur);
    } else if (m[2] !== undefined) {
      let w = m[2].replace(/^(entry:\/\/)+/i, '').trim();
      try { w = decodeURIComponent(w); } catch { /* 保留原字面 */ }
      if (w && !seen.has(w)) {
        seen.add(w);
        if (!cur) { cur = { title: '', words: [] }; sections.push(cur); }
        cur.words.push(w);
      }
    }
  }
  return sections.filter((s) => s.words.length > 0);
}

const TOC_PAGE_SIZE = 100;

/** 目錄彈窗：分頁顯示（每頁 100 詞條）＋可滾動＋點詞條直接查詢。 */
class TocModal extends Modal {
  private page = 0;
  // C14：不用欄位初始化器引用 this.hits（useDefineForClassFields/ES2022 下
  // 欄位初始化在 super() 之前於參數欄位賦值後執行，順序脆弱且在舊目標下
  // this.hits 尚未賦值即崩）——改建構子內顯式賦值。
  private sections: Array<{ title: string; words: string[] }>;
  private flat: string[];

  constructor(app: App, private hits: Array<LookupHit & { dictId: string }>,
    private onLookup: (word: string) => void, private title: string) {
    super(app);
    this.sections = parseTocSections(this.hits[0]?.html || '');
    this.flat = this.sections.flatMap((s) => s.words);
  }

  onOpen(): void {
    this.contentEl.addClass('li-toc-modal');
    this.titleEl.setText(this.title);
    this.render();
  }

  private render(): void {
    const c = this.contentEl;
    c.empty();
    if (!this.flat.length) {
      // 結構解析失敗（非標準格式）→ 兜底：原始 HTML 直塞可滾動容器
      const raw = c.createDiv({ cls: 'li-toc-raw' });
      const fr = raw.createEl('iframe', { cls: 'li-frame' });
      fr.setAttribute('sandbox', 'allow-same-origin');
      // 彈窗環境無 view 實例的 fillFrame 管線，用最簡 srcdoc（鏈接點擊轉宿主查詢）
      const html = this.hits[0]?.html || '';
      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${bundledFontFaceCssForFrame(html)}body{margin:8px;font-size:14px;line-height:1.7;color:var(--text-normal);background:transparent;font-family:var(--font-text, sans-serif), ${bundledFontFamilyTail(html)}, sans-serif}a{color:var(--text-accent);text-decoration:none;cursor:pointer}</style></head><body>${html}</body></html>`;
      fr.srcdoc = doc;
      fr.addEventListener('load', () => {
        try {
          const d = fr.contentDocument;
          if (!d) return;
          d.querySelectorAll('a[href^="entry://"]').forEach((a) => {
            a.addEventListener('click', (e) => {
              e.preventDefault();
              const w = (a.getAttribute('href') || '').replace(/^(entry:\/\/)+/i, '').trim();
              if (w) { this.close(); this.onLookup(w); }
            });
          });
        } catch { /* cross-origin */ }
      });
      return;
    }
    // 分頁列（章節級）：一頁 = 一個章節；章節詞條 >100 再細分
    const pages: Array<{ label: string; words: string[] }> = [];
    for (const s of this.sections) {
      for (let i = 0; i < s.words.length; i += TOC_PAGE_SIZE) {
        const part = s.words.slice(i, i + TOC_PAGE_SIZE);
        const label = s.title
          ? (s.words.length > TOC_PAGE_SIZE ? `${s.title}（${i + 1}-${i + part.length}）` : s.title)
          : `${i + 1}-${i + part.length}`;
        pages.push({ label, words: part });
      }
    }
    this.page = Math.min(this.page, pages.length - 1);
    // 頂部：詞條總數＋章節下拉
    const bar = c.createDiv({ cls: 'li-toc-bar' });
    bar.createSpan({ cls: 'li-toc-count', text: `${this.flat.length} 詞條 · ${pages.length} 頁` });
    if (pages.length > 1) {
      const sel = bar.createEl('select', { cls: 'li-input li-toc-page-sel' });
      pages.forEach((pg, i) => sel.createEl('option', { value: String(i), text: pg.label }));
      sel.value = String(this.page);
      sel.addEventListener('change', () => { this.page = parseInt(sel.value, 10) || 0; this.render(); });
    }
    // 詞條網格（可滾動）
    const grid = c.createDiv({ cls: 'li-toc-grid' });
    for (const w of pages[this.page]?.words || []) {
      const b = grid.createEl('button', { cls: 'li-toc-word', text: w });
      b.addEventListener('click', () => { this.close(); this.onLookup(w); });
    }
    if (pages.length > 1) {
      const nav = c.createDiv({ cls: 'li-toc-nav' });
      const prev = nav.createEl('button', { cls: 'li-mini-btn', text: '←' });
      prev.disabled = this.page === 0;
      prev.addEventListener('click', () => { if (this.page > 0) { this.page -= 1; this.render(); } });
      nav.createSpan({ cls: 'li-toc-pageinfo', text: `${this.page + 1} / ${pages.length}` });
      const next = nav.createEl('button', { cls: 'li-mini-btn', text: '→' });
      next.disabled = this.page >= pages.length - 1;
      next.addEventListener('click', () => { if (this.page < pages.length - 1) { this.page += 1; this.render(); } });
    }
  }
}

/** 目錄頁入口：doLookup 偵測目錄特徵後開彈窗（取代整頁渲染）。 */
function openTocModal(app: App, word: string, hits: Array<LookupHit & { dictId: string }>, onLookup: (w: string) => void): void {
  const modal = new TocModal(app, hits, onLookup, word);
  modal.open();
}
