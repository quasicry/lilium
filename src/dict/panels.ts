// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 樣板：辭典面板模組化。
 *
 * lookup 與 manage 兩個面板的渲染代碼自 view.ts 原樣抽取至此，作為
 * 「面板 = class + build(host, ctx)」的模組化樣板。樣板：其餘面板
 * （bookmarks / history / corpus / collation）仍留在 view.ts，
 * 照 LookupPanel 模式漸進抽取。
 *
 * 純結構重構：DOM 結構／CSS class／元素順序／事件接線／文案鍵 100% 不變。
 * 原 `this.` 依賴改走 DictPanelCtx（由 LiDictView.panelCtx() 每次渲染時組裝快照）。
 */

import { Menu } from 'obsidian';
import { liNotice } from '../ui-hig';
import type { DictFeature } from './plugin';
import type { LiDict, LookupHit } from './service';
import type { Panel } from './view';
import { buildDictImportZone, supplementDirOf } from './import-ui';

/**
 * 目前展開「資料管理／補錄」的辭典 id。
 * ManagePanel 每次 renderShell 都重建 DOM，狀態得放在模組層才不會一點開就被沖掉。
 */
let openSupplementId: string | null = null;
/** 目前展開「重命名分組」的分組名（管理面板分組操作路徑）。 */
let openRenameGroup: string | null = null;

/** 面板渲染上下文：照實依賴，不預留。 */
export interface DictPanelCtx {
  plugin: DictFeature;
  T: DictFeature['T'];
  /** view 上的查詢狀態（面板唯讀；每次渲染時的快照） */
  readonly lastResults: Array<LookupHit & { dictId: string }>;
  readonly lastWord: string;
  /** view 提供的跨面板動作 */
  doLookup(word: string): void;
  switchPanel(panel: Panel): void;
  showPanel(panel: Panel): void;
  renderShell(): void;
  showDictInfo(d: LiDict): void;
  reorderDict(id: string, delta: number): void;
  /** lookup 結果渲染（仍留 view.ts：doLookup 與其他面板亦使用） */
  renderResults(articles: HTMLElement, word: string, hits: Array<LookupHit & { dictId: string }>): void;
  /** 詞條 iframe 填充（仍留 view.ts：renderResults 專用但與 doLookup 同鏈） */
    fillFrame(frame: HTMLIFrameElement, html: string, keyText: string, dictId?: string): void;
  /** 書籤匯出 MD（lilium/Shares/，保留書籤詞條 styled 內容） */
  exportBookmarks(): Promise<void>;
}

/** lookup 面板（原 view.ts renderLookupPanel + renderWelcome，原樣搬移） */
export class LookupPanel {
  build(host: HTMLElement, ctx: DictPanelCtx): void {
    const articles = host.createDiv({ cls: 'li-articles' });
    if (ctx.lastResults.length) {
      ctx.renderResults(articles, ctx.lastWord, ctx.lastResults);
    } else {
      this.renderWelcome(articles, ctx);
    }
  }

  private renderWelcome(container: HTMLElement, ctx: DictPanelCtx): void {
    container.empty();
    const dictCount = ctx.plugin.service.all.length;
    if (dictCount === 0) {
      const empty = container.createDiv({ cls: 'li-welcome' });
      empty.createDiv({ cls: 'li-welcome-icon', text: '📚' });
      empty.createEl('h3', { text: ctx.T('dict.empty.title') });
      empty.createEl('p', {
        text: ctx.T('dict.empty.desc'),
      });
      empty.createEl('p', { text: ctx.T('dict.empty.hint') });
      const btn = empty.createEl('button', { cls: 'mod-cta', text: ctx.T('dict.empty.btn') });
      btn.addEventListener('click', () => ctx.switchPanel('manage'));
      return;
    }
    const w = container.createDiv({ cls: 'li-welcome' });
    w.createDiv({ cls: 'li-welcome-icon', text: '📖' });
    w.createEl('h3', { text: ctx.T('dict.ready') });
    w.createEl('p', {
      text: ctx.T('dict.ready.desc', { n: dictCount }),
    });
    const recents = ctx.plugin.store.data.history;
    if (recents.length) {
      const rec = w.createDiv({ cls: 'li-recent' });
      rec.createDiv({ cls: 'li-recent-title', text: ctx.T('dict.recent') });
      const list = rec.createDiv({ cls: 'li-recent-list' });
      for (const item of recents.slice(0, 12)) {
        const b = list.createEl('button', { cls: 'li-recent-item', text: item.word });
        b.addEventListener('click', () => ctx.doLookup(item.word));
      }
    }
  }
}

