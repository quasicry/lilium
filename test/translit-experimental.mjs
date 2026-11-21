// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 多文種轉寫方案「實驗性功能 + 檢字表語言選擇」資料契約測試。
 *
 * 背景：曾經將轉寫方案列為實驗性功能（enableTransliteration，預設關閉），
 * 並把「檢字表可檢視語言」收進設定（translitVisibleGroups：group 鍵陣列，空=全部）。
 * 設定頁與閱讀視圖側欄檢字表都依此閘控。
 *
 * 本測試只驗證「不依賴 Obsidian DOM」的純資料契約：
 *   - 系統確實擁有多個文種分組（multi-script）；
 *   - 可視過濾謂詞：visible 為空 → 全部 group 可見；非空 → 僅列出者。
 * （閘控 UI 本身在 src/settings.ts / src/view.ts，需 Obsidian 運行時，另由手測覆蓋。）
 *
 * 用法：node test/translit-experimental.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-te-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { listSchemes, SCRIPT_PREFERRED_SCHEME } = lib;

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};
const distinctGroups = () => [...new Set(listSchemes().map((s) => s.group))];
// 複製 src/settings.ts 的 translitGroupVisible 語義（空陣列=全部可見）
const groupVisible = (group, visible) => visible.length === 0 || visible.includes(group);

test("系統擁有多文種分組（multi-script）", () => {
  const groups = distinctGroups();
  assert.ok(groups.length >= 3, `分組數應 ≥3，實得 ${groups.length}: ${groups.join(",")}`);
});

test("蒙古文方案已註冊為可預選（前輪交付）", () => {
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.mongolian, "mongolian");
});

test("可視過濾：空陣列 = 全部群組可見", () => {
  const groups = distinctGroups();
  for (const g of groups) assert.ok(groupVisible(g, []), `空可視時 ${g} 應可見`);
});

test("可視過濾：非空陣列 = 僅列出者可見", () => {
  const groups = distinctGroups();
  const pick = groups.slice(0, 2);
  const rest = groups.slice(2);
  for (const g of pick) assert.ok(groupVisible(g, pick), `${g} 在選取內應可見`);
  for (const g of rest) assert.ok(!groupVisible(g, pick), `${g} 不在選取內應隱藏`);
});

test("所有可預選文種都能找到對應已註冊方案", () => {
  for (const [script, id] of Object.entries(SCRIPT_PREFERRED_SCHEME)) {
    const sc = listSchemes().find((s) => s.id === id);
    assert.ok(sc, `文種 ${script} 的預選方案 ${id} 必須已註冊`);
  }
});

console.log(`\n多文種實驗閘控契約： ${passed} 通過 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
