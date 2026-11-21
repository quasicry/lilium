// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 生成 src/vendor/siddham-lantsa.generated.ts：把悉曇體（Siddham）與蘭札體（Lantsa / Ranjana）字體
// base64 內嵌，隨插件打包，首次載入時落盤到 vault 隱藏字體目錄。
//
// 背景：
//  - 悉曇體（Siddham，U+11580–U+115FF）官方 Unicode 7.0 編碼，採用 Noto Sans Siddham（SIL OFL 1.1）。
//  - 蘭札體（Lantsa）是 Rañjanā 雷尼扎那文的裝飾變體，目前尚無標準 Unicode 編碼。
//    本插件內嵌 Nithya Ranjana DU（Devanagari Unicode 編碼，SIL OFL 1.1，EkType 2024），
//    即：以天城體碼位（U+0900–U+097F）存放梵文，由本字型渲染爲蘭札/雷尼扎那字形。
//
//    ⚠️ NU 版（Newa Unicode 編碼 U+11400–U+1147F）**刻意不內嵌**。實測兩版 cmap
//    完全不相交（NU 無任何天城體碼位、DU 無 Newa 碼位），而本插件的 ranjana 文種
//    走的是天城體碼位 —— 把 NU 放進字體棧會被 CSS 每次都略過，只白付 0.46 MiB。
//    另經全庫排查（含 CBETA 蘭札外字表 2,240 條）確認：**當前沒有任何 Newa 碼位消費方**。
//    NU 源檔保留於 fonts-src/ 並隨交付包提供，用戶可透過「導入字體」自行啟用。
//    上述兩項結論由 test/siddham-lantsa-embed.mjs 機器校驗，勿在未新增 newa 消費
//    路徑前擅自把 NU 加進本表。
//
// 來源與授權（均可自由再分發）：
//  - Noto Sans Siddham：https://github.com/notofonts/siddham （SIL OFL 1.1）
//  - Nithya Ranjana：https://github.com/EkType/Nithya-Ranjana （SIL OFL 1.1）
//
// 運行：node scripts/gen-siddham-lantsa.mjs
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve("fonts-src");
const OUT = path.resolve("src/vendor/siddham-lantsa.generated.ts");

const FONTS = [
  {
    fileName: "NotoSansSiddham-Regular.ttf",
    family: "Noto Sans Siddham",
    id: "noto-sans-siddham",
    scripts: ["siddham"],
    note: "SIL OFL 1.1。悉曇體（Siddham，U+11580–U+115FF），Unicode 7.0 官方編碼，竹筆風格。",
  },
  {
    fileName: "NithyaRanjanaDU-Regular.otf",
    // 族名必須取自字體 name 表，不可手寫：v2.7.0 前手寫成 "Nithya Ranjana"，
    // 與字體自報的 "Nithya Ranjana DU" 不符，導致同一個檔案在「目錄」與
    // 「用戶導入」兩條通道下族名不一致。此處的值由
    // test/siddham-lantsa-embed.mjs 逐字鎖定（與 fonts-src/ 源檔真實 name 表比對）。
    family: "Nithya Ranjana DU",
    id: "nithya-ranjana-du",
    scripts: ["ranjana"],
    note: "SIL OFL 1.1（EkType 2024）。蘭札體 / Rañjanā，採 Devanagari Unicode 編碼（U+0900–U+097F）：以天城體碼位存梵文、由本字型渲染爲蘭札字形。",
  },
];

let body = `// 自动生成，请勿手工编辑。由 scripts/gen-siddham-lantsa.mjs 生成。\n`;
body += `// 悉曇體（Noto Sans Siddham）+ 蘭札體（Nithya Ranjana DU）base64 内嵌；\n`;
body += `// 许可：SIL Open Font License 1.1（可自由使用、商業、再分發；需保留著作權）。\n`;
body += `import type { ScriptId } from "../languages";\n\n`;
body += `/** 随插件内置、首次加载时落盘到 vault 字体目录的悉曇 / 蘭札字體 */\n`;
body += `export interface BundledSiddhamLantsaFontFile {\n`;
body += `  id: string;\n  family: string;\n  fileName: string;\n  scripts: ScriptId[];\n  base64: string;\n  note: string;\n}\n\n`;
body += `export const BUNDLED_SIDDHAM_LANTSA_FONT_FILES: BundledSiddhamLantsaFontFile[] = [\n`;

let total = 0;
for (const f of FONTS) {
  const srcPath = path.join(SRC_DIR, f.fileName);
  if (!fs.existsSync(srcPath)) {
    console.error(`!! 缺字體源文件: ${srcPath}`);
    console.error(`   請先將字體放入 fonts-src/`);
    process.exit(1);
  }
  const buf = fs.readFileSync(srcPath);
  const b64 = buf.toString("base64");
  total += buf.length;
  body += `  {\n`;
  body += `    id: ${JSON.stringify(f.id)},\n`;
  body += `    family: ${JSON.stringify(f.family)},\n`;
  body += `    fileName: ${JSON.stringify(f.fileName)},\n`;
  body += `    scripts: ${JSON.stringify(f.scripts)},\n`;
  body += `    base64: ${JSON.stringify(b64)},\n`;
  body += `    note: ${JSON.stringify(f.note)},\n`;
  body += `  },\n`;
  console.log(`  ${f.fileName}: ${(buf.length / 1024).toFixed(1)} KB`);
}
body += `];\n`;

fs.writeFileSync(OUT, body);
console.log(`生成 ${OUT}（base64 合计约 ${(total * 4 / 3 / 1024 / 1024).toFixed(2)} MiB）`);
