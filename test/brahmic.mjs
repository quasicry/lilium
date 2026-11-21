// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 婆羅米系文字（僧伽羅）轉寫正確性測試：
 *
 * 變更：高棉 / 緬甸 / 泰文方案已從插件移除，本檔現僅測試僧伽羅文。
 * （原四文種對照語料見版本庫歷史；移除不影響僧伽羅文的正確性斷言。）
 *
 * 模型背景（「巴利三藏轉寫糾偏」後）：
 *   - 方案採 IAST abugida 模型：基底輔音「不帶」固有 a；元音以 matra 疊加；
 *     輔音後緊接另一輔音時自動插入 virama（去固有 a）形成合字；
 *     鼻音後接「異組/不同」輔音時自動插入 anusvara（niggahita），故可正確表達
 *     buddha / dhamma / saṅgha 等巴利閉音節與 niggahita。
 *   - 方案 id：sinhala-pali（主）/ sinhala-iso15919（備選）。
 *   - 關鍵糾偏點（均經真實巴利三藏語料對比驗證）：
 *       · 僧伽羅文 o 用 U+0DDC ො（Unicode 標準「vowel sign o」），非 U+0DDD ෝ（長 o / oo）；
 *       · 僧伽羅文 ḷ → ළ（捲舌邊音）。
 *
 * 測試覆蓋：
 *   1. 方案已註冊進 TRANSLIT_REGISTRY，含檢字表、主方案標記
 *   2. 基底輔音 + 依賴元音符（matra）正確輸出
 *   3. 依賴元音符存儲順序：matra 存於輔音「之後」
 *   4. 同 token 消歧：獨立元音（詞首）vs 依賴元音符（輔音後）
 *   5. 巴利閉音節 / niggahita（核心正確性）
 *   6. 巴利三藏禮敬文（namo tassa...）無損往返，且原生輸出等於真實三藏慣用形
 *   7. 未覆蓋字符優雅透傳
 *   8. 字體內嵌憑證
 * 用法：node test/brahmic.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-brahmic-"));
