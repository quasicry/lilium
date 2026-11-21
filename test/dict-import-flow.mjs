// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 辭典導入**端到端流程**測試。
 *
 * 與 dict-import.mjs 的分工：
 *  - dict-import.mjs：純函式（副檔名規格／嗅探／穩定 id 演算法）
 *  - 本檔：真的把檔案寫進（模擬的）vault、真的重掃、真的載入一部合成 TEI Lex-0，
 *          驗證「導入 → 寫檔 → 自動掃描 → 穩定 id → 設定跨重掃保留」整條鏈。
 *
 * 同時守住三條硬約束：錯配禁止、1GB 上限、以及「任何情況都不能讓插件崩潰」。
 *
 * 用法：node test/dict-import-flow.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });

console.log("[dict-import-flow] bundling src/dict/plugin.ts …");
const outfile = path.join(TMP, "dictimportflow.mjs");
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "src", "dict", "plugin.ts"),
  "--bundle", "--format=esm", "--platform=node",
  `--alias:obsidian=${path.join(ROOT, "test", "obsidian-dict-import-mock.cjs")}`,
  `--outfile=${outfile}`,
], { stdio: "pipe" });

// esbuild bundle 含 src/dict/plugin.ts 的 window.setTimeout 引用（Node 無 window）——
// 在 import 前掛 shim：window 即 globalThis，讓產品碼在測試環境取到全域計時器。
globalThis.window = globalThis;

const mod = await import(outfile);
const { DictFeature } = mod;
const { TFolder, TFile } = globalThis.__LI_TEST_OBSIDIAN__;
assert.ok(TFolder && TFile, "mock 應透過 globalThis 暴露 TFolder / TFile");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${(e && e.stack) || e}`); }
}

/* ---------------- 模擬 vault ---------------- */

function makeVault() {
  const files = new Map(); // path → Buffer
  const dirs = new Set();
  const adapter = {
    exists: async (p) => files.has(p) || dirs.has(p),
    mkdir: async (p) => { dirs.add(p); },
    writeBinary: async (p, buf) => { files.set(p, Buffer.from(buf)); },
    write: async (p, text) => { files.set(p, Buffer.from(String(text), "utf8")); },
    remove: async (p) => { files.delete(p); },
  };
  const vault = {
    adapter,
    /** 由 files/dirs 重建 TFolder 樹，供 loadFromFolder 遞迴 */
    getAbstractFileByPath(p) {
      return nodeAt(p);
    },
    async createFolder(p) { dirs.add(p); },
    async read(file) {
      const b = files.get(file?.path ?? file);
      if (!b) throw new Error(`no such file: ${file?.path ?? file}`);
      return b.toString("utf8");
    },
    async readBinary(file) {
      const b = files.get(file?.path ?? file);
      if (!b) throw new Error(`no such file: ${file?.path ?? file}`);
      return new Uint8Array(b).slice().buffer;
    },
    // 辭典掃描改全庫掃描，起點是 `vault.getFiles()`。
    // 這裡原本回的是**路徑字串**（`files` 的 key），以前沒人用所以沒暴露；
    // 全庫掃描會去讀 `f.name` / `f.parent`，餵字串會讓每部詞典都找不到，
    // 必須回真的 `TFile`（與 childrenOf() 同一個構造來源）。
    getFiles() { return [...files.keys()].map((p) => new TFile(p)); },
  };
  /** 某一層的直接子節點（中繼資料夾由檔案路徑自動推導，不必顯式 mkdir） */
  function childrenOf(dirPath) {
    const prefix = dirPath ? `${dirPath}/` : "";
    const childDirs = new Set();
    const children = [];
    for (const f of files.keys()) {
      if (!f.startsWith(prefix)) continue;
      const rest = f.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      if (slash < 0) children.push(new TFile(f));
      else if (slash > 0) childDirs.add(rest.slice(0, slash));
    }
    for (const d of dirs) {
      if (!d.startsWith(prefix) || d === dirPath) continue;
      const rest = d.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      if (slash < 0) childDirs.add(rest);
      else if (slash > 0) childDirs.add(rest.slice(0, slash));
    }
    for (const seg of childDirs) children.push(nodeAt(prefix + seg));
    return children;
  }
  /** 取某路徑的節點；不存在（沒有任何子孫）時回 null */
  function nodeAt(p) {
    const kids = childrenOf(p);
    if (!kids.length && !dirs.has(p) && !files.has(p)) return null;
    if (files.has(p)) return new TFile(p);
    return new TFolder(p, kids);
  }
  return { vault, files, dirs };
}

function makeMockPlugin(vault) {
  const plugin = {
    app: {
      workspace: {
        onLayoutReady(cb) { plugin._layoutReady = cb; },
        on() { return {}; },
        getLeavesOfType() { return []; },
        getActiveViewOfType() { return null; },
        getRightLeaf() { return null; },
        getLeaf() { return null; },
        revealLeaf() {},
        containerEl: { ownerDocument: null },
      },
      vault,
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

/** 合成一部最小可載入的 TEI Lex-0（1 個檔案）。 */
function makeTeiBundle(base = "TestDict") {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0">
  <teiHeader><fileDesc><titleStmt><title>${base}</title></titleStmt></fileDesc></teiHeader>
  <text><body>
    <entry><form><orth>a</orth></form><sense><def>alpha</def></sense></entry>
    <entry><form><orth>b</orth></form><sense><def>beta</def></sense></entry>
  </body></text>
</TEI>`;
  const mk = (name, buf) => new File([new Uint8Array(buf)], name);
  return { files: [mk(`${base}.lex0.xml`, Buffer.from(xml, "utf8"))], xml };
}

