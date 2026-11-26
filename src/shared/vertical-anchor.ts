// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 直排座標服務 —— 供辭典彈窗在直排上下文正確定位。
 *
 * ## 為什麼需要
 *
 * lilium 辭典的懸停彈窗定位（hover-lookup.ts §position）是**純水平邏輯**：
 *   left = anchor.left            （彈窗左緣對齊詞左緣）
 *   top  = anchor.bottom + OFFSET （彈窗置於詞的下方）
 *
 * 這在橫排下正確，但在直排下會錯位：
 *  - 直排（vertical-rl）中，一個詞的 rect 是**窄而高**的（寬≈1 字寬，高=詞長），
 *    而彈窗是**寬而扁**的（如 300×80）。把彈窗放在詞的「下方」，會遮住同列後續
 *    文字，且水平方向無處安放（詞寬僅約 20px）。
 *  - 使用者閱讀直排時視線沿列向下、換列向左移動，彈窗應避開閱讀流。
 *
 * ## A1 路線下的形態
 *
 * 本模組為**內部共享模組**（src/shared/），合併後由 dict 模組直接 import 呼叫，
 * 不掛 window.liVertical——那是雙插件路線的跨插件通訊機制。核心演算法相同。
 *
 * ## 設計要點
 *
 * - 純計算與 DOM 判定分離：`computePopupPlacement` 為純函式，可在 Node 中單測；
 *   `isVerticalContext` / `getReadingAnchor` 需 DOM。
 * - 任何異常都回傳安全的降級值，絕不讓彈窗崩潰或飛出視口。
 */

/** 排版軸 */
export type LayoutAxis = "vertical" | "horizontal";

/**
 * lilium 的直排模式標記（見 styles.css 與 main.ts applyEditorMode）。
 *
 * 注意：lilium **不是**只用 writing-mode 切換。真實機制是：
 *   - `body.li-editor-vertical-active`  直排模式已開啟
 *   - `body.li-editor-horizontal-active` 當前文種本身是橫排文種（拉丁等），
 *     即使直排模式開啟也應走橫排定位
 *   - CSS 變數 `--li-editor-writing-mode`（在 body 上）給出實際值，
 *     由 `.cm-scroller` / `.markdown-preview-view` 以 `writing-mode: var(...)` 取用
 *
 * 因此本模組除了讀 computed writing-mode，也必須認得這兩個 body 類與變數，
 * 否則「直排模式下打開一篇橫排文種的筆記」會被誤判。
 */
const LI_VERTICAL_ACTIVE_CLASS = "li-editor-vertical-active";
const LI_HORIZONTAL_ACTIVE_CLASS = "li-editor-horizontal-active";
const LI_WRITING_MODE_VAR = "--li-editor-writing-mode";

/** 直排列序：vertical-rl（從右往左換列）或 vertical-lr（從左往右） */
export type ColumnOrder = "rl" | "lr";

/** 錨點矩形（視口座標，含排版資訊） */
export interface ReadingAnchor {
  /** 被查詢詞/元素的矩形（視口座標） */
  rect: { left: number; top: number; right: number; bottom: number };
  /** 排版軸 */
  axis: LayoutAxis;
  /** 直排列序；橫排時為 rl（無意義，僅為型別完整） */
  columnOrder: ColumnOrder;
  /**
   * 正文欄水平邊界（B1 content bounds 夾逼；可選）。
   * 來源：呼叫方偵測的「可讀文本欄」左/右緣（視口座標）。給定時彈窗水平位置
   * 嚴格夾進 [left, right]（寬度不足時改為欄內居中），不再壓到側欄/邊距；
   * 未給定時維持原視口 clamp 行為（canonical 默認零變化）。
   */
  contentBounds?: { left: number; right: number };
}

/** 彈窗擺放結果 */
export interface PopupPlacement {
  left: number;
  top: number;
  /** 實際採用的方向，便於除錯與樣式微調 */
  placement: "below" | "above" | "left" | "right" | "center";
}

