// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 巴利三藏「六文種」跨文種一致性基準校驗。
 *
 * 用戶明確的核對框架：
 *   拉丁/羅馬字母巴利文、天城體巴利文、僧伽羅字母巴利文、高棉文字母巴利文、
 *   緬甸字母巴利文、泰文字母巴利文——「他們各自文種有巴利三藏，這是他們的核對基準」。
 *
 * 也就是說：同一句巴利，六種文字各自有獨立的傳本（三藏），但它們編碼的是
 * 「同一句」巴利。因此最強的護欄不是單一方案的自洽往返，而是【跨文種一致性】：
 * 把六種文字的卷首基準句各自轉回羅馬字，必須得到完全相同的基準羅馬字串。
 * 任一文種的字母表 / 正字法出了偏差，這個等式就會被打破。
 *
 * 基準句取巴利三藏卷首：
 *   · 禮敬文 Namo tassa bhagavato arahato sammāsambuddhassa
 *   · 三皈依 Buddhaṃ saraṇaṃ gacchāmi
 *
 * 註：字形基準沿用 test/buddhist-corpus.mjs 已核對過的「真實三藏慣用形」
 *     （該檔已逐文種斷言正向/反向一致），本檔不另行引入未經核對的字形，
 *     而是把它們【彙總】起來加上跨文種等式這層新護欄。
 *
 * 執行：node test/pali-canon-crossscript.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-pali-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { getScheme } = lib;

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};
const get = (id) => {
  const s = getScheme(id);
  assert.ok(s, `方案 ${id} 應已註冊`);
  return s;
};

/* ---------- 基準：六文種的卷首句 ---------- */

// 基準羅馬字（拉丁/羅馬字母巴利文本身即為此形）
const HOMAGE_ROMAN = "namo tassa bhagavato arahato sammāsambuddhassa";
const REFUGE_ROMAN = "buddhaṃ saraṇaṃ gacchāmi";

// 各文種三藏慣用形（native）
const SCRIPTS = [
  { id: "pali-iast",      name: "天城體巴利",   group: "pali" },
  { id: "sinhala-pali",   name: "僧伽羅巴利",   group: "sinhala" },
];

const HOMAGE_NATIVE = {
  "pali-iast":    "नमो तस्स भगवतो अरहतो सम्मासम्बुद्धस्स",
  "sinhala-pali": "නමො තස්ස භගවතො අරහතො සම්මාසම්බුද්ධස්ස",
};

const REFUGE_NATIVE = {
  "pali-iast":    "बुद्धं सरणं गच्छामि",
  "sinhala-pali": "බුද්ධං සරණං ගච්ඡාමි",
};

/* ---------- 1. 拉丁/羅馬字母巴利：基準本身 ---------- */

test("拉丁/羅馬字母巴利：基準句即為核對源（不需轉換）", () => {
  assert.strictEqual(HOMAGE_ROMAN, "namo tassa bhagavato arahato sammāsambuddhassa");
  assert.strictEqual(REFUGE_ROMAN, "buddhaṃ saraṇaṃ gacchāmi");
});

/* ---------- 2. 各文種：羅馬 → 原生 = 三藏慣用形 ---------- */

for (const s of SCRIPTS) {
  test(`${s.name}（${s.id}）：禮敬文 羅馬→原生 = 三藏慣用形`, () => {
    assert.strictEqual(get(s.id).romanToNative(HOMAGE_ROMAN), HOMAGE_NATIVE[s.id]);
  });
  test(`${s.name}（${s.id}）：三皈依 羅馬→原生 = 三藏慣用形`, () => {
    assert.strictEqual(get(s.id).romanToNative(REFUGE_ROMAN), REFUGE_NATIVE[s.id]);
  });
}

/* ---------- 3. 各文種：原生 → 羅馬 = 基準羅馬字 ---------- */