/** bookmarks 面板（原 view.ts renderBookmarks；依賴：store/doLookup/renderShell） */
export class BookmarksPanel {
  build(host: HTMLElement, ctx: DictPanelCtx): void {
    const el = host.createDiv({ cls: 'li-articles' });
    const items = ctx.plugin.store.data.bookmarks;
    el.createEl('h3', { cls: 'li-panel-title', text: `${ctx.plugin.T('dict.bookmarks.title')} (${items.length})` });
    if (!items.length) {
      el.createEl('p', { cls: 'li-none-hint', text: ctx.plugin.T('dict.bookmarks.hint') });
      return;
    }
    const list = el.createDiv({ cls: 'li-bm-list' });
    for (const b of items) {
      const row = list.createDiv({ cls: 'li-bm-row' });
      const open = row.createEl('button', { cls: 'li-bm-word', text: b.word });
      open.addEventListener('click', () => ctx.doLookup(b.word));
      row.createSpan({
        cls: 'li-bm-date',
        text: new Date(b.createdAt).toLocaleDateString(),
      });
      const rm = row.createEl('button', { cls: 'li-mini-btn li-danger', text: '✕' });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持。
      rm.addEventListener('click', async () => {
        await ctx.plugin.store.removeBookmark(b.word);
        ctx.renderShell();
      });
    }
    const actionsRow = el.createDiv({ cls: 'li-bm-actions' });
    const exportBtn = actionsRow.createEl('button', { cls: 'li-mini-btn', text: ctx.plugin.T('dict.bookmarks.export') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持。
    exportBtn.addEventListener('click', async () => {
      await ctx.exportBookmarks();
    });
    const clear = actionsRow.createEl('button', { cls: 'li-mini-btn', text: ctx.plugin.T('dict.bookmarks.clear') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持。
    clear.addEventListener('click', async () => {
      ctx.plugin.store.data.bookmarks = [];
      await ctx.plugin.store['persist']?.call(ctx.plugin.store);
      ctx.renderShell();
    });
  }
}

/** history 面板（原 view.ts renderHistory；依賴：store/doLookup/renderShell） */
export class HistoryPanel {
  build(host: HTMLElement, ctx: DictPanelCtx): void {
    const el = host.createDiv({ cls: 'li-articles' });
    const items = ctx.plugin.store.data.history;
    el.createEl('h3', { cls: 'li-panel-title', text: `${ctx.plugin.T('dict.history.title')} (${items.length})` });
    const searchRow = el.createDiv({ cls: 'li-hist-search' });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留。
    const filter = searchRow.createEl('input', {
      cls: 'li-search',
      attr: { type: 'text', placeholder: ctx.plugin.T('dict.history.filterPlaceholder'), spellcheck: 'false' },
    }) as HTMLInputElement;
    const listWrap = el.createDiv();

    const renderList = (q: string) => {
      listWrap.empty();
      const filtered = q ? ctx.plugin.store.searchHistory(q) : items;
      if (!filtered.length) {
        listWrap.createEl('p', { cls: 'li-none-hint', text: ctx.plugin.T('dict.history.empty') });
        return;
      }
      const list = listWrap.createDiv({ cls: 'li-bm-list' });
      for (const h of filtered) {
        const row = list.createDiv({ cls: 'li-bm-row' });
        const open = row.createEl('button', { cls: 'li-bm-word', text: h.word });
        open.addEventListener('click', () => ctx.doLookup(h.word));
        row.createSpan({
          cls: 'li-bm-date',
          text: new Date(h.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        });
      }
    };
    filter.addEventListener('input', () => renderList(filter.value));
    renderList('');

    const clear = el.createEl('button', { cls: 'li-mini-btn', text: ctx.plugin.T('dict.history.clear') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    clear.addEventListener('click', async () => {
      await ctx.plugin.store.clearHistory();
      ctx.renderShell();
    });
  }
}

/** manage 面板（原 view.ts renderManager，原樣搬移） */
export class ManagePanel {
  build(host: HTMLElement, ctx: DictPanelCtx): void {
    const el = host.createDiv({ cls: 'li-articles' });
    el.createEl('h3', { cls: 'li-panel-title', text: ctx.T('dict.manage.title') });

    // scan row
    const scanRow = el.createDiv({ cls: 'li-scan-row' });
    const scanBtn = scanRow.createEl('button', { cls: 'mod-cta', text: ctx.T('dict.manage.rescan') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持。
    scanBtn.addEventListener('click', async () => {
      liNotice(ctx.T('dict.manage.scanning'));
      await ctx.plugin.rescanAndLoadGuarded(true);
      ctx.renderShell();
    });
    const setBtn = scanRow.createEl('button', { cls: 'li-mini-btn', text: ctx.T('dict.manage.setFolders') });
    setBtn.addEventListener('click', () => ctx.plugin.openSettings());

    // ── 導入辭典文件 ──────────────────────────────────────
    // 必須放在「尚未載入辭典」的 early return **之前**：一部辭典都沒有時，
    // 使用者最需要的就是這個入口（舊版此時只能看到一行提示，無從下手）。
    buildDictImportZone(el, ctx.plugin, { onDone: () => ctx.renderShell() });

    const dicts = ctx.plugin.service.all;
    if (!dicts.length) {
      el.createEl('p', { cls: 'li-none-hint', text: ctx.T('dict.manage.empty') });
      return;
    }

    // groups overview
    const groups = new Map<string, LiDict[]>();
    for (const d of dicts) {
      const g = ctx.plugin.service.groupOf(d) || ctx.T('dict.manage.ungrouped');
      let arr = groups.get(g);
      if (!arr) groups.set(g, (arr = []));
      arr.push(d);
    }

    const listEl = el.createDiv({ cls: 'li-manage-list' });
    for (const [group, members] of groups) {
      const gHead = listEl.createDiv({ cls: 'li-group-head' });
      gHead.createSpan({ cls: 'li-group-name', text: group });
      gHead.createSpan({ cls: 'li-group-count', text: `${members.length}` });
      if (group !== ctx.T('dict.manage.ungrouped')) {
        const gMenu = gHead.createEl('button', { cls: 'li-mini-btn', text: '⋯' });
        gMenu.addEventListener('click', (e) => {
          const menu = new Menu();
          menu.addItem((mi) =>
            mi.setTitle(ctx.T('dict.manage.renameGroup')).onClick(() => {
              // 展開行內重命名輸入（真實操作路徑，取代只發提示的舊行為）
              openRenameGroup = openRenameGroup === group ? null : group;
              ctx.renderShell();
            }),
          );
          menu.addItem((mi) =>
            mi.setTitle(ctx.T('dict.manage.deleteGroup')).onClick(async () => {
              await ctx.plugin.store.removeGroup(group);
              ctx.renderShell();
            }),
          );
          menu.showAtMouseEvent(e);
        });
      }
      // 行內重命名輸入行（點「重命名分組」後展開；確認即 store 落盤）
      if (openRenameGroup === group) {
        const renRow = listEl.createDiv({ cls: 'li-group-rename' });
        const renInput = renRow.createEl('input', {
          cls: 'li-side-select',
          attr: { type: 'text', value: group, 'aria-label': ctx.T('dict.manage.renameGroupPrompt'), placeholder: ctx.T('dict.manage.renameGroupPrompt') },
        });
        const renOk = renRow.createEl('button', { cls: 'mod-cta', text: ctx.T('dict.manage.renameGroup') });
        const renCancel = renRow.createEl('button', { cls: 'li-mini-btn', text: ctx.T('dict.chip.close') });
        const done = () => {
          openRenameGroup = null;
          ctx.renderShell();
        };
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持。
        renOk.addEventListener('click', async () => {
          await ctx.plugin.store.renameGroup(group, renInput.value);
          done();
        });
        renInput.addEventListener('keydown', (ev) => {
          if ((ev).key === 'Enter') {
            void (async () => {
              await ctx.plugin.store.renameGroup(group, renInput.value);
              done();
            })();
          } else if ((ev).key === 'Escape') {
            done();
          }
        });
        renCancel.addEventListener('click', done);
        window.setTimeout(() => renInput.focus(), 0);
      }
      for (const d of members) {
        // 選中的辭典整列高亮（左側強調帶）。
        const row = listEl.createDiv({
          cls: 'li-manage-row' + (ctx.plugin.service.activeDictIds.has(d.meta.id) ? ' is-selected' : ''),
        });
        const info = row.createDiv({ cls: 'li-loaded-info' });
        const nameLine = info.createDiv({ cls: 'li-loaded-nameline' });
        const nameBtn = nameLine.createEl('button', {
          cls: 'li-loaded-name',
          text: ctx.plugin.service.displayName(d),
          attr: { title: '点击查看/编辑词典信息' },
        });
        nameBtn.addEventListener('click', () => ctx.showDictInfo(d));
        // 格式從 meta 字串升格為膠囊標籤（掃一眼即知 MDX / TEI Lex-0…）
        nameLine.createSpan({ cls: 'li-loaded-fmt', text: d.meta.format.toUpperCase() });
        const metaBits = [
          `${d.meta.entryCount.toLocaleString()} ${ctx.T('dict.unit.entries')}`,
          d.meta.mddEntryCount !== undefined ? `mdd ${d.meta.mddEntryCount.toLocaleString()}` : '',
          d.meta.assets?.length ? `${d.meta.assets.length} ${ctx.T('dict.unit.assets')}` : '',
        ].filter(Boolean);
        info.createDiv({ cls: 'li-loaded-meta', text: metaBits.join(' · ') });

        // select checkbox for search scope
        const sel = row.createEl('button', {
          cls: 'li-mini-btn' + (ctx.plugin.service.activeDictIds.has(d.meta.id) ? ' is-active' : ''),
          text: ctx.plugin.service.activeDictIds.has(d.meta.id) ? ctx.T('dict.manage.selected') : ctx.T('dict.manage.select'),
          attr: { title: '加入/移出搜索範圍' },
        });
        sel.addEventListener('click', () => {
          const ids = ctx.plugin.service.activeDictIds;
          if (ids.has(d.meta.id)) ids.delete(d.meta.id);
          else ids.add(d.meta.id);
          ctx.renderShell();
        });

        const more = row.createEl('button', { cls: 'li-mini-btn', text: '⋯' });
        more.addEventListener('click', (e) => {
          const menu = new Menu();
          menu.addItem((mi) =>
            mi.setTitle(ctx.T('dict.chip.moveUp')).onClick(async () => ctx.reorderDict(d.meta.id, -1)),
          );
          menu.addItem((mi) =>
            mi.setTitle(ctx.T('dict.manage.moveDown')).onClick(async () => ctx.reorderDict(d.meta.id, 1)),
          );
          menu.addItem((mi) =>
            mi.setTitle(ctx.plugin.service.isEnabled(d) ? ctx.T('dict.chip.disable') : ctx.T('dict.chip.enable')).onClick(
              async () => {
                const cur = ctx.plugin.service.isEnabled(d);
                await ctx.plugin.store.setOverride(d.meta.id, { enabled: !cur });
                ctx.renderShell();
              },
            ),
          );
          menu.addSeparator();
          // ── 移動到分組（列出現有分組＋未分組；排除當前組）──
          const currentGroup = ctx.plugin.service.groupOf(d) || '';
          for (const g of ctx.plugin.store.data.groups) {
            if (g === currentGroup) continue;
            menu.addItem((mi) =>
              mi.setTitle(`${ctx.T('dict.manage.moveToGroup')}：${g}`).onClick(async () => {
                await ctx.plugin.store.setDictGroup(d.meta.id, g);
                ctx.renderShell();
              }),
            );
          }
          if (currentGroup) {
            menu.addItem((mi) =>
              mi.setTitle(`${ctx.T('dict.manage.moveToGroup')}：${ctx.T('dict.manage.ungrouped')}`).onClick(async () => {
                await ctx.plugin.store.setDictGroup(d.meta.id, '');
                ctx.renderShell();
              }),
            );
          }
          menu.addSeparator();
          // ── 資料管理／補錄：為這部辭典追加它自己格式的資料檔
          menu.addItem((mi) =>
            mi.setTitle(ctx.T('dict.import.supplement')).onClick(async () => {
              openSupplementId = openSupplementId === d.meta.id ? null : d.meta.id;
              ctx.renderShell();
            }),
          );
          menu.addItem((mi) =>
            mi.setTitle(ctx.T('dict.manage.deleteDict')).onClick(async () => {
              await ctx.plugin.deleteDictionary(d.meta.id);
              ctx.renderShell();
            }),
          );
          menu.showAtMouseEvent(e);
        });

        // 展開補錄區：只有被點開的那部辭典會顯示
        if (openSupplementId === d.meta.id) {
          const box = listEl.createDiv({ cls: 'li-dict-supplement' });
          buildDictImportZone(box, ctx.plugin, {
            targetDir: supplementDirOf(ctx.plugin, d),
            fixedFormat: d.meta.format,
            dictName: ctx.plugin.service.displayName(d),
            onDone: () => {
              openSupplementId = null;
              ctx.renderShell();
            },
          });
        }
      }
    }
  }
}
