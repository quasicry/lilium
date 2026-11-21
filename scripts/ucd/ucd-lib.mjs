#!/usr/bin/env node
/**
 * UCD 資料層共用工具（供 scripts/gen-vo.mjs、scripts/gen-lb.mjs、test/tsdata.gen.mjs 使用）
 *
 * 為什麼要共用：三支程式都要做同一件事——「把 UCD .txt 解析成逐碼位陣列 →
 * 編碼成兩級查表 → 再從 **原始 .txt 的直接查詢** 全碼位比對查表結果」。
 * 若各自實作，解析規則（@missing 的套用順序、註解剝除、區間語法）一旦漂移，
 * 驗證就變成「拿錯的答案對錯的答案」，自我驗證形同虛設。因此解析與比對
 * 集中在這裡，gen 腳本只負責「值域定義 + 檔頭文字」。
 *
 * 設計取捨（與 pretext scripts/generate-line-break-data.ts 同源）：
 *   · 一律**離線解析**：本目錄下的 .txt 是隨原始 UCD 一同提交的本地副本，
 *     gen 腳本不開網路。理由：沙箱需走 SOCKS5h 代理，讓生成腳本依賴網路會
 *     使「重跑產出一致」無法保證，也無法在離線環境重現。
 *   · 溯源日期取 UCD 檔頭的 `# Date:`（資料發布日），**不取執行當日**，
 *     否則每次重跑都會產出不同的檔頭，幂等自檢必然失敗。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

export const UCD_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(UCD_DIR, "..", "..");

/** UCD 資料檔的抓取來源（授權合規用，見 scripts/ucd/SOURCES.md） */
export const UCD_BASE_URL = "https://www.unicode.org/Public/UCD/latest/ucd";

/**
 * 解析 UCD 資料檔（UCD 的 `Xxx-<version>.txt` 通用兩欄格式）。
 *
 * 只做語法解析，不做值域解碼——值域由呼叫方給 `toCode` 決定，
 * 這樣 vo（4 值）與 lb（43 值）可以共用同一支解析器。
 *
 * 套用順序很重要：**先 @missing 後逐條目**。UCD 的語義是「@missing 給出
 * 區間預設值，其後的條目逐一覆寫」，順序反了會讓整份表退化成單一預設值。
 *
 * @param {string} text 檔案全文
 * @param {(value: string) => number} toCode 值域字串 → 內部碼；未知值應丟錯
 */
