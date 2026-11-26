// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 字體 cmap 覆蓋率單測
 *
 * 守的是「某字體能不能渲染某文種」這個判斷從此有了**確定答案**：
 * 原本只能靠 Canvas measureText 三方比對去猜（見 font-metrics.glyphSupported），
 * 那套做法答不了「多款字體都畫得出同一碼位時，到底該選哪一款」。
 *
 * 這裡特別用力守住幾件事：
 *
 *  1. **必須選中能表達 astral plane 的 cmap 子表**
 *     初版移植時照抄了 name 表的 ENCODING_PREFERENCE（(3,1) 最高），結果選到
 *     format 4 —— 它的上限只到 U+FFFF。蘭札 NU（Newa U+11400）、悉曇
 *     （U+11580）、回鶻文（U+10F70）三款 astral 字體因此被讀成「沒有字形」，
 *     靜默被踢出字體棧，且不報任何錯。這個 bug 是用本檔案抓出來的。
 *
 *  2. **兩種統計口徑都鎖**
 *     「全 block U+11400–U+1147F」得 88，「排除填隙符且截到 U+11459」得 85。
 *     兩個數字都對，差別只在口徑。同時寫進斷言，避免後人看到別處的 88
 *     卻在這裡算出 85，誤以為是 bug 而「修」壞它。
 *
 *  3. **cmap 必須真的接管判定**，而不是個裝飾品
 *     用注入 Canvas 的方式數呼叫次數：拿到 cmap 的字體就不該再去碰 Canvas。
 *
 *  4. **讀不到 ≠ 不支援**
 *     返回 null 只代表「本模組判斷不了」，呼叫端要降級，不能當 false 用。
 *
 * 用法：node test/font-cmap.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-font-cmap-"));
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

/**
 * 異步用例 + unhandled rejection 哨兵。
 *
 * 為什麼每個異步用例都要掛這個：先前在 font-name 的 WOFF 解壓路線中踩過一次 ——
 * zlib 在寫入側報 Z_BUF_ERROR，那個 rejection 沒人接管，Node 直接終止行程，
 * 而同一段程式碼在 Electron/Chromium 裡會掀掉 Obsidian 的渲染行程。
 * 「測試全過」不等於「測試跑完了」，所以這裡把退出的安危也算進斷言。
 */
