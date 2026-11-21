// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 字體縱向能力與度量單測
 *
 * 守的東西：**「這款字體能不能直排」從此有確定答案，不再是族名猜測**。
 *
 * B1-7 之前 `isFamilyVertCapable()` 比對的是 30 條族名子串 —— 比對的是字體
 * 「叫什麼」，不是「能做什麼」。B2-5 之前連直排步進都得靠插一個隱藏 <div>
 * 去 getBoundingClientRect 量回來（Node 下完全不可能）。本檔案要證明這兩件事
 * 現在都能從字體二進位直接讀出來，並且**降級每一級都有人守**。
 *
 * 這裡特別用力守住幾件容易悄悄壞掉的事：
 *
 *  1. **GSUB 的 offset 是兩層基準**：FeatureList 相對 GSUB 起點，Feature table
 *     又相對 FeatureList 起點。寫反了不報錯，只是靜默讀到別人的位元組。
 *     合成 fixture 刻意讓 `vert` 排在表尾，逼 loopupCount 必須精確定位。
 *
 *  2. **空殼 feature 不算具備**：宣告了 `vert` 但 lookupCount = 0 → 不算。
 *     字體廠商常留這種空紀錄，若把它當成有能力，幾何居中兜底就不會啟動。
 *
 *  3. **VORG 的 `defaultVertOriginY` 必須除以 unitsPerEm 才算 em**。
 *     真實 Noto Serif CJK 是 880/1000 = 0.88em；誰要是忘了除，
 *     這個數字會大到離譜（880em），下游一眼就能看出來 —— 但要在這裡先擋住。
 *
 *  4. **讀不到 ≠ 不支援**：`null` 要能一路傳到呼叫端的降級分支。
 *     這三條路徑各自用一個合成 fixture 覆蓋（無 GSUB / 無 vmtx+VORG / 容器不支援）。
 *
 *  5. **三級降級的優先順序**：二進位 > 白名單 / DOM。特別是
 *     「二進位說沒有 vert，但族名在白名單裡」這種打架的情形，必須聽二進位的。
 *
 * 用法：node test/font-vertical-metrics.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-font-vmetrics-"));
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  "--outfile=" + path.join(TMP, "lib.mjs"), "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/* ------------------------------------------------------------------ */
/* 合成 sfnt 構造器                                                     */
/* ------------------------------------------------------------------ */

/**
 * 為什麼要自己拼 sfnt 而不是用真實字體：
 * 真實字體只在特定環境存在（CI / 別的開發機沒有），依賴它等於讓門禁隨環境漂移。
 * 自己拼的 fixture 每一行都可控 —— 「缺 vhea」「VORG 只有 8 字節表頭」這種
 * 病態字體，現實中未必找得到，合成卻只要兩行。
 */

function u8b(n) { const b = new Uint8Array(1); b[0] = n & 0xff; return b; }
function u16b(n) {
  const b = new Uint8Array(2);
  b[0] = (n >> 8) & 0xff; b[1] = n & 0xff;
  return b;
}
function i16b(n) { return u16b(n < 0 ? n + 0x10000 : n); }
function u32b(n) {
  const b = new Uint8Array(4);
  for (let i = 0; i < 4; i++) b[i] = (n >>> (24 - i * 8)) & 0xff;
  return b;
}
function concat(list) {
  const len = list.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const b of list) { out.set(b, o); o += b.length; }
  return out;
}
function pad4(n) { return (4 - (n % 4)) % 4; }

/** sfntVersion(4) numTables(2) searchRange(2) entrySelector(2) rangeShift(2) */
function buildSfnt(tables) {
  const n = tables.length;
  const header = concat([
    u32b(0x00010000), u16b(n), u16b(0), u16b(0), u16b(0),
  ]);
  const dirSize = 12 + n * 16;
  let offset = dirSize;
  const records = [];
  const bodies = [];
  for (const { tag, data } of tables) {
    const pad = pad4(data.length);
    records.push(concat([
      Buffer.from(tag, "latin1"), u32b(0), u32b(offset), u32b(data.length),
    ]));
    bodies.push(data);
    bodies.push(new Uint8Array(pad));
    offset += data.length + pad;
  }
  return concat([header, concat(records), concat(bodies)]);
}

/** head 表：只需 unitsPerEm 落在對的位置（offset 18） */
function headTable(unitsPerEm) {
  return concat([new Uint8Array(18), u16b(unitsPerEm), new Uint8Array(2)]);
}

