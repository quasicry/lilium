// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 模式切換滾動位置同步（需求「切換編輯模式和閱讀模式時，
 * 頁面所在的文字位置應該同步」）。
 *
 * 同一 markdown leaf 內的檢視模式切換（source ↔ preview）與分頁接管／解除時，
 * 在**切換前**從舊檢視捕獲一個「文字錨」（可視區頂部可見的一段文字，≥8 個非標點字符），
 * 在**切換後**於新檢視中找到含同一段文字的位置並滾動過去。錨找不到／渲染超時
 * → 完全不滾動（零回歸）。
 *
 * 設計要點：
 * - 只同步「同一 leaf 的模式切換」，不同步跨檔案切換（active-leaf-change 但 file 相同、
 *   mode 相同 → 忽略）。
 * - 採樣以「可視區頂部」為準（三模式共同的視覺錨：編輯 CM visibleRanges 首可見行、
 *   preview / 分頁的可視區首個含文字的塊）。
 * - 文字正規化：壓平空白並剔除全半形標點，只留「實義字符」，避免 markdown 語法
 *   （`#`、`>`、`**`…）在編輯源與渲染後不一致導致錨失配。
 * - 全程防護：任何拋錯都被吞掉（模式切換永不被同步邏輯卡死）。
 */

/** 錨的最短實義字符數（低於此視為太短、定位易誤中，放棄同步） */
const MIN_ANCHOR_CHARS = 8;
/** 切換後等待新檢視渲染就緒的輪詢上限（ms） */
const RESTORE_TIMEOUT_MS = 2000;
/** 輪詢間隔（ms） */
const RESTORE_POLL_MS = 80;

/** 壓平空白：全形空白／換行／連續空白 → 單一空格 */
function normalizeWs(s: string): string {
  return s.replace(/[\s\u3000]+/g, " ").trim();
}

/** 剔除標點與符號，只留「實義字符」（字母／數字／CJK／音節文字等） */
function significant(s: string): string {
  return normalizeWs(s.replace(/[\p{P}\p{S}\p{C}]/gu, ""));
}

/** 從候選片段中挑一段可用的錨文字：夠長、含實義字符；否則回 null */
function pickAnchorText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const sig = significant(raw);
  if (sig.length < MIN_ANCHOR_CHARS) return null;
  return normalizeWs(raw);
}

/**
 * 捕獲當前檢視的文字錨。呼叫端保證 el 仍連著 DOM。
 * @returns 錨描述；無法取錨時回 null（呼叫端放棄同步）
 */
export interface ModeScrollAnchor {
  /** 頂部可見的文字片段（未正規化，正規化在比對時做） */
  text: string;
}

/** CM6 editor 的最小介面（避免引入 obsidian 型別依賴，Node 端可空跑） */
export interface SyncEditorLike {
  lineCount(): number;
  getLine(n: number): string;
  /** CM6 EditorView（可為 null；取 visibleRanges／scrollDOM 用） */
  cm?: {
    visibleRanges?: Array<{ from: number; to: number }>;
    state?: { doc: { toString(): string; line(n: number): { text: string } } };
    /** 直排錨提取改走 DOM 幾何——需要 scroller 及其視野 */
    scrollDOM?: HTMLElement | null;
  } | null;
  getValue?(): string;
  scrollIntoView?(range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center?: boolean): void;
}

/** 偵測一個 leaf 上的「檢視模式」：source（編輯）／preview（原生閱讀）／paged（分頁接管） */
/**
 * Obsidian 1.14 起 `view.getMode()` 回傳 undefined（API 變更）——
 * 版本相容的檢視模式讀法：優先 getMode()，退化讀 `currentMode`
 * （1.14 為字串 "preview"/"source"），再退化 `getState().state.mode`。
 * 全部取不到時回 null（呼叫端保守處理）。
 */
export function viewModeOf(view: {
  getMode?: () => string;
   
  currentMode?: unknown;
  getState?: () => { state?: { mode?: string } } | undefined;
}): "preview" | "source" | null {
  try {
    if (!view) return null;
    if (typeof view.getMode === "function") {
      const m = view.getMode();
      if (m === "preview" || m === "source") return m;
    }
    const cm = view.currentMode;
    if (typeof cm === "string" && (cm === "preview" || cm === "source")) return cm;
    if (cm && typeof cm === "object" && "type" in cm && ((cm as { type?: unknown }).type === "preview" || (cm as { type?: unknown }).type === "source")) return (cm as { type: "preview" | "source" }).type;
    const st = typeof view.getState === "function" ? view.getState() : undefined;
    const sm = st?.state?.mode;
    if (sm === "preview" || sm === "source") return sm;
    return null;
  } catch {
    return null;
  }
}

