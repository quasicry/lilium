// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * test/punct-orientation.mjs — 端到端驗證：用**真實的 styles.css** + 真實的原生 DOM 結構，
 * 量測 ASCII 標點在直排下是否直立。
 *
 * 與 _punctprobe.mjs 的差別：那個是自己刻一小段 CSS 證明「inline span +
 * text-orientation:upright」這個手法有效；這個是證明「我們真的把它接上了」——
 * 選擇器寫錯一個字，這裡就會紅。
 *
 * 判據：拿同一容器裡的「文」當基準。直立標點的行內長度應接近一個全形字身，
 * 被旋轉的 ASCII 標點則只剩字形的橫向步進（約 0.3 em），兩者差 3 倍以上。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
// v2.8.40：允許外餵一份 styles.css（對照舊版／分支用）；不設一律吃工作樹的真實 CSS。
const CSS_PATH = process.env.LI_PROBE_CSS || path.join(ROOT, "styles.css");
const CSS = fs.readFileSync(CSS_PATH, "utf8");

const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });

await p.setContent(
  `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
   <style>
     /* 只補宿主環境的前提與字體，其餘全部吃真實 styles.css */
     *, *::before, *::after { box-sizing: border-box; }
     /* styles.css 用 var(--li-fs, inherit)，沒傳就退回 body 的 16px。
        這裡直接把 body 撐到 100px，避免在測試裡偷偷設 --li-fs 而掩蓋問題。 */
     /* 字體必須走 styles.css 自己的通道（--li-font）才生效：
        先前直接寫 .cm-content { font-family: … }（特異性 0,1,0）會被
        .workspace-leaf-content[data-type="markdown"] .cm-content
        { font-family: var(--li-font, inherit) }（0,2,1）壓掉，容器落到無 CJK 字形的
        字體上，「文」的行內推進量得 0 → 佔比 Infinity → upright 判據恆真，
        三種 case 一起失去分辨力（v2.8.40 修）。 */
     body {
       font-size: 100px;
       --li-font: "Noto Serif CJK SC", "WenQuanYi Micro Hei", serif;
     }
     .cm-content, .markdown-preview-view {
       line-height: 1;
     }
   </style>
   <body>
     <div class="workspace-leaf-content" data-type="markdown">
       <div class="cm-editor"><div class="cm-scroller"><div class="cm-content" id="ed">文<span class="li-punct li-punct-point">!</span><span class="li-punct li-punct-point">?</span>文</div></div></div>
       <div class="markdown-preview-view" id="pv"><p>文<span class="li-punct li-punct-point">!</span><span class="li-punct li-punct-point">,</span>文</p></div>
     </div>
   </body>`,
  { waitUntil: "load" }
);
await p.evaluate(() => document.fonts.ready);

/**
 * 量測：回傳 { ref: {w,h}, puncts: [{ch,w,h}] }
 * ref 取容器裡第一個「文」的文字節點（基準字身）。
 */
async function measure(sel) {
  return p.evaluate((s) => {
    const root = document.querySelector(s);
    // 直接問計算樣式，不要從盒子尺寸「猜」軸向：
    // vertical-* 下行內軸是高度、塊軸是寬度；horizontal-tb 反過來。
    // 用尺寸猜會被 line-height 與字體度量的差異帶偏（111 vs 100）。
    const wm = getComputedStyle(root).writingMode || "horizontal-tb";
    const out = { ref: null, puncts: [], vertical: wm.startsWith("vertical") };
    const box = (node, start, end) => {
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, end);
      const b = r.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    };
    const walk = (n) => {
      if (n.nodeType === 3) {
        const t = n.nodeValue;
        const i = t.indexOf("文");
        if (i >= 0 && !out.ref) out.ref = box(n, i, i + 1);
      } else {
        for (const c of n.childNodes) walk(c);
      }
    };
    walk(root);
    for (const span of root.querySelectorAll(".li-punct")) {
      const r = document.createRange();
      r.selectNodeContents(span);
      const bb = r.getBoundingClientRect();
      out.puncts.push({ ch: span.textContent, w: Math.round(bb.width), h: Math.round(bb.height) });
    }
    return out;
  }, sel);
}

const setBody = (cls) => p.evaluate((c) => { document.body.className = c; }, cls);

const cases = [
  ["基線 · 無 li-punct-wrap（應旋轉）", "li-editor-vertical-active", false],
  ["li-punct-wrap（應直立）", "li-editor-vertical-active li-punct-wrap", true],
  ["li-punct-wrap + li-punct-center（應直立且居中）", "li-editor-vertical-active li-punct-wrap li-punct-center", true],
];

let bad = 0;
for (const [name, cls, expectUpright] of cases) {
  await setBody(cls);
  console.log(`\n— ${name} —`);
  for (const [zone, sel] of [["編輯器", "#ed"], ["閱讀", "#pv"]]) {
    const { ref, puncts, vertical } = await measure(sel);
    if (!ref) { console.log(`  ✗ ${zone} 量不到基準字身`); bad++; continue; }
    if (!vertical) { console.log(`  ✗ ${zone} 容器不是直排（writing-mode 未生效，測試無效）`); bad++; continue; }
    // 行內軸：vertical-* 下是高度，horizontal-tb 下是寬度
    const refInline = vertical ? ref.h : ref.w;
    // v2.8.40：基準測得 0 表示「文」根本沒被 CJK 字體渲染，佔比會退化成 Infinity
    // 而讓 upright 判據恆真。這種情況必須當失敗處理，不能繼續比。
    if (!(refInline > 0)) {
      console.log(`  ✗ ${zone} 基準「文」行內長度測得 ${refInline}（${ref.w}×${ref.h}）` +
        `——字體未正確套用，uight 判據失效`);
      bad++;
      continue;
    }
    for (const q of puncts) {
      const inline = vertical ? q.h : q.w;
      const upright = inline >= refInline * 0.75;
      const ok = upright === expectUpright;
      if (!ok) bad++;
      console.log(
        `  ${ok ? "✓" : "✗"} ${zone} ${JSON.stringify(q.ch)} → ${q.w}×${q.h}` +
        `（基準「文」${ref.w}×${ref.h}，行內佔比 ${(inline / refInline).toFixed(2)}）` +
        `${upright ? " 直立" : " 旋轉"}`
      );
    }
  }
}
console.log(bad === 0 ? "\nALL OK" : `\n${bad} 項異常`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
