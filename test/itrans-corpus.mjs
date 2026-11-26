// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* ITRANS（梵咒鍵盤輸入標準）對照語料校驗。
 *
 * ITRANS 5.30（Avinash Chopde）是梵文 / 佛經真言鍵盤輸入的事實標準
 * （ibus / scim / m17n 的 itrans 表）。本測試驗證 src/indic.ts 的
 * itransToDevanagari / devanagariToItrans 與 sanskrit-itrans 方案：
 *
 *  · 鍵盤輸入習慣：捲舌 T/Th/D/Dh/N、噝音 sh/Sh（ś/ṣ）、聲化元音
 *    RRi/RRI/LLi/LLI、複合 kSh（क्ष）/ j~na·GY·dny（ज्ञ）、OM/AUM=ॐ、
 *    anusvāra=M、visarga=H、candrabindu=.N、virama=.h、avagraha=.a。
 *  · 詞尾輔音帶固有 a（不補 virama）—— 與 IAST「詞尾死輔音」慣例不同，
 *    貼合 itrans 鍵盤行為；反向尾輔音補 a，與前向互逆、可往返。
 *  · 佛經真言（ॐ मणिपद्मे हूं 等）100% 合標準往返。
 *
 * 執行：node test/itrans-corpus.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-itrans-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { listSchemes, getScheme, itransToDevanagari, devanagariToItrans } = lib;

const VIR = 0x094d;
const mk = (...a) => String.fromCodePoint(...a);
let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/* 1. 方案已遷出：底層函數 itransToDevanagari/devanagariToItrans 保留（悉曇鏈依賴） */
test("底層函數 itransToDevanagari/devanagariToItrans 仍可用", () => {
  assert.strictEqual(typeof itransToDevanagari, "function");
  assert.strictEqual(typeof devanagariToItrans, "function");
});

/* 2. 前向：ITRANS → Devanagari（經典 / 佛經詞彙） */
const FWD = [
  ["OM", "ॐ"],
  ["shrI", "श्री"],
  ["shri", "श्रि"],
  ["kSh", "क्ष"],
  ["j~na", "ज्ञ"],
  ["GY", "ज्ञ"],
  ["dny", "ज्ञ"],
  ["gaNesha", "गणेश"],
  ["RRiShI", "ऋषी"],
  ["buddha", mk(0x092c, 0x0941, 0x0926, VIR, 0x0927)],
  ["saMskRRita", mk(0x0938, 0x0902, 0x0938, VIR, 0x0915, 0x0943, 0x0924)],
  ["namah", "नमह"],
  ["namaH", "नमः"],
  ["aShTA", "अष्टा"],
  ["rAma", "राम"],
  ["guru", "गुरु"],
  ["gate", "गते"],
  ["pAram", "पारम"],
  ["iShTakA", "इष्टका"],
];
for (const [rom, nat] of FWD) {
  test(`前向 ${rom} → Devanagari`, () => {
    assert.strictEqual(itransToDevanagari(rom), nat);
  });
}

/* 3. 反向：Devanagari → ITRANS（貼合鍵盤習慣的等價拼法） */
const REV = [
  ["श्री", "shrI"],
  ["क्ष", "kSha"],          // क् ष，尾 ष 帶固有 a → kSha（與 kSh 等價）
  [mk(0x091c, VIR, 0x091e), "j~na"],
  ["नमः", "namaH"],
  [mk(0x0938, 0x0902, 0x0938, VIR, 0x0915, 0x0943, 0x0924), "saMskRRita"],
  [mk(0x092d, VIR, 0x0917, 0x0935, VIR, 0x0924), "bhgavta"], // भ् ग व् त：尾輔音補 a
  [mk(0x092c, 0x0941, 0x0926, VIR, 0x0927), "buddha"],
  ["राम", "rAma"],
];
for (const [nat, rom] of REV) {
  test(`反向 ${JSON.stringify(nat)} → ITRANS`, () => {
    assert.strictEqual(devanagariToItrans(nat), rom);
  });
}

/* 4. 佛經真言 / 成句往返（核心：100% 合標準） */
const RT = [
  "OM maNi padme huuM",                 // ॐ मणिपद्मे हूं
  "OM namaH shivAya",
  "gate gate pAragate pArasaMgate bodhi svAhA",
  "buddhaM sharNaM gamiShyAmi",
  "saMskRRitaM",
  "namo bhagavate",
  "RRiShINAM",
];
for (const m of RT) {
  test(`往返「${m}」`, () => {
    const dev = itransToDevanagari(m);
    const back = devanagariToItrans(dev).replace(/ /g, "");
    assert.strictEqual(back, m.replace(/ /g, ""), `原=${m} 回=${back}`);
  });
}

/* 5. 檢字表一致性：每條可映射項在引擎自身范式下「雙向至少一項往返成立」
 *    （貼合 all-schemes-corpus 的 abugida 判準：裸輔音 k→क 因固有 a 不嚴格
 *     相等，但只要 native→roman→native 成立即說明對應正確，非錯映射） */
test("charTable（buildItransCharTable）每條可映射項往返成立（無錯映射）", () => {
  const rows = lib.buildItransCharTable();
  const VIRAMA_CP = 0x094d;
  const skip = (row) =>
    /[→（）()…<>—/]/.test(row.roman) || row.roman === "（合字）" || row.roman.trim() === "" ||
    Array.from(row.native).every((c) => c.codePointAt(0) === VIRAMA_CP); // virama 爲結構符，非獨立可映射
  let checked = 0, bad = 0;
  for (const row of rows) {
    if (skip(row)) continue;
    const romanRT = devanagariToItrans(itransToDevanagari(row.roman)) === row.roman;
    const nativeRT = itransToDevanagari(devanagariToItrans(row.native)) === row.native;
    if (!(romanRT || nativeRT)) {
      bad++;
      console.error(`    錯映射 ${row.roman} → ${JSON.stringify(itransToDevanagari(row.roman))} → ${devanagariToItrans(itransToDevanagari(row.roman))}`);
    } else checked++;
  }
  assert.strictEqual(bad, 0, `有 ${bad} 條錯映射`);
  assert.ok(checked >= 40, `至少應檢查 40 條，實際 ${checked}`);
});

console.log(`\nITRANS 語料：${passed} 通過 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
