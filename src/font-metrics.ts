// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

import { hasUsableAdvance } from "./font-vmetrics";
import { docCreateEl } from "./dom-win";

// activeDocument（obsidian 官方 API；彈出窗安全）。本檔被無 obsidian alias 的 esbuild
// 測試 bundle 載入，不可靜態 import obsidian——以 typeof 守衛回退全域 document（headless/Node 下 activeDocument 未定義）。
const activeDoc = (): Document => (typeof activeDocument !== "undefined" ? activeDocument : document);

/**
 * 字體度量自適應（Font Metrics Auto-Fit）
 *
 * 問題：用戶系統字體多種多樣。插件的直排排版假設（點號 vert 形式、字形步進 ≈ 1em）
 * 在字體不符時會失效：
 *  - 字體無 vmtx → 直排步進 = hhea asc+desc（如彝文 1.362em）→ 字距過寬
 *  - 字體無 vert 特徵 → 標點停留在橫排位置 → 違反 GB 直排標準
 *  - 系統根本沒有 CJK 字形 → tofu
 *
 * 解法（全部客戶端、零網絡）：
 *  1. 度量：在隱藏元素上實測當前字體棧的直排步進（em）
 *  2. 校正：--li-ls-fix = 目標節距 − 實測步進（夾限 [-1.0, 1.0]），使排版回到標準節距
 *  3. vert 回退：字體棧解析結果不具備 vert 能力時，自動啓用幾何居中（.li-punct）
 *  4. tofu 偵測：字體棧內無任何字體能渲染樣本字 → 通知用戶安裝（設置頁字體區可裝）
 *
 * 純函數可測；DOM 函數帶環境守衛。
 */

/** 已知具備 vert/vrt2 直排特徵的字體族關鍵字（大小寫不敏感子串匹配） */
export const VERT_CAPABLE_MARKS = [
  "noto serif cjk", "noto sans cjk", "noto serif sc", "noto serif tc", "noto serif jp",
  "noto sans sc", "noto sans tc", "noto sans jp", "source han", "思源",
  "songti", "simsun", "stsong", "pmingliu", "mingliu", "dfkai",
  "microsoft jhenghei", "microsoft yahei", "ms mincho", "yu mincho", "yu gothic",
  "hiragino", "meiryo", "ipaex", "takao",
  "malgun gothic", "apple sd gothic neo", "nanum", "pingfang", "heurika",
];

/** 各文種的直排目標節距（em）：CJK 標準 = 全角 em 方格；彝文墨高 0.74em → 0.85 更舒適 */
export const SCRIPT_PITCH_TARGET_EM: Record<string, number> = {
  han: 1.0, hant: 1.0, ja: 1.0, ko: 1.0, yi: 0.85,
  mongolian: 1.0, manchu: 1.0, xibe: 1.0, olduyghur: 1.0,
  latin: 0.5, arabic: 0, hebrew: 0,
};

export interface FontFitDiagnostics {
  resolvedFamily: string | null;
  canRender: boolean;
  vertCapable: boolean;
  vertFallbackApplied: boolean;
  measuredAdvanceEm: number | null;
  fixEm: number | null;
  /** `vertCapable` 是怎麼來的 —— 「字體說的」還是「名字猜的」 */
  vertSource: VertSource;
  /** `measuredAdvanceEm` 走的是三級降級的哪一級 */
  advanceSource: AdvanceSource;
}

/**
 * `vert` 能力的判定來源。
 *  · `binary`    讀了字體的 GSUB FeatureList，**確定**有或沒有
 *  · `whitelist` 讀不到二進位（系統字體）→ 退回族名子串白名單，這是**猜**的
 *  · `none`      兩者都說不具備（或根本沒解析出 family）
 */
export type VertSource = "binary" | "whitelist" | "none";

/**
 * 直排步進的取得來源（三級降級）。
 *  · `vmtx`   字體二進位的 `vmtx` 眾數步進 —— 確定值
 *  · `dom`    隱藏元素實測 —— 確定了但混了瀏覽器行為
 *  · `target` 兩者都拿不到，直接採用文種目標節距（＝不校正）
 */
export type AdvanceSource = "vmtx" | "dom" | "target";

/**
 * 可注入的版權政策探針。
 *
 * 為什麼用注入而不是直接 import `font-registry`：`font-registry` 已經依賴本檔
 * （它要用 `glyphSupported`），反向 import 會形成循環依賴。而本檔是純度量層，
 * 不該知道「vault 裡有哪些字體」這類註冊表的事 —— 那正是 `FontManager` 的活。
 * 注入還有個附帶好處：單測可以不建真字體就驗證三級降級的每一級。
 *
 * 兩個探針的「null」都代表**不知道**，呼叫端（通常是 view.ts）要能區分
 * 「確定沒有」與「不知道」—— 這正是 `fontVertVerdict()` 的回傳契約。
 */
