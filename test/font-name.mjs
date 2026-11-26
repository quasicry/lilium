// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 字體識別與字體棧裝配單測
 *
 * 守的是兩類此前完全失靈的能力：
 *
 *  1. **用戶導入的字體能識別出真實 family**
 *     此前 FontManager 用「檔名去擴展名」當 CSS family，與 fontStack 裡
 *     期望的名字（如 `Source Han Serif CN`）對不上 → 導入了等於沒導入。
 *     這裡用 fonts-src/ 下 10 款**真實字體**驗證 name 表解析。
 *
 *  2. **識別出來的字體能真的進字體棧**
 *     識別只是第一步；若 buildScriptFontStack 沒被接到排版路徑，
 *     字體仍然不會被用到。mergeFontStack 的插入位置是整個機制的成敗點：
 *     用戶字體必須排在 serif / sans-serif **之前**。
 *
 * 另有一組「合成 name 表」用例：真實字體覆蓋不到異常分支
 * （平台優先級、typographic 優先、控制字符淨化、截斷），故手工構造。
 *
 * 用法：node test/font-name.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-font-name-"));
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const {
  detectFontContainer, readSfntDirectory, parseNameTable, resolveFontNameSync,
  sanitizeFontName, cssFontFamily, cssStringLiteral, decodeUtf16Be, NAME_ID,
  mergeFontStack, buildScriptFontStack, setCustomFontFamilies, getCustomFontFamilies,
  setFontOverrides, getFontOverride, getFontOverrides, scriptSampleChar, coverageReport,
  defaultGlyphCheck, RETIRED_FONT_FILE_NAMES, collectRetiredFonts,
  SCRIPT_SAMPLE_CHAR, SCRIPT_IDS, SCRIPTS, OS_PROVIDED_SCRIPTS, shouldInjectNativeFont,
  glyphSupported, firstAvailableFamily, measureVerticalAdvanceEm, VERT_CAPABLE_MARKS,
  isFamilyVertCapable, resolveFontName, sliceTable,
} = lib;

/* ================================================================== */
/* 一、真實字體：fonts-src/ 下全部 10 款                                */
/* ================================================================== */

// 期望值取自字體內部 `name` 表，與檔名刻意不同（這正是本輪要修的核心）
const REAL_EXPECT = [
  ["NithyaRanjanaDU-Regular.otf", "Nithya Ranjana DU", "NithyaRanjanaDU-Regular"],
  ["NithyaRanjanaNU-Regular.otf", "Nithya Ranjana NU", "NithyaRanjanaNU-Regular"],
  ["NotoNaskhArabic-Regular.ttf", "Noto Naskh Arabic", "NotoNaskhArabic-Regular"],
  ["NotoSansDevanagari-Regular.ttf", "Noto Sans Devanagari", "NotoSansDevanagari-Regular"],
  ["NotoSansMongolian-Regular.ttf", "Noto Sans Mongolian", "NotoSansMongolian-Regular"],
  ["NotoSansSiddham-Regular.ttf", "Noto Sans Siddham", "NotoSansSiddham-Regular"],
  ["NotoSansSinhala-Regular.ttf", "Noto Sans Sinhala", "NotoSansSinhala-Regular"],
  ["NotoSerifOldUyghur-Regular.ttf", "Noto Serif Old Uyghur", "NotoSerifOldUyghur-Regular"],
  ["NotoSerifTibetan-Regular.ttf", "Noto Serif Tibetan", "NotoSerifTibetan-Regular"],
];

const FONTS_DIR = path.join(ROOT, "fonts-src");
const readFont = (name) => new Uint8Array(fs.readFileSync(path.join(FONTS_DIR, name)));

test("[1] 真實字體：10 款全部解出正確 family（與檔名不同，與 SPDX 記載一致）", () => {
  for (const [file, expectFamily] of REAL_EXPECT) {
    const r = resolveFontNameSync(readFont(file));
    assert.equal(r.info.family, expectFamily, `${file} family 應為 ${expectFamily}，實得 ${r.info.family}`);
    assert.equal(r.reason, "name-table", `${file} 解析途徑應為 name-table`);
  }
});

test("[1] 真實字體：postscript 名同步可取（導出 PDF 嵌字體時要用）", () => {
  for (const [file, , expectPs] of REAL_EXPECT) {
    const r = resolveFontNameSync(readFont(file));
    assert.equal(r.info.postscriptName, expectPs, `${file} postscript 名不符`);
  }
});

