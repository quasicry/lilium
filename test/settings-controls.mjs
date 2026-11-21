// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * test/settings-controls.mjs — 端到端驗證：設定頁控制項是否維持 Obsidian 原生幾何。
 *
 * 這是唯一一條「真的把 styles.css 餵給瀏覽器量控制項」的門禁。
 * test/run.mjs 的 [1.14] 前面幾條都只是源碼掃描，選擇器拼錯不會紅；這條會紅。
 *
 * 背景（實際災情，見 test/_settingsprobe.mjs）：
 *   · 滑桿  455×32（只有 Obsidian 原生） → 129×28（+ 插件 CSS）
 *   · 開關  40×22（原生膠囊）            → 51×31（我們自繪的 iOS 款）
 * 機制：插件把 .setting-item-control 鎖成 flex: 0 0 auto，寬度變成「由內容決定」；
 * 而原生滑桿是 width:100%，百分比遇上這種父層會退化成 UA 預設寬度。
 *
 * 做法：同一份 DOM 餵兩套 CSS（A 只有原生殼層 / B 原生殼層 + 插件 styles.css），
 * 逐項比對。插件可以「不動」，但不可以「變形」。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OBSIDIAN_CONTROLS, BASE_CSS, SETTINGS_HTML } from "./ui-fixtures.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";

const PROBE = `(() => {
  const R = (v) => Math.round(v);
  const box = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { w: R(b.width), h: R(b.height) };
  };
  return {
    settings: box(".li-settings"),
    slider: box(".li-settings input[type='range']"),
    control: box(".li-settings .setting-item-control"),
    sw: box(".li-settings .checkbox-container"),
    button: box(".li-settings .setting-item-control button"),
    select: box(".li-settings .setting-item-control select"),
    text: box(".li-settings .setting-item-control input[type='text']"),
  };
})()`;

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function measure(css) {
  const p = await b.newPage({ viewport: { width: 900, height: 800 } });
  await p.setContent(
    `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}\n${OBSIDIAN_CONTROLS}\n${css}</style>
     <body style="margin:0;padding:16px">${SETTINGS_HTML}</body>`,
    { waitUntil: "load" }
  );
  const m = await p.evaluate(PROBE);
  await p.close();
  return m;
}

const A = await measure("");                  // 只有 Obsidian 原生殼層（基線）
const B = await measure(pluginCss);           // 原生殼層 + 插件 styles.css

let bad = 0;
const ok = (n) => console.log(`  ✓ ${n}`);
const no = (n) => { bad++; console.log(`  ✗ ${n}`); };

const row = (name, a, bx) => `  ${name.padEnd(6)} A ${a ? a.w + "×" + a.h : "n/a"}   B ${bx ? bx.w + "×" + bx.h : "n/a"}`;

console.log("設定頁控制項幾何（A = 只有 Obsidian 原生 / B = 原生 + 插件 styles.css）\n");
console.log(row("滑桿", A.slider, B.slider));
console.log(row("開關", A.sw, B.sw));
console.log(row("按鈕", A.button, B.button));
console.log(row("下拉", A.select, B.select));
console.log(row("輸入框", A.text, B.text));
console.log(row("控制區", A.control, B.control));
console.log("");

/* ── 1. 基線本身要成立，否則整套測試無效 ── */
if (A.slider && A.slider.w >= 200) ok(`基線滑桿夠寬 ${A.slider.w}px（原生 width:100% 生效）`);
else no(`基線滑桿只有 ${A.slider ? A.slider.w : "n/a"}px，OBSIDIAN_CONTROLS 沒模擬出原生行為，測試無效`);

if (A.sw && A.sw.w === 40 && A.sw.h === 22) ok(`基線開關為原生 40×22`);
else no(`基線開關為 ${A.sw ? A.sw.w + "×" + A.sw.h : "n/a"}，應為原生 40×22`);

/* ── 2. 套上插件 CSS 後，滑桿不得被壓扁（使用者回報的元兇） ──
   用「滑桿實寬 ÷ 設定頁寬度」的比值比對，而不是比絕對寬度：
   插件的 .li-settings 有 max-width:720px，整頁本來就比基線窄，
   拿絕對寬度比會把這個刻意設計誤判成壓扁。 */
if (A.slider && B.slider && A.settings && B.settings) {
  const ra = A.slider.w / A.settings.w;
  const rb = B.slider.w / B.settings.w;
  if (rb >= ra * 0.9 && B.slider.w >= 120) {
    ok(`滑桿維持基線佔寬 ${Math.round(ra * 100)}% → ${Math.round(rb * 100)}%（${A.slider.w} → ${B.slider.w}px，頁面寬 ${A.settings.w} → ${B.settings.w}）`);
  } else {
    no(`滑桿被壓扁：佔寬 ${Math.round(ra * 100)}% → ${Math.round(rb * 100)}%（${A.slider.w} → ${B.slider.w}px），使用者會拖不動`);
  }
} else {
  no("量不到滑桿");
}

/* ── 3. 開關必須就是原生那一顆，不能被自繪成 iOS 款 ── */
if (A.sw && B.sw) {
  if (B.sw.w === A.sw.w && B.sw.h === A.sw.h) {
    ok(`開關維持原生尺寸 ${B.sw.w}×${B.sw.h}（未自繪貼皮）`);
  } else {
    no(`開關被貼皮：${A.sw.w}×${A.sw.h} → ${B.sw.w}×${B.sw.h}`);
  }
} else {
  no("量不到開關");
}

/* ── 4. 其餘控制項的外觀尺寸也不得被改動 ── */
for (const [name, key] of [["按鈕", "button"], ["下拉", "select"], ["輸入框", "text"]]) {
  const a = A[key];
  const bx = B[key];
  if (!a || !bx) { no(`量不到${name}`); continue; }
  if (Math.abs(bx.h - a.h) <= 1) ok(`${name}高度維持 ${bx.h}px（原生 ${a.h}px）`);
  else no(`${name}高度被改：${a.h} → ${bx.h}px`);
}

console.log(bad === 0 ? "\nALL OK" : `\n${bad} 項異常`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
