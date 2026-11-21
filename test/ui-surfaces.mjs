// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 介面可行性測試：桌面端 vs 移動端
 * ---------------------------------------------------------------------------
 * 同一套 UI 在兩種輸入環境下都要能用：
 *   · 桌面（滑鼠，pointer: fine）——按鈕可以精緻小巧，但不能小到難點；
 *   · 移動（觸控，pointer: coarse）——可點區域必須 ≥44×44（HIG 觸控下限）。
 *
 * 實測對象：設定面板、側欄、列印版面彈窗、通知條、視圖工具列。
 *
 * 用法：node test/ui-surfaces.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  THEMES,
  themeCss,
  BASE_CSS,
  OBSIDIAN_CONTROLS,
  TOUCH_CSS,
  SETTINGS_HTML,
  VIEW_HTML,
  MODAL_HTML,
} from "./ui-fixtures.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = path.join(ROOT, "test", "build");
fs.mkdirSync(OUT, { recursive: true });
const pluginCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";

/** 模擬 Obsidian 的 modal 容器（插件不擁有這層樣式，測試時必須自己補） */
const OBSIDIAN_SHELL = `
.modal-container{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}
.modal-container .modal{pointer-events:auto;max-width:92vw;max-height:92vh;overflow:auto;}
.notice-container{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:100;}
`;

const PROBE_JS = `(() => {
  const R = (v) => Math.round(v);
  const q = (s) => document.querySelector(s);
  /** 量「可點區域」：元素自身矩形 + ::before 向外擴展的量（iOS 常用手法） */
  const tap = (sel) => {
    const e = q(sel); if (!e) return null;
    const r = e.getBoundingClientRect();
    const b = getComputedStyle(e, "::before");
    let t = 0, ri = 0, bo = 0, l = 0;
    if (b && b.content && b.content !== "none") {
      const f = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      t = f(b.top); ri = f(b.right); bo = f(b.bottom); l = f(b.left);
    }
    return { w: R(r.width - l - ri), h: R(r.height - t - bo), visW: R(r.width), visH: R(r.height) };
  };
  const box = (sel) => { const e = q(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { w: R(r.width), h: R(r.height), x: R(r.x), right: R(r.right) }; };
  const out = { taps: {}, boxes: {}, sticky: null, overflow: 0, vw: window.innerWidth };

  out.taps.settingRow = tap(".li-settings .setting-item:not(.setting-item-heading)");
  out.taps.settingButton = tap(".li-settings .setting-item-control button");
  out.taps.switch = tap(".li-settings .checkbox-container");
  out.taps.select = tap(".li-settings .setting-item-control select");
  out.taps.toolbarBtn = tap(".li-toolbar .li-btn");
  out.taps.segBtn = tap(".li-seg-btn");
  out.taps.sideBtn = tap(".li-side-btn");
  out.taps.sideToggle = tap(".li-side-toggle");
  out.taps.sideGroupTitle = tap(".li-side-group-title");
  out.taps.slider = tap(".li-side-slider");
  /* r67 v2.8.85：.li-print-modal 死代碼已凍結進快照，改量現役 PrintEditorModal
     （print-editor.ts 掛 li-print-editor-modal；列印鈕 cls="mod-cta li-print-editor-print"）。 */
  out.taps.modalBtn = tap(".li-print-editor-modal .li-print-editor-print");

  /* 設定頁滑桿的實寬。舊版插件 CSS 把它壓到 129px（幾乎拖不動），
     這裡直接量盒子，不再用比例間接推測。 */
  const sslEl = q(".li-settings input[type='range']");
  if (sslEl) {
    const sr = sslEl.getBoundingClientRect();
    const ctl = sslEl.closest(".setting-item-control");
    out.settingsSlider = {
      w: R(sr.width),
      h: R(sr.height),
      ratio: ctl ? R((sr.width / ctl.getBoundingClientRect().width) * 100) : 0,
    };
  }

  out.boxes.panel = box(".li-side-panel");
  out.boxes.sideToggle = box(".li-side-toggle");
  out.boxes.sideHandle = box(".li-side-handle");
  out.taps = out.taps;
  out.boxes.modal = box(".li-print-editor-modal");
  out.boxes.notice = box(".li-notice");
  out.boxes.settings = box(".li-settings");

  // 側欄形態 —— 手機應為底部抽屜（水平滿寬、貼底、由下往上滑入），
  // 桌面/平板應為右側抽屜（固定寬度、垂直滿高、由右往左滑入）。
  // ⚠️ 幾何一律**相對 .li-view**測量：面板是 absolute，定位上下文是 .li-view
  // 而非視口；測試把整個視圖嵌在頁面中段，用絕對座標會得到 page 偏移的假值。
  const panelEl = q(".li-side-panel");
  const viewEl = q(".li-view");
  if (panelEl && viewEl) {
    const cs = getComputedStyle(panelEl);
    const pr = panelEl.getBoundingClientRect();
    const vr = viewEl.getBoundingClientRect();
    out.panel = {
      position: cs.position,
      width: R(pr.width),
      // 面板底緣與 .li-view 底緣的距離（0 = 完全貼底）
      gapToViewBottom: R(vr.bottom - pr.bottom),
      // 面板左緣與 .li-view 左緣的距離（0 = 貼齊左側）
      gapToViewLeft: R(pr.left - vr.left),
      viewW: R(vr.width),
      viewH: R(vr.height),
      transform: cs.transform,
      maxHeight: cs.maxHeight,
      overflowY: cs.overflowY,
      boxSizing: cs.boxSizing,
    };
  }
  // 收合按鈕是否落在工具列可視範圍內（舊版 bug：被 flex-wrap 擠出視口）
  const tg = q(".li-side-toggle");
  if (tg) {
    const r = tg.getBoundingClientRect();
    out.toggleInsideToolbar = r.right <= window.innerWidth + 1 && r.left >= -1 && r.width > 0;
    out.toggleGlyph = (tg.textContent || "").trim();
  }
  // 面板內的排版滑桿是否撐滿可用寬度（不被擠成細條）
  const sl = q(".li-side-slider");
  if (sl && panelEl) {
    out.sliderWidthRatio = R((sl.getBoundingClientRect().width / panelEl.getBoundingClientRect().width) * 100);
  }

  const h3 = q(".li-settings h3");
  if (h3) out.sticky = getComputedStyle(h3).position;

  // 水平溢出：只看 scrollWidth 與視口的差（側欄已由 host 裁切，與真實環境一致）
  out.overflow = document.documentElement.scrollWidth - window.innerWidth;
  return out;
})()`;

