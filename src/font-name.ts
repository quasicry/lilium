// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * sfnt / OpenType `name` 表解析器
 *
 * 背景：此前 FontManager 用「檔名去擴展名」當 CSS font-family
 * （`SourceHanSerifCN-Regular.otf` → `SourceHanSerifCN-Regular`），
 * 而 languages.ts 的 fontStack 要的是 `Source Han Serif CN`，兩者對不上。
 * 結果是用戶把字體拖進 vault 也永遠用不到 —— 「導入」形同虛設。
 *
 * 解法：讀字體內部的 `name` 表，拿到字體自報的 family。
 * 零依賴（純 Uint8Array 操作），Node 與 Electron/Chromium 通用，可進單測。
 *
 * 規範：
 *  - OpenType `name`：https://learn.microsoft.com/en-us/typography/opentype/spec/name
 *  - WOFF 1.0：表目錄與 sfnt 同構，表數據 zlib 壓縮：https://www.w3.org/TR/WOFF/
 *  - WOFF2：Brotli + 表變換，**不支援**（回退到檔名即可）
 */

export type FontContainerKind = "sfnt" | "ttc" | "woff" | "woff2" | "unknown";

/** 表目錄項。offset/length 是邏輯座標；壓縮容器需先 inflate。 */
export interface SfntTableEntry {
  tag: string;
  offset: number;
  /** 邏輯長度（解壓後） */
  length: number;
  /** 容器內實際佔用；>0 且不等於 length 表示壓縮存儲 */
  compLength: number;
}

export interface SfntDirectory {
  kind: FontContainerKind;
  tables: SfntTableEntry[];
}

/** name 表各 nameID 的語義（只列出本模組用到的） */
export const NAME_ID = {
  COPYRIGHT: 0,
  FAMILY: 1,
  SUBFAMILY: 2,
  UNIQUE: 3,
  FULL: 4,
  VERSION: 5,
  POSTSCRIPT: 6,
  TYPO_FAMILY: 16,
  TYPO_SUBFAMILY: 17,
} as const;

export interface FontNameInfo {
  /** 建議用於 CSS 的 family：優先 typographic(16)，回退 legacy(1) */
  family: string | null;
  /** 來源標記，便於診斷「為什麼是這個名字」 */
  familySource: "typographic" | "legacy" | null;
  legacyFamily: string | null;
  typographicFamily: string | null;
  subfamily: string | null;
  fullName: string | null;
  postscriptName: string | null;
}

const EMPTY_INFO: FontNameInfo = {
  family: null,
  familySource: null,
  legacyFamily: null,
  typographicFamily: null,
  subfamily: null,
  fullName: null,
  postscriptName: null,
};

/* ------------------------------------------------------------------ */
/* 位元組讀取                                                          */
/* ------------------------------------------------------------------ */

function u8(b: Uint8Array, p: number): number {
  return b[p] ?? 0;
}

function u16(b: Uint8Array, p: number): number {
  return ((b[p] ?? 0) << 8) | (b[p + 1] ?? 0);
}

function u32(b: Uint8Array, p: number): number {
  return (((b[p] ?? 0) << 24) | ((b[p + 1] ?? 0) << 16) | ((b[p + 2] ?? 0) << 8) | (b[p + 3] ?? 0)) >>> 0;
}

function tagAt(b: Uint8Array, p: number): string {
  return String.fromCharCode(u8(b, p), u8(b, p + 1), u8(b, p + 2), u8(b, p + 3));
}

/* ------------------------------------------------------------------ */
/* 容器偵測與表目錄                                                     */
/* ------------------------------------------------------------------ */

export function asBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * 偵測容器類型。
 * - `0x00010000` / `true` / `typ1` → sfnt（TrueType 輪廓）
 * - `OTTO`                          → sfnt（CFF 輪廓）
 * - `ttcf`                          → TrueType Collection（多字體共用表）
 * - `wOFF`                          → WOFF 1.0
 * - `wOF2`                          → WOFF 2.0（不支援）
 */
