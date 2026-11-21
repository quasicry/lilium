// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 直排「列長填滿＋連續填充＋resize 重排」回歸門禁。
 * 覆蓋：
 *   A 直排＋長內容：編輯器 .cm-content 列長≈容器高（填滿）且不垂直溢出、確實換列（橫向多列）；
 *                   閱讀器 .markdown-preview-view 同填滿。
 *   B 直排＋短內容：列長＝文字自然列長（不釘死、無底部留白）。
 *   C 直排＋resize：容器高 900→500 後，編輯器/閱讀器列長跟隨收縮（差≤1em）。
 *   D 橫排對照（li-editor-horizontal-active）：本組規則零影響（white-space 不強制 pre-wrap）。
 * 执行：node test/column-fill-vertical-browser.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import pw from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
if (!fs.existsSync(CHROME)) { console.log(`    （略過：未找到 ${CHROME}）`); process.exit(0); }

const CSS = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

// 真实 CM6 baseTheme（取自 node_modules；white-space:pre 由插件 v2.8.69 規則以 !important 覆寫）
const CM6 = `
.cm-editor{display:flex !important;flex-direction:column;position:relative;}
.cm-scroller{display:flex !important;align-items:flex-start !important;font-family:serif;
  line-height:1.6;height:100%;overflow-x:auto;position:relative;z-index:0;overflow-anchor:none;}
.cm-content{margin:0;flex-grow:2;flex-shrink:0;display:block;white-space:pre;word-wrap:normal;
  box-sizing:border-box;min-height:100%;padding:4px 0;outline:none;}
.cm-line{display:block;padding:0 2px 0 6px;}
`;
const OBSIDIAN = `
.workspace-leaf-content{display:flex;flex-direction:column;overflow:hidden;height:100%;}
.view-content{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
.cm-editor{flex:1 1 auto;min-height:0;width:500px;}
/* v2.9.37（r31）：宿主頁邊距建模——真實 Obsidian 在 .cm-scroller 上有 32px padding
   （--file-margins，直排下＝inline 軸上下留白）；此前 mock 未建模，[1.15e] 的
   「content.rect.h ≈ ed.clientH」斷言在零 padding 前提下成立，r31 ③直排流式
   padding-inline 落碼後必然命中此缺口。補上原生值使 mock 與真機一致。 */
.markdown-reading-view{flex:1 1 auto;min-height:0;overflow:auto;width:500px;}
.cm-scroller{padding:32px 0;}
`;

const FS = 24;
const LONG = "天地的玄機，往往在於靜默處顯露。".repeat(14);   // 远超可用高 → 应满版多列
const SHORT = "天地玄機。";                                    // 真正短 → 列长＝自然列长

function buildBody({ vertical, long }) {
  const cls = vertical ? "li-editor-vertical-active" : "li-editor-horizontal-active";
  const para = long ? LONG : SHORT;
  const cmLines = Array.from({ length: 3 }, (_, i) => `<div class="cm-line">第${i + 1}段${para}</div>`).join("");
  const mdBlocks = Array.from({ length: 3 }, (_, i) => `<p>第${i + 1}段${para}</p>`).join("");
  return `<body class="${cls}" style="margin:0;">
<div class="workspace-leaf-content" data-type="markdown" id="leaf" style="height:900px;width:500px;background:#fff;">
  <div class="view-content" id="vc" style="border-bottom:2px solid #ccc;">
    <div class="cm-editor" id="ed">
      <div class="cm-scroller"><div class="cm-sizer"><div class="cm-content" id="ct">${cmLines}</div></div></div>
    </div>
  </div>
  <div class="view-content" id="vc2">
    <div class="markdown-reading-view" id="rv">
      <div class="markdown-preview-view" id="pv"><div class="markdown-preview-sizer">${mdBlocks}</div></div>
    </div>
  </div>
</div>`;
}

const HTML = (body) => `<!doctype html><meta charset="utf-8">
<style>${CSS}</style><style>${CM6}</style><style>${OBSIDIAN}</style>
${body}`;

const MEASURE = () => {
  const M = (el) => { if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const padY = (parseFloat(cs.paddingTop)||0) + (parseFloat(cs.paddingBottom)||0);
    return { rect: [Math.round(r.width), Math.round(r.height)], clientH: el.clientHeight, scrollH: el.scrollHeight, ws: cs.whiteSpace, wm: cs.writingMode,
             innerH: Math.round(el.clientHeight - padY) }; };
  const g = (id) => document.getElementById(id);
  const ed = g("ed");
  return { ed: M(ed), scroller: M(ed && ed.querySelector(".cm-scroller")), content: M(g("ct")),
           reading: M(g("rv")), preview: M(g("pv")) };
};

