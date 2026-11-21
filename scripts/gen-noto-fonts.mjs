// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 生成 src/vendor/noto-fonts.generated.ts：把 Noto Sans Mongolian + Noto Serif Old Uyghur
// + Noto Naskh Arabic + Noto Serif Hebrew + Noto Sans Sinhala
// + Noto Sans Devanagari + Noto Serif Tibetan 字體 base64 內嵌。
// （彝文 / 傣文 / 高棉 / 緬甸 / 泰文 字體已於 v2.2.0 移除）
// 七套字體均為 SIL Open Font License 1.1，可自由再分發。
// 原則：除中日韓（han/hant/ja/ko，字體龐大走 CDN）外，所有系統書寫文字一律內嵌。
//
// 來源：
//   - Noto Sans Mongolian（含滿文 Unicode 區段 U+1800–U+18AF）— 覆蓋蒙古文/滿文/錫伯文
//   - Noto Serif Old Uyghur（U+10F70–U+10FAF）— 覆蓋回鶻文
//   - Noto Naskh Arabic（U+0600–U+06FF 等）— 覆蓋阿拉伯文（含波斯語、烏爾都語）
//   - Noto Serif Hebrew（U+0590–U+05FF）— 覆蓋希伯來文
//   - Noto Sans Sinhala（U+0D80–U+0DFF）— 覆蓋僧伽羅文
//
// 用途：插件首次運行時落盤到 vault 內 .lilium/fonts/，用戶無需手動下載，
// 導出 PDF / EPUB 即可內嵌字體保證任意閱讀器渲染一致。
//
// 運行：node scripts/gen-noto-fonts.mjs
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve("fonts-src");
const OUT = path.resolve("src/vendor/noto-fonts.generated.ts");

// 許可：SIL Open Font License 1.1 — 自由使用、商業亦可、僅需保留著作權聲明。
const FONTS = [
  {
    fileName: "NotoSansMongolian-Regular.ttf",
    family: "Noto Sans Mongolian",
    id: "noto-sans-mongolian",
    scripts: ["mongolian", "manchu", "xibe"],
    note: "SIL OFL 1.1。Unicode 蒙古文 / 滿文 / 錫伯文（Mongolian 區段 U+1800–U+18AF，含 U+1860–U+1877 滿文字母）。",
  },
  {
    fileName: "NotoNaskhArabic-Regular.ttf",
    family: "Noto Naskh Arabic",
    id: "noto-naskh-arabic",
    scripts: ["arabic"],
    note: "SIL OFL 1.1。阿拉伯文（U+0600–U+06FF、U+0750–U+08FF、呈现形 U+FB50–U+FDFD / U+FE70–U+FEFC）。",
  },
  {
    fileName: "NotoSerifHebrew-Regular.ttf",
    family: "Noto Serif Hebrew",
    id: "noto-serif-hebrew",
    scripts: ["hebrew"],
    note: "SIL OFL 1.1。希伯来文（U+0590–U+05FF，含元音点与呈现形 U+FB1D–U+FB4F）。",
  },
  {
    fileName: "NotoSerifOldUyghur-Regular.ttf",
    family: "Noto Serif Old Uyghur",
    id: "noto-serif-old-uyghur",
    scripts: ["olduyghur"],
    note: "SIL OFL 1.1。回鶻文（U+10F70–U+10FAF），直寫列序自左向右。",
  },
  {
    fileName: "NotoSansSinhala-Regular.ttf",
    family: "Noto Sans Sinhala",
    id: "noto-sans-sinhala",
    scripts: ["sinhala"],
    note: "SIL OFL 1.1。僧伽羅文（斯里蘭卡，U+0D80–U+0DFF）。",
  },
  {
    fileName: "NotoSansDevanagari-Regular.ttf",
    family: "Noto Sans Devanagari",
    id: "noto-sans-devanagari",
    scripts: ["sanskrit", "pali"],
    note: "SIL OFL 1.1。天城體（Devanagari，U+0900–U+097F、U+A8E0–U+A8FF），覆蓋梵文與巴利文。",
  },
  {
    fileName: "NotoSerifTibetan-Regular.ttf",
    family: "Noto Serif Tibetan",
    id: "noto-serif-tibetan",
    scripts: ["tibetan"],
    note: "SIL OFL 1.1。藏文（Tibetan，U+0F00–U+0FFF）。",
  },
  {
    fileName: "NotoSansBrahmi-Regular.ttf",
    family: "Noto Sans Brahmi",
    id: "noto-sans-brahmi",
    scripts: ["brahmi"],
    note: "SIL OFL 1.1。婆羅米文（Brahmi，U+11000–U+1107F），印度系文字之祖，阿育王法敕文字。",
  },
  {
    fileName: "NotoSansPhagsPa-Regular.ttf",
    family: "Noto Sans PhagsPa",
    id: "noto-sans-phagspa",
    scripts: ["phagspa"],
    note: "SIL OFL 1.1。八思巴文（'Phags-pa，U+A840–U+A87F，56 碼位全覆蓋），元朝國字，直寫列序自左向右。",
  },
  {
    fileName: "LiliumSinologicalDot-Regular.ttf",
    family: "Lilium Sinological Dot",
    id: "lilium-sinological-dot",
    scripts: ["phagspa"],
    note: "SIL OFL 1.1。隔音號補充字型：僅含 U+A78F LATIN LETTER SINOLOGICAL DOT 單字形（Noto Sans instancer＋subset 派生，著作權聲明保留於 name 表）。八思巴文學術轉寫以該拉丁字符作隔音號（phagspa.ts 羅馬字鍵 \"-\"），內嵌 Noto Sans PhagsPa 不收此碼位（Latin Extended-D），系統字型亦多缺——缺之則檢字表/輸出豆腐。",
  },
  {
    fileName: "NotoSansKharoshthi-Regular.ttf",
    family: "Noto Sans Kharoshthi",
    id: "noto-sans-kharoshthi",
    scripts: ["kharoshthi"],
    note: "SIL OFL 1.1。佉盧虱吒文（Kharoshthi，U+10A00–U+10A5F），犍陀羅語文字，唯一 RTL 婆羅米文。",
  },
  {
    fileName: "NotoSansMarchen-Regular.ttf",
    family: "Noto Sans Marchen",
    id: "noto-sans-marchen",
    scripts: ["marchen"],
    note: "SIL OFL 1.1。Marchen 文（Marchen，U+11C70–U+11CBF），苯教文字，藏文同源，無 tshek。",
  },
  {
    fileName: "NotoSansZanabazarSquare-Regular.ttf",
    family: "Noto Sans Zanabazar Square",
    id: "noto-sans-zanabazar-square",
    scripts: ["zanabazar"],
    note: "SIL OFL 1.1。方形札那巴扎爾文（Zanabazar Square，U+11A00–U+11A4F），顯式 SUBJOINER 疊字。",
  },
  {
    fileName: "NotoSansSoyombo-Regular.ttf",
    family: "Noto Sans Soyombo",
    id: "noto-sans-soyombo",
    scripts: ["soyombo"],
    note: "SIL OFL 1.1。索永布文（Soyombo，U+11A50–U+11AAF），札那巴扎爾所創，蒙古國徽索永布符號即 U+11A9E。",
  },
];

