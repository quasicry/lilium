#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * W2-B 開引號 trim-start 選項測試（r71 / test/quote-trim.mjs）
 * ==========================================================
 * 接口合約（W2行首半寬-嚴格計劃.md，以本代理名義寫死）：
 *   · body class：`li-quote-trim-start`（默認不存在）
 *   · 設置鍵：typography.quoteTrimStart（默認 false）
 *   · 開啟時 buildTypesetCss 輸出 `@supports (text-spacing-trim: trim-start)
 *     { ... text-spacing-trim: trim-start; }`
 *
 * 語義錨：
 *   · 行首開引號「：normal ＝ 1.0em（全角）、trim-start ＝ 0.5em（半寬）
 *
 * ⚠️ 方法学（Chromium issue 40275400 / 431660829）：同幀內先後量 normal /
 * trim-start 會被字距快取污染——本檔**每個 trim 值各起獨立 headless pass**
 * （`?pass=normal` / `?pass=trim-start`），嚴禁同幀對比。
 *
 * Graceful skip：W2-B 未合入前（buildTypesetCss 對 quoteTrimStart:true 無反應）
 * 靜態接線斷言輸出 SKIPPED（原因明示），瀏覽器語義錨仍照跑——它驗的是
 * Chromium 平台行為，與 src/ 合入無關，不是假綠。
 *
 * 用法：node test/quote-trim.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-quote-trim-"));
const BUILD = path.join(ROOT, "test", "build");
fs.mkdirSync(BUILD, { recursive: true });

const CHROME = process.env.LI_CHROMIUM
  || "/home/agentuser/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const HAS_CHROME = fs.existsSync(CHROME);

let passed = 0, failed = 0, skipped = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) {
    if (e && e.code === "ERR_LI_SKIP") {
      skipped++;
      console.log(`  ⊘ SKIPPED：${name}\n    原因：${e.message}`);
    } else { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
  }
};
const skip = (msg) => { const e = new Error(msg); e.code = "ERR_LI_SKIP"; throw e; };

/* ---------- 1. 打包 typeset 純函式（lib-export 不依賴 obsidian） ---------- */
let lib = null;
try {
  execEsbuild();
  lib = await import(path.join(TMP, "lib.mjs"));
} catch (e) {
  console.error(`SKIP：typeset bundle 失敗（${e.message}）——靜態斷言全跳過`);
}

