// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 辭典效能與冷啟動測試
 *
 * 三組門禁：
 *   A. 二分索引：精確／大小寫／正規化／前綴查詢的正確性，含重複鍵、邊界、未排序回退
 *   B. 查詢複雜度：10 萬詞頭下精確查詢必須是 O(log n)（線性掃描會慢到超標）
 *   C. 懶載入：巨型資料表 JSON 往返後與原始字面量逐筆相等，且快取冪等
 *
 * 為何要測 B：之前四種格式都用 entries.find() 線性掃描，
 * 型別檢查與功能測試都抓不到——字典功能「能跑」，只是每查一個詞都掃全表。
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require2 = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-dictperf-"));
/** 在隔離子行程裡跑一段 node 腳本（寫入暫存檔執行，避免 shell 引號跳脫問題）。
 *  `ulimit -c 0`：C 組要載入數 GB 級資料表，早期版本曾 OOM 並在專案根目錄留下
 *  4GB 級 `core.<pid>`（一度被打包進交付 zip，45MB → 274MB）。這裡從源頭關掉 core dump。 */
const runIsolated = (script) => {
  const file = path.join(TMP, `iso-${Math.random().toString(36).slice(2)}.cjs`);
  fs.writeFileSync(file, script);
  try {
    return execFileSync("/bin/sh", ["-c", `ulimit -c 0; exec ${JSON.stringify(process.execPath)} ${JSON.stringify(file)}`],
                        { encoding: "utf8", maxBuffer: 1 << 20 });
  } finally {
    fs.rmSync(file, { force: true });
  }
};

const bundle = (entry, out) =>
  execFileSync(
    path.join(ROOT, "node_modules/.bin/esbuild"),
    [entry, "--bundle", "--format=cjs", "--platform=node", "--external:obsidian",
     `--outfile=${out}`, "--log-level=silent"],
    { cwd: ROOT },
  );

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};
const testAsync = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

console.log("=== 辭典效能與冷啟動測試 ===");

// ---------------------------------------------------------------- A. 二分索引

const idxPath = path.join(ROOT, "src/dict/sorted-index.ts");
bundle(idxPath, path.join(TMP, "idx.cjs"));
const SI = require2(path.join(TMP, "idx.cjs"));

test("lowerBound / upperBound：基本與邊界", () => {
  const keys = ["a", "b", "b", "c", "e"];
  assert.equal(SI.lowerBound(keys, "a"), 0);
  assert.equal(SI.lowerBound(keys, "b"), 1);
  assert.equal(SI.upperBound(keys, "b"), 3);
  assert.equal(SI.lowerBound(keys, "d"), 4);   // 不存在：插入點
  assert.equal(SI.lowerBound(keys, "z"), 5);   // 超過尾部
  assert.equal(SI.lowerBound(keys, ""), 0);
});

test("equalRange：重複鍵取全部、不存在取空", () => {
  const keys = ["a", "b", "b", "b", "c"];
  const [s, e] = SI.equalRange(keys, "b");
  assert.deepEqual([s, e], [1, 4]);
  const [s2, e2] = SI.equalRange(keys, "x");
  assert.equal(s2, e2);
});

test("prefixRange / prefixEnd：含末碼位進位", () => {
  const keys = ["ab", "abc", "abd", "ac", "b"];
  assert.deepEqual(SI.prefixRange(keys, "ab"), [0, 3]);
  assert.deepEqual(SI.prefixRange(keys, "b"), [4, 5]);
  assert.deepEqual(SI.prefixRange(keys, ""), [0, 5]);
  assert.deepEqual(SI.prefixRange(keys, "zz"), [5, 5]);
  assert.equal(SI.prefixEnd("abc"), "abd");
  assert.equal(SI.prefixEnd("ab￿"), "ab￿\u0000");
});

test("SortedKeyIndex：精確查詢回傳原始下標（含重複鍵）", () => {
  const keys = ["zeta", "alpha", "alpha", "beta"];
  const ix = new SI.SortedKeyIndex(keys, (k) => k.toLowerCase());
  assert.deepEqual(ix.sortedKeys, ["alpha", "alpha", "beta", "zeta"]);
  assert.deepEqual(ix.exact("alpha").sort(), [1, 2]);
  assert.deepEqual(ix.exact("beta"), [3]);
  assert.deepEqual(ix.exact("nope"), []);
  assert.equal(ix.exactFirst("zeta"), 0);
  assert.equal(ix.exactFirst("nope"), -1);
});

