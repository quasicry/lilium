// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 辭典視圖軟鍵盤適配（重構——徹底放棄 lilium 自繪收縮，走宿主標準路徑）。
 *
 * 歷史：前版本用 visualViewport 觀測收縮 .li-root 高度＋translateY 平移補償，
 * 多輪修復（補償符號、落定確認）後移動端仍回報「白色遮罩塊」。根因在架構本身：
 *
 * 1. Obsidian 移動端宿主已用 --keyboard-height 縮 .app-container（app.css 實錘：
 *    body.is-mobile .app-container{max-height:calc(100vh - var(--keyboard-height))}，
 *    兩平台一致）。.li-root height:100% 自動跟隨——lilium 再寫固定 px height 是
 *    與宿主競爭：動畫期間宿主容器未縮（keyboard-animating 時 max-height:100vh）
 *    而 lilium 已收縮 → 面板下方露出一大塊容器背景（白主題＝「白色遮罩塊」）；
 *    宿主先縮而 lilium px 值未跟上 → 面板伸出容器。任何取樣時序都躲不開競態。
 * 2. translateY 補償在 offsetTop≈0 的 Obsidian 移動端（app-container overflow hidden、
 *    document 不捲動）永遠不該觸發；觸發即畫蛇添足。
 *
 * 語義：
 *   - 佈局零干預——.li-root 恆 height:100%，完全依賴宿主容器縮放；
 *   - 僅在「宿主確實未處理」（--keyboard-height 為 0/缺失且 vv 縮小＝覆蓋式鍵盤環境）
 *     時寫 li-vv-shrunk 閘＋--li-vv-height（可視高度），CSS 端只給 .li-body 加底部
 *     padding 提示可捲動，不動 .li-root 佈局；
 *   - focusin 時把輸入元素捲入可視區（block:'nearest'），保證鍵盤上方可見。
 */

export interface VvFit {
  /** 可視視窗確實小於佈局視窗 → 打閘 */
  shrunk: boolean;
  /** 打閘時的可視高度（px）；不打閘為 null */
  height: number | null;
  /** 宿主已處理（--keyboard-height>0）→ true（此時不做任何事） */
  hostHandled: boolean;
}

/**
 * 由可視視窗高與佈局視窗高計算收斂狀態（純函式，Node 可直測）。
 * @param vvHeight    window.visualViewport.height（px）
 * @param innerHeight window.innerHeight（px）
 * @param tolerance   容差（px）：捨入誤差 / 縮放抖動不觸發（預設 2px）
 * @param hostKeyboardHandled 宿主已把 app-container 縮短（--keyboard-height>0）
 */
export function computeVvFit(
  vvHeight: number,
  innerHeight: number,
  tolerance = 2,
  hostKeyboardHandled = false,
): VvFit {
  if (!Number.isFinite(vvHeight) || !Number.isFinite(innerHeight)) {
    return { shrunk: false, height: null, hostHandled: hostKeyboardHandled };
  }
  const diff = innerHeight - vvHeight;
  const tol = Number.isFinite(tolerance) ? tolerance : 2;
  if (diff <= tol) return { shrunk: false, height: null, hostHandled: hostKeyboardHandled };
  return { shrunk: true, height: Math.round(vvHeight), hostHandled: hostKeyboardHandled };
}

/** 宿主鍵盤自縮判定：讀 documentElement computed style --keyboard-height。
 *  對齊官方（app.js 實錘：官方讀 documentElement，--keyboard-height 定義於 :root、
 *  native bridge 寫 documentElement——讀 body 依賴繼承，部分 Android WebView 上
 *  computed style 自訂屬性回讀不穩定，導致宿主已縮仍誤判「未處理」→ 誤打閘白塊）。 */
