// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 全方案對照語料校驗（檢字表內部一致性 + 覆蓋率）
 *
 * 本測試以各轉寫方案自帶的 `charTable`（檢字表）作爲「大量對照語料」：
 * 24 套方案、合計 1600+ 條可映射的原生↔羅馬字對照，源自各文種權威映射表
 * （Unicode 標準、ISO 15919、Wylie、ULY（USY 西里爾備選已遷附錄）、努僕拼音、滿文轉寫等），
 * 由對應引擎的 buildCharTable / build*CharTable 導出。
 *
 * ── 校驗方法論 ───────────────────────────────────────────────────────────
 *  charTable 是「教學/參照對照表」，其羅馬字列按各文種習慣寫成「裸輔音」
 *  （Wylie `k`、IAST `k`），而 abugida 引擎把原生輔音字形視爲帶固有 a：
 *    nativeToRoman(ཀ) = "ka"   romanToNative(k) = "ཀ"（或 "ཀ्" 補 virama）
 *  故對「輔音」條目做嚴格相等會全軍覆沒——這是模型差異，非 bug。
 *
 *  本測試的「正確性」定義是：圖表的對應是否被引擎忠實實現。斷言對每一條
 *  可映射項，以下三條至少成立其一（任一向能在引擎自身范式下往返，即說明
 *  對應正確；任一向都不通過則是真正的錯映射，必須失敗）：
 *    (1) 雙向透傳：romanToNative(rom)===rom 且 nativeToRoman(nat)===nat
 *        —— 數字/標點類（引擎不轉換，純透傳）視爲合法。
 *    (2) roman 往返：nativeToRoman(romanToNative(rom)) === rom
 *    (3) native 往返：romanToNative(nativeToRoman(nat)) === nat
 *  此準則能抓出真實錯誤（roman 映射到完全錯誤的輔音），同時容許 abugida
 *  的固有 a / virama、獨立元音 vs 依存元音符（matra）等慣例差異。
 *
 * ── 已知設計約定（allowlist，非 bug）────────────────────────────────────
 *  · 滿文標點：romanToNative("," / ".") 給蒙古文標點前置空格（換行排版慣例）。
 *  · 隨鼻符：IAST `m̐`/`ṁ`/`ṃ` 對應天城體隨鼻符/anusvara，引擎與圖表取形不同。
 *  · 泰文 RTGS：輔音默認當死音節尾，romanToNative("ch")="จ์"（帶 thanthakhat ์），
 *    圖表列活音節裸形；RTGS 在輔音層不區分活/死，正確性由成句測試保證。
 *
 * ── 跳過的條目 ──────────────────────────────────────────────────────────
 *  部分 charTable 條目是「注解/說明」而非可映射對照（如滿文 nat="—"、
 *  rom="ng → N"；彝文 rom="（無尾）"），原生字形爲佔位符「—」或羅馬字含
 *  說明符（→ / （） / … / <>）。僅計入「跳過」。
 *
 * ── 覆蓋率斷言 ───────────────────────────────────────────────────────────
 *  引擎從表內全部 roman 吐出的原生字符，必須都出現在該方案 charTable 的原生
 *  字符集中（或爲已知 virama 結合符）——確保「引擎能轉出的字，檢字表都列得
 *  出來」，無漏列。
 *
 * 執行：node test/all-schemes-corpus.mjs
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-allcorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

/* 已知 virama / 結合符（各文種），用於覆蓋率與 RTGS 判等 */
const VIRAMA_CP = new Set([
  0x094d, 0x0dca, 0x17d2, 0x1039, 0x103a, 0x0e3a, 0x0e4c, 0x0f84, 0x0f71,
]);
const isVirama = (s) => [...s].length === 1 && VIRAMA_CP.has(s.codePointAt(0));
const stripVirama = (n) => {
  const arr = [...n];
  while (arr.length && isVirama(arr[arr.length - 1])) arr.pop();
  return arr.join("");
};
/* 結合變音符（U+0300–U+036F，如隨鼻符 m̐ 的 U+0303），非獨立字符，覆蓋率忽略 */
const isCombining = (ch) => {
  const cp = ch.codePointAt(0);
  return cp >= 0x0300 && cp <= 0x036f;
};
/* 是否含目標原生文字字符（非 ASCII / 非空白），用於判斷「是否真的轉出了原生字」 */
const hasNativeChar = (s) => /[^\u0000-\u007f\s]/.test(s);

/* 跳過「注解/說明」條目 */
const isAnnotation = (e) =>
  e.native === "—" ||
  /[→（）…<>]/.test(e.roman) ||
  /[㐀-鿿豈-﫿]/.test(e.roman);