export function parseUcd(text, toCode) {
  const lines = text.split(/\r?\n/);

  const versionMatch = lines[0]?.match(/^#\s+([A-Za-z]+)-(\d+(?:\.\d+)*)\.txt$/);
  if (!versionMatch) throw new Error("無法從檔頭判斷 Unicode 版本（應為 `# <Name>-<version>.txt`）");
  const dateMatch = text.match(/^#\s*Date:\s*(\d{4}-\d{2}-\d{2})/m);
  if (!dateMatch) throw new Error("找不到檔頭的 `# Date:` 欄位");

  const missing = [];
  const entries = [];
  for (const line of lines) {
    const m = line.match(/^#\s*@missing:\s*([0-9A-Fa-f]+(?:\.\.[0-9A-Fa-f]+)?)\s*;\s*([A-Za-z0-9_]+)/);
    if (m !== null) missing.push([...parseRange(m[1]), m[2]]);
  }
  if (missing.length === 0) throw new Error("UCD 檔缺少 @missing 預設值，拒絕生成（否則未列出碼位無定義）");

  for (const line of lines) {
    // 只剝第一個 `#` 之後的註解；UCD 的註解裡也含 `;` 與區間，不剝會誤判。
    const body = line.split("#", 1)[0].trim();
    if (body.length === 0) continue;
    const m = body.match(/^([0-9A-Fa-f]+(?:\.\.[0-9A-Fa-f]+)?)\s*;\s*([A-Za-z0-9_]+)$/);
    if (m === null) throw new Error(`無法解析的 UCD 條目：${line}`);
    entries.push([...parseRange(m[1]), m[2]]);
  }

  return {
    fileName: versionMatch[0].slice(2),
    unicodeVersion: versionMatch[2],
    sourceDate: dateMatch[1],
    classes: fillClasses(missing, entries, toCode),
  };
}

function parseRange(raw) {
  const [startRaw, endRaw] = raw.split("..");
  const start = Number.parseInt(startRaw, 16);
  const end = endRaw === undefined ? start : Number.parseInt(endRaw, 16);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > 0x10ffff) {
    throw new Error(`無效的碼位區間：${raw}`);
  }
  return [start, end];
}

function fillClasses(missing, entries, toCode) {
  const classes = new Uint8Array(0x110000);
  for (const [start, end, value] of missing) classes.fill(toCode(value), start, end + 1);
  for (const [start, end, value] of entries) classes.fill(toCode(value), start, end + 1);
  return classes;
}

// ───────────────────────── 兩級壓縮查表 ─────────────────────────
// 手法直接移植自 pretext scripts/generate-line-break-data.ts：
//   ① 以 128 碼位為一塊（BLOCK_SHIFT=7）切分整個碼位空間；
//   ② **逐塊內容去重**（`values.join(',')` 當鍵）→ 相同內容的塊共用一個 id。
//     這是壓縮率的來源：CJK 擴展區、Plane 2/3、未分配區全是同值長條，
//     上千個塊 collapse 成個位數的 id。
//   ③ stage1 存「每塊 → 塊 id」，stage2 存「塊 id × 128 → 值」；
//   ④ Plane 14 以上（0xE0000+）只有零星指派，不進 stage1，改由 tailRanges
//      線性判斷，省掉整段 stage1 條目。
// 為什麼值要編成可列印 ASCII 而不是數字陣列：數字陣列 `[0,1,3,...]` 每個元素
// 至少 2 位元組（逗號+數字），而一個 charCode 代表一個值只要 1 個 UTF-16 碼元，
// 體積約為 1/3 ～ 1/4，且 JS 引擎無需為字面量建陣列。

/** 區塊大小對數：128 碼位／塊。沿用 pretext，實測去重率最好 */
export const BLOCK_SHIFT = 7;
export const BLOCK_SIZE = 1 << BLOCK_SHIFT;
/** stage1 只覆蓋到此碼位（不含）；之上的碼位交給 tailRanges */
export const STAGE1_LIMIT = 0xe0000;
/** 每個字元可表示的值數上限（值域必須 < 32，vo=4、lb=32 都符合） */
export const DIGIT_LIMIT = 32;
/** 值 0 對應的字元碼。0x23 起點讓所有字元落在可列印 ASCII，字串字面量不必跳脫 */
export const CHARACTER_BASE = 0x23;

export function buildTwoStage(classes) {
  const defaultClass = classes[0x10ffff];

  // stage1 只長到「最後一個非預設值的碼位」為止，尾部全是預設值的區段不必存。
  let stage1Length = 1;
  for (let cp = BLOCK_SIZE; cp < STAGE1_LIMIT; cp++) {
    if (classes[cp] !== defaultClass) stage1Length = (cp >> BLOCK_SHIFT) + 1;
  }

  const blockIds = new Map();
  const stage1 = [];
  const blocks = [];
  for (let block = 0; block < stage1Length; block++) {
    const values = classes.subarray(block << BLOCK_SHIFT, (block + 1) << BLOCK_SHIFT);
    const key = values.join(",");
    let id = blockIds.get(key);
    if (id === undefined) {
      id = blocks.length;
      blockIds.set(key, id);
      blocks.push(values);
    }
    stage1.push(id);
  }
  if (blocks.length > DIGIT_LIMIT * DIGIT_LIMIT) {
    throw new Error(`去重後仍有 ${blocks.length} 個塊，超出兩字元 id 可表示的 ${DIGIT_LIMIT * DIGIT_LIMIT} 個`);
  }

  const stage2 = new Uint8Array(blocks.length << BLOCK_SHIFT);
  for (let i = 0; i < blocks.length; i++) stage2.set(blocks[i], i << BLOCK_SHIFT);

  const tailRanges = [];
  for (let cp = stage1Length << BLOCK_SHIFT; cp < 0x110000; cp++) {
    const code = classes[cp];
    if (code === defaultClass) continue;
    const last = tailRanges[tailRanges.length - 1];
    if (last !== undefined && last[1] === cp - 1 && last[2] === code) last[1] = cp;
    else tailRanges.push([cp, cp, code]);
  }

  return { stage1, stage2, tailRanges, defaultClass, stage1Length, distinctBlocks: blocks.length };
}

export function formatHex(value) {
  return `0x${value.toString(16).toUpperCase()}`;
}

/** 值 → 單一字元（用於 stage1/stage2 字串） */
export function encodeDigit(value) {
  return String.fromCharCode(CHARACTER_BASE + value);
}

/** 把兩級表編成 JS 字串字面量 */
export function encodeTables(table) {
  // 每塊 id 拆成兩個 base-32 數字；一次組完整個字串，避免輸出檔裡留下可折疊的串接。
  let stage1 = "";
  for (const id of table.stage1) stage1 += encodeDigit(id >> 5) + encodeDigit(id & (DIGIT_LIMIT - 1));
  let stage2 = "";
  for (const v of table.stage2) stage2 += encodeDigit(v);
  return { stage1, stage2 };
}

/** 把 tailRanges 編成三元條件式串；全部落回 defaultClass 時回傳空串 */
export function encodeTailChecks(table, valueName) {
  return table.tailRanges
    .map(([start, end, code]) => {
      const cond = start === end
        ? `codePoint === ${formatHex(start)}`
        : `codePoint >= ${formatHex(start)} && codePoint <= ${formatHex(end)}`;
      return `${cond} ? ${valueName(code)}`;
    })
    .join(" :\n      ");
}

// ───────────────────────── 載入與全碼位比對 ─────────────────────────

let loadSeq = 0;

/**
 * 把生成的 .ts 轉成 ESM 後 import 進來，供驗證使用。
 *
 * 為什麼不直接用 `node --experimental-strip-types`：該旗標的行為會隨 Node 版本
 * 變動，而驗證必須在任何環境給出同一結論。專案本來就帶 esbuild（打包器），
 * 用它做一次性的 TS → ESM 轉換最穩，且不引入新依賴。
 */
export async function loadGeneratedTs(tsPath) {
  const esbuild = await import("esbuild");
  const source = readFileSync(tsPath, "utf8");
  const result = await esbuild.transform(source, { loader: "ts", format: "esm", target: "es2020" });
  const outDir = join(tmpdir(), "li-tsdata-verify");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${basename(tsPath, ".ts")}-${process.pid}-${++loadSeq}.mjs`);
  writeFileSync(outPath, result.code);
  return import(pathToFileURL(outPath).href);
}

/**
 * 全碼位比對：`classes`（從原始 .txt 直接展開的逐碼位真值）對 `lookup`（查表）。
 * 抽樣比對會漏掉「塊邊界算錯」這類只在特定塊發生的錯誤，所以這裡走滿 0x110000。
 */
export function verifyAllCodePoints(classes, lookup) {
  const total = 0x110000;
  let mismatches = 0;
  let firstMismatch = -1;
  for (let cp = 0; cp < total; cp++) {
    const expected = classes[cp];
    const actual = lookup(cp);
    if (actual !== expected) {
      if (mismatches === 0) firstMismatch = cp;
      mismatches++;
    }
  }
  return { total, mismatches, firstMismatch };
}

export function reportVerification(label, result) {
  const ok = result.mismatches === 0;
  console.log(
    `  ${ok ? "✓" : "✗"} ${label}：比對 ${result.total} 個碼位（0x0..0x10FFFF），` +
      (ok ? "完全一致" : `${result.mismatches} 處不一致，首處 U+${(result.firstMismatch).toString(16).toUpperCase()}`),
  );
  return ok;
}

/** Unicode 授權宣告（UCD 資料檔的檔頭要求保留著作權與授權聲明） */
export function ucdLicenseBlock({ fileName, unicodeVersion, sourceDate }) {
  return [
    `// 資料源：Unicode Character Database「${fileName}」`,
    `//   Unicode 版本    ：${unicodeVersion}`,
    `//   UCD 資料發布日  ：${sourceDate}（取自 UCD 檔頭 \`# Date:\`，非抓取當日——`,
    `//                     抓當日的話每次重跑輸出都會變，幂等自檢必然失敗）`,
    `//   來源 URL       ：${UCD_BASE_URL}/${fileName}`,
    `//   本地副本       ：scripts/ucd/${fileName}（隨原始檔一同提交，供離線重生成）`,
    `// 授權：© ${sourceDate.slice(0, 4)} Unicode®, Inc.`,
    `//   UCD 依 Unicode Terms of Use / Unicode License 釋出，允許免費使用、複製、修改與再散布`,
    `//   但須保留本著作權與授權宣告。條款：https://www.unicode.org/terms_of_use.html`,
    `//   「Unicode」「Unicode Logo」為 Unicode, Inc. 於美國及其他國家的註冊商標。`,
  ].join("\n");
}