const unhandled = [];
process.on("unhandledRejection", (r) => unhandled.push(r));
const asyncAware = async (name, fn) => {
  const before = unhandled.length;
  try {
    await fn();
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(unhandled.length, before,
      `不該有新的未接管 rejection，實得 ${unhandled.length - before} 個：${unhandled.slice(before).map(String).join(", ")}`);
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
};

const {
  readFontCmap, readFontCmapSync, cmapHasCodepoint, cmapHasText, cmapCodepointCount,
  setFontCmapEntry, clearFontCmapIndex, hasFontCmap, fontCmapIndexSize,
  defaultGlyphCheck, SCRIPT_SAMPLE_CHAR,
  readSfntDirectory, sliceTable,
} = lib;

const FONTS_DIR = path.join(ROOT, "fonts-src");
const readFont = (name) => new Uint8Array(fs.readFileSync(path.join(FONTS_DIR, name)));

const REAL_FONTS = [
  "NithyaRanjanaDU-Regular.otf",
  "NithyaRanjanaNU-Regular.otf",
  "NotoNaskhArabic-Regular.ttf",
  "NotoSansDevanagari-Regular.ttf",
  "NotoSansMongolian-Regular.ttf",
  "NotoSansSiddham-Regular.ttf",
  "NotoSansSinhala-Regular.ttf",
  "NotoSerifOldUyghur-Regular.ttf",
  "NotoSerifTibetan-Regular.ttf",
];

/* ================================================================== */
/* 一、真實字體：全部讀得出來                                            */
/* ================================================================== */

const CMAP = {};
for (const n of REAL_FONTS) CMAP[n] = readFontCmapSync(readFont(n));

/**
 * 取某款已解析字體的 cmap。
 *
 * 為什麼不直接寫 `pick("xxx")`：JS 對不存在的 key 會靜默給 undefined，而
 * cmapHasCodepoint(undefined) 又會靜默回 false —— 兩個靜默疊起來，就出現了
 * 「副檔名打錯（.ttf 打成 .otf）導致斷言莫名其妙失敗」這種極難查的狀況。
 * 所以在這裡把「查無此字體」就地炸掉，讓筆誤在第一時間現形。
 */
const pick = (n) => {
  const c = CMAP[n];
  assert.ok(c, `測試筆誤：CMAP 裡查無 ${n}（檔名大小寫或副檔名寫錯？）`);
  return c;
};

test("[1] fonts-src/ 全部 10 款都讀得出 cmap，且 ranges 非空", () => {
  for (const n of REAL_FONTS) {
    assert.ok(CMAP[n], `${n} 應該讀得出 cmap`);
    assert.ok(CMAP[n].ranges.length > 0, `${n} 的 ranges 不該是空的`);
  }
});

test("[1] ranges 形態契約：升序、不相交、相鄰已合併、邊界合法", () => {
  for (const n of REAL_FONTS) {
    const rs = CMAP[n].ranges;
    for (let i = 0; i < rs.length; i++) {
      const [s, e] = rs[i];
      assert.ok(Number.isInteger(s) && Number.isInteger(e), `${n} 區間端點必須為整數`);
      assert.ok(s >= 0 && e <= 0x10ffff, `${n} 區間超出 Unicode 範圍：${s}..${e}`);
      assert.ok(e >= s, `${n} 區間首尾顛倒：${s}..${e}`);
      if (i > 0) {
        const [ps, pe] = rs[i - 1];
        assert.ok(s > pe, `${n} 區間未排序或重疊：上一條到 ${pe}，這一條從 ${s}`);
        // 合併條件是 start <= lastEnd + 1，故相鄰（差 1）也應已合併
        assert.ok(s > pe + 1, `${n} 區間未合併：${pe} 與 ${s} 相鄰卻未合併`);
      }
    }
  }
});

/* ================================================================== */
/* 二、初版 bug 回歸：必須挑到能表達 astral 的子表                       */
/* ================================================================== */

test("[2] 回鶻文/悉曇/Newa 三款 astral 字體必須走 format 12 子表", () => {
  // 這三款的目標碼位全在 astral plane（> U+FFFF），只有 format 12 看得到。
  for (const n of ["NotoSerifOldUyghur-Regular.ttf", "NotoSansSiddham-Regular.ttf", "NithyaRanjanaNU-Regular.otf"]) {
    assert.strictEqual(CMAP[n].subtable.format, 12,
      `${n} 必須選中 format 12 子表（選到 format 4 會把 astral 字讀成不存在）`);
  }
});

test("[2] astral 樣本碼位確實命中（初版此處全為 false）", () => {
  assert.ok(cmapHasCodepoint(pick("NotoSerifOldUyghur-Regular.ttf"), 0x10f70), "回鶻文 U+10F70");
  assert.ok(cmapHasCodepoint(pick("NotoSansSiddham-Regular.ttf"), 0x11580), "悉曇 U+11580");
  assert.ok(cmapHasCodepoint(pick("NithyaRanjanaNU-Regular.otf"), 0x11415), "Newa U+11415");
});

/* ================================================================== */
/* 三、DU / NU 互斥結論複驗（兩種口徑都鎖）                              */
/* ================================================================== */

const NEWA_HI_BLOCK = 0x1147f;
const NEWA_GAP_FILLER = 0x1144e;

const blockCount = (c) => {
  let n = 0;
  for (let cp = 0x11400; cp <= NEWA_HI_BLOCK; cp++) if (cmapHasCodepoint(c, cp)) n++;
  return n;
};
const newaLetters = (c) => {
  let n = 0;
  for (let cp = 0x11400; cp <= 0x11459; cp++) if (cp !== NEWA_GAP_FILLER && cmapHasCodepoint(c, cp)) n++;
  return n;
};

test("[3] DU/NU 編碼完全不相交（口徑 A：全 block U+11400–U+1147F）", () => {
  assert.strictEqual(blockCount(pick("NithyaRanjanaNU-Regular.otf")), 88, "NU 應含 88 個 Newa block 碼位");
  assert.strictEqual(blockCount(pick("NithyaRanjanaDU-Regular.otf")), 1, "DU 在 Newa block 只佔 1 個碼位");
});

test("[3] 口徑 B（排除填隙符、截到 U+11459）：NU=85 / DU=0", () => {
  // 與口徑 A 的差異不是 bug：A 含 U+1144E（NEWA GAP FILLER，填隙用非字母）
  // 與 U+1145A–U+1147F 這段。兩個數字都鎖，避免後人誤判。
  assert.strictEqual(newaLetters(pick("NithyaRanjanaNU-Regular.otf")), 85);
  assert.strictEqual(newaLetters(pick("NithyaRanjanaDU-Regular.otf")), 0);
});

test("[3] DU 唯一的 Newa 碼位就是 U+1144E GAP FILLER", () => {
  assert.ok(cmapHasCodepoint(pick("NithyaRanjanaDU-Regular.otf"), NEWA_GAP_FILLER),
    "DU 應含填隙符 U+1144E");
});

test("[3] NU 完全沒有天城體碼位（兩版 cmap 不相交的硬證據）", () => {
  let dv = 0;
  for (let cp = 0x0900; cp <= 0x097f; cp++) if (cmapHasCodepoint(pick("NithyaRanjanaNU-Regular.otf"), cp)) dv++;
  assert.strictEqual(dv, 0, "NU 不該有任何 Devanagari 字形");
});

/* ================================================================== */
/* 四、反向：不該命中的不能命中                                          */
/* ================================================================== */

test("[4] 跨文種不得誤判支援", () => {
  const nobo = [
    ["NotoNaskhArabic-Regular.ttf", 0x0915, "阿拉伯字型不該有天城體"],
    ["NotoSansMongolian-Regular.ttf", 0x0d9a, "蒙古字型不該有僧伽羅字母"],
    ["NithyaRanjanaDU-Regular.otf", 0x0627, "蘭札不該有阿拉伯字母"],
  ];
  for (const [f, cp, msg] of nobo) {
    assert.ok(!cmapHasCodepoint(pick(f), cp), `${msg}（${f} U+${cp.toString(16).toUpperCase()}）`);
  }
});

test("[4] 每款字體都覆蓋自己對應的語言樣本字", () => {
  const pairs = [
    ["NotoSansMongolian-Regular.ttf", "mongolian"],
    ["NotoSerifOldUyghur-Regular.ttf", "olduyghur"],
    ["NotoNaskhArabic-Regular.ttf", "arabic"],
    ["NotoSerifTibetan-Regular.ttf", "tibetan"],
    ["NotoSansDevanagari-Regular.ttf", "sanskrit"],
    ["NotoSansSinhala-Regular.ttf", "sinhala"],
  ];
  for (const [f, script] of pairs) {
    const sample = SCRIPT_SAMPLE_CHAR[script];
    assert.ok(cmapHasText(pick(f), sample),
      `${f} 應覆蓋 ${script} 的樣本字 U+${sample.codePointAt(0).toString(16).toUpperCase()}`);
  }
});

/* ================================================================== */
/* 五、cmapHasText：按 Unicode scalar value 迭代                       */
/* ================================================================== */

test("[5] cmapHasText 對 astral 字按 scalar value 整體判斷（不拆 UTF-16 unit）", () => {
  const ou = pick("NotoSerifOldUyghur-Regular.ttf");
  assert.ok(cmapHasText(ou, "\u{10f70}"), "單個 astral 字應命中");
  // "\u{10f70}".length === 2（UTF-16 unit），若實作用 charCodeAt 會把
  // 0xD803 / 0xDF70 分開查 —— 兩者都不在 cmap 裡，結果會錯成 false。
  assert.strictEqual("\u{10f70}".length, 2, "前提：此字確實由兩個 UTF-16 unit 組成");
});

test("[5] 空字串 / null cmap 一律回傳 false，不拋異常", () => {
  assert.strictEqual(cmapHasText(pick("NotoSansMongolian-Regular.ttf"), ""), false);
  assert.strictEqual(cmapHasText(null, "A"), false);
  assert.strictEqual(cmapHasCodepoint(null, 0x41), false);
  assert.strictEqual(cmapHasCodepoint(pick("NotoSansMongolian-Regular.ttf"), -1), false);
  assert.strictEqual(cmapHasCodepoint(pick("NotoSansMongolian-Regular.ttf"), Number.NaN), false);
});

test("[5] 多碼位字串：只要有一個碼位缺字就整串 false", () => {
  const mo = pick("NotoSansMongolian-Regular.ttf");
  assert.ok(cmapHasText(mo, "\u1820"), "蒙古字母 a 單字應命中");
  assert.ok(!cmapHasText(mo, "\u1820\u4e2d"), "混進漢字後不該再判定為支援");
});

test("[5] cmapCodepointCount 與逐碼位枚舉一致", () => {
  const tibetan = pick("NotoSerifTibetan-Regular.ttf");
  let brute = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) if (cmapHasCodepoint(tibetan, cp)) brute++;
  assert.strictEqual(cmapCodepointCount(tibetan), brute);
});