test("[1] 真實字體：容器偵測不誤判（OTF/TTF 皆走 sfnt 分支）", () => {
  for (const [file] of REAL_EXPECT) {
    assert.equal(detectFontContainer(readFont(file)), "sfnt", `${file} 應識別為 sfnt`);
  }
});

test("[1] 修正：蘭札 family 全鏈一致（棧首＝真實 name 表＝目錄）", () => {
  // 此前 languages.ts / FONT_CATALOG / 生成器三處手寫 "Nithya Ranjana"，
  // 與字體自報的 "Nithya Ranjana DU" 不符。已統一為真實值，舊名降為別名。
  // 此處把「三者必須相等」鎖死，任何一處再手寫就會失敗。
  // <｜hy_place▁holder▁no▁813｜> unify 為真實值，舊名降為別名。此處把「必須相等」鎖死，任何一處
  // 再手寫成 "Nithya Ranjana"（無 DU 後綴）就會失敗。
  const real = resolveFontNameSync(readFont("NithyaRanjanaDU-Regular.otf")).info.family;
  assert.equal(real, "Nithya Ranjana DU");
  const stackHead = SCRIPTS.ranjana.fontStack[0];
  assert.equal(stackHead, real,
    `languages.ts ranjana 棧首 ${stackHead} 應等於字體真實 family ${real}`);
  // 棧內不得再出現已被更正掉的舊名（別名由 fonts.ts 的 FontDef.aliases 提供）
  assert.ok(!SCRIPTS.ranjana.fontStack.includes("Nithya Ranjana"),
    "舊族名不該再出現在 ranjana 字體棧裡（它已不是任何字體的正式族名）");
});

test("[1] 真實字體：name 表以外的表目錄也讀得到（charmap 存在性驗證）", () => {
  const dir = readSfntDirectory(readFont("NotoSerifTibetan-Regular.ttf"));
  const tags = dir.tables.map((t) => t.tag);
  assert.ok(tags.includes("name"), "應含 name 表");
  assert.ok(tags.includes("cmap"), "應含 cmap 表");
  assert.ok(tags.length > 5, `表數量異常偏少: ${tags.length}`);
});

/* ================================================================== */
/* 二、合成 name 表：真實字體覆蓋不到的分支                              */
/* ================================================================== */

/**
 * 手工組一份最小的 sfnt：表目錄只有一張 name 表。
 * @param records [{platformID, encodingID, languageID, nameID, text}]
 */
function makeFont(records, { version = 0x00010000, corruptCount = null } = {}) {
  // —— 構造 name 表的 string storage ——
  const storage = [];
  const entries = [];
  let offset = 0;
  for (const r of records) {
    // 一律 UTF-16BE（platform 3/0 通用）
    const raw = Buffer.from(r.text, "utf16le").swap16();
    entries.push({ ...r, length: raw.length, offset });
    storage.push(raw);
    offset += raw.length;
  }
  const count = corruptCount ?? entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16BE(0, 0); // format
  header.writeUInt16BE(count, 2);
  header.writeUInt16BE(6 + entries.length * 12, 4); // stringOffset
  const recBufs = entries.map((e) => {
    const b = Buffer.alloc(12);
    b.writeUInt16BE(e.platformID, 0);
    b.writeUInt16BE(e.encodingID, 2);
    b.writeUInt16BE(e.languageID, 4);
    b.writeUInt16BE(e.nameID, 6);
    b.writeUInt16BE(e.length, 8);
    b.writeUInt16BE(e.offset, 10);
    return b;
  });
  const nameTable = Buffer.concat([header, ...recBufs, ...storage]);

  // —— sfnt 表目錄（單張 name 表）——
  const dirHeader = Buffer.alloc(12);
  dirHeader.writeUInt32BE(version, 0);
  dirHeader.writeUInt16BE(1, 4); // numTables
  const entry = Buffer.alloc(16);
  entry.write("name", 0, "ascii");
  entry.writeUInt32BE(0, 4); // checksum
  entry.writeUInt32BE(12 + 16, 8); // offset：緊接目錄
  entry.writeUInt32BE(nameTable.length, 12);
  return new Uint8Array(Buffer.concat([dirHeader, entry, nameTable]));
}

test("[2] platform 優先：Windows UTF-16BE(3,1) 壓過 Macintosh(1,0)", () => {
  const b = makeFont([
    { platformID: 1, encodingID: 0, languageID: 0, nameID: NAME_ID.FAMILY, text: "Mac Name" },
    { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FAMILY, text: "Windows Name" },
  ]);
  assert.equal(parseNameTable(readSfntDirectory(b).tables[0] ? sliceByName(b) : new Uint8Array(0)).family, "Windows Name");
});

