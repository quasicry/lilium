// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 佉盧虱吒文（Kharoshthi）轉寫方案測試。
 *
 * 驗證：
 *  - gandhari-iast 已註冊（group=kharoshthi、primary、charTable 有表）；
 *  - 羅馬字 ⇄ 佉盧文 無損往返（犍陀羅語詞例：dhrama / karma / budha /
 *    ṣa + cauda、組合字母 kka/vha、數字 10/20）；
 *  - 貪婪最長鍵匹配：ttta 優先於 t+tta、kka 優先於 k·ka；
 *  - looksLikeNative / looksLikeRoman 方向判定；
 *  - ScriptId kharoshthi 的文種判定（單字元即判定）與 languages.ts 接線。
 *
 * 用法：node test/kharoshthi.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-kharo-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const {
  listSchemes,
  getScheme,
  kharoRomanToNative,
  kharoNativeToRoman,
  looksLikeKharoshthi,
  looksLikeKharoRoman,
  detectScript,
  SCRIPT_PREFERRED_SCHEME,
  SCHEME_GROUP_SCRIPT,
  BUNDLED_NOTO_FONT_FILES,
} = lib;

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const cp = (n) => String.fromCodePoint(n);
// 佉盧碼位速記
const K = {
  dha: 0x10a22, r: 0x10a2a, ma: 0x10a28, ka: 0x10a10, ra: 0x10a2a,
  i: 0x10a01, bu: 0x10a26, u: 0x10a02, dha2: 0x10a22,
  sa: 0x10a2f, cauda: 0x10a39, kka: 0x10a32, vha: 0x10a35,
  ten: 0x10a44, twenty: 0x10a45, ta: 0x10a1f, tta: 0x10a34,
  ha: 0x10a31, a: 0x10a00,
};

test("gandhari-iast 已註冊（group=kharoshthi）", () => {
  const s = getScheme("gandhari-iast");
  assert.ok(s, "gandhari-iast 應已註冊");
  assert.strictEqual(s.group, "kharoshthi");
  assert.strictEqual(s.primary, true);
  assert.ok(s.charTable && s.charTable.length >= 60, "檢字表應 ≥ 60 條");
  assert.ok(listSchemes().some((x) => x.group === "kharoshthi"));
});

test("基本輔音+元音往返：budha（真實字典詞，固有元音 a 省略）", () => {
  const native = kharoRomanToNative("budha");
  // bu·dh：輔音後的 'a' 為固有元音，不寫出（詞典 965 條語料實證：budha→𐨦𐨂𐨢）
  assert.strictEqual(native, cp(K.bu) + cp(K.u) + cp(K.dha2));
  const round = kharoRomanToNative(kharoNativeToRoman(native));
  assert.strictEqual(round, native, "反向後正向應收斂到同一寫本形");
  // 詞典正字法：輔音簇補 virama（agra→𐨀𐨒𐨿𐨪，語料實證）
  assert.strictEqual(kharoRomanToNative("agra"), cp(K.a) + cp(0x10a12) + cp(0x10a3f) + cp(K.ra));
  // 詞首非 a 元音 → 𐨀+附標（詞典 71 例無例外：eśa→𐨀𐨅𐨭）
  assert.strictEqual(kharoRomanToNative("eśa"), cp(0x10a00) + cp(0x10a05) + cp(0x10a2d));
  // 專名詞首大寫歸一（Ati→𐨀𐨟𐨁，語料實證）
  assert.strictEqual(kharoRomanToNative("Ati"), cp(0x10a00) + cp(0x10a1f) + cp(0x10a01));
});

test("karma 往返（含元音附標 i）", () => {
  const native = kharoRomanToNative("karma");
  // v2.9.14 詞典正字法：ka-r-ma（r 無元音）→ 輔音簇補 virama
  assert.strictEqual(native, cp(K.ka) + cp(K.r) + cp(0x10a3f) + cp(K.ma));
  assert.strictEqual(kharoNativeToRoman(native), "karma"); // virama 消費，不回填固有 a
  const ni = kharoRomanToNative("ki");
  assert.strictEqual(ni, cp(K.ka) + cp(K.i));
  assert.strictEqual(kharoNativeToRoman(ni), "ki"); // 有附標不回填
});

test("貪婪最長鍵：ttta / kka / vha 組合字母不拆散", () => {
  // 組合字母自身含固有 a：ttta → 單字母 U+10A34（尾部 a 被固有元音消費）
  assert.strictEqual(kharoRomanToNative("ttta"), cp(K.tta));
  assert.strictEqual(kharoRomanToNative("kka"), cp(K.kka));
  assert.strictEqual(kharoRomanToNative("vha"), cp(K.vha));
  // 反向：裸組合字母回填固有 a（讀法 ttta/kka/vha）
  assert.strictEqual(kharoNativeToRoman(cp(K.tta)), "ttta");
  assert.strictEqual(kharoNativeToRoman(cp(K.kka)), "kka");
  assert.strictEqual(kharoNativeToRoman(cp(K.vha)), "vha");
});

test("捲舌標 cauda 與數字", () => {
  assert.strictEqual(kharoRomanToNative("⟒"), cp(K.cauda));
  assert.strictEqual(kharoRomanToNative("10"), cp(K.ten));
  assert.strictEqual(kharoRomanToNative("20"), cp(K.twenty));
  assert.strictEqual(kharoNativeToRoman(cp(K.ten) + cp(K.twenty)), "1020");
});