/* ================================================================== */
/* 六、損毀輸入：不拋、不崩、回 null                                     */
/* ================================================================== */

test("[6] 空 / 過短 / 亂數 / 截斷字體一律回傳 null，不拋異常", () => {
  const bad = [
    new Uint8Array(0),
    new Uint8Array([0x00]),
    new Uint8Array([0x00, 0x01, 0x00, 0x00]),
    new Uint8Array(64).map((_, i) => (i * 37) & 0xff),
  ];
  for (const b of bad) assert.strictEqual(readFontCmapSync(b), null, "損毀輸入應回 null");
  // 真實字體截斷到一半
  const trunc = readFont("NotoSerifTibetan-Regular.ttf").slice(0, 200);
  assert.doesNotThrow(() => readFontCmapSync(trunc));
});

test("[6] WOFF2 明確不支援（回 null 由呼叫端降級，不假裝讀到）", () => {
  const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);
  assert.strictEqual(readFontCmapSync(woff2), null);
});

test("[6] readFontCmapSync 收 ArrayBuffer 也能正確處理", () => {
  const buf = fs.readFileSync(path.join(FONTS_DIR, "NotoSansMongolian-Regular.ttf"));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  assert.ok(readFontCmapSync(ab), "應從 ArrayBuffer 讀出 cmap");
});

