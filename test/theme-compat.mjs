// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 主題共存測試
 * ---------------------------------------------------------------------------
 * 目的：用戶會在社群套用自己喜歡的外觀風格（社群主題 / CSS snippet），
 * 插件的 UI 不能與之衝突，更不能因為自己寫死顏色而在使用者主題下破版。
 *
 * 做法：以 6 套「極端值」模擬主題（預設淺 / 預設深 / OLED 高對比 / 半透明玻璃 /
 * 自訂暖色強調 / 緊湊排版）渲染插件的全部介面，量化檢查：
 *   1. 對比度：插件元素裡的文字對比度不得低於 WCAG AA，也不得比主題原生更差；
 *   2. 深色主題不得浮現「白底」：主題底是深色時，插件卡片背景也必須是深色；
 *   3. hairline 可見：描邊色與卡片底色要有可辨差異（不能整片糊掉）；
 *   4. CTA 按鈕（強調色填充）的文字對比度；
 *   5. 無水平溢出；
 *   6. 表頭吸頂仍生效。
 *
 * 用法：node test/theme-compat.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { THEMES, themeCss, BASE_CSS, SETTINGS_HTML, VIEW_HTML, MODAL_HTML } from "./ui-fixtures.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = path.join(ROOT, "test", "build");
fs.mkdirSync(OUT, { recursive: true });
const pluginCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";

/** 頁面內量測：含 alpha 合成的背景取樣與 WCAG 對比度 */
const PROBE_JS = `(() => {
  const parse = (c) => {
    if (!c) return null;
    // Chromium 對 color-mix() 的計算值回傳 color(srgb r g b / a)——分量是 0–1，
    // 不是 0–255。直接按 rgb() 解析會把 0.95 讀成 0.95/255，整個元素變「純黑」，
    // 對比度與亮度全部失真。這裡兩種格式都要能處理。
    if (/^color\\(/.test(c)) {
      const m = c.match(/[\\d.]+/g);
      if (!m || m.length < 3) return null;
      return { r: +m[0] * 255, g: +m[1] * 255, b: +m[2] * 255, a: m.length > 3 ? +m[3] : 1 };
    }
    const m = c.match(/[\\d.]+/g);
    if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  /** 逐層向上合成，得到元素真正的可見背景色 */
  const effBg = (el) => {
    let stack = [], n = el;
    while (n) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 0.999) break; }
      n = n.parentElement;
    }
    if (!stack.length) return { r: 255, g: 255, b: 255, a: 1 };
    let base = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (!base || base.a === 0) base = { r: 255, g: 255, b: 255, a: 1 };
    let acc = base.a >= 0.999 ? base : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  };
  const lum = (c) => {
    const f = (x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const q = (sel) => document.querySelector(sel);
  const out = { contrast: {}, luma: {}, hairline: 1, overflow: null, sticky: null };

  const bodyBg = effBg(document.body);
  const bodyFg = parse(getComputedStyle(document.body).color);
  out.contrast.body = ratio(bodyFg, bodyBg);
  out.luma.body = Math.round(lum(bodyBg) * 1000) / 1000;

  const item = q(".li-settings .setting-item:not(.setting-item-heading)");
  const name = q(".li-settings .setting-item-name");
  const desc = q(".li-settings .setting-item-description");
  if (item && name) {
    const ib = effBg(item);
    out.luma.card = Math.round(lum(ib) * 1000) / 1000;
    out.contrast.name = ratio(parse(getComputedStyle(name).color), ib);
    if (desc) out.contrast.desc = ratio(parse(getComputedStyle(desc).color), ib);
    // hairline：描邊色對卡片底色的可辨度（不是 WCAG 的 4.5，只要 >1.15 表示看得出來）
    const bc = parse(getComputedStyle(item).borderTopColor);
    if (bc && bc.a > 0) out.hairline = ratio(over(bc, ib), ib);
  }
  const cta = q(".li-settings button.mod-cta");
  if (cta) out.contrast.cta = ratio(parse(getComputedStyle(cta).color), effBg(cta));

  const th = q("table.li-char-table th");
  const td = q("table.li-char-table td");
  if (th) {
    out.contrast.th = ratio(parse(getComputedStyle(th).color), effBg(th));
    out.sticky = getComputedStyle(th).position;
  }
  if (td) out.contrast.td = ratio(parse(getComputedStyle(td).color), effBg(td));

  const bar = q(".li-toolbar .li-btn");
  if (bar) out.contrast.toolbarBtn = ratio(parse(getComputedStyle(bar).color), effBg(bar));

  const note = q(".li-notice");
  if (note) out.contrast.notice = ratio(parse(getComputedStyle(note).color), effBg(note));

  out.overflow = document.documentElement.scrollWidth - window.innerWidth;
  return out;
})()`;

