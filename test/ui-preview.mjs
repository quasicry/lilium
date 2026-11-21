// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * UI / 移動端觀感快照。
 * 用法：node test/ui-preview.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });

execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"),
  "--bundle", "--format=esm", `--outfile=${path.join(TMP, "vwlib-ui.mjs")}`,
], { stdio: "pipe" });
const lib = await import(path.join(TMP, "vwlib-ui.mjs"));

const eff = lib.resolveEffective(lib.SCRIPTS.han, lib.DEFAULT_TYPOGRAPHY, lib.DEFAULT_PAGE);
const typesetCss = lib.buildTypesetCss(eff);
const pluginCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

// 示例正文：散文 + ruby + 傍點 + 直中橫 + 多空行（驗證 gap 補償）
const BODY = `
<h1>春夜宴桃李園序</h1>
<p>夫天地者萬物之逆旅也，光陰者百代之過客也。</p>
<p data-li-gap="3">而浮生若夢，為歡幾何？古人秉燭夜遊，良有以也。</p>
<p>況陽春召我以煙景，大塊假我以文章。<ruby>會<rt>かい</rt></ruby>桃花之芳園，序天倫之樂事。</p>
<p><span class="li-em-ruby">群季俊秀<ruby>皆<rt>﹅</rt></ruby></span>，皆為惠連。</p>
<p>時維<span class="li-tcy">25</span>年，序屬三春。</p>
<p>高談轉清，開瓊筵以坐花，飛羽觴而醉月。</p>
`.trim();

// touch 环境：把 styles.css 中 @media (pointer: coarse) 规则无条件生效（Chromium
// headless 无法直接模拟 pointer: coarse，这里显式注入等价规则）
const TOUCH_CSS = `
.li-btn, .li-seg-btn { padding: 6px 14px; font-size: 13px; min-height: 32px; }
.li-seg-btn { min-width: 48px; }
.li-toolbar { gap: 8px; padding: 6px 10px; }
.li-stage, .li-editor-textarea { touch-action: pan-x; }
`;

const OBSIDIAN_VARS = `
:root{
  --background-primary:#ffffff; --background-primary-alt:#fafafa; --background-secondary:#f3f3f3;
  --background-modifier-border:#e0e0e0; --background-modifier-hover:#eaeaea;
  --text-normal:#222222; --text-muted:#888888; --text-accent:#6a4fd8; --text-on-accent:#ffffff;
  --text-selection:rgba(106,79,216,.25); --font-monospace:monospace;
}
html,body{margin:0;padding:0;height:100%;font-family:-apple-system,"Noto Sans CJK SC",sans-serif;}
body{background:var(--background-primary);color:var(--text-normal);}
`;

function page({ title, bodyHtml, touch, width, height, extraCss = "" }) {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>
${OBSIDIAN_VARS}
${pluginCss}
${touch ? TOUCH_CSS : ""}
${typesetCss}
${extraCss}
.li-app{display:flex;flex-direction:column;height:${height}px;width:${width}px;overflow:hidden;}
</style></head><body><div class="li-app">${bodyHtml}</div></body></html>`;
}

const toolbar = `
<div class="li-toolbar">
  <div class="li-seg">
    <button class="li-seg-btn is-active">阅读</button>
    <button class="li-seg-btn">编辑</button>
    <button class="li-seg-btn">分页</button>
  </div>
  <button class="li-btn li-btn-aa">Aa</button>
  <button class="li-btn li-btn-accent">PDF</button>
  <button class="li-btn li-btn-accent">EPUB</button>
  <button class="li-btn">↗</button>
</div>`;

const statusBar = `<div class="li-status">漢文 · 字符 218</div>`;

const readStage = `
<div class="li-stage li-stage-vertical">
  <div class="li-scope"><div class="li-doc">${BODY}</div></div>
</div>`;

const segStage = `
<div class="li-stage li-stage-segmented">
  <div class="li-seg-list">
    <button class="li-seg-chip li-seg-chip-fm" disabled>YAML</button>
    <div class="li-seg-block"><div class="li-doc"><h1>春夜宴桃李園序</h1></div></div>
    <div class="li-seg-block" style="margin-top:1.8em"><div class="li-doc"><p>夫天地者萬物之逆旅也，光陰者百代之過客也。</p></div></div>
    <div class="li-seg-block"><div class="li-doc"><p>況陽春召我以煙景，大塊假我以文章。</p></div></div>
    <div class="li-seg-block is-editing"><div class="li-doc"><p>而浮生若夢，為歡幾何？</p></div></div>
    <div class="li-seg-block"><div class="li-doc li-seg-skeleton"></div></div>
  </div>
</div>`;

const editStage = `
<div class="li-stage li-stage-vertical">
  <textarea class="li-editor-textarea" style="writing-mode:vertical-rl">${BODY.replace(/<[^>]*>/g, "").trim()}</textarea>
</div>`;

const shots = [
  { name: "ui-desktop-read", w: 1280, h: 900, touch: false, body: toolbar + readStage + statusBar },
  { name: "ui-mobile-read", w: 390, h: 844, touch: true, body: toolbar + readStage + statusBar },
  { name: "ui-mobile-edit", w: 390, h: 844, touch: true, body: toolbar + editStage + statusBar },
  { name: "ui-desktop-seg", w: 1280, h: 900, touch: false, body: toolbar + segStage + statusBar },
];

function chromium(args) {
  return spawnSync("chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", ...args], {
    encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024,
  });
}

for (const s of shots) {
  const html = page({ title: s.name, bodyHtml: s.body, touch: s.touch, width: s.w, height: s.h });
  const hp = path.join(TMP, s.name + ".html");
  fs.writeFileSync(hp, html);
  const out = path.join(TMP, s.name + ".png");
  chromium([`--screenshot=${out}`, `--window-size=${s.w},${s.h}`, "--virtual-time-budget=4000", `file://${hp}`]);
  console.log(`  → ${s.name}.png (${s.w}×${s.h}${s.touch ? ", touch" : ""}) ${fs.existsSync(out) ? "OK" : "FAILED"}`);
}
console.log("\n截圖目錄: test/build/ui-*.png");