/** 從合成字體裡取出 name 表位元組 */
function sliceByName(b) {
  const dir = readSfntDirectory(b);
  const e = dir.tables.find((t) => t.tag === "name");
  assert.ok(e, "合成字體應含 name 表");
  return b.subarray(e.offset, e.offset + e.length);
}

test("[2] typographic family(nameID 16) 優先於 legacy family(nameID 1)", () => {
  const b = makeFont([
    { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FAMILY, text: "Legacy Corp" },
    { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.TYPO_FAMILY, text: "Typographic Corp" },
  ]);
  const info = parseNameTable(sliceByName(b));
  assert.equal(info.family, "Typographic Corp");
  assert.equal(info.familySource, "typographic");
  assert.equal(info.legacyFamily, "Legacy Corp");
});

test("[2] 無 nameID 16 時回退 nameID 1，並標記來源為 legacy", () => {
  const b = makeFont([
    { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FAMILY, text: "Only Legacy" },
  ]);
  const info = parseNameTable(sliceByName(b));
  assert.equal(info.family, "Only Legacy");
  assert.equal(info.familySource, "legacy");
});

test("[2] 英文名優先於本地化名（Windows 0409 加分）", () => {
  const b = makeFont([
    { platformID: 3, encodingID: 1, languageID: 0x0411, nameID: NAME_ID.FAMILY, text: "日本語名" },
    { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FAMILY, text: "English Name" },
  ]);
  assert.equal(parseNameTable(sliceByName(b)).family, "English Name");
});

test("[2] 淨化：NUL / 控制字符 / 連續空格 / 引號包裹全部處理掉", () => {
  const b = makeFont([
    { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FAMILY, text: '"My   Font\u0000"' },
  ]);
  assert.equal(parseNameTable(sliceByName(b)).family, "My Font");
});

test("[2] 淨化：BOM 與前後空白", () => {
  const b = makeFont([
    { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FAMILY, text: "\uFEFF Spaced  " },
  ]);
  assert.equal(parseNameTable(sliceByName(b)).family, "Spaced");
});

test("[2] 淨化函式：超長名字截斷到 127", () => {
  assert.equal(sanitizeFontName("x".repeat(500)).length, 127);
  assert.equal(sanitizeFontName(""), "");
  assert.equal(sanitizeFontName("   "), "");
});

test("[2] 空 name 表：不拋異常，family 為 null（呼叫端回退到檔名）", () => {
  const info = parseNameTable(new Uint8Array(0));
  assert.equal(info.family, null);
  const r = resolveFontNameSync(new Uint8Array());
  assert.equal(r.info.family, null);
  assert.equal(r.kind, "unknown");
});

test("[2] 垃圾位元組：識別為 unknown，不拋異常", () => {
  const junk = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22]);
  assert.equal(detectFontContainer(junk), "unknown");
  const r = resolveFontNameSync(junk);
  assert.equal(r.info.family, null);
});

test("[2] 截斷的真實字體：不拋異常且明確回報 truncated / no-name-table", () => {
  const full = readFont("NotoSerifTibetan-Regular.ttf");
  for (const cut of [8, 64, 400, 3000]) {
    const r = resolveFontNameSync(full.subarray(0, cut));
    assert.equal(r.info.family, null, `截斷到 ${cut} 字節不應解出 family`);
    assert.ok(["truncated", "no-name-table", "bad-container"].includes(r.reason), `reason=${r.reason}`);
  }
});

test("[2] woff2 明確回報不支援（而非假裝成功）", () => {
  const b = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);
  assert.equal(detectFontContainer(b), "woff2");
  const r = resolveFontNameSync(b);
  assert.equal(r.reason, "unsupported-container");
});

test("[2] 表 count 與實際記錄數不符時不越界（corruptCount）", () => {
  const b = makeFont(
    [{ platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FAMILY, text: "Ok" }],
    { corruptCount: 9999 }
  );
  assert.equal(parseNameTable(sliceByName(b)).family, "Ok");
});

/* ================================================================== */
/* 三、CSS 逃逸                                                        */
/* ================================================================== */

test("[3] family 含引號/反斜線時必須逃逸，否則整條 @font-face 失效", () => {
  assert.equal(cssFontFamily('Weird"Font'), 'Weird\\"Font');
  assert.equal(cssFontFamily("Back\\slash"), "Back\\\\slash");
  assert.equal(cssStringLiteral('Weird"Font'), '"Weird\\"Font"');
});

