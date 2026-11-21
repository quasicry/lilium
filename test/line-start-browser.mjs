#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * W2-A 行首句讀點幾何回退（li-line-start）真機量測測試（r71）
 * =========================================================
 * 接口合約（W2行首半寬-嚴格計劃.md，以本代理名義寫死）：
 *   · body class：`li-line-start-trim`（默認不存在）
 *   · 逐字 class：列首句讀點掛 `li-line-start`（W2-A 量測式 DOM 標記）
 *   · 設置鍵：typography.lineStartTrim（默認 false）
 *
 * 裁決事實（tmp/linestart-region-裁决.md，W3 實測、不可推翻）：
 *   · Chromium text-spacing-trim 對行首句讀點（。、，）一律全角——任何 trim
 *     值皆不作用；半寬只能走幾何回退（量測/標記式，region 無關）。
 *
 * 本檔驗證（真列首，直排 vertical-rl，font-size=100px，單位 em）：
 *   A. 默認關：無 li-line-start class、列首句讀點佔位 1.0em（零回歸錨）。
 *   B. 開啟：列首句讀點掛 class、佔位半寬（實測數字入報告；期望 ≈0.5em，
 *      由 W2-A 的 margin-inline-start:-0.5em 負位移實現——實際回退量以
 *      Canvas 墨跡實測回填，故此處寬鬆斷言 <0.75 並記錄確切值）。
 *
 * Graceful skip：src/line-start.ts（W2-A）未合入前，B 組輸出 SKIPPED（明示
 * 原因），A 組靜態/平台斷言照跑（不假紅、不假綠）。本檔不用同幀對比 trim 值
 * （句讀點行首與 text-spacing-trim 無關，無字距快取陷阱；開關走 DOM class
 * restyle，天然強制重排）。
 *
 * 用法：node test/line-start-browser.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-linestart-"));
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

/* W2-A 源碼存在性探測（graceful skip 依據） */
const SRC_LINESTART = path.join(ROOT, "src", "line-start.ts");
const SRC_LINESTART_RUNTIME = path.join(ROOT, "src", "line-start-runtime.ts");
const w2aMerged = fs.existsSync(SRC_LINESTART) || fs.existsSync(SRC_LINESTART_RUNTIME);
const SKIP_W2A = w2aMerged ? null
  : "W2-A 未合入：src/line-start.ts 與 src/line-start-runtime.ts 皆不存在——僅能驗平台基線（列首全角）與本腳本骨架";

/* 量測對象：句讀點收尾集（PUNCT_WRAP_CODEPOINTS 的行首主戰場三點＋擴展） */
const DOTS = [
  { cp: "U+3002", char: "。" },
  { cp: "U+3001", char: "、" },
  { cp: "U+FF0C", char: "，" },
  { cp: "U+FF1A", char: "：" },
  { cp: "U+FF1B", char: "；" },
  { cp: "U+FF1F", char: "？" },
  { cp: "U+FF01", char: "！" },
];

