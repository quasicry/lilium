// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 三端驗證底盤 ·跨平台守門單測
 *
 * 這份守的是「桌面 / 平板 / 手機都要正常」這句話怎麼落地：
 * 不能靠每次改完記得核對，要靠一個每次都跑、錯了就紅的閘門。
 *
 * 這裡特別用力守住兩件事 —— 兩邊都不能偏：
 *
 *  1. **不能漏抓（假陰性比假陽性危險）**
 *     Node 專用 API 只要出現在 src/ 下，行動端載入就是白屏。所以
 *     `from "fs"` / `require("fs")` / `import("node:fs")` / `Buffer.from()`
 *     / `process.platform` / `__dirname` 這六種寫法都要各自被抓到，
 *     還得帶測試確認「寫在註解裡的也要能辨識」這種灰色地帶。
 *
 *  2. **也不能亂抓（誤報一多，閘門就會被關掉）**
 *     第一版就有這個毛病：`require("./data/x.lazy")`、`require("fflate")`
 *     （都是 esbuild 合法 lazy load）、`FlexBuffer`（類別名）、
 *     `dropZone` / `dropCapCss`（識別符含 drop）、英文文案裡的
 *     "drag & drop" —— 全部被誤判成拖放互動。修正後這裡把這些
 *     **逐條寫成斷言**，防止有人「簡化」規則時又把誤報放回去。
 *
 *  3. **棘輪語義**
 *     baseline 的目的是「既有風險凍結、不許新增」，所以：
 *     新增一處 → 紅；baseline 裡的條目消失了 → 也要紅（提醒來更新 baseline）。
 *
 * 跑：node test/platform-gate.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  stripComments,
  analyzeFile,
  scan,
  compare,
  RULES,
} from "../scripts/check-platform.mjs";