/**
 * 【同典跨夾配套】測試用最小 .mdx 生成器（與 dict-mdict.mjs 同構：v2.0＋zlib）。
 */
function writeBE(value, width) {
  const buf = Buffer.alloc(width);
  buf.writeBigUInt64BE(BigInt(value));
  return width === 4 ? buf.subarray(4) : buf;
}
function blockPrefix() {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(2, 0);
  return b;
}
function buildMdx(entries) {
  const texts = entries.map((e) => e.html);
  const recordRaw = Buffer.concat(texts.map((t) => Buffer.from(t, "utf-8")));
  const recordBlock = Buffer.concat([blockPrefix(), zlib.deflateSync(recordRaw)]);
  const keyBlockParts = [];
  let off = 0;
  entries.forEach((e) => {
    keyBlockParts.push(writeBE(off, 8));
    keyBlockParts.push(Buffer.from(e.head, "utf-8"), Buffer.from([0]));
    off += Buffer.byteLength(e.html, "utf-8");
  });
  const keyBlockRaw = Buffer.concat(keyBlockParts);
  const keyBlock = Buffer.concat([blockPrefix(), zlib.deflateSync(keyBlockRaw)]);
  const infoRaw = Buffer.concat([
    writeBE(entries.length, 8),
    (() => { const k = Buffer.from(entries[0].head, "utf-8"); return Buffer.concat([Buffer.from([0, k.length]), k, Buffer.from([0])]); })(),
    (() => { const k = Buffer.from(entries[entries.length - 1].head, "utf-8"); return Buffer.concat([Buffer.from([0, k.length]), k, Buffer.from([0])]); })(),
    writeBE(keyBlock.length, 8),
    writeBE(keyBlockRaw.length, 8),
  ]);
  const keyInfoPrefix = Buffer.alloc(8);
  keyInfoPrefix.writeUInt32LE(2, 0);
  const keyInfo = Buffer.concat([keyInfoPrefix, zlib.deflateSync(infoRaw)]);
  const headerText = Buffer.from(
    `<Library Title="Scan Dict" Description="fixture" Encoding="UTF-8" GeneratedByEngineVersion="2.0"></Library>`,
    "utf-16le",
  );
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32BE(headerText.length);
  const keyHeader = Buffer.concat([
    writeBE(1, 8), writeBE(entries.length, 8), writeBE(infoRaw.length, 8),
    writeBE(keyInfo.length, 8), writeBE(keyBlock.length, 8), Buffer.alloc(4),
  ]);
  const recordHeader = Buffer.concat([
    writeBE(1, 8), writeBE(entries.length, 8), writeBE(16, 8), writeBE(recordBlock.length, 8),
  ]);
  const recordInfo = Buffer.concat([writeBE(recordBlock.length, 8), writeBE(recordRaw.length, 8)]);
  return Buffer.concat([headerLen, headerText, Buffer.alloc(4), keyHeader, keyInfo, keyBlock, recordHeader, recordInfo, recordBlock]);
}
/* ---------------- 主流程 ---------------- */

