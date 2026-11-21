// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * test/dict-panel-css.mjs — 辭典面板 CSS 真的生效嗎？
 *
 * 這是唯一一條「把 styles.css 餵給瀏覽器量詞典面板」的門禁。
 * test/run.mjs 的 [1.15] 只能證明「class 名字出現在 CSS 裡」——
 * 選擇器拼錯、被別的規則蓋掉、寫在註解裡，一樣會綠。這條不會。
 *
 * 背景：src/dict/ 是 v2.0 從另一個插件整包併進來的，**CSS 從來沒跟著搬**。
 * 面板 138 個 class 全部零樣式，靠瀏覽器預設在跑。使用者一直以為
 * 「辭典長這樣」，其實是「辭典沒穿衣服」。v一次補齊（C2）。
 *
 * 做法：同一份 DOM 餵兩套 CSS
 *   A = 只有基準（無插件樣式）
 *   B = 基準 + 插件 styles.css
 * 逐項比對。插件要「有做事」，但對原生控制項「不貼皮」。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";

/** Obsidian 的設計變數（只有測試需要的那幾個，其餘有 fallback） */
const OBSIDIAN_VARS = `
:root {
  --background-primary: #ffffff;
  --background-secondary: #f6f6f6;
  --background-modifier-border: #e0e0e0;
  --background-modifier-hover: rgba(0,0,0,.06);
  --text-normal: #222222;
  --text-muted: #6b6b6b;
  --text-faint: #999999;
  --text-accent: #7c6f64;
  --interactive-accent: #7c6f64;
  --text-on-accent: #ffffff;
  --font-ui-small: 13px;
  --font-ui-smaller: 12px;
  --font-ui-normal: 14px;
  --font-ui-large: 15px;
  --radius-s: 4px;
}
`;

const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html,body{margin:0;padding:0;height:100%;font-family:-apple-system,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif;}
body{background:var(--background-primary);color:var(--text-normal);}
`;

/** 辭典面板 DOM：照 src/dict/view.ts 的 renderShell() 結構。
 *  本探針只量測仍存活的辭典外殼樣式。 */
const PANEL_HTML = `
<div class="li-root">
  <div class="li-header">
    <div class="li-title-row">
      <span class="li-title">li +</span>
      <span class="li-count">2/3 部词典</span>
      <button class="li-icon-btn" aria-label="管理">⚙</button>
    </div>
    <div class="li-tabs">
      <button class="li-tab is-active">辭典</button>
      <button class="li-tab">語料</button>
      <button class="li-tab">轉寫</button>
      <button class="li-tab">校勘</button>
    </div>
    <div class="li-subtabs">
      <button class="li-subtab is-active">查詢</button>
      <button class="li-subtab">歷史</button>
      <button class="li-subtab">書籤 (0)</button>
      <button class="li-subtab">管理</button>
    </div>
    <div class="li-search-row">
      <div class="li-search-wrap">
        <input class="li-search" type="text" placeholder="输入单词查询…">
        <button class="li-clear" aria-label="清除">✕</button>
      </div>
    </div>
    <div class="li-chips">
      <button class="li-chip is-active">全部</button>
      <button class="li-chip li-chip-click" data-tip="繁简关系：學 ↔ 学">汉语大词典</button>
    </div>
  </div>

  <div class="li-body">
    <div class="li-card">
      <iframe class="li-frame"></iframe>
      <div class="li-actions"><button class="li-mini-btn">复制</button></div>
    </div>
    <button class="li-mini-btn">更多</button>
  </div>