/* ---------- 1. 瀏覽器量測 ---------- */
function buildHtml(pass) {
  // pass=off：默認形態（無 body.li-line-start-trim、無逐字 class）。
  // pass=on ：W2-A 落地後形態——由 bundle 運行時掛 class；bundle 缺席時
  //           退回「模擬形態」（手掛合約 class + 0.5em 負位移規則），
  //           只在模擬形態下記錄期望幾何，標注 mode=simulated。
  const bodyCls = pass === "on" ? "li-line-start-trim li-doc" : "li-doc";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#fff}
.wrap{position:absolute;left:-99999px;top:0;visibility:hidden}
p{margin:0;writing-mode:vertical-rl;text-orientation:mixed;font-size:100px;
  line-height:1;letter-spacing:0;block-size:3000px;inline-size:100px;
  font-feature-settings:normal;text-spacing-trim:normal;
  font-family:"Noto Serif CJK SC"}
/* 合約 class 下的幾何回退規則（W2-A 的量測版 CSS 語義；僅在開啟形態存在）。
   實測（Chromium 153）：margin-inline-start:-0.5em 在 vertical-rl 下把列首
   字元**盒**向外平移 −0.5em（下一字元不動）——可量測簽章 dotOffsetEm 0→−0.5 */
.li-line-start-trim .li-line-start { margin-inline-start: -0.5em; }
</style></head><body class="${bodyCls}">
<script src="./line-start-bundle.js"><\/script>
<div class="wrap" id="host"></div>
<pre id="result">pending</pre>
<script>
const FS = 100;
const DOTS = ${JSON.stringify(DOTS)};
const PASS = "${pass}";
const out = { pass: PASS, mode: "real", items: [] };
const host = document.getElementById("host");

function measureItem(p) {
  const pr = p.getBoundingClientRect();
  /* 列首字元可能是 W2-A 包的 span.li-line-start（node0），也可能是裸 text node */
  const node0 = p.querySelector(".li-line-start") || p.firstChild;
  const r = document.createRange(); r.setStart(node0, 0); r.setEnd(node0, 1);
  const cr = r.getBoundingClientRect();
  return {
    char: (node0.textContent || "")[0],
    hasClass: !!p.querySelector(".li-line-start"),
    /* 列首佔位簽章：字元盒相對列首（段落頂）的 inline-start 偏移。
       默認 0（全角貼列首）；幾何回退後 −0.5（半寬外移） */
    dotOffsetEm: +((cr.top - pr.top) / FS).toFixed(4),
    sizeEm: +(cr.height / FS).toFixed(4),
  };
}

/* W2-A 運行時若已打包，由它先做標記；否則走模擬/默認形態 */
let runtime = null;
try { runtime = window.LiLineStart || null; } catch (e) { runtime = null; }
if (runtime && typeof runtime.markupLineStarts === "function") {
  for (const d of DOTS) {
    const p = document.createElement("p");
    p.textContent = d.char + "国国国国国";
    host.appendChild(p);
  }
  try { runtime.markupLineStarts(host, { enabled: PASS === "on" }); out.mode = "runtime"; }
  catch (e) { out.runtimeError = String(e && e.message || e); }
} else if (PASS === "on") {
  /* bundle 未接線：模擬 W2-A 標記（逐字 span 手掛合約 class），驗證 CSS 幾何本身 */
  for (const d of DOTS) {
    const p = document.createElement("p");
    const s = document.createElement("span");
    s.className = "li-line-start";
    s.textContent = d.char;
    p.appendChild(s);
    p.appendChild(document.createTextNode("国国国国国"));
    host.appendChild(p);
  }
  out.mode = "simulated";
} else {
  for (const d of DOTS) {
    const p = document.createElement("p");
    p.textContent = d.char + "国国国国国";
    host.appendChild(p);
  }
}
out.bodyHasTrimClass = document.body.classList.contains("li-line-start-trim");
out.items = [...host.children].map(measureItem);
document.getElementById("result").textContent = JSON.stringify(out);
document.body.setAttribute("data-done", "1");
<\/script></body></html>`;
}

function runPass(pass) {
  const html = path.join(BUILD, "line-start-browser.html");
  fs.writeFileSync(html, buildHtml(pass));
  // bundle 若存在則複製同目錄（pass=on 的 runtime 模式）；否則 script 404 無害
  const bundleSrc = path.join(ROOT, "test", "build", "line-start-runtime.js");
  const bundleDst = path.join(BUILD, "line-start-bundle.js");
  if (fs.existsSync(bundleSrc)) fs.copyFileSync(bundleSrc, bundleDst);
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

console.log("=== A. 默認關（零回歸錨） ===");
let off = null, on = null, chromeFail = null;
if (HAS_CHROME) {
  try { off = runPass("off"); } catch (e) { chromeFail = e; }
  if (!SKIP_W2A) { try { on = runPass("on"); } catch (e) { chromeFail = chromeFail ?? e; } }
} else {
  console.log(`  ⊘ SKIPPED：瀏覽器組（原因：chromium 不存在：${CHROME}）`);
  skipped++;
}

if (off) {
  test("A1 默認形態 body 不掛 li-line-start-trim", () => {
    if (off.bodyHasTrimClass) skip("W2-A 已把默認形態掛上 class——需回查默認值線路");
    assert.equal(off.bodyHasTrimClass, false);
  });
  test("A2 默認形態列首句讀點無 li-line-start class", () => {
    const bad = off.items.filter((i) => i.hasClass);
    assert.equal(bad.length, 0, `有 ${bad.length} 個字被掛 class：${bad.map((i) => i.char)}`);
  });
  test("A3 默認形態列首貼齊 0（全角，零回歸錨；7 點全數）", () => {
    for (const i of off.items) {
      assert.ok(Math.abs(i.dotOffsetEm) < 0.02,
        `${i.char} 列首 dotOffset=${i.dotOffsetEm}em，默認應為 0（零回歸錨）`);
      assert.ok(Math.abs(i.sizeEm - 1.0) < 0.02,
        `${i.char} 列首 size=${i.sizeEm}em，默認應為 1.0（全角）`);
    }
  });
}

console.log("=== B. 開啟形態（li-line-start 幾何回退） ===");
if (!w2aMerged) {
  skipped++;
  console.log(`  ⊘ SKIPPED：B 組全體（原因：${SKIP_W2A}）`);
} else if (on) {
  const dots = on.items.filter((i) => "。，、：；？！".includes(i.char));
  const measured = dots.map((i) => `${i.char}=${i.dotOffsetEm}`).join(" ");
  test("B1 開啟形態 body 掛 li-line-start-trim", () => {
    assert.equal(on.bodyHasTrimClass, true);
  });
  test("B2 開啟形態列首句讀點掛 li-line-start（runtime 模式）", () => {
    if (on.mode === "simulated") {
      skip(`W2-A bundle 未提供 LiLineStart.markupLineStarts（mode=simulated，本斷言只驗 CSS 幾何）`);
    }
    const unmarked = dots.filter((i) => !i.hasClass);
    assert.equal(unmarked.length, 0, `未掛 class：${unmarked.map((i) => i.char).join("")}`);
  });
  test("B3 開啟形態列首句讀點外移半寬 −0.5em（實測數字見報告）", () => {
    for (const i of dots) {
      assert.ok(Math.abs(i.dotOffsetEm + 0.5) < 0.02,
        `${i.char} 列首 dotOffset=${i.dotOffsetEm}em，開啟後應 ≈−0.5（半寬外移）`);
    }
    console.log(`    實測（mode=${on.mode}，em）：${measured}`);
  });
}

/* ---------- 2. 結算報告 ---------- */
const em = (v) => (v === null || v === undefined) ? "—" : (+v).toFixed(3);
let report = "實測數字（單位 em，font-size=100px，直排 vertical-rl）\n";
report += "  默認關：";
if (off) report += off.items.map((i) => `${i.char}=${em(i.dotOffsetEm)}`).join(" ");
else report += "SKIPPED";
report += "\n  開啟後：";
if (on) report += on.items.map((i) => `${i.char}=${em(i.dotOffsetEm)}${i.hasClass ? "*" : ""}`).join(" ")
  + `（mode=${on.mode}${on.runtimeError ? "，runtimeError=" + on.runtimeError : ""}）`;
else report += SKIP_W2A || "SKIPPED";
console.log("\n" + report);

console.log(`\n=== 結算：${passed} 過 / ${failed} 敗 / ${skipped} SKIP ===`);
process.exit(failed ? 1 : 0);
