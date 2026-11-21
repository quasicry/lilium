// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 原生編輯器·直排錨定門禁·Chromium 測試（v2.8.67 回歸門禁）
 * ===============================================================
 * 背景：使用者回報「原生編輯器直排時標題與正文居中，且只顯示幾列、後面文字看不見」。
 * 根因：本插件直排從未顯式鎖定 .cm-scroller 的 align-items，依賴 CM6 baseTheme 的
 *   flex-start；一旦宿主 Obsidian／CM6／主題把它改成 center／stretch，內容被居中、
 *   兩端溢出遭裁切（即所見「居中＋吞字」）。v2.8.67 顯式收口
 *   align-items:flex-start !important（高特異性選擇器），與 CM6 同值、零回歸，
 *   且「起始邊錨定」是邏輯值：vertical-rl→錨右、vertical-lr→錨左，自動跟隨書寫方向。
 *
 * 本門禁直接載入倉庫真實 styles.css，並在「宿主把 .cm-scroller 改成 center」的
 * 敵對條件下，仍斷言：
 *   T1 vertical-rl + 宿主 center → 錨右（rightGap≈0，未居中）
 *   T2 vertical-lr + 宿主 center → 錨左（leftGap≈0，未居中）
 *   T3 vertical-rl + 標準宿主     → 錨右（基線不回歸）
 * 去掉 v2.8.67 的 fix 後，T1/T2 會因宿主 center 取勝而居中 → 本門禁轉紅，
 * 故它真能鎖住修復必要性。
 *
 * 管線：自包含 HTML → chromium --headless --dump-dom → 解析 JSON 結果斷言。
 * 環境限制（無 chromium / 頁面未跑完 data-done）→ SKIP（exit 0）。
 * 用法：node test/editor-vertical-anchor-browser.mjs
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

/* ---------- 1. 倉庫真實 styles.css + CM6 baseTheme（模擬真實 Obsidian） ---------- */
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const cmBase = `
.cm-editor { display:flex !important; flex-direction:column; position:relative; box-sizing:border-box; }
.cm-editor .cm-scroller { display:flex !important; align-items:flex-start !important; font-family:monospace; line-height:1.4; height:100%; overflow-x:auto; position:relative; z-index:0; overflow-anchor:none; flex:1 1 auto; }
.cm-editor .cm-scroller .cm-content { margin:0; flex-grow:2; flex-shrink:0; display:block; white-space:pre; word-wrap:normal; box-sizing:border-box; min-height:100%; padding:4px 0; outline:none; }
.cm-editor .cm-scroller .cm-line { display:block; padding:0 2px 0 6px; }
`;
/* 敵對宿主：主題把 .cm-scroller 改成居中（特異性低於插件 fix，故 fix 應取勝）。 */
const hostCenter = `.host-center .cm-editor .cm-scroller { align-items:center !important; }`;
/* ①骨架撤除後，宿主直排錨定 fix 由 lilith 供養（同款規則 lilith styles.css L1045）——
   測試環境注入同款規則模擬真實生態（宿主直排= lilith 職責域），對抗居中語義不變。 */
const lilithAnchorFix = `body.li-editor-vertical-active .workspace-leaf-content[data-type="markdown"] .cm-scroller { align-items: flex-start !important; }`;

const para = "天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈剑号巨阙珠称夜光。";
const paras = Array.from({ length: 12 }, (_, i) => `<p>第${i + 1}段：${para}</p>`).join("");
const docHtml = `<h1>标题一</h1><h2>标题二</h2>${paras}<h1>标题三</h1><p>${para}</p>`;

function leaf(id, wm, hostCenterOn) {
  return `
<div class="workspace-leaf-content ${hostCenterOn ? "host-center" : ""}" id="${id}" data-type="markdown" style="--li-writing-mode:${wm};writing-mode:${wm};height:600px;width:420px;display:block;overflow:hidden;background:#fff;border:1px solid #999;">
  <div class="cm-editor" style="height:600px;width:420px;writing-mode:${wm};"><div class="cm-scroller" style="writing-mode:${wm};">
    <div class="cm-sizer"><div class="cm-content" style="writing-mode:${wm};">${docHtml}</div></div>
  </div></div>
</div>`;
}

const DRIVER = `
function R(el){const r=el.getBoundingClientRect();return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height)};}
function probe(id){
  const sc=document.querySelector('#'+id+' .cm-scroller'); const ct=document.querySelector('#'+id+' .cm-content');
  const scs=getComputedStyle(sc), cts=getComputedStyle(ct);
  const scR=R(sc), ctR=R(ct);
  return {
    wm: cts.writingMode, align: scs.alignItems,
    scrollerW: sc.clientWidth, contentW: ctR.w,
    rightGap: scR.right - ctR.right, leftGap: ctR.left - scR.left,
    centerOff: Math.round((scR.left+scR.right)/2 - (ctR.left+ctR.right)/2),
  };
}
const res={ t1:probe('t1'), t2:probe('t2'), t3:probe('t3') };
document.getElementById('result').textContent=JSON.stringify(res);
document.body.setAttribute('data-done','1');
`;

