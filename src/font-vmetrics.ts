// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 字體縱向度量讀取（`vmtx` / `VORG`）
 * ===================================================================
 *
 * 為什麼要有這個模組
 * -------------------------------------------------------------------
 * 以前，lilium 完全不知道字體的縱向度量：
 *  · 直排步進靠 `font-metrics.ts` 的 `measureVerticalAdvanceEm()` ——
 *    插一個隱藏 `div`、塞重複文字、用 `getBoundingClientRect()` 除回來；
 *  · VORG（縱向原點偏移）**全樹零實作**，連常數都沒有。
 *
 * DOM 度量有兩個硬傷：
 *  1. **離不開瀏覽器**：Node 側（導出序列化、單測、CI）完全拿不到值；
 *  2. **不確定**：量到的數字混了 `line-height`、子像素、瀏覽器自己的 fallback
 *     字體行為，同一款字體在不同引擎上可能給出不同答案。
 *
 * 直接讀 `vmtx` / `VORG` 則是**確定的**：字體檔自己寫著自己的度量。
 *
 * -------------------------------------------------------------------
 * 精度取捨：為什麼是聚合值，不是逐字值
 * -------------------------------------------------------------------
 * vmtx 逐**字形**（glyphId）存一份步進，要查「某個字」的步進得先從 cmap
 * 拿到 glyphId —— 但 `font-cmap.ts` 目前只回答「碼位在不在覆蓋範圍內」
 * （一組區間），**不保留 glyphId**。為逐字值去擴充它，得再寫一條 cmap
 * 解析路徑，收益卻很小：CJK 直排是等寬的，實測 Noto Serif CJK 的 65,063 條
 * `vmtx` 記錄**全表同值**（1000/1000 = 1.0em）。
 *
 * 所以本模組取 **眾數（mode）**：整表掃一遍，出現次數最多的步進值即代表這款
 * 字體的直排步進。並額外回傳 `uniform`（min === max）作為「眾數可不可信」的
 * 指標 —— 中日韓混排比例拉丁時它會是 false，呼叫端可自行決定要不要降級。
 *
 * -------------------------------------------------------------------
 * VORG 表頭定案
 * -------------------------------------------------------------------
 * ⚠️ **此處曾有一段錯誤記載，已更正，勿再沿用。** 舊註解稱「OpenType 規範的
 * `numVertOriginYMetrics` 是 u32、表頭 10 字節」，並由此推論「per-glyph 數組
 * 起點在 offset 8 還是 10 有實務歧義」——**那是誤讀規範，歧義並不存在**。
 *
 * 三方證據一致指向表頭 8 字節：
 *   1. **規範**：Microsoft OpenType 1.9.1 · VORG 明定
 *      `uint16 majorVersion / uint16 minorVersion / int16 defaultVertOriginY /
 *       uint16 numVertOriginYMetrics`，其後為
 *      `VertOriginYMetrics[] { uint16 glyphIndex; int16 vertOriginY; }`（每條 4 字節）。
 *   2. **工業實現**：fontTools 4.61.1 `table_V_O_R_G_.decompile` 即
 *      `struct.unpack(">HHhH", data[:8])` 後 `data = data[8:]`，逐條 `">Hh"`。
 *   3. **實測**：Source Han Serif SC Regular（CFF 輪廓）VORG 表長 1000 字節 ——
 *      `8 + 248 × 4 = 1000` ＝ 表長 ✓；依 10 字節解則 count = 16,253,665（荒謬）。
 *      逐條 glyphIndex 737 → 65054 **嚴格單調遞增** ✓（規範要求按 glyphIndex 排序）。
 *      （與卷內舊註解留下的位元組 `00 01 | 00 00 | 03 70 | 00 f8 | 02 e1 03 5a …`
 *        逐位元組吻合：880 / 248 / 首條 (737,858)。）
 *
 * → **定案：表頭 8 字節，count 為 uint16，覆蓋數組自 offset 8 起、每條 4 字節。**
 *   `defaultVertOriginY`（offset 4 的 int16）兩種解讀一致，故既有行為不受影響。
 *
 * 另一條規範約束（舊註解完全沒提，本次一併補上）：
 *   「VORG **僅適用 CFF / CFF2 輪廓**字體；含 TrueType `glyf` 輪廓時**必須忽略**。」
 *   實作採**負向閘門**——只在能明確判定為 TrueType（有 `glyf` 且無 `CFF `/`CFF2`）
 *   時才排除；目錄未提供輪廓資訊時**不臆測**、維持適用，避免無謂降級。
 *   另：陣列中缺席的字形應回落 `defaultVertOriginY`（尺寸最佳化實作會省略等值項）。
 *
 * -------------------------------------------------------------------
 * 三級降級（本模組只負責第一級）
 * -------------------------------------------------------------------
 *   1. 本模組：字體二進位裡的 vmtx / VORG（確定值，但需要「字節在手」）
 *   2. `font-metrics.ts`：DOM 度量（系統字體、或本模組回 null 時）
 *   3. `SCRIPT_PITCH_TARGET_EM`：各文種目標節距（兜底 1.0em）
 *
 * @returns 回傳契約同 font-cmap / font-gsub：
 *          `null` = 判斷不了（呼叫端降級，**不可**當成「沒有」）
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