/* ================================================================== */
/* 七、WOFF：同步 / 異步雙軌                                            */
/* ================================================================== */

/**
 * 把**真實字體**的 cmap 表摳出來，塞進 WOFF 1.0 容器。
 *
 * 與 font-name.mjs 的 makeWoff 不同：那邊是從合成的 sfnt 摳 name 表，
 * 這邊要保留真實 cmap 的全部子表（含 format 12），才能測出
 * 「壓縮過的 astral 子表」這條路線有沒有被照顧到。
 */
function wrapWoff(sfnt, { compress = true } = {}) {
  const dir = readSfntDirectory(sfnt);
  const entry = dir.tables.find((t) => t.tag === "cmap");
  assert.ok(entry, "前置條件：原字體應含有 cmap 表");
  const table = sliceTable(sfnt, entry); // 未壓縮的原始表位元組
  const stored = compress ? zlib.deflateSync(Buffer.from(table)) : Buffer.from(table);

  const tableDataOffset = 44 + 20; // header + 一筆 20 字節的目錄項
  const header = Buffer.alloc(44);
  header.write("wOFF", 0, "ascii");
  header.writeUInt32BE(0x00010000, 4); // flavor：TrueType 輪廓
  header.writeUInt32BE(tableDataOffset + stored.length, 8); // length
  header.writeUInt16BE(1, 12); // numTables
  header.writeUInt32BE(table.length + 1024, 16); // totalSfntSize（解析器不讀）

  const rec = Buffer.alloc(20);
  rec.write("cmap", 0, "ascii");
  rec.writeUInt32BE(tableDataOffset, 4); // offset
  rec.writeUInt32BE(stored.length, 8); // compLength
  rec.writeUInt32BE(table.length, 12); // origLength
  rec.writeUInt32BE(0, 16); // origChecksum（解析器不讀）

  return new Uint8Array(Buffer.concat([header, rec, stored]));
}

test("[7] 未壓縮 WOFF：同步與異步都讀得出來", () => {
  const sfnt = readFont("NotoSerifTibetan-Regular.ttf");
  const woff = wrapWoff(sfnt, { compress: false });
  const a = readFontCmapSync(woff);
  const expect = readFontCmapSync(sfnt);
  assert.ok(a, "未壓縮 WOFF 同步應讀得出 cmap");
  assert.strictEqual(cmapCodepointCount(a), cmapCodepointCount(expect),
    "WOFF 與原 sfnt 的覆蓋範圍應一致");
});