/**
 * 彈窗與錨點的間距（px）。
 *
 * 沿用 UD `hover-lookup.ts` 的 `POPUP_OFFSET = 6`，確保橫排下的座標與上游
 * 逐像素一致（見 test/vertical-anchor.mjs【7】零回歸門禁）；
 * 直排下同一間距施加於水平方向。
 */
export const POPUP_GAP = 6;
/** 視口邊界安全距離（px）；與 UD position() 的 8 一致 */
export const VIEWPORT_MARGIN = 8;

/**
 * 計算直排/橫排下的彈窗座標。純函式，無 DOM 依賴。
 *
 * 橫排策略（沿用原邏輯並補強邊界）：
 *   置於錨點下方；下方空間不足則翻到上方；再不足則貼視口底部。
 *
 * 直排策略（新增）：
 *   優先置於當前列的**換列方向側**（vertical-rl → 詞的左側；vertical-lr → 右側），
 *   垂直方向對齊錨點頂部——這樣彈窗落在已讀過的列上，不遮擋未讀內容，
 *   且視線移動最短。該側空間不足則改到另一側；兩側皆不足則水平置中。
 *
 * @param anchor  錨點（由 getReadingAnchor 取得）
 * @param popupW  彈窗寬度（px）
 * @param popupH  彈窗高度（px）
 * @param vw      視口寬度（px）
 * @param vh      視口高度（px）
 */
export function computePopupPlacement(
  anchor: ReadingAnchor,
  popupW: number,
  popupH: number,
  vw: number,
  vh: number
): PopupPlacement {
  const { axis, columnOrder } = anchor;
  const m = VIEWPORT_MARGIN;

  // 參數防護：NaN / 負值會讓後續比較全為 false，導致彈窗飛出視口
  const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);
  const w = num(popupW, 300) > 0 ? num(popupW, 300) : 300;
  const h = num(popupH, 80) > 0 ? num(popupH, 80) : 80;
  const W = num(vw, 1024) > 0 ? num(vw, 1024) : 1024;
  const H = num(vh, 768) > 0 ? num(vh, 768) : 768;
  const r = {
    left: num(anchor.rect?.left, 0),
    top: num(anchor.rect?.top, 0),
    right: num(anchor.rect?.right, num(anchor.rect?.left, 0)),
    bottom: num(anchor.rect?.bottom, num(anchor.rect?.top, 0)),
  };

  const clampX = (x: number) => Math.min(Math.max(x, m), Math.max(m, W - w - m));
  const clampY = (y: number) => Math.min(Math.max(y, m), Math.max(m, H - h - m));

  // B1 content bounds 夾逼：給定正文欄邊界時，水平座標先夾進欄內
  // （欄寬不足時改為欄內居中），再走各分支的視口 clamp 作最後安全網。
  // 純函式共用——直排/橫排分支的水平結果一律經此收斂。
  const bounds = anchor.contentBounds;
  const bl = bounds && Number.isFinite(bounds.left) ? Math.max(bounds.left, m) : 0;
  const br = bounds && Number.isFinite(bounds.right) ? Math.min(bounds.right, W - m) : 0;
  const boundsValid = bounds !== undefined && br - bl > 0;
  const clampToBounds = (x: number): number => {
    if (!boundsValid) return x;
    if (br - bl < w) return bl + (br - bl - w) / 2; // 欄比彈窗窄：欄內居中（允許微溢，視口 clamp 兜底）
    return Math.min(Math.max(x, bl), br - w);
  };

  if (axis === "vertical") {
    // 垂直對齊錨點頂部，並限制在視口內
    const top = clampY(r.top);

    // 換列方向側：vertical-rl 向左換列，vertical-lr 向右換列
    const forwardIsLeft = columnOrder === "rl";
    const leftSide = r.left - POPUP_GAP - w;
    const rightSide = r.right + POPUP_GAP;

    const primary = forwardIsLeft ? leftSide : rightSide;
    const secondary = forwardIsLeft ? rightSide : leftSide;

    if (primary >= m && primary + w <= W - m) {
      return { left: clampToBounds(primary), top, placement: forwardIsLeft ? "left" : "right" };
    }
    if (secondary >= m && secondary + w <= W - m) {
      return { left: clampToBounds(secondary), top, placement: forwardIsLeft ? "right" : "left" };
    }
    // 兩側皆不足：水平置中
    return { left: clampToBounds(clampX((W - w) / 2)), top, placement: "center" };
  }

  // 橫排：沿用 position() 的水平策略（右緣溢出時右對齊到錨點右緣），
  // 再鉗進視口；下方優先，不足翻上
  let left = r.left;
  if (left + w > W - m) left = Math.max(m, r.right - w);
  left = clampToBounds(clampX(left));

  const below = r.bottom + POPUP_GAP;
  if (below + h <= H - m) return { left, top: clampY(below), placement: "below" };

  const above = r.top - POPUP_GAP - h;
  if (above >= m) return { left, top: clampY(above), placement: "above" };

  return { left, top: clampY(H - h - m), placement: "below" };
}

