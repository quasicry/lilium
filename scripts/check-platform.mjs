#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 三端驗證底盤 · 跨平台守門
 *
 * 目的：把「桌面 / 平板 / 手機都要正常」從口號變成 CI 可執行的閘門。
 * 掃描 src/**\/*.ts，對「Node 專用 API」與「平台限定 Web API」分級舉報，
 * 並用 baseline 做棘輪：既有問題凍結在 baseline 裡，**新增任何一處**就紅燈。
 *
 * 注意：本檔跑在 Node（不用進 bundle），所以自己可以用 fs。
 * 用法：
 *   node scripts/check-platform.mjs            # 檢查（有 BLOCK 或新增問題 → exit 1）
 *   node scripts/check-platform.mjs --update   # 重寫 baseline（人工 review 後才可提交）
 *   node scripts/check-platform.mjs --verbose  # 連 INFO 也列出
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC = "src";
const BASELINE_PATH = join(ROOT, "scripts", "platform-baseline.json");

/** vendored 資料檔（字體 base64）不入我用 ia scan 範圍 */
const SKIP_DIRS = new Set(["vendor", "node_modules", "dist", "test", "scripts", "docs", "demo"]);

/* ------------------------------------------------------------------ 規則 */

const BUILTIN = [
  "fs", "fs/promises", "path", "os", "child_process", "crypto", "util", "stream",
  "url", "zlib", "buffer", "events", "http", "https", "net", "tls",
  "worker_threads", "perf_hooks", "readline", "timers", "module", "v8",
];
const BUILTIN_ALT = BUILTIN.join("|");
const NODE_SPEC = `(?:node:)?(?:${BUILTIN_ALT})`;

/**
 * rule.id 必須穩定：baseline 靠它對帳。
 * 每條規則回傳 [{ rule, line, text }]
 */
