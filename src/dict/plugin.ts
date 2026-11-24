// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
import { gzipSync } from 'fflate';
import { resolveFontName } from '../font-name';
import type VerticalWriterPlugin from "../main";
import { t } from "../i18n";
/**
 * lilium 辭典 — plugin main class, settings & commands.
 * DataStore, mdd asset extraction, companion css/js/font import,
 *       dict info editing, group management, PNG share.
 */

import {
  Workspace,
  WorkspaceLeaf,
  Modal,
  App,
  TFolder,
  TFile,
  normalizePath,
  Editor,
  MarkdownView,
  debounce,
  Notice,
} from 'obsidian';
import { liNotice } from "../ui-hig";
import { Platform } from "obsidian";
// 辭典配套 CSS 導入時作用域化（見 css-isolate.ts 頭註）。
import { dictScopeId, isolateCSS } from "./css-isolate";
import {
  LiDictView,
  VIEW_TYPE_UNIVERSAL_DICT,
} from './view';
import { openLiSettings } from '../settings';
import { DictService, LiDict } from './service';
import { DataStore, StoreAdapter, DEFAULT_STORE, type StoreShape } from './store';
/** dictStore 鏡像備份路徑（vault 內、插件目錄之外——更新插件時不被刪）。C3：configDir 動態取（不寫死 .obsidian）。 */
const backupPath = (plugin: { app: { vault: { configDir: string } } }): string => `${plugin.app.vault.configDir}/lilium-store.backup.json`;
import {
  loadMdict,
  loadMdictFromCache,
  loadLex0FromCache,
  loadLex0,
  extractTeiTarAssetMembers,
  extractTeiZipAssetMembers,
  isDictDisposed,
  AssetWriter,
  ASSET_FOLDER,
  LEGACY_ASSET_FOLDER,
} from './loader';
import { ExtractedAsset } from './mdd-assets';
import { InlineDictSuggest } from './inline-suggest';
import { LookupCache } from './cache';
import { getWordAtOffset } from './word-detection';
import { cleanSelection } from './selection-clean';
import { LookupSequence } from './lookup-sequence';
import { HoverLookupController, TriggerKey } from './hover-lookup';
import { FeatureLinkage } from './linkage';
import { DataMutex, RawData } from '../shared/data-mutex';
import { detectScript, resolveScriptAlias, ScriptId, segmenterLocaleFor, scriptLangCode } from '../languages';
import {
  DictFormat,
  DICT_IMPORT_ROOT,
  SNIFF_BYTES,
  ImportIssue,
  normalizeExt,
  dictBaseName,
  extToFormat,
  specAcceptsExt,
  sanitizeDictFolderName,
  safeFileName,
  planImport,
} from './import-spec';
import {
  assignStableIds,
  dictBaseKey,
  legacyIdCandidates,
  migrateOverrides,
  stableDictId,
} from './stable-id';

/** 辭典檔案導入結果。UI 依此決定要提示什麼。 */
export interface DictImportReport {
  ok: boolean;
  /** 成功寫入的 vault 相對路徑 */
  imported: string[];
  /** 因「不覆蓋」而跳過的檔名 */
  skipped: string[];
  failed: Array<{ name: string; error: string }>;
  /** 被拒絕的原因（錯配格式 / 超限 / 缺必需檔…），ok=false 時必讀 */
  issues: ImportIssue[];
  /** 實際寫入的目標資料夾 */
  targetDir: string;
  format: DictFormat | null;
  /** 被覆蓋的既有檔案數 */
  overwritten: number;
}

/**
 * 讀檔頭取樣供內容嗅探（最多 SNIFF_BYTES）。
 * 行動端／舊版 WebView 可能沒有 Blob.arrayBuffer，失敗一律回 null——
 * 嗅探只是第二道防線，副檔名校驗仍會把關，不影響可用性（鐵律：導入不能因此失敗）。
 */