export function detectViewMode(view: {
  getMode?: () => string;
  containerEl?: HTMLElement | null;
}): "source" | "preview" | "paged" | null {
  try {
    if (!view) return null;
    // 改走 viewModeOf 兼容讀法（getMode 在 obsidian 1.14 回 undefined）
    const m = viewModeOf(view);
    if (m !== "preview") return "source";
    const ce = view.containerEl;
    if (!ce) return "preview";
    // 分頁接管：.li-native-pages 存在且可見（reader-paged 接管後 reading 容器在 DOM）
    if (ce.querySelector(".li-native-pages")) {
      return "paged";
    }
    return "preview";
  } catch {
    return null;
  }
}

/* ---------------- 錨提取（切換前） ---------------- */

/** 編輯模式：取 CM 可視區頂部第一個可見行、行首起的一段文字 */
export function captureEditorAnchor(editor: SyncEditorLike | null | undefined): ModeScrollAnchor | null {
  try {
    if (!editor) return null;
    const cm = editor.cm;
    const ranges = cm?.visibleRanges;
    if (cm?.state?.doc && ranges && ranges.length) {
      const first = ranges[0];
      // 修：CM6 的 visibleRanges 在**直排**下不可靠——實測（真機 probe，
      // viewport 沿水平軸捲動 scrollLeft=-3000 後）visibleRanges 恆回報全文
      // [0, 2985]＝CM 的 viewport 量測未跟隨 writing-mode 旋轉的捲動軸。
      // 因此直排（scrollDOM writing-mode 為 vertical-*）改走 **DOM 幾何法**：
      // .cm-line 依序對應文件行（CM 渲染順序＝行序），取第一個「盒落在
      // scrollDOM 視野內」且有實義文字的行，從行文本取錨。橫排維持
      // visibleRanges + lineAt（行為不變）。
      const sc = cm.scrollDOM;
      const wm = sc ? (sc.ownerDocument.defaultView ?? window).getComputedStyle(sc).writingMode : "";
      if (wm.startsWith("vertical") && sc) {
        const content = sc.querySelector(".cm-content") ?? sc;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
        const lineEls = Array.from(content.querySelectorAll(".cm-line")) as HTMLElement[];
        const sr = sc.getBoundingClientRect();
        for (const el of lineEls) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          // 直排：行進軸＝物理 X。vertical-rl 首行在右（x 大），一行的「盒右緣」
          // 落入視野即視為可見；vertical-lr 首行在左（x 小）。兩方向統一判斷：
          // 盒與視野在 X 軸有交集且貼近起始側即可（取第一個有實義文字者）。
          const xOverlap = r.right > sr.left && r.left < sr.right;
          if (xOverlap) {
            const t = el.textContent ?? "";
            const a = pickAnchorText(t);
            if (a) return { text: a };
          }
        }
        return null; // 直排下無可見行：放棄（零回歸）
      }
      // 橫排：visibleRanges[0] 即可視區首段；lineAt 轉行號取錨
      const doc = cm.state.doc as unknown as { lineAt?(pos: number): { number: number; text: string } };
      if (typeof doc.lineAt === "function") {
        const l = doc.lineAt(first.from);
        const a = pickAnchorText(l.text);
        if (a) return { text: a };
      }
    }
    // 退化路徑：無 cm（如 mock 環境）→ 取不到可視資訊就放棄（零回歸）。
    return null;
  } catch {
    return null;
  }
}

