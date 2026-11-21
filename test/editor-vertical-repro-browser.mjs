// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// [重現] 直排編輯器「居中＋吞字＋列長只佔一部分」最小重現
// 與上一版診斷的差別：.view-content 受葉容器約束（flex:1 + overflow hidden），
// 忠實還原真實 Obsidian —— 上一版讓它長高，所以沒被裁切、假性通過。
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pw from "playwright-core";
const { chromium } = pw;

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const css = fs.readFileSync(ROOT + "/styles.css", "utf8");
const src = ROOT + "/test/editor-heightchain-bundle.ts";
const out = ROOT + "/test/build/editor-heightchain-bundle.mjs";
fs.mkdirSync(ROOT + "/test/build", { recursive: true });
execSync(`${ROOT}/node_modules/.bin/esbuild ${src} --bundle --format=esm --platform=browser --outfile=${out} --log-level=warning`);

const browser = await chromium.launch({ executablePath: process.env.LI_CHROMIUM || "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body class="li-editor-vertical-active"></body></html>`);
await page.addScriptTag({ content: fs.readFileSync(out, "utf8"), type: "module" });
await page.waitForFunction(() => !!window.__cm, null, { timeout: 15000 });

const r = await page.evaluate(() => {
  const { EditorView, EditorState } = window.__cm;
  const LONG = "這是為了重現直排列長問題而準備的一段很長的中文正文，用來驗證長段是否會沿垂直軸換列。".repeat(30);
  const doc = "# 第一章 緒論\n\n" + LONG + "\n\n" + LONG;

  function build(patchCss) {
    document.body.innerHTML = "";
    document.body.className = "li-editor-vertical-active";
    let s = document.getElementById("patch");
    if (s) s.remove();
    if (patchCss) {
      s = document.createElement("style");
      s.id = "patch";
      s.textContent = patchCss;
      document.head.appendChild(s);
    }
    // 葉容器：確定高（真實 Obsidian：flex column，高度由 leaf 決定）
    const leaf = document.createElement("div");
    leaf.className = "workspace-leaf-content";
    leaf.setAttribute("data-type", "markdown");
    leaf.style.cssText = "height:600px;width:820px;display:flex;flex-direction:column;overflow:hidden;";
    // 中間層：真實 Obsidian 的 .view-content（flex:1 吃掉剩餘高，並裁切溢出）
    const vc = document.createElement("div");
    vc.className = "view-content";
    vc.style.cssText = "flex:1 1 auto;min-height:0;overflow:hidden;";
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

  function probe(b) {
    const { vc, msv } = b;
    const scroller = msv.querySelector(".cm-scroller");
    const content = msv.querySelector(".cm-content");
    const cs = getComputedStyle(scroller);
    const cc = getComputedStyle(content);
    const lines = [...content.querySelectorAll(".cm-line")];
    // ⚠️ 數視覺列的三個坑，這裡全部踩過才找到對的方法：
    //  1) 數 .cm-line 的 left → 錯：一個邏輯行只有一個 DOM 元素，包住它所有視覺列。
    //  2) 用 .cm-line.getClientRects() → 錯：.cm-line 是 display:block，
    //     區塊元素的 getClientRects() 只回傳單一邊框矩形，永遠是 1。
    //  3) 正確做法：對「文字內容」建 Range 再 getClientRects() —— 每個視覺列一個 rect。
    const visualCols = lines.map((l) => {
      const rg = document.createRange();
      rg.selectNodeContents(l);
      return rg.getClientRects().length;
    });
    const cr = content.getBoundingClientRect();
    const vr = vc.getBoundingClientRect();
    return {
      viewContentH: Math.round(vr.height),
      scrollerH: scroller.clientHeight,
      maxInlineSize: cc.maxInlineSize,
      maxHeight: cc.maxHeight,
      inlineSize: cc.inlineSize,
      whiteSpace: cc.whiteSpace,
      alignItems: cs.alignItems,
      lineCount: lines.length,
      // 每個邏輯行各自換成幾列
      visualColsPerLine: visualCols,
      totalVisualCols: visualCols.reduce((x, y) => x + y, 0),
      // 真實裁切：內容底緣超出祖先 .view-content 可視框多少（該層 overflow:hidden）
      clippedByAncestorPx: Math.round(cr.bottom - vr.bottom),
      contentH: Math.round(cr.height),
      contentW: Math.round(cr.width),
    };
  }

  const NONE = null;
  // 修法：① 補高度鏈（讓百分比有確定參照）② 解除 max-height:none 對列長鎖的廢除
  const FIX = `
    body.li-editor-vertical-active .workspace-leaf-content[data-type="markdown"] .view-content,
    body.li-editor-vertical-active .workspace-leaf-content[data-type="markdown"] .markdown-source-view {
      height: 100% !important; min-height: 0 !important;
    }
    body.li-editor-vertical-active:not(.li-editor-horizontal-active)
      .workspace-leaf-content[data-type="markdown"] .cm-content {
      max-height: 100% !important;
    }`;

  const a = build(NONE);
  return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const before = probe(a);
    const c = build(FIX);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const after = probe(c);
      res({ before, after });
    }));
  })));
});

await browser.close();

console.log("=========== 直排編輯器重現實驗（忠實高度鏈：葉 600px 受約束）===========");
for (const [tag, m] of [["現況 v2.8.71", r.before], ["補高度鏈＋修 max-height 衝突", r.after]]) {
  console.log(`\n--- ${tag} ---`);
  console.log(JSON.stringify(m, null, 2));
}
const b = r.before, a = r.after;
console.log("\n--- 判讀 ---");
console.log(`被祖先裁掉的文字量：現況 ${b.clippedByAncestorPx}px → 修後 ${a.clippedByAncestorPx}px`);
console.log(`長段換列數（每行視覺列數）：現況 ${JSON.stringify(b.visualColsPerLine)} → 修後 ${JSON.stringify(a.visualColsPerLine)}`);
const reproduced = b.clippedByAncestorPx > 30 || Math.max(...b.visualColsPerLine) <= 1;
const fixed = a.clippedByAncestorPx <= 8 && Math.max(...a.visualColsPerLine) >= 2;
console.log(reproduced ? "✅ 已重現使用者症狀（文字被裁／長段不換列）" : "❌ 未重現（合成環境與實機仍不同）");
console.log(fixed ? "✅ 修法有效：不再被裁、長段正常換列" : "❌ 修法無效，需另尋根因");
