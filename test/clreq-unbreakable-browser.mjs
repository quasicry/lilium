// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* LI-TS-103：不可分離序列（`——` `……`）的守衛門禁
 * =================================================================
 * 審核清單把「`——`/`……` 不可分離序列」列為未接線項。動手前先實測了現狀：
 *
 *   Chromium 對 U+2014 / U+2026 的 line-break class 本身就帶禁則 —— 實測
 *   無論是純文字、加 `line-break: strict`、還是被 vertical-punct 包成一顆顆
 *   `<span class="li-punct">`（後者是我們真實會產生的 DOM），兩個破折號都
 *   **同一列**，不會被拆到列尾／列首。
 *
 * 所以這一條不是「缺功能」，而是「缺證據」：`planPunctMarks()` 算出來的包裹
 * 計畫留在資料層即可，渲染層**不為它改 DOM 結構**（改結構＝多包一層 wrapper，
 * 那是會動到預覽 DOM 樹的改動，代價遠大於收益，且目前沒有實際缺陷要修）。
 *
 * 本測試把這個結論釘死：一旦引擎行為變了、或我們哪次改包裹把禁則弄壞，
 * 這裡會紅 —— 那時才是真的需要補 wrapper 的時候。
 *
 * 執行：node test/clreq-unbreakable-browser.mjs
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
// 列長（inline-size）＝200px ÷ 40px ≈ 5 字 ⇒ 必定換列，破折號才有機會被拆到列尾/列首
const FS = 40;

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.setContent(
  `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
   <style>
     *, *::before, *::after { box-sizing: border-box; }
     body { font-size: ${FS}px; --li-font: "Noto Serif CJK SC", "WenQuanYi Micro Hei", serif; }
     .v { writing-mode: vertical-rl; font-family: var(--li-font, inherit); line-height: 1;
          height: 200px; width: 400px; }
     .u { text-orientation: upright; }
   </style>
   <body class="li-editor-vertical-active li-punct-wrap">
     <div class="v" id="dash">文文文<span class="li-punct u">—</span><span class="li-punct u">—</span>文文文文</div>
     <div class="v" id="ellipsis">文文文<span class="li-punct u">…</span><span class="li-punct u">…</span>文文文文</div>
     <div class="v" id="strict" style="line-break: strict">文文文<span class="li-punct u">—</span><span class="li-punct u">—</span>文文文文</div>
   </body>`,
  { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);

const got = await p.evaluate(() => {
  const out = {};
  for (const id of ["dash", "ellipsis", "strict"]) {
    const root = document.getElementById(id);
    const cols = new Set();
    for (const sp of root.querySelectorAll("span.u")) {
      const r = document.createRange();
      r.selectNodeContents(sp);
      const q = r.getBoundingClientRect();
      // vertical-rl：不同的「列」體現在水平位移（left）
      cols.add(Math.round(q.left));
    }
    out[id] = { cols: [...cols], wm: getComputedStyle(root).writingMode };
  }
  return out;
});

let bad = 0;
const chk = (ok, msg) => {
  if (!ok) { bad++; console.log(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
};

console.log("\n— CLReq 不可分離序列（真 Chromium）—");
chk(Object.values(got).every((g) => g.wm.startsWith("vertical")), "容器應為直排（writing-mode 生效）");
for (const [id, g] of Object.entries(got)) {
  chk(g.cols.length === 1,
    `${id}：兩個標點應同列（實得 ${g.cols.length} 個不同的列位置：${g.cols.join(",")}）`);
}

console.log(bad === 0 ? "\nALL OK" : `\n${bad} 項異常`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