const RULES = [
  /* -------- ERROR：桌面 Electron 有、行動端沒有（會直接讓插件掛掉）-------- */
  {
    id: "E1-import-builtin",
    level: "error",
    desc: "靜態 import Node 內建模組（行動端不存在，且 esbuild external 已排除 builtins）",
    re: new RegExp(`\\bimport\\s+[^;\\n]*?from\\s*["']${NODE_SPEC}["']`, "g"),
  },
  {
    id: "E2-require-builtin",
    level: "error",
    desc: "require() Node 內建模組",
    // 只抓內建名：require('fflate') / require('./data/x.lazy') 是 esbuild lazy load，合法
    re: new RegExp(`\\brequire\\(\\s*["']${NODE_SPEC}["']\\s*\\)`, "g"),
  },
  {
    id: "E3-dynamic-import-builtin",
    level: "error",
    desc: "動態 import() Node 內建模組",
    re: new RegExp(`\\bimport\\(\\s*["']${NODE_SPEC}["']\\s*\\)`, "g"),
  },
  {
    id: "E4-node-global",
    level: "error",
    // \bBuffer\.from 之類；「FlexBuffer(」不會命中（前面有字母，\b 不成立）
    desc: "Node 全域：Buffer / __dirname / __filename / process.platform 等",
    re: /\bnew Buffer\b|\bBuffer\.(?:from|alloc|allocUnsafe|allocUnsafeSlow|concat|isBuffer|byteLength|compare)\b|\b__dirname\b|\b__filename\b|\bprocess\.(?:platform|version|versions|cwd|env|argv|exit|stdout|stderr)\b/g,
  },

  /* -------- WARN：跨平台可用但支援度參差，必須有守門/降級 -------- */
  {
    id: "W1-structured-clone",
    level: "warn",
    desc: "structuredClone：iOS Safari < 15.4 不存在，需降級",
    re: /\bstructuredClone\s*\(/g,
  },
  {
    id: "W2-decompression-stream",
    level: "warn",
    desc: "DecompressionStream / CompressionStream：需 typeof 守門（Node < 18 與部分 WebView 無）",
    // 注意：初版寫成 (?:De|Com)pressionStream，對 "DecompressionStream" 完全匹配不到
    //（\bDe 之後是 compressionStream），形成假陰性——由 test/platform-gate.mjs 抓出。
    re: /\b(?:Decompression|Compression)Stream\b/g,
    // 有 typeof 守門者由 mitigated() 降為 info
  },
  {
    id: "W3-clipboard",
    level: "warn",
    desc: "navigator.clipboard：不安全情境/iOS 容器可能 reject，需 guard + .catch（否則 unhandled rejection）",
    re: /\bnavigator\.clipboard\b|\bclipboard\.writeText\s*\(/g,
  },
  {
    id: "W4-idle-callback",
    level: "warn",
    desc: "requestIdleCallback：iOS Safari 無，需 setTimeout 降級",
    re: /\brequestIdleCallback\b/g,
  },
  {
    id: "W5-file-picker",
    level: "warn",
    desc: "File System Access API（show*Picker）：Chrome 桌面限定，行動端與 Electron 舊版無",
    re: /\bshow(?:Open|Save|Directory)FilePicker\b/g,
  },

  /* -------- INFO：需確認觸控等價入口 -------- */
  {
    // 只認「引號裡的事件名」：避免誤傷 dropZone / dropCapCss / 文案裡的 drag & drop。
    // lineGuard 再要求同一行真的有監聽器登録，杜絕把普通識別符當成互動。
    id: "I1-pointer-only",
    level: "info",
    desc: "僅滑鼠/鍵盤的互動（hover、右鍵、拖曳、滾輪）：需確認有觸控或命令面板等價入口",
    re: /["'](?:mouseover|mouseenter|mousemove|mouseleave|dblclick|contextmenu|dragstart|dragover|dragenter|drop|wheel)["']/g,
    lineGuard: /addEventListener|removeEventListener|registerDomEvent|\.on\(|\.off\(/,
  },
];

/** 某些 API 若已在同檔做過守門，視為「已緩解」，降一級（error 不降） */
function mitigated(id, file, findings, source) {
  if (id === "W2-decompression-stream") {
    // 實務上有兩種守門寫法，都要認：
    //  (a) typeof X.DecompressionStream === "function"
    //  (b) const DS = (globalThis as unknown as {...}).DecompressionStream;
    //      if (typeof DS === "undefined") return null;      ← src/font-name.ts 就是這種
    return /typeof\s+[A-Za-z0-9_$.]*DecompressionStream\b/.test(source) ||
      /typeof\s+\w+\s*(?:===?|!==?)\s*["'](?:undefined|function)["']/.test(source) ||
      // 取值後用真值判斷：const DS = (...).DecompressionStream; if (!DS) return null;
      /\.DecompressionStream\b[\s\S]{0,240}?if\s*\(\s*!\s*\w+\s*\)/.test(source);
  }
  if (id === "W3-clipboard") {
    // 同城（±12 行）內出現 catch 或「先探一次」的 guard 才算數
    const lines = source.split("\n");
    return findings.every((f) => {
      const from = Math.max(0, f.line - 13);
      const to = Math.min(lines.length - 1, f.line + 12);
      const win = lines.slice(from, to).join("\n");
      return /\.catch\s*\(|try\s*\{|!api\?\.writeText|typeof navigator/.test(win);
    });
  }
  if (id === "W4-idle-callback") {
    return /typeof\s+\w+\.requestIdleCallback|typeof\s+window\s+as|typeof\s+w\.requestIdleCallback/.test(source) &&
      /setTimeout\s*\(/.test(source);
  }
  return false;
}

/* ------------------------------------------------- 註解剝離（降低誤報） */

/**
 * 追蹤字串/樣板狀態後剔除註解，讓 `https://` 與註解裡的 API 名不致誤報。
 * 已知限制：正則字面量（如 /\d+/g）未被特殊處理，若正則本體含 // 或 /* 會
 * 造成該行判讀偏移——本專案 src 下無此寫法，且掃描白名單排除 vendor。
 */
export function stripComments(src) {
  let out = "";
  let i = 0;
  let block = false;
  let line = false;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (line) {
      if (c === "\n") { line = false; out += c; }
      i += 1;
      continue;
    }
    if (block) {
      if (c === "*" && d === "/") { block = false; i += 2; continue; }
      if (c === "\n") out += c;
      i += 1;
      continue;
    }
    if (quote) {
      out += c;
      if (c === "\\") { if (i + 1 < src.length) out += src[i + 1]; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "/" && d === "/") { line = true; i += 2; continue; }
    if (c === "/" && d === "*") { block = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i += 1; continue; }
    out += c;
    i += 1;
  }
  return out;
}

/* ---------------------------------------------------------------- 掃描 */

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
    } else if (name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

/** 單檔分析（export 供單元測試） */
export function analyzeFile(file, source) {
  const code = stripComments(source);
  const lines = source.split("\n");
  const hits = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    const stripped = rule.strip === false ? source : code;
    const found = [];
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const line = stripped.slice(0, m.index).split("\n").length;
      const text = (lines[line - 1] || "").trim().slice(0, 120);
      // I1 這類規則要避免把普通識別符算進來：同檔同行必須真的有監聽器登録
      if (rule.lineGuard && !rule.lineGuard.test(text)) continue;
      found.push({ line, text });
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
    if (!found.length) continue;
    const ok = mitigated(rule.id, file, found, code);
    hits.push({ rule: rule.id, level: ok ? "info" : rule.level, file, count: found.length, samples: found.slice(0, 3), mitigated: ok });
  }
  return hits;
}

/**結構性檢查：manifest / esbuild external / bundle 體積 */
export function checkStructure() {
  const issues = [];
  try {
    const mf = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
    if (mf.isDesktopOnly !== false) {
      issues.push({ rule: "E0-manifest-desktop-only", level: "error", file: "manifest.json", count: 1, samples: [{ line: 1, text: `isDesktopOnly=${mf.isDesktopOnly}（應為 false，行動端才能安裝）` }], mitigated: false });
    }
  } catch (e) {
    issues.push({ rule: "E0-manifest-unreadable", level: "error", file: "manifest.json", count: 1, samples: [{ line: 1, text: String(e && e.message) }], mitigated: false });
  }
  try {
    const cfg = readFileSync(join(ROOT, "esbuild.config.mjs"), "utf8");
    const m = cfg.match(/external:\s*\[([^\]]*)\]/);
    // @codemirror/view|state 為 Obsidian 運行時提供的官方模塊（編輯器擴充，
    // docs「Editor extensions」慣例），與 obsidian 同類——加入白名單。
    const allowed = new Set(['"obsidian"', "'obsidian'", '"electron"', "'electron'", "...builtins",
      '"@codemirror/view"', "'@codemirror/view'", '"@codemirror/state"', "'@codemirror/state'"]);
    // 內聯 Node 內建模組清單（builtin-modules 套件已移除——審核 module-replacements 警告；
    // 清單與 esbuild.config.mjs / test/builtins.mjs 三處同步維護）
    const INLINE_BUILTINS = ["assert","assert/strict","async_hooks","buffer","child_process","cluster","console",
      "constants","crypto","dgram","diagnostics_channel","dns","dns/promises","domain",
      "events","fs","fs/promises","http","http2","https","inspector","inspector/promises",
      "module","net","os","path","path/posix","path/win32","perf_hooks","process","punycode",
      "querystring","readline","readline/promises","repl","stream","stream/consumers",
      "stream/promises","stream/web","string_decoder","timers","timers/promises","tls",
      "trace_events","tty","url","util","util/types","v8","vm","worker_threads","zlib"];
    for (const b of INLINE_BUILTINS) { allowed.add(`\"${b}\"`); allowed.add(`'${b}'`); }
    const listed = m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
    const bad = listed.filter((s) => !allowed.has(s) && !s.startsWith('"node:'));
    if (bad.length) {
      issues.push({ rule: "E0-esbuild-external", level: "error", file: "esbuild.config.mjs", count: bad.length, samples: [{ line: 1, text: `external 含非白名單項：${bad.join(", ")}` }], mitigated: false });
    }
  } catch { /* 檔案不存在由 build 負責 */ }
  return issues;
}

export function scan(options = {}) {
  const files = (options.files || walk(join(ROOT, SRC))).filter((f) => !/\/(vendor|node_modules)\//.test(f));
  const hits = [];
  for (const abs of files) {
    const rel = relative(ROOT, abs).split("\\").join("/");
    const src = options.read ? options.read(rel) : readFileSync(abs, "utf8");
    hits.push(...analyzeFile(rel, src));
  }
  return [...checkStructure(), ...hits];
}

/* ------------------------------------------------------------ baseline */

function fingerprint(h) {
  return `${h.rule}|${h.file}`;
}

const LEVEL_ORDER = { error: 2, warn: 1, info: 0 };

export function compare(hits, baseline) {
  const known = new Map(Object.entries(baseline.entries || {}));
  const now = new Set(hits.map(fingerprint));
  const added = hits.filter((h) => !known.has(fingerprint(h)));
  const resolved = [...known.keys()].filter((k) => !now.has(k));
  return { added, resolved, known };
}

function run() {
  const argv = process.argv.slice(2);
  const update = argv.includes("--update");
  const verbose = argv.includes("--verbose") || update;
  const hits = scan();
  let baseline = { version: 1, entries: {} };
  try { baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")); } catch { /* 首次建立 */ }

  if (update) {
    const entries = {};
    for (const h of hits) {
      entries[fingerprint(h)] = { level: h.level, count: h.count, note: BASELINE_NOTE[h.rule] || h.rule };
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ version: 1, updated: new Date().toISOString(), entries }, null, 2)}\n`);
    console.log(`[platform] baseline 已更新：${Object.keys(entries).length} 條 → scripts/platform-baseline.json`);
    console.log("[platform] ⚠ 請人工 review 這個 diff：baseline 變動等於放行為既有風險。");
    return 0;
  }

  const { added, resolved } = compare(hits, baseline);
  const errors = hits.filter((h) => h.level === "error");
  const warns = hits.filter((h) => h.level === "warn");
  const infos = hits.filter((h) => h.level === "info");

  console.log("=== 三端驗證底盤 ·跨平台守門 =======");
  console.log(`掃描檔案數：${walk(join(ROOT, SRC)).filter((f) => !/\/(vendor|node_modules)\//.test(f)).length}`);
  console.log(`ERROR ${errors.length} ｜ WARN ${warns.length} ｜ INFO（含已緩解）${infos.length}`);
  for (const h of [...errors, ...(verbose ? [...warns, ...infos] : added)]) {
    const tag = h.level.toUpperCase();
    console.log(`  ${tag.padEnd(5)} ${fingerprint(h)} x${h.count}${h.mitigated ? " [已守門]" : ""}`);
    for (const s of h.samples) console.log(`         L${s.line}: ${s.text}`);
  }
  if (added.length) {
    console.log(`\n[platform] ❌ 新增 ${added.length} 處跨平台風險（baseline 未記載）：`);
    for (const h of added) console.log(`  - ${fingerprint(h)} x${h.count}`);
    console.log("  若要接受這些風險：人工 review 後跑 `node scripts/check-platform.mjs --update`");
  } else {
    console.log("\n[platform] ✅ 無新增跨平台風險（全部落在 baseline 已核準清單內）");
  }
  if (resolved.length) {
    console.log(`\n[platform] ⚠ baseline 有 ${resolved.length} 條已不存在（程式改好了？請 review 後 --update）：`);
    for (const k of resolved) console.log(`  - ${k}`);
  }
  const fail = errors.length > 0 || added.length > 0;
  console.log(fail ? "\n[platform] 結果：紅燈（不得交付）" : "\n[platform] 結果：綠燈");
  return fail ? 1 : 0;
}

/** 寫入 baseline 時附的可讀理由（解釋「為什麼這一處目前可接受」） */
const BASELINE_NOTE = {
  "W1-structured-clone": "dict/store.ts 用 structuredClone 深拷貝；iOS 15.4+ / Chrome 98+ 可用，低於此會拋。待加 Object.assign 降級。",
  "W2-decompression-stream": "font-name.ts / font-cmap.ts 已做 typeof 守門，無 API 時回傳 null 走 Canvas 降級。",
  "W3-clipboard": "剪貼簿寫入；已緩解者附 .catch，未緩解者為待辦（下一步處理）。",
  "W4-idle-callback": "dict/plugin.ts 已做 typeof 守門 + setTimeout 降級。",
  "I1-pointer-only": "滑鼠/滾輪互動；直排翻列在行動端走原生觸控捲動，需每次改動人工複核。",
};

// 審計：自跑守衛必須用 pathToFileURL 比較——
// `import.meta.url` 對非 ASCII 路徑（如本包的「源碼樹」目錄）做百分號編碼，
// 舊寫法 `file://${process.argv[1]}` 比較恒不成立 → 整個 run() 從不執行
// （靜默空轉、假綠出口，且 --update 也失效）。此坑對「路徑含空格/中文/
// 特殊字元」一律觸發，歷史自 W6 快照起一直空轉（見審計報告 P0-1）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run());
}

export { RULES, fingerprint, LEVEL_ORDER };
