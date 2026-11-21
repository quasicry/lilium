#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 生成 src/tsdata/lb.gen.ts —— UAX #14 的 Line_Break（lb）屬性查表。
 *
 * 用法：
 *   node scripts/gen-lb.mjs            # 生成；寫檔後立即做全碼位自驗證
 *   node scripts/gen-lb.mjs --check    # 只比對現有輸出是否與重新生成的完全一致（幂等檢查）
 *
 * 為什麼要這張表（對應 LI-TS-402）：
 *   行首行尾禁則與斷行必須基於 UAX #14 的 Line_Break 分類，**不得手寫字元陣列**
 *   ——VerTick 的 `isHeadNg`/`isTailNg` 就是手寫陣列，結果有 `") "` 帶空格、
 *   `"]"` 重複、只 lookahead 2 字等缺陷。資料源必須是可重生成的權威表。
 *
 * 壓縮手法（移植自 pretext scripts/generate-line-break-data.ts，未另創）：
 *   ① **類別投影**：把 UAX #14 的 49 個原始類別投影成 32 個「預處理分不開」的
 *      類別，讓每個值塞進一個 base-32 數字：
 *        AI/SG/XX/CB → AL（LB1；CB 只在與其他文字相鄰時才等同 AL）
 *        H2/H3/JL/JV/JT → ID（LB20/LB21，斷行上與 ID 同）
 *        AP/AS/VF/VI → AK（同上，aksara 系列）
 *        CR/LF/NL → BK（LB4/LB5，三者都強制斷行）
 *        ZWJ → CM（LB8a 保留成對 U+200D 的顯式測試，見下）
 *      **代價與取捨**：投影後丟掉的資訊只有「原始類別名」，斷行規則的判定結果
 *      不變（這 17 個類別在 UAX #14 的規則表裡從未被單獨引用）。取捨理由是
 *      32 是單字元編碼的上限（DIGIT_LIMIT），多一個類別就得改用兩字元，表體積
 *      直接翻倍。**唯一的例外是 ZWJ**：LB8a 用的是 `ZWJ × ID/EB/EM`，而投影後的
 *      CM 在 LB9/LB10 會被當成「黏在前一字上」，因此消費端若需要精確的 LB8a，
 *      必須對 U+200D 做一次顯式判斷（pretext 同此做法，見其註解）。
 *   ② **兩級查表 + 逐塊去重**：128 碼位一塊，內容相同的塊共用 id。
 *   ③ Plane 14 以上走 tailRanges 線性判斷。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLOCK_SHIFT,
  BLOCK_SIZE,
  CHARACTER_BASE,
  DIGIT_LIMIT,
  STAGE1_LIMIT,
  UCD_DIR,
  PROJECT_ROOT,
  buildTwoStage,
  encodeTables,
  encodeTailChecks,
  formatHex,
  loadGeneratedTs,
  parseUcd,
  reportVerification,
  ucdLicenseBlock,
  verifyAllCodePoints,
} from "./ucd/ucd-lib.mjs";

const SOURCE_FILE = "LineBreak-18.0.0.txt";
const OUTPUT_PATH = join(PROJECT_ROOT, "src", "tsdata", "lb.gen.ts");

/** 投影後的 32 個類別，順序即內部碼（必須 ≤ DIGIT_LIMIT） */
const PROJECTED_CLASSES = [
  "AL", "AK", "B2", "BA", "BB", "BK", "CJ", "CL", "CM", "CP", "EB", "EM", "EX", "GL", "HH", "HL",
  "HY", "ID", "IN", "IS", "NS", "NU", "OP", "PO", "PR", "QU", "RI", "SA", "SP", "SY", "WJ", "ZW",
];

/** 原始類別 → 投影類別（斷行規則分不開者），說明見檔頭 */
const PROJECTIONS = new Map([
  ["AI", "AL"], ["SG", "AL"], ["XX", "AL"], ["CB", "AL"],
  ["H2", "ID"], ["H3", "ID"], ["JL", "ID"], ["JV", "ID"], ["JT", "ID"],
  ["AP", "AK"], ["AS", "AK"], ["VF", "AK"], ["VI", "AK"],
  ["CR", "BK"], ["LF", "BK"], ["NL", "BK"],
  ["ZWJ", "CM"],
]);

const codeByName = new Map(PROJECTED_CLASSES.map((name, code) => [name, code]));
for (const [raw, projected] of PROJECTIONS) {
  codeByName.set(raw, codeByName.get(projected));
}
if (PROJECTED_CLASSES.length > DIGIT_LIMIT) throw new Error("投影後類別數超過單字元可表示的 32 個");

const text = readFileSync(join(UCD_DIR, SOURCE_FILE), "utf8");
const spec = parseUcd(text, (value) => {
  const code = codeByName.get(value);
  // UAX #14 若新增類別，靜默投影會讓禁則悄悄失效，故寧可讓生成失敗。
  if (code === undefined) throw new Error(`未知的 Line_Break 類別：${value}`);
  return code;
});

const table = buildTwoStage(spec.classes);
const { stage1, stage2 } = encodeTables(table);
const tailChecks = encodeTailChecks(table, (code) => `LineBreakClass.${PROJECTED_CLASSES[code]}`);

// 49 個原始類別名全部列出（含被投影者），讓消費端寫 `LineBreakClass.CJ` 時
// 不論寫原始名或投影名都拿到同一個碼，避免「以為自己查的是 XX、其實拿到 AL」。
const allClassRows = [
  ...PROJECTED_CLASSES.map((name) => [name, codeByName.get(name)]),
  ...[...PROJECTIONS].map(([raw]) => [raw, codeByName.get(raw)]),
]
  .sort((a, b) => (a[1] - b[1]) || a[0].localeCompare(b[0]))
  .map(([name, code]) => `  ${name}: ${code},`)
  .join("\n");

