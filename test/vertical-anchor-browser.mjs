// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 直排座標服務 —— 真瀏覽器端到端驗證（階段 3）。
 *
 * 目的：在真實 Chromium 布局下驗證 UD 打過補丁的 HoverLookupController
 *       （scripts/patch-ud-hover-lookup.py）能正確處理直排彈窗定位。
 *
 * 單元測試（test/vertical-anchor.mjs）用 mock DOM，無法覆蓋：
 *   - 真實 getComputedStyle 的 writing-mode 繼承行為
 *   - 真實 range.getClientRects() 在直排下回傳的窄高矩形
 *   - position:fixed + writing-mode 交互下的實際像素
 *
 * 執行：node test/vertical-anchor-browser.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

/* ── 0. 前置：在 UD 源碼副本上套用座標服務補丁 ────────────────── */
const UD_ROOT = process.env.UD_ROOT || "/workspace/ud-source/extracted/01-插件/universal-dictionary-source";
if (!fs.existsSync(path.join(UD_ROOT, "src", "hover-lookup.ts"))) {
  console.error(`[跳過] 找不到 UD 源碼：${UD_ROOT}（設 UD_ROOT 環境變數指定）`);
  process.exit(0);
}
console.log("[setup] 套用座標服務補丁…");
execFileSync("python3", [
  path.join(ROOT, "scripts", "patch-ud-hover-lookup.py"),
  "--ud-root", UD_ROOT,
], { stdio: "pipe" });

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-vanchor-dom-"));

/* ── 1. 打包 UD 的 HoverLookupController 為 IIFE ───────────────── */
console.log("[setup] bundling patched HoverLookupController…");
const entry = path.join(TMP, "entry.ts");
fs.writeFileSync(entry, `
import { HoverLookupController } from ${JSON.stringify(path.join(UD_ROOT, "src", "hover-lookup.ts").replace(/\\\\/g, "/"))};
import { observeWritingModeChanges } from ${JSON.stringify(path.join(UD_ROOT, "src", "vertical-anchor.ts").replace(/\\\\/g, "/"))};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;
w.HoverLookupController = HoverLookupController;

/** 真實路徑控制器：由真實滑鼠事件驅動（triggerAt 全鏈路，含 watcher 註冊） */
const live = new HoverLookupController({
  enabled: true, trigger: 'ctrl', maxWordLength: 50,
  onLookup: (word: string, handle: { setBody: (h: string) => void }) =>
    handle.setBody('<div>釋義：' + word + '</div>'),
});
live.attach(document);
w.__liLive = live;

/** 讀取 live 控制器目前的彈窗狀態 */
w.__liLiveState = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = (live as any).popupEl as HTMLElement | null;
  if (!el) return { gone: true, placement: null, left: 0, top: 0, visibility: '' };
  const r = el.getBoundingClientRect();
  return {
    gone: false,
    placement: (el as HTMLElement & { dataset: DOMStringMap }).dataset.placement || null,
    left: r.left, top: r.top, right: r.right, bottom: r.bottom,
    visibility: el.style.visibility,
    word: (live as any).currentWord,
  };
};

/** 模擬 li 切換直排／橫排（真實機制：body 類 + CSS 變數 + 容器 writing-mode） */
w.__liSetVertical = (v: boolean, stageId?: string) => {
  const b = document.body;
  b.classList.toggle('li-editor-vertical-active', v);
  b.classList.toggle('li-editor-horizontal-active', !v);
  b.style.setProperty('--li-editor-writing-mode', v ? 'vertical-rl' : 'horizontal-tb');
  const st = stageId ? document.getElementById(stageId) : null;
  if (st) st.style.writingMode = v ? 'vertical-rl' : 'horizontal-tb';
};

/** 移除詞元素並動一下 body 類（模擬切換筆記／重渲染後 DOM 重建） */
w.__liDropWord = (wid: string) => {
  const el = document.getElementById(wid);
  if (el) el.remove();
  const b = document.body;
  b.classList.add('li-render-tick');
  b.classList.remove('li-render-tick');
};

/** 測試探針：在指定詞上觸發一次定位並量測結果（繞過 450ms hover 延遲） */
w.__liPlace = (wid: string, sid: string) => {
  const wordEl = document.getElementById(wid) as HTMLElement;
  const stageEl = document.getElementById(sid) as HTMLElement;
  const wr = wordEl.getBoundingClientRect();
  const sr = stageEl.getBoundingClientRect();
  const ctrl = new HoverLookupController({
    enabled: true, trigger: 'ctrl', maxWordLength: 50,
    onLookup: () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  ctrl.attach(document);
  ctrl.anchorRect = { left: wr.left, right: wr.right, top: wr.top, bottom: wr.bottom, width: wr.width, height: wr.height };
  ctrl.anchorEl = wordEl;
  // 模擬 triggerAt 中的註冊（真實路徑見 __liLive）
  ctrl.layoutWatcher = observeWritingModeChanges(wordEl, () => ctrl.position());
  ctrl.setBodyHtml('<div>釋義</div>');
  const el = ctrl.popupEl as HTMLElement;
  const pr = el.getBoundingClientRect();
  const out = {
    word: { left: wr.left, right: wr.right, top: wr.top, bottom: wr.bottom, width: wr.width, height: wr.height },
    stage: { left: sr.left, right: sr.right, top: sr.top, bottom: sr.bottom },
    popup: { left: pr.left, right: pr.right, top: pr.top, bottom: pr.bottom, width: pr.width, height: pr.height },
    placement: (el as HTMLElement & { dataset: DOMStringMap }).dataset.placement,
    styleLeft: el.style.left, styleTop: el.style.top,
    visibility: el.style.visibility,
  };
  ctrl.detach();
  return out;
};
`, "utf8");
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  entry, "--bundle", "--format=iife",
  `--outfile=${path.join(TMP, "hl.js")}`, "--log-level=silent",
]);
const HL_JS = fs.readFileSync(path.join(TMP, "hl.js"), "utf8");

