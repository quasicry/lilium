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
  }
  addCommand(cmd) { this._commands.push(cmd); return cmd; }
  registerView(type, factory) { this._views.push({ type, factory }); }
  registerEvent(evt) { this._events.push(evt); return evt; }
  /* 標準 Obsidian Plugin.register(cb)：註冊卸載回調。device-smoke 的 headless 環境
     此前缺失此方法，致 main.ts 中未加 guard 的 `this.register(() => {...})` 卸載回調
     在 mock 下拋 "this.register is not a function"，中斷 onload → DictFeature 等後續模組
     無法掛載。補齊後 onload 不再中斷。 */
  register(cb) { (this._registrations ||= []).push(cb); return cb; }
  registerInterval(id) { return id; }
  addRibbonIcon() { return makeEl("div"); }
  addStatusBarItem() { return makeEl("div"); }
  addSettingTab(tab) { this._tabs.push(tab); }
  registerEditorSuggest(s) { (this._suggest ||= []).push(s); return s; }
  /* 直排選取接管（CM6 擴展）註冊。真實 Obsidian 為 Plugin 方法，
     mock 只記錄，供斷言使用。 */
  registerEditorExtension(ext) { (this._editorExtensions ||= []).push(ext); return ext; }
  /* 全域滾輪攔截（capture）。mock 的 document / body 未必實現
     事件接口，故加 try 保護——無 DOM 事件能力時僅記錄，不拋錯。 */
  registerDomEvent(el, type, handler, opts) {
    try {
      if (el && typeof el.addEventListener === "function") el.addEventListener(type, handler, opts);
    } catch { /* headless mock 無事件能力 */ }
    (this._domEvents ||= []).push({ el, type, handler });
    return handler;
  }
  async loadData() { return null; }
  async saveData() {}
}

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
 * mock 缺它會讓「class extends undefined」在模組載入期直接炸掉整條 smoke／hardening
 * 流水線 —— 教訓：任何在模組頂層 extends 的 Obsidian 類別，mock 都必須有對應樁。
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

/** 行內查詞建議器基類（辭典模組 InlineDictSuggest 繼承） */
class EditorSuggest {
  constructor(plugin) { this.plugin = plugin; }
}

/** Markdown 編輯/預覽視圖（getActiveViewOfType 參數，運行時作值引用；非基類實例化） */
class MarkdownView {}

/** 資料夾（辭典掃描遞歸用） */
class TFolder {
  constructor(path) { this.path = path; this.children = []; this.name = String(path || "").split("/").pop() || ""; }
}

/** 編輯器類型佔位（hover-lookup 以值引用） */
class Editor {}

function normalizePath(p) { return String(p).replace(/\\/g, "/"); }

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

function debounce(fn) { return (...args) => fn(...args); }

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

/* R1：模組級自訂圖示註冊（headless 無 UI，記錄以供需要時斷言）。 */
const _iconsRegistered = [];
function addIcon(iconId, svgContent) { _iconsRegistered.push({ iconId, svgContent }); }

/* R1 修復（基線既有破損）：M3 起 foliate/text-walker.js 頂層求值 NodeFilter 常量，
   headless Node 無此全域 → 打包 main.ts 的冒煙測試在 import 期即崩。
   補上 W3C DOM NodeFilter 常量（數值依規範），僅供常量求值，不做遍歷。 */
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
/* R1 修復（續）：foliate view.js / paginator.js 頂層 class extends HTMLElement
   與 customElements.define —— headless 補最小樁（僅求值，不構造、不掛載；
   class 欄位初始化在構造期才跑，冒煙測試不會構造 foliate 元素）。 */
if (typeof globalThis.HTMLElement === "undefined") {
  globalThis.HTMLElement = class HTMLElement {};
}
if (typeof globalThis.customElements === "undefined") {
  globalThis.customElements = { define() {}, get() { return undefined; }, upgrade() {} };
}

module.exports = {
  Plugin, PluginSettingTab, ItemView, Modal, Component, Setting, FuzzySuggestModal,
  ButtonComponent, DropdownComponent, Menu, MarkdownRenderer, Notice,
  getFrontMatterInfo, arrayBufferToBase64, debounce, requestUrl,
  EditorSuggest, MarkdownView, TFolder, Editor, normalizePath,
  addIcon,
  // 僅作類型佔位的值符號（插件以 value import 引入，但僅作類型使用）
  App: class {}, TFile: class {}, WorkspaceLeaf: class {},
};