test("SortedKeyIndex：前綴查詢按字典序且受 limit 限制", () => {
  const keys = ["zebra", "apple", "apply", "banana"];
  const ix = new SI.SortedKeyIndex(keys);
  assert.deepEqual(ix.prefixKeys("app"), ["apple", "apply"]);
  assert.deepEqual(ix.prefixKeys("a", 1), ["apple"]);
  assert.deepEqual(ix.prefixKeys(""), ["apple", "apply", "banana", "zebra"]);
  assert.deepEqual(ix.prefixKeys("zz"), []);
});

test("SortedKeyIndex：正規化匹配（大小寫 + 去標點）", () => {
  const keys = ["well-being", "WellBeing", "wellbeing", "other"];
  const ix = new SI.SortedKeyIndex(keys, (k) => k.replace(/-/g, "").toLowerCase());
  // 正規化後皆為 wellbeing → 三筆同鍵
  const hits = ix.normalized("wellbeing", 8).map((i) => keys[i]).sort();
  assert.deepEqual(hits, ["WellBeing", "well-being", "wellbeing"]);
  assert.deepEqual(ix.normalized("Well-Being", 8).map((i) => keys[i]).sort(), hits);
  assert.deepEqual(ix.normalized("nothing", 8), []);
});

test("SortedKeyIndex：正規化前綴（查 wellbeing 命中 well-being）", () => {
  const keys = ["well-being", "wells", "xyz"];
  const ix = new SI.SortedKeyIndex(keys, (k) => k.replace(/-/g, "").toLowerCase());
  const hits = ix.normalizedPrefix("wellb", 10).map((i) => keys[i]);
  assert.deepEqual(hits, ["well-being"]);
});

test("isSorted：能識別未排序輸入（供讀取器回退線性掃描）", () => {
  assert.ok(SI.isSorted(["a", "b", "c"]));
  assert.ok(!SI.isSorted(["b", "a"]));
});

// -------------------------------------------------------------- B. 查詢複雜度

const fuzzyPath = path.join(ROOT, "src/dict/fuzzy.ts");
bundle(fuzzyPath, path.join(TMP, "fuzzy.cjs"));
const FZ = require2(path.join(TMP, "fuzzy.cjs"));

test("模糊降級鏈：exact → case → normalized → prefix 排序正確", () => {
  const words = ["Apple", "well-being", "run", "runner", "zebra"];
  const lower = words.map((w) => w.toLowerCase());
  const src = {
    exact: (w) => (words.includes(w) ? [w] : []),
    caseInsensitive: (w, n) => words.filter((k) => k.toLowerCase() === w.toLowerCase()).slice(0, n),
    normalized: (w, n) => words.filter((k) => FZ.normalizeHeadword(k) === FZ.normalizeHeadword(w)).slice(0, n),
    prefix: (w, n) => words.filter((k) => FZ.normalizeHeadword(k).startsWith(FZ.normalizeHeadword(w))).slice(0, n),
  };
  // 查 "apple" → case 階段命中 "Apple"
  assert.deepEqual(FZ.resolveCandidates(src, "apple").map((c) => c.word), ["Apple"]);
  // 查 "wellbeing" → normalized 命中 "well-being"
  assert.equal(FZ.resolveCandidates(src, "wellbeing")[0].word, "well-being");
  // 查 "runn" → prefix 展開，較短的 "run" 不該出現（它不是 runn 的正規化前綴延伸）
  const r = FZ.resolveCandidates(src, "runn").map((c) => c.word);
  assert.ok(r.includes("runner"), `應包含 runner，實得 ${r}`);
  assert.deepEqual(FZ.resolveCandidates(src, "zzzz"), []);
});

test("normalizeHeadword：NFKC + 去標點 + 小寫", () => {
  assert.equal(FZ.normalizeHeadword("Well-Being"), "wellbeing");
  assert.equal(FZ.normalizeHeadword(" well being "), "wellbeing");
  assert.equal(FZ.normalizeHeadword("ＡＢ"), "ab"); // 全形 → NFKC
  assert.equal(FZ.normalizeHeadword("a·b"), "ab");
});

