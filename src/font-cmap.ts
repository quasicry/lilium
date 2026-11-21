// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 字體 cmap 覆蓋率讀取
 *
 * 為什麼要有這個模組：判斷「某字體能不能渲染某文種」時，靠的是 Canvas
 * `measureText` 的三方比對（邏輯見 font-metrics.glyphSupported）。那套做法有兩條
 * 繞不過去的限制：
 *
 *  1. 它只能回答「**畫不畫得出來**」，答不了「**是不是用你指定的這一款畫的**」。
 *     同一碼位有多款字體都畫得出時，寬度相同 ⇒ 全部放行 ⇒ 誤配進字體棧。
 *     （這正是蘭札必須靠用戶 override 硬指定的原因，Override 分支至今還留著。）
 *  2. 它依賴瀏覽器。Node 側完全不可用，測試只能靠注入假 probe 間接驗證。
 *
 * 直接讀字體的 cmap 表則是**確定的**：不存在就是不存在。不需要度量、不需要拿
 * 「必定不存在的 family」當參照物，也不碰 DOM。
 *
 * ---------------------------------------------------------------------------
 * 表示法：這裡與交接提示刻意分歧
 * ---------------------------------------------------------------------------
 * 交接提示建議把測試層的 `readCodepoints()`（返回 Set<number>）直接搬過來。
 * 但把區間展開成逐碼位的 Set，對 CJK 字體意味著六萬多個條目 —— 而 cmap 的
 * 原生格式本來就是區間（format 4 的段、format 12 的群組）。所以這裡改成
 * **區間有序陣列 + 二分查找**：
 *
 *  · 記憶體：數萬個 Set 條目 → 數十個區間
 *  · 查詢：O(log n)，n 從數萬降到數十
 *  · 讀取時不逐碼位展開，直接對齊磁碟佈局
 *
 * ---------------------------------------------------------------------------
 * 比 Canvas 更準的那一點
 * ---------------------------------------------------------------------------
 * format 4 的段允許把某個碼位映射到 **glyphId 0（notdef）**——它「在 cmap 裡」，
 * 但畫出來是方框。測試層原型沒處理這層，因為它的用途是統計**編碼互斥性**，
 * 不需要；但本模組的用途是「這款字體有沒有這個字」，若放過它就等於把 tofu
 * 當成支援。所以這裡**逐碼位算 glyphId 並剔除 0**，寧可範圍碎一點也要準。
 *
 * ---------------------------------------------------------------------------
 * 容器支援
 * ---------------------------------------------------------------------------
 * sfnt / TTC（取第一個字體）/ WOFF 1.0（壓縮表需 async 解壓）。
 * WOFF 2.0 一律返回 null 由呼叫端降級 —— Brotli + 表變換，本插件不支援。
 * 所有結構異常都返回 null 而非拋出：這是**優雅降級**而非錯誤路徑，
 * 呼叫端隨時可以退回 Canvas。
 */

import { asBytes, detectFontContainer, inflateIfNeeded, readSfntDirectory, sliceTable } from "./font-name";

/* ------------------------------------------------------------------ */
/* 二進位讀取（帶邊界保護）                                              */
/* ------------------------------------------------------------------ */
/**
 * 為什麼不共用 font-name.ts 的 u16/u32：那些 helper 是該檔案的 module-private
 * 符號。為了一個 sanitizer 去擴大它的導出面不划算，況且這裡還需要 int16
 *（idDelta 是有號數），而那邊不需要。
 * 全部越界返回 0：寧可讀到垃圾也不讓例外掀掉整個排版流程。
 */

function u8(b: Uint8Array, o: number): number {
  return o >= 0 && o < b.length ? b[o] : 0;
}

function u16(b: Uint8Array, o: number): number {
  return ((u8(b, o) << 8) | u8(b, o + 1)) & 0xffff;
}

function u32(b: Uint8Array, o: number): number {
  return (((u8(b, o) << 24) | (u8(b, o + 1) << 16) | (u8(b, o + 2) << 8) | u8(b, o + 3)) >>> 0);
}

