// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* LI-TS-102·104：CLReq 固定 em 寬的 CSS 消費端實測
 * =================================================================
 * `src/vertical-punct.ts` 把寬度寫成 span 上的內聯 `--li-punct-em`；
 * `styles.css` 的選擇器帶 `[style*="--li-punct-em"]`，所以：
 *
 *   · 開關關閉（入口不寫內聯變數）→ 這組規則**一次都不命中**，包好的
 *     標點維持 `.li-punct` 原本的 inline 幾何 —— 這是默認，必須驗證到；
 *   · 開關開啟 → span 帶著變數，規則命中：行內軸長度＝資料層給的 em 值。
 *
 * 沒有這一層，資料層算得再準也只是「DOM 上有個沒人看的變數」。
 *
 * 執行：node test/clreq-em-browser.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";

if (!fs.existsSync(CHROME)) {
  console.log(`    （略過：未找到 ${CHROME}，設 CHROME_BIN 可啟用）`);
  process.exit(0);
}

const CSS = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const FS = 80; // px；0.5em = 40px，1em = 80px（取整誤差容忍 ±2px）

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.setContent(
  `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
   <style>
     *, *::before, *::after { box-sizing: border-box; }
     /* 與 punct-orientation.mjs 同一個理由：字體必須走 styles.css 自己的通道 */
     body { font-size: ${FS}px; --li-font: "Noto Serif CJK SC", "WenQuanYi Micro Hei", serif; }
     .cm-content { line-height: 1; }
   </style>
   <body class="li-editor-vertical-active li-punct-wrap">
     <div class="workspace-leaf-content" data-type="markdown">
       <div class="cm-editor"><div class="cm-scroller"><div class="cm-content">
         <span class="li-punct li-punct-fixed" id="off">：</span>
         <span class="li-punct li-punct-fixed" id="on-half" style="--li-punct-em: 0.5em">：</span>
         <span class="li-punct li-punct-fixed" id="on-full" style="--li-punct-em: 1em">：</span>
       </div></div></div>
     </div>
   </body>`,
  { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);

const got = await p.evaluate(() => {
  const out = {};
  for (const id of ["off", "on-half", "on-full"]) {
    const el = document.getElementById(id);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out[id] = {
      display: cs.display,
      inlineSize: cs.inlineSize,
      wm: getComputedStyle(el.parentElement).writingMode,
      // vertical-rl 下行內軸＝高度；若 writing-mode 沒生效則整份測試無意義
      h: Math.round(r.height),
      w: Math.round(r.width),
    };
  }
  return out;
});

let bad = 0;
const chk = (ok, msg) => {
  if (!ok) { bad++; console.log(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
};

console.log("\n— CLReq 固定 em 寬（真實 styles.css）—");

chk(got.off.wm.startsWith("vertical"), `容器應是直排（實得 ${got.off.wm}）`);
chk(got.off.display === "inline",
  `關閉態：規則不得命中，span 維持 inline（實得 ${got.off.display}）`);
chk(got["on-half"].display === "inline-flex",
  `開啟態：規則應命中並轉為 inline-flex（實得 ${got["on-half"].display}）`);

const near = (x, target) => Math.abs(x - target) <= 2;
chk(near(got["on-half"].h, FS * 0.5),
  `0.5em 應落在行內軸 ${FS * 0.5}px（實得 ${got["on-half"].h}px）`);
chk(near(got["on-full"].h, FS),
  `1em 應落在行內軸 ${FS}px（實得 ${got["on-full"].h}px）`);
// 關閉態是字形自然寬度：全角冒號在 vertical-rl 下本來就接近一個字身，
// 這裡只要求「沒有被 inline-flex 規則改造」（上面已查 display），不鎖死數值。
assert.ok(got.off.h > 0, "關閉態標點應正常渲染（高度不為 0）");

console.log(bad === 0 ? "\nALL OK" : `\n${bad} 項異常`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