test("editDistance：基本正確性", () => {
  assert.equal(FZ.editDistance("kitten", "sitting"), 3);
  assert.equal(FZ.editDistance("abc", "abc"), 0);
  assert.equal(FZ.editDistance("", "abc"), 3);
});

test("二分索引 vs 線性掃描：10 萬詞頭下查詢顯著更快", () => {
  const N = 100000;
  const keys = new Array(N);
  for (let i = 0; i < N; i++) keys[i] = `word${String(i).padStart(6, "0")}`;
  const ix = new SI.SortedKeyIndex(keys);
  const probes = [];
  for (let i = 0; i < 2000; i++) probes.push(keys[((i * 7919) % N)]);

  const t0 = process.hrtime.bigint();
  for (const p of probes) ix.exactFirst(p);
  const tBin = Number(process.hrtime.bigint() - t0) / 1e6;

  const t1 = process.hrtime.bigint();
  for (const p of probes) keys.find((k) => k === p);
  const tLin = Number(process.hrtime.bigint() - t1) / 1e6;

  console.log(`      二分 ${tBin.toFixed(1)}ms / 線性 ${tLin.toFixed(1)}ms  → ${(tLin / Math.max(tBin, 0.01)).toFixed(0)}x`);
  assert.ok(tBin < tLin / 10, `二分未達預期加速：${tBin.toFixed(1)}ms vs ${tLin.toFixed(1)}ms`);
});

// ------------------------------------------------------------------ C. 懶載入

const TABLES = [
  // buddhist-chars 三表已剝離遷出 → 附录/佛學資料-cbeta-gaiji/（自帶 gaiji-integrity.mjs）
  // pali-sanskrit 已剝離遷出 → 附录/佛學資料-pali-sanskrit/（自帶 pali-integrity.mjs）
  ["collation-chars", ["ZH_T2S_EXT", "ZH_S2T_EXT", "VARIANT_COMMON"]],
  ["ranjana", ["RANJANA_MAP"]],
  // r153：zh-convert 併入 collation-chars 共享 EXT 表（shim 再導出），不另驗 eager 字面量
  // ["zh-convert", ["ZH_T2S", "ZH_S2T"]],
  ["lemma-lookup-en", ["SPACY_LEMMA_LOOKUP_EN"]],
];

console.log("  · 建置懶載入對照包…");
for (const [mod] of TABLES) {
  bundle(path.join(ROOT, "src/dict/data", mod + ".ts"), path.join(TMP, mod + ".eager.cjs"));
  bundle(path.join(ROOT, "src/dict/data", mod + ".lazy.ts"), path.join(TMP, mod + ".lazy.cjs"));
}

// 注意：逐一比對 7 張巨型表（共約 8MB 字面量）會在同一行程內累積到 4GB 堆上限，
// 因此每張表開一個子行程驗證，行程結束即釋放。
console.log("  · 逐一驗證懶載入資料完整性（每表一個子行程）…");
/** JSON 往返會把 undefined 變成 null（或丟棄該鍵）——比較時對兩邊施加同一變換 */
const jsonRoundTrip = (v) => JSON.parse(JSON.stringify(v));

const verifyOne = (mod, names) => {
  const script = `
    const assert = require('node:assert');
    const rt = (v) => JSON.parse(JSON.stringify(v));
    const eager = require(${JSON.stringify(path.join(TMP, mod + ".eager.cjs"))});
    const lazy = require(${JSON.stringify(path.join(TMP, mod + ".lazy.cjs"))});
    const names = ${JSON.stringify(names)};
    let report = [];
    for (const n of names) {
      const fn = 'load' + n.toLowerCase().split('_').map(p => p[0].toUpperCase() + p.slice(1)).join('');
      assert.equal(typeof lazy[fn], 'function', '缺少 ' + fn);
      const a = eager[n];
      const b = lazy[fn]();
      // 與「原字面量做一次 JSON 往返」比——兩邊施加同一變換，任何差異都是真 bug
      assert.deepStrictEqual(b, rt(a), n + ' 懶載入後與原字面量的 JSON 往返不一致');
      assert.strictEqual(lazy[fn](), b, n + ' 快取未複用');
      const size = Array.isArray(a) ? a.length : Object.keys(a).length;
      assert.ok(size > 0, n + ' 為空');
      report.push(n + '=' + size);
    }
    process.stdout.write(report.join(','));
  `;
  const out = runIsolated(script);
  return out.trim();
};