/** vhea 表：numOfLongVerMetrics 在 offset 34 */
function vheaTable(numLongVer) {
  return concat([new Uint8Array(34), u16b(numLongVer), new Uint8Array(2)]);
}

/** maxp 表：numGlyphs 在 offset 4 */
function maxpTable(numGlyphs) {
  return concat([new Uint8Array(4), u16b(numGlyphs), new Uint8Array(2)]);
}

/** vmtx：advanceHeight(u16) + tsb(int16) 的序列 */
function vmtxTable(advances) {
  return concat(advances.map((a) => concat([u16b(a), i16b(0)])));
}

/**
 * VORG：majorVersion(2) minorVersion(2) defaultVertOriginY(int16) + count(u16)
 *       其後 per-glyph 覆蓋 { glyphIndex(u16) vertOriginY(i16) } × count
 *
 * ✅ count 寫成 **u16** 是**規範本來就如此**，不是「與規範不符」——
 *    Microsoft OpenType 1.9.1 · VORG 明定 `numVertOriginYMetrics` 為 uint16，
 *    表頭 8 字節、覆蓋數組自 offset 8 起、每條 4 字節。三方證據：
 *      ① 官方規範；② fontTools 4.61.1 `struct.unpack(">HHhH", data[:8])`；
 *      ③ 沙箱實測 NotoSerifCJK-Regular.ttc：8 + 248×4 = 1000 ＝ 表長 ✓。
 *    舊註解稱「規範說 u32、故起點在 offset 8 還是 10 有歧義」是**誤讀**，
 *    已於 v2.8.56 更正。本夾具的位元組排列自始正確 → 既有斷言無一需要改動。
 */
function vorgTable(defaultOriginY, metrics = []) {
  return concat([
    u16b(1), u16b(0), i16b(defaultOriginY), u16b(metrics.length),
    ...metrics.map(([g, y]) => concat([u16b(g), i16b(y)])),
  ]);
}

/**
 * GSUB：majorVersion minorVersion scriptListOffset featureListOffset lookupListOffset
 *
 * @param features [{ tag, lookupCount }]
 */
function gsubTable(features) {
  const featureList = concat([
    u16b(features.length),
    ...features.map((f) => concat([Buffer.from(f.tag, "latin1"), u16b(0)])), // 先佔位
  ]);
  // Feature table 緊接在 FeatureRecord 陣列之後，每張 6 字節
  // （featureParamsOffset + lookupCount + 1 個 lookupIndex）
  let cursor = 2 + features.length * 6;
  const records = [];
  const bodies = [];
  for (const f of features) {
    records.push(concat([Buffer.from(f.tag, "latin1"), u16b(cursor)]));
    bodies.push(concat([u16b(0), u16b(f.lookupCount), u16b(0)]));
    cursor += 6;
  }
  const list = concat([u16b(features.length), concat(records), concat(bodies)]);
  // scriptList 佔 2 字節（空的），lookupList 佔 2 字節（空的）
  const scriptListOffset = 10;
  const featureListOffset = scriptListOffset + 2;
  const lookupListOffset = featureListOffset + list.length;
  return concat([
    u16b(1), u16b(0), u16b(scriptListOffset), u16b(featureListOffset), u16b(lookupListOffset),
    u16b(0), // 空 scriptList
    list,
    u16b(0), // 空 lookupList
  ]);
}

/* ------------------------------------------------------------------ */
/* B1-7：GSUB vert / vrt2 能力判定                                      */
/* ------------------------------------------------------------------ */

console.log("\n— B1-7：GSUB FeatureList 解析（vert / vrt2 能力判定）—");

test("[B1-7] 同時有 vert 與 vrt2 → 判定具備", () => {
  const f = lib.readFontFeaturesSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "GSUB", data: gsubTable([
      { tag: "aalt", lookupCount: 2 },
      { tag: "vert", lookupCount: 3 },
      { tag: "vrt2", lookupCount: 1 },
    ]) },
  ]));
  assert.notStrictEqual(f, null, "應解析出 features");
  assert.strictEqual(f.records, 3, "FeatureRecord 數");
  assert.strictEqual(f.vert, true, "vert 應為 true");
  assert.strictEqual(f.vrt2, true, "vrt2 應為 true");
  assert.strictEqual(lib.hasVertFeature(f), true);
  assert.deepStrictEqual(f.tags, ["aalt", "vert", "vrt2"], "tags 應去重且維持出現順序");
});