/** topSideBearing / vertOriginY 都是有號數 */
function i16(b: Uint8Array, o: number): number {
  const v = u16(b, o);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/* ------------------------------------------------------------------ */
/* 型別                                                                */
/* ------------------------------------------------------------------ */

/**
 * VORG 的 per-glyph 覆蓋條目（解析後）。
 * 陣列依規範按 `glyphIndex` **遞增**排列，故可用二分查找。
 */
export interface VorgOverride {
  readonly glyphIndex: number;
  /** vertOriginY，**font units**（未除 unitsPerEm；換算統一交給查詢端） */
  readonly vertOriginY: number;
}

export interface FontVerticalMetrics {
  /** head.unitsPerEm —— 所有 em 換算的分母 */
  readonly unitsPerEm: number;
  /** 字體是否帶 vmtx 表 */
  readonly hasVmtx: boolean;
  /**
   * vmtx **眾數**步進（em）。
   * null = 有 vmtx 但讀不出可用記錄（如 unitsPerEm 非法、vmtx 為空）。
   */
  readonly advanceEm: number | null;
  /**
   * 全表步進是否一致。false 表示這是混寬字體（如含比例拉丁），
   * 眾數只是「出現最多的那個值」，不代表每個字都如此。
   */
  readonly uniform: boolean;
  /**
   * 字體是否帶**可用**的 VORG 表。
   * 注意：TrueType（`glyf`）輪廓字體即使帶 VORG，依規範也必須忽略 → 此處為 false。
   */
  readonly hasVorg: boolean;
  /** VORG defaultVertOriginY（em）；沒有 VORG 時為 null */
  readonly vorgDefaultOriginYEm: number | null;
  /**
   * VORG 的 per-glyph 覆蓋表（已按 glyphIndex 遞增）。
   * `null` = VORG 不存在／表過短／長度不自洽／被 TrueType 閘門排除 —— 一律視為
   * 「判斷不了」，呼叫端應降級，**不可**當成「這款字體沒有逐字覆蓋」。
   * 空陣列 `[]` 則是確定讀到「有 VORG 但零條覆蓋」（全表共用 defaultVertOriginY）。
   */
  readonly vorgOverrides: readonly VorgOverride[] | null;
}

/* ------------------------------------------------------------------ */
/* 各表的最小解析                                                       */
/* ------------------------------------------------------------------ */

/** head 表：unitsPerEm 在 offset 18 的 uint16。規範容許範圍 16–16384 */
function readUnitsPerEm(table: Uint8Array): number | null {
  if (table.length < 20) return null;
  const upem = u16(table, 18);
  if (upem < 16 || upem > 16384) return null;
  return upem;
}

/** maxp 表：numGlyphs 在 offset 4 的 uint16（vhea 缺失時用它夾限 vmtx 條數） */
function readNumGlyphs(table: Uint8Array): number | null {
  if (table.length < 6) return null;
  return u16(table, 4);
}

/** vhea 表：numOfLongVerMetrics 在 offset 34 的 uint16 */
function readNumLongVerMetrics(table: Uint8Array): number | null {
  if (table.length < 36) return null;
  return u16(table, 34);
}

/**
 * vmtx 表的眾數步進（**原始 units**，未除以 unitsPerEm）。
 *
 * 佈局：
 *   [advanceHeight u16, topSideBearing int16] × numOfLongVerMetrics
 *   [topSideBearing int16]                   × (numGlyphs − numOfLongVerMetrics)
 *
 * 超過 numOfLongVerMetrics 的字形共用最後一份 advanceHeight —— 那份已經被算進
 * 眾數統計裡了，所以後半段只存 tsb，**不需要也不應該**再讀。
 *
 * @returns null = 讀不到任何可用記錄
 */
function readModalAdvance(
  vmtx: Uint8Array,
  declared: number | null,
  numGlyphs: number | null
): { modal: number; uniform: boolean } | null {
  let n = Math.floor(vmtx.length / 4);
  if (n <= 0) return null;
  if (declared !== null && declared > 0) n = Math.min(n, declared);
  // declared 缺失（vhea 掉了）時用 maxp 的字形數夾限，避免把 tsb 區當成步進讀
  if (declared === null && numGlyphs !== null && numGlyphs > 0) n = Math.min(n, numGlyphs);
  if (n <= 0) return null;

  const freq = new Map<number, number>();
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const adv = u16(vmtx, i * 4);
    freq.set(adv, (freq.get(adv) ?? 0) + 1);
    if (adv < min) min = adv;
    if (adv > max) max = adv;
  }
  if (freq.size === 0) return null;

  // 平手時取較大的值：字體若同時有大步進與小步進且次數相同，
  // 取大者是「寧可寬一點也不要疊字」的保守方向（與 computeLsFixEm 的夾限精神一致）。
  let modal = 0;
  let best = -1;
  for (const [adv, count] of freq) {
    if (count > best || (count === best && adv > modal)) {
      best = count;
      modal = adv;
    }
  }
  return { modal, uniform: min === max };
}

