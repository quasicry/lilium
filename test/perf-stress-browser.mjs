// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 驅動：用真實 CM6 實例跑壓力測試，量化 v2.8.69 直排軟換行規則對「卡頓」的影響。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const BUILD = path.join(ROOT, "test", "build");
fs.mkdirSync(BUILD, { recursive: true });

// 1) esbuild 打包 CM6 入口為瀏覽器 ESM
const entry = path.join(ROOT, "test", "perf-stress-bundle.ts");
const out = path.join(BUILD, "perf-stress-bundle.mjs");
const rb = spawnSync(path.join(ROOT, "node_modules", ".bin", "esbuild"),
  [entry, "--bundle", "--format=esm", "--platform=browser", `--outfile=${out}`, "--log-level=warning"],
  { encoding: "utf8", timeout: 180000 });
if (rb.status !== 0) { console.error("esbuild 失敗\n", rb.stdout, rb.stderr); process.exit(1); }

const pw = (await import("playwright-core")).default;
const chromium = pw.chromium;
const browser = await chromium.launch({
  executablePath: process.env.LI_CHROMIUM || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
await page.addStyleTag({ content: stylesCss });
const bundleSrc = fs.readFileSync(out, "utf8");
await page.addScriptTag({ content: bundleSrc, type: "module" });
// module 腳本執行異步，輪詢確保 window.__liPerf 已掛載
await page.waitForFunction(() => typeof window.__liPerf === "object" && !!window.__liPerf, null, { timeout: 15000 });

async function runOnce(variant) {
  return await page.evaluate(async (opts) => {
    return await window.__liPerf.run(opts);
  }, { variant });
}

const A = await runOnce("active");     // v2.8.69 規則啟用（pre-wrap+anywhere+max-inline-size）
const B = await runOnce("off");        // 對照組：關閉 v2.8.69 規則（還原「吞字」原 bug）
const C = await runOnce("optimized");  // 優化變體：保留 pre-wrap+break-word+max-inline-size，去掉 anywhere

await browser.close();

const pct = (a, b) => (b === 0 ? "n/a" : ((a - b) / b * 100).toFixed(0) + "%");
const nameOf = { active: "v2.8.69 啟用", off: "對照組(關)", optimized: "優化變體(去anywhere)" };
console.log("================= 壓力測試報告（真實 CM6 實例） =================");
console.log(`文檔規模：CM6 編輯器 1500 行 × ~600 字（lineWrapping 啟用），閱讀器 60 段`);
console.log(`壓力迴圈：${A.opsTotal} 次操作（切橫直排/字號/writing-mode/分頁/每列字數/模擬PDF匯出）+ 60 次同步狂點`);
console.log(`\n--- 排版操作 layout 總成本（越低越流暢）---`);
for (const r of [A, B, C]) console.log(`  ${nameOf[r.variant].padEnd(18)}: 總 ${r.layoutTotalMs}ms / 件均 ${r.layoutAvgMs}ms`);
console.log(`  → 啟用 vs 關：${pct(A.layoutTotalMs, B.layoutTotalMs)} / 啟用 vs 優化：${pct(A.layoutTotalMs, C.layoutTotalMs)}`);
console.log(`\n--- 同步狂點阻塞（60 次連點總阻塞 ms，越低越好）---`);
for (const r of [A, B, C]) console.log(`  ${nameOf[r.variant].padEnd(18)}: ${r.syncBurstMs}ms`);
console.log(`\n--- 主線程長任務 long-task（>50ms，越少越不卡）---`);
for (const r of [A, B, C]) console.log(`  ${nameOf[r.variant].padEnd(18)}: ${r.longTasks.count} 次 / 最長 ${r.longTasks.max}ms / 累計 ${r.longTasks.sum}ms`);
console.log(`\n--- 掉幀（狂點後採樣 30 幀）---`);
for (const r of [A, B, C]) console.log(`  ${nameOf[r.variant].padEnd(18)}: 均 ${r.frames.avgMs}ms / 掉幀 ${r.frames.droppedOver20ms} / 最長 ${r.frames.max}ms`);
console.log(`\n--- 顯示正確性（靜置直排，scrollH≈容器高=無裁切）---`);
for (const r of [A, B, C]) {
  const c = r.correctness;
  console.log(`  [${nameOf[r.variant]}] cm-line=${c.cmLineCount} scrollH=${c.contentScrollHeight} 容器高=${c.contentHeight} 閱讀器可見=${c.readerVisible} 匯出高=${c.exportDocHeight} ${c.contentScrollHeight <= c.contentHeight + 5 ? "✅無裁切" : "❌溢出裁切"}`);
}
console.log("================================================");