export function detectFontContainer(b: Uint8Array): FontContainerKind {
  if (b.length < 4) return "unknown";
  const t = tagAt(b, 0);
  if (t === "ttcf") return "ttc";
  if (t === "wOFF") return "woff";
  if (t === "wOF2") return "woff2";
  if (t === "OTTO" || t === "true" || t === "typ1") return "sfnt";
  if (u32(b, 0) === 0x00010000) return "sfnt";
  return "unknown";
}

/** 表目錄項的固定寬度（sfnt/TTC=16，WOFF=20） */
function entrySize(kind: FontContainerKind): number {
  return kind === "woff" ? 20 : 16;
}

/**
 * 讀出表目錄。
 * - TTC：只取**第一個**字體（多數 .ttc 首選 Regular；若要枚舉全部需另行處理 numFonts）
 * - WOFF：保留了 compLength，讓呼叫端決定要不要解壓
 * 任何結構異常都返回空目錄（寧可回退到檔名，也不要拋異常炸掉 UI）。
 */
export function readSfntDirectory(data: Uint8Array | ArrayBuffer): SfntDirectory {
  const b = asBytes(data);
  const kind = detectFontContainer(b);
  if (kind === "woff2" || kind === "unknown") return { kind, tables: [] };

  // sfnt 目錄佈局：sfntVersion(4) numTables(2) searchRange(2) entrySelector(2)
  //                rangeShift(2) [表目錄項…]
  // TTC 共享同一佈局，只是整體從 "sfntVersion 起點" 平移到 ttcf 指定處。
  // WOFF header 結構不同（見下），故直接給絕對偏移。
  let numTablesAt = 4;
  let tablesAt = 12;

  if (kind === "ttc") {
    if (b.length < 12) return { kind, tables: [] };
    const numFonts = u32(b, 8);
    if (numFonts < 1) return { kind, tables: [] };
    const base = u32(b, 12);
    if (base <= 0 || base + 4 > b.length) return { kind, tables: [] };
    numTablesAt = base + 4;
    tablesAt = base + 12;
  } else if (kind === "woff") {
    // WOFF header: signature(4) flavor(4) length(4) numTables(2) reserved(2)
    //              totalSfntSize(4) majorVersion(2) minorVersion(2) ... → 表目錄於 44
    if (b.length < 44) return { kind, tables: [] };
    numTablesAt = 12;
    tablesAt = 44;
  } else {
    if (b.length < 12) return { kind, tables: [] };
  }

  if (numTablesAt + 2 > b.length) return { kind, tables: [] };
  const numTables = u16(b, numTablesAt);

  const size = entrySize(kind);
  const tables: SfntTableEntry[] = [];
  for (let i = 0; i < numTables; i++) {
    const p = tablesAt + i * size;
    if (p + size > b.length) break;
    const tag = tagAt(b, p);
    if (kind === "woff") {
      const offset = u32(b, p + 4);
      const compLength = u32(b, p + 8);
      const origLength = u32(b, p + 12);
      tables.push({ tag, offset, length: origLength, compLength });
    } else {
      tables.push({ tag, offset: u32(b, p + 8), length: u32(b, p + 12), compLength: u32(b, p + 12) });
    }
  }
  return { kind, tables };
}

/** 取出某張表的原始位元組（WOFF 壓縮時返回的是**壓縮後**的內容） */
export function sliceTable(data: Uint8Array | ArrayBuffer, entry: SfntTableEntry): Uint8Array {
  const b = asBytes(data);
  const start = Math.max(0, Math.min(entry.offset, b.length));
  const end = Math.max(start, Math.min(entry.offset + entry.compLength, b.length));
  return b.subarray(start, end);
}

/* ------------------------------------------------------------------ */
/* 字串解碼                                                            */
/* ------------------------------------------------------------------ */

