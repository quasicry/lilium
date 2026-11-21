// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// [診斷] 編輯器直排「高度鏈」實驗 driver
// 核心假說：v2.8.69 的 max-inline-size:100% 是百分比，遇到「祖先高度不確定」時會塌成 none，
// 列長完全不受約束 → 長段不換列 → 溢出被 overflow-y:hidden 裁掉（吞字）＋下方留白。
// 本實驗忠實還原 Obsidian 的包裹層（不給 .view-content / .markdown-source-view 明確高度），
// 用真實 CM6 掛載，量測「補上高度鏈前 / 後」的差異。
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pw from "playwright-core";
const { chromium } = pw;

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const css = fs.readFileSync(ROOT + "/styles.css", "utf8");
const out = ROOT + "/test/build/editor-heightchain-bundle.mjs";
fs.mkdirSync(ROOT + "/test/build", { recursive: true });
execSync(`${ROOT}/node_modules/.bin/esbuild ${ROOT}/test/editor-heightchain-bundle.ts --bundle --format=esm --platform=browser --outfile=${out} --log-level=warning`);

const browser = await chromium.launch({ executablePath: process.env.LI_CHROMIUM || "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body class="li-editor-vertical-active"></body></html>`);
await page.addScriptTag({ content: fs.readFileSync(out, "utf8"), type: "module" });
await page.waitForFunction(() => !!window.__cm, null, { timeout: 15000 });

// 建構忠實 DOM 鏈 + 掛載真實 CM6；variant 決定是否給中間層補確定高度
const measure = await page.evaluate(() => {
  const { EditorView, EditorState } = window.__cm;
  const LONG = "這是為了重現直排列長問題而準備的一段很長的中文正文，".repeat(40);
  const doc = "# 第一章 緒論\n\n" + LONG + "\n\n" + LONG;

  function build(addFix) {
    document.body.innerHTML = "";
    if (addFix) {
      const s = document.createElement("style");
      s.id = "fix";
      s.textContent = `
        body.li-editor-vertical-active .workspace-leaf-content[data-type="markdown"] .view-content,
        body.li-editor-vertical-active .workspace-leaf-content[data-type="markdown"] .markdown-source-view {
          height: 100% !important;
          min-height: 0 !important;
        }`;
      document.head.appendChild(s);
    } else {
      const old = document.getElementById("fix");
      if (old) old.remove();
    }
    // 葉容器：給定確定高度（對應真實 Obsidian 的 leaf 面板）
    const leaf = document.createElement("div");
    leaf.className = "workspace-leaf-content";
    leaf.setAttribute("data-type", "markdown");
    leaf.style.height = "600px";
    leaf.style.width = "800px";
    // 中間層：不給明確高度（忠實還原 —— 插件只設 overflow，沒設 height）
    const vc = document.createElement("div");
    vc.className = "view-content";
    const msv = document.createElement("div");
    msv.className = "markdown-source-view mod-cm6";
    vc.appendChild(msv);
    leaf.appendChild(vc);
    document.body.appendChild(leaf);
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [EditorView.lineWrapping] }),
      parent: msv,
    });
    return { leaf, vc, msv, view };
  }

  function probe(built) {
    const { leaf, vc, msv } = built;
    const editor = msv.querySelector(".cm-editor");
    const scroller = msv.querySelector(".cm-scroller");
    const content = msv.querySelector(".cm-content");
    const cs = getComputedStyle(scroller);
    const cc = getComputedStyle(content);
    const lines = [...content.querySelectorAll(".cm-line")];
    const tops = new Set(lines.map((l) => Math.round(l.getBoundingClientRect().top / 5)));
    const cr = content.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    return {
      leafH: leaf.clientHeight,
      viewContentH: Math.round(vc.getBoundingClientRect().height),
      msvH: Math.round(msv.getBoundingClientRect().height),
      editorH: Math.round(editor.getBoundingClientRect().height),
      scrollerH: scroller.clientHeight,
      scrollerScrollH: scroller.scrollHeight,
      contentInlineSize: cc.inlineSize,
      contentMaxInlineSize: cc.maxInlineSize,
      contentHeight: Math.round(cr.height),
      contentWidth: Math.round(cr.width),
      scrollerWritingMode: cs.writingMode,
      scrollerAlignItems: cs.alignItems,
      contentWhiteSpace: cc.whiteSpace,
      lineCount: lines.length,
      distinctRowBuckets: tops.size,
      // 溢出判定：內容高度是否遠超容器（垂直溢出＝吞字）
      overflowPx: scroller.scrollHeight - scroller.clientHeight,
    };
  }

  const before = build(false);
  // 等一幀讓 CM6 完成量測
  return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const b = probe(before);
    const after = build(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const a = probe(after);
      res({ before: b, after: a });
    }));
  })));
});

await browser.close();

const fmt = (o) => JSON.stringify(o, null, 2);
console.log("================= 編輯器直排「高度鏈」實驗 =================");
console.log("文檔：# 第一章 緒論 + 2 段長中文（各 40×重複），CM6 lineWrapping 啟用");
console.log("葉容器高 600px；.view-content / .markdown-source-view 不給明確高度（忠實還原）\n");
console.log("--- 現況（v2.8.71：未補高度鏈）---");
console.log(fmt(measure.before));
console.log("\n--- 補上高度鏈（.view-content / .markdown-source-view: height:100%）---");
console.log(fmt(measure.after));

const b = measure.before, a = measure.after;
console.log("\n--- 判讀 ---");
console.log(`內容高度：現況 ${b.contentHeight}px → 補鏈後 ${a.contentHeight}px（容器高 ${b.scrollerH}）`);
console.log(`垂直溢出：現況 ${b.overflowPx}px → 補鏈後 ${a.overflowPx}px`);
console.log(`換列列數（不同 top 桶）：現況 ${b.distinctRowBuckets} → 補鏈後 ${a.distinctRowBuckets}`);
const fixed = Math.abs(a.overflowPx) < 40 && a.contentHeight <= b.scrollerH + 8;
console.log(fixed
  ? "\n✅ 假說成立：補上高度鏈後內容不再溢出、列長受容器約束 → 根因是百分比高度鏈斷裂"
  : "\n❌ 假說不成立：補鏈後仍未修好，需另尋根因");
