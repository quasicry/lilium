// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 佛學原生模式魯棒性測試。
 *
 * 模擬「使用者刪除佛學資料」場景：用 esbuild 將 3 張佛學資料模組
 * （buddhist-chars / pali-sanskrit / ranjana 的 .lazy）alias 到
 * 一個「匯入即拋錯」的 stub，再斷言：
 *
 *   A. 插件裝載路徑：DictFeature construct / init / unload 不拋錯
 *   B. 佛學函數：restoreCbCodes / normalizeBuddhistVariants / paliToSanskrit /
 *      restoreRanjanaCodes / gaijiInfo
 *      在資料缺失下全部不拋錯，並回傳「安全值」（原文字不變 / undefined / 空）。
 *   C. 校勘引擎已隨功能剝離，不再處於載入路徑（凍結於附錄）。
 *   D. 資料層：buddhistDataAvailable() 在缺失下回傳 false（原生模式偵測）。
 *
 * 這些斷言保證「載入插件 / 使用插件 / 纜載插件」三個動作都不因佛學資料缺失而崩潰。
 *
 * 用法：node test/buddhist-robust.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";
import esbuild from "esbuild";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });

const STUB = path.join(ROOT, "test", "stub-buddhist-data.mjs");
const OBSIDIAN_MOCK = path.join(ROOT, "test", "obsidian-dict-mock.cjs");

// esbuild 解析插件：把 5 張佛學資料模組導向「匯入即拋錯」的 stub，
// 模擬「使用者刪除佛學資料」；並把 obsidian 導向測試 mock。
const stubPlugin = {
  name: "buddhist-stub",
  setup(build) {
    build.onResolve(
      { filter: /^\.\/data\/(buddhist-chars|pali-sanskrit|ranjana)\.lazy$/ },
      () => ({ path: STUB }),
    );
    build.onResolve({ filter: /^obsidian$/ }, () => ({ path: OBSIDIAN_MOCK }));
  },
};

async function bundle(entry, outfile) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    plugins: [stubPlugin],
    logLevel: "silent",
  });
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e?.stack || e}`); }
}
function testAsync(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}\n    ${e?.stack || e}`); });
}

console.log("[buddhist-robust] 打包（佛學資料已模擬刪除）…");
const pluginOut = path.join(TMP, "buddhist-plugin.mjs");
const buddhistOut = path.join(TMP, "buddhist-lib.mjs");
const collationOut = path.join(TMP, "buddhist-collation.mjs");
await bundle(path.join(ROOT, "src", "dict", "plugin.ts"), pluginOut);
await bundle(path.join(ROOT, "src", "dict", "buddhist.ts"), buddhistOut);
// collation.ts 已隨校勘功能剝離移入附錄，不再打包進載入路徑

// ---------------------------------------------------------------- A. 插件裝載路徑
console.log("\n[buddhist-robust] A. 插件 construct / init / unload 不崩潰");
const { DictFeature } = await import(pluginOut);

function makeMockPlugin() {
  const plugin = {
    app: {
      workspace: {
        onLayoutReady(cb) { plugin._layoutReady = cb; },
        on(event, cb) { const e = { event, cb }; plugin._events.push(e); return e; },
        getLeavesOfType() { return []; },
        getActiveViewOfType() { return null; },
        containerEl: { ownerDocument: null },
      },
      vault: { adapter: {} },
    },
    manifest: { id: "li" },
    uiLang() { return "zh-TW"; },
    _commands: [], _views: [], _events: [], _tabs: [], _suggest: [], _data: {},
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

let feature, mockPlugin;
await testAsync("construct + init 不拋錯（佛學資料缺失下）", async () => {
  mockPlugin = makeMockPlugin();
  feature = new DictFeature(mockPlugin);
  await feature.init();
  assert.ok(feature, "實例應存在");
});
await testAsync("設定命名空間化 + unload 不拋錯", async () => {
  await feature.saveSettings();
  await feature.unload();
  assert.ok(true, "unload 完成");
});
await testAsync("即便開啟 buddhistMode，init/unload 仍不崩潰", async () => {
  const p = makeMockPlugin();
  p._data = { dict: { buddhistMode: true } };
  const f = new DictFeature(p);
  await f.init();
  await f.unload();
});

// ---------------------------------------------------------------- B. 佛學函數安全值
console.log("\n[buddhist-robust] B. 佛學函數在資料缺失下回傳安全值（不拋錯）");
const B = await import(buddhistOut);

test("restoreCbCodes：缺字碼原樣保留，不拋錯", () => {
  assert.strictEqual(B.restoreCbCodes("CB00001"), "CB00001", "應原樣保留");
  assert.strictEqual(B.restoreCbCodes("普通文字"), "普通文字");
});
test("normalizeBuddhistVariants：原樣返回", () => {
  assert.strictEqual(B.normalizeBuddhistVariants("體"), "體");
});
test("gaijiInfo：回傳 undefined", () => {
  assert.strictEqual(B.gaijiInfo("CB00001"), undefined);
});
test("paliToSanskrit：回傳 undefined", () => {
  assert.strictEqual(B.paliToSanskrit("dhamma"), undefined);
});
test("restoreRanjanaCodes：原樣保留", () => {
  assert.strictEqual(B.restoreRanjanaCodes("RJ-C943", "roman"), "RJ-C943");
});
test("語料輔助死函式（含 isBuddhistChinese）與 buddhist-zh 詞表已移入附錄", () => {
  const srcB = fs.readFileSync(path.join(ROOT, "src", "dict", "buddhist.ts"), "utf8");
  for (const fn of ["isBuddhistChinese", "detectBuddhistTerms", "getBuddhistStopwords", "detectLiteraryChinese"]) {
    assert.ok(!srcB.includes(fn), `${fn} 應已自 src/dict/buddhist.ts 移除`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, "src", "dict", "data", "buddhist-zh.ts")),
    "buddhist-zh.ts 應已移出 src/（凍結版存本地 lilium資料/附录/，不入庫）");
});

// ---------------------------------------------------------------- C. 校勘引擎（已剝離）
console.log("\n[buddhist-robust] C. 校勘已剝離：引擎不再處於載入路徑，凍結於附錄");
test("collation.ts 已移出 src/dict/（佛學資料缺失不會再經由它拖垮載入）", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "src", "dict", "collation.ts")),
    "src/dict/collation.ts 應已移出（凍結版存本地 lilium資料/附录/，不入庫）");
});

// ---------------------------------------------------------------- D. 資料層可用性
console.log("\n[buddhist-robust] D. buddhistDataAvailable() 回傳 false（原生模式）");
const dataOut = path.join(TMP, "buddhist-data-only.mjs");
await bundle(path.join(ROOT, "src", "dict", "buddhist-data.ts"), dataOut);
const { buddhistDataAvailable, resetBuddhistDataCache } = await import(dataOut);
test("buddhistDataAvailable 在缺資料下為 false", () => {
  resetBuddhistDataCache();
  assert.strictEqual(buddhistDataAvailable(), false, "缺資料應回報不可用（原生模式）");
});

console.log(`\n[buddhist-robust] 結果：${passed} 通過 / ${failed} 失敗`);
if (failed) {
  console.error("失敗項：" + failed);
  process.exit(1);
}
console.log("[buddhist-robust] 全部通過 ✅（佛學資料缺失下，載入/使用/纜載均不崩潰）");
