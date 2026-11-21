// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 字體 GSUB 特徵表讀取/ 計劃 B1-7
 * ===================================================================
 *
 * 為什麼要有這個模組
 * -------------------------------------------------------------------
 * B1-7 之前，`vert` 能力的判定是**族名子串白名單**
 * （`font-metrics.ts` 的 `VERT_CAPABLE_MARKS`，30 條）。那套做法有兩個繞不過去的缺陷：
 *
 *  1. **假陰性**：名單外的字體一律判「不具備」。用戶導入了霞鶩文楷、方正書宋、
 *     任何一款新出的 CJK 字體 → 判否 → 觸發 `.li-punct` 幾何居中兜底。
 *     兜底本身是安全的降級，但它是**猜**出來的，不是量出來的。
 *  2. **與事實無關**：白名單比對的是「字體叫什麼」，不是「字體能做什麼」。
 *     字體檔自己寫得清清楚楚它有哪些 features，我們卻去問它的名字。
 *
 * GSUB 的 FeatureList 就是那個「寫得清清楚楚」的地方。**讀它 = 確定的**：
 * FeatureList 裡有 `vert` 這條記錄，且它的 Feature table 有 ≥1 個 lookup，
 * 就表示這款字體真的會做直排字形替換。
 *
 * -------------------------------------------------------------------
 * 為什麼讀到 FeatureList 就夠，不必往下解 Lookup
 * -------------------------------------------------------------------
 * GSUB 的完整結構是 ScriptList → FeatureList → LookupList 三層。
 * 「能力判定」只需要回答「有沒有這個 feature 而且它有作用」，也就是：
 *
 *   FeatureRecord.FeatureTag === 'vert'   （宣告了）
 *   && Feature.lookupCount > 0            （有 lookup，不是空殼）
 *
 * Lookup 內部到底怎麼替換字形，對「要不要開幾何居中兜底」沒有任何影響 ——
 * 那是渲染引擎的事。往下解 LookupType 1–8 只會換來一堆用不到的狀態和
 * 更多崩潰面。本模組刻意停在這裡。
 *
 * -------------------------------------------------------------------
 * 同一個 tag 會重複出現，這是正常的
 * -------------------------------------------------------------------
 * 實測 Noto Serif CJK Regular 的 FeatureList 有 **631 條** FeatureRecord，
 * 其中 `vert` 出現 34 次、`vrt2` 出現 37 次（分別掛在不同 script/language 下）。
 * 所以：
 *  · `tags` 是**去重後**的集合，供診斷與後續批次（B3-3 的 `vkrn`/`vpal` 等）使用；
 *  · `vert` / `vrt2` 用 **any** 語義：任一筆 record 有 lookup 即為真。
 *
 * -------------------------------------------------------------------
 * 回傳契約（與 font-cmap.ts 刻意一致）
 * -------------------------------------------------------------------
 *  · `null`      = 判斷不了（容器不支援 / 表缺失 / 需異步解壓 / 結構異常）
 *  · FontFeatures = 判斷得了（`vert: false` 是**確定沒有**，不是「不知道」）
 *
 * 呼叫端必須保留白名單降級路徑 —— 因為**系統字體讀不到二進位**
 * （瀏覽器沒有 Local Font Access API），本模組只對 vault 內的用戶導入字體生效。
 */

import { asBytes, detectFontContainer, inflateIfNeeded, readSfntDirectory, sliceTable } from "./font-name";

/* ------------------------------------------------------------------ */
/* 二進位讀取（帶邊界保護）                                              */
/* ------------------------------------------------------------------ */

function u8(b: Uint8Array, o: number): number {
  return o >= 0 && o < b.length ? b[o] : 0;
}

function u16(b: Uint8Array, o: number): number {
  return ((u8(b, o) << 8) | u8(b, o + 1)) & 0xffff;
}

/** FeatureRecord 數量上限。真實字體最多數百條；超過多半是結構異常 */
const MAX_FEATURE_RECORDS = 4096;

/**
 * 讀 4 位元組 tag。
 *
 * OpenType tag 是 ASCII 可列印字元（0x20–0x7E）。**超出範圍一律當作非法** ——
 * 病態字體常常讓你在這裡讀到全是 0x00 的垃圾，若不擋，髒 tag 會混進 `tags`
 * 集合，而 `vert` 這種精確比對的欄位不受影響，**髒 tag 反而更難被發現**。
 */