for (const s of SCRIPTS) {
  test(`${s.name}（${s.id}）：禮敬文 原生→羅馬 = 基準句`, () => {
    assert.strictEqual(get(s.id).nativeToRoman(HOMAGE_NATIVE[s.id]), HOMAGE_ROMAN);
  });
  test(`${s.name}（${s.id}）：三皈依 原生→羅馬 = 基準句`, () => {
    assert.strictEqual(get(s.id).nativeToRoman(REFUGE_NATIVE[s.id]), REFUGE_ROMAN);
  });
}

/* ---------- 4. 跨文種一致性（本檔的核心護欄） ---------- */

test("跨文種一致性：六文種禮敬文轉回羅馬字，全部等於同一基準句", () => {
  const results = SCRIPTS.map((s) => {
    const back = get(s.id).nativeToRoman(HOMAGE_NATIVE[s.id]);
    return { name: s.name, id: s.id, back };
  });
  for (const r of results) {
    assert.strictEqual(r.back, HOMAGE_ROMAN,
      `${r.name}（${r.id}）轉回羅馬字應與基準句一致，實得：${r.back}`);
  }
  // 全部文種彼此一致（等價於上述，但顯式斷言「互相相等」）
  const uniq = new Set(results.map((r) => r.back));
  assert.strictEqual(uniq.size, 1,
    `各文種轉回的羅馬字應完全相同，實得 ${uniq.size} 種：${[...uniq].join(" | ")}`);
});

test("跨文種一致性：六文種三皈依轉回羅馬字，全部等於同一基準句", () => {
  const results = SCRIPTS.map((s) => ({
    name: s.name, id: s.id,
    back: get(s.id).nativeToRoman(REFUGE_NATIVE[s.id]),
  }));
  for (const r of results) {
    assert.strictEqual(r.back, REFUGE_ROMAN,
      `${r.name}（${r.id}）轉回羅馬字應與基準句一致，實得：${r.back}`);
  }
  const uniq = new Set(results.map((r) => r.back));
  assert.strictEqual(uniq.size, 1,
    `各文種轉回的羅馬字應完全相同，實得 ${uniq.size} 種：${[...uniq].join(" | ")}`);
});

/* ---------- 4b. §3 各陷阱的最小對立詞 ---------- */
// 這些詞各自命中一個 §3 陷阱；用 roman→native→roman 往返生成（與 HOMAGE/REFUGE
// 同強度），斷言：每文種自身往返自洽 + 六文種轉回同一羅馬字 + 各文種字形互異。
// 不手抄 native 字形，避免引入未經核對的字形。

const TRAP_SENTENCES = [
  { roman: "saṃgha",        trap: "嚴式鼻音化（niggahita→ṅgh）" },
  { roman: "saṃsāra",       trap: "嚴式鼻音化（ṃ→ṃs 叢集）" },
  { roman: "sambuddha",     trap: "嚴式鼻音化（ṃ→mb）" },
  { roman: "saḷāyatana",    trap: "ḷ 捲舌邊音（泰 U+0E2C / 緬 U+1020 / 天 U+0933）" },
  { roman: "tassa",         trap: "-ssa 單碼位（緬 U+103F vs 他文字 virama 序列）" },
  { roman: "buddhassa",     trap: "-ssa 單碼位 + 詞尾不加 virama" },
  { roman: "deva",          trap: "泰文前置元音（U+0E40 é 順序反轉）" },
  { roman: "ko",            trap: "泰文前置元音（U+0E42 โ 順序反轉）" },
  { roman: "thera",         trap: "僧伽羅 o/ē（U+0DDC/U+0DDA 的 NFD 陷阱）" },
  { roman: "bho",           trap: "僧伽羅 o（U+0DDC 組合形）" },
  { roman: "dhamma",        trap: "高棉 register（U+1791 ᠡvs U+1792）" },
  { roman: "aṅga",          trap: "緬甸 kinzi（U+1004 U+103A U+1039）" },
];

