// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 防護機制回歸測試：故意注入故障，驗證「載入不失敗、使用不崩潰」。
 *
 * 場景：
 *  1. data.json 損壞（loadData 拋錯）→ onload 仍完成、命令照常註冊
 *  2. data.json 是垃圾字符串 → 設置回退默認值（typography/page 仍為對象）
 *  3. vault 只讀（adapter.mkdir 拋錯）→ 字體降級，插件照常載入
 *  4. fontManager.refresh 拋錯 → 被 guard 吸收
 *  5. 卸載後異步回調不寫 DOM（unloaded 標記）
 *  6. 一鍵導出在 cachedRead 拋錯時 → guard 吸收為 Notice，不產生未捕獲異常
 *  7. onunload 自身不拋錯（部分清理失敗不影響其餘）
 *
 * 用法：node test/hardening.mjs
 */
import esbuild from "esbuild";
import { createRequire } from "module";
import path from "path";
import builtins from "./builtins.mjs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------- 最小 DOM（同 smoke-linux.mjs） ---------- */
function makeEl(tag) {
  const el = {
    tagName: tag, id: "", className: "", textContent: "", innerHTML: "", dataset: {},
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ""; } },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { return c; }, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {},
    createDiv() { const d = makeEl("div"); el.children.push(d); return d; },
    createEl() { return makeEl("span"); },
    querySelector() { return null; }, querySelectorAll() { return []; }, children: [],
    empty() { el.children.length = 0; },
  };
  el.toggleClass = (c, f) => el.classList.toggle(c, f);
  el.addClass = (c) => el.classList.add(c);
  el.removeClass = (c) => el.classList.remove(c);
  return el;
}
global.window = global;
// attachGlobalKbGate (global kb gate) window stubs for Node env:
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.requestAnimationFrame = (cb) => 0;
global.cancelAnimationFrame = () => {};
global.visualViewport = null;
Object.defineProperty(globalThis, "navigator", {
  value: { language: "zh-TW", userAgent: "node", platform: "linux" },
  configurable: true,
});
global.document = {
  createElement: makeEl,
  head: makeEl("head"),
  body: makeEl("body"),
  documentElement: makeEl("html"),
};
// v2.8.90（B3 rAF 事務）：Node 測試環境無 rAF，同步立即執行 stub（追趕序號下收斂等價）
global.requestAnimationFrame = (cb) => { cb(performance.now()); return 0; };

const NOTICES = [];
global.Notice = class Notice {
  constructor(msg) { NOTICES.push(String(msg)); }
};

/* ---------- 可注入故障的內存 vault ---------- */
function makeVault(opts = {}) {
  const fs = new Map();
  const adapter = {
    _mkdirThrows: !!opts.mkdirThrows,
    _readThrows: !!opts.readThrows,
    async exists(p) { return fs.has(p); },
    async mkdir(p) {
      if (this._mkdirThrows) throw new Error("EACCES: read-only vault (injected)");
      if (!fs.has(p)) fs.set(p, true);
    },
    async list(p) {
      if (this._readThrows) throw new Error("EIO: injected list failure");
      const prefix = p.endsWith("/") ? p : p + "/";
      const files = [];
      for (const k of fs.keys()) {
        const v = fs.get(k);
        if (v instanceof Uint8Array && k.startsWith(prefix)) files.push(k);
      }
      return { files, folders: [] };
    },
    async stat(p) {
      const v = fs.get(p);
      return v instanceof Uint8Array ? { size: v.byteLength, ctime: 0, mtime: 0, type: "file" } : undefined;
    },
    async writeBinary(p, buf) { fs.set(p, new Uint8Array(buf)); },
    async write(p, text) { fs.set(p, text); },
    async read() { return ""; },
    async cachedRead() { return opts.cachedReadThrows ? Promise.reject(new Error("EIO: injected cachedRead failure")) : Promise.resolve(""); },
    getResourcePath(p) { return "app://local/" + p; },
    async remove(p) { fs.delete(p); },
    getName() { return "mock"; },
  };
  const vault = {
    adapter,
    config: { locale: "zh-TW" },
    cachedRead: adapter.cachedRead,
    read: adapter.read,
    getName: () => "mock",
    getAbstractFile: () => null,
    // 兼容詞典掃描（headless 下無真實文件系統，回 null）
    getAbstractFileByPath: () => null,
    // 詞典掃描起點是 `vault.getFiles()`（v2.8.30 起掃描範圍依「辭典檔案夾」設定，
    // 留空＝全庫）。這是 Obsidian 的真實 API（記憶體 index，零 IO），
    // headless mock 必須提供；空陣列代表「這個 mock vault 裡沒有檔案」。
    getFiles: () => [],
  };
  return { vault, fs, adapter };
}

