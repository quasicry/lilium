// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — persistent stores: bookmarks, history, groups,
 * per-dictionary overrides (order / enabled / display name / group).
 * Stored in plugin data.json via the adapter below.
 */

export interface BookmarkItem {
  word: string;
  dictId?: string;
  note?: string;
  createdAt: number;
}

export interface HistoryItem {
  word: string;
  ts: number;
  /** number of hits when looked up */
  hits: number;
}

export interface DictOverride {
  /** display order (lower first) */
  order: number;
  enabled: boolean;
  /** optional user-renamed display name */
  displayName?: string;
  /** group name for classification, '' = ungrouped */
  group: string;
}

export interface StoreShape {
  bookmarks: BookmarkItem[];
  history: HistoryItem[];
  dictOverrides: Record<string, DictOverride>;
  groups: string[];
  /**
   * 辭典 id 索引：`"<format>|<小寫基名>" → 當前的穩定 id`。
   *
   * 用途：早期版本對隨機 id 辭典用的是 `dict-<時間戳>-<計數>` 這種隨機 id，
   * 重掃就換一批，舊設定根本無法從新 id 反推。記下「基名 → 上次實際用過的 id」，
   * 下次重掃就能把舊 override 搬到新的穩定 id 上，使用者不會莫名丟設定。
   */
  dictIdIndex?: Record<string, string>;
}

export const DEFAULT_STORE: StoreShape = {
  bookmarks: [],
  history: [],
  dictOverrides: {},
  groups: [],
  dictIdIndex: {},
};

export interface StoreAdapter {
  load(): Promise<StoreShape>;
  save(data: StoreShape): Promise<void>;
  /**
   * 鏡像備份（可選）：每次落盤後把整份 StoreShape 寫到 vault 內、插件目錄之外的檔案。
   * 背景：Obsidian 更新插件＝刪除插件資料夾重裝，data.json 隨之被刪——書籤/歷史/分組
   * 會全部清空。鏡像檔在插件目錄之外，可跨更新存活；init() 時檢測空檔自動恢復。
   */
  backup?(data: StoreShape): Promise<void>;
  /** 讀回鏡像備份（可選）；無備份檔或讀取失敗回 null。 */
  readBackup?(): Promise<StoreShape | null>;
}

/** 遞迴深拷貝；structuredClone 在舊版 iOS（15.0–15.3）不存在，以此降級。 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    out[key] = deepClone(obj[key]);
  }
  return out as T;
}

/** In-memory + async-persist adapter (wire to obsidian plugin.saveData) */
export class DataStore {
  data: StoreShape = deepClone(DEFAULT_STORE);

  constructor(private adapter: StoreAdapter) {}

  async init(): Promise<void> {
    const loaded = await this.adapter.load();
    this.data = Object.assign(deepClone(DEFAULT_STORE), loaded);
    // 舊資料沒有 dictIdIndex（可選欄位），補上以免後續寫入撞 undefined
    if (!this.data.dictIdIndex) this.data.dictIdIndex = {};
  }

  /** 外部改動 data 後要求落盤（穩定 id 遷移後用）。 */
  async flush(): Promise<void> {
    await this.persist();
  }

  /**
   * 更新插件數據保護：主 store 四區（bookmarks/history/groups/dictOverrides）全空
   * 且鏈接了鏡像備份時，從備份恢復（保守：僅空檔恢復，絕不覆蓋非空數據）。
   * 回傳恢復摘要；null＝無備份或未空檔，不恢復。
   */
  async tryRestoreFromBackup(): Promise<{ b: number; h: number; g: number; o: number } | null> {
    const d = this.data;
    const isEmpty = d.bookmarks.length === 0 && d.history.length === 0
      && d.groups.length === 0 && Object.keys(d.dictOverrides).length === 0;
    if (!isEmpty || !this.adapter.readBackup) return null;
    const bak = await this.adapter.readBackup();
    if (!bak || !(bak.bookmarks.length || bak.history.length || bak.groups.length
      || Object.keys(bak.dictOverrides).length)) return null;
    // deepClone——原 Object.assign(d, bak) 直接引用 bak 的陣列/物件，
    // this.data 與備份讀回值共享引用，後續對 bookmarks 等的原地變更會污染備份來源
    this.data = Object.assign(d, deepClone(bak));
    if (!this.data.dictIdIndex) this.data.dictIdIndex = {};
    await this.persist();
    return {
      b: bak.bookmarks.length, h: bak.history.length,
      g: bak.groups.length, o: Object.keys(bak.dictOverrides).length,
    };
  }

  /** A4：persist 改為 promise 接續鏈——保存中到達的呼叫排入鏈尾依次執行，
   * 每次 save 用的都是「排隊當下」的 this.data 快照；併發寫入不再與進行中的
   * save 並發（舊實作：旗標在 await 前清掉，第三筆可與第一筆 save 並發、
   * 後寫者持舊快照覆蓋）。呼叫方 await persist() 即真正落盤完成。 */
  private persistChain: Promise<void> = Promise.resolve();
  private async persist(): Promise<void> {
    const run = this.persistChain.then(async () => {
      await this.adapter.save(this.data);
      // 鏡像備份（可選，失敗靜默——備份永遠不得拖垮主路徑）
      try {
        await this.adapter.backup?.(this.data);
      } catch { /* 備份失敗不影響主數據 */ }
    });
    this.persistChain = run.catch(() => { /* 單次失敗不斷鏈，後續寫入照常 */ });
    await run;
  }