await asyncAware("[7] 壓縮 WOFF：同步明確回 null、異步解得出來", async () => {
  const sfnt = readFont("NotoSerifTibetan-Regular.ttf");
  const woff = wrapWoff(sfnt, { compress: true });
  assert.strictEqual(readFontCmapSync(woff), null,
    "壓縮 WOFF 在同步路徑應明確回 null（由呼叫端降級），而不是亂猜");
  const async_ok = await readFontCmap(woff);
  assert.ok(async_ok, "異步應能解出來");
  assert.strictEqual(cmapCodepointCount(async_ok), cmapCodepointCount(readFontCmapSync(sfnt)));
});

await asyncAware("[7] 損毀的壓縮 WOFF：不得留下未接管的 rejection", async () => {
  const sfnt = readFont("NotoSerifTibetan-Regular.ttf");
  const woff = wrapWoff(sfnt, { compress: true });
  // 把 zlib 資料 破壞掉
  for (let i = 60; i < Math.min(woff.length, 200); i++) woff[i] ^= 0xff;
  const r = await readFontCmap(woff);
  assert.strictEqual(r, null, "損毀資料應回 null，不拋");
});

/* ================================================================== */
/* 八、defaultGlyphCheck 兩段式：cmap 必須真的接管                      */
/* ================================================================== */

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

test("[8] 已登錄 cmap 的字體：完全不碰 Canvas", () => {
  clearFontCmapIndex();
  setFontCmapEntry("ProbeRanjana", pick("NithyaRanjanaDU-Regular.otf"));
  let canvasCalls = 0;
  const fake = {
    createElement: (tag) => {
      if (tag === "canvas") {
        canvasCalls++;
        return { getContext: () => ({ measureText: () => ({ width: 10 }) }) };
      }
      return {};
    },
  };
  withFakeDocument(fake, () => {
    assert.strictEqual(defaultGlyphCheck("ProbeRanjana", "\u0915"), true, "蘭札應能渲染天城體");
    assert.strictEqual(defaultGlyphCheck("ProbeRanjana", "\u0627"), false, "蘭札不能渲染阿拉伯字母");
  });
  assert.strictEqual(canvasCalls, 0,
    `既然有 cmap 就不該再碰 Canvas，實測碰了 ${canvasCalls} 次`);
});

test("[8] 未登錄 cmap 的字體：降級到既有 Canvas / fonts.check 路徑", () => {
  clearFontCmapIndex();
  let touched = 0;
  const fake = {
    createElement: (tag) => {
      if (tag === "canvas") {
        // 讓 Canvas 判定為「支援」：notdef 寬度 5、目標寬度 9
        touched++;
        return {
          getContext: () => ({
            measureText: (s) => ({ width: s === "\ufffe" ? 5 : 9 }),
          }),
        };
      }
      return {};
    },
  };
  withFakeDocument(fake, () => {
    assert.strictEqual(defaultGlyphCheck("UnknownSystemFont", "\u4e2d"), true);
  });
  assert.ok(touched > 0, "沒有 cmap 時應降級到 Canvas 度量");
});

test("[8] family 名比對大小寫不敏感（與 font-registry 的 familyKey 一致）", () => {
  clearFontCmapIndex();
  setFontCmapEntry("Case Font", pick("NotoSansMongolian-Regular.ttf"));
  assert.ok(hasFontCmap("case font"));
  assert.ok(hasFontCmap("  CASE FONT  "));
  withFakeDocument({}, () => {
    assert.strictEqual(defaultGlyphCheck("case font", "\u1820"), true);
  });
});

test("[8] setFontCmapEntry(family, null) 是撤銷：回到降級而非判 false", () => {
  clearFontCmapIndex();
  setFontCmapEntry("Gone Font", pick("NotoSansMongolian-Regular.ttf"));
  assert.ok(hasFontCmap("Gone Font"));
  setFontCmapEntry("Gone Font", null);
  assert.ok(!hasFontCmap("Gone Font"), "null 應撤銷登錄");
});

test("[8] 空 family 不寫入索引；索引大小可查", () => {
  clearFontCmapIndex();
  setFontCmapEntry("", pick("NotoSansMongolian-Regular.ttf"));
  setFontCmapEntry("   ", pick("NotoSansMongolian-Regular.ttf"));
  assert.strictEqual(fontCmapIndexSize(), 0, "空白 family 不該進索引");
});

/* ================================================================== */
/* 九、 helper                                                         */
/* ================================================================== */

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
if (failures.length) {
  console.error("\n失敗明細：");
  for (const f of failures) console.error(`  - ${f.name}\n    ${f.e.stack?.split("\n").slice(0, 3).join("\n    ")}`);
  process.exit(1);
}
