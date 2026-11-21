// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 裝置模擬冒煙測試（Phase 5）：融合後的 main.ts（li 核心 + UD DictFeature）
// 在「桌面」與「移動（pointer: coarse）」兩種環境下執行 onload()，確認：
//   1. 兩種環境都不拋錯（含 lilium 觸控分支 segmentedEditEligible 不崩）；
//   2. 註冊出的指令 / 視圖 / ribbon / 設定頁 / 編輯器建議 集合完全一致
//      → 桌面與移動「用戶操作邏輯」零差異、零衝突；
//   3. UD 詞典模組確實掛載（plugin.dict 存在），hover 控制器已 attach。
//
// 執行：node test/device-smoke.mjs  （exit 0 = 雙環境一致且不崩；exit 1 = 異常）

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "test", "build", "device-main.mjs");
const DEVICE_MOCK = path.join(ROOT, "test", "obsidian-device-mock.cjs");

// 1) 打包融合後的 main.ts（alias obsidian → 裝置模擬）
execFileSync(
  path.join(ROOT, "node_modules", ".bin", "esbuild"),
  [
    path.join(ROOT, "src", "main.ts"),
    "--bundle", "--format=esm", "--platform=node",
    `--alias:obsidian=${DEVICE_MOCK}`,
    "--outfile=" + OUT,
  ],
  { stdio: "pipe" },
);

const { default: VerticalWriterPlugin } = await import(OUT);
const deviceMock = await import(DEVICE_MOCK);
const { makeApp } = deviceMock.default || deviceMock;

let passed = 0;
const ok = (n) => { passed++; console.log(`  ✅ ${n}`); };

async function scenario(mobile) {
  const app = makeApp(mobile);
  const plugin = new VerticalWriterPlugin(app, { id: "lilium", name: "lilium", version: "2.3.0" });
  // 計數 ribbon（base.Plugin.addRibbonIcon 不計數，這裡包一層）
  let ribbon = 0;
  const origRibbon = plugin.addRibbonIcon.bind(plugin);
  plugin.addRibbonIcon = (...a) => { ribbon++; return origRibbon(...a); };
  await plugin.onload();
  // 觸發 onLayoutReady 回調（li applyEditorMode / UD hover attach + rescan）
  await app.workspace.flushLayoutReady();
  return {
    mobile,
    commands: plugin._commands.length,
    commandIds: plugin._commands.map((c) => c.id).sort(),
    views: plugin._views.map((v) => v.type).sort(),
    ribbon,
    tabs: plugin._tabs.length,
    suggest: plugin._suggest ? plugin._suggest.length : 0,
    dictPresent: !!plugin.dict,
    hoverAttached: !!(plugin.dict && plugin.dict.hoverController && typeof plugin.dict.hoverController.attach === "function"),
  };
}

console.log("Phase 5 裝置模擬冒煙（融合 main.ts）");
const desktop = await scenario(false);
const mobile = await scenario(true);

console.log(`  桌面：${JSON.stringify(desktop)}`);
console.log(`  移動：${JSON.stringify(mobile)}`);

assert.ok(desktop.dictPresent, "桌面：DictFeature 已掛載");
assert.ok(mobile.dictPresent, "移動：DictFeature 已掛載");
assert.ok(desktop.hoverAttached, "桌面：hover 控制器已 attach");
assert.ok(mobile.hoverAttached, "移動：hover 控制器已 attach（惰性，無 mouse 事件不觸發）");
ok("融合後 onload() 在桌面與移動環境下均不拋錯，DictFeature 與 hover 控制器就緒");

// —— 核心「無衝突」主張：雙環境註冊集合完全一致 ——
assert.strictEqual(desktop.commands, mobile.commands, "雙環境指令總數應一致");
assert.deepStrictEqual(desktop.commandIds, mobile.commandIds, "雙環境指令 id 集合應完全一致");
ok(`指令集合：桌面 == 移動（共 ${desktop.commands} 個，操作入口零差異）`);

