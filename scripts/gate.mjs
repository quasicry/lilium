#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * lilium 快速門禁（fast gate）——提交/推送前本地執行，CI 同套規則。
 * 範本：pluscan scripts/gate.mjs（8 類規則）；lilium 化調整見各規則註釋。
 * 用法：node scripts/gate.mjs [--staged]
 * 退出碼：0 = 全過；1 = 有違規（逐條列出）。
 *
 * 與 run.mjs（651+ 斷言行為門禁）分工：本檔是「靜態合規快檢」，
 * 攔住審核必咬、run.mjs 不覆蓋的類別（lookbehind/manifest/新硬編碼樣式等）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);
const stagedOnly = args.includes("--staged");

const violations = [];
const add = (file, line, rule, msg) => violations.push(`${file}:${line}  [${rule}] ${msg}`);

// ---------- 目標檔案收集 ----------
function listFiles(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "test/build") continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) listFiles(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

let tsFiles;
let stagedSet = null;
if (stagedOnly) {
  const out = execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" });
  stagedSet = new Set(out.split("\n").filter(Boolean));
  tsFiles = [...stagedSet].filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".mjs"));
  // 豁免：test/ 下全部測試／探針腳本（headless Chromium 量測、mock 環境，
  // 內含 document.*——非 Obsidian DOM 代碼，SEC-DOM 不適用；全樽模式本只掃
  // src/ 與 scripts/，--staged 掃全檔行時存量誤報，故整目錄豁免）。
  tsFiles = tsFiles.filter((f) => !f.startsWith("test/"));
  // tools/ 量測／校準腳本同 test/ 性質：非 Obsidian DOM 代碼（真機瀏覽器量測），
  // --staged 全檔行掃描會爆存量誤報——整目錄豁免。
  tsFiles = tsFiles.filter((f) => !f.startsWith("tools/"));
  // scripts/ 下的真機量測腳本（無 obsidian import、跑在 Xvfb/Chromium 環境）同 test/ 性質——
  // SEC-DOM「禁 document 查詢」對其為誤報，逐一豁免（新增量測腳本時補進此清單）。
  const MEASURE_SCRIPTS = ["scripts/render-vertical-compare.mjs"];
  tsFiles = tsFiles.filter((f) => !MEASURE_SCRIPTS.includes(f));
} else {
  tsFiles = listFiles(join(root, "src"), [".ts", ".tsx"]);
  tsFiles = tsFiles.concat(listFiles(join(root, "scripts"), [".mjs"]));
  tsFiles.push("esbuild.config.mjs");
  tsFiles.push("scripts/gate.mjs");
}

// ---------- 規則 1：禁 innerHTML / outerHTML / insertAdjacentHTML（新增行）----------
// lilium 特例：存量基線在 docs/SECURITY-BASELINE.md（eslint 存量豁免鎖 894），
// 本規則只對「本次新增/修改的行」報警——只許減不許增。
for (const f of tsFiles) {
  let src;
  try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (stagedSet && !stagedSet.has(f)) return;
    // 豁免：本檔自身的規則文字（正則字面量）、sanitize.ts 的白名單解析器與註釋行
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (/gate\.mjs/.test(f)) return;
    // 豁免：字串/正則字面量中的 innerHTML 字樣（onerror 替換字串、註釋引述）——
    // 真實 DOM 寫入形態是行首附近的 `.innerHTML =` 成員賦值語句；字串內出現只是文本。
    // 判別：把字串字面量內容剝掉後再測（粗略：引號對內的 outerHTML= 是替換文本）
    const stripped = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
    if (!/\.\s*(innerHTML|outerHTML|insertAdjacentHTML)\s*=/.test(stripped) &&
        /\b(innerHTML|outerHTML|insertAdjacentHTML)\b/.test(line)) return;
    if (/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/.test(line))
      add(f, i + 1, "SEC-DOM", "禁新增 innerHTML/outerHTML/insertAdjacentHTML，改用 createEl() 等 helper（存量見 SECURITY-BASELINE.md，只許減不許增）");
    if (/\bdocument\.querySelector\b|\bdocument\.getElementById\b/.test(line))
      add(f, i + 1, "SEC-DOM", "禁直接 document 查詢，DOM 應從 Obsidian 傳入的容器元素建構");
  });
}