test("[3] 正常族名逃逸後不變", () => {
  assert.equal(cssFontFamily("Noto Serif SC"), "Noto Serif SC");
  assert.equal(cssStringLiteral("Noto Serif SC"), '"Noto Serif SC"');
});

/* ================================================================== */
/* 四、字體棧裝配（mergeFontStack / buildScriptFontStack）              */
/* ================================================================== */

test("[4] 用戶字體插在通用族之前（這是整個機制的成敗點）", () => {
  const merged = mergeFontStack(["Noto Serif Tibetan", "serif"], ["My Tibetan"]);
  assert.deepEqual(merged, ["Noto Serif Tibetan", "My Tibetan", "serif"]);
});

test("[4] 無通用族時追加到末尾", () => {
  const merged = mergeFontStack(["A", "B"], ["C"]);
  assert.deepEqual(merged, ["A", "B", "C"]);
});

test("[4] 去重：大小寫與空白不敏感，且不改變首現順序", () => {
  const merged = mergeFontStack(["Noto Serif SC", "serif"], ["NOTO SERIF SC", "Noto Serif SC ", "X", "x"]);
  assert.deepEqual(merged, ["Noto Serif SC", "X", "serif"]);
});

test("[4] 空輸入不產生空字串項", () => {
  const merged = mergeFontStack(["A", "serif"], ["", "   ", "B"]);
  assert.deepEqual(merged, ["A", "B", "serif"]);
});

test("[4] 多個通用族關鍵字：插在第一個之前", () => {
  const merged = mergeFontStack(["A", "sans-serif", "serif"], ["X"]);
  assert.deepEqual(merged, ["A", "X", "sans-serif", "serif"]);
});

test("[4] 無候選時字體棧與 languages.ts 完全一致（無損降級）", () => {
  setCustomFontFamilies([]);
  for (const id of SCRIPT_IDS) {
    assert.deepEqual(buildScriptFontStack(id), SCRIPTS[id].fontStack, `${id} 棧不應被改動`);
  }
});

test("[4] 覆蓋率探測：只有能渲染該文種的字體進棧", () => {
  setCustomFontFamilies(["My Tibetan", "Noto Serif Heisenberg"]);
  const check = (fam, sample) => fam === "My Tibetan" && sample === SCRIPT_SAMPLE_CHAR.tibetan;
  const stack = buildScriptFontStack("tibetan", {
    check,
    candidates: ["My Tibetan", "Noto Serif Heisenberg"],
    override: null,
  });
  assert.ok(stack.includes("My Tibetan"), "能渲染藏文的字體應進棧");
  assert.ok(!stack.includes("Noto Serif Heisenberg"), "不能渲染的字體不應進棧");
  // 插入位置必須在通用族之前，否則輪不到
  assert.ok(stack.indexOf("My Tibetan") < stack.indexOf("serif"), "必須排在 serif 之前");
});

test("[4] 同一用戶字體不會污染其它文種的棧", () => {
  const check = (fam, sample) => fam === "My Tibetan" && sample === SCRIPT_SAMPLE_CHAR.tibetan;
  const han = buildScriptFontStack("han", { check, candidates: ["My Tibetan"], override: null });
  assert.ok(!han.includes("My Tibetan"), "藏文字體不應進漢字棧");
});

test("[4] 用戶 override 置頂，且不再跑探測", () => {
  setFontOverrides({ ranjana: "Nithya Ranjana DU" });
  assert.equal(getFontOverride("ranjana"), "Nithya Ranjana DU");
  const stack = buildScriptFontStack("ranjana", { candidates: ["Whatever"], override: null });
  assert.equal(stack[0], "Nithya Ranjana DU", "override 必須排第一");
  setFontOverrides({});
  assert.equal(getFontOverride("ranjana"), null);
});

test("[4] override 優先於 candidates（蘭札 known-mismatch 的解法）", () => {
  let probed = 0;
  const stack = buildScriptFontStack("ranjana", {
    check: () => { probed++; return true; },
    candidates: ["Some Devanagari"],
    override: "Nithya Ranjana DU",
  });
  assert.equal(stack[0], "Nithya Ranjana DU");
  // 指定了就不該再探測：蘭札這類「多款字體都能畫、但只有一款是對的」的場合，
  // 探測結果本身就是噪音。
  assert.equal(probed, 0, "有 override 時不應再跑覆蓋率探測");
  assert.ok(!stack.includes("Some Devanagari"), "探測候選不應在有 override 時混進棧");
});