// UD 融合確認：6 個 UD 指令 id 全部就位
// （語料／校勘剝離後由 8 減為 6；剝離的兩個改為反向斷言，見下）
const udIds = ["fulltext-search", "lookup-selection", "open-bookmarks", "open-dictionary-view", "open-history", "rescan-dictionaries"];
for (const id of udIds) assert.ok(desktop.commandIds.includes(id), `UD 指令應存在：${id}`);
ok("UD 6 個指令已融合掛載（fulltext-search / lookup-selection / open-dictionary-view / …）");

// 剝離凍結：語料（import-parallel-alignment）與校勘（open-collation-view）指令
// 已隨功能移入附錄。此處為**反向斷言**——日後若有人把功能加回來而沒同步本測試，
// 立刻轉紅（與 test/run.mjs r37-c 的 17 處反向斷言同一做法）。
const removedIds = ["import-parallel-alignment", "open-collation-view"];
for (const id of removedIds) assert.ok(!desktop.commandIds.includes(id), `已剝離指令不應再註冊：${id}`);
ok("已剝離指令 2 個均未註冊（import-parallel-alignment / open-collation-view）");

/* 電子書閱讀器（li-epub-reader 自有 ItemView）整體退役並凍結進 附录/電子書閱讀器/，
   故不再註冊。原生直排視圖（vertical-writer-view）歷來非「註冊型」ItemView——
   它由 open-vertical-view 命令以「標準 markdown leaf ＋ --li-* 變數」形式打開
   （見 main.ts openNativeVerticalView），不吃 registerView，故不在 views 清單。
   現唯一經 registerView 註冊的自有視圖為 DictFeature 的 lilium-dict-view。 */
assert.deepStrictEqual(
  desktop.views,
  ["lilium-dict-view"],
  `視圖型別應僅 lilium-dict-view（li-epub-reader 已隨 v2.8.49 退役、vertical-writer 非註冊型），實得 ${desktop.views}`
);
assert.deepStrictEqual(desktop.views, mobile.views, "雙環境視圖型別集合應完全一致");
assert.ok(!desktop.views.includes("li-collation-view"), "li-collation-view 已併入辭典頁籤，不應再註冊為視圖");
assert.ok(!desktop.views.includes("li-epub-reader"), "li-epub-reader 已隨電子書閱讀器退役撤除");
ok("視圖型別 1（lilium-dict-view；li-epub-reader 退役、vertical-writer 非註冊型）雙環境一致；校勘已為頁籤非視圖");

assert.strictEqual(desktop.ribbon, 1, `ribbon 應為 1（lilium 品牌圖示，點擊直出 lilium；橫排／直排切換移至視圖 header），實得 ${desktop.ribbon}`);
assert.strictEqual(desktop.ribbon, mobile.ribbon, "雙環境 ribbon 數應一致");
ok("ribbon 圖示 1（lilium 品牌自繪，點擊直出 lilium");

/* 設置頁合併為單一頁籤——辭典設置成為主頁的「辭典」分區。 */
assert.strictEqual(desktop.tabs, 1, `設定頁應為 1（S3 合併：li 主頁籤；UD 已併入分區），實得 ${desktop.tabs}`);
assert.strictEqual(desktop.tabs, mobile.tabs, "雙環境設定頁數應一致");
ok("設定頁 1（VWSettingTab 內含辭典分區 renderDictSections）雙環境一致");

assert.strictEqual(desktop.suggest, 1, `編輯器建議應為 1（UD 內聯），實得 ${desktop.suggest}`);
assert.strictEqual(desktop.suggest, mobile.suggest, "雙環境編輯器建議數應一致");
ok("編輯器內聯建議 1（UD InlineDictSuggest）雙環境一致");

console.log(`\n裝置模擬冒煙通過：${passed} 項 ✅（桌面與移動 UI/操作邏輯零差異、零衝突）`);
