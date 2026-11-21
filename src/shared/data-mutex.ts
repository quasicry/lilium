// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * data.json 讀-改-寫串行化（融合後必備）。
 *
 * 背景：lilium 與辭典模組（DictFeature）共用同一份 data.json，各自持有專屬命名空間：
 *   - lilium 核心：            `vw`
 *   - lilium 辭典設定：        `dict`
 *   - lilium 辭典資料儲存：    `dictStore`
 *   - lilium 辭典查詞快取：    `dictLookupCache`
 *
 * 若四個寫者各自 `loadData()` → 改 → `saveData()`，併發時會互相覆寫：
 * 後寫者拿到的是過期快照，寫回時把先寫者的結果抹掉。
 * 典型症狀：改完設定立刻查詞，設定被回滾；或導入詞典後查詞快取整批丟失。
 *
 * 解法：用一條 Promise 鏈把所有讀-改-寫串行化，保證任一寫者看到的都是最新狀態。
 */

export interface DataHost {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

export type RawData = Record<string, unknown>;

export class DataMutex {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private host: DataHost) {}

  /**
   * 在互斥區內對 data.json 進行讀-改-寫。
   * `fn` 收到最新快照；回傳值原樣透出。
   */
  async transaction<T>(fn: (raw: RawData) => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const loaded = await this.host.loadData();
      const raw: RawData =
        loaded && typeof loaded === "object" && !Array.isArray(loaded)
          ? (loaded as RawData)
          : {};
      return fn(raw);
    });
    // 單筆事務失敗不得卡死佇列（否則後續所有寫入永久 pending）
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /** 讀-改-寫並自動回存。`save=false` 時只讀不寫。 */
  async mutate<T>(fn: (raw: RawData) => Promise<T> | T, save = true): Promise<T> {
    return this.transaction(async (raw) => {
      const out = await fn(raw);
      if (save) await this.host.saveData(raw);
      return out;
    });
  }

  /** 只讀一份快照（仍經互斥，避免讀到寫入中途的狀態）。 */
  async read(): Promise<RawData> {
    return this.transaction((raw) => raw);
  }
}