let body = `// 自动生成，请勿手工编辑。由 scripts/gen-noto-fonts.mjs 生成。\n`;
// 檔頭的族名清單由 FONTS 推導，不再手寫 —— 此前手寫的版本在 v2.2.0 移除彝文字體、
// v2.7.0 移除 CJK 之後就一直寫著早已不在的名（Noto Sans Yi）。
const familyList = FONTS.map((f) => f.family).join(" + ");
// v2.7.0：CJK 與彝文字體皆已移出內嵌，改由系統字體 / 用戶自行導入承擔，
// 理由見 docs/SIDDHAM-LANTSA-FONTS.md 與 README「字体支持」節。
body += `// ${familyList} base64 内嵌；\n// 来源：notofonts.github.io。\n`;
body += `// 许可：SIL Open Font License 1.1（可自由使用、商業、再分發；需保留著作權）。\n`;
body += `import type { ScriptId } from "../languages";\n\n`;
body += `/** 随插件内置、首次加载时落盘到 vault 字体目录的 Noto 系列字體 */\n`;
body += `export interface BundledNotoFontFile {\n`;
body += `  id: string;\n  family: string;\n  fileName: string;\n  scripts: ScriptId[];\n  base64: string;\n  note: string;\n}\n\n`;
body += `export const BUNDLED_NOTO_FONT_FILES: BundledNotoFontFile[] = [\n`;

let total = 0;
for (const f of FONTS) {
  const srcPath = path.join(SRC_DIR, f.fileName);
  if (!fs.existsSync(srcPath)) {
    console.error(`!! 缺字體源文件: ${srcPath}`);
    console.error(`   請從 https://github.com/notofonts/notofonts.github.io/tree/main/fonts 下載到 fonts-src/`);
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
console.log(`生成 ${OUT}（base64 合计约 ${(total * 4 / 3 / 1024 / 1024).toFixed(1)} MiB）`);