/** idDelta 是 int16 */
function i16(b: Uint8Array, o: number): number {
  const v = u16(b, o);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/* ------------------------------------------------------------------ */
/* 型別                                                                */
/* ------------------------------------------------------------------ */

/** 連續碼位區間（含首尾）。**已排序、已合併、不相交** —— 二分查找的前提 */
export type CmapRange = readonly [start: number, end: number];

export interface FontCmap {
  /** 升序區間；空陣列表示該字體沒有任何可用 cmap 子表 */
  ranges: readonly CmapRange[];
  /** 取用了哪個子表（診斷用：同一款字體有多個 platform/encoding 子表時） */
  subtable: { platformId: number; encodingId: number; format: number };
}

/** 區間數量上限。超過多半是結構異常或病態字體，放棄解析以免拖垮啟動 */
const MAX_RANGES = 8192;

/* ------------------------------------------------------------------ */
/* cmap 子表選擇                                                        */
/* ------------------------------------------------------------------ */

/**
 * (platformID, encodingID) 偏好分數。
 *
 * ⚠️ **不可照抄 ENCODING_PREFERENCE**（font-name.ts 裡那張表）。那張表是給
 * `name` 表挑字串用的，`cmap` 的取捨點完全不同 —— 見 pickSubtable 的說明。
 *
 * 順序仍是實務優先序：Unicode BMP 全覆蓋最有用；Symbol / Mac Roman 只在沒得選
 * 時才用（它們編碼空間與 Unicode 不同或覆蓋不全，拿來判斷會誤殺）。
 */
function encodingScore(pid: number, eid: number): number {
  if (pid === 3 && eid === 1) return 6; // Unicode BMP
  if (pid === 3 && eid === 10) return 5; // Unicode full（含 astral）
  if (pid === 0 && (eid === 4 || eid === 6)) return 4; // Unicode full / BMP（deprecated 編碼 ID）
  if (pid === 0 && eid <= 3) return 4; // Unicode 1.0 系
  if (pid === 3 && eid === 0) return 2; // Symbol：有字形但編碼不是 Unicode，不可信
  if (pid === 1 && eid === 0) return 1; // Mac Roman：Unicode 覆蓋不完整，最後手段
  return -1;
}

interface SubtableRef {
  pid: number;
  eid: number;
  /** 相對 cmap 表起點的偏移 */
  offset: number;
  format: number;
}

/** 該 platform/encoding 是否真的按 Unicode 編碼（Symbol / Mac Roman 會誤殺） */
function isUnicodeEncoding(pid: number, eid: number): boolean {
  return encodingScore(pid, eid) >= 4;
}

function pickSubtable(cmap: Uint8Array): SubtableRef | null {
  if (cmap.length < 4) return null;
  const n = u16(cmap, 2);
  let best: SubtableRef | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const rec = 4 + i * 8;
    if (rec + 8 > cmap.length) break;
    const pid = u16(cmap, rec);
    const eid = u16(cmap, rec + 2);
    if (!isUnicodeEncoding(pid, eid)) continue;
    const rel = u32(cmap, rec + 4);
    if (rel + 4 > cmap.length) continue;
    const format = u16(cmap, rel);
    const parsable = format === 4 || format === 12;

    // 排序維度，權重由大到小：能否表達 astral > 我能不能解析 > platform 偏好。
    //
    // 第一維是**血淚教訓**：初版這裡直接套用 name 表的偏好（(3,1) 最高），
    // 結果 (3,1) 的 format 4 打敗 (3,10) 的 format 12 —— 而 format 4 的上限
    // 只到 U+FFFF。這麼一來：
    //   蘭札 NU（Newa U+11400）、悉曇（U+11580）、回鶻文（U+10F70）
    // 三款 astral 字體全部被讀成「一個字形都沒有」，並據此判定不支援。
    // 它不會拋錯、不會警告，只會靜默把字體踢出字體棧。
    const astralCapable = format === 12;
    const composite =
      (astralCapable ? 1000 : 0) +
      (parsable ? 100 : 0) +
      encodingScore(pid, eid);

    if (composite > bestScore) {
      bestScore = composite;
      best = { pid, eid, offset: rel, format };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* format 4 / format 12                                                */
/* ------------------------------------------------------------------ */

/** 收集結果用的可寫區間（內部用，輸出前才轉 readonly） */
type RawRange = [number, number];

/**
 * format 4（BMP，segment 二分查找編碼）。
 *
 * 逐碼位算 glyphId 是必要的：見檔頭說明，段可以把碼位映射到 glyphId 0。
 * 代價是要遍歷段內每個碼位 —— 對 CJK 字體約六萬次簡單算術，實測在毫秒級，
 * 且只在安裝 / 首次 refresh 時做一次（結果會進 cmap 索引）。
 */
function parseFormat4(cmap: Uint8Array, base: number, out: RawRange[]): boolean {
  const segX2 = u16(cmap, base + 6);
  const seg = Math.floor(segX2 / 2);
  if (segX2 < 2 || seg < 1) return true; // 空表，不是錯誤

  const endO = base + 14;
  const startO = endO + segX2 + 2; // +2 = reservedPad
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;

  for (let i = 0; i < seg; i++) {
    const end = u16(cmap, endO + i * 2);
    const start = u16(cmap, startO + i * 2);
    // 0xFFFF 是哨兵段（最後一段必為 start=end=0xFFFF）
    if (start === 0xffff) continue;
    const delta = i16(cmap, deltaO + i * 2);
    const rangeOffset = u16(cmap, rangeO + i * 2);

    let runStart = -1;
    const hi = Math.min(end, 0xfffe);
    for (let c = start; c <= hi; c++) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        // idRangeOffset 是**從 idRangeOffset[i] 自身所在位置起算**的位元組偏移，
        // 而不是從 subtable 起點 —— 這裡最容易寫錯，寫錯也不會報錯，只會靜默
        // 讀到垃圾 glyphId（結果是每個字都顯示成方框，卻被判為「支援」）。
        const glyphAddr = rangeO + i * 2 + rangeOffset + 2 * (c - start);
        const gi = u16(cmap, glyphAddr);
        glyph = gi === 0 ? 0 : (gi + delta) & 0xffff;
      }
      if (glyph === 0) {
        if (runStart >= 0) {
          out.push([runStart, c - 1]);
          runStart = -1;
        }
      } else if (runStart < 0) {
        runStart = c;
      }
      if (out.length > MAX_RANGES) return false;
    }
    if (runStart >= 0) out.push([runStart, hi]);
    if (out.length > MAX_RANGES) return false;
  }
  return true;
}

/**
 * format 12（segmented coverage，群組格式）—— 唯一能表達 astral plane（> U+FFFF）
 * 的格式。群組語意即「全區間皆有效映射」，故無需逐碼位驗 glyphId。
 */
function parseFormat12(cmap: Uint8Array, base: number, out: RawRange[]): boolean {
  const groups = u32(cmap, base + 12);
  if (groups === 0) return true;
  // groups * 12 位元組，防止惡意字體宣告巨大 nGroups 導致長時間空轉
  if (base + 16 + groups * 12 > cmap.length) return false;
  for (let g = 0; g < groups; g++) {
    const o = base + 16 + g * 12;
    const start = u32(cmap, o);
    const end = u32(cmap, o + 4);
    if (end < start) continue;
    out.push([start, end]);
    if (out.length > MAX_RANGES) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 歸一化                                                              */
/* ------------------------------------------------------------------ */

/**
 * 排序 + 合併相鄰／重疊區間。
 * 合併條件用 `start <= lastEnd + 1`（含緊鄰）—— 讓二分查找可以用最少的區間數。
 */
function normalize(raw: RawRange[]): readonly CmapRange[] {
  const sorted = raw.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: RawRange[] = [];
  for (const r of sorted) {
    if (r[1] < r[0]) continue;
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) {
      if (r[1] > last[1]) last[1] = r[1];
    } else {
      out.push([r[0], r[1]]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

/**
 * WOFF 的表是否被壓縮。
 * `readSfntDirectory` 對 WOFF 會同時給出 compLength 與 origLength（= length）。
 * 相等表示作者選擇不壓縮，資料可直接讀。
 */
function needsInflate(entry: { compLength: number; length: number }): boolean {
  return entry.length > 0 && entry.compLength < entry.length;
}

function parseCmapTable(table: Uint8Array): FontCmap | null {
  try {
    const sub = pickSubtable(table);
    if (!sub) return null;
    const raw: RawRange[] = [];
    let ok = false;
    if (sub.format === 4) ok = parseFormat4(table, sub.offset, raw);
    else if (sub.format === 12) ok = parseFormat12(table, sub.offset, raw);
    else return null; // format 0/2/6/13/14 不支援 —— 明確回 null，不假裝讀到了
    if (!ok) return null;
    return {
      ranges: normalize(raw),
      subtable: { platformId: sub.pid, encodingId: sub.eid, format: sub.format },
    };
  } catch {
    return null;
  }
}

/**
 * 同步讀取 cmap 覆蓋範圍。
 *
 * @returns FontCmap；**讀不到不代表字體壞了**，只代表本模組判斷不了 —— 呼叫端
 *          應降級到 Canvas 探測，而不是當作「不支援」。回傳契約刻意區分：
 *          · null      = 判斷不了（容器不支援 / 表缺失 / 需異步解壓 / 結構異常）
 *          · FontCmap  = 判斷得了（ranges 可能為空 = 確實一個字都沒有）
 */
export function readFontCmapSync(data: Uint8Array | ArrayBuffer): FontCmap | null {
  try {
    const b = asBytes(data);
    const kind = detectFontContainer(b);
    if (kind === "woff2" || kind === "unknown") return null;
    const dir = readSfntDirectory(b);
    const entry = dir.tables.find((t) => t.tag === "cmap");
    if (!entry) return null;
    // WOFF 壓縮表沒 DecompressionStream 就讀不了；同步路徑寧可不給答案也不冒風險
    if (needsInflate(entry)) return null;
    return parseCmapTable(sliceTable(b, entry));
  } catch {
    return null;
  }
}

/** 異步版：多處理「WOFF 壓縮表」這一類需要解壓的情況 */
export async function readFontCmap(data: Uint8Array | ArrayBuffer): Promise<FontCmap | null> {
  try {
    const b = asBytes(data);
    const kind = detectFontContainer(b);
    if (kind === "woff2" || kind === "unknown") return null;
    const dir = readSfntDirectory(b);
    const entry = dir.tables.find((t) => t.tag === "cmap");
    if (!entry) return null;
    let table = sliceTable(b, entry);
    if (needsInflate(entry)) {
      const inflated = await inflateIfNeeded(table);
      if (!inflated) return null;
      table = inflated;
    }
    return parseCmapTable(table);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 查詢                                                                */
/* ------------------------------------------------------------------ */

/** 區間上是否 **覆蓋** 該碼位（二分查找；ranges 已排序合併） */
export function cmapHasCodepoint(cmap: FontCmap | null, codepoint: number): boolean {
  if (!cmap) return false;
  const rs = cmap.ranges;
  if (!Number.isFinite(codepoint) || codepoint < 0) return false;
  let lo = 0;
  let hi = rs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rs[mid];
    if (codepoint < r[0]) hi = mid - 1;
    else if (codepoint > r[1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * 字體是否支援 `text` 裡的**每一個**碼位。
 *
 * 這裡用 `for...of` 而非 charCodeAt —— 它按 Unicode scalar value 迭代，
 * 對 astral 字（如回鶻文樣本 `𐽰` U+10F70）不會拆成兩個 UTF-16 unit。
 * 空字串視為 false（沒有東西可判定）。
 */
export function cmapHasText(cmap: FontCmap | null, text: string): boolean {
  if (!cmap || !text) return false;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || !cmapHasCodepoint(cmap, cp)) return false;
  }
  return true;
}

/** 區間內的碼位總數（診斷 / 設定頁顯示用） */
export function cmapCodepointCount(cmap: FontCmap | null): number {
  if (!cmap) return 0;
  let n = 0;
  for (const [s, e] of cmap.ranges) n += e - s + 1;
  return n;
}