/** 從 computed writing-mode 字串判斷排版軸（容錯各種前綴與別名） */
export function axisFromWritingMode(wm: string | undefined | null): LayoutAxis | null {
  if (!wm) return null;
  const v = wm.trim().toLowerCase();
  if (v.startsWith("vertical")) return "vertical";
  if (v.startsWith("horizontal") || v === "lr-tb" || v === "rl-tb") return "horizontal";
  // 舊式別名（SVG / 早期草案）
  if (v === "tb-rl" || v === "tb-lr" || v === "bt-rl" || v === "bt-lr") return "vertical";
  return null;
}

/** 從 writing-mode 字串判斷直排列序 */
export function columnOrderFromWritingMode(wm: string | undefined | null): ColumnOrder {
  const v = (wm || "").trim().toLowerCase();
  // vertical-lr / tb-lr / bt-lr → 從左往右換列
  if (v.includes("lr")) return "lr";
  return "rl"; // vertical-rl 為預設（中日韓傳統）
}

/**
 * 便捷封裝：量測彈窗實際尺寸 → 計算座標 → 寫入 style。
 *
 * 上游（`hover-lookup.ts` 的 `position()`）的 15 行手寫邏輯可整段替換為：
 * ```ts
 * private position(): void {
 *   if (!this.popupEl || !this.anchorRect) return;
 *   applyPopupPosition(this.popupEl, this.anchorRect, this.anchorEl);
 * }
 * ```
 * 呼叫方需多保存一個 `anchorEl`（詞所在的 DOM 元素），供直排上下文判定；
 * 若不傳則退化為純橫排行為，與上游完全一致。
 *
 * @param popupEl 彈窗元素
 * @param anchorRect 被查詢詞的矩形（視口座標）
 * @param anchorEl 被查詢詞的元素（可選；用於判定直排上下文）
 * @returns 實際採用的擺放結果；**錨點失效時回傳 null**（呼叫方應隱藏彈窗）。
 *          這是直排↔橫排切換後不殘留錯位彈窗的關鍵。
 */