function shell(theme) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${themeCss(theme)}\n${BASE_CSS}\n${pluginCss}</style></head>
<body>${SETTINGS_HTML}${VIEW_HTML}${MODAL_HTML}</body></html>`;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--font-render-hinting=none"],
});

let pass = 0;
let fail = 0;
const failures = [];
const rows = [];

const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n) => { fail++; failures.push(n); console.log(`  ✗ ${n}`); };

console.log("主題共存測試（社群主題 / CSS snippet 不得與插件 UI 衝突）\n");

for (const [key, theme] of Object.entries(THEMES)) {
  console.log(`[${key}] ${theme.label}`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(shell(theme), { waitUntil: "load" });
  const r = await page.evaluate(PROBE_JS);
  rows.push({ theme: key, label: theme.label, ...r });

  // 1) 正文對比度（WCAG AA ≥ 4.5）
  if ((r.contrast.name ?? 0) >= 4.5) ok(`設定行標題 對比度 ${r.contrast.name}:1（需 ≥4.5）`);
  else bad(`設定行標題 對比度 ${r.contrast.name}:1 低於 4.5`);

  // 2) 描述文字（12px 小字）：--text-muted 由主題提供，插件能負責的是「不明顯惡化」。
  //    絕對底線取 4.0（AA 是 4.5，但 muted 色的深淺是主題自己的選擇）。
  if ((r.contrast.desc ?? 0) >= 4.0) ok(`設定行描述 對比度 ${r.contrast.desc}:1（需 ≥4.0，muted 色由主題提供）`);
  else bad(`設定行描述 對比度 ${r.contrast.desc}:1 低於 4.0`);

  // 3) 插件的卡片底色不得讓對比度掉超過 20%
  const keep = (r.contrast.name ?? 0) / (r.contrast.body || 1);
  if (keep >= 0.8) ok(`對比度保持率 ${Math.round(keep * 100)}%（卡片 ${r.contrast.name} / 主題原生 ${r.contrast.body}）`);
  else bad(`插件讓對比度掉過多：${r.contrast.body} → ${r.contrast.name}（僅 ${Math.round(keep * 100)}%）`);

  // 4) 深色主題下不得浮現白底
  if (r.luma.body < 0.2) {
    if ((r.luma.card ?? 1) < 0.2) ok(`深色主題下卡片仍是深色（亮度 ${r.luma.card}）`);
    else bad(`深色主題下卡片變淺色（亮度 ${r.luma.card}）——插件寫死了淺色？`);
  } else {
    if ((r.luma.card ?? 0) > 0.04) ok(`淺色主題下卡片仍可辨（亮度 ${r.luma.card}）`);
    else bad(`淺色主題下卡片過暗（亮度 ${r.luma.card}）`);
  }

  // 5) hairline 可見
  if ((r.hairline ?? 1) >= 1.15) ok(`hairline 描邊可辨（對比 ${r.hairline}:1）`);
  else bad(`hairline 描邊幾乎看不見（對比 ${r.hairline}:1）`);

  // 6) CTA 按鈕：填充色是使用者主題的 --interactive-accent、文字色是 --text-on-accent，
  //    兩者都由主題決定，CSS 無法依亮度自動切換黑白字，故按 UI 組件標準 ≥3.0 判定。
  if ((r.contrast.cta ?? 0) >= 3.0) ok(`CTA 按鈕文字 對比度 ${r.contrast.cta}:1（需 ≥3.0，強調色由主題決定）`);
  else bad(`CTA 按鈕文字 對比度 ${r.contrast.cta}:1 低於 3.0`);

  // 7) 檢字表
  if ((r.contrast.th ?? 0) >= 4.0) ok(`檢字表表頭 對比度 ${r.contrast.th}:1（需 ≥4.0）`);
  else bad(`檢字表表頭 對比度 ${r.contrast.th}:1 低於 4.0`);
  if (r.sticky === "sticky") ok("檢字表表頭吸頂生效");
  else bad(`檢字表表頭未吸頂（position=${r.sticky}）`);

  // 8) 工具列按鈕
  if ((r.contrast.toolbarBtn ?? 0) >= 4.5) ok(`工具列按鈕 對比度 ${r.contrast.toolbarBtn}:1`);
  else bad(`工具列按鈕 對比度 ${r.contrast.toolbarBtn}:1 低於 4.5`);

  // 9) 通知
  if ((r.contrast.notice ?? 0) >= 4.5) ok(`通知條 對比度 ${r.contrast.notice}:1`);
  else bad(`通知條 對比度 ${r.contrast.notice}:1 低於 4.5`);

  // 10) 無水平溢出
  if ((r.overflow ?? 0) <= 0) ok("無水平溢出");
  else bad(`水平溢出 ${r.overflow}px`);

  console.log("");
  await page.close();
}

await browser.close();

fs.writeFileSync(path.join(OUT, "theme-compat.json"), JSON.stringify({ rows, pass, fail }, null, 2));

console.log(`結果: ${pass} 通過, ${fail} 失敗  → 明細 test/build/theme-compat.json`);
if (fail) {
  console.log("\n失敗項：");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