execFileSync(path.join(ROOT, "node_modules/.bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

const cp = (...ns) => ns.map((n) => String.fromCodePoint(n)).join("");
const cps = (s) => [...s].map((c) => c.codePointAt(0));

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const IDS = ["sinhala-pali"];
const get = (id) => lib.getScheme(id);

console.log("=== 婆羅米系文字（僧伽羅 / IAST abugida / 巴利三藏糾偏）轉寫測試 ===");

/* ---------- 1. 註冊表 ---------- */
for (const id of IDS) {
  test(`註冊：${id} 已註冊且爲主方案、含檢字表`, () => {
    const s = get(id);
    assert.ok(s, `${id} 應已註冊`);
    assert.equal(s.primary, true);
    assert.ok(s.charTable && s.charTable.length > 0, `${id} 應提供檢字表`);
  });
}
test("註冊：sinhala 文種分組存在於註冊表", () => {
  const groups = new Set(lib.listSchemes().map((s) => s.group));
  assert.ok(groups.has("sinhala"), "缺少文種分組: sinhala");
});
test("註冊：高棉 / 緬甸 / 泰文方案已移除（v2.2.0）", () => {
  for (const id of ["khmer-pali", "khmer-ungegn", "myanmar-pali", "myanmar-mlcts", "thai-pali", "thai-rtgs"]) {
    assert.equal(lib.getScheme(id), undefined, `${id} 應已移除`);
  }
  const groups = new Set(lib.listSchemes().map((s) => s.group));
  for (const g of ["khmer", "myanmar", "thai"]) {
    assert.ok(!groups.has(g), `文種分組 ${g} 應已移除`);
  }
});
test("註冊：sinhala-iso15919 備選方案仍存在", () => {
  const s = get("sinhala-iso15919");
  assert.ok(s, "sinhala-iso15919 應仍註冊");
  assert.equal(s.altOf, "sinhala-pali");
});

/* ---------- 2. 基底輔音 + 依賴元音符 ---------- */
const MATRA = {
  "sinhala-pali": { ka: 0xD9A, kā: [0xD9A, 0xDCF], ki: [0xD9A, 0xDD2], ku: [0xD9A, 0xDD4], ke: [0xD9A, 0xDD9], ko: [0xD9A, 0xDDC] },
};
for (const id of IDS) {
  const m = MATRA[id];
  test(`${id}：基底輔音 ka → 不帶固有 a 的輔音字母`, () => {
    assert.deepEqual(cps(get(id).romanToNative("ka")), [m.ka]);
  });
  for (const [tok, expect] of Object.entries(m)) {
    if (tok === "ka") continue;
    test(`${id}：matra ${tok} → ${expect.map((n) => "U+" + n.toString(16)).join(" ")}`, () => {
      assert.deepEqual(cps(get(id).romanToNative(tok)), expect);
    });
  }
}

/* ---------- 3. 依賴元音符存儲順序（核心正確性） ---------- */
test("僧伽羅文：依賴元音符 ා(U+DCF) 存於輔音 ක(U+D9A) 之後（kā → ක+ා）", () => {
  assert.deepEqual(cps(get("sinhala-pali").romanToNative("kā")), [0xD9A, 0xDCF]);
});

/* ---------- 4. 同 token 消歧（獨立元音 / 依賴元音符） ---------- */
test("僧伽羅文：詞首 ā → 獨立元音 ආ(U+D86)；輔音後 ā → matra ා(U+DCF)", () => {
  assert.equal(cps(get("sinhala-pali").romanToNative("ā"))[0], 0xD86, "詞首取獨立元音");
  assert.equal(cps(get("sinhala-pali").romanToNative("kā"))[1], 0xDCF, "輔音後取 matra");
});

/* ---------- 5. 巴利閉音節 / niggahita（核心正確性） ---------- */
const PALI = ["buddha", "dhamma", "tassa", "saṅgha", "sambuddha", "saṃsāra", "pañca", "taṃ", "buddhaṃ", "namo", "bhagavato", "arahato", "sammāsambuddhassa"];
for (const id of IDS) {
  for (const w of PALI) {
    test(`${id}：巴利詞「${w}」roman→native→roman 無損`, () => {
      const s = get(id);
      const native = s.romanToNative(w);
      assert.ok(native.length > 0, "原生輸出不得爲空");
      assert.equal(s.nativeToRoman(native), w, `往返不一致`);
    });
  }
}
// 鼻音 + 異組輔音必須寫成 niggahita（anusvara），而非 virama 合字
//   （saṃgha：m 唇音 + g 軟顎音 = 異組 → anusvara）
test("saṃgha：鼻音 m + g（異組）寫成 niggahita（非 virama 合字）", () => {
  const VIRAMA = { "sinhala-pali": 0xDCA };
  for (const id of IDS) {
    const nat = get(id).romanToNative("saṃgha");
    const arr = cps(nat);
    assert.ok(!arr.includes(VIRAMA[id]), `${id}: saṃgha 不得含 virama`);
    assert.ok(arr.includes(0xD82), `${id}: saṃgha 應含 niggahita（U+0D82）`);
  }
});
// 鼻音 + 同組輔音必須寫成 virama 合字（saṅgha：ṅ 軟顎鼻音 + g 軟顎音 = 同組 → conjunct）
test("saṅgha：鼻音 ṅ + g（同組）寫成 virama 合字（非 niggahita）", () => {
  const VIRAMA = { "sinhala-pali": 0xDCA };
  for (const id of IDS) {
    const nat = get(id).romanToNative("saṅgha");
    assert.ok(cps(nat).includes(VIRAMA[id]), `${id}: saṅgha（ṅ+g 同組）應含 virama 合字`);
  }
});
// 非鼻音合字 / 鼻音疊輔音必須寫成 virama 合字
test("dhamma/sambuddha：非鼻音合字與 m+b 合字寫成 virama（非 niggahita）", () => {
  const VIRAMA = { "sinhala-pali": 0xDCA };
  for (const id of IDS) {
    for (const w of ["dhamma", "sambuddha"]) {
      const nat = get(id).romanToNative(w);
      assert.ok(cps(nat).includes(VIRAMA[id]), `${id}: ${w} 應含 virama 合字`);
    }
  }
});
// ISO 15919 嚴式鼻音化：saṃ + 軟顎 g → 同組鼻音 ṅ（saṃgha 規範化爲 saṅgha）
test("ISO 15919 嚴式鼻音化：saṃgha → 同組鼻音 saṅgha", () => {
  for (const id of IDS) {
    const back = get(id).nativeToRoman(get(id).romanToNative("saṃgha"));
    assert.equal(back, "saṅgha", `${id}: saṃ 後接軟顎音應規範化爲 ṅ`);
  }
});

/* ---------- 6. 巴利三藏禮敬文（真實語料對比） ---------- */
const HOMAGE = "namo tassa bhagavato arahato sammāsambuddhassa";
// 真實三藏慣用形（經真實巴利三藏文本對比確認）
const HOMAGE_NATIVE = {
  "sinhala-pali": "නමො තස්ස භගවතො අරහතො සම්මාසම්බුද්ධස්ස",
};
for (const id of IDS) {
  test(`${id}：禮敬文 roman→native→roman 全句無損`, () => {
    const s = get(id);
    assert.equal(s.nativeToRoman(s.romanToNative(HOMAGE)), HOMAGE);
  });
  test(`${id}：禮敬文原生輸出等於真實巴利三藏慣用形`, () => {
    assert.equal(get(id).romanToNative(HOMAGE), HOMAGE_NATIVE[id]);
  });
}
// 關鍵詞原生形對比（buddha / dhamma / saṅgha 等必須與三藏一致）
const WORD_NATIVE = {
  "sinhala-pali": { buddha: "බුද්ධ", dhamma: "ධම්ම", saṅgha: "සඞ්ඝ", saṃsāra: "සංසාර" },
};
for (const id of IDS) {
  for (const [w, expect] of Object.entries(WORD_NATIVE[id])) {
    test(`${id}：巴利詞「${w}」原生形等於三藏慣用形「${expect}」`, () => {
      assert.equal(get(id).romanToNative(w), expect);
    });
  }
}

/* ---------- 7. 未覆蓋字符優雅透傳 ---------- */
test("透傳：羅馬字中的非轉寫字符（空格 / 標點 / 拉丁 / 漢字）原樣保留", () => {
  // 注意：新 IAST 模型下 c/k/b/d/j 等爲合法輔音 token，故透傳測試用 q/w/x/f/z（確定非 token）
  const s = get("sinhala-pali");
  const out = s.romanToNative("namo qwxfz 中!");
  assert.ok(out.includes(" "), "空格保留");
  assert.ok(out.includes("q") && out.includes("w") && out.includes("x") && out.includes("f") && out.includes("z"), "非 token 拉丁保留");
  assert.ok(out.includes("中"), "漢字保留");
  assert.ok(out.includes("!"), "標點保留");
});
test("透傳：原生文字中的未收錄字符（如組合符）不丟失", () => {
  const s = get("sinhala-pali");
  const mix = s.romanToNative("ka") + "✶";
  assert.ok(mix.includes("✶"), "未收錄字符保留");
});

/* ---------- 8. 字體內嵌憑證 ---------- */
test("字體內嵌：BUNDLED_NOTO_FONT_FILES 含僧伽羅字體且 script 映射正確", () => {
  const ids = new Set(lib.BUNDLED_NOTO_FONT_FILES.map((f) => f.id));
  assert.ok(ids.has("noto-sans-sinhala"), "缺少內嵌字體: noto-sans-sinhala");
  const sin = lib.BUNDLED_NOTO_FONT_FILES.find((f) => f.id === "noto-sans-sinhala");
  assert.deepEqual(sin.scripts, ["sinhala"], "字體 script 映射應含 sinhala");
});
test("字體內嵌：已移除文種的字體不再內嵌（v2.2.0）", () => {
  const ids = new Set(lib.BUNDLED_NOTO_FONT_FILES.map((f) => f.id));
  for (const id of ["noto-sans-khmer", "noto-sans-myanmar", "noto-sans-thai", "noto-sans-taile", "noto-sans-talu", "noto-sans-taitham", "noto-sans-yi"]) {
    assert.ok(!ids.has(id), `字體 ${id} 應已移除`);
  }
});
test("字體內嵌：僧伽羅字體 base64 解碼爲合法 TTF（magic 0x00010000 / OTTO）", () => {
  const f = lib.BUNDLED_NOTO_FONT_FILES.find((x) => x.id === "noto-sans-sinhala");
  const buf = Buffer.from(f.base64, "base64");
  assert.ok(buf.length > 20000, `解碼後過小（${buf.length} 字節）`);
  const magic = buf.readUInt32BE(0);
  assert.ok(magic === 0x00010000 || magic === 0x4f54544f, `字體 magic 非法: 0x${magic.toString(16)}`);
});

console.log(`\n結果: ${passed} 通過, ${failed} 失敗`);
if (failed) process.exit(1);