async function readFileHead(file: File): Promise<Uint8Array | null> {
  try {
    const blob = typeof file.slice === 'function' ? file.slice(0, SNIFF_BYTES) : file;
    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export interface LiDictSettings {
  /**
   * 舊版「辭典檔案夾」欄位：掃描已改為整個 vault，此欄位不再被讀取。
   * 保留宣告只為相容舊 data.json（既有使用者設定仍能載入，不會因缺欄位而重置）。
   * （刻意不用 deprecated 標記——官方 no-deprecated 規則會誤報且禁用指令不被審核允許。）
   */
  folders: string[];
  /** persist loaded dictionary ids between sessions? dictionaries reload on startup */
  rememberRecent: boolean;
  recentLookups: string[];
  /** maximum lookup history kept */
  historyLimit: number;
  /** try fuzzy (case/strip-insensitive) lookup when exact fails */
  fuzzyFallback: boolean;
  /** extract .mdd assets (images/audio/css/fonts) on import */
  extractMddAssets: boolean;
  /** max bytes of mdd assets to extract per dictionary */
  mddAssetBudgetMb: number;
  /** full-text per-dictionary result limit */
  fullTextLimit: number;
  /** inline `li ` editor suggest */
  inlineSuggest: boolean;
  /** r59 ⑥：行內建議觸發詞（須以空格結尾；init 從此注入 InlineDictSuggest） */
  inlineSuggestTrigger: string;
  /**
   * show external source links under results
   * 設定頁不再提供開關，但欄位保留以相容舊設定；
   * 唯一消費點是 view.ts 的結果區，行為維持現狀。
   */
  showExternalLinks: boolean;
  /** try morphological candidates when exact lookup fails (English) */
  lemmaFallback: boolean;
  /** clean PDF/highlight selections (soft hyphens, ligatures) */
  selectionCleaning: boolean;
  /**
   * TEI Lex-0 辭典掃載入（模塊③ 默認關——新功能默認不變既有行為）。
   * 開啟時 .lex0.xml / TEI XML 檔在掃描中按 Lex-0 reader 掛載；關閉時完全忽略 .xml。
   */
  teiLexEnabled: boolean;
  /** hover lookup popup (Ctrl/Alt/Shift + mouse) */
  hoverLookup: boolean;
  hoverTrigger: TriggerKey;
  hoverMaxWordLength: number;
  /** Chinese conversion for entry display (MDict "Chinese Conversion" menu) */
  zhConvert: 'none' | 't2s' | 's2t';
  /** repair hard-wrapped CJK text in entries (MDict "Fix Chinese Line Wrap") */
  fixZhLineWrap: boolean;
  /** dictionary blocks collapsible, only first expanded (MDict union-view style) */
  collapsibleBlocks: boolean;
  /** Buddhist canon mode: CBETA variant normalization + literary stopwords + term detection */
  buddhistMode: boolean;
  /**
   * 佛學模式提示橫幅（已撤除）。buddhistMode 開啟時，面板頂部顯示一條提示橫幅，
   * 說明「在哪用、效果何時出現」。橫幅右上角 ✕ 可關閉（點擊即把本欄設為 false 並持久化），
   * 關閉後可在設定頁重新打開。預設顯示。
   */
  showBuddhistBanner: boolean;
  /**
   * 詞源按鈕。面板「詞源」按鈕的顯示開關。
   */
  showEtymologyButton: boolean;
  /**
   * 詞條正文異體字標註。
   * 用校勘字表 VARIANT_COMMON 把詞條裡的異體字標出來，hover 顯示通行字。
   * 純 DOM 操作、讀而不改，關閉時零開銷。
   */
  annotateVariants: boolean;
  /**
   * 變體容錯查詢：精確未命中時，先用校勘字表把查詢詞
   * 正規化成可能的詞頭寫法（異體／繁簡）再查一次。
   */
  variantFallback: boolean;
  /**
   * 啟動時自動掃描詞典資料夾。
   * 關閉後辭典只在手動執行「重新掃描辭典文件夾」命令時載入——
   * 對辭典體量大（數百 MB 的 .mdx/.idx）的使用者，這是冷啟動最大的開銷來源。
   */
  /** 掃描緩存——檔案未變（mtime+size）時復用上次解析實例 */
  scanCache: boolean;
  autoScanOnStartup: boolean;
  /**
   * 啟動掃描延後到 layout 就緒之後。
   * 開啟時 Obsidian 先完成版面渲染，辭典在背景載入，不會卡住啟動畫面。
   */
  deferStartupScan: boolean;
}

export const DEFAULT_SETTINGS: LiDictSettings = {
  folders: ['dictionaries'],
  rememberRecent: true,
  recentLookups: [],
  historyLimit: 100,
  fuzzyFallback: true,
  inlineSuggest: true,
  inlineSuggestTrigger: 'lilium ',
  showExternalLinks: true,
  lemmaFallback: true,
  selectionCleaning: true,
  teiLexEnabled: true,
  hoverLookup: true,
  hoverTrigger: 'ctrl',
  hoverMaxWordLength: 40,
  extractMddAssets: true,
  mddAssetBudgetMb: 800,
  fullTextLimit: 60,
  zhConvert: 'none' as const,
  fixZhLineWrap: true,
  collapsibleBlocks: true,
  // 佛學模式改為默認開啟（原 false），且設定頁不再展示開關（橫幅先例：
  // 欄位保留向後相容舊 data.json，UI 撤除）。既有 data.json 缺鍵者在 loadSettings 首次遷移式補上預設；已存值一律尊重。
  buddhistMode: true,
  showBuddhistBanner: true,
  showEtymologyButton: false,
  annotateVariants: true,
  variantFallback: true,
  // 冷啟動：預設不自動掃描（autoScanOnStartup: false，行為不變——r59 修註釋矛盾）；
  // deferScanOnStartup 時掃描延後到 layout 就緒後執行
  autoScanOnStartup: false,
  deferStartupScan: true,
  // 掃描緩存——檔案未變時復用上次解析的辭典實例，免重複掃描
  scanCache: true,
};

export class DictFeature {
  /** dict id → source folder path (for loose-resource lookup) */
  dictFolders: Map<string, string> = new Map();
  /**
   * 掃描緩存——dict id → { 實例, 檔案簽名 }。
   * 首次掃描解析後駐留；再次掃描時檔案（mtime+size）未變即直接復用實例，
   * 免去重複 readBinary＋解析＋keyIndex 構建。刪除辭典時清對應條目。
   */
  /** r59 ②：掃描中止旗標——settings 關閉掃描/插件卸載時置位，掃描迴圈每輪檢查。
   *  無 UI 按鈕；僅由生命週期事件驅動，新掃描啟動時先重置。 */
  private scanAbort = false;
  // 卸載終態旗標：unload 後任何排程中的 idle/setTimeout 回調不得再啟動掃描
  // （scanAbort 會被 guarded 開頭清除作為「新掃描啟動」語義，不能兼作終態）。
  private disposed = false;
  private scanCacheMap: Map<string, { dict: LiDict; sig: string }> = new Map();
  /** dict id → 磁盤緩存檔路徑（刪除辭典時清理用） */
  private scanCacheFiles: Map<string, string> = new Map();
  settings: LiDictSettings = DEFAULT_SETTINGS;
  service: DictService = new DictService();
  /** 辭典⇄語料⇄校勘聯動中樞 */
  linkage: FeatureLinkage = new FeatureLinkage(this);
  store: DataStore;
  cache: LookupCache = new LookupCache(undefined, () => this.flushCacheDebounced());
  inlineSuggest: InlineDictSuggest | null = null;
  lookupSequence: LookupSequence = new LookupSequence();
  /** 查詢緩存變髒後延遲落盤，減少 plugin disable/reload 時的歷史丟失 */
  private flushCacheDebounced = debounce(() => void this.flushCache(), 1500, true);
  hoverController: HoverLookupController = new HoverLookupController({
    enabled: false,
    trigger: 'ctrl',
    maxWordLength: 40,
    // 寫作系統 ⇄ 辭典：懸停斷詞按當前筆記文種選 locale
    localeProvider: () => this.currentSegLocale,
    // r54 排查修復：固定提示走 i18n（原硬編碼簡中繞過七語言）
    pinHintProvider: () => this.T('dict.hover.pinHint'),
    onLookup: (word, popup) => {
      // 批次丁（UI 執行緒效能）：拆兩段——精確＋變體同步（快路徑，確定性映射成本低）；
      // miss 時模糊/lemma 全鏈（可能凍結數百 ms）移 idle/setTimeout 異步補充。
      // 異步補到後才更新內容的前提＝彈窗還在且仍指向同一詞（token 競態保護沿用）。
      popup.setLoading();
      window.setTimeout(() => {
        try {
          // 快路徑：只跑精確＋變體（deferFallback 跳過模糊/lemma）。
          const fast = this.service.lookupAll(word, { deferFallback: true });
          if (fast.length) {
            const ordered = this.reorderHitsByScript(fast, this.currentScriptId);
            popup.setBody(HoverLookupController.renderHits(ordered));
            return;
          }
          // 精確＋變體皆 miss：模糊/lemma 移出本幀，異步補充。
          const runFallback = () => {
            try {
              const hits = this.service.lookupAll(word);
              if (hits.length) {
                const ordered = this.reorderHitsByScript(hits, this.currentScriptId);
                popup.setBody(HoverLookupController.renderHits(ordered));
              } else {
                popup.setError(this.T('dict.hover.notFound', { word }));
              }
            } catch (e) {
              popup.setError(e instanceof Error ? e.message : String(e));
            }
          };
          const w = window as unknown as {
            requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
          };
          if (typeof w.requestIdleCallback === 'function') {
            w.requestIdleCallback(runFallback, { timeout: 400 });
          } else {
            window.setTimeout(runFallback, 40);
          }
        } catch (e) {
          popup.setError(e instanceof Error ? e.message : String(e));
        }
      }, 10);
    },
  });
  /**
   * 當前活動筆記的書寫系統（供懸停斷詞 locale 與辭典優先匹配）。
   * 由 active-leaf-change 惰性刷新，避免每次懸停都重讀整篇筆記。
   */
  private currentScriptId: ScriptId = 'han';
  private currentSegLocale: string | undefined = undefined;
  // 審核合規（no-view-references-in-plugin）：不在插件屬性持有 view 實例
  // （防內存洩漏——leaf 關閉後插件仍持引用）。改為動態 getter：每次從
  // workspace 取回當前活躍的 dict 視圖。語義等價：this.view 原本就是
  // 「當前活躍 dict 視圖」的快照。
  private get view(): LiDictView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_UNIVERSAL_DICT);
    const v = leaves.length ? leaves[0].view : null;
    return v instanceof LiDictView ? v : null;
  }

  constructor(public plugin: VerticalWriterPlugin) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 回調內 this 捕獲（歷史代碼），重構行為風險——審計批次三。
    const self = this;
    // 所有 data.json 讀寫經 lilium 核心的 DataMutex 串行化，
    // 避免與 vw 命名空間併發寫入時互相覆寫。
    const adapter: StoreAdapter = {
      async load() {
        const raw = await self.data.read();
        return Object.assign({}, DEFAULT_STORE, (raw.dictStore as object) || {});
      },
      async save(data) {
        await self.data.mutate((raw: RawData) => {
          raw.dictStore = data;
        });
      },
      // ── 鏡像備份：vault 內、插件目錄之外（.obsidian/lilium-store.backup.json）──
      // 更新插件＝刪插件資料夾重裝，data.json 陪葬；此檔不受影響。
      async backup(data) {
        const a = self.plugin.app.vault.adapter;
        await a.write(backupPath(self.plugin), JSON.stringify(data));
      },
      async readBackup() {
        const a = self.plugin.app.vault.adapter;
        try {
          // C3：舊版寫死 .obsidian/；若 configDir 非 .obsidian，優先讀新新路徑，退回舊路徑（既有用戶備份不丟）
          const newPath = backupPath(self.plugin);
          const legacyPath = `.obsidian/lilium-store.backup.json`;
          const p = (await a.exists(newPath)) || !(await a.exists(legacyPath)) ? newPath : legacyPath;
          if (!(await a.exists(p))) return null;
          const txt = await a.read(p);
          const parsed = JSON.parse(txt) as StoreShape;
          if (!parsed || typeof parsed !== 'object') return null;
          return Object.assign({}, DEFAULT_STORE, parsed);
        } catch { return null; }
      },
    };
    this.store = new DataStore(adapter);
    this.service.setStore(this.store);
    this.service.vault = this.plugin.app.vault;
  }

  /** 隔離環境（單測直接 new DictFeature）時的自備互斥器 */
  private fallbackMutex: DataMutex | null = null;

  /**
   * data.json 互斥器。優先共用 lilium 核心實例（確保 vw 與 dict* 命名空間串行化）；
   * 若核心尚未提供（例如單測隔離載入），退回自備實例，仍保證詞典內部不互相覆寫。
   */
  private get data(): DataMutex {
    if (this.plugin.dataMutex) return this.plugin.dataMutex;
    if (!this.fallbackMutex) this.fallbackMutex = new DataMutex(this.plugin);
    return this.fallbackMutex;
  }

  /** lilium Plugin 實例（由 main.ts 傳入；DictFeature 不繼承 Plugin） */
  get app(): App {
    return this.plugin.app;
  }

  /** 辭典模組文案接入 lilium 7 語 i18n：優先當前界面語言，回退 en → key */
  T(key: string, vars?: Record<string, string | number>): string {
    return t(this.plugin.uiLang(), key, vars);
  }

  async init(): Promise<void> {
    await this.loadSettings();
    await this.store.init();
    /* 更新插件數據保護：Obsidian 更新插件＝刪插件資料夾重裝（data.json 陪葬）。
       主 store 四區全空而鏡像備份存在 → 視為「更新洗白」，從備份恢復（保守：僅空檔）。 */
    try {
      const res = await this.store.tryRestoreFromBackup();
      if (res) liNotice(this.T('dict.store.restored', res), 8000);
    } catch (e) {
      console.error('[lilium] dictStore 備份恢復失敗（不阻塞載入）:', e);
    }

    /* 安裝時預建 lilium 資料夾樹——
       lilium/（默認筆記與分享圖根）、lilium/筆記、lilium/圖片；
       dictionaries/（默認辭典檔案夾，掃描範圍可見）。
       失敗靜默（資料夾已存在或權限受限皆不阻斷啟動）。 */
    try {
      // ensureFolder 語義為「檔案路徑→建其父目錄鏈」（parts.pop() 去檔名），
      // 故傳含佔位檔名的路徑以確保子資料夾本體被建立。
      await this.ensureFolder('lilium/筆記/.placeholder');
      await this.ensureFolder('lilium/筆記/notes/.placeholder');
      await this.ensureFolder('lilium/圖片/.placeholder');
      await this.ensureFolder('dictionaries/.placeholder');
    } catch { /* 預建失敗不阻斷 */ }

    this.plugin.registerView(VIEW_TYPE_UNIVERSAL_DICT, (leaf: WorkspaceLeaf) => {
      return new LiDictView(leaf, this);
    });

    /* 辭典保留 open-dictionary-view 命令。
       理由：功能區收斂為「品牌＋方向」兩顆，三端（含手機抽屜）點按一致；
       辭典未就緒時主菜單自動隱藏該項，維持隔離降級原則。 */

    this.plugin.addCommand({
      id: 'open-dictionary-view',
      icon: this.plugin.commandIconMap?.['open-dictionary-view'],
      name: this.T('dict.cmd.openDictionaryView'),
      callback: () => this.activateView(),
    });

    this.plugin.addCommand({
      id: 'lookup-selection',
      icon: this.plugin.commandIconMap?.['lookup-selection'],
      name: this.T('dict.cmd.lookupSelection'),
      checkCallback: (checking: boolean) => {
        const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!mdView) return false;
        if (!checking) {
          const editor = mdView.editor;
          const raw = editor.getSelection() || this.wordUnderCursor(editor);
          const word = raw ? (this.settings.selectionCleaning ? this.cleanSelectionText(raw) : raw) : null;
          if (word) {
            void this.activateView().then(() => {
              window.setTimeout(() => this.view?.lookupWord(word.trim()), 60);
            });
          } else {
            liNotice(this.T('dict.cmd.lookupSelectionNone'));
          }
        }
        return true;
      },
    });

    // right-click lookup menu (dictionary-plus style, title truncated)
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-menu', (menu, editor) => {
        const selection = editor.getSelection() || this.wordUnderCursor(editor);
        if (!selection || !selection.trim()) return;
        const word = selection.trim();
        const short = word.length > 18 ? word.slice(0, 18) + '…' : word;
        menu.addItem((item) => {
          item
            .setTitle(this.T('dict.menu.lookup', { short }))
            .setIcon('book-marked')
            .onClick(() => {
              void this.activateView().then(() => {
                window.setTimeout(() => this.view?.lookupWord(word), 60);
              });
            });
        });
      }),
    );

    this.plugin.addCommand({
      id: 'rescan-dictionaries',
      icon: this.plugin.commandIconMap?.['rescan-dictionaries'],
      name: this.T('dict.cmd.rescan'),
      callback: async () => {
        await this.rescanAndLoadGuarded(true);
      },
    });

    this.plugin.addCommand({
      id: 'open-bookmarks',
      icon: this.plugin.commandIconMap?.['open-bookmarks'],
      name: this.T('dict.cmd.openBookmarks'),
      callback: async () => {
        await this.activateView();
        window.setTimeout(() => this.view?.showBookmarks(), 80);
      },
    });

    this.plugin.addCommand({
      id: 'open-history',
      icon: this.plugin.commandIconMap?.['open-history'],
      name: this.T('dict.cmd.openHistory'),
      callback: async () => {
        await this.activateView();
        window.setTimeout(() => this.view?.showHistory(), 80);
      },
    });

    this.plugin.addCommand({
      id: 'fulltext-search',
      icon: this.plugin.commandIconMap?.['fulltext-search'],
      name: this.T('dict.cmd.fulltext'),
      callback: async () => {
        await this.activateView();
        window.setTimeout(() => this.view?.focusFullText(), 80);
      },
    });

    // inline editor suggest (lilium <query>)
    this.inlineSuggest = new InlineDictSuggest(this);
    // r59 ⑥：觸發詞從 settings 注入（不再寫死）。
    this.inlineSuggest.setTriggerPhrase(this.settings.inlineSuggestTrigger || 'lilium ');
    this.plugin.registerEditorSuggest(this.inlineSuggest);
    this.service.lemmaFallback = this.settings.lemmaFallback;
    this.service.fuzzyFallback = this.settings.fuzzyFallback;
    this.service.variantFallback = this.settings.variantFallback;

    this.registerSettingTab();

    this.plugin.app.workspace.onLayoutReady(async () => {
      // hover lookup lifecycle (only in editor container, desktop+mobile safe)
      this.applyHoverSettings();
      const containerEl = this.plugin.app.workspace.containerEl?.ownerDocument || document;
      this.hoverController.attach(containerEl);

      // 寫作系統 ⇄ 辭典：捕捉當前筆記文種（懸停斷詞 / 辭典優先匹配用）
      this.refreshCurrentScript();
      // r54 排查修復：走 registerEvent——插件卸載時自動 offref，否則監聽器
      // 殘留並引用已停用的 DictFeature（重載累積洩漏）。
      this.plugin.registerEvent(
        this.plugin.app.workspace.on('active-leaf-change', () => this.refreshCurrentScript()),
      );

      // 查詞快取先（快、且與辭典掃描無關），不被下面的掃描延遲拖住
      const raw = await this.data.read();
      const entries = raw.dictLookupCache as Array<unknown> | undefined;
      if (Array.isArray(entries)) {
        this.cache = new LookupCache(entries as never, () => this.flushCacheDebounced());
        this.service.setCache(this.cache);
      }

      // 辭典掃描是啟動期最重的工作（要重新讀檔並解析每部辭典的索引）。
      // 原本在 onLayoutReady 裡 await，會把 Obsidian 的版面渲染一起卡住；
      // 現在依設定排到背景執行，或在使用者關閉自動掃描時完全略過。
      if (!this.settings.autoScanOnStartup) return;
      if (this.settings.deferStartupScan) {
        const w = window as unknown as {
          requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
        };
        const run = () => void this.rescanAndLoadGuarded();
        if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: Platform.isMobile ? 8000 : 3000 });
        // 移動端無 idle callback 時不得 50ms 就搶主線程（Obsidian 啟動 UI 未穩＝卡頓主因之一）
        else window.setTimeout(run, Platform.isMobile ? 3000 : 50);
      } else {
        await this.rescanAndLoadGuarded();
      }
    });
  }

  unload(): void {
    // r59 ②：卸載即置位掃描中止旗標——進行中的掃描迴圈下一輪退出，
    // 不再對已析構元件發 Notice / add dict。
    this.disposed = true;
    this.scanAbort = true;
    // 快取沖刷為異步：卸載時不阻塞，但必須捕獲異常，避免 unhandled rejection
    // r54 排查修復：先 cancel 排程中的 debounce——卸載前 1.5s 內剛有髒標記時，
    // debounce 會在卸載後觸發對已析構元件的 data.mutate 寫入（生命週期競態）。
    this.flushCacheDebounced.cancel();
    void this.flushCache().catch(() => {});
    this.service.clear();

    // hover 控制器 attach 過 document 級捕獲監聽（mousemove/mousedown/keydown），
    // 不 detach 會在插件停用後繼續彈查詞窗，且監聽器永久殘留。
    try {
      this.hoverController.detach();
    } catch {
      /* 卸載期忽略 */
    }

    // detach 自訂視圖 leaves（Obsidian 不會自動回收；殘留 leaf 在重載後會變成空白面板）
    for (const type of [VIEW_TYPE_UNIVERSAL_DICT]) {
      try {
        for (const leaf of this.plugin.app.workspace.getLeavesOfType(type)) leaf.detach();
      } catch {
        /* 卸載期忽略 */
      }
    }
  }

  applyHoverSettings(): void {
    this.hoverController.setOptions({
      enabled: this.settings.hoverLookup,
      trigger: this.settings.hoverTrigger,
      maxWordLength: this.settings.hoverMaxWordLength,
    });
  }

  async flushCache(): Promise<void> {
    if (!this.cache.isDirty()) return;
    try {
      await this.data.mutate((raw: RawData) => {
        raw.dictLookupCache = this.cache.entries();
      });
      this.cache.markClean();
    } catch (e) {
      // 寫入失敗不應讓查詞中斷；僅標記仍髒，下次再試
      console.error('[lilium 辭典] 查詞快取寫入失敗:', e);
    }
  }

  // ----------------------------------------------------------------- storage

  async loadSettings(): Promise<void> {
    const raw = await this.data.read();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (raw.dict as object) || {});
    // 以下三鍵（buddhistMode / collapsibleBlocks / rememberRecent）預設開且設定頁已撤除開關。
    // 採「首次遷移式」：僅在舊 data.json 缺該鍵時補上預設（幂等），
    // 已存值一律尊重——避免每次啟動強制覆寫造成的非幂等（用戶改動被吃掉、重啟值反覆跳動）。
    const migrated = { buddhistMode: true, collapsibleBlocks: true, rememberRecent: true } as const;
    for (const [key, def] of Object.entries(migrated)) {
      const bag = this.settings as unknown as Record<string, unknown>;
      if (bag[key] === undefined) bag[key] = def;
    }
  }

  async saveSettings(): Promise<void> {
    await this.data.mutate((raw: RawData) => {
      raw.dict = this.settings;
    });
  }

  async pushRecent(word: string): Promise<void> {
    if (!this.settings.rememberRecent) return;
    const list = this.settings.recentLookups.filter((w) => w !== word);
    list.unshift(word);
    this.settings.recentLookups = list.slice(0, this.settings.historyLimit);
    await this.saveSettings();
    // r54 排查修復：歷史寫入移除——原在此寫 hits=0 與 view 主路徑的
    // pushHistory(word, hits.length) 競態（兩個 fire-and-forget 各自 persist，
    // 完成順序不定，0 可後到覆蓋真值＝歷史命中數恆 0 的根因）。歷史統一由
    // view.ts 查詢完成後以實際命中數寫入。
  }

  // ------------------------------------------------------------------- view

  async activateView(): Promise<void> {
    const { workspace } = this.plugin.app;
    let leaf: WorkspaceLeaf | null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_UNIVERSAL_DICT);
    if (leaves.length) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) leaf = workspace.getLeaf('tab');
    }
    await leaf.setViewState({ type: VIEW_TYPE_UNIVERSAL_DICT, active: true });
    // API 版本守衛（minAppVersion 1.7.2）：revealLeaf 需 1.7.2，manifest 已聲明；
    // typeof 守衛保留為防禦性（未來版本變動時避免崩潰）。
    const ws2 = workspace as Workspace & { revealLeaf?: (leaf: WorkspaceLeaf) => void };
    if (typeof ws2.revealLeaf === "function") void ws2.revealLeaf(leaf);
  }

  registerSettingTab(): void {
    // 辭典設置已併入主設置頁的「辭典」分區（renderDictSections），
    // 不再註冊第二個頂層頁籤。方法保留為 no-op：既有調用點（onload）零改動；
    // 'li-dictionary' tab id 退役（openSettings 改走主頁籤深鏈接，見下）。
  }

  /** Open the sidebar and look up a word (public hook for suggests/commands) */
  async lookupInView(word: string): Promise<void> {
    /* 順暢化——視圖已在當前工作區時直接同步查詢（免去 setViewState 重設
       視圖狀態造成的閃爍與 60ms 延遲競態）；僅在視圖不存在/未激活時走 activateView。 */
    const { workspace } = this.plugin.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_UNIVERSAL_DICT);
    const v = this.view;
    const cur = v && leaves.length && leaves[0].view === v;
    if (cur && v) {
      v.lookupWord(word);
      return;
    }
    await this.activateView();
    window.setTimeout(() => this.view?.lookupWord(word), 60);
  }

  openSettings(): void {
    // 主頁籤「辭典」分區深鏈接（one-shot 消費）。
    // 若用戶曾透過 Commander 等綁定「打開辭典設置」，本命令行為不變（落到辭典分區）。
    openLiSettings(this.plugin.app, 'dict');
  }

  // -------------------------------------------------------------- dictionary

  private assetWriter(): AssetWriter {
    return {
      writeBinary: async (vaultPath, data) => {
        const norm = normalizePath(vaultPath);
        await this.ensureFolder(vaultPath);
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        // 用 vault.createBinary 而非 adapter.writeBinary：入 vault 索引後
        // getResourcePath() 才能產出可載入的 app:// 資源 URL（adapter 直寫的
        // 檔案不在索引內，app://local/<rel> 在 Obsidian 1.14 已不可 fetch——
        // 辭典圖片/發音/字體全部 404）。
        const existing = this.plugin.app.vault.getAbstractFileByPath(norm);
        if (existing instanceof TFile) {
          await this.plugin.app.vault.modifyBinary(existing, buf);
        } else {
          try {
            await this.plugin.app.vault.createBinary(norm, buf);
          } catch {
            await this.plugin.app.vault.adapter.writeBinary(norm, buf);
          }
        }
      },
      writeText: async (vaultPath, text) => {
        const norm = normalizePath(vaultPath);
        await this.ensureFolder(vaultPath);
        await this.plugin.app.vault.adapter.write(norm, text);
      },
    };
  }

  /** 確保目標路徑的父資料夾存在（改為 public，校勘面板匯出時要用） */
  async ensureFolder(vaultPath: string): Promise<void> {
    const parts = vaultPath.split('/').filter(Boolean);
    parts.pop(); // file name
    let cur = '';
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      const existing = this.plugin.app.vault.getAbstractFileByPath(normalizePath(cur));
      if (!existing) {
        try {
          await this.plugin.app.vault.createFolder(normalizePath(cur));
        } catch {
          /* exists */
        }
      }
    }
  }

  // ─────────────────────────────────────────────── 穩定 id

  /** `${format}|${baseName}|${scopePath}` → 本次掃描分配到的穩定 id */
  private idPlan: Map<string, string> = new Map();
  /** 本次已發出的 id（防止 descriptor 與實際載入數不一致時撞號） */
  private usedIds: Set<string> = new Set();
  /** 本次載入的辭典（newId + baseKey），供 rememberStableIds 寫索引 */
  private idAssignments: Array<{ id: string; baseKey: string }> = [];

  private dictPlanKey(format: string, baseName: string, scopePath: string): string {
    return `${format}|${baseName}|${scopePath}`;
  }

  /**
   * 巡覽整個 vault，收集「這次會載入哪些詞典」的描述符，一次算好穩定 id。
   *
   * 只讀 TFile 的 metadata（不開檔、不解析內容），因此即便辭典散落在上百個
   * 資料夾，這一趟也只是幾百次字串比對——不會影響啟動速度（鐵律：不拖慢 Obsidian）。
   */
  private prepareStableIds(): void {
    this.idPlan.clear();
    this.usedIds.clear();
    this.idAssignments = [];
    this.migrationItems = [];
    const descs: Array<{ format: DictFormat; baseName: string; scopePath: string }> = [];
    for (const { folder, files } of this.collectDictFolders()) {
      this.collectDescriptors(folder, files, descs);
    }
    const ids = assignStableIds(descs);
    descs.forEach((d, i) => {
      this.idPlan.set(this.dictPlanKey(d.format, d.baseName, d.scopePath), ids[i]);
      this.migrationItems.push({
        newId: ids[i],
        baseKey: dictBaseKey(d.format, d.baseName),
        legacyIds: legacyIdCandidates(d.format, d.baseName),
      });
    });
  }

  private migrationItems: Array<{ newId: string; baseKey: string; legacyIds: string[] }> = [];

  /**
   * 全庫掃描：把 vault 裡所有「副檔名屬於已知辭典格式」的檔案，按所在資料夾分組。
   *
   * 回傳按資料夾路徑排序的陣列——排序是刻意的：載入順序與穩定 id 的消歧後綴
   * 都由此決定，固定順序才能讓同一個 vault 每次掃描得到同一批 id
   * （否則分組／排序／啟用狀態會在重掃後錯位）。
   */
  private collectDictFolders(): Array<{ folder: TFolder; files: TFile[] }> {
    // 恢復「辭典檔案夾」範圍——settings.folders 非空時僅掃描
    // 這些資料夾（遞歸、大小寫不敏感）；留空＝掃描整個倉庫。
    // 排查修復：導入目錄（DICT_IMPORT_ROOT）**永遠納入範圍**——否則使用者
    // 把「辭典檔案夾」改成自訂路徑後，剛導入的辭典落在 dictionaries/ 卻掃不到。
    const configured = this.settings.folders.map((p) => p.trim()).filter(Boolean);
    const scanRoots = configured.length ? [...configured, DICT_IMPORT_ROOT] : [];
    const scopes = [...new Set(scanRoots.map((p) => p.toLowerCase().replace(/^\/+|\/+$/g, '')))].filter(Boolean);
    const inScope = (path: string): boolean => {
      if (!scopes.length) return true;
      const lp = path.toLowerCase();
      return scopes.some((p) => lp === p || lp.startsWith(p + '/'));
    };
    const byFolder = new Map<string, { folder: TFolder; files: TFile[]; hasDict: boolean }>();
    for (const f of this.plugin.app.vault.getFiles()) {
      if (!inScope(f.path)) continue;
      const ext = normalizeExt(f.name);
      // 模塊③：.lex0.xml 只有開關開時視為辭典檔；關閉時與 .xml 一樣忽略（掃描零變化）。
      const isLex0 = this.settings.teiLexEnabled && ext === '.lex0.xml';
      const isDict = (!!ext && !!extToFormat(ext) && ext !== '.lex0.xml' && ext !== '.xml') || isLex0;
      // 同名的 css/js/字體是辭典的配套資源（loadFromFolder 的 companions），
      // 它們不屬於任何格式，只有跟辭典檔同資料夾時才有意義——先一起收進來，
      // 最後再丟掉「沒有辭典檔」的資料夾（避免為全庫的 .css/.js 白建一堆群組）。
      const isDictImage = /\.(png|jpe?g|gif|svg|webp)$/i.test(f.name.toLowerCase());
      if (!isDict && !isLex0 && !isCompanionAssetFile(f.name.toLowerCase()) && !isDictImage) continue;
      if (isExcludedScanPath(f.path)) continue;
      const parent = f.parent;
      if (!(parent instanceof TFolder)) continue;
      let entry = byFolder.get(parent.path);
      if (!entry) byFolder.set(parent.path, (entry = { folder: parent, files: [], hasDict: false }));
      entry.files.push(f);
      if (isDict || isLex0) entry.hasDict = true;
    }
    /* 【同典跨夾配套】分組單位＝「辭典單位」語義：常見辭典包形態是
     * 「辭典A/ test.mdx + css/ + img/ + 與基名同名的配套檔」——辭典主檔在
     * 子夾、配套檔在**同層的資源子夾或同名散檔**。分組後對每個含辭典的組，
     * 把其資料夾**直接下**一層的配套檔（isCompanionAssetFile＋圖片＋.mdd，
     * 含 css/js/font/img 名稱的資源子夾內容）併入該組；子夾自身含辭典主檔者
     * 維持獨立組不併（避免雙重載入）。遞迴掃描語義本就涵蓋此形態（inScope
     * startsWith），settings 面板文案無需變更。 */
    const isDictImageFile = (name: string): boolean => /\.(png|jpe?g|gif|svg|webp)$/i.test(name);
    const isMergeableCompanion = (lower: string): boolean =>
      isCompanionAssetFile(lower) || isDictImageFile(lower) || /\.mdd$/i.test(lower);
    const allVaultFiles = this.plugin.app.vault.getFiles();
    /* r59 批次乙：三重全庫 filter（原每組對 allVaultFiles 各掃 2~3 遍，
     * N 組 × 3 遍＝O(3·N·V)）改為一次遍歷按前綴分桶——
     *   byPrefix: folderPath/ → { child: TFile[]（直接子檔）,
     *     resSub: Map<subSeg, TFile[]>（一層資源子夾內檔案）,
     *     subs: Set<string>（一層子夾段名，供資源子夾判定） }
     * 行為等價：分桶只按「是否以該組資料夾為前綴＋層級」分類，逐組
     * 後續的 isMergeableCompanion／同名判定與原 filter 完全一致。 */
    const RES_SUB_RE = /^(css|js|fonts?|font|img|images?)$/i;
    interface PrefixBucket { child: TFile[]; resSub: Map<string, TFile[]>; subs: Set<string> }
    const byPrefix = new Map<string, PrefixBucket>();
    for (const f of allVaultFiles) {
      for (const entry of byFolder.values()) {
        if (!entry.hasDict) continue;
        const prefix = `${entry.folder.path}/`;
        if (!f.path.startsWith(prefix)) continue;
        let bucket = byPrefix.get(prefix);
        if (!bucket) byPrefix.set(prefix, (bucket = { child: [], resSub: new Map(), subs: new Set() }));
        const rest = f.path.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash < 0) {
          bucket.child.push(f); // 直接子檔案（rest.length>0 恆成立：rest==f.name）
          continue;
        }
        // 一層（sub/無更深層）且段名為資源子夾（css/js/font/img）
        const sub = rest.slice(0, slash);
        if (rest.indexOf('/', slash + 1) < 0 && RES_SUB_RE.test(sub)) {
          bucket.subs.add(sub);
          let arr = bucket.resSub.get(sub);
          if (!arr) bucket.resSub.set(sub, (arr = []));
          arr.push(f);
        }
      }
    }
    for (const entry of byFolder.values()) {
      if (!entry.hasDict) continue;
      const prefix = `${entry.folder.path}/`;
      const bucket = byPrefix.get(prefix) ?? { child: [] as TFile[], resSub: new Map<string, TFile[]>(), subs: new Set<string>() };
      // 一層資源子夾內的檔案，視為配套收進
      for (const files of bucket.resSub.values()) for (const x of files) {
        const lower = x.name.toLowerCase();
        if (!isMergeableCompanion(lower)) continue;
        if (!entry.files.includes(x)) entry.files.push(x);
      }
      // 直接子檔案：同名配套（與該組任一辭典基名同名）或 .mdd 收進該組
      const bases = new Set(entry.files.filter((f) => !isMergeableCompanion(f.name.toLowerCase())).map((f) => dictBaseName(f.name).toLowerCase()));
      for (const f of bucket.child) {
        const lower = f.name.toLowerCase();
        if (!isMergeableCompanion(lower)) continue;
        if (/\.(css|js|ttf|otf|woff2?|eot)$/i.test(lower) && !bases.has(dictBaseName(f.name).toLowerCase())) continue;
        if (!entry.files.includes(f)) entry.files.push(f);
      }
    }
    return [...byFolder.values()]
      .filter((e) => e.hasDict)
      .sort((a, b) => a.folder.path.localeCompare(b.folder.path))
      .map((e) => ({ folder: e.folder, files: e.files }));
  }

  /** 依 loadFromFolder 的組裝規則，推導每個資料夾裡有幾部辭典、各是什麼格式。 */
  private collectDescriptors(
    folder: TFolder,
    files: TFile[],
    out: Array<{ format: DictFormat; baseName: string; scopePath: string }>,
  ): void {
    const byBase = new Map<string, Set<string>>();
    for (const child of files) {
      const ext = normalizeExt(child.name);
      if (!ext) continue;
      if (!extToFormat(ext)) continue;
      const base = dictBaseName(child.name);
      let set = byBase.get(base);
      if (!set) byBase.set(base, (set = new Set()));
      set.add(ext);
    }
    // 與 loadFromFolder 的優先序一致：mdx > TEI Lex-0
    for (const [base, exts] of byBase) {
      let format: DictFormat | null = null;
      if (exts.has('.mdx')) format = 'mdict';
      else if (this.settings.teiLexEnabled && (exts.has('.lex0.xml') || exts.has('.xml') || exts.has('.tar.gz') || exts.has('.tar.xz') || exts.has('.tgz'))) format = 'tei-lex0';
      if (!format) continue; // 只有 .mdd / .syn 之類的孤兒配套檔
      out.push({ format, baseName: base, scopePath: folder.path });
    }
  }

  /** 舊設定（隨機 id / mdict 的 `mdx-<基名>`）搬到新的穩定 id 上。 */
  private migrateOverrideIds(): void {
    const store = this.service.store;
    if (!store || !this.migrationItems.length) return;
    try {
      const res = migrateOverrides(
        store.data.dictOverrides,
        this.migrationItems,
        store.data.dictIdIndex || {},
      );
      if (res.migrated) {
        store.data.dictOverrides = res.overrides;
        void store.flush().catch(() => { /* 落盤失敗不影響本次載入 */ });
      }
    } catch (e) {
      console.error('[lilium] 辭典設定遷移失敗（不阻塞載入）:', e);
    }
  }

  /** 記下「基名 → 當前 id」，供下一代遷移使用（見 store.ts dictIdIndex）。 */
  private rememberStableIds(): void {
    const store = this.service.store;
    if (!store || !this.idAssignments.length) return;
    try {
      const idx = (store.data.dictIdIndex ||= {});
      for (const a of this.idAssignments) idx[a.baseKey] = a.id;
      void store.flush().catch(() => { /* ignore */ });
    } catch (e) {
      console.error('[lilium] 辭典 id 索引寫入失敗（不阻塞載入）:', e);
    }
  }

  /**
   * 給剛載入的辭典指派穩定 id，並記下它的資料夾（供「資料管理／補錄」用）。
   * 必須在 attachCompanions 之前呼叫——後者用 dict.meta.id 當資源路徑。
   */
  private applyStableId(dict: LiDict, format: DictFormat, baseName: string, scopePath: string): void {
    const planned = this.idPlan.get(this.dictPlanKey(format, baseName, scopePath));
    let id = planned || stableDictId(format, baseName, scopePath);
    if (this.usedIds.has(id)) {
      let n = 2;
      while (this.usedIds.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    this.usedIds.add(id);
    dict.meta.id = id;
    // 資料夾路徑：「每部辭典的資料管理／補錄」要知道該往哪裡寫
    dict.meta.dir = scopePath;
    this.idAssignments.push({ id, baseKey: dictBaseKey(format, baseName) });
  }

  // ─────────────────────────────────────────────────────── 辭典檔案導入

  /**
   * 導入辭典檔案到 vault。
   *
   * - 目標：`<辭典根>/<格式>/<辭典名>/<檔名>`（自動建立子資料夾）
   * - 錯配格式／超過 1GB／必需檔缺失 → 整批拒絕並回傳 issues（由 UI 提示）
   * - `targetDir` 有值時走「補錄模式」：只要求檔案屬於該辭典的格式，不湊齊必需組
   * - 預設允許覆蓋同名檔案（補錄／更新既有辭典）
   */
  async importDictFiles(
    files: File[],
    opts: {
      format?: DictFormat | 'auto';
      dictName?: string;
      /** 指定目標資料夾即進入補錄模式（既有辭典補資料） */
      targetDir?: string;
      overwrite?: boolean;
      /** 導入後是否自動重掃（預設 true） */
      rescan?: boolean;
    } = {},
  ): Promise<DictImportReport> {
    const report: DictImportReport = {
      ok: false,
      imported: [],
      skipped: [],
      failed: [],
      issues: [],
      targetDir: '',
      format: null,
      overwritten: 0,
    };
    const list = (files || []).filter((f) => f && f.name);
    try {
      const refs = await Promise.all(
        list.map(async (f) => ({ name: f.name, size: f.size, head: await readFileHead(f) })),
      );
      const plan = planImport(refs, {
        format: opts.format ?? 'auto',
        mode: opts.targetDir ? 'supplement' : 'create',
      });
      report.issues = plan.issues;
      if (!plan.ok || !plan.format) return report;

      const format = plan.format;
      report.format = format;
      const root = DICT_IMPORT_ROOT;
      const dictName = opts.dictName || plan.baseName;
      const dir = normalizePath(
        opts.targetDir || `${root}/${format}/${sanitizeDictFolderName(dictName)}`,
      );
      report.targetDir = dir;

      const adapter = this.plugin.app.vault.adapter;
      if (!(await adapter.exists(dir))) {
        // r59：三層資料夾（root/format/name）須建整條父鏈——adapter.mkdir 只建一層，
        // 父層不存在時會失敗。ensureFolder 語義為「檔案路徑→建其父目錄鏈」，補佔位檔名。
        try {
          await this.ensureFolder(`${dir}/.placeholder`);
        } catch {
          /* 併發建立時可能已存在 */
        }
        try {
          await adapter.mkdir(dir);
        } catch {
          /* 併發建立時可能已存在 */
        }
      }

      const overwrite = opts.overwrite !== false;
      for (const f of list) {
        const target = normalizePath(`${dir}/${safeFileName(f.name)}`);
        try {
          const existed = await adapter.exists(target);
          if (existed && !overwrite) {
            report.skipped.push(f.name);
            continue;
          }
          const buf = await f.arrayBuffer();
          await adapter.writeBinary(target, buf);
          if (existed) report.overwritten++;
          report.imported.push(target);
        } catch (e) {
          report.failed.push({ name: f.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
      report.ok = report.imported.length > 0 && report.failed.length === 0;

      if (opts.rescan !== false && report.imported.length) {
        await this.rescanAndLoadGuarded(true);
      }
      return report;
    } catch (e) {
      report.failed.push({ name: '', error: e instanceof Error ? e.message : String(e) });
      return report;
    }
  }

  /** 掃描辭典並載入（同一時間只跑一次；重複呼叫合併到同一次掃描，idempotent） */
  async rescanAndLoadGuarded(notify = false): Promise<void> {
    if (this.disposed) return; // 卸載後排程回調不得復活掃描（移動端後台競態實錘）
    if (this.scanInFlight) return this.scanInFlight;
    this.scanInFlight = (async () => {
      try {
        this.scanAbort = false; // 新掃描啟動：清除上一次的中止旗標
        await this.rescanAndLoad(notify);
      } finally {
        this.scanInFlight = null;
      }
    })();
    return this.scanInFlight;
  }
  private scanInFlight: Promise<void> | null = null;

  /**
   * 掃描並載入所有可辨識的辭典。
   *
   * 範圍：`settings.folders`（「辭典檔案夾」）非空時僅掃描這些資料夾；
   * 留空＝掃描整個倉庫（保留為默認回退）。
   * 掃描只比對副檔名、不開檔，對啟動幾乎無感。
   */
  async rescanAndLoad(notify = false): Promise<void> {
    // r59d：舊資產根一次性遷移（lilium-assets/ → lilium/assets/），先於任何掃描/緩存讀取
    await migrateLegacyAssetFolder(this.plugin.app);
    // ── 穩定 id 前置作業────────────────────────────
    // 先做一次**只讀 metadata**的巡覽（不開檔、不解析），把這次會載入的詞典
    // 描述符收齊，一次算好穩定 id；載入時直接查表，才能讓 attachCompanions
    // （會用 dict.meta.id 當資源路徑）拿到正確的 id。
    this.prepareStableIds();
    this.migrateOverrideIds();

    this.service.clear();
    /* P0-1：clear() 會 dispose 掉 scanCacheMap 共享實例的 reader——
       sig 命中卻把已 dispose 的「屍體實例」add 回 service＝查詢恆空。
       重掃入口先把已 dispose 的緩存項視為未命中剔除（P0-2 修復不相干，勿動其他邏輯）。 */
    for (const [k, v] of this.scanCacheMap) {
      if (isDictDisposed(v.dict)) this.scanCacheMap.delete(k);
    }
    const loaded: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    for (const { folder, files } of this.collectDictFolders()) {
      // r59 ②：中止旗標——settings 關閉掃描或插件卸載時置位；掃描迴圈每輪檢查，
      // 命中即停（loaded/failed 保留已載入部分，正常走後續刷新）。無 UI 按鈕。
      if (this.scanAbort) return;
      await this.loadFromFolder(folder, files, loaded, failed);
      // 移動端啟動卡頓防範：每部辭典載入後讓出主線程一幀——
      // 大 mdx 解析＋keyIndex 構建逐部串行，同幀全做＝啟動期凍結。
      await new Promise<void>((r) => window.setTimeout(r, 0)); // B6：popout window 相容（obsidianmd/prefer-window-timers）
    }

    this.rememberStableIds();

    if (notify) {
      if (loaded.length) liNotice(this.T('dict.scan.loaded', { n: loaded.length }));
      for (const f of failed) liNotice(this.T('dict.scan.failed', { name: f.name, err: f.error }), 8000);
    }

    // refresh view if open
    // 修「計數快照不刷新」——原實現對同型 leaf 再 setViewState，
    // 不會重跑 onOpen/renderShell，面板停在掃描前的 0/0·尚未匯入快照；
    // 改為直接對現存視圖重跑 renderShell()（整塊重建語義，計數即時跟上）。
    const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_UNIVERSAL_DICT);
    if (leaves.length) {
      const view = leaves[0].view as LiDictView | null;
      if (view && view === this.view) {
        view.renderShell();
      } else if (view && typeof view.renderShell === 'function') {
        view.renderShell();
      } else {
        await leaves[0].setViewState({ type: VIEW_TYPE_UNIVERSAL_DICT, active: true });
      }
    }
  }

  /**
   * 載入一個資料夾裡的辭典（`files` 由 `collectDictFolders` 預先分好組）。
   *
   * 不再自行遞迴：全庫掃描時由呼叫端一次把所有資料夾分好組，這裡只處理
   * 「同一個資料夾」的檔案——與 `collectDescriptors` 的推導規則保持一致。
   */
  private async loadFromFolder(
    folder: TFolder,
    files: TFile[],
    loaded: string[],
    failed: Array<{ name: string; error: string }>,
  ): Promise<void> {
    /* 磁盤緩存鍵提前（TEI 序列化緩存同用；原在 mdx 段宣告，TEI 段先用） */
    const folderKey0 = Array.from(folder.path).map((c) => /[a-zA-Z0-9._-]/.test(c) ? c : c.codePointAt(0)!.toString(36)).join('').slice(-48);
    const mdxFiles = new Map<string, { mdx?: TFile; mdd?: TFile }>();
    /** standalone css/js/fonts keyed by base name — attached to dict with same base */
    const companions = new Map<string, { css?: TFile; js: TFile[]; fonts: TFile[]; images?: TFile[] }>();
    const lex0Pending = new Map<string, LiDict>();
    /* 【img 桶掛 MDict】'' 桶圖片（辭典包 img/ 子夾收進來的）也要 attach 給 mdict——
     * attachCompanions 原生支援 images 欄位（kind: 'image' → ASSET_FOLDER/<dictId>/），
     * TEI 路徑早已併入，mdict 三個組裝路徑（磁盤緩存 / restore / 冷解析）統一經此合併。 */
    const compWithImages = (base: string): { css?: TFile; js: TFile[]; fonts: TFile[]; images?: TFile[] } | null => {
      const c = companions.get(base);
      const imgs = companions.get('')?.images || [];
      if (!c && !imgs.length) return null;
      return {
        css: c?.css,
        js: c?.js || [],
        fonts: c?.fonts || [],
        images: [...(c?.images || []), ...imgs],
      };
    };

    for (const child of files) {
      const lower = child.name.toLowerCase();

      if (lower.endsWith('.mdx') || lower.endsWith('.mdd')) {
        const base = child.name.replace(/\.(mdx|mdd)$/i, '');
        const entry = mdxFiles.get(base) || {};
        if (lower.endsWith('.mdx')) entry.mdx = child;
        else entry.mdd = child;
        mdxFiles.set(base, entry);
      } else if (this.settings.teiLexEnabled && (lower.endsWith('.lex0.xml') || lower.endsWith('.p5.xml') || lower.endsWith('.xml') || lower.endsWith('.tar.gz') || lower.endsWith('.tar.xz') || lower.endsWith('.tgz') || lower.endsWith('.zip'))) {
        // 模塊③：TEI Lex-0 掃描掛載——開關默認關；關閉時 .xml 完全忽略（原樣）。
        /* TEI 掃描緩存命中——檔案未變直接復用（stat 缺失＝跳過緩存判定） */
        let teiSig = '';
        if (child.stat) teiSig = `${child.stat.mtime}:${child.stat.size}`;
        const teiCached = teiSig && this.settings.scanCache ? this.scanCacheMap.get(`tei-lex0-${folderKey0}-${dictBaseName(child.name)}`) : undefined;
        if (teiCached && teiCached.sig === teiSig) {
          this.applyStableId(teiCached.dict, 'tei-lex0', dictBaseName(child.name), folder.path);
          this.service.add(teiCached.dict);
          lex0Pending.set(child.name.replace(/\.(lex0\.xml|p5\.xml|xml|tar\.gz|tar\.xz|tgz|zip)$/i, ''), teiCached.dict);
          loaded.push(teiCached.dict.meta.name || child.name);
          continue;
        }
        const data = new Uint8Array(await this.plugin.app.vault.readBinary(child));
        // TEI 序列化緩存——冷解析一次後 gzip 落盤
        // （<資產根>/.scan-cache/lex0-<folderKey>-<base>.gz），其後啟動還原
        // 648ms vs 冷解析 5.1s（koktai 44k 條實測 7.8×）。sig 不符時走重解析並覆寫。
        const lex0CachePath = `${ASSET_FOLDER}/.scan-cache/lex0-${folderKey0}-${dictBaseName(child.name)}.gz`;
        if (this.settings.scanCache && teiSig) {
          try {
            const gzRaw = await this.plugin.app.vault.adapter.readBinary(lex0CachePath);
            const cachedResult = loadLex0FromCache(new Uint8Array(gzRaw), child.name);
            /* P0-2：磁盤緩存無來源簽名校驗——同名覆蓋更新辭典後舊偏移配新 buf＝錯位亂碼。
               緩存落盤時包裝 srcSig（mtime:size），讀回不符即棄用重解析。 */
            if (cachedResult.ok && cachedResult.dict && (cachedResult as { srcSig?: string }).srcSig === teiSig) {
              this.applyStableId(cachedResult.dict, 'tei-lex0', dictBaseName(child.name), folder.path);
              this.service.add(cachedResult.dict);
              lex0Pending.set(child.name.replace(/\.(lex0\.xml|p5\.xml|xml|tar\.gz|tar\.xz|tgz|zip)$/i, ''), cachedResult.dict);
              loaded.push(cachedResult.dict.meta.name || child.name);
              if (this.settings.scanCache && child.stat) {
                this.scanCacheMap.set(`tei-lex0-${folderKey0}-${dictBaseName(child.name)}`, { dict: cachedResult.dict, sig: teiSig });
              }
              continue;
            }
          } catch { /* 緩存檔不存在/損壞 → 走冷解析 */ }
        }
        const result = loadLex0(data, child.name);
        if (result.ok && result.dict) {
          this.applyStableId(result.dict, 'tei-lex0', dictBaseName(child.name), folder.path);
          this.service.add(result.dict);
          /* ① TEI 圖形資產通路：tar 包內 img/audio/css 成員 → meta.assets
           * （對照 MDict extractMddAssets 模式； koktai img/ 類隨包發佈時可命中）。
           * B4：用 loadLex0 回傳的解壓態 bytes（result.bytes）——非 gzip 原檔，
           * extractTeiTarAssetMembers 免再 gunzip 一次（冷路徑雙重解壓消除）。 */
          if (this.settings.extractMddAssets) {
            try {
              const src = result.bytes || data;
              const isZip = src.length > 4 && src[0] === 0x50 && src[1] === 0x4b;
              const assetMembers = isZip ? extractTeiZipAssetMembers(src) : extractTeiTarAssetMembers(src);
              const assets = (result.dict.meta.assets ||= []);
              const writer = this.assetWriter();
              for (const m of assetMembers) {
                const safeName = m.name.replace(/^[\\/]+/, '').replace(/[\\/:*?"<>|]/g, '_');
                const vaultPath = `${ASSET_FOLDER}/${result.dict.meta.id}/${safeName}`;
                await writer.writeBinary(vaultPath, m.data);
                assets.push({ mddKey: m.name, vaultPath, kind: m.kind, size: m.data.length });
              }
            } catch { /* 資產抽取失敗不拖垮詞典本體 */ }
          }
          /* 冷解析成功 → 序列化 gzip 落盤（異步 fire-and-forget，不阻掃描）。外層包裝 {reader, assets}——掃描緩存還原路徑補掛 meta.assets（舊緩存裸 JSON 兼容）。 */
          if (this.settings.scanCache && child.stat) {
            try {
              
              const readerJson = (result.dict as { reader?: { serialize?: () => string } }).reader?.serialize?.() ?? '';
              /* P0-2：落盤時記錄來源檔簽名（mtime:size），還原時不符即棄用重解析 */
              const wrapped = JSON.stringify({
                srcSig: teiSig,
                reader: readerJson,
                assets: (result.dict.meta as { assets?: Array<unknown> }).assets || [],
              });
              const gz = gzipSync(new TextEncoder().encode(wrapped));
              if (gz.length) await this.plugin.app.vault.adapter.writeBinary(lex0CachePath, gz.buffer);
            } catch { /* 序列化失敗不阻載入 */ }
            const st = child.stat;
            this.scanCacheMap.set(`tei-lex0-${folderKey0}-${dictBaseName(child.name)}`, { dict: result.dict, sig: `${st.mtime}:${st.size}` });
          }
          // TEI 配套（css/js/字體＋圖片）延後到遍歷結束再 attach——companions 收集
          // 與檔案遍歷同步，先命中的 TEI 本體檔 attach 時可能還沒收到配套檔。
          lex0Pending.set(child.name.replace(/\.(lex0\.xml|p5\.xml|xml|tar\.gz|tar\.xz|tgz|zip)$/i, ''), result.dict);
          loaded.push(result.name || child.name);
        } else {
          failed.push({ name: child.name, error: result.error || 'unknown error' });
        }
      } else if (isCompanionAssetFile(lower)) {
        const base = child.name.replace(/\.(css|js|ttf|otf|woff2?|eot)$/i, '');
        const c = companions.get(base) || { js: [], fonts: [] };
        if (lower.endsWith('.css')) c.css = child;
        else if (lower.endsWith('.js')) c.js.push(child);
        else c.fonts.push(child);
        companions.set(base, c);
      }
      else if (/\.(png|jpe?g|gif|svg|webp)$/i.test(lower)) {
        // 辭典圖片配套（TEI charDecl <graphic url> 等）——同資料夾全收，key '' 彙整。
        const c = companions.get('') || { js: [], fonts: [] };
        (c.images ||= []).push(child);
        companions.set('', c);
      }
    }

    // assemble mdict (with mdd asset extraction)
    /* 磁盤緩存鍵的資料夾成分（同名 base 不同資料夾不衝突）——沿用上方 folderKey0 */
    const folderKey = folderKey0;
    for (const [base, files] of mdxFiles) {
      if (!files.mdx) continue;
      try {
        /* 掃描緩存——mdx/mdd 檔案簽名（mtime+size）未變時直接復用
           上次解析的實例，免重複 readBinary＋解析＋keyIndex 構建。 */
        const mdxStat = files.mdx.stat;
        const mddStat = files.mdd ? files.mdd.stat : null;
        const sig = mdxStat ? `${mdxStat.mtime}:${mdxStat.size}` + (mddStat ? `|${mddStat.mtime}:${mddStat.size}` : '') : '';
        /* r59②：記憶體緩存鍵補資料夾成分——對齊磁盤鍵 mdx-<folderKey>-<base> 與 TEI 體例，
           同名 base 不同資料夾不再互相污染實例。 */
        const cached = sig && this.settings.scanCache ? this.scanCacheMap.get(`mdx-${folderKey}-${base}`) : undefined;
        if (cached && cached.sig === sig) {
          this.applyStableId(cached.dict, 'mdict', base, files.mdx.parent?.path ?? folder.path);
          this.service.add(cached.dict);
          const compC = compWithImages(base);
          if (compC) await this.attachCompanions(cached.dict, compC);
          loaded.push(cached.dict.meta.name || base);
          continue;
        }
        const mdxData = new Uint8Array(await this.plugin.app.vault.readBinary(files.mdx));
        /* 跨重啟掃描緩存——磁盤元數據命中則 restore（免解析；buf 重讀遠快於解析）。
           mdd 資源首次掃描已提取落盤，不再重讀 mdd/重提取。 */
        if (this.settings.scanCache) {
          try {
            const cachePath = `${ASSET_FOLDER}/.scan-cache/mdx-${folderKey}-${base}.json`;
            const raw = await this.plugin.app.vault.adapter.read(cachePath);
            const saved = JSON.parse(raw) as { reader: string; mddEntryCount?: number; assets?: Array<unknown>; srcSig?: string };
            /* P0-2：磁盤緩存無來源簽名校驗——同名覆蓋更新辭典後舊偏移配新 buf＝錯位亂碼。
               落盤時記錄 mdx 簽名，讀回不符即棄用走正常解析。 */
            if (saved.srcSig !== sig) throw new Error('scan-cache sig mismatch');
            const res = await loadMdictFromCache(mdxData, files.mdx.name, saved.reader, {
              dictId: `mdx-${base}`,
              mddEntryCount: saved.mddEntryCount,
            });
            if (res.ok && res.dict && Array.isArray(saved.assets) && saved.assets.length) {
              (res.dict.meta as { assets?: Array<unknown> }).assets = saved.assets; // 還原路徑補掛 mdd 資產清單
            }
            if (res.ok && res.dict) {
              this.applyStableId(res.dict, 'mdict', base, files.mdx.parent?.path ?? folder.path);
              this.service.add(res.dict);
              const compD = compWithImages(base);
              if (compD) await this.attachCompanions(res.dict, compD);
              loaded.push(res.name || base);
              continue;
            }
          } catch { /* 緩存檔不存在/損壞 → 走正常解析 */ }
        }
        const mddData = files.mdd ? new Uint8Array(await this.plugin.app.vault.readBinary(files.mdd)) : undefined;
        // 大辭典卡頓防範：mdd 龐大時提示（不阻斷；提取後 buffer 即釋放）
        if (mddData && mddData.length > 300 * 1024 * 1024) {
          liNotice(this.T('dict.scan.largeMdd', { name: base, mb: Math.round(mddData.length / 1048576) }), 8000);
        }
        const dictId = `mdx-${base}`;
        // r59 ①：mdx 載入進度接入 Obsidian Notice（階段性提示，節流防刷屏）。
        // 大辭典解析/mdd 提取動輒數秒，靜默期用戶無從得知是在工作還是凍結。
        let lastPhase = '';
        let lastNoticeTs = 0;
        let progressNotice: Notice | null = null;
        const progressNoticeMs = 2000; // 節流：同階段至少隔 2s 才更新 Notice
        const result = await loadMdict(mdxData, files.mdx.name, {
          mddData,
          assetWriter: this.settings.extractMddAssets ? this.assetWriter() : undefined,
          dictId,
          extractAssets: this.settings.extractMddAssets,
          onProgress: (phase, done, total) => {
            if (this.scanAbort) return;
            const now = Date.now();
            const phaseChanged = phase !== lastPhase;
            if (!phaseChanged && now - lastNoticeTs < progressNoticeMs) return;
            lastPhase = phase;
            lastNoticeTs = now;
            const msg = this.T('dict.scan.loadProgress', { name: base, phase, done, total });
            if (progressNotice) progressNotice.setMessage(msg);
            else progressNotice = liNotice(msg, 0); // 常駐，載完統一隱藏
          },
        });
        (progressNotice as { hide(): void } | null)?.hide();
        if (result.ok && result.dict) {
          // 必須在 attachCompanions 之前：它用 dict.meta.id 當資源路徑
          this.applyStableId(result.dict, 'mdict', base, files.mdx.parent?.path ?? folder.path);
          this.service.add(result.dict);
          // attach companions (css/js/fonts + '' 桶圖片) with the same base name
          const comp = compWithImages(base);
          if (comp) {
            await this.attachCompanions(result.dict, comp);
          }
          if (this.settings.scanCache) {
            this.scanCacheMap.set(`mdx-${folderKey}-${base}`, { dict: result.dict, sig });
            /* 序列化 reader 元數據落盤（跨重啟）。mdd 資源已提取，僅存 entryCount。 */
            try {
              const rd = (result.dict as unknown as { reader: { serialize(): string } }).reader;
              if (rd?.serialize) {
                await this.plugin.app.vault.adapter.mkdir(`${ASSET_FOLDER}/.scan-cache`).catch(() => {});
                const cacheFile = `${ASSET_FOLDER}/.scan-cache/mdx-${folderKey}-${base}.json`;
                this.scanCacheFiles.set(result.dict.meta.id, cacheFile);
                await this.plugin.app.vault.adapter.write(
                  cacheFile,
                  JSON.stringify({ srcSig: sig, reader: rd.serialize(), mddEntryCount: result.dict.meta.mddEntryCount, assets: result.dict.meta.assets || [] }),
                );
              }
            } catch (e) { console.error('[lilium] scan-cache 落盤失敗（不阻塞）:', e); }
          }
          loaded.push(
            result.name || base + (result.assets?.length ? ` (+${result.assets.length} ${this.T('dict.unit.assets')})` : ''),
          );
        } else {
          // r59 批次乙：回報完整檔名（原 base 無副檔名，多檔辭典包難定位）
          failed.push({ name: files.mdx.name, error: result.error || 'unknown error' });
        }
      } catch (e) {
        failed.push({ name: base, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // TEI Lex-0 配套資源 attach（遍歷後 companions 已收齊）
    for (const [base, dict] of lex0Pending) {
      const comp = companions.get(base);
      const merged = {
        css: comp?.css,
        js: comp?.js || [],
        fonts: comp?.fonts || [],
        images: [...(comp?.images || []), ...(companions.get('')?.images || [])],
      };
      if (merged.css || merged.js.length || merged.fonts.length || merged.images.length) {
        try {
          await this.attachCompanions(dict, merged);
          loaded.push(`${base} (+${(dict.meta.assets || []).length} assets)`);
        } catch {
          /* attach 失敗不拖垮辭典本身 */
        }
      }
    }
  }

  private hasSiblingIfo(folder: TFolder, base: string): boolean {
    return folder.children.some(
      (c) => c instanceof TFile && c.name.toLowerCase() === `${base.toLowerCase()}.ifo`,
    );
  }

  /** Attach standalone css/js/font files to a dictionary as companion assets */
  private async attachCompanions(
    dict: LiDict,
    comp: { css?: TFile; js: TFile[]; fonts: TFile[]; images?: TFile[] },
  ): Promise<void> {
    const writer = this.assetWriter();
    const dictId = dict.meta.id;
    const assets = (dict.meta.assets ||= []);
    if (comp.css) {
      const raw = await this.plugin.app.vault.read(comp.css);
      // ：導入時即做作用域隔離（選擇器加 #li-dict-<id> 前綴），渲染期
      // 正文包進同 id 的包裹元素（view.ts fillFrame）即可命中。隔離失敗不得
      // 拖垮導入——降級為原樣寫入，辭典仍可用（僅無隔離收益）。
      let text = raw;
      try {
        text = isolateCSS(raw, dictScopeId(dictId));
      } catch {
        /* 隔離失敗退回原始 CSS */
      }
      const path = `${ASSET_FOLDER}/${dictId}/${comp.css.name}`;
      await writer.writeText(path, text);
      assets.push({ mddKey: comp.css.name, vaultPath: path, kind: 'css', size: text.length });
    }
    for (const js of comp.js) {
      const text = await this.plugin.app.vault.read(js);
      const path = `${ASSET_FOLDER}/${dictId}/${js.name}`;
      await writer.writeText(path, text);
      assets.push({ mddKey: js.name, vaultPath: path, kind: 'js', size: text.length });
    }
    for (const font of comp.fonts) {
      const data = new Uint8Array(await this.plugin.app.vault.readBinary(font));
      const path = `${ASSET_FOLDER}/${dictId}/${font.name}`;
      await writer.writeBinary(path, data);
      const asset: ExtractedAsset = { mddKey: font.name, vaultPath: path, kind: 'font', size: data.length };
      // 解析字體自報 family 對齊 @font-face 名。
      // 此前渲染期用 lilium-<mddKey> 自造名，與詞條/CSS 引用的真實名（如 Calibri）
      // 永遠對不上 → 字體進 iframe 卻從未被應用（document.fonts status=unloaded）。
      // 兜底：解析失敗（WOFF2/bad container/無 name 表）留空，渲染期回退 lilium-<mddKey> 名。
      try {
         
        
        const resolved = await resolveFontName(data);
        if (resolved.info.family) asset.fontFamily = resolved.info.family;
      } catch { /* 解析失敗留空，渲染期回退 UD 名 */ }
      assets.push(asset);
    }
    for (const img of comp.images || []) {
      const data = new Uint8Array(await this.plugin.app.vault.readBinary(img));
      const path = `${ASSET_FOLDER}/${dictId}/${img.name}`;
      await writer.writeBinary(path, data);
      assets.push({ mddKey: img.name, vaultPath: path, kind: 'image', size: data.length });
    }
  }

  /**
   * 辭典本體檔案。
   *
   * 不能只看 `meta.files`：MDict 的 `meta.files` 只有 `.mdx`（`.mdd` 不在裡面），
   * 舊格式不見得記錄配套檔。這裡改用 `DICT_IMPORT_SPECS` 在 `meta.dir`
   * 裡列舉「同基名且副檔名屬於同一格式」的全部檔案，確保 `.mdd` / `.idx.gz` /
   * `.dict.dz` / `.syn` / 同名 css/js/字體 等配套檔一起被清掉。
   */
  private dictBodyFiles(d: LiDict): TFile[] {
    const dir = d.meta.dir;
    const first = d.meta.files && d.meta.files[0];
    if (!dir || !first) return [];
    const base = dictBaseName(first).toLowerCase();
    if (!base) return [];
    const folder = this.plugin.app.vault.getAbstractFileByPath(normalizePath(dir));
    if (!(folder instanceof TFolder)) return [];
    const out: TFile[] = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile)) continue;
      // 大小寫不分：Windows/macOS 不分大小寫，同一部詞典的檔名大小寫可能不一致
      if (dictBaseName(child.name).toLowerCase() !== base) continue;
      const ext = normalizeExt(child.name);
      if (!ext || !specAcceptsExt(d.meta.format, ext)) continue;
      out.push(child);
    }
    return out;
  }

  /**
   * 移到垃圾桶（可還原），失敗一律拋出——呼叫端負責回報。
   *
   * 三級降級：`vault.trash(系統回收站)` → `adapter.trashLocal(.trash)` →
   * `adapter.remove(直接刪除)`。前兩級都能還原，最後一級是保底：
   * 辭典檔動輒上百 MB，留在 vault 裡會被一直重掃。
   */
  private async trashVaultPath(path: string): Promise<void> {
    const norm = normalizePath(path);
    const af = this.plugin.app.vault.getAbstractFileByPath(norm);
    if (af) {
      try {
        await this.plugin.app.fileManager.trashFile(af);
        return;
      } catch (e) {
        console.error('[lilium 辭典] 移到系統回收站失敗，改走 vault 本地垃圾桶:', norm, e);
      }
    }
    const adapter = this.plugin.app.vault.adapter;
    try {
      await adapter.trashLocal(norm);
      return;
    } catch (e) {
      console.error('[lilium 辭典] 移到本地垃圾桶失敗，改為直接刪除:', norm, e);
    }
    await adapter.remove(norm);
  }

  /**
   * 移除空的「匯入子資料夾」。
   *
   * 只移除導入時建立的那一層：`${DICT_IMPORT_ROOT}/${format}/${name}/`。
   * 必須同時滿足「層級正好三層」＋「根與格式段吻合」＋「資料夾確實空了」才動手——
   * 使用者的 `dictionaries/` 根目錄、格式資料夾或任何自訂資料夾一律不碰。
   */
  private async removeEmptyImportDir(dir: string, format: DictFormat): Promise<string | null> {
    const segs = normalizePath(dir).split('/').filter(Boolean);
    if (segs.length !== 3) return null;
    if (segs[0] !== DICT_IMPORT_ROOT || segs[1] !== format) return null;
    const norm = segs.join('/');
    const folder = this.plugin.app.vault.getAbstractFileByPath(norm);
    if (!(folder instanceof TFolder)) return null;
    if (folder.children.length) return null;
    try {
      // recursive=false：非空就拋錯，絕不連坐刪除
      await this.plugin.app.vault.adapter.rmdir(norm, false);
      return null;
    } catch (e) {
      return `${norm}（${e instanceof Error ? e.message : String(e)}）`;
    }
  }

  /** 刪除確認：這會真的刪掉使用者的辭典檔，必須先看過再動手。 */
  private confirmDeleteDict(name: string, count: number): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new DeleteDictModal(
        this.plugin.app,
        {
          title: this.T('dict.manage.deleteConfirm', { name }),
          note: this.T('dict.manage.deleteConfirmNote', { n: count }),
          okText: this.T('dict.manage.deleteBtn'),
          cancelText: this.T('common.cancel'),
        },
        resolve,
      );
      modal.open();
    });
  }

  /**
   * 從詞庫移除一部辭典，**並真的把它的檔案移到垃圾桶**。
   *
   * 舊版只刪 `.lilium-assets/<id>` 與 data.json 的設定，辭典本體檔原封不動，
   * 於是按「重新掃描」或重啟後辭典就復活了——等於刪除功能形同虛設。
   *
   * 流程：確認對話框 → 辭典本體檔移垃圾桶 → `.lilium-assets/<id>` → 清空掉的匯入
   * 子資料夾 → 清 `dictIdIndex` → `service.remove` + `removeOverride`。
   * 任一步失敗都**明確回報並保留辭典條目**（絕不「刪不掉卻說已移除」）。
   */
  async deleteDictionary(id: string): Promise<void> {
    const d = this.service.get(id);
    if (!d) return;
    const name = this.service.displayName(d);
    const files = this.dictBodyFiles(d);
    if (!(await this.confirmDeleteDict(name, files.length))) return;

    const errors: string[] = [];
    for (const f of files) {
      try {
        await this.trashVaultPath(f.path);
      } catch (e) {
        errors.push(`${f.path}（${e instanceof Error ? e.message : String(e)}）`);
      }
    }

    // 本體檔清乾淨了才往下走：留著辭典條目，使用者才知道還要處理什麼
    if (!errors.length) {
      try {
        const assetPath = normalizePath(`${ASSET_FOLDER}/${id}`);
        if (await this.plugin.app.vault.adapter.exists(assetPath)) {
          await this.trashVaultPath(assetPath);
        }
      } catch (e) {
        errors.push(`${ASSET_FOLDER}/${id}（${e instanceof Error ? e.message : String(e)}）`);
      }
      if (d.meta.dir) {
        const dirErr = await this.removeEmptyImportDir(d.meta.dir, d.meta.format);
        if (dirErr) errors.push(dirErr);
      }
    }

    if (errors.length) {
      console.error('[lilium 辭典] 刪除辭典未完成:', name, errors.join('; '));
      liNotice(`${this.T('common.operationFailed')} — ${errors.slice(0, 3).join('；')}`, 8000);
      return;
    }

    // 清掉 id 索引，否則會留一筆指向已不存在詞典的 baseKey
    const idx = this.store.data.dictIdIndex;
    if (idx) {
      delete idx[dictBaseKey(d.meta.format, dictBaseName(d.meta.files?.[0] || ''))];
      for (const k of Object.keys(idx)) if (idx[k] === id) delete idx[k];
    }
    this.service.remove(id);
    this.scanCacheMap.delete(id);
    const cf = this.scanCacheFiles.get(id);
    if (cf) {
      this.scanCacheFiles.delete(id);
      void this.plugin.app.vault.adapter.remove(cf).catch(() => {});
    }
    await this.store.removeOverride(id);
    liNotice(this.T('dict.removed', { name }));
  }

  /** Update dictionary metadata from the info editor */
  async updateDictInfo(id: string, patch: { displayName?: string; group?: string }): Promise<void> {
    await this.store.setOverride(id, patch);
  }

  /** 清空掃描緩存（設置關閉時/手動強制重掃）；含磁盤緩存檔 */
  async clearScanCache(): Promise<void> {
    this.scanCacheMap.clear();
    try {
      const entries = await this.plugin.app.vault.adapter.list(`${ASSET_FOLDER}/.scan-cache`);
      for (const f of [...entries.files, ...entries.folders]) {
        if (f.endsWith('.json')) await this.plugin.app.vault.adapter.remove(f).catch(() => {});
      }
    } catch { /* 資料夾不存在＝無緩存 */ }
  }

  /** 辭典排序——按「已載入」當前可見順序交換 override.order（持久化）。
     舊實作（settings.ts/panels.ts）只改 legacy service.order 數組，
     而 service.all 排序以 store.getOverride(id).order 為準 → 上移/下移從不生效。
     此處為唯一實作：settings.ts 與 panels.ts 共用。 */
  async reorderDictionary(id: string, delta: number): Promise<void> {
    const all = this.service.all;
    const i = all.findIndex((d) => d.meta.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= all.length) return;
    const a = all[i].meta.id;
    const b = all[j].meta.id;
    const oa = this.store.getOverride(a).order;
    const ob = this.store.getOverride(b).order;
    // 交換兩者的排序權重（覆寫 getOverride 可能剛剛生成的 Date.now() 預設）
    await this.store.setOverride(a, { order: ob });
    await this.store.setOverride(b, { order: oa });
    // legacy service.order 同步交換（向後相容讀取處）
    const order = this.service.order;
    const oi = order.indexOf(a);
    const oj = order.indexOf(b);
    if (oi >= 0 && oj >= 0) [order[oi], order[oj]] = [order[oj], order[oi]];
  }

  /** Get raw header fields for the info editor (mdict) */
  dictHeaderInfo(id: string): Record<string, string> | null {
    const d = this.service.get(id);
    if (!d) return null;
    if (d.meta.format === 'mdict') {
      const reader = (d as unknown as { reader: { getHeaderInfo(): Record<string, string> } }).reader;
      return reader?.getHeaderInfo() || null;
    }
    return null;
  }

  // ------------------------------------------------------------------ editor

  // 【退役】insertIntoEditor 已移除——移動端活動視圖恆為辭典面板
  // （drawer），getActiveViewOfType(MarkdownView) 恆 null＝按鈕在移動端恆失敗；複製按鈕
  // 已提供等效工作流。原實現（quote 引文塊 replaceSelection）見 git 歷史 a26eeaf..dfa0dff。

  private wordUnderCursor(editor: Editor): string | null {
    // v1.3: Intl.Segmenter-based detection — works for CJK/Thai and all
    // space-delimited scripts (replaces the old per-char regex walk).
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const hit = getWordAtOffset(line, cursor.ch, this.currentSegLocale);
    return hit ? hit.word : null;
  }

  /** selection cleaning for PDF/highlight sources (hata pattern) */
  cleanSelectionText(raw: string): string {
    return cleanSelection(raw);
  }

  // ------------------------------------------------- writing-system ⇄ dictionary

  /**
   * 重新偵測當前活動筆記的書寫系統，更新 `currentScriptId` / `currentSegLocale`。
   * 優先讀 frontmatter（lang / script，輕量不讀正文）；否則讀正文偵測。
   * 非 Markdown 筆記視為漢文直排兜底（與 applyEditorMode 一致）。
   */
  private refreshCurrentScript(): void {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      this.setCurrentScript('han');
      return;
    }
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | null
      | undefined;
    const alias = fm?.script
      ? resolveScriptAlias(fm.script)
      : fm?.lang
        ? resolveScriptAlias(fm.lang)
        : null;
    if (alias) {
      this.setCurrentScript(alias);
      return;
    }
    // frontmatter 無明確文種：讀正文偵測（async，避免阻塞 UI）。
    // 批次丁（UI 執行緒效能）：cachedRead 整篇在每次 leaf 切換都重讀全檔，
    // 大筆記（數 MB）讀取＋偵測本身即卡頓源。Obsidian Vault API 無 ranged read
    // （vault.read/cachedRead/process 均整檔；adapter.read 亦整檔），故改取樣策略：
    //   - ≤256KB：cachedRead 整篇（現狀，成本可忽略）
    //   - >256KB：跳過全篇偵測，沿用上次偵測結果（frontmatter 已在上面先行覆蓋；
    //     正文文種中途切換屬罕見，代價是該類筆記沿用前一文種——不新增 I/O 卡頓）
    if (file.stat.size > 256 * 1024) return;
    void this.plugin.app.vault.cachedRead(file).then((md) => {
      if (this.plugin.app.workspace.getActiveFile() !== file) return; // 已切走
      this.setCurrentScript(detectScript(md));
    }).catch(() => { /* 讀取失敗不影響既有緩存 */ });
  }

  private setCurrentScript(id: ScriptId): void {
    this.currentScriptId = id;
    this.currentSegLocale = segmenterLocaleFor(id);
  }

  /**
   * 依辭典名稱啓發式推斷語言碼（meta.lang 缺失時的兜底）。
   * 覆蓋常見中英/少數民族文名稱寫法。
   */
  private nameLangHint(name: string): string {
    const n = name.toLowerCase();
    const has = (...subs: string[]) => subs.some((s) => n.includes(s.toLowerCase()));
    if (has('中', '汉', '漢', 'chinese', 'zh')) return 'zh';
    if (has('日', 'japanese', '国語', 'kokugo', 'ja')) return 'ja';
    if (has('韓', 'korean', '한', 'ko')) return 'ko';
    if (has('蒙', 'mongol', 'ᠮᠣᠩ', 'mn')) return 'mn';
    if (has('滿', 'manchu', 'ᠮᠠᠨ', 'mn')) return 'mn';
    if (has('藏', 'tibet', 'bo')) return 'bo';
    if (has('梵', 'sanskrit', 'sa')) return 'sa';
    if (has('巴利', 'pali', 'pi')) return 'pi';
    if (has('維吾爾', 'uyghur', 'ug')) return 'ug';
    if (has('僧伽羅', 'sinhala', 'si')) return 'si';
    if (has('阿', 'arabic', 'ar')) return 'ar';
    if (has('希伯來', 'hebrew', 'he')) return 'he';
    if (has('英', 'english', 'en')) return 'en';
    return '';
  }

  /**
   * 懸停查詞結果優先匹配當前筆記語言的辭典：相同語言的 hit 排到最前，
   * 各自內部順序保持不變。無當前文種或無辭典匹配時回傳原順序（行爲不變）。
   */
  private reorderHitsByScript<T extends { dictId: string; dictName: string }>(
    hits: T[],
    scriptId: ScriptId,
  ): T[] {
    const want = scriptLangCode(scriptId);
    if (!want || !hits.length) return hits;
    const langOf = (h: T): string => {
      const meta = this.service.get(h.dictId)?.meta;
      const ml = meta?.lang;
      if (ml) return ml.toLowerCase();
      return this.nameLangHint(h.dictName);
    };
    const pri: T[] = [];
    const rest: T[] = [];
    for (const h of hits) (langOf(h) === want ? pri : rest).push(h);
    return pri.length ? [...pri, ...rest] : hits;
  }
}

function isCompanionAssetFile(lower: string): boolean {
  return /\.(css|js|ttf|otf|woff2?|eot)$/.test(lower);
}

/**
 * 全庫掃描時要跳過的路徑。
 *
 * - `.lilium-assets`：插件自己抽出的 mdd 資源，不是辭典本體
 * - 其餘以 `.` 開頭的資料夾：`.trash`（已垃圾桶裡的辭典不能被「復活」，
 *   否則使用者剛刪掉的辭典一掃描又回來）、`.obsidian`、`.git` 等系統資料夾
 */
/**
 * r59d：舊資產根遷移——lilium-assets/ → lilium/assets/。
 * 資產根收編為 lilium 資料夾子夾。老版本在 vault 根留下 lilium-assets/
 * （mdx 提取實檔＋.scan-cache 磁盤緩存）。掃描前一次性搬移：
 *   1) 舊根每個子夾 adapter.rename 到新根（同名子夾衝突跳過——新根優先，不覆蓋）；
 *   2) .scan-cache/*.json 內 assets[].vaultPath 前綴逐條改寫（遷移後磁盤緩存命中
 *      還原的 dict.meta.assets 指向新路徑，詞條顯示 app:// URL 正確）；
 *   3) .scan-cache 本身搬移後舊根已空 → 刪除舊根資料夾。
 * 全程 adapter 層操作，不進 Obsidian 索引（assets 與 .scan-cache 均為插件私有）。
 * 任一步失敗不阻斷掃描（降級：舊資產留在原地，新提取走新路徑）。
 */
async function migrateLegacyAssetFolder(app: App): Promise<void> {
  const adapter = app.vault.adapter;
  try {
    if (!(await adapter.exists(LEGACY_ASSET_FOLDER))) return;
    if (!(await adapter.exists(`${LEGACY_ASSET_FOLDER}/.scan-cache`))
        && (await adapter.list(LEGACY_ASSET_FOLDER)).files.length === 0
        && (await adapter.list(LEGACY_ASSET_FOLDER)).folders.length === 0) {
      await adapter.rmdir(LEGACY_ASSET_FOLDER, true).catch(() => {});
      return;
    }
    await adapter.mkdir(ASSET_FOLDER).catch(() => {});
    const ls = await adapter.list(LEGACY_ASSET_FOLDER);
    // 1) 實檔子夾搬移（含 .scan-cache——rename 後在位置 2 改寫其 json 前綴）
    for (const sub of ls.folders || []) {
      const name = sub.split('/').pop() || '';
      const target = `${ASSET_FOLDER}/${name}`;
      if (await adapter.exists(target)) continue; // 新根已有同名——不覆蓋
      await adapter.rename(sub, target).catch(() => {});
    }
    for (const f of ls.files || []) {
      const name = f.split('/').pop() || '';
      const target = `${ASSET_FOLDER}/${name}`;
      if (await adapter.exists(target)) continue;
      await adapter.rename(f, target).catch(() => {});
    }
    // 2) .scan-cache/*.json 前綴改寫（rename 後新路徑下的 json）
    const scanCache = `${ASSET_FOLDER}/.scan-cache`;
    try {
      const cls = await adapter.list(scanCache);
      for (const jf of (cls.files || []).filter((x) => x.endsWith('.json'))) {
        try {
          const raw = await adapter.read(jf);
          if (!raw.includes(`${LEGACY_ASSET_FOLDER}/`)) continue;
          // 只替換 vaultPath 值的前綴（"lilium-assets/ → "lilium/assets/），
          // 不動 reader 二進制欄位；逐字面替換安全——前綴字串無 regex 特殊字符。
          const fixed = raw.split(`"${LEGACY_ASSET_FOLDER}/`).join(`"${ASSET_FOLDER}/`);
          await adapter.write(jf, fixed);
        } catch { /* 單檔失敗跳過——該條緩存下次掃描重建 */ }
      }
    } catch { /* scan-cache 缺失——無緩存可改寫 */ }
    // 3) 舊根清空後刪除
    try {
      const rem = await adapter.list(LEGACY_ASSET_FOLDER);
      if ((rem.files || []).length === 0 && (rem.folders || []).length === 0) {
        await adapter.rmdir(LEGACY_ASSET_FOLDER, true);
      }
    } catch { /* 殘留不阻斷——下次啟動再收 */ }
  } catch { /* 遷移失敗靜默——掃描照常，舊資產原地保留 */ }
}

function isExcludedScanPath(vaultPath: string): boolean {
  /* r59d：資產根改 lilium/assets（lilium 資料夾子夾）——逐段 seg === ASSET_FOLDER
     比對對多段路徑永遠失效，改路徑前綴判定；排除範圍精確到 lilium/assets/ 子樹，
     lilium/ 下用戶自有筆記/附件不受影響。舊根 lilium-assets/（遷移殘留）同樣排除。 */
  const p = `${String(vaultPath || '').replace(/\/+$/, '')}/`;
  if (p === `${ASSET_FOLDER}/` || p.startsWith(`${ASSET_FOLDER}/`)) return true;
  if (p === `${LEGACY_ASSET_FOLDER}/` || p.startsWith(`${LEGACY_ASSET_FOLDER}/`)) return true;
  const segs = String(vaultPath || '').split('/');
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (!seg) continue;
    if (seg.startsWith('.')) return true;
  }
  return false;
}

/**
 * 辭典刪除確認彈窗。
 *
 * 照 src/settings.ts 的 confirmReset 模式寫（h3 標題 + 說明 + 取消／確認兩鈕），
 * 但那是主設定頁的私有方法，詞典模組不能改它，於是在自己的檔裡同構一份。
 * 「取消」與 ESC 關閉都回傳 false（onClose 兜底，避免 Promise 永遠懸著）。
 */
class DeleteDictModal extends Modal {
  private readonly opts: { title: string; note: string; okText: string; cancelText: string };
  private readonly onResult: (ok: boolean) => void;
  private settled = false;

  constructor(
    app: App,
    opts: { title: string; note: string; okText: string; cancelText: string },
    onResult: (ok: boolean) => void,
  ) {
    super(app);
    this.opts = opts;
    this.onResult = onResult;
  }

  private settle(ok: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.close();
    this.onResult(ok);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: this.opts.title });
    contentEl.createEl('p', { text: this.opts.note, cls: 'li-settings-dict-missing' });
    const row = contentEl.createDiv('li-ft-options');
    const cancel = row.createEl('button', { text: this.opts.cancelText, cls: 'li-mini-btn' });
    cancel.addEventListener('click', () => this.settle(false));
    const ok = row.createEl('button', { text: this.opts.okText, cls: 'mod-cta li-danger' });
    ok.addEventListener('click', () => this.settle(true));
  }

  onClose(): void {
    this.contentEl.empty();
    // ESC / 點背景關閉都算取消
    this.settle(false);
  }
}