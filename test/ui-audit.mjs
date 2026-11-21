// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * UI 量化審計。
 * 用法：node test/ui-audit.mjs  → 控制台報告 + test/build/ui-audit.json
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });

execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"),
  "--bundle", "--format=esm", `--outfile=${path.join(TMP, "vwlib-audit.mjs")}`,
], { stdio: "pipe" });
const lib = await import(path.join(TMP, "vwlib-audit.mjs"));

const eff = lib.resolveEffective(lib.SCRIPTS.han, lib.DEFAULT_TYPOGRAPHY, lib.DEFAULT_PAGE);
const typesetCss = lib.buildTypesetCss(eff);
const pluginCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

const OBSIDIAN_VARS = `
:root{
  --background-primary:#ffffff; --background-primary-alt:#fafafa; --background-secondary:#f3f3f3;
  --background-modifier-border:#e0e0e0; --background-modifier-hover:#eaeaea;
  --text-normal:#222222; --text-muted:#888888; --text-accent:#6a4fd8;
  --text-selection:rgba(106,79,216,.25); --font-monospace:monospace;
}
html,body{margin:0;padding:0;height:100%;font-family:-apple-system,"Noto Serif CJK SC",serif;}
body{background:var(--background-primary);color:var(--text-normal);}
`;

// 与 styles.css 中 @media (pointer: coarse) 等價的移動端規則（headless 無法模擬該媒體特性）
const TOUCH_CSS = `
.li-btn, .li-seg-btn { padding: 8px 14px; font-size: 13px; min-height: 44px; min-width: 44px; }
.li-seg-btn { min-width: 48px; }
.li-toolbar { gap: 8px; padding: 6px 10px; }
.li-stage, .li-editor-textarea { touch-action: pan-x; }
`;

const BODY = `
<h1>春夜宴桃李園序</h1>
<p>夫天地者萬物之逆旅也，光陰者百代之過客也。而浮生若夢，為歡幾何？</p>
<p data-li-gap="3">古人秉燭夜遊，良有以也。況陽春召我以煙景，大塊假我以文章。</p>
<p><ruby>會<rt>かい</rt></ruby>桃花之芳園，序天倫之樂事。群季俊秀，皆為惠連。</p>
<p><span class="li-em-ruby">幽賞未已<ruby>高談<rt>﹅﹅</rt></ruby></span>，高談轉清。</p>
<p>時維<span class="li-tcy">25</span>年，序屬三春。開瓊筵以坐花，飛羽觴而醉月。</p>
`;

