// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* leaf 級排版隔離（leaf-gate）退役鎖定
 * =================================================================
 * 背景：上游曾以 src/leaf-gate.ts（leafGateHasClass +
 * data-li-leaf-typeset 標記）做多分割窗的 leaf 級排版狀態隔離，
 * 本測試原以 esbuild 打包該模組進真實 Chromium 驗證方向／字體／
 * class 判定互不污染。lilium 範圍裁撤時 leaf-gate 模組已自 src/
 * 移除（直排排版面整體退役，見 test/smoke-linux.mjs 直排七命令
 * 的撤除鎖定），打包入口消失，本測試隨之改為撤除鎖定（與
 * test/char-table-gate.mjs「view.ts 不應回到 src/」同款）：
 *
 *   A. src/leaf-gate.ts 不應存在（模組已退役，復活＝還原歷史）；
 *   B. src/ 運行時面不得殘留 leafGateHasClass / data-li-leaf-typeset；
 *   C. 打包入口（esbuild.config.mjs）不得再引用 leaf-gate。
 *
 * 若日後以其他機制重建 leaf 級隔離，請新增行為測試並撤下本鎖。
 * 執行：node test/leaf-scope-browser.mjs（純 Node，不需瀏覽器）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log("== leaf-gate 退役鎖定（leaf 級排版隔離已撤除）==");

/** 剝掉註解——撤除說明會提到已移除的符號，鎖定只看程式碼本身。 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("A. src/leaf-gate.ts 不應存在（leaf 級排版隔離模組已退役）", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "src", "leaf-gate.ts")),
    "src/leaf-gate.ts 復活——leaf 級排版隔離已隨直排排版面退役，恢復＝還原 main.ts 歷史");
});

test("B. src/ 運行時面不得殘留 leafGateHasClass／data-li-leaf-typeset", () => {
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!/\.ts$/.test(ent.name)) continue;
      const src = stripComments(fs.readFileSync(p, "utf8"));
      assert.ok(!/leafGateHasClass|data-li-leaf-typeset/.test(src),
        `${path.relative(ROOT, p)} 殘留 leaf-gate 接口——模組已撤除，接口一併清空`);
    }
  };
  walk(path.join(ROOT, "src"));
});

test("C. 打包入口不得再引用 leaf-gate", () => {
  const cfg = stripComments(fs.readFileSync(path.join(ROOT, "esbuild.config.mjs"), "utf8"));
  assert.ok(!/leaf-gate/.test(cfg), "esbuild.config.mjs 仍引用 leaf-gate——打包入口應隨模組退役移除");
});

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
process.exit(failures.length === 0 ? 0 : 1);