console.log("\n[dict-import-flow] 導入 → 寫檔 → 自動掃描");

const { vault, files } = makeVault();
const plugin = makeMockPlugin(vault);
const feature = new DictFeature(plugin);
await feature.init();

await test("導入 TEI Lex-0 → 建立 <根>/tei-lex0/<辭典名>/ 並自動重掃載入", async () => {
  const bundle = makeTeiBundle("TestDict");
  const report = await feature.importDictFiles(bundle.files, { format: "auto" });
  assert.equal(report.ok, true, `應導入成功，實得 issues=${JSON.stringify(report.issues)}`);
  assert.equal(report.format, "tei-lex0");
  assert.equal(report.targetDir, "dictionaries/tei-lex0/TestDict");
  assert.equal(report.imported.length, 1, `應寫入 1 個檔，實得 ${report.imported.length}`);
  for (const p of ["TestDict.lex0.xml"]) {
    assert.ok(files.has(`dictionaries/tei-lex0/TestDict/${p}`), `應存在 ${p}`);
  }
  // 導入後自動掃描（B2 要求）→ 辭典應已載入
  assert.equal(feature.service.all.length, 1, `應載入 1 部辭典，實得 ${feature.service.all.length}`);
  assert.equal(feature.service.all[0].meta.name, "TestDict");
});

await test("穩定 id（2A）：兩次重掃 id 不變，且由 format＋基名衍生", async () => {
  const first = feature.service.all[0].meta.id;
  assert.equal(first, "tei-lex0-testdict", `id 應為 tei-lex0-testdict，實得 ${first}`);
  await feature.rescanAndLoadGuarded(false);
  assert.equal(feature.service.all.length, 1, "重掃後仍應是 1 部");
  assert.equal(feature.service.all[0].meta.id, first, "重掃後 id 不該變（每次都換）");
});

await test("設定跨重掃保留（2A 的實際收益）：停用／改名／分組都不再丟", async () => {
  const id = feature.service.all[0].meta.id;
  await feature.store.setOverride(id, { enabled: false, displayName: "我的辭典", group: "佛學" });
  await feature.rescanAndLoadGuarded(false);
  const d = feature.service.all[0];
  assert.equal(d.meta.id, id, "id 仍應一致");
  assert.equal(feature.service.isEnabled(d), false, "停用狀態應跨重掃保留");
  assert.equal(feature.service.displayName(d), "我的辭典", "改名應跨重掃保留");
  assert.equal(feature.service.groupOf(d), "佛學", "分組應跨重掃保留");
  // 復原，避免污染後續測試
  await feature.store.setOverride(id, { enabled: true, displayName: undefined, group: "" });
});

await test("錯配格式：把 .lex0.xml 塞進 MDict 入口 → 整批拒絕，一個檔都不寫", async () => {
  const bundle = makeTeiBundle("WrongFmt");
  const before = files.size;
  const report = await feature.importDictFiles(bundle.files, { format: "mdict" });
  assert.equal(report.ok, false, "錯配必須被禁止");
  assert.ok(report.issues.length, "應回傳拒絕原因");
  assert.equal(report.issues[0].code, "wrongFormat");
  assert.equal(files.size, before, "被拒絕時不該留下任何檔案");
  assert.ok(!files.has("dictionaries/mdict/WrongFmt/WrongFmt.lex0.xml"), "不該寫入 .lex0.xml");
});