function makeApp(vault, loadDataImpl) {
  return {
    vault,
    workspace: {
      onLayoutReady(cb) { Promise.resolve().then(() => { try { cb(); } catch (e) { console.error("[onLayoutReady]", e); } }); },
      on() { return { unload() {} }; },
      getActiveViewOf: () => null,
      getLeavesOfType: () => [],
      getActiveFile: () => null,
      getRightLeaf: () => null,
      getLeaf: () => null,
      revealLeaf() {},
      trigger() {},
      iterateAllLeaves() {},
      // headless：提供最小 containerEl.ownerDocument 供 hover 控制器 attach（addEventListener 空操作）
      containerEl: { ownerDocument: { addEventListener() {}, removeEventListener() {} } },
    },
    metadataCache: { getFileCache: () => null },
    __loadData: loadDataImpl,
  };
}

/* ---------- 構建插件（obsidian 別名到 mock；loadData 可注入） ---------- */
async function buildPlugin(opts = {}) {
  const outfile = path.resolve(__dirname, "build", `plugin-hardening-${Math.random().toString(36).slice(2)}.cjs`);
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, "..", "src", "main.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "es2018",
    logLevel: "silent",
    outfile,
    alias: { obsidian: path.resolve(__dirname, "obsidian-mock-hardening.cjs") },
    external: ["electron", ...builtins],
  });
  // mock 的 loadData 由 app.__loadData 提供（在 mock 內部转发）
  const require2 = createRequire(import.meta.url);
  const mod = require2(outfile);
  const Plugin = mod.default ?? mod;
  const { vault, fs, adapter } = makeVault(opts);
  const app = makeApp(vault, opts.loadData);
  const plugin = new Plugin(app, { id: "li", name: "li", version: "1.5.1" });
  return { plugin, fs, adapter, app };
}