</div>
`;

const PROBE = `(() => {
  const R = (v) => Math.round(v);
  const q = (s) => document.querySelector(s);
  const box = (s) => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect(); return { w: R(b.width), h: R(b.height), x: R(b.x), y: R(b.y) }; };
  const cs = (s, p) => { const e = q(s); return e ? getComputedStyle(e)[p] : null; };
  const csAfter = (s, p) => { const e = q(s); return e ? getComputedStyle(e, '::after')[p] : null; };
  const tabs = [...document.querySelectorAll('.li-tab')].map((e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), h: Math.round(b.height) }; });
  return {
    root: box('.li-root'),
    body: box('.li-body'),
    tabRow: (() => { const t = tabs; return t.length ? { sameRow: t.every((a) => a.y === t[0].y), h: t[0].h, n: t.length } : null; })(),
    activeTabBorder: cs('.li-tab.is-active', 'borderBottomWidth'),
    activeTabColor: cs('.li-tab.is-active', 'borderBottomColor'),
    activeTabBg: cs('.li-tab.is-active', 'backgroundColor'),
    inactiveTabBg: cs('.li-tab:not(.is-active)', 'backgroundColor'),
    inactiveTabBorder: cs('.li-tab:not(.is-active)', 'borderBottomWidth'),
    // 非活動頁籤也留 2px 是刻意的（避免切頁時整列跳動），
    // 所以鑑別活動與否要看**顏色**，不是寬度。
    inactiveTabColor: cs('.li-tab:not(.is-active)', 'borderBottomColor'),
    chipRadius: cs('.li-chip', 'borderRadius'),
    chipBorder: cs('.li-chip', 'borderTopWidth'),
    activeChipBg: cs('.li-chip.is-active', 'backgroundColor'),
    cardBorder: cs('.li-card', 'borderTopWidth'),
    bodyOverflow: cs('.li-body', 'overflowY'),
    rootDisplay: cs('.li-root', 'display'),
    tipContent: csAfter('.li-chip-click[data-tip]', 'content'),
    tipPosition: csAfter('.li-chip-click[data-tip]', 'position'),
    miniBtnRadius: cs('.li-mini-btn', 'borderRadius'),
  };
})()`;

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

/**
 * @param hoverSel 量測前先 hover 的選擇器。
 *   data-tip 的浮層寫在 :hover 上，不 hover 就量不到——
 *   第一版就是在這裡栽的：content 一直回 none，看起來像 CSS 沒寫。
 */
async function measure(css, hoverSel) {
  const p = await b.newPage({ viewport: { width: 900, height: 800 } });
  await p.setContent(
    `<!doctype html><meta charset="utf-8"><style>${OBSIDIAN_VARS}\n${BASE_CSS}\n${css}</style>
     <body style="margin:0">${PANEL_HTML}</body>`,
    { waitUntil: "load" },
  );
  if (hoverSel) await p.hover(hoverSel);
  const m = await p.evaluate(PROBE);
  await p.close();
  return m;
}

// 基準：沒有插件樣式（＝ 以前的真實樣貌）
const A = await measure("", ".li-chip-click[data-tip]");
// 基準 + 插件 styles.css（hover 才量得到 data-tip 浮層）
const B = await measure(pluginCss, ".li-chip-click[data-tip]");

let bad = 0;
const ok = (n) => console.log(`  ✓ ${n}`);
const no = (n) => { bad++; console.log(`  ✗ ${n}`); };

console.log("辭典面板（A = 無插件樣式 / B = 加插件 styles.css）\n");
console.log(`  root   A ${A.root.h}px 高   B ${B.root.h}px 高   （視窗 800px）`);
console.log(`  頁籤   A ${A.tabRow.h}px 高、同一列 ${A.tabRow.sameRow}   B ${B.tabRow.h}px 高、同一列 ${B.tabRow.sameRow}`);
console.log(`  chip   A 圓角 ${A.chipRadius}   B 圓角 ${B.chipRadius}`);
console.log("");

/* ── 1. 基準本身要「看得出沒穿衣服」，否則這套測試沒有鑑別力 ── */
if (A.tabRow && !A.tabRow.sameRow) ok("基線六個頁籤會換行（無樣式的裸按鈕）——鑑別力成立");
else if (A.tabRow && A.tabRow.h < 30) ok(`基線頁籤高 ${A.tabRow.h}px（裸按鈕）——鑑別力成立`);
else no("基線與加樣式後長得太像，這套測試沒有鑑別力");

/* ── 2. 外殼：flex 直向、撐滿高度、內容區可捲動 ── */
if (B.rootDisplay === "flex") ok(".li-root 為 flex 直向容器（頁首固定、內容區捲動）");
else no(`.li-root 的 display 為 ${B.rootDisplay}，應為 flex`);

if (B.root.h >= 700) ok(`.li-root 撐滿視窗高 ${B.root.h}px（否則內容區永遠捲不動）`);
else no(`.li-root 只有 ${B.root.h}px 高，應撐滿 800px 視窗`);

if (B.bodyOverflow === "auto" || B.bodyOverflow === "scroll") ok(".li-body 可捲動（overflow-y: auto）");
else no(`.li-body 的 overflow-y 為 ${B.bodyOverflow}，應為 auto`);

/* ── 3. 頁籤：同一列、有高度、活動頁籤有底線 ── */
/* W9-F：頂層頁籤現為 4 個（辭典/語料/轉寫/校勘）；查詢/歷史/書籤/管理 已收為 辭典 的二級子分頁（.li-subtab，不計入此列）。 */
if (B.tabRow && B.tabRow.sameRow && B.tabRow.n === 4) ok(`四個頂層頁籤排在同一列（高 ${B.tabRow.h}px）`);
else no(`頁籤沒排成同一列：n=${B.tabRow ? B.tabRow.n : "n/a"} sameRow=${B.tabRow ? B.tabRow.sameRow : "n/a"}`);

// UI 重設計（按鈕上無上划線、層級簡潔明顯）——
// 頁籤全部去除 border 底線；「目前在哪一頁」改由選中底色（segmented 亮底）辨識。
const TRANSPARENT = "rgba(0, 0, 0, 0)";
if (B.activeTabBorder === "0px" && B.inactiveTabBorder === "0px") {
  ok("頁籤無底線（v2.9.156 重設計：無上/下划線）");
} else {
  no(`頁籤不應有底線：活動 ${B.activeTabBorder} / 非活動 ${B.inactiveTabBorder}`);
}

if (B.activeTabBg && B.activeTabBg !== TRANSPARENT && B.inactiveTabBg === TRANSPARENT) {
  ok(`活動頁籤有選中底色 ${B.activeTabBg}（一眼看得出在哪一頁）`);
} else {
  no(`活動頁籤底色異常：活動 ${B.activeTabBg} / 非活動 ${B.inactiveTabBg}`);
}

/* ── 4. chips / 卡片：看得出是「元件」而不只是文字 ── */
if (B.chipRadius && parseInt(B.chipRadius, 10) >= 100) ok(`.li-chip 為膠囊圓角 ${B.chipRadius}`);
else no(`.li-chip 圓角為 ${B.chipRadius}，應為膠囊（999px）`);

if (B.chipBorder === "1px") ok(".li-chip 有 1px 描邊（可點的樣子）");
else no(`.li-chip 描邊為 ${B.chipBorder}`);

if (B.activeChipBg && B.activeChipBg !== "rgba(0, 0, 0, 0)") ok(`.li-chip.is-active 有實底色 ${B.activeChipBg}`);
else no("選中的 chip 沒有底色，看不出選了誰");

if (B.cardBorder === "1px") ok(".li-card 有 1px 描邊（詞條卡片的邊界）");
else no(`.li-card 描邊為 ${B.cardBorder}`);

if (B.miniBtnRadius && B.miniBtnRadius !== "0px") ok(`.li-mini-btn 有圓角 ${B.miniBtnRadius}`);
else no(".li-mini-btn 沒有圓角");

/* ── 6. data-tip 提示真的會顯示（B2/B4 的提示以前全是白寫的） ── */
if (B.tipContent && B.tipContent !== "none" && B.tipContent.includes("繁简")) {
  ok(`data-tip 會真的渲染出來（content: ${B.tipContent.slice(0, 24)}…）`);
} else {
  no(`data-tip 沒有渲染（content: ${B.tipContent}）——異文關係與異體字提示全是白寫`);
}
if (B.tipPosition === "absolute") ok("data-tip 為絕對定位浮層（不會撐開版面）");
else no(`data-tip 的 position 為 ${B.tipPosition}，應為 absolute`);

/* ── 7. 原生控制項沒被貼皮（教訓，辭典這邊也要守住） ── */
const nativeInputs = await (async () => {
  const p = await b.newPage({ viewport: { width: 900, height: 800 } });
  const probe = (css) =>
    p.setContent(
      `<!doctype html><meta charset="utf-8"><style>${OBSIDIAN_VARS}\n${BASE_CSS}\n${css}</style>
       <body style="margin:0"><div class="li-root"><div class="li-body">
         <select class="li-input"><option>a</option></select>
         <input class="li-input" type="text">
       </div></div></body>`,
      { waitUntil: "load" },
    ).then(() =>
      p.evaluate(`(() => {
        const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; };
        return { selH: Math.round(document.querySelector('select').getBoundingClientRect().height),
                 inpAppearance: g('input.li-input', 'appearance'),
                 selAppearance: g('select.li-input', 'appearance') };
      })()`),
    );
  const a = await probe("");
  const bx = await probe(pluginCss);
  await p.close();
  return { a, b: bx };
})();

if (nativeInputs.a.selH === nativeInputs.b.selH) {
  ok(`下拉高度未被改動（${nativeInputs.b.selH}px，原生 ${nativeInputs.a.selH}px）`);
} else {
  no(`下拉高度被貼皮：${nativeInputs.a.selH} → ${nativeInputs.b.selH}px`);
}
if (nativeInputs.b.inpAppearance === nativeInputs.a.inpAppearance &&
    nativeInputs.b.selAppearance === nativeInputs.a.selAppearance) {
  ok("輸入框 / 下拉的 appearance 未被重設（外觀交回 Obsidian）");
} else {
  no(`appearance 被改：input ${nativeInputs.a.inpAppearance}→${nativeInputs.b.inpAppearance}，select ${nativeInputs.a.selAppearance}→${nativeInputs.b.selAppearance}`);
}

console.log(bad === 0 ? "\nALL OK" : `\n${bad} 項異常`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
