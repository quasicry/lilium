// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 字體棧裝配器
 *
 * 解決的問題：用戶導入的字體此前**永遠進不了字體棧**。
 * `languages.ts` 的 fontStack 是寫死的，無論用戶放了多少字體進 vault，
 * 排版時取的都是那幾條常量，導入只是把檔案複製進去而已。
 *
 * 這裡做三件事：
 *  1. 持有一份運行時的「可用字體族」清單（由 FontManager 在 refresh 後寫入）
 *  2. 按文種做**覆蓋率探測**：能渲染該文種樣本字的字體才進棧
 *  3. 支援用戶顯式 override（某些字體hand-pick，探測猜不對的場合）
 *
 * 純邏輯不依賴 obsidian，可進 Node 單測；DOM 探測走注入的 check。
 */

import { GENERIC_FAMILY_KEYWORDS, SCRIPT_SAMPLE_CHAR, SCRIPTS, ScriptId } from "./languages";
import { glyphSupported } from "./font-metrics";
import { cmapHasText, type FontCmap } from "./font-cmap";
import { hasVertFeature, type FontFeatures } from "./font-gsub";
import type { FontVerticalMetrics } from "./font-vmetrics";

/* ------------------------------------------------------------------ */
/* CJK 等字體下載退役後的遺留檔盤點                              */
/* ------------------------------------------------------------------ */

/**
 * 已不再提供下載的字體所對應的檔名。
 *
 * 老用戶可能曾點過「下載安裝」，把這些檔案留在 `.lilium/fonts`（舊版目錄名）裡。
 * 從 FONT_CATALOG 移除後它們會自然落到 `custom:` 分支：
 * 讀 name 表 → 拿到真實 family → 註冊 @font-face → 覆蓋率探測進棧。
 * 功能全部保留，**檔案不需要搬也不需要刪**，所以遷移只剩「告訴用戶一聲」。
 *
 * 放這裡而非 fonts.ts：fonts.ts import obsidian 執行期符號，進不了 Node 測試 bundle。
 *
 * 若將來重新加回任何一項，必須同步從這張表移除。
 */
export const RETIRED_FONT_FILE_NAMES: readonly string[] = [
  "NotoSerifSC-Regular.otf",
  "NotoSerifTC-Regular.otf",
  "NotoSerifJP-Regular.otf",
  "NotoSerifKR-Regular.otf",
  "NotoSansSC-Regular.otf",
  "NotoSansJP-Regular.otf",
  "NotoSansKR-Regular.otf",
  "NotoSerif-Regular.ttf", // 拉丁：系統字體棧已足夠
];

export interface RetiredFontReport {
  /** vault 裡仍然存在的已退役檔名 */
  files: string[];
  /** 其中有多少款成功解析出真實 family（能正常進字體棧） */
  resolvedCount: number;
  totalBytes: number;
}

/**
 * 從 FontManager.installedList() 的結果盤點退役字體。
 * 純函數、不碰磁碟 —— 便於單測，也避免為此多掃一次目錄。
 */
export function collectRetiredFonts(list: readonly { id: string; bytes: number; resolved: boolean }[]): RetiredFontReport {
  const files: string[] = [];
  let resolvedCount = 0;
  let totalBytes = 0;
  for (const f of list) {
    if (!f.id.startsWith("custom:")) continue;
    const fileName = f.id.slice(7);
    if (!RETIRED_FONT_FILE_NAMES.includes(fileName)) continue;
    files.push(fileName);
    totalBytes += f.bytes;
    if (f.resolved) resolvedCount++;
  }
  return { files, resolvedCount, totalBytes };
}

/* ------------------------------------------------------------------ */
/* 運行時狀態（插件單例持有；測試環境為空）                                */
/* ------------------------------------------------------------------ */

let customFamilies: string[] = [];
let overrides: Partial<Record<ScriptId, string>> = {};

/** FontManager.refresh() 後呼叫：更新「可用字體族」清單 */
export function setCustomFontFamilies(families: readonly string[]): void {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of families) {
    const f = (raw ?? "").trim();
    if (!f) continue;
    const k = f.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  customFamilies = out;
}

export function getCustomFontFamilies(): string[] {
  return customFamilies.slice();
}

