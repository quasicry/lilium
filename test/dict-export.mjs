// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 匯出筆記轉換 — 純函數單元測試（P1③⑤）。
 *
 * 驗證：
 *  - ⑤ htmlToMarkdownBasic：MD 表格轉換（表頭＋分隔行、單元格拍平、豎線轉義、
 *    無行表保底、非表格內容不受影響）
 *  - ③ extractStyleBlocks：<style> 內容抽出供 frame head 注入、原元素移除、
 *    </style 斷序防注入
 *
 * 用法：node test/dict-export.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });
const esbuild = path.join(ROOT, "node_modules", ".bin", "esbuild");

const out = path.join(TMP, "note-builder-link.mjs");
execFileSync(esbuild, [path.join(ROOT, "src", "dict", "note-builder.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`], { stdio: "pipe" });
const sanitizeOut = path.join(TMP, "sanitize-link.mjs");
execFileSync(esbuild, [path.join(ROOT, "src", "dict", "sanitize.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${sanitizeOut}`], { stdio: "pipe" });

const { htmlToMarkdownBasic } = await import(out);
const { extractStyleBlocks } = await import(sanitizeOut);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓ " + m); };
async function test(name, fn) {
  try { await fn(); ok(name); } catch (e) { fail++; console.error("  ✗ " + name + " — " + (e?.message ?? e)); }
}

console.log("\n匯出筆記轉換（test/dict-export.mjs）");

await test("⑤ 表格 → MD table（表頭＋分隔行＋資料列）", () => {
  const md = htmlToMarkdownBasic("<table><tr><th>字</th><th>音</th></tr><tr><td>中</td><td>zhōng</td></tr></table>");
  assert.match(md, /\| 字 \| 音 \|/, "表頭行: " + md);
  assert.match(md, /---\s*\|\s*---/, "分隔行: " + md);
  assert.match(md, /\| 中 \| zhōng \|/, "資料行: " + md);
});

await test("⑤ 單元格拍平＋豎線轉義＋缺格補齊", () => {
  const md = htmlToMarkdownBasic(
    "<table><tr><th>a</th><th>b</th></tr><tr><td>x<b>1</b></td><td>pi|pe</td></tr><tr><td>only</td></tr></table>",
  );
  assert.match(md, /\| x1 \| pi\\|pe \|/, "拍平＋豎線轉義: " + md);
  assert.match(md, /\| only \| \|/, "缺格補空: " + md);
});

await test("⑤ 非 table 內容不受影響（標題/粗體照舊）", () => {
  const md = htmlToMarkdownBasic("<h2>T</h2><p>plain <b>bold</b></p>");
  assert.match(md, /## T/);
  assert.match(md, /\*\*bold\*\*/);
  assert.ok(!md.includes("| --- |"), "不該冒出分隔行: " + md);
});

await test("③ extractStyleBlocks：抽出 CSS、移除原 <style>、多塊拼接", () => {
  const { html, css } = extractStyleBlocks('<p class="a">x</p><style>.a{color:red}</style><style>.b{color:blue}</style>');
  assert.equal(css.includes(".a{color:red}"), true, "css 應含第一塊: " + JSON.stringify(css));
  assert.equal(css.includes(".b{color:blue}"), true, "css 應含第二塊");
  assert.equal(html.includes("<style"), false, "原 <style> 應被移除: " + html);
  assert.equal(html.includes('class="a"'), true, "其餘內容保留");
});

await test("③ </style 斷序注入被拆掉", () => {
  const { css } = extractStyleBlocks("<style>.x{content:'</style><script>alert(1)</script>'}</style>");
  assert.equal(/<\/style/i.test(css), false, "css 內不得殘留 </style: " + JSON.stringify(css));
});


await test("P2-5 ruby → 漢(注音)", () => {
  const md = htmlToMarkdownBasic("<ruby>漢<rt>zhu</rt></ruby>");
  assert.equal(md, "漢(zhu)", "ruby 轉換: " + md);
});

await test("P2-5 sup/sub → ^x^ / ~x~（Obsidian MD 慣例）", () => {
  const md = htmlToMarkdownBasic("H<sub>2</sub>O and x<sup>2</sup>");
  assert.match(md, /H~2~O/, "sub: " + md);
  assert.match(md, /x\^2\^/, "sup: " + md);
});

await test("B1：extractStyleBlocks 剝 @import 與遠端 url()、保留相對路徑/data:", () => {
  const { css } = extractStyleBlocks(
    "<style>@import url('https://evil.example/track.css'); .a{background:url(\"https://evil.example/pixel.png\")} .b{background:url(img/local.png)} .c{background:url(data:image/png;base64,AAAA)}</style>",
  );
  assert.equal(/@import/i.test(css), false, "@import 應剝除: " + JSON.stringify(css));
  assert.equal(/https?:\/\/[^)'"]*/.test(css.replace(/\/\//g, "⧸⧸")), false, "遠端 url 應剝成 none: " + css);
  assert.match(css, /url\(["']?img\/local\.png/, "相對路徑保留: " + css);
  assert.match(css, /url\(["']?data:image\/png/, "data: 保留: " + css);
});

await test("C1：colspan 補空欄對齊列寬", () => {
  const md = htmlToMarkdownBasic("<table><tr><th>a</th><th>b</th><th>c</th></tr><tr><td colspan=\"2\">wide</td><td>z</td></tr></table>");
  assert.match(md, /\| wide \|\s*\| z \|/, "colspan=2 應補一空欄: " + md);
});

await test("C2：ruby 無 rt 時不殘留 <rt> 標籤", () => {
  const md = htmlToMarkdownBasic("<ruby>漢<rp>(</rp><rt>zhu</rt><rp>)</rp></ruby>");
  assert.equal(md, "漢(zhu)", "rp 旁注不混入: " + JSON.stringify(md));
});



// ---- A6：unsafeRegexReason（ReDoS fail-closed 靜態偵測）----
const ftOut = path.join(TMP, "fulltext-link.mjs");
execFileSync(esbuild, [path.join(ROOT, "src", "dict", "fulltext.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${ftOut}`, `--alias:obsidian=${path.join(ROOT, "test", "obsidian-dict-mock.cjs")}`], { stdio: "pipe" });
const { unsafeRegexReason } = await import(ftOut);

await test("A6：災難正則（(a+)+$、(a|a)*b、x++）應被拒；常規查詢不誤傷（r59 白名單：普通括號組×量詞放行）", () => {
  for (const bad of ["(a+)+$", "(a|a)*b", "x**", "x*+", "a{2,}{3,}", "(a*)+"]) {
    assert.ok(unsafeRegexReason(bad), `應拒絕: ${bad}`);
  }
  // r59 白名單：(ab)+、(foo|bar)+、([0-9]{2})+ 為線性構型，不再一律拒。
  for (const good of ["ka", "colou?r", "w[abc]+x", "(a|b)c*", "\\\\d+", "[a*]+b", "(\\\\d{4})-(\\\\d{2})", "(ab)+", "(foo|bar)+", "([0-9]{2})+"]) {
    assert.equal(unsafeRegexReason(good), null, `不應誤傷: ${good}`);
  }
});

await test("A6：超長查詢（>500 字元）拒搜", () => {
  assert.equal(unsafeRegexReason("a".repeat(501)), "too-long");
  assert.equal(unsafeRegexReason("a".repeat(500)), null);
});

// ---- A2：exportMarkdownToVault 同秒碰撞防護（create 失敗→升級檔名重試）----
const exportOut = path.join(TMP, "export-link.mjs");
execFileSync(esbuild, [path.join(ROOT, "src", "dict", "export.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${exportOut}`, `--alias:obsidian=${path.join(ROOT, "test", "obsidian-dict-mock.cjs")}`], { stdio: "pipe" });
const { exportMarkdownToVault } = await import(exportOut);

await test("A2：同檔名兩次匯出——create 碰撞時升級檔名重試，不再拋 File already exists", async () => {
  const created = [];
  const plugin = {
    T: (k, vars) => JSON.stringify({ k, vars }),
    ensureFolder: async () => {},
    app: { vault: { create: async (p, content) => {
      if (created.includes(p)) { const e = new Error("File already exists: " + p); throw e; }
      created.push(p);
    } } },
  };
  await exportMarkdownToVault(plugin, "轉寫-20261107-120000.md", ["a"]);
  await exportMarkdownToVault(plugin, "轉寫-20261107-120000.md", ["b"]);
  assert.equal(created.length, 2, "應成功建立 2 個檔");
  assert.notEqual(created[0], created[1], "第二次應落在升級後的檔名");
  assert.match(created[1], / 1\.md$/, "升級檔名應帶序號: " + created[1]);
});

await test("A2：非碰撞錯誤照常上拋（不吞真故障）", async () => {
  const plugin = {
    T: (k) => k,
    ensureFolder: async () => {},
    app: { vault: { create: async () => { throw new Error("disk full"); } } },
  };
  await assert.rejects(() => exportMarkdownToVault(plugin, "x.md", ["a"]), /disk full/);
});

console.log(`\\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
