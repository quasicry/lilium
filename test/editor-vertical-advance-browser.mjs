// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 原生編輯器·直排步進校正 Chromium 行為測試（v2.8.31 / 折疊字體防重疊）
 * =================================================================
 * 背景：使用者回報「原生編輯器中粘貼文字直接重疊在原文字上」。
 * 根因型態之一：字體在 Chromium 直排下量得步進為 0（實測 WenQuanYi Zen Hei），
 * 整串字疊在同一點；li 以 --li-ls-fix（→ letter-spacing: calc(--li-ls + fix)）
 * 補回標準 1em 節距（管線：font-metrics 量測 → main.applyNativeFontFit → CSS calc）。
 *
 * 本測試**直接載入倉庫真實 styles.css**（不是複製品），以真實 DOM 結構
 * （.workspace-leaf-content > .cm-editor > .cm-scroller > .cm-content）驗證：
 *   A 折疊字體 + fix=1em  → 逐字步進 ≈ 1em（32px），重疊解除；
 *   B 折疊字體 + fix=0em  → 步進 ≈ 0（重疊症狀復現——本修復要消滅的型態）；
 *   C fix 與使用者字距疊加 → calc(0.04em + 1em) = 33.28px 精確解析。
 *
 * 管線（仿 test/hanging-browser.mjs）：自包含 HTML → chromium --headless --dump-dom
 * → 解析 JSON 結果斷言。環境限制（無 chromium / 頁面未跑完 data-done）→ SKIP（exit 0）；
 * 字體缺失（WenQuanYi 不在系統）→ 僅跳過 A/B 字體斷言，C 仍驗（字距屬 CSS 層不受字體影響）。
 *
 * 用法：node test/editor-vertical-advance-browser.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

/* ---------- 1. 倉庫真實 styles.css + 自包含 HTML ---------- */
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const CHARS = "天地玄黃宇宙洪荒";
const spans = [...CHARS].map((c) => `<span>${c}</span>`).join("");

const shell = (id, extraVars) => `
<div class="workspace-leaf-content fx" id="${id}" data-type="markdown" style="${extraVars}">
  <div class="cm-editor"><div class="cm-scroller"><div class="cm-content" style="font-family:'WenQuanYi Zen Hei';">${spans}</div></div></div>
</div>`;

const DRIVER = `
const res = { fontOk: document.fonts.check('32px "WenQuanYi Zen Hei"', '永'), ls: {}, deltas: {} };
function probe(id) {
  const csEl = document.querySelector('#' + id + ' .cm-content');
  res.ls[id] = getComputedStyle(csEl).letterSpacing;
  const tops = [...csEl.querySelectorAll('span')].map((s) => s.getBoundingClientRect().top);
  res.deltas[id] = tops.slice(1).map((t, i) => Math.round((t - tops[i]) * 100) / 100);
}
probe('a'); probe('b'); probe('c');
document.getElementById('result').textContent = JSON.stringify(res);
document.body.setAttribute('data-done', '1');
`;

const htmlPath = path.join(TMP, "editor-vertical-advance.html");
fs.writeFileSync(
  htmlPath,
  `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><title>editor-vertical-advance</title>
<style>
${styles}
</style>
<style>
html, body { margin: 0; background: #fff; }
.fx { height: 620px; width: 160px; display: inline-block; vertical-align: top; }
</style></head>
<body class="li-editor-vertical-active" style="--li-fs:32px; --li-writing-mode:vertical-rl; --li-orientation:mixed; --li-vert:'vert' 1;">
${shell("a", "--li-ls:0em; --li-ls-fix:1em;")}
${shell("b", "--li-ls:0em; --li-ls-fix:0em;")}
${shell("c", "--li-ls:0.04em; --li-ls-fix:1em;")}
<pre id="result">pending</pre>
<script>${DRIVER.replace(/<\/script/gi, "<\\/script")}</script>
</body></html>`
);

/* ---------- 2. chromium headless --dump-dom ---------- */
const dom = spawnSync(
  "chromium",
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--window-size=1300,900",
    "--virtual-time-budget=15000",
    "--dump-dom",
    `file://${htmlPath}`,
  ],
  { encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024 }
);
if (dom.error) {
  console.log("SKIP [editor-vertical-advance]：chromium 啟動失敗（" + dom.error.message + "），環境限制非程式碼缺陷。");
  process.exit(0);
}
const out = dom.stdout ?? "";
if (!/<body[^>]*data-done="1"/.test(out)) {
  console.log("SKIP [editor-vertical-advance]：頁面未完整跑完（data-done 缺失），環境限制非程式碼缺陷。");
  process.exit(0);
}
const m = out.match(/<pre id="result">([\s\S]*?)<\/pre>/);
assert.ok(m, "找不到 result 區塊");
const res = JSON.parse(m[1]);

/* ---------- 3. 斷言 ---------- */
console.log("\n== 原生編輯器直排步進校正 ==");

test("C calc 疊加：fix 與使用者字距求精確和（calc(0.04em + 1em) = 33.28px）", () => {
  const ls = parseFloat(res.ls.c);
  assert.ok(Math.abs(ls - 33.28) < 0.5, `實得 letter-spacing=${res.ls.c}`);
  for (const d of res.deltas.c) {
    assert.ok(Math.abs(d - 33.28) < 1.0, `逐字步進應≈33.28px，實得 ${d}`);
  }
});

if (!res.fontOk) {
  console.log("SKIP [editor-vertical-advance]：系統無 WenQuanYi Zen Hei，跳過折疊字體 A/B 斷言（環境限制非程式碼缺陷）。");
} else {
  test("B 疊步進症狀復現：fix=0 時步進≈0（8 字疊在同一點——本修復要消滅的型態）", () => {
    for (const d of res.deltas.b) {
      assert.ok(Math.abs(d) < 2, `fix=0 折疊字體步進應≈0，實得 ${d}`);
    }
  });
  test("A 修復生效：fix=1em 時逐字步進≈1em（32px），重疊解除", () => {
    const ls = parseFloat(res.ls.a);
    assert.ok(Math.abs(ls - 32) < 0.5, `實得 letter-spacing=${res.ls.a}`);
    assert.strictEqual(res.deltas.a.length, CHARS.length - 1, "應量到 7 個步進");
    for (const d of res.deltas.a) {
      assert.ok(Math.abs(d - 32) < 1.5, `逐字步進應≈32px，實得 ${d}`);
    }
  });
}

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
process.exit(failures.length === 0 ? 0 : 1);