export function applyPopupPosition(
  popupEl: HTMLElement | null | undefined,
  anchorRect: { left: number; top: number; right: number; bottom: number } | null | undefined,
  anchorEl?: HTMLElement | null,
  contentBounds?: { left: number; right: number }
): PopupPlacement | null {
  if (!popupEl || typeof popupEl !== "object" || !anchorRect) return null;

  // 0. 錨點失效（DOM 重建 / 元素移除 / 尺寸歸零）→ 隱藏彈窗，不做定位
  if (isAnchorStale(anchorEl, anchorRect)) {
    try {
      popupEl.addClass("li-u-invisible");
    } catch { /* 忽略 */ }
    return null;
  }

  // 1. 由錨點元素判定排版上下文；無元素則退化为橫排
  const anchor: ReadingAnchor = (() => {
    const a = anchorEl ? getReadingAnchor(anchorEl) : null;
    if (a) return a;
    const n = (v: number, d: number) => (Number.isFinite(v) ? v : d);
    const l = n(anchorRect.left, 0);
    const t = n(anchorRect.top, 0);
    return {
      rect: { left: l, top: t, right: n(anchorRect.right, l), bottom: n(anchorRect.bottom, t) },
      axis: "horizontal",
      columnOrder: "rl",
    };
  })();
  if (contentBounds) anchor.contentBounds = contentBounds;

  // 2. 量測彈窗
  let pw = 300, ph = 80;
  try {
    const r = popupEl.getBoundingClientRect?.();
    if (r) {
      if (Number.isFinite(r.width) && r.width > 0) pw = r.width;
      if (Number.isFinite(r.height) && r.height > 0) ph = r.height;
    }
  } catch { /* 量測失敗用預設值 */ }

  // 3. 視口
  let vw = 1024, vh = 768;
  try {
    const win = (popupEl.ownerDocument?.defaultView) || (typeof window !== "undefined" ? window : undefined);
    if (win) {
      if (Number.isFinite(win.innerWidth) && win.innerWidth > 0) vw = win.innerWidth;
      if (Number.isFinite(win.innerHeight) && win.innerHeight > 0) vh = win.innerHeight;
    }
  } catch { /* 用預設值 */ }

  const p = computePopupPlacement(anchor, pw, ph, vw, vh);

  // 4. 寫入
  try {
    if (popupEl.style) {
      popupEl.setCssStyles({ left: `${p.left}px`, top: `${p.top}px` });
      popupEl.removeClass('li-u-invisible');
    }
    // 供樣式微調（如直排下改箭頭方向）
    if (typeof popupEl.dataset === "object" && popupEl.dataset) {
      popupEl.dataset.placement = p.placement;
    }
  } catch { /* 唯讀元素等情況忽略 */ }

  return p;
}

/**
 * 判斷元素是否處於直排上下文。
 *
 * 判定順序（越靠前越優先）：
 *   1. 元素自身向上遍歷 ≤16 層的 computed writing-mode
 *   2. inline style writing-mode（computed 不可用時）
 *   3. li 專屬：`body.li-editor-horizontal-active` / `li-editor-vertical-active`
 *      + CSS 變數 `--li-editor-writing-mode`
 *   4. 矩形形狀啟發式（窄高 → 直排）
 */
export function isVerticalContext(el: HTMLElement | null | undefined): boolean {
  if (!el || typeof el !== "object") return false;
  const anc = getReadingAnchor(el);
  return anc ? anc.axis === "vertical" : false;
}

/**
 * 取得元素的閱讀錨點（含排版軸與列序）。需要 DOM 環境。
 *
 * 橫排元素直接回傳其 rect；直排元素額外標註 axis/columnOrder，
 * 供 computePopupPlacement 計算彈窗位置。
 */
