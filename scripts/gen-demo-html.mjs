// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 演示生成：用与插件导出管线相同的纯函数，产出「可直接双击打开」的直排 HTML。
// 不依赖 Obsidian 运行期（字体嵌入省略，浏览器用系统 CJK / 阿拉伯字体渲染）。
// 目的：端到端验证 buildStandaloneHtml + buildHtmlStageCss + buildTypesetCss 装配正确。
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BUILD = path.join(ROOT, "test", "build");
fs.mkdirSync(BUILD, { recursive: true });

// 复用测试用 ESM 包（已导出 typeset / languages 等纯函数）
execSync(
  `./node_modules/.bin/esbuild test/lib-export.ts --bundle --format=esm --outfile=${path.join(BUILD, "vwlib.mjs")}`,
  { cwd: ROOT, stdio: "inherit" }
);
const lib = await import(path.join(BUILD, "vwlib.mjs"));

// 与插件导出管线一致：先 MarkdownRenderer 输出 → expandMarks（含代码块保护）
function makeBodyHtml(scriptId, innerHtml) {
  const sp = lib.SCRIPTS[scriptId];
  const eff = lib.resolveEffective(sp, lib.DEFAULT_TYPOGRAPHY, lib.DEFAULT_PAGE);
  const marked = lib.expandMarks(innerHtml, {
    rubyMode: "auto", emphasis: true, tcy: true, tcyAutoMax: 2, emphasisStyle: "marks",
    forceCenterPunctuation: lib.shouldForceCenterPunctuation(eff.script, eff.typo),
    isolateRtl: eff.script.bidi === "ltr",
  });
  const injected = lib.injectHeadingIds(marked);
  const toc = lib.buildTocHtml(injected.headings, sp, "目次", "#");
  const stageClass = sp.writingMode === "horizontal-tb" ? "li-stage-horizontal" : "li-stage-vertical";
  const bodyHtml = `<div class="li-stage ${stageClass}">${toc}<div class="li-doc" lang="${sp.htmlLang}" dir="${sp.bidi}">${injected.html}</div></div>`;
  return lib.buildStandaloneHtml({
    title: `直排演示 · ${sp.label?.zh ?? scriptId}`,
    bodyHtml,
    typesetCss: lib.materializeAutoTheme(lib.buildTypesetCss(eff)) + "\n" + lib.buildTocCss(),
    pageCss: lib.buildHtmlStageCss(eff),
    fontFaces: "",
    lang: sp.htmlLang,
    dir: sp.bidi,
  });
}

function makeBody(scriptId, paras) {
  const inner = paras.map((p) => /^<h[1-6]\b/i.test(p) ? p : `<p>${p}</p>`).join("\n");
  return makeBodyHtml(scriptId, inner);
}

const han = makeBody("han", [
  "<h1>直排示例</h1>",
  "這是一份以「li」插件導出之直排 HTML——瀏覽器直接打開即為直排閱讀頁，可橫向滾動承載列序。",
  "<h2>第一章 緒論</h2>",
  "春水初生，春林初盛。春风十里，不如你。",
  "<h2>第二章 結論</h2>",
  "衆裏尋他千百度，驀然回首，那人卻在燈火闌珊處。",
]);
const arabic = makeBody("arabic", [
  "<h1>مثال عمودي</h1>",
  "هذا نص عربي يختبر اتجاه الكتابة من اليمين إلى اليسار في وثيقة أفقية.",
  "يتم دعم الحروف المتصلة والترقيم بشكل صحيح.",
]);

// Web Clipper 风格样例：frontmatter（渲染前剥离）+ 代码 / callout / 表格 / 图片 / 混排阿拉伯
const webClipperMd = `---
title: 用 Obsidian Web Clipper 抓取的長文
source: https://example.com/article
url: https://example.com/article
author: 某人
published: 2026-01-02
tags: [阅读, 直排]
---

# 用 Obsidian Web Clipper 抓取的長文

正文含<strong>加粗</strong>、<em>斜體</em>與<a href="https://example.com">連結</a>，句末標點應置中，本段有《《重點傍點》》驗證常規記法不受保護影響。

## 第一節 列表與引用

<ul><li>列表項一</li><li>列表項二，含阿拉伯 مرحبا 混排</li></ul>

<blockquote><p>引用塊：這是中文引用，應直排。</p></blockquote>

## 第二節 Callout 與代碼

<div class="callout" data-callout="note"><div class="callout-title"><div class="callout-icon">📝</div><div class="callout-title-inner">筆記</div></div><div class="callout-content"><p>callout 正文，含中文標點。</p></div></div>

<pre class="language-js"><code>const cfg = "《《重點》》"; // 配置註釋。
let t = ⦀東京≪とうきょう≫;
let y = ⟨2025⟩;</code></pre>

## 第三節 表格與圖片

<table><thead><tr><th>欄一</th><th>欄二</th></tr></thead><tbody><tr><td>甲</td><td>乙</td></tr><tr><td>丙</td><td>丁</td></tr></tbody></table>

<p><img src="https://example.com/pic.png" alt="示意圖"></p>

<p>結尾段，再次嵌入阿拉伯 مرحبا بالعالم 以驗證 RTL 隔離。</p>`;
const webClipperInner = lib.expandMarks
  ? webClipperMd.replace(/^---[\s\S]*?---\n/, "") // 模拟 getFrontMatterInfo 剥离 frontmatter
  : webClipperMd;
const webClipper = makeBodyHtml("han", webClipperInner);

const out = path.join(ROOT, "demo");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "demo-vertical-han.html"), han);
fs.writeFileSync(path.join(out, "demo-vertical-arabic.html"), arabic);
fs.writeFileSync(path.join(out, "demo-vertical-webclipper.html"), webClipper);
console.log("已生成演示 HTML:", path.join(out, "demo-vertical-han.html"), path.join(out, "demo-vertical-arabic.html"), path.join(out, "demo-vertical-webclipper.html"));