export function setFontOverrides(map: Partial<Record<ScriptId, string>>): void {
  const out: Partial<Record<ScriptId, string>> = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    const fam = (v ?? "").trim();
    if (fam) out[k as ScriptId] = fam;
  }
  overrides = out;
}

export function setFontOverride(script: ScriptId, family: string | null): void {
  const next = { ...overrides };
  if (family && family.trim()) next[script] = family.trim();
  else delete next[script];
  overrides = next;
}

export function getFontOverrides(): Partial<Record<ScriptId, string>> {
  return { ...overrides };
}

export function getFontOverride(script: ScriptId): string | null {
  return overrides[script] ?? null;
}

/* ------------------------------------------------------------------ */
/* 純函數：棧合併                                                       */
/* ------------------------------------------------------------------ */

/** family 名比對鍵：CSS family 大小寫不敏感，前後空白無意義 */
function familyKey(f: string): string {
  return f.trim().toLowerCase();
}

function isGenericFamily(f: string): boolean {
  return GENERIC_FAMILY_KEYWORDS.includes(familyKey(f));
}

/**
 * 把 additions 插進 base，**置於第一個通用族關鍵字之前**。
 *
 * 順序決定一切：CSS 字體棧命中通用族（serif / sans-serif / …）後即停止，
 * 若把用戶字體追加到末尾，`serif` 後面的名字永遠不會被考慮。
 */
export function mergeFontStack(base: readonly string[], additions: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const pushInto = (dst: string[], f: string, dedupe: Set<string>): void => {
    const t = f.trim();
    const k = familyKey(t);
    if (!k || dedupe.has(k)) return;
    dedupe.add(k);
    dst.push(t);
  };
  for (const f of base) pushInto(out, f, seen);

  let insertAt = out.findIndex(isGenericFamily);
  if (insertAt < 0) insertAt = out.length;

  const extra: string[] = [];
  const extraSeen = new Set<string>(seen);
  for (const f of additions) pushInto(extra, f, extraSeen);

  return [...out.slice(0, insertAt), ...extra, ...out.slice(insertAt)];
}

/* ------------------------------------------------------------------ */
/* family → cmap 索引。                                             */
/* ------------------------------------------------------------------ */

/**
 * 已掌握 cmap 的字體（內嵌字體 + 用戶導入字體）。
 *
 * 有 cmap 就不需要 Canvas —— 見 defaultGlyphCheck 的兩段式說明。
 * 沒有 cmap 的（系統字體）自然落到第二段降級路徑。
 */
const cmapIndex = new Map<string, FontCmap>();

/** 索引條目上限。防止病態 vault（數百款字體）把常駐記憶體撐爆 */
const MAX_CMAP_ENTRIES = 64;

/**
 * 登錄某 family 的 cmap。
 *
 * 傳 null = 撤銷登錄（字體被刪、或確定讀不到），之後該 family 會退回 Canvas 降級。
 * 注意語義：**沒有 cmap ≠ 這款字體不支援**，只是「我們不知道」—— 所以讀不到
 * 把「不知道」當成「不支援」會害使用者拿到一個選了卻沒反應的字體設定。
 */
export function setFontCmapEntry(family: string, cmap: FontCmap | null): void {
  const k = familyKey(family ?? "");
  if (!k) return;
  if (cmap) {
    // 超過上限時就不再收新條目（舊條目保持有效），呼叫端降級到 Canvas。
    if (!cmapIndex.has(k) && cmapIndex.size >= MAX_CMAP_ENTRIES) return;
    cmapIndex.set(k, cmap);
  } else {
    cmapIndex.delete(k);
  }
}

/** 清空索引。FontManager.refresh() 重建時用它避免殘留已刪除字體的條目 */
export function clearFontCmapIndex(): void {
  cmapIndex.clear();
}

/** 某 family 是否已掌握 cmap（診斷 / 測試用） */
export function hasFontCmap(family: string): boolean {
  return cmapIndex.has(familyKey(family ?? ""));
}

/** 當前索引規模（診斷用） */
export function fontCmapIndexSize(): number {
  return cmapIndex.size;
}

/* ------------------------------------------------------------------ */
/* family → GSUB 能力 / 縱向度量 索引                                */
/* ------------------------------------------------------------------ */