const html = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><title>editor-vertical-anchor</title>
<style>${cmBase}</style>
<style>${styles}</style>
<style>${hostCenter}</style>
<style>${lilithAnchorFix}</style>
<style>html,body{margin:0;background:#ccc;}</style></head>
<body class="li-editor-vertical-active" style="--li-fs:22px; --li-orientation:mixed; --li-vert:'vert' 1; --li-textalign:start;">
${leaf("t1", "vertical-rl", true)}
${leaf("t2", "vertical-lr", true)}
${leaf("t3", "vertical-rl", false)}
<pre id="result">pending</pre>
<script>${DRIVER.replace(/<\/script/gi, "<\\/script")}</script>
</body></html>`;

const htmlPath = path.join(TMP, "editor-vertical-anchor.html");
fs.writeFileSync(htmlPath, html);

/* ---------- 2. chromium headless --dump-dom ---------- */
const dom = spawnSync(
  "chromium",
  [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--hide-scrollbars", "--window-size=1400,1000", "--virtual-time-budget=15000",
    "--dump-dom", `file://${htmlPath}`,
  ],
  { encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 }
);
if (dom.error) {
  console.log("SKIP [editor-vertical-anchor]：chromium 啟動失敗（" + dom.error.message + "），環境限制非程式碼缺陷。");
  process.exit(0);
}
const out = dom.stdout ?? "";
if (!/<body[^>]*data-done="1"/.test(out)) {
  console.log("SKIP [editor-vertical-anchor]：頁面未完整跑完（data-done 缺失），環境限制非程式碼缺陷。");
  process.exit(0);
}
const m = out.match(/<pre id="result">([\s\S]*?)<\/pre>/);
assert.ok(m, "找不到 result 區塊");
const res = JSON.parse(m[1]);

/* 內容可能比視口寬（溢出）：非錨定側 gap 為負屬正常。
   錨右信號：內容右緣貼近容器右緣（rightGap≈0，與 leftGap 符號無關）。
   錨左信號：內容左緣貼近容器左緣（leftGap≈0）。
   居中信號：centerOff≈0 且 rightGap≈leftGap（兩端對稱溢出）。 */
const hugRight = (g) => g.rightGap >= -10 && g.rightGap <= 45;
const hugLeft = (g) => g.leftGap >= -10 && g.leftGap <= 45;
const centered = (g) => Math.abs(g.centerOff) <= 15 && Math.abs(g.rightGap - g.leftGap) <= 30;

/* ---------- 3. 斷言 ---------- */
console.log("\n== 原生編輯器直排錨定（v2.8.67 回歸門禁）==");

test("T1 vertical-rl + 宿主 center → 仍錨右（未居中）", () => {
  assert.strictEqual(res.t1.wm, "vertical-rl", `書寫模式應 vertical-rl，實得 ${res.t1.wm}`);
  assert.ok(hugRight(res.t1), `應錨右：rightGap=${res.t1.rightGap} leftGap=${res.t1.leftGap}`);
  assert.ok(!centered(res.t1), `不應居中：centerOff=${res.t1.centerOff} rightGap=${res.t1.rightGap} leftGap=${res.t1.leftGap}`);
});

test("T2 vertical-lr + 宿主 center → 仍錨左（未居中，跟隨書寫方向）", () => {
  assert.strictEqual(res.t2.wm, "vertical-lr", `書寫模式應 vertical-lr，實得 ${res.t2.wm}`);
  assert.ok(hugLeft(res.t2), `應錨左：leftGap=${res.t2.leftGap} rightGap=${res.t2.rightGap}`);
  assert.ok(!centered(res.t2), `不應居中：centerOff=${res.t2.centerOff} leftGap=${res.t2.leftGap} rightGap=${res.t2.rightGap}`);
});

test("T3 vertical-rl + 標準宿主 → 錨右（基線不回歸）", () => {
  assert.strictEqual(res.t3.wm, "vertical-rl", `書寫模式應 vertical-rl，實得 ${res.t3.wm}`);
  assert.ok(hugRight(res.t3), `應錨右：rightGap=${res.t3.rightGap} leftGap=${res.t3.leftGap}`);
  assert.ok(!centered(res.t3), `不應居中：centerOff=${res.t3.centerOff}`);
});

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
process.exit(failures.length === 0 ? 0 : 1);
