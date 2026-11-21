// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 無頭（headless）插件加載冒煙測試：在 Node/Linux 上用 obsidian mock + 内存 vault
 * 真正執行插件的 onload() / onunload() 與命令回調，捕捉「能否在 Linux 上跑起來」的
 * 運行時問題。蒙古文轉換器需真實瀏覽器（dart2js 注入），已由 test/mongol-code.mjs
 * 在 Chromium 中驗證，此处不執行 mongol 命令。 */
import esbuild from "esbuild";
import { createRequire } from "module";
import path from "path";
import builtins from "./builtins.mjs";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const FONT_DIR = ".lilium/fonts";

/* ---------- 最小 DOM ---------- */
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
    querySelector() { return null; }, querySelectorAll() { return []; }, children: [],
    setIcon() {}, empty() {},
  };
  el.toggleClass = (c, f) => el.classList.toggle(c, f);
  el.addClass = (c) => el.classList.add(c);
  el.removeClass = (c) => el.classList.remove(c);
  return el;
}
global.window = global;
Object.defineProperty(globalThis, "navigator", {
  value: { language: "en-US", userAgent: "node", platform: "linux" },
  configurable: true,
});
global.document = {
  createElement: makeEl,
  head: makeEl("head"),
  body: makeEl("body"),
  documentElement: makeEl("html"),
};

/* ---------- 内存 vault 适配器 ---------- */
const fs = new Map(); // path -> Uint8Array | true(dir)
const adapter = {
  async exists(p) { return fs.has(p); },
  async mkdir(p) { if (!fs.has(p)) fs.set(p, true); },
  async list(p) {
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
  async read() { return ""; },
  async cachedRead() { return ""; },
  getResourcePath(p) { return "app://local/" + p; },
  async remove(p) { fs.delete(p); },
  getName() { return "mock"; },
};

const app = {
  vault: {
    adapter,
    config: { locale: "zh" },
    cachedRead: () => Promise.resolve(""),
    read: () => Promise.resolve(""),
    getName: () => "mock",
    getAbstractFile: () => null,
  },
  workspace: {
    onLayoutReady(cb) { Promise.resolve().then(() => { try { cb(); } catch (e) { console.error("[onLayoutReady]", e); } }); },
    on() { return { unload() {} }; },
    getActiveViewOf: () => null,
    getLeavesOfType: () => [],
    getActiveFile: () => null,
    trigger() {},
  },
  metadataCache: { getFileCache: () => null },
};

/* ---------- 構建插件（obsidian 别名到 mock） ---------- */
const outfile = path.resolve(__dirname, "build", "plugin-smoke.cjs");
await esbuild.build({
  entryPoints: [path.resolve(__dirname, "..", "src", "main.ts")],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2018",
  logLevel: "silent",
  outfile,
  alias: { obsidian: path.resolve(__dirname, "obsidian-mock.cjs") },
  external: ["electron", ...builtins],
});

const mod = require(outfile);
const Plugin = mod.default ?? mod;

/* ---------- 斷言 ---------- */
let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name} ${detail}`); failures++; }
};

console.log("=== 無頭加載冒煙測試（Linux / Node）===");
const plugin = new Plugin(app, { id: "li", name: "li", version: "1.1.0" });

let onloadErr = null;
try {
  await plugin.onload();
} catch (e) {
  onloadErr = e;
}
check("onload() 無異常完成", !onloadErr, onloadErr ? String(onloadErr) : "");

const cmdIds = (plugin._commands || []).map((c) => c.id);
check("已注册命令數量 >= 16", cmdIds.length >= 16, `(實際 ${cmdIds.length})`);
// 直排排版七命令（toggle-vertical / open-vertical-view / export-pdf /
// toggle-editor-vertical / insert-ruby / insert-tcy / insert-emphasis）已隨直排功能
// 退役撤除——斷言改為撤除鎖定（與下方 export-epub 同款；恢復＝還原 main.ts 歷史）。
for (const id of [
  "toggle-vertical", "open-vertical-view", "export-pdf",
  "toggle-editor-vertical", "insert-ruby", "insert-tcy", "insert-emphasis",
]) {
  check(`直排命令已撤除: ${id}`, !cmdIds.includes(id));
}
// 滿文命令（純 JS 轉寫，lilium 保留）
for (const id of ["manchu-mollendorff-to-unicode", "manchu-unicode-to-mollendorff"]) {
  check(`命令已注册: ${id}`, cmdIds.includes(id));
}
for (const id of ["mongol-latin-to-ime", "mongol-ime-candidates", "mongol-zcode-to-unicode"]) {
  check(`蒙文IME命令已撤除: ${id}`, !cmdIds.includes(id));
}
// 語義更新：
// 四個入口命令撤除（能力休眠保留）；原「已注册 export-epub」斷言改為撤除鎖定。
for (const id of ["export-epub", "export-html", "convert-vertical-epub", "convert-vertical-html"]) {
  check(`匯出入口已撤除: ${id}`, !cmdIds.includes(id));
}

for (const f of ["MenksoftHara.ttf", "OyunHaraTig.ttf", "OyunAgulaTig.ttf"]) {
  check(`蒙科立字體已彻底移除: ${f}`, !fs.has(`${FONT_DIR}/${f}`), "(仍在 vault 中)");
}

// 滿文命令端到端（純 JS，無需瀏覽器）
const findCmd = (id) => (plugin._commands || []).find((c) => c.id === id);
function runCmd(id, value, selection = "") {
  const cmd = findCmd(id);
  let result = null;
  const editor = {
    getSelection: () => selection,
    getValue: () => value,
    replaceSelection: (s) => { result = s; },
    setValue: (s) => { result = s; },
  };
  cmd.editorCallback(editor);
  return result;
}
const uni = runCmd("manchu-unicode-to-mollendorff", "ᠮᠠᠨᠵᡠ");
check("滿文 Unicode→Möllendorff: ᠮᠠᠨᠵᡠ ⇒ manju", uni === "manju", `(得到 ${JSON.stringify(uni)})`);
const mol = runCmd("manchu-mollendorff-to-unicode", "manju");
check("滿文 Möllendorff→Unicode: manju ⇒ ᠮᠠᠨᠵᡠ", mol === "ᠮᠠᠨᠵᡠ", `(得到 ${JSON.stringify(mol)})`);
// 往返一致性（用滿文字母 ᡠ U+1860，而非蒙古文字母 ᠤ U+1824）
const rt = runCmd("manchu-mollendorff-to-unicode", runCmd("manchu-unicode-to-mollendorff", "ᠮᠠᠨᠵᡠ"));
check("滿文 Unicode↔Möllendorff 往返一致", rt === "ᠮᠠᠨᠵᡠ", `(得到 ${JSON.stringify(rt)})`);

// onunload 不抛
let unloadErr = null;
try { plugin.onunload(); } catch (e) { unloadErr = e; }
check("onunload() 無異常", !unloadErr, unloadErr ? String(unloadErr) : "");

console.log(`\n結果: ${failures === 0 ? "全部通過" : failures + "項失敗"}`);
process.exit(failures === 0 ? 0 : 1);