/** UTF-16BE 手寫解碼：不依賴 TextDecoder('utf-16be')，Node 與 Chromium 行為一致 */
export function decodeUtf16Be(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < b.length; i += 2) {
    const unit = ((b[i] << 8) | b[i + 1]) >>> 0;
    if (unit === 0) continue;
    if (unit >= 0xd800 && unit <= 0xdbff && i + 3 < b.length) {
      const lo = ((b[i + 2] << 8) | b[i + 3]) >>> 0;
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        out += String.fromCodePoint(((unit - 0xd800) << 10) + lo + 0x2400);
        i += 2;
        continue;
      }
    }
    out += String.fromCharCode(unit);
  }
  return out;
}

function decodeLatin1(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) if (b[i] !== 0) out += String.fromCharCode(b[i]);
  return out;
}

function decodeUtf32Be(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 3 < b.length; i += 4) {
    const cp = (((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0);
    if (cp === 0) continue;
    if (cp > 0x10ffff) continue;
    out += String.fromCodePoint(cp);
  }
  return out;
}

/**
 * 平台/編碼可信度（越高越優先）。
 * Windows UTF-16BE(3,1) 是事實標準；Mac(1,0) 是 MacRoman，
 * 對 family 這種幾乎總是 ASCII 的字串，latin1 近似已夠用。
 */
const ENCODING_PREFERENCE: ReadonlyArray<{ platformID: number; encodingID: number; score: number; kind: "utf16" | "utf32" | "latin1" }> = [
  { platformID: 3, encodingID: 1, score: 6, kind: "utf16" },
  { platformID: 3, encodingID: 10, score: 5, kind: "utf32" },
  { platformID: 0, encodingID: 4, score: 4, kind: "utf16" },
  { platformID: 0, encodingID: 6, score: 4, kind: "utf16" },
  { platformID: 0, encodingID: 3, score: 4, kind: "utf16" },
  { platformID: 3, encodingID: 0, score: 2, kind: "utf16" },
  { platformID: 1, encodingID: 0, score: 1, kind: "latin1" },
];

function encodingFor(platformID: number, encodingID: number): { score: number; kind: "utf16" | "utf32" | "latin1" } {
  for (const e of ENCODING_PREFERENCE) {
    if (e.platformID === platformID && e.encodingID === encodingID) return { score: e.score, kind: e.kind };
  }
  // 未列編碼：平台 0/3 一律按 UTF-16BE 試（多數是事實上的 Unicode 小平臺變體）
  if (platformID === 0 || platformID === 3) return { score: 1, kind: "utf16" };
  if (platformID === 1) return { score: 1, kind: "latin1" };
  return { score: 0, kind: "latin1" };
}

/** 英語語言 ID 加分，讓英文 family 壓過本地化名（Windows: 0x0409；Mac: 0） */
function languageScore(platformID: number, languageID: number): number {
  if (platformID === 3 && languageID === 0x0409) return 2;
  if (platformID === 1 && languageID === 0) return 2;
  if (platformID === 0) return 1;
  return 0;
}

// eslint-disable-next-line no-control-regex -- 字典解析/文本清洗必需的控制字符匹配（\x00 剝除/分隔符），無 ReDoS（無嵌套量詞）——審計批次三。
const CONTROL_RE = new RegExp("[\\u0000-\\u001F\\u007F]+", "g");

/**
 * 淨化字體自報的名字。
 * 必須做：真實字體裡見過 BOM、結尾 NUL、連續空格，甚至有人把版本號寫進 family。
 */
export function sanitizeFontName(raw: string): string {
  if (!raw) return "";
  // BOM 用碼位比較而非正則字面：避免源碼裡混入不可見字符
  let s = raw;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
  // 去掉包裹用的引號（CSS 注入時會再加）
  s = s.replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim();
  if (s.length > 127) s = s.slice(0, 127).trimEnd();
  return s;
}

/* ------------------------------------------------------------------ */
/* name 表解析                                                         */
/* ------------------------------------------------------------------ */

interface NameRecordSlot {
  value: string;
  score: number;
}

/**
 * 解析已解壓的 `name` 表位元組。純函數，可直接單測。
 *
 * @param table `name` 表的原始內容（WOFF 必須先 inflate）
 */
export function parseNameTable(table: Uint8Array): FontNameInfo {
  const info: FontNameInfo = { ...EMPTY_INFO };
  if (table.length < 6) return info;
  const count = u16(table, 2);
  const stringOffset = u16(table, 4);
  if (count === 0 || stringOffset > table.length) return info;

  // 每個 nameID 只保留分數最高的一筆
  const best = new Map<number, NameRecordSlot>();

  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    if (rec + 12 > table.length) break;
    const platformID = u16(table, rec);
    const encodingID = u16(table, rec + 2);
    const languageID = u16(table, rec + 4);
    const nameID = u16(table, rec + 6);
    const length = u16(table, rec + 8);
    const offset = u16(table, rec + 10);
    if (length === 0) continue;

    const enc = encodingFor(platformID, encodingID);
    if (enc.score === 0) continue;

    const start = stringOffset + offset;
    const end = Math.min(start + length, table.length);
    if (start >= end) continue;

    const raw = table.subarray(start, end);
    const text = enc.kind === "utf16" ? decodeUtf16Be(raw) : enc.kind === "utf32" ? decodeUtf32Be(raw) : decodeLatin1(raw);
    const value = sanitizeFontName(text);
    if (!value) continue;

    const score = enc.score * 10 + languageScore(platformID, languageID);
    const prev = best.get(nameID);
    if (!prev || score > prev.score) best.set(nameID, { value, score });
  }

  const get = (id: number): string | null => best.get(id)?.value ?? null;
  info.legacyFamily = get(NAME_ID.FAMILY);
  info.typographicFamily = get(NAME_ID.TYPO_FAMILY);
  info.subfamily = get(NAME_ID.TYPO_SUBFAMILY) ?? get(NAME_ID.SUBFAMILY);
  info.fullName = get(NAME_ID.FULL);
  info.postscriptName = get(NAME_ID.POSTSCRIPT);

  // 偏好順序：typographic(16) > legacy(1) > full(4) 的第一個詞
  if (info.typographicFamily) {
    info.family = info.typographicFamily;
    info.familySource = "typographic";
  } else if (info.legacyFamily) {
    // RIBBI 字體常把 legacy family 寫成 "Family Condensed" 這種帶樣式的形式，
    // 但那仍是比 fullName 更好的 CSS family（fullName 含 style，註冊後匹配不到）。
    info.family = info.legacyFamily;
    info.familySource = "legacy";
  }
  return info;
}

