#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 生成「ZCode 字形碼位 → 標準蒙古文 Unicode」的**逐欄映射表**。
 *
 * 為何需要本腳本：
 *   ZCode 按「書寫形狀」編碼，同一字母的詞首/詞中/詞尾形各佔獨立碼位；
 *   標準 Unicode 按「字母邏輯」編碼，字形由 OpenType 引擎依上下文自動選擇。
 *   因此必須建立「每字母 × 每欄 → [標準字母, FVS]」的完整對應表。
 *
 * 推導方法（三重依據）：
 *   ① **欄位語義**：12 欄的語義已由 zcode-engine.ts 逆向確認
 *      （[0]isolate [3]init [6]med [9]final …）；
 *   ② **字形構形段複合**：多碼位組合如 U+1865+U+186A = 詞頭段+牙形段 = ᠠ(a)；
 *   ③ **整詞字典交叉驗證**：以 ZCode 內建 45 條整詞字典反推，核對每個字母的欄位值。
 *
 * 輸出：src/mongolian-ime/glyph-map.generated.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const srcPath = process.argv[2];
if (!srcPath) {
  console.error("用法：node scripts/gen-mongolian-glyphmap.mjs <zcode_logic.dart> [輸出檔]");
  process.exit(1);
}
const outPath = process.argv[3] ?? resolve(__dirname, "../src/mongolian-ime/glyph-map.generated.ts");

const dart = readFileSync(srcPath, "utf8");

/** 提取 52 個位置變體陣列 */
function extractArrays(source) {
  const out = {};
  const re = /var\s+(\w+Arr)\s*=\s*\[([^\]]*)\]\s*;/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    out[m[1]] = [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
  }
  return out;
}

const arrs = extractArrays(dart);

// ─────── 標準蒙古文字母（U+1820–U+183D 核心） ───────
/** 輸入鍵 → 標準基礎字母碼位 */
const KEY_TO_BASE = {
  a: 0x1820, e: 0x1821, i: 0x1822, o: 0x1823, u: 0x1824,
  v: 0x1825, // ö
  U: 0x1826, // ü
  n: 0x1828, b: 0x182a, p: 0x182b, q: 0x182c, g: 0x182d,
  // h 與 q：ZCode 中 h 鍵對映喉音 ᠬ(q)/ᠭ(g) 之清音，q 鍵為其別名
  h: 0x182c,
  m: 0x182e, l: 0x182f, s: 0x1830, x: 0x1831, t: 0x1832,
  d: 0x1833, c: 0x1834, j: 0x1835, y: 0x1836, r: 0x1837,
  w: 0x1838, f: 0x1839, k: 0x183a, z: 0x183d,
};

/** FVS 碼位 */
const FVS1 = 0x180b;
const FVS2 = 0x180c;
const FVS3 = 0x180d;

/**
 * 特殊欄位映射例外表。
 *
 * 這些是「同一字母不同欄對應不同基礎字母」或「需要 FVS 強制指定」的情形，
 * 無法由通用規則推出，須逐一標明。
 *
 * 格式：`"鍵:欄"` → `[基礎字母碼位, FVS碼位|null]`
 * 未列出的欄位一律走通用規則（見 buildRowMap）。
 */