const out = `// 本檔由 scripts/gen-lb.mjs 生成，請勿手改。
// 重新生成：node scripts/gen-lb.mjs（幂等；--check 可只做一致性檢查）
${ucdLicenseBlock(spec)}
// 規範依據：UAX #14「Unicode Line Breaking Algorithm」https://www.unicode.org/reports/tr14/
// 本表用途：LI-CJK排版標準-v1.0 條款 LI-TS-402（禁則與斷行必須基於 Line_Break 分類）
// 壓縮與類別投影手法移植自 pretext scripts/generate-line-break-data.ts，取捨理由見該生成腳本檔頭。

/**
 * Line_Break 類別碼。
 *
 * 鍵含 UAX #14 全部 ${codeByName.size} 個原始類別名；被投影者與其目標共用同一個碼
 * （例如 \`AI\`/\`SG\`/\`XX\`/\`CB\` 都等同 \`AL\`），因為這些類別在 UAX #14 的規則表裡
 * 從未被單獨引用（LB1／LB20／LB21／LB4／LB5）。
 * 反向查名用 \`LB_CLASS_NAMES[code]\`，得到的是投影後的 32 個類別之一。
 */
export const LineBreakClass = {
${allClassRows}
} as const;

/** 投影後類別碼 → 類別名（${PROJECTED_CLASSES.length} 個，索引即類別碼） */
export const LB_CLASS_NAMES = ${JSON.stringify(PROJECTED_CLASSES)} as const;

/** 本表對應的 Unicode 版本（溯源用） */
export const LB_UNICODE_VERSION = ${JSON.stringify(spec.unicodeVersion)};
/** UCD 資料檔的發布日（溯源用；非抓取當日，詳見檔頭） */
export const LB_SOURCE_DATE = ${JSON.stringify(spec.sourceDate)};

// 兩級查表，以可列印 ASCII 字串存放：
//   stage1：每 ${BLOCK_SIZE} 個碼位一個塊 id，各 id 拆成兩個 base-${DIGIT_LIMIT} 數字（共 ${table.stage1.length} 塊，去重後 ${table.distinctBlocks} 個）；
//   stage2：塊 id × ${BLOCK_SIZE} → 類別碼，一字元一個碼位。
// 每個字元的數值 = charCodeAt - ${formatHex(CHARACTER_BASE)}。
const stage1 = ${JSON.stringify(stage1)}
const stage2 = ${JSON.stringify(stage2)}

/**
 * 查單個碼位的 Line_Break 類別碼。
 * 未列出碼位依 UCD \`@missing: 0000..10FFFF; XX\` 回傳 \`LineBreakClass.XX\`（＝AL 的碼）。
 * 注意：U+200D（ZWJ）被投影為 CM，若需精確套用 LB8a，請對 U+200D 額外顯式判斷。
 */
export function getLineBreakClass(codePoint: number): number {
  let index = codePoint;
  if (codePoint >= ${formatHex(BLOCK_SIZE)}) {
    const block = codePoint >> ${BLOCK_SHIFT};
    if (block >= ${table.stage1.length}) {
      // 超出 stage1 覆蓋範圍（末端 ${formatHex(table.stage1Length << BLOCK_SHIFT)}）：${formatHex(STAGE1_LIMIT)} 之上指派極稀疏，擴張 stage1 不划算。
      return ${tailChecks === "" ? "" : `${tailChecks} :\n      `}${table.defaultClass};
    }
    const id = ((stage1.charCodeAt(block << 1) - ${formatHex(CHARACTER_BASE)}) << 5) |
      (stage1.charCodeAt((block << 1) + 1) - ${formatHex(CHARACTER_BASE)});
    index = (id << ${BLOCK_SHIFT}) | (codePoint & ${formatHex(BLOCK_SIZE - 1)});
  }
  return stage2.charCodeAt(index) - ${formatHex(CHARACTER_BASE)};
}
`;

const checkOnly = process.argv.includes("--check");
if (checkOnly) {
  let current;
  try {
    current = readFileSync(OUTPUT_PATH, "utf8");
  } catch {
    console.error(`✗ 找不到既有輸出 ${OUTPUT_PATH}，請先跑一次 node scripts/gen-lb.mjs`);
    process.exit(1);
  }
  if (current !== out) {
    console.error(`✗ ${OUTPUT_PATH} 與重新生成的內容不一致——請重新執行 node scripts/gen-lb.mjs`);
    process.exit(1);
  }
  console.log(`✓ lb.gen.ts 幂等：重新生成的內容與既有檔案完全一致（Unicode ${spec.unicodeVersion}）`);
} else {
  writeFileSync(OUTPUT_PATH, out);
  console.log(
    `已寫出 src/tsdata/lb.gen.ts（Unicode ${spec.unicodeVersion}／UCD ${spec.sourceDate}）：\n` +
      `  ${codeByName.size} 個原始類別投影為 ${PROJECTED_CLASSES.length} 個；` +
      `stage1 ${table.stage1.length} 塊（去重後 ${table.distinctBlocks} 個），` +
      `stage2 ${table.stage2.length} 位元組，tailRanges ${table.tailRanges.length} 段\n` +
      `  原始 .txt ${(text.length / 1024).toFixed(1)} KiB → 查表 ${(out.length / 1024).toFixed(1)} KiB`,
  );
}

// 自驗證：把剛寫出（或既有）的 .ts import 進來，逐碼位對原始 .txt 的真值比對。
const mod = await loadGeneratedTs(OUTPUT_PATH);
const ok = reportVerification("lb 全碼位比對", verifyAllCodePoints(spec.classes, mod.getLineBreakClass));
if (!ok) process.exit(1);