const b = await pw.chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } });

async function scenario(name, opts) {
  await p.setContent(HTML(buildBody(opts)), { waitUntil: "load" });
  await p.evaluate(() => document.fonts && document.fonts.ready);
  const before = await p.evaluate(MEASURE);
  let after = null;
  if (opts.resize) {
    await p.evaluate(() => { document.getElementById("leaf").style.height = "500px"; });
    await p.evaluate(() => document.fonts && document.fonts.ready);
    after = (await p.evaluate(MEASURE));
  }
  return { ...before, after };
}

const A = await scenario("A 直排長內容", { vertical: true, long: true });
const B = await scenario("B 直排短內容", { vertical: true, long: false });
const C = await scenario("C 直排 resize", { vertical: true, long: true, resize: true });
const D = await scenario("D 橫排對照", { vertical: false, long: true });

function show(tag, r) {
  if (!r || !r.content) { console.log(`--- ${tag} ---\n   (无结果)`); return; }
  const f = (k, o) => o ? `    ${k.padEnd(9)} rect=${o.rect[0]}x${o.rect[1]} clientH=${o.clientH} scrollH=${o.scrollH} ws=${o.ws}` : `    ${k}: null`;
  console.log(`--- ${tag} ---`);
  console.log(f("ed", r.ed)); console.log(f("scroller", r.scroller)); console.log(f("content", r.content));
  console.log(f("reading", r.reading)); console.log(f("preview", r.preview));
  if (r.after) { console.log("   [resize 后 leaf 900→500]"); console.log(f("content", r.after.content)); console.log(f("preview", r.after.preview)); }
  console.log();
}
show("A 直排長內容", A); show("B 直排短內容", B); show("C 直排 resize", C); show("D 橫排對照", D);

const tol = FS * 1.5;
// 填滿基準改為 .cm-scroller 的 content-box（innerH＝clientH−padY）。
// 真實 Obsidian 的 scroller 有 32px 頁邊距（--file-margins，mock 已補建模），「列長填滿」
// 的語義是填滿版心而非填滿 border-box；r31 ③直排流式 padding-inline 落碼後，
// 舊基準 ed.clientH 恆差 2×pad，須以 content-box 為準（真機語義等價）。
const boxA = A.scroller.innerH ?? A.ed.clientH;
assert(Math.abs(A.content.rect[1] - boxA) <= tol, `A 編輯器未填滿 content.h=${A.content.rect[1]} 應≈${boxA}`);
assert(A.content.scrollH <= boxA + tol, `A 編輯器垂直溢出 scrollH=${A.content.scrollH} > ${boxA}`);
assert(A.content.rect[0] > FS * 2, `A 編輯器未換列（橫向僅 ${A.content.rect[0]}px，應多列）`);
// 閱讀器同改 content-box 基準——preview 直排 padding-inline（=物理上下，
// 宿主 --file-margins 建模）把 border-box 撐到 reading.clientH+2×pad；「列長填滿」的
// 版心＝preview 自身 content-box（innerH），對齊 reading.clientH。
const boxR = A.preview.innerH ?? A.preview.rect[1];
assert(Math.abs(boxR - A.reading.clientH) <= tol, `A 閱讀器未填滿 preview.contentH=${boxR} 應≈${A.reading.clientH}`);
assert(A.preview.rect[0] > FS * 2, `A 閱讀器未換列 preview.w=${A.preview.rect[0]}`);
assert(B.content.scrollH <= (B.scroller.innerH ?? B.ed.clientH) + tol, `B 短內容垂直溢出 scrollH=${B.content.scrollH}`);
assert(B.content.rect[0] < A.content.rect[0], `B 短內容未保持短列 rect.w=${B.content.rect[0]} 應明顯小於長內容 ${A.content.rect[0]}`);
assert(C.after && C.after.content.rect[1] < C.content.rect[1] - FS, `C resize 後編輯器列長未收縮 before=${C.content.rect[1]} after=${C.after && C.after.content.rect[1]}`);
assert(C.after && C.after.preview.rect[1] < C.preview.rect[1] - FS, `C resize 後閱讀器列長未收縮 before=${C.preview.rect[1]} after=${C.after && C.after.preview.rect[1]}`);
assert(D.content.ws !== "pre-wrap" || D.content.rect[1] <= D.ed.clientH + tol, `D 橫排受到直排規則污染 ws=${D.content.ws}`);

console.log("✓ A 直排長內容填滿＋換列 ✓ B 短內容不釘死 ✓ C resize 跟隨重排 ✓ D 橫排零影響");
await b.close();
