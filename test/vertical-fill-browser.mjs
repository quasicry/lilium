// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 直排「滿版」實證——修復後核心命題：
 *   · 短內容：doc 內容區列長＝文字自然列長（下方無留白，不會「空一大片」）
 *   · 長內容：doc 內容區列長＝可視可用高（滿版），且不被裁（不小於文字自然列長）
 * 構造：固定 600×800 的 .li-stage.li-stage-vertical(flex 容器) > .li-scope > .li-doc(writing-mode:vertical-rl)
 * 執行：node test/vertical-fill-browser.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
if (!fs.existsSync(CHROME)) { console.log(`    （略過：未找到 ${CHROME}）`); process.exit(0); }

const CSS = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const FS = 24;
const SHORT = "天地玄機。"; // 真正短：列長遠小於可用高
const LONG = "天地的玄機，往往在於靜默處顯露。".repeat(12); // 遠超可用高，應滿版多列

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 900, height: 800 } });
await p.setContent(
  `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
   <style>
     *,*::before,*::after{box-sizing:border-box;}
     body{font-size:${FS}px;line-height:1.6;}
     .li-stage{height:600px;width:800px;flex:none;display:flex;}
   </style>
   <body>
     <div class="li-stage li-stage-vertical" id="short">
       <div class="li-scope"><div class="li-doc" id="s_doc" style="writing-mode:vertical-rl">
         <p id="s_txt">${SHORT}</p></div></div>
     </div>
     <div class="li-stage li-stage-vertical" id="long">
       <div class="li-scope"><div class="li-doc" id="l_doc" style="writing-mode:vertical-rl">
         <p id="l_txt">${LONG}</p></div></div>
     </div>
   </body>`,
  { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);

const r = await p.evaluate(() => {
  function measure(docId, txtId, stageId) {
    const doc = document.getElementById(docId), txt = document.getElementById(txtId), stage = document.getElementById(stageId);
    const cs = getComputedStyle(doc);
    const padTop = parseFloat(cs.paddingTop) || 0, padBottom = parseFloat(cs.paddingBottom) || 0;
    const docInnerH = doc.clientHeight - padTop - padBottom;
    const rects = txt.getClientRects();
    let top = Infinity, bottom = -Infinity;
    for (const rc of rects) { top = Math.min(top, rc.top); bottom = Math.max(bottom, rc.bottom); }
    return { stageH: stage.clientHeight, docInnerH: Math.round(docInnerH), textH: Math.round(bottom - top) };
  }
  return { short: measure("s_doc", "s_txt", "short"), long: measure("l_doc", "l_txt", "long") };
});

const stagePad = 24;                 // .li-stage padding space-3 ≈ 12×2
const docPadV = 24 + 24;             // .li-doc padding space-6 ≈ 24（上下）
const availDocInnerH = r.short.stageH - stagePad - docPadV; // 滿版時 doc 內容區應到的高度
console.log("短內容:", JSON.stringify(r.short), "長內容:", JSON.stringify(r.long), "滿版內容區高≈", availDocInnerH);

// 短內容：doc 列長＝文字列長（無底部留白，不會被釘到可用高）
assert(Math.abs(r.short.docInnerH - r.short.textH) <= FS * 1.5,
  `短內容底部留白過大 doc=${r.short.docInnerH} vs text=${r.short.textH}`);
// 長內容：doc 內容區列長＝滿版可用高（貼滿，多列承載）且不被裁（不小於文字列長）
assert(r.long.docInnerH >= availDocInnerH - FS * 1.5 && r.long.docInnerH <= availDocInnerH + 1,
  `長內容未滿版 doc=${r.long.docInnerH} 應≈${availDocInnerH}`);
assert(r.long.textH <= r.long.docInnerH + FS, // 多列承載，文字總列長≤單列滿版高（溢出部分走橫向多列）
  `長內容疑似被裁 text=${r.long.textH} doc=${r.long.docInnerH}`);

console.log(`✓ 直排滿版修復：短內容無底部留白(${r.short.docInnerH - r.short.textH}px)、長內容滿版(${r.long.docInnerH}/${availDocInnerH}px)`);
await b.close();