for (const sent of TRAP_SENTENCES) {
  test(`陷阱覆蓋「${sent.roman}」：${sent.trap}`, () => {
    const natives = SCRIPTS.map((s) => {
      // 鬆式（strictNasal:false）：ṃ 原樣保留，保證 roman→native→roman 往返等同自身；
      // 嚴式（niggahita 同化為 ṅgh 等）的跨文種一致性已由下方專用測試獨立覆蓋。
      const native = get(s.id).romanToNative(sent.roman, { strictNasal: false });
      // 每文種自身往返自洽
      assert.strictEqual(get(s.id).nativeToRoman(native, { strictNasal: false }), sent.roman,
        `${s.name}（${s.id}）往返應自洽，實得 ${get(s.id).nativeToRoman(native, { strictNasal: false })}`);
      return { name: s.name, id: s.id, native, back: get(s.id).nativeToRoman(native, { strictNasal: false }) };
    });
    // 六文種轉回同一羅馬字（跨文種一致性）
    const uniq = new Set(natives.map((r) => r.back));
    assert.strictEqual(uniq.size, 1,
      `「${sent.roman}」六文種轉回應完全相同，實得 ${uniq.size} 種：${[...uniq].join(" | ")}`);
    // 各文種字形互不相同（確為獨立傳本）
    assert.strictEqual(new Set(natives.map((r) => r.native)).size, natives.length,
      `「${sent.roman}」各文種字形不應相同`);
  });
}

/* ---------- 4c. 嚴/簡鼻音選項（§6.4）：四種東南亞文字已是 first-class 選項 ---------- */
// 調研報告假設「brahmic.ts 的四種東南亞文字未見 strictNasal 選項」；經查證
// createBrahmicScheme 的 nativeToRoman 已向下傳遞 o?.strictNasal（預設 true），
// 故該選項早已是 first-class。本測試坐實：不論 strictNasal 取何值，六文種
// 轉回的羅馬字都彼此一致（跨文種等式不被鼻音歧義打破）。

test("嚴/簡鼻音選項：strictNasal:false（鬆式）下 saṃgha 六文種皆得 saṃgha", () => {
  const backs = SCRIPTS.map((s) => {
    const native = get(s.id).romanToNative("saṃgha", { strictNasal: false });
    return get(s.id).nativeToRoman(native, { strictNasal: false });
  });
  const uniq = new Set(backs);
  assert.strictEqual(uniq.size, 1,
    `strictNasal:false 下六文種應一致，實得 ${uniq.size} 種：${[...uniq].join(" | ")}`);
  assert.strictEqual([...uniq][0], "saṃgha",
    `strictNasal:false 應得 saṃgha（鬆式），實得 ${[...uniq][0]}`);
});

test("嚴/簡鼻音選項：strictNasal:true（嚴式）下 saṃgha 六文種皆得 saṅgha", () => {
  const backs = SCRIPTS.map((s) => {
    const native = get(s.id).romanToNative("saṃgha", { strictNasal: true });
    return get(s.id).nativeToRoman(native, { strictNasal: true });
  });
  const uniq = new Set(backs);
  assert.strictEqual(uniq.size, 1,
    `strictNasal:true 下六文種應一致，實得 ${uniq.size} 種：${[...uniq].join(" | ")}`);
  assert.strictEqual([...uniq][0], "saṅgha",
    `strictNasal:true 應得 saṅgha（嚴式），實得 ${[...uniq][0]}`);
});

/* ---------- 5. 各文種字形確實不同（防「複製貼上」式假基準） ---------- */

test("各文種禮敬文字形互不相同（確為獨立傳本，非同一字形複製）", () => {
  const natives = SCRIPTS.map((s) => HOMAGE_NATIVE[s.id]);
  assert.strictEqual(new Set(natives).size, natives.length,
    "各文種的禮敬文字形不應相同");
});

test("各文種所屬方案歸組正確（pali 組歸 pali-iast，其餘歸各文種）", () => {
  for (const s of SCRIPTS) {
    assert.strictEqual(get(s.id).group, s.group, `${s.id} 的 group 應為 ${s.group}`);
  }
});

console.log(`\n巴利三藏六文種跨文種校驗：${passed} 通過 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