test("[4] check 拋異常時該字體被跳過，不拖垮整條棧", () => {
  let n = 0;
  const stack = buildScriptFontStack("han", {
    check: () => { n++; throw new Error("probe blew up"); },
    candidates: ["Bad Font"],
    override: null,
  });
  assert.equal(n, 1);
  assert.ok(!stack.includes("Bad Font"));
  assert.deepEqual(stack, SCRIPTS.han.fontStack);
});

test("[4] Node 環境（無 document）：自動降級為原字體棧", () => {
  setCustomFontFamilies(["Anything"]);
  const stack = buildScriptFontStack("mongolian");
  assert.deepEqual(stack, SCRIPTS.mongolian.fontStack,
    "無 DOM 時探測不可用，應原樣返回而不是塞進一個無法驗證的字體");
  setCustomFontFamilies([]);
  assert.deepEqual(getCustomFontFamilies(), []);
});

test("[4] 樣本字：每個文種都有、且互相不重複（除已知共用者）", () => {
  for (const id of SCRIPT_IDS) {
    const s = scriptSampleChar(id);
    assert.ok(s && s.length > 0, `${id} 缺少樣本字`);
    // 樣本必須真的落在該文種的碼位上，否則探測毫無意義
    assert.ok(SCRIPT_SAMPLE_CHAR[id] === s);
  }
  // 這幾組是刻意共用：pali 與 sanskrit 同天城體、ranjana 借用天城體編碼
  assert.equal(SCRIPT_SAMPLE_CHAR.pali, SCRIPT_SAMPLE_CHAR.sanskrit);
  assert.equal(SCRIPT_SAMPLE_CHAR.ranjana, SCRIPT_SAMPLE_CHAR.sanskrit);
  // 但繁體與簡體、日文與漢字必須不同，否則棧會互相污染
  assert.notEqual(SCRIPT_SAMPLE_CHAR.han, SCRIPT_SAMPLE_CHAR.hant);
  assert.notEqual(SCRIPT_SAMPLE_CHAR.han, SCRIPT_SAMPLE_CHAR.ja);
  assert.notEqual(SCRIPT_SAMPLE_CHAR.ja, SCRIPT_SAMPLE_CHAR.ko);
  // 滿文不能用蒙古文字母作答 dict，否則蒙文字體會被計入滿文
  assert.notEqual(SCRIPT_SAMPLE_CHAR.mongolian, SCRIPT_SAMPLE_CHAR.manchu);
});

test("[4] coverageReport：設定頁用的逐文種覆蓋清單", () => {
  const report = coverageReport(
    ["tibetan", "han"],
    ["Tib Font", "Han Font"],
    (fam, sample) => (fam === "Tib Font" && sample === SCRIPT_SAMPLE_CHAR.tibetan) ||
      (fam === "Han Font" && sample === SCRIPT_SAMPLE_CHAR.han)
  );
  assert.equal(report.length, 2);
  assert.deepEqual(report[0].supported, ["Tib Font"]);
  assert.deepEqual(report[1].supported, ["Han Font"]);
  assert.equal(report[0].sample, SCRIPT_SAMPLE_CHAR.tibetan);
});

/* ================================================================== */
/* 六＋七、lilith 專屬守衛已隨分線退役 —— 反向鎖定                      */
/* ================================================================== */
/* 舊 [6]/[7] 兩段守衛 fonts.ts（FONT_CATALOG/collectRetiredFonts/SCRIPTS */
/* 字體棧/直排適配）。lilium 分線無字體下載與字體棧 UI，字體由           */
/* bundled-fonts.ts（12+2 款內嵌落盤 .lilium/fonts/）＋辭典配套資產接手。 */
/* 這裡改為退役鎖定：fonts.ts 不得復活；font-display:block 語義在        */
/* bundled-fonts.ts 保持（豆腐塊防閃）。                                  */

test("[6] src/fonts.ts 已隨分線退役，不得復活（字體接線歸 bundled-fonts.ts）", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "src", "fonts.ts")),
    "src/fonts.ts 不應存在——字體接線已由 bundled-fonts.ts 取代，復活請先走分線裁定");
});

test("[6] bundled-fonts 保持 font-display:block（文種字形缺即亂碼，防豆腐閃）", () => {
  const bf = fs.readFileSync(path.join(ROOT, "src", "bundled-fonts.ts"), "utf8");
  assert.ok(bf.includes("font-display:block"), "bundled-fonts 應用 block");
  assert.ok(!bf.includes("font-display:swap"), "swap 在此場景是錯的（先豆腐再閃字）");
});

/* ================================================================== */
/* 五、UTF-16BE 解碼                                                   */
/* ================================================================== */

