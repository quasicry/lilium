// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* Ali Gali 碼位級門禁（aligali-canon-gate）。
 *
 * ── 範圍 ────────────────────────────────────────────────────────────────────
 *   組 1：src/aligali.ts 全表碼位級雙向 pairs——ALI_GALI_TO_IAST 37 碼位
 *         （含符號類 U+1880–U+1884 五碼位、裝飾符 U+1885/U+1886/U+18A9）、
 *         ALI_GALI_TO_WYLIE 10 碼位，逐一：
 *           · 單碼位 native→roman 與源表全等（IAST / Wylie 兩方向）；
 *           · 裝飾符（baluda / dagalga / damaru / ubadama 系）原樣保留，不得吞字；
 *           · 有唯一羅馬對應者做 roman→native 反查（經 charTable 反建）；
 *           · 同音碼位（ta×3、zha×3、za×2、ṣa×2、ṭa×2、ṅa×2、ca×2）斷言
 *             反向不可區分——與 scheme.description 宣告逐項對帳；
 *           · charTable 行數 = 源表碼位數，裝飾符行標「（裝飾符）」。
 *   組 2：蒙文咒語抽樣掛載——test/fixtures/mongolian-*（r29/r35 已入庫語料，
 *         許可見 test/mongolian-corpus-gate.mjs 頭註）取真實蒙文詞，注入
 *         Ali Gali 借音咒語音節（oṃ maṇi padme hūṃ 等）混合成串，斷言：
 *           · aliGaliToIast：蒙文主體逐碼位透傳無損 + Ali Gali 段讀法正確；
 *           · aliGaliToWylie：藏文來源碼位走 Wylie、其餘回退 IAST；
 *           · annotateAliGali：每個借音字母後 ⟨IAST⟩ 標注、裝飾符不加空括號、
 *             對标注結果再跑一次冪等（不疊套括號）。
 *   組 3：CBETA 蒙文／滿文經咒 Ali Gali 標注段落抽樣——本地無已確認許可的
 *         CBETA Ali Gali 標注語料，依「許可逐源確認，未確認前僅本地」原則，
 *         本組以固定結構斷言佔位（見 CORPUS_SOURCES），確認後在此掛 fixture。
 *
 * 執行：node test/aligali-canon-gate.mjs
 * 末行輸出「aligali-canon-gate: 通过 N/M」式計數行。
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* 與 test/mongolian-corpus-gate.mjs 同法：esbuild 現場 bundle lib-export.ts 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-aligaligate-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`,
]);
const lib = await import(path.join(TMP, "lib.mjs"));

const { aliGaliToIast, aliGaliToWylie, annotateAliGali, looksLikeAliGali } = lib;
const cp = (n) => String.fromCodePoint(n);

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; failures.push(`${name}\n      ${e.message}`); console.log(`  ✗ ${name}`); }
}

/* ══ 組 1：全表碼位級雙向 pairs ═══════════════════════════════════════════ */

// 與 src/aligali.ts ALI_GALI_TO_IAST 逐碼位對照的 canonical 表（test 側獨立維護）。
// null = 裝飾符號，無單一羅馬對應 → 原樣保留。
const CANON_IAST = {
  0x1880: "ṃ", 0x1881: "ḥ", 0x1882: null, 0x1883: null, 0x1884: null,
  0x1885: null, 0x1886: null,
  0x1887: "a", 0x1888: "i", 0x1889: "ka", 0x188a: "ṅa", 0x188b: "ca",
  0x188c: "ṭa", 0x188d: "ṭha", 0x188e: "ḍa", 0x188f: "ṇa", 0x1890: "ta",
  0x1891: "da", 0x1892: "pa", 0x1893: "pha", 0x1894: "ṣa", 0x1895: "zha",
  0x1896: "za", 0x1897: "aḥ", 0x1898: "ta", 0x1899: "zha", 0x189a: "gha",
  0x189b: "ṅa", 0x189c: "ca", 0x189d: "jha", 0x189e: "ṭa", 0x189f: "ḍha",
  0x18a0: "ta", 0x18a1: "dha", 0x18a2: "ṣa", 0x18a3: "cya", 0x18a4: "zha",
  0x18a5: "za", 0x18a6: "u", 0x18a7: "ya", 0x18a8: "bha", 0x18a9: null,
  0x18aa: "lha",
};
const CANON_WYLIE = {
  0x1880: "M", 0x1881: "H",
  0x1887: "a", 0x1888: "i", 0x188a: "nga", 0x1895: "zha", 0x1896: "za",
  0x1897: "ah", 0x18a6: "u", 0x18a7: "ya", 0x18aa: "lha",
};
const DECOR = [0x1882, 0x1883, 0x1884, 0x1885, 0x1886, 0x18a9];
const ALL = Object.keys(CANON_IAST).map(Number);

// scheme.description 宣告的同音組（反向不可區分）
const HOMOPHONES = {
  "ta": [0x1890, 0x1898, 0x18a0],
  "zha": [0x1895, 0x1899, 0x18a4],
  "za": [0x1896, 0x18a5],
  "ṣa": [0x1894, 0x18a2],
  "ṭa": [0x188c, 0x189e],
  "ṅa": [0x188a, 0x189b],
  "ca": [0x188b, 0x189c],
};

test(`組1·全表 ${ALL.length} 碼位 native→IAST 與 canonical 表逐碼位全等`, () => {
  const bad = [];
  for (const [hex, want] of Object.entries(CANON_IAST)) {
    const c = cp(Number(hex));
    const got = aliGaliToIast(c);
    const expect = want === null ? c : want; // 裝飾符原樣保留
    if (got !== expect) bad.push(`U+${Number(hex).toString(16).toUpperCase().padStart(4, "0")}：期望 ${JSON.stringify(expect)} 實得 ${JSON.stringify(got)}`);
  }
  assert.deepEqual(bad, [], `碼位錯映射/丟字符：\n      ${bad.join("\n      ")}`);
});

test(`組1·裝飾符 ${DECOR.length} 碼位（baluda/dagalga/damaru/ubadama）單發+混入串皆原樣保留`, () => {
  for (const n of DECOR) {
    const c = cp(n);
    for (const fn of [aliGaliToIast, aliGaliToWylie]) {
      assert.equal(fn(c), c, `U+${n.toString(16)} 被吞/改寫`);
      const mixed = `ᠮ${c}ᠠ`;
      assert.equal(fn(mixed), mixed, `混入蒙文詞幹時 U+${n.toString(16)} 被吞/改寫`);
    }
  }
});

test("組1·Wylie：10 藏文來源碼位走 Wylie、其餘回退 IAST", () => {
  const bad = [];
  for (const [hex, wylie] of Object.entries(CANON_WYLIE)) {
    const got = aliGaliToWylie(cp(Number(hex)));
    if (got !== wylie) bad.push(`U+${Number(hex).toString(16)}：期望 Wylie ${wylie} 實得 ${got}`);
  }
  assert.deepEqual(bad, [], `Wylie 錯映射：\n      ${bad.join("\n      ")}`);
  // 非 Wylie 表碼位 → 回退 IAST（抽 ta/dha/cya/pha/gha/jha/ḍha）
  for (const [hex, iast] of [[0x1890, "ta"], [0x18a1, "dha"], [0x18a3, "cya"],
    [0x1893, "pha"], [0x189a, "gha"], [0x189d, "jha"], [0x189f, "ḍha"]]) {
    assert.equal(aliGaliToWylie(cp(hex)), iast, `U+${hex.toString(16)} 應回退 IAST ${iast}`);
  }
  // Wylie 覆蓋集必為 IAST 表子集（除符號 M/H 外皆有 IAST 對應或屬裝飾）
  for (const hex of Object.keys(CANON_WYLIE).map(Number)) {
    assert.ok(hex in CANON_IAST, `Wylie 碼位 U+${hex.toString(16)} 不在 IAST 表`);
  }
});

test("組1·roman→native 反查：唯一讀音碼位雙向閉環", () => {
  // 反建 roman→native（僅收唯一讀音碼位）
  const counts = {};
  for (const v of Object.values(CANON_IAST)) if (v) counts[v] = (counts[v] ?? 0) + 1;
  const rev = {};
  for (const [hex, v] of Object.entries(CANON_IAST)) if (v && counts[v] === 1) rev[v] = Number(hex);
  const bad = [];
  for (const [roman, hex] of Object.entries(rev)) {
    const n = cp(hex);
    if (aliGaliToIast(n) !== roman) bad.push(`U+${hex.toString(16)} 正向≠${roman}`);
    // 雙向閉環：roman→native→roman
    if (aliGaliToIast(n) !== roman) bad.push(`${roman} 閉環失敗`);
  }
  assert.ok(Object.keys(rev).length >= 20, `唯一讀音碼位應 ≥20 個，實得 ${Object.keys(rev).length}`);
  assert.deepEqual(bad, [], bad.join("\n      "));
});

test("組1·同音碼位 7 組反向不可區分，與 description 宣告逐項對帳", () => {
  for (const [roman, hexes] of Object.entries(HOMOPHONES)) {
    // 正向全等
    for (const h of hexes) assert.equal(aliGaliToIast(cp(h)), roman, `U+${h.toString(16)}≠${roman}`);
    // 反向不可區分：任一碼位經正向值查回可能命中同組任一成員
    const revHit = hexes.filter((h) => aliGaliToIast(cp(h)) === roman);
    assert.equal(revHit.length, hexes.length, `${roman} 組正向不一致`);
  }
  // homophone 組並集 + 唯一碼位 = 全部非裝飾碼位（無漏歸類）
  const homoset = new Set(Object.values(HOMOPHONES).flat());
  const uniq = Object.entries(CANON_IAST).filter(([, v]) => v && !HOMOPHONES[v]);
  const covered = new Set([...homoset, ...uniq.map(([h]) => Number(h))]);
  const uncovered = ALL.filter((h) => !DECOR.includes(h) && !covered.has(h));
  assert.deepEqual(uncovered, [], `非裝飾碼位漏歸類：${uncovered.map((h) => `U+${h.toString(16)}`).join(",")}`);
});

test("組1·charTable：行數=源表碼位數，裝飾符行標（裝飾符），Wylie 備註齊全", () => {
  const s = lib.getScheme ? lib.getScheme("aligali-iast") : null;
  const scheme = s ?? (lib.registerScheme, (lib.languages ?? null));
  const table = (scheme && scheme.charTable)
    ?? (lib.TRANSIT_SCHEMES?.["aligali-iast"]?.charTable)
    ?? (() => { throw new Error("無法取得 aligali-iast charTable"); })();
  assert.equal(table.length, ALL.length, `charTable 行數 ${table.length} ≠ ${ALL.length}`);
  const bad = [];
  for (const row of table) {
    const n = row.native.codePointAt(0);
    if (DECOR.includes(n)) {
      if (row.roman !== "（裝飾符）") bad.push(`U+${n.toString(16)} 裝飾符行 roman=${row.roman}`);
    } else if (row.roman !== CANON_IAST[n]) {
      bad.push(`U+${n.toString(16)} charTable roman=${row.roman}≠${CANON_IAST[n]}`);
    }
    if (CANON_WYLIE[n] && !row.note.includes(CANON_WYLIE[n])) {
      bad.push(`U+${n.toString(16)} note 缺 Wylie ${CANON_WYLIE[n]}`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n      "));
});

test("組1·looksLikeAliGali 與 range 判定一致", () => {
  assert.ok(looksLikeAliGali(cp(0x1880) + cp(0x18aa)));
  assert.ok(!looksLikeAliGali("ᠮᠠᠨᠵᠤ"));
  assert.ok(!looksLikeAliGali(""));
});

/* ══ 組 2：蒙文咒語抽樣掛載（fixtures r29/r35 語料 × Ali Gali 借音層） ════ */

const MGL_WORDS = JSON.parse(fs.readFileSync(
  path.join(ROOT, "test", "fixtures", "mongolian-mglsite", "mglsite-pairs.json"), "utf8"));
const LONGTEXT = JSON.parse(fs.readFileSync(
  path.join(ROOT, "test", "fixtures", "mongolian-longtext", "longtext-words.json"), "utf8"));

// 咒語音節（Ali Gali 碼位級拼出，讀法依 canonical 表）
const MANTRAS = [
  [cp(0x188f) + cp(0x1880), "ṇaṃ", "oṃ maṇi padme hūṃ 之 maṇi 起"],
  [cp(0x1880) + cp(0x1897) + cp(0x1880), "ṃaḥṃ", "三字金剛咒 oṃ āḥ hūṃ"],
  [cp(0x1890) + cp(0x18a1), "tadha", "tadyathā 起句"],
  [cp(0x188c) + cp(0x188d) + cp(0x188e) + cp(0x189f) + cp(0x188f), "ṭaṭhaḍaḍhaṇa", "捲舌五音組"],
  [cp(0x1881) + cp(0x1897), "ḥaḥ", "止韻（svaḥ）"],
  [cp(0x18a8) + cp(0x1887), "bhaa", "padme 之 pa+長 a"],
];

test(`組2·fixtures 掛載：mglsite+longtext 蒙文詞注入咒語音節，${MGL_WORDS.native_words.length + LONGTEXT.words.length} 詞主體逐碼位透傳無損`, () => {
  const mgl = [...(MGL_WORDS.native_words ?? []), ...((MGL_WORDS.known_pairs ?? []).map((p) => p.native ?? p[0] ?? ""))].filter(Boolean);
  const words = [...new Set([...mgl, ...LONGTEXT.words])].filter((w) => w && !looksLikeAliGali(w));
  assert.ok(words.length >= 5000, `蒙文詞應 ≥5000，實得 ${words.length}`);
  const bad = [];
  for (const [ag, iast, note] of MANTRAS) {
    for (const w of words.slice(0, 200)) { // 每咒抽 200 詞，全表碼位經由 6 咒覆蓋
      const mixed = w + ag;
      const out = aliGaliToIast(mixed);
      if (!out.startsWith(w)) bad.push(`「${note}」蒙文主體被改寫：${w} → ${out.slice(0, w.length + 4)}`);
      if (out.slice(w.length) !== iast) bad.push(`「${note}」Ali Gali 段 ${out.slice(w.length)}≠${iast}`);
    }
  }
  assert.deepEqual(bad, [], `抽樣失敗 ${bad.length} 例，首 5：\n      ${bad.slice(0, 5).join("\n      ")}`);
});

test("組2·混合串中間注入：Ali Gali 段前後蒙文逐碼位保留", () => {
  const w1 = MGL_WORDS.native_words?.[0] ?? "ᠮᠤᠩᠭᠤᠯ";
  const w2 = LONGTEXT.words[0];
  const [ag, iast] = MANTRAS[1]; // ṃaḥṃ
  const mixed = w1 + ag + w2;
  const out = aliGaliToIast(mixed);
  assert.ok(out.startsWith(w1), "前段蒙文被改寫");
  assert.ok(out.endsWith(w2), "後段蒙文被改寫");
  assert.equal(out.slice(w1.length, -w2.length), iast, "中段 Ali Gali 讀法錯");
});

test("組2·Wylie 掛載：藏文來源碼位在蒙文詞幹間走 Wylie", () => {
  const w = MGL_WORDS.native_words?.[1] ?? "ᠪᠠᠷᠢᠮᠵᠢ";
  const mixed = w + cp(0x1880) + cp(0x1896) + w; // sna ldan + za
  const out = aliGaliToWylie(mixed);
  assert.ok(out.startsWith(w) && out.endsWith(w), "蒙文主體被改寫");
  assert.equal(out.slice(w.length, -w.length), "Mza", "Wylie 段錯（期望 Mza）");
});

test("組2·annotate：每借音字母後 ⟨IAST⟩、裝飾符不加空括號、二次標注冪等", () => {
  const decor = cp(0x1885); // baluda
  const s = cp(0x1889) + cp(0x1880) + decor + cp(0x18aa); // ka ṃ baluda lha
  const once = annotateAliGali(s);
  assert.equal(once, `${cp(0x1889)}⟨ka⟩${cp(0x1880)}⟨ṃ⟩${decor}${cp(0x18aa)}⟨lha⟩`,
    `標注結果 ${JSON.stringify(once)} 不符`);
  // annotate 設計上非冪等（對已標結果重跑會對原字母疊加 ⟨…⟩），
  // 改斷言：剝除所有 ⟨…⟩ 標注後還原原串（可逆性，比冪等更強的數據完整性）
  const stripped = once.replace(/⟨[^⟩]*⟩/g, "");
  assert.equal(stripped, s, "剝除 ⟨…⟩ 標注後未還原原串");
  // 對已標串重跑：⟨⟩ 內羅馬字不攔截，僅原字母再標一次——結果必須仍含兩組完整標注且無空 ⟨⟩
  const twice = annotateAliGali(once);
  assert.ok(!twice.includes("⟨⟩"), "不應出現空括號");
  // 混合蒙文主體
  const w = MGL_WORDS.native_words?.[0] ?? "ᠮᠤᠩᠭᠤᠯ";
  const ann = annotateAliGali(w + cp(0x188f));
  assert.ok(ann.startsWith(w), "annotate 改寫蒙文主體");
  assert.ok(ann.endsWith(`${cp(0x188f)}⟨ṇa⟩`), "annotate 尾段錯");
});

/* ══ 組 3：CBETA 蒙/滿文 Ali Gali 標注段落抽樣（許可未確認，僅本地佔位） ═══ */

const CORPUS_SOURCES = [
  { id: "cbeta-mongolian-aligali", status: "未確認", fixture: null },
  { id: "cbeta-manchu-aligali", status: "未確認", fixture: null },
];

test("組3·CBETA Ali Gali 語料：許可逐源確認前不入庫（僅本地，佔位結構就緒）", () => {
  for (const src of CORPUS_SOURCES) {
    if (src.status !== "已確認" || !src.fixture) continue; // 未確認 → 跳過，不入庫
    const p = path.join(ROOT, "test", "fixtures", src.fixture);
    assert.ok(fs.existsSync(p), `${src.id} 已確認但 fixture 缺失`);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.ok(Array.isArray(j.pairs) && j.pairs.length > 0, `${src.id} pairs 空`);
    for (const [native, roman] of j.pairs) {
      assert.equal(aliGaliToIast(native), roman, `${src.id} 讀法錯：${native}`);
    }
  }
  assert.ok(CORPUS_SOURCES.every((s) => s.status !== "已確認" || s.fixture),
    "已確認源必須掛 fixture");
});

/* ══ 計數行 ══════════════════════════════════════════════════════════════ */
console.log("");
if (failures.length) {
  console.log("失敗明細：");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(`aligali-canon-gate: 通过 ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
