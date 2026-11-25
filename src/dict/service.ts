// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — dictionary service layer.
 *
 * Manages a library of loaded dictionaries across all four formats with:
 *  - per-dictionary overrides: order, enabled, displayName, group (via DataStore)
 *  - multi-select search scope (activeDictIds; empty = all enabled)
 *  - full-text search adapters
 *  - unified resource resolver (mdd assets)
 */

import { TFile, Vault } from 'obsidian';
import { normalizeKey as mdictNormalizeKey, MdictReader } from './mdict';
import { Lex0Reader } from './tei-lex0';
import { DataStore } from './store';
import {
  SearchableDict,
  MdictSearch,
  Lex0Search,
  FullTextHandle,
  FullTextOptions,
  runFullTextSearch,
} from './fulltext';
import { ExtractedAsset, createAssetResolver } from './mdd-assets';
import { HeadwordSource, resolveCandidates } from './fuzzy';
import { lemmatize } from './lemmatizer';
import { variantCandidates } from './variant-lookup';

export function normalizeStardictKey(word: string): string {
  return word.replace(/[().,\-&、 '/\\@_$!]/g, '').toLowerCase().trim();
}

/**
 * 從多個候選中挑出第一個非空語言碼（小寫），全空回 undefined。
 * 用於聚合 MDict 頭部 / 名稱啓發式等不同來源的詞典語言信號。
 */
function pickLang(...vals: Array<string | number | undefined | null>): string | undefined {
  for (const v of vals) {
    const s = (v === undefined || v === null ? '' : String(v)).toLowerCase().trim();
    if (s) return s;
  }
  return undefined;
}

export type DictFormat = 'mdict' | 'tei-lex0';

export interface DictMeta {
  id: string;
  name: string;
  format: DictFormat;
  entryCount: number;
  description?: string;
  files: string[];
  /**
   * 辭典檔案所在的 vault 相對資料夾。
   * 由 DictFeature 載入時填上，供「每部辭典的資料管理／補錄」定位寫入目標；
   * 只存在於執行期，不入 data.json。
   */
  dir?: string;
  /** mdd assets extracted to vault (mdict only) */
  assets?: ExtractedAsset[];
  /** number of entries in companion .mdd */
  mddEntryCount?: number;
  /**
   * 辭典內容的語言碼（BCP47 簡短形式，如 zh/ja/ko/en/sa/bo/mn/pi/ar/ug/si）。
   * 來源：MDict 頭部的 `Lang`/`InputLang`、或名稱啓發式。
   * 用於「懸停查詞優先匹配當前筆記語言的辭典」（見 DictFeature.reorderHitsByScript）。
   */
  lang?: string;
}

export interface LookupHit {
  dictId: string;
  dictName: string;
  keyText: string;
  html: string;
  bookmarked?: boolean;
}

export interface LiDict {
  meta: DictMeta;
  lookup(word: string): LookupHit[];
  prefix(word: string, limit?: number): string[];
  searchable(): SearchableDict;
  dispose?(): void;
  /**
   * 模糊候選詞頭來源。
   * 由 DictService 統一調度，讓 MDict / TEI Lex-0 兩種格式
   * 共用同一條降級鏈（精確 → 大小寫 → 去標點 → 前綴），而不是各自為政。
   */
  headwords?(): HeadwordSource;
}

let idCounter = 0;
function nextId(): string {
  return `dict-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

import { BKTree } from './bktree';

export class DictService {
  /** vault 引用（由 plugin 接線）：assetUrl 用 getResourcePath 產可載入資源 URL */
  vault: Vault | null = null;
  private dicts: LiDict[] = [];
  private suggestTrees: Map<string, { tree: BKTree; words: string[] }> = new Map();
  /** priority-ordered ids (first = highest) — legacy; overrides take precedence when present */
  order: string[] = [];
  /** currently selected dict ids for search scope; empty = all enabled */
  activeDictIds: Set<string> = new Set();
  store: DataStore | null = null;
  private cache: { get<T>(src: string, key: string): T | null; set(src: string, key: string, value: unknown): void } | null = null;
  lemmaFallback = false;
  /**
   * 模糊回退總開關。此前設定頁的 fuzzyFallback 從未被任何查詢路徑
   * 讀取——MDict 無條件跑模糊、其餘三種格式完全沒有模糊。現在統一由此開關控制。
   */
  fuzzyFallback = true;
  /**
   * 變體容錯：精確未命中時，先用校勘字表把查詢詞正規化再查。
   * 用的是已經打包進 main.js 的 VARIANT_COMMON / ZH_T2S_EXT，零額外體積。
   */
  variantFallback = true;

  setStore(store: DataStore): void {
    this.store = store;
  }

  setCache(cache: NonNullable<DictService['cache']>): void {
    this.cache = cache;
  }

  /** dictionaries sorted by override order (then load order), excluding disabled when filtering */
  get all(): LiDict[] {
    const byId = new Map(this.dicts.map((d) => [d.meta.id, d]));
    const ids = new Set<string>([...this.order, ...this.dicts.map((d) => d.meta.id)]);
    const ordered: LiDict[] = [];
    for (const id of ids) {
      const d = byId.get(id);
      if (!d) continue;
      ordered.push(d);
    }
    if (this.store) {
      const st = this.store;
      ordered.sort((a, b) => {
        const oa = st.getOverride(a.meta.id).order;
        const ob = st.getOverride(b.meta.id).order;
        return oa - ob;
      });
    }
    return ordered;
  }

  /** enabled dictionaries only (respecting overrides) */
  get enabled(): LiDict[] {
    if (!this.store) return this.all;
    return this.all.filter((d) => this.store!.getOverride(d.meta.id).enabled);
  }

  /** dictionaries in current search scope (multi-select; empty selection = all enabled) */
  get scoped(): LiDict[] {
    const pool = this.enabled;
    if (!this.activeDictIds.size) return pool;
    return pool.filter((d) => this.activeDictIds.has(d.meta.id));
  }

  add(dict: LiDict): void {
    this.dicts.push(dict);
    this.order.push(dict.meta.id);
    this.suggestTrees.delete(dict.meta.id);
  }

  remove(id: string): void {
    const d = this.dicts.find((x) => x.meta.id === id);
    // dispose 拋錯不得中斷 dicts 過濾清理（A4）
    try {
      if (d?.dispose) d.dispose();
    } catch {
      /* ignore */
    }
    this.dicts = this.dicts.filter((x) => x.meta.id !== id);
    this.order = this.order.filter((x) => x !== id);
    this.activeDictIds.delete(id);
    this.suggestTrees.delete(id);
  }

  clear(): void {
    for (const d of this.dicts) {
      // dispose 拋錯不得中斷其餘詞典的清理（A4）
      try {
        d.dispose?.();
      } catch {
        /* ignore */
      }
    }
    this.dicts = [];
    this.order = [];
    this.activeDictIds.clear();
    this.suggestTrees.clear();
  }

  get(id: string): LiDict | undefined {
    return this.dicts.find((d) => d.meta.id === id);
  }

  /** display name honoring overrides */
  displayName(d: LiDict): string {
    const o = this.store?.getOverride(d.meta.id);
    return o?.displayName || d.meta.name;
  }

  groupOf(d: LiDict): string {
    return this.store?.getOverride(d.meta.id).group || '';
  }

  isEnabled(d: LiDict): boolean {
    return this.store ? this.store.getOverride(d.meta.id).enabled : true;
  }

  // ----------------------------------------------------------------- lookup

  /** lookupAll 递归深度防护：lemma fallback 链最多 3 层 */
  private lookupDepth = 0;

  /**
   * r54 排查修復：輕量命中計數——僅單層精確 lookup（不走 lemma/變體/模糊三層回退），
   * 供 inline-suggest 擊鍵路徑逐候選詞顯示條目數（原逐詞 lookupAll 全鏈＝擊鍵可感延遲）。
   */
  lookupCount(word: string): number {
    let n = 0;
    for (const d of this.scoped) n += d.lookup(word).length;
    return n;
  }

  lookupAll(word: string, opts?: { deferFallback?: boolean }): Array<LookupHit & { dictOrder: number }> {
    // r54 排查修復：接入 lookup 快取（原 cache 死功能——無任何 get/set 調用，
    // 啟動載入＋回寫 data.json 純 I/O 浪費）。value 存無 bookmarked 的 hits；
    // bookmarked 為時間敏感狀態，命中後每次現算，不落快取。
    if (this.cache) {
      // r59：快取鍵納入搜尋範圍簽章——scoped dict id 排序串接；
      // 範圍（activeDictIds／enabled）變動後同詞頭不會吃到舊範圍的快取值。
      const scopeSig = this.scoped.map((d) => d.meta.id).sort().join(',');
      const cached = this.cache.get<Array<Omit<LookupHit & { dictOrder: number }, "bookmarked">>>("lookupAll", `${word}\u0000${scopeSig}`);
      if (cached) {
        // P1-4a：落盤快取不含 html（序列化時剝離）——html 缺失的快取值視為未命中，
        // 落回正常查詢路徑重建，再用剝離後的值回寫快取。
        if (cached.length && cached.some((h) => !h.html)) {
          // 不 return：繼續走下方正常查詢
        } else {
          return cached.map((h) => ({ ...h, bookmarked: this.store?.isBookmarked(word) || false }));
        }
      }
    }
    const hits: Array<LookupHit & { dictOrder: number }> = [];
    const dicts = this.scoped;
    // 去重：同一部辭典、同一條目相同內容不得重複出現。
    // key＝dictId＋內容——同 dict 內容相同（MDX 同詞頭多 entry / 夾具重複掛載）只保留首條；
    // 不同辭典同名同文屬合理結果，不去重；同 dict 多義項內容不同，不去重。
    const seenContent = new Set<string>();
    for (let i = 0; i < dicts.length; i++) {
      for (const hit of dicts[i].lookup(word)) {
        const contentKey = hit.html ?? '';
        const dedupKey = `${dicts[i].meta.id}\u0000${contentKey}`;
        if (seenContent.has(dedupKey)) continue;
        seenContent.add(dedupKey);
        hits.push({
          ...hit,
          dictName: this.displayName(dicts[i]),
          dictOrder: i,
          bookmarked: this.store?.isBookmarked(word) || false,
        });
      }
    }
    // 變體容錯：放在模糊之前。
    // 異體字／繁簡是「確定性映射」（字表說 廼→乃 就是 乃），
    // 比編輯距離那種「猜拼法」可靠得多，也更便宜，所以先跑它。
    if (!hits.length && this.variantFallback) {
      const varHits = this.lookupVariantAll(word, dicts);
      if (varHits.length) return varHits;
    }

    // 批次丁（UI 執行緒效能）：deferFallback＝快路徑——只跑精確＋變體（確定性映射，便宜），
    // 模糊（BK-tree/編輯距離）與 lemma 遞迴可能凍結數百 ms，改由呼叫端排到 idle 幀異步補充。
    // miss 時不寫快取：value 語義為「最終降級鏈結果」，異步完整鏈查到後再落。
    if (opts?.deferFallback) return [];

    // 模糊回退：四種格式統一的降級鏈，在所有詞典都沒有精確命中時啟動。
    // 放在 lemma 之前——先解決「拼法差異」，再解決「屈折變化」。
    if (!hits.length && this.fuzzyFallback) {
      const fuzzyHits = this.lookupFuzzyAll(word, dicts);
      if (fuzzyHits.length) return fuzzyHits;
    }

    // morphological fallback (lexibridge-inspired): try lemma candidates
    if (!hits.length && this.lemmaFallback && this.lookupDepth < 3) {
      this.lookupDepth++;
      try {
        // 靜態 import（esbuild 打包時 inline 成模組 shim，等價原 require 的延遲載入語意；
        // Obsidian 環境無 Node require，原寫法靠 catch 吞錯，fallback 可能靜默失效）
        for (const lemma of lemmatize(word).slice(0, 3)) {
          const lemmaHits = this.lookupAll(lemma);
          if (lemmaHits.length) {
            for (const h of lemmaHits) h.keyText = `${lemma} → ${h.keyText}`;
            return lemmaHits.map((h) => ({ ...h, dictOrder: h.dictOrder }));
          }
        }
      } catch {
        /* ignore */
      } finally {
        this.lookupDepth--;
      }
    }
    // 主路徑命中寫快取（lemma/變體回退路徑不寫——value 語義為精確命中）。
    // P1-4a 修正：記憶體快取保留完整含 html 的 value（否則同 session 快取永不命中，
    // 每次查詢都全量重建＝快取反而成純開銷）；html 剝離移到 plugin flushCache 落盤
    // 序列化時做——data.json 瘦身目標不變，記憶體命中真正生效。
    // 磁盤還原值（啟動載入 entries）不含 html，lookupAll 讀取路徑的 some(!h.html)
    // 守衛仍會判未命中重建，兩種來源語義皆正確。
    if (hits.length && this.cache) {
      const scopeSig = this.scoped.map((d) => d.meta.id).sort().join(',');
      this.cache.set('lookupAll', `${word}\u0000${scopeSig}`, hits);
    }
    return hits;
  }

  /**
   * 變體容錯回退：把查詢詞按校勘字表正規化成可能的詞頭寫法再查。
   * 命中結果的 keyText 標為「异体 → 實際詞頭」，讓使用者知道這是轉寫後的命中。
   * 跟 lookupFuzzyAll 一樣是「取候選 → 精確查」，不碰詞典內部索引。
   */
  private lookupVariantAll(word: string, dicts: LiDict[]): Array<LookupHit & { dictOrder: number }> {
    let cands: string[];
    try {
      // 靜態 import 見 lookupAll 內 lemma 處註釋；Obsidian 環境無 Node require。
      cands = variantCandidates(word);
    } catch {
      return []; // 字表不可用時靜默略過，不影響正常查詢
    }
    if (!cands.length) return [];
    const out: Array<LookupHit & { dictOrder: number }> = [];
    for (let i = 0; i < dicts.length; i++) {
      for (const cand of cands) {
        for (const hit of dicts[i].lookup(cand)) {
          out.push({
            ...hit,
            keyText: `${cand} ≈ ${hit.keyText}`,
            dictName: this.displayName(dicts[i]),
            dictOrder: i,
            bookmarked: this.store?.isBookmarked(word) || false,
          });
        }
        if (out.length >= 12) return out;
      }
    }
    return out;
  }

  /**
   * 統一模糊回退：對每部詞典跑同一條降級鏈，取候選詞頭後再精確查出內容。
   * 命中結果的 keyText 標為「候選 → 實際詞頭」，讓使用者看得出這是模糊命中。
   */
  private lookupFuzzyAll(word: string, dicts: LiDict[]): Array<LookupHit & { dictOrder: number }> {
    const out: Array<LookupHit & { dictOrder: number }> = [];
    for (let i = 0; i < dicts.length; i++) {
      const d = dicts[i];
      const src = d.headwords?.();
      if (!src) continue;
      let cands: string[];
      try {
        cands = resolveCandidates(src, word, { maxResults: 6 }).map((c) => c.word);
      } catch {
        continue; // 單部詞典的異常不應拖垮整輪查詢
      }
      for (const cand of cands) {
        if (cand === word) continue; // 精確階段已查過
        for (const hit of d.lookup(cand)) {
          out.push({
            ...hit,
            keyText: hit.keyText === cand ? `${cand} ≈ ${hit.keyText}` : hit.keyText,
            dictName: this.displayName(d),
            dictOrder: i,
            bookmarked: this.store?.isBookmarked(word) || false,
          });
        }
        if (out.length >= 12) return out;
      }
    }
    return out;
  }

  prefixAll(word: string, limitPerDict = 15): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const d of this.scoped) {
      for (const w of d.prefix(word, limitPerDict)) {
        const k = w.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(w);
        }
      }
      if (out.length >= 40) break;
    }
    return out;
  }

  /** 批次丁（UI 執行緒效能）：建樹中標誌——防 idle 分幀回調與同步查詢重入。 */
  private buildingTrees = new Set<string>();
  /** idle 建樹排程（requestIdleCallback 句柄，防重複排程） */
  private treeBuildScheduled = false;

  /**
   * 批次丁：把各啟用辭典的 BK-tree 懶建排到 idle 幀（setTimeout 分幀兜底）。
   * 建樹中標誌防重入：idle 回調觸發時若詞典已在建，跳過；同步路徑
   * suggestSimilar 遇 building 標誌直接略過該辭典（本輪無建議，下一輪可用）。
   */
  private scheduleTreeBuild(): void {
    if (this.treeBuildScheduled) return;
    this.treeBuildScheduled = true;
    const build = () => {
      this.treeBuildScheduled = false;
      for (const d of this.enabled) {
        const id = d.meta.id;
        if (this.suggestTrees.has(id) || this.buildingTrees.has(id)) continue;
        const words = d.prefix('', 8000);
        if (!words.length) continue;
        this.buildingTrees.add(id);
        // 建樹本身仍同步（一次 d.prefix + BKTree 構造），但已移出查詢熱路徑所在的幀
        try {
          this.suggestTrees.set(id, { tree: new BKTree(words), words });
        } finally {
          this.buildingTrees.delete(id);
        }
      }
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(build, { timeout: 2000 });
    else window.setTimeout(build, 0);
  }

  /** "Did you mean" suggestions via BK-tree fuzzy match (medict pattern) */
  suggestSimilar(word: string, limit = 8): Array<{ word: string; dictName: string; distance: number }> {
    const out: Array<{ word: string; dictName: string; distance: number }> = [];
    const seen = new Set<string>();
    for (const d of this.enabled) {
      const entry = this.suggestTrees.get(d.meta.id);
      if (!entry) {
        // 批次丁：樹未建好——不再同步建樹（建樹成本移到 idle 幀），
        // 排程後台建樹並跳過本辭典（本輪無該辭典建議，下次查詢即有）。
        this.scheduleTreeBuild();
        continue;
      }
      for (const hit of entry.tree.search(word, 2, limit)) {
        const key = hit.word.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ word: hit.word, dictName: this.displayName(d), distance: hit.distance });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  invalidateSuggestTree(dictId?: string): void {
    if (dictId) this.suggestTrees.delete(dictId);
    else this.suggestTrees.clear();
  }

  // ------------------------------------------------------------ full-text

  fullTextSearch(
    query: string,
    options: Partial<FullTextOptions> = {},
  ): FullTextHandle {
    const dicts = this.scoped;
    return runFullTextSearch(
      dicts.map((d) => d.searchable()),
      query,
      {
        ...options,
        onProgress: options.onProgress,
      },
    );
  }

  // ------------------------------------------------------------- resources

  /** Resolve a resource file across all mdict dictionaries' mdd assets */
  resolveAsset(path: string): ExtractedAsset | null {
    for (const d of this.enabled) {
      const assets = d.meta.assets;
      if (!assets?.length) continue;
      const resolve = createAssetResolver(assets);
      const hit = resolve(path);
      if (hit) return hit;
    }
    return null;
  }

  /** app:// URL for a vault-relative asset path */
  assetUrl(vaultPath: string): string {
    // 資產在 vault 索引內 → getResourcePath 產出可載入的 app:// URL；
    // 不在索引（舊導入/索引未刷新）→ 退回 app://local 相對路徑。
    try {
      const f = this.vault?.getAbstractFileByPath(vaultPath);
      if (f instanceof TFile) return this.vault!.getResourcePath(f);
    } catch { /* fallthrough */ }
    return `app://local/${vaultPath.split('/').map(encodeURIComponent).join('/')}`;
  }
}

// ---------------------------------------------------------------------------
// Adapters from each format reader to LiDict
// ---------------------------------------------------------------------------

export class MdictDict implements LiDict {
  meta: DictMeta;
  private reader: MdictReader;
  private mddReader: MdictReader | null = null;

  constructor(reader: MdictReader, fileName: string, opts?: { mddReader?: MdictReader; assets?: ExtractedAsset[]; mddEntryCount?: number }) {
    this.reader = reader;
    this.mddReader = opts?.mddReader || null;
    // 大辭典卡頓防範：mddReader 持有整份 mdd bytes，本類從不查詢 mdd
    // （資源已提取到 vault）——由 loadMdict 在提取完成後調 dispose() 釋放，大 mdd 不駐留。
    this.meta = {
      id: nextId(),
      // B31：title 佔位/缺失時回退檔名（剝 .mdx 副檔名）
      name: reader.title || fileName.replace(/\.mdx$/i, ''),
      format: 'mdict',
      entryCount: reader.entryCount,
      description: reader.description,
      files: [fileName],
      assets: opts?.assets,
      mddEntryCount: opts?.mddEntryCount,
      lang: pickLang((reader.header as Record<string, string | undefined> | undefined)?.Lang, (reader.header as Record<string, string | undefined> | undefined)?.InputLang),
    };
  }

  private norm(word: string): string {
    return mdictNormalizeKey(word);
  }

  lookup(word: string): LookupHit[] {
    const hits: LookupHit[] = [];
    const exact = this.reader.lookupAll(word);
    for (const h of exact) {
      hits.push({ dictId: this.meta.id, dictName: this.meta.name, keyText: h.keyText, html: h.definition || '' });
    }
    // 精確未命中時不自跑 fuzzy（A7）——由 service.lookupAll 的 variant→fuzzy 統一降級鏈接管
    // （fuzzy 候選經 headwords().normalized → reader.lookupFuzzy，受 fuzzyFallback 開關控制）。
    return hits;
  }

  prefix(word: string, limit = 15): string[] {
    return this.reader.prefix(word, limit);
  }

  searchable(): SearchableDict {
    return new MdictSearch(this.meta.id, this.meta.name, this.reader);
  }

  /** A4：移除辭典時釋放底層 mdict buffer。dispose 內部冪等。 */
  dispose(): void {
    this.reader.dispose?.();
  }

  /** 統一模糊降級鏈的詞頭來源 */
  headwords(): HeadwordSource {
    const reader = this.reader;
    return {
      exact: (w) => reader.lookupAll(w).map((h) => h.keyText),
      caseInsensitive: (w, limit) =>
        reader.lookupAll(w).length
          ? []
          : reader
              .prefix(w, limit * 4)
              .filter((k) => k.toLowerCase() === w.toLowerCase())
              .slice(0, limit),
      normalized: (w, limit) => reader.lookupFuzzy(w).map((h) => h.keyText).slice(0, limit),
      prefix: (w, limit) => reader.prefixNormalized(w, limit),
    };
  }
}



/**
 * TEI Lex-0 辭典（模塊③）——reader 承載索引，
 * 類只做合約翻譯。xr 兩段式：html 內 data-target 由查詢期後處理（本類 lookup 內補連結）。
 */
export class Lex0Dict implements LiDict {
  meta: DictMeta;
  private reader: Lex0Reader;

  constructor(reader: Lex0Reader, fileName: string) {
    this.reader = reader;
    this.meta = {
      id: nextId(),
      name: reader.title,
      format: 'tei-lex0',
      entryCount: reader.entryCount,
      description: reader.meta.description,
      lang: reader.meta.lang,
      files: [fileName],
    };
  }

  lookup(word: string): LookupHit[] {
    return this.reader.lookupAll(word).map((a) => ({
      dictId: this.meta.id,
      dictName: this.meta.name,
      keyText: a.keys[0] || word,
      html: a.html,
    }));
  }

  prefix(word: string, limit = 15): string[] {
    return this.reader.prefix(word, limit);
  }

  searchable(): SearchableDict {
    return new Lex0Search(this.meta.id, this.meta.name, this.reader);
  }

  /** A4：移除辭典時釋放 reader 資源。 */
  dispose(): void {
    this.reader.dispose?.();
  }

  /** 統一模糊降級鏈的詞頭來源（沿 XdxfDict 形態）。 */
  headwords(): HeadwordSource {
    const reader = this.reader;
    const norm = (w: string) => w.toLowerCase().trim();
    // 前綴種子按「碼位字元」取前 3 個——字串 slice(0,3) 會切斷代理對與
    // 組合字元序列（藏文疊加、阿拉伯附加符…），非拉丁查詢的前綴因此失真（過窄無命中
    // 或過寬全表過濾）。
    const prefixSeed = (w: string) => Array.from(norm(w)).slice(0, 3).join('');
    return {
      exact: (w) => reader.lookupAll(w).map((a) => a.keys[0] || w),
      caseInsensitive: (w) => reader.lookupAll(w).map((a) => a.keys[0] || w),
      normalized: (w, limit) =>
        reader
          .prefix(prefixSeed(w), limit * 20)
          .filter((k) => normalizeStardictKey(k) === normalizeStardictKey(w))
          .slice(0, limit),
      prefix: (w, limit) =>
        reader
          .prefix(prefixSeed(w), limit * 20)
          .filter((k) => normalizeStardictKey(k).startsWith(normalizeStardictKey(w)))
          .slice(0, limit),
    };
  }
}


/** dictd entries are plain text; render with light markup */