/**
 * `advanceEm` 是否可用 —— 這是呼叫端決定要不要降級的**唯一判據**。
 *
 * 條件集中在這裡，是為了避免各處手抄 `typeof x === "number" && x > 0`：
 * 那種片段一旦有兩份，遲早會有一份忘了擋 `NaN`，然後校正量把字疊在一起。
 */
export function hasUsableAdvance(m: { readonly advanceEm: number | null } | null | undefined): boolean {
  if (!m || m.advanceEm === null) return false;
  return Number.isFinite(m.advanceEm) && m.advanceEm > 0;
}

/** VORG 預設縱向原點是否可用（同上的集中化理由） */
export function hasUsableVertOrigin(m: { readonly vorgDefaultOriginYEm: number | null } | null | undefined): boolean {
  if (!m || m.vorgDefaultOriginYEm === null) return false;
  return Number.isFinite(m.vorgDefaultOriginYEm);
}

/**
 * **逐字**縱向原點（em）：命中 per-glyph 覆蓋則用覆蓋值，否則回落 `defaultVertOriginY`。
 *
 * 缺席即等值、不是錯誤 —— 尺寸最佳化的字體會把「原點恰等於 default」的字形
 * 從陣列中省略（規範明文），故未命中一律回落 default。
 * 陣列按 glyphIndex 遞增（規範保證），用二分查找，不必線性掃。
 *
 * @param glyphId 字形索引（GID）
 * @returns em 值；`null` = 這款字體沒有可用的 VORG —— 呼叫端應降級到
 *          DOM 度量 / 目標節距，**不可**當成 0 或當成 default。
 */
