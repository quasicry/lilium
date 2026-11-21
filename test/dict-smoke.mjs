// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * DictFeature 冒煙測試（階段 4 新增，對應 PHASE4-PLAN.md 步驟 5.4）。
 *
 * 目標：在最小 mock obsidian 環境（headless）下驗證「UD → lilium 融合」後的辭典模組
 *   - 可建構（含 8.4MB 內嵌資料 import 不報錯 → 間接驗證資料引用鏈完整）
 *   - init() 註冊 2 個視圖（universal-dict / collation）
 *   - init() 註冊命令（查詞 / 校勘 / 平行對齊匯入 / 選區查詞 / 重掃 / 書籤 / 歷史 / 全文）
 *   - init() 不再自註冊設定頁（S3 併入主頁「辭典」分區）＋內聯建議就緒
 *   - 設定命名空間化（寫入 data.json.dict，不污染 lilium 的 vw）
 *   - hover 控制器就緒（applyHoverSettings 可切換）
 *   - unload() 不拋錯
 *
 * 用法：node test/dict-smoke.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });

console.log("[dict-smoke] bundling src/dict/plugin.ts …");
const outfile = path.join(TMP, "dictlib.mjs");
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "src", "dict", "plugin.ts"),
  "--bundle", "--format=esm", "--platform=node",
  `--alias:obsidian=${path.join(ROOT, "test", "obsidian-dict-mock.cjs")}`,
  `--outfile=${outfile}`,
], { stdio: "pipe" });

const mod = await import(outfile);
const { DictFeature } = mod;
assert.ok(DictFeature, "DictFeature 應由打包產物匯出");

/** 最小 lilium Plugin mock：覆蓋 DictFeature.init/unload 路徑實際引用的成員 */
function makeMockPlugin() {
  const plugin = {
    app: {
      workspace: {
        onLayoutReady(cb) { plugin._layoutReady = cb; },
        on(event, cb) { const e = { event, cb }; plugin._events.push(e); return e; },
        getLeavesOfType() { return []; },
        getActiveViewOfType() { return null; },
        // 校勘指令改成「開辭典面板 + 切頁籤」，會走 activateView()，
        // 需要 getRightLeaf / revealLeaf。做成單例 leaf，讓測試能斷言「沒有多開」。
        getRightLeaf() { return plugin._leaf; },
        getLeaf() { return plugin._leaf; },
        revealLeaf(l) { plugin._revealed = l; },
        containerEl: { ownerDocument: null },
      },
      vault: { adapter: {} },
    },
    manifest: { id: "li" },
    uiLang() { return "zh-TW"; },
    _commands: [], _views: [], _events: [], _tabs: [], _suggest: [], _data: {},
    _setViewStates: [],
    _leaf: {
      setViewState(s) { plugin._setViewStates.push(s); return Promise.resolve(); },
    },
    loadData() { return Promise.resolve(plugin._data); },
    saveData(d) { plugin._data = d; return Promise.resolve(); },
    addCommand(c) { plugin._commands.push(c); return c; },
    registerView(t, f) { plugin._views.push({ type: t, factory: f }); },
    addRibbonIcon() { return {}; },
    addSettingTab(t) { plugin._tabs.push(t); },
    registerEditorSuggest(s) { plugin._suggest.push(s); },
    registerEvent(e) { plugin._events.push(e); return e; },
  };
  return plugin;
}