test("[B1-7] vert 排在表尾：Feature table offset 必須精確定位（兩層 offset 基準）", () => {
  // 若 FeatureList 的 offset 被誤當成相對 GSUB 起點，這個用例就會讀錯位置
  const f = lib.readFontFeaturesSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "GSUB", data: gsubTable([
      { tag: "aalt", lookupCount: 2 },
      { tag: "ccmp", lookupCount: 4 },
      { tag: "liga", lookupCount: 1 },
      { tag: "vert", lookupCount: 2 },
    ]) },
  ]));
  assert.strictEqual(f.vert, true, "表尾的 vert 仍須被找到");
  assert.strictEqual(f.vrt2, false, "沒有 vrt2 時不得為 true");
  assert.strictEqual(lib.hasVrt2Feature(f), false);
});

test("[B1-7] 空殼 vert（lookupCount = 0）→ 不具備", () => {
  const f = lib.readFontFeaturesSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "GSUB", data: gsubTable([
      { tag: "vert", lookupCount: 0 },
      { tag: "vrt2", lookupCount: 0 },
    ]) },
  ]));
  assert.notStrictEqual(f, null, "GSUB 存在，應解析得出 records");
  assert.strictEqual(f.records, 2, "record 數照算");
  assert.strictEqual(f.vert, false, "宣告了但沒有 lookup = 空殼，不算具備");
  assert.strictEqual(f.vrt2, false);
  assert.strictEqual(lib.hasVertFeature(f), false);
});

test("[B1-7] 完全沒有 GSUB 表 → null（呼叫端要降級，不可當 false）", () => {
  const r = lib.readFontFeaturesSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "cmap", data: new Uint8Array([0, 0, 0, 0]) },
  ]));
  assert.strictEqual(r, null, "沒有 GSUB 應回 null（判斷不了），不是 vert:false");
  assert.strictEqual(lib.hasVertFeature(r), false, "hasVertFeature(null) 為 false");
});

test("[B1-7] 容器不支援（woff2 / 亂碼）→ null，不拋異常", () => {
  const woff2 = concat([Buffer.from("wOF2", "latin1"), new Uint8Array(64)]);
  assert.strictEqual(lib.readFontFeaturesSync(woff2), null);
  assert.strictEqual(lib.readFontFeaturesSync(new Uint8Array(0)), null, "空陣列不得拋");
  assert.strictEqual(lib.readFontFeaturesSync(new Uint8Array([1, 2, 3])), null, "亂碼不得拋");
});

test("[B1-7] GSUB 表被截斷（record 超出表長）→ 不崩、已讀到的部分照樣成立", () => {
  const full = gsubTable([{ tag: "vert", lookupCount: 1 }, { tag: "vrt2", lookupCount: 1 }]);
  const truncated = full.subarray(0, full.length - 10);
  const f = lib.readFontFeaturesSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "GSUB", data: truncated },
  ]));
  // 截斷後要嘛讀到 vert（前面的 record 完好），要嘛判定不了 —— 就是不該拋
  assert.ok(f === null || typeof f === "object", "截斷時不得拋異常");
  if (f !== null) assert.strictEqual(f.vert, true, "前面的 vert record 仍應讀到");
});

/* ------------------------------------------------------------------ */
/* B2-5：vmtx / VORG 解析                                               */
/* ------------------------------------------------------------------ */

console.log("\n— B2-5：vmtx 眾數步進與 VORG defaultVertOriginY —");

test("[B2-5] 基本換算：unitsPerEm=1000、步進全 1000、VORG 880 → 1.0em / 0.88em", () => {
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "maxp", data: maxpTable(4) },
    { tag: "vhea", data: vheaTable(4) },
    { tag: "vmtx", data: vmtxTable([1000, 1000, 1000, 1000]) },
    { tag: "VORG", data: vorgTable(880, [[737, 858]]) },
  ]));
  assert.notStrictEqual(m, null, "應解析成功");
  assert.strictEqual(m.unitsPerEm, 1000);
  assert.strictEqual(m.hasVmtx, true);
  assert.strictEqual(m.advanceEm, 1.0, "1000/1000 = 1.0em");
  assert.strictEqual(m.uniform, true, "全表同值 → uniform");
  assert.strictEqual(m.hasVorg, true);
  assert.strictEqual(m.vorgDefaultOriginYEm, 0.88, "880/1000 = 0.88em（真實 Noto CJK 值）");
});

test("[B2-5] unitsPerEm=2048 的字體：em 換算仍正確", () => {
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(2048) },
    { tag: "maxp", data: maxpTable(2) },
    { tag: "vhea", data: vheaTable(2) },
    { tag: "vmtx", data: vmtxTable([2048, 2048]) },
    { tag: "VORG", data: vorgTable(1802) },
  ]));
  assert.strictEqual(m.advanceEm, 1.0, "2048/2048 = 1.0em");
  assert.ok(Math.abs(m.vorgDefaultOriginYEm - 1802 / 2048) < 1e-9, "1802/2048 em");
});