/* ---------- 斷言 ---------- */
let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name} ${detail}`); failures++; }
};

console.log("=== 防護機制回歸測試（故障注入）===");

// 場景 1：loadData 拋錯（data.json 損壞）
{
  const { plugin } = await buildPlugin({
    loadData: () => { throw new Error("SyntaxError: unexpected token (corrupt data.json)"); },
  });
  let err = null;
  try { await plugin.onload(); } catch (e) { err = e; }
  check("S1 載入：data.json 損壞 → onload 無異常完成", !err, err ? String(err) : "");
  check("S1 載入：命令仍全部註冊", (plugin._commands || []).length >= 16, `(實際 ${(plugin._commands || []).length})`);
  // 直排排版子物件已隨直排退役撤除——設置健全性改驅 dict.settings（退役 API 對齊 smoke-linux 撤除鎖定）。
  check("S1 載入：設置為默認對象", plugin.settings && typeof plugin.settings.uiLang === "string");
  let uerr = null;
  try { plugin.onunload(); } catch (e) { uerr = e; }
  check("S1 卸載：無異常", !uerr, uerr ? String(uerr) : "");
}

// 場景 2：loadData 返回垃圾字符串
{
  const { plugin } = await buildPlugin({ loadData: () => "GARBAGE-NOT-JSON" });
  let err = null;
  try { await plugin.onload(); } catch (e) { err = e; }
  check("S2 載入：垃圾設置 → onload 無異常", !err, err ? String(err) : "");
  check("S2 載入：vw 設置回退為默認對象（typography/page 已隨直排退役撤除）",
    typeof plugin.settings?.uiLang === "string" && Array.isArray(plugin.settings?.translitVisibleGroups));
}

// 場景 3：vault 只讀（mkdir 拋錯）→ 字體降級不阻斷
{
  const { plugin } = await buildPlugin({ mkdirThrows: true });
  let err = null;
  try { await plugin.onload(); } catch (e) { err = e; }
  check("S3 載入：vault 只讀 → onload 無異常（字體降級）", !err, err ? String(err) : "");
  // v2.8.49：電子書閱讀器（兩個自有 ItemView）整體退役——EPUB 視圖型別撤除鎖定；
  // _views 現僅剩辭典視圖（VIEW_TYPE_UNIVERSAL_DICT）。
  const epubViews = (plugin._views || []).filter((v) => /epub/i.test(v.type));
  check("S3 載入：EPUB 自有視圖已隨 v2.8.49 退役撤除", epubViews.length === 0,
    `實際 ${epubViews.map((v) => v.type).join(",")}`);
}

// 場景 4：adapter.list 拋錯 → fontManager.refresh 被 guard 吸收
{
  const { plugin } = await buildPlugin({ readThrows: true });
  let err = null;
  try { await plugin.onload(); } catch (e) { err = e; }
  check("S4 載入：字體清單讀取失敗 → onload 無異常", !err, err ? String(err) : "");
}

// 場景 5：一鍵導出時 cachedRead 拋錯 → guard 吸收為 Notice，不產生未捕獲異常
{
  // 一鍵導出（convertActiveToPdf/Html、batchConvertFolderSafe）已隨直排退役撤除——
  // 撤除鎖定負斷言（對齊 smoke-linux 慣例）：方法不存在，無法再成為未捕獲異常入口。
  const { plugin } = await buildPlugin();
  await plugin.onload();
  check("S5 負斷言：convertActiveToPdf 已撤除", typeof plugin.convertActiveToPdf !== "function");
  check("S5 負斷言：convertActiveToHtml 已撤除", typeof plugin.convertActiveToHtml !== "function");
  check("S5 負斷言：batchConvertFolderSafe 已撤除", typeof plugin.batchConvertFolderSafe !== "function");
}

// 場景 5.5：applyScriptScheme 已退役——負斷言確保方法不存在、設置不被任何殘留路徑改動
{
  const { plugin } = await buildPlugin();
  await plugin.onload();
  const before = plugin.settings?.typography?.centerPunctuation;
  check("S5.5 負斷言：applyScriptScheme 方法已移除", typeof plugin.applyScriptScheme !== "function");
  check("S5.5 負斷言：centerPunctuation 未被殘留路徑改動", plugin.settings?.typography?.centerPunctuation === before);
}

// 場景 6：effectiveTypesetFor（直排排版）已隨直排退役撤除——撤除鎖定負斷言。
{
  const { plugin } = await buildPlugin();
  await plugin.onload();
  check("S6 負斷言：effectiveTypesetFor 已撤除", typeof plugin.effectiveTypesetFor !== "function");
}

let deepAssign = null;

/* ---------- S14–S16：重載循環、重置原地語義、PDF 書籤命令（v2.8.0 硬化擴充） ---------- */

// S14：重載循環——onload → onunload → onload（同一實例，BRAT 式熱重載）。
// 迴歸防護：onunload 設下的 unloaded 旗標必須在 onload 復位，
// 否則 injectRuntimeCss 等三處 guard 靜默跳過 → 直排樣式失效。
{
  const { plugin } = await buildPlugin({});
  let err = null;
  try { await plugin.onload(); } catch (e) { err = e; }
  check("S14 重載：首次 onload 無異常", !err, err ? String(err) : "");
  try { plugin.onunload(); } catch (e) { err = e; }
  check("S14 重載：onunload 無異常", !err, err ? String(err) : "");
  try { await plugin.onload(); } catch (e) { err = e; }
  check("S14 重載：二次 onload 無異常", !err, err ? String(err) : "");
  // unloaded 旗標（直排 CSS guard 用）已隨直排退役撤除——撤除鎖定負斷言。
  check("S14 重載：unloaded 旗標已隨直排退役撤除（不再存在）", plugin.unloaded === undefined,
    `實際 ${String(plugin.unloaded)}`);
  check("S14 重載：命令仍可註冊（數量 ≥ 16）", (plugin._commands || []).length >= 16,
    `(實際 ${(plugin._commands || []).length})`);
  // v2.8.49：EPUB 自有視圖已隨退役撤除——EPUB 視圖型別撤除鎖定（_views 僅剩辭典視圖）。
  const epubViews2 = (plugin._views || []).filter((v) => /epub/i.test(v.type));
  check("S14 重載：EPUB 自有視圖已隨 v2.8.49 退役撤除", epubViews2.length === 0,
    `實際 ${epubViews2.map((v) => v.type).join(",")}`);
  let uerr = null;
  try { plugin.onunload(); } catch (e) { uerr = e; }
  check("S14 重載：再次 onunload 無異常", !uerr, uerr ? String(uerr) : "");
}

// S15：設置重置的原地語義——deepAssignInto 寫入「同一批子物件」，
// 其它模組捕獲的舊引用（字體彈層閉包的 settings.typography）重置後仍有效且讀到新值。
{
  const { plugin } = await buildPlugin({});
  try { await plugin.onload(); } catch (e) {}
  // 直排子物件（typography/page）已退役；原地語義改以 vw 設置頂層驗證（deepAssignInto 對
  // 陣列/頂層純值本就替換，原地語義只對「普通物件子層」承諾——vw 頂層物件引用不換）。
  plugin.settings.translitVisibleGroups = ["mongolian"];
  const capturedSettings = plugin.settings; // 閉包捕獲的舊頂層引用
  const require2 = createRequire(import.meta.url);
  const outfile2 = path.resolve(__dirname, "build", `settings-s10-${Math.random().toString(36).slice(2)}.cjs`);
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, "..", "src", "settings.ts")],
    bundle: true, format: "cjs", platform: "node", target: "es2018",
    logLevel: "silent", outfile: outfile2,
    alias: { obsidian: path.resolve(__dirname, "obsidian-mock-hardening.cjs") },
    external: ["electron", ...builtins],
  });
  const mod = require2(outfile2);
  const defaultsVw = JSON.parse(JSON.stringify(mod.DEFAULT_SETTINGS));
  deepAssign = mod.deepAssignInto;
  deepAssign(plugin.settings, defaultsVw);
  check("S15 重置：頂層引用不替換（原地寫入）", plugin.settings === capturedSettings);
  check("S15 重置：用戶改動回退預設", Array.isArray(plugin.settings.translitVisibleGroups)
    && plugin.settings.translitVisibleGroups.length === defaultsVw.translitVisibleGroups.length,
    `實際 ${JSON.stringify(plugin.settings.translitVisibleGroups)}`);
}

// S16：PDF 書籤命令（pdf-add-outline，直排 PDF 導出配套）已隨直排退役撤除——撤除鎖定負斷言。
{
  const { plugin } = await buildPlugin({});
  try { await plugin.onload(); } catch (e) {}
  check("S16 負斷言：pdf-add-outline 命令已撤除", !(plugin._commands || []).some((c) => c.id === "pdf-add-outline"));
}


console.log(`\n結果: ${failures === 0 ? "全部通過" : failures + " 項失敗"}`);
process.exit(failures === 0 ? 0 : 1);
