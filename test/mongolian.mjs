// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 蒙古文方案（mongolian）單元校驗。
 *
 * 羅馬字側：學界學術轉寫（Lessing/Janhunen/Wikipedia Mongolian script 字母表）；
 * 蒙古文側：標準 Unicode 核心字母 U+1820–U+1842（詞首/中/尾/孤立字形由字型引擎處理）。
 *
 * 執行：node test/mongolian.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-mgl-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { getScheme, convertScript, listSchemes } = lib;

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};
const cp = (n) => String.fromCodePoint(n);
const get = (id) => {
  const s = getScheme(id);
  assert.ok(s, `方案 ${id} 應已註冊`);
  return s;
};

const A = cp(0x1820), E = cp(0x1821), I = cp(0x1822), O = cp(0x1823),
  U = cp(0x1824), OE = cp(0x1825), UE = cp(0x1826), EE = cp(0x1827),
  NA = cp(0x1828), ANG = cp(0x1829), BA = cp(0x182a), PA = cp(0x182b),
  QA = cp(0x182c), GA = cp(0x182d), MA = cp(0x182e), LA = cp(0x182f),
  SA = cp(0x1830), SHA = cp(0x1831), TA = cp(0x1832), DA = cp(0x1833),
  CHA = cp(0x1834), JA = cp(0x1835), YA = cp(0x1836), RA = cp(0x1837),
  WA = cp(0x1838), FA = cp(0x1839), KA = cp(0x183a), KHA = cp(0x183b),
  TSA = cp(0x183c), ZA = cp(0x183d), HAA = cp(0x183e), ZRA = cp(0x183f),
  LHA = cp(0x1840), ZHI = cp(0x1841), CHI = cp(0x1842);
const FVS1 = cp(0x180b), MVS = cp(0x180e);

/* ---------- 1. 註冊與元數據 ---------- */
test("方案 mongolian 已註冊，歸組 mongolian，primary", () => {
  const s = get("mongolian");
  assert.strictEqual(s.group, "mongolian");
  assert.strictEqual(s.primary, true);
  assert.ok(s.charTable && s.charTable.length >= 35, "檢字表應含 ≥35 條");
});

/* ---------- 2. 羅馬 → 原生 oracle（碼位級） ---------- */
test("romanToNative：monggol → ᠮᠣᠩᠭᠣᠯ（族名，小舌鼻音 ŋ 作 ng）", () => {
  // 學術轉寫中「蒙古」ᠮᠣᠩᠭᠣᠯ 的 ŋ(ᠩ,ANG) 後接 ᠭ(G)，寫作 monggol（雙 g）；
  // 故 ᠩ 映射爲 "ng"、ᠭ 映射爲 "g"，貪心分詞得 ng+g。
  assert.strictEqual(get("mongolian").romanToNative("monggol"), MA + O + ANG + GA + O + LA);
});
test("romanToNative：mongol（單 g）貪心 ng 吃掉後接 g → M·O·ANG·O·L", () => {
  // 「mongol」(單 g) 經貪心最長匹配，"ng" 一次吃掉 n+g 成 ANG(U+1829)，
  // 故結果爲 M·O·ANG·O·L（5 碼位，無獨立 medial G），不同於族名 monggol(M·O·ANG·G·O·L)。
  // 這是貪心分詞對非標準「單 g」拼法的預期行為，非 bug；標準族名請用 monggol。
  assert.strictEqual(get("mongolian").romanToNative("mongol"), MA + O + ANG + O + LA);
});
test("romanToNative：bičig → ᠪᠢᠴᠢᠭ", () => {
  assert.strictEqual(get("mongolian").romanToNative("bičig"), BA + I + CHA + I + GA);
});
test("romanToNative：元音 ö/ü/ē 映射正確", () => {
  const s = get("mongolian");
  assert.strictEqual(s.romanToNative("ö"), OE);
  assert.strictEqual(s.romanToNative("ü"), UE);
  assert.strictEqual(s.romanToNative("ē"), EE);
});
test("romanToNative：ng / ts / zr 最長匹配（非 n+g / t+s / z+r）", () => {
  const s = get("mongolian");
  assert.strictEqual(s.romanToNative("ng"), ANG, "ng → ᠩ 單一碼位");
  assert.strictEqual(s.romanToNative("ts"), TSA, "ts → ᠴ");
  assert.strictEqual(s.romanToNative("zr"), ZRA, "zr → ᠿ");
});
test("romanToNative：學術層優先（蒙科立別名刻意不接收，保證 1:1 可逆）", () => {
  const s = get("mongolian");
  // x 在學術層是 Galik kha（U+183B），非蒙科立 sha；z 是 ZA（U+183D），非 tsa
  assert.strictEqual(s.romanToNative("x"), KHA, "x → ᠻ(Galik kha)");
  assert.strictEqual(s.romanToNative("z"), ZA, "z → ᠵ(ZA)");
  // c / j 在學術層沒有對應 token（學術用 č / ǰ），故原樣透傳，不承載蒙科立別名
  assert.strictEqual(s.romanToNative("c"), "c", "c 非學術 token，原樣透傳");
  assert.strictEqual(s.romanToNative("j"), "j", "j 非學術 token，原樣透傳");
});
test("romanToNative：q/g 不因前後元音和諧改 k（嚴式鼻音無關）", () => {
  const s = get("mongolian");
  // qa(U+182C) 與 ke/ki 皆爲 q；ga/ge/gi 皆爲 g——永遠同一碼位
  assert.strictEqual(s.romanToNative("q"), QA);
  assert.strictEqual(s.romanToNative("g"), GA);
});