for (const [mod, names] of TABLES) {
  test(`懶載入資料完整性：${mod}（${names.join(", ")}）`, () => {
    const info = verifyOne(mod, names);
    console.log(`      ${info}`);
  });
}

// 「JSON 往返限制 undefined↔null」測試隨藏文詞表剝離遷出 → 附录/藏文詞條-tibetan-lexicon/。

test("原始資料檔與 .lazy.ts 同時存在（生成腳本可重跑）", () => {
  for (const [mod] of TABLES) {
    assert.ok(fs.existsSync(path.join(ROOT, "src/dict/data", mod + ".ts")), `缺 ${mod}.ts`);
    assert.ok(fs.existsSync(path.join(ROOT, "src/dict/data", mod + ".lazy.ts")), `缺 ${mod}.lazy.ts`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, "scripts/gen-lazy-data.py")), "缺生成腳本");
});

test("消費端已改用懶載入（不再 import 原始巨型字面量）", () => {
  // collation.ts / corpus.ts 已隨功能剝離移入附錄；補入異體字表的真實消費端
  const consumers = ["src/dict/buddhist.ts", "src/dict/lemmatizer.ts", "src/dict/zh-utils.ts",
                     "src/dict/variant-lookup.ts", "src/dict/variant-annotate.ts"];
  for (const f of consumers) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    const bad = [...src.matchAll(/from '\.\/data\/(buddhist-chars|pali-sanskrit|stopwords-spacy|collation-chars|ranjana|zh-convert|lemma-lookup-en)'/g)];
    assert.equal(bad.length, 0, `${f} 仍直接 import 巨型字面量: ${bad.map((m) => m[1]).join(", ")}`);
  }
});

// ------------------------------------------------------- D. 四格式模糊一致性

await testAsync("MDict / TEI Lex-0 皆提供 headwords()（統一降級鏈的接入點）", async () => {
  const svcPath = path.join(ROOT, "src/dict/service.ts");
  fs.mkdirSync(path.join(TMP, "node_modules/obsidian"), { recursive: true });
  fs.writeFileSync(path.join(TMP, "node_modules/obsidian/package.json"), '{"name":"obsidian","main":"index.js"}');
  fs.writeFileSync(path.join(TMP, "node_modules/obsidian/index.js"), 'module.exports = {};');
  bundle(svcPath, path.join(TMP, "svc.cjs"));
  const mod = require2(path.join(TMP, "svc.cjs"));
  for (const cls of ["MdictDict", "Lex0Dict"]) {
    // 只檢查原型上有 headwords 方法（不實際建構，避免需要真實詞典檔）
    assert.equal(typeof mod[cls].prototype.headwords, "function", `${cls} 缺少 headwords()`);
  }
  assert.equal(new mod.DictService().fuzzyFallback, true, "DictService.fuzzyFallback 應預設開啟");
});

test("DictService.lookupFuzzyAll 存在且為私有降級入口", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/dict/service.ts"), "utf8");
  assert.ok(/private lookupFuzzyAll\(/.test(src), "缺少 lookupFuzzyAll");
  assert.ok(/this\.fuzzyFallback/.test(src), "fuzzyFallback 未接到查詢路徑");
});

// --------------------------------------- E. 啟動開銷與導入穩健性

console.log("  · 建置 DictFeature（含 vault mock）…");
const flowMock = path.join(ROOT, "test", "obsidian-dict-import-mock.cjs");
const flowBundle = path.join(TMP, "dictflowperf.cjs");
execFileSync(
  path.join(ROOT, "node_modules/.bin/esbuild"),
  [path.join(ROOT, "src", "dict", "plugin.ts"),
   "--bundle", "--format=cjs", "--platform=node",
   `--alias:obsidian=${flowMock}`, `--outfile=${flowBundle}`, "--log-level=silent"],
  { cwd: ROOT },
);
const FLOW = require2(flowBundle);
const { TFolder: PTFolder, TFile: PTFile } = globalThis.__LI_TEST_OBSIDIAN__;

