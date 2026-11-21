// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — bounded persistent lookup cache.
 * Inspired by phibr0's cache.json (word+lang+source keying) with fixes for its
 * known pitfalls: size cap + LRU-ish eviction + batched writes (it rewrote the
 * whole file per miss and grew unbounded), and dirty-data guards on load.
 */

export interface CacheEntry {
  /** source key, e.g. "etymonline" */
  src: string;
  key: string;
  value: unknown;
  ts: number;
}

const MAX_ENTRIES = 400;

export class LookupCache {
  private map = new Map<string, CacheEntry>();
  private dirty = false;
  /** 緩存變髒時的回調（例如安排落盤），避免 plugin disable 時丟失查詢歷史 */
  private onDirty?: () => void;

  constructor(initial?: CacheEntry[], onDirty?: () => void) {
    this.onDirty = onDirty;
    if (initial) {
      // dirty-data guard: skip malformed entries (dictionary-plus style type guards)
      for (const e of initial) {
        if (e && typeof e.key === 'string' && typeof e.src === 'string' && 'value' in e) {
          this.map.set(this.k(e.src, e.key), e);
        }
      }
    }
  }

  private k(src: string, key: string): string {
    return `${src}::${key.toLowerCase()}`;
  }

  get<T>(src: string, key: string): T | null {
    const kk = this.k(src, key);
    const e = this.map.get(kk);
    if (!e) return null;
    // refresh recency
    this.map.delete(kk);
    e.ts = Date.now();
    this.map.set(kk, e);
    // r59 批次乙：命中也算變髒——ts（recency）被更新，不標髒則 LRU 順序
    // 不落盤，重啟後淘汰順序失真
    this.dirty = true;
    this.onDirty?.();
    return e.value as T;
  }

  set(src: string, key: string, value: unknown): void {
    const kk = this.k(src, key);
    this.map.delete(kk);
    this.map.set(kk, { src, key, value, ts: Date.now() });
    // evict oldest when over cap (true LRU-ish, fixes phibr0's unbounded growth)
    while (this.map.size > MAX_ENTRIES) {
      const oldestKey: string | undefined = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.map.delete(oldestKey);
    }
    this.dirty = true;
    this.onDirty?.();
  }

  isDirty(): boolean {
    return this.dirty;
  }

  markClean(): void {
    this.dirty = false;
  }

  entries(): CacheEntry[] {
    return Array.from(this.map.values());
  }

  clear(): void {
    this.map.clear();
    this.dirty = true;
    this.onDirty?.();
  }

  get size(): number {
    return this.map.size;
  }
}