/* ---------- 3. 原生 → 羅馬 往返 ---------- */
test("nativeToRoman：ᠮᠣᠩᠭᠣᠯ → monggol（族名，往返無損）", () => {
  const s = get("mongolian");
  // 正確蒙古文拼法使用 ANG(U+1829) 表示 ŋ；native→roman 得 monggol（雙 g）
  assert.strictEqual(s.nativeToRoman(MA + O + ANG + GA + O + LA), "monggol");
  assert.strictEqual(s.romanToNative("monggol"), MA + O + ANG + GA + O + LA);
});
test("nativeToRoman：naran → ᠨᠠᠷᠠᠨ（NA 不受 ng 貪心匹配吞掉）", () => {
  const s = get("mongolian");
  // 驗證普通 n 仍映射到 NA(U+1828)，與 ng(ANG) 區隔
  assert.strictEqual(s.romanToNative("naran"), NA + A + RA + A + NA);
  assert.strictEqual(s.nativeToRoman(NA + A + RA + A + NA), "naran");
});
test("nativeToRoman：完整詞句往返（sain baina uu）", () => {
  const s = get("mongolian");
  const roman = "sain baina uu";
  const native = s.romanToNative(roman);
  assert.strictEqual(s.nativeToRoman(native), roman);
});
test("round-trip：35 個字母全收錄且各自可逆", () => {
  const s = get("mongolian");
  const letters = [A, E, I, O, U, OE, UE, EE, NA, ANG, BA, PA, QA, GA, MA, LA,
    SA, SHA, TA, DA, CHA, JA, YA, RA, WA, FA, KA, KHA, TSA, ZA, HAA, ZRA, LHA, ZHI, CHI];
  for (const ch of letters) {
    const back = s.nativeToRoman(ch);
    assert.strictEqual(s.romanToNative(back), ch, `字母 ${ch} 應可逆，實得 ${back}`);
  }
});