export function vorgOriginYEmForGlyph(
  m: FontVerticalMetrics | null | undefined,
  glyphId: number
): number | null {
  if (!m || !Number.isFinite(m.unitsPerEm) || m.unitsPerEm <= 0) return null;
  const def = m.vorgDefaultOriginYEm;
  if (def === null || !Number.isFinite(def)) return null;
  const ov = m.vorgOverrides;
  if (!ov || ov.length === 0) return def;

  let lo = 0;
  let hi = ov.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const g = ov[mid].glyphIndex;
    if (g === glyphId) return ov[mid].vertOriginY / m.unitsPerEm;
    if (g < glyphId) lo = mid + 1;
    else hi = mid - 1;
  }
  return def;
}

/** VORG 表頭的 defaultVertOriginY（offset 4 的 int16）。定案見檔頭 */
function readVorgDefaultOriginY(table: Uint8Array): number | null {
  if (table.length < 6) return null;
  return i16(table, 4);
}

/**
 * 完整解析 VORG：表頭 8 字節 + per-glyph 覆蓋數組（每條 4 字節）。
 *
 * 佈局（定案，見檔頭）：
 *   offset 0 uint16 majorVersion
 *   offset 2 uint16 minorVersion
 *   offset 4 int16  defaultVertOriginY
 *   offset 6 uint16 numVertOriginYMetrics
 *   offset 8 …      { uint16 glyphIndex; int16 vertOriginY; } × count
 *
 * @returns 覆蓋陣列（可能為空陣列＝確定的「零條覆蓋」）；
 *          `null` = 表過短／大版本不認識／**長度不自洽** —— 寧可回 null 讓呼叫端
 *          降級，也不硬讀出錯位的 glyphIndex（那正是當年疑似「不單調遞增」的由來）。
 */
