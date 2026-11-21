// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// W9-D 功能自檢（node，headless）：「在主區打開」鏈路。
// 不依賴瀏覽器：esbuild 把 view.ts 按 obsidian-mock 打包，直接調用私有的
// openShelfInMain()，斷言它向主工作區新 leaf 寫入正確的 view state。
//
// 運行：node test/w9d-open-in-main.mjs  （exit 0 = 通過）

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import path from "path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src", "view.ts");
const OUT = path.join(ROOT, "test", "build", "w9d-view.mjs");
const MOCK = path.join(ROOT, "test", "obsidian-mock.cjs");
const ESBUILD = path.join(ROOT, "node_modules", ".bin", "esbuild");

execFileSync(
  ESBUILD,
  [SRC, "--bundle", "--format=esm", "--platform=node", `--alias:obsidian=${MOCK}`, "--outfile=" + OUT],
  { stdio: "pipe" },
);

const { VerticalWriterView } = await import(OUT);

let lastGetLeafArg = undefined;
let lastSetViewState = null;
const fakeLeaf = {
  setViewState: async (state) => { lastSetViewState = state; },
};
const fakeWorkspace = {
  getLeaf: (arg) => { lastGetLeafArg = arg; return fakeLeaf; },
  revealLeaf: () => {},
};
const fakeApp = {
  workspace: fakeWorkspace,
  vault: { getFiles: () => [], getAbstractFileByPath: () => null },
};
const plugin = { uiLang: () => "zh-TW" };
const leaf = { app: fakeApp };

const view = new VerticalWriterView(leaf, plugin);
await view.openShelfInMain();

assert.strictEqual(lastGetLeafArg, true, "應請求主區新 leaf（getLeaf(true)），而非側欄");
assert.strictEqual(lastSetViewState.type, "vertical-writer-view", "應複用現有 view type（不新增）");
assert.strictEqual(lastSetViewState.active, true, "應設為 active");
assert.deepStrictEqual(
  lastSetViewState.state,
  { mode: "shelf" },
  "state 應攜帶 shelf 模式，使主區分頁呈現",
);

console.log("  ✅ 「在主區打開」：getLeaf(true) → setViewState({type:'vertical-writer-view', state:{mode:'shelf'}, active:true})");
console.log("W9-D 右面板側欄自檢通過 ✅");