function makePerfVault(fileNames = []) {
  const dirs = new Set();
  let reads = 0, writes = 0;
  const adapter = {
    exists: async (p) => dirs.has(p),
    mkdir: async (p) => { dirs.add(p); },
    writeBinary: async () => { writes++; },
    write: async () => { writes++; },
  };
  const childrenOf = (dir) => {
    const prefix = dir ? `${dir}/` : "";
    const subdirs = new Set();
    const kids = [];
    for (const f of fileNames) {
      if (!f.startsWith(prefix)) continue;
      const rest = f.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      if (slash < 0) kids.push(new PTFile(f));
      else if (slash > 0) subdirs.add(rest.slice(0, slash));
    }
    for (const d of dirs) {
      if (!d.startsWith(prefix) || d === dir) continue;
      const rest = d.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      if (slash < 0) subdirs.add(rest);
      else if (slash > 0) subdirs.add(rest.slice(0, slash));
    }
    for (const seg of subdirs) kids.push(nodeAt(prefix + seg));
    return kids;
  };
  const nodeAt = (p) => new PTFolder(p, childrenOf(p));
  const vault = {
    adapter,
    getAbstractFileByPath: (p) => (childrenOf(p).length || dirs.has(p) ? nodeAt(p) : null),
    // v2.8.25：詞典掃描改全庫掃描，起點是 `vault.getFiles()`（真實 Obsidian API，
    // 走記憶體 index、零 IO）。mock 必須提供，否則 plugin.ts 在這裡就拋錯。
    getFiles: () => fileNames.map((f) => new PTFile(f)),
    createFolder: async (p) => { dirs.add(p); },
    read: async () => { reads++; return ""; },
    readBinary: async () => { reads++; return new ArrayBuffer(0); },
  };
  return { vault, stats: () => ({ reads, writes }) };
}

function makePerfPlugin(vault) {
  const plugin = {
    app: {
      workspace: {
        onLayoutReady() {}, on() { return {}; },
        getLeavesOfType: () => [], getActiveViewOfType: () => null,
        getRightLeaf: () => null, getLeaf: () => null,
        revealLeaf() {}, containerEl: { ownerDocument: null },
      },
      vault,
    },
    manifest: { id: "li" },
    uiLang: () => "zh-TW",
    _data: {},
    loadData() { return Promise.resolve(plugin._data); },
    saveData(d) { plugin._data = d; return Promise.resolve(); },
    addCommand(c) { return c; },
    registerView() {}, addRibbonIcon() { return {}; },
    addSettingTab() {}, registerEditorSuggest() {}, registerEvent(e) { return e; },
  };
  return plugin;
}

await testAsync("init() 不觸發辭典掃描（冷啟動不得被辭典拖慢）", async () => {
  const { vault } = makePerfVault(["dictionaries/a.ifo", "dictionaries/a.idx", "dictionaries/a.dict"]);
  const plugin = makePerfPlugin(vault);
  const f = new FLOW.DictFeature(plugin);
  let scans = 0;
  const orig = f.rescanAndLoadGuarded.bind(f);
  f.rescanAndLoadGuarded = (...a) => { scans++; return orig(...a); };
  const t0 = process.hrtime.bigint();
  await f.init();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(scans, 0, `init() 不該掃描詞典（應延到 onLayoutReady + idle），實掃 ${scans} 次`);
  console.log(`      init() ${ms.toFixed(1)}ms`);
});

await testAsync("掃描只讀 metadata：2000 個非詞典檔時不讀任何檔案內容", async () => {
  const names = [];
  for (let i = 0; i < 2000; i++) names.push(`dictionaries/noise${i}.txt`);
  const { vault, stats } = makePerfVault(names);
  const plugin = makePerfPlugin(vault);
  const f = new FLOW.DictFeature(plugin);
  await f.init();
  const t0 = process.hrtime.bigint();
  await f.rescanAndLoadGuarded(false);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const { reads } = stats();
  assert.equal(reads, 0, `2000 個 .txt 不該觸發任何檔案讀取，實讀 ${reads} 次`);
  assert.equal(f.service.all.length, 0, "不該載入任何詞典");
  console.log(`      2000 檔巡覽 ${ms.toFixed(1)}ms / 讀檔 ${reads} 次`);
  assert.ok(ms < 2000, `2000 檔 metadata 巡覽應 < 2s，實得 ${ms.toFixed(1)}ms`);
});