/** 閱讀（preview）：取 .markdown-preview-view 可視區頂部第一個含足夠文字的塊 */
export function capturePreviewAnchor(preview: HTMLElement | null | undefined): ModeScrollAnchor | null {
  try {
    if (!preview || !preview.isConnected) return null;
    const win = (preview.ownerDocument?.defaultView ?? window.window) as Window | undefined;
    const rect = preview.getBoundingClientRect();
    // 修：直排（writing-mode vertical-*）下「可視區頂部」在物理 X 軸
    // （vertical-rl 首列在右），原 `r.bottom > topY` 判定對所有列恆真 → 恆取
    // DOM 序第一節點＝文首（真機實測錯位）。直排改按 X 軸「起始側」判定：
    // 在視野 X 範圍內的節點中取最靠起始側（vertical-rl 最右、vertical-lr 最左）者。
    const wm = win ? win.getComputedStyle(preview).writingMode : "";
    if (wm.startsWith("vertical")) {
      const rl = wm === "vertical-rl";
      let best: { text: string; edge: number } | null = null;
      const walker2 = (preview.ownerDocument ?? document).createTreeWalker(preview, NodeFilter.SHOW_TEXT);
      let n2 = walker2.nextNode() as Text | null;
      while (n2) {
        const t = n2.textContent ?? "";
        if (t.trim()) {
          const pel = n2.parentElement;
          if (pel && typeof pel.getBoundingClientRect === "function") {
            const r = pel.getBoundingClientRect();
            if (r.width > 0 && r.right > rect.left && r.left < rect.right) {
              const edge = rl ? r.right : r.left;
              const better = best === null || (rl ? edge > best.edge : edge < best.edge);
              if (better) {
                const a = pickAnchorText(t);
                if (a) best = { text: a, edge };
              }
            }
          }
        }
        n2 = walker2.nextNode() as Text | null;
      }
      return best ? { text: best.text } : null;
    }
    const topY = rect.top;
    const walker = (preview.ownerDocument ?? document).createTreeWalker(preview, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const t = node.textContent ?? "";
      if (t.trim()) {
        const pel = node.parentElement;
        if (pel && typeof pel.getBoundingClientRect === "function") {
          const r = pel.getBoundingClientRect();
          if (r.height > 0 && r.bottom > topY) {
            const a = pickAnchorText(t);
            if (a) return { text: a };
          }
        }
      }
      node = walker.nextNode() as Text | null;
    }
    return null;
  } catch {
    return null;
  }
}

/** 分頁（li-native-page）：取當前活動頁頁身頂部文字 */
export function capturePagedAnchor(readingEl: HTMLElement | null | undefined): ModeScrollAnchor | null {
  try {
    if (!readingEl || !readingEl.isConnected) return null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const active = readingEl.querySelector(".li-native-page.active") as HTMLElement | null
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
      ?? (readingEl.querySelectorAll(".li-native-page") as NodeListOf<HTMLElement>)[0]
      ?? null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const body = (active?.querySelector(".li-native-page-body") as HTMLElement | null) ?? active;
    if (!body) return null;
    const walker = (body.ownerDocument ?? document).createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const t = node.textContent ?? "";
      if (t.trim()) {
        const a = pickAnchorText(t);
        if (a) return { text: a };
      }
      node = walker.nextNode() as Text | null;
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------------- 錨恢復（切換後） ---------------- */

/** 文字正規化後的「含」比對（兩側都過 significant） */
function containsAnchor(haystack: string, anchorSig: string): boolean {
  return significant(haystack).indexOf(anchorSig) >= 0;
}

/** →編輯：全文 indexOf 錨片段 → scrollIntoView（行級精度，計劃書接受） */
export function restoreEditorAnchor(
  editor: SyncEditorLike | null | undefined,
  anchor: ModeScrollAnchor,
): boolean {
  try {
    if (!editor) return false;
    const anchorSig = significant(anchor.text);
    if (!anchorSig) return false;
    const value = editor.getValue ? editor.getValue() : (editor.cm?.state?.doc?.toString() ?? null);
    if (!value) return false;
    // 文本級 indexOf 需在「同正規化」的空間做，再折算回行號：逐行累計正規化長度。
    // 更穩的做法：逐行找「該行正規化後含錨片段（或錨片段前綴跨越行界）」。
    const lines = value.split(/\r?\n/);
    // 行界跨越：先把錨按正規化空格拆詞，逐行拼窗匹配
    const words = anchorSig.split(" ");
    let hitLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (containsAnchor(lines[i], anchorSig)) { hitLine = i; break; }
      // 跨行：以行 i 起點向後串 8 行窗口比對（罕用，兜底）
      const win = lines.slice(i, i + 8).join(" ");
      if (words.length > 1 && containsAnchor(win, anchorSig)) { hitLine = i; break; }
    }
    if (hitLine < 0) return false;
    // 修：CM6 在**直排**下 scrollIntoView 無效（與 captureEditorAnchor
    // 同根因——CM viewport 量測未跟隨 writing-mode 旋轉的捲動軸，真機實測
    // scrollIntoView 後 scrollDOM 捲動量不變）。直排改走 DOM 幾何：按行序找到
    // 目標行的 .cm-line 元素，將其盒滾到 scroller 起始側。
    const cm = editor.cm;
    const sc = cm?.scrollDOM;
    const wm = sc ? (sc.ownerDocument.defaultView ?? window).getComputedStyle(sc).writingMode : "";
    if (wm.startsWith("vertical") && sc && cm?.state?.doc) {
      try {
        const lineEl = sc.querySelector(`.cm-line:nth-child(${hitLine + 1})`) ?? null;
        const content = sc.querySelector(".cm-content");
        const els = (content ?? sc).querySelectorAll(".cm-line");
        const el = els[hitLine] ?? lineEl;
        if (el) {
          const sr = sc.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          // vertical-rl：內容從右往左推進（scrollLeft 為負、越捲越負）；
          // 把行的右緣貼到視野右緣。vertical-lr 反向（scrollLeft 為正）。
          if (wm === "vertical-lr") sc.scrollLeft = sc.scrollLeft + (er.left - sr.left);
          else sc.scrollLeft = sc.scrollLeft + (er.right - sr.right);
          return true;
        }
      } catch { /* 幾何失敗 → 退回 scrollIntoView */ }
    }
    editor.scrollIntoView?.({ from: { line: hitLine, ch: 0 }, to: { line: hitLine, ch: 0 } }, true);
    return true;
  } catch {
    return false;
  }
}

/** →閱讀：TreeWalker 找含錨文字的節點 → scrollIntoView(block:start) */
export function restorePreviewAnchor(
  preview: HTMLElement | null | undefined,
  anchor: ModeScrollAnchor,
): boolean {
  try {
    if (!preview || !preview.isConnected) return false;
    const anchorSig = significant(anchor.text);
    if (!anchorSig) return false;
    const walker = (preview.ownerDocument ?? document).createTreeWalker(preview, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const t = node.textContent ?? "";
      if (t && containsAnchor(t, anchorSig)) {
        const el = node.parentElement ?? (node as unknown as HTMLElement);
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ block: "start" });
          return true;
        }
      }
      node = walker.nextNode() as Text | null;
    }
    return false;
  } catch {
    return false;
  }
}