test("[5] decodeUtf16Be：BMP 與代理對（悉曇 U+11580 位於 SMP）", () => {
  // 手工構造 UTF-16BE：'A' + U+11580（代理對 D805 DD80）
  const bytes = new Uint8Array([0x00, 0x41, 0xd8, 0x05, 0xdd, 0x80]);
  const s = decodeUtf16Be(bytes);
  assert.deepEqual([...s].map((c) => c.codePointAt(0)), [0x41, 0x11580], "代理對應合成一個 SMP 碼位");
  // 注意用碼位數而非 String.length（後者按 UTF-16 code unit 計，SMP 字算 2）
  assert.equal([...s].length, 2, "代理對應算一個字，不被拆成兩個");
});

test("[5] decodeUtf16Be：跳過 NUL，孤兒代理項不崩潰", () => {
  assert.equal(decodeUtf16Be(new Uint8Array([0x00, 0x00, 0x00, 0x41])), "A");
  assert.doesNotThrow(() => decodeUtf16Be(new Uint8Array([0xd8, 0x05])));
});

/* ================================================================== */

/* ================================================================== */
/* 八、覆蓋率探針：Node 降級與瀏覽器選字邏輯                            */
/* ================================================================== */

// #44 的核心是一顆「 retval == null 表示探針不可用」的探測器，它在 Node 下
// 必須無害返回，在瀏覽器裡則要能正確挑出第一個可渲染的家族。先前這段邏輯
// 完全沒有斷言，壞了沒人知道 —— 這裡把兩條路徑都鎖上。
//
// 手法：firstAvailableFamily 只在 `typeof document === "undefined"` 時短路，
// 所以測試可以在 Node 裡暫時掛一個最小假 document，把瀏覽器分支叫出來。

const withFakeDocument = (doc, fn) => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "document");
  const prev = globalThis.document;
  try {
    Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
    return fn();
  } finally {
    if (had) globalThis.document = prev;
    else Reflect.deleteProperty(globalThis, "document");
  }
};

test("[8] Node 環境：探針與直排度量無害降級（返回 null 而非拋錯）", () => {
  assert.strictEqual(glyphSupported("Noto Sans Tibetan", "ཀ"), null, "無 Canvas 應返回 null");
  assert.strictEqual(measureVerticalAdvanceEm("Noto Sans Tibetan", 16, "ཀ"), null, "無 DOM 應返回 null");
  assert.strictEqual(firstAvailableFamily(["A", "B"], "ཀ"), null, "無 document 應返回 null");
  assert.strictEqual(defaultGlyphCheck("Noto Sans Tibetan", "ཀ"), false, "探針不可用應保守判 false");
});

test("[8] firstAvailableFamily：注入探針 → 回傳第一個可渲染的家族", () => {
  const stack = ["Alpha", "Beta", "Gamma"];
  const pick = withFakeDocument({}, () =>
    firstAvailableFamily(stack, "ཀ", (f) => f === "Beta"));
  assert.strictEqual(pick, "Beta");
});

test("[8] firstAvailableFamily：全部不可渲染 → null（不會退回棧首湊數）", () => {
  const pick = withFakeDocument({}, () =>
    firstAvailableFamily(["Alpha", "Beta"], "ཀ", () => false));
  assert.strictEqual(pick, null);
});

test("[8] firstAvailableFamily：探針拋錯的家族被跳過，不中斷整輪", () => {
  const pick = withFakeDocument({}, () =>
    firstAvailableFamily(["Bad", "Good"], "ཀ", (f) => {
      if (f === "Bad") throw new Error("非法族名");
      return true;
    }));
  assert.strictEqual(pick, "Good");
});

test("[8] firstAvailableFamily：探針 null → 降級 document.fonts.check", () => {
  const checked = [];
  const fake = {
    fonts: {
      check: (spec, sample) => {
        checked.push(spec);
        return spec.includes("Gamma");
      },
    },
  };
  const pick = withFakeDocument(fake, () =>
    firstAvailableFamily(["Alpha", "Gamma"], "ཀ", () => null));
  assert.strictEqual(pick, "Gamma", "降級路徑應由 document.fonts.check 決定");
  assert.equal(checked.length, 2, "兩個家族都應被問到");
  assert.ok(checked.every((s) => s.startsWith('16px "')), `降級查詢應帶字號前綴，實得 ${checked[0]}`);
});

test("[8] firstAvailableFamily：探針 null 且無 document.fonts → 不放行任何家族", () => {
  // 「無從判斷」必須當作「沒有」，否則覆蓋率探測會把每一款字體都算成支援。
  const pick = withFakeDocument({}, () =>
    firstAvailableFamily(["Alpha", "Beta"], "ཀ", () => null));
  assert.strictEqual(pick, null);
});