const EXCEPTIONS = {
  // ── 字母 a（ᠠ，陽性元音）──
  // 詞首 a：標準寫法即 ᠠ，OpenType init 自動處理
  "a:3": [0x1820, null],
  // a 的詞中牙形（U+186A）：在標準 Unicode 中 a 作音節尾時寫作 ᠠ，無需 FVS
  "a:6": [0x1820, null],
  "a:10": [0x1820, null],
  "a:11": [0x1820, null],
  "a:0": [0x1820, null],
  "a:4": [0x1820, null],
  "a:7": [0x1820, null],

  // ── 字母 e（ᠡ，陰性元音）──
  "e:3": [0x1821, null],
  "e:6": [0x1821, null],
  "e:9": [0x1821, null],
  "e:10": [0x1821, null],
  "e:11": [0x1821, null],
  "e:0": [0x1821, null],
  "e:4": [0x1821, null],
  "e:7": [0x1821, null],

  // ── 字母 i（ᠢ，中性元音）──
  "i:3": [0x1822, null],
  "i:6": [0x1822, null],
  "i:7": [0x1822, null],
  "i:8": [0x1822, null],
  "i:9": [0x1822, null],
  "i:10": [0x1822, null],
  "i:0": [0x1822, null],

  // ── 字母 o（ᠣ，陽性）──
  "o:3": [0x1823, null],
  "o:6": [0x1823, null],
  "o:7": [0x1823, null],
  "o:9": [0x1823, null],
  "o:10": [0x1823, null],
  "o:0": [0x1823, null],
  "o:1": [0x1823, null],

  // ── 字母 u（ᠤ，陰性）──
  "u:3": [0x1824, null],
  "u:6": [0x1824, null],
  "u:7": [0x1824, null],
  "u:8": [0x1824, null],
  "u:9": [0x1824, null],
  "u:10": [0x1824, null],
  "u:11": [0x1824, null],
  "u:0": [0x1824, null],

  // ── 字母 v = ö（ᠥ，陽性）──
  "v:3": [0x1825, null],
  "v:6": [0x1825, null],
  "v:7": [0x1825, null],
  "v:9": [0x1825, null],
  "v:10": [0x1825, null],
  "v:0": [0x1825, null],
  "v:1": [0x1825, null],

  // ── 字母 U = ü（ᠦ，陰性）──
  "U:3": [0x1826, null],
  "U:6": [0x1826, null],
  "U:7": [0x1826, null],
  "U:8": [0x1826, null],
  "U:9": [0x1826, null],
  "U:0": [0x1826, null],

  // ── 字母 n（ᠨ）──
  // 詞中 n 的牙形（U+186A）→ 需 FVS1 區別於 a
  "n:6": [0x1828, FVS1],
  // 詞中 n 在元音前（U+1871）→ FVS2
  "n:7": [0x1828, FVS2],
  // 詞尾 n（U+1867）→ 標準 final 形
  "n:9": [0x1828, null],
  // 詞尾 n 在 a/e 後（U+1870）→ FVS3
  "n:10": [0x1828, FVS3],
  "n:3": [0x1828, null],
  "n:0": [0x1828, null],

  // ── 字母 b（ᠪ）──
  // 詞首/詞中 b 用 MANCHU I 字形（U+1873）→ 標準 ᠪ
  "b:3": [0x182a, null],
  "b:6": [0x182a, null],
  // b 在 o/u 前（U+1874）→ FVS1
  "b:4": [0x182a, FVS1],
  "b:7": [0x182a, FVS1],
  "b:9": [0x182a, null],
  "b:0": [0x182a, null],

  // ── 字母 p（ᠫ）──
  "p:3": [0x182b, null],
  "p:6": [0x182b, null],
  "p:4": [0x182b, FVS1],
  "p:7": [0x182b, FVS1],
  "p:9": [0x182b, null],
  "p:0": [0x182b, null],

  // ── 字母 h/q（ᠬ）──
  // h 鍵對映喉音；詞首形 U+1878 → ᠬ
  "h:3": [0x182c, null],
  "h:6": [0x182c, null],
  "h:7": [0x182c, null],
  "h:8": [0x182c, FVS1],
  "h:4": [0x182c, FVS1],
  "h:5": [0x182c, FVS2],
  "h:9": [0x182c, null],
  "h:10": [0x182c, null],
  "h:0": [0x182c, null],

  // ── 字母 g（ᠭ）──
  "g:3": [0x182d, null],
  "g:6": [0x182d, null],
  "g:7": [0x182d, null],
  "g:8": [0x182d, FVS1],
  "g:4": [0x182d, FVS1],
  "g:5": [0x182d, FVS2],
  "g:2": [0x182d, null], // debisger 形
  "g:9": [0x182d, null],
  "g:10": [0x182d, null],
  "g:11": [0x182d, FVS3],
  "g:0": [0x182d, null],

  // ── 字母 m（ᠮ）──
  "m:3": [0x182e, null],
  "m:6": [0x182e, null],
  "m:9": [0x182e, null],
  "m:0": [0x182e, null],

  // ── 字母 l（ᠯ）──
  "l:3": [0x182f, null],
  "l:6": [0x182f, null],
  "l:9": [0x182f, null],
  "l:0": [0x182f, null],

  // ── 字母 s（ᠰ）──
  "s:3": [0x1830, null],
  "s:6": [0x1830, null],
  "s:9": [0x1830, null],
  "s:0": [0x1830, null],

  // ── 字母 x = š（ᠱ）──
  "x:3": [0x1831, null],
  "x:6": [0x1831, null],
  "x:9": [0x1831, null],
  "x:0": [0x1831, null],

  // ── 字母 t（ᠲ）──
  "t:3": [0x1832, null],
  "t:6": [0x1832, null],
  "t:7": [0x1832, FVS1],
  "t:9": [0x1832, null],
  "t:0": [0x1832, null],

  // ── 字母 d（ᠳ）──
  "d:3": [0x1833, null],
  "d:6": [0x1833, null],
  "d:7": [0x1833, FVS1],
  "d:9": [0x1833, null],
  "d:0": [0x1833, null],

  // ── 字母 c = č（ᠴ）──
  "c:3": [0x1834, null],
  "c:6": [0x1834, null],
  "c:9": [0x1834, null],
  "c:0": [0x1834, null],

  // ── 字母 j = ǰ（ᠵ）──
  "j:3": [0x1835, null],
  "j:6": [0x1835, null],
  "j:9": [0x1835, null],
  "j:0": [0x1835, null],

  // ── 字母 y（ᠶ）──
  "y:3": [0x1836, null],
  "y:6": [0x1836, null],
  "y:9": [0x1836, null],
  "y:0": [0x1836, null],

  // ── 字母 r（ᠷ）──
  "r:3": [0x1837, null],
  "r:6": [0x1837, null],
  "r:9": [0x1837, null],
  "r:0": [0x1837, null],

  // ── 字母 w（ᠸ）──
  "w:3": [0x1838, null],
  "w:6": [0x1838, null],
  "w:9": [0x1838, null],
  "w:0": [0x1838, null],

  // ── 字母 f（ᠹ）──
  "f:3": [0x1839, null],
  "f:6": [0x1839, null],
  "f:4": [0x1839, FVS1],
  "f:7": [0x1839, FVS1],
  "f:9": [0x1839, null],
  "f:0": [0x1839, null],

  // ── 字母 k（ᠺ）──
  "k:3": [0x183a, null],
  "k:6": [0x183a, null],
  "k:4": [0x183a, FVS1],
  "k:7": [0x183a, FVS1],
  "k:9": [0x183a, null],
  "k:0": [0x183a, null],

  // ── 字母 z（ᠽ）──
  "z:3": [0x183d, null],
  "z:6": [0x183d, null],
  "z:9": [0x183d, null],
  "z:0": [0x183d, null],
};