/**
 * 已掌握 GSUB 特徵的字體。
 *
 * **三態**是有意的，與上面的 cmapIndex 不同：
 *  · 鍵不存在   = 沒查過（這款字體不在 vault 裡，或索引被清了）
 *  · 值為 null  = 查過了，讀不到（字體不帶 GSUB / 容器不支援 / 結構異常）
 *  · 值為物件   = 查過了，有結果
 *
 * 為什麼要留 null 這一態：`hasVertFeature(null)` 也回傳 false，若不記住
 * 「我們試過但讀不到」，呼叫端就無法把「確定沒有 vert」與「不知道」分開 ——
 * 而這兩者的處置**完全不同**（前者不降級，後者要退回白名單）。
 */
const vertIndex = new Map<string, FontFeatures | null>();

/**
 * 已掌握 `vmtx` / `VORG` 度量的字體。語義同上（缺鍵 = 沒量過）。
 */
const vmetricsIndex = new Map<string, FontVerticalMetrics>();

/** 兩張索引各自的條目上限，用意同 MAX_CMAP_ENTRIES */
const MAX_TABLE_INDEX_ENTRIES = 64;

/**
 * 登錄某 family 的 GSUB 特徵集合。傳 null = 「查過了但讀不到」。
 */
export function setFontVertEntry(family: string, features: FontFeatures | null): void {
  const k = familyKey(family ?? "");
  if (!k) return;
  if (!vertIndex.has(k) && vertIndex.size >= MAX_TABLE_INDEX_ENTRIES) return;
  vertIndex.set(k, features);
}

/**
 * 某 family 是否具備直排字形替換能力（`vert` / `vrt2`）。
 *
 * @returns true / false = **確定**值；null = 不知道（沒查過，或查過但讀不到）
 *          呼叫端見到 null 必須降落級路徑（通常是族名白名單）。
 */
export function fontVertVerdict(family: string): boolean | null {
  const k = familyKey(family ?? "");
  if (!k || !vertIndex.has(k)) return null;
  const f = vertIndex.get(k) ?? null;
  return f === null ? null : hasVertFeature(f);
}

/** 清空 GSUB 能力索引。FontManager.refresh() 用它避免已刪除字體殘留 */
export function clearFontVertIndex(): void {
  vertIndex.clear();
}

/** 當前索引規模（診斷用） */
export function fontVertIndexSize(): number {
  return vertIndex.size;
}

/** 登錄某 family 的縱向度量。傳 null = 撤銷登錄 */
export function setFontVMetricsEntry(family: string, metrics: FontVerticalMetrics | null): void {
  const k = familyKey(family ?? "");
  if (!k) return;
  if (metrics) {
    if (!vmetricsIndex.has(k) && vmetricsIndex.size >= MAX_TABLE_INDEX_ENTRIES) return;
    vmetricsIndex.set(k, metrics);
  } else {
    vmetricsIndex.delete(k);
  }
}

/**
 * 某 family 的縱向度量。
 *
 * @returns undefined = 沒量過（呼叫端應降級到 DOM 度量 / 目標節距）
 */
export function fontVMetrics(family: string): FontVerticalMetrics | undefined {
  const k = familyKey(family ?? "");
  return k ? vmetricsIndex.get(k) : undefined;
}

/** 清空縱向度量索引 */
export function clearFontVMetricsIndex(): void {
  vmetricsIndex.clear();
}

/** 當前索引規模（診斷用） */
export function fontVMetricsIndexSize(): number {
  return vmetricsIndex.size;
}

/* ------------------------------------------------------------------ */
/* 默認探測器                                                          */
/* ------------------------------------------------------------------ */

/**
 * 瀏覽器側默認的「能否渲染」判定 —— **兩段式**。
 *
 * 第一段：查 cmap（若該字體的 cmap 已登錄）。這是**確定的答案**：
 * 不需要瀏覽器、不需要拿「必定不存在的 family」當參照物，也不受「多款字體
 * 都能渲染同一碼位」的干擾 —— 那正是 Canvas 做法答不了的問題。
 *
 * 第二段降級：cmap 未在手中（系統字體）時退回 Canvas 度量比較；
 * Canvas 也不可用（Node / 無 Canvas）→ document.fonts.check（寬松）。
 *
 * ⚠️ 兩段的語義**不完全等價**，這是刻意的改進而非相容性 Breaking：
 *    Canvas 段有一條「系統兜底能渲染就寬松放行 true」的分支（使用者不痛），
 *    cmap 段則嚴格按「字體有沒有這個字形」回答。換句話說，同一 family 在
 *    掌握 cmap 前後可能從 true 變 false —— 那是因為原先那次 true 是**猜的**。
 *    誤收的字體不進棧不會造成缺字（base stack 仍有通用族兜底），
 *    誤收才會造成「指定了 A 卻畫成 B」。
 */