test("[8] firstAvailableFamily：空白家族名跳過，不留空結果", () => {
  const pick = withFakeDocument({}, () =>
    firstAvailableFamily(["", "  ", "Real"], "ཀ", (f) => f === "Real"));
  assert.strictEqual(pick, "Real");
});

test("[8] getFontOverrides：回傳副本（外部改動不污染模組狀態）", () => {
  setFontOverrides({ tibetan: "Noto Serif Tibetan" });
  const snapshot = getFontOverrides();
  assert.equal(snapshot.tibetan, "Noto Serif Tibetan");
  snapshot.tibetan = "被外部改壞";
  snapshot.siddham = "外部塞的鍵";
  assert.equal(getFontOverride("tibetan"), "Noto Serif Tibetan", "外部改動不該影響內部");
  assert.strictEqual(getFontOverride("siddham"), null, "外部塞鍵不該生效");
});

test("[8] VERT_CAPABLE_MARKS：皆為小寫非空關鍵字（子串匹配的隱含契約）", () => {
  // isFamilyVertCapable 走「小寫化後的子串包含」，所以表裡任何一項出現大寫或
  // 空白，那一條就永遠匹配不到 —— 靜默失效，故在此鎖住形態。
  assert.ok(Array.isArray(VERT_CAPABLE_MARKS) && VERT_CAPABLE_MARKS.length > 0);
  for (const m of VERT_CAPABLE_MARKS) {
    assert.ok(typeof m === "string" && m.trim().length > 0, `關鍵字不該為空: ${m}`);
    assert.equal(m, m.trim().toLowerCase(), `"${m}" 應為已 trim 的小寫`);
  }
  assert.equal(new Set(VERT_CAPABLE_MARKS).size, VERT_CAPABLE_MARKS.length, "不該有重複項");
});

test("[8] isFamilyVertCapable：命中已知關鍵字、大小寫不敏感、非 CJK 字體判 false", () => {
  assert.strictEqual(isFamilyVertCapable("Noto Serif CJK SC"), true, "大小寫不敏感大小寫");
  assert.strictEqual(isFamilyVertCapable("Source Han Serif CN"), true);
  assert.strictEqual(isFamilyVertCapable("思源宋體"), true);
  assert.strictEqual(isFamilyVertCapable("Arial"), false, "非直排字體應判 false");
  assert.strictEqual(isFamilyVertCapable(""), false, "空字串不該被當成有能力");
  assert.strictEqual(isFamilyVertCapable("Noto Serif Tibetan"), false, "梵/藏系不是 CJK 直排字體");
});

/* ================================================================== */

/* ================================================================== */
/* 九、WOFF 1.0：導入通道唯一需要解壓的容器                             */
/* ================================================================== */

// 現實：用戶從網上下下來的字體有不少是 .woff。此前整條路徑（zlib 解壓 →
// name 表）沒有任何斷言，壞了只會靜默回退到檔名，表現與「導入了沒反應」無異。

const asyncAware = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/** 把「解壓後的 name 表」包成 WOFF 1.0；compress=false 時表數據原樣存放 */
function makeWoff(records, { compress = true } = {}) {
  // 複用 makeFont 造出純 sfnt，再把它的 name 表摳出來塞進 WOFF 容器
  const sfnt = makeFont(records);
  const nameTable = sliceByName(sfnt);

  const stored = compress ? zlib.deflateSync(nameTable) : Buffer.from(nameTable);
  const tableDataOffset = 44 + 20; // header + 一筆 20 字節的目錄項

  const header = Buffer.alloc(44);
  header.write("wOFF", 0, "ascii");
  header.writeUInt32BE(0x00010000, 4); // flavor：TrueType 輪廓
  header.writeUInt32BE(tableDataOffset + stored.length, 8); // length
  header.writeUInt16BE(1, 12); // numTables
  header.writeUInt32BE(nameTable.length + 1024, 16); // totalSfntSize（解析器不讀）

  const entry = Buffer.alloc(20);
  entry.write("name", 0, "ascii");
  entry.writeUInt32BE(tableDataOffset, 4); // offset
  entry.writeUInt32BE(stored.length, 8); // compLength
  entry.writeUInt32BE(nameTable.length, 12); // origLength
  entry.writeUInt32BE(0, 16); // origChecksum（解析器不讀）

  return {
    bytes: new Uint8Array(Buffer.concat([header, entry, stored])),
    compLength: stored.length,
    origLength: nameTable.length,
  };
}