function readTag(b: Uint8Array, o: number): string | null {
  if (o + 4 > b.length) return null;
  let s = "";
  for (let i = 0; i < 4; i++) {
    const c = b[o + i];
    if (c < 0x20 || c > 0x7e) return null;
    s += String.fromCharCode(c);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* 型別                                                                */
/* ------------------------------------------------------------------ */

export interface FontFeatures {
  /** 去重後的 feature tag，按 FeatureList 出現順序 */
  readonly tags: readonly string[];
  /** 宣告了 `vert` 且至少有一個 lookup */
  readonly vert: boolean;
  /** 宣告了 `vrt2` 且至少有一個 lookup（vrt2 是 MS 規範的直排第二形態，B3-2 用得上） */
  readonly vrt2: boolean;
  /** FeatureRecord 總數（純診斷：設定頁要解釋「為什麼判它不支援」時用） */
  readonly records: number;
}

/* ------------------------------------------------------------------ */
/* FeatureList 解析                                                     */
/* ------------------------------------------------------------------ */

interface RawFeatures {
  tags: string[];
  vert: boolean;
  vrt2: boolean;
  records: number;
}

/**
 * GSUB heading 佈局（Offset16 皆**相對 GSUB 表起點**）：
 *
 *   uint16 majorVersion
 *   uint16 minorVersion
 *   uint16 scriptListOffset      ← offset 4
 *   uint16 featureListOffset     ← offset 6
 *   uint16 lookupListOffset      ← offset 8
 *   （minorVersion >= 1 時尾部還有 uint32 featureVariationsOffset，本模組不需要）
 *
 * FeatureList：
 *   uint16 featureCount
 *   FeatureRecord[featureCount]：
 *     Tag      featureTag         （4 bytes）
 *     Offset16 featureTableOffset （**相對 FeatureList 起點**，不是 GSUB 起點）
 *
 * Feature table：
 *   Offset16 featureParamsOffset
 *   uint16   lookupCount          ← 這裡！= 0 表示這條 feature 是空殼
 *   uint16   lookupListIndices[lookupCount]
 *
 * ⚠️ 兩層 offset 的基準不同（GSUB / FeatureList），寫反了不會報錯，
 *    只會靜默讀到別人的位元組 —— 這正是為什麼下面每一步都做邊界檢查。
 */
function parseFeatureList(gsub: Uint8Array): RawFeatures | null {
  if (gsub.length < 10) return null;
  const featureListOffset = u16(gsub, 6);
  if (featureListOffset === 0 || featureListOffset + 2 > gsub.length) return null;

  const featureCount = u16(gsub, featureListOffset);
  if (featureCount === 0) {
    // 真的完全沒有 feature —— 這是確定的空結果，不是錯誤
    return { tags: [], vert: false, vrt2: false, records: 0 };
  }
  // 病態宣告：寧可只看前 N 條也不要空轉。**不全盤放棄**是因為前面幾條通常仍有效。
  const n = Math.min(featureCount, MAX_FEATURE_RECORDS);

  const tags: string[] = [];
  const seen = new Set<string>();
  let vert = false;
  let vrt2 = false;

  for (let i = 0; i < n; i++) {
    const rec = featureListOffset + 2 + i * 6;
    if (rec + 6 > gsub.length) break;
    const tag = readTag(gsub, rec);
    if (tag === null) continue;
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
    const featOffset = u16(gsub, rec + 4);
    const feat = featureListOffset + featOffset;
    // Feature table 至少要有 featureParamsOffset + lookupCount 兩個 u16
    if (feat + 4 > gsub.length) continue;
    const lookupCount = u16(gsub, feat + 2);
    if (lookupCount === 0) continue; // 宣告了但沒作用 = 空殼，不算具備
    if (tag === "vert") vert = true;
    else if (tag === "vrt2") vrt2 = true;
  }

  return { tags, vert, vrt2, records: featureCount };
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

/** WOFF 的表是否被壓縮（與 font-cmap.ts 同一份邏輯） */
function needsInflate(entry: { compLength: number; length: number }): boolean {
  return entry.length > 0 && entry.compLength < entry.length;
}

function parseGsubTable(table: Uint8Array): FontFeatures | null {
  try {
    return parseFeatureList(table);
  } catch {
    return null;
  }
}

/**
 * 同步讀取字體的 OpenType layout features。
 *
 * @returns FontFeatures；null = 判斷不了（呼叫端應降級到白名單，**不可**當成「不支援」）
 */
export function readFontFeaturesSync(data: Uint8Array | ArrayBuffer): FontFeatures | null {
  try {
    const b = asBytes(data);
    const kind = detectFontContainer(b);
    if (kind === "woff2" || kind === "unknown") return null;
    const dir = readSfntDirectory(b);
    const entry = dir.tables.find((t) => t.tag === "GSUB");
    if (!entry) return null;
    // WOFF 壓縮表沒有同步解法，寧可不給答案也不冒險（異步版可處理）
    if (needsInflate(entry)) return null;
    return parseGsubTable(sliceTable(b, entry));
  } catch {
    return null;
  }
}

/** 異步版：多處理「WOFF 壓縮表」這一類需要解壓的情況 */
export async function readFontFeatures(data: Uint8Array | ArrayBuffer): Promise<FontFeatures | null> {
  try {
    const b = asBytes(data);
    const kind = detectFontContainer(b);
    if (kind === "woff2" || kind === "unknown") return null;
    const dir = readSfntDirectory(b);
    const entry = dir.tables.find((t) => t.tag === "GSUB");
    if (!entry) return null;
    let table = sliceTable(b, entry);
    if (needsInflate(entry)) {
      const inflated = await inflateIfNeeded(table);
      if (!inflated) return null;
      table = inflated;
    }
    return parseGsubTable(table);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 查詢                                                                */
/* ------------------------------------------------------------------ */

/**
 * 是否具備直排字形替換能力（`vert` 或 `vrt2` 任一）。
 *
 * 注意 null 的語義：`hasVertFeature(null)` 回傳 **false**，但那是「我們不知道」，
 * 呼叫端必須能區分這兩種 false —— 見 `font-metrics.ts` 的 `vertCapability()`。
 */
export function hasVertFeature(f: FontFeatures | null): boolean {
  return f !== null && (f.vert || f.vrt2);
}

/** 是否同時具備 `vrt2`（B3-2「導出專用 vrt2」需要這個判定） */
export function hasVrt2Feature(f: FontFeatures | null): boolean {
  return f !== null && f.vrt2;
}