function shell(opts) {
  const { w, h, touch } = opts;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${OBSIDIAN_VARS}\n${typesetCss}\n${pluginCss}\n${touch ? TOUCH_CSS : ""}</style></head>
<body><div class="li-scope" data-script="han" style="height:${h}px">
  <div class="li-toolbar">
    <button class="li-btn" data-act="read">閱讀</button>
    <button class="li-btn" data-act="edit">編輯</button>
    <button class="li-btn" data-act="seg">分段</button>
    <button class="li-btn" data-act="page">分頁</button>
    <button class="li-btn" data-act="Aa">Aa</button>
    <button class="li-btn" data-act="export">匯出</button>
    <button class="li-btn" data-act="more">···</button>
  </div>
  <div class="li-stage" style="height:${h - 120}px">
    <div class="li-page li-doc">${BODY}</div>
  </div>
  <div class="li-seg-list">
    <div class="li-seg-block"><div class="li-seg-content">${BODY}</div>
      <div class="li-seg-actions"><button class="li-seg-btn">編輯</button><button class="li-seg-btn">刪除</button></div>
    </div>
  </div>
</div></body></html>`;
}

const AUDIT_JS = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { vw, vh, overflow: [], tiny: [], contrast: [], metrics: {} };
  const px = (v) => parseFloat(v) || 0;
  const lum = (c) => {
    const m = c.match(/[\\d.]+/g); if (!m) return null;
    const f = (x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const b = getComputedStyle(n).backgroundColor;
      if (b && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(b)) return b;
      n = n.parentElement;
    }
    return "rgb(255,255,255)";
  };
  const ratio = (fg, bg) => {
    const a = lum(fg), b = lum(bg); if (a == null || b == null) return null;
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  // 1) 水平溢出檢查
  //    直排（vertical-rl）正文天生橫向延伸、由 .li-stage 橫向滚動承載，
  //    因此祖先鏈上存在「可橫向滚動容器」的元素屬預期行為，不計為缺陷。
  const inScroller = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
      if (n.classList && (n.classList.contains("li-stage") || n.classList.contains("li-doc"))) return true;
      n = n.parentElement;
    }
    return false;
  };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (inScroller(el)) continue;
    if (r.right > vw + 1 || r.left < -1) {
      out.overflow.push({
        sel: el.className || el.tagName,
        left: Math.round(r.left), right: Math.round(r.right), vw
      });
    }
  }

  // 2) 觸控目標尺寸
  for (const el of document.querySelectorAll(".li-btn, .li-seg-btn")) {
    const r = el.getBoundingClientRect();
    const rec = { sel: el.className, text: el.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
    out.tiny.push(rec);
  }

  // 3) 文本對比度（取代表性節點）
  const samples = [
    [".li-doc p", "正文"],
    [".li-doc h1", "標题"],
    [".li-doc rt", "ruby 注音"],
    [".li-btn", "工具欄按鈕"],
    [".li-tcy", "直中横數字"],
  ];
  for (const [sel, name] of samples) {
    const el = document.querySelector(sel);
    if (!el) { out.contrast.push({ name, sel, missing: true }); continue; }
    const cs = getComputedStyle(el);
    out.contrast.push({
      name, sel,
      fg: cs.color, bg: bgOf(el),
      size: Math.round(px(cs.fontSize)), raw: cs.fontSize,
      ratio: ratio(cs.color, bgOf(el))
    });
  }

  // 4) 直排可讀性度量
  const doc = document.querySelector(".li-doc");
  if (doc) {
    const cs = getComputedStyle(doc);
    const r = doc.getBoundingClientRect();
    out.metrics = {
      writingMode: cs.writingMode,
      textOrientation: cs.textOrientation,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      fontSize: cs.fontSize,
      docWidth: Math.round(r.width),
      docHeight: Math.round(r.height),
      stageScrollW: (() => { const s = document.querySelector(".li-stage"); return s ? s.scrollWidth : null; })(),
      stageClientW: (() => { const s = document.querySelector(".li-stage"); return s ? s.clientWidth : null; })(),
    };
  }
  const tb = document.querySelector(".li-toolbar");
  if (tb) {
    const r = tb.getBoundingClientRect();
    out.toolbar = { w: Math.round(r.width), h: Math.round(r.height), scrollW: tb.scrollWidth, clientW: tb.clientWidth,
                    wrapped: Math.round(r.height) > 56 };
  }
  return out;
})()`;

const results = {};
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--font-render-hinting=none"] });

for (const [name, cfg] of Object.entries({
  desktop: { w: 1280, h: 900, touch: false },
  phone: { w: 390, h: 844, touch: true },
  phoneSmall: { w: 360, h: 640, touch: true },
  tablet: { w: 834, h: 1112, touch: true },
})) {
  const page = await browser.newPage({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: 2 });
  await page.setContent(shell(cfg), { waitUntil: "load" });
  await page.waitForTimeout(250);
  results[name] = await page.evaluate(AUDIT_JS);
  await page.close();
}
await browser.close();

// ---- 報告 ----
let pass = 0, fail = 0;
const line = (ok, msg) => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗"} ${msg}`); };

for (const [name, r] of Object.entries(results)) {
  const isTouch = name !== "desktop";
  console.log(`\n[${name}] ${r.vw}×${r.vh}${isTouch ? "（觸屏）" : "（鼠標）"}`);
  line(r.overflow.length === 0,
    `無非預期水平溢出${r.overflow.length ? " → " + JSON.stringify(r.overflow.slice(0, 3)) : ""}`);
  const tb = r.toolbar;
  if (tb) line(tb.scrollW <= tb.clientW + 1, `工具欄無橫向溢出（${tb.scrollW} ≤ ${tb.clientW}）`);
  // 觸屏按 iOS HIG ≥44×44；鼠標環境按 WCAG 2.5.8（AA）≥24×24
  const minH = isTouch ? 44 : 24, minW = isTouch ? 44 : 24;
  const small = r.tiny.filter((t) => t.h < minH || t.w < minW);
  line(small.length === 0,
    `可點目標均 ≥${minH}×${minW}${small.length ? " → " + JSON.stringify(small.slice(0, 4))
      : ` (最小 ${Math.min(...r.tiny.map(t=>t.h))}×${Math.min(...r.tiny.map(t=>t.w))})`}`);
  for (const c of r.contrast) {
    if (c.missing) { console.log(`    · ${c.name} (${c.sel}) 未找到`); continue; }
    const need = c.size >= 18.66 ? 3 : 4.5;
    line(c.ratio != null && c.ratio >= need, `${c.name} 對比度 ${c.ratio}:1（${c.size}px，需 ≥${need}）`);
  }
  const m = r.metrics;
  line(m.writingMode === "vertical-rl", `書寫模式 ${m.writingMode}`);
  line(m.textOrientation === "upright" || m.textOrientation === "mixed",
    `text-orientation ${m.textOrientation}`);
  if (m.stageScrollW != null && m.stageClientW != null)
    line(m.stageScrollW >= m.stageClientW, `直排内容可橫向滚動閱讀（${m.stageScrollW} vs ${m.stageClientW}）`);
}

fs.writeFileSync(path.join(TMP, "ui-audit.json"), JSON.stringify(results, null, 2));
console.log(`\n結果: ${pass} 通過, ${fail} 失敗  → 明细 test/build/ui-audit.json`);
process.exit(fail === 0 ? 0 : 1);
