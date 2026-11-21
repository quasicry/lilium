"use strict";
/*
 * 辭典導入流程測試（dict-import-flow.mjs）專用的 obsidian 模擬。
 *
 * 與 obsidian-dict-mock.cjs 的差別：這裡的 TFolder / TFile 是**真的可用**的類別
 * （有 path / name / children），並透過 globalThis 暴露出去——
 * 測試要建構 vault 目錄樹，且 plugin.ts 用 `instanceof TFolder` 判斷，
 * 兩側必須拿到同一個類別實例（同一個 bundle 內）。
 */
const base = require("./obsidian-dict-mock.cjs");

class TFolder {
  constructor(path, children = []) {
    this.path = path;
    this.name = String(path).split("/").pop();
    this.children = children;
  }
}

class TFile {
  constructor(path) {
    this.path = path;
    this.name = String(path).split("/").pop();
    const dot = this.name.lastIndexOf(".");
    this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
    this.extension = dot > 0 ? this.name.slice(dot + 1) : "";
    // 辭典掃描改全庫掃描，起點是 `vault.getFiles()`，並用
    // `file.parent instanceof TFolder` 分組。真實 Obsidian 的 TFile 一定有
    // parent（根目錄下的檔也有根 TFolder），mock 必須提供，否則全庫掃描
    // 會把所有檔案 skip 掉。根目錄下的檔案 parent 給根資料夾。
    const slash = String(path).lastIndexOf("/");
    this.parent = slash > 0 ? new TFolder(String(path).slice(0, slash)) : (slash === 0 ? new TFolder("") : null);
  }
}

globalThis.__LI_TEST_OBSIDIAN__ = { TFolder, TFile };

module.exports = Object.assign({}, base, {
  TFolder,
  TFile,
  normalizePath: (p) => String(p),
});