// ---------- 規則 2：禁全局 app（必須插件實例 this.app / 傳入參數）----------
// 豁免：檔內聲明 `app: App` 參數者，裸 `app.` 是傳入實例（官方許可做法）。
for (const f of tsFiles) {
  let src;
  try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
  if (!f.startsWith("src")) continue; // 構建腳本可用 process/node
  const hasAppParam = /\bapp\s*:\s*App\b/.test(src);
  src.split("\n").forEach((line, i) => {
    const l = line.replace(/\/\/.*$/, "");
    if (/\b(window|globalThis)\.app\b/.test(l))
      add(f, i + 1, "API-APP", "禁全局 app/window.app，使用插件實例的 this.app");
    if (!hasAppParam && /(^|[^\w.])app\.(workspace|vault|plugins|fileManager)\b/.test(l))
      add(f, i + 1, "API-APP", "裸 app.* 需經插件實例（this.app）或顯式參數傳入");
  });
}

// ---------- 規則 3：禁 Node / Electron API（isDesktopOnly=false 的前提）----------
// lilium 特例：Node builtins 僅允許出現在 scripts/*.mjs 構建/測試腳本（不進 bundle）；
// src/ 內一律必攔（esbuild external 會讓運行時 require 崩潰）。
const NODE_API = /(^|[^\w.])(require\(|from\s+["'])(fs|path|os|crypto|child_process|electron|http|https|net|util)(["']|\))/;
for (const f of tsFiles) {
  if (!f.startsWith("src")) continue;
  let src;
  try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
  src.split("\n").forEach((line, i) => {
    const l = line.replace(/\/\/.*$/, "");
    if (NODE_API.test(l)) add(f, i + 1, "API-NODE", "src/ 內禁 Node/Electron API（移動端崩潰），用 vault adapter / Web API");
    if (/\bprocess\.(env|cwd|platform)\b/.test(l)) add(f, i + 1, "API-NODE", "禁 process.*，平台判斷用 Platform.*");
  });
}

// ---------- 規則 4：正則禁 lookbehind（iOS < 16.4，移動端 P0）----------
for (const f of tsFiles) {
  if (!f.startsWith("src")) continue;
  let src;
  try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
  src.split("\n").forEach((line, i) => {
    if (/\(\?<=|\(\?<!/.test(line)) add(f, i + 1, "MOB-REGEX", "正則 lookbehind 在 iOS 16.4 以下不可用，改寫捕獲組");
  });
}

// ---------- 規則 5：禁新增硬編碼樣式（CSS class + 官方 CSS 變量）----------
// lilium 特例：存量 src/dict/inline-style.ts 是動態排版量測的正當用途（基線豁免），
// 故只攔 staged 模式下本次改動的行；全量掃描僅記錄不擋。
for (const f of tsFiles) {
  if (!f.startsWith("src")) continue;
  if (stagedOnly && !stagedSet.has(f)) continue;
  let src;
  try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
  src.split("\n").forEach((line, i) => {
    if (/\.style\.(color|backgroundColor|fontSize|border|padding|margin)\s*=/.test(line))
      add(f, i + 1, "STYLE", "禁硬編碼樣式，用 CSS class + 官方 CSS 變量（存量豁免見 SECURITY-BASELINE.md）");
  });
}

// ---------- 規則 6：i18n 鍵集一致（zh 為基準，七語言）----------
// lilium 是單檔 i18n.ts（鍵 → 各語言物件），與 pluscan 的 locales/ 目錄不同構：
// 檢查每個鍵的語言集合一致（缺語言/多語言都報）。
try {
  const i18nPath = join(root, "src", "i18n.ts");
  const src = readFileSync(i18nPath, "utf8");
  // 每個鍵塊：抓 "key": { 後至配對 } 間出現的語言碼
  const blockRe = /"([^"]+)":\s*\{([^{}]*)\}/g;
  const langSets = new Map();
  let m;
  while ((m = blockRe.exec(src)) !== null) {
    const key = m[1];
    if (!/^[a-z][a-zA-Z0-9.]*$/.test(key)) continue; // 非翻譯鍵（正則/值物件）略過
    const langs = [...m[2].matchAll(/\b(zh|zh-TW|en|ja|ko|fr|de|bo|ug|sa|hi|eo)\b\s*:/g)].map((x) => x[1]);
    if (langs.length >= 2) langSets.set(key, new Set(langs));
  }
  // 以多數語言集為基準，偏離者報警（新鍵漏譯）
  const freq = new Map();
  for (const s of langSets.values()) {
    const sig = [...s].sort().join(",");
    freq.set(sig, (freq.get(sig) ?? 0) + 1);
  }
  const majority = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (majority) {
    const maj = new Set(majority.split(","));
    for (const [key, s] of langSets) {
      if (s.size === maj.size && [...maj].every((l) => s.has(l))) continue;
      const missing = [...maj].filter((l) => !s.has(l));
      const extra = [...s].filter((l) => !maj.has(l));
      add("src/i18n.ts", 0, "I18N", `鍵 ${key} 語言集偏離多數基準（缺: ${missing.join("/") || "—"}；多: ${extra.join("/") || "—"}）`);
    }
  }
} catch { /* i18n.ts 不存在時略過 */ }

// ---------- 規則 7：佔位類名 / 模板示例殘留 ----------
for (const f of tsFiles) {
  if (!f.startsWith("src")) continue;
  let src;
  try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
  if (/\bMyPlugin\b|\bSampleSettingTab\b|\bMyPluginSettings\b/.test(src))
    add(f, 0, "TEMPLATE", "殘留官方模板佔位類名，須改名");
}

// ---------- 規則 8：manifest 規範（lilium 鎖定）----------
try {
  const man = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  if (man.id !== "lilium") add("manifest.json", 0, "MANIFEST", `id 應為 lilium，實際 ${man.id}`);
  if (!/^[a-z][a-z-]*$/.test(man.id ?? "") || /obsidian/.test(man.id ?? "") || /plugin$/.test(man.id ?? ""))
    add("manifest.json", 0, "MANIFEST", "id 違反官方字符/保留字規則");
  if (man.isDesktopOnly !== false) add("manifest.json", 0, "MANIFEST", "isDesktopOnly 必須 false（移動端目標）");
  if (!/^\d+\.\d+\.\d+$/.test(man.version ?? "")) add("manifest.json", 0, "MANIFEST", "version 必須 semver x.y.z");
  if ((man.description ?? "").length > 250) add("manifest.json", 0, "MANIFEST", "description 超 250 字符");
  if (/plugin/i.test(man.name ?? "")) add("manifest.json", 0, "MANIFEST", "name 不得含 Plugin 字樣");
  // versions.json 同步
  try {
    const ver = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
    if (ver[man.version] === undefined) add("versions.json", 0, "VERSIONS", `缺 "${man.version}" 鍵（與 manifest 不同步）`);
  } catch { /* versions.json 可缺（骨架前） */ }
} catch { /* manifest.json 可缺（骨架前） */ }

// ---------- 結果 ----------
if (violations.length) {
  console.error(`\n[lilium-gate] 門禁未過（${violations.length} 條違規）：\n`);
  for (const v of violations) console.error("  ✗ " + v);
  process.exit(1);
} else {
  console.log(`[lilium-gate] 門禁通過（8 類規則，檢查 ${tsFiles.length} 個檔案）`);
}
