#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 從參考專案 zcode_logic.dart 提取 ZCode 位置變體表，生成 TypeScript 模組。
 *
 * 來源：zmongol/mongol_editor_package-main — lib/src/utils/zcode_logic.dart
 *        MIT License, Copyright (c) 2025 Zmongol Editor Contributors
 *
 * 用法：node scripts/gen-mongolian-zcode.mjs <zcode_logic.dart 路徑> [輸出檔]
 *
 * 說明：本腳本僅做「機械提取」（正則解析 Dart 陣列字面量），不修改任何規則語義。
 *       各字母的 12 欄位置變體原樣保留，以確保與上游行為一致。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const srcPath = process.argv[2];
if (!srcPath) {
  console.error("用法：node scripts/gen-mongolian-zcode.mjs <zcode_logic.dart> [輸出檔]");
  process.exit(1);
}
const outPath = process.argv[3] ?? resolve(__dirname, "../src/mongolian-ime/zcode-tables.generated.ts");

const dart = readFileSync(srcPath, "utf8");

/** 從 Dart 源碼提取 `var xArr = [...];` 形式的陣列 */
function extractArrays(source) {
  const out = {};
  const re = /var\s+(\w+Arr)\s*=\s*\[([^\]]*)\]\s*;/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    const body = m[2];
    const items = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
    out[name] = items;
  }
  return out;
}

/** 從 Dart 源碼提取 `dagbr = { "key": "value", ... }` 整詞例外字典 */
function extractDict(source) {
  const out = {};
  const body = source.slice(source.indexOf("var dagbr = {"), source.indexOf("};"));
  const re = /"([^"]+)"\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    // 上游字典值帶尾隨空格作分隔符，此處剝離（空格非字形內容）
    out[m[1]] = m[2].replace(/\s+$/u, "");
  }
  return out;
}

const arrs = extractArrays(dart);
const dict = extractDict(dart);

const keys = Object.keys(arrs);
if (keys.length !== 52) {
  console.error(`警告：預期 52 個陣列，實際 ${keys.length} 個`);
}

/** 校驗每組是否 12 欄（不足則補空字串） */
const COLS = 12;
for (const k of keys) {
  while (arrs[k].length < COLS) arrs[k].push("");
  if (arrs[k].length !== COLS) {
    console.error(`警告：${k} 有 ${arrs[k].length} 欄，非 ${COLS}`);
  }
}

/** 生成 TS 字面量：把 Dart 字串轉成帶 \u 轉義的 TS 字串（避免源碼含生僻字元） */
const esc = (s) =>
  [...s]
    .map((c) => {
      const cp = c.codePointAt(0);
      return cp > 0x7e ? `\\u{${cp.toString(16).toUpperCase()}}` : cp === 0x5c ? "\\\\" : cp === 0x22 ? '\\"' : c;
    })
    .join("");

const lines = [];
lines.push("// AUTO-GENERATED — do not edit by hand. 生成腳本：scripts/gen-mongolian-zcode.mjs");
lines.push("//");
lines.push("// 來源：zmongol/mongol_editor_package-main — lib/src/utils/zcode_logic.dart");
lines.push("//       MIT License, Copyright (c) 2025 Zmongol Editor Contributors");
lines.push("// 授權：MIT（與本專案 GPL-2.0-or-later 相容）；原著作權聲明隨附於 NOTICE.md / FONT-LICENSES.md");
lines.push("//");
lines.push("// 說明：本檔案為 ZCode 輸入法「位置變體表」的機械提取結果，語義與上游完全一致。");
lines.push("//       12 欄索引語義見 src/mongolian-ime/zcode-engine.ts 之 ZCODE_COL_* 常數。");
lines.push("//       注意：碼位為 Sibe/Manchu 字形編碼（U+1865–U+18AA），需經 glyph-map 轉為標準 Unicode。");
lines.push("");
lines.push("/** 位置變體欄位數（固定 12） */");
lines.push(`export const ZCODE_COLS = ${COLS};`);
lines.push("");
lines.push("/** 每字母的位置變體表：key 為小寫/大寫字母，value 為 12 欄碼位字串 */");
lines.push("export const ZCODE_TABLE: Record<string, readonly string[]> = {");
for (const k of keys) {
  const base = k.slice(0, -3);
  lines.push(`    ${JSON.stringify(base)}: [`);
  lines.push("        " + arrs[k].map((s) => `"${esc(s)}"`).join(", ") + ",");
  lines.push("    ],");
}
lines.push("};");
lines.push("");
lines.push("/** 整詞例外字典（專有名詞／縮寫，直接上屏對應字形） */");
lines.push("export const ZCODE_DICT: Record<string, string> = {");
for (const [k, v] of Object.entries(dict)) {
  lines.push(`    ${JSON.stringify(k)}: "${esc(v)}",`);
}
lines.push("};");
lines.push("");
lines.push(`/** 支援的輸入鍵（小寫，26 字母中 ZCode 定義了 ${keys.filter((k) => k[0] === k[0].toLowerCase() && /^[A-Za-z]/.test(k[0])).length} 個） */`);
const lower = keys.filter((k) => /^[a-z]Arr$/.test(k)).map((k) => k.slice(0, -3));
lines.push(`export const ZCODE_KEYS: readonly string[] = ${JSON.stringify(lower)};`);
lines.push("");

writeFileSync(outPath, lines.join("\n"), "utf8");

const total = keys.reduce((n, k) => n + arrs[k].filter(Boolean).length, 0);
console.log(`已生成：${outPath}`);
console.log(`  字母表：${keys.length} 組 × ${COLS} 欄`);
console.log(`  非空條目：${total} 個`);
console.log(`  例外字典：${Object.keys(dict).length} 條`);