test("[B2-5] 眾數：多數同值、少數例外 → 取眾數且 uniform=false", () => {
  // 對照真實 Noto Serif CJK：65,057 筆 1000 + 6 筆例外
  const advances = [1000, 1000, 1000, 1000, 1000, 1000, 3000, 1000, 1000];
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "maxp", data: maxpTable(advances.length) },
    { tag: "vhea", data: vheaTable(advances.length) },
    { tag: "vmtx", data: vmtxTable(advances) },
  ]));
  assert.strictEqual(m.advanceEm, 1.0, "眾數是 1000（8 筆），不是 3000");
  assert.strictEqual(m.uniform, false, "有例外 → uniform=false，呼叫端可據此判斷可信度");
});

test("[B2-5] vhea 缺失但有 maxp → 用 maxp.numGlyphs 夾限，不把 tsb 區當步進讀", () => {
  const advances = [1000, 1000];
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "maxp", data: maxpTable(2) },
    { tag: "vmtx", data: vmtxTable(advances) },
  ]));
  assert.strictEqual(m.advanceEm, 1.0, "只讀前 numGlyphs 筆");
  assert.strictEqual(m.uniform, true);
});

test("[B2-5] VORG 表頭只有 8 字節也能讀（per-glyph 數組不解析）", () => {
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "vhea", data: vheaTable(2) },
    { tag: "vmtx", data: vmtxTable([1000, 1000]) },
    { tag: "VORG", data: concat([u16b(1), u16b(0), i16b(880)]) }, // 6 字節，無 count
  ]));
  assert.strictEqual(m.hasVorg, true);
  assert.strictEqual(m.vorgDefaultOriginYEm, 0.88, "只要 defaultVertOriginY 在 offset 4 就讀得到");
});

/* ------------------------------------------------------------------ */
/* B2-5 殘留核銷：VORG per-glyph 覆蓋數組（表頭定案為 8 字節 / count=u16）  */
/* ------------------------------------------------------------------ */

console.log("\n— B2-5 殘留：VORG per-glyph 覆蓋數組與逐字查詢 —");

test("[B2-5-per-glyph] 覆蓋數組解析：3 條全數讀出，順序與內容逐條正確", () => {
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "VORG", data: vorgTable(880, [[737, 858], [755, 868], [65053, 1880]]) },
  ]));
  assert.strictEqual(m.hasVorg, true);
  assert.ok(m.vorgOverrides, "應解析出覆蓋數組（不是 null）");
  assert.strictEqual(m.vorgOverrides.length, 3, "count = 3");
  assert.deepStrictEqual(
    m.vorgOverrides.map((o) => [o.glyphIndex, o.vertOriginY]),
    [[737, 858], [755, 868], [65053, 1880]],
    "逐條 (glyphIndex, vertOriginY) 為 font units，順序不變"
  );
});

test("[B2-5-per-glyph] 逐字查詢：命中用覆蓋值、未命中回落 default（皆為 em）", () => {
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "VORG", data: vorgTable(880, [[737, 858], [755, 868], [65053, 1880]]) },
  ]));
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 737), 0.858, "858/1000 命中");
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 755), 0.868, "868/1000 命中");
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 65053), 1.88, "1880/1000 命中");
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 0), 0.88, "缺席即等值（尺寸最佳化會省略）");
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 999999), 0.88, "越界也回落 default，不拋錯");
});

test("[B2-5-per-glyph] 二分查找邊界：首／末／中間／間隙，並逐條全表對拍", () => {
  // 造 200 條；線性掃也會對，但這條守住「邊界不差一」——當年疑似錯位正是差一位元組
  const metrics = Array.from({ length: 200 }, (_, i) => [i * 3 + 1, 800 + i]);
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "VORG", data: vorgTable(880, metrics) },
  ]));
  assert.strictEqual(m.vorgOverrides.length, 200);
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 1), 0.8, "首條 (g=1,y=800)");
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 598), 0.999, "末條 (g=598,y=999)");
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 301), 0.9, "中間 (g=301,y=900)");
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 300), 0.88, "間隙 g=300 不在表內 → default");
  for (const [g, y] of metrics) {
    assert.strictEqual(lib.vorgOriginYEmForGlyph(m, g), y / 1000, `全表對拍 g=${g}`);
  }
});