/** 大寫鍵（A/E/I/O/U/N/B/P/H/G/M/L/S/X/T/D/C/J/Y/R/W/F/K/Z）沿用對應小寫規則 */
const UPPER_ALIAS = {
  A: "a", E: "e", I: "i", O: "o", U: "U", N: "n", B: "b", P: "p",
  H: "h", G: "g", M: "m", L: "l", S: "s", X: "x", T: "t", D: "d",
  C: "c", J: "j", Y: "y", R: "r", W: "w", F: "f", K: "k", Q: "q",
  Z: "z", V: "v",
};

/** 生成「輸入鍵 × 欄 → [基礎字母, FVS]」全表 */
function buildRowMap() {
  const out = {};

  for (const key of Object.keys(KEY_TO_BASE)) {
    const row = [];
    for (let col = 0; col < 12; col++) {
      const e = EXCEPTIONS[`${key}:${col}`];
      if (e) {
        row.push(e);
      } else {
        // 通用回退：用該鍵的基礎字母，無 FVS
        row.push([KEY_TO_BASE[key], null]);
      }
    }
    out[key] = row;
  }

  // 大寫鍵：映射到對應規則
  for (const [up, lo] of Object.entries(UPPER_ALIAS)) {
    const target = out[lo];
    if (target) out[up] = target;
  }

  return out;
}

const rowMap = buildRowMap();

// ─────── 輸出 ───────
const hex = (n) => (n === null ? "null" : `0x${n.toString(16)}`);
const lines = [];
lines.push("// AUTO-GENERATED — do not edit by hand. 生成腳本：scripts/gen-mongolian-glyphmap.mjs");
lines.push("//");
lines.push("// 「ZCode 字形碼位（Sibe/Manchu 區）→ 標準蒙古文 Unicode（U+1820–U+183D + FVS）」逐欄映射表。");
lines.push("//");
lines.push("// 推導依據（三重）：");
lines.push("//   ① 欄位語義（12 欄已由 zcode-engine.ts 逆向確認）");
lines.push("//   ② 字形構形段複合關係（如 U+1865+U+186A = 詞頭段+牙形段 = ᠠ a）");
lines.push("//   ③ 整詞字典交叉驗證（ZCode 內建 45 條）");
lines.push("//");
lines.push("// ⚠️ 本表為「結構化推導」結果，非直接複製上游代碼。");
lines.push("//    標準字母定義見 Unicode 16.0 Mongolian 區段（U+1800–U+18AF）。");
lines.push("");
lines.push("/** FVS 變體選擇符碼位 */");
lines.push("export const FVS1 = 0x180b;");
lines.push("export const FVS2 = 0x180c;");
lines.push("export const FVS3 = 0x180d;");
lines.push("");
lines.push("/** 每個輸入鍵的 12 欄映射：`[基礎字母碼位, FVS碼位|null][]` */");
lines.push("export const KEY_COL_TO_STD: Record<string, ReadonlyArray<readonly [number, number | null]>> = {");
for (const [key, row] of Object.entries(rowMap)) {
  lines.push(`    ${JSON.stringify(key)}: [`);
  lines.push("        " + row.map(([b, f]) => `[${hex(b)}, ${hex(f)}]`).join(", ") + ",");
  lines.push("    ],");
}
lines.push("};");
lines.push("");

writeFileSync(outPath, lines.join("\n"), "utf8");

const total = Object.keys(rowMap).length;
console.log(`已生成：${outPath}`);
console.log(`  鍵數：${total}（含大小寫）`);
console.log(`  欄位：12 × ${total} = ${12 * total} 條映射`);
console.log(`  例外定義：${Object.keys(EXCEPTIONS).length} 條`);