const WOFF_RECORDS = [
  { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FAMILY, text: "Woff Wrapped Family" },
  { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.POSTSCRIPT, text: "WoffWrappedFamily-Regular" },
];

await asyncAware("[9] WOFF 1.0：zlib 壓縮的 name 表能解出真實 family", async () => {
  const w = makeWoff(WOFF_RECORDS);
  assert.notEqual(w.compLength, w.origLength, "前置條件：compress 後長度應與原長不同");
  const r = await resolveFontName(w.bytes);
  assert.equal(r.kind, "woff");
  assert.equal(r.reason, "name-table", `reason=${r.reason}`);
  assert.equal(r.info.family, "Woff Wrapped Family");
  assert.equal(r.info.postscriptName, "WoffWrappedFamily-Regular");
});

await asyncAware("[9] WOFF 1.0：未壓縮存放的表走直讀分支（不必解壓）", async () => {
  const w = makeWoff(WOFF_RECORDS, { compress: false });
  const r = await resolveFontName(w.bytes);
  assert.equal(r.reason, "name-table");
  assert.equal(r.info.family, "Woff Wrapped Family");
});

await asyncAware("[9] 同步版對壓縮 WOFF 明確回報 truncated（不假裝成功）", async () => {
  const w = makeWoff(WOFF_RECORDS);
  const r = resolveFontNameSync(w.bytes);
  assert.equal(r.info.family, null, "同步版不解壓，不該給出答案");
  assert.equal(r.kind, "woff");
  assert.equal(r.reason, "truncated", `reason=${r.reason}`);
});

await asyncAware("[9] 壞 WOFF 不得留下 unhandled rejection（掀渲染行程的真兇）", async () => {
  // inflateIfNeeded 曾把 writer.write/close 寫成 fire-and-forget：數據損毀時
  // zlib 在寫入側報 Z_BUF_ERROR，該 rejection 無人接管 → Node 終止行程、
  // Chromium 掀掉 Obsidian 渲染行程。此處把它鎖成顯式斷言。
  const escaped = [];
  const onBad = (e) => escaped.push(e);
  process.on("unhandledRejection", onBad);
  try {
    const w = makeWoff(WOFF_RECORDS);
    const broken = Uint8Array.from(w.bytes);
    broken.fill(0xa5, broken.length - 8);
    const r = await resolveFontName(broken);
    assert.equal(r.reason, "truncated");
    // 讓事件循環多轉幾輪：失管的 rejection 通常在 await 返回之後才冒出來
    for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0));
    assert.deepEqual(escaped, [], `不該有未接管的 rejection，實得 ${escaped.length} 個`);
  } finally {
    process.off("unhandledRejection", onBad);
  }
});

await asyncAware("[9] WOFF 表數據損毀：降級回報而不是拋異常炸掉 UI", async () => {
  const w = makeWoff(WOFF_RECORDS);
  // 把壓縮流後半截抹成垃圾 → 解壓必失敗
  const broken = Uint8Array.from(w.bytes);
  broken.fill(0xa5, broken.length - 8);
  const r = await resolveFontName(broken);
  assert.equal(r.info.family, null);
  assert.equal(r.reason, "truncated");
});

test("[9] asBytes：ArrayBuffer 與 Uint8Array 兩種入參都收", () => {
  // Obsidian 的 readBinary 給的是 ArrayBuffer，手測容易只餵 Uint8Array 而漏網
  const sfnt = new Uint8Array(makeFont(WOFF_RECORDS));
  const ab = sfnt.buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength);
  assert.equal(resolveFontNameSync(ab).info.family, "Woff Wrapped Family");
  assert.equal(resolveFontNameSync(sfnt).info.family, "Woff Wrapped Family");
});

test("[9] sliceTable：越界 offset / length 被夾住，不拋異常也不越界讀", () => {
  const b = new Uint8Array([1, 2, 3, 4, 5]);
  assert.equal(sliceTable(b, { tag: "x", offset: 3, length: 99, compLength: 99 }).length, 2);
  assert.equal(sliceTable(b, { tag: "x", offset: 99, length: 4, compLength: 4 }).length, 0);
  assert.equal(sliceTable(b, { tag: "x", offset: 0, length: 0, compLength: 0 }).length, 0);
});

/* ================================================================== */

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
if (failures.length) {
  console.error("\n失敗明細：");
  for (const f of failures) console.error(`  ✗ ${f.name}\n    ${f.e.message}`);
  process.exit(1);
}