test("[B2-5-per-glyph] count=0 → 空陣列（確定的「零條覆蓋」），查詢回落 default", () => {
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "VORG", data: vorgTable(880, []) },
  ]));
  assert.notStrictEqual(m.vorgOverrides, null, "空陣列 ≠ null：這是確定的讀到結果");
  assert.strictEqual(m.vorgOverrides.length, 0);
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 737), 0.88, "全表共用 default");
});

test("[B2-5-per-glyph] 畸形表（count 越界）→ 覆蓋回 null 降級，default 仍可讀", () => {
  // 表頭宣告 count=10，實際只給 1 條 → 8 + 10×4 = 48 > 實際長度
  const broken = concat([
    u16b(1), u16b(0), i16b(880), u16b(10),
    concat([u16b(737), i16b(858)]),
  ]);
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "VORG", data: broken },
  ]));
  assert.strictEqual(m.hasVorg, true, "表存在");
  assert.strictEqual(m.vorgDefaultOriginYEm, 0.88, "default 在 offset 4，不受影響");
  assert.strictEqual(m.vorgOverrides, null, "長度不自洽 → null，絕不硬讀錯位值");
  assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 737), 0.88, "降級後仍給 default");
});

test("[B2-5-per-glyph] 規範閘門：TrueType(glyf 且無 CFF) 帶 VORG → 必須忽略", () => {
  // 同一張 VORG，只差輪廓表：TrueType 依規範必須忽略，CFF 則適用
  const withGlyf = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "vhea", data: vheaTable(2) },
    { tag: "vmtx", data: vmtxTable([1000, 1000]) },
    { tag: "glyf", data: new Uint8Array(16) },
    { tag: "VORG", data: vorgTable(880, [[737, 858]]) },
  ]));
  assert.notStrictEqual(withGlyf, null, "有 vmtx → 仍有度量可報");
  assert.strictEqual(withGlyf.hasVorg, false, "含 TrueType 輪廓 → VORG 依規範必須忽略");
  assert.strictEqual(withGlyf.vorgDefaultOriginYEm, null);
  assert.strictEqual(withGlyf.vorgOverrides, null);
  assert.strictEqual(withGlyf.advanceEm, 1.0, "閘門只排除 VORG，不影響 vmtx 步進");

  const withCff = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "vhea", data: vheaTable(2) },
    { tag: "vmtx", data: vmtxTable([1000, 1000]) },
    { tag: "CFF ", data: new Uint8Array(16) },
    { tag: "VORG", data: vorgTable(880, [[737, 858]]) },
  ]));
  assert.strictEqual(withCff.hasVorg, true, "CFF 輪廓 → VORG 適用");
  assert.strictEqual(withCff.vorgDefaultOriginYEm, 0.88);
  assert.strictEqual(withCff.vorgOverrides.length, 1);
  assert.strictEqual(lib.vorgOriginYEmForGlyph(withCff, 737), 0.858);
});

test("[B2-5-per-glyph] 規範閘門連帶效應：TrueType 的 VORG 被排除後若也無 vmtx → 整體 null", () => {
  // 負向閘門不只關掉 hasVorg，也讓「只有 VORG」退化成真的沒有度量
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "glyf", data: new Uint8Array(16) },
    { tag: "VORG", data: vorgTable(880, [[737, 858]]) },
  ]));
  assert.strictEqual(m, null, "VORG 被閘門排除、又無 vmtx → 判斷不了，呼叫端降級");
});

test("[B2-5] 降級路徑一：沒有 vmtx 也沒有 VORG → null（呼叫端退 DOM 度量）", () => {
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "cmap", data: new Uint8Array(8) },
  ]));
  assert.strictEqual(m, null, "兩張表都沒有 → 判斷不了");
});

test("[B2-5] 降級路徑二：只有 VORG、沒有 vmtx → hasVmtx=false 但仍給 VORG", () => {
  const m = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "VORG", data: vorgTable(880) },
  ]));
  assert.strictEqual(m.hasVmtx, false);
  assert.strictEqual(m.advanceEm, null, "沒有 vmtx → advanceEm 為 null");
  assert.strictEqual(m.vorgDefaultOriginYEm, 0.88);
});

test("[B2-5] head 缺失或非法的 unitsPerEm → null（不拿猜的值產出假答案）", () => {
  const noHead = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "vhea", data: vheaTable(2) },
    { tag: "vmtx", data: vmtxTable([1000, 1000]) },
  ]));
  assert.strictEqual(noHead, null, "沒有 head 就無法把 units 換算成 em");

  const badUpem = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(0) }, // unitsPerEm=0 非法
    { tag: "vhea", data: vheaTable(2) },
    { tag: "vmtx", data: vmtxTable([1000, 1000]) },
  ]));
  assert.strictEqual(badUpem, null, "unitsPerEm 超出 16–16384 應判定不了");
});