export function defaultGlyphCheck(family: string, sample: string): boolean {
  const cmap = cmapIndex.get(familyKey(family ?? ""));
  if (cmap) return cmapHasText(cmap, sample);

  const verdict = glyphSupported(family, sample);
  if (verdict !== null) return verdict;
  try {
    if (typeof document !== "undefined" && document.fonts) {
      const escaped = family.replace(/([\\"])/g, "\\$1");
      return document.fonts.check(`16px "${escaped}"`, sample);
    }
  } catch {
    /* ignore */
  }
  return false;
}

export interface BuildFontStackOptions {
  /** 字形支援判定；省略時用 defaultGlyphCheck */
  check?: (family: string, sample: string) => boolean;
  /** 候選用戶字體族；省略時取運行時清單 */
  candidates?: readonly string[];
  /** 用戶顯式指定的 family；省略時取運行時 override */
  override?: string | null;
}

export function scriptSampleChar(script: ScriptId): string {
  return SCRIPT_SAMPLE_CHAR[script] ?? "A";
}

/**
 * 組裝某文種的最終字體棧。
 *
 * - 有用戶 override：直接置頂，不再猜
 * - 否則：對每個候選字體跑覆蓋率探測，能渲染該文種樣本字的按原順序插進棧
 * - Node / 非瀏覽器環境：check 全 false，等價於返回原 fontStack（無損降級）
 */
export function buildScriptFontStack(script: ScriptId, opts: BuildFontStackOptions = {}): string[] {
  const base = (SCRIPTS[script]?.fontStack ?? []).slice();
  // null 與 undefined 都表示「沒指定」→ 查運行時 override。
  // 要顯式關掉必須傳空字串，而不是 null —— 否則呼叫端無從表達「沿用設定」。
  const explicit = opts.override ?? null;
  const override = (explicit || getFontOverride(script) || "").trim();
  if (override) {
    // 用戶都明確指定了，就該排第一 —— 而不是像探測來的字體那樣排在既有項之後。
    // 否則指定形同無效。
    // （以前蘭札此處會被吃掉：棧首手寫 "Nithya Ranjana"、卻指定取自
    //   name 表的 "Nithya Ranjana DU"。棧首家已改為真實族名，此分支仍保留。）
    const key = familyKey(override);
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const f of [override, ...base.filter((x) => familyKey(x) !== key)]) {
      const k = familyKey(f);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      merged.push(f.trim());
    }
    return merged;
  }

  const check = opts.check ?? defaultGlyphCheck;
  const candidates = opts.candidates ?? customFamilies;
  if (!candidates.length) return base;

  const sample = scriptSampleChar(script);
  const covered: string[] = [];
  for (const fam of candidates) {
    let ok: boolean;
    try {
      ok = check(fam, sample);
    } catch {
      ok = false;
    }
    if (ok) covered.push(fam);
  }
  if (!covered.length) return base;
  return mergeFontStack(base, covered);
}

/**
 * 覆蓋率報告（設定頁用）：每個文種有哪些候選字體能渲染。
 * 純函數，check 由呼叫端注入（瀏覽器環境才有意義）。
 */
export interface CoverageEntry {
  script: ScriptId;
  sample: string;
  supported: string[];
}

export function coverageReport(
  scripts: readonly ScriptId[],
  candidates: readonly string[],
  check: (family: string, sample: string) => boolean
): CoverageEntry[] {
  return scripts.map((s) => {
    const sample = scriptSampleChar(s);
    const supported: string[] = [];
    for (const fam of candidates) {
      let ok: boolean;
      try {
        ok = check(fam, sample);
      } catch {
        ok = false;
      }
      if (ok) supported.push(fam);
    }
    return { script: s, sample, supported };
  });
}