export function getReadingAnchor(el: HTMLElement | null | undefined): ReadingAnchor | null {
  if (!el || typeof el !== "object") return null;
  if (typeof el.getBoundingClientRect !== "function") return null;

  let rect: { left: number; top: number; right: number; bottom: number };
  try {
    const rr = el.getBoundingClientRect();
    const n = (v: number, d: number) => (Number.isFinite(v) ? v : d);
    const l = n(rr?.left, 0);
    const t = n(rr?.top, 0);
    // right/bottom 缺失時以 left/top 兜底，避免退化為 0 寬高
    rect = { left: l, top: t, right: n(rr?.right, l), bottom: n(rr?.bottom, t) };
  } catch {
    return null;
  }

  // 向上遍歷尋找直排上下文
  let axis: LayoutAxis = "horizontal";
  let columnOrder: ColumnOrder = "rl";
  let found = false;

  let cur: HTMLElement | null = el;
  let depth = 0;
  while (cur && depth < 16) {
    // lilium 直排舞台：閱讀視圖以 CSS 類驅動，不一定有 inline writing-mode
    if (typeof cur.classList === "object" && cur.classList) {
      if (cur.classList.contains("li-stage-vertical")) {
        axis = "vertical";
        columnOrder = "rl";
        found = true;
        break;
      }
      if (cur.classList.contains("li-stage-horizontal")) {
        axis = "horizontal";
        found = true;
        break;
      }
    }

    let wm: string | undefined;
    try {
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(cur) : undefined;
      wm = cs ? (cs.getPropertyValue("writing-mode") || (cs as unknown as { writingMode?: string }).writingMode) : undefined;
      // lilium 用 `writing-mode: var(--li-editor-writing-mode)`；極少數環境 computed
      // 會回傳未解析的 var() 字面量，此時直接讀變數本身
      if (wm && wm.trim().startsWith("var(")) {
        const v = cs ? cs.getPropertyValue(LI_WRITING_MODE_VAR) : "";
        if (v) wm = v;
      }
    } catch {
      wm = undefined;
    }

    const a = axisFromWritingMode(wm);
    if (a) {
      axis = a;
      if (a === "vertical") columnOrder = columnOrderFromWritingMode(wm);
      found = true;
      break;
    }
    // inline style 兜底（部分環境 computed 不可用）
    const inline = (cur).style?.writingMode;
    const ai = axisFromWritingMode(inline);
    if (ai) {
      axis = ai;
      if (ai === "vertical") columnOrder = columnOrderFromWritingMode(inline);
      found = true;
      break;
    }

    cur = cur.parentElement;
    depth++;
  }

  if (!found) {
    // 第三順位：lilium 的 body 類 + CSS 變數（直排模式由 body 類驅動）
    const body = liBodyLayout(el);
    if (body) {
      axis = body.axis;
      columnOrder = body.columnOrder;
      found = true;
    }
  }

  if (!found) {
    // 末位：依 rect 形狀啟發式判斷（窄高 → 視為直排）
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;
    if (h > 0 && w > 0 && h / w >= 3 && w <= 64) {
      axis = "vertical";
      columnOrder = "rl";
    }
  }

  return { rect, axis, columnOrder };
}

/** 讀取元素所在文檔的 body，容錯 detached / 無 DOM 環境 */
function ownerBody(el: HTMLElement): HTMLElement | null {
  try {
    const doc = (el as HTMLElement & { ownerDocument?: Document }).ownerDocument;
    const b = doc ? doc.body : (typeof document !== "undefined" ? document.body : null);
    return b && typeof b.classList === "object" && b.classList ? (b) : null;
  } catch {
    return null;
  }
}

/**
 * 從 lilium 的 body 類與 CSS 變數推斷排版軸。
 *
 * `li-editor-horizontal-active` 優先於 `li-editor-vertical-active`：
 * 直排模式下開啟一篇橫排文種（拉丁、傣文等）的筆記時，兩個類會同時存在，
 * 但實際排版是橫排，彈窗必須走橫排策略。
 */
function liBodyLayout(el: HTMLElement): { axis: LayoutAxis; columnOrder: ColumnOrder } | null {
  const body = ownerBody(el);
  if (!body) return null;
  try {
    if (body.classList.contains(LI_HORIZONTAL_ACTIVE_CLASS)) {
      return { axis: "horizontal", columnOrder: "rl" };
    }
    if (body.classList.contains(LI_VERTICAL_ACTIVE_CLASS)) {
      let v = "";
      try {
        const cs = typeof getComputedStyle === "function" ? getComputedStyle(body) : undefined;
        if (cs) v = cs.getPropertyValue(LI_WRITING_MODE_VAR) || "";
      } catch { /* 忽略 */ }
      if (!v && body.style && typeof body.style.getPropertyValue === "function") {
        v = body.style.getPropertyValue(LI_WRITING_MODE_VAR) || "";
      }
      // inline `--li-editor-writing-mode` 兜底（style 可能不是完整 CSSStyleDeclaration）
      if (!v && body.style) {
        const sv = (body.style as unknown as Record<string, string>)[LI_WRITING_MODE_VAR];
        if (typeof sv === "string") v = sv;
      }
      const a = axisFromWritingMode(v || "vertical-rl");
      if (a === "horizontal") return { axis: "horizontal", columnOrder: "rl" };
      return { axis: "vertical", columnOrder: columnOrderFromWritingMode(v || "vertical-rl") };
    }
  } catch { /* 忽略 */ }
  return null;
}