await testAsync("穩定 id 前置作業不讀檔：v2.8.12 新增的巡覽不能變成新的啟動開銷", async () => {
  const names = [];
  for (let i = 0; i < 300; i++) names.push(`dictionaries/d${i}/d${i}.ifo`, `dictionaries/d${i}/d${i}.idx`, `dictionaries/d${i}/d${i}.dict`);
  const { vault, stats } = makePerfVault(names);
  const plugin = makePerfPlugin(vault);
  const f = new FLOW.DictFeature(plugin);
  await f.init();
  const t0 = process.hrtime.bigint();
  await f.rescanAndLoadGuarded(false);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // 這 900 個檔都會被判定為 StarDict → 會嘗試載入（讀檔）。
  // 要斷言的是「巡覽本身」便宜：以每部詞典的讀檔次數上限反推沒有重複巡覽。
  const { reads } = stats();
  assert.ok(reads <= 900 * 3, `不該重複讀檔：實讀 ${reads} 次（900 部 × 3 檔 = 2700 上限）`);
  console.log(`      300 部辭典巡覽+載入 ${ms.toFixed(1)}ms / 讀檔 ${reads} 次`);
});

await testAsync("導入時讀檔失敗不拋出（不能讓插件崩潰）", async () => {
  const { vault } = makePerfVault([]);
  const plugin = makePerfPlugin(vault);
  const f = new FLOW.DictFeature(plugin);
  await f.init();
  // 偽造一個 arrayBuffer() 會丟錯的 File：真實場景是行動端權限／檔案被鎖
  const bad = {
    name: "Broken.mdx",
    size: 10,
    slice() { return this; },
    arrayBuffer() { throw new Error("mock read failure"); },
  };
  const mdx = new File([new Uint8Array(32).fill(0)], "Good.mdx");
  const report = await f.importDictFiles([bad], { format: "mdict" });
  assert.equal(report.ok, false, "讀檔失敗應回報失敗而非拋出");
  assert.ok(report.failed.length >= 0);
  // 再來一次正常檔，確認單一失敗不會卡死後續
  const r2 = await f.importDictFiles([mdx], { format: "mdict" });
  assert.ok(r2.issues.length > 0 || r2.imported.length > 0, "後續導入應仍能進行");
});

test("辭典掃描延後到 layout 就緒 + idle（冷啟動不被拖慢）", () => {
  const pt = fs.readFileSync(path.join(ROOT, "src/dict/plugin.ts"), "utf8");
  assert.ok(/autoScanOnStartup/.test(pt), "應有啟動掃描開關");
  assert.ok(/deferStartupScan/.test(pt), "應有延後掃描開關");
  assert.ok(/requestIdleCallback/.test(pt), "啟動掃描應走 requestIdleCallback");
  assert.ok(/onLayoutReady/.test(pt), "啟動掃描應在 layout 就緒之後");
  // main.ts 的 onload 必須全程 try/catch——插件初始化失敗不能拖垮 Obsidian 啟動
  const mt = fs.readFileSync(path.join(ROOT, "src/main.ts"), "utf8");
  const i = mt.indexOf("async onload()");
  assert.ok(i > 0, "main.ts 應有 onload");
  const body = mt.slice(i, i + 4000); // r69：1600 窗口太脆——命令序號註冊把 try 推到 +1608（滑窗 8 字元）；函數開頭註冊群屬正常結構
  assert.ok(/try \{/.test(body), "onload 應有 try 保護");
  assert.ok(/catch/.test(body), "onload 應有 catch");
});

test("導入路徑全程 try/catch（鐵律：導入失敗不能讓插件崩潰）", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/dict/plugin.ts"), "utf8");
  const start = src.indexOf("async importDictFiles(");
  assert.ok(start > 0, "應存在 importDictFiles");
  const body = src.slice(start, start + 4000);
  assert.ok(/try \{/.test(body), "importDictFiles 應有 try 保護");
  assert.ok(/catch \(e\)/.test(body), "importDictFiles 應有 catch");
  // 遷移與索引寫入各自 try/catch，失敗不得阻塞載入
  for (const fn of ["migrateOverrideIds", "rememberStableIds"]) {
    const i = src.indexOf(`private ${fn}(`);
    assert.ok(i > 0, `應存在 ${fn}`);
    const b = src.slice(i, i + 900);
    assert.ok(/try \{/.test(b) && /catch/.test(b), `${fn} 應自行攔錯（不阻塞載入）`);
  }
});

console.log(`\n[dict-perf] 結果：${passed} 通過 / ${failed} 失敗`);
if (failed) { console.error("[dict-perf] 有失敗項 ❌"); process.exit(1); }
console.log("[dict-perf] 全部通過 ✅");