test("未命中字符原樣保留（含 ASCII 與漢字）", () => {
  assert.strictEqual(kharoRomanToNative("x永1"), "x永" + cp(0x10a40));
  assert.strictEqual(kharoNativeToRoman("永"), "永");
});

test("詞首獨立元音與長音鍵", () => {
  // 詞首 a → 獨立元音字母 U+10A00
  assert.strictEqual(kharoRomanToNative("a"), cp(0x10a00));
  // 非輔音後的 a 亦為獨立字母（「.a」：dot 後跟 a）
  assert.strictEqual(kharoRomanToNative(".a"), cp(0x10a50) + cp(0x10a00));
  // 長音：i + ː → 元音符號 + LENGTH MARK
  assert.strictEqual(kharoRomanToNative("kiː"), cp(K.ka) + cp(K.i) + cp(0x10a0c));
});

test("全集審計新增鍵：vh / lý / ai·au 二合 / ̱ CAUDA / ï·ü 詞中反向", () => {
  const { kharoRomanToNative: R2N, kharoNativeToRoman: N2R } = lib;
  // vh→VHA（60/60 雙射）且反向取詞典拼寫 vh
  assert.equal(R2N("vha"), "\u{10a35}");
  assert.equal(N2R("\u{10a35}"), "vha"); // 裸 𐨵 = vh + 固有 a 回填
  assert.equal(R2N(N2R(R2N("vha"))), R2N("vha"));
  // lý 連寫：LA+ZWJ+VIRAMA+YA；後接 y 補 virama、後接輔音不補
  assert.equal(R2N("lýka"), "\u{10a2b}\u{200d}\u{10a3f}\u{10a29}\u{10a10}");
  assert.equal(R2N("Lýyaṣe"), "\u{10a2b}\u{200d}\u{10a3f}\u{10a29}\u{10a3f}\u{10a29}\u{10a2e}\u{10a05}");
  assert.equal(N2R(R2N("lýka")), "lýka");
  // ai/au 二合（輔音後）：E/O-sign+LENGTH；反向 LENGTH 前看（Itakkai 實證）
  assert.equal(R2N("kkai").endsWith("\u{10a05}\u{10a0c}"), true);
  assert.equal(R2N("lau").endsWith("\u{10a06}\u{10a0c}"), true);
  // 二合反向需有詞幹（LENGTH 前看基於前一輸出字元 e/o）
  assert.equal(N2R("\u{10a10}\u{10a05}\u{10a0c}"), "kai");
  assert.equal(N2R("\u{10a10}\u{10a06}\u{10a0c}"), "kau");
  // ̱ → CAUDA 且吞後隨 a（Las̱a 實證）
  assert.equal(R2N("Las̱a"), "\u{10a2b}\u{10a2f}\u{10a39}");
  // 詞中獨立 A+I/U-sign 反向還原 ï/ü
  assert.equal(N2R(R2N("paṭaïna")), "paṭaïna");
  assert.equal(N2R(R2N("mugaüṭa")), "mugaüṭa");
});

test("looksLikeNative / looksLikeRoman 方向判定", () => {
  assert.ok(looksLikeKharoshthi(cp(0x10a10)));
  assert.ok(!looksLikeKharoshthi("karma"));
  assert.ok(!looksLikeKharoshthi(cp(0x11580))); // 悉曇不算
  assert.ok(looksLikeKharoRoman("dhrama"));
  assert.ok(!looksLikeKharoRoman(cp(0x10a10)));
});

test("文種判定：純佉盧單字元即判 kharoshthi（碼位獨特，漢字混排亦不翻盤）", () => {
  assert.strictEqual(detectScript(cp(0x10a10)), "kharoshthi");
  // 佉盧碼位獨特（U+10A00–U+10A5F，與 CJK 不重疊），單字元即判佉盧——
  // 舊行為「CJK 優先」會讓含漢字的犍陀羅筆記被判 han，落入 OS_PROVIDED_SCRIPTS
  // 而不注入 --li-font，佉盧字掉進 CJK 系統字體＝豆腐塊。凡含佉盧字即佉盧筆記。
  assert.strictEqual(detectScript("正文 " + cp(0x10a22) + cp(0x10a2a)), "kharoshthi");
  assert.strictEqual(detectScript(cp(0x10a22) + cp(0x10a2a) + " ka"), "kharoshthi");
});

test("接線：SCRIPT_PREFERRED_SCHEME / SCHEME_GROUP_SCRIPT / 內嵌字體", () => {
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.kharoshthi, "gandhari-iast");
  assert.strictEqual(SCHEME_GROUP_SCRIPT.kharoshthi, "kharoshthi");
  const bundled = BUNDLED_NOTO_FONT_FILES.find((f) => f.id === "noto-sans-kharoshthi");
  assert.ok(bundled, "Noto Sans Kharoshthi 應內嵌");
  assert.ok(bundled.scripts.includes("kharoshthi"));
  assert.ok(bundled.base64.length > 40_000, "字體 base64 非空");
});

console.log(`\n結果: ${passed} 通過, ${failed} 失敗`);
process.exit(failed ? 1 : 0);
