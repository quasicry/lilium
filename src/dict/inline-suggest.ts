// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — inline EditorSuggest (inspired by WordNet's `;;` trigger
 * with fixes: regex-escaped trigger, race-free lookup, works with our service).
 *
 * Type the trigger (default `lilium `) followed by a query to see dictionary
 * suggestions inline while writing.
 */

import { EditorSuggest, Editor, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext } from 'obsidian';
import type { DictFeature } from './plugin';

export class InlineDictSuggest extends EditorSuggest<{ word: string; count: number }> {
  private plugin: DictFeature;
  private triggerPhrase: string;

  constructor(plugin: DictFeature) {
    super(plugin.app);
    this.plugin = plugin;
    // 欄位改名 trigger→triggerPhrase——原欄位名遮蔽基類方法
    // EditorSuggest.prototype.trigger，Obsidian 鍵入時調 o.trigger(...) 撞字串 →
    // TypeError「o.trigger is not a function」→ 保存失敗（EPERM 彈窗實為保存管線
    // 被中斷的表象）＋無法切閱讀模式。
    // r59 ⑥：預設值改由 plugin.ts DEFAULT_SETTINGS 注入（this.triggerPhrase 留空，
    // init 呼叫 setTriggerPhrase(this.settings.inlineSuggestTrigger)），不再寫死。
    this.triggerPhrase = plugin.settings.inlineSuggestTrigger || 'lilium ';
  }

  setTriggerPhrase(t: string): void {
    this.triggerPhrase = t;
  }

  /** regex-escaped trigger (fixes WordNet's unescaped-trigger bug) */
  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile): EditorSuggestTriggerInfo | null {
    if (!this.plugin.settings.inlineSuggest) return null;
    const line = editor.getRange({ line: cursor.line, ch: 0 }, cursor);
    // query 1 字符即可（原 {2,}）：中文查詢常單字（移動端實測回報「行內建議失敗」主因之一），
    // 上限 8 候選已封頂，1 字符不會泛濫。
    const re = new RegExp(`${this.escapeRegExp(this.triggerPhrase)}([^\\s]{1,})$`, 'i');
    const m = re.exec(line);
    if (!m) return null;
    const query = m[1];
    const startCh = cursor.ch - query.length;
    // 辭典空（重啟後 dicts=0 是現行設計，autoScanOnStartup=false）：行內建議因此永不觸發
    // ＝移動端「失敗」的另一主因。這裡做後台自愈：發現空表即觸發一次掃描（冪等，
    // rescanAndLoadGuarded 防重入），本次返回 null——掃完後下一擊鍵建議即恢復，不打斷輸入。
    const words = this.plugin.service.prefixAll(query, 8);
    if (!words.length) {
      void this.plugin.rescanAndLoadGuarded();
      return null;
    }
    return {
      start: { line: cursor.line, ch: startCh },
      end: cursor,
      query,
    };
  }

  getSuggestions(context: EditorSuggestContext): Array<{ word: string; count: number }> {
    const { query } = context;
    const words = this.plugin.service.prefixAll(query, 8);
    // r54 排查修復：擊鍵路徑改輕量 lookupCount（單層精確）——原逐詞 lookupAll
    // （含模糊/變體/lemma 三層回退）在 8 個候選詞 × 大辭典下每擊鍵可感延遲。
    return words.map((w) => ({ word: w, count: this.plugin.service.lookupCount(w) }));
  }

  renderSuggestion(sugg: { word: string; count: number }, el: HTMLElement): void {
    el.createDiv({ cls: 'li-inline-word', text: sugg.word });
    el.createDiv({ cls: 'li-inline-meta', text: this.plugin.T('dict.inline.count', { n: sugg.count }) });
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持。
  async selectSuggestion(
    sugg: { word: string; count: number },
    _evt: MouseEvent | KeyboardEvent,
  ): Promise<void> {
    const editor = this.context?.editor;
    if (!editor) return;
    // replace trigger+query with the chosen word, then open the panel
    const { start, end } = this.context!;
    editor.replaceRange(sugg.word, start, end);
    await this.plugin.activateView();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持。
    window.setTimeout(() => this.plugin.lookupInView(sugg.word), 60);
  }
}