export interface FontFitProbes {
  /** `vert` / `vrt2` 能力；null = 不知道，本檔會退回白名單 */
  vert?: (family: string) => boolean | null;
  /** 直排步進（em）；null = 拿不到，本檔會退回 DOM 度量 */
  verticalAdvance?: (family: string) => number | null;
}

/** 家族名是否具備 vert 能力（子串匹配） */
export function isFamilyVertCapable(family: string): boolean {
  const f = family.toLowerCase();
  return VERT_CAPABLE_MARKS.some((m) => f.includes(m));
}

/* ------------------------------------------------------------------ */
/* 字形支援探測。                                                    */
/* ------------------------------------------------------------------ */

/** 必定不存在的 family：用來取得「系統兜底字體」的度量基準 */
const ABSENT_FAMILY = "__li_probe_absent__";
/** U+FFFE 是 Unicode 保證的非字符：任何字體都只會給出 notdef 方框 */
const NOTDEF_CHAR = "￾";
const PROBE_SIZE_PX = 72;
/** 度量容差：不同度量引擎有亞像素差異 */
const PROBE_EPS = 0.5;

function measureWith(ctx: CanvasRenderingContext2D, family: string, sample: string): number {
  // 刻意**不加**通用族兜底：一旦寫 `72px "X", serif`，缺字會被 serif 補上，
  // 度量差異消失，探測就失效了。
  ctx.font = `${PROBE_SIZE_PX}px "${cssEscapeFamily(family)}"`;
  const m = ctx.measureText(sample);
  return typeof m?.width === "number" ? m.width : 0;
}