await test("內容與副檔名不符也能擋（.lex0.xml 內容其實不是 TEI）", async () => {
  const before = files.size;
  const fake = new File([new Uint8Array(Buffer.from("hello world, definitely not TEI\n", "utf8"))], "Fake.lex0.xml");
  const report = await feature.importDictFiles([fake], { format: "tei-lex0" });
  assert.equal(report.ok, false, "內容不符應拒絕");
  assert.equal(report.issues[0].code, "contentInvalid");
  assert.equal(files.size, before);
});

await test("單檔超過 1GB → 拒絕且不寫入", async () => {
  const before = files.size;
  // 用「宣告 size 超限」的假 File：真的生 1GB 太慢，且此處只驗裁決邏輯
  const big = new File([new Uint8Array(Buffer.from("x", "utf8"))], "Huge.mdx");
  Object.defineProperty(big, "size", { value: 1024 * 1024 * 1024 + 1 });
  const report = await feature.importDictFiles([big], { format: "mdict" });
  assert.equal(report.ok, false, "超限應拒絕");
  assert.ok(report.issues.some((i) => i.code === "tooLarge"), JSON.stringify(report.issues));
  assert.equal(files.size, before, "超限不該寫入任何檔案");
});

await test("必需檔缺失（空清單）→ empty", async () => {
  const before = files.size;
  const report = await feature.importDictFiles([], { format: "tei-lex0" });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === "empty"), JSON.stringify(report.issues));
  assert.equal(files.size, before);
});

await test("未知副檔名 → unknownExt", async () => {
  const before = files.size;
  const only = new File([new Uint8Array(Buffer.from("StarDict's dict ifo file\nbookname=X\n", "utf8"))], "Partial.ifo");
  const report = await feature.importDictFiles([only], { format: "tei-lex0" });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === "unknownExt"), JSON.stringify(report.issues));
  assert.equal(files.size, before);
});

await test("覆蓋更新：同名再導入一次 → overwritten=1，不產生副本", async () => {
  const bundle = makeTeiBundle("TestDict");
  const report = await feature.importDictFiles(bundle.files, { format: "auto", overwrite: true });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.equal(report.overwritten, 1, `同名檔應被覆蓋，實得 ${report.overwritten}`);
  assert.equal([...files.keys()].filter((p) => p.startsWith("dictionaries/")).length, 1, `覆蓋不該新增詞典檔案，實得 ${[...files.keys()]}`);
});

await test("不勾覆蓋時同名檔被跳過（skipped）", async () => {
  const bundle = makeTeiBundle("TestDict");
  const report = await feature.importDictFiles(bundle.files, { format: "auto", overwrite: false });
  assert.equal(report.skipped.length, 1, `同名檔應跳過，實得 ${report.skipped.length}`);
  assert.equal(report.imported.length, 0);
});

await test("補錄模式（B5）：指定目標資料夾後，單檔配套也能導入", async () => {
  const mdd = new File([new Uint8Array(Buffer.from("MDD0", "utf8"))], "TestDict.mdd");
  const report = await feature.importDictFiles([mdd], {
    targetDir: "dictionaries/mdict/TestDict",
    dictName: "TestDict",
  });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.ok(files.has("dictionaries/mdict/TestDict/TestDict.mdd"), "應寫進該詞典自己的資料夾");
});

await test("補錄模式仍擋錯配（TEI 檔不能補進 MDict 詞典）", async () => {
  const tei = new File([new Uint8Array(Buffer.from('<TEI type="lex-0"><entry/></TEI>', "utf8"))], "no.lex0.xml");
  const report = await feature.importDictFiles([tei], {
    targetDir: "dictionaries/mdict/TestDict",
    format: "mdict", // UI 由 fixedFormat 帶入該詞典自己的格式
  });
  assert.equal(report.ok, false, "補錄也必須擋錯配");
  assert.equal(report.issues[0].code, "wrongFormat");
});

await test("空 vault 重掃不拋錯（不能讓插件崩潰）", async () => {
  const empty = makeVault();
  const p2 = makeMockPlugin(empty.vault);
  const f2 = new DictFeature(p2);
  await f2.init();
  await f2.rescanAndLoadGuarded(true);
  assert.equal(f2.service.all.length, 0);
});