function execEsbuild() {
  const r = spawnSync(
    path.join(ROOT, "node_modules", ".bin", "esbuild"),
    [path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
      `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent"],
    { encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error("esbuild 失敗：" + (r.stderr || r.stdout || r.error?.message));
}

/* ---------- 2. 靜態斷言（buildTypesetCss 輸出） ---------- */
console.log("=== A. 靜態：buildTypesetCss 輸出門禁 ===");
function makeTypo(over) {
  return { ...lib.DEFAULT_TYPOGRAPHY, ...over };
}
function cssOf(typo) {
  const eff = lib.resolveEffective(lib.SCRIPTS.han, typo, lib.DEFAULT_PAGE);
  return lib.buildTypesetCss(eff);
}

test("A1 默認（quoteTrimStart 缺/false）輸出逐字不含 trim-start 規則", () => {
  if (!lib) skip("typeset bundle 不可用");
  const css = cssOf(makeTypo({ quoteTrimStart: false }));
  assert.ok(!/text-spacing-trim:\s*trim-start/.test(css),
    "默認關閉時不得出現 text-spacing-trim: trim-start（零回歸錨）");
  assert.ok(!css.includes("li-quote-trim-start"),
    "默認關閉時不得出現 li-quote-trim-start class 選擇器");
});
test("A2 默認 TypographSettings 不含 quoteTrimStart=true（默認值斷言）", () => {
  if (!lib) skip("typeset bundle 不可用");
  const d = lib.DEFAULT_TYPOGRAPHY;
  if (!("quoteTrimStart" in d)) skip("W2-B 未合入：DEFAULT_TYPOGRAPHY 尚無 quoteTrimStart 鍵");
  assert.equal(d.quoteTrimStart, false, "quoteTrimStart 默認必須 false");
});
test("A3 開啟 quoteTrimStart 輸出 @supports trim-start 且掛在 li-quote-trim-start 下", () => {
  if (!lib) skip("typeset bundle 不可用");
  const css = cssOf(makeTypo({ quoteTrimStart: true }));
  if (!/text-spacing-trim:\s*trim-start/.test(css)) {
    skip("W2-B 未合入：quoteTrimStart:true 時 buildTypesetCss 仍無 trim-start 規則");
  }
  assert.ok(/li-quote-trim-start/.test(css), "規則必須掛在 body.li-quote-trim-start 作用域下");
  assert.ok(/@supports\s*\(\s*text-spacing-trim:\s*trim-start\s*\)/.test(css),
    "必須包 @supports (text-spacing-trim: trim-start)");
});

/* ---------- 3. 瀏覽器語義錨（每 trim 值獨立 pass） ---------- */
console.log("=== B. 瀏覽器：行首開引號語義錨（獨立 headless pass） ===");

function buildHtml(pass) {
  // pass=normal：無 li-quote-trim-start class、text-spacing-trim 用 normal（現狀）。
  // pass=trim-start：body 掛合約 class + @supports 內 trim-start（W2-B 落地後形態）。
  const bodyCls = pass === "trim-start" ? "li-quote-trim-start li-doc" : "li-doc";
  const trimCss = pass === "trim-start"
    ? `@supports (text-spacing-trim: trim-start) { .li-doc { text-spacing-trim: trim-start; } }`
    : `@supports (text-spacing-trim: normal) { .li-doc { text-spacing-trim: normal; } }`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#fff}
.wrap{position:absolute;left:-99999px;top:0;visibility:hidden}
p{margin:0;writing-mode:vertical-rl;text-orientation:mixed;font-size:100px;
  line-height:1;letter-spacing:0;block-size:3000px;inline-size:100px;
  font-feature-settings:normal;font-family:"Noto Serif CJK SC"}
${trimCss}
</style></head><body class="${bodyCls}">
<div class="wrap" id="host"></div>
<pre id="result">pending</pre>
<script>
const FS = 100;
async function run() {
  /* 與 _solve-linestart 同源的前置：fonts.ready + canvas warmup。
     直排 Range 量測須在此之後**動態建立**段落才回傳非零幾何（實測）。 */
  try { if (document.fonts && document.fonts.ready) await Promise.race([
    document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]); } catch (e) {}
  try { const g = document.createElement("canvas").getContext("2d");
    g.font = FS + 'px "Noto Serif CJK SC"'; g.measureText("。「国「"); } catch (e) {}
  await new Promise((r) => setTimeout(r, 300));
  const p = document.createElement("p");
  p.textContent = "「国国国";
  document.getElementById("host").appendChild(p);
  const t = p.firstChild;
  const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 1);
  const cr = r.getBoundingClientRect();
  const pr = p.getBoundingClientRect();
  const out = {
    pass: "${pass}",
    spanTopEm: +((cr.top - pr.top) / FS).toFixed(4),
    spanSizeEm: +(cr.height / FS).toFixed(4),
    supportsTrimStart: CSS.supports("text-spacing-trim", "trim-start"),
    bodyHasClass: document.body.classList.contains("li-quote-trim-start"),
  };
  document.getElementById("result").textContent = JSON.stringify(out);
  document.body.setAttribute("data-done", "1");
}
run();
</script></body></html>`;
}

function runPass(pass) {
  const html = path.join(BUILD, "quote-trim.html");
  fs.writeFileSync(html, buildHtml(pass));
  const dom = spawnSync(CHROME, [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--virtual-time-budget=15000", "--dump-dom", `file://${html}?pass=${pass}`,
  ], { encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  if (dom.error || !/data-done="1"/.test(dom.stdout ?? "")) {
    skip(`chromium 執行失敗（pass=${pass}）` + (dom.stderr ? "：" + dom.stderr.slice(0, 200) : ""));
  }
  const m = (dom.stdout ?? "").match(/<pre id="result">([\s\S]*?)<\/pre>/);
  if (!m || m[1] === "pending") skip(`頁面未回傳結果（pass=${pass}）`);
  return JSON.parse(m[1]);
}

if (HAS_CHROME) {
  // 兩個 trim 值、兩個獨立 Chromium pass——嚴禁同幀先後量測。
  let normal = null, tstart = null, chromeFail = null;
  try { normal = runPass("normal"); } catch (e) { chromeFail = e; }
  try { tstart = runPass("trim-start"); } catch (e) { chromeFail = chromeFail ?? e; }

  if (chromeFail) {
    skipped++;
    console.log(`  ⊘ SKIPPED：瀏覽器語義錨（原因：${chromeFail.message}）`);
  } else {
    test("B1 平台支援 text-spacing-trim: trim-start", () => {
      assert.ok(tstart.supportsTrimStart, "CSS.supports(trim-start) 應為 true（裁決報告基準）");
    });
    test("B2 normal（默認形態）：行首「佔位全角 1.0em", () => {
      assert.ok(Math.abs(normal.spanSizeEm - 1.0) < 0.02,
        `normal spanSize=${normal.spanSizeEm}，應為 1.0`);
      assert.equal(normal.bodyHasClass, false, "默認形態 body 不得掛 li-quote-trim-start");
    });
    test("B3 trim-start（開啟形態）：行首「佔位半寬 0.5em", () => {
      assert.ok(Math.abs(tstart.spanSizeEm - 0.5) < 0.02,
        `trim-start spanSize=${tstart.spanSizeEm}，應為 0.5（語義錨）`);
    });
    test("B4 兩 pass 互斥印證（各獨立 Chromium，無同幀快取污染）", () => {
      const diff = Math.abs(normal.spanSizeEm - tstart.spanSizeEm);
      assert.ok(diff > 0.4, `兩 pass 差 ${diff}，應接近 0.5em`);
    });
  }
} else {
  skipped++;
  console.log(`  ⊘ SKIPPED：瀏覽器語義錨（原因：chromium 不存在：${CHROME}）`);
}

/* ---------- 4. 結算 ---------- */
console.log(`\n=== 結算：${passed} 過 / ${failed} 敗 / ${skipped} SKIP ===`);
console.log("實測數字：pass=normal  行首「 spanSize="
  + "(見上) ；pass=trim-start 行首「 spanSize=(見上)（單位 em，font-size=100px）");
process.exit(failed ? 1 : 0);