/** 讀宿主鍵盤高度（--keyboard-height，px；native bridge 寫 documentElement）。0＝未上報。 */
export function readKeyboardHeight(win: Window): number {
  try {
    const doc = win.document as unknown as { documentElement: Element };
    const v = win.getComputedStyle(doc.documentElement).getPropertyValue("--keyboard-height");
    const n = Number.parseFloat(v || "");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function hostKeyboardHandled(win: Window): boolean {
  try {
    const doc = win.document as unknown as { documentElement: Element };
    const v = win.getComputedStyle(doc.documentElement).getPropertyValue("--keyboard-height");
    if (!v) return false;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0;
  } catch {
    return false;
  }
}

/** 自算高度（純函式，Node 可直測）：面板應收縮到的高度。
 *  訊號合併取大：keyboardInset = max(--keyboard-height, innerHeight − vv.height − vv.offsetTop)
 *  （vv.offsetTop 補償 Safari/部分 Android 的 vv 上移）。
 *  面板底 = min(vv.offsetTop + vv.height, innerHeight − keyboardInset)；
 *  面板高 = 面板底 − 面板頂（container.getBoundingClientRect().top 由呼叫端傳入）。
 *  底線保護：inset < 80 視為鍵盤未開（誤觸防護）；算出高度 < 160
 *  放棄管理回退（界面壓成一條縫比白塊更糟）。 */
export const KB_MIN_INSET_PX = 80;
export const KB_MIN_PANEL_PX = 160;

export function computeKbFitHeight(
  vvHeight: number,
  vvOffsetTop: number,
  innerHeight: number,
  keyboardHeight: number,
  containerTop: number,
): number | null {
  if (![vvHeight, vvOffsetTop, innerHeight, keyboardHeight, containerTop].every(Number.isFinite)) {
    return null;
  }
  const vvInset = Math.max(0, innerHeight - vvHeight - vvOffsetTop);
  const keyboardInset = Math.max(keyboardHeight, vvInset);
  if (keyboardInset < KB_MIN_INSET_PX) return null;
  const bottom = Math.min(vvOffsetTop + vvHeight, innerHeight - keyboardInset);
  const height = Math.floor(bottom - containerTop);
  return height >= KB_MIN_PANEL_PX ? height : null;
}

/**
 * 全域鍵盤閘（plugin onload 接線，插件卸載摘除）：鍵盤開啟 → body.li-kb-open。
 * 與面板無關——編輯器場景同樣生效（CSS 端藏官方白底三件）。判定通道：
 * ① kh>0（--keyboard-height 變化即重算，native bridge 寫 documentElement）；
 * ② vv 高度差（kh 讀 0 的 Android WebView／IME 盲點實錘——vv 縮小是唯一可靠訊號）。
 * focusin/focusout 兜底部分 IME 兩訊號皆缺的場景（adjustPan）。
 */
export function attachGlobalKbGate(win: Window): () => void {
  const vv = win.visualViewport;
  const doc = win.document;
  // focusin 兜底旗標：部分 IME／adjustPan 模式 kh 恆 0 且 vv 不縮（兩訊號皆缺）——
  // 任何輸入元素取得焦點即鍵盤必彈，立即掛閘不等訊號；focusout 後由訊號裁定解除。
  let focusHold = false;
  const update = (): void => {
    let vvShrunk = false;
    try {
      vvShrunk = !!vv && win.innerHeight - vv.height > 120;
    } catch { /* 忽略 */ }
    // kh 殘留實錘（真機診斷）：鍵盤收起後 native bridge 不把 --keyboard-height 歸零——
    // kh 單獨成立會令閘永久卡死（root 永久收縮＝鍵盤收起後下方大塊空隙露白）。
    // 掛閘：焦點在輸入元素（鍵盤必彈）或 vv 縮。解除：焦點離開且 vv 未縮——
    // 此時不信任 kh 殘留值（真機實錘不歸零）。
    const open = focusHold || vvShrunk;
    doc.body.classList.toggle("li-kb-open", open);
  };
  const onFocusIn = (e: Event): void => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const tag = t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) {
      focusHold = true;
    }
    schedule();
  };
  const onFocusOut = (e: Event): void => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const tag = t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) {
      focusHold = false;
    }
    schedule();
  };
  let raf = 0;
  const schedule = (): void => {
    win.cancelAnimationFrame(raf);
    raf = win.requestAnimationFrame(update);
  };
  // 環境防禦：Node/測試環境（無 MutationObserver 原生）跳過 DOM 觀察，
  // 鍵盤閘交給 focusin/focusout + visualViewport 訊號路徑（功能不變，僅少 DOM 訂閱）。
  const hasMO = typeof MutationObserver !== "undefined";
  const mo = hasMO ? new MutationObserver(schedule) : null;
  mo?.observe(doc.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
  vv?.addEventListener("resize", schedule);
  vv?.addEventListener("scroll", schedule);
  win.addEventListener("focusin", onFocusIn);
  win.addEventListener("focusout", onFocusOut);
  update();
  return () => {
    mo?.disconnect();
    vv?.removeEventListener("resize", schedule);
    vv?.removeEventListener("scroll", schedule);
    win.removeEventListener("focusin", onFocusIn);
    win.removeEventListener("focusout", onFocusOut);
    win.cancelAnimationFrame(raf);
    doc.body.classList.remove("li-kb-open");
  };
}

