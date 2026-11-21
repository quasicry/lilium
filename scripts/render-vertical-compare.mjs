// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 生成「lilium 原定位邏輯 vs li 直排座標服務」對比圖。
 * 用途：交付存證 / 文件配圖。
 * 執行：node scripts/render-vertical-compare.mjs <輸出PNG路徑>
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const OUT = process.argv[2] || path.join(ROOT, "vertical-anchor-compare.png");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-vcmp-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "src", "shared", "vertical-anchor.ts"),
  "--bundle", "--format=iife", "--global-name=VAnchor",
  `--outfile=${path.join(TMP, "va.js")}`, "--log-level=silent",
]);
const VA_JS = fs.readFileSync(path.join(TMP, "va.js"), "utf8");

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:1100px;height:520px;background:#f7f5f0;
    font-family:"Noto Serif CJK SC",serif;overflow:hidden}
  .panel{position:absolute;top:0;height:520px;width:550px}
  #p-old{left:0;border-right:1px dashed #bbb}
  #p-new{left:550px}
  .cap{position:absolute;top:12px;left:16px;font:600 15px/1.5 sans-serif}
  .cap small{display:block;font-weight:400;color:#666;font-size:12px}
  .stage{position:absolute;top:70px;right:40px;height:400px;
    writing-mode:vertical-rl;font:22px/1.5 serif;color:#222}
  .tgt{background:#ffe08a}
  .colAfter{color:#999}
  .popup{position:absolute;width:300px;height:80px;box-sizing:border-box;
    font:13px/1.5 sans-serif;padding:8px 10px;z-index:5}
  #pop-old{background:rgba(220,60,60,.14);border:2px solid #d33;color:#a11}
  #pop-new{background:rgba(50,160,80,.14);border:2px solid #2a5;color:#164}
  .note{position:absolute;bottom:14px;left:16px;font:12px/1.6 sans-serif;color:#555;
    max-width:520px}
  .badge{display:inline-block;padding:1px 6px;border-radius:3px;color:#fff;font-size:11px}
  .b-bad{background:#d33}.b-good{background:#2a5}
</style></head><body>
  <div class="panel" id="p-old">
    <div class="cap">UD 原邏輯 <small>hover-lookup.ts position()：below-anchor + flip</small></div>
    <div class="stage" id="st-old">歲在甲辰孟春之月<span class="tgt" id="w-old">蒙古文字</span><span class="colAfter">後續文字後續文字後續文字</span></div>
    <div class="popup" id="pop-old"><b>釋義</b><br>彈窗壓在同列後續文字上，遮住未讀內容</div>
    <div class="note"><span class="badge b-bad">問題</span> 直排下詞為窄高矩形，彈窗「置於詞下方」= 壓在同一列的後續文字上。</div>
  </div>
  <div class="panel" id="p-new">
    <div class="cap">li 直排座標服務 <small>vertical-anchor.ts：換列方向側優先</small></div>
    <div class="stage" id="st-new">歲在甲辰孟春之月<span class="tgt" id="w-new">蒙古文字</span><span class="colAfter">後續文字後續文字後續文字</span></div>
    <div class="popup" id="pop-new"><b>釋義</b><br>彈窗置於換列方向側（此處為左），不遮閱讀流</div>
    <div class="note"><span class="badge b-good">改進</span> 直排下水平錯開至換列方向側，垂直對齊錨點頂部；橫排下座標與原邏輯逐像素一致。</div>
  </div>
</body></html>`;
fs.writeFileSync(path.join(TMP, "page.html"), HTML, "utf8");

const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 520 }, deviceScaleFactor: 2 });
await page.setContent(HTML, { waitUntil: "load" });
await page.addScriptTag({ content: VA_JS });

const result = await page.evaluate(() => {
  const VA = window.VAnchor;
  const VW = 550, VH = 520; // 每個面板視口寬度
  const place = (wordId, popupId, panelIdx, useNew) => {
    const w = document.getElementById(wordId);
    const r = w.getBoundingClientRect();
    // 轉為面板內相對座標
    const off = panelIdx * 550;
    const rect = { left: r.left - off, right: r.right - off, top: r.top, bottom: r.bottom };
    let p;
    if (useNew) {
      p = VA.computePopupPlacement(
        { rect, axis: "vertical", columnOrder: "rl" }, 300, 80, VW, VH);
    } else {
      // 重現 UD 原 position()
      let left = rect.left;
      if (left + 300 > VW - 8) left = Math.max(8, rect.right - 300);
      if (left < 8) left = 8;
      let top = rect.bottom + 6;
      if (top + 80 > VH - 8) top = rect.top - 80 - 6;
      if (top < 8) top = Math.max(8, VH - 80 - 8);
      p = { left, top, placement: "below" };
    }
    const el = document.getElementById(popupId);
    // popup 的定位祖先是 .panel（position:absolute），故用面板內相對座標，不加面板偏移
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    return { word: rect, popup: p };
  };
  const oldR = place("w-old", "pop-old", 0, false);
  const newR = place("w-new", "pop-new", 1, true);
  return { old: oldR, new: newR };
});

await page.screenshot({ path: OUT });
await browser.close();

const fmt = (o) => `word x[${o.word.left.toFixed(0)},${o.word.right.toFixed(0)}] y[${o.word.top.toFixed(0)},${o.word.bottom.toFixed(0)}] → popup (${o.popup.left.toFixed(0)}, ${o.popup.top.toFixed(0)}) [${o.popup.placement}]`;
console.log(`原邏輯：${fmt(result.old)}`);
console.log(`新邏輯：${fmt(result.new)}`);
console.log(`已輸出：${OUT}`);
