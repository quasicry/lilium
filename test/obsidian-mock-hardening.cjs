/* 頭無（headless）測試用的最小 obsidian 模擬實現。
 * 僅覆蓋本插件在 onload / onunload / 命令回調路径中實際引用的符號；
 * 真實瀏覽器行為（CM6 編輯器、MarkdownRenderer 等）不在此範圍。 */
"use strict";

class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest || {};
    this._commands = [];
    this._views = [];
    this._events = [];
    this._tabs = [];
    this._suggest = [];
  }
  addCommand(cmd) { this._commands.push(cmd); return cmd; }
  registerView(type, factory) { this._views.push({ type, factory }); }
  registerEvent(evt) { this._events.push(evt); return evt; }
  registerInterval(id) { return id; }
  registerEditorSuggest(s) { this._suggest.push(s); return s; }
  /* 直排選取接管（CM6 擴展）註冊 */
  registerEditorExtension(ext) { (this._editorExtensions ||= []).push(ext); return ext; }
  /* 全域滾輪攔截（capture）；headless 無 DOM 事件能力時僅記錄 */
  registerDomEvent(el, type, handler, opts) {
    try {
      if (el && typeof el.addEventListener === "function") el.addEventListener(type, handler, opts);
    } catch { /* headless mock 無事件能力 */ }
    (this._domEvents ||= []).push({ el, type, handler });
    return handler;
  }
  addRibbonIcon() { return makeEl("div"); }
  addStatusBarItem() { return makeEl("div"); }
  addSettingTab(tab) { this._tabs.push(tab); }
  async loadData() {
    if (this.app && typeof this.app.__loadData === "function") return this.app.__loadData();
    return null;
  }
  async saveData() {}
}

/** 編輯器建議（inline `lilium` 查詞）；headless 下僅需可作爲基類 */
class EditorSuggest {
  constructor(plugin) { this.plugin = plugin; }
}

/** Markdown 編輯/預覽視圖（getActiveViewOfType 參數，運行時作值引用；非基類實例化） */
class MarkdownView {}

/** 資料夾（辭典掃描遞歸用） */
class TFolder {
  constructor(path) { this.path = path; this.children = []; this.name = String(path || "").split("/").pop() || ""; }
}

function normalizePath(p) { return String(p).replace(/\\/g, "/"); }

class PluginSettingTab {
  constructor(app, plugin) { this.app = app; this.plugin = plugin; }
  display() {}
}

class ItemView extends Plugin {
  constructor(leaf) { super(leaf?.app, {}); this.leaf = leaf; this.containerEl = makeEl("div"); }
}

class Modal {
  constructor(app) { this.app = app; this.contentEl = makeEl("div"); this.titleEl = makeEl("div"); }
  open() {} close() {} onOpen() {} onClose() {}
}

/**
 * mock 缺它會讓「class extends undefined」在模組載入期直接炸掉整條 hardening 流水線
 * ——真實教訓：任何在模組頂層 extends 的 Obsidian 類別，mock 都必須有對應樁。
 */
class FuzzySuggestModal extends Modal {
  constructor(app) { super(app); this.placeholder = ""; }
  setPlaceholder(p) { this.placeholder = p; }
  getItems() { return []; }
  getItemText(item) { return String(item); }
  onChooseItem() {}
}

class Component {
  constructor() { this._children = []; }
  registerEvent(e) { return e; }
  registerInterval(i) { return i; }
  load() {} unload() {}
}

class Setting {
  constructor(containerEl) { this.containerEl = containerEl || makeEl("div"); }
  setName() { return this; } setDesc() { return this; } addButton(cb) { cb({ onClick: () => {}, setButtonText: () => ({}) }); return this; }
  addDropdown(cb) { cb({ onChange: () => {}, setValue: () => ({}) }); return this; }
  addToggle(cb) { cb({ onChange: () => {}, setValue: () => ({}) }); return this; }
  addSlider() { return this; } addText() { return this; }
}

class ButtonComponent { constructor() { this.buttonEl = makeEl("button"); } setButtonText() { return this; } onClick(cb) { this._cb = cb; return this; } }
class DropdownComponent { constructor() {} onChange() { return this; } setValue() { return this; } }
class Menu { constructor() { this.items = []; } addItem(cb) { cb({ setTitle: () => ({}) }); return this; } }

class MarkdownRenderer {
  static async render() { return ""; }
}
MarkdownRenderer.renderMarkdown = async () => "";

class Notice {
  constructor(msg) { this.message = msg; }
  setMessage(m) { this.message = m; return this; }
  hide() {}
}

function getFrontMatterInfo(text) {
  return { frontmatter: null, contentStart: 0 };
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
}

function debounce(fn) {
  // Debouncer 介面：obsidian 真 API 提供 cancel/run（插件 unload 依賴 cancel）
  let timer = null;
  const d = (...args) => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; fn(...args); }, 0); return d; };
  d.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  d.run = (...args) => { d.cancel(); fn(...args); };
  return d;
}

async function requestUrl(opts) {
  throw new Error("requestUrl 在 headless 测试中不可用（需联网下载字体）"); }

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

/* R1：模組級自訂圖示註冊（headless 冒煙無 UI，記錄即可）。 */
const _iconsRegistered = [];
function addIcon(iconId, svgContent) { _iconsRegistered.push({ iconId, svgContent }); }

/* R1 修復（基線既有破損）：foliate 頂層 NodeFilter 常量求值，headless 無此全域。
   數值依 W3C DOM 規範，僅供常量求值。 */
if (typeof globalThis.NodeFilter === "undefined") {
  globalThis.NodeFilter = {
    FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3,
    SHOW_ALL: 4294967295, SHOW_ELEMENT: 1, SHOW_ATTRIBUTE: 2,
    SHOW_TEXT: 4, SHOW_CDATA_SECTION: 8, SHOW_ENTITY_REFERENCE: 16,
    SHOW_ENTITY: 32, SHOW_PROCESSING_INSTRUCTION: 64, SHOW_COMMENT: 128,
    SHOW_DOCUMENT: 256, SHOW_DOCUMENT_TYPE: 512, SHOW_DOCUMENT_FRAGMENT: 1024,
    SHOW_NOTATION: 2048,
  };
}
/* R1 修復（續）：foliate 頂層 HTMLElement / customElements 樁（同 base mock 註解）。 */
if (typeof globalThis.HTMLElement === "undefined") {
  globalThis.HTMLElement = class HTMLElement {};
}
if (typeof globalThis.customElements === "undefined") {
  globalThis.customElements = { define() {}, get() { return undefined; }, upgrade() {} };
}

module.exports = {
  Plugin, PluginSettingTab, ItemView, Modal, Component, Setting, FuzzySuggestModal,
  ButtonComponent, DropdownComponent, Menu, MarkdownRenderer, Notice,
  EditorSuggest, MarkdownView, TFolder, normalizePath,
  getFrontMatterInfo, arrayBufferToBase64, debounce, requestUrl,
  addIcon,
  // 僅作類型佔位的值符號（插件以 value import 引入，但僅作類型使用）
  App: class {}, TFile: class {}, WorkspaceLeaf: class {}, Editor: class {},
};

module.exports.Notice = class NoticeObserved {
  constructor(msg, timeout) {
    if (typeof global.Notice === "function") return new global.Notice(msg, timeout);
    this.message = String(msg);
  }
};
module.exports.debounce = debounce;
