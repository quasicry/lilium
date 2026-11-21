"use strict";
/*
 * 裝置模擬冒煙測試用 obsidian 模擬（Phase 5）。
 * 在 obsidian-mock.cjs 基礎上補齊「融合後 main.ts.onload()」在 headless 下實際
 * 引用、但共享 mock 未提供的符號與 workspace/document 行為，並支援「桌面 / 移動」
 * 兩種環境切換（window.matchMedia 的 (pointer: coarse)）。
 */
const base = require("./obsidian-mock.cjs");

// lilium view.ts 在模塊載入/運行期引用
class EditorSuggest { constructor(app) { this.app = app; } }
class MarkdownView { constructor() { this.editor = { getCursor: () => ({ line: 0, ch: 0 }), getLine: () => "", getSelection: () => "" }; } }
class TFile { constructor(path, ext) { this.path = path; this.extension = ext || "md"; } }
class TFolder { constructor(path) { this.path = path; } }
class WorkspaceLeaf {
  constructor(ws) { this.workspace = ws; this.view = null; this.viewState = null; }
  setViewState(s) { this.viewState = s; return Promise.resolve(); }
  getViewState() { return this.viewState; }
}
class Workspace {
  constructor() { this._layoutReady = []; this.containerEl = null; this.activeLeaf = null; }
  onLayoutReady(cb) { this._layoutReady.push(cb); }
  flushLayoutReady() { const cbs = this._layoutReady; this._layoutReady = []; return Promise.all(cbs.map((c) => { try { return c(); } catch (e) { return Promise.reject(e); } })); }
  on(evt, cb) { return { evt, cb }; }
  off() {}
  getLeavesOfType() { return []; }
  getActiveViewOfType() { return null; }
  getActiveFile() { return null; }
  getRightLeaf() { return new WorkspaceLeaf(this); }
  getLeaf() { return new WorkspaceLeaf(this); }
  revealLeaf() {}
  getContainer() { return this.containerEl; }
}
class Vault {
  constructor() { this.adapter = { mkdir: async () => {}, writeBinary: async () => {}, write: async () => {}, read: async () => "", readBinary: async () => new Uint8Array(0), exists: async () => false, rmdir: async () => {}, remove: async () => {} }; }
  getAbstractFileByPath() { return null; }
  // 辭典掃描改全庫掃描，起點是 vault.getFiles()（真實 Obsidian API）。
  // headless mock 必須提供，空陣列＝「這個 mock vault 沒有檔案」。
  getFiles() { return []; }
  createFolder() { return Promise.resolve(); }
  modify() { return Promise.resolve(); }
  read() { return Promise.resolve(""); }
  readBinary() { return Promise.resolve(new Uint8Array(0)); }
}

function makeDocument() {
  const doc = {
    _listeners: {},
    body: base_makeEl("body"),
    // v2.9.4：installTableCellVerticalNav(document.documentElement) 需要 documentElement
    documentElement: base_makeEl("html"),
    createElement: (t) => base_makeEl(t),
    createTextNode: (s) => ({ textContent: s }),
    addEventListener(type, cb) { (this._listeners[type] ||= []).push(cb); },
    removeEventListener() {},
    querySelector: () => null,
    getElementById: () => null,
  };
  return doc;
}
// 從共享 mock 借用 makeEl（未匯出），這裡重寫一份最小版
function base_makeEl(tag) {
  const el = {
    tagName: tag, id: "", className: "", textContent: "", innerHTML: "", dataset: {},
    style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } }, contains(c) { return this._s.has(c); } },
    appendChild(c) { return c; }, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, children: [],
    setIcon() {}, empty() {},
  };
  el.toggleClass = (c, f) => el.classList.toggle(c, f);
  el.addClass = (c) => el.classList.add(c);
  el.removeClass = (c) => el.classList.remove(c);
  return el;
}

function makeApp(mobile) {
  const doc = makeDocument();
  const ws = new Workspace();
  ws.containerEl = doc.body;
  globalThis.window = globalThis.window || {};
  // 批次一 prefer-window-timers 後代碼走 window.setTimeout 等；
  // node 全域同名函數別名補齊（等價語義，測試環境適配）。
  for (const k of ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"]) {
    if (globalThis[k] && globalThis.window[k] === undefined) globalThis.window[k] = (...a) => globalThis[k](...a);
  }
  globalThis.window.matchMedia = (q) => ({ matches: !!mobile && /coarse/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.document = doc;
  return {
    workspace: ws,
    vault: new Vault(),
    metadataCache: { getFirstLinkpathDest: () => null },
    loadData: async () => null,
    saveData: async () => {},
    setting: { open() {}, openTabById() {} },
  };
}

module.exports = Object.assign({}, base, {
  EditorSuggest, MarkdownView, TFile, TFolder, WorkspaceLeaf, Workspace, Vault,
  normalizePath: (p) => String(p).replace(/\\/g, "/"),
  makeApp, makeDocument,
});
