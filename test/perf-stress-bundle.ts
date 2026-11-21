// 真實 CM6 實例的壓力測試入口（由 esbuild 打包成瀏覽器 ESM）。
// 目的：在「Obsidian 軟換行開啟 = CM6 EditorView.lineWrapping 啟用」的真實場景下，
// 重現對編輯器直排強制 white-space:pre-wrap + max-inline-size:100% 後，
// 高頻切換橫/直排、改排版參數、切分頁、模擬 PDF 匯出時是否產生 reflow 風暴 / 卡頓，
// 並用「關閉規則」做對照組量化回歸。
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// 構造大文檔：大量「長行」（每行很長），迫使 lineWrapping 必須大量斷行。
function buildDoc(lines: number, lineLen: number): string {
  const seg = "永遠相信美好的事情即將發生，縱排排版需要正確的斷行與量測，否則長段落會溢出視窗或吞字。";
  let s = "";
  for (let i = 0; i < lines; i++) {
    // 複製 seg 直到約 lineLen 字
    let line = `第${i + 1}節：`;
    while (line.length < lineLen) line += seg;
    s += line + "\n";
  }
  return s;
}

let editorView: EditorView | null = null;

function setupEditor(host: HTMLElement): EditorView {
  const state = EditorState.create({
    doc: buildDoc(1500, 600), // 1500 行 × 約 600 字 → 放大換行負載以暴露縮放成本
    extensions: [
      EditorView.lineWrapping, // 對應 Obsidian 軟換行開啟
      EditorView.theme({}, { dark: false }),
    ],
  });
  const view = new EditorView({ state, parent: host });
  return view;
}

// 渲染一個閱讀器（markdown-preview-view）結構
function setupReader(host: HTMLElement): HTMLElement {
  const root = document.createElement("div");
  root.className = "markdown-preview-view";
  let html = "";
  for (let i = 0; i < 60; i++) {
    html += `<h2>第 ${i + 1} 章 標題</h2><p>這是一段較長的範例文字，用來測試直排閱讀器在切換與 resize 時是否仍能正確換列與填滿容器，避免下方留空或文字被裁切。永遠相信美好的事情即將發生。</p>`;
  }
  root.innerHTML = html;
  host.appendChild(root);
  return root;
}

// 模擬「分頁閱讀 / PDF 匯出」：把編輯器可視內容克隆到一個直排定高容器並測量所有頁。
function simulateExport(el: HTMLElement, pageSizeCount = 6): number {
  const stage = document.createElement("div");
  stage.style.cssText = "position:absolute;left:-99999px;top:0;width:600px;height:800px;writing-mode:vertical-rl;";
  const doc = document.createElement("div");
  doc.className = "li-doc";
  doc.style.cssText = "writing-mode:vertical-rl;height:800px;width:600px;column-width:600px;";
  doc.innerHTML = el.innerHTML;
  stage.appendChild(doc);
  document.body.appendChild(stage);
  // 強制佈局並跨多頁測量（模擬 paginate 逐頁量測）
  const h = doc.getBoundingClientRect().height;
  for (let p = 0; p < pageSizeCount; p++) {
    const page = document.createElement("div");
    page.style.cssText = "height:800px;width:600px;writing-mode:vertical-rl;overflow:hidden;";
    page.appendChild(doc.cloneNode(true));
    stage.appendChild(page);
    void page.getBoundingClientRect().height; // 強制 reflow
  }
  document.body.removeChild(stage);
  return h;
}

function forceReflow(el: HTMLElement): number {
  // 讀取會強制同步佈局的屬性
  return el.getBoundingClientRect().height + el.scrollHeight;
}