/** →分頁：遍歷 .li-native-page 找含錨文字的頁 → handle.goto(該頁) */
export function restorePagedAnchor(
  readingEl: HTMLElement | null | undefined,
  anchor: ModeScrollAnchor,
  goto: (n: number) => void,
): boolean {
  try {
    if (!readingEl || !readingEl.isConnected) return false;
    const anchorSig = significant(anchor.text);
    if (!anchorSig) return false;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const pages = readingEl.querySelectorAll(".li-native-page") as NodeListOf<HTMLElement>;
    for (let i = 0; i < pages.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
      const body = (pages[i].querySelector(".li-native-page-body") as HTMLElement | null) ?? pages[i];
      if (containsAnchor(body.textContent ?? "", anchorSig)) {
        goto(i + 1);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/* ---------------- 輪詢恢復（rAF 友善，不阻塞） ---------------- */

/**
 * 切換後輪詢等新檢視渲染就緒再恢復錨。輪詢用 setTimeout（reader-paged 同款）；
 * 每次嘗試都包 try——任何拋錯直接放棄。超時（RESTORE_TIMEOUT_MS）放棄、不滾動。
 * @param probe 就緒偵測＋恢復：回 true 表示已恢復（停止輪詢），false 續等
 */
export function pollRestore(
  probe: () => boolean,
  opts?: { timeoutMs?: number; intervalMs?: number },
): void {
  const timeoutMs = opts?.timeoutMs ?? RESTORE_TIMEOUT_MS;
  const intervalMs = opts?.intervalMs ?? RESTORE_POLL_MS;
  const start = Date.now();
  const tick = (): void => {
    try {
      if (probe()) return;
    } catch {
      return; // 任何拋錯：放棄（零回歸）
    }
    if (Date.now() - start >= timeoutMs) return;
    const g = window as unknown as { setTimeout?: typeof setTimeout; requestAnimationFrame?: typeof requestAnimationFrame };
    if (typeof g.setTimeout === "function") window.setTimeout(tick, intervalMs);
  };
  tick();
}

/* ---------------- 協調器 ---------------- */

export interface ModeScrollSyncHost {
  /** 開關（typography.modeScrollSync，默認 true）；false → 完全不走同步路徑 */
  isEnabled(): boolean;
  /** 取 leaf 的 markdown view 側資訊（main.ts 提供真實實作；測試可注入） */
  getView(leaf: unknown): {
    view: {
      getMode?: () => string;
      containerEl?: HTMLElement | null;
      editor?: SyncEditorLike | null;
    } | null;
  } | null;
  /** 分頁 goto：由 main.ts 從 readerPagedHandles 取 handle.goto 注入；無 → null */
  getPagedGoto(leaf: unknown): ((n: number) => void) | null;
}

interface PendingSwitch {
  fromMode: "source" | "preview" | "paged";
  anchor: ModeScrollAnchor;
}

/**
 * 建立 leaf 級同步器。main.ts 在每個 markdown leaf 上掛一個：
 *   beforeSwitch(leaf) 在「模式切換前」呼叫（DOM 還在時提取錨）；
 *   afterSwitch(leaf) 在切換後呼叫（輪詢等渲染就緒再恢復）。
 */
export function createModeScrollSync(host: ModeScrollSyncHost) {
  /** per-leaf 待恢復的錨（鍵：leaf 物件引用） */
  const pending = new Map<unknown, PendingSwitch>();

  /** 供 main.ts 攔截點呼叫：切換前提取當前錨（DOM 還在時） */
  function beforeSwitch(leaf: unknown): void {
    try {
      if (!host.isEnabled()) return;
      const w = host.getView(leaf);
      const view = w?.view;
      if (!view) return;
      const mode = detectViewMode(view);
      if (!mode) return;
      let anchor: ModeScrollAnchor | null = null;
      if (mode === "source") anchor = captureEditorAnchor(view.editor ?? null);
      else if (mode === "preview") {
        const preview = view.containerEl?.querySelector(".markdown-preview-view") as HTMLElement | null;
        anchor = capturePreviewAnchor(preview);
      } else {
        const reading = view.containerEl?.querySelector(".markdown-reading-view") as HTMLElement | null;
        anchor = capturePagedAnchor(reading);
      }
      if (!anchor) return;
      pending.set(leaf, { fromMode: mode, anchor });
    } catch { /* 錨提取失敗：放棄同步，切換照常 */ }
  }

  /** 供 main.ts 攔截點呼叫：切換後輪詢恢復 */
  function afterSwitch(leaf: unknown): void {
    try {
      const job = pending.get(leaf);
      pending.delete(leaf);
      if (!job) return;
      // lilium 的分頁接管在 setViewState(preview) 之後才完成（preview→paged
      // 過渡，真機實測 ~600ms 內發生）。若恢復在過渡模式上執行（如把滾動做到
      // 連續 preview 上），接管完成後位置會被頁碼記憶蓋掉。因此 probe 只在
      // 「模式穩定」後恢復：連續兩輪偵測到同一目標模式才動作。
      let lastSeen: string | null = null;
      pollRestore(() => {
        try {
          if (!host.isEnabled()) return true; // 開關被關：放棄
          const w = host.getView(leaf);
          const view = w?.view;
          if (!view) return false;
          const mode = detectViewMode(view);
          if (!mode || mode === job.fromMode) return mode === job.fromMode ? false : true;
          if (mode !== lastSeen) { lastSeen = mode; return false; } // 過渡中：續等
          // 目標模式渲染就緒偵測＋恢復
          if (mode === "source") {
            return restoreEditorAnchor(view.editor ?? null, job.anchor);
          }
          if (mode === "preview") {
            const preview = view.containerEl?.querySelector(".markdown-preview-view") as HTMLElement | null;
            return restorePreviewAnchor(preview, job.anchor);
          }
          const reading = view.containerEl?.querySelector(".markdown-reading-view") as HTMLElement | null;
          const goto = host.getPagedGoto(leaf);
          if (!goto) return false; // 分頁 handle 尚未就緒，續等
          return restorePagedAnchor(reading, job.anchor, goto);
        } catch {
          return true; // 恢復拋錯：停止輪詢（零回歸）
        }
      });
    } catch { /* swallow */ }
  }

  return { beforeSwitch, afterSwitch };
}

export type ModeScrollSync = ReturnType<typeof createModeScrollSync>;