test("[B2-5] vmtx 為空：hasVmtx 仍為 true，但 advanceEm=null（呼叫端照樣降級）", () => {
  // 為什麼這裡**不**回 null：契約是「null = 呼叫端降級」，而呼叫端的降級條件
  // 本來就是「拿不到 advanceEm」。若空 vmtx 也回 null，等於把
  // 「確實有 vmtx 表、只是讀不出記錄」這個事實壓縮成「判斷不了」——
  // 診斷資訊白白丟掉，還讓 hasVmtx 這個欄位永遠表達不出那一態。
  // 兩者的處置完全相同（都降級），故保留資訊量較大的那一種。
  const empty = lib.readFontVerticalMetricsSync(buildSfnt([
    { tag: "head", data: headTable(1000) },
    { tag: "vhea", data: vheaTable(4) },
    { tag: "vmtx", data: new Uint8Array(0) },
  ]));
  assert.notStrictEqual(empty, null, "有 vmtx 表就該回物件");
  assert.strictEqual(empty.hasVmtx, true);
  assert.strictEqual(empty.advanceEm, null, "讀不到記錄 → 呼叫端降級到 DOM / 目標節距");
  assert.strictEqual(lib.hasUsableAdvance(empty), false, "可用性 predicate 也要能辨識");
});

test("[B2-5] 容器不支援 / 亂碼 → null，不拋異常", () => {
  assert.strictEqual(lib.readFontVerticalMetricsSync(new Uint8Array(0)), null, "空陣列不得拋");
  assert.strictEqual(lib.readFontVerticalMetricsSync(new Uint8Array([1, 2, 3])), null, "亂碼不得拋");
  assert.strictEqual(lib.readFontVerticalMetricsSync(Buffer.from("wOF2")), null, "woff2 不支援");
});

/* ------------------------------------------------------------------ */
/* 三級降級的接線                                                       */
/* ------------------------------------------------------------------ */

console.log("\n— 三級降級：fitTypographyToElement 的探針注入 —");

/**
 * Node 下沒有 document，fitTypographyToElement 會在第一個守衛就 return。
 * 所以要驗證三級降級，得直接造假 document 把整條流程走完 ——
 * 比只測片段更能抓到接線錯誤（來源旗標寫反、降級順序寫顛倒之類）。
 */
