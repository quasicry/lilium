// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 標題欄（inline-title）跟隨橫排／直排切換 — 真實瀏覽器實證（階段 6）。
 *
 * 需求：lilium 寫作系統橫排／直排自由切換，標題欄必須同步——
 *   直排時標題欄也直排（vertical-rl），橫排時標題欄回復橫排（horizontal-tb）。
 *
 * 本測試以 Chromium 載入真實 styles.css 與模擬的 Obsidian DOM 結構，
 * 讀取 .inline-title 的 computed writing-mode 進行斷言。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CSS = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

let pass = 0;
let fail = 0;
const ok = (m) => {
  pass++;
  console.log("  \u2713 " + m);
};
const bad = (m, e) => {
  fail++;
  console.log("  \u2717 " + m + " \u2014 " + (e?.message ?? e));
};
async function test(name, fn) {
  try {
    await fn();
  } catch (e) {
    bad(name, e);
  }
}

/** 模擬 Obsidian 筆記 DOM：body class 由 li 切換，標題為 .inline-title */
function pageHtml(bodyClass, writingModeVar) {
  const varStyle = writingModeVar
    ? `--li-editor-writing-mode:${writingModeVar};`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body class="${bodyClass}" style="${varStyle}">
  <div class="workspace-leaf-content" data-type="markdown">
    <div class="inline-title">金剛般若波羅蜜經</div>
    <div class="markdown-preview-view"><p>正文內容</p></div>
  </div>
</body></html>`;
}

const browser = await chromium.launch({
  executablePath: process.env.LI_CHROMIUM || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();

async function writingModeOf(bodyClass, wmVar) {
  await page.setContent(pageHtml(bodyClass, wmVar), { waitUntil: "load" });
  return page.$eval(".inline-title", (el) => {
    const cs = getComputedStyle(el);
    return { writingMode: cs.writingMode, textOrientation: cs.textOrientation };
  });
}

console.log("\n[title-orientation] 標題欄跟隨橫排／直排切換（Chromium 實證）");

await test("直排模式：inline-title writing-mode = vertical-rl", async () => {
  const r = await writingModeOf("li-editor-vertical-active", "vertical-rl");
  assert.strictEqual(r.writingMode, "vertical-rl", `實得 ${r.writingMode}`);
  ok("直排：標題欄 writing-mode=vertical-rl（標題欄跟著直排 ✅）");
});

await test("橫排模式：inline-title writing-mode = horizontal-tb", async () => {
  const r = await writingModeOf("li-editor-horizontal-active", "horizontal-tb");
  assert.strictEqual(r.writingMode, "horizontal-tb", `實得 ${r.writingMode}`);
  ok("橫排：標題欄 writing-mode=horizontal-tb（標題欄跟著橫排 ✅）");
});

await test("直排模式下遇到橫排文種（如阿拉伯文）：標題欄回復 horizontal-tb", async () => {
  // lilium 在直排開啓、但當前文種 writingMode 為 horizontal-tb 時，
  // body 同時帶 vertical-active 與 horizontal-active，此時應以 horizontal 為準
  const r = await writingModeOf(
    "li-editor-vertical-active li-editor-horizontal-active",
    "horizontal-tb"
  );
  assert.strictEqual(r.writingMode, "horizontal-tb", `實得 ${r.writingMode}`);
  ok("直排+橫排文種：標題欄正確回復 horizontal-tb（不誤直排 ✅）");
});

await test("兩個 class 都不存在（關閉直排編輯）：標題欄維持瀏覽器默認橫排", async () => {
  const r = await writingModeOf("", "vertical-rl");
  assert.strictEqual(r.writingMode, "horizontal-tb", `實得 ${r.writingMode}`);
  ok("未啓用：標題欄維持 horizontal-tb，不受殘留變數影響 ✅");
});

await test("text-orientation：直排時為 mixed（漢字正立、拉丁側臥）", async () => {
  const r = await writingModeOf("li-editor-vertical-active", "vertical-rl");
  // --li-editor-orientation 未在 style 中給出，應回退 CSS 默認值
  assert.ok(
    ["mixed", "upright"].includes(r.textOrientation),
    `實得 ${r.textOrientation}`
  );
  ok(`直排：text-orientation=${r.textOrientation}（漢字正立 ✅）`);
});

await test("CJK 文種（vertical-rl）：標題欄右起（自右往左換列）", async () => {
  // .inline-title 讀取 --li-editor-writing-mode；CJK 文種由 applyEditorMode 注入 vertical-rl
  const r = await writingModeOf("li-editor-vertical-active", "vertical-rl");
  assert.strictEqual(r.writingMode, "vertical-rl", `實得 ${r.writingMode}`);
  ok("CJK：標題欄 = vertical-rl（右起 ✅ 符合「從右往左寫」）");
});

await test("蒙古文文種（vertical-lr）：標題欄左起（自左往右換列）", async () => {
  // 蒙古 / 滿 / 回鶻文種由 applyEditorMode 注入 vertical-lr（與 CJK 相反方向）
  const r = await writingModeOf("li-editor-vertical-active", "vertical-lr");
  assert.strictEqual(r.writingMode, "vertical-lr", `實得 ${r.writingMode}`);
  ok("蒙古文：標題欄 = vertical-lr（左起 ✅ 符合「從左往右寫」）");
});

await browser.close();

console.log(`\n[title-orientation] 結果：${pass} 通過 / ${fail} 失敗`);
if (fail > 0) {
  console.log("[title-orientation] \u274c 有失敗");
  process.exit(1);
}
console.log("[title-orientation] 全部通過 \u2705");