/* ------------------------------------------------------------------ */
/* 高階入口                                                            */
/* ------------------------------------------------------------------ */

/** zlib/Deflate 解壓（WOFF 表數據）。無 DecompressionStream 時返回 null（Node < 18）。 */
export async function inflateIfNeeded(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    // 裸全域 typeof 引用（雙環境）：Obsidian/Chromium 與 Node 18+ 皆有
    // DecompressionStream；typeof 檢查在未定義環境不拋 ReferenceError，
    // 語義同前（無 DecompressionStream 時返回 null）。不用 globalThis／window
    // 字面——兩者分別觸發 obsidianmd/no-global-this（Node 測試環境無 window）。
    if (typeof DecompressionStream === "undefined") return null;
    const DS = DecompressionStream as unknown as new (fmt: string) => { writable: WritableStream; readable: ReadableStream };
    const ds = new DS("deflate");

    // ⚠️ 寫入端**不能** fire-and-forget：字體數據損毀時 zlib 會在寫入側報
    // Z_BUF_ERROR，那個 rejection 若無人接管就變成 unhandled rejection ——
    // 在 Node 會終止行程，在 Chromium/Electron 會掀掉 Obsidian 的渲染行程。
    // 壞流本屬預期輸入（用戶導入 screwed-up .woff），這裡必須顯式吞掉。
    // 同時也不能 await 之後再去讀：小streams backpressure 會造成死鎖，
    // 故採「先掛 catch 再併發讀」的寫法。
    const writer = ds.writable.getWriter();
    const pumping = (async () => {
      await writer.write(bytes.slice());
      await writer.close();
    })().catch(() => {
      /* 寫入失敗一律由讀取側統一以 null 回報 */
    });

    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    try {
      for (;;) {
        const chunk: ReadableStreamReadResult<Uint8Array> = await reader.read();
        const { done, value } = chunk;
        if (done) break;
        if (value) { chunks.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)); }
      }
    } catch {
      // 讀取側報錯 = 數據壞了；寫入側的 rejection 已被 pumping.catch 吸收
      void pumping;
      return null;
    }
    await pumping;
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  } catch {
    return null;
  }
}