function readVorgOverrides(table: Uint8Array | null): readonly VorgOverride[] | null {
  if (!table || table.length < 8) return null;
  // 與 fontTools 同調：不認識的大版本不硬解
  if (u16(table, 0) > 1) return null;
  const count = u16(table, 6);
  const need = 8 + count * 4;
  if (need > table.length) return null; // 長度不自洽 → 降級，不猜
  const out: VorgOverride[] = [];
  for (let i = 0; i < count; i++) {
    const p = 8 + i * 4;
    out.push({ glyphIndex: u16(table, p), vertOriginY: i16(table, p + 2) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function needsInflate(entry: { compLength: number; length: number }): boolean {
  return entry.length > 0 && entry.compLength < entry.length;
}

function findTable(dir: { tables: readonly TableLike[] }, tag: string): TableLike | null {
  return dir.tables.find((t) => t.tag === tag) ?? null;
}

interface TableLike {
  tag: string;
  offset: number;
  length: number;
  compLength: number;
}

/** 取表位元組的回呼：同步版直接切，異步版先把壓縮表解壓好再餵進來 */
type TableGetter = (tag: string) => Uint8Array | null;

/**
 * 共用的純解析函式。
 *
 * 之所以用 getter 而不是直接吃 `SfntDirectory`：同步與異步唯一的差別在
 * 「要不要先 inflate」，把這個差別關在 getter 後面，兩條路徑才能共用同一份
 * 運算 —— 否則必然出現「同步算一套、異步算一套，然後悄悄漂移」的雙胞 bug。
 */
function parseVerticalMetrics(
  get: TableGetter,
  hasTable?: (tag: string) => boolean
): FontVerticalMetrics | null {
  // head 是 em 換算的分母，缺了就無法把 units 轉成 em —— 這時候寧可不給答案，
  // 也不該拿「猜的 1000」去產出一個看似合理的數字。
  const headRaw = get("head");
  if (!headRaw) return null;
  const unitsPerEm = readUnitsPerEm(headRaw);
  if (unitsPerEm === null) return null;

  // 規範（OpenType 1.9.1 · VORG）：僅適用 CFF / CFF2 輪廓；含 TrueType `glyf`
  // 輪廓時必須忽略。採**負向閘門**——只在能明確判定為 TrueType 時排除；
  // 目錄未提供輪廓資訊時不臆測、維持適用（合成輸入與既有行為因此不受影響）。
  const trueTypeOutlines = hasTable
    ? hasTable("glyf") && !hasTable("CFF ") && !hasTable("CFF2")
    : false;

  const vmtxRaw = get("vmtx");
  const vorgRaw = get("VORG");

  // 兩張表都沒有 → 這款字體確實不帶縱向度量，但那也算「讀到了確定的空結果」。
  // 不過對呼叫端而言這與「判斷不了」的處置完全相同（都要降級），
  // 故統一回 null，讓降級邏輯只有一條路徑。
  if (!vmtxRaw && (!vorgRaw || trueTypeOutlines)) return null;

  let advanceEm: number | null = null;
  let uniform = false;
  const hasVmtx = Boolean(vmtxRaw);
  if (vmtxRaw) {
    const modal = readModalAdvance(
      vmtxRaw,
      readNumLongVerMetrics(get("vhea") ?? EMPTY),
      readNumGlyphs(get("maxp") ?? EMPTY)
    );
    if (modal) {
      advanceEm = modal.modal / unitsPerEm;
      uniform = modal.uniform;
    }
  }

  const hasVorg = Boolean(vorgRaw) && !trueTypeOutlines;
  let vorgDefaultOriginYEm: number | null = null;
  let vorgOverrides: readonly VorgOverride[] | null = null;
  if (hasVorg && vorgRaw) {
    const y = readVorgDefaultOriginY(vorgRaw);
    if (y !== null) vorgDefaultOriginYEm = y / unitsPerEm;
    vorgOverrides = readVorgOverrides(vorgRaw);
  }

  return {
    unitsPerEm,
    hasVmtx,
    advanceEm,
    uniform,
    hasVorg,
    vorgDefaultOriginYEm,
    vorgOverrides,
  };
}

/** 讀邊界安全地處理「表不存在」：給空陣列讓各 read* 自己判定長度不足 */
const EMPTY = new Uint8Array(0);

/**
 * 同步讀取縱向度量。
 *
 * @returns FontVerticalMetrics；null = 判斷不了（呼叫端應降級到 DOM 度量 / 目標節距）
 */
export function readFontVerticalMetricsSync(data: Uint8Array | ArrayBuffer): FontVerticalMetrics | null {
  try {
    const b = asBytes(data);
    const kind = detectFontContainer(b);
    if (kind === "woff2" || kind === "unknown") return null;
    const dir = readSfntDirectory(b);
    // WOFF 壓縮表沒有同步解法：不冒險回傳垃圾，直接判定不了，讓呼叫端降級
    const get: TableGetter = (tag) => {
      const e = findTable(dir, tag);
      if (!e || needsInflate(e)) return null;
      return sliceTable(b, e);
    };
    return parseVerticalMetrics(get, (tag) => Boolean(findTable(dir, tag)));
  } catch {
    return null;
  }
}

/** 異步版：先把需要的表解壓好，再交給同一個 parseVerticalMetrics */
export async function readFontVerticalMetrics(
  data: Uint8Array | ArrayBuffer
): Promise<FontVerticalMetrics | null> {
  try {
    const b = asBytes(data);
    const kind = detectFontContainer(b);
    if (kind === "woff2" || kind === "unknown") return null;
    const dir = readSfntDirectory(b);

    const WANTED = ["head", "maxp", "vhea", "vmtx", "VORG"] as const;
    const resolved = new Map<string, Uint8Array>();
    for (const tag of WANTED) {
      const e = findTable(dir, tag);
      if (!e) continue;
      let bytes = sliceTable(b, e);
      if (needsInflate(e)) {
        const inflated = await inflateIfNeeded(bytes);
        if (!inflated) continue; // 解不了就當這張表不存在，其他表照樣解析
        bytes = inflated;
      }
      resolved.set(tag, bytes);
    }
    return parseVerticalMetrics(
      (tag) => resolved.get(tag) ?? null,
      (tag) => Boolean(findTable(dir, tag))
    );
  } catch {
    return null;
  }
}