/**
 * 接線：軟鍵盤適配。
 * @param root .li-root（佈局不再被修改；僅寫提示變數）
 * @param win  window
 * @returns 卸載函式（view onOpen/onClose 配對）
 */
export function attachVvFit(root: HTMLElement, win: Window): () => void {
  const vv = win.visualViewport;
  // 側欄（drawer）場景標記：官方 .workspace-drawer 是 position:fixed，不在
  // app-container 的 --keyboard-height 縮放鏈內——面板須自行讓位（CSS 端
  // li-in-drawer.li-kb-open .li-body padding-bottom: var(--keyboard-height)）。
  const inDrawer = !!root.closest(".workspace-drawer");
  root.classList.toggle("li-in-drawer", inDrawer);
  if (!vv) {
    if (inDrawer) {
      // 無 vv 也要讓 kh 變化生效——留 body 閘由 CSS 使用（kh 由 native 寫，無 resize 亦可能變）。
      return () => root.classList.remove("li-in-drawer");
    }
    return () => {};
  }

  // 覆蓋式鍵盤且宿主未處理 → 寫提示閘（CSS 端僅影響 .li-body padding，不動佈局）
  const apply = (): void => {
    const fit = computeVvFit(vv.height, win.innerHeight, 2, hostKeyboardHandled(win));
    // li-kb-open 閘已上移至 attachGlobalKbGate（全域，編輯器場景同生效）——此處僅面板幾何。
    // 自算高度：訊號合併取大（kh OR vv 差值→max），面板自身收縮到可視區。
    // 不碰官方白底三件（時序賽跑根因），白塊落在已讓位的空處＝零衝突。
    try {
      // kh 殘留防禦：閘未開（無焦點且 vv 未縮）時 kh 視為 0——真機實錘鍵盤收起後
      // native bridge 不歸零 --keyboard-height，不防禦則 root 永久收縮＝白塊主因。
      const kbOpen = root.ownerDocument?.body.classList.contains("li-kb-open") ?? false;
      // r52 白塊殘留修復（純函式模擬實錘）：kbOpen=false 時 vvInset 仍可 >80
      // （鍵盤收起動畫期間 vv.height 未回／部分 WebView 收鍵盤不發 vv resize），
      // computeKbFitHeight 會照樣收縮 root → focusout 同步 apply 落此窗口 →
      // root 停留收縮高，面板下方露容器背景＝軟鍵盤位置殘留白塊。
      // 閘：kbOpen=false 時不進入自算收縮，直接清 li-kb-fit——鍵盤關閉以焦點
      // 退出為準（vv 事件丟失也有此兜底），鍵盤開啟判定仍走 attachGlobalKbGate。
      const fitH = !kbOpen
        ? null
        : computeKbFitHeight(
          vv.height, vv.offsetTop ?? 0, win.innerHeight,
          readKeyboardHeight(win), root.getBoundingClientRect().top,
        );
      if (fitH != null) {
        root.classList.add("li-kb-fit");
        root.style.setProperty("--li-kb-fit-height", `${fitH}px`);
      } else {
        root.classList.remove("li-kb-fit");
        root.style.removeProperty("--li-kb-fit-height");
      }
    } catch { /* 幾何量測異常——忽略 */ }
    if (fit.shrunk && !fit.hostHandled && fit.height != null) {
      root.classList.add("li-vv-shrunk");
      root.style.setProperty("--li-vv-height", `${fit.height}px`);
    } else {
      root.classList.remove("li-vv-shrunk");
      root.style.removeProperty("--li-vv-height");
    }
  };

  // focusin：輸入元素捲入可視區——改「面板內局部捲動」：
  // scrollIntoView 會沿祖先鏈（含 document/visualViewport）推動捲動——iOS WKWebView 上
  // 鍵盤彈出期間它把整個 WebView 上頂，帶出鍵盤後方白色底（用戶實測白塊）。改為只在
  // .li-body 自身捲動：輸入元素在面板可視區外才調整 scrollTop，絕不觸碰祖先鏈。
  let focusRaf = 0;
  const onFocusIn = (e: Event): void => {
    apply();
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const tag = t.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && !t.isContentEditable) return;
    // 防禦閘：面板內輸入元素取得焦點 → 軟鍵盤即將彈出（即使 kh/vv 兩訊號皆缺——
    // 部分 IME／adjustPan 模式兩者均不報，盲點②兜底）。僅覆蓋 lilium 面板輸入期，
    // 不觸碰編輯器場景（鐵律：官方 toolbar 在編輯器中照常）。
    try {
      if (t.closest(".li-root")) {
        const doc = win.document as unknown as { body: HTMLElement };
        doc.body.classList.add("li-kb-open");
      }
    } catch { /* 忽略 */ }
    win.cancelAnimationFrame(focusRaf);
    focusRaf = win.requestAnimationFrame(() => {
      try {
        // 就近向上找 .li-body（面板唯一捲動容器）；不在面板內（理論不可達）則不動。
        const body = t.closest(".li-body");
        if (!body) return;
        const bt = body.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        const margin = 8;
        if (tr.top < bt.top + margin) {
          body.scrollTop -= bt.top + margin - tr.top;
        } else if (tr.bottom > bt.bottom - margin) {
          body.scrollTop += tr.bottom - bt.bottom + margin;
        }
      } catch { /* 幾何量測異常——忽略 */ }
    });
  };

  vv.addEventListener("resize", apply);
  // r52 殘留兜底：focusout 時鍵盤收起動畫未完（vv.height 仍縮）——
  // 同步 apply 後再延遲雙查（rAF 一拍＋300ms 一拍），vv resize 事件丟失
  // 的 WebView 上也能把 li-kb-fit/li-vv-shrunk 殘留清乾淨（白塊殘留實錘場景）。
  let outRaf = 0;
  let outTimer: ReturnType<typeof win.setTimeout> | undefined;
  const onFocusOutDeferred = (): void => {
    win.cancelAnimationFrame(outRaf);
    outRaf = win.requestAnimationFrame(apply);
    if (outTimer !== undefined) win.clearTimeout(outTimer);
    outTimer = win.setTimeout(apply, 300);
  };
  vv.addEventListener("scroll", apply);
  win.addEventListener("focusin", onFocusIn);
  win.addEventListener("focusout", onFocusOutDeferred);
  apply();

  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
    win.removeEventListener("focusin", onFocusIn);
    win.removeEventListener("focusout", onFocusOutDeferred);
    if (outTimer !== undefined) win.clearTimeout(outTimer);
    win.cancelAnimationFrame(outRaf);
    win.cancelAnimationFrame(focusRaf);
    root.classList.remove("li-vv-shrunk");
    root.style.removeProperty("--li-vv-height");
    root.classList.remove("li-kb-fit");
    root.style.removeProperty("--li-kb-fit-height");
  };
}