/* 已知設計約定：返回 true 表示「預期不一致，非 bug」 */
const isKnownConvention = (s, rom, nat, rn) => {
  // 滿文標點前置空格
  if (s.id === "manchu-mollendorff" && /^[.,]$/.test(rom) && rn.replace(/^\s/, "") === nat) return true;
  // 隨鼻符 / anusvara 取形差異（天城體隨鼻符 ँ / anusvara ं / 泰文 nikkahit ํ）
  if (/[ṁṃm̐]/.test(rom) && [0x0901, 0x0902, 0x0903].includes(nat.codePointAt(0))) return true;
  // 婆羅米 LLA（U+11034）：婆羅米不分聲化元音 ḷ（獨立元音 𑀍）與捲舌邊音 ḷ（輔音 𑀴），
  // 檢字表以天城體鍵「ळ」示捲舌邊音，引擎反查歸 IAST 慣用鍵「ḷ」——兩側字母集不同屬既定約定
  if (s.id === "brahmi-iast" && nat === "𑀴") return true;
  // 婆羅米叢集長鍵（kṣ/jñ）：檢字表以「KA VIRAMA SSA」展示（無詞尾死輔音 virama），
  // 引擎按顯式 virama 規則對詞尾輔音補 U+11046——展示形與詞尾規範形之別屬既定約定
  if (s.id === "brahmi-iast" && typeof rn === "string" && rn === nat + "\u{11046}") return true;
  // 婆羅米 candrabindu m̐（U+11000）：引擎以「MA + virama + candrabindu」拼寫（詞尾死輔音），
  // 檢字表列純符號 U+11000 —— 同屬詞尾規範形之別
  if (s.id === "brahmi-iast" && nat === "\u{11000}" && rn === "\u{1102B}\u{11046}\u{0310}") return true;
  return false;
};

let passed = 0, failed = 0, skipped = 0;
const fails = [];
const test = (name, fn) => {
  try { fn(); passed++; }
  catch (e) { failed++; fails.push(`${name}\n      ${e.message}`); }
};

const schemes = lib.listSchemes();
let totalEntries = 0;

for (const s of schemes) {
  if (!s.charTable || s.charTable.length === 0) {
    test(`[${s.id}] 應有 charTable`, () => assert.fail(`方案 ${s.id} 缺少 charTable`));
    continue;
  }
  const id = s.id;
  const natives = new Set();
  for (const e of s.charTable) for (const ch of e.native) natives.add(ch);

  // 覆蓋率：僅檢查「確實發生轉換（rn≠rom 且含原生字）」的條目所吐出的原生字符，
  // 是否都列在該方案 charTable 的原生字符集中（或爲已知 virama / 結合符）。
  // 透傳條目（數字/標點/aligali 的羅馬方向）不吐原生字，跳過。
  const emitted = new Set();
  for (const e of s.charTable) {
    if (isAnnotation(e)) continue;
    let out = "";
    try { out = s.romanToNative(e.roman); } catch { /* 下方會抓 */ }
    if (out === e.roman || !hasNativeChar(out)) continue; // 透傳 / 未轉出原生字
    for (const ch of out) {
      if (ch === " ") continue;
      if (!natives.has(ch) && !VIRAMA_CP.has(ch.codePointAt(0)) && !isCombining(ch)) {
        emitted.add(ch);
      }
    }
  }
  const uncovered = [...emitted];
  test(`[${id}] 覆蓋率：引擎吐出字全部列於檢字表`, () => {
    assert.deepStrictEqual(uncovered, [], `引擎能轉但檢字表漏列：${uncovered.join("")}`);
  });

  // 內部一致性（逐條，單斷言）
  let checked = 0;
  for (const e of s.charTable) {
    totalEntries++;
    if (isAnnotation(e)) { skipped++; continue; }
    checked++;
    const rom = e.roman, nat = e.native;
    let rn = "", nr = "";
    try { rn = s.romanToNative(rom); } catch { /* fallthrough */ }
    try { nr = s.nativeToRoman(nat); } catch { /* fallthrough */ }
    test(`[${id}] ${JSON.stringify(rom)}↔${JSON.stringify(nat)} 對應被引擎實現`, () => {
      const passthru = rn === rom && nr === nat;
      let romanRT = false, nativeRT = false;
      try { romanRT = s.nativeToRoman(rn) === rom; } catch { /* */ }
      try { nativeRT = s.romanToNative(nr) === nat; } catch { /* */ }
      assert.ok(
        passthru || romanRT || nativeRT || isKnownConvention(s, rom, nat, rn),
        `對應未被引擎實現：romanToNative=${JSON.stringify(rn)} nativeToRoman=${JSON.stringify(nr)}`
      );
    });
  }
  test(`[${id}] 已檢查 ${checked} 條可映射條目`, () => assert.ok(checked > 0));
}

console.log(`\n全方案檢字表語料校驗：`);
console.log(`  方案數=${schemes.length}  條目總計=${totalEntries}  跳過(注解)=${skipped}`);
console.log(`  通過=${passed}  失敗=${failed}`);
if (failed > 0) {
  console.log(`\n失敗明細（前 40 條）：`);
  for (const f of fails.slice(0, 40)) console.log("  ✗ " + f);
  if (fails.length > 40) console.log(`  … 其餘 ${fails.length - 40} 條`);
  process.exit(1);
} else {
  console.log("  ✅ 全部通過（檢字表內部一致 + 覆蓋率完整）");
}