/* ── 2. 測試頁面 ──────────────────────────────────────────────── */
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:1200px;height:800px;overflow:hidden}
  .li-hover-popup{position:fixed;width:300px;height:80px;background:#fff;
    border:1px solid #333;z-index:9999;box-sizing:border-box}
  .li-hover-body{font:14px/1.4 sans-serif;padding:4px}
  .stage{position:absolute;top:80px;font:20px/1.6 serif}
  #s-h  {left:200px;writing-mode:horizontal-tb;width:300px}
  #s-vrl{right:120px;writing-mode:vertical-rl;height:520px}
  #s-vlr{left:200px; writing-mode:vertical-lr;height:520px}
  #s-main{left:560px;height:520px;writing-mode:vertical-rl;border-left:1px dashed #ccc}
  .tgt{background:#ff0}
</style></head><body>
  <div class="stage" id="s-h">前面文字 <span class="tgt" id="w-h">詞語</span> 後面文字</div>
  <div class="stage" id="s-vrl">前面文字<span class="tgt" id="w-vrl">詞語測試</span>後面文字</div>
  <div class="stage" id="s-vlr">前面文字<span class="tgt" id="w-vlr">詞語測試</span>後面文字</div>
  <div class="stage" id="s-main">前面文字<span class="tgt" id="w-main">詞語測試</span>後面文字</div>
</body></html>`;
fs.writeFileSync(path.join(TMP, "page.html"), HTML, "utf8");

/* ── 3. 啟動 Chromium ─────────────────────────────────────────── */
const { chromium } = require("playwright-core");
const EXE = process.env.CHROMIUM || "/usr/bin/chromium";
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.setContent(HTML, { waitUntil: "load" });
await page.addScriptTag({ content: HL_JS });

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/** 在指定詞上觸發一次彈窗定位，回傳 { word, stage, popup, placement } */
function place(wordId, stageId) {
  return page.evaluate(
    ([wid, sid]) => window.__liPlace(wid, sid),
    [wordId, stageId]
  );
}

/* ── 4. 驗證 ──────────────────────────────────────────────────── */
console.log("\n【A】橫排基線（行為不得回歸）");
let h;
await test("橫排：彈窗置於詞的下方，左緣對齊詞左緣", async () => {
  h = await place("w-h", "s-h");
  assert.strictEqual(h.placement, "below", `placement=${h.placement}`);
  assert.strictEqual(h.popup.left, h.word.left, `left ${h.popup.left} vs 詞 ${h.word.left}`);
  assert.ok(h.popup.top >= h.word.bottom, `top ${h.popup.top} 應在詞底 ${h.word.bottom} 之下`);
  assert.strictEqual(h.visibility, "visible", "定位後應可見");
});

console.log("\n【B】直排 vertical-rl（核心新增能力）");
let vrl;
await test("直排 rl：詞為窄高矩形（前置條件成立）", async () => {
  vrl = await place("w-vrl", "s-vrl");
  // 直排下 4 字詞約 22×80；閾值取 1.5 倍足以區分於橫排的寬扁矩形
  assert.ok(vrl.word.height > vrl.word.width * 1.5,
    `詞應為窄高：${vrl.word.width.toFixed(1)}×${vrl.word.height.toFixed(1)}`);
  // 對照：橫排詞應是寬扁的
  assert.ok(h.word.width > h.word.height * 1.5,
    `橫排詞應為寬扁：${h.word.width.toFixed(1)}×${h.word.height.toFixed(1)}`);
});

await test("直排 rl：彈窗置於詞的左側（換列方向側）", async () => {
  assert.strictEqual(vrl.placement, "left", `placement=${vrl.placement}`);
  assert.ok(vrl.popup.right <= vrl.word.left,
    `彈窗右緣 ${vrl.popup.right.toFixed(1)} 應 ≤ 詞左緣 ${vrl.word.left.toFixed(1)}`);
});

await test("直排 rl：彈窗不遮擋本列後續文字（水平錯開）", async () => {
  // 本列後續文字與詞同一 x 區間、y 在詞之下
  const overlapsColumn = vrl.popup.right > vrl.word.left && vrl.popup.left < vrl.word.right;
  assert.ok(!overlapsColumn,
    `彈窗水平區間 [${vrl.popup.left.toFixed(1)}, ${vrl.popup.right.toFixed(1)}] 不應與詞 [${vrl.word.left.toFixed(1)}, ${vrl.word.right.toFixed(1)}] 重疊`);
});

await test("直排 rl：垂直方向對齊錨點頂部", async () => {
  assert.strictEqual(vrl.popup.top, vrl.word.top,
    `top ${vrl.popup.top} 應等於詞頂 ${vrl.word.top}`);
});

console.log("\n【C】直排 vertical-lr");
let vlr;
await test("直排 lr：彈窗置於詞的右側", async () => {
  vlr = await place("w-vlr", "s-vlr");
  assert.strictEqual(vlr.placement, "right", `placement=${vlr.placement}`);
  assert.ok(vlr.popup.left >= vlr.word.right,
    `彈窗左緣 ${vlr.popup.left.toFixed(1)} 應 ≥ 詞右緣 ${vlr.word.right.toFixed(1)}`);
});

console.log("\n【D】邊界安全");
await test("三種情境下彈窗皆完整落在視口內", async () => {
  for (const [name, r] of [["橫排", h], ["直排rl", vrl], ["直排lr", vlr]]) {
    assert.ok(r.popup.left >= 0, `${name} 左越界：${r.popup.left}`);
    assert.ok(r.popup.top >= 0, `${name} 上越界：${r.popup.top}`);
    assert.ok(r.popup.right <= 1200, `${name} 右越界：${r.popup.right}`);
    assert.ok(r.popup.bottom <= 800, `${name} 下越界：${r.popup.bottom}`);
  }
});

await test("直排與橫排的 placement 不同（證明上下文判定生效）", async () => {
  assert.strictEqual(h.placement, "below");
  assert.strictEqual(vrl.placement, "left");
  assert.strictEqual(vlr.placement, "right");
  assert.notStrictEqual(h.placement, vrl.placement, "直排不應退化為橫排行為");
});

console.log("\n【E】直排↔橫排切換後的狀態一致性（li 兩種排版皆可寫）");

/** 在 #w-main 上走真實 hover 鏈路（ctrl + mousemove → 450ms → triggerAt） */
async function realHover() {
  const box = await page.locator("#w-main").boundingBox();
  if (!box) throw new Error("找不到 #w-main");
  await page.keyboard.down("Control");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800); // 450ms hover 延遲 + lookup + rAF
  await page.keyboard.up("Control");
  return page.evaluate(() => window.__liLiveState());
}
const setVertical = (v) => page.evaluate((x) => window.__liSetVertical(x, "s-main"), v);
const liveState = () => page.evaluate(() => window.__liLiveState());

let e1;
await test("真實 hover（直排）：彈窗出現在換列方向側", async () => {
  await setVertical(true);
  await page.waitForTimeout(50);
  e1 = await realHover();
  assert.ok(!e1.gone, "彈窗應已建立");
  assert.strictEqual(e1.placement, "left", `placement=${e1.placement}（詞=${e1.word}）`);
});

await test("切換到橫排後：彈窗自動重定位為 below（無需重新 hover）", async () => {
  await setVertical(false);
  await page.waitForTimeout(250); // MutationObserver → rAF → position()
  const s = await liveState();
  assert.strictEqual(s.placement, "below", `切換後 placement=${s.placement}`);
  assert.ok(s.top > 0 && s.left > 0, "仍應有有效座標");
});

await test("切換回直排：彈窗回到 left（雙向都對）", async () => {
  await setVertical(true);
  await page.waitForTimeout(250);
  const s = await liveState();
  assert.strictEqual(s.placement, "left", `切回直排 placement=${s.placement}`);
});

await test("切換後使用新量測的矩形，而非快取的舊值", async () => {
  await setVertical(false);
  await page.waitForTimeout(250);
  const st = await liveState();
  const wordRect = await page.evaluate(() => {
    const r = document.getElementById("w-main").getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  // 橫排：彈窗應落在詞的下方（top ≥ 詞底）且左緣對齊詞左緣
  assert.ok(st.top >= wordRect.bottom - 1,
    `彈窗 top=${st.top.toFixed(1)} 應 ≥ 詞底 ${wordRect.bottom.toFixed(1)}`);
  assert.ok(Math.abs(st.left - wordRect.left) <= 1.5,
    `彈窗 left=${st.left.toFixed(1)} 應對齊詞左緣 ${wordRect.left.toFixed(1)}`);
});

await test("切換後彈窗仍在視口內（不飛出）", async () => {
  const s = await liveState();
  assert.ok(s.left >= 0 && s.top >= 0, `左上越界 (${s.left}, ${s.top})`);
  assert.ok(s.right <= 1200 && s.bottom <= 800, `右下越界 (${s.right}, ${s.bottom})`);
});

await test("詞元素被移除（切換筆記／重渲染）→ 彈窗隱藏而非錯位", async () => {
  await setVertical(true);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__liDropWord("w-main"));
  await page.waitForTimeout(250);
  const s = await liveState();
  assert.ok(s.gone || s.visibility === "hidden",
    `錨點失效後應隱藏；實得 gone=${s.gone} visibility=${s.visibility}`);
});

await test("狀態不殘留：失效後再切換也不會復活彈窗", async () => {
  await setVertical(false);
  await page.waitForTimeout(200);
  const s = await liveState();
  assert.ok(s.gone || s.visibility === "hidden", "失效彈窗不應被切換復活");
});

await page.screenshot({ path: path.join(TMP, "vertical-popup.png") });
await browser.close();

console.log(`\n${"─".repeat(56)}`);
console.log(`直排座標服務（真瀏覽器）：${passed} 通過，${failed} 失敗`);
console.log(`截圖：${path.join(TMP, "vertical-popup.png")}`);
if (failed > 0) process.exit(1);