/**
 * 錨點是否已失效。
 *
 * **切換直排／橫排後最常見的問題**：li 會重建編輯器 DOM，詞元素被移除，
 * 此時 `getBoundingClientRect()` 回傳全零，彈窗會飛到視口左上角。
 * 呼叫方應在 `true` 時隱藏彈窗而非重新定位。
 *
 * @param anchorEl 詞元素（可為 null；null 表示呼叫方沒提供，不算失效）
 * @param rect 詞矩形
 */
export function isAnchorStale(
  anchorEl: HTMLElement | null | undefined,
  rect: { left: number; top: number; right: number; bottom: number } | null | undefined
): boolean {
  if (!anchorEl || typeof anchorEl !== "object") return false; // 無元素 → 交給呼叫方決定
  // 元素已從文檔移除（切換佈局 / 換筆記 / 重渲染）
  if (typeof (anchorEl as HTMLElement & { isConnected?: boolean }).isConnected === "boolean") {
    if (!(anchorEl as HTMLElement & { isConnected: boolean }).isConnected) return true;
  }
  if (!rect) return true;
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  const w = n(rect.right) - n(rect.left);
  const h = n(rect.bottom) - n(rect.top);
  // 尺寸歸零：元素已不可見（display:none / 被移除 / 尚未布局）
  return w <= 0 || h <= 0;
}

/**
 * 監聽排版相關變化，供彈窗在直排↔橫排切換後重新定位。
 *
 * 監聽來源：
 *   1. `body` 的 class / style 變化（lilium 切換直排模式即改這兩者）
 *   2. 視窗 resize / orientationchange（換列、旋屏）
 *
 * **任何受監聽的事件都會回調**，不只是排版軸真正改變時 —— 因為：
 *   - resize 後即使軸沒變，錨點位置也變了，彈窗必須重算
 *   - lilium 切換筆記／重建 DOM 時軸可能不變，但詞元素已被移除（錨點失效需隱藏）
 * 回調以每幀為單位合併，避免 resize 風暴。
 *
 * @param el 詞元素（錨點）
 * @param onLayoutChange 版面可能已變化時呼叫，參數為重算後的錨點（失效時為 null）
 * @returns 取消監聽的函式；重複呼叫安全
 */
export function observeWritingModeChanges(
  el: HTMLElement | null | undefined,
  onLayoutChange: (a: ReadingAnchor | null) => void
): () => void {
  if (!el || typeof el !== "object") return () => {};
  if (typeof globalThis === "undefined") return () => {};

  // 每幀合併：連續 resize / 多次 class 變動只重算一次
  let pending = false;
  const g0 = window as unknown as {
    requestAnimationFrame?: (cb: () => void) => number;
    setTimeout?: (cb: () => void, ms: number) => unknown;
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    const run = () => {
      pending = false;
      let a: ReadingAnchor | null = null;
      try { a = getReadingAnchor(el); } catch { /* 忽略 */ }
      onLayoutChange(a);
    };
    try {
      if (typeof g0.requestAnimationFrame === "function") g0.requestAnimationFrame(run);
      else if (typeof g0.setTimeout === "function") g0.setTimeout(run, 16);
      else run();
    } catch {
      run();
    }
  };

  const disposers: Array<() => void> = [];
  const g = window as unknown as {
    MutationObserver?: typeof MutationObserver;
    addEventListener?: typeof addEventListener;
    removeEventListener?: typeof removeEventListener;
  };

  const body = ownerBody(el);
  if (g.MutationObserver && body) {
    try {
      const mo = new g.MutationObserver(() => schedule());
      mo.observe(body, { attributes: true, attributeFilter: ["class", "style"], subtree: false });
      disposers.push(() => mo.disconnect());
    } catch { /* 忽略 */ }
  }

  if (g.addEventListener && g.removeEventListener) {
    const handler = () => schedule();
    for (const evt of ["resize", "orientationchange"] as const) {
      try {
        g.addEventListener(evt, handler);
        disposers.push(() => g.removeEventListener?.(evt, handler));
      } catch { /* 忽略 */ }
    }
  }

  return () => {
    for (const d of disposers) {
      try { d(); } catch { /* 忽略 */ }
    }
    disposers.length = 0;
  };
}