const ENVIRONMENTS = [
  { key: "desktop", label: "桌面 1280×900（滑鼠）", w: 1280, h: 900, touch: false, min: 28 },
  { key: "tablet", label: "平板 834×1112（觸控）", w: 834, h: 1112, touch: true, min: 44 },
  { key: "phone", label: "手機 390×844（觸控）", w: 390, h: 844, touch: true, min: 44 },
  { key: "phoneSmall", label: "小機 360×640（觸控）", w: 360, h: 640, touch: true, min: 44 },
];

function shell(theme, touch) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${themeCss(theme)}\n${BASE_CSS}\n${OBSIDIAN_SHELL}\n${OBSIDIAN_CONTROLS}\n${pluginCss}\n${touch ? TOUCH_CSS : ""}</style></head>
<body>${SETTINGS_HTML}${VIEW_HTML}${MODAL_HTML}</body></html>`;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--font-render-hinting=none"],
});

let pass = 0;
let fail = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n) => { fail++; failures.push(n); console.log(`  ✗ ${n}`); };

console.log("介面可行性測試（桌面端 / 移動端）\n");

for (const env of ENVIRONMENTS) {
  // 每個環境跑淺色 + 深色兩套主題：重點是幾何與觸控，顏色由 theme-compat 負責
  for (const tkey of ["light", "dark"]) {
    const theme = THEMES[tkey];
    console.log(`[${env.key} / ${tkey}] ${env.label} · ${theme.label}`);
    const page = await browser.newPage({ viewport: { width: env.w, height: env.h } });
    await page.setContent(shell(theme, env.touch), { waitUntil: "load" });
    /*
     * 側欄預設收合（translateX/Y 100% 藏在視窗外）。要量它的幾何，
     * 必須先展開 —— 這也順帶驗證了「按鈕真的能讓面板顯示出來」：
     * 舊版 bug 下按鈕根本不存在於 DOM，這一步會直接量到隱藏狀態的面板。
     */
    await page.evaluate(() => {
      const host = document.querySelector(".li-view");
      if (host) host.classList.add("li-side-open");
    });
    /*
     * 等抽屜滑入動畫跑完再量。面板用 transform 做進場動畫（400ms），
     * 剛加上 li-side-open 時它還在半路，量到的座標是動畫中的中間態
     * —— 這正是第一次跑出「距底 -447px」的原因（面板還沒滑到位）。
     */
    await page.waitForTimeout(600);
    const r = await page.evaluate(PROBE_JS);
    const min = env.min;
    const want = (name, t) => {
      if (!t) return bad(`${name}：找不到元素`);
      if (t.h >= min && t.w >= min) ok(`${name} 可點區 ${t.w}×${t.h}（需 ≥${min}）`);
      else bad(`${name} 可點區只有 ${t.w}×${t.h}，低於 ${min}`);
    };

    want("設定行", r.taps.settingRow);
    want("設定頁按鈕", r.taps.settingButton);
    want("下拉選單", r.taps.select);
    want("工具列按鈕", r.taps.toolbarBtn);
    want("分段控件", r.taps.segBtn);
    want("側欄收合鈕", r.taps.sideToggle);
    want("側欄群組標題", r.taps.sideGroupTitle);
    want("彈窗按鈕", r.taps.modalBtn);
    /* 滑桿是「橫向拖曳」控件，加高本體沒有意義（手指是左右拖、不是上下點），
       所以刻意不套 44×44 的觸控方框下限。這裡驗的是它夠寬、可抓、且撐滿面板。 */
    const sl = r.taps.slider;
    if (sl && sl.h >= 20 && sl.w >= 120) ok(`側欄滑桿可拖曳 ${sl.w}×${sl.h}（橫向控件不套 44 方框）`);
    else bad(`側欄滑桿異常：${sl ? sl.w + "×" + sl.h : "n/a"}`);

    // 收合按鈕必須真的在視口內（舊版會被 flex-wrap 擠出可視區）
    if (r.toggleInsideToolbar) ok("收合按鈕落在工具列可視範圍內");
    else bad("收合按鈕被擠出可視區（flex-wrap 擠壓）");

    // 滑桿應撐滿面板寬度的絕大部分，否則在窄抽屜裡難以精準拖曳
    if (r.sliderWidthRatio >= 60) ok(`滑桿佔面板寬 ${r.sliderWidthRatio}%（不用擠在角落）`);
    else bad(`滑桿僅佔面板寬 ${r.sliderWidthRatio}%，過窄難以操作`);

    /*
     * 開關：不再自繪。外觀與可點區都是 Obsidian 原生那顆（40×22），
     * 所以這裡釘的是「沒被貼皮」——量到 51×31 就代表自繪又回來了。
     * 觸控下限由「設定行」這一層負責（上面 want("設定行")），不再用透明偽元素
     * 偷偷把開關撐大：那會吃掉相鄰控制項的點擊，也讓插件跟主題各畫一套開關。
     */
    const sw = r.taps.switch;
    if (sw && sw.visW === 40 && sw.visH === 22) ok(`開關為 Obsidian 原生尺寸 ${sw.visW}×${sw.visH}（未自繪貼皮）`);
    else bad(`開關尺寸異常：${sw ? sw.visW + "×" + sw.visH : "n/a"}（應為原生 40×22）`);

    /*
     * 設定頁滑桿（使用者回報「甚至都不能水平滑動」的那一根）：
     * 必須又寬又能撐滿控制區。v2.6.1 時它是 129px、只佔控制區的一小截，
     * 因為插件把 .setting-item-control 改成 flex:0 0 auto，原生 width:100%
     * 退化成 UA 預設寬度。這裡同時驗實寬與佔比，任一退化都會被抓到。
     */
    const ssl = r.settingsSlider;
    if (ssl && ssl.w >= 120 && ssl.ratio >= 70) ok(`設定頁滑桿 ${ssl.w}×${ssl.h}，佔控制區 ${ssl.ratio}%（寬度足可拖曳）`);
    else bad(`設定頁滑桿過窄：${ssl ? ssl.w + "×" + ssl.h + "，僅佔控制區 " + ssl.ratio + "%" : "n/a"}`);

    // 無水平溢出
    if (r.overflow <= 0) ok("無水平溢出");
    else bad(`水平溢出 ${r.overflow}px`);

    // 彈窗不得超出視口
    const m = r.boxes.modal;
    if (m && m.w <= r.vw) ok(`彈窗寬度 ${m.w} ≤ 視口 ${r.vw}`);
    else bad(`彈窗寬度 ${m ? m.w : "n/a"} 超出視口 ${r.vw}`);

    /*
     * 側欄形態（v2.6.0）：
     * · 桌面 / 平板 → 右側抽屜：固定寬度，必須留 ≥100px 給正文，不得佔滿視口。
     * · 手機（≤600px）→ 底部抽屜：水平滿寬是**刻意設計**（390px 寬的螢幕上，
     *   右側抽屜會吃掉 2/3 寬度、剩下的縫讀不了直排），所以這裡驗的是
     *   「貼底 + 高度受限 + 可展開全螢幕」，而非寬度。
     */
    const phone = env.w <= 600;
    const pf = r.panel;
    if (!pf) {
      bad("找不到側欄面板");
    } else if (phone) {
      if (pf.gapToViewBottom === 0 && pf.width === pf.viewW) {
        ok(`手機側欄為底部抽屜（滿寬 ${pf.width}＝視圖寬 ${pf.viewW}，完全貼底）`);
      } else {
        bad(`手機側欄未呈現底部抽屜：寬 ${pf.width}（視圖 ${pf.viewW}），距底 ${pf.gapToViewBottom}px`);
      }
      // 高度必須受限，否則抽屜會蓋掉整個畫面
      if (pf.maxHeight && pf.maxHeight !== "none") ok(`手機抽屜高度受限（max-height ${pf.maxHeight}）`);
      else bad("手機抽屜未限制高度（會蓋滿整個畫面）");
      if (pf.overflowY === "auto" || pf.overflowY === "scroll") ok("手機抽屜內容可滾動");
      else bad(`手機抽屜未設滾動（overflow-y=${pf.overflowY}）`);
      // 關鍵：border-box 才能讓 width:100% 不因 padding 而溢出視口
      if (pf.boxSizing === "border-box") ok("手機抽屜為 border-box（width:100% 不連 padding 一起溢出）");
      else bad(`手機抽屜 box-sizing=${pf.boxSizing}，width:100% 會溢出視口`);
    } else {
      if (pf.width <= r.vw - 100) ok(`側欄寬度 ${pf.width}（視口 ${r.vw}，正文仍留有空間）`);
      else bad(`側欄寬度 ${pf.width} 幾乎佔滿視口 ${r.vw}`);
      if (pf.gapToViewBottom === 0) ok("桌面側欄為右側抽屜（垂直滿高到底）");
      else bad(`桌面側欄未貼到底（距底 ${pf.gapToViewBottom}px）`);
    }

    // 分組標題吸頂
    if (r.sticky === "sticky") ok("設定頁分組標題吸頂生效");
    else bad(`設定頁分組標題未吸頂（position=${r.sticky}）`);

    // 通知條可見
    const n = r.boxes.notice;
    if (n && n.w > 0 && n.h > 0) ok(`通知條可見（${n.w}×${n.h}）`);
    else bad("通知條不可見");

    console.log("");
    await page.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, "ui-surfaces.json"), JSON.stringify({ pass, fail, failures }, null, 2));
console.log(`結果: ${pass} 通過, ${fail} 失敗  → 明細 test/build/ui-surfaces.json`);
if (fail) {
  console.log("\n失敗項：");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