export interface ResolvedFontName {
  info: FontNameInfo;
  kind: FontContainerKind;
  /** 為何失敗 / 如何得到，便於設定頁診斷 */
  reason: "name-table" | "no-name-table" | "unsupported-container" | "bad-container" | "truncated";
}

/**
 * 從字體位元組解析真實 family（支援 TTF / OTF / TTC / WOFF 1.0）。
 * 失敗一律返回 `info.family === null`，呼叫端應回退到檔名。
 */
export async function resolveFontName(data: Uint8Array | ArrayBuffer): Promise<ResolvedFontName> {
  const b = asBytes(data);
  const dir = readSfntDirectory(b);
  const fail = (reason: ResolvedFontName["reason"]): ResolvedFontName => ({ info: { ...EMPTY_INFO }, kind: dir.kind, reason });

  if (dir.kind === "woff2") return fail("unsupported-container");
  if (dir.kind === "unknown") return fail("bad-container");
  if (!dir.tables.length) return fail("no-name-table");

  const entry = dir.tables.find((t) => t.tag === "name");
  if (!entry || entry.length === 0) return fail("no-name-table");

  let table = sliceTable(b, entry);
  if (table.length !== entry.length) {
    if (dir.kind !== "woff" || entry.compLength === entry.length) return fail("truncated");
    const raw = table;
    const inflated = await inflateIfNeeded(raw);
    if (!inflated || inflated.length !== entry.length) return fail("truncated");
    table = inflated;
  }
  return { info: parseNameTable(table), kind: dir.kind, reason: "name-table" };
}

/**
 * 同步版：只處理未壓縮表（TTF / OTF / TTC）。WOFF 請用異步版。
 * 設這個入口是為了讓 `name` 表本身能被同步單測覆蓋到全部branch。
 */
export function resolveFontNameSync(data: Uint8Array | ArrayBuffer): ResolvedFontName {
  const b = asBytes(data);
  const dir = readSfntDirectory(b);
  const fail = (reason: ResolvedFontName["reason"]): ResolvedFontName => ({ info: { ...EMPTY_INFO }, kind: dir.kind, reason });
  if (dir.kind === "woff2") return fail("unsupported-container");
  if (dir.kind === "unknown") return fail("bad-container");
  if (!dir.tables.length) return fail("no-name-table");
  const entry = dir.tables.find((t) => t.tag === "name");
  if (!entry) return fail("no-name-table");
  const table = sliceTable(b, entry);
  if (table.length !== entry.length) return fail("truncated");
  return { info: parseNameTable(table), kind: dir.kind, reason: "name-table" };
}

/**
 * CSS font-family 字面值轉義。
 * 字體自報的名字可能含 `"` 或 `\\`（雖然罕見但不為零），直接塞進 @font-face 會破壞整條規則。
 */
export function cssFontFamily(family: string): string {
  return family.replace(/([\\"])/g, "\\$1");
}

/** CSS <string> 值轉義（用於引號內的字面值） */
export function cssStringLiteral(family: string): string {
  return `"${cssFontFamily(family)}"`;
}