  // ------------------------------------------------------------- bookmarks

  isBookmarked(word: string): boolean {
    return this.data.bookmarks.some((b) => b.word === word);
  }

  async addBookmark(word: string, dictId?: string, note?: string): Promise<void> {
    if (this.isBookmarked(word)) return;
    this.data.bookmarks.unshift({ word, dictId, note, createdAt: Date.now() });
    await this.persist();
  }

  async removeBookmark(word: string): Promise<void> {
    this.data.bookmarks = this.data.bookmarks.filter((b) => b.word !== word);
    await this.persist();
  }

  async toggleBookmark(word: string, dictId?: string): Promise<boolean> {
    if (this.isBookmarked(word)) {
      await this.removeBookmark(word);
      return false;
    }
    await this.addBookmark(word, dictId);
    return true;
  }

  // --------------------------------------------------------------- history

  async pushHistory(word: string, hits: number, limit = 100): Promise<void> {
    this.data.history = this.data.history.filter((h) => h.word !== word);
    this.data.history.unshift({ word, ts: Date.now(), hits });
    if (this.data.history.length > limit) this.data.history.length = limit;
    await this.persist();
  }

  async clearHistory(): Promise<void> {
    this.data.history = [];
    await this.persist();
  }

  searchHistory(q: string): HistoryItem[] {
    const lower = q.toLowerCase();
    return this.data.history.filter((h) => h.word.toLowerCase().includes(lower));
  }

  // ------------------------------------------------- dictionary overrides

  /** B4：讀路徑去寫副作用——miss 時只生成臨時預設（Date.now() 僅一次、不寫入
   * this.data），隨後的 setOverride 仍經 getOverride 拿到同一份預設再落盤，
   * 語義不變；唯讀流程（列舉/渲染）不再靜默污染記憶體狀態。 */
  getOverride(id: string): DictOverride {
    let o = this.data.dictOverrides[id];
    if (!o) {
      o = { order: Date.now(), enabled: true, group: '' };
      // 延遲落盤：暫存預設供 setOverride（真寫路徑）收斂；唯讀呼叫不持久化。
      this.pendingDefaults.set(id, o);
    }
    return o;
  }

  /** getOverride 生成但尚未落盤的臨時預設（B4：讀路徑零副作用承載）。 */
  private pendingDefaults = new Map<string, DictOverride>();

  async setOverride(id: string, patch: Partial<DictOverride>): Promise<void> {
    // B4：真寫路徑才把臨時預設（若有）寫入 this.data，再套 patch。
    const pending = this.pendingDefaults.get(id);
    if (pending && !this.data.dictOverrides[id]) this.data.dictOverrides[id] = pending;
    this.pendingDefaults.delete(id);
    // 首次寫入時確保 dictOverrides[id] 有一份可變物件（getOverride 只回臨時預設、
    // 不落 this.data）——直接在 this.data 建立並 Object.assign，避免 patch 寫到
    // 臨時物件上而真正落盤的 dictOverrides 仍是空（測試 dict-import-flow 暴露的丟設定 bug）。
    const o = (this.data.dictOverrides[id] ||= { order: Date.now(), enabled: true, group: '' });
    Object.assign(o, patch);
    await this.persist();
  }

  async removeOverride(id: string): Promise<void> {
    delete this.data.dictOverrides[id];
    await this.persist();
  }

  // ---------------------------------------------------------------- groups

  async addGroup(name: string): Promise<void> {
    if (!name.trim()) return;
    if (!this.data.groups.includes(name)) {
      this.data.groups.push(name);
      await this.persist();
    }
  }

  async removeGroup(name: string): Promise<void> {
    this.data.groups = this.data.groups.filter((g) => g !== name);
    // unassign dicts in that group
    for (const id of Object.keys(this.data.dictOverrides)) {
      if (this.data.dictOverrides[id].group === name) {
        this.data.dictOverrides[id].group = '';
      }
    }
    await this.persist();
  }

  // 分組重命名（管理面板操作路徑）——舊組成員一併遷移到新名
  async renameGroup(oldName: string, newName: string): Promise<void> {
    const next = newName.trim();
    if (!next || next === oldName || !this.data.groups.includes(oldName)) return;
    if (this.data.groups.includes(next)) {
      // 新名已存在：視為合併——舊組從清單移除，成員歸入新組
      this.data.groups = this.data.groups.filter((g) => g !== oldName);
    } else {
      this.data.groups = this.data.groups.map((g) => (g === oldName ? next : g));
    }
    for (const id of Object.keys(this.data.dictOverrides)) {
      if (this.data.dictOverrides[id].group === oldName) {
        this.data.dictOverrides[id].group = next;
      }
    }
    await this.persist();
  }

  // 單辭典移動分組（group 為空字串＝未分組）
  async setDictGroup(id: string, group: string): Promise<void> {
    const ov = this.data.dictOverrides[id] ?? {};
    ov.group = group;
    this.data.dictOverrides[id] = ov;
    if (group && !this.data.groups.includes(group)) {
      this.data.groups.push(group);
    }
    await this.persist();
  }
}