/** 極簡 family 逃逸（無正則回溯風險）：只處理引號與反斜線 */
function cssEscapeFamily(family: string): string {
  return family.replace(/[\\"]/g, (c) => `\\${c}`);
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= PROBE_EPS;
}

let cachedProbeCtx: CanvasRenderingContext2D | null | undefined;

function probeContext(): CanvasRenderingContext2D | null {
  if (cachedProbeCtx !== undefined) return cachedProbeCtx;
  cachedProbeCtx = null;
  try {
    if (typeof document === "undefined") return null;
    const c = docCreateEl(activeDoc(), "canvas");
    const ctx = c.getContext?.("2d") ?? null;
    cachedProbeCtx = ctx;
  } catch {
    cachedProbeCtx = null;
  }
  return cachedProbeCtx;
}

/**
 * 判斷某 family 是否真的有 `sample` 的字形。
 *
 * 為什麼不直接用 `document.fonts.check()`：該 API 對**系統裡不存在**的 family
 * 也返回 true（它不知道自己失敗了，因為瀏覽器已悄悄 fallback）。
 * 用它做「能不能渲染」的閘門，等於閘門永遠開著。
 *
 * 做法：拿 Canvas 度量做三方比對 ——
 *  1. 系統兜底字體渲染 sample 的寬度 == 渲染 notdef 的寬度
 *     → 系統自己也顯示不出來（豆腐），此時必須靠 2 判定
 *  2. 目標 family 渲染 sample 的寬度若仍 == notdef 寬度 → 缺字
 *  3. 若系統兜底已經能渲染（寬度 != notdef 寬度）→ 用戶不痛，寬松放行 true
 *
 * @returns true/false；環境不可用（Node / 無 Canvas）時返回 null
 */
export function glyphSupported(family: string, sample: string): boolean | null {
  try {
    const ctx = probeContext();
    if (!ctx || !family.trim() || !sample) return null;
    const fallbackWidth = measureWith(ctx, ABSENT_FAMILY, sample);
    const notdefWidth = measureWith(ctx, ABSENT_FAMILY, NOTDEF_CHAR);
    if (fallbackWidth <= 0 || notdefWidth <= 0) return null;
    if (!near(fallbackWidth, notdefWidth)) return true; // 系統已能渲染
    const actual = measureWith(ctx, family, sample);
    if (actual <= 0) return null;
    return !near(actual, notdefWidth);
  } catch {
    return null;
  }
}

/**
 * 字體棧解析：返回第一個能渲染 sample 的家族名；全部不能 → null。
 * 非瀏覽器環境返回 null。
 *
 * @param probe 字形支援探測器，注入以便單測；省略時走 Canvas 探測，
 *              Canvas 不可用則降級到 document.fonts.check（寬松）。
 */
export function firstAvailableFamily(
  stack: string[],
  sample: string,
  probe: (family: string, sample: string) => boolean | null = glyphSupported
): string | null {
  try {
    if (typeof document === "undefined") return null;
    // 效能：字體棧解析快取——glyphSupported 探測要逐族建探測元素，
    // 對同一 (stack, sample) 結果確定（字體安裝狀態會話中不變）。key 失效場景
    // （使用者裝/卸字體）需重載即可，權衡划算。
    const cacheKey = `${stack.join(",")}|${sample}`;
    const cached = familyResolveCache.get(cacheKey);
    if (cached !== undefined) return cached;
    let resolved: string | null = null;
    for (const fam of stack) {
      const f = fam.trim();
      if (!f) continue;
      try {
        const verdict = probe(f, sample);
        if (verdict === true) { resolved = f; break; }
        if (verdict === false) continue;
        // verdict === null：探測器不可用 → 降級
        if (!activeDoc().fonts) continue;
        if (activeDoc().fonts.check(`16px "${cssEscapeFamily(f)}"`, sample)) { resolved = f; break; }
      } catch {
        /* 個別家族名非法 → 跳過 */
      }
    }
    if (familyResolveCache.size >= FAMILY_RESOLVE_CACHE_MAX) familyResolveCache.clear();
    familyResolveCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return null;
  }
  return null;
}

/**
 * 度量字體在直排（vertical-rl）下的每字符步進（em）。
 * 原理：隱藏元素重複 sample(repeats 次)，量元素高 ÷ repeats ÷ 字號。
 * 非瀏覽器環境返回 null。
 */
const FAMILY_RESOLVE_CACHE_MAX = 64;
const familyResolveCache = new Map<string, string | null>();

/**
 * 效能：直排步進量測快取。
 * key = `family|sizePx|sample`。量測要建隱藏 probe + 強制同步 layout（實測進直排
 * 每次切換 ~30-50ms 花在這），但對同一 (family, sizePx, sample) 結果是確定值——
 * 字體不會在會話中途改變步進。上限 64 條，超出新條目時清空（字體棧組合有限，
 * 實務上到不了）。
 * 以 document 實例為外層 key（WeakMap）：同一 document 內快取有效；測試換用
 * fake document 時自然 miss，不會跨環境污染（test/font-vertical-metrics.mjs
 * 的折疊字體案例依賴「換 document 後重新量測」）。
 */
const vAdvanceCache = new WeakMap<object, Map<string, number | null>>();
const VADVANCE_CACHE_MAX = 64;

export function measureVerticalAdvanceEm(family: string, sizePx: number, sample: string, repeats = 8): number | null {
  if (typeof document === "undefined" || !activeDoc().body) return measureVerticalAdvanceUncached(family, sizePx, sample, repeats);
  let cache = vAdvanceCache.get(activeDoc());
  if (!cache) { cache = new Map(); vAdvanceCache.set(activeDoc(), cache); }
  const key = `${family}|${sizePx}|${sample}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const value = measureVerticalAdvanceUncached(family, sizePx, sample, repeats);
  if (cache.size >= VADVANCE_CACHE_MAX) cache.clear();
  // null＝「量不到」（host 未布局／字體未就緒），是**暫態**而非確定值，
  // 不入緩存——否則啟動早期的 null 死鎖後續所有補跑（cache.has 直接命中返回 null）。
  // 0 是真實測量值（折疊字體），照舊緩存。
  if (value !== null) cache.set(key, value);
  return value;
}

/**
 * 繞過緩存的強制重量路徑——applyNativeFontFit 的退避重試專用。
 * 重試的語義就是「上次量不到，環境可能已就緒，重新量」；若仍走緩存會拿到上次的
 * null（雖不再緩存 null，但防禦性地保留繞道路徑，語義明確）。
 */
export function measureVerticalAdvanceFresh(family: string, sizePx: number, sample: string, repeats = 8): number | null {
  return measureVerticalAdvanceUncached(family, sizePx, sample, repeats);
}

function measureVerticalAdvanceUncached(family: string, sizePx: number, sample: string, repeats = 8): number | null {
  try {
    if (typeof document === "undefined" || !activeDoc().body) return null;
    const probe = docCreateEl(activeDoc(), "div");
    probe.style.cssText = [
      "position:absolute", "left:-9999px", "top:-9999px",
      "writing-mode: vertical-rl", "text-orientation: mixed",
      `font-family: ${family}`, `font-size: ${sizePx}px`,
      "line-height: 1", "letter-spacing: 0", "margin: 0", "padding: 0",
      "visibility: hidden", "white-space: nowrap",
    ].join(";");
    probe.textContent = sample.repeat(repeats);
    activeDoc().body.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    if (rect.height > 0) return rect.height / repeats / sizePx;
    // 修復（折疊字體）：部分字體（實測 WenQuanYi 等）在 Chromium 直排下
    // 步進為 0——整串字重疊於同一點（使用者回報「文字相互重疊」的根因型態）。
    // 只要探針確有佈局（寬度 > 0），0 就是**真實量測值**而非常「量不到」，
    // 必須原樣回報，讓上層以 letter-spacing 補償回目標節距。
    if (rect.width > 0) return 0;
    return null;
  } catch {
    return null;
  }
}

/**
 * 字距校正量（em）：使「實測步進 + 用戶字距 + 校正」= 目標節距 + 用戶字距
 * 即 fix = target − measured（用戶字距爲加在目標上的意圖，保持不變）。
 * 夾限 [-1.0, 1.0]：下界防極端字體負疊字；上界必須容得下
 * 「步進 0 的折疊字體補回 1em」（修復——舊 ±0.6 補不滿，仍會重疊 40%）。
 */
export function computeLsFixEm(measuredAdvanceEm: number, targetEm: number, clampMin = -1.0, clampMax = 1.0): number {
  const fix = targetEm - measuredAdvanceEm;
  return Math.max(clampMin, Math.min(clampMax, fix));
}

/** 環境守衛版：對舞台元素執行完整字體適配（度量 + 設定 --li-ls-fix），返回診斷 */
export function fitTypographyToElement(
  el: { style: { setProperty: (k: string, v: string) => void } },
  scriptId: string,
  fontStack: string[],
  typo: { fontSizePt: number; letterSpacingEm: number; autoFitMetrics?: boolean },
  sampleChar: string,
  probes: FontFitProbes = {}
): FontFitDiagnostics {
  const diag: FontFitDiagnostics = {
    resolvedFamily: null, canRender: false, vertCapable: false,
    vertFallbackApplied: false, measuredAdvanceEm: null, fixEm: null,
    vertSource: "none", advanceSource: "target",
  };
  if (typeof document === "undefined") return diag;
  const family = firstAvailableFamily(fontStack, sampleChar);
  diag.resolvedFamily = family;
  diag.canRender = family !== null;
  diag.vertCapable = false;
  diag.vertSource = resolveVertSource(family, probes.vert, (v) => {
    diag.vertCapable = v;
  });
  if (family === null) return diag;
  if (typo.autoFitMetrics === false) return diag;

  const target = SCRIPT_PITCH_TARGET_EM[scriptId] ?? 1.0;

  // 直排步進三級降級：字體二進位（vmtx）→ DOM 實測 → 目標節距。
  //
  // 第一級是新加的，也是唯一確定的一級：只要 FontManager 讀過這款字體的位元組，
  // `vmtx` 的眾數步進就在索引裡，既不靠瀏覽器也不靠佈局。系統字體讀不到位元組
  // （瀏覽器沒有 Local Font Access API），只能退到第二級 —— 這限制無法繞過，
  // 能在這裡做的是**明確記錄走了哪一級**（diag.advanceSource），別讓它悄悄發生。
  let measured: number | null = null;
  let source: AdvanceSource = "target";
  // 可用性判據集中在 font-vmetrics.hasUsableAdvance，此處不手抄 `> 0` 檢查
  const binaryMetrics = family !== null && probes.verticalAdvance
    ? { advanceEm: probes.verticalAdvance(family) }
    : null;
  if (hasUsableAdvance(binaryMetrics)) {
    measured = binaryMetrics?.advanceEm ?? null;
    source = "vmtx";
  } else {
    const fromDom = measureVerticalAdvanceEm(family, typo.fontSizePt * (96 / 72), sampleChar);
    if (fromDom !== null) {
      measured = fromDom;
      source = "dom";
    }
  }
  diag.advanceSource = source;

  // 連 DOM 都量不到（Node / 隱藏元素被擋）→ 不輸出 --li-ls-fix，等同採目標節距。
  if (measured === null) return diag;
  diag.measuredAdvanceEm = measured;
  // fix 修正「字體自身步進」；用戶 letterSpacingEm 額外疊加（CSS 已含）
  const fix = computeLsFixEm(measured, target);
  diag.fixEm = fix;
  el.style.setProperty("--li-ls-fix", `${fix.toFixed(4)}em`);
  return diag;
}

/**
 * `vert` 能力三級判定，回傳實際採用的來源並透過 `set` 寫回結果。
 *
 * 注意第一級的優先順序：**二進位說了就算，哪怕它跟白名單打架**。
 * 這不是武斷 —— 白名單比對的是字體「叫什麼」，GSUB 記錄的是字體「能做什麼」，
 * 兩者衝突時當然信後者。一款名叫 "Noto Serif CJK" 卻沒有 vert 表的字體，
 * 一律該走幾何居中兜底，而不是因為名字好聽就放行。
 */
function resolveVertSource(
  family: string | null,
  probe: ((family: string) => boolean | null) | undefined,
  set: (v: boolean) => void
): VertSource {
  if (family === null) return "none";
  const verdict = probe ? probe(family) : null;
  if (verdict !== null) {
    set(verdict);
    return "binary";
  }
  if (isFamilyVertCapable(family)) {
    set(true);
    return "whitelist";
  }
  set(false);
  return "none";
}
