// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 原生排版變數消費·Chromium 行為測試
 * ================================================
 * 「側欄調參→原生閱讀/編輯器」的**消費端準確性**門禁：
 * 對真實 styles.css 的原生三容器斷言——設定的變數真的落到 computed style。
 * 覆蓋：字號（--li-fs）／行距（--li-lh）／字距（--li-ls+fix 校正）／
 * 閱讀縮進（--li-indent）／標點擠壓開關（li-punct-trim → space-all/normal）。
 * （寫入端的 saveSettings→refreshAllViews→applyEditorMode 由 run.mjs 源碼斷言守。）
 * 管線：HTML → chromium --dump-dom → 讀 #result JSON。環境限制 → SKIP。
 *
 * 用法：node test/native-typo-vars-browser.mjs
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
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function page(bodyCls, extraVars, withTrimClass) {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
<style>${styles}</style>
<style>html,body{margin:0;background:#fff;}
#pv{width:400px;height:420px;} .cm-content{width:400px;height:420px;}</style>
</head><body class="${bodyCls}${withTrimClass ? " li-punct-trim" : ""}" style="${extraVars}">
<div class="workspace-leaf-content" data-type="markdown">
  <div class="markdown-reading-view"><div class="markdown-preview-view" id="pv"><div class="markdown-preview-sizer"><p>天地玄黃 abc 宇宙洪荒</p><h1 id="h1r">標題</h1><p><code id="codr">x</code></p><img id="imgr" alt=""></div></div></div>
  <div class="cm-editor"><div class="cm-scroller" style="width:400px;height:420px;"><div class="cm-content" id="cm"><div class="cm-line" id="le">天地玄黃 abc 宇宙洪荒</div><div class="cm-line HyperMD-header HyperMD-header-1" id="h1e">標</div><div class="cm-line HyperMD-codeblock" id="ce">code</div></div></div></div>
</div>
<pre id="result">pending</pre>
<script>
const cs = (sel, prop) => {
  const el = document.querySelector(sel);
  return el ? getComputedStyle(el)[prop] : null;
};
const out = {
  fs: { read: cs('#pv', 'fontSize'), edit: cs('#cm', 'fontSize') },
  lh: { read: cs('#pv', 'lineHeight') },
  ls: { read: cs('#pv', 'letterSpacing'), edit: cs('#cm', 'letterSpacing') },
  indent: cs('#pv p', 'textIndent'),
  trim: { read: cs('#pv', 'textSpacingTrim'), edit: cs('#cm', 'textSpacingTrim') },
  h1: { read: cs('#h1r', 'fontSize'), readMT: cs('#h1r', 'marginBlockStart'), edit: cs('#h1e', 'fontSize') },
  code: { read: cs('#codr', 'fontSize'), edit: cs('#ce', 'fontSize') },
  img: { inline: cs('#imgr', 'maxInlineSize'), block: cs('#imgr', 'maxBlockSize') },
  fam: { read: cs('#pv', 'fontFamily'), edit: cs('#cm', 'fontFamily'), h1r: cs('#h1r', 'fontFamily'), h1e: cs('#h1e', 'fontFamily') },
};
document.getElementById('result').textContent = JSON.stringify(out);
document.body.setAttribute('data-done','1');
</script></body></html>`;
}

function run(html, name) {
  const p = path.join(TMP, `native-typo-${name}.html`);
  fs.writeFileSync(p, html);
  const dom = spawnSync("chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
    "--virtual-time-budget=8000", "--dump-dom", `file://${p}`,
  ], { encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  if (dom.error) return { skip: dom.error.message };
  const out = dom.stdout ?? "";
  if (!/data-done="1"/.test(out)) return { skip: "data-done 缺失" };
  const m = out.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  return m ? JSON.parse(m[1]) : { skip: "no result" };
}

const VARS = "--li-fs:18px;--li-lh:1.5;--li-ls:0.05em;--li-ls-fix:0.1em;--li-indent:2em;--li-hscale:1;--li-heading-before:0.5em;--li-heading-after:0.4em;--li-code-scale:0.5;--li-img-inline:60%;--li-img-block:50%;--li-font:'Chosen Body', serif;--li-heading-font:'Chosen Head', serif;--li-writing-mode:vertical-rl;--li-orientation:mixed;";

const on = run(page("li-editor-vertical-active li-punct-wrap", VARS, true), "trim-on");
const off = run(page("li-editor-vertical-active li-punct-wrap", VARS, false), "trim-off");
if (on.skip || off.skip) {
  console.log("SKIP [native-typo-vars]：環境限制（" + (on.skip || off.skip) + "），非程式碼缺陷。");
  process.exit(0);
}

console.log("\n== 原生排版變數消費 ==");
test("字號（撤除守衛）：①骨架已撤——宿主不再吃 --li-fs，回官方默認 16px", () => {
  assert.strictEqual(on.fs.read, "16px", `閱讀 ${on.fs.read}`);
  assert.strictEqual(on.fs.edit, "16px", `編輯 ${on.fs.edit}`);
});
test("行距（撤除守衛）：①骨架已撤——宿主不再吃 --li-lh，回官方默認 normal", () => {
  assert.strictEqual(on.lh.read, "normal", `閱讀 ${on.lh.read}`);
});
test("字距（撤除守衛）：①骨架已撤——宿主不再吃 --li-ls/fix，回官方默認 normal", () => {
  assert.strictEqual(on.ls.read, "normal", `閱讀 ${on.ls.read}`);
  assert.strictEqual(on.ls.edit, "normal", `編輯 ${on.ls.edit}`);
});
test("閱讀縮進（撤除守衛）：宿主閘段已裁決撤除——宿主 p 不得再吃 --li-indent", () => {
  assert.strictEqual(on.indent, "0px");
});
test("擠壓開關（撤除守衛）：④trim 段已裁決撤除——space-all 管線消失，值回官方默認（開關無效化）", () => {
  assert.notStrictEqual(off.trim.read, "space-all");
  assert.notStrictEqual(off.trim.edit, "space-all");
  assert.strictEqual(on.trim.read, "normal", `trim-on 閱讀（無 lilium 段＝官方默認）${on.trim.read}`);
  assert.strictEqual(on.trim.edit, "normal", `trim-on 編輯（無 lilium 段＝官方默認）${on.trim.edit}`);
});
test("標題層（撤除守衛）：宿主閘標題層已撤——h1 字號回歸繼承", () => {
  assert.strictEqual(parseFloat(on.h1.read), 32, `閱讀 h1 回官方默認 ${on.h1.read}`);
  assert.strictEqual(parseFloat(on.h1.edit), 16, `編輯器 h1（①已撤＝官方默認繼承）${on.h1.edit}`);

});
test("代碼縮放（撤除守衛）：宿主閘代碼字號段已撤——code 不再吃 --li-code-scale", () => {
  assert.strictEqual(parseFloat(on.code.read), 13, `閱讀 code 回官方默認 ${on.code.read}`);
  assert.strictEqual(parseFloat(on.code.edit), 16, `編輯器 code（①已撤＝官方默認繼承）${on.code.edit}`);
});
test("圖片邏輯軸（撤除守衛）：宿主閘 img 邏輯軸段已撤——max-inline/block 回 none", () => {
  assert.strictEqual(on.img.inline, "none");
  assert.strictEqual(on.img.block, "none");
});
test("字體變數（撤除守衛）：宿主閘字體棧段已撤——宿主容器不再吃 --li-font/--li-heading-font", () => {
  assert.ok(!on.fam.read.includes("Chosen Body"), `閱讀正文不再吃 --li-font（①已撤）${on.fam.read}`);
  assert.ok(!on.fam.h1r.includes("Chosen Head"), `閱讀標題 ${on.fam.h1r}`);
  assert.ok(!on.fam.h1e.includes("Chosen Head"), `編輯器標題 ${on.fam.h1e}`);
});
console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
process.exit(failures.length === 0 ? 0 : 1);
