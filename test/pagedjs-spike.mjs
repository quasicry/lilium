// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * Paged.js spike（調研報告「中」級建議的落地驗證）——chromium CLI 版。
 * 用法：node test/pagedjs-spike.mjs（需 chromium；獨立調查用，非 test:all 成員）
 * 原理：把 pagedjs polyfill 內嵌進樣本 HTML，--virtual-time-budget 讓異步分頁跑完，
 * --dump-dom 後解析 data-paged-findings 屬性（pages/writing-mode/文字保真）。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGED_POLYFILL = path.join(ROOT, "node_modules", "pagedjs", "dist", "paged.polyfill.js");
const CHROME = process.env.CHROME_BIN || "/usr/local/bin/chromium";
const OUT = path.join(ROOT, "test", "build", "pagedjs-spike.html");

const POLYFILL = fs.readFileSync(PAGED_POLYFILL, "utf8");
const PARAGRAPHS = "<p>天地玄黃宇宙洪荒日月盈昃辰宿列張寒來暑往秋收冬藏閏餘成歲律呂調陽雲騰致雨露結為霜金生麗水玉出崑岡劍號巨闕珠稱夜光果珍李柰菜重薑芥咸腥。以測試分頁行為之穩定性與保真度並觀察直排標點與禁則處理之表現。</p>".repeat(8);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 105mm 148mm; margin: 10mm; }
body { margin: 0; }
.li-doc { writing-mode: vertical-rl; text-orientation: mixed; font-family: serif; font-size: 12pt; line-height: 1.9; height: 128mm; }
</style>
<script>window.onerror = (e) => { try { document.body.setAttribute("data-paged-error", String(e).slice(0, 300)); } catch {} };
window.PagedConfig = { auto: true, before: () => { try { document.body.setAttribute("data-paged-before", "1"); } catch {} }, after: (flow) => {
  try {
    const first = document.querySelector(".pagedjs_page .pagedjs_page_content div");
    const cs = first ? getComputedStyle(first) : null;
    document.body.setAttribute("data-paged-findings", JSON.stringify({
      pages: flow.pages.length,
      writingMode: cs ? cs.writingMode : "(n/a)",
      hasSampleText: (document.body.textContent || "").includes("天地玄黃"),
    }));
  } catch (e) {
    document.body.setAttribute("data-paged-findings", JSON.stringify({ error: String(e) }));
  }
} };</script>
</head><body><div class="li-doc">${PARAGRAPHS}</div>
<script>${POLYFILL}</script>
</body></html>`;
fs.writeFileSync(OUT, html, "utf8");

const dom = execFileSync(CHROME, [
  "--headless", "--no-sandbox", "--disable-gpu",
  "--virtual-time-budget=20000", "--dump-dom", `file://${OUT}`,
], { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });

if (!/data-paged-findings/.test(dom)) {
  const err = dom.match(/data-paged-error="([^"]*)"/);
  const before = /data-paged-before="1"/.test(dom);
  const pageMarkers = (dom.match(/pagedjs_page/g) || []).length;
  console.error("[spike-debug] findings 缺失 | before:", before, "| error:", err ? err[1] : "(none)", "| pagedjs_page 標記數:", pageMarkers, "| dump 前 300 字:", dom.slice(0, 300));
}
const m = dom.match(/data-paged-findings="([^"]*)"/);
assert.ok(m, "Paged.js 未產出 findings（虛擬時間內未完成？）");
const findings = JSON.parse(m[1].replace(/&quot;/g, '"'));
assert.ok(!findings.error, "Paged.js after 回調報錯：" + findings.error);
assert.ok(findings.pages > 0, "應切出頁面");
assert.ok(findings.hasSampleText, "樣本文字應保留");
console.log("[pagedjs-spike] findings:", JSON.stringify(findings));
console.log(
  `[pagedjs-spike] 結論：分頁可運行（${findings.pages} 頁）；writing-mode ${String(findings.writingMode).includes("vertical") ? "保真" : "疑似丟失：" + findings.writingMode}。` +
  ` 直排標點/禁則的視覺保真需人工目檢，本 spike 驗證機械可行性。`,
);
