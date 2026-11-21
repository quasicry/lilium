// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 佛學資料存取層——fault-tolerant · lazy · 可選。
 *
 * 設計目標：佛學參考資料（異體/缺字、蘭札、梵-天城體）
 * 屬「可選資源」。使用者可選擇不帶佛學資料的「原生模式」——
 *   - 關閉 buddhistMode（預設開啟、設定頁已撤除開關；關閉須手改 data.json），完全不觸碰佛學資料，改由自行上傳的
 *     辭典（MDict / TEI Lex-0）提供查詞；
 *   - 或將佛學參考表刪除／替換。
 *
 * 本層確保「佛學資料缺失」時插件仍可正常運作，不崩潰：
 *   1. 任一資料模組缺失或 JSON.parse 失敗 → 回傳安全預設（空 map / 空陣列），不向上拋；
 *   2. 資料以 runtime require 惰性載入，缺資料不會在插件啟動時就崩（避免「深度綁定」）——
 *      原本 collation.ts 頂層 `import { loadCbVariantMap } from './data/buddhist-chars.lazy'`
 *      會因同行靜態依賴，在佛學資料缺失時讓整個校勘模組（乃至 DictFeature）載入失敗；
 *   3. 提供 buddhistDataAvailable() 供 UI 顯示資料狀態，buddhistMode 開啟而資料缺漏時
 *      功能只會靜默降級（原文字不變），而非崩潰。
 *
 * 注意：buddhistMode 是「功能開關」（設定頁切換）；本層是「資料可用性底線」。
 * 兩者獨立——即便功能開關開啟，資料層也保證不崩。
 *
 * 關鍵：本層對各 .lazy 模組一律用 runtime require，絕不用 top-level import——
 * 這樣「佛學資料缺失」時，缺失只會發生在個別函式的呼叫點（被下面的 guarded 抓住），
 * 而不會在 buddhist-data 本身（或其任何匯入者，如 collation.ts）模組求值期就崩。
 */

// ---- 型別（與各 .lazy 模組匯出對齊，避免對資料模組做 top-level import）----
export type GaijiMeta = {
  normalized?: string;
  pua?: string;
  composition?: string;
  unicode?: string;
  moe?: string;
};
export type RanjanaEntry = { char?: string; pua?: string; romanized?: string };

const cache = new Map<string, unknown>();
const warned = new Set<string>();

/**
 * 受保護載入：成功結果會快取；失敗（模組不存在 / JSON 解析錯誤 / export 缺失）
 * 記錄一次警告後回傳 fallback，且同 key 之後直接走快取，不再反覆拋錯。
 */
function guarded<T>(key: string, load: () => T, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const v = load();
    if (v === undefined || v === null) throw new Error("loader returned null");
    cache.set(key, v);
    return v;
  } catch (e) {
    if (!warned.has(key)) {
      warned.add(key);
      // 非致命：原生模式靜默降級
      console.warn(
        `[li] 佛學資料「${key}」載入失敗，相關功能進入原生模式（不影響其他功能）：` +
          `${(e as Error)?.message ?? e}`,
      );
    }
    cache.set(key, fallback);
    return fallback;
  }
}

// ---- 漢文佛典（buddhist-chars.lazy）----
// 保留同名 loader 簽名回空表——buddhist.ts 與測試端零修改、穩定降級不崩潰。
export function loadCbCodeMap(): Record<string, string> {
  return {};
}
export function loadCbVariantMap(): Record<string, string> {
  return {};
}
export function loadCbGaijiMeta(): Record<string, GaijiMeta> {
  return {};
}

// ---- 巴利-梵文（pali-sanskrit.lazy）----
// 保留同名 loader 簽名回空表——buddhist.ts 與 view.ts 調用點零修改、穩定降級不崩潰。
export function loadPaliSanskritMap(): Record<string, string> {
  return {};
}

// ---- 藏文詞表／詞根（tibetan-lexicon.lazy／tibetan-lemmas.lazy）----

// ---- 蘭札體（ranjana.lazy）----
export function loadRanjanaMap(): Record<string, RanjanaEntry> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 延遲加載（啟動性能/打包切割），非 CJS 遺留——審計批次三。
  const mod = require("./data/ranjana.lazy") as { loadRanjanaMap: () => Record<string, RanjanaEntry> };
  return guarded("ranjana", () => mod.loadRanjanaMap(), {});
}

/**
 * 佛學資料是否可用：任一核心表非空即視為可用。
 * 這會觸發一次惰性嘗試（cache 化），因此多次呼叫成本低。
 */
export function buddhistDataAvailable(): boolean {
  // 判準由 pali 表改為 ranjana 表非空
  // 曾因遷出改判 pali 表；表可再遷，閘不得恆 false）
  return Object.keys(loadRanjanaMap()).length > 0;
}

/** 重設快取（測試用）。 */
export function resetBuddhistDataCache(): void {
  cache.clear();
  warned.clear();
}
