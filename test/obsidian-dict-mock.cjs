"use strict";
/*
 * 辭典模組（DictFeature）冒煙測試專用的最小 obsidian 模擬。
 * 在共享 obsidian-mock.cjs 基礎上補齊 DictFeature.init() 路徑實際引用、
 * 但共享 mock 未提供的符號（EditorSuggest 等）。
 * 真實瀏覽器行為（CM6 / MarkdownRenderer）不在範圍內——冒煙測試不觸發命令回調。
 */
const base = require("./obsidian-mock.cjs");

// Obsidian EditorSuggest 基類：DictFeature.init() 會建構 InlineDictSuggest 並 super(app)
class EditorSuggest {
  constructor(app) {
    this.app = app;
  }
}

module.exports = Object.assign({}, base, {
  EditorSuggest,
  // 運行期命令回調才用到的符號：僅作型別/構造佔位（冒煙測試不觸發回調）
  normalizePath: (p) => String(p),
  MarkdownView: class {},
  Editor: class {},
  TFolder: class {},
});