async function frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function run(opts: { variant?: "active" | "off" | "optimized" } = {}): Promise<any> {
  const variant = opts.variant || "active";
  // 清理舊 DOM 與上一輪殘留的變體覆寫 style（避免跨輪污染）
  document.body.innerHTML = "";
  document.querySelectorAll('style[id^="variant-"]').forEach((s) => s.remove());
  if (variant === "off") {
    // 對照組：完全關閉規則（還原「吞字」原 bug）
    const s = document.createElement("style");
    s.id = "variant-off";
    s.textContent = `
      body.li-editor-vertical-active:not(.li-editor-horizontal-active) .workspace-leaf-content[data-type="markdown"] .cm-content,
      body.li-editor-vertical-active:not(.li-editor-horizontal-active) .workspace-leaf-content[data-type="markdown"] .cm-line {
        white-space: pre !important;
        overflow-wrap: normal !important;
        word-break: normal !important;
      }
      body.li-editor-vertical-active:not(.li-editor-horizontal-active) .workspace-leaf-content[data-type="markdown"] .cm-content {
        max-inline-size: none !important;
      }`;
    document.head.appendChild(s);
  } else if (variant === "optimized") {
    // 優化變體：保留 pre-wrap+break-word+max-inline-size，但去掉 overflow-wrap:anywhere
    // （anywhere 會參與 min-content 固有尺寸計算，在 flex 容器對大文檔更貴；CJK 靠 pre-wrap 已能字間斷行）
    const s = document.createElement("style");
    s.id = "variant-optimized";
    s.textContent = `
      body.li-editor-vertical-active:not(.li-editor-horizontal-active) .workspace-leaf-content[data-type="markdown"] .cm-content,
      body.li-editor-vertical-active:not(.li-editor-horizontal-active) .workspace-leaf-content[data-type="markdown"] .cm-line {
        overflow-wrap: normal !important;
      }`;
    document.head.appendChild(s);
  }

  // 宿主結構
  const leaf = document.createElement("div");
  leaf.className = "workspace-leaf-content";
  leaf.setAttribute("data-type", "markdown");
  leaf.style.cssText = "width:640px;height:560px;position:relative;";
  document.body.appendChild(leaf);

  const readerHost = document.createElement("div");
  readerHost.style.cssText = "position:absolute;right:-99999px;top:0;width:640px;height:560px;";
  document.body.appendChild(readerHost);

  const editorHost = document.createElement("div");
  editorHost.style.cssText = "width:100%;height:100%;";
  leaf.appendChild(editorHost);

  const view = setupEditor(editorHost);
  editorView = view;
  const reader = setupReader(readerHost);

  // 初始直排
  document.body.classList.add("li-editor-vertical-active", "li-reader-vertical-active");

  // long-task 觀察器
  const longTasks: number[] = [];
  let observer: any = null;
  try {
    observer = new (window as any).PerformanceObserver((list: any) => {
      for (const e of list.getEntries()) longTasks.push(e.duration);
    });
    observer.observe({ type: "longtask", buffered: true } as any);
  } catch (e) { /* 不支援則略過 */ }

  // ---- 壓力迴圈：高頻切換 + 改參數 + 切分頁 + 模擬匯出 ----
  const ops: { name: string; t: number }[] = [];
  let vertical = true;
  const fsValues = ["16px", "20px", "14px", "24px"];
  const wmValues = ["vertical-rl", "vertical-lr"];
  const N = 90;
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const kind = i % 6;
    if (kind === 0) {
      // 切橫/直排
      vertical = !vertical;
      document.body.classList.toggle("li-editor-vertical-active", vertical);
    } else if (kind === 1) {
      // 改字號
      leaf.style.setProperty("--li-fs", fsValues[i % fsValues.length]);
    } else if (kind === 2) {
      // 改 writing-mode
      leaf.style.setProperty("--li-writing-mode", wmValues[i % wmValues.length]);
    } else if (kind === 3) {
      // 切分頁閱讀（顯示/隱藏 reader）
      readerHost.style.right = i % 2 === 0 ? "-99999px" : "0px";
    } else if (kind === 4) {
      // 改每列字數（觸發 chars-locked 切換）
      if (i % 2 === 0) {
        document.body.classList.add("li-chars-locked");
        leaf.style.setProperty("--li-chars", "18");
      } else {
        document.body.classList.remove("li-chars-locked");
        leaf.style.removeProperty("--li-chars");
      }
    } else {
      // 模擬 PDF 匯出（重克隆＋逐頁量測）
      simulateExport(view.contentDOM);
    }
    // 強制 reflow 並測量
    forceReflow(editorHost);
    void reader.getBoundingClientRect().height;
    const t1 = performance.now();
    ops.push({ name: ["toggle", "fs", "wm", "paged", "chars", "export"][kind], t: t1 - t0 });
    await frame(); // 讓 CM6 量測迴圈有機會跑（貼近真實每次操作後的重測）
  }

  // ---- 連續狂點（同步爆發）測幀掉幀 + 測同步阻塞 ----
  // 先復原直排，再進行同步爆發（模擬瘋狂連點橫直排）
  document.body.classList.add("li-editor-vertical-active");
  const burstStart = performance.now();
  for (let i = 0; i < 60; i++) {
    document.body.classList.toggle("li-editor-vertical-active");
    forceReflow(editorHost);
  }
  const syncBurstMs = performance.now() - burstStart; // 60 次同步切換總阻塞時間
  const frameTimes: number[] = [];
  let last = performance.now();
  await frame();
  // 採樣後續 30 幀
  for (let i = 0; i < 30; i++) {
    await frame();
    const now = performance.now();
    frameTimes.push(now - last);
    last = now;
  }

  // ---- 正確性檢查（靜置直排）----
  document.body.classList.add("li-editor-vertical-active");
  document.body.classList.remove("li-editor-horizontal-active");
  leaf.style.setProperty("--li-writing-mode", "vertical-rl");
  await frame();
  await frame();
  const lines = Array.from(view.contentDOM.querySelectorAll(".cm-line"));
  const rects = lines.map((l) => l.getBoundingClientRect());
  const colCount = new Set(rects.map((r) => Math.round(r.top))).size; // 不同 top = 不同列（垂直換列）
  const maxLineH = Math.max(...rects.map((r) => r.height), 0);
  const contentH = view.contentDOM.getBoundingClientRect().height;
  const scrollH = view.contentDOM.scrollHeight;
  // 閱讀器
  readerHost.style.right = "0px";
  await frame();
  const rRect = reader.getBoundingClientRect();
  const rVisible = rRect.width > 0 && rRect.height > 0 && reader.scrollHeight > 0;

  // 匯出正確性
  const exportH = simulateExport(view.contentDOM, 4);

  if (observer) observer.disconnect();

  const byKind: Record<string, { n: number; sum: number; max: number }> = {};
  for (const o of ops) {
    byKind[o.name] = byKind[o.name] || { n: 0, sum: 0, max: 0 };
    byKind[o.name].n++; byKind[o.name].sum += o.t; byKind[o.name].max = Math.max(byKind[o.name].max, o.t);
  }
  const total = ops.reduce((a, o) => a + o.t, 0);
  const avgFrame = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const dropped = frameTimes.filter((f) => f > 20).length; // >20ms 視為掉幀

  return {
    variant,
    opsTotal: ops.length,
    layoutTotalMs: +total.toFixed(2),
    layoutAvgMs: +(total / ops.length).toFixed(3),
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { n: v.n, sum: +v.sum.toFixed(2), max: +v.max.toFixed(2) }])),
    longTasks: { count: longTasks.length, max: longTasks.length ? +Math.max(...longTasks).toFixed(2) : 0, sum: +longTasks.reduce((a, b) => a + b, 0).toFixed(2) },
    frames: { avgMs: +avgFrame.toFixed(2), droppedOver20ms: dropped, max: +Math.max(...frameTimes).toFixed(2) },
    syncBurstMs: +syncBurstMs.toFixed(2),
    correctness: {
      cmLineCount: lines.length,
      distinctColumns: colCount,
      maxLineHeight: +maxLineH.toFixed(1),
      contentHeight: +contentH.toFixed(1),
      contentScrollHeight: scrollH,
      readerVisible: rVisible,
      readerRect: { w: +rRect.width.toFixed(1), h: +rRect.height.toFixed(1), scrollH: reader.scrollHeight },
      exportDocHeight: +exportH.toFixed(1),
    },
  };
}

(window as any).__liPerf = { run, setupEditor, simulateExport };
