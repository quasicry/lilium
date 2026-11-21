#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 生成 src/tsdata/vo.gen.ts —— UAX #50 / UAX #TR50 的 Vertical_Orientation（vo）查表。
 *
 * 用法：
 *   node scripts/gen-vo.mjs            # 生成；寫檔後立即做全碼位自驗證
 *   node scripts/gen-vo.mjs --check    # 只比對現有輸出是否與重新生成的完全一致（幂等檢查）
 *
 * 為什麼要這張表（對應 LI-TS-201）：
 *   直排時每個字該直立還是側倒，規範上的權威判定是 UCD 的 `Vertical_Orientation`。
 *   `li` 過去用的是「白名單／硬編碼區間」近似，bambook 的教訓是希臘／西里爾／
 *   阿拉伯會被誤判成 U（應為 R）。要避免這種錯誤，唯一辦法就是**表驅動**。
 *
 * 值域（UAX #50 §3.1）：
 *   U  = Upright                  直立，與 code chart 同向
 *   R  = Rotated                  相對 code chart 順時針 90°
 *   Tu = Transform…Upright        優先取直排替換字形，缺則直立
 *   Tr = Transform…Rotated        優先取直排替換字形，缺則旋轉
 * 注意：**只有 R 是「側倒」**，U/Tu/Tr 在 css-writing-modes-4 §5.1.2 下都算 upright。
 *
 * 同源取舍（與 pretext scripts/generate-line-break-data.ts 一致，理由見該檔）：
 *   · 不做任何類別投影——vo 只有 4 個值，本來就塞得進單字元編碼，投影只會丟資訊。
 *   · 兩級查表 + 逐塊去重；Plane 14 以上的零星指派走 tailRanges 線性判斷。
 *   · 全部碼位（含未分配的 Plane 2/3、PUA）都按 UCD 的 @missing 與條目展開，
 *     不做「非 CJK 就當 R」這類近似。
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

const SOURCE_FILE = "VerticalOrientation-18.0.0.txt";
const OUTPUT_PATH = join(PROJECT_ROOT, "src", "tsdata", "vo.gen.ts");

/** vo 值域，順序即內部碼。U/R/Tu/Tr 依 UAX #50 §3.1 的列出順序 */
const VO_VALUES = ["U", "R", "Tu", "Tr"];
const VO_CODES = new Map(VO_VALUES.map((name, code) => [name, code]));

const text = readFileSync(join(UCD_DIR, SOURCE_FILE), "utf8");
const spec = parseUcd(text, (value) => {
  const code = VO_CODES.get(value);
  // 未知值一律丟錯：UAX 若新增第五種值，靜默當成別的值會讓整張表變錯且不自知。
  if (code === undefined) throw new Error(`未知的 Vertical_Orientation 值：${value}`);
  return code;
});

const table = buildTwoStage(spec.classes);
const { stage1, stage2 } = encodeTables(table);
const tailChecks = encodeTailChecks(table, (code) => `VerticalOrientation.${VO_VALUES[code]}`);

const classRows = VO_VALUES.map((name, code) => `  ${name}: ${code},`).join("\n");

const out = `// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
// 本檔由 scripts/gen-vo.mjs 生成，請勿手改。
// 重新生成：node scripts/gen-vo.mjs（幂等；--check 可只做一致性檢查）
${ucdLicenseBlock(spec)}
// 規範依據：UAX #50「Unicode Vertical Text Layout」https://www.unicode.org/reports/tr50/
// 本表用途：LI-CJK排版標準-v1.0 條款 LI-TS-201（朝向必須表驅動，不得白名單近似）

/** Vertical_Orientation（vo）值域，內部碼 0..3（UAX #50 §3.1） */
export const VerticalOrientation = {
${classRows}
} as const;

/** 內部碼 → 值域名稱（除錯訊息／NOTICE 產出用） */
export const VO_VALUE_NAMES = ${JSON.stringify(VO_VALUES)} as const;

/** 本表對應的 Unicode 版本（溯源用，勿與執行環境的 Unicode 版本混淆） */
export const VO_UNICODE_VERSION = ${JSON.stringify(spec.unicodeVersion)};
/** UCD 資料檔的發布日（溯源用；非抓取當日，詳見檔頭） */
export const VO_SOURCE_DATE = ${JSON.stringify(spec.sourceDate)};

// 兩級查表，以可列印 ASCII 字串存放（手法源自 pretext 的 generate-line-break-data.ts）：
//   stage1：每 ${BLOCK_SIZE} 個碼位一個塊 id，各 id 拆成兩個 base-${DIGIT_LIMIT} 數字（共 ${table.stage1.length} 塊，${table.distinctBlocks} 個去重後）；
//   stage2：塊 id × ${BLOCK_SIZE} → vo 碼，一字元一個碼位。
// 每個字元的數值 = charCodeAt - ${formatHex(CHARACTER_BASE)}。字串各只有一份參考，打包器無從複製。
const stage1 = ${JSON.stringify(stage1)}
const stage2 = ${JSON.stringify(stage2)}

/**
 * 查單個碼位的 Vertical_Orientation。
 * 未列出碼位依 UCD \`@missing: 0000..10FFFF; R\` 回傳 R（UAX #50 §5）。
 * 呼叫方若需處理「grapheme cluster 取整簇首字元、含 Gc=Me 強制 U」（§3.2.1），
 * 應由排版層在分簇後再呼叫本函式——本表只回答單碼位的問題。
 */
export function getVerticalOrientation(codePoint: number): number {
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
    console.error(`✗ 找不到既有輸出 ${OUTPUT_PATH}，請先跑一次 node scripts/gen-vo.mjs`);
    process.exit(1);
  }
  if (current !== out) {
    console.error(`✗ ${OUTPUT_PATH} 與重新生成的內容不一致——請重新執行 node scripts/gen-vo.mjs`);
    process.exit(1);
  }
  console.log(`✓ vo.gen.ts 幂等：重新生成的內容與既有檔案完全一致（Unicode ${spec.unicodeVersion}）`);
} else {
  writeFileSync(OUTPUT_PATH, out);
  console.log(
    `已寫出 src/tsdata/vo.gen.ts（Unicode ${spec.unicodeVersion}／UCD ${spec.sourceDate}）：\n` +
      `  stage1 ${table.stage1.length} 塊（去重後 ${table.distinctBlocks} 個），` +
      `stage2 ${table.stage2.length} 位元組，tailRanges ${table.tailRanges.length} 段\n` +
      `  原始 .txt ${(text.length / 1024).toFixed(1)} KiB → 查表 ${(out.length / 1024).toFixed(1)} KiB`,
  );
}

// 自驗證：把剛寫出（或既有）的 .ts 真的 import 進來，逐碼位對原始 .txt 的真值比對。
const mod = await loadGeneratedTs(OUTPUT_PATH);
const ok = reportVerification("vo 全碼位比對", verifyAllCodePoints(spec.classes, mod.getVerticalOrientation));
if (!ok) process.exit(1);