function withFakeDocument(fn) {
  const el = { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
  // 假探針元素：高度按「1.2em × 字數 × 字號」算出，代表一款步進偏寬的字體。
  // 從 cssText 反解字號，才不會因為 fixture 改了 fontSizePt 就整片測試跟著改。
  const probeDiv = {
    style: { cssText: "" },
    textContent: "",
    getBoundingClientRect() {
      const m = /font-size:\s*([\d.]+)px/.exec(this.style.cssText);
      const size = m ? parseFloat(m[1]) : 16;
      return { height: 1.2 * String(this.textContent).length * size };
    },
    remove() {},
  };
  globalThis.document = {
    body: { appendChild() {}, },
    createElement: () => probeDiv,
    fonts: { check: () => true },
  };
  try { fn(el); } finally { delete globalThis.document; }
  return el;
}

test("[降級] vertSource：二進位說了就算，哪怕跟白名單打架", () => {
  // "Noto Serif CJK" 在白名單裡（isFamilyVertCapable = true），
  // 但 GSUB 二進位說沒有 vert → 必須聽二進位的。
  withFakeDocument((el) => {
    const d = lib.fitTypographyToElement(
      el, "han", ["Noto Serif CJK"], { fontSizePt: 12, letterSpacingEm: 0 }, "永",
      { vert: () => false }
    );
    assert.strictEqual(d.vertSource, "binary", "來源應是 binary");
    assert.strictEqual(d.vertCapable, false, "二進位否決白名單");
  });

  // 反向：族名不在白名單，但二進位說有 → 放行（正是 B1-7 要修的假陰性）
  withFakeDocument((el) => {
    const d = lib.fitTypographyToElement(
      el, "han", ["LXGW WenKai"], { fontSizePt: 12, letterSpacingEm: 0 }, "永",
      { vert: () => true }
    );
    assert.strictEqual(d.vertSource, "binary");
    assert.strictEqual(d.vertCapable, true, "白名單外的字體也能被認證");
  });
});

test("[降級] vertSource：探針回 null（=不知道）時退回白名單", () => {
  withFakeDocument((el) => {
    const d = lib.fitTypographyToElement(
      el, "han", ["Noto Serif CJK"], { fontSizePt: 12, letterSpacingEm: 0 }, "永",
      { vert: () => null }
    );
    assert.strictEqual(d.vertSource, "whitelist", "不知道 → 退回白名單");
    assert.strictEqual(d.vertCapable, true, "Noto Serif CJK 在白名單裡");
  });
  withFakeDocument((el) => {
    const d = lib.fitTypographyToElement(
      el, "han", ["Some Unknown Font"], { fontSizePt: 12, letterSpacingEm: 0 }, "永",
      { vert: () => null }
    );
    assert.strictEqual(d.vertSource, "none");
    assert.strictEqual(d.vertCapable, false);
  });
});

test("[降級] vertSource：完全沒給探針時行為與今日完全一致（零回歸）", () => {
  withFakeDocument((el) => {
    const d = lib.fitTypographyToElement(
      el, "han", ["Noto Serif CJK"], { fontSizePt: 12, letterSpacingEm: 0 }, "永"
    );
    assert.strictEqual(d.vertCapable, true, "無探針 → 與既有 isFamilyVertCapable 同結果");
    assert.strictEqual(d.vertSource, "whitelist");
  });
});

test("[降級] advanceSource：有 vmtx 就不用 DOM；沒有才降级到 DOM", () => {
  withFakeDocument((el) => {
    const d = lib.fitTypographyToElement(
      el, "han", ["X"], { fontSizePt: 12, letterSpacingEm: 0 }, "永",
      { verticalAdvance: () => 1.0 }
    );
    assert.strictEqual(d.advanceSource, "vmtx", "第一級：字體二進位");
    assert.strictEqual(d.measuredAdvanceEm, 1.0);
    // target(han)=1.0 − measured 1.0 = 0
    assert.strictEqual(d.fixEm, 0);
  });

  withFakeDocument((el) => {
    const d = lib.fitTypographyToElement(
      el, "han", ["X"], { fontSizePt: 12, letterSpacingEm: 0 }, "永",
      { verticalAdvance: () => null }
    );
    assert.strictEqual(d.advanceSource, "dom", "第二級：DOM 實測");
    assert.ok(Math.abs(d.measuredAdvanceEm - 1.2) < 1e-9, "1152/8/120 = 1.2em");
    assert.ok(d.fixEm < 0, "1.0 − 1.2 = 負校正");
  });
});

test("[降級] advanceSource：非法二進位值（NaN / 0 / 负）不會被採用", () => {
  for (const bad of [NaN, 0, -1]) {
    withFakeDocument((el) => {
      const d = lib.fitTypographyToElement(
        el, "han", ["X"], { fontSizePt: 12, letterSpacingEm: 0 }, "永",
        { verticalAdvance: () => bad }
      );
      assert.strictEqual(d.advanceSource, "dom", `非法值 ${bad} 應降級到 DOM`);
    });
  }
});

test("[修復] 折疊字體：步進 0 但有佈局 → 回報 0 而非 null；完全無佈局 → null", () => {
  const mk = (h, w) => ({
    style: { cssText: "" }, textContent: "",
    getBoundingClientRect: () => ({ height: h, width: w }), remove() {},
  });
  const install = (probe) => {
    globalThis.document = { body: { appendChild() {} }, createElement: () => probe, fonts: { check: () => true } };
  };
  install(mk(0, 14));
  try {
    assert.strictEqual(lib.measureVerticalAdvanceEm("X", 16, "永", 8), 0, "折疊但有佈局 → 0（v2.8.31 修復）");
  } finally { delete globalThis.document; }
  install(mk(0, 0));
  try {
    assert.strictEqual(lib.measureVerticalAdvanceEm("X", 16, "永", 8), null, "完全無佈局 → null");
  } finally { delete globalThis.document; }
});

test("[降級] autoFitMetrics=false 時提早返回，不設 --li-ls-fix", () => {
  withFakeDocument((el) => {
    const d = lib.fitTypographyToElement(
      el, "han", ["X"], { fontSizePt: 12, letterSpacingEm: 0, autoFitMetrics: false }, "永",
      { verticalAdvance: () => 1.0 }
    );
    assert.strictEqual(d.fixEm, null, "關閉度量自適應 → 不校正");
    assert.deepStrictEqual(el.style.props, {}, "不得寫入任何 CSS 變數");
  });
});

/* ------------------------------------------------------------------ */
/* 真機對拍（有真實字體才跑）                                            */
/* ------------------------------------------------------------------ */

console.log("\n— 真機對拍：沙箱有 Noto Serif CJK 時與探到的真值比對 —");

const REAL_FONT = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc";
if (fs.existsSync(REAL_FONT)) {
  const bytes = new Uint8Array(fs.readFileSync(REAL_FONT));
  const f = lib.readFontFeaturesSync(bytes);
  const m = lib.readFontVerticalMetricsSync(bytes);
  // 異步版在外面先取好：下面的 test runner 是同步的，塞 async fn 進去
  // 會讓它在等待前就被記成「通過」，失敗也只能當 unhandled rejection 飄走。
  const fa = await lib.readFontFeatures(bytes);
  const ma = await lib.readFontVerticalMetrics(bytes);

  test("[真機] GSUB：631 筆 record、含 vert 與 vrt2", () => {
    assert.strictEqual(f.records, 631, "FeatureRecord 總數");
    assert.strictEqual(f.vert, true);
    assert.strictEqual(f.vrt2, true);
    assert.ok(f.tags.includes("vert") && f.tags.includes("vrt2"));
  });

  test("[真機] vmtx 眾數 = 1.0em、VORG = 0.88em（與 python 直讀相符）", () => {
    assert.strictEqual(m.unitsPerEm, 1000);
    assert.strictEqual(m.advanceEm, 1.0, "65,057 / 65,063 筆都是 1000");
    assert.strictEqual(m.uniform, false, "少數例外（直排合成字形）使它為 false");
    assert.strictEqual(m.vorgDefaultOriginYEm, 0.88, "880/1000");
  });

  test("[真機] 異步版與同步版結論一致", () => {
    assert.strictEqual(fa.vert, f.vert, "async/sync GSUB 結果須一致");
    assert.strictEqual(ma.advanceEm, m.advanceEm, "async/sync vmtx 結果須一致");
    assert.strictEqual(ma.vorgDefaultOriginYEm, m.vorgDefaultOriginYEm, "async/sync VORG 結果須一致");
  });

  test("[真機][B2-5-per-glyph] VORG 覆蓋：248 條、嚴格遞增、首末條與 python 直讀一致", () => {
    // 表頭定案的活證據：8 + 248×4 = 1000 ＝ 表長。
    // 若按當年誤以為的「10 字節表頭 / count=u32」解讀，count 會是 16,253,665（荒謬）。
    assert.ok(m.vorgOverrides, "應解析出覆蓋數組");
    assert.strictEqual(m.vorgOverrides.length, 248, "count = 248（python 直讀同值）");
    for (let i = 1; i < m.vorgOverrides.length; i++) {
      assert.ok(
        m.vorgOverrides[i].glyphIndex > m.vorgOverrides[i - 1].glyphIndex,
        `glyphIndex 須嚴格遞增（i=${i}）—— 起點若錯位成 offset 10 這裡會立刻失效`
      );
    }
    assert.deepStrictEqual(
      [m.vorgOverrides[0].glyphIndex, m.vorgOverrides[0].vertOriginY],
      [737, 858], "首條 (737, 858)"
    );
    const last = m.vorgOverrides[m.vorgOverrides.length - 1];
    assert.deepStrictEqual([last.glyphIndex, last.vertOriginY], [65053, 1880], "末條 (65053, 1880)");
    const ys = m.vorgOverrides.map((o) => o.vertOriginY);
    assert.strictEqual(Math.min(...ys), 625, "vertOriginY 最小值（python 直讀同值）");
    assert.strictEqual(Math.max(...ys), 1880, "vertOriginY 最大值（python 直讀同值）");
  });

  test("[真機][B2-5-per-glyph] 逐字查詢對拍：命中／未命中皆與 python 直讀一致", () => {
    assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 737), 0.858, "858/1000 命中首條");
    assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 65053), 1.88, "1880/1000 命中末條");
    assert.strictEqual(lib.vorgOriginYEmForGlyph(m, 1), 0.88, "g=1 不在表內 → default 880/1000");
    assert.strictEqual(ma.vorgOverrides.length, m.vorgOverrides.length, "async/sync 覆蓋數一致");
  });
} else {
  console.log("  （沙箱無 " + REAL_FONT + "，跳過真機對拍）");
}

/* ------------------------------------------------------------------ */

console.log(`\n字體縱向能力與度量：${passed} 通過 / ${failures.length} 失敗`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.e.message}`);
  process.exit(1);
}
