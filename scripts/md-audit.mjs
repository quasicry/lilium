// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 漢文直排「必須過關」審查頁：
 * - 富 Markdown 樣本（標題/段落/標點全家桶/粗斜體/列表/引用/代碼/表格/分隔線/連結）
 * - 走真實管線：expandMarks（.li-punct 標點幾何居中包裹）+ buildTypesetCss + 舞台 CSS
 * - 輸出可重放 HTML + 截圖，供像素級檢查（標點位置/疊字/元素衝突）
 * 用法：SHOT_OUT=... node scripts/md-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require2 = createRequire(import.meta.url);
const OUT = process.env.SHOT_OUT || ".";
fs.mkdirSync(OUT, { recursive: true });

const TMP = path.resolve(ROOT, "test/build");
fs.mkdirSync(TMP, { recursive: true });
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "vwlib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "vwlib.mjs").replace(/\\/g, "/"));

const eff = lib.resolveEffective(
  lib.SCRIPTS.han,
  { ...lib.DEFAULT_TYPOGRAPHY, fontSizePt: 16 },
  lib.DEFAULT_PAGE
);

/* —— 富 Markdown 樣本（真實 Obsidian 筆記形態）—— */
const mdSample = [
  "# 第一章　觀天地",
  "",
  "天地玄黃，宇宙洪荒。日月盈昃，辰宿列張！寒來暑往？（問號測試）「引號內容」『巢狀引號』（《書名號》）、頓號、測試——破折號與省略號……",
  "",
  "## 第二節　排版元素",
  "",
  "**粗體文字**與*斜體文字*以及`行內代碼`和[連結文字](https://obsidian.md)混排。",
  "",
  "- 無序清單第一項",
  "- 無序清單第二項",
  "  - 巢狀清單項",
  "",
  "1. 有序清單第一項",
  "2. 有序清單第二項",
  "",
  "> 引用區塊：直排中的引文應有側邊線與縮排，不得與正文衝突。",
  "",
  "```js",
  "console.log(\"代碼塊保持橫排 LTR\");",
  "```",
  "",
  "| 欄一 | 欄二 | 欄三 |",
  "| --- | --- | --- |",
  "| 甲 | 乙 | 丙 |",
  "| 丁 | 戊 | 己 |",
  "",
  "---",
  "",
  "數字縦中横測試：民國 114 年，公元 2026 年。",
  "",
  "## 第三節　標點全家桶",
  "",
  "。、；：！？「」『』（）《》〈〉【】〔〕……——～·",
  "",
  "句號在格中：天。地。玄。黃。逗號在格中：天，地，玄，黃。頓號：天、地、玄、黃。",
].join("\n");

/* —— 極簡 Markdown→HTML（與 Obsidian 輸出結構對齊的子集）—— */
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const lines = md.split("\n");
  const out = [];
  let inUl = false, inOl = false, inCode = false, codeBuf = [], inTable = false, rows = [];
  const closeLists = () => { if (inUl) { out.push("</ul>"); inUl = false; } if (inOl) { out.push("</ol>"); inOl = false; } };
  const flushTable = () => {
    if (!rows.length) return;
    out.push("<table><thead><tr>" + rows[0].map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
    for (let i = 2; i < rows.length; i++) out.push("<tr>" + rows[i].map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
    out.push("</tbody></table>");
    rows = [];
  };
  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inCode) { out.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`); codeBuf = []; inCode = false; }
      else { closeLists(); flushTable(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }
    if (/^\|.*\|$/.test(raw)) { rows.push(raw.slice(1, -1).split("|").map((c) => c.trim())); continue; }
    flushTable();
    if (/^### /.test(raw)) { closeLists(); out.push(`<h3>${inline(raw.slice(4))}</h3>`); continue; }
    if (/^## /.test(raw)) { closeLists(); out.push(`<h2>${inline(raw.slice(3))}</h2>`); continue; }
    if (/^# /.test(raw)) { closeLists(); out.push(`<h1>${inline(raw.slice(2))}</h1>`); continue; }
    if (/^---$/.test(raw.trim())) { closeLists(); out.push("<hr>"); continue; }
    if (/^- /.test(raw)) { if (inOl) { out.push("</ol>"); inOl = false; } if (!inUl) { out.push("<ul>"); inUl = true; } out.push(`<li>${inline(raw.slice(2))}</li>`); continue; }
    if (/^\d+\. /.test(raw)) { if (inUl) { out.push("</ul>"); inUl = false; } if (!inOl) { out.push("<ol>"); inOl = true; } out.push(`<li>${inline(raw.replace(/^\d+\. /, ""))}</li>`); continue; }
    if (/^> /.test(raw)) { closeLists(); out.push(`<blockquote><p>${inline(raw.slice(2))}</p></blockquote>`); continue; }
    if (raw.trim() === "") { closeLists(); continue; }
    closeLists();
    out.push(`<p>${inline(raw)}</p>`);
  }
  flushTable();
  closeLists();
  if (inCode) out.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`);
  return out.join("\n");
}

/* —— 真實管線：expandMarks（含標點幾何居中包裹）—— */
const inner0 = mdToHtml(mdSample);
// 標點處理跟隨默認設置（GB/T 15834 直排標準：點號下偏右，字體 vert 形式）
const forceCenter = lib.shouldForceCenterPunctuation(lib.SCRIPTS.han, eff.typo);
const inner = lib.expandMarks(inner0, {
  rubyMode: "explicit",
  emphasis: true,
  tcy: true,
  tcyAutoMax: 2,
  emphasisStyle: "marks",
  forceCenterPunctuation: forceCenter,
});
console.log(`forceCenterPunctuation: ${forceCenter}（默認=GB 之下偏右）`);

const stageClass = eff.script.writingMode === "horizontal-tb" ? "li-stage-horizontal" : "li-stage-vertical";
const typesetCss = lib.materializeAutoTheme(lib.buildTypesetCss(eff));
const stageCss = lib.buildHtmlStageCss(eff);
const fontFaces = ""; // 沙箱截圖用系統 Noto Serif CJK（fontStack 已含）

const html = lib.buildStandaloneHtml({
  title: "漢文直排審查",
  bodyHtml: `<div class="li-stage ${stageClass}"><div class="li-doc" lang="zh-Hans" dir="ltr">${inner}</div></div>`,
  typesetCss,
  pageCss: stageCss,
  fontFaces,
  lang: "zh-Hans",
  dir: "ltr",
});

const outHtml = path.join(OUT, "md-audit.html");
fs.writeFileSync(outHtml, html);
console.log(`html: ${outHtml} (${(html.length / 1024).toFixed(0)} KB)`);
console.log(`.li-punct 數量: ${(html.match(/li-punct/g) || []).length / 2 | 0}`);

const png = path.join(OUT, "md-audit.png");
spawnSync("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--screenshot=${png}`, "--window-size=900,1400", "--virtual-time-budget=8000",
  "--force-device-scale-factor=1", `file://${outHtml.replace(/\\/g, "/")}`]);
console.log(`png: ${png} (${fs.statSync(png).size} B)`);
