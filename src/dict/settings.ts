// SPDX-License-Identifier: AGPL-3.0-or-later
/* lilium 辭典 — settings tab */

import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import { DictFeature } from './plugin';

/**
 * 辭典設置渲染主體——主設置頁「辭典」分區與（相容保留的）
 * LiDictSettingTab 共用同一份。`rerender` 由呼叫端提供（重繪整個分區）。
 * 注意：不含 h2 標題與「回主設定」交叉導航——後者屬獨立頁籤專屬。
 */
export function renderDictSections(
  containerEl: HTMLElement,
  dict: DictFeature,
  rerender: () => void,
): void {
  const reorder = (id: string, delta: number): void => {
    // 上移/下移失效修復——改調 plugin.reorderDictionary（交換 override.order
    // 並持久化；舊實作只改 legacy service.order，而排序以 override.order 為準 → 從不生效）。
    void dict.reorderDictionary(id, delta).then(() => rerender());
  };

  /* 恢復「辭典檔案夾」設定（曾整塊移除——當時掃描改全庫）。
     語義：填入資料夾（逗號分隔、遞歸）＝僅掃描這些資料夾；留空＝掃描整個倉庫。
     其下緊鄰「立即掃描」按鈕，掃描範圍即上方設定。 */

  new Setting(containerEl)
    .setName(dict.T('dict.set.folders'))
    .setDesc(dict.T('dict.set.foldersDesc'))
    .addText((text) =>
      text
        .setPlaceholder('Dictionaries')
        .setValue((dict.settings.folders || []).join(', '))
        .onChange(async (v) => {
          dict.settings.folders = v.split(',').map((s) => s.trim()).filter(Boolean);
          await dict.saveSettings();
        }),
    );


  new Setting(containerEl)
    .setName(dict.T('dict.set.scan'))
    .setDesc(dict.T('dict.set.scanDesc'))
    .addButton((btn) =>
      btn.setClass('mod-cta').setButtonText(dict.T('dict.set.scanBtn')).onClick(async () => {
        await dict.rescanAndLoadGuarded(true);
        rerender();
      }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.scanCache'))
    .setDesc(dict.T('dict.set.scanCacheDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.scanCache).onChange(async (v) => {
        dict.settings.scanCache = v;
        if (!v) void dict.clearScanCache();
        await dict.saveSettings();
      }),
    );
  // 冷啟動開關——詞典掃描是啟動期最重的工作
  new Setting(containerEl)
    .setName(dict.T('dict.set.autoScan'))
    .setDesc(dict.T('dict.set.autoScanDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.autoScanOnStartup).onChange(async (v) => {
        dict.settings.autoScanOnStartup = v;
        // r59 ②：關閉啟動掃描時置位中止旗標——進行中的掃描迴圈下一輪退出。
        if (!v) (dict as unknown as { scanAbort: boolean }).scanAbort = true;
        await dict.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.deferScan'))
    .setDesc(dict.T('dict.set.deferScanDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.deferStartupScan).onChange(async (v) => {
        dict.settings.deferStartupScan = v;
        await dict.saveSettings();
      }),
    );
  // 模塊③：TEI Lex-0 開關 UI 已撤下——能力保留，
  // teiLexEnabled 默認 true（plugin.ts DEFAULTS）；舊 data.json 顯式 false 值仍被尊重
  // （向後相容：不自動覆寫用戶既有設置）。

  new Setting(containerEl)
    .setName(dict.T('dict.set.extractMdd'))
    .setDesc(dict.T('dict.set.extractMddDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.extractMddAssets).onChange(async (v) => {
        dict.settings.extractMddAssets = v;
        await dict.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.mddBudget'))
    .setDesc(dict.T('dict.set.mddBudgetDesc'))
    .addText((text) =>
      text
        .setPlaceholder('800')
        .setValue(String(dict.settings.mddAssetBudgetMb))
        .onChange(async (v) => {
          const n = parseInt(v, 10);
          // 上限 800MB（資源上限鐵律 MDD 800MB）
          if (!Number.isNaN(n) && n > 0) {
            dict.settings.mddAssetBudgetMb = Math.min(n, 800);
            await dict.saveSettings();
          }
        }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.fullTextLimit'))
    .setDesc(dict.T('dict.set.fullTextLimitDesc'))
    .addText((text) =>
      text
        .setPlaceholder('60')
        .setValue(String(dict.settings.fullTextLimit))
        .onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n) && n > 0) {
            dict.settings.fullTextLimit = n;
            await dict.saveSettings();
          }
        }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.inlineSuggest'))
    .setDesc(dict.T('dict.set.inlineSuggestDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.inlineSuggest).onChange(async (v) => {
        dict.settings.inlineSuggest = v;
        await dict.saveSettings();
      }),
    );

  // 行內建議觸發詞（寫死 → settings 注入）。
  new Setting(containerEl)
    .setName(dict.T('dict.set.inlineTrigger'))
    .setDesc(dict.T('dict.set.inlineTriggerDesc'))
    .addText((tx) =>
      tx.setValue(dict.settings.inlineSuggestTrigger ?? 'lilium ').onChange(async (v) => {
        const val = v.endsWith(' ') ? v : v + ' ';
        if (val.trim()) {
          dict.settings.inlineSuggestTrigger = val;
          await dict.saveSettings();
          dict.inlineSuggest?.setTriggerPhrase(val);
        }
      }),
    );

  /* 取消「外部來源鏈接」選項（使用者要求）。
     後端欄位 showExternalLinks 保留（相容舊設定，行為維持），UI 不再提供開關。 */

  new Setting(containerEl)
    .setName(dict.T('dict.set.lemmaFallback'))
    .setDesc(dict.T('dict.set.lemmaFallbackDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.lemmaFallback).onChange(async (v) => {
        dict.settings.lemmaFallback = v;
        dict.service.lemmaFallback = v;
        await dict.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.zhConvert'))
    .setDesc(dict.T('dict.set.zhConvertDesc'))
    .addDropdown((d) =>
      d
        .addOption('none', dict.T('dict.set.zhConvert.none'))
        .addOption('t2s', dict.T('dict.set.zhConvert.t2s'))
        .addOption('s2t', dict.T('dict.set.zhConvert.s2t'))
        .setValue(dict.settings.zhConvert)
        .onChange(async (v) => {
          dict.settings.zhConvert = v as 'none' | 't2s' | 's2t';
          await dict.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.fixZhWrap'))
    .setDesc(dict.T('dict.set.fixZhWrapDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.fixZhLineWrap).onChange(async (v) => {
        dict.settings.fixZhLineWrap = v;
        await dict.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.annotateVariants'))
    .setDesc(dict.T('dict.set.annotateVariantsDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.annotateVariants).onChange(async (v) => {
        dict.settings.annotateVariants = v;
        await dict.saveSettings();
      }),
    );

  // 「辭典塊可折疊」預設開且設定頁撤除開關——
  // collapsibleBlocks 欄位保留（向後相容舊 data.json 與運行期邏輯；功能保留），
  // UI 不再展示（與 buddhistMode 同式）。

  // 佛學模式開關已從設定頁撤除——模式默認常開（plugin.ts DEFAULT_SETTINGS
  // buddhistMode=true＋loadSettings 遷移）。buddhistMode 設定欄位保留（向後相容舊
  // data.json 與運行期邏輯），此處不再展示開關。

  // 「提示橫幅」設定項已移除——橫幅本身不再渲染（view.ts renderShell），
  // showBuddhistBanner 設定欄位保留（向後相容舊 data.json），此處不再展示開關。

  // 設定欄位保留（向後相容舊 data.json 顯式值，默認 false），能力（面板詞源按鈕）不動。
  new Setting(containerEl)
    .setName(dict.T('dict.set.hover'))
    .setDesc(dict.T('dict.set.hoverDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.hoverLookup).onChange(async (v) => {
        dict.settings.hoverLookup = v;
        dict.applyHoverSettings();
        await dict.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.hoverTrigger'))
    .setDesc(dict.T('dict.set.hoverTriggerDesc'))
    .addDropdown((d) =>
      d
        .addOption('ctrl', dict.T('dict.set.hoverTrigger.ctrl'))
        .addOption('alt', dict.T('dict.set.hoverTrigger.alt'))
        .addOption('shift', dict.T('dict.set.hoverTrigger.shift'))
        .addOption('meta', dict.T('dict.set.hoverTrigger.meta'))
        .setValue(dict.settings.hoverTrigger)
        .onChange(async (v) => {
          dict.settings.hoverTrigger = v as 'ctrl' | 'alt' | 'shift' | 'meta';
          dict.applyHoverSettings();
          await dict.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.selectionClean'))
    .setDesc(dict.T('dict.set.selectionCleanDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.selectionCleaning).onChange(async (v) => {
        dict.settings.selectionCleaning = v;
        await dict.saveSettings();
      }),
    );

  // 「記錄查詢歷史」預設開且設定頁撤除開關——
  // rememberRecent 欄位保留（向後相容舊 data.json 與運行期邏輯；功能保留），
  // loadSettings 遷移舊 false→true 防死角（與 buddhistMode/collapsibleBlocks 同式）。

  new Setting(containerEl)
    .setName(dict.T('dict.set.fuzzy'))
    .setDesc(dict.T('dict.set.fuzzyDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.fuzzyFallback).onChange(async (v) => {
        dict.settings.fuzzyFallback = v;
        dict.service.fuzzyFallback = v; // 開關真正接到查詢路徑
        await dict.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName(dict.T('dict.set.variantFallback'))
    .setDesc(dict.T('dict.set.variantFallbackDesc'))
    .addToggle((t) =>
      t.setValue(dict.settings.variantFallback).onChange(async (v) => {
        dict.settings.variantFallback = v;
        dict.service.variantFallback = v;
        await dict.saveSettings();
      }),
    );


  // groups management
  containerEl.createEl('h3', { text: dict.T('dict.set.groups') });
  const groupRow = containerEl.createDiv({ cls: 'li-setting-group-row' });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
  const groupInput = groupRow.createEl('input', {
    cls: 'li-input li-group-new-input',
    attr: { type: 'text', placeholder: dict.T('dict.set.newGroupPlaceholder') },
  }) as HTMLInputElement;
  const addBtn = groupRow.createEl('button', { cls: 'mod-cta', text: dict.T('dict.set.addGroup') });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
  addBtn.addEventListener('click', async () => {
    if (groupInput.value.trim()) {
      await dict.store.addGroup(groupInput.value.trim());
      groupInput.value = '';
      rerender();
    }
  });
  const groupsList = containerEl.createDiv({ cls: 'li-groups-list' });
  for (const g of dict.store.data.groups) {
    const row = groupsList.createDiv({ cls: 'li-loaded-row' });
    const n = Object.values(dict.store.data.dictOverrides).filter((o) => o.group === g).length;
    row.createSpan({ cls: 'li-loaded-name', text: `${g} (${n} ${dict.T('dict.unit.dicts')})` });
    const rm = row.createEl('button', { cls: 'li-mini-btn li-danger', text: dict.T('dict.set.delGroup') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    rm.addEventListener('click', async () => {
      await dict.store.removeGroup(g);
      rerender();
    });
  }

  // loaded dictionaries
  containerEl.createEl('h3', { text: dict.T('dict.set.loaded') });
  const list = containerEl.createDiv({ cls: 'li-loaded-list' });
  const dicts = dict.service.all;
  if (!dicts.length) {
    list.createEl('p', {
      cls: 'li-none-hint',
      text: dict.T('dict.set.noDicts'),
    });
  }
  for (const d of dicts) {
    const row = list.createDiv({ cls: 'li-loaded-row' });
    const info = row.createDiv({ cls: 'li-loaded-info' });
    info.createDiv({ cls: 'li-loaded-name', text: dict.service.displayName(d) });
    const bits = [
      d.meta.format.toUpperCase(),
      `${d.meta.entryCount.toLocaleString()} ${dict.T('dict.unit.entries')}`,
      d.meta.mddEntryCount !== undefined ? `mdd ${d.meta.mddEntryCount.toLocaleString()}` : '',
      d.meta.assets?.length ? `${d.meta.assets.length} ${dict.T('dict.unit.assets')}` : '',
      dict.service.groupOf(d) || '',
    ].filter(Boolean);
    info.createDiv({ cls: 'li-loaded-meta', text: bits.join(' · ') });
    const up = row.createEl('button', { cls: 'li-mini-btn', text: dict.T('dict.set.moveUp') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    up.addEventListener('click', async () => reorder(d.meta.id, -1));
    const rm = row.createEl('button', { cls: 'li-mini-btn li-danger', text: dict.T('dict.set.remove') });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
    rm.addEventListener('click', async () => {
      await dict.deleteDictionary(d.meta.id);
      rerender();
    });
  }

  // format help
  // 原為 innerHTML 靜態模板（無任何用戶輸入，僅 i18n 文案＋靜態標記），
  // 改以 DOM API 構建以消除靜態 innerHTML 用法（bot 合規）；
  // 渲染結果與原模板逐節點等價（table.li-format-table > thead 3th + tbody 4td×3，
  // files 單元格內 <code> 與文本節點順序不變）。
  containerEl.createEl('h3', { text: dict.T('dict.set.formats') });
  const help = containerEl.createDiv({ cls: 'li-format-help' });
  const T = (k: string) => dict.T(k);
  type FmtPart = ['code', string] | ['text', string];
  const addFormatRow = (
    tr: HTMLElement,
    nameKey: string,
    fileParts: FmtPart[],
    noteKey: string,
  ): void => {
    tr.createEl('td', { text: T(nameKey) });
    const files = tr.createEl('td');
    for (const [kind, s] of fileParts) {
      if (kind === 'code') files.createEl('code', { text: s });
      else files.appendChild(document.createTextNode(s));
    }
    tr.createEl('td', { text: T(noteKey) });
  };
  const table = help.createEl('table', { cls: 'li-format-table' });
  const headRow = table.createEl('thead').createEl('tr');
  for (const label of [T('dict.set.fmt.colFormat'), T('dict.set.fmt.colFiles'), T('dict.set.fmt.colNote')]) {
    headRow.createEl('th', { text: label });
  }
  const tbody = table.createEl('tbody');
  const row1 = tbody.createEl('tr');
  addFormatRow(row1, 'dict.set.fmt.mdict', [
    ['code', '.mdx'], ['text', ' + '], ['code', '.mdd'], ['text', T('dict.set.fmt.optMdd') + ' + ' + T('dict.set.fmt.sameName')], ['code', '.css/.js/'], ['text', T('dict.set.fmt.assets')], ['text', T('dict.set.fmt.optMdd')],
  ], 'dict.set.fmt.mdictNote');
  const row3 = tbody.createEl('tr');
  addFormatRow(row3, 'dict.set.fmt.teiLex0', [
    ['code', '.lex0.xml'],
  ], 'dict.set.fmt.teiLex0Note');
}

export class LiDictSettingTab extends PluginSettingTab {
  private plugin: DictFeature;

  /**
   * 1.13.0+ 聲明式設定 API：刻意返回空陣列（與 LiSettingsTabMain 同式）——
   * 頁面 UI 含辭典表格/群組管理等非 Setting 結構，聲明式無法等價表達；
   * 空陣列 → 宿主 fallback display()，渲染路徑與 1.12 前完全一致。
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [];
  }

  constructor(app: App, dict: DictFeature) {
    super(app, dict.plugin);
    // 穩定 id：COMPAT——S3 後此頁籤不再註冊（registerSettingTab 為 no-op），
    // 但類保留：外部若實例化仍可用；id 供舊引用解析不炸。
    (this as unknown as { id: string }).id = 'li-dictionary';
    this.plugin = dict;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    ;

    // 模組交叉導航：辭典 ⇄ 直排寫作系統（一鍵回主設定）——獨立頁籤專屬入口
    new Setting(containerEl)
      .setName(this.plugin.T('dict.set.crossNavMain'))
      .setDesc(this.plugin.T('dict.set.crossNavMainDesc'))
      .addButton((btn) =>
        btn
          .setButtonText(this.plugin.T('dict.set.crossNavMainBtn'))
          .setCta()
          .onClick(() => {
            const setting = (this.app as unknown as {
              setting: { open(): void; openTabById(id: string): void };
            }).setting;
            setting.open();
            setting.openTabById(this.plugin.plugin.manifest.id);
          }),
      );

    // S3：其餘渲染收斂到 renderDictSections（主設置頁「辭典」分區共用同一份）
    renderDictSections(containerEl, this.plugin, () => (this as unknown as { display(): void }).display());
  }

  private async reorder(id: string, delta: number): Promise<void> {
    // 與 renderDictSections.reorder 同式——走 reorderDictionary 持久化。
    await this.plugin.reorderDictionary(id, delta);
    (this as unknown as { display(): void }).display();
  }
}