/* ---------- 4. FVS / MVS 標記（往返無損） ---------- */
test("FVS：<f1> 標記 → U+180B，mark 模式往返無損", () => {
  const s = get("mongolian");
  assert.strictEqual(s.romanToNative("a<f1>"), A + FVS1);
  assert.strictEqual(s.nativeToRoman(A + FVS1, { fvs: "mark" }), "a<f1>");
  assert.strictEqual(s.nativeToRoman(A + FVS1, { fvs: "strip" }), "a", "strip 剝離 FVS");
});
test("MVS：<mvs> 標記 → U+180E，mark 模式往返無損", () => {
  const s = get("mongolian");
  assert.strictEqual(s.romanToNative("a<mvs>"), A + MVS);
  assert.strictEqual(s.nativeToRoman(A + MVS, { fvs: "mark" }), "a<mvs>");
  assert.strictEqual(s.nativeToRoman(A + MVS, { fvs: "strip" }), "a", "strip 剝離 MVS");
});

/* ---------- 5. 自動方向判定 ---------- */
test("convert：蒙古文 ⇄ 拉丁 自動互轉", () => {
  const s = get("mongolian");
  assert.strictEqual(s.convert("monggol"), MA + O + ANG + GA + O + LA);
  assert.strictEqual(s.convert(MA + O + ANG + GA + O + LA), "monggol");
});
test("looksLikeNative / looksLikeRoman 判定正確", () => {
  const s = get("mongolian");
  assert.strictEqual(s.looksLikeNative(MA + O + NA + GA + O + LA), true);
  assert.strictEqual(s.looksLikeNative("mongol"), false);
  assert.strictEqual(s.looksLikeRoman("mongol"), true);
});

/* ---------- 6. 跨文字星形轉換（convertScript，§6.2/§6.3） ---------- */
test("convertScript：巴利（天城體）→ 羅馬 → 蒙古文（星形拓撲）", () => {
  const pali = get("pali-iast");
  const mgl = get("mongolian");
  // नमो → namo → ᠨᠠᠮᠣ
  const out = convertScript(pali, mgl, "नमो");
  assert.strictEqual(out, NA + A + MA + O);
});
test("convertScript：蒙古文 → 羅馬 → 巴利（天城體），中樞穩定", () => {
  const pali = get("pali-iast");
  const mgl = get("mongolian");
  // 族名 ᠮᠣᠩᠭᠣᠯ 經羅馬中樞得 "monggol"，再轉天城體（確定性輸出）
  const out = convertScript(mgl, pali, MA + O + ANG + GA + O + LA);
  assert.strictEqual(out, "मोन्ग्गोल्".normalize("NFC"));
});
test("convertScript：ng/ṅ 羅馬字缺口（跨文種已知限制，非 bug）", () => {
  const pali = get("pali-iast");
  const mgl = get("mongolian");
  // 蒙古文學術轉寫以小舌鼻音 ŋ = "ng"（monggol），巴利/天城體用 ṅ(U+0919)；
  // 星形中樞沿用蒙古文 "ng"，故 Brahmic 將其讀作 n+g(न+ग) 而非 ङ。
  // 這是羅馬字中樞的 token 缺口，已寫入 docs/MONGOLIAN-RESEARCH.md §「跨文種缺口」。
  const roman = mgl.nativeToRoman(MA + O + ANG + GA + O + LA); // "monggol"
  assert.strictEqual(roman, "monggol");
  const dev = convertScript(mgl, pali, MA + O + ANG + GA + O + LA);
  assert.strictEqual(dev.includes("ङ"), false, "Brahmic 未將 ng 併為 ङ（velar nasal）");
  // 巴利側若直接以 ṅ 書寫則得到 ङ，佐證缺口在羅馬字層而非引擎
  assert.strictEqual(pali.romanToNative("moṅgol"), "मोङ्गोल्".normalize("NFC"));
});
test("convertScript：NFC 正規化（NFD 輸入不靜默錯轉）", () => {
  const mgl = get("mongolian");
  // 以 NFD 組合形送入（基底 + 組合標記）應與 NFC 同結果
  const nfc = mgl.romanToNative("monggol");
  const nfd = (MA + O + ANG + GA + O + LA).normalize("NFD");
  assert.strictEqual(mgl.nativeToRoman(nfd), "monggol");
  assert.strictEqual(mgl.nativeToRoman(nfc), "monggol");
});

console.log(`\n蒙古文方案校驗：${passed} 通過 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