let passed = 0;
const failures = [];
function testAsync(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${(e && e.stack) || e}`); });
}

console.log("\n[dict-smoke] DictFeature 構造與 init");
const plugin = makeMockPlugin();
let feature;

await testAsync("DictFeature 可構造（含 8.4MB 內嵌資料 import 不報錯）", async () => {
  feature = new DictFeature(plugin);
  assert.ok(feature, "實例應存在");
  assert.strictEqual(feature.plugin, plugin, "plugin 引用應回傳傳入的 li Plugin");
  assert.ok(feature.service, "DictService 應已建構");
  assert.ok(feature.hoverController, "HoverLookupController 應已建構");
});

// 校勘從獨立 ItemView 降級為辭典面板的第 6 個頁籤，
// 所以這裡從「2 個視圖」改成「1 個視圖 + 校勘視圖必須已消失」。
// 後者才是重點——防止有人哪天又把 registerView(VIEW_TYPE_COLLATION) 加回來。
await testAsync("init() 只註冊 1 個視圖（lilium-dict-view；校勘已併為頁籤）", async () => {
  await feature.init();
  const types = plugin._views.map((v) => v.type);
  assert.ok(types.includes("lilium-dict-view"), "應註冊 lilium-dict-view 視圖");
  assert.strictEqual(types.length, 1, `辭典模組應只註冊 1 個視圖，實得 ${types.join(", ")}`);
  assert.ok(!types.includes("li-collation-view"), "li-collation-view 已移除，不應再註冊");
});

// 校勘功能已剝離移入附錄，open-collation-view 指令隨之移除
// （原 id 已無載體，保留只會留下一顆靜默失效的快捷鍵）。
// 這裡改成「必須不存在」——若有人把校勘加回來，本測試會轉紅提醒同步。
await testAsync("校勘指令已隨功能移除（不留靜默失效的快捷鍵）", async () => {
  const ids = plugin._commands.map((c) => c.id);
  assert.ok(!ids.includes("open-collation-view"),
    "open-collation-view 已無載體，不應再註冊");
  assert.ok(!ids.includes("import-parallel-alignment"),
    "import-parallel-alignment（語料平行對讀）已隨語料剝離，不應再註冊");
  // 校勘會話狀態不再由 DictFeature 持有
  assert.strictEqual(feature.collation, undefined,
    "feature.collation 應已移除（校勘狀態不再提升）");
});

await testAsync("init() 註冊命令（查詞/選區/重掃/書籤/歷史/全文）", async () => {
  const ids = plugin._commands.map((c) => c.id);
  for (const id of [
    "open-dictionary-view", "lookup-selection", "rescan-dictionaries",
    "open-bookmarks", "open-history", "fulltext-search",
  ]) {
    assert.ok(ids.includes(id), `應註冊命令 ${id}`);
  }
  assert.ok(plugin._commands.length >= 6, `命令數應 ≥ 6，實際 ${plugin._commands.length}`);
});

await testAsync("init() 不再自註冊設定頁（S3 併入主頁分區）＋內聯建議就緒", async () => {
  assert.strictEqual(plugin._tabs.length, 0, "S3 後詞典不再自註冊設定頁（併入主頁「詞典」分區，由 renderDictSections 承載）");
  assert.strictEqual(plugin._suggest.length, 1, "應註冊 1 個 editor suggest");
});

await testAsync("設定命名空間化：saveSettings 寫入 data.json.dict", async () => {
  await feature.saveSettings();
  assert.ok(plugin._data.dict, "saveSettings 應寫入 data.json.dict 命名空間");
  assert.strictEqual(plugin._data.dict.folders[0], "dictionaries", "dict 設定應含預設 folders");
});

await testAsync("hover 控制器就緒：applyHoverSettings 可切換選項", async () => {
  feature.applyHoverSettings();
  // 反向驗證：改設定後重新套用仍不拋錯
  feature.settings.hoverLookup = false;
  feature.applyHoverSettings();
  feature.settings.hoverLookup = true;
  feature.applyHoverSettings();
});

await testAsync("unload() 不拋錯（含 flushCache 寫入 dictLookupCache）", async () => {
  await feature.unload();
  // flushCache 在 cache 髒時才寫入；這裡僅驗證 unload 路徑穩定
  assert.ok(true, "unload 完成");
});

console.log(`\n[dict-smoke] 結果：${passed} 通過 / ${failures.length} 失敗`);
if (failures.length) {
  console.error("失敗項：" + failures.map((f) => f.name).join("; "));
  process.exit(1);
}
console.log("[dict-smoke] 全部通過 ✅");