await test("資料夾不存在時導入不拋錯（自動建立）", async () => {
  const v = makeVault();
  const p3 = makeMockPlugin(v.vault);
  const f3 = new DictFeature(p3);
  await f3.init();
  const bundle = makeTeiBundle("Fresh");
  const report = await f3.importDictFiles(bundle.files, { format: "auto" });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.ok(v.files.has("dictionaries/tei-lex0/Fresh/Fresh.lex0.xml"));
});

await test("辭典名含路徑分隔符時被清洗（不產生路徑穿越）", async () => {
  const v = makeVault();
  const p4 = makeMockPlugin(v.vault);
  const f4 = new DictFeature(p4);
  await f4.init();
  const bundle = makeTeiBundle("Evil");
  const renamed = bundle.files.map((f) => new File([f], f.name));
  const report = await f4.importDictFiles(renamed, { format: "tei-lex0", dictName: "../../escape" });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.ok(report.targetDir.startsWith("dictionaries/tei-lex0/"), `targetDir 不該逃逸：${report.targetDir}`);
  assert.ok(!report.targetDir.includes(".."), `targetDir 不該含 ..：${report.targetDir}`);
});

/* ---------------- 同典跨夾配套＋img 桶掛 MDict ---------------- */

await test("【同典跨夾配套】辭典A/test.mdx＋辭典A/css/test.css＋辭典A/img/x.png → css/x.png 進 meta.assets", async () => {
  const v = makeVault();
  const mdx = buildMdx([{ head: "hello", html: "<b>hello</b> 你好" }]);
  v.files.set("dictionaries/辭典A/test.mdx", mdx);
  v.files.set("dictionaries/辭典A/css/test.css", Buffer.from(".x{color:red}", "utf8"));
  v.files.set("dictionaries/辭典A/img/x.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const p5 = makeMockPlugin(v.vault);
  const f5 = new DictFeature(p5);
  await f5.init();
  await f5.rescanAndLoadGuarded(false);
  const dicts = f5.service.all;
  assert.equal(dicts.length, 1, `應載入 1 部辭典（子夾獨立組，不雙重載入），實得 ${dicts.length}`);
  const d = dicts[0];
  assert.equal(d.meta.format, "mdict");
  const assets = d.meta.assets || [];
  const css = assets.find((a) => a.kind === "css");
  const img = assets.find((a) => a.kind === "image");
  assert.ok(css, `css 應進 assets，實得 ${JSON.stringify(assets)}`);
  assert.ok(css.vaultPath.startsWith("lilium/assets/"), "css vaultPath 應指向 ASSET_FOLDER");
  assert.ok(img, "父夾層級 img/ 子夾的圖片應進 assets");
  assert.ok(img.vaultPath.startsWith("lilium/assets/"), "圖片 vaultPath 應指向 ASSET_FOLDER");
  // 復原臨時檔案
  v.files.delete("dictionaries/辭典A/test.mdx");
  v.files.delete("dictionaries/辭典A/css/test.css");
  v.files.delete("dictionaries/辭典A/img/x.png");
});

await test("【img 桶掛 MDict】'' 桶圖片（同夾散置 png）attach 給 mdict", async () => {
  const v = makeVault();
  const mdx = buildMdx([{ head: "hello", html: "<b>hello</b> 你好" }]);
  v.files.set("dictionaries/m/Test.mdx", mdx);
  v.files.set("dictionaries/m/pic.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const p6 = makeMockPlugin(v.vault);
  const f6 = new DictFeature(p6);
  await f6.init();
  await f6.rescanAndLoadGuarded(false);
  assert.equal(f6.service.all.length, 1, `應載入 1 部，實得 ${f6.service.all.length}`);
  const assets = f6.service.all[0].meta.assets || [];
  assert.ok(assets.some((a) => a.kind === "image" && a.mddKey === "pic.png"), `圖片應進 assets：${JSON.stringify(assets)}`);
  v.files.delete("dictionaries/m/Test.mdx");
  v.files.delete("dictionaries/m/pic.png");
});

/* ---------------- 收尾 ---------------- */
console.log(`\n结果: ${passed} 通过, ${failures.length} 失败`);
if (failures.length) process.exit(1);