const ROOT = process.cwd();

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  ✗ ${name}`);
  }
};

/** 只取某規則在某檔案上的結果 */
const ruleHit = (hits, id) => hits.find((h) => h.rule === id);

console.log("\n=== 三端驗證底盤 ·跨平台守門單測 ===\n");

/* ================================================================== */
/* 一、註解剝離：保護字串、剔除註解                                     */
/* ================================================================== */

console.log("--- 1. stripComments ---");

test("[1] 行註解被剔除，且後面的程式碼保留", () => {
  const out = stripComments("const a = 1; // Buffer.from(x)\nconst b = 2;");
  assert.ok(!out.includes("Buffer.from"), "註解裡的 Buffer.from 不該被當成真實用法");
  assert.ok(out.includes("const b = 2"), "註解後面的程式碼要留著");
});

test("[1] 字串裡的 https:// 不得讓後續內容被吃掉", () => {
  const src = 'const url = "https://example.com/x"; // tail\nconst keep = process.platform;';
  const out = stripComments(src);
  assert.ok(out.includes("https://example.com/x"), "雙引號內的網址要保留");
  assert.ok(out.includes("process.platform"), "網址那一行之後的程式碼要留著");
});

test("[1] 單引號內含 // 也不受害", () => {
  const out = stripComments("const a = '//not a comment';\nconst b = 1;");
  assert.ok(out.includes("//not a comment"), "單引號內的 // 是資料不是註解");
  assert.ok(out.includes("const b = 1"));
});

test("[1] 區塊註解跨行剔除，行號不被位移（用 \\n 保留計）", () => {
  const src = "line1\n/* multi\nline\ncomment */\nline5";
  const out = stripComments(src);
  const lines = out.split("\n").length;
  assert.strictEqual(lines, 5, `剝離後行數應仍為 5，實得 ${lines}（行號位移會讓舉報行號亂掉）`);
  assert.ok(!out.includes("comment */"));
});

/* ================================================================== */
/* 二、ERROR 級：Node 專用 API 必抓                                     */
/* ================================================================== */

console.log("--- 2. Node 專用 API（error）---");

test("[2] from \"fs\" 被抓（E1）", () => {
  const hits = analyzeFile("x.ts", 'import { readFileSync } from "fs";');
  assert.ok(ruleHit(hits, "E1-import-builtin"), "import from fs 應命中 E1");
  assert.strictEqual(ruleHit(hits, "E1-import-builtin").level, "error");
});

test("[2] node: 前綴也算（E1）", () => {
  const hits = analyzeFile("x.ts", 'import path from "node:path";');
  assert.ok(ruleHit(hits, "E1-import-builtin"), "node:path 應命中 E1");
});

test("[2] require(\"fs\") 被抓（E2）", () => {
  const hits = analyzeFile("x.ts", 'const fs = require("fs");');
  assert.ok(ruleHit(hits, "E2-require-builtin"), "require fs 應命中 E2");
});

test("[2] 動態 import(\"node:fs\") 被抓（E3）", () => {
  const hits = analyzeFile("x.ts", 'const m = await import("node:fs");');
  assert.ok(ruleHit(hits, "E3-dynamic-import-builtin"));
});

test("[2] Buffer / __dirname / process.platform 被抓（E4）", () => {
  for (const code of [
    "const b = Buffer.from(x);",
    "const b = new Buffer(x);",
    "const p = __dirname;",
    "if (process.platform === 'darwin') {}",
  ]) {
    const hits = analyzeFile("x.ts", code);
    assert.ok(ruleHit(hits, "E4-node-global"), `應命中 E4：${code}`);
  }
});

/* ================================================================== */
/* 三、零誤報：第一版踩過的坑，逐條釘回去                               */
/* ================================================================== */

console.log("--- 3. 零誤報（第一版曾誤傷）---");

test("[3] require(\"fflate\") 是 esbuild lazy load，不算 Node 內建", () => {
  const hits = analyzeFile("src/dict/loader.ts", "const { gunzipSync } = require('fflate') as typeof import('fflate');");
  assert.strictEqual(hits.length, 0, `fflate 不應被判為 Node 專用，實得：${hits.map((h) => h.rule)}`);
});

test("[3] require(\"./data/x.lazy\") 專案自家的懶載入不算", () => {
  // 巴利-梵文表遷出後 buddhist-data.ts 已無 pali require；
  // 改用仍在的 ranjana 行驗證「專案內部 require 不誤報」。
  const hits = analyzeFile("src/dict/buddhist-data.ts", 'return guarded("ranjana", () => require("./data/ranjana.lazy").loadRanjanaMap(), {});');
  assert.strictEqual(hits.length, 0, `專案內部 require 不該報，實得：${hits.map((h) => h.rule)}`);
});

test("[3] FlexBuffer 類別名不得被當成 Buffer", () => {
  const hits = analyzeFile("src/dict/lzo1x.ts", "const output = new FlexBuffer();\nout = outBuf.require(t);");
  assert.strictEqual(hits.length, 0, `FlexBuffer 與同名 require 方法都不該報，實得：${hits.map((h) => h.rule)}`);
});

test("[3] 識別符含 drop（dropZone / dropCapCss）不算拖放互動", () => {
  const hits = analyzeFile("src/settings.ts", [
    'const dropZone = containerEl.createDiv("li-font-drop");',
    "const dropCapCss = typo.charsPerColumn > 0;",
    "export function dropRedundantFvs(cps: number[]) {}",
  ].join("\n"));
  assert.strictEqual(ruleHit(hits, "I1-pointer-only"), undefined, "dropZone/dropCapCss 是識別符，不是 drag&drop");
});

test("[3] 英文 UI 文案裡的 \"drag & drop\" 不算拖放互動", () => {
  const hits = analyzeFile("src/i18n.ts", '"font.dropHint": "Drag & drop fonts here, then Import.",');
  assert.strictEqual(ruleHit(hits, "I1-pointer-only"), undefined, "文案字串不該被當成互動註冊");
});

test("[3] 真正的監聽器才計：addEventListener(\"wheel\")", () => {
  const hits = analyzeFile("src/main.ts", 'document.addEventListener("wheel", fn, { passive: false });');
  assert.ok(ruleHit(hits, "I1-pointer-only"), "真的註冊 wheel 事件要被點出來");
});

/* ================================================================== */
/* 四、WARN 級與「已守門」降級                                          */
/* ================================================================== */

console.log("--- 4. 平台限定 API 與降級 ---");

test("[4] structuredClone 未降級 → warn（W1）", () => {
  const hits = analyzeFile("x.ts", "this.data = structuredClone(DEFAULT);");
  const h = ruleHit(hits, "W1-structured-clone");
  assert.ok(h, "structuredClone 應命中 W1");
  assert.strictEqual(h.level, "warn");
});

test("[4] requestIdleCallback 有 typeof 守門 + setTimeout 降級 → info（W4）", () => {
  const code = [
    "const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };",
    "if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: 3000 });",
    "else setTimeout(run, 50);",
  ].join("\n");
  const hits = analyzeFile("src/dict/plugin.ts", code);
  const h = ruleHit(hits, "W4-idle-callback");
  assert.ok(h, "requestIdleCallback 應命中 W4");
  assert.strictEqual(h.level, "info", "有 typeof 守門又有 setTimeout 降級，應降為 info");
  assert.strictEqual(h.mitigated, true);
});

test("[4] DecompressionStream 取値後用 typeof 守門 → info（W2）", () => {
  // src/font-name.ts 的真實寫法：先把 API 取出來別名，再判斷別名是否存在
  const code = [
    "const DS = (globalThis as unknown as {",
    "  DecompressionStream?: new (fmt: string) => { writable: WritableStream; readable: ReadableStream };",
    "}).DecompressionStream;",
    'if (typeof DS === "undefined") return null;',
    'const ds = new DS("deflate");',
  ].join("\n");
  const hits = analyzeFile("src/font-name.ts", code);
  const h = ruleHit(hits, "W2-decompression-stream");
  assert.ok(h, "DecompressionStream 應命中 W2");
  assert.strictEqual(h.level, "info", "有守門應降為 info");
  assert.strictEqual(h.mitigated, true);
});

test("[4] DecompressionStream 用真値判斷（if (!DS)）也算守門 → info（W2）", () => {
  const code = [
    "const DS = (self as unknown as { DecompressionStream?: new (f: string) => unknown }).DecompressionStream;",
    "if (!DS) return null;",
  ].join("\n");
  const h = ruleHit(analyzeFile("x.ts", code), "W2-decompression-stream");
  assert.ok(h, "DecompressionStream 應命中 W2");
  assert.strictEqual(h.level, "info", "真値判斷也是一種守門，不該誤報為 warn");
});

test("[4] DecompressionStream 完全沒守門 → warn（W2）", () => {
  const h = ruleHit(analyzeFile("x.ts", 'const ds = new DecompressionStream("deflate-raw");'), "W2-decompression-stream");
  assert.ok(h);
  assert.strictEqual(h.level, "warn", "Node < 18 與部分 WebView 沒有這個 API，沒守門就是warn");
});

test("[4] 裸 await clipboard.writeText（無 catch）→ warn（W3）", () => {
  const hits = analyzeFile("src/dict/view.ts", "await navigator.clipboard.writeText(hit.html);");
  const h = ruleHit(hits, "W3-clipboard");
  assert.ok(h, "剪貼簿寫入應命中 W3");
  assert.strictEqual(h.level, "warn", "沒有 guard 也沒有 .catch，reject 時就是 unhandled rejection");
});

test("[4] clipboard 有 guard + .catch → info（W3 已緩解）", () => {
  const code = [
    "const api = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;",
    "if (!api?.writeText) { liNotice('none'); return; }",
    "void api.writeText(out).then(() => liNotice('ok')).catch(() => liNotice('none'));",
  ].join("\n");
  const hits = analyzeFile("src/dict/collation-panel.ts", code);
  const h = ruleHit(hits, "W3-clipboard");
  assert.ok(h);
  assert.strictEqual(h.level, "info", "有 guard 又有 catch，應降為 info");
});

/* ================================================================== */
/* 五、棘輪語義：baseline 的「新增 / 消失」                              */
/* ================================================================== */

console.log("--- 5. baseline 棘輪 ---");

test("[5] baseline 沒記載的一律算「新增」", () => {
  const hits = [{ rule: "W1-structured-clone", level: "warn", file: "a.ts", count: 1 }];
  const { added } = compare(hits, { entries: {} });
  assert.strictEqual(added.length, 1);
});

test("[5] baseline 有記載的不算新增", () => {
  const hits = [{ rule: "W1-structured-clone", level: "warn", file: "a.ts", count: 1 }];
  const { added } = compare(hits, { entries: { "W1-structured-clone|a.ts": { level: "warn" } } });
  assert.strictEqual(added.length, 0);
});

test("[5] baseline 條目消失（程式改好了）要被點出來", () => {
  const { resolved } = compare([], { entries: { "W1-structured-clone|a.ts": { level: "warn" } } });
  assert.deepStrictEqual(resolved, ["W1-structured-clone|a.ts"], "消失的條目應提醒更新 baseline");
});

test("[5] 規則 id 必須穩定（baseline 靠它對帳）", () => {
  const ids = RULES.map((r) => r.id);
  assert.strictEqual(new Set(ids).size, ids.length, "規則 id 不得重複");
  for (const id of ids) assert.match(id, /^[EWI]\d-[a-z0-9-]+$/, `id 格式不對：${id}`);
});

/* ================================================================== */
/* 六、對真實原始碼的快照：ERROR 必須為 0                                */
/* ================================================================== */

console.log("--- 6. 真實 src/ 快照 ---");

const baselinePath = join(ROOT, "scripts", "platform-baseline.json");

test("[6] src/ 下不得有任何 ERROR（Node 專用 API 零容忍）", () => {
  const errors = scan().filter((h) => h.level === "error");
  assert.strictEqual(errors.length, 0, `不得有 Node 專用 API，實得：\n${errors.map((e) => `  ${e.rule} @ ${e.file}:${e.samples?.[0]?.line}`).join("\n")}`);
});

test("[6] manifest 必須維持 isDesktopOnly = false（行動端可安裝）", () => {
  const mf = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  assert.strictEqual(mf.isDesktopOnly, false, "改成 true 就等於放棄平板與手機");
});

test("[6] baseline 檔案存在，且無「新增」項目", () => {
  assert.ok(existsSync(baselinePath), "缺少 scripts/platform-baseline.json，請跑 --update");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const { added } = compare(scan(), baseline);
  assert.strictEqual(added.length, 0, `出現未經核準的新風險：\n${added.map((h) => `  ${h.rule} @ ${h.file}`).join("\n")}`);
});

test("[6] 已知 WARN 已清零（N1 剪貼簿 + N2 structuredClone 修復後）", () => {
  const warns = scan().filter((h) => h.level === "warn").map((h) => `${h.rule}|${h.file}`).sort();
  assert.deepStrictEqual(warns, [],
    "WARN 清單變動代表有人改了相關程式或規則，請 review 後更新 baseline；若有新增 WARN，必須經使用者確認");
});

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
if (failures.length) {
  console.error("\n失敗明細：");
  for (const f of failures) console.error(`  - ${f.name}\n    ${f.e.stack?.split("\n").slice(0, 3).join("\n    ")}`);
  process.exit(1);
}
